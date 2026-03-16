/**
 * Provider 选择对话框
 *
 * 显示所有可用的 AI 提供商列表，支持搜索和分组
 *
 * @module components/features/Providers/ProviderSelectModal
 * @version 3.1.0
 */

import React, { useState, useMemo } from 'react';
import { Search, Star, Cloud, Monitor, MoreHorizontal } from 'lucide-react';
import { Modal } from '../../common';
import { useI18n, getLocalizedText } from '../../../i18n';
import type { AIProvider, ProviderCategory } from '../../../types';

interface ProviderSelectModalProps {
    /** 是否显示 */
    isOpen: boolean;
    /** 关闭回调 */
    onClose: () => void;
    /** 所有提供商列表 */
    providers: AIProvider[];
    /** 选择提供商回调 */
    onSelect: (provider: AIProvider) => void;
}

/**
 * 分类图标映射
 */
const categoryIcons: Record<ProviderCategory, React.ReactNode> = {
    popular: <Star className="w-4 h-4" />,
    cloud: <Cloud className="w-4 h-4" />,
    local: <Monitor className="w-4 h-4" />,
    other: <MoreHorizontal className="w-4 h-4" />,
};

/**
 * 分类标签映射 - 使用翻译键获取
 */
const getCategoryLabel = (category: ProviderCategory, t: ReturnType<typeof useI18n>['t']) => {
    const labels: Record<ProviderCategory, string> = {
        popular: t.providers.categoryPopular,
        cloud: t.providers.categoryCloud,
        local: t.providers.categoryLocal,
        other: t.providers.categoryOther,
    };
    return labels[category];
};

/**
 * 分类排序顺序
 */
const categoryOrder: ProviderCategory[] = ['popular', 'cloud', 'local', 'other'];

export const ProviderSelectModal: React.FC<ProviderSelectModalProps> = ({
    isOpen,
    onClose,
    providers,
    onSelect,
}) => {
    const { t, language } = useI18n();
    const [searchQuery, setSearchQuery] = useState('');

    // 过滤和分组提供商
    const groupedProviders = useMemo(() => {
        // 先过滤
        const filtered = providers.filter(p => {
            const query = searchQuery.toLowerCase();
            const description = getLocalizedText(p.description, language);
            return (
                p.name.toLowerCase().includes(query) ||
                p.id.toLowerCase().includes(query) ||
                description.toLowerCase().includes(query)
            );
        });

        // 按分类分组
        const groups: Record<ProviderCategory, AIProvider[]> = {
            popular: [],
            cloud: [],
            local: [],
            other: [],
        };

        filtered.forEach(p => {
            const category = p.category || 'other';
            groups[category].push(p);
        });

        return groups;
    }, [providers, searchQuery]);

    // 处理选择
    const handleSelect = (provider: AIProvider) => {
        onSelect(provider);
        onClose();
        setSearchQuery('');
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => {
                onClose();
                setSearchQuery('');
            }}
            title={t.providers.selectProvider}
            size="lg"
        >
            <div className="flex flex-col gap-4">
                {/* 搜索框 */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t.providers.searchProviders}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-[10px] text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        autoFocus
                    />
                </div>

                {/* 提供商列表 */}
                <div className="max-h-[400px] overflow-y-auto -mx-2 px-2">
                    {categoryOrder.map(category => {
                        const providersInCategory = groupedProviders[category];
                        if (providersInCategory.length === 0) return null;

                        return (
                            <div key={category} className="mb-4">
                                {/* 分类标题 */}
                                <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    {categoryIcons[category]}
                                    <span>
                                        {getCategoryLabel(category, t)}
                                    </span>
                                    <span className="text-gray-400 dark:text-gray-500">
                                        ({providersInCategory.length})
                                    </span>
                                </div>

                                {/* 提供商列表 */}
                                <div className="space-y-1">
                                    {providersInCategory.map(provider => (
                                        <button
                                            key={provider.id}
                                            onClick={() => handleSelect(provider)}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left group"
                                        >
                                            {/* 图标 */}
                                            <div className="w-10 h-10 rounded-[10px] bg-gradient-to-br from-[#FEF3C7] to-[#DBEAFE] dark:from-purple-900/50 dark:to-pink-900/50 flex items-center justify-center text-xl flex-shrink-0">
                                                {provider.icon}
                                            </div>

                                            {/* 信息 */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-gray-800 dark:text-white">
                                                        {provider.name}
                                                    </span>
                                                    {/* 已连接标记 */}
                                                    {provider.status === 'connected' && (
                                                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                                                            {t.providers.connected}
                                                        </span>
                                                    )}
                                                </div>
                                                {provider.description && (
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                                        {getLocalizedText(provider.description, language)}
                                                    </p>
                                                )}
                                            </div>

                                            {/* 模型数量 */}
                                            <div className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                                                {provider.models.length} {t.providers.models}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    {/* 无结果提示 */}
                    {Object.values(groupedProviders).every(g => g.length === 0) && (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p>{t.providers.noProvidersFoundShort}</p>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default ProviderSelectModal;
