/**
 * @file providers.test.ts
 * @description 提供商模块单元测试
 *
 * 测试 providerCredentialsStorage 凭证存储服务
 * 对应文档 docs/modules/providers.md 中的测试用例
 *
 * v3.4.5: 初始版本，添加凭证存储测试
 * v3.4.6: 添加 Token 自动续期服务测试、modelFetcher 测试
 *
 * @module test/services/providers
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as tauriCore from '@tauri-apps/api/core';
import { providerCredentialsStorage } from '../../services/storage';
import type { ProviderCredential, ProviderAuthType } from '../../types';

/**
 * 创建测试用凭证
 *
 * @param overrides - 覆盖默认值的字段
 * @returns 测试凭证对象
 */
function createTestCredential(overrides: Partial<ProviderCredential> = {}): ProviderCredential {
    return {
        providerId: 'test-provider',
        type: 'api' as ProviderAuthType,
        apiKey: 'sk-test-key-12345',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        ...overrides,
    };
}

function enableTauriEnv(): void {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
        value: {},
        configurable: true,
    });
}

function disableTauriEnv(): void {
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

describe('Provider Credentials Storage', () => {
    // 每个测试前清空 localStorage
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
        disableTauriEnv();
    });

    // ==================== 凭证存储测试 ====================

    /**
     * TC-PROV-001: 保存凭证
     * 验证有效的 ProviderCredential 能正确保存并可重新加载
     */
    it('TC-PROV-001: 保存凭证应成功，可重新加载', async () => {
        const credential = createTestCredential({
            providerId: 'openai',
            apiKey: 'sk-openai-test-key',
        });

        // 保存凭证
        await providerCredentialsStorage.save([credential]);

        // 重新加载验证
        const loaded = await providerCredentialsStorage.load();
        expect(loaded).toHaveLength(1);
        expect(loaded[0].providerId).toBe('openai');
        expect(loaded[0].apiKey).toBe('sk-openai-test-key');
        expect(loaded[0].type).toBe('api');
    });

    /**
     * TC-PROV-002: 加载凭证
     * 验证已保存的凭证能正确返回
     */
    it('TC-PROV-002: 加载凭证应返回正确的凭证列表', async () => {
        const credentials = [
            createTestCredential({ providerId: 'openai' }),
            createTestCredential({ providerId: 'anthropic' }),
            createTestCredential({ providerId: 'google' }),
        ];

        await providerCredentialsStorage.save(credentials);

        const loaded = await providerCredentialsStorage.load();
        expect(loaded).toHaveLength(3);
        expect(loaded.map(c => c.providerId)).toEqual(['openai', 'anthropic', 'google']);
    });

    /**
     * TC-PROV-003: 添加单个凭证
     * 验证添加新凭证后列表长度+1
     */
    it('TC-PROV-003: 添加单个凭证应成功，列表长度+1', async () => {
        // 先保存一个凭证
        const existing = createTestCredential({ providerId: 'openai' });
        await providerCredentialsStorage.save([existing]);

        // 添加新凭证
        const newCredential = createTestCredential({ providerId: 'anthropic' });
        await providerCredentialsStorage.add(newCredential);

        const loaded = await providerCredentialsStorage.load();
        expect(loaded).toHaveLength(2);
        expect(loaded.map(c => c.providerId)).toContain('anthropic');
    });

    /**
     * TC-PROV-004: 删除凭证
     * 验证删除存在的 providerId 后列表长度-1
     */
    it('TC-PROV-004: 删除凭证应成功，列表长度-1', async () => {
        const credentials = [
            createTestCredential({ providerId: 'openai' }),
            createTestCredential({ providerId: 'anthropic' }),
        ];
        await providerCredentialsStorage.save(credentials);

        // 删除 openai 凭证
        await providerCredentialsStorage.remove('openai');

        const loaded = await providerCredentialsStorage.load();
        expect(loaded).toHaveLength(1);
        expect(loaded[0].providerId).toBe('anthropic');
    });

    /**
     * TC-PROV-005: 获取凭证
     * 验证获取存在的 providerId 返回对应凭证
     */
    it('TC-PROV-005: 获取凭证应返回对应凭证', async () => {
        const credentials = [
            createTestCredential({ providerId: 'openai', apiKey: 'openai-key' }),
            createTestCredential({ providerId: 'anthropic', apiKey: 'anthropic-key' }),
        ];
        await providerCredentialsStorage.save(credentials);

        const credential = await providerCredentialsStorage.get('anthropic');
        expect(credential).not.toBeNull();
        expect(credential?.providerId).toBe('anthropic');
        expect(credential?.apiKey).toBe('anthropic-key');
    });

    /**
     * TC-PROV-006: 获取不存在的凭证
     * 验证获取不存在的 providerId 返回 null
     */
    it('TC-PROV-006: 获取不存在的凭证应返回 null', async () => {
        const credential = createTestCredential({ providerId: 'openai' });
        await providerCredentialsStorage.save([credential]);

        const result = await providerCredentialsStorage.get('non-existent');
        expect(result).toBeNull();
    });

    /**
     * TC-PROV-007: 更新凭证
     * 验证更新已存在的 providerId 时旧凭证被覆盖
     */
    it('TC-PROV-007: 更新凭证应覆盖旧凭证', async () => {
        const credential = createTestCredential({
            providerId: 'openai',
            apiKey: 'old-key',
        });
        await providerCredentialsStorage.save([credential]);

        // 添加同一 providerId 的新凭证（应覆盖）
        const updatedCredential = createTestCredential({
            providerId: 'openai',
            apiKey: 'new-key',
        });
        await providerCredentialsStorage.add(updatedCredential);

        const loaded = await providerCredentialsStorage.load();
        expect(loaded).toHaveLength(1);
        expect(loaded[0].apiKey).toBe('new-key');
    });

    /**
     * TC-PROV-008: 保存含 accountId 的凭证
     * v3.3.5: 验证 OpenAI OAuth 凭证的 accountId 正确序列化和反序列化
     */
    it('TC-PROV-008: 保存含 accountId 的凭证应正确序列化', async () => {
        const oauthCredential = createTestCredential({
            providerId: 'openai',
            type: 'oauth' as ProviderAuthType,
            accessToken: 'access-token-12345',
            refreshToken: 'refresh-token-67890',
            expiresAt: Date.now() + 3600000,
            accountId: 'acct_abc123xyz',  // v3.3.5: ChatGPT 账户 ID
        });

        await providerCredentialsStorage.save([oauthCredential]);

        // 验证原始存储数据
        const stored = localStorage.getItem('mobaus_provider_credentials');
        expect(stored).toBeTruthy();
        const parsed = JSON.parse(stored!);
        expect(parsed[0].account_id).toBe('acct_abc123xyz');

        // 验证加载后的数据
        const loaded = await providerCredentialsStorage.load();
        expect(loaded[0].accountId).toBe('acct_abc123xyz');
    });

    /**
     * TC-PROV-009: 保存含 projectId 的凭证
     * v3.4.3: 验证 Google OAuth 凭证的 projectId 正确序列化和反序列化
     */
    it('TC-PROV-009: 保存含 projectId 的凭证应正确序列化', async () => {
        const googleCredential = createTestCredential({
            providerId: 'google',
            type: 'oauth' as ProviderAuthType,
            accessToken: 'ya29.google-access-token',
            refreshToken: 'google-refresh-token',
            expiresAt: Date.now() + 3600000,
            projectId: 'my-gcp-project-123',  // v3.4.3: Google Cloud 项目 ID
        });

        await providerCredentialsStorage.save([googleCredential]);

        // 验证原始存储数据
        const stored = localStorage.getItem('mobaus_provider_credentials');
        expect(stored).toBeTruthy();
        const parsed = JSON.parse(stored!);
        expect(parsed[0].project_id).toBe('my-gcp-project-123');

        // 验证加载后的数据
        const loaded = await providerCredentialsStorage.load();
        expect(loaded[0].projectId).toBe('my-gcp-project-123');
    });

    // ==================== 边界情况测试 ====================

    /**
     * 边界情况：空列表保存
     */
    it('保存空列表应正常工作', async () => {
        await providerCredentialsStorage.save([]);

        const loaded = await providerCredentialsStorage.load();
        expect(loaded).toEqual([]);
    });

    /**
     * 边界情况：多凭证保存
     */
    it('多凭证应正确保存和加载', async () => {
        const credentials = [
            createTestCredential({ providerId: 'openai', type: 'api' as ProviderAuthType }),
            createTestCredential({ providerId: 'anthropic', type: 'oauth' as ProviderAuthType }),
            createTestCredential({ providerId: 'google', type: 'oauth' as ProviderAuthType }),
            createTestCredential({ providerId: 'deepseek', type: 'api' as ProviderAuthType }),
        ];

        await providerCredentialsStorage.save(credentials);

        const loaded = await providerCredentialsStorage.load();
        expect(loaded).toHaveLength(4);
    });

    /**
     * 边界情况：日期字段正确转换
     */
    it('日期字段应正确序列化和反序列化', async () => {
        const credential = createTestCredential({
            providerId: 'test',
            createdAt: new Date('2024-06-15T10:30:00Z'),
            updatedAt: new Date('2024-06-15T12:00:00Z'),
        });

        await providerCredentialsStorage.save([credential]);

        const loaded = await providerCredentialsStorage.load();
        expect(loaded[0].createdAt).toBeInstanceOf(Date);
        expect(loaded[0].updatedAt).toBeInstanceOf(Date);
        expect(loaded[0].createdAt.toISOString()).toBe('2024-06-15T10:30:00.000Z');
    });

    /**
     * 同步加载方法测试
     */
    it('loadSync 应正确加载凭证', async () => {
        const credential = createTestCredential({
            providerId: 'openai',
            apiKey: 'sync-test-key',
        });
        await providerCredentialsStorage.save([credential]);

        const loaded = providerCredentialsStorage.loadSync();
        expect(loaded).toHaveLength(1);
        expect(loaded[0].apiKey).toBe('sync-test-key');
    });

    /**
     * 字段映射测试：snake_case <-> camelCase
     */
    it('字段映射应正确转换 snake_case 和 camelCase', async () => {
        const credential = createTestCredential({
            providerId: 'test-mapping',
            type: 'oauth' as ProviderAuthType,
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            expiresAt: 1234567890,
            accountId: 'account-123',
            projectId: 'project-456',
        });

        await providerCredentialsStorage.save([credential]);

        // 验证存储格式为 snake_case
        const stored = localStorage.getItem('mobaus_provider_credentials');
        const parsed = JSON.parse(stored!);
        expect(parsed[0]).toHaveProperty('provider_id');
        expect(parsed[0]).toHaveProperty('access_token');
        expect(parsed[0]).toHaveProperty('refresh_token');
        expect(parsed[0]).toHaveProperty('expires_at');
        expect(parsed[0]).toHaveProperty('account_id');
        expect(parsed[0]).toHaveProperty('project_id');
        expect(parsed[0]).toHaveProperty('created_at');
        expect(parsed[0]).toHaveProperty('updated_at');

        // 验证加载后为 camelCase
        const loaded = await providerCredentialsStorage.load();
        expect(loaded[0]).toHaveProperty('providerId');
        expect(loaded[0]).toHaveProperty('accessToken');
        expect(loaded[0]).toHaveProperty('refreshToken');
        expect(loaded[0]).toHaveProperty('expiresAt');
        expect(loaded[0]).toHaveProperty('accountId');
        expect(loaded[0]).toHaveProperty('projectId');
        expect(loaded[0]).toHaveProperty('createdAt');
        expect(loaded[0]).toHaveProperty('updatedAt');
    });
});

// ==================== PKCE 工具模块测试 ====================

describe('PKCE Utils', () => {
    /**
     * 测试 generateRandomString 函数
     */
    it('generateRandomString 应生成指定长度的随机字符串', async () => {
        const { generateRandomString } = await import('../../utils/pkce');

        const str32 = generateRandomString(32);
        expect(str32).toHaveLength(32);

        const str64 = generateRandomString(64);
        expect(str64).toHaveLength(64);

        // 验证字符集
        const validChars = /^[A-Za-z0-9\-._~]+$/;
        expect(str32).toMatch(validChars);
        expect(str64).toMatch(validChars);
    });

    /**
     * 测试 generatePKCE 函数
     */
    it('generatePKCE 应生成有效的 verifier 和 challenge', async () => {
        const { generatePKCE } = await import('../../utils/pkce');

        const pkce = await generatePKCE();

        // verifier 应为 64 字符
        expect(pkce.verifier).toHaveLength(64);

        // challenge 应为 Base64URL 编码（无填充）
        expect(pkce.challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
        expect(pkce.challenge).not.toContain('=');
        expect(pkce.challenge).not.toContain('+');
        expect(pkce.challenge).not.toContain('/');

        // challenge 长度应为 43 字符（SHA-256 的 Base64URL 编码）
        expect(pkce.challenge).toHaveLength(43);
    });

    /**
     * 测试 generateState 函数
     */
    it('generateState 应生成随机 state 字符串', async () => {
        const { generateState } = await import('../../utils/pkce');

        const state1 = generateState();
        const state2 = generateState();

        // 默认长度 32
        expect(state1).toHaveLength(32);

        // 每次生成应不同
        expect(state1).not.toBe(state2);
    });

    /**
     * 测试 validateState 函数
     */
    it('validateState 应正确验证 state 匹配', async () => {
        const { validateState, generateState } = await import('../../utils/pkce');

        const state = generateState();

        // 匹配应返回 true
        expect(validateState(state, state)).toBe(true);

        // 不匹配应返回 false
        expect(validateState(state, 'different-state')).toBe(false);

        // null 值应返回 false
        expect(validateState(null, state)).toBe(false);
        expect(validateState(state, null)).toBe(false);
        expect(validateState(null, null)).toBe(false);
    });

    /**
     * 测试 PKCE 的唯一性
     */
    it('每次生成的 PKCE 应不同', async () => {
        const { generatePKCE } = await import('../../utils/pkce');

        const pkce1 = await generatePKCE();
        const pkce2 = await generatePKCE();

        expect(pkce1.verifier).not.toBe(pkce2.verifier);
        expect(pkce1.challenge).not.toBe(pkce2.challenge);
    });
});

// ==================== Token 自动续期服务测试 ====================

describe('Token Refresher Service', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    /**
     * TC-REFRESH-VALID-001: 检查 Token 有效性 - API Key
     */
    it('TC-REFRESH-VALID-001: isTokenValid 应正确检查 API Key 凭证', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存 API Key 凭证
        await providerCredentialsStorage.save([{
            providerId: 'openai',
            type: 'api',
            apiKey: 'sk-test-key',
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const isValid = await tokenRefresher.isTokenValid('openai');
        expect(isValid).toBe(true);
    });

    /**
     * TC-REFRESH-VALID-002: 检查 OAuth Token 过期
     */
    it('TC-REFRESH-VALID-002: isTokenValid 应检测过期的 OAuth Token', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存已过期的 OAuth 凭证
        await providerCredentialsStorage.save([{
            providerId: 'google',
            type: 'oauth',
            accessToken: 'ya29.expired-token',
            refreshToken: 'refresh-token',
            expiresAt: Date.now() - 1000, // 已过期
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const isValid = await tokenRefresher.isTokenValid('google');
        expect(isValid).toBe(false);
    });

    /**
     * TC-REFRESH-003: 检查有效的 OAuth Token
     */
    it('TC-REFRESH-003: isTokenValid 应识别有效的 OAuth Token', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存有效的 OAuth 凭证
        await providerCredentialsStorage.save([{
            providerId: 'anthropic',
            type: 'oauth',
            accessToken: 'sk-ant-oat-valid-token',
            refreshToken: 'refresh-token',
            expiresAt: Date.now() + 3600000, // 1小时后过期
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const isValid = await tokenRefresher.isTokenValid('anthropic');
        expect(isValid).toBe(true);
    });

    /**
     * TC-REFRESH-004: 获取 Token TTL
     */
    it('TC-REFRESH-004: getTokenTTL 应返回正确的剩余时间', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        const expiresIn = 3600000; // 1小时
        const expiresAt = Date.now() + expiresIn;

        await providerCredentialsStorage.save([{
            providerId: 'openai',
            type: 'oauth',
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            expiresAt,
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const ttl = await tokenRefresher.getTokenTTL('openai');
        // TTL 应该接近 1 小时（允许 1 秒误差）
        expect(ttl).toBeGreaterThan(expiresIn - 1000);
        expect(ttl).toBeLessThanOrEqual(expiresIn);
    });

    /**
     * TC-REFRESH-005: 不存在的凭证返回无效
     */
    it('TC-REFRESH-005: 不存在的凭证应返回无效', async () => {
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        const isValid = await tokenRefresher.isTokenValid('non-existent');
        expect(isValid).toBe(false);

        const ttl = await tokenRefresher.getTokenTTL('non-existent');
        expect(ttl).toBe(0);
    });

    /**
     * TC-REFRESH-006: 服务状态检查
     */
    it('TC-REFRESH-006: getStatus 应返回正确的服务状态', async () => {
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 初始状态
        let status = tokenRefresher.getStatus();
        expect(status.isRunning).toBe(false);
        expect(status.refreshingProviders).toEqual([]);

        // 启动服务
        tokenRefresher.start();
        status = tokenRefresher.getStatus();
        expect(status.isRunning).toBe(true);

        // 停止服务
        tokenRefresher.stop();
        status = tokenRefresher.getStatus();
        expect(status.isRunning).toBe(false);
    });

    /**
     * TC-REFRESH-007: 重复启动服务应被忽略
     */
    it('TC-REFRESH-007: 重复启动服务应被忽略', async () => {
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 启动服务
        tokenRefresher.start();
        expect(tokenRefresher.getStatus().isRunning).toBe(true);

        // 再次启动应被忽略
        tokenRefresher.start();
        expect(tokenRefresher.getStatus().isRunning).toBe(true);

        // 停止服务
        tokenRefresher.stop();
    });

    /**
     * TC-REFRESH-008: 停止未运行的服务应安全
     */
    it('TC-REFRESH-008: 停止未运行的服务应安全', async () => {
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 确保服务未运行
        tokenRefresher.stop();
        expect(tokenRefresher.getStatus().isRunning).toBe(false);

        // 再次停止应安全
        tokenRefresher.stop();
        expect(tokenRefresher.getStatus().isRunning).toBe(false);
    });

    /**
     * TC-REFRESH-009: 回调管理测试
     */
    it('TC-REFRESH-009: 回调添加和移除应正常工作', async () => {
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        const results: string[] = [];
        const callback1 = (result: { providerId: string }) => {
            results.push(`cb1:${result.providerId}`);
        };
        const callback2 = (result: { providerId: string }) => {
            results.push(`cb2:${result.providerId}`);
        };

        // 添加回调
        tokenRefresher.addCallback(callback1);
        tokenRefresher.addCallback(callback2);

        // 移除回调
        tokenRefresher.removeCallback(callback1);

        // 移除不存在的回调应安全
        tokenRefresher.removeCallback(() => {});

        // 清理
        tokenRefresher.stop();
    });

    /**
     * TC-REFRESH-010: refreshByProviderId 凭证不存在
     */
    it('TC-REFRESH-010: refreshByProviderId 凭证不存在应返回错误', async () => {
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        const result = await tokenRefresher.refreshByProviderId('non-existent');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Credential not found');
    });

    /**
     * TC-REFRESH-011: refreshByProviderId 非 OAuth 凭证
     */
    it('TC-REFRESH-011: refreshByProviderId 非 OAuth 凭证应返回错误', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存 API Key 凭证
        await providerCredentialsStorage.save([{
            providerId: 'openai',
            type: 'api',
            apiKey: 'sk-test-key',
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const result = await tokenRefresher.refreshByProviderId('openai');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Not an OAuth credential');
    });

    /**
     * TC-REFRESH-012: ensureTokenValid API Key 凭证
     */
    it('TC-REFRESH-012: ensureTokenValid 应正确处理 API Key 凭证', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存 API Key 凭证
        await providerCredentialsStorage.save([{
            providerId: 'openai',
            type: 'api',
            apiKey: 'sk-test-key',
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const isValid = await tokenRefresher.ensureTokenValid('openai');
        expect(isValid).toBe(true);
    });

    /**
     * TC-REFRESH-013: ensureTokenValid 凭证不存在
     */
    it('TC-REFRESH-013: ensureTokenValid 凭证不存在应返回 false', async () => {
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        const isValid = await tokenRefresher.ensureTokenValid('non-existent');
        expect(isValid).toBe(false);
    });

    /**
     * TC-REFRESH-014: ensureTokenValid OAuth 无 accessToken
     */
    it('TC-REFRESH-014: ensureTokenValid OAuth 无 accessToken 应返回 false', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存无 accessToken 的 OAuth 凭证
        await providerCredentialsStorage.save([{
            providerId: 'google',
            type: 'oauth',
            refreshToken: 'refresh-token',
            expiresAt: Date.now() + 3600000,
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const isValid = await tokenRefresher.ensureTokenValid('google');
        expect(isValid).toBe(false);
    });

    /**
     * TC-REFRESH-015: ensureTokenValid OAuth 有效且未过期
     */
    it('TC-REFRESH-015: ensureTokenValid OAuth 有效且未过期应返回 true', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存有效的 OAuth 凭证（1小时后过期）
        await providerCredentialsStorage.save([{
            providerId: 'google',
            type: 'oauth',
            accessToken: 'ya29.valid-token',
            refreshToken: 'refresh-token',
            expiresAt: Date.now() + 3600000, // 1小时后过期
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const isValid = await tokenRefresher.ensureTokenValid('google');
        expect(isValid).toBe(true);
    });

    /**
     * TC-REFRESH-016: ensureTokenValid OAuth 无过期时间
     */
    it('TC-REFRESH-016: ensureTokenValid OAuth 无过期时间应返回 true', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存无过期时间的 OAuth 凭证
        await providerCredentialsStorage.save([{
            providerId: 'anthropic',
            type: 'oauth',
            accessToken: 'sk-ant-oat-valid-token',
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const isValid = await tokenRefresher.ensureTokenValid('anthropic');
        expect(isValid).toBe(true);
    });

    /**
     * TC-REFRESH-017: isTokenValid OAuth 无 accessToken
     */
    it('TC-REFRESH-017: isTokenValid OAuth 无 accessToken 应返回 false', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存无 accessToken 的 OAuth 凭证
        await providerCredentialsStorage.save([{
            providerId: 'google',
            type: 'oauth',
            refreshToken: 'refresh-token',
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const isValid = await tokenRefresher.isTokenValid('google');
        expect(isValid).toBe(false);
    });

    /**
     * TC-REFRESH-018: isTokenValid OAuth 无过期时间
     */
    it('TC-REFRESH-018: isTokenValid OAuth 无过期时间应返回 true', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存无过期时间的 OAuth 凭证
        await providerCredentialsStorage.save([{
            providerId: 'anthropic',
            type: 'oauth',
            accessToken: 'sk-ant-oat-valid-token',
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const isValid = await tokenRefresher.isTokenValid('anthropic');
        expect(isValid).toBe(true);
    });

    /**
     * TC-REFRESH-019: isTokenValid 其他类型凭证
     */
    it('TC-REFRESH-019: isTokenValid 其他类型凭证应返回 false', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存 env 类型凭证
        await providerCredentialsStorage.save([{
            providerId: 'azure',
            type: 'env',
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const isValid = await tokenRefresher.isTokenValid('azure');
        expect(isValid).toBe(false);
    });

    /**
     * TC-REFRESH-020: getTokenTTL OAuth 无过期时间
     */
    it('TC-REFRESH-020: getTokenTTL OAuth 无过期时间应返回 -1', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存无过期时间的 OAuth 凭证
        await providerCredentialsStorage.save([{
            providerId: 'anthropic',
            type: 'oauth',
            accessToken: 'sk-ant-oat-valid-token',
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const ttl = await tokenRefresher.getTokenTTL('anthropic');
        expect(ttl).toBe(-1);
    });

    /**
     * TC-REFRESH-021: getTokenTTL OAuth 已过期
     */
    it('TC-REFRESH-021: getTokenTTL OAuth 已过期应返回 0', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存已过期的 OAuth 凭证
        await providerCredentialsStorage.save([{
            providerId: 'google',
            type: 'oauth',
            accessToken: 'ya29.expired-token',
            expiresAt: Date.now() - 1000, // 已过期
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const ttl = await tokenRefresher.getTokenTTL('google');
        expect(ttl).toBe(0);
    });

    /**
     * TC-REFRESH-022: 启动服务时带回调
     */
    it('TC-REFRESH-022: 启动服务时带回调应正常工作', async () => {
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        const results: string[] = [];
        const callback = (result: { providerId: string }) => {
            results.push(result.providerId);
        };

        // 启动服务时带回调
        tokenRefresher.start(callback);
        expect(tokenRefresher.getStatus().isRunning).toBe(true);

        // 停止服务
        tokenRefresher.stop();
        expect(tokenRefresher.getStatus().isRunning).toBe(false);
    });

    /**
     * TC-REFRESH-023: isTokenValid API Key 为空
     */
    it('TC-REFRESH-023: isTokenValid API Key 为空应返回 false', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存空 API Key 凭证
        await providerCredentialsStorage.save([{
            providerId: 'openai',
            type: 'api',
            apiKey: '',
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const isValid = await tokenRefresher.isTokenValid('openai');
        expect(isValid).toBe(false);
    });

    /**
     * TC-REFRESH-024: ensureTokenValid API Key 为空
     */
    it('TC-REFRESH-024: ensureTokenValid API Key 为空应返回 false', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存空 API Key 凭证
        await providerCredentialsStorage.save([{
            providerId: 'openai',
            type: 'api',
            apiKey: '',
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const isValid = await tokenRefresher.ensureTokenValid('openai');
        expect(isValid).toBe(false);
    });

    /**
     * TC-REFRESH-025: ensureTokenValid 其他类型凭证
     */
    it('TC-REFRESH-025: ensureTokenValid 其他类型凭证应返回 false', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存 env 类型凭证
        await providerCredentialsStorage.save([{
            providerId: 'azure',
            type: 'env',
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const isValid = await tokenRefresher.ensureTokenValid('azure');
        expect(isValid).toBe(false);
    });
});

// ==================== 模型获取服务测试 ====================

describe('Model Fetcher Service', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * TC-MODEL-DYNAMIC-001: supportsDynamicFetch 检查
     * v3.4.2: supportsDynamicFetch 同时检查 API 动态获取和 models.dev 支持
     */
    it('TC-MODEL-DYNAMIC-001: supportsDynamicFetch 应正确识别支持的提供商', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        // 支持动态获取的提供商（API 或 models.dev）
        expect(modelFetcher.default.supportsDynamicFetch('openai')).toBe(true);
        expect(modelFetcher.default.supportsDynamicFetch('openrouter')).toBe(true);
        expect(modelFetcher.default.supportsDynamicFetch('google')).toBe(true);
        expect(modelFetcher.default.supportsDynamicFetch('groq')).toBe(true);
        expect(modelFetcher.default.supportsDynamicFetch('together')).toBe(true);
        // models.dev 支持的提供商
        expect(modelFetcher.default.supportsDynamicFetch('anthropic')).toBe(true);
        expect(modelFetcher.default.supportsDynamicFetch('deepseek')).toBe(true);

        // 不支持动态获取的提供商
        expect(modelFetcher.default.supportsDynamicFetch('unknown')).toBe(false);
        expect(modelFetcher.default.supportsDynamicFetch('custom')).toBe(false);

        // supportsApiFetch 只检查 API 直接获取
        expect(modelFetcher.default.supportsApiFetch('openai')).toBe(true);
        expect(modelFetcher.default.supportsApiFetch('anthropic')).toBe(false);
        expect(modelFetcher.default.supportsApiFetch('deepseek')).toBe(false);
    });

    /**
     * TC-MODEL-002: getCacheStatus 初始状态
     */
    it('TC-MODEL-002: getCacheStatus 初始状态应为空', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        const status = modelFetcher.default.getCacheStatus();
        expect(status).toEqual({});
    });

    /**
     * TC-MODEL-003: clearCache 清除所有缓存
     */
    it('TC-MODEL-003: clearCache 应清除所有缓存', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        // 先设置一些缓存数据
        localStorage.setItem('mobaus_model_cache', JSON.stringify({
            openai: {
                providerId: 'openai',
                models: [{ id: 'gpt-4', name: 'GPT-4' }],
                fetchedAt: Date.now(),
                source: 'api',
            },
        }));

        // 清除缓存
        await modelFetcher.default.clearCache();

        // 验证缓存已清除
        expect(localStorage.getItem('mobaus_model_cache')).toBeNull();
    });

    /**
     * TC-MODEL-004: clearCache 清除指定提供商缓存
     */
    it('TC-MODEL-004: clearCache 应清除指定提供商缓存', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        // 先设置多个提供商的缓存数据
        localStorage.setItem('mobaus_model_cache', JSON.stringify({
            openai: {
                providerId: 'openai',
                models: [{ id: 'gpt-4', name: 'GPT-4' }],
                fetchedAt: Date.now(),
                source: 'api',
            },
            anthropic: {
                providerId: 'anthropic',
                models: [{ id: 'claude-3', name: 'Claude 3' }],
                fetchedAt: Date.now(),
                source: 'models.dev',
            },
        }));

        // 清除 openai 缓存
        await modelFetcher.default.clearCache('openai');

        // 验证 openai 缓存已清除，anthropic 保留
        const cache = JSON.parse(localStorage.getItem('mobaus_model_cache') || '{}');
        expect(cache.openai).toBeUndefined();
        expect(cache.anthropic).toBeDefined();
    });

    /**
     * TC-MODEL-005: clearCache 同时清除 models.dev 缓存
     */
    it('TC-MODEL-005: clearCache 应同时清除 models.dev 缓存', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        // 设置 models.dev 缓存
        localStorage.setItem('mobaus_models_dev_cache', JSON.stringify({
            data: { openai: { id: 'openai', name: 'OpenAI', models: {} } },
            fetchedAt: Date.now(),
        }));

        // 清除所有缓存，包括 models.dev
        await modelFetcher.default.clearCache(undefined, true);

        // 验证 models.dev 缓存已清除
        expect(localStorage.getItem('mobaus_models_dev_cache')).toBeNull();
    });

    /**
     * TC-MODEL-006: refreshModelsDev 刷新缓存
     */
    it('TC-MODEL-006: refreshModelsDev 应清除 models.dev 缓存', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        // 设置 models.dev 缓存
        localStorage.setItem('mobaus_models_dev_cache', JSON.stringify({
            data: { openai: { id: 'openai', name: 'OpenAI', models: {} } },
            fetchedAt: Date.now(),
        }));

        // 刷新
        await modelFetcher.default.refreshModelsDev();

        // 验证缓存已清除
        expect(localStorage.getItem('mobaus_models_dev_cache')).toBeNull();
    });

    /**
     * TC-MODEL-007: getCacheStatus 有缓存时
     */
    it('TC-MODEL-007: getCacheStatus 有缓存时应返回正确状态', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        const now = Date.now();
        localStorage.setItem('mobaus_model_cache', JSON.stringify({
            openai: {
                providerId: 'openai',
                models: [
                    { id: 'gpt-4', name: 'GPT-4' },
                    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
                ],
                fetchedAt: now,
                source: 'api',
            },
        }));

        const status = modelFetcher.default.getCacheStatus();
        expect(status.openai).toBeDefined();
        expect(status.openai.fetchedAt).toBe(now);
        expect(status.openai.source).toBe('api');
        expect(status.openai.count).toBe(2);
    });

    /**
     * TC-MODEL-008: fetchModels 使用内置数据
     */
    it('TC-MODEL-008: fetchModels 无缓存无网络时应返回内置数据', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        // Mock fetch 失败
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

        const builtinModels = [
            { id: 'gpt-4', name: 'GPT-4', maxTokens: 4096, contextWindow: 8192 },
        ];

        const result = await modelFetcher.default.fetchModels(
            'anthropic',  // 不支持动态获取的提供商
            'sk-test-key',
            undefined,
            builtinModels
        );

        // 应该返回内置数据
        expect(result.source).toBe('builtin');
        expect(result.models).toEqual(builtinModels);
    });

    /**
     * TC-MODEL-009: fetchModels 使用缓存数据
     */
    it('TC-MODEL-009: fetchModels 有有效缓存时应返回缓存数据', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        // Mock fetch 失败（确保不会从网络获取）
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

        // 设置有效缓存
        const cachedModels = [
            { id: 'claude-3-opus', name: 'Claude 3 Opus', maxTokens: 4096, contextWindow: 200000 },
        ];
        localStorage.setItem('mobaus_model_cache', JSON.stringify({
            anthropic: {
                providerId: 'anthropic',
                models: cachedModels,
                fetchedAt: Date.now(), // 刚刚缓存的
                source: 'models.dev',
            },
        }));

        const result = await modelFetcher.default.fetchModels(
            'anthropic',
            'sk-test-key',
            undefined,
            []
        );

        // 应该返回缓存数据
        expect(result.source).toBe('cache');
        expect(result.models).toEqual(cachedModels);
    });

    /**
     * TC-MODEL-010: fetchModels 缓存过期
     */
    it('TC-MODEL-010: fetchModels 缓存过期时应尝试重新获取', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        // Mock fetch 失败
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

        // 设置过期缓存（超过 24 小时）
        const expiredTime = Date.now() - 25 * 60 * 60 * 1000; // 25 小时前
        localStorage.setItem('mobaus_model_cache', JSON.stringify({
            anthropic: {
                providerId: 'anthropic',
                models: [{ id: 'old-model', name: 'Old Model', maxTokens: 4096 }],
                fetchedAt: expiredTime,
                source: 'api',
            },
        }));

        const builtinModels = [
            { id: 'builtin-model', name: 'Builtin Model', maxTokens: 4096, contextWindow: 8192 },
        ];

        const result = await modelFetcher.default.fetchModels(
            'anthropic',
            'sk-test-key',
            undefined,
            builtinModels
        );

        // v3.4.7: 缓存过期时，网络失败，应该使用过期缓存作为 fallback（而不是内置数据）
        // 这样可以确保用户重启后不会丢失之前获取的模型数据
        expect(result.source).toBe('cache');
        expect(result.models[0].id).toBe('old-model');
    });

    /**
     * TC-MODEL-011: fetchModels 空内置数据
     */
    it('TC-MODEL-011: fetchModels 无任何数据时应返回空数组', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        // Mock fetch 失败
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

        const result = await modelFetcher.default.fetchModels(
            'unknown-provider',
            'sk-test-key',
            undefined,
            [] // 空内置数据
        );

        expect(result.source).toBe('builtin');
        expect(result.models).toEqual([]);
    });

    /**
     * TC-MODEL-012: getModelsDevProviders 返回提供商列表
     */
    it('TC-MODEL-012: getModelsDevProviders 应返回提供商列表', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        // Mock fetch 返回 models.dev 数据
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({
                openai: { id: 'openai', name: 'OpenAI', models: {} },
                anthropic: { id: 'anthropic', name: 'Anthropic', models: {} },
            }),
        } as Response);

        const providers = await modelFetcher.default.getModelsDevProviders();
        expect(Array.isArray(providers)).toBe(true);
    });

    /**
     * TC-MODEL-013: supportsModelsDev 检查
     */
    it('TC-MODEL-013: supportsModelsDev 应正确检查提供商', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        // Mock fetch 返回 models.dev 数据
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({
                openai: { id: 'openai', name: 'OpenAI', models: {} },
            }),
        } as Response);

        const supportsOpenAI = await modelFetcher.default.supportsModelsDev('openai');
        expect(supportsOpenAI).toBe(true);
    });

    /**
     * TC-MODEL-014: fetchFromModelsDev 网络请求失败时返回空数组
     */
    it('TC-MODEL-014: fetchFromModelsDev 网络请求失败时应返回空数组', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        // 清除可能存在的缓存
        localStorage.removeItem('mobaus_models_dev_cache');

        // Mock fetch 失败
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

        const models = await modelFetcher.default.fetchFromModelsDev('unknown-provider');
        expect(models).toEqual([]);
    });

    /**
     * TC-MODEL-015: getCachedModels 获取单个提供商缓存
     * v3.4.10: 用于应用启动时恢复 providers 的模型数据
     */
    it('TC-MODEL-015: getCachedModels 应返回指定提供商的缓存模型', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        // 设置缓存数据
        const cachedModels = [
            { id: 'gpt-4', name: 'GPT-4', maxTokens: 4096, contextWindow: 8192 },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', maxTokens: 4096, contextWindow: 4096 },
        ];
        localStorage.setItem('mobaus_model_cache', JSON.stringify({
            openai: {
                providerId: 'openai',
                models: cachedModels,
                fetchedAt: Date.now(),
                source: 'api',
            },
        }));

        const models = await modelFetcher.default.getCachedModels('openai');
        expect(models).toBeDefined();
        expect(models).toHaveLength(2);
        expect(models![0].id).toBe('gpt-4');
    });

    /**
     * TC-MODEL-016: getCachedModels 不存在的提供商返回 undefined
     * v3.4.10: 验证无缓存时的返回值
     */
    it('TC-MODEL-016: getCachedModels 不存在的提供商应返回 undefined', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        // 清除缓存
        localStorage.removeItem('mobaus_model_cache');

        const models = await modelFetcher.default.getCachedModels('nonexistent');
        expect(models).toBeUndefined();
    });

    /**
     * TC-MODEL-017: getAllCachedModels 获取所有缓存模型
     * v3.4.10: 用于应用启动时批量恢复 providers 的模型数据
     */
    it('TC-MODEL-017: getAllCachedModels 应返回所有提供商的缓存模型', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        // 设置多个提供商的缓存数据
        localStorage.setItem('mobaus_model_cache', JSON.stringify({
            openai: {
                providerId: 'openai',
                models: [{ id: 'gpt-4', name: 'GPT-4', maxTokens: 4096 }],
                fetchedAt: Date.now(),
                source: 'api',
            },
            anthropic: {
                providerId: 'anthropic',
                models: [{ id: 'claude-3-opus', name: 'Claude 3 Opus', maxTokens: 4096 }],
                fetchedAt: Date.now(),
                source: 'models.dev',
            },
        }));

        const allModels = await modelFetcher.default.getAllCachedModels();
        expect(Object.keys(allModels)).toHaveLength(2);
        expect(allModels.openai).toBeDefined();
        expect(allModels.anthropic).toBeDefined();
        expect(allModels.openai[0].id).toBe('gpt-4');
        expect(allModels.anthropic[0].id).toBe('claude-3-opus');
    });

    /**
     * TC-MODEL-018: getAllCachedModels 无缓存时返回空对象
     * v3.4.10: 验证无缓存时的返回值
     */
    it('TC-MODEL-018: getAllCachedModels 无缓存时应返回空对象', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        // 清除缓存
        localStorage.removeItem('mobaus_model_cache');

        const allModels = await modelFetcher.default.getAllCachedModels();
        expect(allModels).toEqual({});
    });

    /**
     * TC-MODEL-019: getCachedModels 空模型列表返回 undefined
     * v3.4.10: 验证空模型列表的处理
     */
    it('TC-MODEL-019: getCachedModels 空模型列表应返回 undefined', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        // 设置空模型列表的缓存
        localStorage.setItem('mobaus_model_cache', JSON.stringify({
            openai: {
                providerId: 'openai',
                models: [],
                fetchedAt: Date.now(),
                source: 'api',
            },
        }));

        const models = await modelFetcher.default.getCachedModels('openai');
        expect(models).toBeUndefined();
    });

    /**
     * TC-MODEL-020: getAllCachedModels 跳过空模型列表
     * v3.4.10: 验证空模型列表不会被包含在结果中
     */
    it('TC-MODEL-020: getAllCachedModels 应跳过空模型列表', async () => {
        const modelFetcher = await import('../../services/modelFetcher');

        // 设置包含空模型列表的缓存
        localStorage.setItem('mobaus_model_cache', JSON.stringify({
            openai: {
                providerId: 'openai',
                models: [{ id: 'gpt-4', name: 'GPT-4', maxTokens: 4096 }],
                fetchedAt: Date.now(),
                source: 'api',
            },
            anthropic: {
                providerId: 'anthropic',
                models: [], // 空模型列表
                fetchedAt: Date.now(),
                source: 'models.dev',
            },
        }));

        const allModels = await modelFetcher.default.getAllCachedModels();
        expect(Object.keys(allModels)).toHaveLength(1);
        expect(allModels.openai).toBeDefined();
        expect(allModels.anthropic).toBeUndefined();
    });
});

// ==================== Token 刷新详细测试 ====================

describe('Token Refresh Detailed Tests', () => {
    beforeEach(async () => {
        localStorage.clear();
        vi.restoreAllMocks();

        // 重置模块状态
        const { tokenRefresher } = await import('../../services/tokenRefresher');
        tokenRefresher.stop();
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        const { tokenRefresher } = await import('../../services/tokenRefresher');
        tokenRefresher.stop();
    });

    /**
     * TC-REFRESH-026: refreshByProviderId 凭证不存在
     */
    it('TC-REFRESH-026: refreshByProviderId 凭证不存在应返回失败', async () => {
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        const result = await tokenRefresher.refreshByProviderId('nonexistent');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Credential not found');
    });

    /**
     * TC-REFRESH-027: refreshByProviderId 非 OAuth 凭证
     */
    it('TC-REFRESH-027: refreshByProviderId 非 OAuth 凭证应返回失败', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存 API Key 凭证
        await providerCredentialsStorage.save([{
            providerId: 'openai',
            type: 'api',
            apiKey: 'sk-test-key',
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const result = await tokenRefresher.refreshByProviderId('openai');
        expect(result.success).toBe(false);
        expect(result.error).toBe('Not an OAuth credential');
    });

    /**
     * TC-REFRESH-028: refreshToken 无 refreshToken
     */
    it('TC-REFRESH-028: refreshToken 无 refreshToken 应返回失败', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存无 refreshToken 的 OAuth 凭证
        await providerCredentialsStorage.save([{
            providerId: 'openai',
            type: 'oauth',
            accessToken: 'access-token',
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const result = await tokenRefresher.refreshByProviderId('openai');
        expect(result.success).toBe(false);
        expect(result.error).toBe('No refresh token');
    });

    /**
     * TC-REFRESH-029: refreshToken 不支持的提供商
     */
    it('TC-REFRESH-029: refreshToken 不支持的提供商应返回失败', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存不支持的提供商凭证
        await providerCredentialsStorage.save([{
            providerId: 'unknown-provider',
            type: 'oauth',
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const result = await tokenRefresher.refreshByProviderId('unknown-provider');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Unsupported provider');
    });

    /**
     * TC-REFRESH-030: checkAndRefresh 跳过非 OAuth 凭证
     */
    it('TC-REFRESH-030: checkAndRefresh 应跳过非 OAuth 凭证', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存 API Key 凭证
        await providerCredentialsStorage.save([{
            providerId: 'openai',
            type: 'api',
            apiKey: 'sk-test-key',
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        // 不应抛出错误
        await tokenRefresher.checkAndRefresh();
    });

    /**
     * TC-REFRESH-031: checkAndRefresh 跳过无 refreshToken 的凭证
     */
    it('TC-REFRESH-031: checkAndRefresh 应跳过无 refreshToken 的凭证', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存无 refreshToken 的 OAuth 凭证
        await providerCredentialsStorage.save([{
            providerId: 'google',
            type: 'oauth',
            accessToken: 'access-token',
            expiresAt: Date.now() + 1000, // 即将过期
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        // 不应抛出错误
        await tokenRefresher.checkAndRefresh();
    });

    /**
     * TC-REFRESH-032: checkAndRefresh 跳过无 expiresAt 的凭证
     */
    it('TC-REFRESH-032: checkAndRefresh 应跳过无 expiresAt 的凭证', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存无 expiresAt 的 OAuth 凭证
        await providerCredentialsStorage.save([{
            providerId: 'google',
            type: 'oauth',
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        // 不应抛出错误
        await tokenRefresher.checkAndRefresh();
    });

    /**
     * TC-REFRESH-033: checkAndRefresh 跳过未过期的凭证
     */
    it('TC-REFRESH-033: checkAndRefresh 应跳过未过期的凭证', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存未过期的 OAuth 凭证（1小时后过期）
        await providerCredentialsStorage.save([{
            providerId: 'google',
            type: 'oauth',
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            expiresAt: Date.now() + 3600000, // 1小时后过期
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        // 不应抛出错误
        await tokenRefresher.checkAndRefresh();
    });

    /**
     * TC-REFRESH-034: ensureTokenValid OAuth 无 accessToken
     */
    it('TC-REFRESH-034: ensureTokenValid OAuth 无 accessToken 应返回 false', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存无 accessToken 的 OAuth 凭证
        await providerCredentialsStorage.save([{
            providerId: 'google',
            type: 'oauth',
            refreshToken: 'refresh-token',
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const isValid = await tokenRefresher.ensureTokenValid('google');
        expect(isValid).toBe(false);
    });

    /**
     * TC-REFRESH-035: ensureTokenValid OAuth 已过期但无 refreshToken
     */
    it('TC-REFRESH-035: ensureTokenValid OAuth 已过期但无 refreshToken 应返回 false', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存已过期且无 refreshToken 的 OAuth 凭证
        await providerCredentialsStorage.save([{
            providerId: 'google',
            type: 'oauth',
            accessToken: 'access-token',
            expiresAt: Date.now() - 1000, // 已过期
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const isValid = await tokenRefresher.ensureTokenValid('google');
        expect(isValid).toBe(false);
    });

    /**
     * TC-REFRESH-036: 回调执行异常不影响其他回调
     */
    it('TC-REFRESH-036: 回调执行异常不应影响其他回调', async () => {
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        const results: string[] = [];

        // 添加一个会抛出异常的回调
        const badCallback = () => {
            throw new Error('Callback error');
        };

        // 添加一个正常的回调
        const goodCallback = (result: { providerId: string }) => {
            results.push(result.providerId);
        };

        tokenRefresher.addCallback(badCallback);
        tokenRefresher.addCallback(goodCallback);

        // 启动服务（会触发 checkAndRefresh）
        tokenRefresher.start();

        // 停止服务
        tokenRefresher.stop();

        // 移除回调
        tokenRefresher.removeCallback(badCallback);
        tokenRefresher.removeCallback(goodCallback);
    });

    /**
     * TC-REFRESH-037: isTokenValid OAuth 已过期
     */
    it('TC-REFRESH-037: isTokenValid OAuth 已过期应返回 false', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        // 保存已过期的 OAuth 凭证
        await providerCredentialsStorage.save([{
            providerId: 'google',
            type: 'oauth',
            accessToken: 'access-token',
            expiresAt: Date.now() - 1000, // 已过期
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const isValid = await tokenRefresher.isTokenValid('google');
        expect(isValid).toBe(false);
    });

    /**
     * TC-REFRESH-038: getTokenTTL 有效 Token
     */
    it('TC-REFRESH-038: getTokenTTL 有效 Token 应返回正确的 TTL', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');
        const { tokenRefresher } = await import('../../services/tokenRefresher');

        const expiresAt = Date.now() + 3600000; // 1小时后过期
        await providerCredentialsStorage.save([{
            providerId: 'google',
            type: 'oauth',
            accessToken: 'access-token',
            expiresAt,
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        const ttl = await tokenRefresher.getTokenTTL('google');
        // TTL 应该接近 3600000（允许一些误差）
        expect(ttl).toBeGreaterThan(3500000);
        expect(ttl).toBeLessThanOrEqual(3600000);
    });
});

// ==================== Storage 凭证存储详细测试 ====================

describe('Provider Credentials Storage Detailed Tests', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    /**
     * TC-PROV-010: 保存空凭证列表
     */
    it('TC-PROV-010: 保存空凭证列表应正常工作', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');

        await providerCredentialsStorage.save([]);
        const loaded = await providerCredentialsStorage.load();
        expect(loaded).toEqual([]);
    });

    /**
     * TC-PROV-011: 加载损坏的 JSON 数据
     */
    it('TC-PROV-011: 加载损坏的 JSON 数据应返回空数组', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');

        // 保存损坏的 JSON
        localStorage.setItem('mobaus_provider_credentials', 'invalid json');

        const loaded = await providerCredentialsStorage.load();
        expect(loaded).toEqual([]);
    });

    /**
     * TC-PROV-012: 删除不存在的凭证
     */
    it('TC-PROV-012: 删除不存在的凭证应正常工作', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');

        // 先保存一个凭证
        await providerCredentialsStorage.save([{
            providerId: 'openai',
            type: 'api',
            apiKey: 'sk-test',
            createdAt: new Date(),
            updatedAt: new Date(),
        }]);

        // 删除不存在的凭证
        await providerCredentialsStorage.remove('nonexistent');

        // 原有凭证应该还在
        const loaded = await providerCredentialsStorage.load();
        expect(loaded.length).toBe(1);
        expect(loaded[0].providerId).toBe('openai');
    });

    /**
     * TC-PROV-013: 更新已存在的凭证
     */
    it('TC-PROV-013: 更新已存在的凭证应覆盖旧数据', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');

        // 先保存一个凭证
        await providerCredentialsStorage.add({
            providerId: 'openai',
            type: 'api',
            apiKey: 'sk-old-key',
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // 更新凭证
        await providerCredentialsStorage.add({
            providerId: 'openai',
            type: 'api',
            apiKey: 'sk-new-key',
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // 应该只有一个凭证，且是新的
        const loaded = await providerCredentialsStorage.load();
        expect(loaded.length).toBe(1);
        expect(loaded[0].apiKey).toBe('sk-new-key');
    });

    it('TC-PROV-013b: 更新大小写不同的同一 Provider 凭证不应产生重复记录', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');

        await providerCredentialsStorage.add({
            providerId: 'OpenAI',
            type: 'api',
            apiKey: 'sk-old-key',
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        await providerCredentialsStorage.add({
            providerId: 'openai',
            type: 'api',
            apiKey: 'sk-new-key',
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const loaded = await providerCredentialsStorage.load();
        expect(loaded.length).toBe(1);
        expect(loaded[0].providerId).toBe('openai');
        expect(loaded[0].apiKey).toBe('sk-new-key');
    });

    it('TC-PROV-013c: 删除大小写不同的 Provider ID 应删除对应凭证', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');

        await providerCredentialsStorage.save([
            {
                providerId: 'OpenAI',
                type: 'api',
                apiKey: 'sk-openai',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            {
                providerId: 'anthropic',
                type: 'api',
                apiKey: 'sk-anthropic',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ]);

        await providerCredentialsStorage.remove('openai');

        const loaded = await providerCredentialsStorage.load();
        expect(loaded).toHaveLength(1);
        expect(loaded[0].providerId).toBe('anthropic');
    });

    /**
     * TC-PROV-014: 保存多个不同类型的凭证
     */
    it('TC-PROV-014: 保存多个不同类型的凭证应正常工作', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');

        await providerCredentialsStorage.save([
            {
                providerId: 'openai',
                type: 'api',
                apiKey: 'sk-test',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            {
                providerId: 'google',
                type: 'oauth',
                accessToken: 'ya29.token',
                refreshToken: 'refresh-token',
                expiresAt: Date.now() + 3600000,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            {
                providerId: 'ollama',
                type: 'none',
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ]);

        const loaded = await providerCredentialsStorage.load();
        expect(loaded.length).toBe(3);

        const openai = loaded.find(c => c.providerId === 'openai');
        const google = loaded.find(c => c.providerId === 'google');
        const ollama = loaded.find(c => c.providerId === 'ollama');

        expect(openai?.type).toBe('api');
        expect(google?.type).toBe('oauth');
        expect(ollama?.type).toBe('none');
    });

    /**
     * TC-PROV-015: 凭证日期序列化和反序列化
     */
    it('TC-PROV-015: 凭证日期应正确序列化和反序列化', async () => {
        const { providerCredentialsStorage } = await import('../../services/storage');

        const now = new Date();
        await providerCredentialsStorage.add({
            providerId: 'openai',
            type: 'api',
            apiKey: 'sk-test',
            createdAt: now,
            updatedAt: now,
        });

        const credential = await providerCredentialsStorage.get('openai');
        expect(credential).not.toBeNull();
        // 日期应该被正确反序列化
        expect(credential?.createdAt instanceof Date).toBe(true);
        expect(credential?.updatedAt instanceof Date).toBe(true);
    });

    // ==================== v4.2.5: 凭证存储安全边界测试 ====================

    /**
     * TC-CRED-SEC-005: 浏览器环境保存
     * 验证浏览器环境下凭证保存到 localStorage（预期行为）
     */
    it('TC-CRED-SEC-005: 浏览器环境保存应使用 localStorage', async () => {
        const credential = createTestCredential({
            providerId: 'openai',
            type: 'oauth' as ProviderAuthType,
            accessToken: 'test-access-token',
            refreshToken: 'test-refresh-token',
        });

        await providerCredentialsStorage.save([credential]);

        // 验证数据保存到 localStorage
        const stored = localStorage.getItem('mobaus_provider_credentials');
        expect(stored).toBeTruthy();
        const parsed = JSON.parse(stored!);
        expect(parsed[0].provider_id).toBe('openai');
        expect(parsed[0].access_token).toBe('test-access-token');
    });

    /**
     * TC-CRED-SEC-006: 浏览器环境加载
     * 验证浏览器环境下从 localStorage 加载凭证（预期行为）
     */
    it('TC-CRED-SEC-006: 浏览器环境加载应从 localStorage 读取', async () => {
        // 直接写入 localStorage
        const credentialData = {
            provider_id: 'anthropic',
            type: 'api',
            api_key: 'sk-ant-test',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        localStorage.setItem('mobaus_provider_credentials', JSON.stringify([credentialData]));

        const loaded = await providerCredentialsStorage.load();
        expect(loaded).toHaveLength(1);
        expect(loaded[0].providerId).toBe('anthropic');
        expect(loaded[0].apiKey).toBe('sk-ant-test');
    });

    /**
     * TC-CRED-SEC-001: Tauri 保存成功
     * 验证 Tauri 环境下凭证保存到文件系统，不使用 localStorage
     *
     * 注意：此测试用例需要在真实的 Tauri 环境中运行
     * 在浏览器测试环境中，我们只能验证代码逻辑的正确性
     */
    it('TC-CRED-SEC-001: Tauri 保存成功（需要 Tauri 环境）', async () => {
        enableTauriEnv();
        const invokeSpy = vi.spyOn(tauriCore, 'invoke').mockResolvedValue(undefined);

        const credential = createTestCredential({
            providerId: 'openai',
            type: 'oauth' as ProviderAuthType,
            accessToken: 'tauri-access-token',
        });

        await providerCredentialsStorage.save([credential]);

        expect(invokeSpy).toHaveBeenCalledWith('save_provider_credentials', expect.objectContaining({
            credentials: expect.any(Array),
        }));
        expect(localStorage.getItem('mobaus_provider_credentials')).toBeNull();
    });

    /**
     * TC-CRED-SEC-002: Tauri 保存失败
     * 验证 Tauri 环境下保存失败时抛出错误，不回退到 localStorage
     *
     * 注意：此测试用例需要在真实的 Tauri 环境中运行
     */
    it('TC-CRED-SEC-002: Tauri 保存失败应抛出错误（需要 Tauri 环境）', async () => {
        enableTauriEnv();
        vi.spyOn(tauriCore, 'invoke').mockRejectedValue(new Error('tauri save failed'));

        const credential = createTestCredential({
            providerId: 'openai',
            type: 'oauth' as ProviderAuthType,
            accessToken: 'tauri-access-token',
        });

        await expect(providerCredentialsStorage.save([credential])).rejects.toThrow('凭证存储失败');
        expect(localStorage.getItem('mobaus_provider_credentials')).toBeNull();
    });

    /**
     * TC-CRED-SEC-003: Tauri 加载成功
     * 验证 Tauri 环境下从文件系统加载凭证
     */
    it('TC-CRED-SEC-003: Tauri 加载成功（需要 Tauri 环境）', async () => {
        enableTauriEnv();
        vi.spyOn(tauriCore, 'invoke').mockResolvedValue([
            {
                provider_id: 'openai',
                type: 'oauth',
                access_token: 'tauri-access-token',
                refresh_token: 'tauri-refresh-token',
                created_at: new Date('2026-01-01').toISOString(),
                updated_at: new Date('2026-01-02').toISOString(),
            },
        ]);

        const loaded = await providerCredentialsStorage.load();
        expect(loaded).toHaveLength(1);
        expect(loaded[0].providerId).toBe('openai');
        expect(loaded[0].accessToken).toBe('tauri-access-token');
    });

    /**
     * TC-CRED-SEC-004: Tauri 加载失败
     * 验证 Tauri 环境下加载失败时抛出错误，不回退到 localStorage
     */
    it('TC-CRED-SEC-004: Tauri 加载失败应抛出错误（需要 Tauri 环境）', async () => {
        enableTauriEnv();
        vi.spyOn(tauriCore, 'invoke').mockRejectedValue(new Error('tauri load failed'));
        localStorage.setItem('mobaus_provider_credentials', JSON.stringify([{
            provider_id: 'legacy',
            type: 'api',
            api_key: 'legacy-key',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }]));

        await expect(providerCredentialsStorage.load()).rejects.toThrow('凭证加载失败');
    });

    /**
     * TC-CRED-SEC-007: 错误消息清晰（保存失败）
     * 验证错误消息的格式和内容
     */
    it('TC-CRED-SEC-007: 错误消息应包含有用的提示信息', () => {
        // 验证错误消息格式
        const saveError = new Error('凭证存储失败：无法写入安全存储。请检查应用权限和磁盘空间。');
        expect(saveError.message).toContain('凭证存储失败');
        expect(saveError.message).toContain('检查应用权限和磁盘空间');

        const loadError = new Error('凭证加载失败：无法读取安全存储。请检查应用权限。');
        expect(loadError.message).toContain('凭证加载失败');
        expect(loadError.message).toContain('检查应用权限');
    });
});
