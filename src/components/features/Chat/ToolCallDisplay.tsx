/**
 * ToolCallDisplay 组件 (v2.1.0, v2.4.0: 增强展示, v2.6.0: 进度摘要, v4.2.2: 图片渲染)
 *
 * 在消息中展示 MCP 工具调用的状态和结果
 *
 * @description
 * - 执行中: 蓝色边框 + Loader2 旋转图标
 * - 成功: 绿色边框 + CheckCircle 图标
 * - 失败: 红色边框 + XCircle 图标
 * - v2.4.0: 执行完成后默认展开显示结果
 * - v2.4.0: 显示执行耗时
 * - v2.6.0: 多工具调用时显示进度摘要 (N/M 已完成)
 */

import {
    CheckCircle,
    ChevronDown,
    ChevronRight,
    Clock,
    Loader2,
    Wrench,
    XCircle,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import { createMarkdownComponents } from '../../common/markdown';
import { useI18n } from '../../../i18n';
import type { ToolCall, ToolResult } from '../../../types';

/**
 * v4.2.2: 工具结果专用 Markdown 组件（图片支持放大和下载）
 */
const toolResultMarkdownComponents = createMarkdownComponents({
    enableCodeHighlight: false,
    enableCodeCopy: false,
    enableCodeLazyLoad: false,
    enableImageZoom: true,
    enableImageLazyLoad: false,
    enableFileDownload: false,
    showExternalLinkIcon: false,
});

/**
 * v4.2.2: 允许的图片 MIME 类型白名单
 * 仅放行安全的图片格式，避免非图片 payload 混入
 */
const ALLOWED_IMAGE_DATA_RE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml|bmp|ico);base64,/;

/**
 * v4.2.2: 自定义 URL 转换，仅放行图片白名单内的 base64 data: URL
 */
const toolResultUrlTransform = (url: string) => {
    if (ALLOWED_IMAGE_DATA_RE.test(url)) return url;
    return defaultUrlTransform(url);
};

/**
 * v4.2.2: 检测内容是否包含 Markdown 图片语法（base64 图片 data: URL）
 */
export const containsMarkdownImage = (content: string): boolean => {
    return /!\[.*?\]\(data:image\//.test(content);
};

/** 组件 Props */
export interface ToolCallDisplayProps {
    /** 工具调用信息 */
    toolCall: ToolCall;
    /** 工具执行结果（可选，无结果表示执行中） */
    result?: ToolResult;
    /** 是否正在执行 */
    isExecuting?: boolean;
}

/**
 * 工具调用状态类型
 */
type ToolCallStatus = 'executing' | 'success' | 'error';

/**
 * 获取工具调用状态
 */
function getToolCallStatus(
    result: ToolResult | undefined,
    isExecuting: boolean | undefined
): ToolCallStatus {
    if (isExecuting || !result) {
        return 'executing';
    }
    return result.isError ? 'error' : 'success';
}

/**
 * 状态对应的样式配置
 */
const statusStyles: Record<
    ToolCallStatus,
    {
        border: string;
        bg: string;
        icon: string;
        text: string;
    }
> = {
    executing: {
        border: 'border-blue-300 dark:border-blue-600',
        bg: 'bg-blue-50 dark:bg-blue-900/20',
        icon: 'text-blue-500',
        text: 'text-blue-700 dark:text-blue-300',
    },
    success: {
        border: 'border-green-300 dark:border-green-600',
        bg: 'bg-green-50 dark:bg-green-900/20',
        icon: 'text-green-500',
        text: 'text-green-700 dark:text-green-300',
    },
    error: {
        border: 'border-red-300 dark:border-red-600',
        bg: 'bg-red-50 dark:bg-red-900/20',
        icon: 'text-red-500',
        text: 'text-red-700 dark:text-red-300',
    },
};

/**
 * 状态图标组件
 */
const StatusIcon: React.FC<{ status: ToolCallStatus }> = ({ status }) => {
    const iconClass = `w-4 h-4 ${statusStyles[status].icon}`;

    switch (status) {
        case 'executing':
            return <Loader2 className={`${iconClass} animate-spin`} />;
        case 'success':
            return <CheckCircle className={iconClass} />;
        case 'error':
            return <XCircle className={iconClass} />;
    }
};

/**
 * 格式化 JSON 字符串用于显示
 */
function formatArguments(argsStr: string): string {
    try {
        const parsed = JSON.parse(argsStr);
        return JSON.stringify(parsed, null, 2);
    } catch {
        return argsStr;
    }
}

/**
 * ToolCallDisplay 组件
 *
 * @example
 * ```tsx
 * // 执行中状态
 * <ToolCallDisplay
 *     toolCall={{ id: '1', name: 'read_file', arguments: '{"path":"/tmp/test.txt"}', serverId: 'fs' }}
 *     isExecuting={true}
 * />
 *
 * // 成功状态
 * <ToolCallDisplay
 *     toolCall={{ id: '1', name: 'read_file', arguments: '{"path":"/tmp/test.txt"}', serverId: 'fs' }}
 *     result={{ callId: '1', content: 'Hello World', isError: false }}
 * />
 *
 * // 错误状态
 * <ToolCallDisplay
 *     toolCall={{ id: '1', name: 'read_file', arguments: '{"path":"/tmp/test.txt"}', serverId: 'fs' }}
 *     result={{ callId: '1', content: '文件不存在', isError: true }}
 * />
 * ```
 */
export const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({
    toolCall,
    result,
    isExecuting,
}) => {
    // 计算当前状态
    const status = getToolCallStatus(result, isExecuting);
    const styles = statusStyles[status];

    // v2.4.0: 执行完成后默认展开显示结果
    // v4.1.31: 执行中也默认展开，展示调用参数
    const [isExpanded, setIsExpanded] = useState(status === 'executing');

    // v2.4.0: 当有结果时自动展开
    useEffect(() => {
        if (result && !isExecuting) {
            setIsExpanded(true);
        }
    }, [result, isExecuting]);

    // 格式化参数用于显示
    const formattedArgs = useMemo(
        () => formatArguments(toolCall.arguments),
        [toolCall.arguments]
    );

    // 状态文本
    const statusText = useMemo(() => {
        switch (status) {
            case 'executing':
                return '执行中...';
            case 'success':
                return '执行成功';
            case 'error':
                return '执行失败';
        }
    }, [status]);

    // v2.4.0: 格式化耗时显示
    const durationText = useMemo(() => {
        if (!result?.duration) return null;
        if (result.duration < 1000) {
            return `${result.duration}ms`;
        }
        return `${(result.duration / 1000).toFixed(2)}s`;
    }, [result?.duration]);

    return (
        <div
            className={`rounded-[10px] border ${styles.border} ${styles.bg} overflow-hidden my-2`}
        >
            {/* 头部：工具名称和状态 */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${styles.text} hover:opacity-80 transition cursor-pointer`}
            >
                {/* 展开/收起图标 */}
                {isExpanded ? (
                    <ChevronDown size={14} className="flex-shrink-0" />
                ) : (
                    <ChevronRight size={14} className="flex-shrink-0" />
                )}

                {/* 工具图标 */}
                <Wrench size={14} className="flex-shrink-0 opacity-70" />

                {/* 工具名称 */}
                <span className="font-medium truncate">{toolCall.name}</span>

                {/* 服务器标识 (v2.5.0: 优先显示名称) */}
                <span className="text-xs opacity-60 truncate">
                    ({toolCall.serverName || toolCall.serverId})
                </span>

                {/* 右侧状态 */}
                <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                    {/* v2.4.0: 显示执行耗时 */}
                    {durationText && (
                        <span className="inline-flex items-center gap-1 text-xs opacity-60">
                            <Clock size={12} />
                            {durationText}
                        </span>
                    )}
                    <span className="text-xs opacity-70">{statusText}</span>
                    <StatusIcon status={status} />
                </div>
            </button>

            {/* 展开的详情 */}
            {isExpanded && (
                <div className={`border-t ${styles.border} px-3 py-2 space-y-2`}>
                    {/* 参数 */}
                    <div>
                        <div className="text-xs font-medium opacity-70 mb-1">
                            参数:
                        </div>
                        <pre className="text-xs font-mono bg-white/50 dark:bg-black/20 rounded p-2 overflow-x-auto max-h-32 overflow-y-auto">
                            {formattedArgs}
                        </pre>
                    </div>

                    {/* 结果（如果有） */}
                    {result && (
                        <div>
                            <div className="text-xs font-medium opacity-70 mb-1">
                                {result.isError ? '错误:' : '结果:'}
                            </div>
                            {/* v4.2.2: 含图片 markdown 的成功结果使用 ReactMarkdown 渲染 */}
                            {!result.isError && containsMarkdownImage(result.content) ? (
                                <div className="text-xs rounded p-2 overflow-x-auto max-h-48 overflow-y-auto bg-white/50 dark:bg-black/20">
                                    <ReactMarkdown
                                        components={toolResultMarkdownComponents}
                                        urlTransform={toolResultUrlTransform}
                                    >
                                        {result.content}
                                    </ReactMarkdown>
                                </div>
                            ) : (
                                <pre
                                    className={`text-xs font-mono rounded p-2 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap ${result.isError
                                            ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                                            : 'bg-white/50 dark:bg-black/20'
                                        }`}
                                >
                                    {result.content}
                                </pre>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/**
 * 工具调用列表组件
 *
 * 批量展示多个工具调用
 */
export interface ToolCallListProps {
    /** 工具调用列表 */
    toolCalls: ToolCall[];
    /** 工具执行结果映射 (callId -> result) */
    results?: Map<string, ToolResult>;
    /** 正在执行的工具调用 ID 集合 */
    executingIds?: Set<string>;
}

export const ToolCallList: React.FC<ToolCallListProps> = ({
    toolCalls,
    results = new Map(),
    executingIds = new Set(),
}) => {
    const { t } = useI18n();

    if (toolCalls.length === 0) {
        return null;
    }

    // v2.6.0: 计算完成进度
    const completedCount = results.size;
    const totalCount = toolCalls.length;
    const allDone = completedCount >= totalCount;
    const hasErrors = Array.from(results.values()).some((r) => r.isError);

    return (
        <div className="space-y-1">
            {/* v2.6.0: 多工具调用时显示进度摘要 */}
            {totalCount > 1 && (
                <div
                    className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-md ${allDone
                            ? hasErrors
                                ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20'
                                : 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                            : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        }`}
                >
                    {allDone ? (
                        <CheckCircle size={14} className="flex-shrink-0" />
                    ) : (
                        <Loader2 size={14} className="flex-shrink-0 animate-spin" />
                    )}
                    <span>
                        {(allDone ? t.chat.toolCallAllDone : t.chat.toolCallProgress)
                            .replace('{completed}', String(completedCount))
                            .replace('{total}', String(totalCount))}
                    </span>
                </div>
            )}
            {toolCalls.map((toolCall) => (
                <ToolCallDisplay
                    key={toolCall.id}
                    toolCall={toolCall}
                    result={results.get(toolCall.id)}
                    isExecuting={executingIds.has(toolCall.id)}
                />
            ))}
        </div>
    );
};

export default ToolCallDisplay;
