/**
 * mcpConnection 业务逻辑测试
 *
 * 测试范围：
 * - handleMCPConnect: MCP 服务器连接成功/失败/异常
 * - handleMCPDisconnect: MCP 服务器断开成功/失败
 * - 工具列表获取
 * - 旧连接清理
 * - 错误处理
 *
 * @module test/services/mcp/mcpConnection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleMCPConnect,
  handleMCPDisconnect,
} from '../../../services/mcp/mcpConnection';
import type { MCPServer, MCPTool } from '../../../types';

// Mock Tauri invoke
const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

vi.mock('../../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  LogTags: {
    MCP: 'MCP',
  },
}));

describe('mcpConnection 业务逻辑测试', () => {
  const mockServer: MCPServer = {
    id: 'test-mcp-server',
    name: 'Test MCP Server',
    description: 'Test server for unit tests',
    enabled: true,
    autoStart: false,
    transportType: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-test'],
    authType: 'none',
    status: 'disconnected',
    requestCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTools: MCPTool[] = [
    {
      name: 'test_tool_1',
      description: 'Test tool 1',
      inputSchema: {
        type: 'object',
        properties: {
          param1: { type: 'string' },
        },
      },
    },
    {
      name: 'test_tool_2',
      description: 'Test tool 2',
      inputSchema: {
        type: 'object',
        properties: {
          param2: { type: 'number' },
        },
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('TC-MCP-CONN-001: handleMCPConnect - 成功场景', () => {
    it('应该成功连接并获取工具列表', async () => {
      // Mock 断开旧连接成功
      mockInvoke.mockResolvedValueOnce(true);

      // Mock 连接成功
      mockInvoke.mockResolvedValueOnce({
        success: true,
        server_name: 'Test Server',
        server_version: '1.0.0',
        protocol_version: '2025-03-26',
      });

      // Mock 获取工具列表成功
      mockInvoke.mockResolvedValueOnce(mockTools);

      const result = await handleMCPConnect(mockServer);

      // 验证调用顺序
      expect(mockInvoke).toHaveBeenNthCalledWith(1, 'mcp_disconnect', {
        serverId: mockServer.id,
      });
      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'mcp_connect', {
        request: {
          server_id: mockServer.id,
          transport_type: mockServer.transportType,
          command: mockServer.command,
          args: mockServer.args,
          env: mockServer.env,
          endpoint: mockServer.endpoint,
          auth_type: mockServer.authType,
          auth_value: mockServer.authValue,
        },
      });
      expect(mockInvoke).toHaveBeenNthCalledWith(3, 'mcp_list_tools', {
        serverId: mockServer.id,
      });

      // 验证返回结果
      expect(result).toEqual({
        success: true,
        serverInfo: {
          name: 'Test Server',
          version: '1.0.0',
        },
        tools: mockTools,
      });
    });

    it('应该处理没有工具的服务器', async () => {
      mockInvoke.mockResolvedValueOnce(true); // disconnect
      mockInvoke.mockResolvedValueOnce({
        success: true,
        server_name: 'No Tools Server',
        server_version: '1.0.0',
      });
      mockInvoke.mockResolvedValueOnce([]); // 空工具列表

      const result = await handleMCPConnect(mockServer);

      expect(result).toEqual({
        success: true,
        serverInfo: {
          name: 'No Tools Server',
          version: '1.0.0',
        },
        tools: [],
      });
    });

    it('应该处理 HTTP 传输类型', async () => {
      const httpServer: MCPServer = {
        ...mockServer,
        transportType: 'http',
        endpoint: 'https://mcp.example.com',
        authType: 'apikey',
        authValue: 'test-api-key',
      };

      mockInvoke.mockResolvedValueOnce(true); // disconnect
      mockInvoke.mockResolvedValueOnce({
        success: true,
        server_name: 'HTTP Server',
        server_version: '1.0.0',
      });
      mockInvoke.mockResolvedValueOnce(mockTools);

      const result = await handleMCPConnect(httpServer);

      // 验证传递了正确的参数
      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'mcp_connect', {
        request: expect.objectContaining({
          transport_type: 'http',
          endpoint: 'https://mcp.example.com',
          auth_type: 'apikey',
          auth_value: 'test-api-key',
        }),
      });

      expect(result.success).toBe(true);
    });
  });

  describe('TC-MCP-CONN-002: handleMCPConnect - 失败场景', () => {
    it('应该处理连接失败', async () => {
      mockInvoke.mockResolvedValueOnce(true); // disconnect
      mockInvoke.mockResolvedValueOnce({
        success: false,
        error: 'Connection refused',
      });

      const result = await handleMCPConnect(mockServer);

      expect(result).toEqual({
        success: false,
        errorMessage: 'Connection refused',
      });
    });

    it('应该处理连接异常', async () => {
      mockInvoke.mockResolvedValueOnce(true); // disconnect
      mockInvoke.mockRejectedValueOnce(new Error('Network error'));

      const result = await handleMCPConnect(mockServer);

      expect(result).toEqual({
        success: false,
        errorMessage: 'Error: Network error',
      });
    });

    it('应该处理工具列表获取失败', async () => {
      mockInvoke.mockResolvedValueOnce(true); // disconnect
      mockInvoke.mockResolvedValueOnce({
        success: true,
        server_name: 'Test Server',
        server_version: '1.0.0',
      });
      mockInvoke.mockRejectedValueOnce(new Error('Tools list error'));

      const result = await handleMCPConnect(mockServer);

      // 连接成功但工具列表为空
      expect(result).toEqual({
        success: true,
        serverInfo: {
          name: 'Test Server',
          version: '1.0.0',
        },
        tools: [],
      });
    });
  });

  describe('TC-MCP-CONN-003: handleMCPConnect - 旧连接清理', () => {
    it('应该忽略断开旧连接的错误', async () => {
      // Mock 断开旧连接失败（可能本来就没连接）
      mockInvoke.mockRejectedValueOnce(new Error('Not connected'));

      // Mock 新连接成功
      mockInvoke.mockResolvedValueOnce({
        success: true,
        server_name: 'Test Server',
        server_version: '1.0.0',
      });
      mockInvoke.mockResolvedValueOnce(mockTools);

      const result = await handleMCPConnect(mockServer);

      // 应该继续连接，不受断开失败影响
      expect(result.success).toBe(true);
    });
  });

  describe('TC-MCP-CONN-004: handleMCPConnect - serverInfo 处理', () => {
    it('应该处理缺少 serverInfo 的响应', async () => {
      mockInvoke.mockResolvedValueOnce(true); // disconnect
      mockInvoke.mockResolvedValueOnce({
        success: true,
        // 没有 server_name 和 server_version
      });
      mockInvoke.mockResolvedValueOnce(mockTools);

      const result = await handleMCPConnect(mockServer);

      expect(result).toEqual({
        success: true,
        serverInfo: undefined,
        tools: mockTools,
      });
    });

    it('应该处理部分 serverInfo', async () => {
      mockInvoke.mockResolvedValueOnce(true); // disconnect
      mockInvoke.mockResolvedValueOnce({
        success: true,
        server_name: 'Test Server',
        // 没有 server_version
      });
      mockInvoke.mockResolvedValueOnce(mockTools);

      const result = await handleMCPConnect(mockServer);

      // 如果缺少任一字段，serverInfo 应该为 undefined
      expect(result.serverInfo).toBeUndefined();
    });
  });

  describe('TC-MCP-CONN-005: handleMCPDisconnect - 成功场景', () => {
    it('应该成功断开连接', async () => {
      mockInvoke.mockResolvedValueOnce(true);

      const result = await handleMCPDisconnect(mockServer.id, mockServer.name);

      expect(mockInvoke).toHaveBeenCalledWith('mcp_disconnect', {
        serverId: mockServer.id,
      });
      expect(result).toBe(true);
    });
  });

  describe('TC-MCP-CONN-006: handleMCPDisconnect - 失败场景', () => {
    it('应该处理断开失败但仍返回 true', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Disconnect error'));

      const result = await handleMCPDisconnect(mockServer.id, mockServer.name);

      // 即使断开失败也返回 true，因为会标记为断开状态
      expect(result).toBe(true);
    });
  });

  describe('TC-MCP-CONN-007: 边界情况', () => {
    it('应该处理空的 args 数组', async () => {
      const serverWithEmptyArgs: MCPServer = {
        ...mockServer,
        args: [],
      };

      mockInvoke.mockResolvedValueOnce(true); // disconnect
      mockInvoke.mockResolvedValueOnce({
        success: true,
        server_name: 'Test',
        server_version: '1.0.0',
      });
      mockInvoke.mockResolvedValueOnce([]);

      const result = await handleMCPConnect(serverWithEmptyArgs);

      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'mcp_connect', {
        request: expect.objectContaining({
          args: [],
          auth_type: 'none',
          auth_value: undefined,
        }),
      });
      expect(result.success).toBe(true);
    });

    it('应该处理空的 env 对象', async () => {
      const serverWithEmptyEnv: MCPServer = {
        ...mockServer,
        env: {},
      };

      mockInvoke.mockResolvedValueOnce(true); // disconnect
      mockInvoke.mockResolvedValueOnce({
        success: true,
        server_name: 'Test',
        server_version: '1.0.0',
      });
      mockInvoke.mockResolvedValueOnce([]);

      const result = await handleMCPConnect(serverWithEmptyEnv);

      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'mcp_connect', {
        request: expect.objectContaining({
          env: {},
        }),
      });
      expect(result.success).toBe(true);
    });

    it('应该处理 undefined 的可选字段', async () => {
      const minimalServer: MCPServer = {
        ...mockServer,
        command: undefined,
        args: undefined,
        env: undefined,
        endpoint: undefined,
      };

      mockInvoke.mockResolvedValueOnce(true); // disconnect
      mockInvoke.mockResolvedValueOnce({
        success: true,
        server_name: 'Test',
        server_version: '1.0.0',
      });
      mockInvoke.mockResolvedValueOnce([]);

      const result = await handleMCPConnect(minimalServer);

      expect(mockInvoke).toHaveBeenNthCalledWith(2, 'mcp_connect', {
        request: expect.objectContaining({
          server_id: minimalServer.id,
          transport_type: minimalServer.transportType,
        }),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('TC-MCP-CONN-008: 错误消息格式', () => {
    it('应该正确格式化字符串错误', async () => {
      mockInvoke.mockResolvedValueOnce(true); // disconnect
      mockInvoke.mockRejectedValueOnce('Simple error string');

      const result = await handleMCPConnect(mockServer);

      expect(result).toEqual({
        success: false,
        errorMessage: 'Simple error string',
      });
    });

    it('应该正确格式化 Error 对象', async () => {
      mockInvoke.mockResolvedValueOnce(true); // disconnect
      mockInvoke.mockRejectedValueOnce(new Error('Error object'));

      const result = await handleMCPConnect(mockServer);

      expect(result).toEqual({
        success: false,
        errorMessage: 'Error: Error object',
      });
    });

    it('应该处理未知类型的错误', async () => {
      mockInvoke.mockResolvedValueOnce(true); // disconnect
      mockInvoke.mockRejectedValueOnce({ custom: 'error' });

      const result = await handleMCPConnect(mockServer);

      expect(result.errorMessage).toBeDefined();
      expect(typeof result.errorMessage).toBe('string');
    });
  });
});
