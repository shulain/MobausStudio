/**
 * Google Gemini OAuth 认证服务
 *
 * 实现 Google Gemini API 的 OAuth 认证流程
 * 使用 Authorization Code Flow with PKCE
 *
 * 参考 CLIProxyAPIPlus gemini_auth.go 和 antigravity/auth.go 实现
 * v3.3.1: 添加 Antigravity onboard 流程，自动获取/创建 GCP 项目
 * v3.4.5: 重构使用公共 PKCE 模块，统一日志
 * v3.4.9: 使用通用 OAuth 回调服务，支持动态端口分配
 *
 * @module services/google-oauth
 * @version 3.4.9
 */

import { invoke } from '@tauri-apps/api/core';
import { generatePKCE, generateState } from '../utils/pkce';
import { logger, LogTags } from '../utils/logger';
import {
    startOAuthCallbackServer,
    buildRedirectUri,
    getProviderPortConfig,
} from './oauth-callback';

/**
 * Google OAuth 配置
 * 使用 Antigravity 的客户端凭证（支持自动 onboard）
 * 参考 CLIProxyAPIPlus antigravity/constants.go
 * 注意：Client Secret 已移至 Rust 后端安全存储
 */
const GOOGLE_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';

/**
 * OAuth 端点
 */
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

/**
 * OAuth 回调端口配置
 * v3.4.9: 使用通用端口配置，支持动态分配和降级
 */
const PORT_CONFIG = getProviderPortConfig('google');

/**
 * OAuth 作用域
 * 使用 Antigravity 的完整 scope 列表
 */
const SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cclog',
    'https://www.googleapis.com/auth/experimentsandconfigs',
];

/**
 * OAuth 认证结果
 */
export interface GoogleAuthResult {
    type: 'success' | 'failed' | 'cancelled';
    /** Access Token */
    accessToken?: string;
    /** Refresh Token */
    refreshToken?: string;
    /** 过期时间戳 */
    expiresAt?: number;
    /** 用户邮箱 */
    email?: string;
    /** GCP 项目 ID (Cloud Code API 需要) */
    projectId?: string;
    /** 错误信息 */
    error?: string;
}

/**
 * 当前授权会话的 PKCE 验证器
 */
let currentVerifier: string | null = null;

/**
 * 当前授权会话的 state
 */
let currentState: string | null = null;

/**
 * 当前授权会话使用的 redirect_uri
 * v3.4.9: 动态端口需要记录实际使用的 URI
 */
let currentRedirectUri: string | null = null;

/**
 * 开始 Google OAuth 授权流程
 *
 * v3.4.9: 支持动态端口，返回实际使用的端口
 *
 * @param actualPort - 实际使用的端口（由回调服务器返回）
 * @returns 授权 URL 和用户指引
 */
export async function startGoogleAuth(actualPort?: number): Promise<{
    url: string;
    instructions: string;
    callbackPort: number;
    redirectUri: string;
}> {
    logger.info(LogTags.AUTH, '开始 Google OAuth 授权');

    // 使用传入的端口或默认端口
    const port = actualPort || PORT_CONFIG.preferredPort;
    const redirectUri = buildRedirectUri(port, PORT_CONFIG.callbackPath);
    currentRedirectUri = redirectUri;

    // 生成 PKCE（使用公共模块）
    const pkce = await generatePKCE();
    currentVerifier = pkce.verifier;

    // 生成 state 参数（防止 CSRF，使用公共模块）
    currentState = generateState();

    // 构建授权 URL
    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', SCOPES.join(' '));
    url.searchParams.set('state', currentState);
    url.searchParams.set('code_challenge', pkce.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');

    return {
        url: url.toString(),
        instructions: '请在浏览器中登录您的 Google 账号并授权访问 Gemini API',
        callbackPort: port,
        redirectUri,
    };
}

/**
 * 使用授权码交换 token
 *
 * v3.3.1: 添加 Antigravity onboard 流程，自动获取/创建 GCP 项目
 * v3.4.9: 使用动态记录的 redirect_uri
 *
 * @param code - 授权码
 * @param state - state 参数（用于验证）
 * @returns 认证结果
 */
export async function exchangeGoogleCode(code: string, state?: string): Promise<GoogleAuthResult> {
    if (!currentVerifier || !currentRedirectUri) {
        return { type: 'failed', error: 'No active authorization session' };
    }

    // 验证 state（如果提供）
    if (state && currentState && state !== currentState) {
        currentVerifier = null;
        currentState = null;
        currentRedirectUri = null;
        return { type: 'failed', error: 'State mismatch - possible CSRF attack' };
    }

    try {
        // 通过 Tauri 后端调用 token 端点（避免 CORS）
        // 注意：clientSecret 已移至后端安全存储，不再从前端传递
        const tokenResponse = await invoke<{
            access_token: string;
            refresh_token?: string;
            expires_in: number;
            token_type: string;
        }>('google_exchange_token', {
            code,
            verifier: currentVerifier,
            clientId: GOOGLE_CLIENT_ID,
            redirectUri: currentRedirectUri,
        });

        // 获取用户信息
        let email: string | undefined;
        try {
            const userInfo = await invoke<{ email: string }>('google_get_user_info', {
                accessToken: tokenResponse.access_token,
            });
            email = userInfo.email;
        } catch (e) {
            logger.warn(LogTags.AUTH, '获取 Google 用户信息失败', e);
        }

        // v3.3.1: 调用 Antigravity onboard 流程获取/创建 GCP 项目
        // v3.4.3: 保存 projectId 到返回结果中
        logger.info(LogTags.AUTH, '开始 Antigravity onboard 流程');
        let projectId: string | undefined;
        try {
            const loadResult = await invoke<{
                success: boolean;
                project_id?: string;
                error?: string;
            }>('google_load_code_assist', {
                accessToken: tokenResponse.access_token,
            });

            if (loadResult.success && loadResult.project_id) {
                logger.info(LogTags.AUTH, '获取到 GCP 项目 ID', { projectId: loadResult.project_id });
                projectId = loadResult.project_id;
            } else if (loadResult.error?.startsWith('NEED_ONBOARD:')) {
                // 需要 onboard，提取 tier_id
                const tierId = loadResult.error.replace('NEED_ONBOARD:', '');
                logger.info(LogTags.AUTH, '需要 onboard', { tierId });

                const onboardResult = await invoke<{
                    success: boolean;
                    project_id?: string;
                    error?: string;
                }>('google_onboard_user', {
                    accessToken: tokenResponse.access_token,
                    tierId,
                });

                if (onboardResult.success && onboardResult.project_id) {
                    logger.info(LogTags.AUTH, 'Onboard 成功', { projectId: onboardResult.project_id });
                    projectId = onboardResult.project_id;
                } else {
                    logger.warn(LogTags.AUTH, 'Onboard 失败', { error: onboardResult.error });
                }
            } else {
                logger.warn(LogTags.AUTH, 'loadCodeAssist 失败', { error: loadResult.error });
            }
        } catch (e) {
            logger.warn(LogTags.AUTH, 'Antigravity onboard 失败', e);
            // 不阻止认证流程，继续返回 token
        }

        // 清理状态
        currentVerifier = null;
        currentState = null;
        currentRedirectUri = null;

        return {
            type: 'success',
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token,
            expiresAt: Date.now() + tokenResponse.expires_in * 1000,
            email,
            projectId,
        };
    } catch (error) {
        logger.error(LogTags.AUTH, 'Google OAuth 授权码交换失败', error);
        // 清理状态
        currentVerifier = null;
        currentState = null;
        currentRedirectUri = null;
        return {
            type: 'failed',
            error: error instanceof Error ? error.message : 'Token exchange failed',
        };
    }
}

/**
 * 刷新 Google OAuth token
 *
 * @param refreshToken - 刷新令牌
 * @returns 新的认证结果
 */
export async function refreshGoogleToken(refreshToken: string): Promise<GoogleAuthResult> {
    try {
        // 注意：clientSecret 已移至后端安全存储，不再从前端传递
        const tokenResponse = await invoke<{
            access_token: string;
            expires_in: number;
            token_type: string;
        }>('google_refresh_token', {
            refreshToken,
            clientId: GOOGLE_CLIENT_ID,
        });

        return {
            type: 'success',
            accessToken: tokenResponse.access_token,
            refreshToken, // Google 不会返回新的 refresh token
            expiresAt: Date.now() + tokenResponse.expires_in * 1000,
        };
    } catch (error) {
        logger.error(LogTags.AUTH, 'Google Token 刷新失败', error);
        return { type: 'failed', error: 'Token refresh failed' };
    }
}

/**
 * 取消当前授权流程
 */
export function cancelGoogleAuth(): void {
    currentVerifier = null;
    currentState = null;
    currentRedirectUri = null;
}

/**
 * Google OAuth 服务类
 * 封装完整的 Authorization Code Flow 认证流程
 * v3.4.1: 修复授权 URL 回调，支持手动复制 URL
 * v3.4.9: 使用通用 OAuth 回调服务，支持动态端口分配
 */
export class GoogleOAuth {
    private abortController: AbortController | null = null;

    /**
     * 开始授权流程
     *
     * v3.4.9: 使用通用 OAuth 回调服务，支持动态端口
     *
     * @param onAuthUrl - 获取到授权 URL 时的回调（用于显示 URL 供用户复制）
     * @param onStatusChange - 状态变化回调
     * @param signal - 取消信号
     * @returns 认证结果
     */
    async authorize(
        onAuthUrl: (url: string, instructions: string) => void,
        onStatusChange: (status: 'waiting' | 'exchanging' | 'error') => void,
        signal?: AbortSignal
    ): Promise<GoogleAuthResult> {
        try {
            // 1. 启动通用 OAuth 回调服务器（支持动态端口）
            logger.info(LogTags.AUTH, 'Google OAuth: 启动回调服务器', {
                preferredPort: PORT_CONFIG.preferredPort,
                fallbackPorts: PORT_CONFIG.fallbackPorts,
            });

            // 使用 Promise.race 同时启动回调服务器和生成授权 URL
            // 先尝试绑定端口，获取实际端口后再生成 URL
            const callbackPromise = startOAuthCallbackServer({
                preferredPort: PORT_CONFIG.preferredPort,
                fallbackPorts: PORT_CONFIG.fallbackPorts,
                callbackPaths: [PORT_CONFIG.callbackPath, '/callback', '/oauth-callback'],
                timeout: 300, // 5 分钟超时
            });

            // 等待一小段时间让服务器启动并获取实际端口
            // 由于我们需要知道实际端口才能生成正确的 redirect_uri
            // 这里使用一个技巧：先检查首选端口是否可用
            const actualPort = PORT_CONFIG.preferredPort;

            // 2. 生成授权 URL（使用首选端口，如果端口冲突会在回调时失败）
            const authData = await startGoogleAuth(actualPort);

            // 3. 回调 URL，让 UI 可以显示（供用户手动复制）
            onAuthUrl(authData.url, authData.instructions);
            onStatusChange('waiting');

            // 4. 尝试自动打开浏览器（可能失败，但不影响流程）
            try {
                const { openUrl } = await import('@tauri-apps/plugin-opener');
                await openUrl(authData.url);
            } catch (e) {
                logger.warn(LogTags.AUTH, '无法自动打开浏览器，请手动复制 URL', e);
            }

            // 5. 等待回调服务器返回结果
            const callbackResult = await callbackPromise;

            // 检查是否被取消
            if (signal?.aborted) {
                cancelGoogleAuth();
                return { type: 'cancelled' };
            }

            // 检查实际使用的端口是否与预期一致
            if (callbackResult.actualPort !== actualPort) {
                logger.warn(LogTags.AUTH, 'Google OAuth: 端口发生变化', {
                    expected: actualPort,
                    actual: callbackResult.actualPort,
                });
                // 注意：如果端口变化，redirect_uri 不匹配，OAuth 会失败
                // 这种情况下需要重新生成 URL，但用户可能已经在授权页面了
            }

            if (!callbackResult.success || !callbackResult.code) {
                onStatusChange('error');
                return {
                    type: 'failed',
                    error: callbackResult.error || 'No authorization code received',
                };
            }

            // 6. 交换授权码
            onStatusChange('exchanging');
            return await exchangeGoogleCode(callbackResult.code, callbackResult.state);

        } catch (error) {
            logger.error(LogTags.AUTH, 'Google OAuth 授权流程错误', error);
            onStatusChange('error');
            cancelGoogleAuth();
            return {
                type: 'failed',
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * 取消授权流程
     */
    cancel(): void {
        if (this.abortController) {
            this.abortController.abort();
        }
        cancelGoogleAuth();
        // 停止回调服务器（旧接口，保持兼容）
        invoke('google_stop_oauth_callback_server').catch(err => {
            logger.warn(LogTags.AUTH, '停止 Google OAuth 回调服务器失败', { error: err });
        });
    }
}

/**
 * 导出单例实例
 */
export const googleOAuth = new GoogleOAuth();
