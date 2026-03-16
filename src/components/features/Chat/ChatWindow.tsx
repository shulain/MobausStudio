import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    MessageCircle,
    Send,
    Clock,
    Square,
    PlugZap,
    ChevronUp,
    AlertCircle,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Loader2,
} from 'lucide-react';
import { processFile, getFilesFromDataTransfer } from '../../../utils/attachmentUtils';
import type { Chat, AIModel, Attachment, Agent, MCPServer } from '../../../types';
import { MessageBubble } from './MessageBubble';
import { AttachmentUpload } from './AttachmentUpload';
import { logger, LogTags } from '../../../utils/logger';
import { useI18n } from '../../../i18n';
import { CHAT_MESSAGE_CONFIG } from '../../../config/constants';

/**
 * v2.5.0: 消息懒加载配置
 * 初始只渲染最新消息，滚动到顶部时加载更多历史
 */
const { INITIAL_COUNT: INITIAL_MESSAGE_COUNT, LOAD_MORE_COUNT, LOAD_MORE_THRESHOLD } = CHAT_MESSAGE_CONFIG;

interface ChatWindowProps {
    chat: Chat | null;
    models: AIModel[];
    selectedModel: string;
    onModelChange: (model: string) => void;
    // 更新签名：支持附件
    onSendMessage: (content: string, attachments: Attachment[]) => void;
    onStopGenerating: () => void;
    isGenerating?: boolean; // 新增：生成状态
    // v3.5.1: 生成开始时间（用于计时器在切换对话时保持正确时间）
    generatingStartTime?: number;
    // MCP/Agent 集成 (v2.1.0)
    agents?: Agent[];                      // 启用工具的 Agent 列表
    selectedAgentId?: string | null;       // 当前选中的 Agent ID
    onAgentChange?: (agentId: string | null) => void;  // Agent 选择变更
    mcpServers?: MCPServer[];              // MCP 服务器列表
}

/**
 * 简单的计时器组件
 * v3.5.1: 支持传入开始时间，切换对话时保持正确计时
 */
const GenerationTimer: React.FC<{ label: string; startTime?: number }> = ({ label, startTime }) => {
    const [seconds, setSeconds] = useState(0);
    // 如果没有传入 startTime，使用组件挂载时间作为回退
    const fallbackStartTimeRef = React.useRef<number>(Date.now());

    useEffect(() => {
        // 使用传入的 startTime 或回退到组件挂载时间
        const effectiveStartTime = startTime || fallbackStartTimeRef.current;

        // 计算已经过去的秒数
        const calculateElapsed = () => {
            return Math.floor((Date.now() - effectiveStartTime) / 1000);
        };

        // 初始化时设置已过去的时间
        setSeconds(calculateElapsed());

        const timer = setInterval(() => {
            setSeconds(calculateElapsed());
        }, 1000);
        return () => clearInterval(timer);
    }, [startTime]);

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded-full animate-pulse">
            <Clock size={12} />
            <span>{label} {formatTime(seconds)}</span>
        </div>
    );
};

/**
 * v2.4.0: 聊天窗口组件
 * 使用 React.memo 包装，避免不必要的重渲染
 */
export const ChatWindow = React.memo<ChatWindowProps>(({
    chat,
    models,
    selectedModel,
    onModelChange,
    onSendMessage,
    onStopGenerating,
    isGenerating = false,
    // v3.5.1: 生成开始时间
    generatingStartTime,
    agents = [],
    selectedAgentId,
    onAgentChange,
    mcpServers = [],
}) => {
    const { t } = useI18n();
    const [inputValue, setInputValue] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isDragOver, setIsDragOver] = useState(false); // 拖拽状态

    /**
     * v2.5.0: 消息懒加载状态
     * 初始只显示最新的 N 条消息，滚动到顶部时加载更多
     */
    const [visibleCount, setVisibleCount] = useState(INITIAL_MESSAGE_COUNT);

    // 滚动控制 Refs
    const messagesEndRef = React.useRef<HTMLDivElement>(null);
    const scrollContainerRef = React.useRef<HTMLDivElement>(null);
    const messagesContentRef = React.useRef<HTMLDivElement>(null);
    const isProgrammaticScrollRef = React.useRef(false);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
    // v2.5.0: 用于防止重复加载
    const isLoadingMoreRef = React.useRef(false);

    const scrollToBottom = useCallback(() => {
        if (!scrollContainerRef.current) return;
        isProgrammaticScrollRef.current = true;
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        requestAnimationFrame(() => {
            isProgrammaticScrollRef.current = false;
        });
    }, []);

    /**
     * v2.3.0: 使用 ref 跟踪输入法组合状态
     * 比 isComposing 更可靠，兼容各种浏览器和输入法
     */
    const isComposingRef = React.useRef(false);

    /**
     * v2.7.0: 记录 compositionEnd 触发的时间戳
     * 用于在 keyDown 中判断 Enter 是否来自输入法操作
     * Chromium 中 compositionEnd 先于 keyDown 触发，
     * rAF 延迟不可靠（可能被分派到不同任务），改用时间戳判定
     */
    const compositionEndTimeRef = React.useRef(0);

    /**
     * v2.7.0: 输入框 ref，用于焦点管理
     * 解决组件重渲染、状态切换时焦点丢失的问题
     */
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    // 获取当前选中 Agent 的工具数量
    // v2.3.0: 修复 - 需要同时检查 enableToolUse 是否开启
    // v2.4.0: 性能优化 - 使用 useMemo 缓存计算结果，避免每次渲染都重新计算
    // v2.5.1: 修复依赖问题 - mcpServers 是对象，使用 JSON.stringify 创建稳定的依赖键
    // v2.6.0: 添加详细的 MCP 状态信息
    const selectedAgent = selectedAgentId ? agents.find(a => a.id === selectedAgentId) : undefined;
    const mcpServersKey = useMemo(
        () => JSON.stringify(selectedAgent?.mcpServers),
        [selectedAgent?.mcpServers]
    );

    /**
     * v2.6.0: 计算 Agent 关联的 MCP 服务器状态摘要
     * 包含工具总数、连接状态统计、是否有问题等
     */
    const mcpStatusSummary = useMemo(() => {
        if (!selectedAgent?.enableToolUse || !selectedAgent?.mcpServers) {
            return {
                totalTools: 0,
                totalServers: 0,
                connectedServers: 0,
                disconnectedServers: 0,
                errorServers: 0,
                deletedServers: 0,
                hasIssues: false,
                hasWarnings: false,
                isReady: false,
            };
        }

        let totalTools = 0;
        let connectedServers = 0;
        let disconnectedServers = 0;
        let errorServers = 0;
        let deletedServers = 0;

        for (const config of selectedAgent.mcpServers) {
            const server = mcpServers.find(s => s.id === config.serverId);
            if (!server) {
                deletedServers++;
                continue;
            }

            switch (server.status) {
                case 'connected':
                    connectedServers++;
                    totalTools += server.tools?.length || 0;
                    break;
                case 'error':
                    errorServers++;
                    break;
                case 'disconnected':
                case 'connecting':
                default:
                    disconnectedServers++;
                    break;
            }
        }

        const totalServers = selectedAgent.mcpServers.length;
        const hasIssues = deletedServers > 0 || errorServers > 0;
        const hasWarnings = disconnectedServers > 0;
        const isReady = connectedServers > 0 && !hasIssues;

        return {
            totalTools,
            totalServers,
            connectedServers,
            disconnectedServers,
            errorServers,
            deletedServers,
            hasIssues,
            hasWarnings,
            isReady,
        };
    }, [selectedAgent?.id, selectedAgent?.enableToolUse, mcpServersKey, mcpServers]);

    // 保持向后兼容的 toolCount
    const toolCount = mcpStatusSummary.totalTools;

    /**
     * v3.6.0: 筛选可用模型（status === 'online'）
     * Chat 模块的模型选择器仅显示已验证可用的模型
     */
    const availableModels = useMemo(() => {
        return models.filter(m => m.status === 'online');
    }, [models]);

    // 切换对话时清空输入框 (独立输入框)
    // v2.5.0: 同时重置可见消息数量
    // v2.7.0: 切换对话后自动聚焦输入框
    useEffect(() => {
        setInputValue('');
        setAttachments([]);
        setVisibleCount(INITIAL_MESSAGE_COUNT);
        // 延迟聚焦，等待 DOM 更新完成
        requestAnimationFrame(() => {
            textareaRef.current?.focus();
        });
    }, [chat?.id]);

    /**
     * v2.7.0: AI 生成结束后自动聚焦输入框
     * 避免用户需要手动点击输入框才能继续输入
     */
    const prevIsGeneratingRef = React.useRef(isGenerating);
    useEffect(() => {
        if (prevIsGeneratingRef.current && !isGenerating) {
            // 从生成中变为非生成中，自动聚焦
            requestAnimationFrame(() => {
                textareaRef.current?.focus();
            });
        }
        prevIsGeneratingRef.current = isGenerating;
    }, [isGenerating]);

    const handleSend = () => {
        if (inputValue.trim() || attachments.length > 0) {
            onSendMessage(inputValue.trim(), attachments);
            setInputValue('');
            setAttachments([]); // 清空附件
        }
    };

    /**
     * 处理键盘事件
     * v2.3.0: 修复 - 使用 isComposingRef 跟踪输入法组合状态
     * v2.7.0: 增加时间戳判定，防止 compositionEnd 后紧跟的 Enter 误发送
     */
    const handleKeyDown = (e: React.KeyboardEvent) => {
        // 如果处于输入法组合状态（如中文输入法选词），不处理回车
        if (isComposingRef.current || e.nativeEvent.isComposing) {
            return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            // 如果 compositionEnd 刚刚触发（100ms 内），说明这个 Enter 是输入法操作的一部分
            // 例如：用户在输入法中按回车键入原始英文，此时不应发送消息
            if (Date.now() - compositionEndTimeRef.current < 100) {
                return;
            }
            e.preventDefault();
            handleSend();
        }
    };

    /**
     * v2.3.0: 输入法开始组合（如开始输入中文拼音）
     */
    const handleCompositionStart = () => {
        isComposingRef.current = true;
    };

    /**
     * v2.3.0: 输入法结束组合（如选词完成）
     * v2.7.0: 记录结束时间戳，并用 rAF 延迟重置 composing 标志
     * 双重保护：时间戳 + ref 状态，确保各种 Chromium 事件时序下都不会误发送
     */
    const handleCompositionEnd = () => {
        compositionEndTimeRef.current = Date.now();
        requestAnimationFrame(() => {
            isComposingRef.current = false;
        });
    };

    // 处理粘贴
    const handlePaste = async (e: React.ClipboardEvent) => {
        const files = getFilesFromDataTransfer(e.clipboardData.items);
        if (files.length > 0) {
            e.preventDefault();
            const newAttachments: Attachment[] = [];
            for (const file of files) {
                try {
                    const attachment = await processFile(file);
                    newAttachments.push(attachment);
                } catch (err) {
                    logger.error(LogTags.CHAT, '粘贴文件失败', err);
                }
            }
            if (newAttachments.length > 0) {
                setAttachments(prev => [...prev, ...newAttachments]);
            }
        }
    };

    // 处理拖拽
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        const files = getFilesFromDataTransfer(e.dataTransfer.items);
        if (files.length > 0) {
            const newAttachments: Attachment[] = [];
            for (const file of files) {
                try {
                    const attachment = await processFile(file);
                    newAttachments.push(attachment);
                } catch (err) {
                    logger.error(LogTags.CHAT, '拖拽文件失败', err);
                }
            }
            if (newAttachments.length > 0) {
                setAttachments(prev => [...prev, ...newAttachments]);
            }
        }
    };

    // v2.5.0: 计算可见消息（只取最后 N 条）
    const visibleMessages = useMemo(() => {
        if (!chat?.messages) return [];
        const total = chat.messages.length;
        if (total <= visibleCount) return chat.messages;
        return chat.messages.slice(total - visibleCount);
    }, [chat?.messages, visibleCount]);

    // v2.5.0: 是否还有更多历史消息
    const hasMoreMessages = (chat?.messages.length || 0) > visibleCount;

    /**
     * v2.5.0: 滚动处理 - 支持懒加载
     * v4.2.2: 优化滚动灵敏度，阈值从 50px 降至 10px，提高跟随响应速度
     * 接近顶部时加载更多历史消息，接近底部时开启自动跟随
     */
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        if (isProgrammaticScrollRef.current) {
            return;
        }

        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        const distanceToBottom = scrollHeight - scrollTop - clientHeight;
        const isNearBottom = distanceToBottom < 48;

        // 接近顶部且不在底部时加载更多历史消息
        // 修复：当消息总高度接近一屏时，底部 scrollTop 也可能 < LOAD_MORE_THRESHOLD，
        // 导致误触发“加载更多”并把视图拉回前文。
        if (scrollTop < LOAD_MORE_THRESHOLD && !isNearBottom && hasMoreMessages && !isLoadingMoreRef.current) {
            isLoadingMoreRef.current = true;
            // 记录当前滚动高度，用于加载后恢复位置
            const prevScrollHeight = scrollHeight;

            setVisibleCount(prev => {
                const newCount = Math.min(prev + LOAD_MORE_COUNT, chat?.messages.length || prev);
                // 加载后恢复滚动位置（保持视觉连续）
                requestAnimationFrame(() => {
                    if (scrollContainerRef.current) {
                        const newScrollHeight = scrollContainerRef.current.scrollHeight;
                        const scrollDiff = newScrollHeight - prevScrollHeight;
                        scrollContainerRef.current.scrollTop = scrollTop + scrollDiff;
                    }
                    isLoadingMoreRef.current = false;
                });
                return newCount;
            });
        }

        // 底部检测（用于自动跟随）
        // 阈值适度放宽，避免布局轻微抖动导致 shouldAutoScroll 被意外关闭
        const isAtBottom = distanceToBottom < 48;
        setShouldAutoScroll(isAtBottom);
    }, [hasMoreMessages, chat?.messages.length]);

    // 消息更新或生成时，如果应该跟随，则滚动到底部
    useEffect(() => {
        if (shouldAutoScroll) {
            scrollToBottom();
        }
    }, [chat?.messages, isGenerating, shouldAutoScroll, scrollToBottom]);

    // v4.2.3: 工具卡片展开/图片加载会导致消息区高度异步变化
    // 在自动跟随开启时，监听消息区尺寸变化并保持到底部，避免“回跳到工具执行记录附近”
    useEffect(() => {
        if (!messagesContentRef.current || typeof ResizeObserver === 'undefined') {
            return;
        }

        const observer = new ResizeObserver(() => {
            if (shouldAutoScroll) {
                scrollToBottom();
            }
        });

        observer.observe(messagesContentRef.current);
        return () => observer.disconnect();
    }, [shouldAutoScroll, scrollToBottom, chat?.id]);

    // 初始加载/切换对话时滚动到底部
    // v2.5.0: 使用 useLayoutEffect 确保在 DOM 更新后立即执行，避免闪烁
    React.useLayoutEffect(() => {
        setShouldAutoScroll(true);
        // 使用 requestAnimationFrame 确保 DOM 已渲染完成
        requestAnimationFrame(scrollToBottom);
    }, [chat?.id, scrollToBottom]);

    return (
        <div
            className={`flex-1 min-w-0 flex flex-col bg-gradient-to-b from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 ${isDragOver ? 'opacity-80 ring-2 ring-purple-500' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* 顶部工具栏 */}
            <div className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6">
                <div className="flex items-center gap-4">
                    {/* Agent 选择器 - 有 Agent 时显示 (v2.1.0) */}
                    {agents.length > 0 && onAgentChange && (
                        <div className="flex items-center gap-2">
                            <select
                                value={selectedAgentId || ''}
                                onChange={(e) => onAgentChange(e.target.value || null)}
                                className="min-w-[160px] px-3 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-[10px] border border-gray-200 dark:border-gray-600 text-sm font-medium text-gray-800 dark:text-gray-100"
                            >
                                <option value="">{t.chat.directChat}</option>
                                {agents.map((agent) => (
                                    <option key={agent.id} value={agent.id}>
                                        🤖 {agent.name}
                                    </option>
                                ))}
                            </select>

                            {/* v2.6.0: 选中 Agent 时显示 MCP 状态徽章 */}
                            {selectedAgent && selectedAgent.enableToolUse && mcpStatusSummary.totalServers > 0 && (
                                <>
                                    {/* 有严重问题（删除/错误） */}
                                    {mcpStatusSummary.hasIssues ? (
                                        <div
                                            className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded-full cursor-help"
                                            title={`${mcpStatusSummary.deletedServers > 0 ? `${mcpStatusSummary.deletedServers} 个 MCP 已删除` : ''}${mcpStatusSummary.errorServers > 0 ? `${mcpStatusSummary.deletedServers > 0 ? ', ' : ''}${mcpStatusSummary.errorServers} 个 MCP 连接失败` : ''}`}
                                        >
                                            <XCircle size={12} />
                                            <span>MCP 异常</span>
                                        </div>
                                    ) : mcpStatusSummary.hasWarnings ? (
                                        /* 有警告（未启动） */
                                        <div
                                            className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 px-2 py-1 rounded-full cursor-help"
                                            title={`${mcpStatusSummary.disconnectedServers} 个 MCP 未启动，${mcpStatusSummary.connectedServers}/${mcpStatusSummary.totalServers} 已连接`}
                                        >
                                            <AlertTriangle size={12} />
                                            <span>{mcpStatusSummary.connectedServers}/{mcpStatusSummary.totalServers} MCP</span>
                                        </div>
                                    ) : mcpStatusSummary.isReady ? (
                                        /* 全部就绪 */
                                        <div
                                            className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full cursor-help"
                                            title={`${mcpStatusSummary.connectedServers} 个 MCP 已连接，共 ${toolCount} 个工具可用`}
                                        >
                                            <CheckCircle2 size={12} />
                                            <span>{toolCount} {t.chat.tools}</span>
                                        </div>
                                    ) : (
                                        /* 连接中 */
                                        <div
                                            className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-full"
                                            title="MCP 服务器连接中..."
                                        >
                                            <Loader2 size={12} className="animate-spin" />
                                            <span>连接中</span>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* 无 MCP 配置时显示普通工具图标 */}
                            {selectedAgent && (!selectedAgent.enableToolUse || mcpStatusSummary.totalServers === 0) && (
                                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
                                    <PlugZap size={12} />
                                    <span>无工具</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 模型选择器 - 仅在未选择 Agent 时显示 (v2.1.0) */}
                    {/* v3.6.0: 仅显示可用（online）模型 */}
                    {!selectedAgent && (
                        availableModels.length === 0 ? (
                            <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5 rounded-[10px]">
                                <AlertCircle size={16} />
                                <span>{t.models.noAvailableModels}</span>
                            </div>
                        ) : (
                            <select
                                value={selectedModel}
                                onChange={(e) => onModelChange(e.target.value)}
                                disabled={availableModels.length === 0}
                                className="min-w-[200px] px-3 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-[10px] border border-gray-200 dark:border-gray-600 text-sm font-medium text-gray-800 dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {availableModels.map((model) => (
                                    <option key={model.id} value={model.id}>
                                        {model.name}
                                    </option>
                                ))}
                            </select>
                        )
                    )}

                    {/* 选中 Agent 时显示模型信息（只读）(v2.1.0) */}
                    {selectedAgent && (
                        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-[10px]">
                            <span>{t.chat.model}:</span>
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                                {models.find(m => m.id === selectedAgent.model)?.name || selectedAgent.model}
                            </span>
                        </div>
                    )}
                </div>
                {chat && (
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">{chat.title}</h3>
                    </div>
                )}
            </div>

            {/* 消息区域 */}
            {/* v2.5.0: 移除 scroll-smooth 避免切换对话时的滚动动画闪烁 */}
            <div
                className="flex-1 overflow-y-auto overflow-x-hidden p-6"
                onScroll={handleScroll}
                ref={scrollContainerRef}
                style={{ overflowAnchor: 'none' }}
            >
                {!chat || chat.messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                        <div className="text-center">
                            <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <p>{t.chat.noMessages}</p>
                        </div>
                    </div>
                ) : (
                    <div ref={messagesContentRef} className="max-w-4xl mx-auto pb-4">
                        {/* v2.5.0: 顶部加载更多提示 */}
                        {hasMoreMessages && (
                            <div className="flex items-center justify-center gap-2 py-3 text-sm text-gray-400 dark:text-gray-500">
                                <ChevronUp size={16} />
                                <span>{t.chat.loadMoreHistory}</span>
                            </div>
                        )}

                        {/* v2.5.0: 只渲染可见消息 */}
                        {visibleMessages.map((message) => (
                            <MessageBubble key={message.id} message={message} />
                        ))}

                        {/* 计时器移至此处 */}
                        {isGenerating && (
                            <div className="flex justify-start px-4 mt-2 mb-4 animate-in fade-in slide-in-from-bottom-2">
                                <GenerationTimer label={t.chat.generating} startTime={generatingStartTime} />
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* 输入区域 */}
            <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-6">
                <div className="max-w-4xl mx-auto flex gap-3 items-end">
                    {/* 附件上传 */}
                    <div className="pb-2">
                        <AttachmentUpload
                            attachments={attachments}
                            onAttachmentsChange={setAttachments}
                        />
                    </div>

                    <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-600 px-5 py-4 focus-within:border-purple-300 dark:focus-within:border-purple-600 transition-colors">
                        <textarea
                            ref={textareaRef}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onPaste={handlePaste}
                            onKeyDown={handleKeyDown}
                            onCompositionStart={handleCompositionStart}
                            onCompositionEnd={handleCompositionEnd}
                            disabled={isGenerating}
                            placeholder={isGenerating ? t.chat.thinking : t.chat.inputPlaceholder}
                            rows={1}
                            style={{ minHeight: '24px', maxHeight: '120px' }}
                            className="w-full bg-transparent focus:outline-none text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none disabled:opacity-50"
                            onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = 'auto';
                                target.style.height = target.scrollHeight + 'px';
                            }}
                        />
                    </div>

                    {/* 发送/停止按钮 */}
                    {isGenerating ? (
                        <button
                            onClick={onStopGenerating}
                            className="mb-1 p-4 bg-red-500 text-white rounded-[10px] hover:bg-red-600 hover:shadow-xl transition-all"
                            title={t.chat.stopGeneration}
                        >
                            <Square fill="currentColor" className="w-5 h-5" />
                        </button>
                    ) : (
                        <button
                            onClick={handleSend}
                            disabled={!inputValue.trim() && attachments.length === 0}
                            className="mb-1 p-4 bg-gradient-to-bl from-[#A688F6] to-[#009BF3] text-white rounded-[10px] hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Send className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
});
