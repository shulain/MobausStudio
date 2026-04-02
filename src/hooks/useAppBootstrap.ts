/**
 * 应用启动引导 Hook
 *
 * 从 App.tsx 提取的初始化逻辑，负责：
 * - 使用 usePersistedState 管理所有持久化数据
 * - Skills 加载（内置 + 自定义合并）和保存
 * - Providers 状态管理（内置 + 自定义提供商）
 * - MCP 服务器自动连接
 * - Provider 凭证加载和 OAuth Token 刷新
 * - 模型缓存服务初始化
 * - OAuth Token 自动续期和 token_expired 事件监听
 * - Mixpanel 运营统计初始化
 *
 * @module hooks/useAppBootstrap
 * @version 1.0.0
 */

import { invoke } from '@tauri-apps/api/core';
import { type UnlistenFn } from '@tauri-apps/api/event';
import { useState, useEffect, useRef, useCallback } from 'react';

import type { ToastItem } from '../components/common';
import { getBuiltinSkills } from '../data/builtinSkills';
import { builtinProviders } from '../data/providers';
import { modelFetcher } from '../services/modelFetcher';
import {
  agentsStorage,
  chatsStorage,
  mcpServersStorage,
  modelsStorage,
  roundtableChatsStorage,
  skillsStorage,
} from '../services/storage';
import { analytics, trackEvents } from '../services/analytics';
import { tokenRefresher } from '../services/tokenRefresher';
import { defaultChats } from '../data/mockData';
import { isTauri } from '../utils/platform';
import { logger, LogTags } from '../utils/logger';
import { usePersistedState } from './usePersistedState';
import { registerAuthRuntime } from '../services/auth/authRuntime';
import { mergeProvidersWithCredentials, filterExpiredOAuthCredentials } from '../services/auth/authProviderState';
import { loadProviderCredentialsSafe } from '../services/auth/providerCredentialAccess';
import type {
  Agent,
  AIModelConfig,
  AIProvider,
  Chat,
  MCPServer,
  MCPTool,
  RoundtableChat,
  Skill,
} from '../types';

// ==================== 类型定义 ====================

/**
 * Hook 配置选项
 *
 * @param addToast - Toast 通知回调（用于 Token 刷新失败时显示提示）
 */
export interface UseAppBootstrapOptions {
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
}

/**
 * Hook 返回值
 *
 * 提供所有持久化数据的读写接口，以及加载状态和生命周期引用
 */
export interface UseAppBootstrapReturn {
  // 持久化数据
  models: AIModelConfig[];
  setModels: React.Dispatch<React.SetStateAction<AIModelConfig[]>>;
  chats: Chat[];
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  agents: Agent[];
  setAgents: React.Dispatch<React.SetStateAction<Agent[]>>;
  skills: Skill[];
  setSkills: React.Dispatch<React.SetStateAction<Skill[]>>;
  mcpServers: MCPServer[];
  setMcpServers: React.Dispatch<React.SetStateAction<MCPServer[]>>;
  roundtableChats: RoundtableChat[];
  setRoundtableChats: (updater: RoundtableChat[] | ((prev: RoundtableChat[]) => RoundtableChat[])) => void;
  providers: AIProvider[];
  setProviders: React.Dispatch<React.SetStateAction<AIProvider[]>>;
  // 加载状态
  isDataLoaded: boolean;
  // Refs（供 App 中其他逻辑引用）
  timeoutIdsRef: React.MutableRefObject<Set<ReturnType<typeof setTimeout>>>;
  roundtableChatsRef: React.MutableRefObject<RoundtableChat[]>;
}

// ==================== Hook 实现 ====================

/**
 * 应用启动引导 Hook
 *
 * 管理应用启动时的所有数据加载和服务初始化逻辑。
 * 核心数据通过 usePersistedState 并行加载，加载完成后执行初始化流程。
 *
 * @example
 * ```tsx
 * const {
 *   models, setModels,
 *   chats, setChats,
 *   isDataLoaded,
 * } = useAppBootstrap({ addToast });
 * ```
 */
export function useAppBootstrap(options: UseAppBootstrapOptions): UseAppBootstrapReturn {
  const { addToast } = options;

  // ==================== 持久化数据 ====================

  // 立即保存模式（低频配置数据）
  const { data: models, setData: setModels, loaded: modelsLoaded } = usePersistedState({
    storage: modelsStorage,
    initialValue: [],
    immediate: true,
  });
  const { data: agents, setData: setAgents, loaded: agentsLoaded } = usePersistedState({
    storage: agentsStorage,
    initialValue: [],
    immediate: true,
  });
  const { data: mcpServers, setData: setMcpServers, loaded: mcpServersLoaded } = usePersistedState({
    storage: mcpServersStorage,
    initialValue: [],
    immediate: true,
    // 重启后重置所有 MCP 服务器连接状态为 disconnected
    transform: (servers) => servers.map(s => ({
      ...s,
      status: 'disconnected' as const,
      errorMessage: undefined,
      serverInfo: undefined,
      tools: undefined,
      resources: undefined,
    })),
  });
  // 防抖保存模式（高频更新数据，流式输出期间频繁变化）
  const { data: chats, setData: setChats, loaded: chatsLoaded } = usePersistedState({
    storage: chatsStorage,
    initialValue: defaultChats,
  });
  const { data: roundtableChats, setData: setRoundtableChatsInternal, loaded: roundtableChatsLoaded } = usePersistedState({
    storage: roundtableChatsStorage,
    initialValue: [],
  });

  // ==================== 非持久化状态 ====================

  // 初始化为内置技能，自定义技能从 skillsStorage 异步加载
  const [skills, setSkills] = useState<Skill[]>(() => getBuiltinSkills());
  // Provider 状态管理
  const [providers, setProviders] = useState<AIProvider[]>(() => builtinProviders);
  // initDone 标记初始化流程（技能加载、凭证刷新、统计服务等）是否完成
  const [initDone, setInitDone] = useState(false);

  // ==================== Refs ====================

  // 启动阶段 setTimeout 清理，防止组件卸载后仍执行回调
  const timeoutIdsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  // roundtableChats ref（解决闭包问题）
  const roundtableChatsRef = useRef<RoundtableChat[]>([]);
  // 引导阶段事件监听取消函数（与 App 的 unlistenMapRef 独立）
  const bootstrapUnlistenRef = useRef<Map<string, UnlistenFn>>(new Map());

  // ==================== Ref 同步 ====================

  // 同步 roundtableChatsRef：确保 usePersistedState 内部加载（setDataInternal）
  // 和外部包装 setRoundtableChats 两条路径都能更新 ref
  useEffect(() => {
    roundtableChatsRef.current = roundtableChats;
  }, [roundtableChats]);

  // ==================== 派生状态 ====================

  // 核心数据由 usePersistedState 加载，全部就绪后才执行初始化
  const coreDataLoaded = modelsLoaded && chatsLoaded && agentsLoaded && mcpServersLoaded && roundtableChatsLoaded;
  const isDataLoaded = coreDataLoaded && initDone;

  // ==================== 包装函数 ====================

  // 包装 setRoundtableChats，同时更新状态和 ref
  const setRoundtableChats = useCallback((updater: RoundtableChat[] | ((prev: RoundtableChat[]) => RoundtableChat[])) => {
    setRoundtableChatsInternal(prev => {
      const newValue = typeof updater === 'function' ? updater(prev) : updater;
      roundtableChatsRef.current = newValue;
      return newValue;
    });
  }, [setRoundtableChatsInternal]);

  // ==================== 初始化 Effect ====================

  // 核心数据就绪后执行初始化：技能合并、凭证刷新、MCP 自动连接、统计服务
  useEffect(() => {
    if (!coreDataLoaded) return;

    const initApp = async () => {
      try {
        if (import.meta.env.DEV) {
          logger.debug(LogTags.APP, '核心数据已加载，开始初始化...');
        }

        // 加载 Skills 数据（内置技能 + 自定义技能）
        const customSkills = await skillsStorage.load();
        const builtinSkills = getBuiltinSkills();
        setSkills([...builtinSkills, ...customSkills]);
        if (import.meta.env.DEV) {
          logger.debug(LogTags.APP, '已加载技能配置', { builtin: builtinSkills.length, custom: customSkills.length });
        }

        // MCP 自动启动功能 - 连接标记为 autoStart 且 enabled 的服务器
        const autoStartServers = mcpServers.filter(
          (s) => s.enabled !== false && s.autoStart === true
        );
        if (autoStartServers.length > 0) {
          if (import.meta.env.DEV) {
            logger.debug(LogTags.APP, '发现需要自动启动的 MCP 服务器', { servers: autoStartServers.map(s => s.name) });
          }
          // 延迟执行自动连接，确保状态已更新
          const timerId = setTimeout(async () => {
            timeoutIdsRef.current.delete(timerId);
            for (const server of autoStartServers) {
              if (import.meta.env.DEV) {
                logger.debug(LogTags.APP, '自动连接 MCP 服务器', { name: server.name });
              }
              try {
                const result = await invoke<{
                  success: boolean;
                  server_name?: string;
                  server_version?: string;
                  error?: string;
                }>('mcp_connect', {
                  request: {
                    server_id: server.id,
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
                    tools = await invoke<MCPTool[]>('mcp_list_tools', { serverId: server.id });
                  } catch (e) {
                    logger.warn(LogTags.APP, '自动启动 - 获取工具列表失败', e);
                  }

                  setMcpServers(prev => prev.map(s =>
                    s.id === server.id
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
                    logger.debug(LogTags.APP, '自动启动成功', { name: server.name });
                  }
                } else {
                  setMcpServers(prev => prev.map(s =>
                    s.id === server.id
                      ? { ...s, status: 'error' as const, errorMessage: result.error || '自动连接失败' }
                      : s
                  ));
                  logger.error(LogTags.APP, '自动启动失败', { name: server.name, error: result.error });
                }
              } catch (error) {
                setMcpServers(prev => prev.map(s =>
                  s.id === server.id
                    ? { ...s, status: 'error' as const, errorMessage: String(error) }
                    : s
                ));
                logger.error(LogTags.APP, '自动启动异常', { name: server.name, error });
              }
            }
          }, 500);
          timeoutIdsRef.current.add(timerId);
        }

        // 加载自定义提供商并合并到 providers 列表
        try {
          const { customProviderStorage } = await import('../services/customProviderStorage');
          const customProviders = await customProviderStorage.load();

          if (customProviders.length > 0) {
            if (import.meta.env.DEV) {
              logger.debug(LogTags.APP, '已加载自定义提供商', { count: customProviders.length });
            }

            setProviders(prev => {
              const customAIProviders: AIProvider[] = customProviders.map(cp => ({
                id: cp.id,
                name: cp.name,
                icon: cp.icon,
                description: cp.description,
                defaultEndpoint: cp.endpoint,
                authMethods: cp.authMethods,
                models: [], // v4.2.7: 自定义提供商不再包含模型列表
                status: 'disconnected' as const,
                protocol: cp.protocol, // v0.9.4: 使用保存的协议配置
                isCustom: true,
                category: 'other' as const,
              }));

              const builtinOnly = prev.filter(p => !p.isCustom && !p.id.startsWith('custom-'));
              return [...builtinOnly, ...customAIProviders];
            });
          }
        } catch (error) {
          logger.error(LogTags.APP, '加载自定义提供商失败', error);
        }

        // 加载 Provider 凭证并更新连接状态
        const storedCredentials = await loadProviderCredentialsSafe({
          context: '应用启动加载 Provider 凭证失败',
          onError: () => {
            addToast({
              type: 'error',
              title: '凭证加载失败',
              message: '无法读取安全存储，部分连接状态可能未恢复',
              duration: 8000,
            });
          },
        });
        if (storedCredentials.length > 0) {
          if (import.meta.env.DEV) {
            logger.debug(LogTags.APP, '已加载 Provider 凭证', { count: storedCredentials.length });
          }

          // 对已过期但有 refreshToken 的 OAuth 凭证尝试刷新
          const now = Date.now();
          const expiredOAuthCredentials = filterExpiredOAuthCredentials(storedCredentials, now);

          if (expiredOAuthCredentials.length > 0) {
            logger.info(LogTags.APP, '发现已过期的 OAuth Token，尝试自动刷新', {
              providers: expiredOAuthCredentials.map(c => c.providerId),
            });

            const refreshResults = await Promise.allSettled(
              expiredOAuthCredentials.map(async (credential) => {
                const result = await tokenRefresher.refreshToken(credential);
                return { providerId: credential.providerId, result };
              })
            );

            const refreshedProviderIds: string[] = [];
            const failedProviderIds: string[] = [];

            for (const settledResult of refreshResults) {
              if (settledResult.status === 'fulfilled') {
                const { providerId, result } = settledResult.value;
                if (result.success) {
                  refreshedProviderIds.push(providerId);
                  logger.info(LogTags.APP, 'OAuth Token 自动刷新成功', { providerId });
                } else {
                  failedProviderIds.push(providerId);
                  logger.warn(LogTags.APP, 'OAuth Token 自动刷新失败', {
                    providerId,
                    error: result.error,
                  });
                }
              } else {
                logger.error(LogTags.APP, 'OAuth Token 刷新异常', settledResult.reason);
              }
            }

            if (refreshedProviderIds.length > 0) {
              logger.info(LogTags.APP, 'OAuth Token 自动刷新完成', {
                refreshed: refreshedProviderIds,
                failed: failedProviderIds,
              });
            }
          }

          // 重新加载凭证（可能已被刷新更新）
          const updatedCredentials = await loadProviderCredentialsSafe({
            context: 'Token 刷新后重新加载凭证失败',
            fallback: storedCredentials,
          });
          const updatedNow = Date.now();

          // 使用纯函数更新 providers 状态
          setProviders(prev => mergeProvidersWithCredentials(prev, updatedCredentials, updatedNow));
        }

        // 初始化模型缓存服务
        try {
          const cacheStatus = await modelFetcher.initialize();
          if (import.meta.env.DEV) {
            logger.debug(LogTags.APP, '模型缓存服务已初始化', cacheStatus);
          }

          // 恢复已连接提供商的缓存模型数据
          if (storedCredentials.length > 0) {
            const cachedModels = await modelFetcher.getAllCachedModels();
            const cachedProviderIds = Object.keys(cachedModels);
            if (cachedProviderIds.length > 0) {
              setProviders(prev => prev.map(p => {
                const credential = storedCredentials.find(c => c.providerId === p.id);
                if (credential && cachedModels[p.id]) {
                  return {
                    ...p,
                    models: cachedModels[p.id],
                  };
                }
                return p;
              }));
              if (import.meta.env.DEV) {
                logger.debug(LogTags.APP, '已恢复缓存的模型数据', {
                  providers: cachedProviderIds.filter(id =>
                    storedCredentials.some(c => c.providerId === id)
                  ),
                });
              }
            }
          }
        } catch (error) {
          logger.warn(LogTags.APP, '模型缓存服务初始化失败', error);
        }

        // 启动 OAuth Token 自动续期服务和事件监听
        if (storedCredentials.some(c => c.type === 'oauth')) {
          logger.info(LogTags.APP, '启动 OAuth Token 自动续期服务', {
            oauthProviders: storedCredentials.filter(c => c.type === 'oauth').map(c => c.providerId),
          });

          // 使用统一的 authRuntime 注册监听器
          const authCleanup = await registerAuthRuntime({ setProviders });

          // 保存清理函数到 ref
          if (authCleanup.unlistenTokenExpired) {
            bootstrapUnlistenRef.current.set('token_expired', authCleanup.unlistenTokenExpired);
          }

          // 注意：authCleanup.stopTokenRefresher 会在清理 Effect 中通过 tokenRefresher.stop() 调用
        }

        // 初始化运营统计服务
        const MIXPANEL_TOKEN = import.meta.env.VITE_MIXPANEL_TOKEN || '';
        const MIXPANEL_PROXY = import.meta.env.VITE_MIXPANEL_PROXY || '';
        if (MIXPANEL_TOKEN) {
          analytics.init({
            projectToken: MIXPANEL_TOKEN,
            endpoint: MIXPANEL_PROXY || undefined,
            enabled: true,
            debug: import.meta.env.DEV,
          });

          let appVersion = '0.0.0-dev';
          if (isTauri()) {
            try {
              const { getVersion } = await import('@tauri-apps/api/app');
              appVersion = await getVersion();
            } catch {
              // 忽略错误，使用默认版本
            }
          }

          const getOSName = (): string => {
            const ua = navigator.userAgent;
            if (ua.includes('Mac OS X')) return 'macOS';
            if (ua.includes('Windows')) return 'Windows';
            if (ua.includes('Linux')) return 'Linux';
            return 'Unknown';
          };
          const osName = getOSName();

          analytics.identify({
            appVersion,
            os: osName,
            language: navigator.language,
          });

          trackEvents.appLaunched({
            version: appVersion,
            os: osName,
            language: navigator.language,
          });

          logger.info(LogTags.APP, '运营统计服务已初始化');
        } else if (import.meta.env.DEV) {
          logger.debug(LogTags.APP, '未配置 VITE_MIXPANEL_TOKEN，跳过统计服务初始化');
        }

        setInitDone(true);
      } catch (error) {
        logger.error(LogTags.APP, '应用初始化失败', error);
        setInitDone(true);
      }
    };

    initApp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coreDataLoaded]);

  // ==================== Skills 保存 Effect ====================

  // 持久化 Skills 数据（仅保存自定义技能）
  useEffect(() => {
    if (isDataLoaded) {
      skillsStorage.save(skills).then(() => {
        if (import.meta.env.DEV) {
          const customCount = skills.filter(s => !s.builtIn).length;
          logger.debug(LogTags.APP, 'Skills 配置已保存', { customCount });
        }
      }).catch((error) => {
        logger.error(LogTags.APP, '保存 Skills 配置失败', error);
      });
    }
  }, [skills, isDataLoaded]);

  // ==================== Token 刷新回调 Effect ====================

  // Token 刷新回调 - 当 token 刷新失败时更新 Provider 状态并通知用户
  useEffect(() => {
    if (!isDataLoaded) return;

    const handleTokenRefresh = async (result: {
      success: boolean;
      providerId: string;
      error?: string;
      needsReauth?: boolean;  // v0.9.2: 新增
    }) => {
      if (!result.success) {
        logger.warn(LogTags.APP, 'OAuth Token 刷新失败，断开 Provider 连接', {
          providerId: result.providerId,
          error: result.error,
          needsReauth: result.needsReauth,  // v0.9.2
        });

        setProviders(prev => prev.map(p =>
          p.id === result.providerId
            ? { ...p, status: 'disconnected' as const, source: undefined, errorMessage: result.error }
            : p
        ));

        // v0.9.2: 如果需要重新认证，显示明确的提示（凭证已被自动删除）
        if (result.needsReauth) {
          logger.info(LogTags.APP, 'Token 不可恢复，已删除失效凭证，需要重新登录', {
            providerId: result.providerId,
          });
          addToast({
            type: 'error',
            title: `${result.providerId} 需要重新登录`,
            message: '认证信息已失效，请重新连接以继续使用',
            duration: 15000,  // 更长的显示时间
          });
        } else {
          // 保留凭证供下次重试（参考 CLIProxyAPIPlus）
          logger.info(LogTags.APP, 'Token 刷新失败，保留凭证供下次重试', {
            providerId: result.providerId,
          });

          // Kiro 的 token 刷新失败通常是客户端注册信息丢失，静默处理
          if (result.providerId.toLowerCase() !== 'kiro') {
            addToast({
              type: 'error',
              title: `${result.providerId} 连接已断开`,
              message: 'OAuth Token 已过期且刷新失败，请重新连接',
              duration: 10000,
            });
          } else {
            logger.info(LogTags.APP, 'Kiro Token 刷新失败，需要重新登录（客户端注册信息可能已丢失）');
          }
        }
      } else {
        logger.info(LogTags.APP, 'OAuth Token 刷新成功，更新 Provider 状态', { providerId: result.providerId });
        setProviders(prev => prev.map(p =>
          p.id === result.providerId
            ? { ...p, status: 'connected' as const }
            : p
        ));
      }
    };

    tokenRefresher.addCallback(handleTokenRefresh);

    return () => {
      tokenRefresher.removeCallback(handleTokenRefresh);
    };
  }, [isDataLoaded, addToast]);

  // ==================== 清理 Effect ====================

  // 组件卸载时清理引导阶段创建的资源
  useEffect(() => {
    return () => {
      // 清理启动阶段的 setTimeout
      timeoutIdsRef.current.forEach((timerId) => {
        clearTimeout(timerId);
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
      timeoutIdsRef.current.clear();

      // 清理引导阶段注册的事件监听器（如 token_expired）
      bootstrapUnlistenRef.current.forEach((unlisten) => {
        unlisten();
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
      bootstrapUnlistenRef.current.clear();

      // 停止 Token 自动续期服务
      tokenRefresher.stop();

      if (import.meta.env.DEV) {
        logger.debug(LogTags.APP, '已清理引导阶段资源（定时器、事件监听、Token 续期服务）');
      }
    };
  }, []);

  // ==================== 返回值 ====================

  return {
    models,
    setModels,
    chats,
    setChats,
    agents,
    setAgents,
    skills,
    setSkills,
    mcpServers,
    setMcpServers,
    roundtableChats,
    setRoundtableChats,
    providers,
    setProviders,
    isDataLoaded,
    timeoutIdsRef,
    roundtableChatsRef,
  };
}
