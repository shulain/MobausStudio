/**
 * Provider 连接对话框
 *
 * 用于输入 API Key 或进行 OAuth 认证
 * v3.2.0: 支持 Anthropic OAuth（授权码方式）
 * v3.2.1: 支持 OpenAI OAuth（Device Flow）
 * v3.3.0: 支持 Google OAuth（Authorization Code Flow）
 * v3.3.5: 支持传递 accountId（用于 ChatGPT Codex API）
 * v3.4.8: 支持 Custom 提供商的 Endpoint 输入，支持 Vertex AI JSON 上传
 * v3.4.11: 支持传递完整 OAuth 结果（包含 expiresAt 和 refreshToken）
 * v0.7.2: 支持 Kiro OAuth（AWS Builder ID Device Flow）
 *
 * @module components/features/Providers/ProviderConnectModal
 * @version 0.7.2
 */

import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Key, ExternalLink, AlertCircle, CheckCircle, Loader2, Copy, Check, Link, Upload } from 'lucide-react';
import { Modal, Button, Input } from '../../common';
import { useI18n, getLocalizedText, translate } from '../../../i18n';
import { githubCopilotOAuth, openInBrowser, type DeviceCodeResponse } from '../../../services/oauth';
import { anthropicOAuth, type AnthropicAuthMode } from '../../../services/anthropic-oauth';
import { openaiOAuth } from '../../../services/openai-oauth';
import { googleOAuth } from '../../../services/google-oauth';
import { kiroOAuth, type KiroDeviceCodeResponse, type KiroAuthMethod, type KiroIdcOptions } from '../../../services/kiro-oauth';
import { logger, LogTags } from '../../../utils/logger';
import type { AIProvider, ProviderAuthMethod, OAuthResult } from '../../../types';

interface ProviderConnectModalProps {
    /** 是否显示 */
    isOpen: boolean;
    /** 关闭回调 */
    onClose: () => void;
    /** 要连接的提供商 */
    provider: AIProvider | null;
    /** 连接回调 (v3.4.11: 使用 OAuthResult 传递完整 OAuth 信息) */
    onConnect: (providerId: string, authMethod: number, apiKey?: string, oauthResult?: OAuthResult) => Promise<boolean>;
    /** 测试连接回调 */
    onTestConnection?: (providerId: string, apiKey: string) => Promise<boolean>;
}

/**
 * OAuth 流程状态
 */
type OAuthStatus = 'idle' | 'requesting' | 'waiting' | 'polling' | 'success' | 'error' | 'expired' | 'code_input';

/**
 * Anthropic OAuth 模式映射
 * 根据 authMethod 的 label 判断使用哪种模式
 */
function getAnthropicAuthMode(label: string): AnthropicAuthMode | null {
    if (label.includes('Pro/Max') || label.includes('订阅')) {
        return 'max';
    }
    if (label.includes('创建') || label.includes('Create')) {
        return 'console';
    }
    return null;
}

export const ProviderConnectModal: React.FC<ProviderConnectModalProps> = ({
    isOpen,
    onClose,
    provider,
    onConnect,
    onTestConnection,
}) => {
    const { t, language } = useI18n();

    // 表单状态
    const [selectedAuthMethod, setSelectedAuthMethod] = useState(0);
    const [apiKey, setApiKey] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);

    // v3.4.8: Custom 提供商的 Endpoint 输入
    const [customEndpoint, setCustomEndpoint] = useState('');

    // v3.4.8: Vertex AI 的 JSON 配置
    const [vertexJsonConfig, setVertexJsonConfig] = useState('');
    const [vertexProjectId, setVertexProjectId] = useState('');
    const [vertexLocation, setVertexLocation] = useState('us-central1');

    // v0.7.3: Kiro IDC 认证配置
    const [idcStartUrl, setIdcStartUrl] = useState('');
    const [idcRegion, setIdcRegion] = useState('us-east-1');

    // 操作状态
    const [isConnecting, setIsConnecting] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
    const [errorMessage, setErrorMessage] = useState('');

    // OAuth 状态
    const [oauthStatus, setOAuthStatus] = useState<OAuthStatus>('idle');
    const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
    const [copied, setCopied] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Anthropic OAuth 状态 (v3.4.0)
    const [anthropicInstructions, setAnthropicInstructions] = useState('');

    // OAuth URL 状态 (v3.4.1) - 用于显示和复制授权 URL
    const [oauthUrl, setOAuthUrl] = useState<string | null>(null);

    // 重置状态并加载已有凭证
    useEffect(() => {
        const loadCredential = async () => {
            if (isOpen && provider) {
                setSelectedAuthMethod(0);
                setShowApiKey(false);
                setIsConnecting(false);
                setIsTesting(false);
                setTestResult(null);
                setErrorMessage('');
                setOAuthStatus('idle');
                setDeviceCode(null);
                setCopied(false);
                // Anthropic OAuth 状态重置
                setAnthropicInstructions('');
                // OAuth URL 重置
                setOAuthUrl(null);
                // v3.4.8: Custom 提供商状态重置
                setCustomEndpoint(provider.customEndpoint || '');
                // v3.4.8: Vertex AI 状态重置
                setVertexJsonConfig('');
                setVertexProjectId('');
                setVertexLocation('us-central1');
                // v0.7.3: Kiro IDC 状态重置
                setIdcStartUrl('');
                setIdcRegion('us-east-1');

                // v0.9.3.1: 加载已有凭证（如果存在）
                try {
                    const { providerCredentialsStorage } = await import('../../../services/storage');
                    const credential = await providerCredentialsStorage.get(provider.id);
                    if (credential?.apiKey) {
                        setApiKey(credential.apiKey);
                    } else {
                        setApiKey('');
                    }
                } catch (error) {
                    logger.error(LogTags.PROVIDER, translate('logs.storage.loadFailed', t), error);
                    setApiKey('');
                }
            }
        };

        loadCredential();
    }, [isOpen, provider]);

    // 清理 OAuth 轮询
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    if (!provider) return null;

    const currentAuthMethod: ProviderAuthMethod | undefined = provider.authMethods[selectedAuthMethod];
    const isApiAuth = currentAuthMethod?.type === 'api';
    const isOAuthAuth = currentAuthMethod?.type === 'oauth';
    const isEnvAuth = currentAuthMethod?.type === 'env';
    const isNoAuth = currentAuthMethod?.type === 'none';

    // v3.4.8: 判断是否为需要自定义端点的提供商
    // v4.1.46: 自定义提供商 ID 以 'custom-' 开头
    const isCustomProvider = provider.id.startsWith('custom-');
    const requiresEndpoint = provider.requiresEndpoint || isCustomProvider;

    // v3.4.8: 判断是否为 Vertex AI（支持 JSON 上传）
    const isVertexAI = provider.id === 'vertex';

    // 判断是否为 Anthropic OAuth（使用授权码方式）
    const isAnthropicOAuth = isOAuthAuth && provider.id === 'anthropic';
    const anthropicMode = isAnthropicOAuth ? getAnthropicAuthMode(currentAuthMethod?.label || '') : null;
    // GitHub Copilot 使用 Device Flow
    const isGitHubOAuth = isOAuthAuth && provider.id === 'github-copilot';
    // OpenAI 使用 Device Flow (v3.2.1)
    const isOpenAIOAuth = isOAuthAuth && provider.id === 'openai';
    // Google 使用 Authorization Code Flow (v3.3.0)
    const isGoogleOAuth = isOAuthAuth && provider.id === 'google';
    // Kiro 使用 AWS Builder ID Device Flow (v0.7.2)
    const isKiroOAuth = isOAuthAuth && provider.id === 'kiro';
    // v0.7.3: 判断是否为 Kiro IDC 认证（需要 Start URL 和 Region）
    const isKiroIdcAuth = isKiroOAuth && (currentAuthMethod?.label?.toLowerCase().includes('idc') || currentAuthMethod?.label?.toLowerCase().includes('identity center'));

    // 处理连接
    const handleConnect = async () => {
        setIsConnecting(true);
        setErrorMessage('');

        try {
            const success = await onConnect(provider.id, selectedAuthMethod, apiKey || undefined);
            if (success) {
                onClose();
            } else {
                setErrorMessage(t.providers.connectionFailed);
            }
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : t.providers.connectionError
            );
        } finally {
            setIsConnecting(false);
        }
    };

    // 处理测试连接
    const handleTestConnection = async () => {
        if (!onTestConnection || !apiKey) return;

        setIsTesting(true);
        setTestResult(null);

        try {
            const success = await onTestConnection(provider.id, apiKey);
            setTestResult(success ? 'success' : 'error');
        } catch {
            setTestResult('error');
        } finally {
            setIsTesting(false);
        }
    };

    // 复制用户码到剪贴板（仅用于 GitHub Copilot）
    const handleCopyCode = async () => {
        if (deviceCode?.user_code) {
            try {
                await navigator.clipboard.writeText(deviceCode.user_code);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } catch {
                // 忽略复制失败
            }
        }
    };

    // 复制 OAuth URL 到剪贴板 (v3.4.1)
    const handleCopyOAuthUrl = async () => {
        if (oauthUrl) {
            try {
                await navigator.clipboard.writeText(oauthUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } catch {
                // 忽略复制失败
            }
        }
    };

    // 处理 OAuth 认证（GitHub Copilot Device Flow）
    const handleOAuthConnect = async () => {
        // 取消之前的轮询
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setOAuthStatus('requesting');
        setErrorMessage('');
        setDeviceCode(null);

        try {
            // 使用 OAuth 服务进行认证
            const result = await githubCopilotOAuth.authorize(
                // Device Code 回调
                (data) => {
                    setDeviceCode(data);
                    setOAuthStatus('waiting');
                    // 自动打开浏览器
                    openInBrowser(data.verification_uri);
                },
                // 状态回调
                (status) => {
                    if (status === 'pending') {
                        setOAuthStatus('polling');
                    } else if (status === 'expired') {
                        setOAuthStatus('expired');
                    } else if (status === 'error') {
                        setOAuthStatus('error');
                    }
                },
                abortControllerRef.current.signal
            );

            if (result.success && result.accessToken) {
                setOAuthStatus('success');
                // v3.4.11: GitHub Copilot 使用 Device Flow，token 长期有效
                // 但仍然使用 OAuthResult 格式保持一致性
                const oauthResult: OAuthResult = {
                    accessToken: result.accessToken,
                    // GitHub Copilot token 不会过期，不需要 refreshToken 和 expiresAt
                };
                const success = await onConnect(provider.id, selectedAuthMethod, undefined, oauthResult);
                if (success) {
                    setTimeout(() => onClose(), 1000);
                } else {
                    setOAuthStatus('error');
                    setErrorMessage(t.providers.saveCredentialsFailed);
                }
            } else if (result.error === 'cancelled') {
                setOAuthStatus('idle');
            } else {
                setOAuthStatus('error');
                setErrorMessage(result.error || t.providers.oauthFailed);
            }
        } catch (error) {
            setOAuthStatus('error');
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : t.providers.oauthFailed
            );
        }
    };

    // 取消 OAuth 流程
    const handleCancelOAuth = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setOAuthStatus('idle');
        setDeviceCode(null);
        setAnthropicInstructions('');
        setOAuthUrl(null);
    };

    // 处理 OpenAI OAuth 认证（Authorization Code Flow）(v3.4.0)
    const handleOpenAIOAuthConnect = async () => {
        // 取消之前的流程
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setOAuthStatus('requesting');
        setErrorMessage('');
        setOAuthUrl(null);

        try {
            // 使用 OpenAI OAuth 服务进行认证（Authorization Code Flow）
            const result = await openaiOAuth.authorize(
                // 授权 URL 回调 - 保存 URL 供用户复制
                (url, _instructions) => {
                    setOAuthUrl(url);
                    setOAuthStatus('waiting');
                },
                // 状态回调
                (status) => {
                    if (status === 'waiting') {
                        setOAuthStatus('waiting');
                    } else if (status === 'exchanging') {
                        setOAuthStatus('polling');
                    } else if (status === 'error') {
                        setOAuthStatus('error');
                    }
                },
                abortControllerRef.current.signal
            );

            if (result.type === 'success' && result.accessToken) {
                setOAuthStatus('success');
                // v3.4.11: 传递完整的 OAuth 结果（包含 expiresAt 和 refreshToken）
                const oauthResult: OAuthResult = {
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                    expiresAt: result.expiresAt,
                    accountId: result.accountId,
                };
                const success = await onConnect(provider.id, selectedAuthMethod, undefined, oauthResult);
                if (success) {
                    setTimeout(() => onClose(), 1000);
                } else {
                    setOAuthStatus('error');
                    setErrorMessage(t.providers.saveCredentialsFailed);
                }
            } else if (result.error === 'cancelled') {
                setOAuthStatus('idle');
            } else {
                setOAuthStatus('error');
                setErrorMessage(result.error || t.providers.oauthFailed);
            }
        } catch (error) {
            setOAuthStatus('error');
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : t.providers.oauthFailed
            );
        }
    };

    // 处理 Anthropic OAuth 认证（Authorization Code Flow）(v3.4.0)
    const handleAnthropicOAuthConnect = async () => {
        if (!anthropicMode) return;

        // 取消之前的流程
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setOAuthStatus('requesting');
        setErrorMessage('');
        setOAuthUrl(null);

        try {
            // 使用 Anthropic OAuth 服务进行认证（Authorization Code Flow）
            const result = await anthropicOAuth.authorize(
                anthropicMode,
                // 授权 URL 回调 - 保存 URL 供用户复制
                (url, instructions) => {
                    setOAuthUrl(url);
                    setAnthropicInstructions(instructions);
                    setOAuthStatus('waiting');
                },
                // 状态回调
                (status) => {
                    if (status === 'waiting') {
                        setOAuthStatus('waiting');
                    } else if (status === 'exchanging') {
                        setOAuthStatus('polling');
                    } else if (status === 'error') {
                        setOAuthStatus('error');
                    }
                },
                abortControllerRef.current.signal
            );

            if (result.type === 'success') {
                setOAuthStatus('success');
                // v3.4.11: 根据模式保存不同的凭证，传递完整 OAuth 结果
                if (result.apiKey) {
                    // console 模式：返回 API Key
                    const success = await onConnect(provider.id, selectedAuthMethod, result.apiKey);
                    if (success) {
                        setTimeout(() => onClose(), 1000);
                    } else {
                        setOAuthStatus('error');
                        setErrorMessage(t.providers.saveCredentialsFailed);
                    }
                } else if (result.accessToken) {
                    // max 模式：返回 OAuth Token
                    const oauthResult: OAuthResult = {
                        accessToken: result.accessToken,
                        refreshToken: result.refreshToken,
                        expiresAt: result.expiresAt,
                    };
                    const success = await onConnect(provider.id, selectedAuthMethod, undefined, oauthResult);
                    if (success) {
                        setTimeout(() => onClose(), 1000);
                    } else {
                        setOAuthStatus('error');
                        setErrorMessage(t.providers.saveCredentialsFailed);
                    }
                } else {
                    setOAuthStatus('error');
                    setErrorMessage(t.providers.noCredentialsReceived);
                }
            } else {
                setOAuthStatus('error');
                setErrorMessage(t.providers.oauthFailed);
            }
        } catch (error) {
            setOAuthStatus('error');
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : t.providers.oauthFailed
            );
        }
    };

    // 处理 Google OAuth 认证（Authorization Code Flow）(v3.3.0)
    const handleGoogleOAuthConnect = async () => {
        // 取消之前的流程
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setOAuthStatus('requesting');
        setErrorMessage('');
        setOAuthUrl(null);

        try {
            // 使用 Google OAuth 服务进行认证
            const result = await googleOAuth.authorize(
                // 授权 URL 回调 - 保存 URL 供用户复制
                (url, _instructions) => {
                    setOAuthUrl(url);
                    setOAuthStatus('waiting');
                },
                // 状态回调
                (status) => {
                    if (status === 'waiting') {
                        setOAuthStatus('waiting');
                    } else if (status === 'exchanging') {
                        setOAuthStatus('polling');
                    } else if (status === 'error') {
                        setOAuthStatus('error');
                    }
                },
                abortControllerRef.current.signal
            );

            if (result.type === 'success' && result.accessToken) {
                setOAuthStatus('success');
                // v3.4.11: 传递完整的 OAuth 结果（包含 expiresAt 和 refreshToken）
                const oauthResult: OAuthResult = {
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                    expiresAt: result.expiresAt,
                    projectId: result.projectId,
                };
                const success = await onConnect(provider.id, selectedAuthMethod, undefined, oauthResult);
                if (success) {
                    setTimeout(() => onClose(), 1000);
                } else {
                    setOAuthStatus('error');
                    setErrorMessage(t.providers.saveCredentialsFailed);
                }
            } else if (result.type === 'cancelled') {
                setOAuthStatus('idle');
            } else {
                setOAuthStatus('error');
                setErrorMessage(result.error || t.providers.oauthFailed);
            }
        } catch (error) {
            setOAuthStatus('error');
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : t.providers.oauthFailed
            );
        }
    };

    // 处理 Kiro OAuth 认证（支持 Google/GitHub/AWS Builder ID/IDC）(v0.7.3)
    const handleKiroOAuthConnect = async () => {
        // 取消之前的轮询
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setOAuthStatus('requesting');
        setErrorMessage('');
        setDeviceCode(null);

        try {
            // 根据选择的认证方式确定 Kiro auth method
            const authMethodLabel = currentAuthMethod?.label?.toLowerCase() || 'aws';
            let kiroAuthMethod: KiroAuthMethod = 'aws';
            let idcOptions: KiroIdcOptions | undefined;

            if (authMethodLabel.includes('google')) {
                kiroAuthMethod = 'google';
            } else if (authMethodLabel.includes('github')) {
                kiroAuthMethod = 'github';
            } else if (authMethodLabel.includes('idc') || authMethodLabel.includes('identity center')) {
                kiroAuthMethod = 'idc';
                // IDC 需要 Start URL
                if (!idcStartUrl) {
                    setOAuthStatus('error');
                    setErrorMessage(language === 'zh' ? '请输入 Start URL' : 'Please enter Start URL');
                    return;
                }
                idcOptions = { startUrl: idcStartUrl, region: idcRegion };
            }

            // 使用 Kiro OAuth 服务进行认证
            const result = await kiroOAuth.authorize(
                // Device Code 回调 (仅 AWS Builder ID 和 IDC 使用)
                (data: KiroDeviceCodeResponse) => {
                    // 转换为通用 DeviceCodeResponse 格式
                    setDeviceCode({
                        device_code: data.device_code,
                        user_code: data.user_code,
                        verification_uri: data.verification_uri,
                        expires_in: data.expires_in,
                        interval: data.interval,
                    });
                    setOAuthStatus('waiting');
                    // 自动打开浏览器
                    openInBrowser(data.verification_uri);
                },
                // 状态回调
                (status) => {
                    if (status === 'pending') {
                        setOAuthStatus('polling');
                    } else if (status === 'expired') {
                        setOAuthStatus('expired');
                    } else if (status === 'error') {
                        setOAuthStatus('error');
                    }
                },
                abortControllerRef.current.signal,
                kiroAuthMethod,
                idcOptions
            );

            if (result.success && result.accessToken) {
                setOAuthStatus('success');
                // Kiro 使用 Device Flow，token 有效期较长
                // profileArn 用于后续获取模型列表和配额
                // v0.9.0: 添加 expiresAt 支持 token 自动续期
                // v0.9.0: 添加 authMethod 支持 IDC/Builder ID 区分（用于选择正确的 User-Agent）
                // v0.9.1: 添加客户端注册信息用于持久化（修复重启后登录状态丢失）
                const oauthResult: OAuthResult = {
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                    profileArn: result.profileArn,
                    expiresAt: result.expiresAt,
                    authMethod: result.authMethod as 'idc' | 'aws' | undefined,
                    // v0.9.1: Kiro 客户端注册信息
                    kiroClientId: result.kiroClientId,
                    kiroClientSecret: result.kiroClientSecret,
                    kiroSsoRegion: result.kiroSsoRegion,
                    kiroStartUrl: result.kiroStartUrl,
                };
                const success = await onConnect(provider.id, selectedAuthMethod, undefined, oauthResult);
                if (success) {
                    setTimeout(() => onClose(), 1000);
                } else {
                    setOAuthStatus('error');
                    setErrorMessage(t.providers.saveCredentialsFailed);
                }
            } else if (result.error === 'cancelled') {
                setOAuthStatus('idle');
            } else {
                setOAuthStatus('error');
                setErrorMessage(result.error || t.providers.oauthFailed);
            }
        } catch (error) {
            setOAuthStatus('error');
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : t.providers.oauthFailed
            );
        }
    };

    // 获取 OAuth 状态文本
    const getOAuthStatusText = () => {
        switch (oauthStatus) {
            case 'requesting':
                return t.providers.oauthRequesting;
            case 'waiting':
                return t.providers.oauthWaiting;
            case 'polling':
                return t.providers.oauthPolling;
            case 'code_input':
                return t.providers.oauthCodeInput;
            case 'success':
                return t.providers.oauthSuccess;
            case 'expired':
                return t.providers.oauthExpired;
            case 'error':
                return t.providers.oauthFailed;
            default:
                return '';
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`${t.providers.connectProvider} ${provider.name}`}
            size="md"
        >
            <div className="space-y-5">
                {/* 提供商信息 */}
                <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-[10px]">
                    <div className="w-14 h-14 rounded-[10px] bg-gradient-to-br from-[#FEF3C7] to-[#DBEAFE] dark:from-purple-900/50 dark:to-pink-900/50 flex items-center justify-center text-3xl">
                        {provider.icon}
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-800 dark:text-white">
                            {provider.name}
                        </h3>
                        {provider.description && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                {getLocalizedText(provider.description, language)}
                            </p>
                        )}
                    </div>
                </div>

                {/* 认证方式选择（如果有多种） */}
                {provider.authMethods.length > 1 && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                            {t.providers.authMethod}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {provider.authMethods.map((method, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedAuthMethod(idx)}
                                    className={`
                                        px-4 py-2 rounded-[10px] text-sm font-medium transition-colors
                                        ${selectedAuthMethod === idx
                                            ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border-2 border-purple-500'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-2 border-transparent hover:bg-gray-200 dark:hover:bg-gray-600'
                                        }
                                    `}
                                >
                                    {method.label}
                                </button>
                            ))}
                        </div>
                        {currentAuthMethod?.description && (
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                {currentAuthMethod.description}
                            </p>
                        )}
                    </div>
                )}

                {/* API Key 输入 */}
                {isApiAuth && (
                    <div className="space-y-4">
                        {/* v3.4.8: Custom 提供商的 Endpoint 输入 */}
                        {requiresEndpoint && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                                    <Link className="w-4 h-4 inline mr-1" />
                                    API Endpoint
                                </label>
                                <Input
                                    type="text"
                                    value={customEndpoint}
                                    onChange={setCustomEndpoint}
                                    placeholder={t.providers.apiEndpointPlaceholder}
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {t.providers.apiEndpointDesc}
                                </p>
                            </div>
                        )}

                        {/* v3.4.8: Vertex AI 的 JSON 配置上传 */}
                        {isVertexAI && (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                                        <Upload className="w-4 h-4 inline mr-1" />
                                        {t.providers.serviceAccountJson}
                                    </label>
                                    <div className="relative">
                                        <textarea
                                            value={vertexJsonConfig}
                                            onChange={(e) => {
                                                setVertexJsonConfig(e.target.value);
                                                // 尝试解析 JSON 提取 project_id
                                                try {
                                                    const json = JSON.parse(e.target.value);
                                                    if (json.project_id) {
                                                        setVertexProjectId(json.project_id);
                                                    }
                                                } catch {
                                                    // 忽略解析错误
                                                }
                                            }}
                                            placeholder={t.providers.pasteJsonContent}
                                            className="w-full h-32 px-3 py-2 text-sm font-mono bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-[10px] resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        />
                                        <label className="absolute bottom-2 right-2 cursor-pointer">
                                            <input
                                                type="file"
                                                accept=".json"
                                                className="hidden"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        const reader = new FileReader();
                                                        reader.onload = (event) => {
                                                            const content = event.target?.result as string;
                                                            setVertexJsonConfig(content);
                                                            try {
                                                                const json = JSON.parse(content);
                                                                if (json.project_id) {
                                                                    setVertexProjectId(json.project_id);
                                                                }
                                                            } catch {
                                                                // 忽略解析错误
                                                            }
                                                        };
                                                        reader.readAsText(file);
                                                    }
                                                }}
                                            />
                                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 rounded hover:bg-purple-200 dark:hover:bg-purple-900/70 transition-colors">
                                                <Upload className="w-3 h-3" />
                                                {t.providers.uploadFile}
                                            </span>
                                        </label>
                                    </div>
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                        {t.providers.downloadJsonKey}
                                    </p>
                                </div>

                                {/* Project ID 和 Location */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                            Project ID
                                        </label>
                                        <Input
                                            type="text"
                                            value={vertexProjectId}
                                            onChange={setVertexProjectId}
                                            placeholder="my-project-id"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                                            Location
                                        </label>
                                        <select
                                            value={vertexLocation}
                                            onChange={(e) => setVertexLocation(e.target.value)}
                                            className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-[10px] focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        >
                                            <option value="us-central1">us-central1</option>
                                            <option value="us-east1">us-east1</option>
                                            <option value="us-west1">us-west1</option>
                                            <option value="europe-west1">europe-west1</option>
                                            <option value="europe-west4">europe-west4</option>
                                            <option value="asia-east1">asia-east1</option>
                                            <option value="asia-northeast1">asia-northeast1</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 标准 API Key 输入（非 Vertex AI） */}
                        {!isVertexAI && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                                    <Key className="w-4 h-4 inline mr-1" />
                                    API Key
                                </label>
                                <div className="relative">
                                    <Input
                                        type={showApiKey ? 'text' : 'password'}
                                        value={apiKey}
                                        onChange={setApiKey}
                                        placeholder={t.providers.apiKeyPlaceholder}
                                        className="pr-20"
                                    />
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setShowApiKey(!showApiKey)}
                                            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
                                        >
                                            {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* 获取 API Key 链接 */}
                                {provider.website && !requiresEndpoint && (
                                    <a
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            openInBrowser(provider.website!);
                                        }}
                                        className="inline-flex items-center gap-1 mt-2 text-xs text-purple-600 dark:text-purple-400 hover:underline"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                        {t.providers.getApiKey}
                                    </a>
                                )}
                            </div>
                        )}

                        {/* 测试连接结果 */}
                        {testResult && (
                            <div className={`
                                flex items-center gap-2 text-sm
                                ${testResult === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
                            `}>
                                {testResult === 'success' ? (
                                    <>
                                        <CheckCircle className="w-4 h-4" />
                                        {t.providers.connectionTestSuccess}
                                    </>
                                ) : (
                                    <>
                                        <AlertCircle className="w-4 h-4" />
                                        {t.providers.connectionTestFailed}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* OAuth 认证 */}
                {isOAuthAuth && (
                    <div className="space-y-4">
                        {/* ========== Anthropic OAuth（Authorization Code Flow）(v3.4.0) ========== */}
                        {isAnthropicOAuth && (
                            <>
                                {/* 初始状态：显示说明 */}
                                {oauthStatus === 'idle' && (
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-[10px]">
                                        <p className="text-sm text-blue-700 dark:text-blue-300">
                                            {anthropicMode === 'max'
                                                ? t.providers.anthropicMaxDesc
                                                : t.providers.anthropicConsoleDesc
                                            }
                                        </p>
                                    </div>
                                )}

                                {/* 请求中 */}
                                {oauthStatus === 'requesting' && (
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-[10px] flex items-center gap-3">
                                        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                                        <p className="text-sm text-blue-700 dark:text-blue-300">
                                            {getOAuthStatusText()}
                                        </p>
                                    </div>
                                )}

                                {/* 等待用户授权 */}
                                {(oauthStatus === 'waiting' || oauthStatus === 'polling') && (
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-[10px] space-y-4">
                                        <div className="text-center">
                                            <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                                                {anthropicInstructions || t.providers.completeAuthInBrowser}
                                            </p>
                                        </div>

                                        {/* 显示授权 URL 供手动复制 */}
                                        {oauthUrl && (
                                            <div className="bg-white dark:bg-gray-800 rounded-[10px] p-3">
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                                    {t.providers.browserNotOpenedCopyLink}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <code className="flex-1 text-xs text-blue-600 dark:text-blue-400 break-all bg-gray-50 dark:bg-gray-900 p-2 rounded">
                                                        {oauthUrl.length > 80 ? oauthUrl.substring(0, 80) + '...' : oauthUrl}
                                                    </code>
                                                    <button
                                                        onClick={handleCopyOAuthUrl}
                                                        className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-[10px] transition-colors flex-shrink-0"
                                                        title={t.providers.copyLink}
                                                    >
                                                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {oauthStatus === 'polling'
                                                ? t.providers.oauthVerifying
                                                : getOAuthStatusText()
                                            }
                                        </div>
                                    </div>
                                )}

                                {/* 成功 */}
                                {oauthStatus === 'success' && (
                                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-[10px] flex items-center gap-3">
                                        <CheckCircle className="w-5 h-5 text-green-600" />
                                        <p className="text-sm text-green-700 dark:text-green-300">
                                            {getOAuthStatusText()}
                                        </p>
                                    </div>
                                )}
                            </>
                        )}

                        {/* ========== GitHub Copilot OAuth（Device Flow）========== */}
                        {isGitHubOAuth && (
                            <>
                                {/* 初始状态：显示说明 */}
                                {oauthStatus === 'idle' && (
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-[10px]">
                                        <p className="text-sm text-blue-700 dark:text-blue-300">
                                            {t.providers.githubOAuthDesc}
                                        </p>
                                    </div>
                                )}

                                {/* 请求中 */}
                                {oauthStatus === 'requesting' && (
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-[10px] flex items-center gap-3">
                                        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                                        <p className="text-sm text-blue-700 dark:text-blue-300">
                                            {getOAuthStatusText()}
                                        </p>
                                    </div>
                                )}

                                {/* 等待用户授权：显示用户码 */}
                                {(oauthStatus === 'waiting' || oauthStatus === 'polling') && deviceCode && (
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-[10px] space-y-4">
                                        <div className="text-center">
                                            <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                                                {t.providers.enterCodeInBrowser}
                                            </p>
                                            <div className="flex items-center justify-center gap-2">
                                                <code className="text-2xl font-bold tracking-widest text-blue-800 dark:text-blue-200 bg-white dark:bg-gray-800 px-4 py-2 rounded-[10px]">
                                                    {deviceCode.user_code}
                                                </code>
                                                <button
                                                    onClick={handleCopyCode}
                                                    className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-[10px] transition-colors"
                                                    title={t.providers.copyCode}
                                                >
                                                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {getOAuthStatusText()}
                                        </div>

                                        <div className="text-center">
                                            <button
                                                onClick={() => openInBrowser(deviceCode.verification_uri)}
                                                className="inline-flex items-center gap-1 text-sm text-purple-600 dark:text-purple-400 hover:underline"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                                {t.providers.openAuthPage}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* 成功 */}
                                {oauthStatus === 'success' && (
                                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-[10px] flex items-center gap-3">
                                        <CheckCircle className="w-5 h-5 text-green-600" />
                                        <p className="text-sm text-green-700 dark:text-green-300">
                                            {getOAuthStatusText()}
                                        </p>
                                    </div>
                                )}

                                {/* 过期 */}
                                {oauthStatus === 'expired' && (
                                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-[10px] flex items-center gap-3">
                                        <AlertCircle className="w-5 h-5 text-yellow-600" />
                                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                                            {getOAuthStatusText()}
                                        </p>
                                    </div>
                                )}
                            </>
                        )}

                        {/* ========== OpenAI OAuth（Authorization Code Flow）(v3.4.0) ========== */}
                        {isOpenAIOAuth && (
                            <>
                                {/* 初始状态：显示说明 */}
                                {oauthStatus === 'idle' && (
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-[10px]">
                                        <p className="text-sm text-blue-700 dark:text-blue-300">
                                            {t.providers.openaiOAuthDesc}
                                        </p>
                                    </div>
                                )}

                                {/* 请求中 */}
                                {oauthStatus === 'requesting' && (
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-[10px] flex items-center gap-3">
                                        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                                        <p className="text-sm text-blue-700 dark:text-blue-300">
                                            {getOAuthStatusText()}
                                        </p>
                                    </div>
                                )}

                                {/* 等待用户授权 */}
                                {(oauthStatus === 'waiting' || oauthStatus === 'polling') && (
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-[10px] space-y-4">
                                        <div className="text-center">
                                            <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                                                {t.providers.completeAuthInBrowser}
                                            </p>
                                        </div>

                                        {/* 显示授权 URL 供手动复制 */}
                                        {oauthUrl && (
                                            <div className="bg-white dark:bg-gray-800 rounded-[10px] p-3">
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                                    {t.providers.browserNotOpenedCopyLink}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <code className="flex-1 text-xs text-blue-600 dark:text-blue-400 break-all bg-gray-50 dark:bg-gray-900 p-2 rounded">
                                                        {oauthUrl.length > 80 ? oauthUrl.substring(0, 80) + '...' : oauthUrl}
                                                    </code>
                                                    <button
                                                        onClick={handleCopyOAuthUrl}
                                                        className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-[10px] transition-colors flex-shrink-0"
                                                        title={t.providers.copyLink}
                                                    >
                                                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {oauthStatus === 'polling'
                                                ? t.providers.oauthVerifying
                                                : getOAuthStatusText()
                                            }
                                        </div>
                                    </div>
                                )}

                                {/* 成功 */}
                                {oauthStatus === 'success' && (
                                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-[10px] flex items-center gap-3">
                                        <CheckCircle className="w-5 h-5 text-green-600" />
                                        <p className="text-sm text-green-700 dark:text-green-300">
                                            {getOAuthStatusText()}
                                        </p>
                                    </div>
                                )}
                            </>
                        )}

                        {/* ========== Google OAuth（Authorization Code Flow）(v3.3.0) ========== */}
                        {isGoogleOAuth && (
                            <>
                                {/* 初始状态：显示说明 */}
                                {oauthStatus === 'idle' && (
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-[10px]">
                                        <p className="text-sm text-blue-700 dark:text-blue-300">
                                            {t.providers.googleOAuthDesc}
                                        </p>
                                    </div>
                                )}

                                {/* 请求中 */}
                                {oauthStatus === 'requesting' && (
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-[10px] flex items-center gap-3">
                                        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                                        <p className="text-sm text-blue-700 dark:text-blue-300">
                                            {getOAuthStatusText()}
                                        </p>
                                    </div>
                                )}

                                {/* 等待用户授权 */}
                                {(oauthStatus === 'waiting' || oauthStatus === 'polling') && (
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-[10px] space-y-4">
                                        <div className="text-center">
                                            <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                                                {t.providers.completeAuthInBrowser}
                                            </p>
                                        </div>

                                        {/* 显示授权 URL 供手动复制 */}
                                        {oauthUrl && (
                                            <div className="bg-white dark:bg-gray-800 rounded-[10px] p-3">
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                                    {t.providers.browserNotOpenedCopyLink}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <code className="flex-1 text-xs text-blue-600 dark:text-blue-400 break-all bg-gray-50 dark:bg-gray-900 p-2 rounded">
                                                        {oauthUrl.length > 80 ? oauthUrl.substring(0, 80) + '...' : oauthUrl}
                                                    </code>
                                                    <button
                                                        onClick={handleCopyOAuthUrl}
                                                        className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-[10px] transition-colors flex-shrink-0"
                                                        title={t.providers.copyLink}
                                                    >
                                                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {oauthStatus === 'polling'
                                                ? t.providers.oauthVerifying
                                                : getOAuthStatusText()
                                            }
                                        </div>
                                    </div>
                                )}

                                {/* 成功 */}
                                {oauthStatus === 'success' && (
                                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-[10px] flex items-center gap-3">
                                        <CheckCircle className="w-5 h-5 text-green-600" />
                                        <p className="text-sm text-green-700 dark:text-green-300">
                                            {getOAuthStatusText()}
                                        </p>
                                    </div>
                                )}

                                {/* 过期 */}
                                {oauthStatus === 'expired' && (
                                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-[10px] flex items-center gap-3">
                                        <AlertCircle className="w-5 h-5 text-yellow-600" />
                                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                                            {getOAuthStatusText()}
                                        </p>
                                    </div>
                                )}
                            </>
                        )}

                        {/* ========== Kiro OAuth（AWS Builder ID / IDC Device Flow）(v0.7.3) ========== */}
                        {isKiroOAuth && (
                            <>
                                {/* 初始状态：显示说明和 IDC 输入框 */}
                                {oauthStatus === 'idle' && (
                                    <div className="space-y-4">
                                        {/* IDC 认证需要额外输入 */}
                                        {isKiroIdcAuth ? (
                                            <div className="space-y-3">
                                                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-[10px]">
                                                    <p className="text-sm text-blue-700 dark:text-blue-300">
                                                        {language === 'zh'
                                                            ? '使用组织的 AWS Identity Center (IDC) 登录。请输入您组织的 SSO 门户 URL。'
                                                            : 'Sign in with your organization\'s AWS Identity Center (IDC). Please enter your organization\'s SSO portal URL.'
                                                        }
                                                    </p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                                                        Start URL
                                                    </label>
                                                    <Input
                                                        type="text"
                                                        value={idcStartUrl}
                                                        onChange={setIdcStartUrl}
                                                        placeholder="https://your-org.awsapps.com/start"
                                                    />
                                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                        {language === 'zh'
                                                            ? '您组织的 AWS SSO 门户 URL'
                                                            : 'Your organization\'s AWS SSO portal URL'
                                                        }
                                                    </p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                                                        Region
                                                    </label>
                                                    <select
                                                        value={idcRegion}
                                                        onChange={(e) => setIdcRegion(e.target.value)}
                                                        className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-[10px] focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                    >
                                                        <option value="us-east-1">us-east-1</option>
                                                        <option value="us-east-2">us-east-2</option>
                                                        <option value="us-west-1">us-west-1</option>
                                                        <option value="us-west-2">us-west-2</option>
                                                        <option value="eu-west-1">eu-west-1</option>
                                                        <option value="eu-west-2">eu-west-2</option>
                                                        <option value="eu-central-1">eu-central-1</option>
                                                        <option value="ap-northeast-1">ap-northeast-1</option>
                                                        <option value="ap-southeast-1">ap-southeast-1</option>
                                                        <option value="ap-southeast-2">ap-southeast-2</option>
                                                    </select>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-[10px]">
                                                <p className="text-sm text-blue-700 dark:text-blue-300">
                                                    {language === 'zh'
                                                        ? '使用 AWS Builder ID 登录以访问 Kiro AI 编程助手。'
                                                        : 'Sign in with AWS Builder ID to access Kiro AI coding assistant.'
                                                    }
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 请求中 */}
                                {oauthStatus === 'requesting' && (
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-[10px] flex items-center gap-3">
                                        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                                        <p className="text-sm text-blue-700 dark:text-blue-300">
                                            {getOAuthStatusText()}
                                        </p>
                                    </div>
                                )}

                                {/* 等待用户授权：显示用户码和授权 URL */}
                                {(oauthStatus === 'waiting' || oauthStatus === 'polling') && deviceCode && (
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-[10px] space-y-4">
                                        <div className="text-center">
                                            <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                                                {language === 'zh'
                                                    ? (isKiroIdcAuth ? '请在浏览器中使用组织 SSO 登录' : '请在浏览器中使用 AWS Builder ID 登录')
                                                    : (isKiroIdcAuth ? 'Please sign in with your organization SSO in your browser' : 'Please sign in with AWS Builder ID in your browser')
                                                }
                                            </p>
                                            <div className="flex items-center justify-center gap-2">
                                                <code className="text-2xl font-bold tracking-widest text-blue-800 dark:text-blue-200 bg-white dark:bg-gray-800 px-4 py-2 rounded-[10px]">
                                                    {deviceCode.user_code}
                                                </code>
                                                <button
                                                    onClick={handleCopyCode}
                                                    className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-[10px] transition-colors"
                                                    title={t.providers.copyCode}
                                                >
                                                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                                                </button>
                                            </div>
                                        </div>

                                        {/* 显示授权 URL 供手动复制 */}
                                        <div className="bg-white dark:bg-gray-800 rounded-[10px] p-3">
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                                {language === 'zh'
                                                    ? '如果浏览器未自动打开，请手动复制以下链接：'
                                                    : 'If browser did not open automatically, copy this link:'
                                                }
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <code className="flex-1 text-xs text-blue-600 dark:text-blue-400 break-all bg-gray-50 dark:bg-gray-900 p-2 rounded">
                                                    {deviceCode.verification_uri}
                                                </code>
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            await navigator.clipboard.writeText(deviceCode.verification_uri);
                                                            setCopied(true);
                                                            setTimeout(() => setCopied(false), 2000);
                                                        } catch {
                                                            // 忽略复制失败
                                                        }
                                                    }}
                                                    className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-[10px] transition-colors flex-shrink-0"
                                                    title={t.providers.copyLink}
                                                >
                                                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {getOAuthStatusText()}
                                        </div>

                                        <div className="text-center">
                                            <button
                                                onClick={() => openInBrowser(deviceCode.verification_uri)}
                                                className="inline-flex items-center gap-1 text-sm text-purple-600 dark:text-purple-400 hover:underline"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                                {t.providers.openAuthPage}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* 成功 */}
                                {oauthStatus === 'success' && (
                                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-[10px] flex items-center gap-3">
                                        <CheckCircle className="w-5 h-5 text-green-600" />
                                        <p className="text-sm text-green-700 dark:text-green-300">
                                            {getOAuthStatusText()}
                                        </p>
                                    </div>
                                )}

                                {/* 过期 */}
                                {oauthStatus === 'expired' && (
                                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-[10px] flex items-center gap-3">
                                        <AlertCircle className="w-5 h-5 text-yellow-600" />
                                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                                            {getOAuthStatusText()}
                                        </p>
                                    </div>
                                )}
                            </>
                        )}

                        {/* 错误状态（通用） */}
                        {oauthStatus === 'error' && (
                            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-[10px] flex items-center gap-3">
                                <AlertCircle className="w-5 h-5 text-red-600" />
                                <p className="text-sm text-red-700 dark:text-red-300">
                                    {getOAuthStatusText()}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* 环境变量认证说明 */}
                {isEnvAuth && (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-[10px]">
                        <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
                            {t.providers.envAuthDesc}
                        </p>
                        {provider.envKeys && (
                            <ul className="text-xs text-yellow-600 dark:text-yellow-400 space-y-1">
                                {provider.envKeys.map(key => (
                                    <li key={key} className="font-mono bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded">
                                        {key}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {/* 无需认证说明 */}
                {isNoAuth && (
                    <div className="space-y-4">
                        {/* v3.4.8: Custom 提供商需要输入 Endpoint */}
                        {requiresEndpoint && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                                    <Link className="w-4 h-4 inline mr-1" />
                                    API Endpoint
                                </label>
                                <Input
                                    type="text"
                                    value={customEndpoint}
                                    onChange={setCustomEndpoint}
                                    placeholder={t.providers.apiEndpointPlaceholder}
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {t.providers.apiEndpointDesc}
                                </p>
                            </div>
                        )}

                        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-[10px]">
                            <p className="text-sm text-green-700 dark:text-green-300">
                                {requiresEndpoint
                                    ? t.providers.noAuthEndpointDesc
                                    : t.providers.noAuthLocalDesc
                                }
                            </p>
                            {!requiresEndpoint && provider.defaultEndpoint && (
                                <p className="text-xs text-green-600 dark:text-green-400 mt-2 font-mono">
                                    {provider.defaultEndpoint}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* 错误信息 */}
                {errorMessage && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-[10px] text-red-600 dark:text-red-400 text-sm">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {errorMessage}
                    </div>
                )}

                {/* 操作按钮 */}
                <div className="flex gap-3 pt-2">
                    <Button variant="secondary" onClick={onClose} className="flex-1">
                        {t.common.cancel}
                    </Button>

                    {/* API Key 认证：测试 + 连接 */}
                    {isApiAuth && (
                        <>
                            {onTestConnection && (
                                <Button
                                    variant="secondary"
                                    onClick={handleTestConnection}
                                    disabled={!apiKey || isTesting}
                                    className="flex-1"
                                >
                                    {isTesting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {t.providers.testing}
                                        </>
                                    ) : (
                                        t.providers.testConnection
                                    )}
                                </Button>
                            )}
                            <Button
                                variant="primary"
                                onClick={handleConnect}
                                disabled={!apiKey || isConnecting}
                                className="flex-1"
                            >
                                {isConnecting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        {t.providers.connecting}
                                    </>
                                ) : (
                                    t.providers.connect
                                )}
                            </Button>
                        </>
                    )}

                    {/* OAuth 认证 */}
                    {isOAuthAuth && (
                        <>
                            {/* Anthropic OAuth 按钮 */}
                            {isAnthropicOAuth && (
                                <>
                                    {(oauthStatus === 'waiting' || oauthStatus === 'polling') ? (
                                        <Button
                                            variant="secondary"
                                            onClick={handleCancelOAuth}
                                            className="flex-1"
                                        >
                                            {t.providers.cancelAuth}
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="primary"
                                            onClick={handleAnthropicOAuthConnect}
                                            disabled={oauthStatus === 'requesting' || oauthStatus === 'success'}
                                            className="flex-1"
                                            icon={oauthStatus === 'idle' || oauthStatus === 'error' ? <ExternalLink className="w-4 h-4" /> : undefined}
                                        >
                                            {oauthStatus === 'requesting' ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    {t.providers.requesting}
                                                </>
                                            ) : oauthStatus === 'success' ? (
                                                <>
                                                    <CheckCircle className="w-4 h-4" />
                                                    {t.providers.connected}
                                                </>
                                            ) : (
                                                t.providers.startAuth
                                            )}
                                        </Button>
                                    )}
                                </>
                            )}

                            {/* GitHub Copilot OAuth 按钮 */}
                            {isGitHubOAuth && (
                                <>
                                    {(oauthStatus === 'waiting' || oauthStatus === 'polling') ? (
                                        <Button
                                            variant="secondary"
                                            onClick={handleCancelOAuth}
                                            className="flex-1"
                                        >
                                            {t.providers.cancelAuth}
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="primary"
                                            onClick={handleOAuthConnect}
                                            disabled={oauthStatus === 'requesting' || oauthStatus === 'success'}
                                            className="flex-1"
                                            icon={oauthStatus === 'idle' || oauthStatus === 'expired' || oauthStatus === 'error' ? <ExternalLink className="w-4 h-4" /> : undefined}
                                        >
                                            {oauthStatus === 'requesting' ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    {t.providers.requesting}
                                                </>
                                            ) : oauthStatus === 'success' ? (
                                                <>
                                                    <CheckCircle className="w-4 h-4" />
                                                    {t.providers.connected}
                                                </>
                                            ) : (
                                                t.providers.startAuth
                                            )}
                                        </Button>
                                    )}
                                </>
                            )}

                            {/* OpenAI OAuth 按钮 (v3.2.1) */}
                            {isOpenAIOAuth && (
                                <>
                                    {(oauthStatus === 'waiting' || oauthStatus === 'polling') ? (
                                        <Button
                                            variant="secondary"
                                            onClick={handleCancelOAuth}
                                            className="flex-1"
                                        >
                                            {t.providers.cancelAuth}
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="primary"
                                            onClick={handleOpenAIOAuthConnect}
                                            disabled={oauthStatus === 'requesting' || oauthStatus === 'success'}
                                            className="flex-1"
                                            icon={oauthStatus === 'idle' || oauthStatus === 'expired' || oauthStatus === 'error' ? <ExternalLink className="w-4 h-4" /> : undefined}
                                        >
                                            {oauthStatus === 'requesting' ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    {t.providers.requesting}
                                                </>
                                            ) : oauthStatus === 'success' ? (
                                                <>
                                                    <CheckCircle className="w-4 h-4" />
                                                    {t.providers.connected}
                                                </>
                                            ) : (
                                                t.providers.startAuth
                                            )}
                                        </Button>
                                    )}
                                </>
                            )}

                            {/* Google OAuth 按钮 (v3.3.0) */}
                            {isGoogleOAuth && (
                                <>
                                    {(oauthStatus === 'waiting' || oauthStatus === 'polling') ? (
                                        <Button
                                            variant="secondary"
                                            onClick={handleCancelOAuth}
                                            className="flex-1"
                                        >
                                            {t.providers.cancelAuth}
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="primary"
                                            onClick={handleGoogleOAuthConnect}
                                            disabled={oauthStatus === 'requesting' || oauthStatus === 'success'}
                                            className="flex-1"
                                            icon={oauthStatus === 'idle' || oauthStatus === 'expired' || oauthStatus === 'error' ? <ExternalLink className="w-4 h-4" /> : undefined}
                                        >
                                            {oauthStatus === 'requesting' ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    {t.providers.requesting}
                                                </>
                                            ) : oauthStatus === 'success' ? (
                                                <>
                                                    <CheckCircle className="w-4 h-4" />
                                                    {t.providers.connected}
                                                </>
                                            ) : (
                                                t.providers.startAuth
                                            )}
                                        </Button>
                                    )}
                                </>
                            )}

                            {/* Kiro OAuth 按钮 (v0.7.2) */}
                            {isKiroOAuth && (
                                <>
                                    {(oauthStatus === 'waiting' || oauthStatus === 'polling') ? (
                                        <Button
                                            variant="secondary"
                                            onClick={handleCancelOAuth}
                                            className="flex-1"
                                        >
                                            {t.providers.cancelAuth}
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="primary"
                                            onClick={handleKiroOAuthConnect}
                                            disabled={oauthStatus === 'requesting' || oauthStatus === 'success'}
                                            className="flex-1"
                                            icon={oauthStatus === 'idle' || oauthStatus === 'expired' || oauthStatus === 'error' ? <ExternalLink className="w-4 h-4" /> : undefined}
                                        >
                                            {oauthStatus === 'requesting' ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    {t.providers.requesting}
                                                </>
                                            ) : oauthStatus === 'success' ? (
                                                <>
                                                    <CheckCircle className="w-4 h-4" />
                                                    {t.providers.connected}
                                                </>
                                            ) : (
                                                t.providers.startAuth
                                            )}
                                        </Button>
                                    )}
                                </>
                            )}
                        </>
                    )}

                    {/* 环境变量或无需认证 */}
                    {(isEnvAuth || isNoAuth) && (
                        <Button
                            variant="primary"
                            onClick={handleConnect}
                            disabled={isConnecting}
                            className="flex-1"
                        >
                            {isConnecting
                                ? t.providers.connecting
                                : t.providers.connect
                            }
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default ProviderConnectModal;
