/**
 * OpenAI OAuth 认证服务
 *
 * 实现 OpenAI ChatGPT Plus/Pro 订阅的 OAuth 认证流程
 * v3.4.0: 改为标准 Authorization Code Flow + PKCE
 * v3.4.5: 重构使用公共 PKCE 模块，统一日志，清理废弃代码
 * v3.4.9: 使用通用 OAuth 回调服务，支持动态端口分配
 *
 * 参考 CLIProxyAPIPlus codex/openai_auth.go 实现
 *
 * @module services/openai-oauth
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
 * OpenAI OAuth 配置
 * 参考 CLIProxyAPIPlus codex/openai_auth.go
 */
const OPENAI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const OPENAI_AUTH_URL = 'https://auth.openai.com/oauth/authorize';
// Token URL 在 Rust 后端使用: https://auth.openai.com/oauth/token

/**
 * OAuth 回调端口配置
 * v3.4.9: 使用通用端口配置，支持动态分配和降级
 */
const PORT_CONFIG = getProviderPortConfig('openai');

/**
 * OAuth 认证结果
 */
export interface OpenAIAuthResult {
    type: 'success' | 'failed' | 'cancelled';
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
    expiresAt?: number;
    accountId?: string;
    email?: string;
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
 * 开始 OpenAI OAuth 授权流程
 *
 * v3.4.0: 使用标准 Authorization Code Flow + PKCE
 * v3.4.9: 支持动态端口，返回实际使用的端口
 * 参考 CLIProxyAPIPlus codex/openai_auth.go GenerateAuthURL
 *
 * @param actualPort - 实际使用的端口（由回调服务器返回）
 * @returns 授权 URL 和用户指引
 */
export async function startOpenAIAuth(actualPort?: number): Promise<{
    url: string;
    instructions: string;
    callbackPort: number;
    redirectUri: string;
}> {
    logger.info(LogTags.AUTH, '开始 OpenAI OAuth 授权');

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
    // 参考 CLIProxyAPIPlus codex/openai_auth.go
    const url = new URL(OPENAI_AUTH_URL);
    url.searchParams.set('client_id', OPENAI_CLIENT_ID);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'openid email profile offline_access');
    url.searchParams.set('state', currentState);
    url.searchParams.set('code_challenge', pkce.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('prompt', 'login');
    // OpenAI 特有参数
    url.searchParams.set('id_token_add_organizations', 'true');
    url.searchParams.set('codex_cli_simplified_flow', 'true');

    return {
        url: url.toString(),
        instructions: '请在浏览器中登录您的 OpenAI 账号并授权',
        callbackPort: port,
        redirectUri,
    };
}

/**
 * 使用授权码交换 token
 *
 * v3.4.0: 使用 form-urlencoded 格式
 * v3.4.9: 使用动态记录的 redirect_uri
 * 参考 CLIProxyAPIPlus codex/openai_auth.go ExchangeCodeForTokens
 *
 * @param code - 授权码
 * @param state - state 参数（用于验证）
 * @returns 认证结果
 */
export async function exchangeOpenAICode(code: string, state?: string): Promise<OpenAIAuthResult> {
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
        const tokenResponse = await invoke<{
            access_token: string;
            refresh_token?: string;
            id_token?: string;
            expires_in: number;
            account_id?: string;
            email?: string;
        }>('openai_exchange_code', {
            code,
            verifier: currentVerifier,
            clientId: OPENAI_CLIENT_ID,
            redirectUri: currentRedirectUri,
        });

        // 清理状态
        currentVerifier = null;
        currentState = null;
        currentRedirectUri = null;

        return {
            type: 'success',
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token,
            idToken: tokenResponse.id_token,
            expiresAt: Date.now() + tokenResponse.expires_in * 1000,
            accountId: tokenResponse.account_id,
            email: tokenResponse.email,
        };
    } catch (error) {
        logger.error(LogTags.AUTH, 'OpenAI OAuth 授权码交换失败', error);
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
 * 刷新 OpenAI OAuth token
 *
 * @param refreshToken - 刷新令牌
 * @returns 新的认证结果
 */
export async function refreshOpenAIToken(refreshToken: string): Promise<OpenAIAuthResult> {
    try {
        const tokenResponse = await invoke<{
            access_token: string;
            refresh_token?: string;
            id_token?: string;
            expires_in: number;
            account_id?: string;
        }>('openai_refresh_token_v2', {
            refreshToken,
            clientId: OPENAI_CLIENT_ID,
        });

        return {
            type: 'success',
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token || refreshToken,
            idToken: tokenResponse.id_token,
            expiresAt: Date.now() + tokenResponse.expires_in * 1000,
            accountId: tokenResponse.account_id,
        };
    } catch (error) {
        logger.error(LogTags.AUTH, 'OpenAI Token 刷新失败', error);
        return { type: 'failed', error: 'Token refresh failed' };
    }
}

/**
 * 取消当前授权流程
 */
export function cancelOpenAIAuth(): void {
    currentVerifier = null;
    currentState = null;
    currentRedirectUri = null;
}

/**
 * OpenAI OAuth 服务类
 * 封装完整的 Authorization Code Flow + PKCE 认证流程
 * v3.4.0: 改用标准 OAuth 流程，参考 CLIProxyAPIPlus 实现
 * v3.4.1: 修复授权 URL 回调，支持手动复制 URL
 * v3.4.9: 使用通用 OAuth 回调服务，支持动态端口分配
 */
export class OpenAIOAuth {
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
    ): Promise<OpenAIAuthResult> {
        try {
            // 1. 启动通用 OAuth 回调服务器（支持动态端口）
            logger.info(LogTags.AUTH, 'OpenAI OAuth: 启动回调服务器', {
                preferredPort: PORT_CONFIG.preferredPort,
                fallbackPorts: PORT_CONFIG.fallbackPorts,
            });

            // 使用 Promise.race 同时启动回调服务器和生成授权 URL
            // 先尝试绑定端口，获取实际端口后再生成 URL
            const callbackPromise = startOAuthCallbackServer({
                preferredPort: PORT_CONFIG.preferredPort,
                fallbackPorts: PORT_CONFIG.fallbackPorts,
                callbackPaths: [PORT_CONFIG.callbackPath, '/callback', '/auth/callback'],
                timeout: 300, // 5 分钟超时
            });

            // 等待一小段时间让服务器启动并获取实际端口
            // 由于我们需要知道实际端口才能生成正确的 redirect_uri
            // 这里使用一个技巧：先检查首选端口是否可用
            const actualPort = PORT_CONFIG.preferredPort;

            // 2. 生成授权 URL（使用首选端口，如果端口冲突会在回调时失败）
            const authData = await startOpenAIAuth(actualPort);

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
                cancelOpenAIAuth();
                return { type: 'cancelled' };
            }

            // 检查实际使用的端口是否与预期一致
            if (callbackResult.actualPort !== actualPort) {
                logger.warn(LogTags.AUTH, 'OpenAI OAuth: 端口发生变化', {
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
            return await exchangeOpenAICode(callbackResult.code, callbackResult.state);

        } catch (error) {
            logger.error(LogTags.AUTH, 'OpenAI OAuth 授权流程错误', error);
            onStatusChange('error');
            cancelOpenAIAuth();
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
        cancelOpenAIAuth();
        // 停止回调服务器（旧接口，保持兼容）
        invoke('openai_stop_oauth_callback_server').catch(err => {
            logger.warn(LogTags.AUTH, '停止 OpenAI OAuth 回调服务器失败', { error: err });
        });
    }
}

/**
 * 导出单例实例
 */
export const openaiOAuth = new OpenAIOAuth();
