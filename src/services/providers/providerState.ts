/**
 * Provider 状态管理纯函数
 *
 * 职责：
 * - Provider 连接/断开状态更新
 * - 模型列表更新
 * - 错误状态管理
 *
 * 特点：
 * - 纯函数，无副作用
 * - 易于测试
 * - 可复用
 *
 * @module services/providers/providerState
 * @version 1.0.0
 */

import type { AIProvider, ProviderModel } from '../../types';

// ==================== 类型定义 ====================

/**
 * Provider 连接结果
 */
export interface ProviderConnectResult {
  status: 'connected' | 'error';
  source?: 'api' | 'oauth' | 'env' | 'config';
  models?: ProviderModel[];
  errorMessage?: string;
}

// ==================== 纯函数 ====================

/**
 * 更新 Provider 连接状态
 *
 * @param providers - Provider 列表
 * @param providerId - Provider ID
 * @param result - 连接结果
 * @returns 更新后的 Provider 列表
 *
 * @example
 * ```ts
 * const updated = updateProviderConnection(providers, 'openai', {
 *   status: 'connected',
 *   source: 'api',
 *   models: [...],
 * });
 * ```
 */
export function updateProviderConnection(
  providers: AIProvider[],
  providerId: string,
  result: ProviderConnectResult
): AIProvider[] {
  return providers.map(p =>
    p.id === providerId
      ? {
          ...p,
          status: result.status,
          source: result.source,
          models: result.models || p.models,
          errorMessage: result.errorMessage,
        }
      : p
  );
}

/**
 * 更新 Provider 断开状态
 *
 * @param providers - Provider 列表
 * @param providerId - Provider ID
 * @returns 更新后的 Provider 列表
 *
 * @example
 * ```ts
 * const updated = updateProviderDisconnection(providers, 'openai');
 * ```
 */
export function updateProviderDisconnection(
  providers: AIProvider[],
  providerId: string
): AIProvider[] {
  return providers.map(p =>
    p.id === providerId
      ? {
          ...p,
          status: 'disconnected' as const,
          source: undefined,
          errorMessage: undefined,
        }
      : p
  );
}

/**
 * 更新 Provider 模型列表
 *
 * @param providers - Provider 列表
 * @param providerId - Provider ID
 * @param models - 新的模型列表
 * @returns 更新后的 Provider 列表
 *
 * @example
 * ```ts
 * const updated = updateProviderModels(providers, 'openai', newModels);
 * ```
 */
export function updateProviderModels(
  providers: AIProvider[],
  providerId: string,
  models: ProviderModel[]
): AIProvider[] {
  return providers.map(p =>
    p.id === providerId
      ? { ...p, models }
      : p
  );
}

/**
 * 更新 Provider 错误状态
 *
 * @param providers - Provider 列表
 * @param providerId - Provider ID
 * @param errorMessage - 错误消息
 * @returns 更新后的 Provider 列表
 *
 * @example
 * ```ts
 * const updated = updateProviderError(providers, 'openai', 'Connection failed');
 * ```
 */
export function updateProviderError(
  providers: AIProvider[],
  providerId: string,
  errorMessage: string
): AIProvider[] {
  return providers.map(p =>
    p.id === providerId
      ? {
          ...p,
          status: 'error' as const,
          errorMessage,
        }
      : p
  );
}

/**
 * 查找 Provider
 *
 * @param providers - Provider 列表
 * @param providerId - Provider ID
 * @returns Provider 或 undefined
 *
 * @example
 * ```ts
 * const provider = findProvider(providers, 'openai');
 * ```
 */
export function findProvider(
  providers: AIProvider[],
  providerId: string
): AIProvider | undefined {
  return providers.find(p => p.id === providerId);
}
