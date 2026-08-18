/**
 * tokenRefresher 服务测试
 *
 * 测试用例对应文档 docs/modules/protocols.md 中的 TC-REFRESH-001 ~ TC-REFRESH-010
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tokenRefresher } from '../../services/tokenRefresher';
import type { ProviderCredential } from '../../types';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

// Mock storage
vi.mock('../../services/storage', () => ({
    providerCredentialsStorage: {
        load: vi.fn(),
        get: vi.fn(),
        add: vi.fn(),
    },
}));

// Mock OAuth services
vi.mock('../../services/google-oauth', () => ({
    refreshGoogleToken: vi.fn(),
}));

vi.mock('../../services/anthropic-oauth', () => ({
    refreshAnthropicToken: vi.fn(),
}));

vi.mock('../../services/openai-oauth', () => ({
    refreshOpenAIToken: vi.fn(),
}));

vi.mock('../../services/kiro-oauth', () => ({
    kiroOAuth: {
        refreshToken: vi.fn(),
    },
}));

describe('tokenRefresher 服务测试', () => {
    let mockLoad: ReturnType<typeof vi.fn>;
    let mockGet: ReturnType<typeof vi.fn>;
    let mockAdd: ReturnType<typeof vi.fn>;
    let mockRefreshGoogle: ReturnType<typeof vi.fn>;
    let mockRefreshAnthropic: ReturnType<typeof vi.fn>;
    let mockRefreshOpenAI: ReturnType<typeof vi.fn>;
    let mockRefreshKiro: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        // 停止服务（如果正在运行）
        tokenRefresher.stop();

        // 获取 mock 函数
        const storage = await import('../../services/storage');
        mockLoad = storage.providerCredentialsStorage.load as ReturnType<typeof vi.fn>;
        mockGet = storage.providerCredentialsStorage.get as ReturnType<typeof vi.fn>;
        mockAdd = storage.providerCredentialsStorage.add as ReturnType<typeof vi.fn>;

        const googleOAuth = await import('../../services/google-oauth');
        mockRefreshGoogle = googleOAuth.refreshGoogleToken as ReturnType<typeof vi.fn>;

        const anthropicOAuth = await import('../../services/anthropic-oauth');
        mockRefreshAnthropic = anthropicOAuth.refreshAnthropicToken as ReturnType<typeof vi.fn>;

        const openaiOAuth = await import('../../services/openai-oauth');
        mockRefreshOpenAI = openaiOAuth.refreshOpenAIToken as ReturnType<typeof vi.fn>;

        const kiroOAuth = await import('../../services/kiro-oauth');
        mockRefreshKiro = kiroOAuth.kiroOAuth.refreshToken as ReturnType<typeof vi.fn>;
    });

    afterEach(() => {
        vi.useRealTimers();
        tokenRefresher.stop();
    });

    describe('TC-REFRESH-START-001: 启动自动续期服务', () => {
        it('应该启动服务并开始定时检查', () => {
            mockLoad.mockResolvedValue([]);

            tokenRefresher.start();

            const status = tokenRefresher.getStatus();
            expect(status.isRunning).toBe(true);
        });

        it('重复启动应该被忽略', () => {
            mockLoad.mockResolvedValue([]);

            tokenRefresher.start();
            tokenRefresher.start();

            const status = tokenRefresher.getStatus();
            expect(status.isRunning).toBe(true);
        });
    });

    describe('TC-REFRESH-STOP-001: 停止自动续期服务', () => {
        it('应该停止服务并清除定时器', () => {
            mockLoad.mockResolvedValue([]);

            tokenRefresher.start();
            tokenRefresher.stop();

            const status = tokenRefresher.getStatus();
            expect(status.isRunning).toBe(false);
        });
    });

    describe('TC-REFRESH-003: 检测即将过期 Token', () => {
        it('Token 在 30 分钟内过期应该自动刷新', async () => {
            const now = Date.now();
            const expiresAt = now + 25 * 60 * 1000; // 25 分钟后过期

            const credential: ProviderCredential = {
                providerId: 'google',
                type: 'oauth',
                accessToken: 'old-token',
                refreshToken: 'refresh-token',
                expiresAt,
                createdAt: new Date(now - 60 * 60 * 1000),
                updatedAt: new Date(now - 60 * 60 * 1000),
            };

            mockLoad.mockResolvedValue([credential]);
            mockRefreshGoogle.mockResolvedValue({
                type: 'success',
                accessToken: 'new-token',
                refreshToken: 'refresh-token',
                expiresAt: now + 60 * 60 * 1000,
            });
            mockAdd.mockResolvedValue(undefined);

            tokenRefresher.start();

            // 等待立即执行的检查完成
            await vi.advanceTimersByTimeAsync(0);

            expect(mockRefreshGoogle).toHaveBeenCalledWith('refresh-token');
            expect(mockAdd).toHaveBeenCalled();
        });
    });

    describe('TC-REFRESH-004: 检测已过期 Token', () => {
        it('Token 已过期应该自动刷新', async () => {
            const now = Date.now();
            const expiresAt = now - 5 * 60 * 1000; // 5 分钟前已过期

            const credential: ProviderCredential = {
                providerId: 'openai',
                type: 'oauth',
                accessToken: 'old-token',
                refreshToken: 'refresh-token',
                expiresAt,
                createdAt: new Date(now - 2 * 60 * 60 * 1000),
                updatedAt: new Date(now - 2 * 60 * 60 * 1000),
            };

            mockLoad.mockResolvedValue([credential]);
            mockRefreshOpenAI.mockResolvedValue({
                type: 'success',
                accessToken: 'new-token',
                refreshToken: 'refresh-token',
                expiresAt: now + 60 * 60 * 1000,
            });
            mockAdd.mockResolvedValue(undefined);

            tokenRefresher.start();

            // 等待立即执行的检查完成
            await vi.advanceTimersByTimeAsync(0);

            expect(mockRefreshOpenAI).toHaveBeenCalledWith('refresh-token');
            expect(mockAdd).toHaveBeenCalled();
        });
    });

    describe('TC-REFRESH-005: 刷新成功', () => {
        it('应该更新凭证并通知回调', async () => {
            const now = Date.now();
            const callback = vi.fn();

            const credential: ProviderCredential = {
                providerId: 'anthropic',
                type: 'oauth',
                accessToken: 'old-token',
                refreshToken: 'refresh-token',
                expiresAt: now + 10 * 60 * 1000, // 10 分钟后过期
                createdAt: new Date(now - 60 * 60 * 1000),
                updatedAt: new Date(now - 60 * 60 * 1000),
            };

            mockLoad.mockResolvedValue([credential]);
            mockRefreshAnthropic.mockResolvedValue({
                type: 'success',
                accessToken: 'new-token',
                refreshToken: 'new-refresh-token',
                expiresAt: now + 60 * 60 * 1000,
            });
            mockAdd.mockResolvedValue(undefined);

            tokenRefresher.start(callback);

            // 等待立即执行的检查完成
            await vi.advanceTimersByTimeAsync(0);

            expect(mockAdd).toHaveBeenCalledWith(
                expect.objectContaining({
                    providerId: 'anthropic',
                    accessToken: 'new-token',
                    refreshToken: 'new-refresh-token',
                })
            );
            expect(callback).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    providerId: 'anthropic',
                })
            );
        });
    });

    describe('TC-REFRESH-006: 刷新失败但 Token 未过期（优雅降级）', () => {
        it('应该继续使用旧 Token', async () => {
            const now = Date.now();
            const callback = vi.fn();

            const credential: ProviderCredential = {
                providerId: 'google',
                type: 'oauth',
                accessToken: 'old-token',
                refreshToken: 'refresh-token',
                expiresAt: now + 10 * 60 * 1000, // 还有 10 分钟
                createdAt: new Date(now - 60 * 60 * 1000),
                updatedAt: new Date(now - 60 * 60 * 1000),
            };

            mockLoad.mockResolvedValue([credential]);
            // 刷新失败
            mockRefreshGoogle.mockResolvedValue({
                type: 'failed',
                error: 'Network error',
            });

            tokenRefresher.start(callback);

            // 等待立即执行的检查完成
            await vi.advanceTimersByTimeAsync(0);

            // 不应该通知回调（优雅降级）
            expect(callback).not.toHaveBeenCalled();
            // 不应该更新凭证
            expect(mockAdd).not.toHaveBeenCalled();
        });
    });

    describe('TC-REFRESH-007: 刷新失败且 Token 已过期', () => {
        it('应该返回失败并通知回调', async () => {
            const now = Date.now();
            const callback = vi.fn();

            const credential: ProviderCredential = {
                providerId: 'openai',
                type: 'oauth',
                accessToken: 'old-token',
                refreshToken: 'refresh-token',
                expiresAt: now - 5 * 60 * 1000, // 已过期 5 分钟
                createdAt: new Date(now - 2 * 60 * 60 * 1000),
                updatedAt: new Date(now - 2 * 60 * 60 * 1000),
            };

            mockLoad.mockResolvedValue([credential]);
            // 刷新失败（所有重试都失败）
            mockRefreshOpenAI.mockResolvedValue({
                type: 'failed',
                error: 'Invalid refresh token',
            });

            tokenRefresher.start(callback);

            // 等待立即执行的检查完成（包括所有重试）
            await vi.advanceTimersByTimeAsync(0);
            // 等待第 1 次重试延迟（1 秒）
            await vi.advanceTimersByTimeAsync(1000);
            // 等待第 2 次重试延迟（2 秒）
            await vi.advanceTimersByTimeAsync(2000);

            // 应该通知回调失败
            expect(callback).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    providerId: 'openai',
                    error: expect.stringContaining('Invalid refresh token'),
                })
            );
        });
    });

    describe('TC-REFRESH-008: 重试机制', () => {
        it('第 1 次失败，第 2 次成功应该自动重试', async () => {
            const now = Date.now();

            const credential: ProviderCredential = {
                providerId: 'google',
                type: 'oauth',
                accessToken: 'old-token',
                refreshToken: 'refresh-token',
                expiresAt: now + 10 * 60 * 1000,
                createdAt: new Date(now - 60 * 60 * 1000),
                updatedAt: new Date(now - 60 * 60 * 1000),
            };

            mockLoad.mockResolvedValue([credential]);
            // 第 1 次失败，第 2 次成功
            mockRefreshGoogle
                .mockResolvedValueOnce({
                    type: 'failed',
                    error: 'Temporary error',
                })
                .mockResolvedValueOnce({
                    type: 'success',
                    accessToken: 'new-token',
                    refreshToken: 'refresh-token',
                    expiresAt: now + 60 * 60 * 1000,
                });
            mockAdd.mockResolvedValue(undefined);

            tokenRefresher.start();

            // 等待立即执行的检查完成（包括重试）
            await vi.advanceTimersByTimeAsync(0);
            // 等待第 1 次重试延迟（1 秒）
            await vi.advanceTimersByTimeAsync(1000);

            expect(mockRefreshGoogle).toHaveBeenCalledTimes(2);
            expect(mockAdd).toHaveBeenCalled();
        });
    });

    describe('TC-REFRESH-009: 防止重复刷新', () => {
        it('同时调用 2 次 refreshToken 应该只执行 1 次刷新', async () => {
            const now = Date.now();

            const credential: ProviderCredential = {
                providerId: 'google',
                type: 'oauth',
                accessToken: 'old-token',
                refreshToken: 'refresh-token',
                expiresAt: now + 10 * 60 * 1000,
                createdAt: new Date(now - 60 * 60 * 1000),
                updatedAt: new Date(now - 60 * 60 * 1000),
            };

            mockRefreshGoogle.mockResolvedValue({
                type: 'success',
                accessToken: 'new-token',
                refreshToken: 'refresh-token',
                expiresAt: now + 60 * 60 * 1000,
            });
            mockAdd.mockResolvedValue(undefined);

            // 同时调用 2 次
            const promise1 = tokenRefresher.refreshToken(credential);
            const promise2 = tokenRefresher.refreshToken(credential);

            await Promise.all([promise1, promise2]);

            // 只应该调用 1 次刷新
            expect(mockRefreshGoogle).toHaveBeenCalledTimes(1);
        });
    });

    describe('TC-REFRESH-010: 手动刷新 Token', () => {
        it('应该立即刷新指定提供商', async () => {
            const now = Date.now();

            const credential: ProviderCredential = {
                providerId: 'anthropic',
                type: 'oauth',
                accessToken: 'old-token',
                refreshToken: 'refresh-token',
                expiresAt: now + 60 * 60 * 1000, // 还有 1 小时
                createdAt: new Date(now - 60 * 60 * 1000),
                updatedAt: new Date(now - 60 * 60 * 1000),
            };

            mockGet.mockResolvedValue(credential);
            mockRefreshAnthropic.mockResolvedValue({
                type: 'success',
                accessToken: 'new-token',
                refreshToken: 'refresh-token',
                expiresAt: now + 2 * 60 * 60 * 1000,
            });
            mockAdd.mockResolvedValue(undefined);

            const result = await tokenRefresher.refreshByProviderId('anthropic');

            expect(result.success).toBe(true);
            expect(mockRefreshAnthropic).toHaveBeenCalledWith('refresh-token');
            expect(mockAdd).toHaveBeenCalled();
        });

        it('提供商不存在应该返回失败', async () => {
            mockGet.mockResolvedValue(null);

            const result = await tokenRefresher.refreshByProviderId('nonexistent');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Credential not found');
        });

        it('非 OAuth 凭证应该返回失败', async () => {
            const credential: ProviderCredential = {
                providerId: 'openai',
                type: 'api',
                apiKey: 'sk-test',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockGet.mockResolvedValue(credential);

            const result = await tokenRefresher.refreshByProviderId('openai');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Not an OAuth credential');
        });
    });

    // v0.9.2: Kiro Token 刷新失败时自动清理失效凭证的测试用例
    describe('TC-KIRO-011: v0.9.2 Token 刷新失败 - 不可恢复错误自动删除凭证', () => {
        it('refreshToken 失效时应该自动删除凭证并返回 needsReauth', async () => {
            const now = Date.now();
            const credential: ProviderCredential = {
                providerId: 'kiro',
                type: 'oauth',
                accessToken: 'old-token',
                refreshToken: 'invalid-refresh-token',
                expiresAt: now - 1000, // 已过期
                kiroClientId: 'client-id',
                kiroClientSecret: 'client-secret',
                kiroSsoRegion: 'us-east-1',
                createdAt: new Date(now - 60 * 60 * 1000),
                updatedAt: new Date(now - 60 * 60 * 1000),
            };

            mockGet.mockResolvedValue(credential);
            mockLoad.mockResolvedValue([credential]);

            // Mock Kiro 刷新返回 needsReauth
            mockRefreshKiro.mockResolvedValue({
                success: false,
                error: 'Invalid token provided',
                needsReauth: true,
            });

            // Mock storage.remove
            const storage = await import('../../services/storage');
            const mockRemove = vi.fn().mockResolvedValue(undefined);
            storage.providerCredentialsStorage.remove = mockRemove;

            // 调用刷新
            const resultPromise = tokenRefresher.refreshByProviderId('kiro');

            // 推进定时器（第一次尝试立即执行）
            await vi.advanceTimersByTimeAsync(0);

            const result = await resultPromise;

            // 验证返回结果
            expect(result.success).toBe(false);
            expect(result.needsReauth).toBe(true);
            expect(result.error).toContain('Invalid token provided');

            // 验证凭证被删除
            expect(mockRemove).toHaveBeenCalledWith('kiro');
        });
    });

    describe('TC-KIRO-012: v0.9.2 Token 刷新失败 - 不可恢复错误跳过优雅降级', () => {
        it('needsReauth 时即使旧 token 未过期也不使用优雅降级', async () => {
            const now = Date.now();
            const credential: ProviderCredential = {
                providerId: 'kiro',
                type: 'oauth',
                accessToken: 'old-token',
                refreshToken: 'invalid-refresh-token',
                expiresAt: now + 10 * 60 * 1000, // 还有 10 分钟才过期
                kiroClientId: 'client-id',
                kiroClientSecret: 'client-secret',
                kiroSsoRegion: 'us-east-1',
                createdAt: new Date(now - 60 * 60 * 1000),
                updatedAt: new Date(now - 60 * 60 * 1000),
            };

            mockGet.mockResolvedValue(credential);
            mockLoad.mockResolvedValue([credential]);

            // Mock Kiro 刷新返回 needsReauth
            mockRefreshKiro.mockResolvedValue({
                success: false,
                error: 'invalid_grant',
                needsReauth: true,
            });

            // Mock storage.remove
            const storage = await import('../../services/storage');
            const mockRemove = vi.fn().mockResolvedValue(undefined);
            storage.providerCredentialsStorage.remove = mockRemove;

            // 调用刷新
            const resultPromise = tokenRefresher.refreshByProviderId('kiro');

            // 推进定时器（第一次尝试立即执行）
            await vi.advanceTimersByTimeAsync(0);

            const result = await resultPromise;

            // 验证不使用优雅降级，直接返回失败
            expect(result.success).toBe(false);
            expect(result.needsReauth).toBe(true);
            expect(result.usedFallback).toBeUndefined(); // 没有使用降级

            // 验证凭证被删除
            expect(mockRemove).toHaveBeenCalledWith('kiro');
        });
    });

    describe('TC-KIRO-013: v0.9.2 Token 刷新失败 - 可重试错误保留凭证', () => {
        it('临时错误时应该保留凭证并走正常重试流程', async () => {
            const now = Date.now();
            const credential: ProviderCredential = {
                providerId: 'kiro',
                type: 'oauth',
                accessToken: 'old-token',
                refreshToken: 'refresh-token',
                expiresAt: now + 10 * 60 * 1000, // 还有 10 分钟才过期
                kiroClientId: 'client-id',
                kiroClientSecret: 'client-secret',
                kiroSsoRegion: 'us-east-1',
                createdAt: new Date(now - 60 * 60 * 1000),
                updatedAt: new Date(now - 60 * 60 * 1000),
            };

            mockGet.mockResolvedValue(credential);
            mockLoad.mockResolvedValue([credential]);

            // Mock Kiro 刷新返回临时错误（无 needsReauth）
            mockRefreshKiro.mockResolvedValue({
                success: false,
                error: 'Network timeout',
                needsReauth: false, // 可重试错误
            });

            // Mock storage.remove
            const storage = await import('../../services/storage');
            const mockRemove = vi.fn().mockResolvedValue(undefined);
            storage.providerCredentialsStorage.remove = mockRemove;

            // 调用刷新
            const resultPromise = tokenRefresher.refreshByProviderId('kiro');

            // 推进定时器（第一次尝试立即执行）
            await vi.advanceTimersByTimeAsync(0);
            // 等待第 1 次重试延迟（1 秒）
            await vi.advanceTimersByTimeAsync(1000);
            // 等待第 2 次重试延迟（2 秒）
            await vi.advanceTimersByTimeAsync(2000);

            const result = await resultPromise;

            // 验证使用优雅降级（旧 token 仍有效）
            expect(result.success).toBe(true);
            expect(result.usedFallback).toBe(true);

            // 验证凭证未被删除
            expect(mockRemove).not.toHaveBeenCalled();
        });
    });

    describe('TC-MULTI-001: 多个 Token 刷新', () => {
        it('单次检查能够顺序刷新多个提供商的凭证', async () => {
            const now = Date.now();
            const credentials: ProviderCredential[] = [
                {
                    providerId: 'google',
                    type: 'oauth',
                    accessToken: 'old-google',
                    refreshToken: 'refresh-google',
                    expiresAt: now - 300 * 1000,
                    createdAt: new Date(now - 60 * 60 * 1000),
                    updatedAt: new Date(now - 60 * 60 * 1000),
                },
                {
                    providerId: 'openai',
                    type: 'oauth',
                    accessToken: 'old-openai',
                    refreshToken: 'refresh-openai',
                    expiresAt: now - 300 * 1000,
                    createdAt: new Date(now - 60 * 60 * 1000),
                    updatedAt: new Date(now - 60 * 60 * 1000),
                }
            ];

            mockLoad.mockResolvedValue(credentials);
            mockGet.mockImplementation(async (id) => credentials.find(c => c.providerId === id) || null);

            // Mock responses
            mockRefreshGoogle.mockResolvedValue({ type: 'success', accessToken: 'new-google', expiresAt: now + 3600000 });
            mockRefreshOpenAI.mockResolvedValue({ type: 'success', accessToken: 'new-openai', expiresAt: now + 3600000 });

            // Trigger checkAndRefresh
            await tokenRefresher.checkAndRefresh();

            expect(mockRefreshGoogle).toHaveBeenCalled();
            expect(mockRefreshOpenAI).toHaveBeenCalled();

            // Should've made two adds sequentially
            expect(mockAdd).toHaveBeenCalledTimes(2);
        });
    });

    describe('TC-REFRESH-OAUTH-001: Google & Anthropic & OpenAI invalid_grant', () => {
        it('当错误包含 invalid_grant 时应该删除凭证并返回 needsReauth', async () => {
            const now = Date.now();
            const providers = ['google', 'anthropic', 'openai'];

            for (const provider of providers) {
                const credential: ProviderCredential = {
                    providerId: provider,
                    type: 'oauth',
                    accessToken: `old-${provider}`,
                    refreshToken: `refresh-${provider}`,
                    expiresAt: now + 10 * 60 * 1000, // 还有 10 分钟才过期
                    createdAt: new Date(now - 60 * 60 * 1000),
                    updatedAt: new Date(now - 60 * 60 * 1000),
                };

                mockGet.mockResolvedValue(credential);
                mockLoad.mockResolvedValue([credential]);

                // Mock to return failed with invalid_grant
                if (provider === 'google') {
                    mockRefreshGoogle.mockResolvedValue({ type: 'failed', error: 'invalid_grant' });
                } else if (provider === 'anthropic') {
                    mockRefreshAnthropic.mockResolvedValue({ type: 'failed', error: 'invalid_grant' });
                } else if (provider === 'openai') {
                    mockRefreshOpenAI.mockResolvedValue({ type: 'failed', error: 'invalid_grant' });
                }

                // Mock storage.remove
                const storage = await import('../../services/storage');
                const mockRemove = vi.fn().mockResolvedValue(undefined);
                storage.providerCredentialsStorage.remove = mockRemove;

                const resultPromise = tokenRefresher.refreshByProviderId(provider);
                await vi.advanceTimersByTimeAsync(0);

                const result = await resultPromise;

                expect(result.success).toBe(false);
                expect(result.needsReauth).toBe(true);
                expect(result.usedFallback).toBeUndefined(); // 没有使用降级
                expect(mockRemove).toHaveBeenCalledWith(provider);
            }
        });
    });
});
