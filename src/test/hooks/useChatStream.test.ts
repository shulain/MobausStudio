/**
 * @file useChatStream.test.ts
 * @description useChatStream Hook 单元测试（简化版）
 *
 * 测试用例对应文档: docs/modules/settings.md
 * - TC-STREAM-001: 注册事件监听
 * - TC-STREAM-002: chunk 事件累积
 * - TC-STREAM-003: RAF 批量更新
 * - TC-STREAM-004: done 事件触发
 * - TC-STREAM-005: error 事件触发
 * - TC-STREAM-006: 停止监听
 * - TC-STREAM-007: 卸载时清理
 * - TC-STREAM-008: 手动 flush
 *
 * @version 1.0.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useChatStream } from '../../hooks/useChatStream';

// ==================== 模拟模块 ====================

// 使用 vi.hoisted 定义需要在 vi.mock 工厂中引用的变量
const { mockUnlisten, mockListen } = vi.hoisted(() => {
  const mockUnlisten = vi.fn();
  const mockListen = vi.fn().mockResolvedValue(mockUnlisten);
  return { mockUnlisten, mockListen };
});

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
  },
}));

// 模拟 Tauri event API
vi.mock('@tauri-apps/api/event', () => ({
  listen: mockListen,
}));

// ==================== 测试辅助 ====================

const createMockOptions = () => ({
  chatId: 'test-chat-id',
  onChunk: vi.fn(),
  onDone: vi.fn(),
  onError: vi.fn(),
  onToolCalls: vi.fn(),
});

// 模拟触发事件
const triggerEvent = (eventType: string, data: any) => {
  const listener = mockListen.mock.calls[0]?.[1];
  if (listener) {
    listener({
      payload: {
        event: eventType,
        chat_id: 'test-chat-id',
        message_id: 'msg-123',
        data,
      },
    });
  }
};

// ==================== 测试用例 ====================

describe('useChatStream Hook 测试（简化版）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==================== TC-STREAM-001 ====================
  it('TC-STREAM-001: 注册事件监听 - startListening 调用 listen', async () => {
    const options = createMockOptions();
    const { result } = renderHook(() => useChatStream(options));

    await act(async () => {
      await result.current.startListening();
    });

    // 验证 listen 被调用
    expect(mockListen).toHaveBeenCalledWith('chat-event', expect.any(Function));
  });

  // ==================== TC-STREAM-002 ====================
  it('TC-STREAM-002: chunk 事件累积 - 内容累积到 pendingContentRef', async () => {
    const options = createMockOptions();
    const { result } = renderHook(() => useChatStream(options));

    await act(async () => {
      await result.current.startListening();
    });

    // 触发 chunk 事件
    act(() => {
      triggerEvent('chunk', { content: 'Hello ' });
    });

    // 等待 RAF 执行
    await act(async () => {
      vi.runAllTimers();
    });

    // 验证 onChunk 被调用
    await waitFor(() => {
      expect(options.onChunk).toHaveBeenCalledWith({
        messageId: 'msg-123',
        content: 'Hello ',
        reasoning: '',
      });
    });
  });

  // ==================== TC-STREAM-003 ====================
  it('TC-STREAM-003: RAF 批量更新 - 多个 chunk 合并为一次更新', async () => {
    const options = createMockOptions();
    const { result } = renderHook(() => useChatStream(options));

    await act(async () => {
      await result.current.startListening();
    });

    // 快速触发多个 chunk 事件
    act(() => {
      triggerEvent('chunk', { content: 'Hello ' });
      triggerEvent('chunk', { content: 'World' });
      triggerEvent('chunk', { content: '!' });
    });

    // 等待 RAF 执行
    await act(async () => {
      vi.runAllTimers();
    });

    // 验证 onChunk 只被调用一次，内容已合并
    await waitFor(() => {
      expect(options.onChunk).toHaveBeenCalledTimes(1);
      expect(options.onChunk).toHaveBeenCalledWith({
        messageId: 'msg-123',
        content: 'Hello World!',
        reasoning: '',
      });
    });
  });

  // ==================== TC-STREAM-004 ====================
  it('TC-STREAM-004: done 事件触发 - 调用 flushPending + onDone', async () => {
    const options = createMockOptions();
    const { result } = renderHook(() => useChatStream(options));

    await act(async () => {
      await result.current.startListening();
    });

    // 触发 chunk 然后 done
    act(() => {
      triggerEvent('chunk', { content: 'Test' });
      triggerEvent('done', {
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      });
    });

    // 等待处理
    await act(async () => {
      vi.runAllTimers();
    });

    // 验证 onChunk 和 onDone 都被调用
    await waitFor(() => {
      expect(options.onChunk).toHaveBeenCalledWith({
        messageId: 'msg-123',
        content: 'Test',
        reasoning: '',
      });
      expect(options.onDone).toHaveBeenCalledWith({
        messageId: 'msg-123',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      });
    });
  });

  // ==================== TC-STREAM-005 ====================
  it('TC-STREAM-005: error 事件触发 - 调用 flushPending + onError', async () => {
    const options = createMockOptions();
    const { result } = renderHook(() => useChatStream(options));

    await act(async () => {
      await result.current.startListening();
    });

    // 触发 chunk 然后 error
    act(() => {
      triggerEvent('chunk', { content: 'Test' });
      triggerEvent('error', { error: '测试错误' });
    });

    await act(async () => {
      vi.runAllTimers();
    });

    // 验证 onChunk 和 onError 都被调用
    await waitFor(() => {
      expect(options.onChunk).toHaveBeenCalled();
      expect(options.onError).toHaveBeenCalledWith('测试错误');
    });
  });

  // ==================== TC-STREAM-006 ====================
  it('TC-STREAM-006: 停止监听 - 取消事件监听、RAF、清理 refs', async () => {
    const options = createMockOptions();
    const { result } = renderHook(() => useChatStream(options));

    await act(async () => {
      await result.current.startListening();
    });

    // 触发 chunk（不等待 RAF）
    act(() => {
      triggerEvent('chunk', { content: 'Test' });
    });

    // 立即停止监听
    act(() => {
      result.current.stopListening();
    });

    // 等待 RAF 时间
    await act(async () => {
      vi.runAllTimers();
    });

    // 验证 unlisten 被调用
    expect(mockUnlisten).toHaveBeenCalled();

    // 验证 onChunk 不会被调用（RAF 已取消）
    expect(options.onChunk).not.toHaveBeenCalled();
  });

  // ==================== TC-STREAM-007 ====================
  it('TC-STREAM-007: 卸载时清理 - 清理所有监听器和 RAF', async () => {
    const options = createMockOptions();
    const { result, unmount } = renderHook(() => useChatStream(options));

    await act(async () => {
      await result.current.startListening();
    });

    // 触发 chunk
    act(() => {
      triggerEvent('chunk', { content: 'Test' });
    });

    // 卸载组件
    unmount();

    // 验证 unlisten 被调用
    expect(mockUnlisten).toHaveBeenCalled();
  });

  // ==================== TC-STREAM-008 ====================
  it('TC-STREAM-008: 手动 flush - 立即触发 onChunk', async () => {
    const options = createMockOptions();
    const { result } = renderHook(() => useChatStream(options));

    await act(async () => {
      await result.current.startListening();
    });

    // 触发 chunk（不等待 RAF）
    act(() => {
      triggerEvent('chunk', { content: 'Test' });
    });

    // 手动 flush
    act(() => {
      result.current.flushPending();
    });

    // 验证 onChunk 立即被调用
    expect(options.onChunk).toHaveBeenCalledWith({
      messageId: 'msg-123',
      content: 'Test',
      reasoning: '',
    });
  });

  // ==================== 额外测试：reasoning_chunk ====================
  it('额外测试: reasoning_chunk 事件累积', async () => {
    const options = createMockOptions();
    const { result } = renderHook(() => useChatStream(options));

    await act(async () => {
      await result.current.startListening();
    });

    // 触发 reasoning_chunk 事件
    act(() => {
      triggerEvent('reasoning_chunk', { reasoning: 'Thinking...' });
    });

    await act(async () => {
      vi.runAllTimers();
    });

    // 验证 onChunk 被调用，reasoning 字段有值
    await waitFor(() => {
      expect(options.onChunk).toHaveBeenCalledWith({
        messageId: 'msg-123',
        content: '',
        reasoning: 'Thinking...',
      });
    });
  });

  // ==================== 额外测试：tool_calls 回调 ====================
  it('额外测试: tool_calls 事件触发 onToolCalls 回调', async () => {
    const options = createMockOptions();
    const { result } = renderHook(() => useChatStream(options));

    await act(async () => {
      await result.current.startListening();
    });

    // 触发 tool_calls 事件
    await act(async () => {
      triggerEvent('tool_calls', {
        tool_calls: [
          { id: 'call-1', name: 'test_tool', arguments: '{}' },
        ],
      });
    });

    // 验证 onToolCalls 被调用
    await waitFor(() => {
      expect(options.onToolCalls).toHaveBeenCalledWith([
        { id: 'call-1', name: 'test_tool', arguments: '{}' },
      ]);
    });
  });

  // ==================== 额外测试：忽略其他 chatId 的事件 ====================
  it('额外测试: 忽略其他 chatId 的事件', async () => {
    const options = createMockOptions();
    const { result } = renderHook(() => useChatStream(options));

    await act(async () => {
      await result.current.startListening();
    });

    // 触发其他 chatId 的事件
    const listener = mockListen.mock.calls[0]?.[1];
    act(() => {
      listener({
        payload: {
          event: 'chunk',
          chat_id: 'other-chat-id', // 不同的 chatId
          message_id: 'msg-456',
          data: { content: 'Should be ignored' },
        },
      });
    });

    await act(async () => {
      vi.runAllTimers();
    });

    // 验证 onChunk 不被调用
    expect(options.onChunk).not.toHaveBeenCalled();
  });
});
