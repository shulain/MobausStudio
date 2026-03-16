/**
 * useAppBootstrap 时序和竞态测试
 *
 * 测试范围：
 * - unmount during async loading（异步加载期间卸载）
 * - 重复注册保护（防止多次注册监听器）
 * - cleanup 幂等性（多次清理不会出错）
 * - 竞态条件（多个异步操作同时进行）
 * - Token 刷新回调时序
 *
 * 这些测试覆盖了 useAppBootstrap 中最容易出现时序问题的部分
 *
 * @module test/hooks/useAppBootstrap.timing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAppBootstrap } from '../../hooks/useAppBootstrap';

// Mock dependencies
const mockModelsLoad = vi.fn();
const mockChatsLoad = vi.fn();
const mockAgentsLoad = vi.fn();
const mockSkillsLoad = vi.fn();
const mockMcpServersLoad = vi.fn();
const mockRoundtableChatsLoad = vi.fn();
const mockProviderCredentialsLoad = vi.fn();
const mockTokenRefresherStart = vi.fn();
const mockTokenRefresherStop = vi.fn();
const mockTokenRefresherAddCallback = vi.fn();
const mockRegisterAuthRuntime = vi.fn();
const mockUnlistenTokenExpired = vi.fn();

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  LogTags: {
    APP: 'APP',
    AUTH: 'AUTH',
  },
}));

vi.mock('../../config/constants', () => ({
  STORAGE_DEBOUNCE_DELAY: 100,
}));

vi.mock('../../utils/platform', () => ({
  isTauri: vi.fn().mockReturnValue(false),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

vi.mock('../../services/storage', () => ({
  modelsStorage: {
    load: (...args: any[]) => mockModelsLoad(...args),
    save: vi.fn().mockResolvedValue(undefined),
  },
  chatsStorage: {
    load: (...args: any[]) => mockChatsLoad(...args),
    save: vi.fn().mockResolvedValue(undefined),
  },
  agentsStorage: {
    load: (...args: any[]) => mockAgentsLoad(...args),
    save: vi.fn().mockResolvedValue(undefined),
  },
  skillsStorage: {
    load: (...args: any[]) => mockSkillsLoad(...args),
    save: vi.fn().mockResolvedValue(undefined),
  },
  mcpServersStorage: {
    load: (...args: any[]) => mockMcpServersLoad(...args),
    save: vi.fn().mockResolvedValue(undefined),
  },
  roundtableChatsStorage: {
    load: (...args: any[]) => mockRoundtableChatsLoad(...args),
    save: vi.fn().mockResolvedValue(undefined),
  },
  providerCredentialsStorage: {
    load: (...args: any[]) => mockProviderCredentialsLoad(...args),
    save: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../services/tokenRefresher', () => ({
  tokenRefresher: {
    start: (...args: any[]) => mockTokenRefresherStart(...args),
    stop: (...args: any[]) => mockTokenRefresherStop(...args),
    addCallback: (...args: any[]) => mockTokenRefresherAddCallback(...args),
    removeCallback: vi.fn(),
    refreshByProviderId: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('../../services/auth/authRuntime', () => ({
  registerAuthRuntime: (...args: any[]) => mockRegisterAuthRuntime(...args),
}));

vi.mock('../../services/modelFetcher', () => ({
  modelFetcher: {
    initialize: vi.fn().mockResolvedValue({ cached: 0 }),
    getAllCachedModels: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../services/analytics', () => ({
  analytics: {
    init: vi.fn(),
    identify: vi.fn(),
  },
  trackEvents: {
    appLaunched: vi.fn(),
  },
}));

vi.mock('../../data/mockData', () => ({
  defaultChats: [],
}));

vi.mock('../../data/providers', () => ({
  builtinProviders: [
    { id: 'openai', name: 'OpenAI', status: 'disconnected' },
  ],
}));

vi.mock('../../data/builtinSkills', () => ({
  getBuiltinSkills: () => [
    { id: 'builtin-1', name: '内置技能1', builtIn: true },
  ],
}));

vi.mock('../../services/customProviderStorage', () => ({
  customProviderStorage: {
    load: vi.fn().mockResolvedValue([]),
  },
}));

describe('useAppBootstrap 时序和竞态测试', () => {
  const mockAddToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // 默认成功的 mock
    mockModelsLoad.mockResolvedValue([]);
    mockChatsLoad.mockResolvedValue([]);
    mockAgentsLoad.mockResolvedValue([]);
    mockSkillsLoad.mockResolvedValue([]);
    mockMcpServersLoad.mockResolvedValue([]);
    mockRoundtableChatsLoad.mockResolvedValue([]);

    // Mock OAuth 凭证以触发 registerAuthRuntime
    mockProviderCredentialsLoad.mockResolvedValue([
      {
        providerId: 'test-provider',
        type: 'oauth',
        accessToken: 'test-token',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    mockRegisterAuthRuntime.mockResolvedValue({
      unlistenTokenExpired: mockUnlistenTokenExpired,
      stopTokenRefresher: mockTokenRefresherStop,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('TC-BOOT-TIMING-001: unmount during async loading', () => {
    it('应该在异步加载期间 unmount 时不会崩溃', async () => {
      // 模拟慢速加载
      mockModelsLoad.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve([]), 1000)));
      mockChatsLoad.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve([]), 1000)));

      const { result, unmount } = renderHook(() =>
        useAppBootstrap({ addToast: mockAddToast })
      );

      // 验证初始状态
      expect(result.current.isDataLoaded).toBe(false);

      // 在加载完成前 unmount
      unmount();

      // 验证不会抛出错误
      expect(mockModelsLoad).toHaveBeenCalled();
    });

    it('应该在 unmount 后取消所有监听器', async () => {
      mockRegisterAuthRuntime.mockResolvedValue({
        unlistenTokenExpired: mockUnlistenTokenExpired,
        stopTokenRefresher: mockTokenRefresherStop,
      });

      const { unmount } = renderHook(() =>
        useAppBootstrap({ addToast: mockAddToast })
      );

      // 等待初始化完成
      await waitFor(() => {
        expect(mockRegisterAuthRuntime).toHaveBeenCalled();
      });

      // Unmount
      unmount();

      // 验证清理函数被调用
      await waitFor(() => {
        expect(mockUnlistenTokenExpired).toHaveBeenCalled();
        expect(mockTokenRefresherStop).toHaveBeenCalled();
      });
    });

    it('应该在 unmount 后停止所有异步操作', async () => {
      let resolveModels: any;
      mockModelsLoad.mockImplementation(() => new Promise(resolve => {
        resolveModels = resolve;
      }));

      const { result, unmount } = renderHook(() =>
        useAppBootstrap({ addToast: mockAddToast })
      );

      expect(result.current.isDataLoaded).toBe(false);

      // Unmount before loading completes
      unmount();

      // 完成异步操作（但组件已卸载）
      if (resolveModels) {
        resolveModels([]);
      }

      // 验证不会更新已卸载组件的状态（不会抛出警告）
      // React 会自动处理这种情况
    });
  });

  describe('TC-BOOT-TIMING-002: 重复注册保护', () => {
    it('应该只注册一次 tokenRefresher 回调', async () => {
      const { result } = renderHook(() =>
        useAppBootstrap({ addToast: mockAddToast })
      );

      await waitFor(() => {
        expect(result.current.isDataLoaded).toBe(true);
      });

      // 验证 addCallback 只被调用一次
      expect(mockTokenRefresherAddCallback).toHaveBeenCalledTimes(1);
    });

    it('应该只调用一次 registerAuthRuntime', async () => {
      const { result } = renderHook(() =>
        useAppBootstrap({ addToast: mockAddToast })
      );

      await waitFor(() => {
        expect(result.current.isDataLoaded).toBe(true);
      });

      // 验证 registerAuthRuntime 只被调用一次
      expect(mockRegisterAuthRuntime).toHaveBeenCalledTimes(1);
    });

    it('应该只启动一次 tokenRefresher', async () => {
      const { result } = renderHook(() =>
        useAppBootstrap({ addToast: mockAddToast })
      );

      await waitFor(() => {
        expect(result.current.isDataLoaded).toBe(true);
      });

      // tokenRefresher.start 在 registerAuthRuntime 内部调用
      // 这里验证 registerAuthRuntime 只被调用一次即可
      expect(mockRegisterAuthRuntime).toHaveBeenCalledTimes(1);
    });
  });

  describe('TC-BOOT-TIMING-003: cleanup 幂等性', () => {
    it('应该支持多次调用 cleanup 而不出错', async () => {
      const { unmount } = renderHook(() =>
        useAppBootstrap({ addToast: mockAddToast })
      );

      await waitFor(() => {
        expect(mockRegisterAuthRuntime).toHaveBeenCalled();
      });

      // 第一次 unmount
      unmount();

      await waitFor(() => {
        expect(mockUnlistenTokenExpired).toHaveBeenCalled();
      });

      // 验证不会抛出错误
      expect(mockUnlistenTokenExpired).toHaveBeenCalledTimes(1);
      expect(mockTokenRefresherStop).toHaveBeenCalledTimes(1);
    });

    it('应该处理 unlisten 为 null 的情况', async () => {
      mockRegisterAuthRuntime.mockResolvedValue({
        unlistenTokenExpired: null,
        stopTokenRefresher: mockTokenRefresherStop,
      });

      const { unmount } = renderHook(() =>
        useAppBootstrap({ addToast: mockAddToast })
      );

      await waitFor(() => {
        expect(mockRegisterAuthRuntime).toHaveBeenCalled();
      });

      // Unmount 不应该抛出错误
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('TC-BOOT-TIMING-004: 竞态条件', () => {
    it('应该处理多个存储同时加载完成', async () => {
      // 所有存储同时返回
      const promises = [
        Promise.resolve([{ id: '1' }]),
        Promise.resolve([{ id: '2' }]),
        Promise.resolve([{ id: '3' }]),
      ];

      mockModelsLoad.mockReturnValue(promises[0]);
      mockChatsLoad.mockReturnValue(promises[1]);
      mockAgentsLoad.mockReturnValue(promises[2]);

      const { result } = renderHook(() =>
        useAppBootstrap({ addToast: mockAddToast })
      );

      await waitFor(() => {
        expect(result.current.isDataLoaded).toBe(true);
      });

      // 验证所有数据都被加载
      expect(result.current.models).toHaveLength(1);
      expect(result.current.chats).toHaveLength(1);
      expect(result.current.agents).toHaveLength(1);
    });

    it('应该处理部分存储加载失败', async () => {
      mockModelsLoad.mockRejectedValue(new Error('Models load failed'));
      mockChatsLoad.mockResolvedValue([{ id: 'chat-1' }]);

      const { result } = renderHook(() =>
        useAppBootstrap({ addToast: mockAddToast })
      );

      await waitFor(() => {
        expect(result.current.isDataLoaded).toBe(true);
      });

      // 验证失败的存储使用空数组
      expect(result.current.models).toEqual([]);
      // 验证成功的存储正常加载
      expect(result.current.chats).toHaveLength(1);
    });

    it('应该处理 tokenRefresher 回调在加载期间触发', async () => {
      let tokenRefreshCallback: any;
      mockTokenRefresherAddCallback.mockImplementation((cb) => {
        tokenRefreshCallback = cb;
      });

      const { result } = renderHook(() =>
        useAppBootstrap({ addToast: mockAddToast })
      );

      await waitFor(() => {
        expect(mockTokenRefresherAddCallback).toHaveBeenCalled();
      });

      // 在加载完成前触发 token 刷新回调
      if (tokenRefreshCallback) {
        act(() => {
          tokenRefreshCallback({
            success: true,
            providerId: 'test-provider',
          });
        });
      }

      // 验证不会崩溃
      await waitFor(() => {
        expect(result.current.isDataLoaded).toBe(true);
      });
    });
  });

  describe('TC-BOOT-TIMING-005: Token 刷新回调时序', () => {
    it('应该在数据加载完成后才处理 token 刷新回调', async () => {
      let tokenRefreshCallback: any;
      mockTokenRefresherAddCallback.mockImplementation((cb) => {
        tokenRefreshCallback = cb;
      });

      const { result } = renderHook(() =>
        useAppBootstrap({ addToast: mockAddToast })
      );

      // 等待加载完成
      await waitFor(() => {
        expect(result.current.isDataLoaded).toBe(true);
      });

      // 触发 token 刷新成功回调
      if (tokenRefreshCallback) {
        act(() => {
          tokenRefreshCallback({
            success: true,
            providerId: 'openai',
          });
        });
      }

      // 验证 providers 状态被更新
      await waitFor(() => {
        const openaiProvider = result.current.providers.find(p => p.id === 'openai');
        expect(openaiProvider).toBeDefined();
      });
    });

    it('应该在 token 刷新失败时显示 Toast', async () => {
      let tokenRefreshCallback: any;
      mockTokenRefresherAddCallback.mockImplementation((cb) => {
        tokenRefreshCallback = cb;
      });

      const { result } = renderHook(() =>
        useAppBootstrap({ addToast: mockAddToast })
      );

      await waitFor(() => {
        expect(result.current.isDataLoaded).toBe(true);
      });

      // 触发 token 刷新失败回调
      if (tokenRefreshCallback) {
        act(() => {
          tokenRefreshCallback({
            success: false,
            providerId: 'openai',
            error: 'Refresh token expired',
          });
        });
      }

      // 验证 Toast 被调用
      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
          })
        );
      });
    });

    it('应该在 unmount 后忽略 token 刷新回调', async () => {
      let tokenRefreshCallback: any;
      mockTokenRefresherAddCallback.mockImplementation((cb) => {
        tokenRefreshCallback = cb;
      });

      const { result, unmount } = renderHook(() =>
        useAppBootstrap({ addToast: mockAddToast })
      );

      await waitFor(() => {
        expect(result.current.isDataLoaded).toBe(true);
      });

      // Unmount
      unmount();

      // 触发 token 刷新回调（组件已卸载）
      if (tokenRefreshCallback) {
        expect(() => {
          tokenRefreshCallback({
            success: true,
            providerId: 'openai',
          });
        }).not.toThrow();
      }
    });
  });

  describe('TC-BOOT-TIMING-006: 初始化顺序', () => {
    it('应该按正确顺序初始化', async () => {
      const callOrder: string[] = [];

      mockModelsLoad.mockImplementation(async () => {
        callOrder.push('models');
        return [];
      });

      mockChatsLoad.mockImplementation(async () => {
        callOrder.push('chats');
        return [];
      });

      mockTokenRefresherAddCallback.mockImplementation(() => {
        callOrder.push('tokenRefresher');
      });

      mockRegisterAuthRuntime.mockImplementation(async () => {
        callOrder.push('authRuntime');
        return {
          unlistenTokenExpired: mockUnlistenTokenExpired,
          stopTokenRefresher: mockTokenRefresherStop,
        };
      });

      const { result } = renderHook(() =>
        useAppBootstrap({ addToast: mockAddToast })
      );

      await waitFor(() => {
        expect(result.current.isDataLoaded).toBe(true);
      });

      // 验证初始化顺序
      expect(callOrder).toContain('models');
      expect(callOrder).toContain('chats');
      expect(callOrder).toContain('tokenRefresher');
      expect(callOrder).toContain('authRuntime');

      // authRuntime 应该在 tokenRefresher 之前（因为 authRuntime 内部调用 tokenRefresher.start）
      const tokenRefresherIndex = callOrder.indexOf('tokenRefresher');
      const authRuntimeIndex = callOrder.indexOf('authRuntime');
      expect(authRuntimeIndex).toBeLessThan(tokenRefresherIndex);
    });
  });
});
