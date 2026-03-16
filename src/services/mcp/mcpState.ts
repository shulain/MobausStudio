/**
 * MCP 服务器状态管理纯函数
 *
 * 职责：
 * - MCP 服务器连接/断开状态更新
 * - 工具列表更新
 * - 错误状态管理
 *
 * 特点：
 * - 纯函数，无副作用
 * - 易于测试
 * - 可复用
 *
 * @module services/mcp/mcpState
 * @version 1.0.0
 */

import type { MCPServer, MCPTool, MCPServerInfo } from '../../types';

// ==================== 类型定义 ====================

/**
 * MCP 连接结果
 */
export interface MCPConnectResult {
  success: boolean;
  serverInfo?: MCPServerInfo;
  tools?: MCPTool[];
  errorMessage?: string;
}

// ==================== 纯函数 ====================

/**
 * 更新 MCP 服务器连接状态
 *
 * @param servers - 服务器列表
 * @param serverId - 服务器 ID
 * @param status - 新状态
 * @returns 更新后的服务器列表
 *
 * @example
 * ```ts
 * const updated = updateMCPServerStatus(servers, 'server-1', 'connecting');
 * ```
 */
export function updateMCPServerStatus(
  servers: MCPServer[],
  serverId: string,
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
): MCPServer[] {
  return servers.map(s =>
    s.id === serverId
      ? { ...s, status }
      : s
  );
}

/**
 * 更新 MCP 服务器连接成功状态
 *
 * @param servers - 服务器列表
 * @param serverId - 服务器 ID
 * @param result - 连接结果
 * @returns 更新后的服务器列表
 *
 * @example
 * ```ts
 * const updated = updateMCPServerConnected(servers, 'server-1', {
 *   success: true,
 *   serverInfo: { name: 'Test', version: '1.0.0' },
 *   tools: [...],
 * });
 * ```
 */
export function updateMCPServerConnected(
  servers: MCPServer[],
  serverId: string,
  result: MCPConnectResult
): MCPServer[] {
  return servers.map(s =>
    s.id === serverId
      ? {
          ...s,
          status: 'connected' as const,
          lastActiveAt: new Date(),
          errorMessage: undefined,
          serverInfo: result.serverInfo,
          tools: result.tools,
        }
      : s
  );
}

/**
 * 更新 MCP 服务器连接失败状态
 *
 * @param servers - 服务器列表
 * @param serverId - 服务器 ID
 * @param errorMessage - 错误消息
 * @returns 更新后的服务器列表
 *
 * @example
 * ```ts
 * const updated = updateMCPServerError(servers, 'server-1', 'Connection failed');
 * ```
 */
export function updateMCPServerError(
  servers: MCPServer[],
  serverId: string,
  errorMessage: string
): MCPServer[] {
  return servers.map(s =>
    s.id === serverId
      ? { ...s, status: 'error' as const, errorMessage }
      : s
  );
}

/**
 * 更新 MCP 服务器断开状态
 *
 * @param servers - 服务器列表
 * @param serverId - 服务器 ID
 * @returns 更新后的服务器列表
 *
 * @example
 * ```ts
 * const updated = updateMCPServerDisconnected(servers, 'server-1');
 * ```
 */
export function updateMCPServerDisconnected(
  servers: MCPServer[],
  serverId: string
): MCPServer[] {
  return servers.map(s =>
    s.id === serverId
      ? {
          ...s,
          status: 'disconnected' as const,
          serverInfo: undefined,
          tools: undefined,
          resources: undefined,
        }
      : s
  );
}

/**
 * 查找 MCP 服务器
 *
 * @param servers - 服务器列表
 * @param serverId - 服务器 ID
 * @returns 服务器或 undefined
 *
 * @example
 * ```ts
 * const server = findMCPServer(servers, 'server-1');
 * ```
 */
export function findMCPServer(
  servers: MCPServer[],
  serverId: string
): MCPServer | undefined {
  return servers.find(s => s.id === serverId);
}
