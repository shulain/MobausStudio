/**
 * 思考过程折叠组件
 *
 * 提供 AI 思考过程的展示功能：
 * - 支持 reasoningContent 字段（普通 Chat）
 * - 支持 <think> 标签解析（圆桌会议向后兼容）
 * - 折叠/展开 UI
 * - amber 色系样式
 * - 右键复制支持
 *
 * @module components/common/markdown/ThinkingBlock
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Brain, Clipboard } from 'lucide-react';

/**
 * ThinkingBlock 组件 Props
 */
export interface ThinkingBlockProps {
    /** 思考内容（直接传入） */
    content?: string;
    /** 原始消息内容（用于解析 <think> 标签） */
    rawContent?: string;
    /** 是否默认展开（默认 true） */
    defaultExpanded?: boolean;
    /** 最大高度（像素，默认 120） */
    maxHeight?: number;
    /** 自定义类名 */
    className?: string;
    /** 复制成功回调 */
    onCopy?: (text: string) => void;
}

/**
 * 从原始内容中解析 <think> 标签
 *
 * @param content - 原始消息内容
 * @returns 思考内容（如果有）
 */
export const parseThinkingContent = (content: string): string | null => {
    if (!content) return null;

    // 匹配 <think>...</think> 标签
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch && thinkMatch[1]) {
        return thinkMatch[1].trim();
    }

    return null;
};

/**
 * 从原始内容中移除 <think> 标签
 *
 * @param content - 原始消息内容
 * @returns 移除思考内容后的消息
 */
export const removeThinkingTags = (content: string): string => {
    if (!content) return '';
    return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
};

/**
 * 思考过程折叠组件
 *
 * 支持两种数据源：
 * 1. content - 直接传入思考内容（优先使用）
 * 2. rawContent - 从原始消息中解析 <think> 标签
 */
export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
    content,
    rawContent,
    defaultExpanded = true,
    maxHeight = 120,
    className = '',
    onCopy,
}) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const contentRef = useRef<HTMLDivElement>(null);

    // 确定要显示的思考内容
    // 优先使用直接传入的 content，否则从 rawContent 解析
    const thinkingContent = content || (rawContent ? parseThinkingContent(rawContent) : null);

    // 自动滚动到底部（流式输出时）
    useEffect(() => {
        if (!thinkingContent) return;
        if (isExpanded && contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [thinkingContent, isExpanded]);

    // 复制思考内容
    const handleCopy = useCallback(async () => {
        if (!thinkingContent) return;
        try {
            await navigator.clipboard.writeText(thinkingContent);
            onCopy?.(thinkingContent);
        } catch (err) {
            console.error('复制失败:', err);
        }
    }, [thinkingContent, onCopy]);

    // 如果没有思考内容，不渲染
    if (!thinkingContent) {
        return null;
    }

    // 生成预览文本（折叠时显示）
    const previewText = thinkingContent.length > 50
        ? `${thinkingContent.substring(0, 50)}...`
        : thinkingContent;

    return (
        <div
            className={`mb-2 max-w-full bg-amber-50 dark:bg-amber-900/20 rounded-[10px] border border-amber-200 dark:border-amber-700/50 overflow-hidden ${className}`}
        >
            {/* 标题栏 */}
            <div className="flex items-center">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex-1 flex items-center gap-2 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition"
                >
                    {isExpanded ? (
                        <ChevronDown size={14} className="flex-shrink-0" />
                    ) : (
                        <ChevronRight size={14} className="flex-shrink-0" />
                    )}
                    <Brain size={14} className="flex-shrink-0" />
                    <span className="font-medium">思考过程</span>
                    <span className="opacity-70 ml-auto font-mono italic truncate max-w-[200px]">
                        {isExpanded ? '收起' : previewText}
                    </span>
                </button>

                {/* 复制按钮 */}
                <button
                    onClick={handleCopy}
                    className="px-2 py-2 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition"
                    title="复制思考过程"
                >
                    <Clipboard size={14} />
                </button>
            </div>

            {/* 内容区域 */}
            {isExpanded && (
                <div
                    ref={contentRef}
                    className="px-3 py-2 text-amber-700 dark:text-amber-300 font-mono text-xs italic whitespace-pre-wrap bg-amber-50/50 dark:bg-amber-900/10 border-t border-amber-200 dark:border-amber-700/50 overflow-y-auto"
                    style={{
                        maxHeight: `${maxHeight}px`,
                        lineHeight: '1.5rem',
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                    }}
                >
                    {thinkingContent}
                </div>
            )}
        </div>
    );
};

export default ThinkingBlock;
