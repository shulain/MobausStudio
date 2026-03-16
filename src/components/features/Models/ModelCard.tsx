/**
 * 模型卡片组件
 *
 * v3.5.0: 区分提供商凭证和独立 API Key
 * v3.6.1: 支持显示配额信息（可选，Google 模型专用）
 *
 * @module components/features/Models/ModelCard
 */

import React from 'react';
import { CheckCircle, XCircle, Key, Trash2, Edit, Play, Loader2, Link, AlertTriangle } from 'lucide-react';
import { useI18n } from '../../../i18n';
import type { AIModelConfig, ModelQuotaInfo } from '../../../types';

interface ModelCardProps {
    model: AIModelConfig;
    onEdit: () => void;
    onTest: () => void;
    onDelete: () => void;
    isTesting?: boolean;
    /** v3.6.1: 配额信息（可选，Google 模型专用） */
    quota?: ModelQuotaInfo;
}

const providerColors: Record<string, string> = {
    OpenAI: 'from-green-500 to-emerald-500',
    Anthropic: 'from-orange-500 to-amber-500',
    Google: 'from-blue-500 to-cyan-500',
    Custom: 'from-[#F6C433] via-[#E90E55] via-[#E44F32] via-[#A188E3] to-[#0DB4EA]',
};

const providerIcons: Record<string, string> = {
    OpenAI: '🤖',
    Anthropic: '🧠',
    Google: '✨',
    Custom: '⚙️',
};

/**
 * v3.6.1: 格式化配额百分比
 */
function formatQuotaPercent(fraction: number): string {
    const percent = Math.round(fraction * 100);
    return `${percent}%`;
}

/**
 * v3.6.1: 获取配额状态颜色
 */
function getQuotaColorClass(fraction: number, isExhausted: boolean): string {
    if (isExhausted || fraction <= 0) {
        return 'text-red-500 dark:text-red-400';
    }
    if (fraction < 0.2) {
        return 'text-amber-500 dark:text-amber-400';
    }
    return 'text-green-500 dark:text-green-400';
}

export const ModelCard: React.FC<ModelCardProps> = ({
    model,
    onEdit,
    onTest,
    onDelete,
    isTesting = false,
    quota,
}) => {
    const { t } = useI18n();
    const gradientClass = providerColors[model.provider] || 'from-gray-500 to-gray-600';
    const icon = providerIcons[model.provider] || '🔌';

    return (
        <div className="bg-white dark:bg-gray-800 rounded-[10px] border-2 border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-500 hover:shadow-lg transition-all p-5">
            <div className="flex items-start gap-4">
                {/* 图标 */}
                <div className={`w-14 h-14 bg-gradient-to-br ${gradientClass} rounded-[10px] flex items-center justify-center text-white text-2xl flex-shrink-0 shadow-lg`}>
                    {icon}
                </div>

                <div className="flex-1 min-w-0">
                    {/* 头部 */}
                    <div className="flex items-start justify-between mb-2">
                        <div>
                            <h3 className="font-bold text-gray-800 dark:text-gray-100">{model.name}</h3>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{model.provider}</span>
                        </div>
                        {/* v2.5.3: 支持 online/offline/error 三种状态 */}
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            model.status === 'online'
                                ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                                : model.status === 'error'
                                    ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                        }`}>
                            {model.status === 'online' ? (
                                <CheckCircle className="w-3 h-3" />
                            ) : (
                                <XCircle className="w-3 h-3" />
                            )}
                            {model.status === 'online' ? t.models.statusOnline : model.status === 'error' ? t.models.statusError : t.models.statusOffline}
                        </div>
                    </div>

                    {/* 信息 */}
                    <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2 text-sm">
                            {/* v3.5.0: 区分提供商凭证和独立 API Key */}
                            {model.useProviderCredential ? (
                                <>
                                    <Link className="w-4 h-4 text-green-500 dark:text-green-400" />
                                    <span className="text-green-600 dark:text-green-400">
                                        {t.models.useProviderCredentials}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <Key className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                    <span className={model.apiKeySet ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
                                        {model.apiKeySet ? t.models.apiKeySet : t.models.apiKeyNotSet}
                                    </span>
                                </>
                            )}
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                            {/* v3.5.0: 修复端点文字溢出问题，添加 truncate 和 max-width */}
                            <span className="truncate max-w-[60%]" title={model.endpoint || t.models.endpointDefault}>
                                {t.models.endpointLabel}: {model.endpoint || t.models.endpointDefault}
                            </span>
                            <span className="flex-shrink-0">Max Tokens: {model.maxTokens.toLocaleString()}</span>
                        </div>
                        {model.pricing && (
                            <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                                <span>{t.models.pricingInput}: ${model.pricing.input}/1K</span>
                                <span>{t.models.pricingOutput}: ${model.pricing.output}/1K</span>
                            </div>
                        )}
                        {/* v3.6.1: 配额信息显示（Google 模型专用） */}
                        {quota && (
                            <div className="flex items-center gap-2 text-xs">
                                {quota.isExhausted ? (
                                    <>
                                        <AlertTriangle className="w-3 h-3 text-red-500 dark:text-red-400" />
                                        <span className="text-red-500 dark:text-red-400">{t.models.quotaExhausted}</span>
                                    </>
                                ) : (
                                    <>
                                        <span className={getQuotaColorClass(quota.remainingFraction, quota.isExhausted)}>
                                            {t.models.remainingQuota}: {formatQuotaPercent(quota.remainingFraction)}
                                        </span>
                                        {quota.resetTime && (
                                            <span className="text-gray-400 dark:text-gray-500">
                                                · {t.models.resetAt} {new Date(quota.resetTime).toLocaleString()}
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex gap-2">
                        <button
                            onClick={onTest}
                            disabled={!model.apiKeySet || isTesting}
                            className="flex-1 py-2 px-3 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-[10px] text-sm font-medium hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                        >
                            {isTesting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Play className="w-4 h-4" />
                            )}
                            {isTesting ? t.models.testing : t.common.test}
                        </button>
                        <button
                            onClick={onEdit}
                            className="py-2 px-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-[10px] text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                        >
                            <Edit className="w-4 h-4" />
                        </button>
                        <button
                            onClick={onDelete}
                            className="py-2 px-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-[10px] text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

};

export default ModelCard;
