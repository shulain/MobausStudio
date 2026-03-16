/**
 * 聊天流式输出辅助函数
 *
 * 从 App.tsx handleSendMessage 提取的纯函数，
 * 用于支持渐进式重构。
 *
 * @module utils/chatStreamHelpers
 * @version 1.0.0
 */

import type { Chat } from '../types';

// ==================== 类型定义 ====================

/**
 * 待处理内容
 */
export interface PendingContent {
  messageId: string;
  content: string;
  reasoning: string;
}

// ==================== RAF 批量更新函数 ====================

/**
 * 创建 flushPendingUpdates 函数
 *
 * 将累积的内容批量更新到 React 状态
 *
 * @param chatId - 对话 ID
 * @param pendingContentRef - 待处理内容 ref
 * @param rafIdRef - RAF ID ref
 * @param setChats - 更新 chats 状态的函数
 * @returns flushPendingUpdates 函数
 */
export function createFlushPendingUpdates(
  chatId: string,
  pendingContentRef: React.MutableRefObject<Map<string, PendingContent>>,
  rafIdRef: React.MutableRefObject<Map<string, number>>,
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>
) {
  return () => {
    const pending = pendingContentRef.current.get(chatId);
    if (!pending || (!pending.content && !pending.reasoning)) {
      rafIdRef.current.delete(chatId);
      return;
    }

    const { messageId, content, reasoning } = pending;
    // 清空累积的内容
    pendingContentRef.current.set(chatId, { messageId, content: '', reasoning: '' });

    setChats(prev => {
      return prev.map(chat => {
        if (chat.id !== chatId) return chat;

        const messages = [...chat.messages];
        const msgIndex = messages.findIndex(m => m.id === messageId);

        if (msgIndex === -1) {
          // 创建新消息 (Assistant)
          if (content || reasoning) {
            messages.push({
              id: messageId,
              chatId,
              role: 'assistant',
              content: content,
              reasoningContent: reasoning || undefined,
              createdAt: new Date()
            });
          }
        } else {
          // 更新现有消息
          const msg = { ...messages[msgIndex] };
          if (content) {
            msg.content += content;
          }
          if (reasoning) {
            msg.reasoningContent = (msg.reasoningContent || '') + reasoning;
          }
          messages[msgIndex] = msg;
        }
        return { ...chat, messages };
      });
    });

    rafIdRef.current.delete(chatId);
  };
}

/**
 * 创建 scheduleUpdate 函数
 *
 * 调度 RAF 更新（如果已有 RAF 在等待，则不重复调度）
 *
 * @param chatId - 对话 ID
 * @param rafIdRef - RAF ID ref
 * @param flushPendingUpdates - flush 函数
 * @returns scheduleUpdate 函数
 */
export function createScheduleUpdate(
  chatId: string,
  rafIdRef: React.MutableRefObject<Map<string, number>>,
  flushPendingUpdates: () => void
) {
  return () => {
    if (!rafIdRef.current.has(chatId)) {
      const id = requestAnimationFrame(flushPendingUpdates);
      rafIdRef.current.set(chatId, id);
    }
  };
}

// ==================== 工具调用同步 ====================

/**
 * 创建 donePromise
 *
 * 用于同步工具调用和 done 事件
 *
 * @returns { promise, resolve }
 */
export function createDonePromise(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolveFunc: (() => void) | null = null;
  const promise = new Promise<void>((resolve) => {
    resolveFunc = resolve;
  });
  return {
    promise,
    resolve: resolveFunc!,
  };
}

/**
 * 创建 toolCallsPromise
 *
 * 用于同步工具调用异步处理
 *
 * @returns { promise, resolve }
 */
export function createToolCallsPromise(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolveFunc: (() => void) | null = null;
  const promise = new Promise<void>((resolve) => {
    resolveFunc = resolve;
  });
  return {
    promise,
    resolve: resolveFunc!,
  };
}

// ==================== 消息处理纯函数 ====================

/**
 * 消息 ID 过滤：检查事件是否属于当前对话
 *
 * @param validMessageIds - 有效的消息 ID 集合
 * @param incomingMessageId - 接收到的消息 ID
 * @returns 是否应该处理该事件
 */
export function shouldProcessEvent(
  validMessageIds: Set<string>,
  incomingMessageId: string
): boolean {
  return validMessageIds.has(incomingMessageId);
}

/**
 * 累积 chunk 内容到待处理缓冲区
 *
 * @param pending - 待处理内容对象
 * @param content - 新的 chunk 内容
 * @param isReasoning - 是否为思考内容
 */
export function accumulateChunkContent(
  pending: PendingContent,
  content: string,
  isReasoning: boolean = false
): void {
  if (isReasoning) {
    pending.reasoning += content;
  } else {
    pending.content += content;
  }
}

/**
 * 计算总 Token 数
 *
 * @param usage - Token 使用统计对象
 * @returns 总 Token 数
 */
export function calculateTotalTokens(usage: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): number {
  return (
    usage.total_tokens ||
    (usage.prompt_tokens || 0) + (usage.completion_tokens || 0)
  );
}

/**
 * 格式化错误消息
 *
 * @param error - 错误信息
 * @param existingContent - 已有的消息内容
 * @returns 格式化后的错误消息
 */
export function formatErrorMessage(
  error: string,
  existingContent: string = ''
): string {
  if (existingContent) {
    return `${existingContent}\n\n⚠️ 错误: ${error}`;
  }
  return `⚠️ 回复失败: ${error}`;
}

/**
 * 检查是否应该跳过 Token 更新
 *
 * @param totalTokens - 总 Token 数
 * @returns 是否应该跳过更新
 */
export function shouldSkipTokenUpdate(totalTokens: number): boolean {
  return totalTokens <= 0;
}
