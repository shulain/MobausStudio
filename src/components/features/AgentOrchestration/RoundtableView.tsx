/**
 * 圆桌会议视图组件
 *
 * 圆桌会议模式的主视图，包含：
 * - 讨论主题显示
 * - 参与者列表
 * - 消息列表（带角色标识）
 * - 输入区域（支持 @提及）
 * - 控制按钮（开始讨论、总结、停止）
 *
 * @module components/features/AgentOrchestration/RoundtableView
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    Users,
    Send,
    Square,
    MessageCircle,
    FileText,
    Clock,
    Play,
    AlertCircle,
} from 'lucide-react';
import type {
    Agent,
    RoundtableChat,
    RoundtableParticipant,
} from '../../../types';
import { RoundtableMessageBubble } from './RoundtableMessageBubble';
import { parseMentions, canContinueDiscussion } from './utils';
import { logger, LogTags } from '../../../utils/logger';

/**
 * 组件 Props
 */
interface RoundtableViewProps {
    /** 圆桌对话数据 */
    chat: RoundtableChat;
    /** 可用 Agent 列表 */
    agents: Agent[];
    /** 发送消息回调（可选，用于自由模式） */
    onSendMessage?: (content: string, targetParticipantIds?: string[]) => void;
    /** 开始全体讨论回调 */
    onStartDiscussion?: (chatId: string, userQuestion: string) => Promise<void>;
    /** 生成总结回调 */
    onSummarize?: (chatId: string) => Promise<void>;
    /** 进入下一轮回调 */
    onNextRound?: (chatId: string) => void;
    /** 停止生成回调 */
    onStopGenerating?: () => void;
    /** 是否正在生成 */
    isGenerating?: boolean;
    /** 当前发言者参与者 ID */
    currentSpeakerId?: string;
    /** v3.5.1: 生成开始时间（用于计时器在切换对话时保持正确时间） */
    generatingStartTime?: number;
}

/**
 * 生成计时器组件
 * v3.5.1: 支持传入开始时间，切换对话时保持正确计时
 */
const GenerationTimer: React.FC<{ startTime?: number }> = ({ startTime }) => {
    const [seconds, setSeconds] = useState(0);
    // 如果没有传入 startTime，使用组件挂载时间作为回退
    const fallbackStartTimeRef = useRef<number>(Date.now());

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
            <span>生成中 {formatTime(seconds)}</span>
        </div>
    );
};

/**
 * 圆桌会议视图组件
 */
export const RoundtableView: React.FC<RoundtableViewProps> = ({
    chat,
    agents,
    onSendMessage,
    onStartDiscussion,
    onSummarize,
    onNextRound,
    onStopGenerating,
    isGenerating = false,
    currentSpeakerId,
    // v3.5.1: 生成开始时间
    generatingStartTime,
}) => {
    // ==================== 状态管理 ====================

    // 输入内容
    const [inputValue, setInputValue] = useState('');

    // @提及下拉菜单
    const [showMentionMenu, setShowMentionMenu] = useState(false);
    const [mentionFilter, setMentionFilter] = useState('');

    // 滚动控制
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const messagesContentRef = useRef<HTMLDivElement>(null);
    const isProgrammaticScrollRef = useRef(false);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

    // 输入法组合状态
    const isComposingRef = useRef(false);
    // v2.7.0: 记录 compositionEnd 时间戳，防止输入法回车误发送
    const compositionEndTimeRef = useRef(0);

    /**
     * v2.7.0: 输入框 ref，用于焦点管理
     */
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // ==================== 计算属性 ====================

    const { roundtableConfig } = chat;
    const { participants, rules, topic, currentRound, status } = roundtableConfig;

    // 是否可以继续讨论
    const canContinue = useMemo(() => {
        return canContinueDiscussion(roundtableConfig);
    }, [roundtableConfig]);

    // 是否为自由发言模式
    const isFreeMode = rules.speakMode === 'free';

    // 过滤后的参与者（用于 @提及菜单）
    const filteredParticipants = useMemo(() => {
        if (!mentionFilter) return participants;
        const filter = mentionFilter.toLowerCase();
        return participants.filter(p =>
            p.role.toLowerCase().includes(filter) ||
            agents.find(a => a.id === p.agentId)?.name.toLowerCase().includes(filter)
        );
    }, [participants, mentionFilter, agents]);

    // ==================== 事件处理 ====================

    /**
     * 处理输入变化
     * v4.1.4: 所有模式都支持 @提及
     */
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setInputValue(value);

        // 检测 @ 符号（所有模式都支持）
        const lastAtIndex = value.lastIndexOf('@');
        if (lastAtIndex !== -1) {
            const textAfterAt = value.slice(lastAtIndex + 1);
            // 如果 @ 后面没有空格，显示提及菜单
            if (!textAfterAt.includes(' ')) {
                setShowMentionMenu(true);
                setMentionFilter(textAfterAt);
            } else {
                setShowMentionMenu(false);
            }
        } else {
            setShowMentionMenu(false);
        }
    }, []);

    /**
     * 选择提及的参与者
     */
    const handleSelectMention = useCallback((participant: RoundtableParticipant) => {
        const lastAtIndex = inputValue.lastIndexOf('@');
        if (lastAtIndex !== -1) {
            const newValue = inputValue.slice(0, lastAtIndex) + `@${participant.role} `;
            setInputValue(newValue);
        }
        setShowMentionMenu(false);
        setMentionFilter('');
    }, [inputValue]);

    /**
     * 发送消息
     */
    const handleSend = useCallback(() => {
        const content = inputValue.trim();
        if (!content) return;

        // 解析 @提及
        const mentionedIds = parseMentions(content, participants, agents);

        logger.info(LogTags.CHAT, '发送圆桌消息', {
            content: content.slice(0, 50),
            mentionedIds,
            isFreeMode,
        });

        // 发送消息
        onSendMessage?.(content, mentionedIds.length > 0 ? mentionedIds : undefined);
        setInputValue('');
        setShowMentionMenu(false);
    }, [inputValue, participants, agents, isFreeMode, onSendMessage]);

    /**
     * 处理键盘事件
     * v2.7.0: 增加时间戳判定，防止 compositionEnd 后紧跟的 Enter 误发送
     */
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        // 输入法组合状态下不处理
        if (isComposingRef.current || e.nativeEvent.isComposing) {
            return;
        }

        // 提及菜单打开时，处理上下键和回车
        if (showMentionMenu && filteredParticipants.length > 0) {
            if (e.key === 'Escape') {
                e.preventDefault();
                setShowMentionMenu(false);
                return;
            }
            // 简化处理：回车选择第一个
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSelectMention(filteredParticipants[0]);
                return;
            }
        }

        // 普通回车发送
        if (e.key === 'Enter' && !e.shiftKey) {
            // 如果 compositionEnd 刚刚触发（100ms 内），说明这个 Enter 是输入法操作的一部分
            if (Date.now() - compositionEndTimeRef.current < 100) {
                return;
            }
            e.preventDefault();
            handleSend();
        }
    }, [showMentionMenu, filteredParticipants, handleSelectMention, handleSend]);

    const scrollToBottom = useCallback(() => {
        if (!scrollContainerRef.current) return;
        isProgrammaticScrollRef.current = true;
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        requestAnimationFrame(() => {
            isProgrammaticScrollRef.current = false;
        });
    }, []);

    /**
     * 滚动处理
     */
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        if (isProgrammaticScrollRef.current) {
            return;
        }
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        setShouldAutoScroll(isAtBottom);
    }, []);

    /**
     * 点击引用跳转
     */
    const handleQuoteClick = useCallback((messageId: string) => {
        const element = document.getElementById(`message-${messageId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('ring-2', 'ring-purple-500');
            setTimeout(() => {
                element.classList.remove('ring-2', 'ring-purple-500');
            }, 2000);
        }
    }, []);

    // ==================== 副作用 ====================

    // 自动滚动到底部
    useEffect(() => {
        if (shouldAutoScroll) {
            scrollToBottom();
        }
    }, [chat.messages, isGenerating, shouldAutoScroll, scrollToBottom]);

    // 工具卡片和消息内容异步展开会引发高度变化，自动跟随开启时保持到底部
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
    }, [shouldAutoScroll, scrollToBottom, chat.id]);

    // 切换对话时滚动到底部并聚焦输入框
    // v2.7.0: 添加自动聚焦
    useEffect(() => {
        setShouldAutoScroll(true);
        requestAnimationFrame(() => {
            scrollToBottom();
            textareaRef.current?.focus();
        });
    }, [chat.id, scrollToBottom]);

    // ==================== 渲染 ====================

    return (
        <div className="flex-1 min-w-0 flex flex-col bg-gradient-to-b from-gray-50 to-white dark:from-gray-800 dark:to-gray-900">
            {/* 顶部信息栏 - v4.1.4: 合并参与者到标题行 */}
            <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3">
                <div className="flex items-center justify-between">
                    {/* 左侧：主题、状态和参与者 */}
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-[10px] bg-gradient-to-bl from-[#A688F6] to-[#009BF3] flex items-center justify-center flex-shrink-0">
                            <Users className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                                    {topic}
                                </h2>
                                <span className={`px-2 py-0.5 rounded-full text-xs flex-shrink-0 ${
                                    status === 'discussing'
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                        : status === 'completed'
                                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                                        : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                }`}>
                                    {status === 'setup' && '准备中'}
                                    {status === 'discussing' && '讨论中'}
                                    {status === 'summarizing' && '总结中'}
                                    {status === 'completed' && '已完成'}
                                </span>
                            </div>
                            {/* 第二行：轮数 + 参与者头像 */}
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
                                    {/* v4.1.6: 支持无限制轮数显示 */}
                                    {rules.maxRounds === 999 ? `第 ${currentRound} 轮` : `第 ${currentRound}/${rules.maxRounds} 轮`}
                                </span>
                                <span className="text-gray-300 dark:text-gray-600">|</span>
                                {/* 参与者头像列表 - v4.1.7: 修复高亮环被截断的问题，增加左右 padding */}
                                <div className="flex items-center gap-2 overflow-x-auto py-1.5 px-1">
                                    {participants.map(participant => (
                                        <div
                                            key={participant.id}
                                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all flex-shrink-0 ${
                                                isGenerating && currentSpeakerId === participant.id
                                                    ? 'bg-purple-100 dark:bg-purple-900/30 ring-2 ring-purple-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-900'
                                                    : 'bg-gray-100 dark:bg-gray-800'
                                            }`}
                                            title={`${participant.role} - ${participant.messageCount} 条消息`}
                                        >
                                            <span className="text-base">{participant.avatar}</span>
                                            <span className="text-gray-600 dark:text-gray-400 max-w-[60px] truncate">
                                                {participant.role}
                                            </span>
                                            {isGenerating && currentSpeakerId === participant.id && (
                                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 右侧：控制按钮 */}
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                        {status === 'setup' && (
                            <button
                                onClick={() => {
                                    if (onStartDiscussion) {
                                        logger.info(LogTags.UI, '开始圆桌讨论', { chatId: chat.id, topic });
                                        onStartDiscussion(chat.id, topic)
                                            .catch((err) => {
                                                logger.error(LogTags.UI, '开始圆桌讨论失败', err);
                                            });
                                    } else {
                                        logger.warn(LogTags.UI, 'onStartDiscussion 回调不存在');
                                    }
                                }}
                                disabled={isGenerating}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-bl from-[#A688F6] to-[#009BF3] text-white text-sm font-medium rounded-[10px] hover:shadow-lg disabled:opacity-50 transition-all"
                            >
                                <Play className="w-4 h-4" />
                                开始讨论
                            </button>
                        )}
                        {(status === 'discussing' || status === 'completed') && (
                            <button
                                onClick={() => onSummarize?.(chat.id)}
                                disabled={isGenerating || chat.messages.length === 0}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-all"
                            >
                                <FileText className="w-4 h-4" />
                                生成总结
                            </button>
                        )}
                        {/* v4.1.9: 无限制模式显示下一轮按钮（手动控制），固定轮数模式不显示（自动完成） */}
                        {status === 'discussing' && canContinue && rules.maxRounds === 999 && (
                            <button
                                onClick={() => onNextRound?.(chat.id)}
                                disabled={isGenerating}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-all"
                            >
                                <Play className="w-4 h-4" />
                                下一轮
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* 消息区域 */}
            <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto overflow-x-hidden p-6"
                onScroll={handleScroll}
                style={{ overflowAnchor: 'none' }}
            >
                {chat.messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                        <div className="text-center">
                            <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <p className="text-lg mb-2">准备开始圆桌会议</p>
                            <p className="text-sm">
                                {status === 'setup'
                                    ? '点击"开始讨论"让 Agent 们围绕主题展开讨论'
                                    : '输入问题开始讨论'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div ref={messagesContentRef} className="max-w-4xl mx-auto pb-4">
                        {chat.messages.map((message) => (
                            <div key={message.id} id={`message-${message.id}`}>
                                <RoundtableMessageBubble
                                    message={message}
                                    participants={participants}
                                    isUserMessage={message.role === 'user'}
                                    onQuoteClick={handleQuoteClick}
                                />
                            </div>
                        ))}

                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* 输入区域 */}
            <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-6">
                {/* 达到最大轮数提示 */}
                {/* v4.1.5: 只在讨论中且达到最大轮数时显示提示，总结中不显示 */}
                {!canContinue && status === 'discussing' && !isGenerating && (
                    <div className="max-w-4xl mx-auto mb-4 flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-[10px] text-yellow-700 dark:text-yellow-400 text-sm">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>已达到最大讨论轮数，可以生成总结或继续追问</span>
                    </div>
                )}

                <div className="max-w-4xl mx-auto relative">
                    {/* @提及下拉菜单 */}
                    {showMentionMenu && filteredParticipants.length > 0 && (
                        <div className="absolute bottom-full left-0 mb-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-[10px] shadow-lg overflow-hidden z-10">
                            <div className="p-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                                选择要 @的参与者
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                                {filteredParticipants.map(participant => {
                                    const agent = agents.find(a => a.id === participant.agentId);
                                    return (
                                        <button
                                            key={participant.id}
                                            onClick={() => handleSelectMention(participant)}
                                            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                        >
                                            <span className="text-xl">{participant.avatar}</span>
                                            <div className="text-left">
                                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                    {participant.role}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                                    {agent?.name || '未知 Agent'}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* v4.1.3: 发言状态显示在输入框区域 */}
                    {isGenerating ? (
                        <div className="flex gap-3 items-center">
                            <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-2xl border-2 border-purple-300 dark:border-purple-600 px-5 py-4">
                                {/* v4.1.10: 移除并行模式，只保留顺序模式和通用状态 */}
                                {currentSpeakerId ? (
                                    // 顺序模式：显示当前发言者信息
                                    (() => {
                                        const speaker = participants.find(p => p.id === currentSpeakerId);
                                        return (
                                            <div className="flex items-center gap-3">
                                                <span className="text-2xl">{speaker?.avatar || '🤖'}</span>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-gray-900 dark:text-white">{speaker?.role || '参与者'}</span>
                                                        <span className="text-sm text-purple-600 dark:text-purple-400">正在发言</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 mt-1">
                                                        <div className="flex gap-1">
                                                            <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                                            <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                                            <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                                        </div>
                                                        <GenerationTimer startTime={generatingStartTime} />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()
                                ) : (
                                    // 没有指定发言者时显示通用状态
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                                            <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                        </div>
                                        <div className="flex-1">
                                            <span className="text-gray-600 dark:text-gray-300">Agent 正在思考...</span>
                                            <div className="mt-1">
                                                <GenerationTimer startTime={generatingStartTime} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 停止按钮 */}
                            <button
                                onClick={onStopGenerating}
                                className="p-4 bg-red-500 text-white rounded-[10px] hover:bg-red-600 hover:shadow-xl transition-all"
                                title="停止生成"
                            >
                                <Square fill="currentColor" className="w-5 h-5" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-3 items-end">
                            <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-600 px-5 py-4 focus-within:border-purple-300 dark:focus-within:border-purple-600 transition-colors">
                                <textarea
                                    ref={textareaRef}
                                    value={inputValue}
                                    onChange={handleInputChange}
                                    onKeyDown={handleKeyDown}
                                    onCompositionStart={() => { isComposingRef.current = true; }}
                                    onCompositionEnd={() => {
                                        // v2.7.0: 记录结束时间戳 + rAF 延迟重置，双重保护
                                        compositionEndTimeRef.current = Date.now();
                                        requestAnimationFrame(() => {
                                            isComposingRef.current = false;
                                        });
                                    }}
                                    placeholder="输入消息，使用 @角色名 向特定参与者提问... (Shift+Enter 换行)"
                                    rows={1}
                                    style={{ minHeight: '24px', maxHeight: '120px' }}
                                    className="w-full bg-transparent focus:outline-none text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none"
                                    onInput={(e) => {
                                        const target = e.target as HTMLTextAreaElement;
                                        target.style.height = 'auto';
                                        target.style.height = target.scrollHeight + 'px';
                                    }}
                                />
                            </div>

                            {/* 发送按钮 */}
                            <button
                                onClick={handleSend}
                                disabled={!inputValue.trim()}
                                className="mb-1 p-4 bg-gradient-to-bl from-[#A688F6] to-[#009BF3] text-white rounded-[10px] hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Send className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RoundtableView;
