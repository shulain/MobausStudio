/**
 * Auth Runtime 监听注册函数
 *
 * 职责：
 * - 启动 tokenRefresher 自动续期定时器
 * - 注册 token_expired 事件监听器
 *
 * 注意：
 * - tokenRefresher 的刷新结果回调由 useAppBootstrap 中的 addCallback 统一处理
 *   （包含 Toast 通知和 Kiro 特殊逻辑），此处不重复注册回调
 * - token_expired 事件触发后直接刷新并更新 Provider 状态
 *
 * @module services/auth/authRuntime
 * @version 1.1.0
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AIProvider } from '../../types';
import { logger, LogTags } from '../../utils/logger';
import { tokenRefresher } from '../tokenRefresher';
import { applyTokenRefreshResult } from './authProviderState';

// ==================== 类型定义 ====================

/**
 * setProviders 回调函数类型
 */
export type SetProvidersCallback = (updater: (prev: AIProvider[]) => AIProvider[]) => void;

/**
 * 监听注册配置
 */
export interface AuthRuntimeConfig {
  /** setProviders 回调 */
  setProviders: SetProvidersCallback;
}

/**
 * 监听注册返回值
 */
export interface AuthRuntimeCleanup {
  /** 取消 token_expired 监听 */
  unlistenTokenExpired: UnlistenFn | null;
  /** 停止 tokenRefresher */
  stopTokenRefresher: () => void;
}

// ==================== 核心函数 ====================

/**
 * 启动 tokenRefresher 自动续期定时器（不注册回调）
 *
 * 回调由 useAppBootstrap 通过 addCallback 注册，
 * 避免重复注册导致一次刷新触发多次 setProviders。
 *
 * @returns 停止函数
 */
export function startTokenRefresher(): () => void {
  tokenRefresher.start();
  return () => tokenRefresher.stop();
}

/**
 * 注册 token_expired 事件监听器
 *
 * 当后端发送 token_expired 事件时，自动刷新 Token
 *
 * @param config - 配置
 * @returns Promise<UnlistenFn | null>
 */
export async function registerTokenExpiredListener(
  config: AuthRuntimeConfig
): Promise<UnlistenFn | null> {
  const { setProviders } = config;

  try {
    const unlisten = await listen<{ providerId: string; error?: string }>('token_expired', async (event) => {
      const { providerId, error } = event.payload;

      logger.warn(LogTags.AUTH, '收到Token过期事件', { providerId, error });

      // 尝试刷新 Token
      const result = await tokenRefresher.refreshByProviderId(providerId);

      if (result.success) {
        logger.info(LogTags.AUTH, 'Token刷新成功', { providerId });
      } else {
        logger.error(LogTags.AUTH, 'Token刷新失败', { providerId, error: result.error });
      }

      // 使用纯函数更新状态
      setProviders(prev => applyTokenRefreshResult(prev, result));
    });

    return unlisten;
  } catch (err) {
    logger.error(LogTags.AUTH, '监听token_expired事件失败', err);
    return null;
  }
}

/**
 * 注册所有 Auth Runtime 监听器
 *
 * 统一入口，注册 tokenRefresher 回调和 token_expired 监听器
 *
 * @param config - 配置
 * @returns Promise<AuthRuntimeCleanup>
 *
 * @example
 * ```ts
 * const cleanup = await registerAuthRuntime({ setProviders });
 *
 * // 清理
 * cleanup.unlistenTokenExpired?.();
 * cleanup.stopTokenRefresher();
 * ```
 */
export async function registerAuthRuntime(
  config: AuthRuntimeConfig
): Promise<AuthRuntimeCleanup> {
  // 启动 tokenRefresher 定时器（回调由 useAppBootstrap addCallback 注册）
  const stopTokenRefresher = startTokenRefresher();

  // 注册 token_expired 监听器
  const unlistenTokenExpired = await registerTokenExpiredListener(config);

  return {
    unlistenTokenExpired,
    stopTokenRefresher,
  };
}
