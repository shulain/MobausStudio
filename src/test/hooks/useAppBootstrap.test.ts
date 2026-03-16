/**
 * @file useAppBootstrap.test.ts
 * @description useAppBootstrap Hook 单元测试
 *
 * 测试用例对应文档: docs/modules/settings.md
 * - TC-BOOT-001: 核心数据加载完成
 * - TC-BOOT-002: Skills 合并
 * - TC-BOOT-003: MCP 自动连接
 * - TC-BOOT-004: 自定义提供商加载
 * - TC-BOOT-005: 过期 Token 自动刷新
 * - TC-BOOT-006: Token 刷新失败回调
 * - TC-BOOT-007: Token 刷新成功回调
 * - TC-BOOT-008: 卸载时清理
 * - TC-BOOT-009: Skills 保存
 * - TC-BOOT-010: 初始化失败不阻塞
 *
 * @version 1.0.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAppBootstrap } from '../../hooks/useAppBootstrap';

// ==================== 模拟模块 ====================

// 模拟 logger
vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  LogTags: {
    APP: '[App]',
    AUTH: '[Auth]',
    STORAGE: '[Storage]',
  },
}));

// 模拟 constants
vi.mock('../../config/constants', () => ({
  STORAGE_DEBOUNCE_DELAY: 1000,
}));

// 模拟 platform
vi.mock('../../utils/platform', () => ({
  isTauri: vi.fn().mockReturnValue(false),
}));

// 模拟 Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

// ==================== 使用 vi.hoisted 定义需要在 vi.mock 工厂中引用的变量 ====================

const {
  mockModelsStorage,
  mockChatsStorage,
  mockAgentsStorage,
  mockMcpServersStorage,
  mockRoundtableChatsStorage,
  mockSkillsStorage,
  mockProviderCredentialsStorage,
  mockTokenRefresher,
} = vi.hoisted(() => {
  const createMockStorage = () => ({
    load: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
  });
  return {
    mockModelsStorage: createMockStorage(),
    mockChatsStorage: createMockStorage(),
    mockAgentsStorage: createMockStorage(),
    mockMcpServersStorage: createMockStorage(),
    mockRoundtableChatsStorage: createMockStorage(),
    mockSkillsStorage: createMockStorage(),
    mockProviderCredentialsStorage: createMockStorage(),
    mockTokenRefresher: {
      refreshToken: vi.fn().mockResolvedValue({ success: true, providerId: '' }),
      start: vi.fn(),
      stop: vi.fn(),
      addCallback: vi.fn(),
      removeCallback: vi.fn(),
      refreshByProviderId: vi.fn().mockResolvedValue({ success: true, providerId: '' }),
    },
  };
});

// 模拟 storage 服务
vi.mock('../../services/storage', () => ({
  modelsStorage: mockModelsStorage,
  chatsStorage: mockChatsStorage,
  agentsStorage: mockAgentsStorage,
  mcpServersStorage: mockMcpServersStorage,
  roundtableChatsStorage: mockRoundtableChatsStorage,
  skillsStorage: mockSkillsStorage,
  providerCredentialsStorage: mockProviderCredentialsStorage,
}));

// 模拟 tokenRefresher
vi.mock('../../services/tokenRefresher', () => ({
  tokenRefresher: mockTokenRefresher,
}));

// 模拟 modelFetcher
vi.mock('../../services/modelFetcher', () => ({
  modelFetcher: {
    initialize: vi.fn().mockResolvedValue({ cached: 0 }),
    getAllCachedModels: vi.fn().mockResolvedValue({}),
  },
}));

// 模拟 analytics
vi.mock('../../services/analytics', () => ({
  analytics: {
    init: vi.fn(),
    identify: vi.fn(),
  },
  trackEvents: {
    appLaunched: vi.fn(),
  },
}));

// 模拟 mockData
vi.mock('../../data/mockData', () => ({
  defaultChats: [],
}));

// 模拟 builtinProviders
vi.mock('../../data/providers', () => ({
  builtinProviders: [
    { id: 'openai', name: 'OpenAI', status: 'disconnected' },
    { id: 'anthropic', name: 'Anthropic', status: 'disconnected' },
  ],
}));

// 模拟 builtinSkills
vi.mock('../../data/builtinSkills', () => ({
  getBuiltinSkills: () => [
    { id: 'builtin-1', name: '内置技能1', builtIn: true },
    { id: 'builtin-2', name: '内置技能2', builtIn: true },
    { id: 'builtin-3', name: '内置技能3', builtIn: true },
  ],
}));

// 模拟 customProviderStorage
vi.mock('../../services/customProviderStorage', () => ({
  customProviderStorage: {
    load: vi.fn().mockResolvedValue([]),
  },
}));

// ==================== 测试辅助 ====================

const mockAddToast = vi.fn();

// ==================== 测试用例 ====================

describe('useAppBootstrap Hook 测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==================== TC-BOOT-001 ====================
  it('TC-BOOT-001: 核心数据加载完成 - isDataLoaded 最终为 true', async () => {
    const { result } = renderHook(() =>
      useAppBootstrap({ addToast: mockAddToast }),
    );

    // 初始状态
    expect(result.current.isDataLoaded).toBe(false);

    // 等待加载完成
    await waitFor(() => {
      expect(result.current.isDataLoaded).toBe(true);
    });

    // 验证所有 storage.load 被调用
    expect(mockModelsStorage.load).toHaveBeenCalledTimes(1);
    expect(mockChatsStorage.load).toHaveBeenCalledTimes(1);
    expect(mockAgentsStorage.load).toHaveBeenCalledTimes(1);
    expect(mockMcpServersStorage.load).toHaveBeenCalledTimes(1);
    expect(mockRoundtableChatsStorage.load).toHaveBeenCalledTimes(1);
  });

  // ==================== TC-BOOT-002 ====================
  it('TC-BOOT-002: Skills 合并 - 内置技能 + 自定义技能', async () => {
    // 模拟自定义技能
    mockSkillsStorage.load.mockResolvedValue([
      { id: 'custom-1', name: '自定义技能1', builtIn: false },
      { id: 'custom-2', name: '自定义技能2', builtIn: false },
    ]);

    const { result } = renderHook(() =>
      useAppBootstrap({ addToast: mockAddToast }),
    );

    await waitFor(() => {
      expect(result.current.isDataLoaded).toBe(true);
    });

    // 验证 skills 包含内置 + 自定义
    expect(result.current.skills).toHaveLength(5);
    // 内置技能在前
    expect(result.current.skills[0].builtIn).toBe(true);
    expect(result.current.skills[1].builtIn).toBe(true);
    expect(result.current.skills[2].builtIn).toBe(true);
    // 自定义技能在后
    expect(result.current.skills[3].builtIn).toBe(false);
    expect(result.current.skills[4].builtIn).toBe(false);
  });

  // ==================== TC-BOOT-003 ====================
  it('TC-BOOT-003: MCP 自动连接 - autoStart=true 的服务器', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const mockInvoke = vi.mocked(invoke);

    // 模拟 MCP 服务器数据（包含一个 autoStart 服务器）
    mockMcpServersStorage.load.mockResolvedValue([
      {
        id: 'mcp-1',
        name: '自动启动服务器',
        enabled: true,
        autoStart: true,
        transportType: 'stdio',
        command: 'test-cmd',
        status: 'connected',
        requestCount: 0,
      },
    ]);

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'mcp_connect') {
        return { success: true, server_name: 'test', server_version: '1.0' };
      }
      if (cmd === 'mcp_list_tools') {
        return [{ name: 'tool1', description: '测试工具' }];
      }
      return {};
    });

    const { result } = renderHook(() =>
      useAppBootstrap({ addToast: mockAddToast }),
    );

    await waitFor(() => {
      expect(result.current.isDataLoaded).toBe(true);
    });

    // MCP 自动连接在 setTimeout(500) 中执行
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    // 验证 mcp_connect 被调用
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('mcp_connect', expect.objectContaining({
        request: expect.objectContaining({
          server_id: 'mcp-1',
        }),
      }));
    });
  });

  // ==================== TC-BOOT-004 ====================
  it('TC-BOOT-004: 自定义提供商加载', async () => {
    const { customProviderStorage } = await import('../../services/customProviderStorage');
    vi.mocked(customProviderStorage.load).mockResolvedValue([
      {
        id: 'custom-provider-1',
        name: '自定义提供商',
        icon: '🤖',
        description: '测试',
        endpoint: 'https://test.api',
        authMethods: ['api-key'],
        models: [],
      },
    ] as any);

    const { result } = renderHook(() =>
      useAppBootstrap({ addToast: mockAddToast }),
    );

    await waitFor(() => {
      expect(result.current.isDataLoaded).toBe(true);
    });

    // 验证 providers 包含自定义提供商
    expect(result.current.providers.some(p => p.id === 'custom-provider-1')).toBe(true);
  });

  // ==================== TC-BOOT-005 ====================
  it('TC-BOOT-005: 过期 Token 自动刷新', async () => {
    // 模拟有过期 OAuth 凭证
    const expiredCredential = {
      providerId: 'openai',
      type: 'oauth',
      accessToken: 'expired-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 1000, // 已过期
    };
    mockProviderCredentialsStorage.load
      .mockResolvedValueOnce([expiredCredential]) // 第一次加载
      .mockResolvedValueOnce([{ ...expiredCredential, expiresAt: Date.now() + 3600000 }]); // 刷新后重新加载

    mockTokenRefresher.refreshToken.mockResolvedValue({
      success: true,
      providerId: 'openai',
    });

    const { result } = renderHook(() =>
      useAppBootstrap({ addToast: mockAddToast }),
    );

    await waitFor(() => {
      expect(result.current.isDataLoaded).toBe(true);
    });

    // 验证 refreshToken 被调用
    expect(mockTokenRefresher.refreshToken).toHaveBeenCalledWith(expiredCredential);
  });

  // ==================== TC-BOOT-006 ====================
  it('TC-BOOT-006: Token 刷新失败回调 - 显示 toast 并更新状态', async () => {
    const { result } = renderHook(() =>
      useAppBootstrap({ addToast: mockAddToast }),
    );

    await waitFor(() => {
      expect(result.current.isDataLoaded).toBe(true);
    });

    // 获取注册的 token 刷新回调
    expect(mockTokenRefresher.addCallback).toHaveBeenCalled();
    const callback = mockTokenRefresher.addCallback.mock.calls[0][0];

    // 模拟刷新失败
    await act(async () => {
      await callback({
        success: false,
        providerId: 'openai',
        error: '刷新失败',
      });
    });

    // 验证 toast 被显示
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      title: 'openai 连接已断开',
    }));

    // 验证 provider 状态更新为 disconnected
    const openaiProvider = result.current.providers.find(p => p.id === 'openai');
    expect(openaiProvider?.status).toBe('disconnected');
  });

  // ==================== TC-BOOT-007 ====================
  it('TC-BOOT-007: Token 刷新成功回调 - 更新状态为 connected', async () => {
    const { result } = renderHook(() =>
      useAppBootstrap({ addToast: mockAddToast }),
    );

    await waitFor(() => {
      expect(result.current.isDataLoaded).toBe(true);
    });

    // 获取注册的回调
    const callback = mockTokenRefresher.addCallback.mock.calls[0][0];

    // 模拟刷新成功
    await act(async () => {
      await callback({
        success: true,
        providerId: 'openai',
      });
    });

    // 验证 provider 状态更新为 connected
    const openaiProvider = result.current.providers.find(p => p.id === 'openai');
    expect(openaiProvider?.status).toBe('connected');
  });

  // ==================== TC-BOOT-008 ====================
  it('TC-BOOT-008: 卸载时清理 - 停止 tokenRefresher 和清理定时器', async () => {
    const { result, unmount } = renderHook(() =>
      useAppBootstrap({ addToast: mockAddToast }),
    );

    await waitFor(() => {
      expect(result.current.isDataLoaded).toBe(true);
    });

    unmount();

    // 验证 tokenRefresher 被停止
    expect(mockTokenRefresher.stop).toHaveBeenCalled();
  });

  // ==================== TC-BOOT-009 ====================
  it('TC-BOOT-009: Skills 保存 - setSkills 更新后触发保存', async () => {
    const { result } = renderHook(() =>
      useAppBootstrap({ addToast: mockAddToast }),
    );

    await waitFor(() => {
      expect(result.current.isDataLoaded).toBe(true);
    });

    // 清除之前的调用
    mockSkillsStorage.save.mockClear();

    // 更新 skills
    act(() => {
      result.current.setSkills(prev => [
        ...prev,
        { id: 'new-skill', name: '新技能', builtIn: false } as any,
      ]);
    });

    // 等待保存触发
    await waitFor(() => {
      expect(mockSkillsStorage.save).toHaveBeenCalled();
    });
  });

  // ==================== TC-BOOT-010 ====================
  it('TC-BOOT-010: 初始化失败不阻塞 - isDataLoaded 仍为 true', async () => {
    // 模拟 skillsStorage.load 抛异常
    mockSkillsStorage.load.mockRejectedValue(new Error('技能加载失败'));

    const { result } = renderHook(() =>
      useAppBootstrap({ addToast: mockAddToast }),
    );

    // 即使初始化失败，isDataLoaded 也应该为 true
    await waitFor(() => {
      expect(result.current.isDataLoaded).toBe(true);
    });
  });
});
