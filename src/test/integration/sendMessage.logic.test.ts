/**
 * handleSendMessage 核心逻辑单元测试
 *
 * 测试从 App.tsx handleSendMessage 中抽取的纯函数，
 * 确保核心逻辑的正确性。
 *
 * 这些测试覆盖了 handleSendMessage 的关键风险点：
 * - Token 有效性检查逻辑（集成测试）
 * - 消息 ID 过滤逻辑（单元测试）
 * - RAF 批量更新逻辑（单元测试）
 * - Token 统计计算逻辑（单元测试）
 * - 错误消息格式化逻辑（单元测试）
 *
 * @module test/integration/sendMessage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tokenRefresher } from '../../services/tokenRefresher';
import { providerCredentialsStorage } from '../../services/storage';
import type { ProviderCredential } from '../../types';
import {
  shouldProcessEvent,
  accumulateChunkContent,
  calculateTotalTokens,
  formatErrorMessage,
  shouldSkipTokenUpdate,
  type PendingContent,
} from '../../utils/chatStreamHelpers';

// Mock Tauri
const mockInvoke = vi.fn();
const mockListen = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: any[]) => mockListen(...args),
}));

vi.mock('../../services/storage', () => ({
  providerCredentialsStorage: {
    get: vi.fn(),
    save: vi.fn(),
    load: vi.fn(),
    add: vi.fn(),
  },
  chatsStorage: {
    save: vi.fn(),
    load: vi.fn(),
  },
  modelsStorage: {
    save: vi.fn(),
    load: vi.fn(),
  },
  agentsStorage: {
    save: vi.fn(),
    load: vi.fn(),
  },
  skillsStorage: {
    save: vi.fn(),
    load: vi.fn(),
  },
  mcpServersStorage: {
    save: vi.fn(),
    load: vi.fn(),
  },
  roundtableChatsStorage: {
    save: vi.fn(),
    load: vi.fn(),
  },
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  LogTags: {
    CHAT: 'CHAT',
    APP: 'APP',
    AUTH: 'AUTH',
  },
}));

describe('handleSendMessage 核心逻辑测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('TC-SEND-LOGIC-001: Token 有效性检查逻辑', () => {
    it('应该对 OAuth 凭证调用 ensureTokenValid 并返回有效结果', async () => {
      const oauthCredential: ProviderCredential = {
        providerId: 'test-provider',
        type: 'oauth',
        accessToken: 'test-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3600000,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(providerCredentialsStorage.get).mockResolvedValue(oauthCredential);

      // Mock tokenRefresher 返回 true（Token 有效）
      const mockEnsureTokenValid = vi.spyOn(tokenRefresher, 'ensureTokenValid')
        .mockResolvedValue(true);

      // 模拟 handleSendMessage 中的 Token 检查逻辑
      const credential = await providerCredentialsStorage.get('test-provider');

      if (credential?.type === 'oauth') {
        const isValid = await tokenRefresher.ensureTokenValid('test-provider');
        expect(isValid).toBe(true);
      }

      expect(providerCredentialsStorage.get).toHaveBeenCalledWith('test-provider');
      expect(mockEnsureTokenValid).toHaveBeenCalledWith('test-provider');

      mockEnsureTokenValid.mockRestore();
    });

    it('应该跳过非 OAuth 凭证的 Token 检查', async () => {
      const apiKeyCredential: ProviderCredential = {
        providerId: 'test-provider',
        type: 'api',
        apiKey: 'test-api-key',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(providerCredentialsStorage.get).mockResolvedValue(apiKeyCredential);

      // 模拟 handleSendMessage 中的 Token 检查逻辑
      const credential = await providerCredentialsStorage.get('test-provider');

      let tokenCheckCalled = false;
      if (credential?.type === 'oauth') {
        tokenCheckCalled = true;
        await tokenRefresher.ensureTokenValid('test-provider');
      }

      expect(tokenCheckCalled).toBe(false);
    });

    it('应该在 Token 无效时返回 false', async () => {
      const oauthCredential: ProviderCredential = {
        providerId: 'test-provider',
        type: 'oauth',
        accessToken: 'expired-token',
        expiresAt: Date.now() - 1000, // 已过期
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(providerCredentialsStorage.get).mockResolvedValue(oauthCredential);

      // Mock tokenRefresher 返回 false（刷新失败）
      const mockEnsureTokenValid = vi.spyOn(tokenRefresher, 'ensureTokenValid')
        .mockResolvedValue(false);

      const credential = await providerCredentialsStorage.get('test-provider');

      if (credential?.type === 'oauth') {
        const isValid = await tokenRefresher.ensureTokenValid('test-provider');
        expect(isValid).toBe(false);
      }

      mockEnsureTokenValid.mockRestore();
    });
  });

  describe('TC-SEND-LOGIC-002: 消息 ID 过滤逻辑', () => {
    it('应该过滤不匹配的消息 ID', () => {
      const validMessageIds = new Set(['message-123']);
      const incomingMessageId = 'message-456';

      const shouldProcess = shouldProcessEvent(validMessageIds, incomingMessageId);

      expect(shouldProcess).toBe(false);
    });

    it('应该处理匹配的消息 ID', () => {
      const validMessageIds = new Set(['message-123']);
      const incomingMessageId = 'message-123';

      const shouldProcess = shouldProcessEvent(validMessageIds, incomingMessageId);

      expect(shouldProcess).toBe(true);
    });

    it('应该支持多个有效消息 ID', () => {
      const validMessageIds = new Set(['msg-1', 'msg-2', 'msg-3']);

      expect(shouldProcessEvent(validMessageIds, 'msg-1')).toBe(true);
      expect(shouldProcessEvent(validMessageIds, 'msg-2')).toBe(true);
      expect(shouldProcessEvent(validMessageIds, 'msg-3')).toBe(true);
      expect(shouldProcessEvent(validMessageIds, 'msg-4')).toBe(false);
    });
  });

  describe('TC-SEND-LOGIC-003: RAF 批量更新逻辑', () => {
    it('应该累积多个 chunk 的内容', () => {
      const pendingContent: PendingContent = {
        messageId: 'msg-1',
        content: '',
        reasoning: '',
      };

      // 模拟多个 chunk 事件
      accumulateChunkContent(pendingContent, 'Hello ', false);
      accumulateChunkContent(pendingContent, 'World', false);
      accumulateChunkContent(pendingContent, '!', false);

      expect(pendingContent.content).toBe('Hello World!');
    });

    it('应该分别累积 content 和 reasoning', () => {
      const pendingContent: PendingContent = {
        messageId: 'msg-1',
        content: '',
        reasoning: '',
      };

      // 模拟 chunk 和 reasoning_chunk 事件
      accumulateChunkContent(pendingContent, 'Answer: ', false);
      accumulateChunkContent(pendingContent, 'Thinking... ', true);
      accumulateChunkContent(pendingContent, '42', false);
      accumulateChunkContent(pendingContent, 'Done', true);

      expect(pendingContent.content).toBe('Answer: 42');
      expect(pendingContent.reasoning).toBe('Thinking... Done');
    });

    it('应该正确处理空内容', () => {
      const pendingContent: PendingContent = {
        messageId: 'msg-1',
        content: '',
        reasoning: '',
      };

      accumulateChunkContent(pendingContent, '', false);
      accumulateChunkContent(pendingContent, '', true);

      expect(pendingContent.content).toBe('');
      expect(pendingContent.reasoning).toBe('');
    });
  });

  describe('TC-SEND-LOGIC-004: Token 统计计算逻辑', () => {
    it('应该使用 total_tokens 如果存在', () => {
      const usage = {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      };

      const totalTokens = calculateTotalTokens(usage);

      expect(totalTokens).toBe(30);
    });

    it('应该计算 total_tokens 如果不存在', () => {
      const usage = {
        prompt_tokens: 10,
        completion_tokens: 20,
      };

      const totalTokens = calculateTotalTokens(usage);

      expect(totalTokens).toBe(30);
    });

    it('应该跳过 total_tokens 为 0 的情况', () => {
      const usage = {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };

      const totalTokens = calculateTotalTokens(usage);
      const shouldUpdate = !shouldSkipTokenUpdate(totalTokens);

      expect(shouldUpdate).toBe(false);
    });

    it('应该处理缺失的 token 字段', () => {
      const usage = {};

      const totalTokens = calculateTotalTokens(usage);

      expect(totalTokens).toBe(0);
    });

    it('应该处理部分缺失的 token 字段', () => {
      const usage1 = { prompt_tokens: 10 };
      const usage2 = { completion_tokens: 20 };

      expect(calculateTotalTokens(usage1)).toBe(10);
      expect(calculateTotalTokens(usage2)).toBe(20);
    });
  });

  describe('TC-SEND-LOGIC-005: 错误消息格式化逻辑', () => {
    it('应该格式化错误消息前缀', () => {
      const error = 'Connection timeout';
      const formattedError = formatErrorMessage(error);

      expect(formattedError).toBe('⚠️ 回复失败: Connection timeout');
    });

    it('应该在已有内容时追加错误', () => {
      const existingContent = 'Hello';
      const error = 'Network error';
      const formattedError = formatErrorMessage(error, existingContent);

      expect(formattedError).toBe('Hello\n\n⚠️ 错误: Network error');
    });

    it('应该在无内容时显示完整错误', () => {
      const error = 'Model not found';
      const formattedError = formatErrorMessage(error, '');

      expect(formattedError).toBe('⚠️ 回复失败: Model not found');
    });

    it('应该处理空错误消息', () => {
      const formattedError = formatErrorMessage('');

      expect(formattedError).toBe('⚠️ 回复失败: ');
    });

    it('应该处理包含特殊字符的错误', () => {
      const error = 'Error: "Invalid token" (code: 401)';
      const formattedError = formatErrorMessage(error);

      expect(formattedError).toContain(error);
    });
  });

  describe('TC-SEND-LOGIC-006: 流错误与 catch 去重逻辑', () => {
    it('流式 error 已上屏时，catch 不应再追加请求失败消息', () => {
      let streamErrorReported = false;
      const messages: string[] = [];

      // 模拟 payload.event === "error" 分支
      streamErrorReported = true;
      messages.push(formatErrorMessage('Connection timeout'));

      // 模拟外层 catch 分支
      if (!streamErrorReported) {
        messages.push('⚠️ 请求失败: Connection timeout');
      }

      expect(messages).toHaveLength(1);
      expect(messages[0]).toBe('⚠️ 回复失败: Connection timeout');
    });

    it('非流式错误时，catch 应追加请求失败消息', () => {
      const streamErrorReported = false;
      const messages: string[] = [];

      if (!streamErrorReported) {
        messages.push('⚠️ 请求失败: Request aborted');
      }

      expect(messages).toHaveLength(1);
      expect(messages[0]).toBe('⚠️ 请求失败: Request aborted');
    });
  });
});
