/**
 * OAuth Token 自动续期服务
 *
 * 提供 OAuth Token 的自动刷新功能：
 * - 定时检查所有 OAuth 凭证的过期时间
 * - 在 Token 即将过期前自动刷新
 * - 支持手动触发刷新
 * - 提供 Token 有效性检查
 * - v2.4.3: 优雅降级 - 刷新失败时如果 Token 未过期，继续使用旧 Token
 * - v2.4.3: 重试机制 - 刷新失败时自动重试，支持指数退避
 *
 * 参考 CLIProxyAPIPlus 项目的 RefreshWithGracefulDegradation 和 RefreshWithRetry 实现
 *
 * v3.4.6: 初始版本
 * v2.4.3: 添加优雅降级和重试机制
 *
 * @module services/tokenRefresher
 * @version 2.4.3
 */

import type { ProviderCredential } from '../types';
import { logger, LogTags } from '../utils/logger';
import { refreshAnthropicToken } from './anthropic-oauth';
import { refreshGoogleToken } from './google-oauth';
import { kiroOAuth } from './kiro-oauth';
import { refreshOpenAIToken } from './openai-oauth';
import { providerCredentialsStorage } from './storage';

/**
 * Token 刷新提前量（毫秒）
 * 在 Token 过期前 30 分钟开始刷新（v2.4.4: 从5分钟增加到30分钟）
 */
const REFRESH_BUFFER_MS = 30 * 60 * 1000;

/**
 * 定时检查间隔（毫秒）
 * 每 30 秒检查一次（v2.4.4: 从60秒缩短到30秒）
 */
const CHECK_INTERVAL_MS = 60 * 1000;

/**
 * v2.4.3: 最大重试次数
 * 刷新失败时最多重试 2 次（共 3 次尝试）
 */
const MAX_REFRESH_RETRIES = 2;

/**
 * v2.4.3: 重试基础延迟（毫秒）
 * 使用指数退避：第1次重试等待 1s，第2次等待 2s
 */
const RETRY_BASE_DELAY_MS = 1000;

/**
 * Token 刷新结果
 */
export interface TokenRefreshResult {
    /** 是否成功 */
    success: boolean;
    /** 提供商 ID */
    providerId: string;
    /** 新的过期时间 */
    newExpiresAt?: number;
    /** 错误信息 */
    error?: string;
    /** v2.4.3: 是否使用了降级（旧 Token 仍有效） */
    usedFallback?: boolean;
    /** v0.9.2: 是否需要重新认证（不可恢复的错误，凭证已被自动删除） */
    needsReauth?: boolean;
}

/**
 * Token 刷新回调
 */
export type TokenRefreshCallback = (result: TokenRefreshResult) => void;

/**
 * Token 自动续期服务
 */
class TokenRefresherService {
    /** 定时器 ID */
    private intervalId: ReturnType<typeof setInterval> | null = null;

    /** 是否正在运行 */
    private isRunning = false;

    /** 刷新回调列表 */
    private callbacks: TokenRefreshCallback[] = [];

    /** 正在刷新的提供商（防止重复刷新） */
    private refreshingProviders = new Set<string>();

    /**
     * 启动自动续期服务
     *
     * @param callback - 刷新结果回调（可选）
     */
    start(callback?: TokenRefreshCallback): void {
        if (this.isRunning) {
            logger.warn(LogTags.AUTH, 'Token 自动续期服务已在运行');
            return;
        }

        if (callback) {
            this.callbacks.push(callback);
        }

        logger.info(LogTags.AUTH, '启动 Token 自动续期服务', {
            checkInterval: CHECK_INTERVAL_MS / 1000 + 's',
            refreshBuffer: REFRESH_BUFFER_MS / 1000 + 's',
        });

        this.isRunning = true;

        // 立即执行一次检查
        this.checkAndRefresh();

        // 设置定时检查
        this.intervalId = setInterval(() => {
            this.checkAndRefresh();
        }, CHECK_INTERVAL_MS);
    }

    /**
     * 停止自动续期服务
     */
    stop(): void {
        if (!this.isRunning) {
            return;
        }

        logger.info(LogTags.AUTH, '停止 Token 自动续期服务');

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        this.isRunning = false;
        this.callbacks = [];
        this.refreshingProviders.clear();
    }

    /**
     * 添加刷新回调
     *
     * @param callback - 刷新结果回调
     */
    addCallback(callback: TokenRefreshCallback): void {
        this.callbacks.push(callback);
    }

    /**
     * 移除刷新回调
     *
     * @param callback - 要移除的回调
     */
    removeCallback(callback: TokenRefreshCallback): void {
        const index = this.callbacks.indexOf(callback);
        if (index > -1) {
            this.callbacks.splice(index, 1);
        }
    }

    /**
     * 检查并刷新即将过期或已过期的 Token
     *
     * v2.4.2: 同时处理已过期的 Token，不仅仅是即将过期的
     * 这样可以在应用运行期间自动恢复过期的 Token
     */
    async checkAndRefresh(): Promise<void> {
        try {
            const credentials = await providerCredentialsStorage.load();
            const now = Date.now();

            for (const credential of credentials) {
                // 只处理 OAuth 类型的凭证
                if (credential.type !== 'oauth') {
                    continue;
                }

                // 检查是否有 refreshToken 和 expiresAt
                if (!credential.refreshToken || !credential.expiresAt) {
                    continue;
                }

                // v2.4.2: 检查是否已过期或即将过期（在缓冲时间内）
                const timeUntilExpiry = credential.expiresAt - now;
                const isExpired = timeUntilExpiry <= 0;
                const isAboutToExpire = timeUntilExpiry > 0 && timeUntilExpiry <= REFRESH_BUFFER_MS;

                if (isExpired || isAboutToExpire) {
                    logger.info(LogTags.AUTH, isExpired ? 'Token 已过期，尝试刷新' : 'Token 即将过期，开始刷新', {
                        providerId: credential.providerId,
                        expiresIn: Math.round(timeUntilExpiry / 1000) + 's',
                        isExpired,
                    });

                    await this.refreshToken(credential);
                }
            }
        } catch (error) {
            logger.error(LogTags.AUTH, 'Token 检查失败', error);
        }
    }

    /**
     * 刷新指定提供商的 Token
     *
     * v2.4.3: 添加重试机制和优雅降级
     * - 重试：刷新失败时自动重试，支持指数退避
     * - 优雅降级：刷新失败但 Token 未过期时，继续使用旧 Token
     *
     * 参考 CLIProxyAPIPlus 的 RefreshWithGracefulDegradation 和 RefreshWithRetry
     *
     * @param credential - 凭证对象
     * @returns 刷新结果
     */
    async refreshToken(credential: ProviderCredential): Promise<TokenRefreshResult> {
        const { providerId, refreshToken } = credential;

        // 防止重复刷新
        if (this.refreshingProviders.has(providerId)) {
            logger.debug(LogTags.AUTH, 'Token 正在刷新中，跳过', { providerId });
            return { success: false, providerId, error: 'Already refreshing' };
        }

        if (!refreshToken) {
            return { success: false, providerId, error: 'No refresh token' };
        }

        this.refreshingProviders.add(providerId);

        try {
            // v2.4.3: 带重试的刷新
            let result: TokenRefreshResult | null = null;
            let lastError = '';
            const maxAttempts = MAX_REFRESH_RETRIES + 1;

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                // 第 2 次及以后的尝试需要等待（指数退避）
                if (attempt > 1) {
                    const delay = RETRY_BASE_DELAY_MS * (attempt - 1);
                    logger.info(LogTags.AUTH, `Token 刷新重试 ${attempt}/${maxAttempts}，等待 ${delay}ms`, { providerId });
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                const attemptResult = await this.doRefreshToken(credential);

                if (attemptResult.success) {
                    // 刷新成功
                    if (attempt > 1) {
                        logger.info(LogTags.AUTH, `Token 刷新在第 ${attempt} 次尝试时成功`, { providerId });
                    }
                    result = attemptResult;
                    break;
                }

                // v0.9.2: 如果需要重新认证，立即退出重试循环
                if (attemptResult.needsReauth) {
                    logger.warn(LogTags.AUTH, 'Token 需要重新认证，停止重试', { providerId });
                    result = attemptResult;
                    break;
                }

                // 保留最后一次失败的结果（用于优雅降级判断）
                result = attemptResult;
                lastError = attemptResult.error || 'Unknown error';
                logger.warn(LogTags.AUTH, `Token 刷新尝试 ${attempt}/${maxAttempts} 失败`, {
                    providerId,
                    error: lastError,
                });
            }

            // v2.4.3: 优雅降级 - 所有重试都失败时，检查旧 Token 是否仍然有效
            if (!result || !result.success) {
                // v0.9.2: 如果需要重新认证，跳过优雅降级，直接返回失败
                // 凭证已在 doRefreshToken 中被删除
                if (result && result.needsReauth) {
                    logger.error(LogTags.AUTH, 'Token 需要重新认证，已删除失效凭证', {
                        providerId,
                        error: lastError,
                    });
                    this.notifyCallbacks(result);
                    return result;
                }

                const now = Date.now();
                const isTokenStillValid = credential.expiresAt && credential.expiresAt > now;

                if (isTokenStillValid) {
                    // 旧 Token 还没过期，继续使用（优雅降级）
                    const remainingMs = credential.expiresAt! - now;
                    logger.warn(LogTags.AUTH, 'Token 刷新失败，但旧 Token 仍有效，继续使用（优雅降级）', {
                        providerId,
                        remainingTime: Math.round(remainingMs / 1000) + 's',
                        error: lastError,
                    });

                    result = {
                        success: true,
                        providerId,
                        newExpiresAt: credential.expiresAt,
                        usedFallback: true,
                    };
                } else {
                    // Token 已过期且刷新失败
                    result = {
                        success: false,
                        providerId,
                        error: `Token 刷新失败（已重试 ${maxAttempts} 次）: ${lastError}`,
                    };
                }
            }

            // 通知回调
            if (result.success) {
                if (result.usedFallback) {
                    logger.info(LogTags.AUTH, 'Token 使用优雅降级，下次检查时将重试刷新', { providerId });
                } else {
                    logger.info(LogTags.AUTH, 'Token 刷新成功', {
                        providerId,
                        newExpiresAt: result.newExpiresAt,
                    });
                }
            } else {
                logger.error(LogTags.AUTH, 'Token 刷新最终失败', {
                    providerId,
                    error: result.error,
                });
            }

            // v2.4.3: 优雅降级成功时不通知回调（不触发 UI 断开连接）
            if (!result.usedFallback) {
                this.notifyCallbacks(result);
            }
            return result;

        } catch (error) {
            const result: TokenRefreshResult = {
                success: false,
                providerId,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
            logger.error(LogTags.AUTH, 'Token 刷新异常', error);
            this.notifyCallbacks(result);
            return result;

        } finally {
            this.refreshingProviders.delete(providerId);
        }
    }

    /**
     * v2.4.3: 执行单次 Token 刷新（不含重试和降级逻辑）
     *
     * 从 refreshToken 方法中提取出来，供重试机制调用
     *
     * @param credential - 凭证对象
     * @returns 刷新结果
     */
    private async doRefreshToken(credential: ProviderCredential): Promise<TokenRefreshResult> {
        const { providerId, refreshToken } = credential;

        if (!refreshToken) {
            return { success: false, providerId, error: 'No refresh token' };
        }

        switch (providerId) {
            case 'openai': {
                const openaiResult = await refreshOpenAIToken(refreshToken);
                if (openaiResult.type === 'success' && openaiResult.accessToken) {
                    await providerCredentialsStorage.add({
                        ...credential,
                        accessToken: openaiResult.accessToken,
                        refreshToken: openaiResult.refreshToken || refreshToken,
                        expiresAt: openaiResult.expiresAt,
                        updatedAt: new Date(),
                    });
                    return { success: true, providerId, newExpiresAt: openaiResult.expiresAt };
                }
                return { success: false, providerId, error: openaiResult.error || 'OpenAI token refresh failed' };
            }

            case 'google': {
                const googleResult = await refreshGoogleToken(refreshToken);
                if (googleResult.type === 'success' && googleResult.accessToken) {
                    await providerCredentialsStorage.add({
                        ...credential,
                        accessToken: googleResult.accessToken,
                        refreshToken: googleResult.refreshToken || refreshToken,
                        expiresAt: googleResult.expiresAt,
                        updatedAt: new Date(),
                    });
                    return { success: true, providerId, newExpiresAt: googleResult.expiresAt };
                }
                return { success: false, providerId, error: googleResult.error || 'Google token refresh failed' };
            }

            case 'anthropic': {
                const anthropicResult = await refreshAnthropicToken(refreshToken);
                if (anthropicResult.type === 'success' && anthropicResult.accessToken) {
                    await providerCredentialsStorage.add({
                        ...credential,
                        accessToken: anthropicResult.accessToken,
                        refreshToken: anthropicResult.refreshToken || refreshToken,
                        expiresAt: anthropicResult.expiresAt,
                        updatedAt: new Date(),
                    });
                    return { success: true, providerId, newExpiresAt: anthropicResult.expiresAt };
                }
                return { success: false, providerId, error: 'Anthropic token refresh failed' };
            }

            // v0.9.0: Kiro Token 刷新
            // v0.9.1: 传递持久化的客户端注册信息，解决重启后无法刷新的问题
            // v0.9.2: 识别不可恢复错误，自动删除失效凭证
            case 'kiro': {
                const kiroResult = await kiroOAuth.refreshToken(
                    refreshToken,
                    credential.kiroClientId,
                    credential.kiroClientSecret,
                    credential.kiroSsoRegion
                );
                if (kiroResult.success && kiroResult.accessToken) {
                    await providerCredentialsStorage.add({
                        ...credential,
                        accessToken: kiroResult.accessToken,
                        refreshToken: kiroResult.refreshToken || refreshToken,
                        expiresAt: kiroResult.expiresAt,
                        updatedAt: new Date(),
                    });
                    return { success: true, providerId, newExpiresAt: kiroResult.expiresAt };
                }

                // v0.9.2: 如果需要重新认证，自动删除失效凭证
                if (kiroResult.needsReauth) {
                    logger.warn(LogTags.AUTH, 'Kiro Token 不可恢复，删除失效凭证', { providerId });
                    await providerCredentialsStorage.remove(providerId);
                    return {
                        success: false,
                        providerId,
                        error: kiroResult.error || 'Kiro token refresh failed',
                        needsReauth: true,
                    };
                }

                return { success: false, providerId, error: kiroResult.error || 'Kiro token refresh failed' };
            }

            default:
                return { success: false, providerId, error: `Unsupported provider: ${providerId}` };
        }
    }

    /**
     * 手动刷新指定提供商的 Token
     *
     * @param providerId - 提供商 ID
     * @returns 刷新结果
     */
    async refreshByProviderId(providerId: string): Promise<TokenRefreshResult> {
        const credential = await providerCredentialsStorage.get(providerId);
        if (!credential) {
            return { success: false, providerId, error: 'Credential not found' };
        }

        if (credential.type !== 'oauth') {
            return { success: false, providerId, error: 'Not an OAuth credential' };
        }

        return this.refreshToken(credential);
    }

    /**
     * 检查 Token 是否有效
     *
     * @param providerId - 提供商 ID
     * @returns 是否有效
     */
    async isTokenValid(providerId: string): Promise<boolean> {
        const credential = await providerCredentialsStorage.get(providerId);
        if (!credential) {
            return false;
        }

        // API Key 类型始终有效（除非被撤销）
        if (credential.type === 'api') {
            return !!credential.apiKey;
        }

        // OAuth 类型检查过期时间
        if (credential.type === 'oauth') {
            if (!credential.accessToken) {
                return false;
            }
            if (credential.expiresAt) {
                return credential.expiresAt > Date.now();
            }
            // 没有过期时间，假设有效
            return true;
        }

        return false;
    }

    /**
     * 获取 Token 剩余有效时间（毫秒）
     *
     * @param providerId - 提供商 ID
     * @returns 剩余时间（毫秒），-1 表示无过期时间，0 表示已过期或不存在
     */
    async getTokenTTL(providerId: string): Promise<number> {
        const credential = await providerCredentialsStorage.get(providerId);
        if (!credential || credential.type !== 'oauth') {
            return 0;
        }

        if (!credential.expiresAt) {
            return -1;  // 无过期时间
        }

        const ttl = credential.expiresAt - Date.now();
        return ttl > 0 ? ttl : 0;
    }

    /**
     * 确保 Token 有效（如果即将过期则刷新）
     *
     * 在 API 调用前使用此方法确保 Token 有效
     *
     * @param providerId - 提供商 ID
     * @returns 是否有效
     */
    async ensureTokenValid(providerId: string): Promise<boolean> {
        const credential = await providerCredentialsStorage.get(providerId);
        if (!credential) {
            return false;
        }

        // API Key 类型直接返回
        if (credential.type === 'api') {
            return !!credential.apiKey;
        }

        // OAuth 类型检查是否需要刷新
        if (credential.type === 'oauth') {
            if (!credential.accessToken) {
                return false;
            }

            // 检查是否即将过期
            if (credential.expiresAt && credential.refreshToken) {
                const timeUntilExpiry = credential.expiresAt - Date.now();
                if (timeUntilExpiry <= REFRESH_BUFFER_MS) {
                    // 尝试刷新
                    const result = await this.refreshToken(credential);
                    return result.success;
                }
            }

            // Token 仍然有效
            if (credential.expiresAt) {
                return credential.expiresAt > Date.now();
            }

            return true;
        }

        return false;
    }

    /**
     * 通知所有回调
     */
    private notifyCallbacks(result: TokenRefreshResult): void {
        for (const callback of this.callbacks) {
            try {
                callback(result);
            } catch (error) {
                logger.error(LogTags.AUTH, 'Token 刷新回调执行失败', error);
            }
        }
    }

    /**
     * 获取服务状态
     */
    getStatus(): { isRunning: boolean; refreshingProviders: string[] } {
        return {
            isRunning: this.isRunning,
            refreshingProviders: Array.from(this.refreshingProviders),
        };
    }
}

/**
 * 导出单例实例
 */
export const tokenRefresher = new TokenRefresherService();

export default tokenRefresher;
