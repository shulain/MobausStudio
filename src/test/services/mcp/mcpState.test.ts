/**
 * @file mcpState.test.ts
 * @description mcpState 纯函数单元测试
 *
 * 测试用例：
 * - TC-MCP-STATE-001: updateMCPServerStatus - 更新状态为 connecting
 * - TC-MCP-STATE-002: updateMCPServerStatus - 更新状态为 connected
 * - TC-MCP-STATE-003: updateMCPServerConnected - 连接成功
 * - TC-MCP-STATE-004: updateMCPServerError - 连接失败
 * - TC-MCP-STATE-005: updateMCPServerDisconnected - 断开连接
 * - TC-MCP-STATE-006: findMCPServer - 查找存在的服务器
 * - TC-MCP-STATE-007: findMCPServer - 查找不存在的服务器
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  updateMCPServerStatus,
  updateMCPServerConnected,
  updateMCPServerError,
  updateMCPServerDisconnected,
  findMCPServer,
} from '../../../services/mcp/mcpState';
import type { MCPServer, MCPTool } from '../../../types';

// ==================== 测试辅助 ====================

const createMockServer = (id: string): MCPServer => ({
  id,
  name: `Server ${id}`,
  description: `Server ${id} description`,
  enabled: true,
  authType: 'none',
  requestCount: 0,
  transportType: 'stdio',
  command: 'node',
  args: ['server.js'],
  status: 'disconnected',
  autoStart: false,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const createMockTools = (): MCPTool[] => [
  {
    name: 'tool1',
    description: 'Tool 1',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'tool2',
    description: 'Tool 2',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ==================== 测试用例 ====================

describe('mcpState 纯函数测试', () => {
  // ==================== TC-MCP-STATE-001 ====================
  it('TC-MCP-STATE-001: updateMCPServerStatus - 更新状态为 connecting', () => {
    const servers: MCPServer[] = [
      createMockServer('server-1'),
      createMockServer('server-2'),
    ];

    const result = updateMCPServerStatus(servers, 'server-1', 'connecting');

    // server-1 状态更新
    expect(result[0].status).toBe('connecting');

    // server-2 不受影响
    expect(result[1].status).toBe('disconnected');
  });

  // ==================== TC-MCP-STATE-002 ====================
  it('TC-MCP-STATE-002: updateMCPServerStatus - 更新状态为 connected', () => {
    const servers: MCPServer[] = [
      createMockServer('server-1'),
    ];

    const result = updateMCPServerStatus(servers, 'server-1', 'connected');

    expect(result[0].status).toBe('connected');
  });

  // ==================== TC-MCP-STATE-003 ====================
  it('TC-MCP-STATE-003: updateMCPServerConnected - 连接成功', () => {
    const servers: MCPServer[] = [
      createMockServer('server-1'),
    ];

    const tools = createMockTools();
    const result = updateMCPServerConnected(servers, 'server-1', {
      success: true,
      serverInfo: { name: 'Test Server', version: '1.0.0' },
      tools,
    });

    expect(result[0].status).toBe('connected');
    expect(result[0].serverInfo?.name).toBe('Test Server');
    expect(result[0].serverInfo?.version).toBe('1.0.0');
    expect(result[0].tools).toBe(tools);
    expect(result[0].errorMessage).toBeUndefined();
    expect(result[0].lastActiveAt).toBeInstanceOf(Date);
  });

  // ==================== TC-MCP-STATE-004 ====================
  it('TC-MCP-STATE-004: updateMCPServerError - 连接失败', () => {
    const servers: MCPServer[] = [
      createMockServer('server-1'),
    ];

    const result = updateMCPServerError(servers, 'server-1', 'Connection timeout');

    expect(result[0].status).toBe('error');
    expect(result[0].errorMessage).toBe('Connection timeout');
  });

  // ==================== TC-MCP-STATE-005 ====================
  it('TC-MCP-STATE-005: updateMCPServerDisconnected - 断开连接', () => {
    const servers: MCPServer[] = [
      {
        ...createMockServer('server-1'),
        status: 'connected',
        serverInfo: { name: 'Test', version: '1.0.0' },
        tools: createMockTools(),
      },
    ];

    const result = updateMCPServerDisconnected(servers, 'server-1');

    expect(result[0].status).toBe('disconnected');
    expect(result[0].serverInfo).toBeUndefined();
    expect(result[0].tools).toBeUndefined();
    expect(result[0].resources).toBeUndefined();
  });

  // ==================== TC-MCP-STATE-006 ====================
  it('TC-MCP-STATE-006: findMCPServer - 查找存在的服务器', () => {
    const servers: MCPServer[] = [
      createMockServer('server-1'),
      createMockServer('server-2'),
    ];

    const server = findMCPServer(servers, 'server-1');

    expect(server).toBeDefined();
    expect(server?.id).toBe('server-1');
  });

  // ==================== TC-MCP-STATE-007 ====================
  it('TC-MCP-STATE-007: findMCPServer - 查找不存在的服务器', () => {
    const servers: MCPServer[] = [
      createMockServer('server-1'),
    ];

    const server = findMCPServer(servers, 'non-existent');

    expect(server).toBeUndefined();
  });

  // ==================== 额外测试：边界情况 ====================
  it('额外测试: updateMCPServerStatus - serverId 不存在', () => {
    const servers: MCPServer[] = [
      createMockServer('server-1'),
    ];

    const result = updateMCPServerStatus(servers, 'non-existent', 'connecting');

    // 不影响任何服务器
    expect(result[0].status).toBe('disconnected');
  });

  it('额外测试: updateMCPServerConnected - 无工具列表', () => {
    const servers: MCPServer[] = [
      createMockServer('server-1'),
    ];

    const result = updateMCPServerConnected(servers, 'server-1', {
      success: true,
    });

    expect(result[0].status).toBe('connected');
    expect(result[0].tools).toBeUndefined();
  });
});
