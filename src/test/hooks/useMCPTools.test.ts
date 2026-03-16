/**
 * useMCPTools Hook 单元测试 (v2.1.0)
 *
 * 测试 MCP 工具调用 Hook 的核心功能
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMCPTools, parseAPIToolCalls } from '../../hooks/useMCPTools';
import type { Agent, MCPServer, MCPTool } from '../../types';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

// 测试数据
const mockTool: MCPTool = {
    name: 'read_file',
    description: '读取文件内容',
    inputSchema: {
        type: 'object',
        properties: {
            path: { type: 'string', description: '文件路径' },
        },
        required: ['path'],
    },
};

const mockConnectedServer: MCPServer = {
    id: 'server-1',
    name: 'filesystem',
    description: '文件系统访问',
    enabled: true,
    autoStart: false,
    transportType: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    authType: 'none',
    status: 'connected',
    tools: [mockTool],
    requestCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
};

const mockDisconnectedServer: MCPServer = {
    id: 'server-2',
    name: 'database',
    description: '数据库连接',
    enabled: true,
    autoStart: false,
    transportType: 'http',
    endpoint: 'http://localhost:3000',
    authType: 'none',
    status: 'disconnected',
    tools: [
        {
            name: 'query',
            description: '执行 SQL 查询',
            inputSchema: { type: 'object', properties: {}, required: [] },
        },
    ],
    requestCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
};

const mockAgent: Agent = {
    id: 'agent-1',
    name: '代码助手',
    description: '专业的编程助手',
    model: 'gpt-4',
    skills: [],
    systemPrompt: '',
    temperature: 0.7,
    maxTokens: 4096,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    usageCount: 0,
    enableToolUse: true,
    mcpServers: [
        {
            serverId: 'server-1',
            serverName: 'filesystem',
        },
    ],
};

describe('useMCPTools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('availableTools', () => {
        it('无连接服务器时返回空工具列表', () => {
            const { result } = renderHook(() =>
                useMCPTools({
                    mcpServers: [mockDisconnectedServer],
                })
            );

            expect(result.current.availableTools).toHaveLength(0);
            expect(result.current.hasTools).toBe(false);
            expect(result.current.toolCount).toBe(0);
        });

        it('返回已连接服务器的工具', () => {
            const { result } = renderHook(() =>
                useMCPTools({
                    mcpServers: [mockConnectedServer, mockDisconnectedServer],
                })
            );

            expect(result.current.availableTools).toHaveLength(1);
            expect(result.current.availableTools[0].name).toBe('read_file');
            expect(result.current.availableTools[0].serverId).toBe('server-1');
            expect(result.current.hasTools).toBe(true);
            expect(result.current.toolCount).toBe(1);
        });

        it('根据 Agent 配置筛选服务器', () => {
            const { result } = renderHook(() =>
                useMCPTools({
                    agent: mockAgent,
                    mcpServers: [mockConnectedServer, mockDisconnectedServer],
                })
            );

            // Agent 只配置了 server-1
            expect(result.current.availableTools).toHaveLength(1);
            expect(result.current.availableTools[0].serverId).toBe('server-1');
        });

        it('Agent 未启用工具调用时返回空列表', () => {
            const disabledAgent: Agent = {
                ...mockAgent,
                enableToolUse: false,
            };

            const { result } = renderHook(() =>
                useMCPTools({
                    agent: disabledAgent,
                    mcpServers: [mockConnectedServer],
                })
            );

            expect(result.current.availableTools).toHaveLength(0);
            expect(result.current.hasTools).toBe(false);
        });

        it('根据 Agent 工具白名单筛选工具', () => {
            const agentWithWhitelist: Agent = {
                ...mockAgent,
                mcpServers: [
                    {
                        serverId: 'server-1',
                        serverName: 'filesystem',
                        enabledTools: ['write_file'], // 只启用 write_file，不包含 read_file
                    },
                ],
            };

            const { result } = renderHook(() =>
                useMCPTools({
                    agent: agentWithWhitelist,
                    mcpServers: [mockConnectedServer],
                })
            );

            // read_file 不在白名单中，所以返回空
            expect(result.current.availableTools).toHaveLength(0);
        });

        // v2.5.0: serverName 字段测试
        it('工具列表包含 serverName 字段', () => {
            const { result } = renderHook(() =>
                useMCPTools({
                    mcpServers: [mockConnectedServer],
                })
            );

            expect(result.current.availableTools).toHaveLength(1);
            expect(result.current.availableTools[0].serverName).toBe('filesystem');
            expect(result.current.availableTools[0].serverId).toBe('server-1');
        });
    });

    describe('formatToolsForAPI', () => {
        it('正确格式化 OpenAI tools 格式', () => {
            const { result } = renderHook(() =>
                useMCPTools({
                    mcpServers: [mockConnectedServer],
                })
            );

            const apiTools = result.current.formatToolsForAPI();

            expect(apiTools).toHaveLength(1);
            expect(apiTools[0]).toEqual({
                type: 'function',
                function: {
                    name: 'server-1__read_file',
                    description: '读取文件内容',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: '文件路径' },
                        },
                        required: ['path'],
                    },
                },
            });
        });

        it('无工具时返回空数组', () => {
            const { result } = renderHook(() =>
                useMCPTools({
                    mcpServers: [],
                })
            );

            const apiTools = result.current.formatToolsForAPI();
            expect(apiTools).toHaveLength(0);
        });
    });
});

describe('parseAPIToolCalls', () => {
    it('正确解析 API 返回的工具调用', () => {
        const apiToolCalls = [
            {
                id: 'call-1',
                function: {
                    name: 'server-1__read_file',
                    arguments: '{"path":"/tmp/test.txt"}',
                },
            },
        ];

        const result = parseAPIToolCalls(apiToolCalls);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            id: 'call-1',
            name: 'read_file',
            arguments: '{"path":"/tmp/test.txt"}',
            serverId: 'server-1',
        });
    });

    it('处理工具名包含双下划线的情况', () => {
        const apiToolCalls = [
            {
                id: 'call-2',
                function: {
                    name: 'server-1__tool__with__underscores',
                    arguments: '{}',
                },
            },
        ];

        const result = parseAPIToolCalls(apiToolCalls);

        expect(result[0].serverId).toBe('server-1');
        expect(result[0].name).toBe('tool__with__underscores');
    });

    it('空数组返回空结果', () => {
        const result = parseAPIToolCalls([]);
        expect(result).toHaveLength(0);
    });

    // v2.5.0: parseAPIToolCalls 不包含 serverName（需从服务器列表查找）
    it('解析结果不包含 serverName（需通过 serverId 查找）', () => {
        const apiToolCalls = [
            {
                id: 'call-1',
                function: {
                    name: 'server-1__read_file',
                    arguments: '{"path":"/tmp/test.txt"}',
                },
            },
        ];

        const result = parseAPIToolCalls(apiToolCalls);

        expect(result[0].serverId).toBe('server-1');
        // serverName 需要从 mcpServers 中查找，parseAPIToolCalls 只返回 serverId
        expect(result[0].serverName).toBeUndefined();
    });
});
