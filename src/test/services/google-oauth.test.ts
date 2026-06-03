/**
 * Google OAuth 服务测试
 *
 * 测试用例对应文档 docs/modules/protocols.md 中的 TC-OAUTH-GOOGLE-001 ~ TC-OAUTH-GOOGLE-006
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    startGoogleAuth,
    exchangeGoogleCode,
    refreshGoogleToken,
    cancelGoogleAuth,
    googleOAuth,
} from '../../services/google-oauth';

const mockStartOAuthCallbackServer = vi.fn();
const mockStopOAuthCallbackServer = vi.fn();
const mockCheckPortAvailable = vi.fn();
const mockGetAvailablePort = vi.fn();

function waitForMockOAuthCallback(
    callbackPromise: Promise<{ success: boolean; error?: string; actualPort: number }>,
    signal?: AbortSignal,
    actualPort = 0
) {
    if (!signal) return callbackPromise;
    if (signal.aborted) {
        mockStopOAuthCallbackServer();
        return Promise.resolve({ success: false, error: 'cancelled', actualPort });
    }
    return Promise.race([
        callbackPromise,
        new Promise<{ success: boolean; error?: string; actualPort: number }>((resolve) => {
            signal.addEventListener('abort', () => {
                mockStopOAuthCallbackServer();
                resolve({ success: false, error: 'cancelled', actualPort });
            }, { once: true });
        }),
    ]);
}

async function waitForMockCall(mockFn: ReturnType<typeof vi.fn>) {
    for (let i = 0; i < 20; i += 1) {
        if (mockFn.mock.calls.length > 0) return;
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}

// Mock Tauri API
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
        AUTH: '[Auth]',
    },
}));

// Mock OAuth callback service
vi.mock('../../services/oauth-callback', () => ({
    startOAuthCallbackServer: (...args: unknown[]) => mockStartOAuthCallbackServer(...args),
    stopOAuthCallbackServer: (...args: unknown[]) => mockStopOAuthCallbackServer(...args),
    waitForOAuthCallback: waitForMockOAuthCallback,
    checkPortAvailable: (...args: unknown[]) => mockCheckPortAvailable(...args),
    getAvailablePort: (...args: unknown[]) => mockGetAvailablePort(...args),
    buildRedirectUri: (port: number, path: string) => `http://localhost:${port}${path}`,
    getProviderPortConfig: () => ({
        preferredPort: 8765,
        fallbackPorts: [8766, 8767],
        callbackPath: '/google-callback',
    }),
}));

describe('Google OAuth 服务测试', () => {
    let mockInvoke: ReturnType<typeof vi.fn>;
    let mockOpenUrl: ReturnType<typeof vi.fn>;
    let mockStart: ReturnType<typeof vi.fn>;
    let mockCheck: ReturnType<typeof vi.fn>;
    let mockGetPort: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();

        // 获取 mock 的 invoke 函数
        const { invoke } = await import('@tauri-apps/api/core');
        mockInvoke = invoke as ReturnType<typeof vi.fn>;

        const { openUrl } = await import('@tauri-apps/plugin-opener');
        mockOpenUrl = openUrl as ReturnType<typeof vi.fn>;

        mockStart = mockStartOAuthCallbackServer as ReturnType<typeof vi.fn>;
        mockCheck = mockCheckPortAvailable as ReturnType<typeof vi.fn>;
        mockGetPort = mockGetAvailablePort as ReturnType<typeof vi.fn>;
        mockStart.mockReset();
        mockStopOAuthCallbackServer.mockReset();
        mockCheck.mockReset();
        mockGetPort.mockReset();
    });

    afterEach(() => {
        cancelGoogleAuth();
    });

    describe('TC-OAUTH-GOOGLE-001: 成功授权流程', () => {
        it('应该返回 accessToken 和 refreshToken', async () => {
            // Mock token 交换成功
            mockInvoke.mockResolvedValueOnce({
                access_token: 'ya29.test-access-token',
                refresh_token: 'test-refresh-token',
                expires_in: 3600,
                token_type: 'Bearer',
            });

            // Mock 用户信息获取成功
            mockInvoke.mockResolvedValueOnce({
                email: 'test@example.com',
            });

            // Mock Antigravity onboard 成功
            mockInvoke.mockResolvedValueOnce({
                success: true,
                project_id: 'test-project-123',
            });

            // 先启动授权流程
            const authData = await startGoogleAuth(8765);
            expect(authData.url).toContain('accounts.google.com/o/oauth2/v2/auth');
            expect(authData.url).toContain('client_id=');
            expect(authData.url).toContain('code_challenge=');

            // 交换授权码
            const result = await exchangeGoogleCode('test-auth-code');

            expect(result.type).toBe('success');
            expect(result.accessToken).toBe('ya29.test-access-token');
            expect(result.refreshToken).toBe('test-refresh-token');
            expect(result.email).toBe('test@example.com');
            expect(result.projectId).toBe('test-project-123');
            expect(result.expiresAt).toBeGreaterThan(Date.now());
        });

        it('取消授权时应立即返回 cancelled 并停止回调监听', async () => {
            mockCheck.mockResolvedValue(true);
            mockStart.mockReturnValue(new Promise(() => undefined));

            const onAuthUrl = vi.fn();
            const onStatusChange = vi.fn();
            const controller = new AbortController();
            const resultPromise = googleOAuth.authorize(onAuthUrl, onStatusChange, controller.signal);

            await waitForMockCall(onAuthUrl);
            expect(onAuthUrl).toHaveBeenCalled();
            controller.abort();

            const result = await resultPromise;
            expect(result.type).toBe('cancelled');
            expect(mockStopOAuthCallbackServer).toHaveBeenCalled();
        });
    });

    describe('TC-OAUTH-GOOGLE-002: 授权码交换失败', () => {
        it('应该返回 type=failed 和错误信息', async () => {
            // Mock token 交换失败
            mockInvoke.mockRejectedValue(new Error('Invalid authorization code'));

            // 先启动授权流程
            await startGoogleAuth(8765);

            // 交换授权码
            const result = await exchangeGoogleCode('invalid-code');

            expect(result.type).toBe('failed');
            expect(result.error).toContain('Invalid authorization code');
        });

        it('没有活动会话时应该返回失败', async () => {
            // 不启动授权流程，直接交换
            const result = await exchangeGoogleCode('test-code');

            expect(result.type).toBe('failed');
            expect(result.error).toBe('No active authorization session');
        });
    });

    describe('TC-OAUTH-GOOGLE-003: State 验证失败', () => {
        it('不匹配的 state 应该返回 CSRF 错误', async () => {
            // 先启动授权流程
            await startGoogleAuth(8765);

            // 使用错误的 state
            const result = await exchangeGoogleCode('test-code', 'wrong-state');

            expect(result.type).toBe('failed');
            expect(result.error).toContain('CSRF');
        });
    });

    describe('TC-OAUTH-GOOGLE-004: Token 刷新成功', () => {
        it('应该返回新的 accessToken', async () => {
            mockInvoke.mockResolvedValue({
                access_token: 'ya29.new-access-token',
                expires_in: 3600,
                token_type: 'Bearer',
            });

            const result = await refreshGoogleToken('test-refresh-token');

            expect(result.type).toBe('success');
            expect(result.accessToken).toBe('ya29.new-access-token');
            expect(result.refreshToken).toBe('test-refresh-token'); // Google 不返回新的 refresh token
            expect(result.expiresAt).toBeGreaterThan(Date.now());

            expect(mockInvoke).toHaveBeenCalledWith('google_refresh_token', {
                refreshToken: 'test-refresh-token',
                clientId: expect.any(String),
            });
        });
    });

    describe('TC-OAUTH-GOOGLE-005: Token 刷新失败', () => {
        it('无效的 refreshToken 应该返回 type=failed', async () => {
            mockInvoke.mockRejectedValue(new Error('Invalid refresh token'));

            const result = await refreshGoogleToken('invalid-refresh-token');

            expect(result.type).toBe('failed');
            expect(result.error).toBe('Invalid refresh token');
        });
    });

    describe('TC-OAUTH-GOOGLE-006: Antigravity onboard', () => {
        it('新用户授权应该自动创建 GCP 项目', async () => {
            // Mock token 交换成功
            mockInvoke.mockResolvedValueOnce({
                access_token: 'ya29.test-access-token',
                refresh_token: 'test-refresh-token',
                expires_in: 3600,
                token_type: 'Bearer',
            });

            // Mock 用户信息获取成功
            mockInvoke.mockResolvedValueOnce({
                email: 'newuser@example.com',
            });

            // Mock loadCodeAssist 返回需要 onboard
            mockInvoke.mockResolvedValueOnce({
                success: false,
                error: 'NEED_ONBOARD:tier-123',
            });

            // Mock onboard 成功
            mockInvoke.mockResolvedValueOnce({
                success: true,
                project_id: 'new-project-456',
            });

            // 先启动授权流程
            await startGoogleAuth(8765);

            // 交换授权码
            const result = await exchangeGoogleCode('test-auth-code');

            expect(result.type).toBe('success');
            expect(result.projectId).toBe('new-project-456');

            // 验证调用了 onboard
            expect(mockInvoke).toHaveBeenCalledWith('google_onboard_user', {
                accessToken: 'ya29.test-access-token',
                tierId: 'tier-123',
            });
        });

        it('onboard 失败不应该阻止认证流程', async () => {
            // Mock token 交换成功
            mockInvoke.mockResolvedValueOnce({
                access_token: 'ya29.test-access-token',
                refresh_token: 'test-refresh-token',
                expires_in: 3600,
                token_type: 'Bearer',
            });

            // Mock 用户信息获取成功
            mockInvoke.mockResolvedValueOnce({
                email: 'test@example.com',
            });

            // Mock loadCodeAssist 失败
            mockInvoke.mockRejectedValueOnce(new Error('Network error'));

            // 先启动授权流程
            await startGoogleAuth(8765);

            // 交换授权码
            const result = await exchangeGoogleCode('test-auth-code');

            // 应该仍然成功，只是没有 projectId
            expect(result.type).toBe('success');
            expect(result.accessToken).toBe('ya29.test-access-token');
            expect(result.projectId).toBeUndefined();
        });
    });

    describe('startGoogleAuth', () => {
        it('应该生成正确的授权 URL', async () => {
            const authData = await startGoogleAuth(8765);

            expect(authData.url).toContain('accounts.google.com/o/oauth2/v2/auth');
            expect(authData.url).toContain('client_id=');
            expect(authData.url).toContain('response_type=code');
            expect(authData.url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A8765%2Fgoogle-callback');
            expect(authData.url).toContain('scope=');
            expect(authData.url).toContain('state=');
            expect(authData.url).toContain('code_challenge=');
            expect(authData.url).toContain('code_challenge_method=S256');
            expect(authData.url).toContain('access_type=offline');
            expect(authData.url).toContain('prompt=consent');

            expect(authData.instructions).toContain('Google');
            expect(authData.callbackPort).toBe(8765);
        });
    });

    describe('cancelGoogleAuth', () => {
        it('应该清理授权会话状态', async () => {
            // 启动授权流程
            await startGoogleAuth(8765);

            // 取消授权
            cancelGoogleAuth();

            // 尝试交换授权码应该失败
            const result = await exchangeGoogleCode('test-code');
            expect(result.type).toBe('failed');
            expect(result.error).toBe('No active authorization session');
        });
    });

    describe('authorize', () => {
        it('应按可用端口启动回调服务并生成匹配端口的授权地址', async () => {
            mockCheck
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);

            mockGetPort.mockResolvedValue(9988);
            mockStart.mockResolvedValue({
                success: true,
                code: 'google-auth-code',
                state: undefined,
                actualPort: 8766,
            });

            mockInvoke.mockResolvedValueOnce({
                access_token: 'ya29.test-access-token',
                refresh_token: 'test-refresh-token',
                expires_in: 3600,
            });

            mockInvoke.mockResolvedValueOnce({
                email: 'test@example.com',
            });

            mockInvoke.mockResolvedValueOnce({
                success: true,
                project_id: 'test-project-123',
            });

            const onAuthUrl = vi.fn();
            const onStatusChange = vi.fn();
            const result = await googleOAuth.authorize(onAuthUrl, onStatusChange);

            expect(mockCheck).toHaveBeenNthCalledWith(1, 8765);
            expect(mockCheck).toHaveBeenNthCalledWith(2, 8766);
            expect(mockStart).toHaveBeenCalledWith({
                preferredPort: 8766,
                fallbackPorts: [],
                callbackPaths: ['/google-callback', '/callback', '/oauth-callback'],
                timeout: 300,
            });
            expect(onAuthUrl).toHaveBeenCalled();
            expect(mockOpenUrl).toHaveBeenCalledWith(
                expect.stringContaining('redirect_uri=http%3A%2F%2Flocalhost%3A8766%2Fgoogle-callback')
            );
            expect(result.type).toBe('success');
        });
    });

    describe('authorize（端口错位）', () => {
        it('当回调端口与授权端口不一致时应失败', async () => {
            mockCheck.mockResolvedValue(true);
            mockStart.mockResolvedValue({
                success: true,
                code: 'google-auth-code',
                state: 'state',
                actualPort: 9988,
            });

            const onAuthUrl = vi.fn();
            const onStatusChange = vi.fn();
            const result = await googleOAuth.authorize(onAuthUrl, onStatusChange);

            expect(result.type).toBe('failed');
            expect(result.error).toContain('回调端口不一致');
            expect(onStatusChange).toHaveBeenCalledWith('error');
        });
    });
});
