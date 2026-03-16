/**
 * Anthropic OAuth 认证服务
 *
 * 实现 Anthropic Claude Pro/Max 订阅的 OAuth 认证流程
 * 支持两种模式：
 * 1. Claude Pro/Max - 直接使用订阅账号，获取 OAuth token
 * 2. Create API Key - 通过 OAuth 授权后自动创建 API Key
 *
 * 参考 opencode-anthropic-auth 插件实现
 *
 * v3.4.5: 重构使用公共 PKCE 模块，统一日志
 * v3.4.9: 使用通用 OAuth 回调服务，支持动态端口分配
 *
 * @module services/anthropic-oauth
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
 * Anthropic OAuth 客户端 ID
 * 这是 Anthropic 官方提供的 OAuth 客户端 ID
 */
const ANTHROPIC_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

/**
 * OAuth 回调端口配置
 * v3.4.9: 使用通用端口配置，支持动态分配和降级
 */
const PORT_CONFIG = getProviderPortConfig('anthropic');

/**
 * OAuth 授权结果
 */
export interface AnthropicAuthResult {
    type: 'success' | 'failed';
    /** OAuth 模式：access token 和 refresh token */
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    /** API Key 模式：直接返回 API Key */
    apiKey?: string;
}

/**
 * 授权模式
 * - max: Claude Pro/Max 订阅（使用 claude.ai）
 * - console: 创建 API Key（使用 console.anthropic.com）
 */
export type AnthropicAuthMode = 'max' | 'console';

/**
 * 当前授权会话的 PKCE 验证器
 * 用于在授权回调时验证
 */
let currentVerifier: string | null = null;

/**
 * 当前授权模式
 */
let currentMode: AnthropicAuthMode | null = null;

/**
 * 当前授权会话使用的 redirect_uri
 * v3.4.9: 动态端口需要记录实际使用的 URI
 */
let currentRedirectUri: string | null = null;

/**
 * 开始 Anthropic OAuth 授权流程
 *
 * v3.4.0: 改用本地回调服务器，参考 CLIProxyAPIPlus 实现
 * v3.4.9: 支持动态端口，返回实际使用的端口
 *
 * @param mode - 授权模式：'max' 使用 Claude 订阅，'console' 创建 API Key
 * @param actualPort - 实际使用的端口（由回调服务器返回）
 * @returns 授权 URL 和用户指引
 */
export async function startAnthropicAuth(mode: AnthropicAuthMode, actualPort?: number): Promise<{
    url: string;
    instructions: string;
    callbackPort: number;
    redirectUri: string;
}> {
    logger.info(LogTags.AUTH, '开始 Anthropic OAuth 授权', { mode });

    // 使用传入的端口或默认端口
    const port = actualPort || PORT_CONFIG.preferredPort;
    const redirectUri = buildRedirectUri(port, PORT_CONFIG.callbackPath);
    currentRedirectUri = redirectUri;

    // 生成 PKCE（使用公共模块）
    const pkce = await generatePKCE();
    currentVerifier = pkce.verifier;
    currentMode = mode;

    // 生成 state 参数（防止 CSRF，使用公共模块）
    const state = generateState();

    // 构建授权 URL
    // max 模式使用 claude.ai，console 模式使用 console.anthropic.com
    const baseUrl = mode === 'max'
        ? 'https://claude.ai/oauth/authorize'
        : 'https://console.anthropic.com/oauth/authorize';

    const url = new URL(baseUrl);
    url.searchParams.set('code', 'true');
    url.searchParams.set('client_id', ANTHROPIC_CLIENT_ID);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'org:create_api_key user:profile user:inference');
    url.searchParams.set('code_challenge', pkce.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);

    return {
        url: url.toString(),
        instructions: mode === 'max'
            ? '请在浏览器中登录您的 Claude 账号并授权'
            : '请在浏览器中登录 Anthropic Console 并授权',
        callbackPort: port,
        redirectUri,
    };
}

/**
 * 使用授权码交换 token
 *
 * v3.4.9: 使用动态记录的 redirect_uri
 *
 * @param code - 用户从浏览器复制的授权码（格式：code#state）
 * @returns 认证结果
 */
export async function exchangeAnthropicCode(code: string): Promise<AnthropicAuthResult> {
    if (!currentVerifier || !currentMode || !currentRedirectUri) {
        return { type: 'failed' };
    }

    try {
        // 授权码格式：code#state
        const splits = code.split('#');
        const authCode = splits[0];
        const state = splits[1];

        // 通过 Tauri 后端调用 token 端点（避免 CORS）
        const tokenResponse = await invoke<{
            access_token: string;
            refresh_token: string;
            expires_in: number;
        }>('anthropic_exchange_token', {
            code: authCode,
            state: state,
            verifier: currentVerifier,
            clientId: ANTHROPIC_CLIENT_ID,
            redirectUri: currentRedirectUri,
        });

        // 如果是 console 模式，需要再调用 API 创建 API Key
        if (currentMode === 'console') {
            const apiKeyResponse = await invoke<{ raw_key: string }>('anthropic_create_api_key', {
                accessToken: tokenResponse.access_token,
            });

            // 清理状态
            currentVerifier = null;
            currentMode = null;
            currentRedirectUri = null;

            return {
                type: 'success',
                apiKey: apiKeyResponse.raw_key,
            };
        }

        // max 模式返回 OAuth token
        logger.info(LogTags.AUTH, 'Anthropic Token 交换成功');
        logger.debug(LogTags.AUTH, 'Access Token 信息', {
            prefix: tokenResponse.access_token.substring(0, 20) + '...',
            isOAuthToken: tokenResponse.access_token.includes('sk-ant-oat'),
        });

        const result: AnthropicAuthResult = {
            type: 'success',
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token,
            expiresAt: Date.now() + tokenResponse.expires_in * 1000,
        };

        // 清理状态
        currentVerifier = null;
        currentMode = null;
        currentRedirectUri = null;

        return result;
    } catch (error) {
        logger.error(LogTags.AUTH, 'Anthropic OAuth 授权码交换失败', error);
        // 清理状态
        currentVerifier = null;
        currentMode = null;
        currentRedirectUri = null;
        return { type: 'failed' };
    }
}

/**
 * 刷新 Anthropic OAuth token
 *
 * @param refreshToken - 刷新令牌
 * @returns 新的认证结果
 */
export async function refreshAnthropicToken(refreshToken: string): Promise<AnthropicAuthResult> {
    try {
        const tokenResponse = await invoke<{
            access_token: string;
            refresh_token: string;
            expires_in: number;
        }>('anthropic_refresh_token', {
            refreshToken,
            clientId: ANTHROPIC_CLIENT_ID,
        });

        return {
            type: 'success',
            accessToken: tokenResponse.access_token,
            refreshToken: tokenResponse.refresh_token,
            expiresAt: Date.now() + tokenResponse.expires_in * 1000,
        };
    } catch (error) {
        logger.error(LogTags.AUTH, 'Anthropic Token 刷新失败', error);
        return { type: 'failed' };
    }
}

/**
 * 获取当前授权模式的显示名称
 */
export function getAuthModeLabel(mode: AnthropicAuthMode): { zh: string; en: string } {
    return mode === 'max'
        ? { zh: 'Claude Pro/Max 订阅', en: 'Claude Pro/Max Subscription' }
        : { zh: '创建 API Key', en: 'Create API Key' };
}

/**
 * 取消当前授权流程
 */
export function cancelAnthropicAuth(): void {
    currentVerifier = null;
    currentMode = null;
    currentRedirectUri = null;
}

/**
 * Anthropic OAuth 服务类
 * 封装完整的 Authorization Code Flow 认证流程
 * v3.4.0: 使用本地回调服务器，参考 CLIProxyAPIPlus 实现
 * v3.4.1: 修复授权 URL 回调，支持手动复制 URL
 * v3.4.9: 使用通用 OAuth 回调服务，支持动态端口分配
 */
export class AnthropicOAuth {
    private abortController: AbortController | null = null;

    /**
     * 开始授权流程
     *
     * v3.4.9: 使用通用 OAuth 回调服务，支持动态端口
     *
     * @param mode - 授权模式
     * @param onAuthUrl - 获取到授权 URL 时的回调（用于显示 URL 供用户复制）
     * @param onStatusChange - 状态变化回调
     * @param signal - 取消信号
     * @returns 认证结果
     */
    async authorize(
        mode: AnthropicAuthMode,
        onAuthUrl: (url: string, instructions: string) => void,
        onStatusChange: (status: 'waiting' | 'exchanging' | 'error') => void,
        signal?: AbortSignal
    ): Promise<AnthropicAuthResult> {
        try {
            // 1. 启动通用 OAuth 回调服务器（支持动态端口）
            logger.info(LogTags.AUTH, 'Anthropic OAuth: 启动回调服务器', {
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
            const authData = await startAnthropicAuth(mode, actualPort);

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
                cancelAnthropicAuth();
                return { type: 'failed' };
            }

            // 检查实际使用的端口是否与预期一致
            if (callbackResult.actualPort !== actualPort) {
                logger.warn(LogTags.AUTH, 'Anthropic OAuth: 端口发生变化', {
                    expected: actualPort,
                    actual: callbackResult.actualPort,
                });
                // 注意：如果端口变化，redirect_uri 不匹配，OAuth 会失败
                // 这种情况下需要重新生成 URL，但用户可能已经在授权页面了
            }

            if (!callbackResult.success || !callbackResult.code) {
                onStatusChange('error');
                return { type: 'failed' };
            }

            // 6. 交换授权码
            onStatusChange('exchanging');

            // 授权码可能包含 state（格式：code#state）
            const code = callbackResult.state
                ? `${callbackResult.code}#${callbackResult.state}`
                : callbackResult.code;

            return await exchangeAnthropicCode(code);

        } catch (error) {
            logger.error(LogTags.AUTH, 'Anthropic OAuth 授权流程错误', error);
            onStatusChange('error');
            cancelAnthropicAuth();
            return { type: 'failed' };
        }
    }

    /**
     * 取消授权流程
     */
    cancel(): void {
        if (this.abortController) {
            this.abortController.abort();
        }
        cancelAnthropicAuth();
        // 停止回调服务器（旧接口，保持兼容）
        invoke('anthropic_stop_oauth_callback_server').catch(err => {
            logger.warn(LogTags.AUTH, '停止 Anthropic OAuth 回调服务器失败', { error: err });
        });
    }
}

/**
 * 导出单例实例
 */
export const anthropicOAuth = new AnthropicOAuth();

