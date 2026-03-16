/**
 * useMCPTools Hook (v2.1.0)
 *
 * 提供 MCP 工具调用的统一接口，用于 Chat/Agent 模块集成
 *
 * @description
 * - 根据 Agent 配置筛选可用的 MCP 服务器和工具
 * - 只返回已连接服务器的工具
 * - 调用 mcp_call_tool Tauri 命令执行工具
 * - 处理工具执行错误和超时
 * - v2.4.0: 集成权限检查
 */

import { useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { logger, LogTags } from '../utils/logger';
import { MCP_TOOL_CALL_TIMEOUT } from '../config/constants';
import { trackEvents } from '../services/analytics';
import { usePermissionCheck } from './usePermissionCheck';
import type { ToolCallContext, ComprehensivePermissionResult } from '../utils/permissionUtils';
import type {
    Agent,
    MCPServer,
    MCPTool,
    ToolCall,
    ToolResult,
    MCPToolResult,
} from '../types';

/** OpenAI/Anthropic API 工具格式 */
export interface APITool {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters: {
            type: 'object';
            properties?: Record<string, unknown>;
            required?: string[];
        };
    };
}

/** 扩展的工具信息（包含服务器信息） */
export interface MCPToolWithServer extends MCPTool {
    serverId: string;
    serverName: string;
}

/** Hook 配置选项 */
export interface UseMCPToolsOptions {
    /** 当前使用的 Agent（可选） */
    agent?: Agent;
    /** 所有 MCP 服务器列表 */
    mcpServers: MCPServer[];
    /** 会话 ID（用于跟踪工具调用次数）(v2.4.0) */
    sessionId?: string;
}

/** Hook 返回值 */
export interface UseMCPToolsReturn {
    /** 获取可用工具（已连接服务器的工具，带服务器信息） */
    availableTools: MCPToolWithServer[];

    /** 执行单个工具调用 */
    callTool: (
        serverId: string,
        toolName: string,
        args: Record<string, unknown>
    ) => Promise<ToolResult>;

    /** 批量执行工具调用（并行执行） */
    callTools: (calls: ToolCall[]) => Promise<ToolResult[]>;

    /** 格式化为 OpenAI/Anthropic API tools 格式 */
    formatToolsForAPI: () => APITool[];

    /** 是否有可用工具 */
    hasTools: boolean;

    /** 可用工具数量 */
    toolCount: number;

    // ===== v2.4.0 新增：权限检查相关 =====

    /** 检查工具调用权限 */
    checkPermission: (context: ToolCallContext) => ComprehensivePermissionResult;

    /** 检查是否应自动批准 */
    shouldAutoApprove: (context: ToolCallContext) => boolean;

    /** 检查是否超出调用次数限制 */
    isCallLimitExceeded: () => boolean;

    /** 重置工具调用计数（新会话时调用） */
    resetCallCount: () => void;
}

/**
 * MCP 工具调用 Hook
 *
 * @example
 * ```tsx
 * const { availableTools, callTool, formatToolsForAPI, hasTools } = useMCPTools({
 *     agent: currentAgent,
 *     mcpServers: mcpServers,
 * });
 *
 * // 格式化工具给 API
 * const tools = hasTools ? formatToolsForAPI() : undefined;
 *
 * // 执行工具调用
 * const result = await callTool('server-id', 'read_file', { path: '/tmp/test.txt' });
 * ```
 */
export function useMCPTools(options: UseMCPToolsOptions): UseMCPToolsReturn {
    const { agent, mcpServers, sessionId } = options;

    // v2.4.0: 初始化权限检查 Hook
    const {
        checkPermission,
        shouldAutoApprove,
        recordToolCall,
        resetCallCount,
        isCallLimitExceeded,
    } = usePermissionCheck({
        agent,
        sessionId,
    });

    /**
     * 获取可用工具列表
     *
     * 筛选逻辑：
     * 1. 只包含已连接 (status === 'connected') 的服务器
     * 2. 如果指定了 Agent，只包含 Agent 配置中的服务器
     * 3. 如果 Agent 配置了 enabledTools，只包含白名单中的工具
     */
    const availableTools = useMemo<MCPToolWithServer[]>(() => {
        // 获取已连接的服务器
        const connectedServers = mcpServers.filter(
            (server) => server.status === 'connected' && server.tools && server.tools.length > 0
        );

        if (connectedServers.length === 0) {
            return [];
        }

        // 如果没有 Agent 或未启用工具调用，返回空
        if (agent && !agent.enableToolUse) {
            return [];
        }

        // 获取 Agent 配置的服务器 ID 集合
        const agentServerIds = agent?.mcpServers?.map((s) => s.serverId) ?? null;

        // 获取 Agent 配置的工具白名单映射
        const toolWhitelist = agent?.mcpServers?.reduce<Record<string, string[] | undefined>>(
            (acc, config) => {
                acc[config.serverId] = config.enabledTools;
                return acc;
            },
            {}
        ) ?? {};

        const tools: MCPToolWithServer[] = [];

        for (const server of connectedServers) {
            // 如果 Agent 指定了服务器，检查是否在列表中
            if (agentServerIds !== null && !agentServerIds.includes(server.id)) {
                continue;
            }

            // 获取该服务器的工具白名单
            const enabledTools = toolWhitelist[server.id];

            for (const tool of server.tools || []) {
                // 如果有白名单，检查工具是否在白名单中
                if (enabledTools && !enabledTools.includes(tool.name)) {
                    continue;
                }

                tools.push({
                    ...tool,
                    serverId: server.id,
                    serverName: server.name,
                });
            }
        }

        return tools;
    }, [mcpServers, agent]);

    /**
     * 执行单个工具调用
     *
     * @param serverId MCP 服务器 ID
     * @param toolName 工具名称
     * @param args 工具参数
     * @returns 工具执行结果
     */
    const callTool = useCallback(
        async (
            serverId: string,
            toolName: string,
            args: Record<string, unknown>
        ): Promise<ToolResult> => {
            const callId = crypto.randomUUID();

            if (import.meta.env.DEV) {
                logger.debug(LogTags.MCP, '调用工具', {
                    serverId,
                    toolName,
                    args,
                });
            }

            // v2.4.0: 权限检查
            const permissionResult = checkPermission({
                toolName,
                args,
                serverId,
            });

            // 权限拒绝
            if (!permissionResult.allowed) {
                logger.warn(LogTags.MCP, '工具调用被权限拒绝', {
                    toolName,
                    serverId,
                    reason: permissionResult.reason,
                    matchedRule: permissionResult.matchedRule,
                });

                return {
                    callId,
                    content: `权限拒绝: ${permissionResult.reason}`,
                    isError: true,
                };
            }

            // 调用次数超限
            if (permissionResult.exceedsCallLimit) {
                logger.warn(LogTags.MCP, '工具调用次数超限', {
                    toolName,
                    currentCount: permissionResult.currentCallCount,
                    maxCount: permissionResult.maxCallCount,
                });

                return {
                    callId,
                    content: `工具调用次数已达上限 (${permissionResult.maxCallCount})`,
                    isError: true,
                };
            }

            try {
                // 检查服务器是否已连接
                const server = mcpServers.find((s) => s.id === serverId);
                if (!server || server.status !== 'connected') {
                    throw new Error(`MCP 服务器未连接: ${serverId}`);
                }

                // 带超时的工具调用
                const result = await Promise.race([
                    invoke<MCPToolResult>('mcp_call_tool', {
                        serverId,
                        toolName,
                        arguments: args,
                    }),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('工具调用超时')), MCP_TOOL_CALL_TIMEOUT)
                    ),
                ]);

                // 将 MCPToolResult 转换为 ToolResult
                // 防御性编程：result.content 可能为 undefined
                const content = (result.content ?? [])
                    .map((c) => {
                        if (c.type === 'text' && c.text) {
                            return c.text;
                        }
                        if (c.type === 'image' && c.data) {
                            return `[图片: ${c.mimeType || 'image/png'}]`;
                        }
                        if (c.type === 'resource' && c.uri) {
                            return `[资源: ${c.uri}]`;
                        }
                        return '[未知内容类型]';
                    })
                    .join('\n');

                if (import.meta.env.DEV) {
                    logger.debug(LogTags.MCP, '工具执行成功', {
                        toolName,
                        isError: result.isError,
                        contentLength: content.length,
                    });
                }

                // v2.6.0: 埋点 - MCP 工具使用
                trackEvents.mcpToolUsed({ serverName: server.name, toolName });

                // v2.4.0: 记录工具调用次数
                recordToolCall();

                return {
                    callId,
                    content,
                    isError: result.isError ?? false,
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);

                if (import.meta.env.DEV) {
                    logger.error(LogTags.MCP, '工具执行失败', {
                        toolName,
                        error: errorMessage,
                    });
                }

                return {
                    callId,
                    content: `工具执行失败: ${errorMessage}`,
                    isError: true,
                };
            }
        },
        [mcpServers, checkPermission, recordToolCall]
    );

    /**
     * 批量执行工具调用（并行执行）
     *
     * @param calls 工具调用列表
     * @returns 工具执行结果列表
     */
    const callTools = useCallback(
        async (calls: ToolCall[]): Promise<ToolResult[]> => {
            if (import.meta.env.DEV) {
                logger.debug(LogTags.MCP, '批量调用工具', { count: calls.length });
            }

            // 并行执行所有工具调用
            const results = await Promise.all(
                calls.map(async (call) => {
                    try {
                        const args = JSON.parse(call.arguments);
                        const result = await callTool(call.serverId, call.name, args);
                        // 使用原始 call.id 作为 callId
                        return {
                            ...result,
                            callId: call.id,
                        };
                    } catch (error) {
                        return {
                            callId: call.id,
                            content: `参数解析失败: ${error instanceof Error ? error.message : String(error)}`,
                            isError: true,
                        };
                    }
                })
            );

            return results;
        },
        [callTool]
    );

    /**
     * 格式化工具为 OpenAI/Anthropic API tools 格式
     *
     * @returns API 工具格式数组
     */
    const formatToolsForAPI = useCallback((): APITool[] => {
        return availableTools.map((tool) => ({
            type: 'function' as const,
            function: {
                // 工具名称格式: serverId__toolName (用于回调时识别服务器)
                name: `${tool.serverId}__${tool.name}`,
                description: tool.description,
                parameters: {
                    type: 'object' as const,
                    properties: tool.inputSchema.properties,
                    required: tool.inputSchema.required,
                },
            },
        }));
    }, [availableTools]);

    return {
        availableTools,
        callTool,
        callTools,
        formatToolsForAPI,
        hasTools: availableTools.length > 0,
        toolCount: availableTools.length,
        // v2.4.0: 权限检查相关
        checkPermission,
        shouldAutoApprove,
        isCallLimitExceeded,
        resetCallCount,
    };
}

/**
 * 解析 API 返回的工具调用
 *
 * 将 AI 返回的 tool_calls 转换为 ToolCall 数组
 *
 * @param apiToolCalls AI 返回的工具调用
 * @returns ToolCall 数组
 */
export function parseAPIToolCalls(
    apiToolCalls: Array<{
        id: string;
        function: {
            name: string;
            arguments: string;
        };
    }>
): ToolCall[] {
    return apiToolCalls.map((call) => {
        // 解析工具名称: serverId__toolName
        const [serverId, ...toolNameParts] = call.function.name.split('__');
        const toolName = toolNameParts.join('__'); // 处理工具名本身包含 __ 的情况

        return {
            id: call.id,
            name: toolName,
            arguments: call.function.arguments,
            serverId,
        };
    });
}

export default useMCPTools;
