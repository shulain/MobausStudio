/**
 * MCP 连接处理业务逻辑
 *
 * 职责：
 * - 处理 MCP 服务器连接
 * - 处理 MCP 服务器断开
 * - 获取工具列表
 *
 * 特点：
 * - 封装 Tauri 命令调用
 * - 统一错误处理
 * - 支持扩展
 *
 * @module services/mcp/mcpConnection
 * @version 1.0.0
 */

import { invoke } from '@tauri-apps/api/core';
import type { MCPServer, MCPTool } from '../../types';
import { logger, LogTags } from '../../utils/logger';
import type { MCPConnectResult } from './mcpState';

// ==================== 类型定义 ====================

/**
 * MCP 连接请求
 */
interface MCPConnectRequest {
  server_id: string;
  transport_type: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  endpoint?: string;
  auth_type?: string;
  auth_value?: string;
}

/**
 * MCP 连接响应
 */
interface MCPConnectResponse {
  success: boolean;
  server_name?: string;
  server_version?: string;
  protocol_version?: string;
  error?: string;
}

// ==================== 核心函数 ====================

/**
 * 尝试断开旧连接
 *
 * 重启后后端 session 可能已清空，断开失败是正常的，忽略错误
 *
 * @param serverId - 服务器 ID
 */
async function tryDisconnectOldSession(serverId: string): Promise<void> {
  try {
    logger.debug(LogTags.MCP, `尝试断开旧 session`, { serverId });
    await invoke<boolean>('mcp_disconnect', { serverId });
    logger.debug(LogTags.MCP, `旧 session 断开成功`, { serverId });
  } catch (e) {
    // 忽略断开错误（可能本来就没连接）
    logger.debug(LogTags.MCP, `旧 session 断开失败（可能不存在）`, { serverId, error: String(e) });
  }
}

/**
 * 获取工具列表
 *
 * @param serverId - 服务器 ID
 * @returns 工具列表
 */
async function fetchTools(serverId: string): Promise<MCPTool[]> {
  try {
    logger.debug(LogTags.MCP, `调用 mcp_list_tools`, { serverId });
    const tools = await invoke<MCPTool[]>('mcp_list_tools', { serverId });
    logger.debug(LogTags.MCP, `mcp_list_tools 返回 ${tools.length} 个工具`, {
      serverId,
      tools: tools.map(t => ({ name: t.name, description: t.description })),
    });
    return tools;
  } catch (e) {
    logger.warn(LogTags.MCP, `获取工具列表失败`, { serverId, error: e });
    return [];
  }
}

/**
 * 处理 MCP 服务器连接
 *
 * @param server - MCP 服务器配置
 * @returns 连接结果
 *
 * @example
 * ```ts
 * const result = await handleMCPConnect(server);
 * if (result.success) {
 *   console.log('Connected:', result.serverInfo);
 * }
 * ```
 */
export async function handleMCPConnect(
  server: MCPServer
): Promise<MCPConnectResult> {
  // v4.2.4: 脱敏日志，避免泄露 endpoint 中的 token 或 command 中的敏感参数
  const sanitizedEndpoint = server.endpoint
    ? server.endpoint.replace(/([?&])(token|key|password|secret)=[^&]*/gi, '$1$2=***')
    : undefined;

  logger.info(LogTags.MCP, `开始连接 MCP 服务器: ${server.name}`, {
    id: server.id,
    transportType: server.transportType,
    endpoint: sanitizedEndpoint,
    // command 可能包含敏感参数，仅在开发环境打印
    ...(import.meta.env.DEV && { command: server.command }),
  });

  try {
    // 先尝试断开旧连接，避免后端残留 session 导致 AlreadyConnected 错误
    logger.debug(LogTags.MCP, `尝试断开旧连接: ${server.id}`);
    await tryDisconnectOldSession(server.id);

    // 调用后端 MCP 连接命令
    const request: MCPConnectRequest = {
      server_id: server.id,
      transport_type: server.transportType,
      command: server.command,
      args: server.args,
      env: server.env,
      endpoint: server.endpoint,
      auth_type: server.authType,
      auth_value: server.authValue,
    };

    logger.debug(LogTags.MCP, `调用后端 mcp_connect 命令`, { serverId: server.id });
    const response = await invoke<MCPConnectResponse>('mcp_connect', { request });

    if (response.success) {
      // 连接成功，获取工具列表
      logger.info(LogTags.MCP, `MCP 服务器连接成功: ${server.name}`, {
        serverName: response.server_name,
        version: response.server_version,
        protocolVersion: response.protocol_version,
      });

      logger.debug(LogTags.MCP, `获取工具列表: ${server.id}`);
      const tools = await fetchTools(server.id);
      logger.info(LogTags.MCP, `获取到 ${tools.length} 个工具`, {
        serverId: server.id,
        toolNames: tools.map(t => t.name),
      });

      return {
        success: true,
        serverInfo: response.server_name && response.server_version
          ? {
              name: response.server_name,
              version: response.server_version,
            }
          : undefined,
        tools,
      };
    } else {
      // 连接失败
      logger.error(LogTags.MCP, `MCP 服务器连接失败: ${server.name}`, {
        error: response.error,
        serverId: server.id,
      });
      return {
        success: false,
        errorMessage: response.error || '连接失败',
      };
    }
  } catch (error) {
    // 异常处理
    const errorMessage = String(error);
    logger.error(LogTags.MCP, `MCP 连接异常: ${server.name}`, {
      error: errorMessage,
      serverId: server.id,
    });
    return {
      success: false,
      errorMessage,
    };
  }
}

/**
 * 处理 MCP 服务器断开
 *
 * @param serverId - 服务器 ID
 * @param serverName - 服务器名称（用于日志）
 * @returns 是否成功断开
 *
 * @example
 * ```ts
 * const success = await handleMCPDisconnect('server-1', 'Test Server');
 * ```
 */
export async function handleMCPDisconnect(
  serverId: string,
  serverName: string
): Promise<boolean> {
  logger.info(LogTags.MCP, `断开 MCP 服务器: ${serverName}`, { serverId });

  try {
    await invoke<boolean>('mcp_disconnect', { serverId });
    logger.info(LogTags.MCP, `MCP 服务器断开成功: ${serverName}`, { serverId });
    return true;
  } catch (error) {
    logger.error(LogTags.MCP, `MCP 服务器断开失败: ${serverName}`, {
      error,
      serverId,
    });
    // 即使断开失败也返回 true，因为我们会标记为断开状态
    return true;
  }
}
