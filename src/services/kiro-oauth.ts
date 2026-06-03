/**
 * Kiro OAuth 认证服务
 *
 * 支持多种认证方式：
 * - Google OAuth (Social Auth - Authorization Code Flow)
 * - GitHub OAuth (Social Auth - Authorization Code Flow)
 * - AWS Builder ID (Device Flow)
 * - AWS Identity Center / IDC (Device Flow with custom Start URL)
 *
 * Kiro 是 AWS 的 AI 编程助手
 *
 * @module services/kiro-oauth
 * @version 0.7.3
 */

import { invoke } from '@tauri-apps/api/core';
import { logger, LogTags } from '../utils/logger';
import {
    buildRedirectUri,
    checkPortAvailable,
    getAvailablePort,
    getProviderPortConfig,
    startOAuthCallbackServer,
    waitForOAuthCallback,
} from './oauth-callback';

/**
 * Kiro 认证方式
 */
export type KiroAuthMethod = 'google' | 'github' | 'aws' | 'idc';

/**
 * IDC 认证选项
 */
export interface KiroIdcOptions {
    /** 组织的 SSO 门户 URL */
    startUrl: string;
    /** AWS 区域（默认 us-east-1） */
    region: string;
}

/**
 * Kiro 模型信息
 */
export interface KiroModel {
    /** 模型 ID */
    model_id: string;
    /** 模型名称 */
    model_name: string;
    /** 模型描述 */
    description?: string;
    /** 速率倍数 */
    rate_multiplier?: number;
    /** 速率单位 */
    rate_unit?: string;
    /** 最大输入 token 数 */
    max_input_tokens?: number;
}

/**
 * Kiro 模型列表响应
 */
export interface KiroModelsResponse {
    /** 是否成功 */
    success: boolean;
    /** 模型列表 */
    models: KiroModel[];
    /** 错误信息 */
    error?: string;
}

/**
 * Kiro 配额信息
 */
export interface KiroQuotaInfo {
    /** 总配额 */
    total_limit: number;
    /** 当前使用量 */
    current_usage: number;
    /** 剩余配额 */
    remaining_quota: number;
    /** 是否已耗尽 */
    is_exhausted: boolean;
    /** 资源类型 */
    resource_type?: string;
    /** 下次重置时间（毫秒时间戳） */
    next_reset?: number;
    /** 订阅类型 */
    subscription_title?: string;
}

/**
 * Kiro 配额响应
 */
export interface KiroQuotaResponse {
    /** 是否成功 */
    success: boolean;
    /** 配额信息 */
    quota?: KiroQuotaInfo;
    /** 错误信息 */
    error?: string;
}

/**
 * Device Code 响应 (AWS Builder ID)
 */
export interface KiroDeviceCodeResponse {
    /** 设备码 */
    device_code: string;
    /** 用户码（需要用户输入） */
    user_code: string;
    /** 验证 URL */
    verification_uri: string;
    /** 过期时间（秒） */
    expires_in: number;
    /** 轮询间隔（秒） */
    interval: number;
}

/**
 * Social Auth 响应 (Google/GitHub)
 */
export interface KiroSocialAuthResponse {
    /** 认证 URL */
    auth_url: string;
    /** Code Verifier (PKCE) */
    code_verifier: string;
    /** State (CSRF protection) */
    state: string;
    /** Redirect URI */
    redirect_uri: string;
    /** 过期时间（秒） */
    expires_in: number;
}

/**
 * OAuth 认证结果
 */
export interface KiroOAuthResult {
    /** 是否成功 */
    success: boolean;
    /** 访问令牌 */
    accessToken?: string;
    /** 刷新令牌 */
    refreshToken?: string;
    /** Profile ARN（用于获取模型列表和配额） */
    profileArn?: string;
    /** Token 过期时间戳（毫秒）v0.9.0 */
    expiresAt?: number;
    /** v0.9.0: 认证方式 ("idc" | "aws") */
    authMethod?: string;
    /** v0.9.1: Kiro 客户端 ID（用于 token 刷新，需要持久化） */
    kiroClientId?: string;
    /** v0.9.1: Kiro 客户端密钥（用于 token 刷新，需要持久化） */
    kiroClientSecret?: string;
    /** v0.9.1: Kiro SSO 区域（用于 token 刷新，需要持久化） */
    kiroSsoRegion?: string;
    /** v0.9.1: Kiro IDC Start URL（IDC 认证时使用，需要持久化） */
    kiroStartUrl?: string;
    /** 错误信息 */
    error?: string;
    /** v0.9.2: 是否需要重新认证（不可恢复的错误，如 refresh_token 失效） */
    needsReauth?: boolean;
}

/**
 * 轮询状态回调
 */
export type KiroPollStatusCallback = (status: 'pending' | 'slow_down' | 'expired' | 'error') => void;

/**
 * Tauri 后端 OAuth 响应
 */
interface TauriOAuthResponse {
    success: boolean;
    // Device Flow 字段
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    expires_in?: number;
    interval?: number;
    // Social Auth 字段
    auth_url?: string;
    code_verifier?: string;
    state?: string;
    redirect_uri?: string;
    // 错误
    error?: string;
}

interface TauriOAuthCallbackResult {
    success: boolean;
    code?: string;
    state?: string;
    error?: string;
    actualPort: number;
}

/**
 * Tauri 后端 Token 轮询响应
 */
interface TauriPollTokenResponse {
    success: boolean;
    access_token?: string;
    status: string;  // "pending" | "slow_down" | "expired" | "error" | "success"
    error?: string;
    new_interval?: number;
    /** Kiro Profile ARN（用于获取模型列表和配额） */
    profile_arn?: string;
    /** 刷新令牌 */
    refresh_token?: string;
    /** Token 有效期（秒）v0.9.0 */
    expires_in?: number;
    /** v0.9.0: 认证方式 ("idc" | "aws") */
    auth_method?: string;
    /** v0.9.1: Kiro 客户端 ID（用于 token 刷新，需要持久化） */
    kiro_client_id?: string;
    /** v0.9.1: Kiro 客户端密钥（用于 token 刷新，需要持久化） */
    kiro_client_secret?: string;
    /** v0.9.1: Kiro SSO 区域（用于 token 刷新，需要持久化） */
    kiro_sso_region?: string;
    /** v0.9.1: Kiro IDC Start URL（IDC 认证时使用，需要持久化） */
    kiro_start_url?: string;
}

interface TauriSocialExchangeResponse {
    success: boolean;
    access_token?: string;
    refresh_token?: string;
    status?: string;
    error?: string;
    profile_arn?: string;
    expires_in?: number;
    kiro_client_id?: string;
    kiro_client_secret?: string;
    kiro_sso_region?: string;
}

const PORT_CONFIG = getProviderPortConfig('kiro');

/**
 * 轮询安全边际（毫秒）
 * 避免因时钟偏差导致过早请求
 */
const OAUTH_POLLING_SAFETY_MARGIN_MS = 3000;

/**
 * Kiro OAuth 服务
 *
 * 使用 Tauri 后端代理请求，解决浏览器 CORS 限制
 */
export const kiroOAuth = {
    /**
     * 请求 Device Code (AWS Builder ID 或 IDC)
     *
     * 通过 Tauri 后端调用 AWS SSO OIDC API
     *
     * @param authMethod - 认证方式，默认 'aws'
     * @param idcOptions - IDC 认证选项（仅当 authMethod 为 'idc' 时需要）
     * @returns Device Code 响应
     */
    async requestDeviceCode(authMethod: KiroAuthMethod = 'aws', idcOptions?: KiroIdcOptions): Promise<KiroDeviceCodeResponse> {
        logger.info(LogTags.APP, '请求 Kiro Device Code (via Tauri)', { authMethod, idcOptions });

        try {
            // 构建请求参数
            const requestParams: {
                provider_id: string;
                auth_method: string;
                start_url?: string;
                region?: string;
            } = {
                provider_id: 'kiro',
                auth_method: authMethod
            };

            // IDC 需要额外的 start_url 和 region 参数
            if (authMethod === 'idc' && idcOptions) {
                requestParams.start_url = idcOptions.startUrl;
                requestParams.region = idcOptions.region;
            }

            const response = await invoke<TauriOAuthResponse>('oauth_request_device_code', {
                request: requestParams
            });

            if (!response.success) {
                logger.error(LogTags.APP, 'Kiro Device Code 请求失败', { error: response.error });
                throw new Error(response.error || 'Failed to request device code');
            }

            // 验证必要字段
            if (!response.device_code || !response.user_code || !response.verification_uri) {
                throw new Error('Invalid device code response: missing required fields');
            }

            const result: KiroDeviceCodeResponse = {
                device_code: response.device_code,
                user_code: response.user_code,
                verification_uri: response.verification_uri,
                expires_in: response.expires_in || 600,
                interval: response.interval || 5,
            };

            logger.info(LogTags.APP, 'Kiro Device Code 获取成功', {
                user_code: result.user_code,
                verification_uri: result.verification_uri,
                expires_in: result.expires_in,
            });

            return result;
        } catch (error) {
            logger.error(LogTags.APP, 'Kiro Device Code 请求异常', error);
            throw error;
        }
    },

    /**
     * 请求 Social Auth URL (Google/GitHub)
     *
     * 通过 Tauri 后端生成认证 URL
     *
     * @param authMethod - 认证方式 ('google' | 'github')
     * @returns Social Auth 响应
     */
    async requestSocialAuth(
        authMethod: 'google' | 'github',
        redirectUri: string
    ): Promise<KiroSocialAuthResponse> {
        logger.info(LogTags.APP, '请求 Kiro Social Auth URL', { authMethod });

        try {
            const response = await invoke<TauriOAuthResponse>('oauth_request_device_code', {
                request: {
                    provider_id: 'kiro',
                    auth_method: authMethod,
                    redirect_uri: redirectUri,
                },
            });

            if (!response.success) {
                logger.error(LogTags.APP, 'Kiro Social Auth 请求失败', { error: response.error });
                throw new Error(response.error || 'Failed to request social auth');
            }

            // 验证必要字段
            if (!response.auth_url || !response.code_verifier || !response.state || !response.redirect_uri) {
                throw new Error('Invalid social auth response: missing required fields');
            }

            const result: KiroSocialAuthResponse = {
                auth_url: response.auth_url,
                code_verifier: response.code_verifier,
                state: response.state,
                redirect_uri: response.redirect_uri,
                expires_in: response.expires_in || 600,
            };

            logger.info(LogTags.APP, 'Kiro Social Auth URL 获取成功', {
                auth_url: result.auth_url,
                redirect_uri: result.redirect_uri,
            });

            return result;
        } catch (error) {
            logger.error(LogTags.APP, 'Kiro Social Auth 请求异常', error);
            throw error;
        }
    },

    /**
     * 轮询获取 Access Token (Device Flow)
     *
     * 通过 Tauri 后端轮询 AWS SSO OIDC API
     *
     * @param deviceCode - 设备码
     * @param interval - 轮询间隔（秒）
     * @param expiresIn - 过期时间（秒）
     * @param onStatus - 状态回调
     * @param abortSignal - 取消信号
     * @returns OAuth 结果
     */
    async pollForToken(
        deviceCode: string,
        interval: number,
        expiresIn: number,
        onStatus?: KiroPollStatusCallback,
        abortSignal?: AbortSignal
    ): Promise<KiroOAuthResult> {
        const startTime = Date.now();
        const expiresAt = startTime + expiresIn * 1000;
        let currentInterval = interval;

        logger.info(LogTags.APP, '开始轮询 Kiro Access Token (via Tauri)', { interval, expiresIn });

        while (Date.now() < expiresAt) {
            // 检查是否被取消
            if (abortSignal?.aborted) {
                logger.info(LogTags.APP, 'Kiro OAuth 轮询被取消');
                return { success: false, error: 'cancelled' };
            }

            // 等待轮询间隔
            await new Promise(resolve => setTimeout(resolve, currentInterval * 1000 + OAUTH_POLLING_SAFETY_MARGIN_MS));

            // 再次检查取消
            if (abortSignal?.aborted) {
                return { success: false, error: 'cancelled' };
            }

            try {
                const response = await invoke<TauriPollTokenResponse>('oauth_poll_token', {
                    request: {
                        provider_id: 'kiro',
                        device_code: deviceCode
                    }
                });

                // 成功获取 token
                if (response.success && response.access_token) {
                    // v0.9.0: 计算 token 过期时间戳
                    const expiresAt = response.expires_in
                        ? Date.now() + response.expires_in * 1000
                        : undefined;

                    logger.info(LogTags.APP, 'Kiro Access Token 获取成功', {
                        hasProfileArn: !!response.profile_arn,
                        hasRefreshToken: !!response.refresh_token,
                        expiresIn: response.expires_in,
                        expiresAt,
                        authMethod: response.auth_method,
                        hasClientId: !!response.kiro_client_id,  // v0.9.1
                    });
                    return {
                        success: true,
                        accessToken: response.access_token,
                        refreshToken: response.refresh_token,
                        profileArn: response.profile_arn,
                        expiresAt,
                        authMethod: response.auth_method,
                        // v0.9.1: 返回客户端注册信息用于持久化
                        kiroClientId: response.kiro_client_id,
                        kiroClientSecret: response.kiro_client_secret,
                        kiroSsoRegion: response.kiro_sso_region,
                        kiroStartUrl: response.kiro_start_url,
                    };
                }

                // 根据状态处理
                switch (response.status) {
                    case 'pending':
                        onStatus?.('pending');
                        continue;

                    case 'slow_down':
                        // 根据 RFC 规范，需要增加轮询间隔
                        currentInterval = response.new_interval || (currentInterval + 5);
                        logger.info(LogTags.APP, '收到 slow_down，调整轮询间隔', { newInterval: currentInterval });
                        onStatus?.('slow_down');
                        continue;

                    case 'expired':
                        logger.warn(LogTags.APP, 'Kiro OAuth Device Code 已过期');
                        onStatus?.('expired');
                        return { success: false, error: 'expired' };

                    case 'error':
                        logger.error(LogTags.APP, 'Kiro OAuth 错误', { error: response.error });
                        onStatus?.('error');
                        return { success: false, error: response.error || 'Unknown error' };

                    default:
                        // 未知状态，继续轮询
                        continue;
                }

            } catch (error) {
                logger.error(LogTags.APP, 'Kiro 轮询请求异常', error);
                // 网络错误，继续尝试
                continue;
            }
        }

        // 超时
        logger.warn(LogTags.APP, 'Kiro OAuth 轮询超时');
        onStatus?.('expired');
        return { success: false, error: 'expired' };
    },

    /**
     * 完整的 OAuth 流程 (AWS Builder ID / IDC - Device Flow)
     *
     * @param onDeviceCode - 获取到 Device Code 时的回调
     * @param onStatus - 状态回调
     * @param abortSignal - 取消信号
     * @param authMethod - 认证方式，默认 'aws'
     * @param idcOptions - IDC 认证选项（仅当 authMethod 为 'idc' 时需要）
     * @returns OAuth 结果
     */
    async authorize(
        onDeviceCode: (data: KiroDeviceCodeResponse) => void,
        onStatus?: KiroPollStatusCallback,
        abortSignal?: AbortSignal,
        authMethod: KiroAuthMethod = 'aws',
        idcOptions?: KiroIdcOptions
    ): Promise<KiroOAuthResult> {
        try {
            // 如果是 Social Auth，使用不同的流程
            if (authMethod === 'google' || authMethod === 'github') {
                return await this.authorizeSocial(authMethod, abortSignal);
            }

            // AWS Builder ID 或 IDC - Device Flow
            // 1. 请求 Device Code
            const deviceData = await this.requestDeviceCode(authMethod, idcOptions);
            onDeviceCode(deviceData);

            // 2. 轮询获取 Token
            return await this.pollForToken(
                deviceData.device_code,
                deviceData.interval,
                deviceData.expires_in,
                onStatus,
                abortSignal
            );
        } catch (error) {
            logger.error(LogTags.APP, 'Kiro OAuth 授权失败', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },

    /**
     * Social Auth 流程 (Google/GitHub)
     *
     * 使用 Authorization Code Flow + PKCE
     * 需要启动本地回调服务器
     *
     * @param authMethod - 认证方式 ('google' | 'github')
     * @param _abortSignal - 取消信号（预留，暂未使用）
     * @returns OAuth 结果
     */
    async authorizeSocial(
        authMethod: 'google' | 'github',
        abortSignal?: AbortSignal
    ): Promise<KiroOAuthResult> {
        try {
            logger.info(LogTags.APP, '开始 Kiro Social Auth 流程', { authMethod });

            if (abortSignal?.aborted) {
                return { success: false, error: 'cancelled' };
            }

            const candidatePorts = [
                PORT_CONFIG.preferredPort,
                ...PORT_CONFIG.fallbackPorts,
            ];

            const resolvePort = async (): Promise<number> => {
                for (const port of candidatePorts) {
                    try {
                        if (await checkPortAvailable(port)) {
                            return port;
                        }
                    } catch {
                        // 忽略端口检测失败，继续尝试下一个候选端口
                    }
                }

                try {
                    return await getAvailablePort();
                } catch {
                    return PORT_CONFIG.preferredPort;
                }
            };

            const callbackPort = await resolvePort();
            const redirectUri = buildRedirectUri(callbackPort, PORT_CONFIG.callbackPath);

            // 1. 获取认证 URL（使用已确认可用端口，避免回调端口与授权参数错位）
            const authData = await this.requestSocialAuth(authMethod, redirectUri);
            const callbackRedirectUri = authData.redirect_uri || redirectUri;

            // 2. 启动并等待回调
            const callbackPromise = startOAuthCallbackServer({
                preferredPort: callbackPort,
                fallbackPorts: [],
                callbackPaths: [PORT_CONFIG.callbackPath],
                timeout: 300,
            });

            // 3. 打开浏览器
            const { openUrl } = await import('@tauri-apps/plugin-opener');
            try {
                await openUrl(authData.auth_url);
            } catch (error) {
                logger.warn(LogTags.APP, '无法自动打开浏览器', { error });
            }

            const callbackResult = await waitForOAuthCallback(
                callbackPromise,
                abortSignal,
                callbackPort
            ) as TauriOAuthCallbackResult;

            if (callbackResult.error === 'cancelled' || abortSignal?.aborted) {
                logger.info(LogTags.APP, 'Kiro Social Auth 被取消');
                return { success: false, error: 'cancelled' };
            }

            if (!callbackResult.success || !callbackResult.code) {
                return {
                    success: false,
                    error: callbackResult.error || 'Social Auth 未返回授权码',
                };
            }

            if (!callbackResult.state) {
                logger.error(LogTags.APP, 'Kiro Social Auth 缺少 state', {
                    expected: authData.state,
                });
                return { success: false, error: '授权回调未返回 state' };
            }

            if (callbackResult.state !== authData.state) {
                logger.error(LogTags.APP, 'Kiro Social Auth state 校验失败', {
                    expected: authData.state,
                    actual: callbackResult.state,
                });
                return { success: false, error: '授权回调 state 校验失败' };
            }

            // 4. 交换授权码
            const exchangeResponse = await invoke<TauriSocialExchangeResponse>('kiro_exchange_code', {
                code: callbackResult.code,
                verifier: authData.code_verifier,
                redirectUri: callbackRedirectUri,
            });

            if (!exchangeResponse.success || !exchangeResponse.access_token) {
                return {
                    success: false,
                    error: exchangeResponse.error || '授权码交换失败',
                };
            }

            const expiresAt = exchangeResponse.expires_in
                ? Date.now() + exchangeResponse.expires_in * 1000
                : undefined;

            // 尝试获取 Profile ARN（可选）
            // NOTE: 若后端未返回，前端将回退到无该字段的流程

            return {
                success: true,
                accessToken: exchangeResponse.access_token,
                refreshToken: exchangeResponse.refresh_token,
                profileArn: exchangeResponse.profile_arn,
                expiresAt,
                // v0.9.1：社交登录也记录认证信息，用于后续刷新
                authMethod,
                kiroClientId: exchangeResponse.kiro_client_id,
                kiroClientSecret: exchangeResponse.kiro_client_secret,
                kiroSsoRegion: exchangeResponse.kiro_sso_region || 'us-east-1',
            };

        } catch (error) {
            logger.error(LogTags.APP, 'Kiro Social Auth 失败', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },

    /**
     * 获取 Kiro 可用模型列表
     *
     * @param accessToken - OAuth 访问令牌
     * @param profileArn - 用户配置文件 ARN
     * @param authMethod - 认证方式 ("idc" | "aws")（v4.1.31）
     * @param ssoRegion - IDC 用户的 SSO 区域（v4.1.31）
     * @returns 模型列表响应
     */
    async listModels(accessToken: string, profileArn: string, authMethod?: string, ssoRegion?: string): Promise<KiroModelsResponse> {
        logger.info(LogTags.APP, '获取 Kiro 可用模型列表');

        try {
            const response = await invoke<KiroModelsResponse>('kiro_list_models', {
                accessToken,
                profileArn,
                authMethod: authMethod || null,
                ssoRegion: ssoRegion || null,
            });

            if (response.success) {
                logger.info(LogTags.APP, `获取到 ${response.models.length} 个 Kiro 模型`);
            } else {
                logger.error(LogTags.APP, 'Kiro 模型列表获取失败', { error: response.error });
            }

            return response;
        } catch (error) {
            logger.error(LogTags.APP, 'Kiro 模型列表请求异常', error);
            return {
                success: false,
                models: [],
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },

    /**
     * 获取 Kiro 配额信息
     *
     * @param accessToken - OAuth 访问令牌
     * @param profileArn - 用户配置文件 ARN
     * @param authMethod - 认证方式 ("idc" | "aws")，用于选择正确的 User-Agent (v0.9.0)
     * @param ssoRegion - IDC 用户的 SSO 区域（v4.1.31）
     * @returns 配额响应
     */
    async getQuota(accessToken: string, profileArn: string, authMethod?: string, ssoRegion?: string): Promise<KiroQuotaResponse> {
        logger.info(LogTags.APP, '获取 Kiro 配额信息', { authMethod });

        try {
            const response = await invoke<KiroQuotaResponse>('kiro_get_quota', {
                accessToken,
                profileArn,
                authMethod,
                ssoRegion: ssoRegion || null,
            });

            if (response.success && response.quota) {
                logger.info(LogTags.APP, `Kiro 配额: ${response.quota.current_usage}/${response.quota.total_limit}, 剩余: ${response.quota.remaining_quota}`);
            } else {
                logger.error(LogTags.APP, 'Kiro 配额获取失败', { error: response.error });
            }

            return response;
        } catch (error) {
            logger.error(LogTags.APP, 'Kiro 配额请求异常', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },

    /**
     * 刷新 Kiro Access Token
     *
     * 使用 AWS SSO OIDC refresh_token grant 刷新 token
     *
     * v0.9.1: 支持传入持久化的客户端注册信息，解决重启后无法刷新的问题
     *
     * @param refreshToken - 刷新令牌
     * @param clientId - 可选，客户端 ID（从持久化凭证中获取）
     * @param clientSecret - 可选，客户端密钥（从持久化凭证中获取）
     * @param ssoRegion - 可选，SSO 区域（从持久化凭证中获取）
     * @returns 刷新结果
     */
    async refreshToken(
        refreshToken: string,
        clientId?: string,
        clientSecret?: string,
        ssoRegion?: string
    ): Promise<KiroOAuthResult> {
        logger.info(LogTags.APP, '刷新 Kiro Access Token', {
            hasClientId: !!clientId,
            hasClientSecret: !!clientSecret,
            ssoRegion,
        });

        try {
            const response = await invoke<{
                success: boolean;
                access_token?: string;
                refresh_token?: string;
                expires_in?: number;
                error?: string;
                needs_reauth?: boolean;  // v0.9.2: 新增
            }>('kiro_refresh_token', {
                refreshToken,
                clientId,       // v0.9.1: 传递持久化的客户端 ID
                clientSecret,   // v0.9.1: 传递持久化的客户端密钥
                ssoRegion,      // v0.9.1: 传递持久化的 SSO 区域
            });

            if (response.success && response.access_token) {
                // 计算新的过期时间戳
                const expiresAt = response.expires_in
                    ? Date.now() + response.expires_in * 1000
                    : undefined;

                logger.info(LogTags.APP, 'Kiro Token 刷新成功', {
                    expiresIn: response.expires_in,
                    expiresAt,
                });

                return {
                    success: true,
                    accessToken: response.access_token,
                    refreshToken: response.refresh_token,
                    expiresAt,
                };
            } else {
                logger.error(LogTags.APP, 'Kiro Token 刷新失败', {
                    error: response.error,
                    needsReauth: response.needs_reauth,  // v0.9.2
                });
                return {
                    success: false,
                    error: response.error || 'Token 刷新失败',
                    needsReauth: response.needs_reauth,  // v0.9.2: 传递给调用方
                };
            }
        } catch (error) {
            logger.error(LogTags.APP, 'Kiro Token 刷新异常', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
};
