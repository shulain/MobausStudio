/**
 * 圆桌消息气泡组件单元测试
 *
 * 对应文档：docs/modules/agent-orchestration.md
 * 覆盖用例：
 * - TC-RMB-008: 仅工具调用消息不显示思考中占位
 * - TC-RMB-009: 工具调用独立消息不与文本消息重复
 * - TC-RMB-010: 无内容无工具时显示思考中占位
 */

import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { RoundtableMessageBubble } from '../../../components/features/AgentOrchestration/RoundtableMessageBubble';
import { renderWithI18n } from '../../testUtils';
import type { RoundtableMessage, RoundtableParticipant } from '../../../types';

const participants: RoundtableParticipant[] = [
    {
        id: 'p1',
        agentId: 'agent-1',
        role: '架构师',
        speakOrder: 1,
        avatar: '🏗️',
        color: 'blue',
        messageCount: 0,
    },
];

function createBaseMessage(): RoundtableMessage {
    return {
        id: 'm1',
        chatId: 'chat-1',
        role: 'assistant',
        content: '',
        createdAt: new Date(),
        participantId: 'p1',
        round: 1,
    };
}

describe('RoundtableMessageBubble', () => {
    it('test_tc_rmb_008_only_tool_calls_should_not_show_thinking_placeholder', () => {
        const message: RoundtableMessage = {
            ...createBaseMessage(),
            toolCalls: [
                {
                    id: 'call-1',
                    name: 'read_file',
                    arguments: '{"path":"/tmp/demo.txt"}',
                    serverId: 'filesystem',
                    serverName: '文件系统',
                },
            ],
            toolResults: [
                {
                    callId: 'call-1',
                    content: '读取成功',
                    isError: false,
                    duration: 120,
                },
            ],
        };

        renderWithI18n(
            <RoundtableMessageBubble message={message} participants={participants} />
        );

        expect(screen.queryByText(/正在思考中/)).not.toBeInTheDocument();
        expect(screen.getByText('read_file')).toBeInTheDocument();
        expect(screen.getByText('(文件系统)')).toBeInTheDocument();
    });

    it('test_tc_rmb_009_tool_call_should_display_once_on_tool_message', () => {
        const textMessage: RoundtableMessage = {
            ...createBaseMessage(),
            id: 'm-text',
            content: '先看一下文件内容。',
        };

        const toolMessage: RoundtableMessage = {
            ...createBaseMessage(),
            id: 'm-tool',
            toolCalls: [
                {
                    id: 'call-1',
                    name: 'read_file',
                    arguments: '{"path":"/tmp/demo.txt"}',
                    serverId: 'filesystem',
                },
            ],
            toolResults: [
                {
                    callId: 'call-1',
                    content: '读取成功',
                    isError: false,
                },
            ],
        };

        const { unmount } = renderWithI18n(
            <RoundtableMessageBubble message={textMessage} participants={participants} />
        );

        expect(screen.queryByText('read_file')).not.toBeInTheDocument();

        unmount();

        renderWithI18n(
            <RoundtableMessageBubble message={toolMessage} participants={participants} />
        );

        expect(screen.getByText('read_file')).toBeInTheDocument();
        expect(screen.getAllByText('read_file')).toHaveLength(1);
    });

    it('test_tc_rmb_010_empty_message_without_tool_calls_should_show_thinking_placeholder', () => {
        const message: RoundtableMessage = {
            ...createBaseMessage(),
        };

        renderWithI18n(
            <RoundtableMessageBubble message={message} participants={participants} />
        );

        expect(screen.getByText(/正在思考中/)).toBeInTheDocument();
    });
});
