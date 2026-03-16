/**
 * 聊天流式输出 Hook（简化版）
 *
 * 从 App.tsx 提取的流式消息处理逻辑，负责：
 * - 注册 listen('chat-event') 事件监听器
 * - 处理 chunk/reasoning_chunk 事件，累积内容到 pendingContentRef
 * - RAF 批量更新：scheduleUpdate + flushPendingUpdates
 * - 处理 done/error 事件，触发回调
 * - 管理 unlistenMapRef，支持停止生成
 * - 组件卸载时清理所有监听器和 RAF
 *
 * 注意：工具调用循环（tool_calls 事件）保留在 handleSendMessage 中，
 * 由外部通过 onToolCalls 回调处理。
 *
 * @module hooks/useChatStream
 * @version 1.0.0
 */

import { useRef, useCallback, useEffect } from 'react';
import { listen, type UnlistenFn, type Event } from '@tauri-apps/api/event';
import { logger, LogTags } from '../utils/logger';

// ==================== 类型定义 ====================

/**
 * 聊天事件 Payload 类型
 */
interface ChatEventPayload {
  event: string;
  chat_id: string;
  message_id: string;
  data: {
    content?: string;
    reasoning?: string;
    usage?: TokenUsage;
    error?: string;
    tool_calls?: ToolCall[];
  };
}

/**
 * Token 使用量统计
 */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * 工具调用信息
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * chunk 事件回调数据
 */
export interface ChunkData {
  messageId: string;
  content: string;
  reasoning: string;
}

/**
 * done 事件回调数据
 */
export interface DoneData {
  messageId: string;
  usage?: TokenUsage;
}

/**
 * Hook 配置选项
 */
export interface UseChatStreamOptions {
  /** 对话 ID */
  chatId: string;
  /** chunk 事件回调（RAF 批量更新后触发） */
  onChunk: (data: ChunkData) => void;
  /** done 事件回调 */
  onDone: (data: DoneData) => void;
  /** error 事件回调 */
  onError: (error: string) => void;
  /** tool_calls 事件回调（可选，由外部处理工具调用） */
  onToolCalls?: (toolCalls: ToolCall[]) => Promise<void>;
}

/**
 * Hook 返回值
 */
export interface UseChatStreamReturn {
  /** 开始监听流式事件 */
  startListening: () => Promise<UnlistenFn>;
  /** 停止监听（取消事件监听、RAF、清理 refs） */
  stopListening: () => void;
  /** 手动 flush 待处理内容 */
  flushPending: () => void;
}

// ==================== Hook 实现 ====================

/**
 * 聊天流式输出 Hook
 *
 * 管理流式消息的事件监听、RAF 批量更新、内容累积。
 * 工具调用循环由外部通过 onToolCalls 回调处理。
 *
 * @example
 * ```tsx
 * const { startListening, stopListening } = useChatStream({
 *   chatId: 'chat-123',
 *   onChunk: ({ messageId, content, reasoning }) => {
 *     // 更新消息内容
 *   },
 *   onDone: ({ messageId, usage }) => {
 *     // 完成回调
 *   },
 *   onError: (error) => {
 *     // 错误处理
 *   },
 * });
 *
 * // 开始监听
 * const unlisten = await startListening();
 *
 * // 停止生成
 * stopListening();
 * ```
 */
export function useChatStream(options: UseChatStreamOptions): UseChatStreamReturn {
  const { chatId, onChunk, onDone, onError, onToolCalls } = options;

  // ==================== Refs ====================

  // 待处理内容（累积 chunk，RAF 批量更新）
  const pendingContentRef = useRef<{
    messageId: string;
    content: string;
    reasoning: string;
  } | null>(null);

  // RAF ID（用于取消 RAF）
  const rafIdRef = useRef<number | null>(null);

  // 事件监听取消函数
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // ==================== RAF 批量更新 ====================

  /**
   * Flush 待处理内容到 React 状态
   *
   * 在下一帧触发 onChunk 回调，批量更新 UI
   */
  const flushPendingUpdates = useCallback(() => {
    if (!pendingContentRef.current) return;

    const { messageId, content, reasoning } = pendingContentRef.current;

    // 触发回调，更新 React 状态
    onChunk({ messageId, content, reasoning });

    // 清理
    pendingContentRef.current = null;
    rafIdRef.current = null;
  }, [onChunk]);

  /**
   * 调度 RAF 更新
   *
   * 如果已有 RAF 在等待，则不重复调度（合并多个 chunk）
   */
  const scheduleUpdate = useCallback(() => {
    if (rafIdRef.current !== null) {
      // 已有 RAF 在等待，不重复调度
      return;
    }

    rafIdRef.current = requestAnimationFrame(() => {
      flushPendingUpdates();
    });
  }, [flushPendingUpdates]);

  /**
   * 手动 flush 待处理内容
   *
   * 立即触发 onChunk，取消 RAF
   */
  const flushPending = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    flushPendingUpdates();
  }, [flushPendingUpdates]);

  // ==================== 事件监听 ====================

  /**
   * 开始监听流式事件
   *
   * 注册 listen('chat-event')，处理 chunk/done/error/tool_calls 事件
   */
  const startListening = useCallback(async (): Promise<UnlistenFn> => {
    // 清理旧的监听器
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }

    // 注册事件监听
    const unlisten = await listen<ChatEventPayload>('chat-event', async (event: Event<ChatEventPayload>) => {
      const { event: eventType, chat_id, message_id, data } = event.payload;

      // 只处理当前 chatId 的事件
      if (chat_id !== chatId) return;

      try {
        switch (eventType) {
          case 'chunk': {
            // 累积内容到 pendingContentRef
            if (!pendingContentRef.current) {
              pendingContentRef.current = {
                messageId: message_id,
                content: data.content || '',
                reasoning: '',
              };
            } else {
              pendingContentRef.current.content += data.content || '';
            }
            // 调度 RAF 更新
            scheduleUpdate();
            break;
          }

          case 'reasoning_chunk': {
            // 累积 reasoning 内容
            if (!pendingContentRef.current) {
              pendingContentRef.current = {
                messageId: message_id,
                content: '',
                reasoning: data.reasoning || '',
              };
            } else {
              pendingContentRef.current.reasoning += data.reasoning || '';
            }
            scheduleUpdate();
            break;
          }

          case 'done': {
            // Flush 待处理内容
            flushPending();

            // 触发 done 回调
            onDone({
              messageId: message_id,
              usage: data.usage,
            });
            break;
          }

          case 'error': {
            // Flush 待处理内容
            flushPending();

            // 触发 error 回调
            const errorMessage = data.error || '未知错误';
            onError(errorMessage);
            break;
          }

          case 'tool_calls': {
            // 如果提供了 onToolCalls 回调，则调用
            if (onToolCalls && data.tool_calls) {
              await onToolCalls(data.tool_calls);
            }
            break;
          }

          default:
            // 忽略未知事件类型
            break;
        }
      } catch (error) {
        logger.error(LogTags.APP, '处理流式事件失败', { eventType, error });
      }
    });

    // 保存 unlisten 函数
    unlistenRef.current = unlisten;

    return unlisten;
  }, [chatId, onChunk, onDone, onError, onToolCalls, scheduleUpdate, flushPending]);

  /**
   * 停止监听
   *
   * 取消事件监听、RAF、清理 refs
   */
  const stopListening = useCallback(() => {
    // 取消事件监听
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }

    // 取消 RAF
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    // 清理待处理内容
    pendingContentRef.current = null;

    if (import.meta.env.DEV) {
      logger.debug(LogTags.APP, '已停止流式监听', { chatId });
    }
  }, [chatId]);

  // ==================== 清理 Effect ====================

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  // ==================== 返回值 ====================

  return {
    startListening,
    stopListening,
    flushPending,
  };
}
