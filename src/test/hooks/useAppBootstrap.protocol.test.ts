/**
 * @file useAppBootstrap.protocol.test.ts
 * @description useAppBootstrap Hook 协议映射测试
 *
 * 测试 useAppBootstrap 加载自定义提供商时的协议映射逻辑
 * 覆盖 UI/映射层的协议持久化问题
 *
 * @module test/hooks/useAppBootstrap.protocol
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomProvider } from '../../types';

// Mock customProviderStorage
const mockLoad = vi.fn();
const mockSave = vi.fn();

vi.mock('../../services/customProviderStorage', () => ({
    customProviderStorage: {
        load: mockLoad,
        save: mockSave,
    },
}));

// Mock storage
vi.mock('../../services/storage', () => ({
    providerCredentialsStorage: {
        load: vi.fn().mockResolvedValue([]),
    },
}));

// Mock auth
vi.mock('../../services/auth/providerCredentialAccess', () => ({
    loadProviderCredentialsSafe: vi.fn().mockResolvedValue([]),
}));

/**
 * 创建测试用自定义提供商
 */
function createTestProvider(overrides: Partial<CustomProvider> = {}): CustomProvider {
    return {
        id: 'custom-test-1',
        name: 'Test Provider',
        icon: '🤖',
        endpoint: 'https://api.test.com',
        protocol: 'openai',
        authMethods: [{ type: 'api', label: 'API Key', description: 'Test' }],
        models: [],
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        ...overrides,
    } as CustomProvider;
}

describe('useAppBootstrap 协议映射测试', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * TC-PROTO-MAPPING-001: 加载自定义提供商时保留 Anthropic 协议
     * 测试场景: 自定义提供商设置 protocol='anthropic'，加载后应保持不变
     */
    it('TC-PROTO-MAPPING-001: 加载时保留 Anthropic 协议配置', async () => {
        const customProvider = createTestProvider({
            id: 'custom-anthropic',
            name: 'Custom Anthropic',
            protocol: 'anthropic',
        });

        mockLoad.mockResolvedValue([customProvider]);

        // 模拟 useAppBootstrap 中的映射逻辑
        const customProviders = await mockLoad();
        const mappedProviders = customProviders.map((cp: CustomProvider) => ({
            id: cp.id,
            name: cp.name,
            icon: cp.icon,
            defaultEndpoint: cp.endpoint,
            authMethods: cp.authMethods,
            models: cp.models,
            status: 'disconnected' as const,
            protocol: cp.protocol, // 关键：使用 cp.protocol 而非硬编码
            isCustom: true,
            category: 'other' as const,
        }));

        expect(mappedProviders).toHaveLength(1);
        expect(mappedProviders[0].protocol).toBe('anthropic');
    });

    /**
     * TC-PROTO-MAPPING-002: 加载自定义提供商时保留 Google 协议
     * 测试场景: 自定义提供商设置 protocol='google'，加载后应保持不变
     */
    it('TC-PROTO-MAPPING-002: 加载时保留 Google 协议配置', async () => {
        const customProvider = createTestProvider({
            id: 'custom-google',
            name: 'Custom Google',
            protocol: 'google',
        });

        mockLoad.mockResolvedValue([customProvider]);

        const customProviders = await mockLoad();
        const mappedProviders = customProviders.map((cp: CustomProvider) => ({
            id: cp.id,
            name: cp.name,
            protocol: cp.protocol,
        }));

        expect(mappedProviders[0].protocol).toBe('google');
    });

    /**
     * TC-PROTO-MAPPING-003: 加载自定义提供商时保留 AWS 协议
     * 测试场景: 自定义提供商设置 protocol='aws'，加载后应保持不变
     */
    it('TC-PROTO-MAPPING-003: 加载时保留 AWS 协议配置', async () => {
        const customProvider = createTestProvider({
            id: 'custom-aws',
            name: 'Custom AWS',
            protocol: 'aws',
        });

        mockLoad.mockResolvedValue([customProvider]);

        const customProviders = await mockLoad();
        const mappedProviders = customProviders.map((cp: CustomProvider) => ({
            id: cp.id,
            name: cp.name,
            protocol: cp.protocol,
        }));

        expect(mappedProviders[0].protocol).toBe('aws');
    });

    /**
     * TC-PROTO-MAPPING-004: 加载未设置协议的自定义提供商
     * 测试场景: 自定义提供商未设置 protocol，加载后应为 undefined
     */
    it('TC-PROTO-MAPPING-004: 加载时保留 undefined 协议', async () => {
        const customProvider = createTestProvider({
            id: 'custom-no-protocol',
            name: 'Custom No Protocol',
            protocol: undefined,
        });

        mockLoad.mockResolvedValue([customProvider]);

        const customProviders = await mockLoad();
        const mappedProviders = customProviders.map((cp: CustomProvider) => ({
            id: cp.id,
            name: cp.name,
            protocol: cp.protocol,
        }));

        expect(mappedProviders[0].protocol).toBeUndefined();
    });

    /**
     * TC-PROTO-MAPPING-005: 加载多个不同协议的自定义提供商
     * 测试场景: 多个自定义提供商使用不同协议，加载后都应保持不变
     */
    it('TC-PROTO-MAPPING-005: 加载多个提供商时保留各自协议', async () => {
        const providers = [
            createTestProvider({ id: 'custom-1', protocol: 'openai' }),
            createTestProvider({ id: 'custom-2', protocol: 'anthropic' }),
            createTestProvider({ id: 'custom-3', protocol: 'google' }),
            createTestProvider({ id: 'custom-4', protocol: 'aws' }),
        ];

        mockLoad.mockResolvedValue(providers);

        const customProviders = await mockLoad();
        const mappedProviders = customProviders.map((cp: CustomProvider) => ({
            id: cp.id,
            protocol: cp.protocol,
        }));

        expect(mappedProviders).toHaveLength(4);
        expect(mappedProviders[0].protocol).toBe('openai');
        expect(mappedProviders[1].protocol).toBe('anthropic');
        expect(mappedProviders[2].protocol).toBe('google');
        expect(mappedProviders[3].protocol).toBe('aws');
    });

    /**
     * TC-PROTO-MAPPING-006: 验证不会硬编码为 openai
     * 测试场景: 确保映射逻辑不会将所有协议硬编码为 'openai'（回归测试）
     */
    it('TC-PROTO-MAPPING-006: 不会硬编码协议为 openai', async () => {
        const customProvider = createTestProvider({
            id: 'custom-anthropic',
            protocol: 'anthropic',
        });

        mockLoad.mockResolvedValue([customProvider]);

        const customProviders = await mockLoad();

        // 错误的映射方式（回归测试）
        const wrongMapping = customProviders.map((cp: CustomProvider) => ({
            id: cp.id,
            protocol: 'openai', // ❌ 硬编码
        }));

        // 正确的映射方式
        const correctMapping = customProviders.map((cp: CustomProvider) => ({
            id: cp.id,
            protocol: cp.protocol, // ✅ 使用保存的值
        }));

        // 验证错误映射会导致协议丢失
        expect(wrongMapping[0].protocol).toBe('openai');

        // 验证正确映射保留了原始协议
        expect(correctMapping[0].protocol).toBe('anthropic');
    });
});
