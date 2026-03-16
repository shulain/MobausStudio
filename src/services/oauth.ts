/**
 * OAuth 认证服务
 *
 * 实现 GitHub Device Flow 等 OAuth 认证流程
 * v3.1.1: 使用 Tauri 后端代理请求，解决 CORS 问题
 *
 * @module services/oauth
 * @version 3.1.1
 */

import { invoke } from '@tauri-apps/api/core';
import { logger, LogTags } from '../utils/logger';
import type { OAuthResult as GlobalOAuthResult } from '../types';

/**
 * Device Code 响应
 */
export interface DeviceCodeResponse {
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
 * OAuth 认证结果（内部使用，包含 success 状态）
 * 注意：此类型仅用于 oauth.ts 内部，外部应使用 types/index.ts 中的 OAuthResult
 */
export interface OAuthResult extends Partial<GlobalOAuthResult> {
    /** 是否成功 */
    success: boolean;
    /** 错误信息 */
    error?: string;
}

/**
 * 轮询状态回调
 */
export type PollStatusCallback = (status: 'pending' | 'slow_down' | 'expired' | 'error') => void;

/**
 * Tauri 后端 Device Code 响应
 */
interface TauriDeviceCodeResponse {
    success: boolean;
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    expires_in?: number;
    interval?: number;
    error?: string;
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
}

/**
 * 轮询安全边际（毫秒）
 * 避免因时钟偏差导致过早请求
 */
const OAUTH_POLLING_SAFETY_MARGIN_MS = 3000;

/**
 * GitHub Copilot OAuth 服务
 *
 * 使用 Tauri 后端代理请求，解决浏览器 CORS 限制
 */
export const githubCopilotOAuth = {
    /**
     * 请求 Device Code
     *
     * 通过 Tauri 后端调用 GitHub API
     *
     * @returns Device Code 响应
     */
    async requestDeviceCode(): Promise<DeviceCodeResponse> {
        logger.info(LogTags.APP, '请求 GitHub Device Code (via Tauri)');

        try {
            const response = await invoke<TauriDeviceCodeResponse>('oauth_request_device_code', {
                request: {
                    provider_id: 'github-copilot'
                }
            });

            if (!response.success) {
                logger.error(LogTags.APP, 'Device Code 请求失败', { error: response.error });
                throw new Error(response.error || 'Failed to request device code');
            }

            // 验证必要字段
            if (!response.device_code || !response.user_code || !response.verification_uri) {
                throw new Error('Invalid device code response: missing required fields');
            }

            const result: DeviceCodeResponse = {
                device_code: response.device_code,
                user_code: response.user_code,
                verification_uri: response.verification_uri,
                expires_in: response.expires_in || 900,
                interval: response.interval || 5,
            };

            logger.info(LogTags.APP, 'Device Code 获取成功', {
                user_code: result.user_code,
                verification_uri: result.verification_uri,
                expires_in: result.expires_in,
            });

            return result;
        } catch (error) {
            logger.error(LogTags.APP, 'Device Code 请求异常', error);
            throw error;
        }
    },

    /**
     * 轮询获取 Access Token
     *
     * 通过 Tauri 后端轮询 GitHub API
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
        onStatus?: PollStatusCallback,
        abortSignal?: AbortSignal
    ): Promise<OAuthResult> {
        const startTime = Date.now();
        const expiresAt = startTime + expiresIn * 1000;
        let currentInterval = interval;

        logger.info(LogTags.APP, '开始轮询 Access Token (via Tauri)', { interval, expiresIn });

        while (Date.now() < expiresAt) {
            // 检查是否被取消
            if (abortSignal?.aborted) {
                logger.info(LogTags.APP, 'OAuth 轮询被取消');
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
                        provider_id: 'github-copilot',
                        device_code: deviceCode
                    }
                });

                // 成功获取 token
                if (response.success && response.access_token) {
                    logger.info(LogTags.APP, 'Access Token 获取成功');
                    // v2.4.1: GitHub Copilot token 默认 8 小时有效期
                    const GITHUB_COPILOT_TOKEN_TTL = 8 * 60 * 60 * 1000; // 8 小时
                    return {
                        success: true,
                        accessToken: response.access_token,
                        refreshToken: response.access_token, // GitHub Copilot 使用同一个 token
                        expiresAt: Date.now() + GITHUB_COPILOT_TOKEN_TTL,
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
                        logger.warn(LogTags.APP, 'OAuth Device Code 已过期');
                        onStatus?.('expired');
                        return { success: false, error: 'expired' };

                    case 'error':
                        logger.error(LogTags.APP, 'OAuth 错误', { error: response.error });
                        onStatus?.('error');
                        return { success: false, error: response.error || 'Unknown error' };

                    default:
                        // 未知状态，继续轮询
                        continue;
                }

            } catch (error) {
                logger.error(LogTags.APP, '轮询请求异常', error);
                // 网络错误，继续尝试
                continue;
            }
        }

        // 超时
        logger.warn(LogTags.APP, 'OAuth 轮询超时');
        onStatus?.('expired');
        return { success: false, error: 'expired' };
    },

    /**
     * 完整的 OAuth 流程
     *
     * @param onDeviceCode - 获取到 Device Code 时的回调
     * @param onStatus - 状态回调
     * @param abortSignal - 取消信号
     * @returns OAuth 结果
     */
    async authorize(
        onDeviceCode: (data: DeviceCodeResponse) => void,
        onStatus?: PollStatusCallback,
        abortSignal?: AbortSignal
    ): Promise<OAuthResult> {
        try {
            // 1. 请求 Device Code
            const deviceData = await this.requestDeviceCode();
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
            logger.error(LogTags.APP, 'OAuth 授权失败', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
};

/**
 * 打开浏览器访问 URL
 * 使用 Tauri opener 插件打开外部链接
 */
export async function openInBrowser(url: string): Promise<void> {
    try {
        // 使用 Tauri opener 插件
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        await openUrl(url);
    } catch {
        // 降级到 window.open
        window.open(url, '_blank');
    }
}
