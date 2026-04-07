/**
 * 圆桌会议消息气泡组件
 *
 * 扩展基础 MessageBubble，添加圆桌会议特有功能：
 * - 显示发言者角色和头像
 * - 显示轮次标识
 * - 高亮引用的其他 Agent 观点
 * - 支持 @提及 显示
 * - v4.1.11: 支持图片渲染、文件下载
 * - v3.5.0: 使用共享 Markdown 组件，支持代码高亮、思考过程折叠
 *
 * @module components/features/AgentOrchestration/RoundtableMessageBubble
 */

import React, { useMemo } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RoundtableMessage, RoundtableParticipant, ToolResult } from '../../../types';
import {
    ThinkingBlock,
    createMarkdownComponents,
    parseThinkingContent,
    removeThinkingTags,
} from '../../common/markdown';
import { ToolCallList } from '../Chat/ToolCallDisplay';
import { useI18n } from '../../../i18n';

/**
 * 组件 Props
 */
interface RoundtableMessageBubbleProps {
    /** 消息数据 */
    message: RoundtableMessage;
    /** 参与者列表（用于显示信息和解析引用） */
    participants: RoundtableParticipant[];
    /** 是否为用户消息 */
    isUserMessage?: boolean;
    /** 点击引用时的回调 */
    onQuoteClick?: (messageId: string) => void;
}

/**
 * 参与者颜色映射
 * 将颜色名称映射到 Tailwind CSS 类
 */
const COLOR_MAP: Record<string, { bg: string; border: string; text: string }> = {
    purple: {
        bg: 'bg-purple-50 dark:bg-purple-900/20',
        border: 'border-purple-200 dark:border-purple-700',
        text: 'text-purple-700 dark:text-purple-300',
    },
    blue: {
        bg: 'bg-blue-50 dark:bg-blue-900/20',
        border: 'border-blue-200 dark:border-blue-700',
        text: 'text-blue-700 dark:text-blue-300',
    },
    green: {
        bg: 'bg-green-50 dark:bg-green-900/20',
        border: 'border-green-200 dark:border-green-700',
        text: 'text-green-700 dark:text-green-300',
    },
    orange: {
        bg: 'bg-orange-50 dark:bg-orange-900/20',
        border: 'border-orange-200 dark:border-orange-700',
        text: 'text-orange-700 dark:text-orange-300',
    },
    pink: {
        bg: 'bg-pink-50 dark:bg-pink-900/20',
        border: 'border-pink-200 dark:border-pink-700',
        text: 'text-pink-700 dark:text-pink-300',
    },
    cyan: {
        bg: 'bg-cyan-50 dark:bg-cyan-900/20',
        border: 'border-cyan-200 dark:border-cyan-700',
        text: 'text-cyan-700 dark:text-cyan-300',
    },
};

/**
 * 默认颜色（灰色）
 */
const DEFAULT_COLOR = {
    bg: 'bg-gray-50 dark:bg-gray-800',
    border: 'border-gray-200 dark:border-gray-700',
    text: 'text-gray-700 dark:text-gray-300',
};

/**
 * Markdown 渲染配置
 */
const remarkPlugins = [remarkGfm];

/**
 * v4.2.1: 允许的图片 MIME 类型白名单
 * 仅放行安全的图片格式，避免非图片 payload 混入
 */
const ALLOWED_IMAGE_DATA_RE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml|bmp|ico);base64,/;

/**
 * v4.2.1: 自定义 URL 转换
 * react-markdown v10 默认过滤 data: URL，仅放行图片白名单内的 base64 URL
 */
const urlTransform = (url: string) => {
    if (ALLOWED_IMAGE_DATA_RE.test(url)) return url;
    return defaultUrlTransform(url);
};

/**
 * v3.5.0: 使用共享 Markdown 组件配置
 * 支持代码高亮、图片放大、文件下载等功能
 */
const markdownComponents = createMarkdownComponents();

/**
 * 圆桌会议消息气泡组件
 */
export const RoundtableMessageBubble: React.FC<RoundtableMessageBubbleProps> = React.memo(({
    message,
    participants,
    isUserMessage = false,
    onQuoteClick,
}) => {
    const { t } = useI18n();
    // 获取发言参与者信息
    const participant = useMemo(() => {
        return participants.find(p => p.id === message.participantId);
    }, [participants, message.participantId]);

    // 获取颜色配置
    const colors = useMemo(() => {
        if (isUserMessage) {
            return {
                bg: 'bg-gradient-to-bl from-[#A688F6] to-[#009BF3]',
                border: '',
                text: 'text-white',
            };
        }
        return COLOR_MAP[participant?.color || ''] || DEFAULT_COLOR;
    }, [isUserMessage, participant?.color]);

    // 格式化时间
    const timeString = useMemo(() => {
        return new Date(message.createdAt).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
        });
    }, [message.createdAt]);

    // v3.5.0: 工具结果映射（用于 ToolCallList 组件）
    const toolResultsMap = useMemo(() => {
        if (!message.toolResults) {
            return new Map<string, ToolResult>();
        }
        return new Map(message.toolResults.map((r) => [r.callId, r]));
    }, [message.toolResults]);

    // v3.5.0: 提取思考内容（优先使用 reasoningContent 字段，否则解析 <think> 标签）
    const thinkingContent = useMemo(() => {
        // 优先使用 reasoningContent 字段（如果有）
        if (message.reasoningContent) {
            return message.reasoningContent;
        }
        // 否则从内容中解析 <think> 标签
        return parseThinkingContent(message.content);
    }, [message.reasoningContent, message.content]);

    // 处理 @提及高亮，并移除 <think> 标签
    const processedContent = useMemo(() => {
        // v3.5.0: 使用共享函数移除 think 标签
        let content = removeThinkingTags(message.content);

        // v4.1.11: 如果完全没有内容，显示友好提示
        if (!content) {
            // 如果有思考内容，不显示提示（ThinkingBlock 会显示）
            if (thinkingContent) {
                return '';
            }
            // 如果有工具调用卡片，不显示“正在思考中”占位文案
            if (message.toolCalls && message.toolCalls.length > 0) {
                return '';
            }
            return `*(${t.roundtable.thinking || '正在思考中...'})*`;
        }

        if (!message.mentionedParticipantIds?.length) {
            return content;
        }

        // 高亮 @提及（简单实现，实际可能需要更复杂的处理）
        for (const mentionedId of message.mentionedParticipantIds) {
            const mentionedParticipant = participants.find(p => p.id === mentionedId);
            if (mentionedParticipant) {
                // 替换 @角色名 为高亮格式
                const pattern = new RegExp(`@${mentionedParticipant.role}`, 'gi');
                content = content.replace(
                    pattern,
                    `**@${mentionedParticipant.role}**`
                );
            }
        }
        return content;
    }, [message.content, message.mentionedParticipantIds, message.toolCalls, participants, thinkingContent, t.roundtable.thinking]);

    // 用户消息样式
    if (isUserMessage) {
        return (
            <div className="flex justify-end mb-4">
                {/* v3.5.0: 放宽最大宽度，显示更多内容 */}
                <div className="max-w-[95%] lg:max-w-[90%]">
                    {/* 消息气泡 */}
                    <div className={`rounded-2xl px-4 py-3 shadow-sm ${colors.bg} ${colors.text}`}>
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </div>
                    {/* 时间戳 */}
                    <div className="text-right mt-1">
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                            {timeString}
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    // Agent 消息样式
    return (
        <div className="flex justify-start mb-4">
            {/* v3.5.0: 放宽最大宽度，显示更多内容 */}
            <div className="max-w-[95%] lg:max-w-[90%]">
                {/* 发言者信息 */}
                <div className="flex items-center gap-2 mb-1">
                    {/* 头像 */}
                    <span className="text-xl">{participant?.avatar || '🤖'}</span>
                    {/* 角色名 */}
                    <span className={`text-sm font-medium ${colors.text}`}>
                        {participant?.role || t.roundtable.unknownRole || '未知角色'}
                    </span>
                    {/* v4.1.5: 总结标识或轮次标识 */}
                    {message.isSummary ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 font-medium">
                            📋 {t.roundtable.summary || '总结'}
                        </span>
                    ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                            {(t.roundtable.roundN || '第 {round} 轮').replace('{round}', message.round.toString())}
                        </span>
                    )}
                </div>

                {/* 引用内容（如果有） */}
                {message.quotedContent && message.quotedContent.length > 0 && (
                    <div className="mb-2 space-y-1">
                        {message.quotedContent.map((quote, index) => {
                            const quotedParticipant = participants.find(
                                p => p.id === quote.participantId
                            );
                            return (
                                <div
                                    key={index}
                                    className="pl-3 border-l-2 border-gray-300 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-r py-1 pr-2"
                                    onClick={() => onQuoteClick?.(quote.messageId)}
                                >
                                    <span className="font-medium">
                                        {quotedParticipant?.avatar} {quotedParticipant?.role}：
                                    </span>
                                    <span className="italic">"{quote.excerpt}"</span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* v3.5.0: 思考过程折叠组件 */}
                {thinkingContent && (
                    <ThinkingBlock
                        content={thinkingContent}
                        defaultExpanded={true}
                        maxHeight={120}
                    />
                )}

                {/* 消息气泡 */}
                {(processedContent || (message.toolCalls && message.toolCalls.length > 0)) && (
                    <div className={`rounded-2xl px-4 py-3 border ${colors.bg} ${colors.border}`}>
                        {processedContent && (
                            <div className="text-sm text-gray-800 dark:text-gray-100 leading-relaxed prose prose-sm dark:prose-invert max-w-none">
                                <ReactMarkdown
                                    remarkPlugins={remarkPlugins}
                                    components={markdownComponents}
                                    urlTransform={urlTransform}
                                >
                                    {processedContent}
                                </ReactMarkdown>
                            </div>
                        )}

                        {/* v3.5.0: MCP 工具调用展示 */}
                        {message.toolCalls && message.toolCalls.length > 0 && (
                            <div className={processedContent ? 'mt-2' : ''}>
                                <ToolCallList
                                    toolCalls={message.toolCalls}
                                    results={toolResultsMap}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* 时间戳 */}
                <div className="mt-1">
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                        {timeString}
                    </span>
                </div>
            </div>
        </div>
    );
});

RoundtableMessageBubble.displayName = 'RoundtableMessageBubble';

export default RoundtableMessageBubble;
