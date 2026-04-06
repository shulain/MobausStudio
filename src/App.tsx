import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Toast, type ToastItem } from './components/common';
import { UpdateDialog } from './components/common/UpdateDialog';
import { AgentPage } from './components/features/Agent';
import { ChatPage } from './components/features/Chat';
import { ConfigSwitcherPage } from './components/features/ConfigSwitcher';
import { MCPPage } from './components/features/MCP';
import { ModelPage } from './components/features/Models';
import { ProviderPage } from './components/features/Providers';
import { ExportModal, ImportModal, NotificationPanel, SettingsPage } from './components/features/Settings';
import { SkillsPage } from './components/features/Skills';
import { StatsModal } from './components/features/Stats';
import { Header } from './components/layout/Header';
import { Sidebar, type PageType } from './components/layout/Sidebar';
import { providerCredentialsStorage } from './services/storage';
import { tokenRefresher } from './services/tokenRefresher';
import { checkForUpdates, type UpdateInfo } from './services/updater';
import { loadProviderCredentialsSafe } from './services/auth/providerCredentialAccess';
import {
  updateProviderConnection,
  updateProviderDisconnection,
  findProvider,
} from './services/providers/providerState';
import {
  handleApiKeyConnect,
  handleOAuthConnect,
  handleEnvConnect,
  handleNoneConnect,
} from './services/providers/providerConnection';
import {
  updateMCPServerStatus,
  updateMCPServerConnected,
  updateMCPServerError,
  updateMCPServerDisconnected,
  findMCPServer,
} from './services/mcp/mcpState';
import {
  handleMCPConnect,
  handleMCPDisconnect,
} from './services/mcp/mcpConnection';
import {
  addModel,
  updateModel,
  deleteModel,
  updateModelStatus,
  findModel,
} from './services/models/modelState';
import { getDefaultProtocol } from './data/protocols';  // v0.9.4: 导入协议工具函数
import {
  createAgent,
  updateAgent as updateAgentState,
  deleteAgent,
  toggleAgentStatus,
  findAgent,
} from './services/agents/agentState';
import {
  addSkill,
  updateSkill,
  deleteSkill,
  toggleSkill,
  installSkills,
  findSkill,
} from './services/skills/skillState';
import { buildApiMessages, DEFAULT_MAX_HISTORY_MESSAGES } from './utils/chatUtils';
import { isTauri } from './utils/platform';
import { buildSystemPrompt } from './utils/skillUtils';
import { buildRoundtableContext, buildSummaryContext, createRoundtableChat } from './components/features/AgentOrchestration/utils';
import {
  shouldProcessEvent,
  calculateTotalTokens,
  shouldSkipTokenUpdate,
  formatErrorMessage,
} from './utils/chatStreamHelpers';
import {
  defaultNotifications,
} from './data/mockData';
import { useGoogleModels } from './hooks/useGoogleModels';
import { useKiroModels } from './hooks/useKiroModels';
import { type APITool, type MCPToolWithServer } from './hooks/useMCPTools';
import { useAppBootstrap } from './hooks/useAppBootstrap';
import { trackEvents } from './services/analytics';
import type {
  Agent,
  AgentCreateInput,
  AIProvider,
  AppNotification,
  Attachment,
  Chat,
  ChatEventPayload,
  ExportConfig,
  ImportOptions,
  MCPServer,
  MCPServerCreateInput,
  MCPStats,
  MCPTool,
  Message,
  ModelCreateInput,
  ModelProvider,
  OAuthResult,
  ProviderCredential,
  RoundtableChat,
  RoundtableCreateInput,
  RoundtableMessage,
  SkillCreateInput,
} from './types';
import { useI18n, translate } from './i18n';
import { logger, LogTags } from './utils/logger';
import { calculateAllStats, calculateModelUsage, generateRecentActivity } from './utils/statsUtils';

function App() {
  // i18n
  const { t } = useI18n();

  // 状态管理
  const [currentPage, setCurrentPage] = useState<PageType>('chat');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // 软件更新状态
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);

  // v2.5.3: Toast 通知状态（右上角临时弹框）
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // v2.5.3: 添加 Toast 通知
  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { ...toast, id }]);
  }, []);

  // v2.5.3: 移除 Toast 通知
  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // 引用监听取消函数，用于停止生成（每个对话独立管理）
  const unlistenMapRef = useRef<Map<string, UnlistenFn>>(new Map());

  // v4.2.2: 流式输出优化：使用定时器批量更新减少卡顿
  // 使用 setTimeout 替代 RAF，固定 16ms 间隔，确保更稳定的更新频率
  const pendingContentRef = useRef<Map<string, { messageId: string; content: string; reasoning: string }>>(new Map());
  const rafIdRef = useRef<Map<string, number>>(new Map()); // 存储 setTimeout 返回的 timer ID
  // v4.1.24: 工具调用循环计数器（防止无限循环）
  const toolCallRoundRef = useRef<number>(0);
  // v4.1.24: chats 的 ref（用于工具回传时获取最新消息）
  const chatsRef = useRef<Chat[]>([]);
  // v4.1.24: 标记是否需要在 done 事件后继续工具调用循环
  const pendingToolContinueRef = useRef<Map<string, { agent?: Agent }>>(new Map());
  // v4.1.53: 跟踪每个对话的所有有效 messageId（包括工具续传的新 messageId）
  const validMessageIdsRef = useRef<Map<string, Set<string>>>(new Map());

  // 使用 useAppBootstrap 管理所有持久化数据和初始化逻辑
  const {
    models, setModels,
    chats, setChats,
    agents, setAgents,
    skills, setSkills,
    mcpServers, setMcpServers,
    roundtableChats, setRoundtableChats,
    providers, setProviders,
    isDataLoaded,
    roundtableChatsRef,
  } = useAppBootstrap({ addToast });

  const [notifications, setNotifications] = useState<AppNotification[]>(defaultNotifications);

  // v4.1.4: 每个圆桌会议的发言者状态（按对话 ID 存储）
  const [roundtableSpeakerMap, setRoundtableSpeakerMap] = useState<Map<string, string | null>>(new Map());
  // v4.1.8: 圆桌会议停止标志（按对话 ID 存储）
  const roundtableStopFlagsRef = useRef<Set<string>>(new Set());
  // 独立会话状态：每个对话有独立的生成状态
  const [generatingChatIds, setGeneratingChatIds] = useState<Set<string>>(new Set());
  // v3.5.1: 生成开始时间（用于计时器在切换对话时保持正确时间）
  const [generatingStartTimes, setGeneratingStartTimes] = useState<Map<string, number>>(new Map());

  // v4.1.4: 获取指定圆桌对话的当前发言者
  const getRoundtableSpeakerId = useCallback((chatId: string) => {
    return roundtableSpeakerMap.get(chatId) || null;
  }, [roundtableSpeakerMap]);

  // v4.1.4: 设置指定圆桌对话的当前发言者
  const setRoundtableSpeakerId = useCallback((chatId: string, speakerId: string | null) => {
    setRoundtableSpeakerMap(prev => {
      const next = new Map(prev);
      if (speakerId) {
        next.set(chatId, speakerId);
      } else {
        next.delete(chatId);
      }
      return next;
    });
    // v3.5.1: 同时管理生成开始时间（圆桌会议使用 speakerId 判断生成状态）
    setGeneratingStartTimes(prev => {
      const next = new Map(prev);
      if (speakerId) {
        // 开始发言时，如果还没有记录开始时间，则记录
        if (!next.has(chatId)) {
          next.set(chatId, Date.now());
        }
      } else {
        // 停止发言时清除时间
        next.delete(chatId);
      }
      return next;
    });
  }, []);
  /** MCP 服务器操作中状态 (v2.0.0: 连接/断开) */
  const [loadingMCPIds, setLoadingMCPIds] = useState<Set<string>>(new Set());

  // 辅助函数：检查对话是否正在生成
  const isGenerating = useCallback((chatId: string) => generatingChatIds.has(chatId), [generatingChatIds]);

  // v3.5.1: 获取对话生成开始时间
  const getGeneratingStartTime = useCallback((chatId: string) => {
    return generatingStartTimes.get(chatId) || null;
  }, [generatingStartTimes]);

  /** 检查 MCP 服务器是否正在操作中 (v2.0.0) */
  const isMCPLoading = useCallback((id: string) => loadingMCPIds.has(id), [loadingMCPIds]);

  // 辅助函数：设置对话生成状态
  const setGenerating = useCallback((chatId: string, value: boolean) => {
    setGeneratingChatIds(prev => {
      const next = new Set(prev);
      if (value) {
        next.add(chatId);
      } else {
        next.delete(chatId);
      }
      return next;
    });
    // v3.5.1: 同时管理生成开始时间
    setGeneratingStartTimes(prev => {
      const next = new Map(prev);
      if (value) {
        // 开始生成时记录时间
        next.set(chatId, Date.now());
      } else {
        // 停止生成时清除时间
        next.delete(chatId);
      }
      return next;
    });
  }, []);


  // v2.5.4: 组件卸载时清理所有事件监听器和定时器，防止内存泄漏
  // v4.2.2: RAF 改为 setTimeout 定时器
  useEffect(() => {
    // v5.10.2: 在 effect 内部捕获 ref.current，避免 cleanup 时引用已变更
    const unlistenMap = unlistenMapRef.current;
    const rafIds = rafIdRef.current;
    const pendingContent = pendingContentRef.current;

    return () => {
      // 清理所有未取消的事件监听器
      unlistenMap.forEach((unlisten) => {
        unlisten();
      });
      unlistenMap.clear();

      // 清理所有 RAF (v4.2.2: 改为 setTimeout 定时器)
      rafIds.forEach((timerId) => {
        clearTimeout(timerId);
      });
      rafIds.clear();

      // 清理 pendingContent
      pendingContent.clear();

      if (import.meta.env.DEV) {
        logger.debug(LogTags.APP, '已清理所有事件监听器和定时器');
      }
    };
  }, []);



  // v4.1.24: 同步 chatsRef（用于工具回传时获取最新消息）
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);





  // 启动时自动检查更新（仅 Tauri 桌面应用）
  useEffect(() => {
    if (!isDataLoaded || !isTauri()) {
      return;
    }

    // 延迟 3 秒检查更新，避免影响启动性能
    const timer = setTimeout(async () => {
      try {
        logger.info(LogTags.APP, '启动时自动检查更新');
        const info = await checkForUpdates();

        if (info.available) {
          logger.info(LogTags.APP, '发现新版本', { version: info.latestVersion });
          setUpdateInfo(info);
          setShowUpdateDialog(true);
        } else {
          logger.info(LogTags.APP, '当前已是最新版本');
        }
      } catch (error) {
        // 更新检查失败不影响正常使用，仅记录日志
        logger.warn(LogTags.APP, '自动检查更新失败', error);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [isDataLoaded]);


  // MCP 统计
  const mcpStats: MCPStats = {
    connected: mcpServers.filter((s) => s.status === 'connected').length,
    disconnected: mcpServers.filter((s) => s.status === 'disconnected').length,
    error: mcpServers.filter((s) => s.status === 'error').length,
    totalRequests: mcpServers.reduce((sum, s) => sum + s.requestCount, 0),
  };

  // v3.1.0: 使用真实数据计算统计信息
  const realStats = useMemo(() => calculateAllStats(chats, models), [chats, models]);
  const realModelUsage = useMemo(() => calculateModelUsage(chats, models, 'week'), [chats, models]);
  const realActivity = useMemo(() => generateRecentActivity(chats, agents, 10), [chats, agents]);

  // v0.8.0: 动态模型获取 - 统一在 App 层面处理，避免各组件重复获取
  // 检查 Google 和 Kiro 提供商的连接状态
  const googleProvider = providers.find(p => p.id.toLowerCase() === 'google');
  const kiroProvider = providers.find(p => p.id.toLowerCase() === 'kiro');
  const isGoogleConnected = googleProvider?.status === 'connected';
  const isKiroConnected = kiroProvider?.status === 'connected';

  // v0.8.0: 动态模型凭证状态
  // v0.9.0: Kiro 凭证添加 authMethod 字段
  const [googleCredential, setGoogleCredential] = useState<{ accessToken?: string; projectId?: string }>({});
  const [kiroCredential, setKiroCredential] = useState<{ accessToken?: string; profileArn?: string; authMethod?: string; kiroSsoRegion?: string }>({});

  // v0.8.0: 加载动态模型凭证
  useEffect(() => {
    const loadDynamicModelCredentials = async () => {
      try {
        const credentials = await loadProviderCredentialsSafe({
          context: '加载动态模型凭证失败',
        });

        // Google 凭证
        const googleCred = credentials.find(c => c.providerId.toLowerCase() === 'google');
        if (googleCred) {
          setGoogleCredential({
            accessToken: googleCred.accessToken,
            projectId: googleCred.projectId,
          });
        } else {
          setGoogleCredential({});
        }

        // Kiro 凭证
        // v0.9.0: 添加 authMethod 字段
        const kiroCred = credentials.find(c => c.providerId.toLowerCase() === 'kiro');
        if (kiroCred) {
          setKiroCredential({
            accessToken: kiroCred.accessToken,
            profileArn: kiroCred.profileArn,
            authMethod: kiroCred.authMethod,
            kiroSsoRegion: kiroCred.kiroSsoRegion,
          });
        } else {
          setKiroCredential({});
        }
      } catch (error) {
        logger.error(LogTags.APP, '加载动态模型凭证失败', error);
      }
    };

    if (isDataLoaded) {
      loadDynamicModelCredentials();
    }
  }, [isDataLoaded, isGoogleConnected, isKiroConnected]);

  // v0.8.0: 使用 hooks 获取动态模型列表
  const { rawModels: googleRawModels } = useGoogleModels({
    accessToken: isGoogleConnected ? googleCredential.accessToken : undefined,
    projectId: googleCredential.projectId,
    autoFetch: isGoogleConnected && !!googleCredential.accessToken,
  });

  // v0.9.0: 添加 authMethod 用于选择正确的 User-Agent
  // v4.1.31: 添加 ssoRegion 用于 IDC 用户确定 API 端点区域
  const { rawModels: kiroRawModels } = useKiroModels({
    accessToken: isKiroConnected ? kiroCredential.accessToken : undefined,
    profileArn: kiroCredential.profileArn,
    authMethod: kiroCredential.authMethod,
    ssoRegion: kiroCredential.kiroSsoRegion,
    autoFetch: isKiroConnected && !!kiroCredential.accessToken,
  });

  // v0.8.0: 增强后的 providers（包含动态模型列表）
  const enhancedProviders = useMemo(() => {
    return providers.map(p => {
      // Google 动态模型
      if (p.id.toLowerCase() === 'google' && p.status === 'connected' && googleRawModels.length > 0) {
        const dynamicModels = googleRawModels
          .filter(m => !m.id.toLowerCase().includes('chat_') && !m.id.toLowerCase().includes('tab_'))
          .map(m => ({
            id: m.id,
            name: m.displayName || m.id,
            maxTokens: 65536,
            contextWindow: 1000000,
            capabilities: { vision: true, functionCalling: true, streaming: true },
          }));
        return { ...p, models: dynamicModels.length > 0 ? dynamicModels : p.models };
      }

      // Kiro 动态模型
      if (p.id.toLowerCase() === 'kiro' && p.status === 'connected' && kiroRawModels.length > 0) {
        const dynamicModels = kiroRawModels.map(m => ({
          id: m.id,
          name: m.displayName || m.id,
          maxTokens: m.maxInputTokens || 200000,
          contextWindow: m.maxInputTokens || 200000,
          capabilities: { vision: true, functionCalling: true, streaming: true },
        }));
        return { ...p, models: dynamicModels.length > 0 ? dynamicModels : p.models };
      }

      return p;
    });
  }, [providers, googleRawModels, kiroRawModels]);

  /**
   * v3.2.0: 将 AIProvider[] 转换为 ModelProvider[] 格式
   * 用于 ModelPage 和 ModelModal 组件
   *
   * 转换逻辑：
   * 1. 已连接的提供商优先显示，并标记 connected=true
   * 2. 保留 Custom 选项用于自定义端点
   * 3. 模型列表从 ProviderModel 转换为简化格式
   * v0.8.0: 使用 enhancedProviders（包含动态模型列表）
   */
  const modelProviders: ModelProvider[] = useMemo(() => {
    // 将已连接的提供商转换为 ModelProvider 格式
    const connectedProviders = enhancedProviders
      .filter(p => p.status === 'connected')
      .map(p => ({
        id: p.id,
        name: `${p.icon} ${p.name}`,
        icon: p.icon,
        defaultEndpoint: p.defaultEndpoint,
        models: p.models.map(m => ({
          id: m.id,
          name: m.name,
          maxTokens: m.maxTokens,
        })),
        connected: true,  // 标记为已连接
      }));

    // 将未连接的提供商也添加进来（用户可能想手动输入 API Key）
    const disconnectedProviders = enhancedProviders
      .filter(p => p.status !== 'connected')
      .map(p => ({
        id: p.id,
        name: `${p.icon} ${p.name}`,
        icon: p.icon,
        defaultEndpoint: p.defaultEndpoint,
        models: p.models.map(m => ({
          id: m.id,
          name: m.name,
          maxTokens: m.maxTokens,
        })),
        connected: false,  // 标记为未连接
      }));

    return [
      ...connectedProviders,
      ...disconnectedProviders,
    ];
  }, [enhancedProviders]);

  // Chat handlers
  const handleCreateChat = useCallback((): string => {
    const newChatId = Date.now().toString();
    // v2.3.0: 使用第一个可用模型的 ID，而不是硬编码
    const defaultModelId = models[0]?.id || '';
    const newChat: Chat = {
      id: newChatId,
      title: '新对话',
      createdAt: new Date(),
      updatedAt: new Date(),
      starred: false,
      model: defaultModelId,
      messages: [],
    };
    setChats((prev) => [newChat, ...prev]);

    // v2.6.0: 埋点 - 创建对话
    trackEvents.chatCreated({ modelId: defaultModelId });

    return newChatId;
  }, [models, setChats]);

  const handleDeleteChat = useCallback((chatId: string) => {
    // v2.6.0: 埋点 - 删除对话（先获取消息数量）
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      trackEvents.chatDeleted({ messageCount: chat.messages.length });
    }

    setChats((prev) => prev.filter((c) => c.id !== chatId));
  }, [chats, setChats]);

  const handleRenameChat = useCallback((chatId: string, newTitle: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId ? { ...c, title: newTitle, updatedAt: new Date() } : c
      )
    );
  }, [setChats]);

  const handleToggleChatStar = useCallback((chatId: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId ? { ...c, starred: !c.starred, updatedAt: new Date() } : c
      )
    );
  }, [setChats]);

  /**
   * 更新对话的 Agent 选择 (v2.3.0)
   * 将 Agent 选择持久化到 Chat 对象中
   */
  const handleUpdateChatAgent = useCallback((chatId: string, agentId: string | null) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId ? { ...c, agentId, updatedAt: new Date() } : c
      )
    );
    if (import.meta.env.DEV) {
      logger.debug(LogTags.APP, '更新对话 Agent', { chatId, agentId });
    }
  }, [setChats]);

  /**
   * 更新对话的模型选择 (v2.8.0)
   * 将模型选择持久化到 Chat 对象中
   */
  const handleUpdateChatModel = useCallback((chatId: string, modelId: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId ? { ...c, model: modelId, updatedAt: new Date() } : c
      )
    );
    if (import.meta.env.DEV) {
      logger.debug(LogTags.APP, '更新对话模型', { chatId, modelId });
    }
  }, [setChats]);

  // ==================== 圆桌会议处理函数 (v4.0.0) ====================

  /**
   * 创建圆桌会议
   * @param input - 圆桌会议创建输入
   * @returns 新创建的圆桌会议 ID
   */
  const handleCreateRoundtable = useCallback((input: RoundtableCreateInput): string => {
    const chat = createRoundtableChat(input, agents);
    setRoundtableChats(prev => [chat, ...prev]);

    // v2.6.0: 埋点 - 创建圆桌会议
    trackEvents.roundtableCreated({
      participantCount: input.participants.length,
      topic: input.topic,
    });

    if (import.meta.env.DEV) {
      logger.debug(LogTags.APP, '创建圆桌会议', {
        id: chat.id,
        topic: input.topic,
        participantCount: input.participants.length,
      });
    }

    return chat.id;
  }, [agents, setRoundtableChats]);

  /**
   * 删除圆桌会议
   * @param chatId - 圆桌会议 ID
   */
  const handleDeleteRoundtable = useCallback((chatId: string) => {
    setRoundtableChats(prev => prev.filter(c => c.id !== chatId));
    if (import.meta.env.DEV) {
      logger.debug(LogTags.APP, '删除圆桌会议', { chatId });
    }
  }, [setRoundtableChats]);

  /**
   * 获取 Agent 可用的 MCP 工具 (v2.3.0)
   *
   * 筛选逻辑：
   * 1. 只包含已连接的服务器
   * 2. 如果 Agent 配置了 mcpServers，只包含配置的服务器
   * 3. 如果配置了 enabledTools，只包含白名单中的工具
   */
  const getAgentTools = useCallback((agent: Agent): { tools: APITool[], toolsMap: Map<string, MCPToolWithServer> } => {
    const tools: APITool[] = [];
    const toolsMap = new Map<string, MCPToolWithServer>();

    if (!agent.enableToolUse) {
      return { tools, toolsMap };
    }

    // 获取已连接的服务器
    const connectedServers = mcpServers.filter(
      (server) => server.status === 'connected' && server.tools && server.tools.length > 0
    );

    if (connectedServers.length === 0) {
      return { tools, toolsMap };
    }

    // 获取 Agent 配置的服务器 ID 集合
    const agentServerIds = agent.mcpServers?.map((s) => s.serverId) ?? null;

    // 获取 Agent 配置的工具白名单映射
    const toolWhitelist = agent.mcpServers?.reduce<Record<string, string[] | undefined>>(
      (acc, config) => {
        acc[config.serverId] = config.enabledTools;
        return acc;
      },
      {}
    ) ?? {};

    for (const server of connectedServers) {
      // 如果 Agent 指定了服务器，检查是否在列表中
      if (agentServerIds !== null && !agentServerIds.includes(server.id)) {
        continue;
      }

      // 获取该服务器的工具白名单
      const enabledTools = toolWhitelist[server.id];

      for (const tool of server.tools || []) {
        // 如果有白名单，检查工具是否在白名单中
        if (enabledTools && !enabledTools.includes(tool.name)) {
          continue;
        }

        // 工具名称格式: serverId__toolName (用于回调时识别服务器)
        const fullName = `${server.id}__${tool.name}`;

        tools.push({
          type: 'function' as const,
          function: {
            name: fullName,
            description: tool.description,
            parameters: {
              type: 'object' as const,
              properties: tool.inputSchema.properties,
              required: tool.inputSchema.required,
            },
          },
        });

        toolsMap.set(fullName, {
          ...tool,
          serverId: server.id,
          serverName: server.name,
        });
      }
    }

    return { tools, toolsMap };
  }, [mcpServers]);

  /**
   * 生成 Agent 回复（流式）
   *
   * v4.1.2: 改为流式输出，实现打字机效果
   * v4.1.3: 添加 round 参数，修复轮数显示不更新的问题
   *
   * @param chatId - 圆桌会议 ID
   * @param chat - 圆桌会议对象
   * @param participantId - 参与者 ID
   * @param round - 当前轮数（可选，默认使用 chat 中的轮数）
   */
  const generateAgentResponse = useCallback(async (
    chatId: string,
    chat: RoundtableChat,
    participantId: string,
    round?: number
  ) => {
    // 使用传入的轮数或默认使用 chat 中的轮数
    const currentRound = round ?? chat.roundtableConfig.currentRound;

    const participant = chat.roundtableConfig.participants.find(p => p.id === participantId);
    if (!participant) return;

    const agent = agents.find(a => a.id === participant.agentId);
    if (!agent) {
      logger.warn(LogTags.APP, 'Agent 不存在', { agentId: participant.agentId });
      return;
    }

    // 获取模型配置
    const model = models.find(m => m.id === agent.model);
    if (!model) {
      logger.warn(LogTags.APP, '模型不存在', { modelId: agent.model });
      return;
    }

    // v3.5.1: 如果模型标记使用提供商凭证，则从 providerCredentialsStorage 实时获取
    let apiKey = model.apiKey;
    let accountId = model.accountId;
    let projectId = model.projectId;

    if (model.useProviderCredential) {
      try {
        const credential = await providerCredentialsStorage.get(model.provider);
        if (credential) {
          // v0.8.0: 使用辅助函数处理 Kiro 特殊格式
          apiKey = getApiKeyFromCredential(credential, model.provider);
          accountId = credential.accountId || accountId;
          projectId = credential.projectId || projectId;
          if (import.meta.env.DEV) {
            logger.debug(LogTags.APP, '圆桌会议 - 使用提供商凭证', {
              provider: model.provider,
              hasApiKey: !!credential.apiKey,
              hasAccessToken: !!credential.accessToken,
            });
          }
        }
      } catch (error) {
        logger.error(LogTags.APP, '圆桌会议 - 获取提供商凭证失败', error);
      }
    }

    if (!apiKey) {
      logger.warn(LogTags.APP, 'API Key 未设置', { modelId: model.id, useProviderCredential: model.useProviderCredential });
      return;
    }

    // v4.1.9: 获取 Agent 的 MCP 工具
    // v3.5.0: 同时获取 toolsMap 用于处理工具调用
    const { tools: agentTools, toolsMap: agentToolsMap } = getAgentTools(agent);
    const hasTools = agentTools.length > 0;

    // v4.1.40: 工具调用循环计数器（防止无限循环）
    let toolCallRound = 0;
    const maxToolCallRounds = agent.limits?.maxToolCalls || 20;

    // v4.1.40: 工具调用循环 - 标记是否需要继续对话
    let pendingToolContinue = false;

    // v4.1.4: 设置当前发言者（用于显示发言状态动画，按对话 ID 存储）
    setRoundtableSpeakerId(chatId, participantId);

    // 生成消息 ID
    const messageId = crypto.randomUUID();

    // v4.1.44: 不再预先创建空消息，等收到第一个 chunk 或 tool_calls 时再创建
    // 这样可以避免：
    // 1. 如果模型直接调用工具，不会显示"正在思考中..."的空消息
    // 2. 不需要在工具调用后删除空消息，避免 UI 闪烁

    let unlisten: (() => void) | undefined;

    try {
      // v4.1.11: 从 ref 获取最新的 chat 对象，包括消息和配置
      // 修复：之前只获取最新消息，但 roundtableConfig 仍使用旧的，导致轮数等信息不正确
      const latestChat = roundtableChatsRef.current.find(c => c.id === chatId);
      const latestConfig = latestChat?.roundtableConfig || chat.roundtableConfig;

      // v4.1.44: 获取最新消息，过滤掉空消息
      // 包含工具调用消息（content 为空但有 toolCalls）
      const latestMessages = (latestChat?.messages || chat.messages).filter(
        m => (m.content && m.content.trim().length > 0) ||
          (m.toolCalls && m.toolCalls.length > 0)
      );

      // v4.1.12: 查找最新的用户消息，用于在触发消息中强调
      const lastUserMessage = [...latestMessages].reverse().find(m => m.role === 'user');

      // 构建上下文（使用最新的配置和消息列表）
      // 上下文中已包含"之前的讨论内容"，所以不需要再把历史消息作为对话历史发送
      const context = buildRoundtableContext(
        latestConfig,
        participantId,
        latestMessages,
        agents
      );

      // v4.1.12: 构建触发消息
      // 如果有用户消息，在触发消息中包含用户的问题，确保模型关注用户输入
      let triggerMessage = `Please share your perspective as ${participant.role}.\n请从「${participant.role}」的角度发表你的观点。`;
      if (lastUserMessage) {
        triggerMessage = `The user just said: "${lastUserMessage.content}"\n用户刚才说：「${lastUserMessage.content}」\n\nPlease respond to the user's message and share your perspective as ${participant.role}.\n请回应用户的消息，并从「${participant.role}」的角度发表你的观点。`;
      }

      // v4.1.43: 构建 API 消息 - 使用标准格式
      // v4.1.45: 根据 provider 类型区分处理工具调用历史
      // Google API 要求 function response 必须紧跟在 function call 之后
      // 在圆桌会议中，多个 agent 的消息可能交替出现，导致顺序不符合要求
      // 因此对于 Google，不发送工具调用历史，只发送文本消息
      const includeToolCallHistory = model.provider !== 'Google' && model.provider !== 'google';

      // 包含：system 消息 + 历史消息（assistant/tool格式）+ user 触发消息
      const apiMessages: Array<{
        role: 'system' | 'user' | 'assistant' | 'tool';
        content: string;
        tool_calls?: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
          thought_signature?: string;
        }>;
        tool_call_id?: string;
      }> = [
        { role: 'system' as const, content: context },
      ];

      // v4.1.45: 添加历史消息（根据 provider 决定是否包含工具调用）
      for (const msg of latestMessages) {
        if (msg.role === 'user') {
          // 用户消息
          apiMessages.push({
            role: 'user',
            content: msg.content,
          });
        } else if (msg.toolCalls && msg.toolCalls.length > 0) {
          if (includeToolCallHistory) {
            // Anthropic/OpenAI: 发送完整的工具调用历史
            // 工具调用消息：assistant + tool
            apiMessages.push({
              role: 'assistant',
              content: msg.content || '',
              tool_calls: msg.toolCalls.map(tc => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                  name: `${tc.serverId}__${tc.name}`,
                  arguments: tc.arguments,
                },
                ...(tc.thoughtSignature ? { thought_signature: tc.thoughtSignature } : {}),
              })),
            });
            // 添加工具结果
            if (msg.toolResults) {
              for (const tr of msg.toolResults) {
                apiMessages.push({
                  role: 'tool',
                  content: tr.content || '',
                  tool_call_id: tr.callId,
                });
              }
            }
          } else {
            // Google: 只发送工具调用后的文本内容（如果有）
            // 跳过工具调用本身，避免消息顺序问题
            if (msg.content) {
              apiMessages.push({
                role: 'assistant',
                content: msg.content,
              });
            }
          }
        } else if (msg.content) {
          // 普通 assistant 消息
          apiMessages.push({
            role: 'assistant',
            content: msg.content,
          });
        }
      }

      // 添加触发消息
      apiMessages.push({
        role: 'user' as const,
        content: triggerMessage,
      });

      if (import.meta.env.DEV) {
        logger.debug(LogTags.APP, '圆桌会议 - 调用流式 API', {
          participant: participant.role,
          participantId,
          agent: agent.name,
          model: model.name,
          messagesCount: latestMessages.length,
          contextLength: context.length,
        });
        // v4.1.10: 输出上下文前500字符用于调试
        logger.debug(LogTags.APP, `${participant.role} 的上下文`, { context: context.substring(0, 500) });
      }

      // 累积内容
      let accumulatedContent = '';
      // v3.5.0: 累积思考内容（支持 extended thinking 模型）
      let accumulatedReasoning = '';
      // v4.1.40: 跟踪 tool_calls 异步执行完成，避免 done 先于工具执行结束
      let toolCallsPromiseResolve: (() => void) | null = null;
      let toolCallsPromise: Promise<void> | null = null;
      // v4.1.44: 跟踪消息是否已创建
      let messageCreated = false;

      // v4.1.10: 使用 Promise 等待流式响应完成
      // 这样可以确保一个参与者完成后再开始下一个，避免内容混合
      // v4.2.8: 修复 new Promise(async ...) 反模式，将 listen() 提到 Promise 外部
      // 避免 listen() 抛错时外层 Promise 永不 reject 导致调用方挂死

      // v3.5.0: 扩展 payload 类型，支持 tool_calls 事件
      type ChatEventPayload = {
        id: string;
        event: string;
        content?: string;
        error?: string;
        tool_calls?: Array<{
          id: string;
          function: {
            name: string;
            arguments: string;
          };
          thought_signature?: string;
        }>;
      };

      // v4.2.8: 先设置监听器（在 Promise 外部），确保异常能正确传播
      let promiseResolve: () => void;
      let promiseReject: (err: Error) => void;

      unlisten = await listen('chat-event', async (event: { payload: ChatEventPayload }) => {
          const payload = event.payload;

          // v4.1.10: 只处理当前消息的事件，忽略其他消息
          if (payload.id !== messageId) {
            return;
          }

          if (payload.event === 'chunk' && payload.content) {
            // v4.1.44: 收到第一个 chunk 时创建消息
            if (!messageCreated) {
              const agentMessage: RoundtableMessage = {
                id: messageId,
                chatId,
                role: 'assistant',
                content: '',
                createdAt: new Date(),
                participantId,
                round: currentRound,
              };
              setRoundtableChats(prev => prev.map(c => {
                if (c.id !== chatId) return c;
                return {
                  ...c,
                  messages: [...c.messages, agentMessage],
                  updatedAt: new Date(),
                };
              }));
              messageCreated = true;
            }

            // 累积内容
            accumulatedContent += payload.content;

            // 更新消息内容（流式）
            setRoundtableChats(prev => prev.map(c => {
              if (c.id !== chatId) return c;
              const messages = c.messages.map(m =>
                m.id === messageId ? { ...m, content: accumulatedContent } : m
              );
              return { ...c, messages };
            }));
          }

          // v3.5.0: 处理思考内容（extended thinking 模型）
          if (payload.event === 'reasoning_chunk' && payload.content) {
            // 累积思考内容
            accumulatedReasoning += payload.content;

            // 更新消息的思考内容（流式）
            setRoundtableChats(prev => prev.map(c => {
              if (c.id !== chatId) return c;
              const messages = c.messages.map(m =>
                m.id === messageId ? { ...m, reasoningContent: accumulatedReasoning } : m
              );
              return { ...c, messages };
            }));
          }

          // v3.5.0: 处理工具调用请求
          if (payload.event === 'tool_calls' && payload.tool_calls && agentToolsMap) {
            // v4.1.40: 标记 tool_calls 异步流程开始
            toolCallsPromise = new Promise<void>((resolve) => {
              toolCallsPromiseResolve = resolve;
            });
            if (import.meta.env.DEV) {
              logger.debug(LogTags.APP, '圆桌会议 - 收到工具调用请求', { toolCalls: payload.tool_calls });
            }

            // 收集所有工具调用和结果
            const toolCalls: Array<{ id: string; name: string; arguments: string; serverId: string; serverName: string; thoughtSignature?: string }> = [];
            const toolResults: Array<{ callId: string; content: string; isError: boolean; duration?: number }> = [];

            // 执行每个工具调用
            for (const toolCall of payload.tool_calls) {
              const fullName = toolCall.function.name;
              const toolInfo = agentToolsMap.get(fullName);

            if (!toolInfo) {
              logger.error(LogTags.APP, '圆桌会议 - 未找到工具', { fullName });
              continue;
            }

            // 记录工具调用
            toolCalls.push({
              id: toolCall.id,
              name: toolInfo.name,
              arguments: toolCall.function.arguments,
              serverId: toolInfo.serverId,
              serverName: toolInfo.serverName,
              // v4.1.36: 保留 Gemini 2.5 thinking 模型的 thought_signature
              ...(toolCall.thought_signature ? { thoughtSignature: toolCall.thought_signature } : {}),
            });

            try {
              // 解析工具参数
              const args = JSON.parse(toolCall.function.arguments || '{}');

              if (import.meta.env.DEV) {
                logger.debug(LogTags.APP, `圆桌会议 - 执行工具: ${toolInfo.name} @ ${toolInfo.serverName}`, args);
              }

              // v4.1.41: 实时展示工具调用卡片（首轮）
              const currentToolCallsSnapshot = [...toolCalls];
              const currentToolResultsSnapshot = [...toolResults];
              setRoundtableChats(prev => prev.map(c => {
                if (c.id !== chatId) return c;
                const existingIdx = c.messages.findIndex(m => m.id === `tool-live-${chatId}`);
                const liveMessage: RoundtableMessage = {
                  id: `tool-live-${chatId}`,
                  chatId,
                  role: 'assistant',
                  content: '',
                  createdAt: new Date(),
                  participantId,
                  round: currentRound,
                  toolCalls: currentToolCallsSnapshot,
                  toolResults: currentToolResultsSnapshot,
                };
                if (existingIdx >= 0) {
                  const newMessages = [...c.messages];
                  newMessages[existingIdx] = liveMessage;
                  return { ...c, messages: newMessages };
                }
                return { ...c, messages: [...c.messages, liveMessage] };
              }));

              const startTime = Date.now();

              // 调用 MCP 工具
              const result = await invoke<{
                content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
                isError?: boolean;
              }>('mcp_call_tool', {
                serverId: toolInfo.serverId,
                toolName: toolInfo.name,
                arguments: args,
              });

              const duration = Date.now() - startTime;

              if (import.meta.env.DEV) {
                logger.debug(LogTags.APP, '圆桌会议 - 工具执行结果', { result, duration: `${duration}ms` });
              }

              // 提取工具结果（支持文本和图片）
              const toolResultParts: string[] = [];
              for (const c of result.content) {
                if (c.type === 'text' && c.text) {
                  toolResultParts.push(c.text);
                } else if (c.type === 'image' && c.data && c.mimeType) {
                  // 将图片转换为 Markdown 格式
                  const imageUrl = `data:${c.mimeType};base64,${c.data}`;
                  toolResultParts.push(`![工具返回的图片](${imageUrl})`);
                }
              }
              const toolResultText = toolResultParts.join('\n\n');

              toolResults.push({
                callId: toolCall.id,
                content: toolResultText,
                isError: result.isError || false,
                duration,
              });

              // v4.1.41: 实时更新工具消息（首轮）
              setRoundtableChats(prev => prev.map(c => {
                if (c.id !== chatId) return c;
                const idx = c.messages.findIndex(m => m.id === `tool-live-${chatId}`);
                if (idx < 0) return c;
                const newMessages = [...c.messages];
                newMessages[idx] = {
                  ...newMessages[idx],
                  toolCalls: [...toolCalls],
                  toolResults: [...toolResults],
                };
                return { ...c, messages: newMessages };
              }));

              // 更新 MCP 服务器请求计数
              setMcpServers((prev) =>
                prev.map((s) =>
                  s.id === toolInfo.serverId
                    ? { ...s, requestCount: s.requestCount + 1, lastActiveAt: new Date() }
                    : s
                )
              );
            } catch (error) {
              logger.error(LogTags.APP, '圆桌会议 - 工具调用失败', error);
              toolResults.push({
                callId: toolCall.id,
                content: String(error),
                isError: true,
              });

              // v4.1.41: 实时更新工具消息错误状态（首轮）
              setRoundtableChats(prev => prev.map(c => {
                if (c.id !== chatId) return c;
                const idx = c.messages.findIndex(m => m.id === `tool-live-${chatId}`);
                if (idx < 0) return c;
                const newMessages = [...c.messages];
                newMessages[idx] = {
                  ...newMessages[idx],
                  toolCalls: [...toolCalls],
                  toolResults: [...toolResults],
                };
                return { ...c, messages: newMessages };
              }));
            }
          }

          // v4.1.41: 首轮将实时工具消息替换为持久化消息
          // v4.1.44: 如果模型直接调用工具（没有输出文本），messageCreated 为 false
          // 这种情况下不需要删除空消息，因为根本没有创建
          if (toolCalls.length > 0) {
            setRoundtableChats(prev => prev.map(c => {
              if (c.id !== chatId) return c;

              const toolMessage: RoundtableMessage = {
                id: crypto.randomUUID(),
                chatId,
                role: 'assistant',
                content: '',
                createdAt: new Date(),
                participantId,
                round: currentRound,
                toolCalls: toolCalls.map((tc) => ({
                  id: tc.id,
                  name: tc.name,
                  arguments: tc.arguments,
                  serverId: tc.serverId,
                  serverName: tc.serverName,
                  ...(tc.thoughtSignature ? { thoughtSignature: tc.thoughtSignature } : {}),
                })),
                toolResults: toolResults.map((tr) => ({
                  callId: tr.callId,
                  content: tr.content,
                  isError: tr.isError,
                  duration: tr.duration,
                })),
              };

              // 替换临时工具消息
              const liveIdx = c.messages.findIndex(m => m.id === `tool-live-${chatId}`);
              const newMessages = [...c.messages];
              if (liveIdx >= 0) {
                newMessages[liveIdx] = toolMessage;
              } else {
                newMessages.push(toolMessage);
              }

              return { ...c, messages: newMessages };
            }));
          }

          // 首轮不再把工具调用写回首条文本消息，避免与独立工具消息重复展示

          // v4.1.40: 工具调用循环 - 标记需要继续对话
          // 参考普通对话，在 tool_calls 事件完成后设置标记，而不是在 done 事件中
          if (toolCalls.length > 0) {
            toolCallRound++;
            if (toolCallRound < maxToolCallRounds) {
              pendingToolContinue = true;
              if (import.meta.env.DEV) {
                logger.debug(LogTags.APP, '圆桌会议 - 标记工具调用继续', {
                  round: toolCallRound,
                  maxRounds: maxToolCallRounds,
                });
              }
            } else {
              logger.warn(LogTags.APP, '圆桌会议 - 工具调用达到最大轮次限制', {
                maxRounds: maxToolCallRounds,
              });
            }
          }

          // v4.1.40: 工具执行完成，通知 done 事件继续
          if (toolCallsPromiseResolve) {
            toolCallsPromiseResolve();
            toolCallsPromiseResolve = null;
          }
          // 注意：工具调用后不 return，继续等待后续的 chunk 或 done 事件
        }

          if (payload.event === 'done') {
          // v4.1.40: 等待 tool_calls 异步处理完成，再决定是否结束当前 Agent
          if (toolCallsPromise) {
            await toolCallsPromise;
            toolCallsPromise = null;
          }

          // v4.1.40: 工具调用已在 tool_calls 事件中处理，done 事件只需要更新参与者计数
          if (!pendingToolContinue) {
            setRoundtableChats(prev => prev.map(c => {
              if (c.id !== chatId) return c;

              const updatedParticipants = c.roundtableConfig.participants.map(p =>
                p.id === participantId
                  ? { ...p, messageCount: p.messageCount + 1, lastSpokeAt: new Date() }
                  : p
              );

              return {
                ...c,
                roundtableConfig: {
                  ...c.roundtableConfig,
                  participants: updatedParticipants,
                },
                updatedAt: new Date(),
              };
            }));
          }

          if (import.meta.env.DEV) {
            logger.debug(LogTags.APP, '圆桌会议 - Agent 回复完成（流式）', {
              participant: participant.role,
              contentLength: accumulatedContent.length,
              reasoningLength: accumulatedReasoning.length,
              willContinue: pendingToolContinue,
            });
          }

          // 清理监听器并解决 Promise
          if (unlisten) {
            unlisten();
            unlisten = undefined;
          }
          promiseResolve();
        }

        if (payload.event === 'error') {
          logger.error(LogTags.APP, '圆桌会议 - 流式输出错误', { error: payload.error });

          // v4.1.44: 如果消息还没创建（API 调用失败），先创建一个错误消息
          if (!messageCreated) {
            const errorMessage: RoundtableMessage = {
              id: messageId,
              chatId,
              role: 'assistant',
              content: `⚠️ ${participant.role} 回复失败: ${payload.error}`,
              createdAt: new Date(),
              participantId,
              round: currentRound,
            };
            setRoundtableChats(prev => prev.map(c => {
              if (c.id !== chatId) return c;
              return {
                ...c,
                messages: [...c.messages, errorMessage],
                updatedAt: new Date(),
              };
            }));
            messageCreated = true;
          } else {
            // 更新已存在的消息显示错误
            setRoundtableChats(prev => prev.map(c => {
              if (c.id !== chatId) return c;
              const messages = c.messages.map(m =>
                m.id === messageId
                  ? { ...m, content: `⚠️ ${participant.role} 回复失败: ${payload.error}` }
                  : m
              );
              return { ...c, messages };
            }));
          }

          // 清理监听器并拒绝 Promise
          if (unlisten) {
            unlisten();
            unlisten = undefined;
          }
          promiseReject(new Error(payload.error || '流式输出错误'));
        }
      });

      // v4.2.8: Promise 使用非 async executor，仅存储 resolve/reject
      await new Promise<void>((resolve, reject) => {
        promiseResolve = resolve;
        promiseReject = reject;

        // v4.1.10: 监听器设置完成后再调用 API
      // 调用流式 API
      // v4.1.9: 传递 Agent 的 MCP 工具
      // v4.1.10: 传递 message_id 用于区分不同参与者的消息
      // v4.1.40: 传递其他必要参数
      // v0.9.4: 计算有效协议（考虑提供商默认协议）
      const provider = providers.find(p => p.id === model.provider);
      const effectiveProtocol = model.protocol || provider?.protocol || getDefaultProtocol(model.provider);

      invoke('chat_stream_message', {
        request: {
          provider: model.provider,
          api_key: apiKey,
          model_name: model.modelId || model.name,
          messages: apiMessages,
          endpoint: model.endpoint,
          tools: hasTools ? agentTools : undefined,
          message_id: messageId,
          account_id: accountId,
          project_id: projectId,
          protocol: effectiveProtocol,  // v0.9.4: 使用有效协议
        }
      }).catch(err => {
        // API 调用失败
        if (unlisten) {
          unlisten();
          unlisten = undefined;
        }
        promiseReject(err);
      });
    });

    // v4.1.40: 工具调用循环 - 如果需要继续，构建新请求并再次调用
    while (pendingToolContinue && toolCallRound < maxToolCallRounds) {
      pendingToolContinue = false; // 重置标记

      // 等待 React 状态更新完成（工具调用和结果已添加到消息）
      await new Promise(resolve => setTimeout(resolve, 100));

      if (import.meta.env.DEV) {
        logger.debug(LogTags.APP, '圆桌会议 - 工具调用循环继续', {
          round: toolCallRound,
          maxRounds: maxToolCallRounds,
        });
      }

      // 获取最新的 chat 对象和消息
      const latestChat = roundtableChatsRef.current.find(c => c.id === chatId);
      if (!latestChat) {
        logger.warn(LogTags.APP, '圆桌会议 - 工具续传：找不到对话', { chatId });
        break;
      }

      // v4.1.41: 续传请求补回当前参与者上下文，避免角色漂移
      const contextMessages = latestChat.messages.filter(
        m => (m.content && m.content.trim().length > 0) || (m.toolCalls && m.toolCalls.length > 0)
      );
      const continueContext = buildRoundtableContext(
        latestChat.roundtableConfig,
        participantId,
        contextMessages,
        agents
      );

      // v4.1.41: 续传历史仅保留用户消息 + 当前参与者消息，避免多 Agent 角色串线
      const continueHistoryMessages = latestChat.messages.filter(
        m => m.role === 'user' || m.participantId === participantId
      );

      // v4.1.40: 续传请求对齐普通对话逻辑
      // 使用统一的 buildApiMessages 构建历史消息（包含 tool_calls + tool 结果），
      // 避免手动拼接导致工具名格式和消息顺序不一致。
      const continueMessages = buildApiMessages(
        continueHistoryMessages,
        '',
        []
      );
      const continueRequestMessages = [
        { role: 'system' as const, content: continueContext },
        ...continueMessages,
      ];

      // 创建新的消息用于显示 continuation 的回复
      const continueMessageId = crypto.randomUUID();
      const continueMessage: RoundtableMessage = {
        id: continueMessageId,
        chatId,
        role: 'assistant',
        content: '',
        createdAt: new Date(),
        participantId,
        round: currentRound,
      };

      // 添加新消息
      setRoundtableChats(prev => prev.map(c => {
        if (c.id !== chatId) return c;
        return {
          ...c,
          messages: [...c.messages, continueMessage],
          updatedAt: new Date(),
        };
      }));

      // 累积内容
      let continueAccumulatedContent = '';
      let continueAccumulatedReasoning = '';

      // v4.2.8: 修复 new Promise(async ...) 反模式（续传）
      let continuePromiseResolve: () => void;
      let continuePromiseReject: (err: Error) => void;

      unlisten = await listen<ChatEventPayload>('chat-event', async (event) => {
          const payload = event.payload;

          // 只处理当前消息的事件
          if (payload.id !== continueMessageId) {
            return;
          }

          if (payload.event === 'chunk' && payload.content) {
            continueAccumulatedContent += payload.content;
            setRoundtableChats(prev => prev.map(c => {
              if (c.id !== chatId) return c;
              const messages = c.messages.map(m =>
                m.id === continueMessageId ? { ...m, content: continueAccumulatedContent } : m
              );
              return { ...c, messages };
            }));
          }

          if (payload.event === 'reasoning_chunk' && payload.content) {
            continueAccumulatedReasoning += payload.content;
            setRoundtableChats(prev => prev.map(c => {
              if (c.id !== chatId) return c;
              const messages = c.messages.map(m =>
                m.id === continueMessageId ? { ...m, reasoningContent: continueAccumulatedReasoning } : m
              );
              return { ...c, messages };
            }));
          }

          // 处理工具调用（与第一次相同的逻辑）
          if (payload.event === 'tool_calls' && payload.tool_calls && agentToolsMap) {
            // v4.1.40: 标记 tool_calls 异步流程开始（续传）
            toolCallsPromise = new Promise<void>((resolve) => {
              toolCallsPromiseResolve = resolve;
            });
            if (import.meta.env.DEV) {
              logger.debug(LogTags.APP, '圆桌会议 - 收到工具调用请求（续传）', { toolCalls: payload.tool_calls });
            }

            const toolCalls: Array<{ id: string; name: string; arguments: string; serverId: string; serverName: string; thoughtSignature?: string }> = [];
            const toolResults: Array<{ callId: string; content: string; isError: boolean; duration?: number }> = [];

            for (const toolCall of payload.tool_calls) {
              const fullName = toolCall.function.name;
              const toolInfo = agentToolsMap.get(fullName);

              if (!toolInfo) {
                logger.error(LogTags.APP, '圆桌会议 - 未找到工具', { fullName });
                continue;
              }

              toolCalls.push({
                id: toolCall.id,
                name: toolInfo.name,
                arguments: toolCall.function.arguments,
                serverId: toolInfo.serverId,
                serverName: toolInfo.serverName,
                ...(toolCall.thought_signature ? { thoughtSignature: toolCall.thought_signature } : {}),
              });

              try {
                const args = JSON.parse(toolCall.function.arguments || '{}');

                if (import.meta.env.DEV) {
                  logger.debug(LogTags.APP, `圆桌会议 - 执行工具（续传）: ${toolInfo.name} @ ${toolInfo.serverName}`, args);
                }

                // 实时展示工具调用卡片
                const currentToolCallsSnapshot = [...toolCalls];
                const currentToolResultsSnapshot = [...toolResults];
                setRoundtableChats(prev => prev.map(c => {
                  if (c.id !== chatId) return c;
                  const existingIdx = c.messages.findIndex(m => m.id === `tool-live-${chatId}`);
                  const liveMessage: RoundtableMessage = {
                    id: `tool-live-${chatId}`,
                    chatId,
                    role: 'assistant',
                    content: '',
                    createdAt: new Date(),
                    participantId,
                    round: currentRound,
                    toolCalls: currentToolCallsSnapshot,
                    toolResults: currentToolResultsSnapshot,
                  };
                  if (existingIdx >= 0) {
                    const newMessages = [...c.messages];
                    newMessages[existingIdx] = liveMessage;
                    return { ...c, messages: newMessages };
                  }
                  return { ...c, messages: [...c.messages, liveMessage] };
                }));

                const startTime = Date.now();

                const result = await invoke<{
                  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
                  isError?: boolean;
                }>('mcp_call_tool', {
                  serverId: toolInfo.serverId,
                  toolName: toolInfo.name,
                  arguments: args,
                });

                const duration = Date.now() - startTime;

                if (import.meta.env.DEV) {
                  logger.debug(LogTags.APP, '圆桌会议 - 工具执行结果（续传）', { result, duration: `${duration}ms` });
                }

                // 提取工具结果（支持文本和图片）
                const toolResultParts: string[] = [];
                for (const c of result.content) {
                  if (c.type === 'text' && c.text) {
                    toolResultParts.push(c.text);
                  } else if (c.type === 'image' && c.data && c.mimeType) {
                    // 将图片转换为 Markdown 格式
                    const imageUrl = `data:${c.mimeType};base64,${c.data}`;
                    toolResultParts.push(`![工具返回的图片](${imageUrl})`);
                  }
                }
                const toolResultText = toolResultParts.join('\n\n');

                toolResults.push({
                  callId: toolCall.id,
                  content: toolResultText,
                  isError: result.isError || false,
                  duration,
                });

                // 实时更新工具消息
                setRoundtableChats(prev => prev.map(c => {
                  if (c.id !== chatId) return c;
                  const idx = c.messages.findIndex(m => m.id === `tool-live-${chatId}`);
                  if (idx < 0) return c;
                  const newMessages = [...c.messages];
                  newMessages[idx] = {
                    ...newMessages[idx],
                    toolCalls: [...toolCalls],
                    toolResults: [...toolResults],
                  };
                  return { ...c, messages: newMessages };
                }));

                // 更新 MCP 服务器请求计数
                setMcpServers((prev) =>
                  prev.map((s) =>
                    s.id === toolInfo.serverId
                      ? { ...s, requestCount: s.requestCount + 1, lastActiveAt: new Date() }
                      : s
                  )
                );
              } catch (error) {
                logger.error(LogTags.APP, '圆桌会议 - 工具调用失败（续传）', error);
                toolResults.push({
                  callId: toolCall.id,
                  content: String(error),
                  isError: true,
                });

                setRoundtableChats(prev => prev.map(c => {
                  if (c.id !== chatId) return c;
                  const idx = c.messages.findIndex(m => m.id === `tool-live-${chatId}`);
                  if (idx < 0) return c;
                  const newMessages = [...c.messages];
                  newMessages[idx] = {
                    ...newMessages[idx],
                    toolCalls: [...toolCalls],
                    toolResults: [...toolResults],
                  };
                  return { ...c, messages: newMessages };
                }));
              }
            }

            // 将实时工具消息替换为持久化消息
            if (toolCalls.length > 0) {
              setRoundtableChats(prev => prev.map(c => {
                if (c.id !== chatId) return c;

                const toolMessage: RoundtableMessage = {
                  id: crypto.randomUUID(),
                  chatId,
                  role: 'assistant',
                  content: '',
                  createdAt: new Date(),
                  participantId,
                  round: currentRound,
                  toolCalls: toolCalls.map((tc) => ({
                    id: tc.id,
                    name: tc.name,
                    arguments: tc.arguments,
                    serverId: tc.serverId,
                    serverName: tc.serverName,
                    ...(tc.thoughtSignature ? { thoughtSignature: tc.thoughtSignature } : {}),
                  })),
                  toolResults: toolResults.map((tr) => ({
                    callId: tr.callId,
                    content: tr.content,
                    isError: tr.isError,
                    duration: tr.duration,
                  })),
                };

                const liveIdx = c.messages.findIndex(m => m.id === `tool-live-${chatId}`);
                if (liveIdx >= 0) {
                  const newMessages = [...c.messages];
                  newMessages[liveIdx] = toolMessage;
                  return { ...c, messages: newMessages };
                }
                return {
                  ...c,
                  messages: [...c.messages, toolMessage],
                };
              }));

              // v4.1.40: 续传工具调用完成后，标记继续循环
              toolCallRound++;
              if (toolCallRound < maxToolCallRounds) {
                pendingToolContinue = true;
                if (import.meta.env.DEV) {
                  logger.debug(LogTags.APP, '圆桌会议 - 标记工具调用继续（续传）', {
                    round: toolCallRound,
                    maxRounds: maxToolCallRounds,
                  });
                }
              } else {
                logger.warn(LogTags.APP, '圆桌会议 - 工具调用达到最大轮次限制（续传）', {
                  maxRounds: maxToolCallRounds,
                });
              }
            }

            // v4.1.40: 续传工具执行完成，通知 done 事件继续
            if (toolCallsPromiseResolve) {
              toolCallsPromiseResolve();
              toolCallsPromiseResolve = null;
            }
          }

          if (payload.event === 'done') {
            // v4.1.40: 等待 tool_calls 异步处理完成，再决定是否结束当前 Agent
            if (toolCallsPromise) {
              await toolCallsPromise;
              toolCallsPromise = null;
            }

            // 只在没有工具调用或达到最大轮次时更新参与者消息计数
            if (!pendingToolContinue) {
              setRoundtableChats(prev => prev.map(c => {
                if (c.id !== chatId) return c;

                const updatedParticipants = c.roundtableConfig.participants.map(p =>
                  p.id === participantId
                    ? { ...p, messageCount: p.messageCount + 1, lastSpokeAt: new Date() }
                    : p
                );

                return {
                  ...c,
                  roundtableConfig: {
                    ...c.roundtableConfig,
                    participants: updatedParticipants,
                  },
                  updatedAt: new Date(),
                };
              }));
            }

            if (import.meta.env.DEV) {
              logger.debug(LogTags.APP, '圆桌会议 - Agent 回复完成（续传）', {
                participant: participant.role,
                contentLength: continueAccumulatedContent.length,
                reasoningLength: continueAccumulatedReasoning.length,
                willContinue: pendingToolContinue,
              });
            }

            if (unlisten) {
              unlisten();
              unlisten = undefined;
            }
            continuePromiseResolve();
          }

          if (payload.event === 'error') {
            logger.error(LogTags.APP, '圆桌会议 - 流式输出错误（续传）', { error: payload.error });

            if (toolCallsPromiseResolve) {
              toolCallsPromiseResolve();
              toolCallsPromiseResolve = null;
            }

            setRoundtableChats(prev => prev.map(c => {
              if (c.id !== chatId) return c;
              const messages = c.messages.map(m =>
                m.id === continueMessageId
                  ? { ...m, content: `⚠️ ${participant.role} 回复失败: ${payload.error}` }
                  : m
              );
              return { ...c, messages };
            }));

            if (unlisten) {
              unlisten();
              unlisten = undefined;
            }
            continuePromiseReject(new Error(payload.error || '流式输出错误'));
          }
        });

        // v4.2.8: Promise 使用非 async executor（续传）
        await new Promise<void>((resolve, reject) => {
          continuePromiseResolve = resolve;
          continuePromiseReject = reject;

          // 调用流式 API（续传）
        // v0.9.4: 使用有效协议
        const provider = providers.find(p => p.id === model.provider);
        const effectiveProtocol = model.protocol || provider?.protocol || getDefaultProtocol(model.provider);

        invoke('chat_stream_message', {
          request: {
            provider: model.provider,
            api_key: apiKey,
            model_name: model.modelId || model.name,
            messages: continueRequestMessages,
            endpoint: model.endpoint,
            tools: hasTools ? agentTools : undefined,
            message_id: continueMessageId,
            account_id: accountId,
            project_id: projectId,
            protocol: effectiveProtocol,  // v0.9.4: 使用有效协议
          }
        }).catch(err => {
          if (unlisten) {
            unlisten();
            unlisten = undefined;
          }
          continuePromiseReject(err);
        });
      });
    }

    // v4.1.40: 所有轮次完成，重置计数器
    if (import.meta.env.DEV && toolCallRound > 0) {
      logger.debug(LogTags.APP, '圆桌会议 - 工具调用循环完成', {
        totalRounds: toolCallRound,
      });
    }

} catch (error) {
  logger.error(LogTags.APP, '圆桌会议 - Agent 回复失败', {
    participant: participant.role,
    error,
  });

  // v4.1.40: 更新最后一条该参与者的消息显示错误
  setRoundtableChats(prev => prev.map(c => {
    if (c.id !== chatId) return c;
    const messages = [...c.messages];
    // 找到最后一条该参与者的消息
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].participantId === participantId && messages[i].round === currentRound) {
        messages[i] = {
          ...messages[i],
          content: `⚠️ ${participant.role} 回复失败: ${error instanceof Error ? error.message : String(error)}`
        };
        break;
      }
    }
    return { ...c, messages };
  }));
} finally {
  // 清理监听器
  if (unlisten) {
    unlisten();
  }
}
  }, [agents, models, getAgentTools, providers, roundtableChatsRef, setMcpServers, setRoundtableChats, setRoundtableSpeakerId]);

/**
 * 处理顺序发言模式
 *
 * 注意：由于 React 状态更新的异步性，这里直接使用传入的 chat 对象
 * 而不是从 roundtableChats 状态中查找，避免闭包问题
 *
 * v4.1.1: 修复轮数逻辑 - 所有参与者发言一圈算一轮
 * v4.1.11: 修复闭包问题 - 每次循环从 ref 获取最新的 chat 对象
 */
const processSequentialSpeaking = useCallback(async (
  chatId: string,
  chat: RoundtableChat
) => {
  logger.info(LogTags.APP, '=== processSequentialSpeaking 开始 ===', { chatId });

  // v4.1.11: 获取参与者列表的快照（参与者列表在讨论过程中不会变化）
  const participants = [...chat.roundtableConfig.participants];
  const { maxRounds } = chat.roundtableConfig.rules;

  // 获取当前轮数
  let currentRound = chat.roundtableConfig.currentRound;

  // v4.1.8: 判断是否为无限制模式（999 表示不限制）
  const isUnlimitedMode = maxRounds === 999;

  // 循环执行讨论
  // v4.1.9: 固定轮数模式自动完成所有轮次，无限制模式需要手动点击下一轮
  while (currentRound <= maxRounds) {
    // v4.1.8: 检查停止标志
    if (roundtableStopFlagsRef.current.has(chatId)) {
      logger.info(LogTags.APP, '检测到停止标志，中断讨论');
      roundtableStopFlagsRef.current.delete(chatId);
      break;
    }

    logger.info(LogTags.APP, `开始第 ${currentRound}${isUnlimitedMode ? '' : `/${maxRounds}`} 轮讨论`);

    // 每轮让所有参与者依次发言
    for (let i = 0; i < participants.length; i++) {
      // v4.1.8: 每个参与者发言前检查停止标志
      if (roundtableStopFlagsRef.current.has(chatId)) {
        logger.info(LogTags.APP, '检测到停止标志，中断当前轮次');
        roundtableStopFlagsRef.current.delete(chatId);
        return; // 直接返回，不继续执行
      }

      const participant = participants[i];
      logger.info(LogTags.APP, `第 ${currentRound} 轮 - 参与者 ${i + 1}/${participants.length}`, {
        participantId: participant.id,
        role: participant.role,
      });

      // v4.1.11: 每次循环从 ref 获取最新的 chat 对象，确保包含前一个参与者的消息
      const latestChat = roundtableChatsRef.current.find(c => c.id === chatId);
      if (!latestChat) {
        logger.warn(LogTags.APP, '圆桌会议不存在（循环中）', { chatId });
        return;
      }

      // 调用 API 获取 Agent 回复，传入当前轮数
      await generateAgentResponse(chatId, latestChat, participant.id, currentRound);
    }

    // 一圈结束，准备进入下一轮
    // v4.1.14: 修复轮数显示问题 - 只有在确定要进入下一轮时才递增
    // 之前的问题：两人发言完后立即递增轮数，导致显示"第 2 轮"但实际第一轮刚结束
    const nextRound = currentRound + 1;

    // v4.1.9: 无限制模式下，完成一轮后停止，等待用户手动触发下一轮
    // 固定轮数模式则自动继续执行所有轮次
    if (isUnlimitedMode) {
      logger.info(LogTags.APP, '无限制模式：完成一轮，等待用户手动触发下一轮');
      break;
    }

    // 检查是否还有下一轮
    if (nextRound > maxRounds) {
      logger.info(LogTags.APP, '已完成所有轮次', { completedRounds: currentRound, maxRounds });
      break;
    }

    // 更新状态中的轮数（进入下一轮）
    currentRound = nextRound;
    setRoundtableChats(prev => prev.map(c => {
      if (c.id !== chatId) return c;
      return {
        ...c,
        roundtableConfig: {
          ...c.roundtableConfig,
          currentRound,
        },
        updatedAt: new Date(),
      };
    }));
  }

  logger.info(LogTags.APP, '=== processSequentialSpeaking 结束 ===');
}, [generateAgentResponse, roundtableChatsRef, setRoundtableChats]);

/**
 * 开始圆桌会议（让 Agent 依次发言）
 *
 * @param chatId - 圆桌会议 ID
 * @param userQuestion - 用户问题
 */
const handleRoundtableStartDiscussion = useCallback(async (
  chatId: string,
  userQuestion: string
) => {
  logger.info(LogTags.APP, '=== handleRoundtableStartDiscussion 开始 ===', { chatId, userQuestion });

  const chat = roundtableChats.find(c => c.id === chatId);
  if (!chat) {
    logger.warn(LogTags.APP, '圆桌会议不存在', { chatId, availableIds: roundtableChats.map(c => c.id) });
    return;
  }

  logger.info(LogTags.APP, '找到圆桌会议', {
    topic: chat.roundtableConfig.topic,
    participantCount: chat.roundtableConfig.participants.length,
    speakMode: chat.roundtableConfig.rules.speakMode,
    participants: chat.roundtableConfig.participants.map(p => ({
      id: p.id,
      role: p.role,
      agentId: p.agentId,
    })),
  });

  // 1. 添加用户消息
  const userMessage: RoundtableMessage = {
    id: crypto.randomUUID(),
    chatId,
    role: 'user',
    content: userQuestion,
    createdAt: new Date(),
    participantId: '', // 用户消息没有参与者 ID
    round: chat.roundtableConfig.currentRound,
  };

  logger.info(LogTags.APP, '创建用户消息', { messageId: userMessage.id });

  // 2. 更新状态为讨论中
  setRoundtableChats(prev => prev.map(c => {
    if (c.id !== chatId) return c;
    return {
      ...c,
      messages: [...c.messages, userMessage],
      roundtableConfig: {
        ...c.roundtableConfig,
        status: 'discussing',
      },
      updatedAt: new Date(),
    };
  }));

  logger.info(LogTags.APP, '状态已更新为 discussing');

  // 3. 获取最新的 chat 状态
  const updatedChat = {
    ...chat,
    messages: [...chat.messages, userMessage],
    roundtableConfig: {
      ...chat.roundtableConfig,
      status: 'discussing' as const,
    },
  };

  // 4. 根据发言模式处理
  const { speakMode } = updatedChat.roundtableConfig.rules;
  logger.info(LogTags.APP, '开始处理发言模式', { speakMode });

  try {
    if (speakMode === 'sequential') {
      // 顺序发言：依次让每个参与者发言
      logger.info(LogTags.APP, '调用 processSequentialSpeaking');
      await processSequentialSpeaking(chatId, updatedChat);
      logger.info(LogTags.APP, 'processSequentialSpeaking 完成');
    } else {
      // v4.1.10: 移除并行发言模式，自由发言模式等待用户 @提及
      logger.info(LogTags.APP, '自由发言模式，等待用户 @提及');
    }
  } catch (error) {
    logger.error(LogTags.APP, '发言处理失败', error);
  } finally {
    // v4.1.4: 清除当前发言者状态（按对话 ID）
    setRoundtableSpeakerId(chatId, null);
  }

  logger.info(LogTags.APP, '=== handleRoundtableStartDiscussion 结束 ===');

}, [roundtableChats, processSequentialSpeaking, setRoundtableChats, setRoundtableSpeakerId]);

/**
 * 生成圆桌会议总结
 *
 * @param chatId - 圆桌会议 ID
 */
const handleRoundtableSummarize = useCallback(async (chatId: string) => {
  const chat = roundtableChats.find(c => c.id === chatId);
  if (!chat) {
    logger.warn(LogTags.APP, '圆桌会议不存在', { chatId });
    return;
  }

  // 更新状态为总结中
  setRoundtableChats(prev => prev.map(c => {
    if (c.id !== chatId) return c;
    return {
      ...c,
      roundtableConfig: {
        ...c.roundtableConfig,
        status: 'summarizing',
      },
    };
  }));

  // 获取总结者
  const summarizerId = chat.roundtableConfig.rules.summarizerAgentId;
  const summarizerParticipant = chat.roundtableConfig.participants.find(
    p => p.agentId === summarizerId
  );

  if (!summarizerParticipant) {
    logger.warn(LogTags.APP, '总结者不存在');
    return;
  }

  const agent = agents.find(a => a.id === summarizerId);
  if (!agent) {
    logger.warn(LogTags.APP, '总结者 Agent 不存在');
    return;
  }

  const model = models.find(m => m.id === agent.model);
  if (!model) {
    logger.warn(LogTags.APP, '总结者模型配置无效');
    return;
  }

  // v3.5.1: 如果模型标记使用提供商凭证，则从 providerCredentialsStorage 实时获取
  let apiKey = model.apiKey;

  if (model.useProviderCredential) {
    try {
      const credential = await providerCredentialsStorage.get(model.provider);
      if (credential) {
        // v0.8.0: 使用辅助函数处理 Kiro 特殊格式
        apiKey = getApiKeyFromCredential(credential, model.provider);
        if (import.meta.env.DEV) {
          logger.debug(LogTags.APP, '圆桌会议总结 - 使用提供商凭证', {
            provider: model.provider,
            hasApiKey: !!credential.apiKey,
            hasAccessToken: !!credential.accessToken,
          });
        }
      }
    } catch (error) {
      logger.error(LogTags.APP, '圆桌会议总结 - 获取提供商凭证失败', error);
    }
  }

  if (!apiKey) {
    logger.warn(LogTags.APP, '总结者 API Key 未设置', { useProviderCredential: model.useProviderCredential });
    return;
  }

  // v4.1.5: 设置总结者为当前发言者
  setRoundtableSpeakerId(chatId, summarizerParticipant.id);

  // v4.1.6: 生成消息 ID，用于流式更新
  const messageId = crypto.randomUUID();

  // 先创建一个空的总结消息（用于流式更新）
  const summaryMessage: RoundtableMessage = {
    id: messageId,
    chatId,
    role: 'assistant',
    content: '', // 初始为空，流式填充
    createdAt: new Date(),
    participantId: summarizerParticipant.id,
    round: chat.roundtableConfig.currentRound,
    isSummary: true, // 标记为总结消息
  };

  // 添加空消息到对话
  setRoundtableChats(prev => prev.map(c => {
    if (c.id !== chatId) return c;
    return {
      ...c,
      messages: [...c.messages, summaryMessage],
      updatedAt: new Date(),
    };
  }));

  let unlisten: (() => void) | undefined;

  try {
    // 构建总结上下文
    const summaryContext = buildSummaryContext(
      chat.roundtableConfig,
      chat.messages,
      agents
    );

    const apiMessages = [
      { role: 'system' as const, content: summaryContext },
      { role: 'user' as const, content: '请根据以上讨论内容，生成一份结构化的总结报告。' },
    ];

    if (import.meta.env.DEV) {
      logger.debug(LogTags.APP, '圆桌会议 - 生成总结（流式）', { summarizer: agent.name });
    }

    // v4.1.6: 累积内容
    let accumulatedContent = '';

    // 设置流式事件监听器
    unlisten = await listen('chat-event', (event: { payload: { id: string; event: string; content?: string; error?: string } }) => {
      const payload = event.payload;

      // v4.2.5: 过滤：只处理当前消息的事件，避免并发时串流污染
      if (payload.id !== messageId) return;

      if (payload.event === 'chunk' && payload.content) {
        // 累积内容
        accumulatedContent += payload.content;

        // 更新消息内容（流式）
        setRoundtableChats(prev => prev.map(c => {
          if (c.id !== chatId) return c;
          const messages = c.messages.map(m =>
            m.id === messageId ? { ...m, content: accumulatedContent } : m
          );
          return { ...c, messages };
        }));
      }

      if (payload.event === 'done') {
        // 完成：更新状态为已完成
        setRoundtableChats(prev => prev.map(c => {
          if (c.id !== chatId) return c;
          return {
            ...c,
            roundtableConfig: {
              ...c.roundtableConfig,
              status: 'completed',
            },
            updatedAt: new Date(),
          };
        }));

        if (import.meta.env.DEV) {
          logger.debug(LogTags.APP, '圆桌会议 - 总结完成（流式）', {
            contentLength: accumulatedContent.length,
          });
        }
      }

      if (payload.event === 'error') {
        logger.error(LogTags.APP, '圆桌会议 - 总结流式输出错误', { error: payload.error });

        // 更新消息显示错误（总结消息应该已经创建）
        setRoundtableChats(prev => prev.map(c => {
          if (c.id !== chatId) return c;
          const messages = c.messages.map(m =>
            m.id === messageId
              ? {
                ...m,
                content: m.content
                  ? `${m.content}\n\n⚠️ 总结生成失败: ${payload.error}`
                  : `⚠️ 总结生成失败: ${payload.error}`
              }
              : m
          );
          return {
            ...c,
            messages,
            roundtableConfig: {
              ...c.roundtableConfig,
              status: 'discussing',
            },
          };
        }));
      }
    });

    // 调用流式 API
    // v3.5.1: 使用实时获取的 apiKey
    await invoke('chat_stream_message', {
      request: {
        provider: model.provider,
        api_key: apiKey,
        model_name: model.modelId || model.name,
        messages: apiMessages,
        endpoint: model.endpoint,
        protocol: model.protocol || providers.find(p => p.id === model.provider)?.protocol || getDefaultProtocol(model.provider),  // v0.9.6: 补充缺失的 protocol 字段，使用三级回退逻辑
      }
    });

  } catch (error) {
    logger.error(LogTags.APP, '圆桌会议 - 总结失败', error);

    // 更新消息显示错误
    setRoundtableChats(prev => prev.map(c => {
      if (c.id !== chatId) return c;
      const messages = c.messages.map(m =>
        m.id === messageId
          ? { ...m, content: `⚠️ 总结生成失败: ${error instanceof Error ? error.message : String(error)}` }
          : m
      );
      return {
        ...c,
        messages,
        roundtableConfig: {
          ...c.roundtableConfig,
          status: 'discussing',
        },
      };
    }));
  } finally {
    // 清理监听器
    if (unlisten) {
      unlisten();
    }
    // v4.1.5: 清除发言者状态
    setRoundtableSpeakerId(chatId, null);
  }
}, [roundtableChats, agents, models, setRoundtableSpeakerId, setRoundtableChats]);

/**
 * 进入下一轮讨论
 *
 * v4.1.3: 修复下一轮按钮 - 不仅更新轮数，还要触发新一轮讨论
 * v4.1.11: 修复闭包问题 - 使用 ref 获取最新状态，避免使用过期的 chat 对象
 *
 * @param chatId - 圆桌会议 ID
 */
const handleRoundtableNextRound = useCallback(async (chatId: string) => {
  // v4.1.11: 从 ref 获取最新的 chat 对象，避免闭包问题
  const chat = roundtableChatsRef.current.find(c => c.id === chatId);
  if (!chat) {
    logger.warn(LogTags.APP, '圆桌会议不存在', { chatId });
    return;
  }

  const { maxRounds } = chat.roundtableConfig.rules;
  const newRound = chat.roundtableConfig.currentRound + 1;

  // 检查是否已达到最大轮数（无限制模式 999 除外）
  if (maxRounds !== 999 && newRound > maxRounds) {
    logger.warn(LogTags.APP, '已达到最大轮数', { currentRound: chat.roundtableConfig.currentRound, maxRounds });
    return;
  }

  // 更新轮数
  setRoundtableChats(prev => prev.map(c => {
    if (c.id !== chatId) return c;
    return {
      ...c,
      roundtableConfig: {
        ...c.roundtableConfig,
        currentRound: newRound,
      },
      updatedAt: new Date(),
    };
  }));

  logger.info(LogTags.APP, '圆桌会议 - 进入下一轮', { newRound, maxRounds });

  // 根据发言模式触发新一轮讨论
  const { speakMode } = chat.roundtableConfig.rules;
  try {
    if (speakMode === 'sequential') {
      // 顺序发言：让每个参与者依次发言一次
      // v4.1.11: 获取参与者列表的快照，避免循环中列表变化
      const participants = [...chat.roundtableConfig.participants];

      for (const participant of participants) {
        // v4.1.11: 每次循环从 ref 获取最新的 chat 对象，确保包含前一个参与者的消息
        const latestChat = roundtableChatsRef.current.find(c => c.id === chatId);
        if (!latestChat) {
          logger.warn(LogTags.APP, '圆桌会议不存在（循环中）', { chatId });
          break;
        }

        // v4.1.11: 检查停止标志
        if (roundtableStopFlagsRef.current.has(chatId)) {
          logger.info(LogTags.APP, '检测到停止标志，中断下一轮讨论');
          roundtableStopFlagsRef.current.delete(chatId);
          break;
        }

        setRoundtableSpeakerId(chatId, participant.id);
        await generateAgentResponse(chatId, latestChat, participant.id, newRound);
      }
    }
    // 自由模式不自动触发发言，等待用户 @提及
  } catch (error) {
    logger.error(LogTags.APP, '下一轮讨论失败', error);
  } finally {
    setRoundtableSpeakerId(chatId, null);
  }
}, [generateAgentResponse, setRoundtableSpeakerId, roundtableChatsRef, setRoundtableChats]);

/**
 * v4.1.8: 停止圆桌会议
 *
 * 设置停止标志，让正在进行的讨论在下一个检查点停止
 *
 * @param chatId - 圆桌会议 ID
 */
const handleStopRoundtable = useCallback((chatId: string) => {
  logger.info(LogTags.APP, '用户请求停止圆桌会议', { chatId });

  // 设置停止标志
  roundtableStopFlagsRef.current.add(chatId);

  // 清除当前发言者状态
  setRoundtableSpeakerId(chatId, null);

  logger.info(LogTags.APP, '已设置停止标志，讨论将在下一个检查点停止');
}, [setRoundtableSpeakerId]);

/**
 * v4.1.1: 用户在圆桌会议中发送消息
 *
 * 用户发送消息后，根据发言模式触发 Agent 回复：
 * - 顺序模式：所有 Agent 依次回复
 * - 自由模式：只有被 @提及的 Agent 回复
 *
 * v4.1.11: 修复闭包问题 - 使用 ref 获取最新状态
 *
 * @param chatId - 圆桌会议 ID
 * @param content - 消息内容
 * @param targetParticipantIds - 被 @提及的参与者 ID 列表（自由模式）
 */
const handleRoundtableSendMessage = useCallback(async (
  chatId: string,
  content: string,
  targetParticipantIds?: string[]
) => {
  // v4.1.11: 从 ref 获取最新的 chat 对象，避免闭包问题
  const chat = roundtableChatsRef.current.find(c => c.id === chatId);
  if (!chat) {
    logger.warn(LogTags.APP, '圆桌会议不存在', { chatId });
    return;
  }

  // 1. 添加用户消息
  const userMessage: RoundtableMessage = {
    id: crypto.randomUUID(),
    chatId,
    role: 'user',
    content,
    createdAt: new Date(),
    participantId: '', // 用户消息没有参与者 ID
    round: chat.roundtableConfig.currentRound,
    mentionedParticipantIds: targetParticipantIds,
  };

  // 更新对话
  setRoundtableChats(prev => prev.map(c => {
    if (c.id !== chatId) return c;
    return {
      ...c,
      messages: [...c.messages, userMessage],
      updatedAt: new Date(),
    };
  }));

  logger.info(LogTags.APP, '圆桌会议 - 用户发送消息', {
    content: content.slice(0, 50),
    targetParticipantIds,
  });

  // 2. 根据发言模式触发 Agent 回复
  // v4.1.5: 如果用户 @了特定参与者，无论什么模式都只让被 @的 Agent 回复
  const { speakMode } = chat.roundtableConfig.rules;

  try {
    if (targetParticipantIds && targetParticipantIds.length > 0) {
      // 用户 @了特定参与者，只让被 @的 Agent 回复
      for (const participantId of targetParticipantIds) {
        // v4.1.11: 每次循环从 ref 获取最新的 chat 对象
        const latestChat = roundtableChatsRef.current.find(c => c.id === chatId);
        if (!latestChat) {
          logger.warn(LogTags.APP, '圆桌会议不存在（循环中）', { chatId });
          break;
        }

        // 检查停止标志
        if (roundtableStopFlagsRef.current.has(chatId)) {
          logger.info(LogTags.APP, '检测到停止标志，中断回复');
          roundtableStopFlagsRef.current.delete(chatId);
          break;
        }

        setRoundtableSpeakerId(chatId, participantId);
        await generateAgentResponse(chatId, latestChat, participantId);
      }
    } else if (speakMode === 'sequential') {
      // 顺序模式：所有 Agent 依次回复
      // v4.1.11: 获取参与者列表的快照
      const participants = [...chat.roundtableConfig.participants];

      for (const participant of participants) {
        // v4.1.11: 每次循环从 ref 获取最新的 chat 对象
        const latestChat = roundtableChatsRef.current.find(c => c.id === chatId);
        if (!latestChat) {
          logger.warn(LogTags.APP, '圆桌会议不存在（循环中）', { chatId });
          break;
        }

        // 检查停止标志
        if (roundtableStopFlagsRef.current.has(chatId)) {
          logger.info(LogTags.APP, '检测到停止标志，中断回复');
          roundtableStopFlagsRef.current.delete(chatId);
          break;
        }

        setRoundtableSpeakerId(chatId, participant.id);
        await generateAgentResponse(chatId, latestChat, participant.id);
      }
    }
    // 自由模式且没有 @任何人：不自动触发回复
  } catch (error) {
    logger.error(LogTags.APP, '圆桌会议 - Agent 回复失败', error);
  } finally {
    // 清除发言者状态
    setRoundtableSpeakerId(chatId, null);
  }
}, [generateAgentResponse, setRoundtableSpeakerId, roundtableChatsRef, setRoundtableChats]);

const handleSendMessage = useCallback(async (chatId: string, content: string, modelId: string, attachments: Attachment[] = [], agent?: Agent) => {
  let unlisten: UnlistenFn | undefined;
  let streamErrorReported = false;

  try {
    const selectedModel = models.find(m => m.id === modelId);
    if (!selectedModel) {
      throw new Error('Selected model not found');
    }

    // v2.4.4: 在发送消息前检查Token有效性（Google OAuth Token自动刷新）
    if (selectedModel.provider) {
      const credential = await providerCredentialsStorage.get(selectedModel.provider);

      // 只检查OAuth类型的凭证
      if (credential?.type === 'oauth') {
        logger.info(LogTags.CHAT, '检查Token有效性', { providerId: selectedModel.provider });

        // 确保token有效（如果即将过期会自动刷新）
        const isValid = await tokenRefresher.ensureTokenValid(selectedModel.provider);

        if (!isValid) {
          // Token无效且刷新失败，提示用户重新登录
          logger.error(LogTags.CHAT, 'Token无效且刷新失败', { providerId: selectedModel.provider });

          // 更新Provider状态为断开
          setProviders(prev => prev.map(p =>
            p.id === selectedModel.provider
              ? { ...p, status: 'disconnected' as const }
              : p
          ));

          // 停止生成状态
          setGenerating(chatId, false);

          // 显示错误消息
          throw new Error(`${selectedModel.provider} Token已过期且刷新失败，请重新连接账号`);
        }

        logger.info(LogTags.CHAT, 'Token有效，继续发送消息', { providerId: selectedModel.provider });
      }
    }

    setGenerating(chatId, true);

    // v2.6.0: 埋点 - 发送消息
    trackEvents.messageSent({
      modelId,
      messageLength: content.length,
      hasAttachment: attachments.length > 0,
    });

    // v2.3.0: 真实使用次数统计 - 当使用 Agent 发送消息时更新统计
    if (agent) {
      // v2.6.0: 埋点 - 使用 Agent
      trackEvents.agentUsed({
        agentId: agent.id,
        agentName: agent.name,
      });

      setAgents(prev => prev.map(a =>
        a.id === agent.id
          ? {
            ...a,
            usageCount: a.usageCount + 1,
            lastUsedAt: new Date(),
            updatedAt: new Date(),
          }
          : a
      ));
      if (import.meta.env.DEV) {
        logger.debug(LogTags.APP, 'Agent 使用次数统计更新', { name: agent.name, count: agent.usageCount + 1 });
      }
    }

    // 1. 添加用户消息
    const userMessage: Message = {
      id: crypto.randomUUID(),
      chatId,
      role: 'user',
      content,
      createdAt: new Date(),
      attachments
    };

    setChats(prev => prev.map(c => {
      if (c.id === chatId) {
        return {
          ...c,
          messages: [...c.messages, userMessage],
          updatedAt: new Date()
        };
      }
      return c;
    }));

    // 构建 API 消息
    const currentChat = chats.find(c => c.id === chatId);
    const apiMessages = buildApiMessages(
      currentChat?.messages || [],
      content,
      attachments
    );

    // 3. 构建 API 消息...

    // 2. 监听流式事件

    // 生成消息 ID（用于区分不同对话的消息）
    const messageId = crypto.randomUUID();

    // v4.1.53: 初始化该对话的有效 messageId 集合
    if (!validMessageIdsRef.current.has(chatId)) {
      validMessageIdsRef.current.set(chatId, new Set());
    }
    const validMessageIds = validMessageIdsRef.current.get(chatId)!;
    validMessageIds.clear();
    validMessageIds.add(messageId);

    // 清理该对话的旧监听器
    const existingUnlisten = unlistenMapRef.current.get(chatId);
    if (existingUnlisten) {
      existingUnlisten();
      unlistenMapRef.current.delete(chatId);
    }

    // v4.2.2: RAF 批量更新函数 - 优化打字机效果流畅度
    // 使用 setTimeout 替代 RAF，固定 16ms 间隔，确保更稳定的更新频率
    const flushPendingUpdates = () => {
      const pending = pendingContentRef.current.get(chatId);
      if (!pending || (!pending.content && !pending.reasoning)) {
        rafIdRef.current.delete(chatId);
        return;
      }

      const { messageId, content, reasoning } = pending;
      // 清空累积的内容
      pendingContentRef.current.set(chatId, { messageId, content: '', reasoning: '' });

      setChats(prev => {
        return prev.map(chat => {
          if (chat.id !== chatId) return chat;

          const messages = [...chat.messages];
          const msgIndex = messages.findIndex(m => m.id === messageId);

          if (msgIndex === -1) {
            // 创建新消息 (Assistant)
            if (content || reasoning) {
              messages.push({
                id: messageId,
                chatId,
                role: 'assistant',
                content: content,
                reasoningContent: reasoning || undefined,
                createdAt: new Date()
              });
            }
          } else {
            // 更新现有消息
            const msg = { ...messages[msgIndex] };
            if (content) {
              msg.content += content;
            }
            if (reasoning) {
              msg.reasoningContent = (msg.reasoningContent || '') + reasoning;
            }
            messages[msgIndex] = msg;
          }
          return { ...chat, messages };
        });
      });

      rafIdRef.current.delete(chatId);
    };

    // v4.2.2: 调度更新 - 使用 setTimeout 替代 RAF，固定 16ms 间隔
    // 这样可以确保即使在高频 chunk 事件下也能保持稳定的更新频率
    const scheduleUpdate = () => {
      if (!rafIdRef.current.has(chatId)) {
        const id = window.setTimeout(flushPendingUpdates, 16);
        rafIdRef.current.set(chatId, id);
      }
    };

    // v2.3.0: 存储 toolsMap 用于工具调用
    let currentToolsMap: Map<string, MCPToolWithServer> | undefined;
    if (agent && agent.enableToolUse) {
      const { toolsMap } = getAgentTools(agent);
      currentToolsMap = toolsMap;
    }

    // v4.1.25: 工具调用同步机制
    // 问题：tool_calls 事件处理器是异步的（内部 await mcp_call_tool），
    // 但 Tauri 事件监听器不会等待 async 回调完成。
    // 后端发送 tool_calls 后紧接着发送 done，invoke 随即返回。
    // 此时 tool_calls 的异步处理可能还未完成，pendingToolContinueRef 还未设置。
    //
    // 解决方案：使用 donePromise 让 while 循环等待整个事件处理流程完成。
    // done 事件处理器会先等待 tool_calls 完成，再 resolve donePromise。
    let toolCallsPromiseResolve: (() => void) | null = null;
    let toolCallsPromise: Promise<void> | null = null;
    let donePromiseResolve: (() => void) | null = null;
    let donePromise: Promise<void> | null = null;

    // 工具调用限制追踪
    const limits = agent?.limits || {};
    const maxTotalToolCalls = limits.maxTotalToolCalls || 200;
    const maxExecutionTime = (limits.maxExecutionTime || 600) * 1000; // 转换为毫秒
    let totalToolCallCount = 0;
    const executionStartTime = Date.now();

    // 每轮 invoke 前创建新的 donePromise
    const createDonePromise = () => {
      donePromise = new Promise<void>((resolve) => {
        donePromiseResolve = resolve;
      });
    };
    createDonePromise();

    unlisten = await listen<ChatEventPayload>('chat-event', async (event) => {
      const payload = event.payload;

      // v4.1.55: 记录收到的所有事件（用于调试）
      if (import.meta.env.DEV) {
        logger.debug(LogTags.APP, '收到事件', {
          event: payload.event,
          payloadId: payload.id,
          validMessageIds: Array.from(validMessageIds),
          isValid: validMessageIds.has(payload.id),
        });
      }

      // v4.1.53: 过滤：只处理属于当前对话的消息（通过 messageId 匹配）
      // 支持多个 messageId（工具续传时会创建新的 messageId）
      // 修复：多个对话同时进行时，消息会串到错误的对话中
      if (!shouldProcessEvent(validMessageIds, payload.id)) {
        if (import.meta.env.DEV) {
          logger.warn(LogTags.APP, '事件被过滤：messageId 不匹配', {
            event: payload.event,
            payloadId: payload.id,
            validMessageIds: Array.from(validMessageIds),
          });
        }
        return;
      }

      if (payload.event === 'done') {
        // 立即刷新剩余内容 (v4.2.2: 改为 clearTimeout)
        const timerId = rafIdRef.current.get(chatId);
        if (timerId) {
          clearTimeout(timerId);
        }
        flushPendingUpdates();

        // v3.1.1: 更新消息的 tokens 字段
        if (payload.usage) {
          const totalTokens = calculateTotalTokens(payload.usage);

          if (!shouldSkipTokenUpdate(totalTokens)) {
            setChats((prev) =>
              prev.map((chat) => {
                if (chat.id !== chatId) return chat;
                const messages = [...chat.messages];
                // 找到最后一条 assistant 消息并更新 tokens
                for (let i = messages.length - 1; i >= 0; i--) {
                  if (messages[i].role === 'assistant') {
                    messages[i] = { ...messages[i], tokens: totalTokens };
                    break;
                  }
                }
                return { ...chat, messages };
              })
            );

            if (import.meta.env.DEV) {
              logger.debug(LogTags.APP, 'Token 统计已更新', {
                chatId,
                totalTokens,
                promptTokens: payload.usage.prompt_tokens,
                completionTokens: payload.usage.completion_tokens
              });
            }
          }
        }

        // v4.1.25: done 事件处理
        // 等待 tool_calls 异步处理完成（如果正在执行中），然后 resolve donePromise
        if (toolCallsPromise) {
          await toolCallsPromise;
          toolCallsPromise = null;
        }
        if (!pendingToolContinueRef.current.has(chatId)) {
          toolCallRoundRef.current = 0;
        }
        // 通知 while 循环：本轮 done 已处理完毕
        if (donePromiseResolve) {
          donePromiseResolve();
          donePromiseResolve = null;
        }
        return;
      }
      if (payload.event === 'error') {
        logger.error(LogTags.APP, '流式输出错误', { error: payload.error });
        streamErrorReported = true;

        // v4.1.44: 显示错误消息给用户
        const messageId = payload.id;
        setChats(prev => prev.map(chat => {
          if (chat.id !== chatId) return chat;

          const messages = [...chat.messages];
          const msgIndex = messages.findIndex(m => m.id === messageId);

          if (msgIndex === -1) {
            // 消息还没创建，创建一个错误消息
            messages.push({
              id: messageId,
              chatId,
              role: 'assistant',
              content: formatErrorMessage(payload.error || '未知错误'),
              createdAt: new Date()
            });
          } else {
            // 更新现有消息显示错误
            messages[msgIndex] = {
              ...messages[msgIndex],
              content: formatErrorMessage(payload.error || '未知错误', messages[msgIndex].content)
            };
          }

          return { ...chat, messages };
        }));

        // 立即刷新剩余内容 (v4.2.2: 改为 clearTimeout)
        const timerId = rafIdRef.current.get(chatId);
        if (timerId) {
          clearTimeout(timerId);
        }
        flushPendingUpdates();
        // v4.1.25: 错误时也需要 resolve donePromise，避免 while 循环死等
        if (donePromiseResolve) {
          donePromiseResolve();
          donePromiseResolve = null;
        }
        return;
      }

      // v2.3.0: 处理工具调用请求（结构化持久化）
      if (payload.event === 'tool_calls' && payload.tool_calls && currentToolsMap) {
        if (import.meta.env.DEV) {
          logger.debug(LogTags.APP, '收到工具调用请求', { toolCalls: payload.tool_calls });
        }

        // 获取 Agent 限制配置
        const maxToolsPerCall = limits.maxToolsPerCall || 5;
        const toolCallTimeout = (limits.toolCallTimeout || 60) * 1000; // 转换为毫秒

        // 检查总执行时间限制
        const currentExecutionTime = Date.now() - executionStartTime;
        if (currentExecutionTime > maxExecutionTime) {
          logger.warn(LogTags.APP, `总执行时间超限：${Math.round(currentExecutionTime / 1000)}秒 > ${maxExecutionTime / 1000}秒`);

          // 显示错误消息给用户
          setChats(prev => prev.map(chat => {
            if (chat.id !== chatId) return chat;
            const errorMessage: Message = {
              id: crypto.randomUUID(),
              chatId,
              role: 'assistant',
              content: `⚠️ 工具调用已停止：总执行时间超过限制（${maxExecutionTime / 1000}秒）`,
              createdAt: new Date(),
            };
            return { ...chat, messages: [...chat.messages, errorMessage] };
          }));

          // 停止继续调用
          if (donePromiseResolve) {
            donePromiseResolve();
          }
          return;
        }

        // 检查总工具调用次数限制
        if (totalToolCallCount + payload.tool_calls.length > maxTotalToolCalls) {
          logger.warn(LogTags.APP, `总工具调用次数超限：${totalToolCallCount + payload.tool_calls.length} > ${maxTotalToolCalls}`);

          // 显示错误消息给用户
          setChats(prev => prev.map(chat => {
            if (chat.id !== chatId) return chat;
            const errorMessage: Message = {
              id: crypto.randomUUID(),
              chatId,
              role: 'assistant',
              content: `⚠️ 工具调用已停止：累计调用次数超过限制（${maxTotalToolCalls}次）\n\n已执行 ${totalToolCallCount} 次工具调用。`,
              createdAt: new Date(),
            };
            return { ...chat, messages: [...chat.messages, errorMessage] };
          }));

          // 停止继续调用
          if (donePromiseResolve) {
            donePromiseResolve();
          }
          return;
        }

        // 检查单次调用工具数量限制
        if (payload.tool_calls.length > maxToolsPerCall) {
          logger.warn(LogTags.APP, `单次工具调用数量超限：${payload.tool_calls.length} > ${maxToolsPerCall}，将只执行前 ${maxToolsPerCall} 个`);
          payload.tool_calls = payload.tool_calls.slice(0, maxToolsPerCall);
        }

        // 累加工具调用次数
        totalToolCallCount += payload.tool_calls.length;

        // v4.1.25: 创建 Promise 让 done 事件和 while 循环等待工具执行完成
        toolCallsPromise = new Promise<void>((resolve) => {
          toolCallsPromiseResolve = resolve;
        });

        // 先刷新已有内容
        flushPendingUpdates();

        // 收集所有工具调用和结果
        const toolCalls: Array<{ id: string; name: string; arguments: string; serverId: string; serverName: string; thoughtSignature?: string }> = [];
        // v2.4.0: 添加 duration 字段
        const toolResults: Array<{ callId: string; content: string; isError: boolean; duration?: number }> = [];

        // v4.1.55: 记录工具调用循环开始
        if (import.meta.env.DEV) {
          logger.debug(LogTags.APP, '开始工具调用循环', {
            totalTools: payload.tool_calls.length,
            toolNames: payload.tool_calls.map(tc => tc.function.name),
            availableToolsCount: currentToolsMap.size,
          });
        }

        // 执行每个工具调用
        for (let i = 0; i < payload.tool_calls.length; i++) {
          const toolCall = payload.tool_calls[i];
          const fullName = toolCall.function.name;

          // v4.1.55: 记录当前处理的工具索引
          if (import.meta.env.DEV) {
            logger.debug(LogTags.APP, `处理工具 ${i + 1}/${payload.tool_calls.length}`, {
              fullName,
              callId: toolCall.id,
            });
          }

          const toolInfo = currentToolsMap.get(fullName);

          if (!toolInfo) {
            logger.error(LogTags.APP, '未找到工具', {
              fullName,
              callId: toolCall.id,
              index: i,
              availableTools: Array.from(currentToolsMap.keys()),
            });
            continue;
          }

          // v4.1.55: 记录工具调用开始，用于调试跨 MCP 工具调用问题
          if (import.meta.env.DEV) {
            logger.debug(LogTags.APP, '开始执行工具调用', {
              toolName: toolInfo.name,
              serverId: toolInfo.serverId,
              serverName: toolInfo.serverName,
              callId: toolCall.id,
            });
          }

          // 记录工具调用
          toolCalls.push({
            id: toolCall.id,
            name: toolInfo.name,
            arguments: toolCall.function.arguments,
            serverId: toolInfo.serverId,
            serverName: toolInfo.serverName,
            // v4.1.36: 保留 Gemini 2.5 thinking 模型的 thought_signature
            ...(toolCall.thought_signature ? { thoughtSignature: toolCall.thought_signature } : {}),
          });

          try {
            // 解析工具参数
            const args = JSON.parse(toolCall.function.arguments || '{}');

            if (import.meta.env.DEV) {
              logger.debug(LogTags.APP, `执行工具: ${toolInfo.name} @ ${toolInfo.serverName}`, args);
            }

            // v4.1.31: 实时展示工具调用卡片（executing 状态）
            // 立即将当前已收集的 toolCalls 渲染为 ToolCallDisplay 组件
            // 比之前的纯文本 "⏳ 正在执行工具..." 更美观，展示调用参数
            const currentToolCallsSnapshot = [...toolCalls];
            const currentToolResultsSnapshot = [...toolResults];
            setChats((prev) =>
              prev.map((chat) => {
                if (chat.id !== chatId) return chat;
                // 查找或创建实时工具消息
                const existingIdx = chat.messages.findIndex((m) => m.id === `tool-live-${chatId}`);
                const liveMessage: Message = {
                  id: `tool-live-${chatId}`,
                  chatId,
                  role: 'assistant',
                  content: '',
                  createdAt: new Date(),
                  toolCalls: currentToolCallsSnapshot,
                  toolResults: currentToolResultsSnapshot,
                };
                if (existingIdx >= 0) {
                  const newMessages = [...chat.messages];
                  newMessages[existingIdx] = liveMessage;
                  return { ...chat, messages: newMessages };
                }
                return { ...chat, messages: [...chat.messages, liveMessage] };
              })
            );

            // v2.4.0: 记录开始时间
            const startTime = Date.now();

            // 调用 MCP 工具（带超时控制）
            const toolCallPromise = invoke<{
              content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
              isError?: boolean;
            }>('mcp_call_tool', {
              serverId: toolInfo.serverId,
              toolName: toolInfo.name,
              arguments: args,
            });

            // 超时控制
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error(`工具调用超时（${toolCallTimeout / 1000}秒）`)), toolCallTimeout);
            });

            const result = await Promise.race([toolCallPromise, timeoutPromise]);

            // v2.4.0: 计算执行耗时
            const duration = Date.now() - startTime;

            if (import.meta.env.DEV) {
              logger.debug(LogTags.APP, '工具执行完成', {
                toolName: toolInfo.name,
                serverId: toolInfo.serverId,
                callId: toolCall.id,
                duration: `${duration}ms`,
                isError: result.isError || false,
              });
            }

            // 提取工具结果（支持文本和图片）
            const toolResultParts: string[] = [];
            for (const c of result.content) {
              if (c.type === 'text' && c.text) {
                toolResultParts.push(c.text);
              } else if (c.type === 'image' && c.data && c.mimeType) {
                // 将图片转换为 Markdown 格式
                const imageUrl = `data:${c.mimeType};base64,${c.data}`;
                toolResultParts.push(`![工具返回的图片](${imageUrl})`);
              }
            }
            const toolResultText = toolResultParts.join('\n\n');

            // 记录工具结果 (v2.4.0: 添加 duration)
            toolResults.push({
              callId: toolCall.id,
              content: toolResultText,
              isError: result.isError || false,
              duration,
            });

            // v4.1.31: 实时更新工具消息，展示已完成的结果
            setChats((prev) =>
              prev.map((chat) => {
                if (chat.id !== chatId) return chat;
                const idx = chat.messages.findIndex((m) => m.id === `tool-live-${chatId}`);
                if (idx < 0) return chat;
                const newMessages = [...chat.messages];
                newMessages[idx] = {
                  ...newMessages[idx],
                  toolCalls: [...toolCalls],
                  toolResults: [...toolResults],
                };
                return { ...chat, messages: newMessages };
              })
            );

            // v2.2.0: 更新 MCP 服务器请求计数
            setMcpServers((prev) =>
              prev.map((s) =>
                s.id === toolInfo.serverId
                  ? { ...s, requestCount: s.requestCount + 1, lastActiveAt: new Date() }
                  : s
              )
            );
          } catch (error) {
            logger.error(LogTags.APP, '工具调用失败', {
              toolName: toolInfo.name,
              serverId: toolInfo.serverId,
              callId: toolCall.id,
              index: i,
              error,
            });

            // 记录错误结果
            toolResults.push({
              callId: toolCall.id,
              content: String(error),
              isError: true,
            });

            // v4.1.31: 实时更新工具消息，展示错误结果
            setChats((prev) =>
              prev.map((chat) => {
                if (chat.id !== chatId) return chat;
                const idx = chat.messages.findIndex((m) => m.id === `tool-live-${chatId}`);
                if (idx < 0) return chat;
                const newMessages = [...chat.messages];
                newMessages[idx] = {
                  ...newMessages[idx],
                  toolCalls: [...toolCalls],
                  toolResults: [...toolResults],
                };
                return { ...chat, messages: newMessages };
              })
            );
          }

          // v4.1.55: 记录每个工具处理完成
          if (import.meta.env.DEV) {
            logger.debug(LogTags.APP, `工具 ${i + 1}/${payload.tool_calls.length} 处理完成`, {
              toolName: toolInfo.name,
              serverId: toolInfo.serverId,
              callId: toolCall.id,
              hasResult: toolResults.some(r => r.callId === toolCall.id),
            });
          }
        }

        // v4.1.55: 记录工具调用循环完成
        if (import.meta.env.DEV) {
          logger.debug(LogTags.APP, '所有工具调用完成', {
            totalCalls: toolCalls.length,
            totalRequested: payload.tool_calls.length,
            successCount: toolResults.filter(r => !r.isError).length,
            errorCount: toolResults.filter(r => r.isError).length,
            skippedCount: payload.tool_calls.length - toolCalls.length,
          });
        }

        // v4.1.31: 将实时工具消息替换为持久化消息（更换 ID）
        // v4.1.55: 同步更新 chatsRef，确保工具续传时能读取到最新的 toolMessage
        if (toolCalls.length > 0) {
          setChats((prev) => {
            const updated = prev.map((chat) => {
              if (chat.id !== chatId) return chat;

              const toolMessage: Message = {
                id: crypto.randomUUID(),
                chatId,
                role: 'assistant',
                content: '',
                createdAt: new Date(),
                toolCalls: toolCalls.map((tc) => ({
                  id: tc.id,
                  name: tc.name,
                  arguments: tc.arguments,
                  serverId: tc.serverId,
                  serverName: tc.serverName,
                  // v4.1.37: 保留 thoughtSignature，多轮对话时 Gemini API 需要
                  ...(tc.thoughtSignature ? { thoughtSignature: tc.thoughtSignature } : {}),
                })),
                toolResults: toolResults.map((tr) => ({
                  callId: tr.callId,
                  content: tr.content,
                  isError: tr.isError,
                  duration: tr.duration,
                })),
              };

              // 替换实时消息为持久化消息
              const liveIdx = chat.messages.findIndex((m) => m.id === `tool-live-${chatId}`);
              if (liveIdx >= 0) {
                const newMessages = [...chat.messages];
                newMessages[liveIdx] = toolMessage;
                return { ...chat, messages: newMessages };
              }
              return {
                ...chat,
                messages: [...chat.messages, toolMessage],
              };
            });

            // 同步更新 chatsRef，确保工具续传时能立即读取到最新消息
            chatsRef.current = updated;
            return updated;
          });

          // v4.1.24: 工具调用循环 - 标记需要在 done 事件后继续对话
          toolCallRoundRef.current = (toolCallRoundRef.current || 0) + 1;
          const maxRounds = agent?.limits?.maxToolCalls || 20;

          if (toolCallRoundRef.current < maxRounds) {
            pendingToolContinueRef.current.set(chatId, { agent });
            if (import.meta.env.DEV) {
              logger.debug(LogTags.APP, '标记工具调用继续', {
                round: toolCallRoundRef.current,
                maxRounds,
              });
            }
          } else {
            logger.warn(LogTags.APP, '工具调用达到最大轮次限制', { maxRounds });
            toolCallRoundRef.current = 0;
          }
        }

        // v4.1.25: 工具执行完成，通知 done 事件和 while 循环
        if (toolCallsPromiseResolve) {
          toolCallsPromiseResolve();
          toolCallsPromiseResolve = null;
        }
        return;
      }

      // 累积内容到 ref
      const pending = pendingContentRef.current.get(chatId) || { messageId: payload.id, content: '', reasoning: '' };
      pending.messageId = payload.id;
      if (payload.event === 'chunk' && payload.content) {
        pending.content += payload.content;
      } else if (payload.event === 'reasoning_chunk' && payload.content) {
        pending.reasoning += payload.content;
      }
      pendingContentRef.current.set(chatId, pending);

      // v4.2.2: 调度定时器批量更新（16ms 间隔）
      scheduleUpdate();
    });

    // v2.5.2: 直接从模型配置中获取 API Key
    // v3.5.1: 如果模型标记使用提供商凭证，则从 providerCredentialsStorage 实时获取最新凭证
    let apiKey = selectedModel.apiKey || '';
    let accountId = selectedModel.accountId;
    let projectId = selectedModel.projectId;

    if (selectedModel.useProviderCredential) {
      try {
        const credential = await providerCredentialsStorage.get(selectedModel.provider);
        if (credential) {
          // v0.8.0: 使用辅助函数处理 Kiro 特殊格式
          apiKey = getApiKeyFromCredential(credential, selectedModel.provider);
          // 同步更新 accountId 和 projectId（可能在 OAuth 刷新后更新）
          accountId = credential.accountId || accountId;
          projectId = credential.projectId || projectId;
          if (import.meta.env.DEV) {
            logger.debug(LogTags.APP, '使用提供商凭证', {
              provider: selectedModel.provider,
              hasApiKey: !!credential.apiKey,
              hasAccessToken: !!credential.accessToken,
            });
          }
        }
      } catch (error) {
        logger.error(LogTags.APP, '获取提供商凭证失败', error);
      }
    }

    if (!apiKey) {
      throw new Error('API Key not found for this model');
    }

    // v2.3.0: 获取 Agent 配置的 MCP 工具
    let tools: APITool[] | undefined;
    if (agent && agent.enableToolUse) {
      const { tools: agentTools } = getAgentTools(agent);
      if (agentTools.length > 0) {
        tools = agentTools;
        if (import.meta.env.DEV) {
          logger.debug(LogTags.APP, 'Agent 工具调用已启用', { toolCount: agentTools.length });
        }
      }
    }

    // 必须在调用命令前赋值 ref，否则停止按钮无法获取句柄
    unlistenMapRef.current.set(chatId, unlisten);

    // v2.3.0: 构建请求参数（包含工具和系统提示词）
    // v3.3.5: 添加 account_id（用于 ChatGPT Codex API）
    // v3.4.3: 添加 project_id（用于 Google Cloud Code API）
    // v3.5.1: 使用实时获取的凭证信息（accountId, projectId）
    // v0.9.0: 添加 protocol（用于自定义提供商选择协议）
    const chatRequest: Record<string, unknown> = {
      provider: selectedModel.provider,
      api_key: apiKey,
      model_name: selectedModel.modelId || selectedModel.name,
      messages: apiMessages,
      endpoint: selectedModel.endpoint,
      message_id: messageId,  // 传递 messageId 用于区分不同对话的消息
      account_id: accountId,  // v3.5.1: 使用实时获取的 accountId
      project_id: projectId,  // v3.5.1: 使用实时获取的 projectId
      protocol: selectedModel.protocol || providers.find(p => p.id === selectedModel.provider)?.protocol || getDefaultProtocol(selectedModel.provider),  // v0.9.6: 使用三级回退逻辑（model→provider→default），修复自定义提供商协议未传递的 bug
    };

    // v2.0.0: 构建系统提示词（Agent 基础提示词 + 技能提示词模板）
    if (agent) {
      // 获取 Agent 绑定的已启用技能
      const agentSkills = skills.filter(
        (s) => agent.skills.includes(s.id) && s.enabled
      );

      // 使用 buildSystemPrompt 合并 Agent 系统提示词和技能提示词
      const systemPrompt = buildSystemPrompt(
        agent.systemPrompt || '',
        agentSkills
      );

      if (systemPrompt) {
        chatRequest.system_prompt = systemPrompt;
      }

      if (import.meta.env.DEV) {
        logger.debug(LogTags.APP, '系统提示词构建', {
          agentName: agent.name,
          basePromptLength: agent.systemPrompt?.length || 0,
          skillCount: agentSkills.length,
          skillNames: agentSkills.map((s) => s.name),
          finalPromptLength: systemPrompt.length,
        });
      }
    }

    // 如果有工具，添加到请求中
    if (tools && tools.length > 0) {
      chatRequest.tools = tools;
    }

    if (import.meta.env.DEV) {
      logger.debug(LogTags.APP, '发送消息请求', {
        provider: selectedModel.provider,
        model: selectedModel.modelId || selectedModel.name,
        messageCount: apiMessages.length,
        hasTools: !!tools,
        toolCount: tools?.length || 0,
        hasSystemPrompt: !!chatRequest.system_prompt,
        systemPromptLength: typeof chatRequest.system_prompt === 'string' ? chatRequest.system_prompt.length : 0,
      });
    }

    // 3. 调用流式命令（v4.1.25: 使用 while 循环支持多轮工具调用）
    // 每轮 invoke 完成后检查 pendingToolContinueRef，如果有待续传则构建新请求继续调用
    // 这样 listener 在整个循环期间保持活跃，避免 finally 提前清理的竞态条件
    await invoke('chat_stream_message', {
      request: chatRequest
    });

    // v4.1.25: 工具调用循环 - invoke 返回后等待 done 事件处理完成再检查
    // invoke 返回时 done 事件的 async handler 可能还在执行中（等待 tool_calls 完成）
    // 必须 await donePromise 确保 pendingToolContinueRef 已被正确设置
    if (donePromise) {
      await donePromise;
    }

    while (pendingToolContinueRef.current.has(chatId)) {
      const pendingContinue = pendingToolContinueRef.current.get(chatId);
      pendingToolContinueRef.current.delete(chatId);
      const continueAgent = pendingContinue?.agent;

      // 等待 React state 更新完成（setChats 是异步的）
      await new Promise(resolve => setTimeout(resolve, 100));

      const latestChat = chatsRef.current.find((c: Chat) => c.id === chatId);
      if (!latestChat) {
        logger.warn(LogTags.APP, '工具续传：找不到对话', { chatId });
        break;
      }

      // v4.1.27: 构建 API 消息（包含工具调用历史）
      // 不再添加额外的 user 消息，避免 Gemini 连续 user 角色冲突
      // functionResponse 后模型会自动继续，无需额外指令
      const continueMessages = buildApiMessages(
        latestChat.messages,
        '',
        [],
        DEFAULT_MAX_HISTORY_MESSAGES,
        true
      );

      // 获取模型配置
      // v0.9.2: 优先使用当前选中的模型，而不是对话历史中保存的模型
      // 这样可以确保用户切换模型后，工具调用续传也使用新模型
      const continueModel = models.find(m => m.id === modelId) || models.find(m => m.id === latestChat.model);
      if (!continueModel) {
        logger.warn(LogTags.APP, '工具续传：找不到模型配置', {
          currentModelId: modelId,
          chatModelId: latestChat.model
        });
        break;
      }

      // 记录使用的模型
      if (import.meta.env.DEV) {
        logger.debug(LogTags.APP, '工具续传使用模型', {
          modelId: continueModel.id,
          modelName: continueModel.name,
          isCurrentModel: continueModel.id === modelId,
        });
      }

      // 获取凭证
      let continueApiKey = continueModel.apiKey || '';
      let continueAccountId = continueModel.accountId;
      let continueProjectId = continueModel.projectId;

      if (continueModel.useProviderCredential) {
        try {
          const credential = await providerCredentialsStorage.get(continueModel.provider);
          if (credential) {
            continueApiKey = getApiKeyFromCredential(credential, continueModel.provider);
            continueAccountId = credential.accountId || continueAccountId;
            continueProjectId = credential.projectId || continueProjectId;
          }
        } catch (err) {
          logger.error(LogTags.APP, '工具续传：获取凭证失败', err);
          break;
        }
      }

      if (!continueApiKey) {
        logger.error(LogTags.APP, '工具续传：API Key 为空');
        break;
      }

      // 获取工具列表
      let continueTools: APITool[] | undefined;
      if (continueAgent && continueAgent.enableToolUse) {
        const { tools: agentTools } = getAgentTools(continueAgent);
        if (agentTools.length > 0) {
          continueTools = agentTools;
        }
      }

      // v4.1.53: 工具续传使用新的 messageId，避免内容累积到同一个消息
      // 每轮工具调用后的续传应该创建新的 assistant 消息
      const continueMessageId = crypto.randomUUID();

      // 将新的 messageId 添加到有效列表中
      validMessageIds.add(continueMessageId);

      if (import.meta.env.DEV) {
        logger.debug(LogTags.APP, '工具续传创建新消息', {
          round: toolCallRoundRef.current,
          newMessageId: continueMessageId,
        });
      }

      // 构建续传请求
      const continueRequest: Record<string, unknown> = {
        provider: continueModel.provider,
        api_key: continueApiKey,
        model_name: continueModel.modelId || continueModel.name,
        messages: continueMessages,
        endpoint: continueModel.endpoint,
        message_id: continueMessageId,  // 使用新的 messageId，每轮创建新消息
        account_id: continueAccountId,
        project_id: continueProjectId,
        protocol: continueModel.protocol || providers.find(p => p.id === continueModel.provider)?.protocol || getDefaultProtocol(continueModel.provider),  // v0.9.6: 使用三级回退逻辑，修复自定义提供商协议未传递的 bug
      };

      // 添加系统提示词
      if (continueAgent) {
        const agentSkills = skills.filter(
          (s) => continueAgent.skills.includes(s.id) && s.enabled
        );
        if (continueAgent.systemPrompt || agentSkills.length > 0) {
          continueRequest.system_prompt = buildSystemPrompt(continueAgent.systemPrompt, agentSkills);
        }
      }

      // v4.1.55: 工具续传时必须发送工具列表
      // Anthropic API 要求每次请求都包含 tools 参数，否则 AI 会认为没有工具可用
      if (continueTools && continueTools.length > 0) {
        continueRequest.tools = continueTools;
      }

      if (import.meta.env.DEV) {
        logger.debug(LogTags.APP, '工具结果回传，继续对话', {
          round: toolCallRoundRef.current,
          messageCount: continueMessages.length,
          continueMessageId,
        });
      }

      // 使用同一个 listener 继续接收事件
      // 创建新的 donePromise 用于等待本轮 done 事件
      createDonePromise();

      logger.info(LogTags.APP, `开始第 ${toolCallRoundRef.current} 轮工具续传请求`, {
        chatId,
        messageId: continueMessageId,
      });

      await invoke('chat_stream_message', { request: continueRequest });

      // 等待 done 事件处理完成（包括等待可能的 tool_calls 异步处理）
      if (donePromise) {
        await donePromise;
      }
    }

    // 所有轮次完成，重置计数器
    toolCallRoundRef.current = 0;




  } catch (error) {
    logger.error(LogTags.APP, '发送消息失败', error);

    if (streamErrorReported) {
      return;
    }

    let errorMessage = error instanceof Error ? error.message : String(error);

    // 优化错误提示：模型不支持多模态
    if (errorMessage.toLowerCase().includes('multi-modal') || errorMessage.toLowerCase().includes('multimodal')) {
      errorMessage = '当前模型不支持多模态（图片/文件）输入，请移除附件或切换支持多模态的模型（如 GPT-4o, Claude 3.5）。';

      // 自动恢复：清除导致错误的附件，避免下次重试时依然带上附件
      setChats(prev => prev.map(c => {
        if (c.id === chatId && c.messages.length > 0) {
          const messages = [...c.messages];
          // 找到最后一条 user 消息 (通常是造成错误的那条)
          let lastUserMsgIndex = -1;
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
              lastUserMsgIndex = i;
              break;
            }
          }
          if (lastUserMsgIndex !== -1) {
            // 清除附件，保留文本
            messages[lastUserMsgIndex] = {
              ...messages[lastUserMsgIndex],
              attachments: []
            };
            return { ...c, messages };
          }
        }
        return c;
      }));
    }

    setChats(prev => prev.map(c => {
      if (c.id === chatId) {
        const errMessage: Message = {
          id: crypto.randomUUID(),
          chatId,
          role: 'assistant',
          content: `⚠️ 请求失败: ${errorMessage}`,
          createdAt: new Date()
        };
        return { ...c, messages: [...c.messages, errMessage] };
      }
      return c;
    }));
  } finally {
    setGenerating(chatId, false);
    // 清理该对话的监听器
    const currentUnlisten = unlistenMapRef.current.get(chatId);
    if (currentUnlisten) {
      currentUnlisten();
      unlistenMapRef.current.delete(chatId);
    } else if (unlisten) {
      // 如果没有被管理（例如出错时），则手动清理
      unlisten();
    }
    // 清理定时器 (v4.2.2: 改为 clearTimeout)
    const timerId = rafIdRef.current.get(chatId);
    if (timerId) {
      clearTimeout(timerId);
      rafIdRef.current.delete(chatId);
    }
    pendingContentRef.current.delete(chatId);
  }
}, [chats, models, skills, setGenerating, getAgentTools, setAgents, setChats, setMcpServers, setProviders]);

// 停止生成（接收 chatId 参数）
const handleStopGenerating = useCallback((chatId: string) => {
  const unlisten = unlistenMapRef.current.get(chatId);
  if (unlisten) {
    unlisten();
    unlistenMapRef.current.delete(chatId);
  }
  // 清理定时器 (v4.2.2: 改为 clearTimeout)
  const timerId = rafIdRef.current.get(chatId);
  if (timerId) {
    clearTimeout(timerId);
    rafIdRef.current.delete(chatId);
  }
  pendingContentRef.current.delete(chatId);
  setGenerating(chatId, false);
}, [setGenerating]);

// Agent handlers
const handleCreateAgent = useCallback((data: AgentCreateInput) => {
  const agentId = Date.now().toString();
  setAgents(prev => createAgent(prev, data, agentId));
  // 埋点 - 创建 Agent
  trackEvents.agentCreated({ agentName: data.name });
}, [setAgents]);

const handleUpdateAgent = useCallback((id: string, data: AgentCreateInput) => {
  setAgents(prev => updateAgentState(prev, id, data));
}, [setAgents]);

/**
 * 删除 Agent (v2.2.0)
 * @param id - Agent ID
 */
const handleDeleteAgent = useCallback((id: string) => {
  // 埋点 - 删除 Agent（先获取名称）
  const agent = findAgent(agents, id);
  if (agent) {
    trackEvents.agentDeleted({ agentName: agent.name });
  }

  if (import.meta.env.DEV) {
    logger.debug(LogTags.APP, '删除 Agent', { id });
  }
  setAgents(prev => deleteAgent(prev, id));
}, [agents, setAgents]);

/**
 * 切换 Agent 状态 (v2.2.0)
 * @param id - Agent ID
 */
const handleToggleAgentStatus = useCallback((id: string) => {
  setAgents(prev => toggleAgentStatus(prev, id));
  if (import.meta.env.DEV) {
    logger.debug(LogTags.APP, '切换 Agent 状态', { id });
  }
}, [setAgents]);

/**
 * 运行 Agent (v2.3.0)
 * 1. 创建新对话
 * 2. 设置对话的 agentId
 * 3. 跳转到 chat 页面
 * 4. v2.8.0: 自动选中新创建的对话
 * @param id - Agent ID
 */
const handleRunAgent = useCallback((id: string) => {
  // 创建新对话并获取 ID
  const newChatId = Date.now().toString();
  const agent = agents.find(a => a.id === id);

  // 使用 Agent 配置的模型，如果没有则使用第一个可用模型
  const modelId = agent?.model || models[0]?.id || '';

  const newChat: Chat = {
    id: newChatId,
    title: agent ? `与 ${agent.name} 对话` : '新对话',
    createdAt: new Date(),
    updatedAt: new Date(),
    starred: false,
    model: modelId,
    messages: [],
    agentId: id,  // 设置 Agent ID
  };

  // 添加新对话到列表
  setChats((prev) => [newChat, ...prev]);

  // v2.8.0: 将新对话 ID 保存到 localStorage，确保 ChatPage 自动选中
  localStorage.setItem('chat_selected_id', newChatId);

  // 跳转到 chat 页面
  setCurrentPage('chat');

  if (import.meta.env.DEV) {
    logger.debug(LogTags.APP, '运行 Agent', { agentName: agent?.name, chatId: newChatId });
  }
}, [agents, models, setChats]);

// Skill handlers
const handleToggleSkill = useCallback((id: string, enabled: boolean) => {
  setSkills(prev => toggleSkill(prev, id, enabled));
}, [setSkills]);

/**
 * 更新技能配置 (v2.0.0)
 * 仅支持自定义技能，内置技能不可编辑
 */
const handleUpdateSkill = useCallback((id: string, data: SkillCreateInput) => {
  setSkills(prev => updateSkill(prev, id, data));
}, [setSkills]);

/**
 * 添加自定义技能 (v2.0.0, v3.0.15 更新)
 * v3.0.15: 支持 files 字段
 */
const handleAddSkill = useCallback((data: SkillCreateInput) => {
  const skillId = Date.now().toString();
  setSkills(prev => addSkill(prev, data, skillId));

  // 埋点 - 创建技能
  trackEvents.skillCreated({ skillName: data.name, isBuiltIn: false });

  if (import.meta.env.DEV) {
    logger.debug(LogTags.APP, '添加自定义技能', { name: data.name, filesCount: data.files?.length ?? 0 });
  }
}, [setSkills]);

/**
 * 删除自定义技能 (v2.1.0)
 * 仅允许删除自定义技能，内置技能不可删除
 */
const handleDeleteSkill = useCallback((id: string) => {
  const skillToDelete = findSkill(skills, id);
  // 安全检查：不允许删除内置技能
  if (skillToDelete?.builtIn) {
    logger.warn(LogTags.APP, '尝试删除内置技能，操作被拒绝', { name: skillToDelete.name });
    return;
  }
  // 埋点 - 删除技能
  if (skillToDelete) {
    const skillName = typeof skillToDelete.name === 'string'
      ? skillToDelete.name
      : skillToDelete.name.zh || skillToDelete.name.en;
    trackEvents.skillDeleted({ skillName });
  }
  if (import.meta.env.DEV && skillToDelete) {
    logger.debug(LogTags.APP, '删除自定义技能', { name: skillToDelete.name });
  }
  setSkills(prev => deleteSkill(prev, id));
}, [skills, setSkills]);

/**
 * 批量安装技能 (v3.0.0, v3.0.15 更新)
 * 从 URL 或文件导入多个技能
 * v3.0.15: 支持 files 字段
 */
const handleInstallSkills = useCallback((skillDataList: SkillCreateInput[]) => {
  // 调试日志 - 检查输入数据
  logger.info(LogTags.APP, `handleInstallSkills 收到 ${skillDataList.length} 个技能`,
    skillDataList.map(d => ({
      name: d.name,
      filesCount: d.files?.length ?? 0,
      filesPaths: d.files?.map(f => f.path),
    }))
  );

  const baseId = Date.now();
  setSkills(prev => {
    const updated = installSkills(prev, skillDataList, baseId);
    // 调试日志 - 检查更新后的 skills 列表
    logger.info(LogTags.APP, 'skills 列表更新', { before: prev.length, added: skillDataList.length, after: updated.length });
    return updated;
  });

  // 埋点 - 批量安装技能
  skillDataList.forEach(data => {
    const skillName = typeof data.name === 'string'
      ? data.name
      : (data.name as { zh: string; en: string }).zh || (data.name as { zh: string; en: string }).en;
    trackEvents.skillInstalled({ skillName, source: data.source?.repoUrl || data.source?.type || 'local' });
  });

  if (import.meta.env.DEV) {
    logger.debug(LogTags.APP, '批量安装完成', { skills: skillDataList.map(s => `${s.name}${s.files ? ` (${s.files.length}文件)` : ' (无文件)'}`) });
  }
}, [setSkills]);

// MCP handlers
const handleAddMCPServer = useCallback((data: MCPServerCreateInput) => {
  const newServer: MCPServer = {
    id: Date.now().toString(),
    ...data,
    // 确保 enabled/autoStart 有默认值 (v2.2.0)
    enabled: data.enabled ?? true,
    autoStart: data.autoStart ?? false,
    status: 'disconnected',
    capabilities: {},  // v2.0.0: 使用空对象，连接后由服务器返回
    requestCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  setMcpServers((prev) => [...prev, newServer]);

  // v2.6.0: 埋点 - 添加 MCP 服务器
  trackEvents.mcpServerAdded({ serverName: data.name, transportType: data.transportType });
}, [setMcpServers]);

/**
 * 更新 MCP 服务器配置 (v2.3.0)
 *
 * 修复：如果服务器已连接，先断开后端连接再更新配置
 * 这样可以避免 UI 状态与后端实际连接状态不一致
 *
 * @param id - 服务器 ID
 * @param data - 更新的配置数据
 */
const handleUpdateMCPServer = useCallback(async (id: string, data: MCPServerCreateInput) => {
  const server = mcpServers.find(s => s.id === id);
  const wasConnected = server?.status === 'connected' || server?.status === 'connecting';

  // v2.3.0: 如果服务器已连接，先断开后端连接
  if (wasConnected) {
    if (import.meta.env.DEV) {
      logger.debug(LogTags.MCP, '配置修改，先断开已连接的服务器', { name: server?.name });
    }

    try {
      await invoke<boolean>('mcp_disconnect', { serverId: id });
    } catch (e) {
      // 忽略断开错误（可能已经断开）
      if (import.meta.env.DEV) {
        logger.debug(LogTags.MCP, '断开时出错（忽略）', { error: e });
      }
    }
  }

  // 更新服务器配置
  setMcpServers((prev) =>
    prev.map((s) =>
      s.id === id ? {
        ...s,
        ...data,
        // 确保 enabled/autoStart 正确更新 (v2.2.0)
        enabled: data.enabled ?? s.enabled ?? true,
        autoStart: data.autoStart ?? s.autoStart ?? false,
        // v2.3.0: 配置修改后重置状态为断开（与后端保持同步）
        status: wasConnected ? 'disconnected' as const : s.status,
        // 清除运行时字段
        serverInfo: wasConnected ? undefined : s.serverInfo,
        tools: wasConnected ? undefined : s.tools,
        errorMessage: undefined,
        updatedAt: new Date()
      } : s
    )
  );

  if (import.meta.env.DEV && wasConnected) {
    logger.debug(LogTags.MCP, '配置已更新，服务器已断开。如需重新连接请点击"连接"按钮');
  }
}, [mcpServers, setMcpServers]);

const handleDeleteMCPServer = useCallback((id: string) => {
  // v2.6.0: 埋点 - 删除 MCP 服务器（先获取名称）
  const server = mcpServers.find(s => s.id === id);
  if (server) {
    trackEvents.mcpServerDeleted({ serverName: server.name });
  }

  setMcpServers((prev) => prev.filter((server) => server.id !== id));
}, [mcpServers, setMcpServers]);

/**
 * 连接到 MCP 服务器 (v2.0.0)
 *
 * 通过后端 Tauri 命令执行真实 MCP 协议连接
 */
const handleConnectMCP = useCallback(async (id: string) => {
  // 1. 查找服务器
  const server = findMCPServer(mcpServers, id);
  if (!server) {
    logger.warn(LogTags.MCP, '服务器不存在', { id });
    return;
  }

  // 2. 设置加载中状态
  setLoadingMCPIds(prev => new Set(prev).add(id));
  setMcpServers(prev => updateMCPServerStatus(prev, id, 'connecting'));

  if (import.meta.env.DEV) {
    logger.debug(LogTags.MCP, '开始连接', { name: server.name, transportType: server.transportType });
  }

  try {
    // 3. 调用连接处理
    const result = await handleMCPConnect(server);

    if (result.success) {
      // 4a. 连接成功
      trackEvents.mcpServerConnected({ serverName: server.name, toolCount: result.tools?.length || 0 });

      setMcpServers(prev => updateMCPServerConnected(prev, id, result));

      if (import.meta.env.DEV) {
        logger.debug(LogTags.MCP, '连接成功', { serverName: result.serverInfo?.name, version: result.serverInfo?.version });
        logger.debug(LogTags.MCP, '工具数量', { count: result.tools?.length || 0 });
      }
    } else {
      // 4b. 连接失败
      setMcpServers(prev => updateMCPServerError(prev, id, result.errorMessage || '连接失败'));
      logger.error(LogTags.MCP, '连接失败', { error: result.errorMessage });
    }
  } catch (error) {
    // 5. 异常处理
    const errorMessage = String(error);
    setMcpServers(prev => updateMCPServerError(prev, id, errorMessage));
    logger.error(LogTags.MCP, '连接异常', { error: errorMessage });
  } finally {
    // 6. 清除加载中状态
    setLoadingMCPIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }
}, [mcpServers, setMcpServers]);

/**
 * 断开 MCP 服务器连接 (v2.0.0)
 */
const handleDisconnectMCP = useCallback(async (id: string) => {
  const server = findMCPServer(mcpServers, id);
  if (!server) {
    logger.warn(LogTags.MCP, '服务器不存在', { id });
    return;
  }

  setLoadingMCPIds(prev => new Set(prev).add(id));

  if (import.meta.env.DEV) {
    logger.debug(LogTags.MCP, '断开连接', { name: server.name });
  }

  try {
    await handleMCPDisconnect(id, server.name);

    // 更新状态
    setMcpServers(prev => updateMCPServerDisconnected(prev, id));

    if (import.meta.env.DEV) {
      logger.debug(LogTags.MCP, '断开成功', { name: server.name });
    }
  } catch (error) {
    logger.error(LogTags.MCP, '断开失败', error);
    // 即使断开失败也标记为断开状态
    setMcpServers(prev => updateMCPServerDisconnected(prev, id));
  } finally {
    setLoadingMCPIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }
}, [mcpServers, setMcpServers]);

/**
 * 重连 MCP 服务器 (v2.2.0)
 *
 * 先断开连接，然后重新连接
 */
const handleReconnectMCP = useCallback(async (id: string) => {
  const server = mcpServers.find(s => s.id === id);
  if (!server) {
    logger.warn(LogTags.MCP, '服务器不存在', { id });
    return;
  }

  if (import.meta.env.DEV) {
    logger.debug(LogTags.MCP, '开始重连', { name: server.name });
  }

  // 1. 先断开
  setLoadingMCPIds(prev => new Set(prev).add(id));

  try {
    // 尝试断开（可能已经断开了，忽略错误）
    try {
      await invoke<boolean>('mcp_disconnect', { serverId: id });
    } catch (e) {
      // 忽略断开错误
      if (import.meta.env.DEV) {
        logger.debug(LogTags.MCP, '断开时出错（忽略）', { error: e });
      }
    }

    // 2. 重新连接
    setMcpServers(prev => prev.map(s =>
      s.id === id ? { ...s, status: 'connecting' as const } : s
    ));

    const result = await invoke<{
      success: boolean;
      server_name?: string;
      server_version?: string;
      error?: string;
    }>('mcp_connect', {
      request: {
        server_id: id,
        transport_type: server.transportType,
        command: server.command,
        args: server.args,
        env: server.env,
        endpoint: server.endpoint,
      }
    });

    if (result.success) {
      // 获取工具列表
      let tools: MCPTool[] = [];
      try {
        tools = await invoke<MCPTool[]>('mcp_list_tools', { serverId: id });
      } catch (e) {
        logger.warn(LogTags.MCP, '重连 - 获取工具列表失败', e);
      }

      // 更新服务器状态
      setMcpServers(prev => prev.map(s =>
        s.id === id
          ? {
            ...s,
            status: 'connected' as const,
            lastActiveAt: new Date(),
            errorMessage: undefined,
            serverInfo: result.server_name && result.server_version ? {
              name: result.server_name,
              version: result.server_version,
            } : undefined,
            tools,
          }
          : s
      ));

      if (import.meta.env.DEV) {
        logger.debug(LogTags.MCP, '重连成功', { name: server.name });
      }
    } else {
      setMcpServers(prev => prev.map(s =>
        s.id === id
          ? { ...s, status: 'error' as const, errorMessage: result.error || '重连失败' }
          : s
      ));
      logger.error(LogTags.MCP, '重连失败', { error: result.error });
    }
  } catch (error) {
    setMcpServers(prev => prev.map(s =>
      s.id === id
        ? { ...s, status: 'error' as const, errorMessage: String(error) }
        : s
    ));
    logger.error(LogTags.MCP, '重连异常', error);
  } finally {
    setLoadingMCPIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }
}, [mcpServers, setMcpServers]);

// ==================== Provider handlers (v3.1.0) ====================

/**
 * 从 ProviderCredential 获取 API Key
 *
 * v0.8.0: 特殊处理 Kiro 提供商，将 accessToken 和 profileArn 组合
 * v0.9.0: 添加 authMethod 支持 IDC/Builder ID 区分
 * 格式: accessToken|profileArn|authMethod（后端会解析这个格式）
 *
 * @param credential - 提供商凭证
 * @param provider - 提供商 ID
 * @returns API Key 字符串
 */
const getApiKeyFromCredential = (credential: ProviderCredential, provider: string): string => {
  // Kiro 特殊处理：组合 accessToken、profileArn、authMethod 和 ssoRegion
  if (provider.toLowerCase() === 'kiro') {
    const accessToken = credential.accessToken || '';
    const profileArn = credential.profileArn || '';
    const authMethod = credential.authMethod || 'aws';  // 默认 aws (Builder ID)
    const ssoRegion = credential.kiroSsoRegion || '';  // v4.1.31: IDC 用户的 SSO 区域
    if (accessToken) {
      // v4.1.31: 格式: accessToken|profileArn|authMethod|ssoRegion（后端会解析）
      // ssoRegion 用于 IDC 用户确定正确的 API 端点区域
      return `${accessToken}|${profileArn}|${authMethod}|${ssoRegion}`;
    }
  }

  // 其他提供商：优先使用 API Key，其次使用 OAuth Token
  return credential.apiKey || credential.accessToken || '';
};

/**
 * OAuth 认证结果类型（与 ProviderPage 中的定义保持一致）
 * v3.4.11: 新增，用于支持 token 自动续期
 * v0.7.3: 添加 profileArn 支持 Kiro 模型列表和配额查询
 * v0.9.0: 添加 authMethod 支持 Kiro IDC/Builder ID 区分
 * v0.9.1: 添加 Kiro 客户端注册信息用于持久化（修复重启后登录状态丢失）
 */
/**
 * 连接 Provider
 *
 * @param providerId - 提供商 ID
 * @param authMethod - 认证方法索引
 * @param apiKey - API Key（如果是 API 认证）
 * @param oauthResult - OAuth 认证结果（如果是 OAuth 认证）(v3.4.11)
 * @returns 是否连接成功
 */
// v0.9.3: 重新加载自定义提供商
const handleReloadCustomProviders = useCallback(async () => {
  try {
    const { customProviderStorage } = await import('./services/customProviderStorage');
    const customProviders = await customProviderStorage.load();

    if (import.meta.env.DEV) {
      logger.debug(LogTags.APP, '重新加载自定义提供商', { count: customProviders.length });
    }

    // 加载凭证以恢复连接状态
    const credentials = await loadProviderCredentialsSafe({
      context: '重新加载自定义提供商时读取凭证失败',
    });

    // 将自定义提供商转换为 AIProvider 格式
    const customAIProviders: AIProvider[] = customProviders.map(cp => {
      const credential = credentials.find(c => c.providerId === cp.id);
      return {
        id: cp.id,
        name: cp.name,
        icon: cp.icon,
        description: cp.description,
        defaultEndpoint: cp.endpoint,
        authMethods: cp.authMethods,
        models: [], // v4.2.7: 自定义提供商不再包含模型列表，模型在 Models 页面配置
        status: credential ? 'connected' as const : 'disconnected' as const,
        source: credential ? (credential.type === 'oauth' ? 'oauth' as const : 'api' as const) : undefined,
        protocol: cp.protocol || getDefaultProtocol(cp.id), // v0.9.4: 使用提供商的默认协议
        isCustom: true,
        category: 'other' as const,
      };
    });

    // 合并内置提供商和自定义提供商
    // 保留内置提供商的连接状态，移除旧的自定义提供商，添加新的自定义提供商
    setProviders(prev => {
      const builtinProviders = prev.filter(p => !p.isCustom && !p.id.startsWith('custom-'));
      return [...builtinProviders, ...customAIProviders];
    });
  } catch (error) {
    logger.error(LogTags.APP, '重新加载自定义提供商失败', error);
  }
}, [setProviders]);

const handleConnectProvider = useCallback(async (
  providerId: string,
  authMethod: number,
  apiKey?: string,
  oauthResult?: OAuthResult
): Promise<boolean> => {
  const provider = findProvider(providers, providerId);
  if (!provider) {
    logger.warn(LogTags.APP, 'Provider 不存在', { providerId });
    return false;
  }

  const method = provider.authMethods[authMethod];
  if (!method) {
    logger.warn(LogTags.APP, '认证方法不存在', { providerId, authMethod });
    return false;
  }

  if (import.meta.env.DEV) {
    logger.debug(LogTags.APP, '连接 Provider', { name: provider.name, method: method.type, hasOAuthResult: !!oauthResult });
  }

  try {
    let result;

    // 根据认证类型调用对应的处理函数
    if (method.type === 'api' && apiKey) {
      result = await handleApiKeyConnect({ providerId, apiKey, provider });
    } else if (method.type === 'oauth' && oauthResult) {
      result = await handleOAuthConnect({ providerId, oauthResult, provider });
    } else if (method.type === 'env') {
      result = await handleEnvConnect({ providerId });
    } else if (method.type === 'none') {
      result = await handleNoneConnect({ providerId });
    } else {
      logger.warn(LogTags.APP, '不支持的认证类型或缺少必要参数', { type: method.type });
      return false;
    }

    // 更新 Provider 状态
    if (result.status === 'connected') {
      setProviders(prev => updateProviderConnection(prev, providerId, result));

      // 调试日志：验证 Anthropic 模型更新
      if (providerId === 'anthropic' && result.models) {
        logger.debug(LogTags.APP, translate('logs.provider.connected', t, { provider: 'Anthropic' }), {
          modelCount: result.models.length,
          modelIds: result.models.map(m => m.id),
          has4_6: result.models.some(m => m.id.includes('4-6')),
          firstModel: result.models[0],
        });
      }

      // 埋点 - 连接提供商
      trackEvents.providerConnected({ providerId, authType: method.type });

      if (import.meta.env.DEV) {
        logger.debug(LogTags.APP, 'Provider 连接成功', { name: provider.name, source: result.source });
      }
      return true;
    } else {
      // 连接失败
      setProviders(prev => updateProviderConnection(prev, providerId, result));
      logger.error(LogTags.APP, 'Provider 连接失败', { name: provider.name, error: result.errorMessage });
      return false;
    }
  } catch (error) {
    logger.error(LogTags.APP, 'Provider 连接异常', { name: provider.name, error });
    setProviders(prev => updateProviderConnection(prev, providerId, {
      status: 'error',
      errorMessage: String(error),
    }));
    return false;
  }
}, [providers, setProviders, t]);

/**
 * 断开 Provider 连接
 *
 * @param providerId - 提供商 ID
 */
const handleDisconnectProvider = useCallback(async (providerId: string): Promise<void> => {
  const provider = findProvider(providers, providerId);
  if (!provider) {
    logger.warn(LogTags.APP, 'Provider 不存在', { providerId });
    return;
  }

  if (import.meta.env.DEV) {
    logger.debug(LogTags.APP, '断开 Provider', { name: provider.name });
  }

  try {
    // v0.9.3.1: 不删除凭证，只更新状态
    // 这样重新连接时不需要再次输入 API Key
    // await providerCredentialsStorage.remove(providerId);

    // 埋点 - 断开提供商
    trackEvents.providerDisconnected({ providerId });

    // 更新 Provider 状态
    setProviders(prev => updateProviderDisconnection(prev, providerId));

    if (import.meta.env.DEV) {
      logger.debug(LogTags.APP, 'Provider 已断开', { name: provider.name });
    }
  } catch (error) {
    logger.error(LogTags.APP, '断开 Provider 失败', { name: provider.name, error });
  }
}, [providers, setProviders]);

/**
 * 测试 Provider 连接
 *
 * @param providerId - 提供商 ID
 * @param apiKey - API Key
 * @returns 是否测试成功
 */
const handleTestProviderConnection = useCallback(async (
  providerId: string,
  apiKey: string
): Promise<boolean> => {
  const provider = providers.find(p => p.id === providerId);
  if (!provider) {
    logger.warn(LogTags.APP, 'Provider 不存在', { providerId });
    return false;
  }

  if (import.meta.env.DEV) {
    logger.debug(LogTags.APP, '测试 Provider 连接', { name: provider.name });
  }

  try {
    // 使用现有的 test_model 命令测试连接
    // v4.1.46: 添加 protocol 字段（Provider 没有 protocol，使用 id 作为默认值）
    const response = await invoke<{
      success: boolean;
      message: string;
      status_code?: number;
    }>('test_model', {
      request: {
        provider: provider.id,
        api_key: apiKey,
        endpoint: provider.defaultEndpoint || null,
        model_name: null, // v4.2.7: 自定义提供商不再有模型列表，使用 null
        protocol: provider.protocol || null,  // v4.2.7: 使用提供商的协议配置
      }
    });

    if (import.meta.env.DEV) {
      logger.debug(LogTags.APP, 'Provider 测试结果', {
        name: provider.name,
        success: response.success,
        message: response.message
      });
    }

    return response.success;
  } catch (error) {
    logger.error(LogTags.APP, 'Provider 测试失败', { name: provider.name, error });
    return false;
  }
}, [providers]);

// Model handlers
// v2.5.2: API Key 直接存储在模型配置中
// v2.5.3: 配置后自动测试的辅助函数
// v3.3.5: 支持 accountId（用于 ChatGPT Codex API）
// v3.4.3: 支持 projectId（用于 Google Cloud Code API）
// v3.5.0: 支持 useProviderCredential（区分提供商凭证和独立 API Key）
const autoTestModelRef = useRef<string | null>(null);

const handleAddModel = useCallback((data: ModelCreateInput) => {
  const modelId = Date.now().toString();
  setModels(prev => addModel(prev, data, modelId));

  // 埋点 - 添加模型
  trackEvents.modelAdded({ providerId: data.provider, modelName: data.name });

  // 配置后自动测试
  autoTestModelRef.current = modelId;
}, [setModels]);


// v2.5.2: API Key 直接存储在模型配置中
// v2.5.3: 更新后自动测试
// v3.3.5: 支持 accountId
// v3.4.3: 支持 projectId
// v3.5.0: 支持 useProviderCredential
// v4.1.46: 支持 protocol
const handleUpdateModel = useCallback((id: string, data: ModelCreateInput) => {
  setModels(prev => updateModel(prev, id, data));
  // 配置后自动测试
  autoTestModelRef.current = id;
}, [setModels]);

// v2.5.2: API Key 随模型一起删除，不需要单独清理
const handleDeleteModel = useCallback((id: string) => {
  // 埋点 - 删除模型（先获取信息）
  const model = findModel(models, id);
  if (model) {
    trackEvents.modelDeleted({ providerId: model.provider, modelName: model.name });
  }
  setModels(prev => deleteModel(prev, id));
}, [models, setModels]);


// v2.5.3: 使用 Toast 显示测试结果（右上角临时弹框）
// v3.5.1: 支持从提供商凭证实时获取 API Key
const handleTestModel = useCallback(async (id: string) => {
  const model = models.find(m => m.id === id);
  if (!model) return;

  // Dev 模式下输出开始测试日志
  if (import.meta.env.DEV) {
    logger.debug(LogTags.MODEL, `开始测试: ${model.name}`, {
      modelId: id,
      provider: model.provider,
      endpoint: model.endpoint || '(默认)',
      useProviderCredential: model.useProviderCredential,
    });
  }

  // v3.5.1: 如果模型标记使用提供商凭证，则从 providerCredentialsStorage 实时获取
  let apiKey = model.apiKey;

  if (model.useProviderCredential) {
    try {
      const credential = await providerCredentialsStorage.get(model.provider);
      if (credential) {
        // v0.8.0: 使用辅助函数处理 Kiro 特殊格式
        apiKey = getApiKeyFromCredential(credential, model.provider);
        if (import.meta.env.DEV) {
          logger.debug(LogTags.MODEL, '使用提供商凭证进行测试', {
            provider: model.provider,
            hasApiKey: !!credential.apiKey,
            hasAccessToken: !!credential.accessToken,
          });
        }
      }
    } catch (error) {
      logger.error(LogTags.MODEL, '获取提供商凭证失败', error);
    }
  }

  if (!apiKey) {
    if (import.meta.env.DEV) {
      logger.warn(LogTags.MODEL, 'API Key 未设置');
    }
    // v2.5.3: 使用 Toast 显示
    addToast({
      type: 'error',
      title: `${model.name} 测试失败`,
      message: 'API Key 未设置',
      details: model.useProviderCredential
        ? '请先在「提供商管理」中连接该提供商'
        : '请在模型配置中设置 API Key 后再进行测试',
      duration: 8000,
    });
    // 更新模型状态为 error
    setModels(prev => updateModelStatus(prev, id, 'error'));
    return;
  }

  try {
    // 准备请求参数
    // v2.5.2: 使用 modelId（实际模型 ID）而不是 name（显示名称）
    // v4.1.46: 添加 protocol 字段，用于自定义供应商选择正确的协议
    const request = {
      provider: model.provider,
      api_key: apiKey,
      endpoint: model.endpoint || null,
      model_name: model.modelId || model.name || null,
      protocol: model.protocol || null,
    };

    if (import.meta.env.DEV) {
      logger.debug(LogTags.MODEL, '请求参数', {
        ...request,
        api_key: request.api_key ? `${request.api_key.slice(0, 8)}***` : null
      });
    }

    // 调用 Tauri 后端测试命令
    const response = await invoke<{
      success: boolean;
      message: string;
      status_code?: number;
      details?: string;
    }>('test_model', { request });

    // Dev 模式下输出响应详情
    if (import.meta.env.DEV) {
      logger.debug(LogTags.MODEL, '测试响应', {
        success: response.success,
        status_code: response.status_code,
        message: response.message,
        details: response.details
      });
    }

    // v2.5.3: 使用 Toast 显示测试结果
    addToast({
      type: response.success ? 'success' : 'error',
      title: `${model.name} ${response.success ? '测试成功' : '测试失败'}`,
      message: response.message,
      statusCode: response.status_code,
      details: response.details,
      duration: response.success ? 5000 : 10000,
    });

    // 根据测试结果更新模型状态
    setModels(prev => updateModelStatus(prev, id, response.success ? 'online' : 'error'));
  } catch (error) {
    if (import.meta.env.DEV) {
      logger.error(LogTags.MODEL, '测试错误', error);
    }

    // v2.5.3: 使用 Toast 显示错误
    addToast({
      type: 'error',
      title: `${model.name} 测试失败`,
      message: '测试请求失败',
      details: error instanceof Error ? error.message : '未知错误',
      duration: 10000,
    });

    // 更新模型状态为 error
    setModels(prev => updateModelStatus(prev, id, 'error'));
  }
}, [models, addToast, setModels]);

/**
 * v3.6.0: 批量测试所有模型的可用性
 * - 遍历所有已配置 API Key 的模型
 * - 并发控制：同时最多测试 3 个模型
 * - 测试完成后显示结果摘要
 * v3.5.1: 支持从提供商凭证实时获取 API Key
 */
const handleBatchTestModels = useCallback(async () => {
  // v3.5.1: 筛选出已配置 API Key 或使用提供商凭证的模型
  const modelsToTest = models.filter(m => m.apiKeySet || m.useProviderCredential);

  if (modelsToTest.length === 0) {
    addToast({
      type: 'warning',
      title: '批量检查',
      message: '没有可检查的模型',
      details: '请先添加并配置模型的 API Key 或连接提供商',
      duration: 5000,
    });
    return;
  }

  // 显示开始检查的提示
  addToast({
    type: 'info',
    title: '批量检查',
    message: `正在检查 ${modelsToTest.length} 个模型的可用性...`,
    duration: 3000,
  });

  // 并发控制：最多同时测试 3 个模型
  const CONCURRENCY_LIMIT = 3;
  let successCount = 0;
  let failedCount = 0;

  // 分批处理
  for (let i = 0; i < modelsToTest.length; i += CONCURRENCY_LIMIT) {
    const batch = modelsToTest.slice(i, i + CONCURRENCY_LIMIT);

    // 并发测试当前批次的模型
    const results = await Promise.allSettled(
      batch.map(async (model) => {
        // v3.5.1: 如果模型标记使用提供商凭证，则从 providerCredentialsStorage 实时获取
        let apiKey = model.apiKey;

        if (model.useProviderCredential) {
          try {
            const credential = await providerCredentialsStorage.get(model.provider);
            if (credential) {
              // v0.8.0: 使用辅助函数处理 Kiro 特殊格式
              apiKey = getApiKeyFromCredential(credential, model.provider);
            }
          } catch (error) {
            logger.error(LogTags.MODEL, '批量测试 - 获取提供商凭证失败', error);
          }
        }

        if (!apiKey) return { modelId: model.id, success: false };

        try {
          // v4.1.46: 添加 protocol 字段
          // v0.9.4: 使用有效协议（考虑提供商默认协议）
          const provider = providers.find(p => p.id === model.provider);
          const effectiveProtocol = model.protocol || provider?.protocol || getDefaultProtocol(model.provider);

          const request = {
            provider: model.provider,
            api_key: apiKey,
            endpoint: model.endpoint || null,
            model_name: model.modelId || model.name || null,
            protocol: effectiveProtocol || null,  // v0.9.4: 使用有效协议
          };

          const response = await invoke<{
            success: boolean;
            message: string;
          }>('test_model', { request });

          // 更新模型状态
          setModels(prev => updateModelStatus(prev, model.id, response.success ? 'online' : 'error'));

          return { modelId: model.id, success: response.success };
        } catch {
          // 更新模型状态为 error
          setModels(prev => updateModelStatus(prev, model.id, 'error'));
          return { modelId: model.id, success: false };
        }
      })
    );

    // 统计结果
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.success) {
        successCount++;
      } else {
        failedCount++;
      }
    });
  }

  // 显示批量检查结果摘要
  addToast({
    type: successCount > 0 ? 'success' : 'error',
    title: '批量检查完成',
    message: `${successCount} 个可用，${failedCount} 个不可用`,
    duration: 5000,
  });
}, [models, addToast, providers, setModels]);

// v2.5.3: 自动测试 - 当添加或更新模型后自动执行测试
useEffect(() => {
  if (autoTestModelRef.current && isDataLoaded) {
    const modelId = autoTestModelRef.current;
    autoTestModelRef.current = null; // 清除标记，避免重复测试

    // 延迟执行测试，确保 state 已更新
    const timer = setTimeout(() => {
      handleTestModel(modelId);
    }, 100);

    return () => clearTimeout(timer);
  }
}, [models, isDataLoaded, handleTestModel]);

// Notification handlers
const handleMarkRead = useCallback((id: string) => {
  setNotifications((prev) =>
    prev.map((n) => (n.id === id ? { ...n, read: true } : n))
  );
}, []);

const handleMarkAllRead = useCallback(() => {
  setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
}, []);

// Export/Import handlers
const handleExport = useCallback((config: ExportConfig) => {
  logger.info(LogTags.APP, '导出配置', config);
}, []);

const handleImport = useCallback((file: File, options: ImportOptions) => {
  logger.info(LogTags.APP, '导入配置', { fileName: file.name, options });
}, []);

const unreadCount = notifications.filter((n) => !n.read).length;

return (
  <div className="h-screen w-full bg-gray-50 flex flex-col">
    <Header
      onNotifications={() => setShowNotifications(!showNotifications)}
      onExport={() => setShowExportModal(true)}
      onImport={() => setShowImportModal(true)}
      showUserMenu={showUserMenu}
      setShowUserMenu={setShowUserMenu}
      notificationCount={unreadCount}
    />

    <div className="flex-1 flex overflow-hidden">
      <Sidebar
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        onStatsClick={() => setShowStatsModal(true)}
      />

      <div className="flex-1 flex overflow-hidden">
        {currentPage === 'chat' && (
          <ChatPage
            chats={chats}
            models={models}
            agents={agents}
            mcpServers={mcpServers}
            isDataLoaded={isDataLoaded}
            onCreateChat={handleCreateChat}
            onDeleteChat={handleDeleteChat}
            onRenameChat={handleRenameChat}
            onToggleChatStar={handleToggleChatStar}
            onSendMessage={handleSendMessage}
            onStopGenerating={handleStopGenerating}
            isGenerating={isGenerating}
            // v3.5.1: 生成开始时间（用于计时器在切换对话时保持正确时间）
            getGeneratingStartTime={getGeneratingStartTime}
            onUpdateChatAgent={handleUpdateChatAgent}
            onUpdateChatModel={handleUpdateChatModel}
            // v4.0.0: 圆桌会议相关 props
            roundtableChats={roundtableChats}
            onCreateRoundtable={handleCreateRoundtable}
            onDeleteRoundtable={handleDeleteRoundtable}
            onRoundtableStartDiscussion={handleRoundtableStartDiscussion}
            onRoundtableSummarize={handleRoundtableSummarize}
            onRoundtableNextRound={handleRoundtableNextRound}
            // v4.1.8: 停止圆桌会议
            onStopRoundtable={handleStopRoundtable}
            // v4.1.4: 圆桌会议发言状态（按对话 ID 获取）
            getRoundtableSpeakerId={getRoundtableSpeakerId}
            // v4.1.1: 圆桌会议用户发送消息
            onRoundtableSendMessage={handleRoundtableSendMessage}
          />
        )}

        {currentPage === 'agents' && (
          <AgentPage
            agents={agents}
            models={models}
            skills={skills}
            mcpServers={mcpServers}
            onCreateAgent={handleCreateAgent}
            onUpdateAgent={handleUpdateAgent}
            onDeleteAgent={handleDeleteAgent}
            onToggleStatus={handleToggleAgentStatus}
            onRunAgent={handleRunAgent}
            onCreateMCPServer={handleAddMCPServer}
            onCreateSkill={handleAddSkill}
          />
        )}

        {currentPage === 'skills' && (
          <SkillsPage
            skills={skills}
            onToggleSkill={handleToggleSkill}
            onUpdateSkill={handleUpdateSkill}
            onAddSkill={handleAddSkill}
            onDeleteSkill={handleDeleteSkill}
            onInstallSkills={handleInstallSkills}
          />
        )}

        {currentPage === 'mcp' && (
          <MCPPage
            servers={mcpServers}
            stats={mcpStats}
            onAddServer={handleAddMCPServer}
            onUpdateServer={handleUpdateMCPServer}
            onDeleteServer={handleDeleteMCPServer}
            onConnect={handleConnectMCP}
            onDisconnect={handleDisconnectMCP}
            onReconnect={handleReconnectMCP}
            isLoading={isMCPLoading}
          />
        )}

        {currentPage === 'models' && (
          <ModelPage
            models={models}
            providers={modelProviders}
            onAddModel={handleAddModel}
            onUpdateModel={handleUpdateModel}
            onDeleteModel={handleDeleteModel}
            onTestModel={handleTestModel}
            onBatchTestModels={handleBatchTestModels}
          />
        )}

        {currentPage === 'providers' && (
          <ProviderPage
            providers={enhancedProviders}
            onConnect={handleConnectProvider}
            onDisconnect={handleDisconnectProvider}
            onTestConnection={handleTestProviderConnection}
            onCustomProvidersChange={handleReloadCustomProviders}
          />
        )}

        {currentPage === 'config-switcher' && (
          <ConfigSwitcherPage
            providers={enhancedProviders}
            mcpServers={mcpServers}
            skills={skills}
          />
        )}

        {currentPage === 'settings' && (
          <SettingsPage />
        )}
      </div>
    </div>

    {/* Modals and Panels */}
    <NotificationPanel
      isOpen={showNotifications}
      onClose={() => setShowNotifications(false)}
      notifications={notifications}
      onMarkRead={handleMarkRead}
      onMarkAllRead={handleMarkAllRead}
    />

    <StatsModal
      isOpen={showStatsModal}
      onClose={() => setShowStatsModal(false)}
      stats={realStats}
      modelUsage={realModelUsage}
      recentActivity={realActivity}
    />

    <ExportModal
      isOpen={showExportModal}
      onClose={() => setShowExportModal(false)}
      onExport={handleExport}
    />

    <ImportModal
      isOpen={showImportModal}
      onClose={() => setShowImportModal(false)}
      onImport={handleImport}
    />

    {/* 软件更新对话框 */}
    {showUpdateDialog && updateInfo && (
      <UpdateDialog
        updateInfo={updateInfo}
        onClose={() => setShowUpdateDialog(false)}
      />
    )}

    {/* v2.5.3: Toast 通知（右上角临时弹框） */}
    <Toast toasts={toasts} onDismiss={dismissToast} />
  </div>
);
}

export default App;
