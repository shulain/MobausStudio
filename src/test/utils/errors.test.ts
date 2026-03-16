/**
 * 错误类测试
 *
 * 测试用例对应文档 docs/modules/protocols.md 中的 TC-I18N-001 ~ TC-I18N-003
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AppError,
  SkillNotFoundError,
  SkillInstallError,
  ModelFetchError,
  ProviderConnectionError,
  OAuthError,
  ProtocolError,
} from '../../utils/errors';

// Mock i18n
const mockT = vi.fn((key: string, params?: Record<string, string | number>) => {
  // 模拟中文翻译
  const translations: Record<string, string> = {
    'errors.skill.notFound': '技能 "{{skillId}}" 不存在',
    'errors.skill.installFailed': '安装技能失败：{{reason}}',
    'errors.model.fetchFailed': '获取模型列表失败：{{reason}}',
    'errors.provider.connectionFailed': '连接提供商失败：{{provider}}',
    'errors.oauth.authorizationFailed': 'OAuth 授权失败',
    'errors.protocol.unsupportedProtocol': '不支持的协议：{{protocol}}',
  };

  let result = translations[key] || key;

  // 替换参数
  if (params) {
    Object.entries(params).forEach(([paramKey, value]) => {
      result = result.replace(`{{${paramKey}}}`, String(value));
    });
  }

  return result;
});

describe('错误类测试', () => {
  beforeEach(() => {
    mockT.mockClear();
  });

  describe('AppError 基类', () => {
    it('应该正确创建错误实例', () => {
      const error = new AppError('errors.test', { key: 'value' });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('AppError');
      expect(error.i18nKey).toBe('errors.test');
      expect(error.params).toEqual({ key: 'value' });
    });

    it('应该支持 cause 参数', () => {
      const cause = new Error('原始错误');
      const error = new AppError('errors.test', undefined, cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('TC-I18N-001: 中文环境错误消息', () => {
    it('SkillNotFoundError 应该显示中文错误消息', () => {
      const error = new SkillNotFoundError('test-skill');
      const message = mockT(error.i18nKey, error.params);

      expect(message).toBe('技能 "test-skill" 不存在');
    });

    it('ModelFetchError 应该显示中文错误消息', () => {
      const error = new ModelFetchError('网络错误');
      const message = mockT(error.i18nKey, error.params);

      expect(message).toBe('获取模型列表失败：网络错误');
    });

    it('ProviderConnectionError 应该显示中文错误消息', () => {
      const error = new ProviderConnectionError('OpenAI');
      const message = mockT(error.i18nKey, error.params);

      expect(message).toBe('连接提供商失败：OpenAI');
    });
  });

  describe('TC-I18N-002: 英文环境错误消息', () => {
    const mockTEn = vi.fn((key: string, params?: Record<string, string | number>) => {
      // 模拟英文翻译
      const translations: Record<string, string> = {
        'errors.skill.notFound': 'Skill "{{skillId}}" not found',
        'errors.skill.installFailed': 'Failed to install skill: {{reason}}',
        'errors.model.fetchFailed': 'Failed to fetch model list: {{reason}}',
        'errors.provider.connectionFailed': 'Failed to connect to provider: {{provider}}',
        'errors.oauth.authorizationFailed': 'OAuth authorization failed',
        'errors.protocol.unsupportedProtocol': 'Unsupported protocol: {{protocol}}',
      };

      let result = translations[key] || key;

      if (params) {
        Object.entries(params).forEach(([paramKey, value]) => {
          result = result.replace(`{{${paramKey}}}`, String(value));
        });
      }

      return result;
    });

    it('SkillNotFoundError 应该显示英文错误消息', () => {
      const error = new SkillNotFoundError('test-skill');
      const message = mockTEn(error.i18nKey, error.params);

      expect(message).toBe('Skill "test-skill" not found');
    });

    it('ModelFetchError 应该显示英文错误消息', () => {
      const error = new ModelFetchError('Network error');
      const message = mockTEn(error.i18nKey, error.params);

      expect(message).toBe('Failed to fetch model list: Network error');
    });

    it('ProviderConnectionError 应该显示英文错误消息', () => {
      const error = new ProviderConnectionError('OpenAI');
      const message = mockTEn(error.i18nKey, error.params);

      expect(message).toBe('Failed to connect to provider: OpenAI');
    });
  });

  describe('TC-I18N-003: 错误参数插值', () => {
    it('应该正确替换单个参数', () => {
      const error = new SkillNotFoundError('my-skill');
      const message = mockT(error.i18nKey, error.params);

      expect(message).toContain('my-skill');
      expect(message).not.toContain('{{skillId}}');
    });

    it('应该正确替换多个参数', () => {
      const error = new SkillInstallError('网络超时');
      const message = mockT(error.i18nKey, error.params);

      expect(message).toContain('网络超时');
      expect(message).not.toContain('{{reason}}');
    });

    it('应该支持数字参数', () => {
      const error = new AppError('errors.test', { count: 42 });
      const testMessage = '共 {{count}} 个错误';
      const result = testMessage.replace('{{count}}', String(error.params!.count));

      expect(result).toBe('共 42 个错误');
    });
  });

  describe('具体错误类', () => {
    it('SkillNotFoundError 应该包含正确的 i18nKey', () => {
      const error = new SkillNotFoundError('test');
      expect(error.i18nKey).toBe('errors.skill.notFound');
      expect(error.params).toEqual({ skillId: 'test' });
    });

    it('SkillInstallError 应该包含正确的 i18nKey 和 cause', () => {
      const cause = new Error('原始错误');
      const error = new SkillInstallError('安装失败', cause);

      expect(error.i18nKey).toBe('errors.skill.installFailed');
      expect(error.params).toEqual({ reason: '安装失败' });
      expect(error.cause).toBe(cause);
    });

    it('ModelFetchError 应该包含正确的 i18nKey', () => {
      const error = new ModelFetchError('网络错误');
      expect(error.i18nKey).toBe('errors.model.fetchFailed');
      expect(error.params).toEqual({ reason: '网络错误' });
    });

    it('ProviderConnectionError 应该包含正确的 i18nKey', () => {
      const error = new ProviderConnectionError('Anthropic');
      expect(error.i18nKey).toBe('errors.provider.connectionFailed');
      expect(error.params).toEqual({ provider: 'Anthropic' });
    });

    it('OAuthError 应该支持自定义 i18nKey', () => {
      const error = new OAuthError('errors.oauth.authorizationFailed');
      expect(error.i18nKey).toBe('errors.oauth.authorizationFailed');
    });

    it('ProtocolError 应该支持自定义 i18nKey 和参数', () => {
      const error = new ProtocolError('errors.protocol.unsupportedProtocol', { protocol: 'custom' });
      expect(error.i18nKey).toBe('errors.protocol.unsupportedProtocol');
      expect(error.params).toEqual({ protocol: 'custom' });
    });
  });
});
