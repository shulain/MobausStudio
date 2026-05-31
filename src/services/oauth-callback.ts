/**
 * 通用 OAuth 回调服务
 *
 * v3.4.9: 提供统一的 OAuth 回调处理，支持动态端口分配
 *
 * 特性：
 * - 动态端口分配：避免端口冲突
 * - 端口降级：首选端口被占用时自动尝试备选端口
 * - 统一接口：所有 OAuth 提供商使用相同的回调服务
 *
 * @module services/oauth-callback
 * @version 3.4.9
 */

import { invoke } from '@tauri-apps/api/core';
import { logger, LogTags } from '../utils/logger';

/**
 * OAuth 回调结果
 */
export interface OAuthCallbackResult {
    /** 是否成功 */
    success: boolean;
    /** 授权码 */
    code?: string;
    /** state 参数 */
    state?: string;
    /** 错误信息 */
    error?: string;
    /** 实际使用的端口 */
    actualPort: number;
}

/**
 * OAuth 回调服务配置
 */
export interface OAuthCallbackConfig {
    /** 首选端口 */
    preferredPort: number;
    /** 备选端口列表 */
    fallbackPorts?: number[];
    /** 支持的回调路径 */
    callbackPaths?: string[];
    /** 超时时间（秒） */
    timeout?: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<Omit<OAuthCallbackConfig, 'preferredPort'>> = {
    fallbackPorts: [],
    callbackPaths: ['/callback', '/oauth-callback', '/auth/callback', '/oauth2callback'],
    timeout: 300, // 5 分钟
};

/**
 * 启动 OAuth 回调服务器
 *
 * @param config - 回调服务配置
 * @returns 回调结果（包含授权码和实际端口）
 */
export async function startOAuthCallbackServer(
    config: OAuthCallbackConfig
): Promise<OAuthCallbackResult> {
    const {
        preferredPort,
        fallbackPorts = DEFAULT_CONFIG.fallbackPorts,
        callbackPaths = DEFAULT_CONFIG.callbackPaths,
        timeout = DEFAULT_CONFIG.timeout,
    } = config;

    logger.info(LogTags.AUTH, '启动通用 OAuth 回调服务器', {
        preferredPort,
        fallbackPorts,
        timeout,
    });

    try {
        const result = await invoke<{
            success: boolean;
            code?: string;
            state?: string;
            error?: string;
            actual_port: number;
        }>('start_oauth_callback_server', {
            preferredPort,
            fallbackPorts,
            callbackPaths,
            timeout,
        });

        if (result.success) {
            logger.info(LogTags.AUTH, 'OAuth 回调成功', {
                actualPort: result.actual_port,
            });
        } else {
            logger.warn(LogTags.AUTH, 'OAuth 回调失败', {
                error: result.error,
            });
        }

        return {
            success: result.success,
            code: result.code,
            state: result.state,
            error: result.error,
            actualPort: result.actual_port,
        };
    } catch (error) {
        logger.error(LogTags.AUTH, 'OAuth 回调服务器错误', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            actualPort: 0,
        };
    }
}

/**
 * 检查端口是否可用
 *
 * @param port - 要检查的端口
 * @returns 是否可用
 */
export async function checkPortAvailable(port: number): Promise<boolean> {
    try {
        return await invoke<boolean>('check_port_available', { port });
    } catch {
        return false;
    }
}

/**
 * 获取一个可用端口
 *
 * @returns 可用端口号
 */
export async function getAvailablePort(): Promise<number> {
    try {
        return await invoke<number>('get_available_port');
    } catch (error) {
        logger.error(LogTags.AUTH, '获取可用端口失败', error);
        throw error;
    }
}

/**
 * 构建 redirect_uri
 *
 * @param port - 端口号
 * @param path - 回调路径
 * @returns 完整的 redirect_uri
 */
export function buildRedirectUri(port: number, path: string = '/callback'): string {
    return `http://localhost:${port}${path}`;
}

/**
 * 预定义的提供商端口配置
 * 保持与原有实现的兼容性
 */
export const PROVIDER_PORT_CONFIG = {
    openai: {
        preferredPort: 1455,
        fallbackPorts: [1456, 1457, 1458, 1459],
        callbackPath: '/auth/callback',
    },
    google: {
        preferredPort: 51121,
        fallbackPorts: [51122, 51123, 51124, 51125],
        callbackPath: '/oauth-callback',
    },
    anthropic: {
        preferredPort: 51121,
        fallbackPorts: [51126, 51127, 51128, 51129],
        callbackPath: '/callback',
    },
    kiro: {
        preferredPort: 9876,
        fallbackPorts: [9877, 9878, 9879, 9880],
        callbackPath: '/oauth/callback',
    },
} as const;

/**
 * 获取提供商的端口配置
 *
 * @param providerId - 提供商 ID
 * @returns 端口配置
 */
export function getProviderPortConfig(providerId: string): {
    preferredPort: number;
    fallbackPorts: number[];
    callbackPath: string;
} {
    const config = PROVIDER_PORT_CONFIG[providerId as keyof typeof PROVIDER_PORT_CONFIG];
    if (config) {
        return {
            preferredPort: config.preferredPort,
            fallbackPorts: [...config.fallbackPorts],
            callbackPath: config.callbackPath,
        };
    }
    // 默认配置
    return {
        preferredPort: 0, // 动态分配
        fallbackPorts: [],
        callbackPath: '/callback',
    };
}

export default {
    startOAuthCallbackServer,
    checkPortAvailable,
    getAvailablePort,
    buildRedirectUri,
    getProviderPortConfig,
    PROVIDER_PORT_CONFIG,
};
