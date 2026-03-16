/**
 * @file chatStreamHelpers.test.ts
 * @description chatStreamHelpers 纯函数单元测试
 *
 * 测试用例：
 * - TC-HELPER-001: createFlushPendingUpdates - 批量更新消息内容
 * - TC-HELPER-002: createScheduleUpdate - RAF 调度
 * - TC-HELPER-003: createDonePromise - Promise 创建
 * - TC-HELPER-004: createToolCallsPromise - Promise 创建
 *
 * @version 1.0.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createFlushPendingUpdates,
  createScheduleUpdate,
  createDonePromise,
  createToolCallsPromise,
  type PendingContent,
} from '../../utils/chatStreamHelpers';
import type { Chat } from '../../types';

// ==================== 测试辅助 ====================

const createMockChat = (id: string): Chat => ({
  id,
  title: `Chat ${id}`,
  messages: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

// ==================== 测试用例 ====================

describe('chatStreamHelpers 纯函数测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==================== TC-HELPER-001 ====================
  it('TC-HELPER-001: createFlushPendingUpdates - 批量更新消息内容', () => {
    const chatId = 'test-chat-001';
    const messageId = 'test-msg-001';
    const pendingContentRef = {
      current: new Map<string, PendingContent>([
        [chatId, { messageId, content: 'Hello World', reasoning: '' }],
      ]),
    };
    const rafIdRef = { current: new Map<string, number>() };
    const setChats = vi.fn();

    const flushPendingUpdates = createFlushPendingUpdates(
      chatId,
      pendingContentRef,
      rafIdRef,
      setChats
    );

    // 执行 flush
    flushPendingUpdates();

    // 验证：setChats 被调用
    expect(setChats).toHaveBeenCalledTimes(1);
    expect(setChats).toHaveBeenCalledWith(expect.any(Function));

    // 验证：pendingContent 被清空
    const pending = pendingContentRef.current.get(chatId);
    expect(pending?.content).toBe('');
    expect(pending?.reasoning).toBe('');

    // 验证：rafId 被删除
    expect(rafIdRef.current.has(chatId)).toBe(false);
  });

  it('TC-HELPER-001-2: createFlushPendingUpdates - 创建新消息', () => {
    const chatId = 'test-chat-002';
    const messageId = 'test-msg-002';
    const pendingContentRef = {
      current: new Map<string, PendingContent>([
        [chatId, { messageId, content: 'New message', reasoning: '' }],
      ]),
    };
    const rafIdRef = { current: new Map<string, number>() };
    const mockChats: Chat[] = [createMockChat(chatId)];
    const setChats = vi.fn((updater) => {
      if (typeof updater === 'function') {
        const newChats = updater(mockChats);
        // 验证新消息被添加
        expect(newChats[0].messages).toHaveLength(1);
        expect(newChats[0].messages[0].content).toBe('New message');
      }
    });

    const flushPendingUpdates = createFlushPendingUpdates(
      chatId,
      pendingContentRef,
      rafIdRef,
      setChats
    );

    flushPendingUpdates();

    expect(setChats).toHaveBeenCalled();
  });

  it('TC-HELPER-001-3: createFlushPendingUpdates - 更新现有消息', () => {
    const chatId = 'test-chat-003';
    const messageId = 'test-msg-003';
    const pendingContentRef = {
      current: new Map<string, PendingContent>([
        [chatId, { messageId, content: ' World', reasoning: '' }],
      ]),
    };
    const rafIdRef = { current: new Map<string, number>() };
    const mockChats: Chat[] = [
      {
        ...createMockChat(chatId),
        messages: [
          {
            id: messageId,
            chatId,
            role: 'assistant',
            content: 'Hello',
            createdAt: new Date(),
          },
        ],
      },
    ];
    const setChats = vi.fn((updater) => {
      if (typeof updater === 'function') {
        const newChats = updater(mockChats);
        // 验证消息内容被追加
        expect(newChats[0].messages[0].content).toBe('Hello World');
      }
    });

    const flushPendingUpdates = createFlushPendingUpdates(
      chatId,
      pendingContentRef,
      rafIdRef,
      setChats
    );

    flushPendingUpdates();

    expect(setChats).toHaveBeenCalled();
  });

  // ==================== TC-HELPER-002 ====================
  it('TC-HELPER-002: createScheduleUpdate - RAF 调度', () => {
    const chatId = 'test-chat-004';
    const rafIdRef = { current: new Map<string, number>() };
    const flushPendingUpdates = vi.fn();

    const scheduleUpdate = createScheduleUpdate(
      chatId,
      rafIdRef,
      flushPendingUpdates
    );

    // 第一次调度
    scheduleUpdate();

    // 验证：RAF 被调度
    expect(rafIdRef.current.has(chatId)).toBe(true);
    const rafId = rafIdRef.current.get(chatId);
    expect(rafId).toBeGreaterThan(0);

    // 第二次调度（应该被忽略）
    scheduleUpdate();

    // 验证：RAF ID 没有变化
    expect(rafIdRef.current.get(chatId)).toBe(rafId);

    // 执行 RAF
    vi.runAllTimers();

    // 验证：flushPendingUpdates 被调用
    expect(flushPendingUpdates).toHaveBeenCalledTimes(1);
  });

  // ==================== TC-HELPER-003 ====================
  it('TC-HELPER-003: createDonePromise - Promise 创建', async () => {
    const { promise, resolve } = createDonePromise();

    // 验证：promise 是 Promise 对象
    expect(promise).toBeInstanceOf(Promise);

    // 验证：resolve 是函数
    expect(typeof resolve).toBe('function');

    // 验证：resolve 可以正常工作
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });

    resolve();

    await promise;

    expect(resolved).toBe(true);
  });

  // ==================== TC-HELPER-004 ====================
  it('TC-HELPER-004: createToolCallsPromise - Promise 创建', async () => {
    const { promise, resolve } = createToolCallsPromise();

    // 验证：promise 是 Promise 对象
    expect(promise).toBeInstanceOf(Promise);

    // 验证：resolve 是函数
    expect(typeof resolve).toBe('function');

    // 验证：resolve 可以正常工作
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });

    resolve();

    await promise;

    expect(resolved).toBe(true);
  });

  // ==================== 额外测试：空内容不触发更新 ====================
  it('额外测试: createFlushPendingUpdates - 空内容不触发更新', () => {
    const chatId = 'test-chat-005';
    const messageId = 'test-msg-005';
    const pendingContentRef = {
      current: new Map<string, PendingContent>([
        [chatId, { messageId, content: '', reasoning: '' }],
      ]),
    };
    const rafIdRef = { current: new Map<string, number>() };
    const setChats = vi.fn();

    const flushPendingUpdates = createFlushPendingUpdates(
      chatId,
      pendingContentRef,
      rafIdRef,
      setChats
    );

    flushPendingUpdates();

    // 验证：setChats 不被调用（因为内容为空）
    expect(setChats).not.toHaveBeenCalled();

    // 验证：rafId 被删除
    expect(rafIdRef.current.has(chatId)).toBe(false);
  });

  // ==================== 额外测试：reasoning 内容更新 ====================
  it('额外测试: createFlushPendingUpdates - reasoning 内容更新', () => {
    const chatId = 'test-chat-006';
    const messageId = 'test-msg-006';
    const pendingContentRef = {
      current: new Map<string, PendingContent>([
        [chatId, { messageId, content: '', reasoning: 'Thinking...' }],
      ]),
    };
    const rafIdRef = { current: new Map<string, number>() };
    const mockChats: Chat[] = [createMockChat(chatId)];
    const setChats = vi.fn((updater) => {
      if (typeof updater === 'function') {
        const newChats = updater(mockChats);
        // 验证 reasoning 被设置
        expect(newChats[0].messages[0].reasoningContent).toBe('Thinking...');
      }
    });

    const flushPendingUpdates = createFlushPendingUpdates(
      chatId,
      pendingContentRef,
      rafIdRef,
      setChats
    );

    flushPendingUpdates();

    expect(setChats).toHaveBeenCalled();
  });
});
