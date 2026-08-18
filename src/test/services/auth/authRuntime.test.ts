/**
 * @file authRuntime.test.ts
 * @description authRuntime 监听注册函数单元测试
 *
 * 测试用例：
 * - TC-AUTH-RUNTIME-001: startTokenRefresher - 启动并返回停止函数
 * - TC-AUTH-RUNTIME-002: startTokenRefresher - 不注册回调（避免重复）
 * - TC-AUTH-RUNTIME-003: registerTokenExpiredListener - 监听成功
 * - TC-AUTH-RUNTIME-004: registerTokenExpiredListener - 刷新成功
 * - TC-AUTH-RUNTIME-005: registerTokenExpiredListener - 刷新失败
 * - TC-AUTH-RUNTIME-006: registerAuthRuntime - 统一注册
 * - TC-AUTH-RUNTIME-007: registerAuthRuntime - 清理资源
 *
 * @version 1.1.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import {
  startTokenRefresher,
  registerTokenExpiredListener,
  registerAuthRuntime,
} from '../../../services/auth/authRuntime';
import type { AIProvider } from '../../../types';
import { tokenRefresher } from '../../../services/tokenRefresher';

// ==================== Mock ====================

// Mock tokenRefresher
vi.mock('../../../services/tokenRefresher', () => ({
  tokenRefresher: {
    start: vi.fn(),
    stop: vi.fn(),
    refreshByProviderId: vi.fn(),
  },
}));

// Mock @tauri-apps/api/event
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  LogTags: {
    APP: 'APP',
    AUTH: 'AUTH',
  },
}));

// ==================== 测试辅助 ====================

const createMockProvider = (id: string, status: 'connected' | 'disconnected'): AIProvider => ({
  id,
  name: `Provider ${id}`,
  icon: '🤖',
  description: 'Test provider',
  defaultEndpoint: 'https://api.test.com',
  authMethods: [{ type: 'api', label: 'API Key' }],
  models: [],
  status,
  protocol: 'openai',
  category: 'other',
});

// ==================== 测试用例 ====================

describe('authRuntime 监听注册函数测试', () => {
  let mockSetProviders: Mock<(updater: (prev: AIProvider[]) => AIProvider[]) => void>;
  let mockProviders: AIProvider[];

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetProviders = vi.fn();
    mockProviders = [
      createMockProvider('openai', 'connected'),
      createMockProvider('google', 'disconnected'),
    ];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==================== TC-AUTH-RUNTIME-001 ====================
  it('TC-AUTH-RUNTIME-001: startTokenRefresher - 启动并返回停止函数', () => {
    // 启动
    const stop = startTokenRefresher();

    // 验证 tokenRefresher.start 被调用（不带回调）
    expect(tokenRefresher.start).toHaveBeenCalledTimes(1);
    expect(tokenRefresher.start).toHaveBeenCalledWith();

    // 停止
    stop();
    expect(tokenRefresher.stop).toHaveBeenCalledTimes(1);
  });

  // ==================== TC-AUTH-RUNTIME-002 ====================
  it('TC-AUTH-RUNTIME-002: startTokenRefresher - 不注册回调（避免重复）', () => {
    // 启动
    startTokenRefresher();

    // 验证 start 被调用时没有传入回调参数
    const callArgs = (tokenRefresher.start as Mock).mock.calls[0];
    expect(callArgs).toHaveLength(0);
  });

  // ==================== TC-AUTH-RUNTIME-003 ====================
  it('TC-AUTH-RUNTIME-003: registerTokenExpiredListener - 监听成功', async () => {
    const { listen } = await import('@tauri-apps/api/event');
    const mockUnlisten = vi.fn();
    (listen as Mock).mockResolvedValue(mockUnlisten);

    const config = { setProviders: mockSetProviders };

    // 注册监听器
    const unlisten = await registerTokenExpiredListener(config);

    // 验证 listen 被调用
    expect(listen).toHaveBeenCalledWith('token_expired', expect.any(Function));
    expect(unlisten).toBe(mockUnlisten);
  });

  // ==================== TC-AUTH-RUNTIME-004 ====================
  it('TC-AUTH-RUNTIME-004: registerTokenExpiredListener - 刷新成功', async () => {
    const { listen } = await import('@tauri-apps/api/event');
    let eventHandler: any;
    (listen as Mock).mockImplementation((_event, handler) => {
      eventHandler = handler;
      return Promise.resolve(vi.fn());
    });

    (tokenRefresher.refreshByProviderId as Mock).mockResolvedValue({
      success: true,
      providerId: 'google',
    });

    const config = { setProviders: mockSetProviders };

    // 注册监听器
    await registerTokenExpiredListener(config);

    // 模拟 token_expired 事件
    await eventHandler({
      payload: { providerId: 'google', error: 'Token expired' },
    });

    // 验证 refreshByProviderId 被调用
    expect(tokenRefresher.refreshByProviderId).toHaveBeenCalledWith('google');

    // 验证 setProviders 被调用
    expect(mockSetProviders).toHaveBeenCalledTimes(1);

    // 验证更新逻辑
    const updater = mockSetProviders.mock.calls[0][0];
    const result = updater(mockProviders);
    expect(result[1].status).toBe('connected'); // google 变为 connected
  });

  // ==================== TC-AUTH-RUNTIME-005 ====================
  it('TC-AUTH-RUNTIME-005: registerTokenExpiredListener - 刷新失败', async () => {
    const { listen } = await import('@tauri-apps/api/event');
    let eventHandler: any;
    (listen as Mock).mockImplementation((_event, handler) => {
      eventHandler = handler;
      return Promise.resolve(vi.fn());
    });

    (tokenRefresher.refreshByProviderId as Mock).mockResolvedValue({
      success: false,
      providerId: 'openai',
      error: 'Refresh token expired',
    });

    const config = { setProviders: mockSetProviders };

    // 注册监听器
    await registerTokenExpiredListener(config);

    // 模拟 token_expired 事件
    await eventHandler({
      payload: { providerId: 'openai', error: 'Token expired' },
    });

    // 验证 setProviders 被调用
    expect(mockSetProviders).toHaveBeenCalledTimes(1);

    // 验证更新逻辑
    const updater = mockSetProviders.mock.calls[0][0];
    const result = updater(mockProviders);
    expect(result[0].status).toBe('disconnected'); // openai 变为 disconnected
  });

  // ==================== TC-AUTH-RUNTIME-006 ====================
  it('TC-AUTH-RUNTIME-006: registerAuthRuntime - 统一注册', async () => {
    const { listen } = await import('@tauri-apps/api/event');
    const mockUnlisten = vi.fn();
    (listen as Mock).mockResolvedValue(mockUnlisten);

    const config = { setProviders: mockSetProviders };

    // 统一注册
    const cleanup = await registerAuthRuntime(config);

    // 验证 tokenRefresher.start 被调用（不带回调）
    expect(tokenRefresher.start).toHaveBeenCalledTimes(1);
    expect(tokenRefresher.start).toHaveBeenCalledWith();

    // 验证 listen 被调用
    expect(listen).toHaveBeenCalledWith('token_expired', expect.any(Function));

    // 验证返回值
    expect(cleanup.unlistenTokenExpired).toBe(mockUnlisten);
    expect(cleanup.stopTokenRefresher).toBeTypeOf('function');
  });

  // ==================== TC-AUTH-RUNTIME-007 ====================
  it('TC-AUTH-RUNTIME-007: registerAuthRuntime - 清理资源', async () => {
    const { listen } = await import('@tauri-apps/api/event');
    const mockUnlisten = vi.fn();
    (listen as Mock).mockResolvedValue(mockUnlisten);

    const config = { setProviders: mockSetProviders };

    // 统一注册
    const cleanup = await registerAuthRuntime(config);

    // 清理资源
    cleanup.unlistenTokenExpired?.();
    cleanup.stopTokenRefresher();

    // 验证清理函数被调用
    expect(mockUnlisten).toHaveBeenCalledTimes(1);
    expect(tokenRefresher.stop).toHaveBeenCalledTimes(1);
  });

  // ==================== 额外测试：监听失败 ====================
  it('额外测试: registerTokenExpiredListener - 监听失败', async () => {
    const { listen } = await import('@tauri-apps/api/event');
    (listen as Mock).mockRejectedValue(new Error('Listen failed'));

    const config = { setProviders: mockSetProviders };

    // 注册监听器
    const unlisten = await registerTokenExpiredListener(config);

    // 验证返回 null
    expect(unlisten).toBeNull();
  });
});
