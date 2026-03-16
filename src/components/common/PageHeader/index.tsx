/**
 * PageHeader 统一页面头部组件 (v3.5.0)
 *
 * 整合标题、统计、搜索、筛选和操作按钮
 * 采用紧凑布局节省垂直空间
 *
 * 设计目标：
 * - 头部总高度从 ~220px 优化到 ~100px
 * - 统计卡片从独立行改为内联显示
 * - 搜索框支持折叠展开
 *
 * 对应文档: docs/components/common.md
 */

import React from 'react';
import { ExpandableSearch } from '../ExpandableSearch';
import { CompactStats, type StatItem } from '../CompactStats';

interface PageHeaderProps {
    /** 页面图标 */
    icon: React.ReactNode;
    /** 页面标题 */
    title: string;
    /** 副标题（可选） */
    subtitle?: string;

    /** 统计数据（可选） */
    stats?: StatItem[];

    /** 搜索值（可选，传入则显示搜索框） */
    searchValue?: string;
    /** 搜索值变化回调 */
    onSearchChange?: (value: string) => void;
    /** 搜索框占位文本 */
    searchPlaceholder?: string;

    /** 自定义筛选器（可选） */
    filters?: React.ReactNode;

    /** 右侧操作按钮（可选） */
    actions?: React.ReactNode;

    /** 自定义样式 */
    className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
    icon,
    title,
    subtitle,
    stats,
    searchValue,
    onSearchChange,
    searchPlaceholder = '搜索...',
    filters,
    actions,
    className = '',
}) => {
    // 判断是否显示搜索框
    const showSearch = searchValue !== undefined && onSearchChange !== undefined;

    return (
        <div
            className={`
                bg-white dark:bg-gray-900
                border-b border-gray-200 dark:border-gray-700
                px-4 py-3
                ${className}
            `}
        >
            {/* 主行：标题 + 统计 + 搜索 + 筛选 + 按钮 */}
            <div className="flex items-center justify-between gap-4">
                {/* 左侧：图标 + 标题 */}
                <div className="flex items-center gap-3 min-w-0">
                    {/* 图标 */}
                    <div className="flex-shrink-0 [&>svg]:w-6 [&>svg]:h-6">
                        {icon}
                    </div>

                    {/* 标题区域 */}
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white truncate">
                            {title}
                        </h2>
                        {subtitle && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {subtitle}
                            </p>
                        )}
                    </div>
                </div>

                {/* 右侧：统计 + 搜索 + 筛选 + 按钮 */}
                <div className="flex items-center gap-3 flex-shrink-0">
                    {/* 统计数据 */}
                    {stats && stats.length > 0 && (
                        <div className="hidden lg:block">
                            <CompactStats items={stats} />
                        </div>
                    )}

                    {/* 分隔线 */}
                    {stats && stats.length > 0 && (showSearch || filters) && (
                        <div className="hidden lg:block w-px h-8 bg-gray-200 dark:bg-gray-700" />
                    )}

                    {/* 搜索框 */}
                    {showSearch && (
                        <ExpandableSearch
                            value={searchValue}
                            onChange={onSearchChange}
                            placeholder={searchPlaceholder}
                        />
                    )}

                    {/* 筛选器 */}
                    {filters}

                    {/* 操作按钮 */}
                    {actions}
                </div>
            </div>
        </div>
    );
};

export default PageHeader;

// 导出子组件类型，方便外部使用
export type { StatItem };
