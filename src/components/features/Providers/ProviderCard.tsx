/**
 * Provider 卡片组件
 *
 * 显示单个 AI 提供商的状态和操作按钮
 * v3.1.1: 添加 note 说明文字显示，优化连接来源标签
 * v3.4.7: 未连接时显示支持的认证方式
 * v3.6.3: 添加可展开的配额面板（Google 提供商专用）
 * v0.9.3: 为自定义提供商添加编辑和删除按钮
 *
 * @module components/features/Providers/ProviderCard
 * @version 0.9.3
 */

import React, { useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Plug, Unplug, ExternalLink, Key, Globe, Settings, Zap, Lock, ChevronDown, ChevronUp, RefreshCw, AlertTriangle, Edit, Trash2 } from 'lucide-react';
import { Button } from '../../common';
import { useI18n, type Translations } from '../../../i18n';
import { openInBrowser } from '../../../services/oauth';
import type { AIProvider } from '../../../types';

/** v3.6.3: 模型配额信息 */
export interface ModelQuotaData {
    id: string;
    displayName?: string;
    remainingFraction?: number;
    resetTime?: string;
    isExhausted: boolean;
}

/** v0.8.0: Kiro 全局配额信息 */
export interface KiroQuotaData {
    /** 总配额 */
    totalLimit: number;
    /** 当前使用量 */
    currentUsage: number;
    /** 剩余配额 */
    remainingQuota: number;
    /** 是否已耗尽 */
    isExhausted: boolean;
    /** 订阅类型 */
    subscriptionTitle?: string;
    /** 下次重置时间（毫秒时间戳） */
    nextReset?: number;
}

interface ProviderCardProps {
    /** 提供商数据 */
    provider: AIProvider;
    /** 连接回调 */
    onConnect?: () => void;
    /** 断开连接回调 */
    onDisconnect?: () => void;
    /** 是否正在连接中 */
    isConnecting?: boolean;
    /** v3.6.3: 模型配额数据（Google 提供商专用） */
    quotaData?: ModelQuotaData[];
    /** v3.6.3: 配额加载中 */
    quotaLoading?: boolean;
    /** v3.6.3: 刷新配额回调 */
    onRefreshQuota?: () => void;
    /** v3.6.3: 配额最后更新时间 */
    quotaLastUpdated?: Date | null;
    /** v0.8.0: Kiro 全局配额数据 */
    kiroQuota?: KiroQuotaData | null;
    /** v0.9.3: 编辑自定义提供商回调 */
    onEdit?: () => void;
    /** v0.9.3: 删除自定义提供商回调 */
    onDelete?: () => void;
}

/**
 * 获取状态图标和颜色
 * @param status - 提供商状态
 * @param t - 翻译对象
 */
function getStatusDisplay(status: AIProvider['status'], t: Translations) {
    switch (status) {
        case 'connected':
            return {
                icon: <CheckCircle className="w-4 h-4 text-green-500" />,
                text: t.providers.connected,
                color: 'text-green-600 dark:text-green-400',
                bgColor: 'bg-green-50 dark:bg-green-900/30',
            };
        case 'error':
            return {
                icon: <AlertCircle className="w-4 h-4 text-red-500" />,
                text: t.common.error,
                color: 'text-red-600 dark:text-red-400',
                bgColor: 'bg-red-50 dark:bg-red-900/30',
            };
        case 'disconnected':
        default:
            return {
                icon: <XCircle className="w-4 h-4 text-gray-400" />,
                text: t.providers.disconnected,
                color: 'text-gray-500 dark:text-gray-400',
                bgColor: 'bg-gray-50 dark:bg-gray-800',
            };
    }
}

/**
 * 获取连接来源标签
 * @param source - 连接来源
 * @param t - 翻译对象
 */
function getSourceLabel(source: AIProvider['source'], t: Translations) {
    const labels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
        api: {
            label: t.providers.apiKeyAuth,
            icon: <Key className="w-3 h-3" />,
            color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
        },
        oauth: {
            label: t.providers.oauthLogin,
            icon: <Globe className="w-3 h-3" />,
            color: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
        },
        env: {
            label: t.providers.envAuth,
            icon: <Settings className="w-3 h-3" />,
            color: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-600 dark:text-yellow-400',
        },
        config: {
            label: 'Config',
            icon: <Zap className="w-3 h-3" />,
            color: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
        },
    };
    return labels[source || 'api'] || labels.api;
}

/**
 * 获取认证方式的图标和标签
 * v3.4.7: 用于未连接时显示支持的认证方式
 * @param type - 认证方式类型
 * @param t - 翻译对象
 */
function getAuthMethodDisplay(type: string, t: Translations) {
    const displays: Record<string, { icon: React.ReactNode; label: string }> = {
        api: {
            icon: <Key className="w-3 h-3" />,
            label: t.providers.apiKeyAuth,
        },
        oauth: {
            icon: <Globe className="w-3 h-3" />,
            label: t.providers.oauthLogin,
        },
        env: {
            icon: <Settings className="w-3 h-3" />,
            label: t.providers.envAuth,
        },
        none: {
            icon: <Lock className="w-3 h-3" />,
            label: 'No Auth',
        },
    };
    return displays[type] || displays.api;
}

export const ProviderCard: React.FC<ProviderCardProps> = ({
    provider,
    onConnect,
    onDisconnect,
    isConnecting = false,
    quotaData,
    quotaLoading = false,
    onRefreshQuota,
    quotaLastUpdated,
    kiroQuota,
    onEdit,
    onDelete,
}) => {
    const { t, language } = useI18n();
    const [showQuota, setShowQuota] = useState(false);
    const statusDisplay = getStatusDisplay(provider.status, t);
    const isConnected = provider.status === 'connected';
    const sourceLabel = isConnected ? getSourceLabel(provider.source, t) : null;

    // 环境变量连接的不能断开
    const canDisconnect = provider.source !== 'env';

    // v0.9.3: 是否为自定义提供商
    const isCustomProvider = provider.isCustom || provider.id.startsWith('custom-');

    // v3.6.3: 是否为 Google 提供商且有配额数据
    const isGoogleWithQuota = provider.id.toLowerCase() === 'google' && isConnected && quotaData && quotaData.length > 0;

    // v0.8.0: 是否为 Kiro 提供商且有配额数据
    const isKiroWithQuota = provider.id.toLowerCase() === 'kiro' && isConnected && kiroQuota !== undefined;

    return (
        <div className={`
            bg-white dark:bg-gray-800 rounded-[10px] border border-gray-200 dark:border-gray-700
            hover:border-purple-300 dark:hover:border-purple-600 transition-all
            p-4 flex flex-col gap-3
        `}>
            {/* 头部：图标、名称、状态 */}
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    {/* 提供商图标 */}
                    <div className="w-12 h-12 rounded-[10px] bg-gradient-to-br from-[#FEF3C7] to-[#DBEAFE] dark:from-purple-900/50 dark:to-pink-900/50 flex items-center justify-center text-2xl">
                        {provider.icon}
                    </div>
                    <div>
                        {/* 提供商名称 */}
                        <h3 className="font-semibold text-gray-800 dark:text-white">
                            {provider.name}
                        </h3>
                        {/* v0.9.3.6: 自定义提供商标签（单独一行） */}
                        {isCustomProvider && (
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <span className="inline-flex items-center px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded whitespace-nowrap">
                                    {language === 'zh' ? '自定义' : 'Custom'}
                                </span>
                                {/* 显示协议类型 */}
                                {provider.protocol && (
                                    <span className="inline-flex items-center px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded whitespace-nowrap">
                                        {provider.protocol.toUpperCase()}
                                    </span>
                                )}
                            </div>
                        )}
                        {/* 说明文字（参考 opencode） */}
                        {provider.note && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {language === 'zh' ? provider.note.zh : provider.note.en}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* v0.9.3: 自定义提供商操作按钮 */}
                    {isCustomProvider && (
                        <div className="flex gap-1">
                            <button
                                onClick={onEdit}
                                className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                title={language === 'zh' ? '编辑' : 'Edit'}
                            >
                                <Edit className="w-4 h-4" />
                            </button>
                            <button
                                onClick={onDelete}
                                className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                title={language === 'zh' ? '删除' : 'Delete'}
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* 状态指示器 */}
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${statusDisplay.bgColor}`}>
                        {statusDisplay.icon}
                        <span className={`text-xs font-medium ${statusDisplay.color}`}>
                            {statusDisplay.text}
                        </span>
                    </div>
                </div>
            </div>

            {/* 连接来源标签（已连接时显示） */}
            {isConnected && sourceLabel && (
                <div className="flex items-center gap-2">
                    <span className={`
                        inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium
                        ${sourceLabel.color}
                    `}>
                        {sourceLabel.icon}
                        {sourceLabel.label}
                    </span>
                    {/* 模型数量 */}
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                        {provider.models.length} {t.providers.models}
                    </span>
                </div>
            )}

            {/* 未连接时显示支持的认证方式和模型数量 */}
            {!isConnected && (
                <div className="flex items-center gap-2 flex-wrap">
                    {/* 支持的认证方式 */}
                    {provider.authMethods && provider.authMethods.length > 0 && (
                        <div className="flex items-center gap-1">
                            {provider.authMethods.map((method, index) => {
                                const display = getAuthMethodDisplay(method.type, t);
                                return (
                                    <span
                                        key={index}
                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                                        title={method.label}
                                    >
                                        {display.icon}
                                        <span className="hidden sm:inline">{display.label}</span>
                                    </span>
                                );
                            })}
                        </div>
                    )}
                    {/* 模型数量 */}
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                        {provider.models.length} {t.providers.models}
                    </span>
                </div>
            )}

            {/* 错误信息 */}
            {provider.status === 'error' && provider.errorMessage && (
                <div className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded p-2">
                    {provider.errorMessage}
                </div>
            )}

            {/* v3.6.3: Google 配额展开面板 */}
            {isGoogleWithQuota && (
                <div className="border-t border-gray-100 dark:border-gray-700 pt-2">
                    {/* 配额标题栏（可点击展开） */}
                    <button
                        onClick={() => setShowQuota(!showQuota)}
                        className="w-full flex items-center justify-between text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <span>📊</span>
                            <span>{t.providers.modelQuota}</span>
                            <span className="text-xs text-gray-400">({quotaData!.length})</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {quotaLastUpdated && (
                                <span className="text-xs text-gray-400">
                                    {quotaLastUpdated.toLocaleTimeString()}
                                </span>
                            )}
                            {showQuota ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                    </button>

                    {/* 配额详情（展开时显示） */}
                    {showQuota && (
                        <div className="mt-3 space-y-2">
                            {/* 刷新按钮 */}
                            {onRefreshQuota && (
                                <div className="flex justify-end">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRefreshQuota();
                                        }}
                                        disabled={quotaLoading}
                                        className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50"
                                    >
                                        <RefreshCw className={`w-3 h-3 ${quotaLoading ? 'animate-spin' : ''}`} />
                                        {quotaLoading ? t.common.loading : t.common.refresh}
                                    </button>
                                </div>
                            )}

                            {/* 配额列表 */}
                            <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                                {quotaData!
                                    .filter(m => !m.id.toLowerCase().includes('chat_') && !m.id.toLowerCase().includes('tab_'))
                                    .map((model) => {
                                        const remainingPercent = model.remainingFraction !== undefined
                                            ? Math.round(model.remainingFraction * 100)
                                            : 100;
                                        const isExhausted = model.isExhausted || remainingPercent <= 0;

                                        return (
                                            <div
                                                key={model.id}
                                                className={`bg-gray-50 dark:bg-gray-700/50 rounded p-2 ${
                                                    isExhausted ? 'border border-red-300 dark:border-red-700' : ''
                                                }`}
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate" title={model.id}>
                                                        {model.displayName || model.id}
                                                    </span>
                                                    <span className={`text-xs ${
                                                        isExhausted
                                                            ? 'text-red-600 dark:text-red-400'
                                                            : remainingPercent < 20
                                                                ? 'text-amber-600 dark:text-amber-400'
                                                                : 'text-green-600 dark:text-green-400'
                                                    }`}>
                                                        {isExhausted ? (
                                                            <span className="flex items-center gap-1">
                                                                <AlertTriangle className="w-3 h-3" />
                                                                {t.providers.quotaExhausted}
                                                            </span>
                                                        ) : (
                                                            `${remainingPercent}%`
                                                        )}
                                                    </span>
                                                </div>
                                                {/* 进度条 */}
                                                <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full transition-all ${
                                                            isExhausted
                                                                ? 'bg-red-500'
                                                                : remainingPercent < 20
                                                                    ? 'bg-amber-500'
                                                                    : 'bg-green-500'
                                                        }`}
                                                        style={{ width: `${remainingPercent}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* v0.8.0: Kiro 配额面板（全局配额，不按模型区分） */}
            {isKiroWithQuota && kiroQuota && (
                <div className="border-t border-gray-100 dark:border-gray-700 pt-2">
                    {/* 配额标题栏（可点击展开） */}
                    <button
                        onClick={() => setShowQuota(!showQuota)}
                        className="w-full flex items-center justify-between text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <span>📊</span>
                            <span>{t.providers.modelQuota}</span>
                            {kiroQuota.subscriptionTitle && (
                                <span className="text-xs text-purple-500 dark:text-purple-400">
                                    ({kiroQuota.subscriptionTitle})
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {quotaLastUpdated && (
                                <span className="text-xs text-gray-400">
                                    {quotaLastUpdated.toLocaleTimeString()}
                                </span>
                            )}
                            {showQuota ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                    </button>

                    {/* 配额详情（展开时显示） */}
                    {showQuota && (
                        <div className="mt-3 space-y-2">
                            {/* 刷新按钮 */}
                            {onRefreshQuota && (
                                <div className="flex justify-end">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRefreshQuota();
                                        }}
                                        disabled={quotaLoading}
                                        className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50"
                                    >
                                        <RefreshCw className={`w-3 h-3 ${quotaLoading ? 'animate-spin' : ''}`} />
                                        {quotaLoading ? t.common.loading : t.common.refresh}
                                    </button>
                                </div>
                            )}

                            {/* Kiro 全局配额显示 */}
                            {(() => {
                                const remainingPercent = kiroQuota.totalLimit > 0
                                    ? Math.round((kiroQuota.remainingQuota / kiroQuota.totalLimit) * 100)
                                    : 0;
                                const isExhausted = kiroQuota.isExhausted || remainingPercent <= 0;

                                return (
                                    <div className={`bg-gray-50 dark:bg-gray-700/50 rounded p-3 ${
                                        isExhausted ? 'border border-red-300 dark:border-red-700' : ''
                                    }`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                {language === 'zh' ? 'Agentic 请求配额' : 'Agentic Request Quota'}
                                            </span>
                                            <span className={`text-sm font-medium ${
                                                isExhausted
                                                    ? 'text-red-600 dark:text-red-400'
                                                    : remainingPercent < 20
                                                        ? 'text-amber-600 dark:text-amber-400'
                                                        : 'text-green-600 dark:text-green-400'
                                            }`}>
                                                {isExhausted ? (
                                                    <span className="flex items-center gap-1">
                                                        <AlertTriangle className="w-4 h-4" />
                                                        {t.providers.quotaExhausted}
                                                    </span>
                                                ) : (
                                                    `${remainingPercent}%`
                                                )}
                                            </span>
                                        </div>
                                        {/* 进度条 */}
                                        <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden mb-2">
                                            <div
                                                className={`h-full transition-all ${
                                                    isExhausted
                                                        ? 'bg-red-500'
                                                        : remainingPercent < 20
                                                            ? 'bg-amber-500'
                                                            : 'bg-green-500'
                                                }`}
                                                style={{ width: `${remainingPercent}%` }}
                                            />
                                        </div>
                                        {/* 详细数值 */}
                                        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                                            <span>
                                                {language === 'zh' ? '已用' : 'Used'}: {Math.round(kiroQuota.currentUsage)}
                                            </span>
                                            <span>
                                                {language === 'zh' ? '剩余' : 'Remaining'}: {Math.round(kiroQuota.remainingQuota)}
                                            </span>
                                            <span>
                                                {language === 'zh' ? '总计' : 'Total'}: {Math.round(kiroQuota.totalLimit)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </div>
            )}

            {/* 操作按钮 */}
            <div className="flex items-center gap-2 mt-auto pt-2 border-t border-gray-100 dark:border-gray-700">
                {isConnected ? (
                    <>
                        {canDisconnect ? (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={onDisconnect}
                                icon={<Unplug className="w-4 h-4" />}
                                className="flex-1"
                            >
                                {t.providers.disconnect}
                            </Button>
                        ) : (
                            <span className="flex-1 text-xs text-gray-400 dark:text-gray-500 text-center">
                                {t.providers.connectedViaEnv}
                            </span>
                        )}
                        {/* 外部链接（如果有默认端点） */}
                        {provider.defaultEndpoint && !provider.defaultEndpoint.includes('localhost') && (
                            <button
                                onClick={() => {
                                    // 提取域名并打开
                                    try {
                                        const url = new URL(provider.defaultEndpoint);
                                        openInBrowser(`https://${url.hostname}`);
                                    } catch {
                                        // 忽略无效 URL
                                    }
                                }}
                                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-[10px] transition-colors"
                            >
                                <ExternalLink className="w-4 h-4" />
                            </button>
                        )}
                    </>
                ) : (
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={onConnect}
                        disabled={isConnecting}
                        icon={<Plug className="w-4 h-4" />}
                        className="flex-1"
                    >
                        {isConnecting ? t.providers.connecting : t.providers.connect}
                    </Button>
                )}
            </div>
        </div>
    );
};

export default ProviderCard;
