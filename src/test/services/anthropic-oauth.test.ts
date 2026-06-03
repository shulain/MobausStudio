/**
 * Anthropic OAuth 服务测试
 *
 * 测试用例对应文档 docs/modules/protocols.md 中的 TC-OAUTH-ANTHROPIC-001 ~ TC-OAUTH-ANTHROPIC-005
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    startAnthropicAuth,
    exchangeAnthropicCode,
    refreshAnthropicToken,
    cancelAnthropicAuth,
    type AnthropicAuthMode,
    anthropicOAuth,
} from '../../services/anthropic-oauth';

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

async function waitForAssertion(assertion: () => void) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
            assertion();
            return;
        } catch (error) {
            lastError = error;
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
    throw lastError;
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
        preferredPort: 8764,
        fallbackPorts: [8765, 8766],
        callbackPath: '/anthropic-callback',
    }),
}));

describe('Anthropic OAuth 服务测试', () => {
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
        cancelAnthropicAuth();
    });

    describe('TC-OAUTH-ANTHROPIC-001: Max 模式授权成功', () => {
        it('应该返回 OAuth token', async () => {
            // Mock token 交换成功
            mockInvoke.mockResolvedValue({
                access_token: 'sk-ant-oat-test-token',
                refresh_token: 'test-refresh-token',
                expires_in: 3600,
            });

            // 先启动授权流程
            const authData = await startAnthropicAuth('max', 8764);
            expect(authData.url).toContain('claude.ai/oauth/authorize');

            // 交换授权码（格式：code#state）
            const result = await exchangeAnthropicCode('test-code#test-state');

            expect(result.type).toBe('success');
            expect(result.accessToken).toBe('sk-ant-oat-test-token');
            expect(result.refreshToken).toBe('test-refresh-token');
            expect(result.expiresAt).toBeGreaterThan(Date.now());
            expect(result.apiKey).toBeUndefined(); // max 模式不返回 API Key
        });

        it('取消授权时应立即失败并停止回调监听', async () => {
            mockCheck.mockResolvedValue(true);
            mockStart.mockReturnValue(new Promise(() => undefined));

            const onAuthUrl = vi.fn();
            const onStatusChange = vi.fn();
            const controller = new AbortController();
            const resultPromise = anthropicOAuth.authorize('max', onAuthUrl, onStatusChange, controller.signal);

            await waitForAssertion(() => expect(onAuthUrl).toHaveBeenCalled());
            controller.abort();

            const result = await resultPromise;
            expect(result.type).toBe('failed');
            expect(mockStopOAuthCallbackServer).toHaveBeenCalled();
        });
    });

    describe('TC-OAUTH-ANTHROPIC-002: Console 模式授权成功', () => {
        it('应该返回 API Key', async () => {
            // Mock token 交换成功
            mockInvoke.mockResolvedValueOnce({
                access_token: 'temp-access-token',
                refresh_token: 'temp-refresh-token',
                expires_in: 3600,
            });

            // Mock API Key 创建成功
            mockInvoke.mockResolvedValueOnce({
                raw_key: 'sk-ant-api-test-key',
            });

            // 先启动授权流程
            const authData = await startAnthropicAuth('console', 8764);
            expect(authData.url).toContain('console.anthropic.com/oauth/authorize');

            // 交换授权码
            const result = await exchangeAnthropicCode('test-code#test-state');

            expect(result.type).toBe('success');
            expect(result.apiKey).toBe('sk-ant-api-test-key');
            expect(result.accessToken).toBeUndefined(); // console 模式不返回 OAuth token
            expect(result.refreshToken).toBeUndefined();

            // 验证调用了 API Key 创建
            expect(mockInvoke).toHaveBeenCalledWith('anthropic_create_api_key', {
                accessToken: 'temp-access-token',
            });
        });
    });

    describe('TC-OAUTH-ANTHROPIC-003: 授权码格式错误', () => {
        it('缺少 state 的授权码应该正确解析', async () => {
            // Mock token 交换成功
            mockInvoke.mockResolvedValue({
                access_token: 'sk-ant-oat-test-token',
                refresh_token: 'test-refresh-token',
                expires_in: 3600,
            });

            // 先启动授权流程
            await startAnthropicAuth('max', 8764);

            // 交换授权码（只有 code，没有 state）
            const result = await exchangeAnthropicCode('test-code-only');

            expect(result.type).toBe('success');
            expect(result.accessToken).toBe('sk-ant-oat-test-token');

            // 验证调用时 state 为 undefined
            expect(mockInvoke).toHaveBeenCalledWith('anthropic_exchange_token', {
                code: 'test-code-only',
                state: undefined,
                verifier: expect.any(String),
                clientId: expect.any(String),
                redirectUri: expect.any(String),
            });
        });

        it('没有活动会话时应该返回失败', async () => {
            // 不启动授权流程，直接交换
            const result = await exchangeAnthropicCode('test-code#test-state');

            expect(result.type).toBe('failed');
        });
    });

    describe('TC-OAUTH-ANTHROPIC-004: Token 刷新成功', () => {
        it('应该返回新的 accessToken', async () => {
            mockInvoke.mockResolvedValue({
                access_token: 'sk-ant-oat-new-token',
                refresh_token: 'new-refresh-token',
                expires_in: 3600,
            });

            const result = await refreshAnthropicToken('test-refresh-token');

            expect(result.type).toBe('success');
            expect(result.accessToken).toBe('sk-ant-oat-new-token');
            expect(result.refreshToken).toBe('new-refresh-token');
            expect(result.expiresAt).toBeGreaterThan(Date.now());

            expect(mockInvoke).toHaveBeenCalledWith('anthropic_refresh_token', {
                refreshToken: 'test-refresh-token',
                clientId: expect.any(String),
            });
        });
    });

    describe('TC-OAUTH-ANTHROPIC-005: Token 刷新失败', () => {
        it('无效的 refreshToken 应该返回 type=failed', async () => {
            mockInvoke.mockRejectedValue(new Error('Invalid refresh token'));

            const result = await refreshAnthropicToken('invalid-refresh-token');

            expect(result.type).toBe('failed');
        });
    });

    describe('startAnthropicAuth', () => {
        it('max 模式应该使用 claude.ai', async () => {
            const authData = await startAnthropicAuth('max', 8764);

            expect(authData.url).toContain('claude.ai/oauth/authorize');
            expect(authData.url).toContain('client_id=');
            expect(authData.url).toContain('response_type=code');
            expect(authData.url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A8764%2Fanthropic-callback');
            expect(authData.url).toContain('scope=');
            expect(authData.url).toContain('code_challenge=');
            expect(authData.url).toContain('code_challenge_method=S256');
            expect(authData.url).toContain('state=');

            expect(authData.instructions).toContain('Claude');
            expect(authData.callbackPort).toBe(8764);
        });

        it('console 模式应该使用 console.anthropic.com', async () => {
            const authData = await startAnthropicAuth('console', 8764);

            expect(authData.url).toContain('console.anthropic.com/oauth/authorize');
            expect(authData.instructions).toContain('Anthropic Console');
        });
    });

    describe('cancelAnthropicAuth', () => {
        it('应该清理授权会话状态', async () => {
            // 启动授权流程
            await startAnthropicAuth('max', 8764);

            // 取消授权
            cancelAnthropicAuth();

            // 尝试交换授权码应该失败
            const result = await exchangeAnthropicCode('test-code#test-state');
            expect(result.type).toBe('failed');
        });
    });

    describe('exchangeAnthropicCode 错误处理', () => {
        it('token 交换失败应该返回 type=failed', async () => {
            mockInvoke.mockRejectedValue(new Error('Token exchange failed'));

            // 先启动授权流程
            await startAnthropicAuth('max', 8764);

            // 交换授权码
            const result = await exchangeAnthropicCode('invalid-code#state');

            expect(result.type).toBe('failed');
        });

        it('console 模式 API Key 创建失败应该返回 type=failed', async () => {
            // Mock token 交换成功
            mockInvoke.mockResolvedValueOnce({
                access_token: 'temp-access-token',
                refresh_token: 'temp-refresh-token',
                expires_in: 3600,
            });

            // Mock API Key 创建失败
            mockInvoke.mockRejectedValueOnce(new Error('API Key creation failed'));

            // 先启动授权流程
            await startAnthropicAuth('console', 8764);

            // 交换授权码
            const result = await exchangeAnthropicCode('test-code#test-state');

            expect(result.type).toBe('failed');
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
                code: 'anthropic-auth-code',
                state: undefined,
                actualPort: 8765,
            });

            mockInvoke.mockResolvedValue({
                access_token: 'sk-ant-oat-test-token',
                refresh_token: 'test-refresh-token',
                expires_in: 3600,
            });

            const onAuthUrl = vi.fn();
            const onStatusChange = vi.fn();
            const result = await anthropicOAuth.authorize('max', onAuthUrl, onStatusChange);

            expect(mockCheck).toHaveBeenNthCalledWith(1, 8764);
            expect(mockCheck).toHaveBeenNthCalledWith(2, 8765);
            expect(mockStart).toHaveBeenCalledWith({
                preferredPort: 8765,
                fallbackPorts: [],
                callbackPaths: ['/anthropic-callback', '/callback', '/auth/callback'],
                timeout: 300,
            });
            expect(onAuthUrl).toHaveBeenCalled();
            expect(mockOpenUrl).toHaveBeenCalledWith(
                expect.stringContaining('redirect_uri=http%3A%2F%2Flocalhost%3A8765%2Fanthropic-callback')
            );
            expect(result.type).toBe('success');
            expect(result.accessToken).toBe('sk-ant-oat-test-token');
        });
    });

    describe('authorize（端口错位）', () => {
        it('当回调端口与授权端口不一致时应失败', async () => {
            mockCheck.mockResolvedValue(true);
            mockStart.mockResolvedValue({
                success: true,
                code: 'anthropic-auth-code',
                state: 'state',
                actualPort: 9988,
            });

            const onAuthUrl = vi.fn();
            const onStatusChange = vi.fn();
            const result = await anthropicOAuth.authorize('max', onAuthUrl, onStatusChange);

            expect(result.type).toBe('failed');
            expect(onStatusChange).toHaveBeenCalledWith('error');
        });
    });
});
