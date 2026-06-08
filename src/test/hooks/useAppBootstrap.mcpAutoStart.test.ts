/**
 * @file useAppBootstrap.mcpAutoStart.test.ts
 * @description MCP 自动启动状态合并回归测试
 */

import { describe, expect, it } from 'vitest';
import { applyMcpAutoStartUpdates, type McpAutoStartStatusUpdate } from '../../hooks/useAppBootstrap';
import type { MCPServer } from '../../types';

function createServer(overrides: Partial<MCPServer>): MCPServer {
  return {
    id: 'server',
    name: 'server',
    transportType: 'stdio',
    status: 'disconnected',
    enabled: true,
    autoStart: true,
    requestCount: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as MCPServer;
}

describe('useAppBootstrap MCP 自动启动状态合并', () => {
  it('TC-MCP-AUTOSTART-001: 一个失败一个成功时应同时保留 error 和 connected', () => {
    const connectedAt = new Date('2026-06-08T09:00:00.000Z');
    const servers = [
      createServer({ id: 'mhs', name: 'mhs' }),
      createServer({ id: 'playwright', name: 'playwright' }),
    ];
    const updates: McpAutoStartStatusUpdate[] = [
      {
        serverId: 'mhs',
        status: 'error',
        errorMessage: 'Connection refused',
      },
      {
        serverId: 'playwright',
        status: 'connected',
        connectedAt,
        serverName: 'Playwright',
        serverVersion: '1.0.0',
        tools: [{ name: 'browser_click', description: 'Click', inputSchema: {} }],
      },
    ];

    const result = applyMcpAutoStartUpdates(servers, updates);

    expect(result.find(server => server.id === 'mhs')).toMatchObject({
      status: 'error',
      errorMessage: 'Connection refused',
    });
    expect(result.find(server => server.id === 'playwright')).toMatchObject({
      status: 'connected',
      lastActiveAt: connectedAt,
      serverInfo: {
        name: 'Playwright',
        version: '1.0.0',
      },
      tools: [{ name: 'browser_click', description: 'Click', inputSchema: {} }],
    });
  });
});
