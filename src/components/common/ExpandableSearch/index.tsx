/**
 * ExpandableSearch 可展开搜索框组件 (v3.5.1)
 *
 * 提供可折叠的搜索输入框，默认显示搜索图标，点击后展开输入框
 * 用于节省页面头部空间
 *
 * 功能特性：
 * - 折叠状态仅显示搜索图标按钮
 * - 点击后平滑展开到指定宽度（优化动画效果）
 * - 展开后自动聚焦输入框
 * - 失焦且无内容时自动收起
 * - ESC 键清空并收起
 *
 * v3.5.1: 优化动画效果
 * - 使用单一容器实现，避免元素切换导致的跳动
 * - 添加 scale 和 opacity 动画，更加流畅
 * - 优化过渡曲线，使用 cubic-bezier
 *
 * 对应文档: docs/components/common.md
 */

import React, { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface ExpandableSearchProps {
    /** 搜索值 */
    value: string;
    /** 值变化回调 */
    onChange: (value: string) => void;
    /** 占位文本 */
    placeholder?: string;
    /** 自定义样式 */
    className?: string;
    /** 展开后宽度，默认 '280px' */
    expandedWidth?: string;
    /** 失焦且无内容时自动收起，默认 true */
    autoCollapse?: boolean;
}

export const ExpandableSearch: React.FC<ExpandableSearchProps> = ({
    value,
    onChange,
    placeholder = '搜索...',
    className = '',
    expandedWidth = '280px',
    autoCollapse = true,
}) => {
    // 展开状态
    const [isExpanded, setIsExpanded] = useState(false);
    // 输入框引用，用于自动聚焦
    const inputRef = useRef<HTMLInputElement>(null);
    // 容器引用
    const containerRef = useRef<HTMLDivElement>(null);

    /**
     * 处理展开操作
     * 展开搜索框并自动聚焦输入框
     */
    const handleExpand = () => {
        setIsExpanded(true);
    };

    /**
     * 处理收起操作
     * 仅在无内容时收起
     */
    const handleCollapse = () => {
        if (autoCollapse && !value) {
            setIsExpanded(false);
        }
    };

    /**
     * 处理清除操作
     * 清空输入内容，保持展开状态以便继续输入
     */
    const handleClear = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onChange('');
        // 清除后重新聚焦输入框
        inputRef.current?.focus();
    };

    /**
     * 处理键盘事件
     * ESC 键：清空内容并收起
     */
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            onChange('');
            setIsExpanded(false);
            inputRef.current?.blur();
        }
    };

    // 展开后自动聚焦
    useEffect(() => {
        if (isExpanded && inputRef.current) {
            // 延迟聚焦，等待动画开始
            const timer = setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isExpanded]);

    // 如果有值，保持展开状态
    useEffect(() => {
        if (value && !isExpanded) {
            setIsExpanded(true);
        }
    }, [value, isExpanded]);

    return (
        <div
            ref={containerRef}
            className={`relative ${className}`}
            style={{
                width: isExpanded ? expandedWidth : '36px',
                transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
        >
            {/* 搜索框容器 - 始终渲染，通过样式控制展开/收起 */}
            <div
                className={`
                    flex items-center h-9 overflow-hidden
                    border rounded-full
                    transition-all duration-300
                    ${isExpanded
                        ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 rounded-[10px] shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-800 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700'
                    }
                    ${isExpanded ? 'focus-within:border-purple-400 dark:focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-100 dark:focus-within:ring-purple-900/30' : ''}
                `}
                style={{
                    cursor: isExpanded ? 'text' : 'pointer',
                }}
                onClick={!isExpanded ? handleExpand : undefined}
                title={!isExpanded ? placeholder : undefined}
            >
                {/* 搜索图标 */}
                <div
                    className={`
                        flex items-center justify-center flex-shrink-0
                        transition-all duration-300
                        ${isExpanded ? 'w-10 pl-3' : 'w-9'}
                    `}
                >
                    <Search
                        className={`
                            w-4 h-4 transition-colors duration-200
                            ${isExpanded
                                ? 'text-gray-400 dark:text-gray-500'
                                : 'text-gray-500 dark:text-gray-400'
                            }
                        `}
                    />
                </div>

                {/* 输入框 - 始终渲染，通过 opacity 和 width 控制显示 */}
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={handleCollapse}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    tabIndex={isExpanded ? 0 : -1}
                    className={`
                        flex-1 h-full py-2 pr-2 min-w-0
                        bg-transparent
                        text-sm text-gray-800 dark:text-gray-100
                        placeholder-gray-400 dark:placeholder-gray-500
                        focus:outline-none
                        transition-opacity duration-200
                        ${isExpanded ? 'opacity-100' : 'opacity-0 w-0 p-0'}
                    `}
                    style={{
                        pointerEvents: isExpanded ? 'auto' : 'none',
                    }}
                />

                {/* 清除按钮：仅在有内容且展开时显示 */}
                <button
                    onMouseDown={handleClear}
                    tabIndex={-1}
                    className={`
                        flex items-center justify-center w-8 h-full flex-shrink-0
                        text-gray-400 dark:text-gray-500
                        hover:text-gray-600 dark:hover:text-gray-300
                        transition-all duration-200
                        ${value && isExpanded ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none w-0'}
                    `}
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

export default ExpandableSearch;
