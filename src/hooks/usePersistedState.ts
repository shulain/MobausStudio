/**
 * 统一持久化状态管理 Hook
 *
 * 解决 App.tsx 中分散的 useState + useEffect + save 模式，提供：
 * - 变更队列 + 批量刷新机制
 * - 支持防抖模式（高频数据）和立即保存模式（关键配置）
 * - 使用 STORAGE_DEBOUNCE_DELAY 常量
 * - 组件卸载时自动保存待保存数据
 *
 * @module hooks/usePersistedState
 * @version 1.0.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { STORAGE_DEBOUNCE_DELAY } from '../config/constants';
import { logger, LogTags } from '../utils/logger';

// ==================== 类型定义 ====================

/**
 * 存储适配器接口
 * 与现有 storage 服务（modelsStorage, chatsStorage 等）兼容
 */
export interface StorageAdapter<T> {
  /** 加载数据 */
  load: () => Promise<T[]>;
  /** 保存数据 */
  save: (items: T[]) => Promise<void>;
}

/**
 * Hook 配置选项
 *
 * @param storage - 存储适配器实例
 * @param initialValue - 加载前使用的初始值
 * @param immediate - 是否立即保存（不使用防抖），默认 false
 * @param debounceDelay - 自定义防抖延迟（毫秒），默认 STORAGE_DEBOUNCE_DELAY
 * @param transform - 加载后数据变换函数（如重置 MCP 服务器连接状态）
 */
export interface UsePersistedStateOptions<T> {
  storage: StorageAdapter<T>;
  initialValue: T[];
  immediate?: boolean;
  debounceDelay?: number;
  transform?: (raw: T[]) => T[];
}

/**
 * Hook 返回值
 *
 * @param data - 当前数据
 * @param setData - 设置数据（会触发持久化）
 * @param loading - 是否正在加载
 * @param loaded - 是否已加载完成
 * @param flush - 手动触发立即保存
 */
export interface UsePersistedStateReturn<T> {
  data: T[];
  setData: React.Dispatch<React.SetStateAction<T[]>>;
  loading: boolean;
  loaded: boolean;
  flush: () => Promise<void>;
}

// ==================== Hook 实现 ====================

/**
 * 统一持久化状态 Hook
 *
 * @example
 * ```tsx
 * // 防抖模式（高频更新数据）
 * const { data: chats, setData: setChats, loaded } = usePersistedState({
 *   storage: chatsStorage,
 *   initialValue: [],
 * });
 *
 * // 立即保存模式（关键配置）
 * const { data: models, setData: setModels } = usePersistedState({
 *   storage: modelsStorage,
 *   initialValue: [],
 *   immediate: true,
 * });
 * ```
 */
export function usePersistedState<T>(
  options: UsePersistedStateOptions<T>,
): UsePersistedStateReturn<T> {
  const {
    storage,
    initialValue,
    immediate = false,
    debounceDelay = STORAGE_DEBOUNCE_DELAY,
    transform,
  } = options;

  const [data, setDataInternal] = useState<T[]>(initialValue);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  // 防抖定时器引用
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 待保存的最新数据（变更队列，只保留最新值）
  const pendingSaveRef = useRef<T[] | null>(null);
  // 是否正在执行保存操作
  const savingRef = useRef(false);
  // 是否已加载完成（ref 版本，用于 setData 闭包）
  const loadedRef = useRef(false);
  // 存储适配器引用（避免闭包问题）
  const storageRef = useRef(storage);
  storageRef.current = storage;
  // transform 函数引用（避免闭包问题）
  const transformRef = useRef(transform);
  transformRef.current = transform;

  /**
   * 执行保存操作
   * 从待保存队列取出最新数据并写入存储
   */
  const executeSave = useCallback(async () => {
    if (pendingSaveRef.current === null || savingRef.current) {
      return;
    }

    const dataToSave = pendingSaveRef.current;
    pendingSaveRef.current = null;
    savingRef.current = true;

    try {
      await storageRef.current.save(dataToSave);
      if (import.meta.env.DEV) {
        logger.debug(LogTags.STORAGE, '持久化保存完成', { count: dataToSave.length });
      }
    } catch (error) {
      logger.error(LogTags.STORAGE, '持久化保存失败', error);
    } finally {
      savingRef.current = false;
      // 如果保存期间又有新数据入队，继续保存
      if (pendingSaveRef.current !== null) {
        executeSave();
      }
    }
  }, []);

  /**
   * 手动立即保存
   * 取消防抖定时器，立即执行保存
   */
  const flush = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await executeSave();
  }, [executeSave]);

  /**
   * 包装的 setState
   * 更新状态同时将数据加入保存队列
   */
  const setData = useCallback<React.Dispatch<React.SetStateAction<T[]>>>(
    (action) => {
      setDataInternal((prev) => {
        const newData = typeof action === 'function'
          ? (action as (prev: T[]) => T[])(prev)
          : action;

        // 只有在数据加载完成后才触发持久化
        if (loadedRef.current) {
          pendingSaveRef.current = newData;

          if (immediate) {
            // 立即保存模式：使用 microtask 确保状态更新后再保存
            // 这样连续多次 setState 在同一个事件循环中也只会保存一次
            queueMicrotask(() => {
              executeSave();
            });
          } else {
            // 防抖模式：取消旧定时器，设置新定时器
            if (saveTimerRef.current) {
              clearTimeout(saveTimerRef.current);
            }
            saveTimerRef.current = setTimeout(() => {
              saveTimerRef.current = null;
              executeSave();
            }, debounceDelay);
          }
        }

        return newData;
      });
    },
    [immediate, debounceDelay, executeSave],
  );

  // 初始加载
  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const rawData = await storage.load();
        if (cancelled) return;

        if (rawData.length > 0) {
          // 如果提供了 transform 函数，对数据进行变换
          const finalData = transformRef.current ? transformRef.current(rawData) : rawData;
          setDataInternal(finalData);
        }
        // rawData 为空时保持 initialValue
      } catch (error) {
        logger.error(LogTags.STORAGE, '持久化加载失败', error);
        // 加载失败保持 initialValue
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoaded(true);
          loadedRef.current = true;
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [storage]);

  // 组件卸载时清理定时器并保存待保存数据
  useEffect(() => {
    return () => {
      // 清理防抖定时器
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      // 卸载时立即保存待保存的数据（fire-and-forget）
      if (pendingSaveRef.current !== null && !savingRef.current) {
        const dataToSave = pendingSaveRef.current;
        pendingSaveRef.current = null;
        storageRef.current.save(dataToSave).catch((err) =>
          logger.error(LogTags.STORAGE, '卸载时保存失败', err),
        );
      }
    };
  }, []);

  return {
    data,
    setData,
    loading,
    loaded,
    flush,
  };
}
