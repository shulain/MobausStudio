/**
 * @file authProviderState.test.ts
 * @description authProviderState 纯函数单元测试
 *
 * 测试用例：
 * - TC-AUTH-STATE-001: computeProviderStatusFromCredential - API Key 类型
 * - TC-AUTH-STATE-002: computeProviderStatusFromCredential - OAuth 未过期
 * - TC-AUTH-STATE-003: computeProviderStatusFromCredential - OAuth 已过期
 * - TC-AUTH-STATE-004: mergeProvidersWithCredentials - 合并凭证
 * - TC-AUTH-STATE-005: applyTokenRefreshResult - 刷新成功
 * - TC-AUTH-STATE-006: applyTokenRefreshResult - 刷新失败
 * - TC-AUTH-STATE-007: filterExpiredOAuthCredentials - 过滤过期凭证
 * - TC-AUTH-STATE-008: filterOAuthCredentials - 过滤 OAuth 凭证
 * - TC-AUTH-STATE-009: updateProviderStatus - 更新单个 Provider 状态
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  computeProviderStatusFromCredential,
  mergeProvidersWithCredentials,
  applyTokenRefreshResult,
  filterExpiredOAuthCredentials,
  filterOAuthCredentials,
  updateProviderStatus,
} from '../../../services/auth/authProviderState';
import type { AIProvider, ProviderCredential } from '../../../types';

// ==================== 测试辅助 ====================

const createMockProvider = (id: string): AIProvider => ({
  id,
  name: `Provider ${id}`,
  icon: '🤖',
  description: 'Test provider',
  defaultEndpoint: 'https://api.test.com',
  authMethods: ['api-key'],
  models: [],
  status: 'disconnected',
  protocol: 'openai',
  category: 'other',
});

const createApiKeyCredential = (providerId: string): ProviderCredential => ({
  providerId,
  type: 'api',
  apiKey: 'test-api-key',
});

const createOAuthCredential = (
  providerId: string,
  expiresAt: number,
  hasRefreshToken = true
): ProviderCredential => ({
  providerId,
  type: 'oauth',
  accessToken: 'test-access-token',
  refreshToken: hasRefreshToken ? 'test-refresh-token' : undefined,
  expiresAt,
});

// ==================== 测试用例 ====================

describe('authProviderState 纯函数测试', () => {
  // ==================== TC-AUTH-STATE-001 ====================
  it('TC-AUTH-STATE-001: computeProviderStatusFromCredential - API Key 类型', () => {
    const credential = createApiKeyCredential('openai');
    const now = Date.now();

    const result = computeProviderStatusFromCredential(credential, now);

    expect(result.status).toBe('connected');
    expect(result.source).toBe('api');
  });

  // ==================== TC-AUTH-STATE-002 ====================
  it('TC-AUTH-STATE-002: computeProviderStatusFromCredential - OAuth 未过期', () => {
    const now = Date.now();
    const expiresAt = now + 3600000; // 1 小时后过期
    const credential = createOAuthCredential('google', expiresAt);

    const result = computeProviderStatusFromCredential(credential, now);

    expect(result.status).toBe('connected');
    expect(result.source).toBe('oauth');
  });

  // ==================== TC-AUTH-STATE-003 ====================
  it('TC-AUTH-STATE-003: computeProviderStatusFromCredential - OAuth 已过期', () => {
    const now = Date.now();
    const expiresAt = now - 1000; // 已过期
    const credential = createOAuthCredential('google', expiresAt);

    const result = computeProviderStatusFromCredential(credential, now);

    expect(result.status).toBe('disconnected');
    expect(result.source).toBe('oauth');
  });

  // ==================== TC-AUTH-STATE-004 ====================
  it('TC-AUTH-STATE-004: mergeProvidersWithCredentials - 合并凭证', () => {
    const now = Date.now();
    const providers: AIProvider[] = [
      createMockProvider('openai'),
      createMockProvider('google'),
      createMockProvider('anthropic'),
    ];

    const credentials: ProviderCredential[] = [
      createApiKeyCredential('openai'),
      createOAuthCredential('google', now + 3600000), // 未过期
    ];

    const result = mergeProvidersWithCredentials(providers, credentials, now);

    // openai: API Key，已连接
    expect(result[0].status).toBe('connected');
    expect(result[0].source).toBe('api');

    // google: OAuth 未过期，已连接
    expect(result[1].status).toBe('connected');
    expect(result[1].source).toBe('oauth');

    // anthropic: 无凭证，保持原状态
    expect(result[2].status).toBe('disconnected');
    expect(result[2].source).toBeUndefined();
  });

  // ==================== TC-AUTH-STATE-005 ====================
  it('TC-AUTH-STATE-005: applyTokenRefreshResult - 刷新成功', () => {
    const providers: AIProvider[] = [
      { ...createMockProvider('openai'), status: 'disconnected' },
      { ...createMockProvider('google'), status: 'disconnected' },
    ];

    const result = applyTokenRefreshResult(providers, {
      success: true,
      providerId: 'openai',
    });

    // openai: 刷新成功，已连接
    expect(result[0].status).toBe('connected');

    // google: 不受影响
    expect(result[1].status).toBe('disconnected');
  });

  // ==================== TC-AUTH-STATE-006 ====================
  it('TC-AUTH-STATE-006: applyTokenRefreshResult - 刷新失败', () => {
    const providers: AIProvider[] = [
      { ...createMockProvider('openai'), status: 'connected' },
      { ...createMockProvider('google'), status: 'connected' },
    ];

    const result = applyTokenRefreshResult(providers, {
      success: false,
      providerId: 'openai',
      error: 'Refresh token expired',
    });

    // openai: 刷新失败，断开连接
    expect(result[0].status).toBe('disconnected');

    // google: 不受影响
    expect(result[1].status).toBe('connected');
  });

  // ==================== TC-AUTH-STATE-007 ====================
  it('TC-AUTH-STATE-007: filterExpiredOAuthCredentials - 过滤过期凭证', () => {
    const now = Date.now();
    const credentials: ProviderCredential[] = [
      createApiKeyCredential('openai'),
      createOAuthCredential('google', now + 3600000), // 未过期
      createOAuthCredential('anthropic', now - 1000), // 已过期
      createOAuthCredential('aws', now - 2000, false), // 已过期但无 refreshToken
    ];

    const result = filterExpiredOAuthCredentials(credentials, now);

    // 只返回已过期且有 refreshToken 的 OAuth 凭证
    expect(result).toHaveLength(1);
    expect(result[0].providerId).toBe('anthropic');
  });

  // ==================== TC-AUTH-STATE-008 ====================
  it('TC-AUTH-STATE-008: filterOAuthCredentials - 过滤 OAuth 凭证', () => {
    const now = Date.now();
    const credentials: ProviderCredential[] = [
      createApiKeyCredential('openai'),
      createOAuthCredential('google', now + 3600000),
      createOAuthCredential('anthropic', now - 1000),
    ];

    const result = filterOAuthCredentials(credentials);

    // 只返回 OAuth 凭证
    expect(result).toHaveLength(2);
    expect(result[0].providerId).toBe('google');
    expect(result[1].providerId).toBe('anthropic');
  });

  // ==================== 额外测试：边界情况 ====================
  it('额外测试: computeProviderStatusFromCredential - OAuth 无 expiresAt', () => {
    const credential: ProviderCredential = {
      providerId: 'test',
      type: 'oauth',
      accessToken: 'test-token',
      refreshToken: 'test-refresh',
      // 没有 expiresAt
    };

    const result = computeProviderStatusFromCredential(credential, Date.now());

    // 没有 expiresAt，视为未过期
    expect(result.status).toBe('connected');
    expect(result.source).toBe('oauth');
  });

  it('额外测试: mergeProvidersWithCredentials - 空凭证列表', () => {
    const providers: AIProvider[] = [
      createMockProvider('openai'),
      createMockProvider('google'),
    ];

    const result = mergeProvidersWithCredentials(providers, [], Date.now());

    // 所有 Provider 保持原状态
    expect(result[0].status).toBe('disconnected');
    expect(result[1].status).toBe('disconnected');
  });

  it('额外测试: applyTokenRefreshResult - providerId 不存在', () => {
    const providers: AIProvider[] = [
      createMockProvider('openai'),
    ];

    const result = applyTokenRefreshResult(providers, {
      success: true,
      providerId: 'non-existent',
    });

    // 不影响任何 Provider
    expect(result[0].status).toBe('disconnected');
  });

  // ==================== TC-AUTH-STATE-009 ====================
  it('TC-AUTH-STATE-009: updateProviderStatus - 更新单个 Provider 状态', () => {
    const providers: AIProvider[] = [
      createMockProvider('openai'),
      createMockProvider('google'),
    ];

    const result = updateProviderStatus(providers, 'openai', 'connected');

    // openai 状态更新
    expect(result[0].status).toBe('connected');

    // google 不受影响
    expect(result[1].status).toBe('disconnected');
  });

  it('额外测试: updateProviderStatus - providerId 不存在', () => {
    const providers: AIProvider[] = [
      createMockProvider('openai'),
    ];

    const result = updateProviderStatus(providers, 'non-existent', 'connected');

    // 不影响任何 Provider
    expect(result[0].status).toBe('disconnected');
  });
});
