/**
 * @file providerState.test.ts
 * @description providerState 纯函数单元测试
 *
 * 测试用例：
 * - TC-PROV-STATE-001: updateProviderConnection - API Key 连接
 * - TC-PROV-STATE-002: updateProviderConnection - OAuth 连接
 * - TC-PROV-STATE-003: updateProviderConnection - 连接失败
 * - TC-PROV-STATE-004: updateProviderDisconnection - 断开连接
 * - TC-PROV-STATE-005: updateProviderModels - 更新模型列表
 * - TC-PROV-STATE-006: updateProviderError - 更新错误状态
 * - TC-PROV-STATE-007: findProvider - 查找存在的 Provider
 * - TC-PROV-STATE-008: findProvider - 查找不存在的 Provider
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  updateProviderConnection,
  updateProviderDisconnection,
  updateProviderModels,
  updateProviderError,
  findProvider,
} from '../../../services/providers/providerState';
import type { AIProvider, ProviderModel } from '../../../types';

// ==================== 测试辅助 ====================

const createMockProvider = (id: string): AIProvider => ({
  id,
  name: `Provider ${id}`,
  icon: '🤖',
  description: 'Test provider',
  defaultEndpoint: 'https://api.test.com',
  authMethods: [{ type: 'api-key', label: 'API Key' }],
  models: [
    { id: 'model-1', name: 'Model 1', maxTokens: 4096, contextWindow: 4096 },
  ],
  status: 'disconnected',
  protocol: 'openai',
  category: 'other',
});

const createMockModels = (): ProviderModel[] => [
  { id: 'model-1', name: 'Model 1', maxTokens: 4096, contextWindow: 4096 },
  { id: 'model-2', name: 'Model 2', maxTokens: 8192, contextWindow: 8192 },
];

// ==================== 测试用例 ====================

describe('providerState 纯函数测试', () => {
  // ==================== TC-PROV-STATE-001 ====================
  it('TC-PROV-STATE-001: updateProviderConnection - API Key 连接', () => {
    const providers: AIProvider[] = [
      createMockProvider('openai'),
      createMockProvider('google'),
    ];

    const models = createMockModels();
    const result = updateProviderConnection(providers, 'openai', {
      status: 'connected',
      source: 'api',
      models,
    });

    // openai 状态更新
    expect(result[0].status).toBe('connected');
    expect(result[0].source).toBe('api');
    expect(result[0].models).toBe(models);

    // google 不受影响
    expect(result[1].status).toBe('disconnected');
  });

  // ==================== TC-PROV-STATE-002 ====================
  it('TC-PROV-STATE-002: updateProviderConnection - OAuth 连接', () => {
    const providers: AIProvider[] = [
      createMockProvider('google'),
    ];

    const result = updateProviderConnection(providers, 'google', {
      status: 'connected',
      source: 'oauth',
    });

    expect(result[0].status).toBe('connected');
    expect(result[0].source).toBe('oauth');
    // 没有提供新模型，保持原有模型
    expect(result[0].models).toHaveLength(1);
  });

  // ==================== TC-PROV-STATE-003 ====================
  it('TC-PROV-STATE-003: updateProviderConnection - 连接失败', () => {
    const providers: AIProvider[] = [
      createMockProvider('openai'),
    ];

    const result = updateProviderConnection(providers, 'openai', {
      status: 'error',
      errorMessage: 'Connection failed',
    });

    expect(result[0].status).toBe('error');
    expect(result[0].errorMessage).toBe('Connection failed');
  });

  // ==================== TC-PROV-STATE-004 ====================
  it('TC-PROV-STATE-004: updateProviderDisconnection - 断开连接', () => {
    const providers: AIProvider[] = [
      {
        ...createMockProvider('openai'),
        status: 'connected',
        source: 'api',
        errorMessage: 'Some error',
      },
    ];

    const result = updateProviderDisconnection(providers, 'openai');

    expect(result[0].status).toBe('disconnected');
    expect(result[0].source).toBeUndefined();
    expect(result[0].errorMessage).toBeUndefined();
  });

  // ==================== TC-PROV-STATE-005 ====================
  it('TC-PROV-STATE-005: updateProviderModels - 更新模型列表', () => {
    const providers: AIProvider[] = [
      createMockProvider('openai'),
    ];

    const newModels = createMockModels();
    const result = updateProviderModels(providers, 'openai', newModels);

    expect(result[0].models).toBe(newModels);
    expect(result[0].models).toHaveLength(2);
  });

  // ==================== TC-PROV-STATE-006 ====================
  it('TC-PROV-STATE-006: updateProviderError - 更新错误状态', () => {
    const providers: AIProvider[] = [
      createMockProvider('openai'),
    ];

    const result = updateProviderError(providers, 'openai', 'API Key invalid');

    expect(result[0].status).toBe('error');
    expect(result[0].errorMessage).toBe('API Key invalid');
  });

  // ==================== TC-PROV-STATE-007 ====================
  it('TC-PROV-STATE-007: findProvider - 查找存在的 Provider', () => {
    const providers: AIProvider[] = [
      createMockProvider('openai'),
      createMockProvider('google'),
    ];

    const provider = findProvider(providers, 'openai');

    expect(provider).toBeDefined();
    expect(provider?.id).toBe('openai');
  });

  // ==================== TC-PROV-STATE-008 ====================
  it('TC-PROV-STATE-008: findProvider - 查找不存在的 Provider', () => {
    const providers: AIProvider[] = [
      createMockProvider('openai'),
    ];

    const provider = findProvider(providers, 'non-existent');

    expect(provider).toBeUndefined();
  });

  // ==================== 额外测试：边界情况 ====================
  it('额外测试: updateProviderConnection - providerId 不存在', () => {
    const providers: AIProvider[] = [
      createMockProvider('openai'),
    ];

    const result = updateProviderConnection(providers, 'non-existent', {
      status: 'connected',
      source: 'api',
    });

    // 不影响任何 Provider
    expect(result[0].status).toBe('disconnected');
  });

  it('额外测试: updateProviderModels - 空模型列表', () => {
    const providers: AIProvider[] = [
      createMockProvider('openai'),
    ];

    const result = updateProviderModels(providers, 'openai', []);

    expect(result[0].models).toHaveLength(0);
  });
});
