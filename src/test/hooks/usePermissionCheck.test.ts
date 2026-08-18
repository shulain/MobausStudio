/**
 * @file usePermissionCheck.test.ts
 * @description usePermissionCheck Hook 单元测试
 *
 * 对应文档 docs/modules/test-report-v0.9.2.md 中的测试用例
 * TC-PERM-HOOK-001 ~ TC-PERM-HOOK-006
 *
 * @module test/hooks/usePermissionCheck
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePermissionCheck } from '../../hooks/usePermissionCheck';
import type { Agent } from '../../types';

// 模拟 logger
vi.mock('../../utils/logger', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
    LogTags: {
        PERMISSION: 'PERMISSION',
    },
}));

// 模拟 permissionUtils
vi.mock('../../utils/permissionUtils', () => ({
    checkComprehensivePermission: vi.fn(() => {
        // 简单模拟：无权限配置时全部允许
        return {
            allowed: true,
            requiresApproval: false,
            reason: '无权限限制',
        };
    }),
    shouldAutoApprove: vi.fn(() => false),
}));

// 模拟 constants
vi.mock('../../config/constants', () => ({
    DEFAULT_MAX_TOOL_CALLS: 50,
}));

describe('usePermissionCheck Hook', () => {
    /**
     * TC-PERM-HOOK-001: 无 Agent 时权限检查
     * 测试场景: agent=undefined 时应返回允许
     */
    it('TC-PERM-HOOK-001: 无 Agent 时权限检查返回允许', () => {
        const { result } = renderHook(() => usePermissionCheck({}));

        const permResult = result.current.checkPermission({
            toolName: 'Bash',
            args: { command: 'ls' },
            serverId: 'test-server',
        });

        expect(permResult.allowed).toBe(true);
    });

    /**
     * TC-PERM-HOOK-002: 记录和获取调用次数
     * 测试场景: 调用 recordToolCall 后 getCallCount 应递增
     */
    it('TC-PERM-HOOK-002: 记录和获取调用次数', () => {
        const { result } = renderHook(() => usePermissionCheck({}));

        expect(result.current.getCallCount()).toBe(0);

        act(() => { result.current.recordToolCall(); });
        act(() => { result.current.recordToolCall(); });
        act(() => { result.current.recordToolCall(); });

        expect(result.current.getCallCount()).toBe(3);
    });

    /**
     * TC-PERM-HOOK-003: 重置调用次数
     * 测试场景: resetCallCount 后 getCallCount 应为 0
     */
    it('TC-PERM-HOOK-003: 重置调用次数', () => {
        const { result } = renderHook(() => usePermissionCheck({}));

        act(() => { result.current.recordToolCall(); });
        act(() => { result.current.recordToolCall(); });
        expect(result.current.getCallCount()).toBe(2);

        act(() => { result.current.resetCallCount(); });
        expect(result.current.getCallCount()).toBe(0);
    });

    /**
     * TC-PERM-HOOK-004: 调用次数限制检查
     * 测试场景: 超过 maxToolCalls 时 isCallLimitExceeded 返回 true
     */
    it('TC-PERM-HOOK-004: 超过限制时 isCallLimitExceeded 返回 true', () => {
        // 使用自定义 agent 设置 maxToolCalls=3
        const agent = {
            id: 'test-agent',
            name: 'Test',
            limits: { maxToolCalls: 3 },
        } as Agent;

        const { result } = renderHook(() =>
            usePermissionCheck({ agent })
        );

        expect(result.current.isCallLimitExceeded()).toBe(false);

        act(() => { result.current.recordToolCall(); });
        act(() => { result.current.recordToolCall(); });
        act(() => { result.current.recordToolCall(); });

        expect(result.current.isCallLimitExceeded()).toBe(true);
    });

    /**
     * TC-PERM-HOOK-005: 权限摘要 - 无配置
     * 测试场景: agent 无 permissions 时所有 has* 为 false
     */
    it('TC-PERM-HOOK-005: 无配置时权限摘要正确', () => {
        const { result } = renderHook(() => usePermissionCheck({}));

        const summary = result.current.getPermissionSummary();

        expect(summary.hasPathRestrictions).toBe(false);
        expect(summary.hasToolRestrictions).toBe(false);
        expect(summary.hasAutoApprove).toBe(false);
        expect(summary.allowedPathsCount).toBe(0);
        expect(summary.deniedPathsCount).toBe(0);
        expect(summary.allowRulesCount).toBe(0);
        expect(summary.denyRulesCount).toBe(0);
        expect(summary.maxToolCalls).toBe(50); // DEFAULT_MAX_TOOL_CALLS
        expect(summary.sandboxMode).toBe(false);
    });

    /**
     * TC-PERM-HOOK-006: 权限摘要 - 有配置
     * 测试场景: agent 有完整 permissions 时正确反映配置
     */
    it('TC-PERM-HOOK-006: 有配置时权限摘要正确', () => {
        const agent = {
            id: 'test-agent',
            name: 'Test',
            permissions: {
                allowedPaths: ['/home', '/tmp'],
                deniedPaths: ['/etc'],
                allow: [{ tool: 'Bash' }],
                deny: [{ tool: 'Dangerous' }],
                autoApprove: {
                    readFiles: true,
                },
            },
            limits: {
                maxToolCalls: 100,
                sandboxMode: true,
            },
        } as unknown as Agent;

        const { result } = renderHook(() =>
            usePermissionCheck({ agent })
        );

        const summary = result.current.getPermissionSummary();

        expect(summary.hasPathRestrictions).toBe(true);
        expect(summary.hasToolRestrictions).toBe(true);
        expect(summary.hasAutoApprove).toBe(true);
        expect(summary.allowedPathsCount).toBe(2);
        expect(summary.deniedPathsCount).toBe(1);
        expect(summary.allowRulesCount).toBe(1);
        expect(summary.denyRulesCount).toBe(1);
        expect(summary.maxToolCalls).toBe(100);
        expect(summary.sandboxMode).toBe(true);
    });
});
