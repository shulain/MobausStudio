/**
 * 编排模式选择器组件
 *
 * 用于创建编排对话时选择模式：
 * - 圆桌会议
 * - 并排对比
 * - 审核纠错
 * - 工作流编排
 * - 辩论模式
 *
 * 注意：单 Agent 对话已有独立入口，不在此选择器中显示
 *
 * @module components/features/AgentOrchestration/OrchestrationModeSelector
 */

import React, { useState, useCallback } from 'react';
import {
    GitCompare,
    Users,
    Search,
    GitBranch,
    Swords,
    ChevronRight,
    X,
} from 'lucide-react';
import { useI18n } from '../../../i18n';
import type { OrchestrationMode } from '../../../types';

/**
 * 组件 Props
 */
interface OrchestrationModeSelectorProps {
    /** 是否显示 */
    isOpen: boolean;
    /** 关闭回调 */
    onClose: () => void;
    /** 选择模式回调 */
    onSelectMode: (mode: OrchestrationMode) => void;
}

/**
 * 模式配置
 */
interface ModeConfig {
    id: OrchestrationMode;
    nameKey: keyof typeof import('../../../i18n/zh').zh.orchestration;
    descKey: keyof typeof import('../../../i18n/zh').zh.orchestration;
    icon: React.ReactNode;
    color: string;
    bgColor: string;
    available: boolean;
    comingSoon?: boolean;
}

/**
 * 编排模式配置（不包含单对话模式）
 * v4.1.2: 移除单对话模式，因为已有独立入口
 */
const MODES: ModeConfig[] = [
    {
        id: 'roundtable',
        nameKey: 'roundtable',
        descKey: 'roundtableDesc',
        icon: <Users className="w-6 h-6" />,
        color: 'text-purple-600 dark:text-purple-400',
        bgColor: 'bg-purple-100 dark:bg-purple-900/30',
        available: true,
    },
    {
        id: 'compare',
        nameKey: 'compare',
        descKey: 'compareDesc',
        icon: <GitCompare className="w-6 h-6" />,
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-100 dark:bg-green-900/30',
        available: false,
        comingSoon: true,
    },
    {
        id: 'review',
        nameKey: 'review',
        descKey: 'reviewDesc',
        icon: <Search className="w-6 h-6" />,
        color: 'text-orange-600 dark:text-orange-400',
        bgColor: 'bg-orange-100 dark:bg-orange-900/30',
        available: false,
        comingSoon: true,
    },
    {
        id: 'pipeline',
        nameKey: 'pipeline',
        descKey: 'pipelineDesc',
        icon: <GitBranch className="w-6 h-6" />,
        color: 'text-cyan-600 dark:text-cyan-400',
        bgColor: 'bg-cyan-100 dark:bg-cyan-900/30',
        available: false,
        comingSoon: true,
    },
    {
        id: 'debate',
        nameKey: 'debate',
        descKey: 'debateDesc',
        icon: <Swords className="w-6 h-6" />,
        color: 'text-pink-600 dark:text-pink-400',
        bgColor: 'bg-pink-100 dark:bg-pink-900/30',
        available: false,
        comingSoon: true,
    },
];

/**
 * 编排模式选择器组件
 */
export const OrchestrationModeSelector: React.FC<OrchestrationModeSelectorProps> = ({
    isOpen,
    onClose,
    onSelectMode,
}) => {
    const { t } = useI18n();
    // 当前悬停的模式
    const [hoveredMode, setHoveredMode] = useState<OrchestrationMode | null>(null);

    /**
     * 选择模式
     */
    const handleSelectMode = useCallback((mode: ModeConfig) => {
        if (!mode.available) return;
        onSelectMode(mode.id);
        onClose();
    }, [onSelectMode, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* 遮罩层 */}
            <div
                className="absolute inset-0 bg-black/50"
                onClick={onClose}
            />

            {/* 弹窗内容 */}
            <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
                {/* 标题栏 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            ✨ {t.orchestration.title}
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {t.orchestration.selectAgentMode}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-[10px] transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* 模式列表 */}
                <div className="p-6">
                    <div className="grid grid-cols-2 gap-4">
                        {MODES.map((mode) => (
                            <button
                                key={mode.id}
                                onClick={() => handleSelectMode(mode)}
                                onMouseEnter={() => setHoveredMode(mode.id)}
                                onMouseLeave={() => setHoveredMode(null)}
                                disabled={!mode.available}
                                className={`relative flex items-start gap-4 p-4 rounded-[10px] border-2 text-left transition-all ${
                                    mode.available
                                        ? hoveredMode === mode.id
                                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-lg'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                        : 'border-gray-100 dark:border-gray-800 opacity-60 cursor-not-allowed'
                                }`}
                            >
                                {/* 图标 */}
                                <div className={`w-12 h-12 rounded-[10px] ${mode.bgColor} ${mode.color} flex items-center justify-center flex-shrink-0`}>
                                    {mode.icon}
                                </div>

                                {/* 内容 */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className={`font-medium ${
                                            mode.available
                                                ? 'text-gray-900 dark:text-white'
                                                : 'text-gray-500 dark:text-gray-400'
                                        }`}>
                                            {t.orchestration[mode.nameKey]}
                                        </h3>
                                        {mode.comingSoon && (
                                            <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full">
                                                {t.orchestration.comingSoon}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                        {t.orchestration[mode.descKey]}
                                    </p>
                                </div>

                                {/* 箭头 */}
                                {mode.available && (
                                    <ChevronRight className={`w-5 h-5 flex-shrink-0 transition-transform ${
                                        hoveredMode === mode.id
                                            ? 'text-purple-500 translate-x-1'
                                            : 'text-gray-300 dark:text-gray-600'
                                    }`} />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 底部提示 */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                        💡 {t.orchestration.tip}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default OrchestrationModeSelector;
