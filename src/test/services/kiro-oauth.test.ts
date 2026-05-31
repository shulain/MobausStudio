/**
 * Kiro OAuth 服务测试
 *
 * 覆盖 Social Auth 的端口回退与 authMethod 透传
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { kiroOAuth } from '../../services/kiro-oauth';

const mockStartOAuthCallbackServer = vi.fn();
const mockCheckPortAvailable = vi.fn();
const mockGetAvailablePort = vi.fn();

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
        APP: '[App]',
        AUTH: '[Auth]',
    },
}));

// Mock OAuth 回调服务
vi.mock('../../services/oauth-callback', () => ({
    startOAuthCallbackServer: (...args: unknown[]) => mockStartOAuthCallbackServer(...args),
    checkPortAvailable: (...args: unknown[]) => mockCheckPortAvailable(...args),
    getAvailablePort: (...args: unknown[]) => mockGetAvailablePort(...args),
    buildRedirectUri: (port: number, path: string) => `http://localhost:${port}${path}`,
    getProviderPortConfig: () => ({
        preferredPort: 9876,
        fallbackPorts: [9877, 9878],
        callbackPath: '/oauth/callback',
    }),
}));

describe('Kiro OAuth', () => {
    let mockInvoke: ReturnType<typeof vi.fn>;
    let mockOpenUrl: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();

        const { invoke } = await import('@tauri-apps/api/core');
        mockInvoke = invoke as ReturnType<typeof vi.fn>;

        const { openUrl } = await import('@tauri-apps/plugin-opener');
        mockOpenUrl = openUrl as ReturnType<typeof vi.fn>;

        mockCheckPortAvailable.mockReset();
        mockGetAvailablePort.mockReset();
        mockStartOAuthCallbackServer.mockReset();
    });

    it('应在端口回退后使用可用端口构造 redirect_uri', async () => {
        // 首选端口占用，fallback 第一个端口可用
        mockCheckPortAvailable
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);

        mockStartOAuthCallbackServer.mockResolvedValue({
            success: true,
            code: 'auth-code',
            state: 'state-abc',
            actualPort: 9877,
        });

        mockInvoke
            .mockResolvedValueOnce({
                success: true,
                auth_url: 'https://auth.kiro.test/login',
                code_verifier: 'code-verifier-123',
                state: 'state-abc',
                redirect_uri: 'http://localhost:9877/oauth/callback',
                expires_in: 600,
            })
            .mockResolvedValueOnce({
                success: true,
                access_token: 'kiro-access-token',
                refresh_token: 'kiro-refresh-token',
                profile_arn: 'arn:example',
                expires_in: 3600,
                kiro_client_id: 'client-id',
                kiro_client_secret: 'client-secret',
                kiro_sso_region: 'us-east-1',
            });

        const result = await kiroOAuth.authorizeSocial('google');

        expect(mockInvoke).toHaveBeenCalledWith('oauth_request_device_code', {
            request: {
                provider_id: 'kiro',
                auth_method: 'google',
                redirect_uri: 'http://localhost:9877/oauth/callback',
            },
        });

        expect(mockStartOAuthCallbackServer).toHaveBeenCalledWith({
            preferredPort: 9877,
            fallbackPorts: [],
            callbackPaths: ['/oauth/callback'],
            timeout: 300,
        });

        expect(mockOpenUrl).toHaveBeenCalledWith('https://auth.kiro.test/login');
        expect(result.success).toBe(true);
        expect(result.accessToken).toBe('kiro-access-token');
    });

    it('应保留 social auth 的 authMethod 到返回结果', async () => {
        mockCheckPortAvailable.mockResolvedValue(true);

        mockStartOAuthCallbackServer.mockResolvedValue({
            success: true,
            code: 'auth-code',
            state: 'state-github',
            actualPort: 9876,
        });

        mockInvoke
            .mockResolvedValueOnce({
                success: true,
                auth_url: 'https://auth.kiro.test/login',
                code_verifier: 'code-verifier-456',
                state: 'state-github',
                redirect_uri: 'http://localhost:9876/oauth/callback',
                expires_in: 600,
            })
            .mockResolvedValueOnce({
                success: true,
                access_token: 'kiro-access-token',
                refresh_token: 'kiro-refresh-token',
                profile_arn: 'arn:example',
                expires_in: 3600,
                kiro_client_id: 'client-id',
                kiro_client_secret: 'client-secret',
                kiro_sso_region: 'us-east-1',
            });

        const result = await kiroOAuth.authorizeSocial('github');

        expect(result.authMethod).toBe('github');
    });

    it('state 校验失败应返回错误，不触发 token 交换', async () => {
        mockCheckPortAvailable.mockResolvedValue(true);

        mockStartOAuthCallbackServer.mockResolvedValue({
            success: true,
            code: 'auth-code',
            state: 'state-not-match',
            actualPort: 9876,
        });

        mockInvoke.mockResolvedValueOnce({
            success: true,
            auth_url: 'https://auth.kiro.test/login',
            code_verifier: 'code-verifier-789',
            state: 'state-expected',
            redirect_uri: 'http://localhost:9876/oauth/callback',
            expires_in: 600,
        });

        const result = await kiroOAuth.authorizeSocial('google');

        expect(result.success).toBe(false);
        expect(result.error).toBe('授权回调 state 校验失败');
        expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it('缺少 state 应返回错误，不触发 token 交换', async () => {
        mockCheckPortAvailable.mockResolvedValue(true);

        mockStartOAuthCallbackServer.mockResolvedValue({
            success: true,
            code: 'auth-code',
            state: undefined,
            actualPort: 9876,
        });

        mockInvoke.mockResolvedValueOnce({
            success: true,
            auth_url: 'https://auth.kiro.test/login',
            code_verifier: 'code-verifier-missing-state',
            state: 'state-expected',
            redirect_uri: 'http://localhost:9876/oauth/callback',
            expires_in: 600,
        });

        const result = await kiroOAuth.authorizeSocial('google');

        expect(result.success).toBe(false);
        expect(result.error).toBe('授权回调未返回 state');
        expect(mockInvoke).toHaveBeenCalledTimes(1);
    });
});
