/**
 * OAuth 服务测试
 *
 * 测试 GitHub Copilot OAuth Device Flow 认证流程
 * 对应文档: docs/services/README.md
 *
 * @module test/services/oauth
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { githubCopilotOAuth, openInBrowser } from '../../services/oauth';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

// Mock Tauri opener plugin
vi.mock('@tauri-apps/plugin-opener', () => ({
    openUrl: vi.fn(),
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
    LogTags: {
        APP: 'APP',
    },
}));

describe('githubCopilotOAuth', () => {
    let mockInvoke: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        // 获取 mock 的 invoke 函数
        const { invoke } = await import('@tauri-apps/api/core');
        mockInvoke = invoke as ReturnType<typeof vi.fn>;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('requestDeviceCode', () => {
        /**
         * TC-OAUTH-001: 成功请求 Device Code
         */
        it('TC-OAUTH-001: 成功请求 Device Code 应返回完整响应', async () => {
            const mockResponse = {
                success: true,
                device_code: 'test-device-code',
                user_code: 'ABCD-1234',
                verification_uri: 'https://github.com/login/device',
                expires_in: 900,
                interval: 5,
            };

            mockInvoke.mockResolvedValue(mockResponse);

            const result = await githubCopilotOAuth.requestDeviceCode();

            expect(mockInvoke).toHaveBeenCalledWith('oauth_request_device_code', {
                request: { provider_id: 'github-copilot' },
            });

            expect(result).toEqual({
                device_code: 'test-device-code',
                user_code: 'ABCD-1234',
                verification_uri: 'https://github.com/login/device',
                expires_in: 900,
                interval: 5,
            });
        });

        /**
         * TC-OAUTH-002: Device Code 请求失败
         */
        it('TC-OAUTH-002: Device Code 请求失败应抛出错误', async () => {
            mockInvoke.mockResolvedValue({
                success: false,
                error: 'Network error',
            });

            await expect(githubCopilotOAuth.requestDeviceCode()).rejects.toThrow('Network error');
        });

        /**
         * TC-OAUTH-003: Device Code 响应缺少必要字段
         */
        it('TC-OAUTH-003: 响应缺少必要字段应抛出错误', async () => {
            mockInvoke.mockResolvedValue({
                success: true,
                device_code: 'test-device-code',
                // 缺少 user_code 和 verification_uri
            });

            await expect(githubCopilotOAuth.requestDeviceCode()).rejects.toThrow(
                'Invalid device code response: missing required fields'
            );
        });

        /**
         * TC-OAUTH-004: Device Code 使用默认值
         */
        it('TC-OAUTH-004: 缺少 expires_in 和 interval 时应使用默认值', async () => {
            mockInvoke.mockResolvedValue({
                success: true,
                device_code: 'test-device-code',
                user_code: 'ABCD-1234',
                verification_uri: 'https://github.com/login/device',
                // 不提供 expires_in 和 interval
            });

            const result = await githubCopilotOAuth.requestDeviceCode();

            expect(result.expires_in).toBe(900); // 默认值
            expect(result.interval).toBe(5); // 默认值
        });

        /**
         * TC-OAUTH-005: Tauri invoke 异常
         */
        it('TC-OAUTH-005: Tauri invoke 异常应抛出错误', async () => {
            mockInvoke.mockRejectedValue(new Error('Tauri error'));

            await expect(githubCopilotOAuth.requestDeviceCode()).rejects.toThrow('Tauri error');
        });
    });

    describe('pollForToken', () => {
        /**
         * TC-OAUTH-006: 成功获取 Token
         */
        it('TC-OAUTH-006: 成功获取 Token 应返回认证结果', async () => {
            mockInvoke.mockResolvedValue({
                success: true,
                access_token: 'test-access-token',
                status: 'success',
            });

            const resultPromise = githubCopilotOAuth.pollForToken('device-code', 1, 60);

            // 快进时间以触发轮询
            await vi.advanceTimersByTimeAsync(4000); // interval + safety margin

            const result = await resultPromise;

            // v2.4.1: GitHub Copilot 现在返回 expiresAt 字段
            expect(result).toMatchObject({
                success: true,
                accessToken: 'test-access-token',
                refreshToken: 'test-access-token',
            });
            expect(result.expiresAt).toBeDefined();
            expect(typeof result.expiresAt).toBe('number');
        });

        /**
         * TC-OAUTH-007: 轮询状态为 pending
         */
        it('TC-OAUTH-007: pending 状态应继续轮询并调用回调', async () => {
            const onStatus = vi.fn();

            // 第一次返回 pending，第二次返回成功
            mockInvoke
                .mockResolvedValueOnce({ success: false, status: 'pending' })
                .mockResolvedValueOnce({ success: true, access_token: 'token', status: 'success' });

            const resultPromise = githubCopilotOAuth.pollForToken('device-code', 1, 60, onStatus);

            // 第一次轮询
            await vi.advanceTimersByTimeAsync(4000);
            // 第二次轮询
            await vi.advanceTimersByTimeAsync(4000);

            const result = await resultPromise;

            expect(onStatus).toHaveBeenCalledWith('pending');
            expect(result.success).toBe(true);
        });

        /**
         * TC-OAUTH-008: slow_down 状态应增加轮询间隔
         */
        it('TC-OAUTH-008: slow_down 状态应增加轮询间隔', async () => {
            const onStatus = vi.fn();

            mockInvoke
                .mockResolvedValueOnce({ success: false, status: 'slow_down', new_interval: 10 })
                .mockResolvedValueOnce({ success: true, access_token: 'token', status: 'success' });

            const resultPromise = githubCopilotOAuth.pollForToken('device-code', 1, 120, onStatus);

            // 第一次轮询
            await vi.advanceTimersByTimeAsync(4000);

            expect(onStatus).toHaveBeenCalledWith('slow_down');

            // 第二次轮询（使用新的间隔 10 秒 + 3 秒安全边际）
            await vi.advanceTimersByTimeAsync(13000);

            const result = await resultPromise;
            expect(result.success).toBe(true);
        });

        /**
         * TC-OAUTH-009: expired 状态应返回失败
         */
        it('TC-OAUTH-009: expired 状态应返回失败', async () => {
            const onStatus = vi.fn();

            mockInvoke.mockResolvedValue({ success: false, status: 'expired' });

            const resultPromise = githubCopilotOAuth.pollForToken('device-code', 1, 60, onStatus);

            await vi.advanceTimersByTimeAsync(4000);

            const result = await resultPromise;

            expect(onStatus).toHaveBeenCalledWith('expired');
            expect(result).toEqual({ success: false, error: 'expired' });
        });

        /**
         * TC-OAUTH-010: error 状态应返回失败
         */
        it('TC-OAUTH-010: error 状态应返回失败并包含错误信息', async () => {
            const onStatus = vi.fn();

            mockInvoke.mockResolvedValue({
                success: false,
                status: 'error',
                error: 'access_denied',
            });

            const resultPromise = githubCopilotOAuth.pollForToken('device-code', 1, 60, onStatus);

            await vi.advanceTimersByTimeAsync(4000);

            const result = await resultPromise;

            expect(onStatus).toHaveBeenCalledWith('error');
            expect(result).toEqual({ success: false, error: 'access_denied' });
        });

        /**
         * TC-OAUTH-011: 取消轮询
         */
        it('TC-OAUTH-011: abortSignal 触发时应取消轮询', async () => {
            const abortController = new AbortController();

            // 立即取消
            abortController.abort();

            // 由于已经取消，应该立即返回
            const result = await githubCopilotOAuth.pollForToken(
                'device-code',
                1,
                60,
                undefined,
                abortController.signal
            );

            expect(result).toEqual({ success: false, error: 'cancelled' });
        });

        /**
         * TC-OAUTH-012: 轮询超时
         */
        it('TC-OAUTH-012: 超过 expiresIn 时间应返回超时错误', async () => {
            const onStatus = vi.fn();

            mockInvoke.mockResolvedValue({ success: false, status: 'pending' });

            const resultPromise = githubCopilotOAuth.pollForToken('device-code', 1, 5, onStatus);

            // 快进超过过期时间
            await vi.advanceTimersByTimeAsync(10000);

            const result = await resultPromise;

            expect(onStatus).toHaveBeenCalledWith('expired');
            expect(result).toEqual({ success: false, error: 'expired' });
        });

        /**
         * TC-OAUTH-013: 网络错误时继续轮询
         */
        it('TC-OAUTH-013: 网络错误时应继续轮询', async () => {
            mockInvoke
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({ success: true, access_token: 'token', status: 'success' });

            const resultPromise = githubCopilotOAuth.pollForToken('device-code', 1, 60);

            // 第一次轮询（网络错误）
            await vi.advanceTimersByTimeAsync(4000);
            // 第二次轮询（成功）
            await vi.advanceTimersByTimeAsync(4000);

            const result = await resultPromise;

            expect(result.success).toBe(true);
        });
    });

    describe('authorize', () => {
        /**
         * TC-OAUTH-014: 完整授权流程成功
         */
        it('TC-OAUTH-014: 完整授权流程应成功返回 Token', async () => {
            const onDeviceCode = vi.fn();
            const onStatus = vi.fn();

            // Mock requestDeviceCode
            mockInvoke.mockResolvedValueOnce({
                success: true,
                device_code: 'device-code',
                user_code: 'USER-CODE',
                verification_uri: 'https://github.com/login/device',
                expires_in: 60,
                interval: 1,
            });

            // Mock pollForToken
            mockInvoke.mockResolvedValueOnce({
                success: true,
                access_token: 'access-token',
                status: 'success',
            });

            const resultPromise = githubCopilotOAuth.authorize(onDeviceCode, onStatus);

            // 等待 Device Code 请求完成
            await vi.advanceTimersByTimeAsync(0);

            expect(onDeviceCode).toHaveBeenCalledWith({
                device_code: 'device-code',
                user_code: 'USER-CODE',
                verification_uri: 'https://github.com/login/device',
                expires_in: 60,
                interval: 1,
            });

            // 等待轮询完成
            await vi.advanceTimersByTimeAsync(4000);

            const result = await resultPromise;

            // v2.4.1: GitHub Copilot 现在返回 expiresAt 字段
            expect(result).toMatchObject({
                success: true,
                accessToken: 'access-token',
                refreshToken: 'access-token',
            });
            expect(result.expiresAt).toBeDefined();
            expect(typeof result.expiresAt).toBe('number');
        });

        /**
         * TC-OAUTH-015: Device Code 请求失败
         */
        it('TC-OAUTH-015: Device Code 请求失败应返回错误', async () => {
            const onDeviceCode = vi.fn();

            mockInvoke.mockResolvedValue({
                success: false,
                error: 'Service unavailable',
            });

            const result = await githubCopilotOAuth.authorize(onDeviceCode);

            expect(onDeviceCode).not.toHaveBeenCalled();
            expect(result.success).toBe(false);
            expect(result.error).toContain('Service unavailable');
        });
    });
});

describe('openInBrowser', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * TC-OAUTH-016: 使用 Tauri opener 打开 URL
     */
    it('TC-OAUTH-016: 应使用 Tauri opener 打开 URL', async () => {
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        const mockOpenUrl = openUrl as ReturnType<typeof vi.fn>;
        mockOpenUrl.mockResolvedValue(undefined);

        await openInBrowser('https://example.com');

        expect(mockOpenUrl).toHaveBeenCalledWith('https://example.com');
    });

    /**
     * TC-OAUTH-017: Tauri opener 失败时降级到 window.open
     */
    it('TC-OAUTH-017: Tauri opener 失败时应降级到 window.open', async () => {
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        const mockOpenUrl = openUrl as ReturnType<typeof vi.fn>;
        mockOpenUrl.mockRejectedValue(new Error('Plugin not available'));

        const mockWindowOpen = vi.spyOn(window, 'open').mockImplementation(() => null);

        await openInBrowser('https://example.com');

        expect(mockWindowOpen).toHaveBeenCalledWith('https://example.com', '_blank');

        mockWindowOpen.mockRestore();
    });
});
