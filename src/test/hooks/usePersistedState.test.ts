/**
 * @file usePersistedState.test.ts
 * @description usePersistedState Hook 单元测试
 *
 * 测试用例对应文档: docs/modules/settings.md
 * - TC-PERSIST-001: 初始加载成功
 * - TC-PERSIST-002: 初始加载为空
 * - TC-PERSIST-003: 初始加载失败
 * - TC-PERSIST-004: 立即保存模式
 * - TC-PERSIST-005: 防抖保存 - 延迟未到不触发
 * - TC-PERSIST-006: 防抖保存 - 延迟到达后触发
 * - TC-PERSIST-007: 防抖合并 - 多次 setData 只保存一次
 * - TC-PERSIST-008: 加载前不触发保存
 * - TC-PERSIST-009: flush 手动保存
 * - TC-PERSIST-010: 卸载时保存待保存数据
 * - TC-PERSIST-011: transform 数据变换
 * - TC-PERSIST-012: 并发保存防护
 *
 * @version 1.0.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePersistedState, type StorageAdapter } from '../../hooks/usePersistedState';

// 模拟 logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  LogTags: {
    STORAGE: '[Storage]',
  },
}));

// 模拟 constants
vi.mock('../../config/constants', () => ({
  STORAGE_DEBOUNCE_DELAY: 1000,
}));

// ==================== 测试辅助 ====================

/** 创建模拟存储适配器 */
function createMockStorage<T>(initialData: T[] = []): StorageAdapter<T> & {
  load: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
} {
  return {
    load: vi.fn().mockResolvedValue(initialData),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

/** 测试用数据项类型 */
interface TestItem {
  id: string;
  name: string;
}

// ==================== 测试用例 ====================

describe('usePersistedState Hook 测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // shouldAdvanceTime: true 让 fake timers 自动推进，
    // 避免 waitFor 内部的真实定时器被阻塞导致超时
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==================== TC-PERSIST-001 ====================
  it('TC-PERSIST-001: 初始加载成功 - storage.load 返回数据后更新 data', async () => {
    const mockData: TestItem[] = [
      { id: '1', name: '测试项1' },
      { id: '2', name: '测试项2' },
    ];
    const storage = createMockStorage(mockData);

    const { result } = renderHook(() =>
      usePersistedState({
        storage,
        initialValue: [],
      }),
    );

    // 初始状态：loading=true, loaded=false, data=initialValue
    expect(result.current.loading).toBe(true);
    expect(result.current.loaded).toBe(false);
    expect(result.current.data).toEqual([]);

    // 等待加载完成
    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(mockData);
    expect(storage.load).toHaveBeenCalledTimes(1);
  });

  // ==================== TC-PERSIST-002 ====================
  it('TC-PERSIST-002: 初始加载为空 - data 保持 initialValue', async () => {
    const storage = createMockStorage<TestItem>([]);
    const initialValue: TestItem[] = [{ id: 'default', name: '默认项' }];

    const { result } = renderHook(() =>
      usePersistedState({
        storage,
        initialValue,
      }),
    );

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    // 加载为空时保持 initialValue
    expect(result.current.data).toEqual(initialValue);
  });

  // ==================== TC-PERSIST-003 ====================
  it('TC-PERSIST-003: 初始加载失败 - data 保持 initialValue, loaded=true', async () => {
    const storage = createMockStorage<TestItem>();
    storage.load.mockRejectedValue(new Error('加载失败'));

    const initialValue: TestItem[] = [{ id: 'fallback', name: '回退项' }];

    const { result } = renderHook(() =>
      usePersistedState({
        storage,
        initialValue,
      }),
    );

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(initialValue);
  });

  // ==================== TC-PERSIST-004 ====================
  it('TC-PERSIST-004: 立即保存模式 - setData 后立即调用 storage.save', async () => {
    const mockData: TestItem[] = [{ id: '1', name: '初始' }];
    const storage = createMockStorage(mockData);

    const { result } = renderHook(() =>
      usePersistedState({
        storage,
        initialValue: [],
        immediate: true,
      }),
    );

    // 等待加载完成
    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    // 更新数据
    const newData: TestItem[] = [{ id: '1', name: '更新' }];
    act(() => {
      result.current.setData(newData);
    });

    // immediate 模式使用 queueMicrotask，需要 flush
    await vi.waitFor(() => {
      expect(storage.save).toHaveBeenCalledWith(newData);
    });
  });

  // ==================== TC-PERSIST-005 ====================
  it('TC-PERSIST-005: 防抖保存 - 延迟未到时不触发 save', async () => {
    const mockData: TestItem[] = [{ id: '1', name: '初始' }];
    const storage = createMockStorage(mockData);

    const { result } = renderHook(() =>
      usePersistedState({
        storage,
        initialValue: [],
        debounceDelay: 1000,
      }),
    );

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    // 更新数据
    act(() => {
      result.current.setData([{ id: '1', name: '更新' }]);
    });

    // 前进 500ms，不应触发保存
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(storage.save).not.toHaveBeenCalled();
  });

  // ==================== TC-PERSIST-006 ====================
  it('TC-PERSIST-006: 防抖保存 - 延迟到达后触发 save', async () => {
    const mockData: TestItem[] = [{ id: '1', name: '初始' }];
    const storage = createMockStorage(mockData);

    const { result } = renderHook(() =>
      usePersistedState({
        storage,
        initialValue: [],
        debounceDelay: 1000,
      }),
    );

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    const newData: TestItem[] = [{ id: '1', name: '更新' }];
    act(() => {
      result.current.setData(newData);
    });

    // 前进 1000ms，应触发保存
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(storage.save).toHaveBeenCalledWith(newData);
  });

  // ==================== TC-PERSIST-007 ====================
  it('TC-PERSIST-007: 防抖合并 - 1000ms 内多次 setData 只保存最终值', async () => {
    const storage = createMockStorage<TestItem>([{ id: '1', name: '初始' }]);

    const { result } = renderHook(() =>
      usePersistedState({
        storage,
        initialValue: [],
        debounceDelay: 1000,
      }),
    );

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    // 快速连续更新三次
    act(() => {
      result.current.setData([{ id: '1', name: '第一次' }]);
    });
    act(() => {
      result.current.setData([{ id: '1', name: '第二次' }]);
    });
    act(() => {
      result.current.setData([{ id: '1', name: '第三次' }]);
    });

    // 前进 1000ms
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // 应该只保存一次，且是最终值
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage.save).toHaveBeenCalledWith([{ id: '1', name: '第三次' }]);
  });

  // ==================== TC-PERSIST-008 ====================
  it('TC-PERSIST-008: 加载前不触发保存 - loaded=false 时 setData 不调用 save', async () => {
    // 创建一个永远不 resolve 的 load
    const storage = createMockStorage<TestItem>();
    storage.load.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() =>
      usePersistedState({
        storage,
        initialValue: [],
        immediate: true,
      }),
    );

    // 此时 loaded=false
    expect(result.current.loaded).toBe(false);

    // 尝试 setData
    act(() => {
      result.current.setData([{ id: '1', name: '提前更新' }]);
    });

    // 前进足够时间
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // 不应触发保存
    expect(storage.save).not.toHaveBeenCalled();
  });

  // ==================== TC-PERSIST-009 ====================
  it('TC-PERSIST-009: flush 手动保存 - 立即保存并取消防抖定时器', async () => {
    const storage = createMockStorage<TestItem>([{ id: '1', name: '初始' }]);

    const { result } = renderHook(() =>
      usePersistedState({
        storage,
        initialValue: [],
        debounceDelay: 1000,
      }),
    );

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    const newData: TestItem[] = [{ id: '1', name: '手动保存' }];
    act(() => {
      result.current.setData(newData);
    });

    // 不等防抖，直接 flush
    await act(async () => {
      await result.current.flush();
    });

    expect(storage.save).toHaveBeenCalledWith(newData);

    // 继续前进 1000ms，不应再次触发保存
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(storage.save).toHaveBeenCalledTimes(1);
  });

  // ==================== TC-PERSIST-010 ====================
  it('TC-PERSIST-010: 卸载时保存待保存数据', async () => {
    const storage = createMockStorage<TestItem>([{ id: '1', name: '初始' }]);

    const { result, unmount } = renderHook(() =>
      usePersistedState({
        storage,
        initialValue: [],
        debounceDelay: 1000,
      }),
    );

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    const newData: TestItem[] = [{ id: '1', name: '待保存' }];
    act(() => {
      result.current.setData(newData);
    });

    // 不等防抖直接卸载
    unmount();

    // 卸载时应触发保存
    expect(storage.save).toHaveBeenCalledWith(newData);
  });

  // ==================== TC-PERSIST-011 ====================
  it('TC-PERSIST-011: transform 数据变换 - 加载后数据经过变换', async () => {
    const rawData: TestItem[] = [
      { id: '1', name: '原始1' },
      { id: '2', name: '原始2' },
    ];
    const storage = createMockStorage(rawData);

    // transform: 给每个 name 加前缀
    const transform = (data: TestItem[]) =>
      data.map((item) => ({ ...item, name: `[已变换]${item.name}` }));

    const { result } = renderHook(() =>
      usePersistedState({
        storage,
        initialValue: [],
        transform,
      }),
    );

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    expect(result.current.data).toEqual([
      { id: '1', name: '[已变换]原始1' },
      { id: '2', name: '[已变换]原始2' },
    ]);
  });

  // ==================== TC-PERSIST-012 ====================
  it('TC-PERSIST-012: 并发保存防护 - 保存期间的新数据排队等待', async () => {
    const storage = createMockStorage<TestItem>([{ id: '1', name: '初始' }]);

    // 模拟慢速保存
    let saveResolve: (() => void) | null = null;
    storage.save.mockImplementation(() => new Promise<void>((resolve) => {
      saveResolve = resolve;
    }));

    const { result } = renderHook(() =>
      usePersistedState({
        storage,
        initialValue: [],
        immediate: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });

    // 第一次更新
    act(() => {
      result.current.setData([{ id: '1', name: '第一次' }]);
    });

    // 等待 microtask 触发 executeSave
    await vi.waitFor(() => {
      expect(storage.save).toHaveBeenCalledTimes(1);
    });

    // 第一次保存还在进行中，再次更新
    act(() => {
      result.current.setData([{ id: '1', name: '第二次' }]);
    });

    // 此时不应有第二次 save 调用（因为第一次还没完成）
    // microtask 被调度但 executeSave 内部 savingRef 阻止了执行
    await act(async () => {
      // 让 microtask 执行
      await Promise.resolve();
    });

    // 完成第一次保存
    act(() => {
      saveResolve!();
    });

    // 第一次保存完成后，应该自动触发第二次保存
    await vi.waitFor(() => {
      expect(storage.save).toHaveBeenCalledTimes(2);
    });

    expect(storage.save).toHaveBeenLastCalledWith([{ id: '1', name: '第二次' }]);
  });
});
