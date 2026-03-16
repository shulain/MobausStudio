/**
 * usePermissionCheck Hook (v2.4.0)
 *
 * 提供 Agent 权限检查的 React Hook 封装：
 * - 权限检查方法
 * - 自动批准判断
 * - 工具调用次数跟踪
 * - 执行限制检查
 *
 * @module hooks/usePermissionCheck
 */

import { useCallback, useRef, useMemo } from 'react';
import { logger, LogTags } from '../utils/logger';
import {
    checkComprehensivePermission,
    shouldAutoApprove as checkShouldAutoApprove,
    type ToolCallContext,
    type ComprehensivePermissionResult,
} from '../utils/permissionUtils';
import { DEFAULT_MAX_TOOL_CALLS } from '../config/constants';
import type { Agent } from '../types';

// ==================== 类型定义 ====================

/**
 * Hook 配置选项
 */
export interface UsePermissionCheckOptions {
    /** 当前 Agent */
    agent?: Agent;
    /** 会话 ID（用于跟踪工具调用次数） */
    sessionId?: string;
}

/**
 * 权限配置摘要
 */
export interface PermissionSummary {
    /** 是否配置了路径限制 */
    hasPathRestrictions: boolean;
    /** 是否配置了工具限制 */
    hasToolRestrictions: boolean;
    /** 是否配置了自动批准 */
    hasAutoApprove: boolean;
    /** 允许的路径数量 */
    allowedPathsCount: number;
    /** 禁止的路径数量 */
    deniedPathsCount: number;
    /** 允许的工具规则数量 */
    allowRulesCount: number;
    /** 禁止的工具规则数量 */
    denyRulesCount: number;
    /** 最大工具调用次数 */
    maxToolCalls: number;
    /** 是否启用沙箱模式 */
    sandboxMode: boolean;
}

/**
 * Hook 返回值
 */
export interface UsePermissionCheckReturn {
    /**
     * 检查工具调用权限
     *
     * @param context - 工具调用上下文
     * @returns 综合权限检查结果
     */
    checkPermission: (context: ToolCallContext) => ComprehensivePermissionResult;

    /**
     * 检查是否应自动批准
     *
     * @param context - 工具调用上下文
     * @returns 是否自动批准
     */
    shouldAutoApprove: (context: ToolCallContext) => boolean;

    /**
     * 记录一次工具调用（增加计数）
     */
    recordToolCall: () => void;

    /**
     * 重置工具调用计数（新会话时调用）
     */
    resetCallCount: () => void;

    /**
     * 获取当前工具调用次数
     */
    getCallCount: () => number;

    /**
     * 检查是否超出调用次数限制
     */
    isCallLimitExceeded: () => boolean;

    /**
     * 获取权限配置摘要（用于 UI 显示）
     */
    getPermissionSummary: () => PermissionSummary;
}

// ==================== Hook 实现 ====================

/**
 * Agent 权限检查 Hook
 *
 * @param options - Hook 配置选项
 * @returns 权限检查方法和状态
 *
 * @example
 * ```tsx
 * const { checkPermission, shouldAutoApprove, recordToolCall } = usePermissionCheck({
 *     agent: currentAgent,
 *     sessionId: chatId,
 * });
 *
 * // 检查权限
 * const result = checkPermission({
 *     toolName: 'Bash',
 *     args: { command: 'npm run build' },
 *     serverId: 'server-1'
 * });
 *
 * if (!result.allowed) {
 *     console.error('权限拒绝:', result.reason);
 *     return;
 * }
 *
 * if (result.requiresApproval && !shouldAutoApprove(context)) {
 *     // 显示确认对话框
 * }
 *
 * // 执行工具调用后记录
 * recordToolCall();
 * ```
 */
export function usePermissionCheck(
    options: UsePermissionCheckOptions
): UsePermissionCheckReturn {
    const { agent } = options;

    // 工具调用计数器
    // 使用 useRef 避免重渲染时重置
    const callCountRef = useRef<number>(0);

    // 获取权限配置
    const permissions = agent?.permissions;
    const limits = agent?.limits;

    // 计算最大调用次数
    const maxToolCalls = useMemo(() => {
        return limits?.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
    }, [limits?.maxToolCalls]);

    // 是否启用沙箱模式
    const sandboxMode = useMemo(() => {
        return limits?.sandboxMode ?? false;
    }, [limits?.sandboxMode]);

    /**
     * 检查工具调用权限
     */
    const checkPermission = useCallback(
        (context: ToolCallContext): ComprehensivePermissionResult => {
            const result = checkComprehensivePermission({
                context,
                permissions,
                sandboxMode,
                currentCallCount: callCountRef.current,
                maxCallCount: maxToolCalls,
            });

            // 记录权限检查日志
            if (!result.allowed) {
                logger.warn(LogTags.PERMISSION, '权限检查拒绝', {
                    toolName: context.toolName,
                    serverId: context.serverId,
                    reason: result.reason,
                    matchedRule: result.matchedRule,
                });
            } else if (import.meta.env.DEV) {
                logger.debug(LogTags.PERMISSION, '权限检查通过', {
                    toolName: context.toolName,
                    serverId: context.serverId,
                    requiresApproval: result.requiresApproval,
                    matchedRule: result.matchedRule,
                });
            }

            return result;
        },
        [permissions, sandboxMode, maxToolCalls]
    );

    /**
     * 检查是否应自动批准
     */
    const shouldAutoApprove = useCallback(
        (context: ToolCallContext): boolean => {
            return checkShouldAutoApprove(
                context.toolName,
                context.args,
                context.serverId,
                permissions?.autoApprove
            );
        },
        [permissions?.autoApprove]
    );

    /**
     * 记录一次工具调用
     */
    const recordToolCall = useCallback(() => {
        callCountRef.current += 1;

        if (import.meta.env.DEV) {
            logger.debug(LogTags.PERMISSION, '记录工具调用', {
                currentCount: callCountRef.current,
                maxCount: maxToolCalls,
            });
        }
    }, [maxToolCalls]);

    /**
     * 重置工具调用计数
     */
    const resetCallCount = useCallback(() => {
        callCountRef.current = 0;

        if (import.meta.env.DEV) {
            logger.debug(LogTags.PERMISSION, '重置工具调用计数');
        }
    }, []);

    /**
     * 获取当前工具调用次数
     */
    const getCallCount = useCallback(() => {
        return callCountRef.current;
    }, []);

    /**
     * 检查是否超出调用次数限制
     */
    const isCallLimitExceeded = useCallback(() => {
        return callCountRef.current >= maxToolCalls;
    }, [maxToolCalls]);

    /**
     * 获取权限配置摘要
     */
    const getPermissionSummary = useCallback((): PermissionSummary => {
        return {
            hasPathRestrictions: !!(
                (permissions?.allowedPaths && permissions.allowedPaths.length > 0) ||
                (permissions?.deniedPaths && permissions.deniedPaths.length > 0)
            ),
            hasToolRestrictions: !!(
                (permissions?.allow && permissions.allow.length > 0) ||
                (permissions?.deny && permissions.deny.length > 0)
            ),
            hasAutoApprove: !!(
                permissions?.autoApprove &&
                (permissions.autoApprove.readFiles ||
                    permissions.autoApprove.writeFiles ||
                    (permissions.autoApprove.bashCommands &&
                        permissions.autoApprove.bashCommands.length > 0) ||
                    (permissions.autoApprove.mcpTools &&
                        permissions.autoApprove.mcpTools.length > 0))
            ),
            allowedPathsCount: permissions?.allowedPaths?.length ?? 0,
            deniedPathsCount: permissions?.deniedPaths?.length ?? 0,
            allowRulesCount: permissions?.allow?.length ?? 0,
            denyRulesCount: permissions?.deny?.length ?? 0,
            maxToolCalls,
            sandboxMode,
        };
    }, [permissions, maxToolCalls, sandboxMode]);

    return {
        checkPermission,
        shouldAutoApprove,
        recordToolCall,
        resetCallCount,
        getCallCount,
        isCallLimitExceeded,
        getPermissionSummary,
    };
}

export default usePermissionCheck;
