/**
 * @file pkce.test.ts
 * @description PKCE 工具模块单元测试
 *
 * 对应文档 docs/modules/test-report-v0.9.2.md 中的测试用例
 * TC-PKCE-001 ~ TC-PKCE-007
 *
 * @module test/utils/pkce
 */

import { describe, it, expect, vi } from 'vitest';
import { generateRandomString, generatePKCE, generateState, validateState } from '../../utils/pkce';

// 模拟 logger，避免测试输出日志
vi.mock('../../utils/logger', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
    LogTags: {
        AUTH: 'AUTH',
    },
}));

// RFC 7636 允许的字符集
const VALID_CHARSET = /^[A-Za-z0-9\-._~]+$/;

describe('pkce PKCE 工具', () => {
    describe('generateRandomString', () => {
        /**
         * TC-PKCE-001: 生成随机字符串默认长度
         * 测试场景: 不传参数时应生成 64 字符的随机字符串
         */
        it('TC-PKCE-001: 默认生成 64 字符的随机字符串', () => {
            const result = generateRandomString();
            expect(result).toHaveLength(64);
            expect(result).toMatch(VALID_CHARSET);
        });

        /**
         * TC-PKCE-002: 生成随机字符串自定义长度
         * 测试场景: 传入 length=32 时应生成 32 字符的随机字符串
         */
        it('TC-PKCE-002: 自定义长度生成随机字符串', () => {
            const result = generateRandomString(32);
            expect(result).toHaveLength(32);
            expect(result).toMatch(VALID_CHARSET);
        });
    });

    describe('generatePKCE', () => {
        /**
         * TC-PKCE-003: 生成 PKCE 参数
         * 测试场景: 应生成有效的 verifier 和 challenge
         */
        it('TC-PKCE-003: 生成有效的 PKCE 参数', async () => {
            const pkce = await generatePKCE();

            // verifier 应为 64 字符
            expect(pkce.verifier).toHaveLength(64);
            expect(pkce.verifier).toMatch(VALID_CHARSET);

            // challenge 应为 Base64URL 编码（无填充）
            expect(pkce.challenge).toBeDefined();
            expect(pkce.challenge.length).toBeGreaterThan(0);
            // Base64URL 不包含 +, /, = 字符
            expect(pkce.challenge).not.toMatch(/[+/=]/);
        });
    });

    describe('generateState', () => {
        /**
         * TC-PKCE-004: 生成 state 默认长度
         * 测试场景: 不传参数时应生成 32 字符的 state
         */
        it('TC-PKCE-004: 默认生成 32 字符的 state', () => {
            const state = generateState();
            expect(state).toHaveLength(32);
            expect(state).toMatch(VALID_CHARSET);
        });
    });

    describe('validateState', () => {
        /**
         * TC-PKCE-005: 验证 state 匹配
         * 测试场景: 相同的 state 值应返回 true
         */
        it('TC-PKCE-005: 相同 state 值验证通过', () => {
            expect(validateState('abc123', 'abc123')).toBe(true);
        });

        /**
         * TC-PKCE-006: 验证 state 不匹配
         * 测试场景: 不同的 state 值应返回 false
         */
        it('TC-PKCE-006: 不同 state 值验证失败', () => {
            expect(validateState('abc123', 'xyz789')).toBe(false);
        });

        /**
         * TC-PKCE-007: 验证 state 空值
         * 测试场景: null 值应返回 false
         */
        it('TC-PKCE-007: 空值验证失败', () => {
            expect(validateState(null, 'abc')).toBe(false);
            expect(validateState('abc', null)).toBe(false);
            expect(validateState(null, null)).toBe(false);
        });
    });
});
