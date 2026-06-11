/**
 * 模型配置对话框
 *
 * v3.2.0: 支持显示已连接提供商标识
 * v3.6.1: 支持 Google 模型配额显示
 * v3.6.3: 修复 Google 动态模型列表不显示的问题
 * v0.8.0: 简化动态模型处理，模型列表由 App.tsx 统一增强后传入
 *         保留 Google 配额显示功能
 * v0.9.0: 添加协议选择器，自定义提供商可选择通信协议
 *
 * @module components/features/Models/ModelModal
 */

import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, Select } from '../../common';
import { Eye, EyeOff, CheckCircle, Link, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { useI18n, translate, getLocalizedText } from '../../../i18n';
import { loadProviderCredentialsSafe } from '../../../services/auth/providerCredentialAccess';
import { logger, LogTags } from '../../../utils/logger';
import { useGoogleModels } from '../../../hooks/useGoogleModels';
import { PROTOCOLS, getDefaultProtocol, getEffectiveProtocol } from '../../../data/protocols';
import type { AIModelConfig, ModelCreateInput, ModelProvider, ProtocolType } from '../../../types';

interface ModelModalProps {
    isOpen: boolean;
    onClose: () => void;
    model: AIModelConfig | null;
    providers: ModelProvider[];
    onSave: (data: ModelCreateInput) => void;
}

export const ModelModal: React.FC<ModelModalProps> = ({
    isOpen,
    onClose,
    model,
    providers,
    onSave,
}) => {
    const { t, language } = useI18n();
    const [name, setName] = useState('');
    const [modelId, setModelId] = useState(''); // Model ID/接入点 ID (自定义提供商用)
    const [provider, setProvider] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [baseUrl, setBaseUrl] = useState('');
    const [maxTokens, setMaxTokens] = useState(4096);
    const [temperature, setTemperature] = useState(0.7);
    const [showApiKey, setShowApiKey] = useState(false);
    // v3.2.0: 是否使用已连接提供商的凭证
    const [useProviderCredential, setUseProviderCredential] = useState(false);
    // v0.9.0: 协议类型（仅自定义提供商需要）
    const [protocol, setProtocol] = useState<ProtocolType>('openai');
    // v3.6.1: Google 凭证信息（用于获取配额信息）
    const [googleAccessToken, setGoogleAccessToken] = useState<string | undefined>();
    const [googleProjectId, setGoogleProjectId] = useState<string | undefined>();

    const isEditing = !!model;

    // v3.2.0: 获取当前选中提供商的连接状态
    const selectedProvider = providers.find((p) => p.id === provider);
    const isProviderConnected = selectedProvider?.connected === true;
    // v3.6.1: 是否为 Google 提供商（忽略大小写）
    const isGoogleProvider = selectedProvider?.id.toLowerCase() === 'google';

    const getDefaultBaseUrlForProvider = (modelProvider?: ModelProvider) =>
        modelProvider?.id.startsWith('custom-') ? modelProvider.defaultEndpoint : '';

    // v3.6.1: 获取 Google 配额信息（用于显示配额百分比）
    // v0.8.0: 模型列表已由 App.tsx 统一增强，这里只获取配额信息
    const {
        loading: googleModelsLoading,
        error: googleModelsError,
        refresh: refreshGoogleModels,
        formatQuota,
        isAvailable: isModelAvailable,
    } = useGoogleModels({
        accessToken: isGoogleProvider && isProviderConnected ? googleAccessToken : undefined,
        projectId: googleProjectId,
        autoFetch: isGoogleProvider && isProviderConnected && !!googleAccessToken,
    });

    // v3.6.1: 加载 Google 凭证
    useEffect(() => {
        const loadGoogleCredential = async () => {
            if (!isGoogleProvider || !isProviderConnected) {
                setGoogleAccessToken(undefined);
                setGoogleProjectId(undefined);
                return;
            }

            const credentials = await loadProviderCredentialsSafe({
                context: 'ModelModal 加载 Google 凭证失败',
            });
            const credential = credentials.find(c => c.providerId.toLowerCase() === 'google');
            if (credential) {
                setGoogleAccessToken(credential.accessToken);
                setGoogleProjectId(credential.projectId);
                logger.debug(LogTags.MODEL, 'ModelModal: 已加载 Google 凭证', {
                    hasAccessToken: !!credential.accessToken,
                    projectId: credential.projectId,
                });
            } else {
                // v3.6.3: 未找到凭证时清空状态，避免残留旧凭证脏值
                logger.warn(LogTags.MODEL, 'ModelModal: 未找到 Google 凭证');
                setGoogleAccessToken(undefined);
                setGoogleProjectId(undefined);
            }
        };

        loadGoogleCredential();
    }, [isGoogleProvider, isProviderConnected]);

    useEffect(() => {
        if (model) {
            setName(model.name);
            setModelId(model.modelId || ''); // 加载已保存的 Model ID
            setProvider(model.provider);
            setApiKey(''); // 不显示真实API Key
            // 兼容 baseUrl 和 endpoint 两种字段
            setBaseUrl(model.baseUrl || model.endpoint || '');
            setMaxTokens(model.maxTokens);
            setTemperature(model.temperature || 0.7);
            // v3.5.0: 编辑时正确初始化 useProviderCredential 状态
            // 如果模型标记了使用提供商凭证，则默认勾选
            const modelProvider = providers.find((p) => p.id === model.provider);
            const providerConnected = modelProvider?.connected === true;
            setUseProviderCredential(model.useProviderCredential === true && providerConnected);
            // v4.2.7: 初始化协议（优先使用已保存的协议，否则使用提供商的协议，最后才用默认协议）
            setProtocol(model.protocol || modelProvider?.protocol || getDefaultProtocol(model.provider));
        } else {
            const defaultProvider = providers[0];
            setProvider(defaultProvider?.id || '');
            // 自动选中第一个模型的 ID，防止标准模型名字为空
            if (defaultProvider && defaultProvider.models.length > 0) {
                setName(defaultProvider.models[0].id);
                setMaxTokens(defaultProvider.models[0].maxTokens);
            } else {
                setName('');
                setMaxTokens(4096);
            }
            setModelId(''); // 清空 Model ID
            setApiKey('');
            setBaseUrl(getDefaultBaseUrlForProvider(defaultProvider));
            setTemperature(0.7);
            // v3.2.0: 如果默认提供商已连接，自动勾选使用凭证
            setUseProviderCredential(defaultProvider?.connected === true);
            // v4.2.7: 新建时使用提供商的协议（优先使用 provider.protocol，否则用默认协议）
            setProtocol(defaultProvider?.protocol || getDefaultProtocol(defaultProvider?.id || 'custom'));
        }
    }, [model, providers]);

    /**
     * v3.2.0: 处理提交，如果使用已连接提供商的凭证，则从存储中获取
     * v3.3.5: 同时获取 accountId（用于 ChatGPT Codex API）
     * v3.4.3: 同时获取 projectId（用于 Google Cloud Code API）
     */
    const handleSubmit = async () => {
        let finalApiKey = apiKey;
        let finalAccountId: string | undefined;
        let finalProjectId: string | undefined;

        // 如果选择使用已连接提供商的凭证，从存储中获取
        if (useProviderCredential && isProviderConnected && !apiKey) {
            const credentials = await loadProviderCredentialsSafe({
                context: 'ModelModal 提交时读取提供商凭证失败',
            });
            // v3.6.4: 使用大小写不敏感匹配，避免 provider ID 大小写不一致导致凭证查找失败
            const credential = credentials.find(c => c.providerId.toLowerCase() === provider.toLowerCase());
            if (credential) {
                // 优先使用 API Key，其次使用 OAuth Token
                finalApiKey = credential.apiKey || credential.accessToken || '';
                // v3.3.5: 获取 accountId（用于 ChatGPT Codex API）
                finalAccountId = credential.accountId;
                // v3.4.3: 获取 projectId（用于 Google Cloud Code API）
                finalProjectId = credential.projectId;
            }
        }

        // v3.2.1: 如果使用已连接提供商的凭证且未手动设置端点，自动使用提供商默认端点
        const finalBaseUrl =
            baseUrl ||
            getDefaultBaseUrlForProvider(selectedProvider) ||
            (useProviderCredential && selectedProvider ? selectedProvider.defaultEndpoint : undefined);

        // v0.9.4: 保存协议（所有提供商都可以指定协议）
        const finalProtocol = protocol;

        onSave({
            name,
            modelId: modelId || undefined, // 仅在有值时传递
            provider,
            apiKey: finalApiKey,
            baseUrl: finalBaseUrl,
            maxTokens,
            temperature,
            accountId: finalAccountId,  // v3.3.5: 传递 accountId
            projectId: finalProjectId,  // v3.4.3: 传递 projectId
            useProviderCredential: useProviderCredential && isProviderConnected,  // v3.5.0: 传递是否使用提供商凭证
            protocol: finalProtocol,  // v0.9.4: 传递协议类型（所有提供商）
        });
        onClose();
    };

    /**
     * v3.2.0: 切换提供商时的处理
     * v3.6.1: Google 提供商的动态模型会在凭证加载后自动更新
     * v0.9.0: 切换提供商时更新默认协议
     */
    const handleProviderChange = (val: string) => {
        setProvider(val);
        // 切换提供商时，自动选中该提供商的第一个模型
        // 注意：Google 提供商的动态模型列表会在 useEffect 中加载凭证后自动获取
        const newProv = providers.find((p) => p.id === val);
        if (newProv && newProv.models.length > 0) {
            setName(newProv.models[0].id);
            setMaxTokens(newProv.models[0].maxTokens);
        } else {
            setName('');
            setMaxTokens(4096);
        }
        // v3.2.0: 如果新提供商已连接，自动勾选使用凭证
        setUseProviderCredential(newProv?.connected === true);
        // 清空手动输入的 API Key
        if (newProv?.connected) {
            setApiKey('');
        }
        // v0.9.0: 切换提供商时更新默认协议
        // v4.2.7: 优先使用提供商的默认协议（自定义提供商）
        setProtocol(newProv?.protocol || getDefaultProtocol(val));
        setBaseUrl(getDefaultBaseUrlForProvider(newProv));
    };

    // v3.2.0: 为已连接的提供商添加标识
    // v3.6.4: 优化显示方式 - 已连接的排在前面，标识放在名称后面
    const providerOptions = (() => {
        // 分离已连接和未连接的提供商
        const connected = providers.filter(p => p.connected);
        const disconnected = providers.filter(p => !p.connected);

        // 已连接的排在前面
        const sorted = [...connected, ...disconnected];

        return sorted.map((p) => ({
            value: p.id,
            // 已连接的显示绿色圆点标识在后面
            label: p.connected ? `${p.name} ● ${t.models.providerConnected}` : p.name,
        }));
    })();

    // v0.8.0: 模型列表直接使用 providers 传入的数据（已由 App.tsx 统一增强）
    // 不再需要单独获取动态模型，只需要获取 Google 的配额信息用于显示
    const effectiveModels = React.useMemo(() => selectedProvider?.models || [], [selectedProvider?.models]);

    // 🔍 调试日志：验证 Anthropic 模型列表
    React.useEffect(() => {
        if (selectedProvider?.id === 'anthropic') {
            logger.debug(LogTags.MODEL, translate('logs.model.modelList', t, { provider: 'Anthropic' }), {
                providerConnected: selectedProvider.connected,
                modelCount: effectiveModels.length,
                modelIds: effectiveModels.map(m => m.id),
                has4_6: effectiveModels.some(m => m.id.includes('4-6')),
                firstModel: effectiveModels[0],
            });
        }
    }, [selectedProvider, effectiveModels, t]);

    // v3.6.1: 生成模型选项，包含配额信息（仅 Google 有配额显示）
    const modelOptions = effectiveModels.map((m) => {
        // 检查是否有配额信息（仅 Google 提供商）
        const quotaText = isGoogleProvider ? formatQuota(m.id) : '';
        const isExhausted = isGoogleProvider && !isModelAvailable(m.id);

        // 构建标签
        let label = `${m.name} (${m.maxTokens.toLocaleString()} tokens)`;
        if (quotaText) {
            label += ` - ${quotaText}`;
        }
        if (isExhausted) {
            label = `⚠️ ${label}`;
        }

        return {
            value: m.id,
            label,
            disabled: isExhausted,
        };
    });

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditing ? t.models.editModel : t.models.addModel}
            size="lg"
        >
            <div className="space-y-5">
                {/* 提供商选择 */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                        {t.models.modelProvider}
                    </label>
                    <Select
                        value={provider}
                        onChange={handleProviderChange}
                        options={providerOptions}
                    />
                    {/* v3.2.0: 已连接提供商提示 */}
                    {isProviderConnected && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                            <CheckCircle className="w-4 h-4" />
                            <span>{t.models.providerConnectedHint}</span>
                        </div>
                    )}
                </div>

                {/* 模型选择/输入 */}
                {selectedProvider && (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                                {selectedProvider.id.startsWith('custom-') ? t.models.modelName : t.models.selectModel}
                            </label>
                            {/* v3.6.1: Google 配额刷新按钮 */}
                            {isGoogleProvider && isProviderConnected && googleAccessToken && (
                                <button
                                    type="button"
                                    onClick={() => refreshGoogleModels()}
                                    disabled={googleModelsLoading}
                                    className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50"
                                    title={t.models.refreshQuota}
                                >
                                    <RefreshCw className={`w-3 h-3 ${googleModelsLoading ? 'animate-spin' : ''}`} />
                                    {googleModelsLoading ? t.common.loading : t.models.refreshQuota}
                                </button>
                            )}
                        </div>
                        {selectedProvider.id.startsWith('custom-') || selectedProvider.models.length === 0 ? (
                            <Input
                                value={name}
                                onChange={setName}
                                placeholder={t.models.modelIdPlaceholder}
                            />
                        ) : (
                            <>
                                {/* v3.6.1: Google 配额加载状态 */}
                                {isGoogleProvider && googleModelsLoading && (
                                    <div className="flex items-center gap-2 mb-2 text-sm text-gray-500 dark:text-gray-400">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>{t.models.loadingModels}</span>
                                    </div>
                                )}
                                {/* v3.6.1: Google 配额加载错误 */}
                                {isGoogleProvider && googleModelsError && (
                                    <div className="flex items-center gap-2 mb-2 text-sm text-amber-600 dark:text-amber-400">
                                        <AlertTriangle className="w-4 h-4" />
                                        <span>{t.models.loadModelsFailed}</span>
                                    </div>
                                )}
                                <Select
                                    value={name}
                                    onChange={(val) => {
                                        setName(val);
                                        const m = effectiveModels.find((m) => m.id === val);
                                        if (m) setMaxTokens(m.maxTokens);
                                    }}
                                    options={modelOptions}
                                />
                                {/* v3.6.1: 选中模型的配额警告（仅 Google） */}
                                {isGoogleProvider && name && !isModelAvailable(name) && (
                                    <div className="mt-2 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                                        <AlertTriangle className="w-4 h-4" />
                                        <span>{t.models.quotaExhaustedWarning}</span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Model ID / 接入点 ID - 仅自定义提供商显示 */}
                {selectedProvider?.id.startsWith('custom-') && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                            {t.models.modelIdOptional} <span className="text-gray-400 dark:text-gray-500">({t.common.optional})</span>
                        </label>
                        <Input
                            value={modelId}
                            onChange={setModelId}
                            placeholder={t.models.deploymentIdPlaceholder}
                        />
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                            {t.models.modelIdDesc}
                        </p>
                    </div>
                )}

                {/* v0.9.0: 协议选择器 - v0.9.4: 所有提供商都显示，允许覆盖默认协议 */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                        {t.models.protocol || '通信协议'}
                    </label>
                    <Select
                        value={protocol}
                        onChange={(val) => setProtocol(val as ProtocolType)}
                        options={PROTOCOLS.map((p) => ({
                            value: p.id,
                            label: `${getLocalizedText(p.label, language)} - ${getLocalizedText(p.description, language)}`,
                        }))}
                    />
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        {(() => {
                            // 计算有效协议
                            const providerProtocol = selectedProvider?.protocol;
                            const effectiveProtocol = getEffectiveProtocol(
                                protocol,
                                providerProtocol,
                                provider
                            );

                            // v0.9.5: 根据当前语言动态显示协议提示
                            if (protocol === effectiveProtocol) {
                                const protocolInfo = PROTOCOLS.find(p => p.id === protocol);
                                const useCases = protocolInfo ? getLocalizedText(protocolInfo.useCases, language) : '';
                                return (t.models.useCustomProtocol || '✓ 使用自定义协议：{useCases}').replace('{useCases}', useCases);
                            }

                            // 否则显示将使用的默认协议
                            const defaultProtocolInfo = PROTOCOLS.find(p => p.id === effectiveProtocol);
                            const defaultLabel = defaultProtocolInfo ? getLocalizedText(defaultProtocolInfo.label, language) : '';
                            return (t.models.useDefaultProtocol || '💡 将使用提供商默认协议 ({label})').replace('{label}', defaultLabel);
                        })()}
                    </p>
                </div>

                {/* v3.2.0: 已连接提供商的凭证选项 */}
                {isProviderConnected && (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-[10px] p-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={useProviderCredential}
                                onChange={(e) => {
                                    setUseProviderCredential(e.target.checked);
                                    if (e.target.checked) {
                                        setApiKey(''); // 清空手动输入的 API Key
                                    }
                                }}
                                className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                            />
                            <div className="flex items-center gap-2">
                                <Link className="w-4 h-4 text-green-600 dark:text-green-400" />
                                <span className="text-sm font-medium text-green-700 dark:text-green-300">
                                    {t.models.useProviderCredential}
                                </span>
                            </div>
                        </label>
                        <p className="mt-2 text-xs text-green-600 dark:text-green-400 ml-7">
                            {t.models.useProviderCredentialDesc}
                        </p>
                    </div>
                )}

                {/* API Key - 仅在未使用已连接凭证时显示 */}
                {(!isProviderConnected || !useProviderCredential) && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                            API Key {isEditing && <span className="text-gray-400 dark:text-gray-500">({t.models.apiKeyKeepEmpty})</span>}
                        </label>
                        <div className="relative">
                            <Input
                                type={showApiKey ? 'text' : 'password'}
                                value={apiKey}
                                onChange={setApiKey}
                                placeholder={isEditing ? '••••••••' : t.models.enterApiKey}
                                className="pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowApiKey(!showApiKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                )}

                {/* 自定义端点 */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                        {t.models.customEndpoint} <span className="text-gray-400 dark:text-gray-500">({t.common.optional})</span>
                    </label>
                    <Input
                        value={baseUrl}
                        onChange={setBaseUrl}
                        placeholder={selectedProvider?.defaultEndpoint || 'https://api.example.com'}
                    />
                </div>

                {/* 高级设置 */}
                <div className="bg-gray-50 dark:bg-gray-700 rounded-[10px] p-4 space-y-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t.models.advancedSettings}</h4>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                {t.models.temperature} ({temperature.toFixed(1)})
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="2"
                                step="0.1"
                                value={temperature}
                                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                className="w-full accent-purple-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                {t.models.maxTokens}
                            </label>
                            <Input
                                type="number"
                                value={maxTokens.toString()}
                                onChange={(val) => setMaxTokens(parseInt(val) || 4096)}
                            />
                        </div>
                    </div>
                </div>


                {/* 操作按钮 */}
                <div className="flex gap-3 pt-4">
                    <Button variant="secondary" onClick={onClose} className="flex-1">
                        {t.common.cancel}
                    </Button>
                    <Button onClick={handleSubmit} className="flex-1">
                        {isEditing ? t.models.saveEdit : t.models.addModel}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default ModelModal;
