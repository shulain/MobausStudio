import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { MessageCircle, Plus, Trash2, Edit3, Star, StarOff, Copy, Users, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Button, ContextMenu, Modal, ExpandableSearch, type ContextMenuItem } from '../../common';
import { ChatWindow } from './ChatWindow';
import { useI18n } from '../../../i18n';
import type { Chat, AIModel, Attachment, Agent, MCPServer, RoundtableChat, RoundtableCreateInput, OrchestrationMode } from '../../../types';
import { logger, LogTags } from '../../../utils/logger';
import { OrchestrationModeSelector, RoundtableSetupModal, RoundtableView } from '../AgentOrchestration';
import { settingsStorage } from '../../../services/storage';
import { getChatModelDisplayName, getDefaultChatModelId, normalizeChatModelId } from '../../../services/models/chatModelCompatibility';

/**
 * v2.7.0: 对话选中状态持久化存储键名
 * 用于在 localStorage 中保存当前选中的对话 ID
 */
const SELECTED_CHAT_STORAGE_KEY = 'chat_selected_id';
/**
 * v4.1.6: 侧边栏收起状态持久化存储键名（localStorage 降级用）
 */
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'chat_sidebar_collapsed';

interface ChatPageProps {
    chats: Chat[];
    models: AIModel[];
    agents: Agent[];           // Agent 列表 (v2.1.0)
    mcpServers: MCPServer[];   // MCP 服务器列表 (v2.1.0)
    isDataLoaded?: boolean;    // 启动数据是否已加载完成
    onCreateChat: () => string; // 返回新对话 ID
    onDeleteChat: (chatId: string) => void;
    onRenameChat: (chatId: string, newTitle: string) => void;
    onToggleChatStar: (chatId: string) => void;
    // 更新签名：添加 modelId, attachments, agent 参数
    onSendMessage: (chatId: string, content: string, modelId: string, attachments?: Attachment[], agent?: Agent) => void;
    onStopGenerating: (chatId: string) => void; // 接收 chatId 参数
    isGenerating: (chatId: string) => boolean; // 检查对话是否正在生成
    // v3.5.1: 获取生成开始时间（用于计时器在切换对话时保持正确时间）
    getGeneratingStartTime?: (chatId: string) => number | null;
    // Agent 选择持久化 (v2.3.0)
    onUpdateChatAgent?: (chatId: string, agentId: string | null) => void;
    // v2.8.0: 模型选择持久化 - 更新对话关联的模型
    onUpdateChatModel?: (chatId: string, modelId: string) => void;
    // v4.0.0: 圆桌会议相关 props
    roundtableChats?: RoundtableChat[];
    onCreateRoundtable?: (input: RoundtableCreateInput) => string;
    onDeleteRoundtable?: (chatId: string) => void;
    onRoundtableStartDiscussion?: (chatId: string, userQuestion: string) => Promise<void>;
    onRoundtableSummarize?: (chatId: string) => Promise<void>;
    onRoundtableNextRound?: (chatId: string) => void;
    // v4.1.8: 停止圆桌会议
    onStopRoundtable?: (chatId: string) => void;
    // v4.1.4: 圆桌会议发言状态（按对话 ID 获取）
    getRoundtableSpeakerId?: (chatId: string) => string | null;
    // v4.1.1: 圆桌会议用户发送消息
    onRoundtableSendMessage?: (chatId: string, content: string, targetParticipantIds?: string[]) => Promise<void>;
}

export const ChatPage: React.FC<ChatPageProps> = ({
    chats,
    models,
    agents,
    mcpServers,
    isDataLoaded = true,
    onCreateChat,
    onDeleteChat,
    onRenameChat,
    onToggleChatStar,
    onSendMessage,
    onStopGenerating,
    isGenerating,
    // v3.5.1: 获取生成开始时间
    getGeneratingStartTime,
    onUpdateChatAgent,
    onUpdateChatModel,
    // v4.0.0: 圆桌会议相关 props
    roundtableChats = [],
    onCreateRoundtable,
    onDeleteRoundtable,
    onRoundtableStartDiscussion,
    onRoundtableSummarize,
    onRoundtableNextRound,
    // v4.1.8: 停止圆桌会议
    onStopRoundtable,
    // v4.1.4: 圆桌会议发言状态（按对话 ID 获取）
    getRoundtableSpeakerId,
    // v4.1.1: 圆桌会议用户发送消息
    onRoundtableSendMessage,
}) => {
    const { t, language } = useI18n();
    /**
     * v2.7.0: 对话选中状态持久化
     * 初始化时从 localStorage 读取上次选中的对话 ID
     * 解决窗口切换后选中状态丢失的问题
     */
    const [selectedChatId, setSelectedChatId] = useState<string | null>(
        () => localStorage.getItem(SELECTED_CHAT_STORAGE_KEY)
    );
    const [searchQuery, setSearchQuery] = useState('');

    // v4.0.0: 统一对话类型定义（需要在状态声明之前定义）
    type UnifiedChat = (Chat & { chatType: 'normal' }) | (RoundtableChat & { chatType: 'roundtable' });

    // 删除确认对话框状态 (v4.0.0: 支持统一对话类型)
    const [deleteConfirmChat, setDeleteConfirmChat] = useState<UnifiedChat | null>(null);
    // 重命名对话框状态 (v4.0.0: 支持统一对话类型)
    const [renameChat, setRenameChat] = useState<UnifiedChat | null>(null);
    const [renameValue, setRenameValue] = useState('');

    // v4.0.0: 模式选择器和圆桌设置弹窗状态
    const [showModeSelector, setShowModeSelector] = useState(false);
    const [showRoundtableSetup, setShowRoundtableSetup] = useState(false);

    // v4.1.7: 侧边栏收起状态（优先 Tauri 持久化，降级到 localStorage）
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
        localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
    );

    // v4.1.7: 组件挂载时从 Tauri 加载侧边栏状态
    useEffect(() => {
        settingsStorage.loadAsync().then(settings => {
            if (settings.sidebarCollapsed !== undefined) {
                setSidebarCollapsed(settings.sidebarCollapsed);
            }
        }).catch(err => {
            logger.warn(LogTags.STORAGE, '加载侧边栏状态失败，使用 localStorage 值', err);
        });
    }, []);

    // v4.1.7: 侧边栏收起状态变化时保存到 Tauri（降级到 localStorage）
    const toggleSidebar = useCallback(() => {
        setSidebarCollapsed(prev => {
            const newValue = !prev;
            // 同时保存到 localStorage（快速响应）和 Tauri（持久化）
            localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(newValue));
            settingsStorage.updateSidebarCollapsed(newValue).catch(err => {
                logger.warn(LogTags.STORAGE, '保存侧边栏状态到 Tauri 失败', err);
            });
            return newValue;
        });
    }, []);

    /**
     * v4.0.0: 合并普通对话和圆桌会议对话
     * 按更新时间排序，统一显示在对话列表中
     */
    const allChats = useMemo<UnifiedChat[]>(() => {
        const normalChats: UnifiedChat[] = chats.map(c => ({ ...c, chatType: 'normal' as const }));
        const rtChats: UnifiedChat[] = roundtableChats.map(c => ({ ...c, chatType: 'roundtable' as const }));
        return [...normalChats, ...rtChats].sort((a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
    }, [chats, roundtableChats]);

    /**
     * 自动选择对话逻辑
     * 1. 如果当前选中的对话存在，保持不变
     * 2. 如果当前选中的对话被删除，自动选择最新对话
     * 3. 如果没有选中对话且有对话列表，选择最新对话
     */
    React.useEffect(() => {
        // 启动阶段数据尚未完成加载时，不执行自动重选，避免覆盖 localStorage 中的历史选中项
        if (!isDataLoaded) return;

        // 如果当前选中的对话仍然存在，不做任何操作
        if (selectedChatId && allChats.find(c => c.id === selectedChatId)) return;

        // 自动选择最近更新的对话
        if (allChats.length > 0) {
            setSelectedChatId(allChats[0].id);
        } else {
            // 如果没有对话了，清空选中状态
            setSelectedChatId(null);
        }
    }, [allChats, selectedChatId, isDataLoaded]);

    /**
     * v2.7.0: 选中对话变化时保存到 localStorage
     * 确保窗口切换或应用重启后能恢复选中状态
     */
    React.useEffect(() => {
        if (selectedChatId) {
            localStorage.setItem(SELECTED_CHAT_STORAGE_KEY, selectedChatId);
            logger.info(LogTags.CHAT, `对话选中状态已保存: ${selectedChatId}`);
        }
    }, [selectedChatId]);

    /**
     * v2.4.0: 性能优化 - 预计算 Agent/Model 映射表
     * 使用 Map 实现 O(1) 查找，避免每个 ChatListItem 都遍历数组
     */
    const agentMap = useMemo(() =>
        new Map(agents.map(a => [a.id, a])),
        [agents]
    );

    const modelMap = useMemo(() =>
        new Map(models.map(m => [m.id, m])),
        [models]
    );

    /**
     * v2.5.0: 性能优化 - 缓存过滤后的对话列表
     * v4.0.0: 支持合并后的对话列表（普通对话 + 圆桌会议）
     */
    const filteredChats = useMemo(() => {
        if (!searchQuery.trim()) return allChats;
        const query = searchQuery.toLowerCase();
        return allChats.filter(
            (chat) =>
                chat.title.toLowerCase().includes(query) ||
                chat.messages.some((m) =>
                    m.content.toLowerCase().includes(query)
                )
        );
    }, [allChats, searchQuery]);

    // v4.0.0: 从合并列表中查找选中的对话
    const selectedUnifiedChat = allChats.find((c) => c.id === selectedChatId) || null;
    // 普通对话（用于 ChatWindow）
    const selectedChat = selectedUnifiedChat?.chatType === 'normal' ? selectedUnifiedChat : null;
    // 圆桌会议（用于 RoundtableView）
    const selectedRoundtable = selectedUnifiedChat?.chatType === 'roundtable' ? selectedUnifiedChat : null;

    // v2.8.0: 从 Chat 对象中读取模型选择（持久化）
    // 如果对话没有设置模型或模型已被删除，使用第一个可用模型
    const selectedModel = useMemo(() => {
        const normalizedModelId = normalizeChatModelId(selectedChat?.model, models);
        if (normalizedModelId && models.find(m => m.id === normalizedModelId)) {
            return normalizedModelId;
        }
        return getDefaultChatModelId(models);
    }, [selectedChat?.model, models]);

    // v2.3.0: 从 Chat 对象中读取 Agent 选择（持久化）
    const selectedAgentId = selectedChat?.agentId || null;

    // 获取当前选中的 Agent (v2.1.0)
    const selectedAgent = selectedAgentId ? agents.find(a => a.id === selectedAgentId) : undefined;

    // Agent 选择变更处理 (v2.3.0)
    const handleAgentChange = useCallback((agentId: string | null) => {
        if (selectedChatId && onUpdateChatAgent) {
            onUpdateChatAgent(selectedChatId, agentId);
        }
    }, [selectedChatId, onUpdateChatAgent]);

    /**
     * v2.8.0: 模型选择变更处理
     * 更新对话关联的模型，持久化到 chats.json
     */
    const handleModelChange = useCallback((modelId: string) => {
        if (selectedChatId && onUpdateChatModel) {
            onUpdateChatModel(selectedChatId, modelId);
            logger.info(LogTags.CHAT, `对话模型已更新: ${modelId}`);
        }
    }, [selectedChatId, onUpdateChatModel]);

    // 发送消息时传递当前选中的模型 ID 和附件 (v2.1.0)
    // 优先使用 Agent 的模型，否则使用用户选择的模型
    const handleSendMessage = (content: string, attachments: Attachment[] = []) => {
        if (!selectedChatId) return;

        // 获取实际使用的模型：Agent 优先，否则用户选择
        const effectiveModelId = selectedAgent?.model
            ? normalizeChatModelId(selectedAgent.model, models)
            : selectedModel;

        if (!effectiveModelId) {
            logger.warn(LogTags.CHAT, '无可用模型');
            return;
        }

        onSendMessage(selectedChatId, content, effectiveModelId, attachments, selectedAgent);
    };

    /**
     * v2.5.0: 性能优化 - 使用 useCallback 缓存 formatTime 函数
     * 避免每次渲染都创建新函数导致子组件重渲染
     */
    const formatTime = useCallback((date: Date) => {
        const now = new Date();
        const diff = now.getTime() - new Date(date).getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);

        if (language === 'zh') {
            if (hours < 1) return '刚刚';
            if (hours < 24) return `${hours}小时前`;
            if (days === 1) return '昨天';
            return `${days}天前`;
        } else {
            if (hours < 1) return 'Just now';
            if (hours < 24) return `${hours}h ago`;
            if (days === 1) return 'Yesterday';
            return `${days}d ago`;
        }
    }, [language]);

    return (
        <div className="flex-1 overflow-hidden">
            <div className="h-full flex flex-col">
                {/* v3.5.0: 优化页面头部，使用紧凑布局 */}
                <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                        {/* 左侧：图标 + 标题 */}
                        <div className="flex items-center gap-3">
                            <MessageCircle className="w-6 h-6 text-purple-600" />
                            <div>
                                <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                                    {t.nav.chat}
                                </h2>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {t.chat.subtitle}
                                </p>
                            </div>
                        </div>

                        {/* 右侧：搜索 + 新建按钮 */}
                        <div className="flex items-center gap-3">
                            <ExpandableSearch
                                value={searchQuery}
                                onChange={setSearchQuery}
                                placeholder={t.chat.searchChats}
                                expandedWidth="240px"
                            />
                            {/* v4.1.0: 拆分为两个按钮 - 普通对话和编排对话 */}
                            <Button
                                onClick={() => {
                                    const newId = onCreateChat();
                                    setSelectedChatId(newId);
                                }}
                                icon={<Plus className="w-4 h-4" />}
                            >
                                {t.chat.newChat}
                            </Button>
                            {/* v4.1.2: 编排对话按钮，打开模式选择器（排除单对话模式） */}
                            {/* v4.1.3: 使用 Button 组件保持样式一致 */}
                            <Button
                                onClick={() => setShowModeSelector(true)}
                                icon={<Users className="w-4 h-4" />}
                            >
                                {t.chat.orchestration}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* 主体内容区域 */}
                <div className="flex-1 flex overflow-hidden relative">
                    {/* v4.1.7: 对话列表 - 支持收起 */}
                    <div className={`bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden shrink-0 transition-all duration-300 ${
                        sidebarCollapsed ? 'w-0 border-r-0' : 'w-60 lg:w-72 xl:w-80'
                    }`}>
                        {/* v4.1.7: 侧边栏顶部 - 标题和收起按钮 */}
                        {!sidebarCollapsed && (
                            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                    {t.chat.conversations}
                                </span>
                                <button
                                    onClick={toggleSidebar}
                                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                    title={t.chat.collapseSidebar}
                                >
                                    <PanelLeftClose className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                                </button>
                            </div>
                        )}
                        <div className="flex-1 overflow-y-auto p-3 space-y-1">
                            {filteredChats.length === 0 ? (
                                <div className="text-center text-gray-400 dark:text-gray-500 py-8">
                                    <p className="text-sm">{t.chat.noChats}</p>
                                </div>
                            ) : (
                                filteredChats.map((chat) => (
                                    <ChatListItem
                                        key={chat.id}
                                        chat={chat}
                                        isSelected={chat.id === selectedChatId}
                                        onSelect={setSelectedChatId}
                                        onDeleteClick={setDeleteConfirmChat}
                                        onRenameClick={setRenameChat}
                                        setRenameValue={setRenameValue}
                                        onToggleStar={onToggleChatStar}
                                        formatTime={formatTime}
                                        noMessageText={t.chat.noMessagesShort}
                                        t={t}
                                        agentMap={agentMap}
                                        modelMap={modelMap}
                                    />
                                ))
                            )}
                        </div>
                    </div>

                    {/* v4.1.7: 侧边栏展开按钮 - 仅在收起时显示，位置与收起按钮对应（顶部） */}
                    {sidebarCollapsed && (
                        <button
                            onClick={toggleSidebar}
                            className="absolute left-0 top-2 z-10 p-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 border-l-0 rounded-r-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                            title={t.chat.expandSidebar}
                        >
                            <PanelLeft className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                        </button>
                    )}

                    {/* v4.0.0: 根据选中对话类型显示不同视图 */}
                    {selectedRoundtable ? (
                        <RoundtableView
                            chat={selectedRoundtable}
                            agents={agents}
                            onStartDiscussion={onRoundtableStartDiscussion}
                            onSummarize={onRoundtableSummarize}
                            onNextRound={onRoundtableNextRound}
                            // v4.1.8: 停止圆桌会议
                            onStopGenerating={() => onStopRoundtable?.(selectedRoundtable.id)}
                            // v4.1.4: 发言状态（按对话 ID 获取）
                            isGenerating={!!getRoundtableSpeakerId?.(selectedRoundtable.id)}
                            currentSpeakerId={getRoundtableSpeakerId?.(selectedRoundtable.id) || undefined}
                            // v3.5.1: 生成开始时间
                            generatingStartTime={getGeneratingStartTime?.(selectedRoundtable.id) || undefined}
                            // v4.1.1: 用户发送消息
                            onSendMessage={(content, targetIds) =>
                                onRoundtableSendMessage?.(selectedRoundtable.id, content, targetIds)
                            }
                        />
                    ) : (
                        <ChatWindow
                            chat={selectedChat}
                            models={models}
                            selectedModel={selectedModel}
                            onModelChange={handleModelChange}
                            onSendMessage={handleSendMessage}
                            onStopGenerating={() => selectedChatId && onStopGenerating(selectedChatId)}
                            isGenerating={selectedChatId ? isGenerating(selectedChatId) : false}
                            // v3.5.1: 生成开始时间
                            generatingStartTime={selectedChatId ? getGeneratingStartTime?.(selectedChatId) || undefined : undefined}
                            agents={agents}
                            selectedAgentId={selectedAgentId}
                            onAgentChange={handleAgentChange}
                            mcpServers={mcpServers}
                        />
                    )}
                </div>
            </div>

            {/* 删除确认对话框 */}
            <Modal
                isOpen={!!deleteConfirmChat}
                onClose={() => setDeleteConfirmChat(null)}
                title={t.chat.deleteChat}
            >
                <div className="space-y-4">
                    <p className="text-gray-600 dark:text-gray-300">
                        {deleteConfirmChat?.chatType === 'roundtable'
                            ? t.chat.deleteRoundtableConfirm.replace('{title}', deleteConfirmChat?.title || '')
                            : t.chat.deleteChatConfirm.replace('{title}', deleteConfirmChat?.title || '')
                        }
                    </p>
                    <div className="flex justify-end gap-3">
                        <Button
                            variant="secondary"
                            onClick={() => setDeleteConfirmChat(null)}
                        >
                            {t.common.cancel}
                        </Button>
                        <Button
                            variant="danger"
                            onClick={() => {
                                if (deleteConfirmChat) {
                                    // v4.0.0: 根据对话类型调用不同的删除函数
                                    if (deleteConfirmChat.chatType === 'roundtable') {
                                        onDeleteRoundtable?.(deleteConfirmChat.id);
                                    } else {
                                        onDeleteChat(deleteConfirmChat.id);
                                    }
                                    setDeleteConfirmChat(null);
                                }
                            }}
                        >
                            {t.common.delete}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* 重命名对话框 */}
            <Modal
                isOpen={!!renameChat}
                onClose={() => setRenameChat(null)}
                title={t.chat.renameChat}
            >
                <div className="space-y-4">
                    <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && renameValue.trim()) {
                                onRenameChat(renameChat!.id, renameValue.trim());
                                setRenameChat(null);
                            }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-[10px] bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder={t.chat.renamePlaceholder}
                        autoFocus
                    />
                    <div className="flex justify-end gap-3">
                        <Button
                            variant="secondary"
                            onClick={() => setRenameChat(null)}
                        >
                            {t.common.cancel}
                        </Button>
                        <Button
                            onClick={() => {
                                if (renameChat && renameValue.trim()) {
                                    onRenameChat(renameChat.id, renameValue.trim());
                                    setRenameChat(null);
                                }
                            }}
                            disabled={!renameValue.trim()}
                        >
                            {t.common.save}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* v4.0.0: 模式选择器弹窗 */}
            <OrchestrationModeSelector
                isOpen={showModeSelector}
                onClose={() => setShowModeSelector(false)}
                onSelectMode={(mode: OrchestrationMode) => {
                    if (mode === 'roundtable') {
                        // 选择圆桌会议模式，显示配置弹窗
                        setShowRoundtableSetup(true);
                    } else {
                        // 其他模式（目前只有单 Agent 对话可用）
                        const newId = onCreateChat();
                        setSelectedChatId(newId);
                    }
                    setShowModeSelector(false);
                }}
            />

            {/* v4.0.0: 圆桌会议配置弹窗 */}
            <RoundtableSetupModal
                isOpen={showRoundtableSetup}
                onClose={() => setShowRoundtableSetup(false)}
                onCreate={(input: RoundtableCreateInput) => {
                    if (onCreateRoundtable) {
                        const newId = onCreateRoundtable(input);
                        setSelectedChatId(newId);
                    }
                    setShowRoundtableSetup(false);
                }}
                agents={agents}
            />
        </div>
    );
};

/**
 * v2.5.0: 对话列表项组件 Props
 * v4.0.0: 支持统一的对话类型（普通对话 + 圆桌会议）
 * 使用稳定的回调函数引用，避免每次渲染创建新函数导致 React.memo 失效
 */
type UnifiedChatType = (Chat & { chatType: 'normal' }) | (RoundtableChat & { chatType: 'roundtable' });

interface ChatListItemProps {
    chat: UnifiedChatType;
    isSelected: boolean;
    // v2.5.0: 使用稳定的回调，在组件内部调用时传入参数
    onSelect: (chatId: string) => void;
    onDeleteClick: (chat: UnifiedChatType) => void;
    onRenameClick: (chat: UnifiedChatType) => void;
    setRenameValue: (value: string) => void;
    onToggleStar: (chatId: string) => void;
    formatTime: (date: Date) => string;
    noMessageText: string;
    // v4.2.0: 使用翻译对象替代 language 字符串
    t: ReturnType<typeof useI18n>['t'];
    // v2.4.0: 使用映射表替代数组，性能优化
    agentMap: Map<string, Agent>;
    modelMap: Map<string, AIModel>;
}

/**
 * v2.5.0: 对话列表项组件
 * 使用 React.memo 包装，配合稳定的回调函数引用避免不必要的重渲染
 */
const ChatListItem = React.memo<ChatListItemProps>(({
    chat,
    isSelected,
    onSelect,
    onDeleteClick,
    onRenameClick,
    setRenameValue,
    onToggleStar,
    formatTime,
    noMessageText,
    t,
    agentMap,
    modelMap,
}) => {
    const lastMessage = chat.messages[chat.messages.length - 1];
    const preview = lastMessage?.content.slice(0, 50) || noMessageText;

    // v4.0.0: 判断是否为圆桌会议
    const isRoundtable = chat.chatType === 'roundtable';

    // v2.4.0: 使用映射表 O(1) 查找，替代数组遍历
    // v4.0.0: 圆桌会议没有 agentId，使用第一个参与者的 Agent
    const agent = isRoundtable
        ? (chat.roundtableConfig.participants[0]?.agentId ? agentMap.get(chat.roundtableConfig.participants[0].agentId) : undefined)
        : (chat.agentId ? agentMap.get(chat.agentId) : undefined);
    const modelId = agent?.model || (!isRoundtable ? chat.model : undefined);
    const model = modelId ? modelMap.get(modelId) : undefined;
    const modelName = getChatModelDisplayName(model, modelId || '');

    // v2.5.0: 使用 useCallback 包装事件处理函数
    const handleClick = useCallback(() => {
        onSelect(chat.id);
    }, [onSelect, chat.id]);

    const handleDelete = useCallback(() => {
        onDeleteClick(chat);
    }, [onDeleteClick, chat]);

    const handleRename = useCallback(() => {
        onRenameClick(chat);
        setRenameValue(chat.title);
    }, [onRenameClick, setRenameValue, chat]);

    const handleToggleStar = useCallback(() => {
        onToggleStar(chat.id);
    }, [onToggleStar, chat.id]);

    // 复制对话内容
    const handleCopyChat = useCallback(() => {
        const content = chat.messages.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n\n');
        navigator.clipboard.writeText(content);
    }, [chat.messages]);

    // 右键菜单项
    const contextMenuItems: ContextMenuItem[] = [
        {
            id: 'rename',
            label: t.chat.rename,
            icon: <Edit3 size={14} />,
            onClick: handleRename,
        },
        {
            id: 'star',
            label: chat.starred ? t.chat.removeStar : t.chat.addStar,
            icon: chat.starred ? <StarOff size={14} /> : <Star size={14} />,
            onClick: handleToggleStar,
        },
        {
            id: 'copy',
            label: t.chat.copyChat,
            icon: <Copy size={14} />,
            onClick: handleCopyChat,
            disabled: chat.messages.length === 0,
        },
        { id: 'divider', label: '', divider: true },
        {
            id: 'delete',
            label: t.common.delete,
            icon: <Trash2 size={14} />,
            danger: true,
            onClick: handleDelete,
        },
    ];

    return (
        <ContextMenu items={contextMenuItems}>
            <div
                onClick={handleClick}
                className={`group relative p-3 rounded-[10px] cursor-pointer transition-all ${isSelected
                    ? 'bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 border border-purple-200 dark:border-purple-700 shadow-sm'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
            >
                <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        {chat.starred && (
                            <span className="text-yellow-500 text-xs">★</span>
                        )}
                        {/* v4.0.0: 圆桌会议图标 */}
                        {isRoundtable && (
                            <Users className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
                        )}
                        <span className="font-medium text-gray-800 dark:text-gray-100 text-sm truncate">
                            {chat.title}
                        </span>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{formatTime(chat.updatedAt)}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mb-1">{preview}</p>
                <div className="flex items-center gap-1 flex-wrap">
                    {/* v4.0.0: 圆桌会议显示参与者数量 */}
                    {isRoundtable && (
                        <span className="text-xs px-2 py-0.5 bg-purple-50 dark:bg-purple-900/30 rounded text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
                            👥 {chat.roundtableConfig.participants.length}
                        </span>
                    )}
                    {/* v2.3.0: 显示 Agent 名称（如果有，非圆桌会议） */}
                    {!isRoundtable && agent && (
                        <span className="text-xs px-2 py-0.5 bg-purple-50 dark:bg-purple-900/30 rounded text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
                            🤖 {agent.name}
                        </span>
                    )}
                    {/* 显示模型名称（非圆桌会议） */}
                    {!isRoundtable && modelName && (
                        <span className="text-xs px-2 py-0.5 bg-white dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                            {modelName}
                        </span>
                    )}
                </div>
            </div>
        </ContextMenu>
    );
});

export default ChatPage;
