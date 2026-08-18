/**
 * @file platform.test.ts
 * @description 平台检测工具模块单元测试
 *
 * 对应文档 docs/modules/test-report-v0.9.2.md 中的测试用例
 * TC-PLATFORM-001 ~ TC-PLATFORM-003
 *
 * @module test/utils/platform
 */

import { describe, it, expect, afterEach } from 'vitest';
import { isTauri, isWeb } from '../../utils/platform';

describe('platform 平台检测', () => {
    afterEach(() => {
        // 清理注入的属性
        delete (window as unknown as Record<string, unknown>).__TAURI__;
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    });

    /**
     * TC-PLATFORM-001: Web 环境检测
     * 测试场景: 无 __TAURI__ 属性时应识别为 Web 环境
     */
    it('TC-PLATFORM-001: Web 环境下 isTauri 返回 false，isWeb 返回 true', () => {
        // jsdom 环境默认没有 __TAURI__
        expect(isTauri()).toBe(false);
        expect(isWeb()).toBe(true);
    });

    /**
     * TC-PLATFORM-002: Tauri 环境检测（__TAURI__）
     * 测试场景: 有 __TAURI__ 属性时应识别为 Tauri 环境
     */
    it('TC-PLATFORM-002: 有 __TAURI__ 时 isTauri 返回 true', () => {
        (window as unknown as Record<string, unknown>).__TAURI__ = {};
        expect(isTauri()).toBe(true);
        expect(isWeb()).toBe(false);
    });

    /**
     * TC-PLATFORM-003: Tauri Internals 检测
     * 测试场景: 有 __TAURI_INTERNALS__ 属性时应识别为 Tauri 环境
     */
    it('TC-PLATFORM-003: 有 __TAURI_INTERNALS__ 时 isTauri 返回 true', () => {
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
        expect(isTauri()).toBe(true);
        expect(isWeb()).toBe(false);
    });
});
