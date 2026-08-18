/**
 * providerConnection 业务逻辑测试
 *
 * 测试范围：
 * - handleApiKeyConnect: API Key 连接成功/失败/异常
 * - handleOAuthConnect: OAuth 连接成功/失败/异常
 * - handleEnvConnect: 环境变量连接
 * - handleNoneConnect: 无认证连接
 * - 模型获取回退逻辑
 * - 凭证保存
 *
 * @module test/services/providers/providerConnection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleApiKeyConnect,
  handleOAuthConnect,
  handleEnvConnect,
  handleNoneConnect,
} from '../../../services/providers/providerConnection';
import { providerCredentialsStorage } from '../../../services/storage';
import { modelFetcher } from '../../../services/modelFetcher';
import type { AIProvider, OAuthResult } from '../../../types';

// Mock 依赖
vi.mock('../../../services/storage', () => ({
  providerCredentialsStorage: {
    add: vi.fn(),
  },
}));

vi.mock('../../../services/modelFetcher', () => ({
  modelFetcher: {
    supportsDynamicFetch: vi.fn(),
    fetchModels: vi.fn(),
  },
}));

vi.mock('../../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  LogTags: {
    APP: 'APP',
  },
}));

describe('providerConnection 业务逻辑测试', () => {
  const mockProvider: AIProvider = {
    id: 'test-provider',
    name: 'Test Provider',
    icon: '🧪',
    defaultEndpoint: 'https://api.test.com/v1',
    authMethods: [{ type: 'api', label: 'API Key' }],
    models: [
      { id: 'model-1', name: 'Model 1', maxTokens: 4096, contextWindow: 8192 },
      { id: 'model-2', name: 'Model 2', maxTokens: 8192, contextWindow: 16384 },
    ],
    status: 'disconnected',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // 重置为默认成功状态
    vi.mocked(providerCredentialsStorage.add).mockResolvedValue(undefined);
    vi.mocked(modelFetcher.supportsDynamicFetch).mockReturnValue(false);
    vi.mocked(modelFetcher.fetchModels).mockResolvedValue({
      models: [],
      source: 'builtin',
    });
  });

  describe('TC-PROV-CONN-001: handleApiKeyConnect - 成功场景', () => {
    it('应该成功连接并保存凭证', async () => {
      const apiKey = 'test-api-key-123';

      // Mock 不支持动态获取，使用内置模型
      vi.mocked(modelFetcher.supportsDynamicFetch).mockReturnValue(false);

      const result = await handleApiKeyConnect({
        providerId: mockProvider.id,
        apiKey,
        provider: mockProvider,
      });

      // 验证凭证保存
      expect(providerCredentialsStorage.add).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: mockProvider.id,
          type: 'api',
          apiKey,
        })
      );

      // 验证返回结果
      expect(result).toEqual({
        status: 'connected',
        source: 'api',
        models: mockProvider.models,
      });
    });

    it('应该支持动态获取模型列表', async () => {
      const apiKey = 'test-api-key-123';
      const dynamicModels = [
        { id: 'dynamic-1', name: 'Dynamic Model 1', maxTokens: 4096, contextWindow: 8192 },
        { id: 'dynamic-2', name: 'Dynamic Model 2', maxTokens: 8192, contextWindow: 16384 },
      ];

      // Mock 支持动态获取
      vi.mocked(modelFetcher.supportsDynamicFetch).mockReturnValue(true);
      vi.mocked(modelFetcher.fetchModels).mockResolvedValue({
        models: dynamicModels,
        source: 'api',
      });

      const result = await handleApiKeyConnect({
        providerId: mockProvider.id,
        apiKey,
        provider: mockProvider,
      });

      // 验证调用了动态获取
      expect(modelFetcher.fetchModels).toHaveBeenCalledWith(
        mockProvider.id,
        apiKey,
        mockProvider.defaultEndpoint,
        mockProvider.models
      );

      // 验证返回动态模型
      expect(result).toEqual({
        status: 'connected',
        source: 'api',
        models: dynamicModels,
      });
    });
  });

  describe('TC-PROV-CONN-002: handleApiKeyConnect - 失败场景', () => {
    it('应该处理凭证保存失败', async () => {
      const apiKey = 'test-api-key-123';
      const error = new Error('Storage error');

      // Mock 保存失败
      vi.mocked(providerCredentialsStorage.add).mockRejectedValue(error);

      const result = await handleApiKeyConnect({
        providerId: mockProvider.id,
        apiKey,
        provider: mockProvider,
      });

      // 验证返回错误状态
      expect(result).toEqual({
        status: 'error',
        errorMessage: 'Error: Storage error',
      });
    });

    it('应该处理动态获取模型失败并回退到内置模型', async () => {
      const apiKey = 'test-api-key-123';

      // Mock 支持动态获取但失败
      vi.mocked(modelFetcher.supportsDynamicFetch).mockReturnValue(true);
      vi.mocked(modelFetcher.fetchModels).mockResolvedValue({
        models: [],
        source: 'builtin',
      });

      const result = await handleApiKeyConnect({
        providerId: mockProvider.id,
        apiKey,
        provider: mockProvider,
      });

      // 验证回退到内置模型
      expect(result).toEqual({
        status: 'connected',
        source: 'api',
        models: mockProvider.models,
      });
    });
  });

  describe('TC-PROV-CONN-003: handleOAuthConnect - 成功场景', () => {
    it('应该成功连接并保存完整的 OAuth 凭证', async () => {
      const oauthResult: OAuthResult = {
        accessToken: 'oauth-access-token',
        refreshToken: 'oauth-refresh-token',
        expiresAt: Date.now() + 3600000, // 1小时后过期
        accountId: 'account-123',
        projectId: 'project-456',
      };

      vi.mocked(modelFetcher.supportsDynamicFetch).mockReturnValue(false);

      const result = await handleOAuthConnect({
        providerId: mockProvider.id,
        oauthResult,
        provider: mockProvider,
      });

      // 验证保存了完整的 OAuth 凭证
      expect(providerCredentialsStorage.add).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: mockProvider.id,
          type: 'oauth',
          accessToken: oauthResult.accessToken,
          refreshToken: oauthResult.refreshToken,
          expiresAt: oauthResult.expiresAt,
          accountId: oauthResult.accountId,
          projectId: oauthResult.projectId,
        })
      );

      // 验证返回结果
      expect(result).toEqual({
        status: 'connected',
        source: 'oauth',
        models: mockProvider.models,
      });
    });

    it('应该支持使用 accessToken 动态获取模型', async () => {
      const oauthResult: OAuthResult = {
        accessToken: 'oauth-access-token',
      };

      const dynamicModels = [
        { id: 'oauth-model-1', name: 'OAuth Model 1', maxTokens: 4096, contextWindow: 8192 },
      ];

      vi.mocked(modelFetcher.supportsDynamicFetch).mockReturnValue(true);
      vi.mocked(modelFetcher.fetchModels).mockResolvedValue({
        models: dynamicModels,
        source: 'api',
      });

      const result = await handleOAuthConnect({
        providerId: mockProvider.id,
        oauthResult,
        provider: mockProvider,
      });

      // 验证使用 accessToken 获取模型
      expect(modelFetcher.fetchModels).toHaveBeenCalledWith(
        mockProvider.id,
        oauthResult.accessToken,
        mockProvider.defaultEndpoint,
        mockProvider.models
      );

      expect(result.models).toEqual(dynamicModels);
    });
  });

  describe('TC-PROV-CONN-004: handleOAuthConnect - 失败场景', () => {
    it('应该拒绝空的 oauthResult', async () => {
      const result = await handleOAuthConnect({
        providerId: mockProvider.id,
        oauthResult: null as any,
        provider: mockProvider,
      });

      expect(result).toEqual({
        status: 'error',
        errorMessage: expect.stringContaining('OAuth 认证需要 oauthResult'),
      });
    });

    it('应该拒绝缺少 accessToken 的 oauthResult', async () => {
      const result = await handleOAuthConnect({
        providerId: mockProvider.id,
        oauthResult: {} as OAuthResult,
        provider: mockProvider,
      });

      expect(result).toEqual({
        status: 'error',
        errorMessage: expect.stringContaining('OAuth 认证需要 oauthResult'),
      });
    });

    it('应该处理保存失败', async () => {
      const oauthResult: OAuthResult = {
        accessToken: 'oauth-access-token',
      };

      vi.mocked(providerCredentialsStorage.add).mockRejectedValue(
        new Error('OAuth storage error')
      );

      const result = await handleOAuthConnect({
        providerId: mockProvider.id,
        oauthResult,
        provider: mockProvider,
      });

      expect(result).toEqual({
        status: 'error',
        errorMessage: 'Error: OAuth storage error',
      });
    });
  });

  describe('TC-PROV-CONN-005: handleEnvConnect - 环境变量认证', () => {
    it('应该成功连接并保存 env 类型凭证', async () => {
      const result = await handleEnvConnect({
        providerId: mockProvider.id,
      });

      // 验证保存了 env 类型凭证
      expect(providerCredentialsStorage.add).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: mockProvider.id,
          type: 'env',
        })
      );

      // 验证返回结果
      expect(result).toEqual({
        status: 'connected',
        source: 'env',
      });
    });

    it('应该处理保存失败', async () => {
      vi.mocked(providerCredentialsStorage.add).mockRejectedValue(
        new Error('Env storage error')
      );

      const result = await handleEnvConnect({
        providerId: mockProvider.id,
      });

      expect(result).toEqual({
        status: 'error',
        errorMessage: 'Error: Env storage error',
      });
    });
  });

  describe('TC-PROV-CONN-006: handleNoneConnect - 无认证', () => {
    it('应该成功连接并保存 none 类型凭证', async () => {
      const result = await handleNoneConnect({
        providerId: mockProvider.id,
      });

      // 验证保存了 none 类型凭证
      expect(providerCredentialsStorage.add).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: mockProvider.id,
          type: 'none',
        })
      );

      // 验证返回结果
      expect(result).toEqual({
        status: 'connected',
        source: 'config',
      });
    });

    it('应该处理保存失败', async () => {
      vi.mocked(providerCredentialsStorage.add).mockRejectedValue(
        new Error('None storage error')
      );

      const result = await handleNoneConnect({
        providerId: mockProvider.id,
      });

      expect(result).toEqual({
        status: 'error',
        errorMessage: 'Error: None storage error',
      });
    });
  });

  describe('TC-PROV-CONN-007: 模型获取回退逻辑', () => {
    it('动态获取失败时应该使用内置模型', async () => {
      const apiKey = 'test-api-key';

      vi.mocked(modelFetcher.supportsDynamicFetch).mockReturnValue(true);
      vi.mocked(modelFetcher.fetchModels).mockRejectedValue(
        new Error('Network error')
      );

      const result = await handleApiKeyConnect({
        providerId: mockProvider.id,
        apiKey,
        provider: mockProvider,
      });

      // 验证使用了内置模型
      expect(result).toEqual({
        status: 'connected',
        source: 'api',
        models: mockProvider.models,
      });
    });

    it('动态获取返回空数组时应该使用内置模型', async () => {
      const apiKey = 'test-api-key';

      vi.mocked(modelFetcher.supportsDynamicFetch).mockReturnValue(true);
      vi.mocked(modelFetcher.fetchModels).mockResolvedValue({
        models: [],
        source: 'api',
      });

      const result = await handleApiKeyConnect({
        providerId: mockProvider.id,
        apiKey,
        provider: mockProvider,
      });

      // 验证使用了内置模型
      expect(result.models).toEqual(mockProvider.models);
    });
  });

  describe('TC-PROV-CONN-008: 凭证字段完整性', () => {
    it('API Key 凭证应该包含 createdAt 和 updatedAt', async () => {
      const apiKey = 'test-api-key';
      vi.mocked(modelFetcher.supportsDynamicFetch).mockReturnValue(false);

      await handleApiKeyConnect({
        providerId: mockProvider.id,
        apiKey,
        provider: mockProvider,
      });

      expect(providerCredentialsStorage.add).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      );
    });

    it('OAuth 凭证应该包含所有可选字段', async () => {
      const oauthResult: OAuthResult = {
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: 123456789,
        accountId: 'acc',
        projectId: 'proj',
        profileArn: 'arn:aws:iam::123456789012:role/test',
        authMethod: 'idc',
        kiroClientId: 'client-id',
        kiroClientSecret: 'client-secret',
        kiroSsoRegion: 'us-east-1',
        kiroStartUrl: 'https://start.url',
      };

      vi.mocked(modelFetcher.supportsDynamicFetch).mockReturnValue(false);

      await handleOAuthConnect({
        providerId: mockProvider.id,
        oauthResult,
        provider: mockProvider,
      });

      expect(providerCredentialsStorage.add).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: oauthResult.accessToken,
          refreshToken: oauthResult.refreshToken,
          expiresAt: oauthResult.expiresAt,
          accountId: oauthResult.accountId,
          projectId: oauthResult.projectId,
          profileArn: oauthResult.profileArn,
          authMethod: oauthResult.authMethod,
          kiroClientId: oauthResult.kiroClientId,
          kiroClientSecret: oauthResult.kiroClientSecret,
          kiroSsoRegion: oauthResult.kiroSsoRegion,
          kiroStartUrl: oauthResult.kiroStartUrl,
        })
      );
    });
  });
});
