/**
 * OpenAI OAuth 服务测试
 *
 * 测试用例对应文档 docs/modules/protocols.md 中的 TC-OAUTH-OPENAI-001 ~ TC-OAUTH-OPENAI-005
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    startOpenAIAuth,
    exchangeOpenAICode,
    refreshOpenAIToken,
    cancelOpenAIAuth,
} from '../../services/openai-oauth';

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
    startOAuthCallbackServer: vi.fn(),
    buildRedirectUri: (port: number, path: string) => `http://localhost:${port}${path}`,
    getProviderPortConfig: () => ({
        preferredPort: 8763,
        fallbackPorts: [8764, 8765],
        callbackPath: '/openai-callback',
    }),
}));

describe('OpenAI OAuth 服务测试', () => {
    let mockInvoke: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();

        // 获取 mock 的 invoke 函数
        const { invoke } = await import('@tauri-apps/api/core');
        mockInvoke = invoke as ReturnType<typeof vi.fn>;
    });

    afterEach(() => {
        cancelOpenAIAuth();
    });

    describe('TC-OAUTH-OPENAI-001: 成功授权流程', () => {
        it('应该返回 accessToken 和 idToken', async () => {
            // Mock token 交换成功
            mockInvoke.mockResolvedValue({
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
                id_token: 'test-id-token',
                expires_in: 3600,
                account_id: 'acc-123',
                email: 'test@openai.com',
            });

            // 先启动授权流程
            const authData = await startOpenAIAuth(8763);
            expect(authData.url).toContain('auth.openai.com/oauth/authorize');
            expect(authData.url).toContain('client_id=');
            expect(authData.url).toContain('code_challenge=');

            // 交换授权码
            const result = await exchangeOpenAICode('test-auth-code');

            expect(result.type).toBe('success');
            expect(result.accessToken).toBe('test-access-token');
            expect(result.refreshToken).toBe('test-refresh-token');
            expect(result.idToken).toBe('test-id-token');
            expect(result.accountId).toBe('acc-123');
            expect(result.email).toBe('test@openai.com');
            expect(result.expiresAt).toBeGreaterThan(Date.now());
        });
    });

    describe('TC-OAUTH-OPENAI-002: 授权码交换失败', () => {
        it('应该返回 type=failed', async () => {
            // Mock token 交换失败
            mockInvoke.mockRejectedValue(new Error('Invalid authorization code'));

            // 先启动授权流程
            await startOpenAIAuth(8763);

            // 交换授权码
            const result = await exchangeOpenAICode('invalid-code');

            expect(result.type).toBe('failed');
            expect(result.error).toContain('Invalid authorization code');
        });

        it('没有活动会话时应该返回失败', async () => {
            // 不启动授权流程，直接交换
            const result = await exchangeOpenAICode('test-code');

            expect(result.type).toBe('failed');
            expect(result.error).toBe('No active authorization session');
        });
    });

    describe('TC-OAUTH-OPENAI-003: State 验证失败', () => {
        it('不匹配的 state 应该返回 CSRF 错误', async () => {
            // 先启动授权流程
            await startOpenAIAuth(8763);

            // 使用错误的 state
            const result = await exchangeOpenAICode('test-code', 'wrong-state');

            expect(result.type).toBe('failed');
            expect(result.error).toContain('CSRF');
        });
    });

    describe('TC-OAUTH-OPENAI-004: Token 刷新成功', () => {
        it('应该返回新的 accessToken', async () => {
            mockInvoke.mockResolvedValue({
                access_token: 'new-access-token',
                refresh_token: 'new-refresh-token',
                id_token: 'new-id-token',
                expires_in: 3600,
                account_id: 'acc-123',
            });

            const result = await refreshOpenAIToken('test-refresh-token');

            expect(result.type).toBe('success');
            expect(result.accessToken).toBe('new-access-token');
            expect(result.refreshToken).toBe('new-refresh-token');
            expect(result.idToken).toBe('new-id-token');
            expect(result.accountId).toBe('acc-123');
            expect(result.expiresAt).toBeGreaterThan(Date.now());

            expect(mockInvoke).toHaveBeenCalledWith('openai_refresh_token_v2', {
                refreshToken: 'test-refresh-token',
                clientId: expect.any(String),
            });
        });

        it('refresh token 未返回时应该使用旧的', async () => {
            mockInvoke.mockResolvedValue({
                access_token: 'new-access-token',
                // 没有返回 refresh_token
                id_token: 'new-id-token',
                expires_in: 3600,
            });

            const result = await refreshOpenAIToken('old-refresh-token');

            expect(result.type).toBe('success');
            expect(result.refreshToken).toBe('old-refresh-token'); // 使用旧的
        });
    });

    describe('TC-OAUTH-OPENAI-005: Token 刷新失败', () => {
        it('无效的 refreshToken 应该返回 type=failed', async () => {
            mockInvoke.mockRejectedValue(new Error('Invalid refresh token'));

            const result = await refreshOpenAIToken('invalid-refresh-token');

            expect(result.type).toBe('failed');
            expect(result.error).toBe('Invalid refresh token');
        });
    });

    describe('startOpenAIAuth', () => {
        it('应该生成正确的授权 URL', async () => {
            const authData = await startOpenAIAuth(8763);

            expect(authData.url).toContain('auth.openai.com/oauth/authorize');
            expect(authData.url).toContain('client_id=');
            expect(authData.url).toContain('response_type=code');
            expect(authData.url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A8763%2Fopenai-callback');
            expect(authData.url).toContain('scope=openid+email+profile+offline_access');
            expect(authData.url).toContain('state=');
            expect(authData.url).toContain('code_challenge=');
            expect(authData.url).toContain('code_challenge_method=S256');
            expect(authData.url).toContain('prompt=login');
            expect(authData.url).toContain('id_token_add_organizations=true');
            expect(authData.url).toContain('codex_cli_simplified_flow=true');

            expect(authData.instructions).toContain('OpenAI');
            expect(authData.callbackPort).toBe(8763);
        });
    });

    describe('cancelOpenAIAuth', () => {
        it('应该清理授权会话状态', async () => {
            // 启动授权流程
            await startOpenAIAuth(8763);

            // 取消授权
            cancelOpenAIAuth();

            // 尝试交换授权码应该失败
            const result = await exchangeOpenAICode('test-code');
            expect(result.type).toBe('failed');
            expect(result.error).toBe('No active authorization session');
        });
    });
});
