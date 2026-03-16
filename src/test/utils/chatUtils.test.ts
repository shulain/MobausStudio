import { describe, expect, it } from 'vitest';
import type { Attachment, Message } from '../../types';
import { buildApiMessages } from '../../utils/chatUtils';

describe('chatUtils', () => {
    describe('buildApiMessages', () => {
        it('should handle text-only messages', () => {
            const history: Message[] = [
                { id: '1', chatId: 'c1', role: 'user', content: 'Hello', createdAt: new Date() },
                { id: '2', chatId: 'c1', role: 'assistant', content: 'Hi', createdAt: new Date() }
            ];
            const currentContent = 'How are you?';
            const currentAttachments: Attachment[] = [];

            const result = buildApiMessages(history, currentContent, currentAttachments);

            expect(result).toHaveLength(3);
            expect(result[0]).toEqual({ role: 'user', content: 'Hello' });
            expect(result[1]).toEqual({ role: 'assistant', content: 'Hi' });
            expect(result[2]).toEqual({ role: 'user', content: 'How are you?' });
        });

        it('should format history messages with images', () => {
            const history: Message[] = [
                {
                    id: '1', chatId: 'c1', role: 'user', content: 'Look at this', createdAt: new Date(),
                    attachments: [
                        { id: 'a1', type: 'image', name: 'img.png', url: 'data:image/png;base64,123', mimeType: 'image/png', size: 100 }
                    ]
                }
            ];

            const result = buildApiMessages(history, 'next', []);

            expect(result[0].role).toBe('user');
            expect(Array.isArray(result[0].content)).toBe(true);
            expect(result[0].content).toEqual([
                { type: 'text', text: 'Look at this' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,123' } }
            ]);
        });

        it('should format current message with images', () => {
            const attachments: Attachment[] = [
                { id: 'a1', type: 'image', name: 'img.png', url: 'base64url', mimeType: 'image/png', size: 100 }
            ];

            const result = buildApiMessages([], 'Check this', attachments);

            expect(result).toHaveLength(1);
            expect(result[0].content).toEqual([
                { type: 'text', text: 'Check this' },
                { type: 'image_url', image_url: { url: 'base64url' } }
            ]);
        });

        it('should ignore non-image attachments', () => {
            const attachments: Attachment[] = [
                { id: 'a1', type: 'video', name: 'vid.mp4', url: 'url', mimeType: 'video/mp4', size: 100 },
                { id: 'a2', type: 'file', name: 'doc.pdf', url: 'url', mimeType: 'application/pdf', size: 100 }
            ];

            const result = buildApiMessages([], 'File', attachments);

            // Should be text only since no images
            expect(result[0].content).toBe('File');
        });

        // v4.1.24: 工具调用消息格式转换测试
        it('should convert tool call messages to assistant + tool format', () => {
            const history: Message[] = [
                { id: '1', chatId: 'c1', role: 'user', content: '搜索天气', createdAt: new Date() },
                {
                    id: '2', chatId: 'c1', role: 'assistant', content: '', createdAt: new Date(),
                    toolCalls: [{
                        id: 'call_1',
                        name: 'search_web',
                        arguments: '{"query":"天气"}',
                        serverId: 'server1',
                        serverName: 'Web Search',
                    }],
                    toolResults: [{
                        callId: 'call_1',
                        content: '今天晴天，25度',
                        isError: false,
                    }],
                },
            ];

            const result = buildApiMessages(history, '谢谢', []);

            // 应该有 4 条消息: user + assistant(tool_calls) + tool(result) + user(当前)
            expect(result).toHaveLength(4);
            expect(result[0]).toEqual({ role: 'user', content: '搜索天气' });
            // assistant 消息带 tool_calls
            expect(result[1].role).toBe('assistant');
            expect(result[1].tool_calls).toBeDefined();
            expect(result[1].tool_calls![0].id).toBe('call_1');
            expect(result[1].tool_calls![0].function.name).toBe('server1__search_web');
            // tool 结果消息
            expect(result[2].role).toBe('tool');
            expect(result[2].content).toBe('今天晴天，25度');
            expect(result[2].tool_call_id).toBe('call_1');
            // 当前用户消息
            expect(result[3]).toEqual({ role: 'user', content: '谢谢' });
        });

        it('should handle tool call messages without results', () => {
            const history: Message[] = [
                {
                    id: '1', chatId: 'c1', role: 'assistant', content: '', createdAt: new Date(),
                    toolCalls: [{
                        id: 'call_1',
                        name: 'read_file',
                        arguments: '{"path":"/tmp/test"}',
                        serverId: 'fs',
                    }],
                },
            ];

            const result = buildApiMessages(history, '继续', []);

            // assistant(tool_calls) + user(当前)
            expect(result).toHaveLength(2);
            expect(result[0].role).toBe('assistant');
            expect(result[0].tool_calls).toHaveLength(1);
        });

        // v4.1.38: 滑动窗口机制测试
        it('should limit history to 50 messages by default (sliding window)', () => {
            // 创建 80 条历史消息
            const history: Message[] = Array.from({ length: 80 }, (_, i) => ({
                id: `msg_${i}`,
                chatId: 'c1',
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: `Message ${i}`,
                createdAt: new Date(),
            }));

            const result = buildApiMessages(history, '新消息', []);

            // 应该只保留最近 50 条历史 + 1 条当前消息 = 51 条
            expect(result).toHaveLength(51);
            // 第一条应该是第 30 条历史消息（80 - 50 = 30）
            expect(result[0].content).toBe('Message 30');
            // 最后一条是当前消息
            expect(result[50].content).toBe('新消息');
        });

        it('should allow custom window size', () => {
            // 创建 150 条历史消息
            const history: Message[] = Array.from({ length: 150 }, (_, i) => ({
                id: `msg_${i}`,
                chatId: 'c1',
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: `Message ${i}`,
                createdAt: new Date(),
            }));

            // 使用自定义窗口大小 100
            const result = buildApiMessages(history, '新消息', [], 100);

            // 应该只保留最近 100 条历史 + 1 条当前消息 = 101 条
            expect(result).toHaveLength(101);
            // 第一条应该是第 50 条历史消息（150 - 100 = 50）
            expect(result[0].content).toBe('Message 50');
        });

        it('should preserve tool call integrity when windowing', () => {
            // 创建 60 条消息，最后几条包含工具调用
            const history: Message[] = [
                // 前 58 条普通消息
                ...Array.from({ length: 58 }, (_, i) => ({
                    id: `msg_${i}`,
                    chatId: 'c1',
                    role: i % 2 === 0 ? 'user' : 'assistant',
                    content: `Message ${i}`,
                    createdAt: new Date(),
                })),
                // 第 59 条：assistant 带工具调用和结果
                {
                    id: 'msg_58',
                    chatId: 'c1',
                    role: 'assistant',
                    content: '',
                    createdAt: new Date(),
                    toolCalls: [{
                        id: 'call_important',
                        name: 'search',
                        arguments: '{}',
                        serverId: 'srv',
                    }],
                    toolResults: [{
                        callId: 'call_important',
                        content: 'Result',
                        isError: false,
                    }],
                },
                // 第 60 条：user 消息
                {
                    id: 'msg_59',
                    chatId: 'c1',
                    role: 'user',
                    content: 'Thanks',
                    createdAt: new Date(),
                },
            ];

            const result = buildApiMessages(history, '继续', []);

            // 应该从包含 tool_calls 的 assistant 消息开始
            const firstAssistant = result.find(m => m.role === 'assistant' && m.tool_calls);
            expect(firstAssistant).toBeDefined();
            expect(firstAssistant!.tool_calls![0].id).toBe('call_important');

            // 应该包含对应的 tool 结果
            const toolResult = result.find(m => m.role === 'tool' && m.tool_call_id === 'call_important');
            expect(toolResult).toBeDefined();
            expect(toolResult!.content).toBe('Result');
        });

        it('should handle empty current message in tool continuation', () => {
            const history: Message[] = [
                { id: '1', chatId: 'c1', role: 'user', content: 'Hello', createdAt: new Date() },
            ];

            // 工具续传时，currentContent 和 currentAttachments 都为空
            const result = buildApiMessages(history, '', []);

            // 应该只返回历史消息，不添加空的 user 消息
            expect(result).toHaveLength(1);
            expect(result[0].content).toBe('Hello');
        });

        it('should preserve tool result image markdown by default', () => {
            const history: Message[] = [
                {
                    id: '1',
                    chatId: 'c1',
                    role: 'assistant',
                    content: '',
                    createdAt: new Date(),
                    toolCalls: [{
                        id: 'call_img',
                        name: 'capture',
                        arguments: '{}',
                        serverId: 'mcp',
                    }],
                    toolResults: [{
                        callId: 'call_img',
                        content: '截图如下 ![img](data:image/png;base64,AAAABBBBCCCC)',
                        isError: false,
                    }],
                },
            ];

            const result = buildApiMessages(history, '', []);
            const toolMessage = result.find(m => m.role === 'tool');

            expect(toolMessage).toBeDefined();
            expect(toolMessage!.content).toContain('data:image/png;base64,AAAABBBBCCCC');
        });

        it('should strip base64 images from tool results when enabled', () => {
            const history: Message[] = [
                {
                    id: '1',
                    chatId: 'c1',
                    role: 'assistant',
                    content: '',
                    createdAt: new Date(),
                    toolCalls: [{
                        id: 'call_img',
                        name: 'capture',
                        arguments: '{}',
                        serverId: 'mcp',
                    }],
                    toolResults: [{
                        callId: 'call_img',
                        content: '截图如下 ![img](data:image/png;base64,AAAABBBBCCCC)',
                        isError: false,
                    }],
                },
            ];

            const result = buildApiMessages(history, '', [], 50, true);
            const toolMessage = result.find(m => m.role === 'tool');

            expect(toolMessage).toBeDefined();
            expect(toolMessage!.content).toContain('[图片已省略]');
            expect(toolMessage!.content).not.toContain('data:image/png;base64,AAAABBBBCCCC');
        });
    });
});
