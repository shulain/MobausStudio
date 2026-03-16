/**
 * Auth Provider 状态管理纯函数
 *
 * 职责：
 * - 根据凭证计算 Provider 状态
 * - 合并 Providers 和凭证
 * - 应用 Token 刷新结果
 *
 * 特点：
 * - 纯函数，无副作用
 * - 易于测试
 * - 可复用
 *
 * @module services/auth/authProviderState
 * @version 1.0.0
 */

import type { AIProvider, ProviderCredential } from '../../types';
import { logger, LogTags } from '../../utils/logger';

// ==================== 类型定义 ====================

/**
 * Token 刷新结果
 */
export interface TokenRefreshResult {
  success: boolean;
  providerId: string;
  error?: string;
}

// ==================== 纯函数 ====================

/**
 * 根据凭证计算 Provider 状态
 *
 * @param credential - Provider 凭证
 * @param now - 当前时间戳（毫秒）
 * @returns Provider 状态和来源
 *
 * @example
 * ```ts
 * const result = computeProviderStatusFromCredential(credential, Date.now());
 * // => { status: 'connected', source: 'oauth' }
 * ```
 */
export function computeProviderStatusFromCredential(
  credential: ProviderCredential,
  now: number
): {
  status: 'connected' | 'disconnected';
  source: 'oauth' | 'api';
} {
  // API 认证类型：直接连接
  if (credential.type === 'api') {
    return {
      status: 'connected',
      source: 'api',
    };
  }

  // OAuth 类型：检查是否过期
  if (credential.type === 'oauth') {
    const isExpired = credential.expiresAt && credential.expiresAt < now;

    if (isExpired) {
      if (import.meta.env.DEV) {
        logger.warn(LogTags.AUTH, 'OAuth Token 已过期', {
          providerId: credential.providerId,
          expiredAt: credential.expiresAt ? new Date(credential.expiresAt).toISOString() : 'unknown',
        });
      }
    }

    return {
      status: isExpired ? 'disconnected' : 'connected',
      source: 'oauth',
    };
  }

  // 未知类型：断开连接
  return {
    status: 'disconnected',
    source: 'api',
  };
}

/**
 * 合并 Providers 和凭证
 *
 * 根据凭证更新 Provider 的连接状态和来源
 *
 * @param providers - Provider 列表
 * @param credentials - 凭证列表
 * @param now - 当前时间戳（毫秒）
 * @returns 更新后的 Provider 列表
 *
 * @example
 * ```ts
 * const updated = mergeProvidersWithCredentials(providers, credentials, Date.now());
 * ```
 */
export function mergeProvidersWithCredentials(
  providers: AIProvider[],
  credentials: ProviderCredential[],
  now: number
): AIProvider[] {
  return providers.map(provider => {
    const credential = credentials.find(c => c.providerId === provider.id);

    if (!credential) {
      // 没有凭证：保持原状态
      return provider;
    }

    // 计算状态
    const { status, source } = computeProviderStatusFromCredential(credential, now);

    return {
      ...provider,
      status,
      source,
    };
  });
}

/**
 * 应用 Token 刷新结果到 Providers
 *
 * @param providers - Provider 列表
 * @param result - Token 刷新结果
 * @returns 更新后的 Provider 列表
 *
 * @example
 * ```ts
 * const updated = applyTokenRefreshResult(providers, {
 *   success: true,
 *   providerId: 'openai',
 * });
 * ```
 */
export function applyTokenRefreshResult(
  providers: AIProvider[],
  result: TokenRefreshResult
): AIProvider[] {
  return providers.map(p =>
    p.id === result.providerId
      ? { ...p, status: result.success ? 'connected' as const : 'disconnected' as const }
      : p
  );
}

/**
 * 过滤出已过期的 OAuth 凭证
 *
 * @param credentials - 凭证列表
 * @param now - 当前时间戳（毫秒）
 * @returns 已过期且有 refreshToken 的 OAuth 凭证列表
 *
 * @example
 * ```ts
 * const expired = filterExpiredOAuthCredentials(credentials, Date.now());
 * ```
 */
export function filterExpiredOAuthCredentials(
  credentials: ProviderCredential[],
  now: number
): ProviderCredential[] {
  return credentials.filter(c =>
    c.type === 'oauth'
    && c.expiresAt
    && c.expiresAt < now
    && c.refreshToken
  );
}

/**
 * 过滤出 OAuth 类型的凭证
 *
 * @param credentials - 凭证列表
 * @returns OAuth 凭证列表
 *
 * @example
 * ```ts
 * const oauthCreds = filterOAuthCredentials(credentials);
 * ```
 */
export function filterOAuthCredentials(
  credentials: ProviderCredential[]
): ProviderCredential[] {
  return credentials.filter(c => c.type === 'oauth');
}

/**
 * 更新单个 Provider 的状态
 *
 * @param providers - Provider 列表
 * @param providerId - Provider ID
 * @param status - 新状态
 * @returns 更新后的 Provider 列表
 *
 * @example
 * ```ts
 * const updated = updateProviderStatus(providers, 'openai', 'disconnected');
 * ```
 */
export function updateProviderStatus(
  providers: AIProvider[],
  providerId: string,
  status: 'connected' | 'disconnected'
): AIProvider[] {
  return providers.map(p =>
    p.id === providerId
      ? { ...p, status }
      : p
  );
}
