/**
 * @file roundtableStreamFilter.test.ts
 * @description 圆桌总结流监听过滤测试
 *
 * v4.2.5: 测试圆桌总结流监听的 messageId 过滤逻辑
 * 对应文档 docs/modules/agent-orchestration.md 中的测试用例
 *
 * @module test/services/roundtableStreamFilter
 */

import { describe, it, expect } from 'vitest';

/**
 * 模拟流事件 payload
 */
interface ChatEventPayload {
    id: string;
    event: 'chunk' | 'done' | 'error';
    content?: string;
    error?: string;
}

/**
 * 模拟事件处理器
 * 这个函数模拟 App.tsx 中的事件监听逻辑
 */
function createStreamEventHandler(targetMessageId: string) {
    const receivedEvents: ChatEventPayload[] = [];
    let accumulatedContent = '';

    const handler = (payload: ChatEventPayload) => {
        // v4.2.5: 过滤：只处理当前消息的事件
        if (payload.id !== targetMessageId) return;

        receivedEvents.push(payload);

        if (payload.event === 'chunk' && payload.content) {
            accumulatedContent += payload.content;
        }
    };

    return {
        handler,
        getReceivedEvents: () => receivedEvents,
        getAccumulatedContent: () => accumulatedContent,
    };
}

describe('Roundtable Stream Filter (v4.2.5)', () => {
    /**
     * TC-RT-STREAM-001: 单个总结生成
     * 验证正常接收 chunk 并更新内容
     */
    it('TC-RT-STREAM-001: 单个总结生成应正常接收 chunk', () => {
        const targetMessageId = 'msg-summary-1';
        const { handler, getReceivedEvents, getAccumulatedContent } = createStreamEventHandler(targetMessageId);

        // 发送 chunk 事件
        handler({ id: targetMessageId, event: 'chunk', content: 'Hello ' });
        handler({ id: targetMessageId, event: 'chunk', content: 'World' });
        handler({ id: targetMessageId, event: 'done' });

        expect(getReceivedEvents()).toHaveLength(3);
        expect(getAccumulatedContent()).toBe('Hello World');
    });

    /**
     * TC-RT-STREAM-002: 并发总结生成
     * 验证每个总结只接收自己的 chunk，不串流
     */
    it('TC-RT-STREAM-002: 并发总结生成应互不干扰', () => {
        const messageId1 = 'msg-summary-1';
        const messageId2 = 'msg-summary-2';

        const handler1 = createStreamEventHandler(messageId1);
        const handler2 = createStreamEventHandler(messageId2);

        // 交替发送两个消息的事件
        handler1.handler({ id: messageId1, event: 'chunk', content: 'Summary 1: ' });
        handler2.handler({ id: messageId1, event: 'chunk', content: 'Summary 1: ' }); // 应该被过滤
        handler2.handler({ id: messageId2, event: 'chunk', content: 'Summary 2: ' });
        handler1.handler({ id: messageId2, event: 'chunk', content: 'Summary 2: ' }); // 应该被过滤
        handler1.handler({ id: messageId1, event: 'chunk', content: 'Part A' });
        handler2.handler({ id: messageId2, event: 'chunk', content: 'Part B' });

        // 验证 handler1 只接收到 messageId1 的事件
        expect(handler1.getReceivedEvents()).toHaveLength(2);
        expect(handler1.getAccumulatedContent()).toBe('Summary 1: Part A');

        // 验证 handler2 只接收到 messageId2 的事件
        expect(handler2.getReceivedEvents()).toHaveLength(2);
        expect(handler2.getAccumulatedContent()).toBe('Summary 2: Part B');
    });

    /**
     * TC-RT-STREAM-003: 总结与普通对话并发
     * 验证总结和普通对话互不干扰
     */
    it('TC-RT-STREAM-003: 总结与普通对话并发应互不干扰', () => {
        const summaryMessageId = 'msg-summary-1';
        const chatMessageId = 'msg-chat-1';

        const summaryHandler = createStreamEventHandler(summaryMessageId);
        const chatHandler = createStreamEventHandler(chatMessageId);

        // 交替发送总结和对话的事件
        summaryHandler.handler({ id: summaryMessageId, event: 'chunk', content: 'Summary: ' });
        chatHandler.handler({ id: summaryMessageId, event: 'chunk', content: 'Summary: ' }); // 应该被过滤
        chatHandler.handler({ id: chatMessageId, event: 'chunk', content: 'Chat: ' });
        summaryHandler.handler({ id: chatMessageId, event: 'chunk', content: 'Chat: ' }); // 应该被过滤
        summaryHandler.handler({ id: summaryMessageId, event: 'chunk', content: 'Done' });
        chatHandler.handler({ id: chatMessageId, event: 'chunk', content: 'Reply' });

        expect(summaryHandler.getAccumulatedContent()).toBe('Summary: Done');
        expect(chatHandler.getAccumulatedContent()).toBe('Chat: Reply');
    });

    /**
     * TC-RT-STREAM-004: 错误事件过滤
     * 验证其他消息的 error 事件不触发当前总结的错误处理
     */
    it('TC-RT-STREAM-004: 错误事件应正确过滤', () => {
        const targetMessageId = 'msg-summary-1';
        const { handler, getReceivedEvents } = createStreamEventHandler(targetMessageId);

        // 发送其他消息的错误事件
        handler({ id: 'other-message', event: 'error', error: 'Some error' });

        // 发送目标消息的事件
        handler({ id: targetMessageId, event: 'chunk', content: 'Content' });
        handler({ id: targetMessageId, event: 'error', error: 'Target error' });

        // 只应该接收到目标消息的事件
        expect(getReceivedEvents()).toHaveLength(2);
        expect(getReceivedEvents()[0].event).toBe('chunk');
        expect(getReceivedEvents()[1].event).toBe('error');
        expect(getReceivedEvents()[1].error).toBe('Target error');
    });

    /**
     * TC-RT-STREAM-005: done 事件过滤
     * 验证其他消息的 done 事件不触发当前总结的完成状态
     */
    it('TC-RT-STREAM-005: done 事件应正确过滤', () => {
        const targetMessageId = 'msg-summary-1';
        const { handler, getReceivedEvents } = createStreamEventHandler(targetMessageId);

        // 发送其他消息的 done 事件
        handler({ id: 'other-message-1', event: 'done' });
        handler({ id: 'other-message-2', event: 'done' });

        // 发送目标消息的事件
        handler({ id: targetMessageId, event: 'chunk', content: 'Content' });
        handler({ id: targetMessageId, event: 'done' });

        // 只应该接收到目标消息的事件
        expect(getReceivedEvents()).toHaveLength(2);
        expect(getReceivedEvents()[1].event).toBe('done');
    });

    /**
     * 边界情况：空 messageId
     */
    it('空 messageId 应被正确过滤', () => {
        const targetMessageId = 'msg-summary-1';
        const { handler, getReceivedEvents } = createStreamEventHandler(targetMessageId);

        // 发送空 messageId 的事件
        handler({ id: '', event: 'chunk', content: 'Should be filtered' });

        // 发送正常事件
        handler({ id: targetMessageId, event: 'chunk', content: 'Valid content' });

        expect(getReceivedEvents()).toHaveLength(1);
        expect(getReceivedEvents()[0].content).toBe('Valid content');
    });

    /**
     * 边界情况：相似但不同的 messageId
     */
    it('相似但不同的 messageId 应被正确区分', () => {
        const targetMessageId = 'msg-summary-1';
        const { handler, getReceivedEvents } = createStreamEventHandler(targetMessageId);

        // 发送相似但不同的 messageId
        handler({ id: 'msg-summary-10', event: 'chunk', content: 'Should be filtered' });
        handler({ id: 'msg-summary-11', event: 'chunk', content: 'Should be filtered' });
        handler({ id: 'msg-summary-', event: 'chunk', content: 'Should be filtered' });

        // 发送正确的 messageId
        handler({ id: targetMessageId, event: 'chunk', content: 'Valid content' });

        expect(getReceivedEvents()).toHaveLength(1);
        expect(getReceivedEvents()[0].content).toBe('Valid content');
    });
});
