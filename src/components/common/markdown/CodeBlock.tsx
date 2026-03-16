/**
 * 代码块组件
 *
 * 提供代码块渲染功能：
 * - 语法高亮（使用 Prism）
 * - 复制按钮
 * - 懒加载（IntersectionObserver）
 * - 语言标签显示
 *
 * @module components/common/markdown/CodeBlock
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Check, Copy } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

/**
 * CodeBlock 组件 Props
 */
export interface CodeBlockProps {
    /** 代码语言 */
    language: string;
    /** 代码内容 */
    value: string;
    /** 是否启用语法高亮（默认 true） */
    enableHighlight?: boolean;
    /** 是否显示复制按钮（默认 true） */
    enableCopy?: boolean;
    /** 是否启用懒加载（默认 true） */
    enableLazyLoad?: boolean;
}

/**
 * 代码块组件
 *
 * 支持语法高亮、复制功能和懒加载
 */
export const CodeBlock: React.FC<CodeBlockProps> = ({
    language,
    value,
    enableHighlight = true,
    enableCopy = true,
    enableLazyLoad = true,
}) => {
    // 复制状态
    const [copied, setCopied] = useState(false);
    // 是否可见（用于懒加载）
    const [isVisible, setIsVisible] = useState(!enableLazyLoad);
    // 容器引用
    const containerRef = useRef<HTMLDivElement>(null);

    /**
     * 使用 IntersectionObserver 检测代码块是否进入视口
     * 实现懒加载，只有代码块进入视口时才进行语法高亮
     */
    useEffect(() => {
        if (!enableLazyLoad) {
            setIsVisible(true);
            return;
        }

        const container = containerRef.current;
        if (!container) return;

        const observer = new IntersectionObserver(
            (entries) => {
                // 一旦可见就保持高亮状态，不再取消
                if (entries[0].isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '100px' } // 提前 100px 开始加载
        );

        observer.observe(container);
        return () => observer.disconnect();
    }, [enableLazyLoad]);

    /**
     * 复制代码到剪贴板
     */
    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [value]);

    return (
        <div
            ref={containerRef}
            className="my-2 rounded-[10px] overflow-hidden bg-[#1e1e1e] border border-gray-700 max-w-full"
        >
            {/* 顶部工具栏 */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#2d2d2d] border-b border-gray-700">
                {/* 语言标签 */}
                <span className="text-xs text-gray-400 font-mono">
                    {language || 'text'}
                </span>

                {/* 复制按钮 */}
                {enableCopy && (
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                        title={copied ? '已复制' : '复制代码'}
                    >
                        {copied ? (
                            <>
                                <Check size={14} className="text-green-500" />
                                <span>已复制</span>
                            </>
                        ) : (
                            <>
                                <Copy size={14} />
                                <span>复制</span>
                            </>
                        )}
                    </button>
                )}
            </div>

            {/* 代码内容 */}
            {isVisible && enableHighlight ? (
                <SyntaxHighlighter
                    language={language || 'text'}
                    style={vscDarkPlus}
                    customStyle={{
                        margin: 0,
                        padding: '1rem',
                        background: 'transparent',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        maxWidth: '100%',
                    }}
                    wrapLongLines={true}
                >
                    {value}
                </SyntaxHighlighter>
            ) : (
                // 未加载或不启用高亮时显示纯文本
                <pre className="p-4 text-gray-300 font-mono text-sm whitespace-pre-wrap break-all overflow-x-auto">
                    {value}
                </pre>
            )}
        </div>
    );
};

export default CodeBlock;
