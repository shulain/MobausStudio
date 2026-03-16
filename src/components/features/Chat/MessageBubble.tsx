import React, { useState, useCallback, useMemo } from 'react';
import { FileIcon, FilmIcon, Clipboard, MessageSquare, Brain } from 'lucide-react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ContextMenu, type ContextMenuItem } from '../../common';
import { ToolCallList } from './ToolCallDisplay';
import { ThinkingBlock, createMarkdownComponents } from '../../common/markdown';
import type { Message, Attachment, ToolResult } from '../../../types';
import { logger, LogTags } from '../../../utils/logger';

interface MessageBubbleProps {
    message: Message;
}

/**
 * v2.6.0 -> v3.5.0: 使用共享 Markdown 组件配置
 * 支持代码高亮、图片放大、文件下载等功能
 */
const markdownComponents = createMarkdownComponents();

/**
 * v2.6.0: remarkPlugins 数组提取为静态常量
 * 避免每次渲染都创建新数组导致 ReactMarkdown 重新解析
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

const MessageBubbleBase: React.FC<MessageBubbleProps> = ({ message }) => {
    const isUser = message.role === 'user';
    const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

    // 格式化时间
    const timeString = new Date(message.createdAt).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
    });

    // 工具结果映射 (v2.1.0)
    const toolResultsMap = useMemo(() => {
        if (!message.toolResults) {
            return new Map<string, ToolResult>();
        }
        return new Map(message.toolResults.map((r) => [r.callId, r]));
    }, [message.toolResults]);

    // 复制文本并显示反馈
    const copyToClipboard = useCallback(async (text: string, feedbackMsg: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopyFeedback(feedbackMsg);
            setTimeout(() => setCopyFeedback(null), 1500);
        } catch (err) {
            logger.error(LogTags.CHAT, '复制失败', err);
        }
    }, []);

    // 处理思考过程复制回调
    const handleThinkingCopy = useCallback(() => {
        setCopyFeedback('已复制思考过程');
        setTimeout(() => setCopyFeedback(null), 1500);
    }, []);

    // 消息内容的右键菜单
    const messageContextMenuItems: ContextMenuItem[] = [
        {
            id: 'copy-content',
            label: '复制内容',
            icon: <Clipboard size={14} />,
            shortcut: '⌘C',
            onClick: () => copyToClipboard(message.content, '已复制内容'),
        },
        ...(message.reasoningContent ? [{
            id: 'copy-thinking',
            label: '复制思考过程',
            icon: <Brain size={14} />,
            onClick: () => copyToClipboard(message.reasoningContent!, '已复制思考过程'),
        }] : []),
        ...(message.reasoningContent ? [{
            id: 'copy-all',
            label: '复制全部',
            icon: <MessageSquare size={14} />,
            onClick: () => copyToClipboard(
                `思考过程:\n${message.reasoningContent}\n\n回复:\n${message.content}`,
                '已复制全部'
            ),
        }] : []),
    ];

    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
            {/* 外层容器：min-w-0 防止 flex 子项撑破，overflow-hidden 确保内容不溢出 (UX-04) */}
            {/* v3.5.0: 放宽最大宽度，显示更多内容 */}
            <div className={`max-w-[95%] lg:max-w-[90%] min-w-0 overflow-hidden flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>

                {/* 复制反馈提示 */}
                {copyFeedback && (
                    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000] px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm rounded-[10px] shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
                        {copyFeedback}
                    </div>
                )}

                {/* v3.5.0: 使用共享 ThinkingBlock 组件显示思考过程 */}
                {!isUser && message.reasoningContent && (
                    <ThinkingBlock
                        content={message.reasoningContent}
                        defaultExpanded={true}
                        maxHeight={120}
                        onCopy={handleThinkingCopy}
                    />
                )}

                {/* 消息气泡：overflow-hidden 确保内容不超出圆角边界 (UX-04) */}
                <ContextMenu items={messageContextMenuItems}>
                    <div
                        className={`rounded-2xl px-4 py-3 shadow-sm overflow-hidden max-w-full cursor-default select-text ${isUser
                            ? 'bg-gradient-to-bl from-[#A688F6] to-[#009BF3] text-white'
                            : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-100'
                            }`}
                    >
                        {/* 附件展示 */}
                        {message.attachments && message.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                                {message.attachments.map((att) => (
                                    <AttachmentPreview key={att.id} attachment={att} />
                                ))}
                            </div>
                        )}

                        {/* v2.6.0: Markdown 内容渲染 - 使用静态配置避免重复创建对象 */}
                        <div className={`markdown-body text-sm leading-relaxed overflow-hidden ${isUser ? 'text-white' : 'text-gray-800 dark:text-gray-100'}`} style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                            {isUser ? (
                                <p className="whitespace-pre-wrap" style={{ overflowWrap: 'anywhere' }}>{message.content}</p>
                            ) : (
                                <ReactMarkdown
                                    remarkPlugins={remarkPlugins}
                                    components={markdownComponents}
                                    urlTransform={urlTransform}
                                >
                                    {message.content}
                                </ReactMarkdown>
                            )}
                        </div>

                        {/* MCP 工具调用展示 (v2.1.0) */}
                        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
                            <div className="mt-2">
                                <ToolCallList
                                    toolCalls={message.toolCalls}
                                    results={toolResultsMap}
                                />
                            </div>
                        )}
                    </div>
                </ContextMenu>

                {/* 时间戳 */}
                <span className="text-xs mt-1 text-gray-400 dark:text-gray-500 px-1">
                    {timeString}
                </span>
            </div>
        </div>
    );
};

// 使用 React.memo 优化渲染性能，避免流式生成时频繁重绘导致卡顿 (PERF-01)
export const MessageBubble = React.memo(MessageBubbleBase);

// 附件预览组件
const AttachmentPreview: React.FC<{ attachment: Attachment }> = ({ attachment }) => {
    if (attachment.type === 'image') {
        return (
            <div className="relative group rounded-[10px] overflow-hidden border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 w-32 h-32 flex-shrink-0">
                <img
                    src={attachment.url}
                    alt={attachment.name}
                    className="w-full h-full object-cover"
                />
            </div>
        );
    }

    if (attachment.type === 'video') {
        return (
            <div className="relative rounded-[10px] overflow-hidden border border-gray-200 dark:border-gray-600 bg-black w-48 h-32 flex-shrink-0 flex items-center justify-center">
                <video src={attachment.url} className="w-full h-full object-contain" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <FilmIcon className="text-white w-8 h-8 opacity-80" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 p-2 rounded-[10px] border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 max-w-[200px]">
            <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                <FileIcon size={16} className="text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{attachment.name}</p>
                <p className="text-[10px] text-gray-400">{(attachment.size / 1024).toFixed(1)} KB</p>
            </div>
        </div>
    );
};
