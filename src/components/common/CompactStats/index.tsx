/**
 * CompactStats 紧凑型统计卡片组件 (v3.5.0)
 *
 * 提供紧凑的统计数据展示，采用内联横向布局
 * 适合放在页面标题行右侧，节省垂直空间
 *
 * 功能特性：
 * - 内联横向布局
 * - 支持 5 种颜色主题
 * - 大数值自动格式化（如 12500 -> 12.5K）
 * - 支持自定义图标
 *
 * 对应文档: docs/components/common.md
 */

import React from 'react';

/** 统计项颜色类型 */
type StatColor = 'default' | 'success' | 'warning' | 'error' | 'info';

/** 单个统计项 */
export interface StatItem {
    /** 标签文本 */
    label: string;
    /** 数值 */
    value: number | string;
    /** 图标（可选） */
    icon?: React.ReactNode;
    /** 颜色主题，默认 'default' */
    color?: StatColor;
}

interface CompactStatsProps {
    /** 统计项列表 */
    items: StatItem[];
    /** 自定义样式 */
    className?: string;
}

/**
 * 颜色映射表
 * 定义各颜色主题对应的文字和图标颜色
 */
const colorMap: Record<StatColor, { text: string; icon: string }> = {
    default: {
        text: 'text-gray-800 dark:text-gray-200',
        icon: 'text-gray-500 dark:text-gray-400',
    },
    success: {
        text: 'text-green-600 dark:text-green-400',
        icon: 'text-green-500',
    },
    warning: {
        text: 'text-yellow-600 dark:text-yellow-400',
        icon: 'text-yellow-500',
    },
    error: {
        text: 'text-red-600 dark:text-red-400',
        icon: 'text-red-500',
    },
    info: {
        text: 'text-blue-600 dark:text-blue-400',
        icon: 'text-blue-500',
    },
};

/**
 * 格式化大数值
 * 将大于 1000 的数值转换为 K 格式
 *
 * @param value - 原始数值
 * @returns 格式化后的字符串
 *
 * @example
 * formatValue(12500) // "12.5K"
 * formatValue(999)   // "999"
 */
const formatValue = (value: number | string): string => {
    if (typeof value === 'string') return value;
    if (value >= 10000) {
        return `${(value / 1000).toFixed(1)}K`;
    }
    if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toString();
};

export const CompactStats: React.FC<CompactStatsProps> = ({
    items,
    className = '',
}) => {
    return (
        <div className={`flex items-center gap-4 ${className}`}>
            {items.map((item, index) => {
                const color = item.color || 'default';
                const colors = colorMap[color];

                return (
                    <div
                        key={index}
                        className="flex items-center gap-1.5"
                    >
                        {/* 图标 */}
                        {item.icon && (
                            <span className={`${colors.icon} [&>svg]:w-4 [&>svg]:h-4`}>
                                {item.icon}
                            </span>
                        )}

                        {/* 数值 */}
                        <span className={`text-lg font-bold ${colors.text}`}>
                            {formatValue(item.value)}
                        </span>

                        {/* 标签 */}
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {item.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

export default CompactStats;
