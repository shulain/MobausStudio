/**
 * MCP 工具调用限制测试
 *
 * 测试工具调用的各种限制逻辑
 */

import { describe, it, expect } from 'vitest';
import type { AgentLimits } from '../../types';

describe('MCP Tool Limits', () => {
    /**
     * 模拟限制检查逻辑
     */
    const checkLimits = (
        limits: AgentLimits,
        currentToolCallCount: number,
        currentExecutionTime: number,
        requestedToolCount: number
    ) => {
        const maxTotalToolCalls = limits.maxTotalToolCalls || 200;
        const maxExecutionTime = (limits.maxExecutionTime || 600) * 1000;
        const maxToolsPerCall = limits.maxToolsPerCall || 5;

        // 检查总执行时间
        if (currentExecutionTime > maxExecutionTime) {
            return {
                allowed: false,
                reason: 'execution_time_exceeded',
                message: `总执行时间超过限制（${maxExecutionTime / 1000}秒）`,
            };
        }

        // 检查总工具调用次数
        if (currentToolCallCount + requestedToolCount > maxTotalToolCalls) {
            return {
                allowed: false,
                reason: 'total_calls_exceeded',
                message: `累计调用次数超过限制（${maxTotalToolCalls}次）`,
                currentCount: currentToolCallCount,
            };
        }

        // 检查单次调用数量
        if (requestedToolCount > maxToolsPerCall) {
            return {
                allowed: true,
                truncated: true,
                allowedCount: maxToolsPerCall,
                message: `单次工具调用数量超限，将只执行前 ${maxToolsPerCall} 个`,
            };
        }

        return { allowed: true };
    };

    describe('默认限制值', () => {
        it('should use default limits when not specified', () => {
            const limits: AgentLimits = {};
            const result = checkLimits(limits, 0, 0, 3);

            expect(result.allowed).toBe(true);
        });

        it('should apply default maxTotalToolCalls (200)', () => {
            const limits: AgentLimits = {};
            const result = checkLimits(limits, 199, 0, 2);

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('total_calls_exceeded');
        });

        it('should apply default maxExecutionTime (600s)', () => {
            const limits: AgentLimits = {};
            const result = checkLimits(limits, 0, 601 * 1000, 1);

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('execution_time_exceeded');
        });

        it('should apply default maxToolsPerCall (5)', () => {
            const limits: AgentLimits = {};
            const result = checkLimits(limits, 0, 0, 10);

            expect(result.allowed).toBe(true);
            expect(result.truncated).toBe(true);
            expect(result.allowedCount).toBe(5);
        });
    });

    describe('自定义限制值', () => {
        it('should respect custom maxTotalToolCalls', () => {
            const limits: AgentLimits = { maxTotalToolCalls: 50 };
            const result = checkLimits(limits, 49, 0, 2);

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('total_calls_exceeded');
        });

        it('should respect custom maxExecutionTime', () => {
            const limits: AgentLimits = { maxExecutionTime: 60 }; // 60秒
            const result = checkLimits(limits, 0, 61 * 1000, 1);

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('execution_time_exceeded');
        });

        it('should respect custom maxToolsPerCall', () => {
            const limits: AgentLimits = { maxToolsPerCall: 3 };
            const result = checkLimits(limits, 0, 0, 5);

            expect(result.allowed).toBe(true);
            expect(result.truncated).toBe(true);
            expect(result.allowedCount).toBe(3);
        });
    });

    describe('边界情况', () => {
        it('should allow exactly at the limit', () => {
            const limits: AgentLimits = { maxTotalToolCalls: 100 };
            const result = checkLimits(limits, 95, 0, 5);

            expect(result.allowed).toBe(true);
        });

        it('should reject when exceeding by 1', () => {
            const limits: AgentLimits = { maxTotalToolCalls: 100 };
            const result = checkLimits(limits, 95, 0, 6);

            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('total_calls_exceeded');
        });

        it('should handle zero requested tools', () => {
            const limits: AgentLimits = {};
            const result = checkLimits(limits, 0, 0, 0);

            expect(result.allowed).toBe(true);
        });

        it('should handle very large numbers', () => {
            const limits: AgentLimits = { maxTotalToolCalls: 1000000 };
            const result = checkLimits(limits, 999999, 0, 1);

            expect(result.allowed).toBe(true);
        });
    });

    describe('多重限制检查顺序', () => {
        it('should check execution time first', () => {
            const limits: AgentLimits = {
                maxExecutionTime: 60,
                maxTotalToolCalls: 100,
            };
            // 同时超过时间和次数限制
            const result = checkLimits(limits, 101, 61 * 1000, 1);

            // 应该先报告时间超限
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('execution_time_exceeded');
        });

        it('should check total calls before per-call limit', () => {
            const limits: AgentLimits = {
                maxTotalToolCalls: 100,
                maxToolsPerCall: 5,
            };
            // 同时超过总次数和单次数量限制
            const result = checkLimits(limits, 99, 0, 10);

            // 应该先报告总次数超限
            expect(result.allowed).toBe(false);
            expect(result.reason).toBe('total_calls_exceeded');
        });

        it('should truncate when only per-call limit exceeded', () => {
            const limits: AgentLimits = {
                maxTotalToolCalls: 100,
                maxToolsPerCall: 5,
            };
            const result = checkLimits(limits, 50, 0, 10);

            // 应该允许但截断
            expect(result.allowed).toBe(true);
            expect(result.truncated).toBe(true);
            expect(result.allowedCount).toBe(5);
        });
    });

    describe('实际使用场景', () => {
        it('should handle typical usage pattern', () => {
            const limits: AgentLimits = {
                maxTotalToolCalls: 200,
                maxToolsPerCall: 5,
                maxExecutionTime: 600,
            };

            // 模拟多轮调用
            let totalCalls = 0;
            let executionTime = 0;

            // 第1轮：调用3个工具
            let result = checkLimits(limits, totalCalls, executionTime, 3);
            expect(result.allowed).toBe(true);
            totalCalls += 3;
            executionTime += 10000; // 10秒

            // 第2轮：调用5个工具
            result = checkLimits(limits, totalCalls, executionTime, 5);
            expect(result.allowed).toBe(true);
            totalCalls += 5;
            executionTime += 15000; // 15秒

            // 第3轮：尝试调用10个工具（应该被截断）
            result = checkLimits(limits, totalCalls, executionTime, 10);
            expect(result.allowed).toBe(true);
            expect(result.truncated).toBe(true);
            expect(result.allowedCount).toBe(5);
            totalCalls += 5;
            executionTime += 20000; // 20秒

            // 验证累计值
            expect(totalCalls).toBe(13);
            expect(executionTime).toBe(45000);
        });

        it('should prevent infinite loops', () => {
            const limits: AgentLimits = {
                maxTotalToolCalls: 50,
                maxToolsPerCall: 5,
            };

            // 模拟无限循环场景
            let totalCalls = 0;
            let loopCount = 0;

            while (loopCount < 100) {
                const result = checkLimits(limits, totalCalls, 0, 5);
                if (!result.allowed) {
                    break;
                }
                totalCalls += 5;
                loopCount++;
            }

            // 应该在第10轮停止（10 * 5 = 50）
            expect(loopCount).toBe(10);
            expect(totalCalls).toBe(50);
        });

        it('should handle long-running tasks', () => {
            const limits: AgentLimits = {
                maxExecutionTime: 300, // 5分钟
            };

            // 模拟长时间运行
            const startTime = 0;
            let currentTime = startTime;

            // 每30秒调用一次
            const results = [];
            for (let i = 0; i < 12; i++) {
                const result = checkLimits(limits, i, currentTime - startTime, 1);
                results.push(result.allowed);
                currentTime += 30000; // 30秒
            }

            // 前11次应该成功（0-300秒），第11次开始失败（330秒）
            expect(results.slice(0, 11).every(r => r)).toBe(true);
            expect(results.slice(11).every(r => !r)).toBe(true);
        });
    });

    describe('错误消息', () => {
        it('should provide clear message for execution time limit', () => {
            const limits: AgentLimits = { maxExecutionTime: 120 };
            const result = checkLimits(limits, 0, 121 * 1000, 1);

            expect(result.message).toContain('120秒');
        });

        it('should provide clear message for total calls limit', () => {
            const limits: AgentLimits = { maxTotalToolCalls: 100 };
            const result = checkLimits(limits, 100, 0, 1);

            expect(result.message).toContain('100次');
        });

        it('should provide clear message for per-call limit', () => {
            const limits: AgentLimits = { maxToolsPerCall: 3 };
            const result = checkLimits(limits, 0, 0, 10);

            expect(result.message).toContain('3');
        });

        it('should include current count in total calls message', () => {
            const limits: AgentLimits = { maxTotalToolCalls: 100 };
            const result = checkLimits(limits, 95, 0, 10);

            expect(result.currentCount).toBe(95);
        });
    });
});
