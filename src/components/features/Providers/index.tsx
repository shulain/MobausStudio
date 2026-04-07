/**
 * Provider 管理页面 (v3.5.0)
 *
 * 显示和管理所有 AI 服务提供商的连接状态
 * - v3.5.0: 使用 PageHeader 组件优化头部布局，节省垂直空间
 * - v3.6.3: 集成 Google 配额显示到 ProviderCard
 * - v0.8.0: 集成 Kiro 配额显示到 ProviderCard
 * - v0.9.3: 支持添加和管理自定义提供商
 *
 * @module components/features/Providers
 * @version 0.9.3
 */

import { CheckCircle, Cpu, Plug, Plus, XCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useGoogleModels } from '../../../hooks/useGoogleModels';
import { useKiroModels } from '../../../hooks/useKiroModels';
import { getLocalizedText, useI18n, translate } from '../../../i18n';
import { loadProviderCredentialsSafe } from '../../../services/auth/providerCredentialAccess';
import { logger, LogTags } from '../../../utils/logger';
import type { AIProvider, OAuthResult } from '../../../types';
import { Button, PageHeader, ConfirmDialog, type StatItem } from '../../common';
import { ProviderCard, type KiroQuotaData, type ModelQuotaData } from './ProviderCard';
import { ProviderConnectModal } from './ProviderConnectModal';
import { ProviderSelectModal } from './ProviderSelectModal';
import { CustomProviderModal } from './CustomProviderModal';

interface ProviderPageProps {
    /** 所有提供商列表（包含连接状态） */
    providers: AIProvider[];
    /** 连接提供商回调 (v3.4.11: 添加 oauthResult 参数支持完整 OAuth 信息) */
    onConnect: (providerId: string, authMethod: number, apiKey?: string, oauthResult?: OAuthResult) => Promise<boolean>;
    /** 断开连接回调 */
    onDisconnect: (providerId: string) => Promise<void>;
    /** 测试连接回调 */
    onTestConnection?: (providerId: string, apiKey: string) => Promise<boolean>;
    /** v0.9.3: 自定义提供商变更回调（通知父组件重新加载） */
    onCustomProvidersChange?: () => void;
}

export const ProviderPage: React.FC<ProviderPageProps> = ({
    providers,
    onConnect,
    onDisconnect,
    onTestConnection,
    onCustomProvidersChange,
}) => {
    const { t, language } = useI18n();

    // 搜索和筛选
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'connected' | 'disconnected'>('all');

    // 对话框状态
    const [showSelectModal, setShowSelectModal] = useState(false);
    const [showConnectModal, setShowConnectModal] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(null);

    // v0.9.3: 自定义提供商对话框状态
    const [showCustomProviderModal, setShowCustomProviderModal] = useState(false);
    const [editingCustomProvider, setEditingCustomProvider] = useState<AIProvider | null>(null);

    // v0.9.3.5: 删除确认对话框状态
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deletingProviderId, setDeletingProviderId] = useState<string | null>(null);

    // 连接中状态
    const [connectingProviderId, setConnectingProviderId] = useState<string | null>(null);

    // v3.6.3: Google 配额相关状态
    const [googleAccessToken, setGoogleAccessToken] = useState<string | undefined>();
    const [googleProjectId, setGoogleProjectId] = useState<string | undefined>();

    // v3.6.3: 检查 Google 提供商是否已连接
    const googleProvider = providers.find((p) => p.id.toLowerCase() === 'google');
    const isGoogleConnected = googleProvider?.status === 'connected';

    // v3.6.3: 使用 useGoogleModels hook 获取配额信息
    const {
        rawModels: googleRawModels,
        loading: googleQuotaLoading,
        refresh: refreshGoogleQuota,
        lastUpdated: googleQuotaLastUpdated,
    } = useGoogleModels({
        accessToken: isGoogleConnected ? googleAccessToken : undefined,
        projectId: googleProjectId,
        autoFetch: isGoogleConnected && !!googleAccessToken,
    });

    // v3.6.3: 加载 Google 凭证
    useEffect(() => {
        const loadGoogleCredential = async () => {
            if (!isGoogleConnected) {
                setGoogleAccessToken(undefined);
                setGoogleProjectId(undefined);
                return;
            }

            const credentials = await loadProviderCredentialsSafe({
                context: 'Provider 页面加载 Google 凭证失败',
            });
            const credential = credentials.find(c => c.providerId.toLowerCase() === 'google');
            if (credential) {
                setGoogleAccessToken(credential.accessToken);
                setGoogleProjectId(credential.projectId);
            }
        };

        loadGoogleCredential();
    }, [isGoogleConnected]);

    // v3.6.3: 转换为 ModelQuotaData 格式
    const googleQuotaData: ModelQuotaData[] = googleRawModels.map(m => ({
        id: m.id,
        displayName: m.displayName,
        remainingFraction: m.remainingFraction,
        resetTime: m.resetTime,
        isExhausted: m.isExhausted || false,
    }));

    // v0.8.0: Kiro 配额相关状态
    // v0.9.0: 添加 authMethod 状态
    // v4.1.31: 添加 ssoRegion 状态
    const [kiroAccessToken, setKiroAccessToken] = useState<string | undefined>();
    const [kiroProfileArn, setKiroProfileArn] = useState<string | undefined>();
    const [kiroAuthMethod, setKiroAuthMethod] = useState<string | undefined>();
    const [kiroSsoRegion, setKiroSsoRegion] = useState<string | undefined>();

    // v0.8.0: 检查 Kiro 提供商是否已连接
    const kiroProvider = providers.find((p) => p.id.toLowerCase() === 'kiro');
    const isKiroConnected = kiroProvider?.status === 'connected';

    // v0.8.0: 使用 useKiroModels hook 获取配额信息
    // v0.9.0: 添加 authMethod 用于选择正确的 User-Agent
    // 注意：动态模型列表已由 App.tsx 统一增强，这里只获取配额信息用于显示
    const {
        quota: kiroQuotaInfo,
        loading: kiroQuotaLoading,
        refresh: refreshKiroQuota,
        lastUpdated: kiroQuotaLastUpdated,
    } = useKiroModels({
        accessToken: isKiroConnected ? kiroAccessToken : undefined,
        profileArn: isKiroConnected ? kiroProfileArn : undefined,
        authMethod: isKiroConnected ? kiroAuthMethod : undefined,
        ssoRegion: isKiroConnected ? kiroSsoRegion : undefined,
        // v0.8.0: 只需要 accessToken，profileArn 是可选的（AWS Builder ID 用户没有）
        autoFetch: isKiroConnected && !!kiroAccessToken,
    });

    // v0.8.0: 加载 Kiro 凭证
    // v0.9.0: 添加 authMethod 加载
    useEffect(() => {
        const loadKiroCredential = async () => {
            if (!isKiroConnected) {
                setKiroAccessToken(undefined);
                setKiroProfileArn(undefined);
                setKiroAuthMethod(undefined);
                setKiroSsoRegion(undefined);
                return;
            }

            const credentials = await loadProviderCredentialsSafe({
                context: 'Provider 页面加载 Kiro 凭证失败',
            });
            const credential = credentials.find(c => c.providerId.toLowerCase() === 'kiro');
            if (credential) {
                setKiroAccessToken(credential.accessToken);
                setKiroProfileArn(credential.profileArn);
                setKiroAuthMethod(credential.authMethod);
                setKiroSsoRegion(credential.kiroSsoRegion);
            }
        };

        loadKiroCredential();
    }, [isKiroConnected]);

    // v0.8.0: 转换为 KiroQuotaData 格式
    const kiroQuotaData: KiroQuotaData | null = kiroQuotaInfo ? {
        totalLimit: kiroQuotaInfo.total_limit,
        currentUsage: kiroQuotaInfo.current_usage,
        remainingQuota: kiroQuotaInfo.remaining_quota,
        isExhausted: kiroQuotaInfo.is_exhausted,
        subscriptionTitle: kiroQuotaInfo.subscription_title,
        nextReset: kiroQuotaInfo.next_reset,
    } : null;

    // 统计数据 - 转换为 StatItem 格式
    // v0.8.0: 模型数量只统计已连接提供商的模型
    const connectedProvidersForStats = providers.filter(p => p.status === 'connected');
    const stats: StatItem[] = [
        {
            label: t.providers.total,
            value: providers.length,
            color: 'default',
        },
        {
            label: t.providers.connected,
            value: connectedProvidersForStats.length,
            icon: <CheckCircle />,
            color: 'success',
        },
        {
            label: t.providers.disconnected,
            value: providers.filter(p => p.status === 'disconnected').length,
            icon: <XCircle />,
            color: 'default',
        },
        {
            label: t.nav.models,
            value: connectedProvidersForStats.reduce((sum, p) => sum + p.models.length, 0),
            icon: <Cpu />,
            color: 'info',
        },
    ];

    // 过滤提供商
    const filteredProviders = providers.filter(p => {
        // 搜索过滤
        const description = getLocalizedText(p.description, language);
        const matchesSearch = searchQuery === '' ||
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            description.toLowerCase().includes(searchQuery.toLowerCase());

        // 状态过滤
        const matchesStatus = statusFilter === 'all' ||
            (statusFilter === 'connected' && p.status === 'connected') ||
            (statusFilter === 'disconnected' && p.status !== 'connected');

        return matchesSearch && matchesStatus;
    });

    // v0.8.0: 动态模型列表已由 App.tsx 统一增强，不再需要在这里处理
    // 直接使用 filteredProviders

    // 已连接的提供商
    const connectedProviders = filteredProviders.filter(p => p.status === 'connected');

    // v0.9.3.3: 热门未连接的提供商（包含自定义）
    const popularDisconnected = filteredProviders.filter(
        p => p.popular && p.status !== 'connected'
    );

    // v0.9.3.3: 其他未连接的提供商（包含自定义）
    const otherDisconnected = filteredProviders.filter(
        p => !p.popular && p.status !== 'connected'
    );

    // 处理选择提供商
    const handleSelectProvider = (provider: AIProvider) => {
        setSelectedProvider(provider);
        setShowSelectModal(false);
        setShowConnectModal(true);
    };

    // 处理连接 (v3.4.11: 使用 OAuthResult 传递完整 OAuth 信息)
    const handleConnect = async (providerId: string, authMethod: number, apiKey?: string, oauthResult?: OAuthResult) => {
        setConnectingProviderId(providerId);
        try {
            const success = await onConnect(providerId, authMethod, apiKey, oauthResult);
            return success;
        } finally {
            setConnectingProviderId(null);
        }
    };

    // 处理断开连接
    const handleDisconnect = async (providerId: string) => {
        await onDisconnect(providerId);
    };

    // v0.9.3.2: 处理点击连接按钮（智能判断是否需要弹出输入框）
    const handleConnectClick = async (provider: AIProvider) => {
        // 检查第一个认证方法的类型
        const firstAuthMethod = provider.authMethods[0];

        // 如果是 OAuth 或其他非 API Key 认证，直接弹出对话框
        if (!firstAuthMethod || firstAuthMethod.type !== 'api') {
            setSelectedProvider(provider);
            setShowConnectModal(true);
            return;
        }

        // 对于 API Key 认证，检查是否已有凭证
        const { providerCredentialsStorage } = await import('../../../services/storage');
        const credential = await providerCredentialsStorage.get(provider.id);

        // 如果已有 API Key，直接连接
        if (credential?.apiKey) {
            setConnectingProviderId(provider.id);
            try {
                await onConnect(provider.id, 0, credential.apiKey);
            } finally {
                setConnectingProviderId(null);
            }
        } else {
            // 没有凭证，弹出输入框
            setSelectedProvider(provider);
            setShowConnectModal(true);
        }
    };

    // v0.9.3: 处理添加自定义提供商
    const handleAddCustomProvider = () => {
        setEditingCustomProvider(null);
        setShowCustomProviderModal(true);
    };

    // v0.9.3: 处理编辑自定义提供商
    const handleEditCustomProvider = (provider: AIProvider) => {
        setEditingCustomProvider(provider);
        setShowCustomProviderModal(true);
    };

    // v0.9.3.5: 处理删除自定义提供商（显示确认对话框）
    const handleDeleteCustomProvider = (providerId: string) => {
        setDeletingProviderId(providerId);
        setShowDeleteConfirm(true);
    };

    // v0.9.3.5: 确认删除
    const handleConfirmDelete = async () => {
        if (!deletingProviderId) return;

        try {
            // 删除自定义提供商配置
            const { customProviderStorage } = await import('../../../services/customProviderStorage');
            await customProviderStorage.remove(deletingProviderId);

            // 同时删除关联的凭证
            const { providerCredentialsStorage } = await import('../../../services/storage');
            await providerCredentialsStorage.remove(deletingProviderId);

            // 通知父组件重新加载
            onCustomProvidersChange?.();

            // 关闭对话框
            setShowDeleteConfirm(false);
            setDeletingProviderId(null);
        } catch (error) {
            logger.error(LogTags.PROVIDER, translate('logs.provider.deleteFailed', t), error);
            alert(t.common.error || '删除失败');
        }
    };

    // v0.9.3.5: 取消删除
    const handleCancelDelete = () => {
        setShowDeleteConfirm(false);
        setDeletingProviderId(null);
    };

    // v0.9.3: 处理自定义提供商保存成功
    const handleCustomProviderSaved = () => {
        // 通知父组件重新加载
        onCustomProvidersChange?.();
    };

    return (
        <div className="flex-1 overflow-hidden">
            <div className="h-full flex flex-col">
                {/* v3.5.0: 使用 PageHeader 组件优化头部布局 */}
                <PageHeader
                    icon={<Plug className="text-purple-600" />}
                    title={t.providers.title}
                    subtitle={t.providers.subtitle}
                    stats={stats}
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder={t.providers.searchProviders}
                    filters={
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-[10px] text-sm text-gray-800 dark:text-gray-100"
                        >
                            <option value="all">{t.providers.allStatus}</option>
                            <option value="connected">{t.providers.connected}</option>
                            <option value="disconnected">{t.providers.disconnected}</option>
                        </select>
                    }
                    actions={
                        <div className="flex gap-2">
                            <Button
                                onClick={() => setShowSelectModal(true)}
                                icon={<Plus className="w-4 h-4" />}
                            >
                                {t.providers.addProvider}
                            </Button>
                            <Button
                                onClick={handleAddCustomProvider}
                                icon={<Plus className="w-4 h-4" />}
                                className="bg-gradient-to-bl from-[#A688F6] to-[#009BF3]"
                            >
                                {t.providers.addCustomProvider || '添加自定义'}
                            </Button>
                        </div>
                    }
                />

                {/* 提供商列表 */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* 已连接的提供商 */}
                    {connectedProviders.length > 0 && (
                        <section>
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                                <CheckCircle className="w-5 h-5 text-green-500" />
                                {t.providers.connected}
                                <span className="text-sm font-normal text-gray-400">
                                    ({connectedProviders.length})
                                </span>
                            </h3>
                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                                {connectedProviders.map(provider => {
                                    const isGoogle = provider.id.toLowerCase() === 'google';
                                    const isKiro = provider.id.toLowerCase() === 'kiro';
                                    const isCustom = provider.isCustom || provider.id.startsWith('custom-');

                                    return (
                                        <ProviderCard
                                            key={provider.id}
                                            provider={provider}
                                            onDisconnect={() => handleDisconnect(provider.id)}
                                            isConnecting={connectingProviderId === provider.id}
                                            // v3.6.3: 为 Google 提供商传递配额数据
                                            quotaData={isGoogle ? googleQuotaData : undefined}
                                            quotaLoading={isGoogle ? googleQuotaLoading : isKiro ? kiroQuotaLoading : false}
                                            onRefreshQuota={isGoogle ? refreshGoogleQuota : isKiro ? refreshKiroQuota : undefined}
                                            quotaLastUpdated={isGoogle ? googleQuotaLastUpdated : isKiro ? kiroQuotaLastUpdated : undefined}
                                            // v0.8.0: 为 Kiro 提供商传递配额数据
                                            kiroQuota={isKiro ? kiroQuotaData : undefined}
                                            // v0.9.3: 为自定义提供商传递编辑和删除回调
                                            onEdit={isCustom ? () => handleEditCustomProvider(provider) : undefined}
                                            onDelete={isCustom ? () => handleDeleteCustomProvider(provider.id) : undefined}
                                        />
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* 热门提供商（未连接） */}
                    {popularDisconnected.length > 0 && (
                        <section>
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                                ⭐ {t.providers.popularProviders}
                                <span className="text-sm font-normal text-gray-400">
                                    ({popularDisconnected.length})
                                </span>
                            </h3>
                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                                {popularDisconnected.map(provider => {
                                    const isCustom = provider.isCustom || provider.id.startsWith('custom-');
                                    return (
                                        <ProviderCard
                                            key={provider.id}
                                            provider={provider}
                                            onConnect={() => handleConnectClick(provider)}
                                            isConnecting={connectingProviderId === provider.id}
                                            onEdit={isCustom ? () => handleEditCustomProvider(provider) : undefined}
                                            onDelete={isCustom ? () => handleDeleteCustomProvider(provider.id) : undefined}
                                        />
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* 其他提供商（未连接） */}
                    {otherDisconnected.length > 0 && (
                        <section>
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-3 flex items-center gap-2">
                                {t.providers.otherProviders}
                                <span className="text-sm font-normal text-gray-400">
                                    ({otherDisconnected.length})
                                </span>
                            </h3>
                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                                {otherDisconnected.map(provider => {
                                    const isCustom = provider.isCustom || provider.id.startsWith('custom-');
                                    return (
                                        <ProviderCard
                                            key={provider.id}
                                            provider={provider}
                                            onConnect={() => handleConnectClick(provider)}
                                            isConnecting={connectingProviderId === provider.id}
                                            onEdit={isCustom ? () => handleEditCustomProvider(provider) : undefined}
                                            onDelete={isCustom ? () => handleDeleteCustomProvider(provider.id) : undefined}
                                        />
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* 无结果提示 */}
                    {filteredProviders.length === 0 && (
                        <div className="text-center py-12">
                            <Plug className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-600 dark:text-gray-300 mb-2">
                                {t.providers.noProvidersFound}
                            </h3>
                            <p className="text-gray-400 dark:text-gray-500 mb-4">
                                {t.providers.noProvidersFoundDesc}
                            </p>
                            <Button
                                onClick={() => setShowSelectModal(true)}
                                icon={<Plus className="w-4 h-4" />}
                            >
                                {t.providers.addProvider}
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* 选择提供商对话框 */}
            <ProviderSelectModal
                isOpen={showSelectModal}
                onClose={() => setShowSelectModal(false)}
                providers={providers}
                onSelect={handleSelectProvider}
            />

            {/* 连接提供商对话框 */}
            <ProviderConnectModal
                isOpen={showConnectModal}
                onClose={() => {
                    setShowConnectModal(false);
                    setSelectedProvider(null);
                }}
                provider={selectedProvider}
                onConnect={handleConnect}
                onTestConnection={onTestConnection}
            />

            {/* v0.9.3: 自定义提供商对话框 */}
            <CustomProviderModal
                open={showCustomProviderModal}
                provider={editingCustomProvider ? {
                    id: editingCustomProvider.id,
                    name: editingCustomProvider.name,
                    icon: editingCustomProvider.icon,
                    description: typeof editingCustomProvider.description === 'object'
                        ? editingCustomProvider.description
                        : undefined,
                    endpoint: editingCustomProvider.customEndpoint || editingCustomProvider.defaultEndpoint,
                    authMethods: editingCustomProvider.authMethods,
                    protocol: editingCustomProvider.protocol,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                } : undefined}
                onClose={() => {
                    setShowCustomProviderModal(false);
                    setEditingCustomProvider(null);
                }}
                onSave={handleCustomProviderSaved}
            />

            {/* v0.9.3.5: 删除确认对话框 */}
            <ConfirmDialog
                open={showDeleteConfirm}
                title={t.common.confirm || '确认删除'}
                message={t.providers.deleteCustomProviderConfirm || '确定要删除这个自定义提供商吗？删除后将无法恢复，包括所有相关配置和 API Key。'}
                confirmText={t.common.delete || '删除'}
                cancelText={t.common.cancel || '取消'}
                confirmVariant="danger"
                onConfirm={handleConfirmDelete}
                onCancel={handleCancelDelete}
            />
        </div>
    );
};

export default ProviderPage;
