/**
 * Provider 凭证访问辅助层
 *
 * 职责：
 * - 统一 Provider 凭证读取入口
 * - 统一错误日志格式（避免各页面重复 try/catch）
 * - 在安全存储异常时提供可控 fallback，减少 UI 级联失败
 *
 * @module services/auth/providerCredentialAccess
 */

import { providerCredentialsStorage } from '../storage';
import type { ProviderCredential } from '../../types';
import { logger, LogTags } from '../../utils/logger';

export interface LoadProviderCredentialsSafeOptions {
  context: string;
  fallback?: ProviderCredential[];
  onError?: (message: string, error: unknown) => void;
}

/**
 * 安全加载 Provider 凭证：
 * - 统一错误日志
 * - 支持调用方注入 UI 提示
 * - 失败时返回可控 fallback，避免上层流程被异常中断
 *
 * @example
 * ```typescript
 * const credentials = await loadProviderCredentialsSafe({
 *   context: 'App 启动读取凭证失败',
 *   onError: () => addToast({
 *     type: 'error',
 *     title: '凭证加载失败',
 *     message: '无法读取安全存储',
 *   }),
 *   fallback: [],
 * });
 * ```
 */
export async function loadProviderCredentialsSafe(
  options: LoadProviderCredentialsSafeOptions
): Promise<ProviderCredential[]> {
  const { context, fallback = [], onError } = options;

  try {
    return await providerCredentialsStorage.load();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(LogTags.AUTH, `${context}: ${message}`, error);
    onError?.(message, error);
    return fallback;
  }
}
