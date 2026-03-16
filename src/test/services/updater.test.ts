/**
 * @file updater.test.ts
 * @description 软件更新服务单元测试
 *
 * 对应文档 docs/modules/test-report-v0.9.2.md 中的测试用例
 * TC-UPDATER-001 ~ TC-UPDATER-003
 *
 * @module test/services/updater
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// 使用 vi.hoisted 确保 mock 函数在 vi.mock 提升后可用
const { mockCheck, mockGetVersion, mockRelaunch } = vi.hoisted(() => ({
    mockCheck: vi.fn(),
    mockGetVersion: vi.fn(),
    mockRelaunch: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-updater', () => ({
    check: mockCheck,
}));

vi.mock('@tauri-apps/plugin-process', () => ({
    relaunch: mockRelaunch,
}));

vi.mock('@tauri-apps/api/app', () => ({
    getVersion: mockGetVersion,
}));

// 模拟 logger
vi.mock('../../utils/logger', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
    LogTags: {
        APP: 'APP',
    },
}));

// 延迟导入，确保 mock 先生效
import { checkForUpdates, getCurrentVersion } from '../../services/updater';

describe('updater 软件更新服务', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * TC-UPDATER-001: 获取当前版本
     * 测试场景: 应返回版本字符串
     */
    it('TC-UPDATER-001: 获取当前版本', async () => {
        mockGetVersion.mockResolvedValue('0.9.2');

        const version = await getCurrentVersion();
        expect(version).toBe('0.9.2');
    });

    /**
     * TC-UPDATER-001b: 获取版本失败时返回"未知"
     */
    it('TC-UPDATER-001b: 获取版本失败返回未知', async () => {
        mockGetVersion.mockRejectedValue(new Error('not available'));

        const version = await getCurrentVersion();
        expect(version).toBe('未知');
    });

    /**
     * TC-UPDATER-002: 检查更新 - 有更新
     * 测试场景: 有新版本时应返回 available=true
     */
    it('TC-UPDATER-002: 有新版本时返回 available=true', async () => {
        mockGetVersion.mockResolvedValue('0.9.2');
        mockCheck.mockResolvedValue({
            version: '0.9.3',
            body: '修复了一些问题',
            date: '2026-02-28',
            downloadAndInstall: vi.fn(),
        });

        const info = await checkForUpdates();

        expect(info.available).toBe(true);
        expect(info.currentVersion).toBe('0.9.2');
        expect(info.latestVersion).toBe('0.9.3');
        expect(info.releaseNotes).toBe('修复了一些问题');
    });

    /**
     * TC-UPDATER-003: 检查更新 - 无更新
     * 测试场景: 已是最新版本时应返回 available=false
     */
    it('TC-UPDATER-003: 已是最新版本返回 available=false', async () => {
        mockGetVersion.mockResolvedValue('0.9.3');
        mockCheck.mockResolvedValue(null);

        const info = await checkForUpdates();

        expect(info.available).toBe(false);
        expect(info.currentVersion).toBe('0.9.3');
        expect(info.latestVersion).toBeUndefined();
    });
});
