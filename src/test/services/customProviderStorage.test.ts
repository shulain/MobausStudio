/**
 * @file customProviderStorage.test.ts
 * @description 自定义提供商存储服务单元测试
 *
 * 对应文档 docs/modules/test-report-v0.9.2.md 中的测试用例
 * TC-CUSTOM-PROV-001 ~ TC-CUSTOM-PROV-007
 *
 * 测试 Web 环境（localStorage）下的 CRUD 操作
 *
 * @module test/services/customProviderStorage
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { customProviderStorage } from '../../services/customProviderStorage';
import type { CustomProvider } from '../../types';

// 模拟 Tauri API（Web 环境不使用）
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

/**
 * 创建测试用自定义提供商
 */
function createTestProvider(overrides: Partial<CustomProvider> = {}): CustomProvider {
    return {
        id: 'custom-test-1',
        name: 'Test Provider',
        endpoint: 'https://api.test.com',
        protocol: 'openai',
        models: [],
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        ...overrides,
    } as CustomProvider;
}

describe('customProviderStorage 自定义提供商存储', () => {
    beforeEach(() => {
        // 清理 localStorage
        localStorage.clear();
        vi.clearAllMocks();
    });

    /**
     * TC-CUSTOM-PROV-001: 生成 ID
     * 测试场景: generateId 应返回 custom- 前缀的字符串
     */
    it('TC-CUSTOM-PROV-001: 生成 custom- 前缀的 ID', () => {
        const id = customProviderStorage.generateId();
        expect(id).toMatch(/^custom-\d+$/);
    });

    /**
     * TC-CUSTOM-PROV-002: Web 环境保存和加载
     * 测试场景: 保存后应能正确加载
     */
    it('TC-CUSTOM-PROV-002: 保存和加载提供商列表', async () => {
        const providers = [
            createTestProvider({ id: 'custom-1', name: 'Provider A' }),
            createTestProvider({ id: 'custom-2', name: 'Provider B' }),
        ];

        await customProviderStorage.save(providers);
        const loaded = await customProviderStorage.load();

        expect(loaded).toHaveLength(2);
        expect(loaded[0].name).toBe('Provider A');
        expect(loaded[1].name).toBe('Provider B');
    });

    /**
     * TC-CUSTOM-PROV-003: 添加提供商
     * 测试场景: add 应追加到列表
     */
    it('TC-CUSTOM-PROV-003: 添加提供商到列表', async () => {
        const provider1 = createTestProvider({ id: 'custom-1', name: 'First' });
        const provider2 = createTestProvider({ id: 'custom-2', name: 'Second' });

        await customProviderStorage.save([provider1]);
        await customProviderStorage.add(provider2);

        const loaded = await customProviderStorage.load();
        expect(loaded).toHaveLength(2);
        expect(loaded[1].name).toBe('Second');
    });

    /**
     * TC-CUSTOM-PROV-004: 更新提供商
     * 测试场景: update 应正确更新字段
     */
    it('TC-CUSTOM-PROV-004: 更新提供商字段', async () => {
        const provider = createTestProvider({ id: 'custom-1', name: 'Original' });
        await customProviderStorage.save([provider]);

        await customProviderStorage.update('custom-1', { name: 'Updated' });

        const loaded = await customProviderStorage.load();
        expect(loaded[0].name).toBe('Updated');
    });

    /**
     * TC-CUSTOM-PROV-005: 删除提供商
     * 测试场景: remove 应从列表移除
     */
    it('TC-CUSTOM-PROV-005: 删除提供商', async () => {
        const providers = [
            createTestProvider({ id: 'custom-1', name: 'Keep' }),
            createTestProvider({ id: 'custom-2', name: 'Remove' }),
        ];
        await customProviderStorage.save(providers);

        await customProviderStorage.remove('custom-2');

        const loaded = await customProviderStorage.load();
        expect(loaded).toHaveLength(1);
        expect(loaded[0].name).toBe('Keep');
    });

    /**
     * TC-CUSTOM-PROV-006: 获取单个提供商
     * 测试场景: get 应返回对应 provider
     */
    it('TC-CUSTOM-PROV-006: 获取存在的提供商', async () => {
        const provider = createTestProvider({ id: 'custom-1', name: 'Target' });
        await customProviderStorage.save([provider]);

        const result = await customProviderStorage.get('custom-1');
        expect(result).not.toBeNull();
        expect(result!.name).toBe('Target');
    });

    /**
     * TC-CUSTOM-PROV-007: 获取不存在的提供商
     * 测试场景: get 不存在的 id 应返回 null
     */
    it('TC-CUSTOM-PROV-007: 获取不存在的提供商返回 null', async () => {
        await customProviderStorage.save([]);

        const result = await customProviderStorage.get('non-existent');
        expect(result).toBeNull();
    });

    /**
     * TC-PROTO-PERSIST-001: 协议持久化 - Anthropic
     * 测试场景: 创建自定义提供商并设置 protocol='anthropic'，重启后 protocol 仍为 'anthropic'
     */
    it('TC-PROTO-PERSIST-001: 保存和加载 Anthropic 协议配置', async () => {
        const provider = createTestProvider({
            id: 'custom-anthropic',
            name: 'Custom Anthropic',
            protocol: 'anthropic',
        });

        await customProviderStorage.save([provider]);
        const loaded = await customProviderStorage.load();

        expect(loaded).toHaveLength(1);
        expect(loaded[0].protocol).toBe('anthropic');
    });

    /**
     * TC-PROTO-PERSIST-002: 协议持久化 - Google
     * 测试场景: 编辑自定义提供商修改 protocol='google'，重启后 protocol 为 'google'
     */
    it('TC-PROTO-PERSIST-002: 更新提供商协议为 Google', async () => {
        const provider = createTestProvider({
            id: 'custom-1',
            name: 'Test Provider',
            protocol: 'openai',
        });
        await customProviderStorage.save([provider]);

        // 更新协议为 google
        await customProviderStorage.update('custom-1', { protocol: 'google' });

        const loaded = await customProviderStorage.load();
        expect(loaded[0].protocol).toBe('google');
    });

    /**
     * TC-PROTO-PERSIST-003: 协议持久化 - 未设置协议
     * 测试场景: 自定义提供商未设置 protocol，应正确保存和加载 undefined
     */
    it('TC-PROTO-PERSIST-003: 未设置协议时正确处理', async () => {
        const provider = createTestProvider({
            id: 'custom-1',
            name: 'Test Provider',
            protocol: undefined,
        });

        await customProviderStorage.save([provider]);
        const loaded = await customProviderStorage.load();

        expect(loaded[0].protocol).toBeUndefined();
    });

    /**
     * TC-PROTO-PERSIST-004: 协议持久化 - AWS 协议
     * 测试场景: 保存和加载 AWS 协议配置
     */
    it('TC-PROTO-PERSIST-004: 保存和加载 AWS 协议配置', async () => {
        const provider = createTestProvider({
            id: 'custom-aws',
            name: 'Custom AWS',
            protocol: 'aws',
        });

        await customProviderStorage.save([provider]);
        const loaded = await customProviderStorage.load();

        expect(loaded[0].protocol).toBe('aws');
    });

    /**
     * TC-PROTO-PERSIST-005: 协议持久化 - 多个提供商不同协议
     * 测试场景: 保存多个提供商，每个使用不同协议，验证都能正确持久化
     */
    it('TC-PROTO-PERSIST-005: 多个提供商不同协议都能正确持久化', async () => {
        const providers = [
            createTestProvider({ id: 'custom-1', name: 'OpenAI Compatible', protocol: 'openai' }),
            createTestProvider({ id: 'custom-2', name: 'Anthropic Compatible', protocol: 'anthropic' }),
            createTestProvider({ id: 'custom-3', name: 'Google Compatible', protocol: 'google' }),
            createTestProvider({ id: 'custom-4', name: 'AWS Compatible', protocol: 'aws' }),
        ];

        await customProviderStorage.save(providers);
        const loaded = await customProviderStorage.load();

        expect(loaded).toHaveLength(4);
        expect(loaded[0].protocol).toBe('openai');
        expect(loaded[1].protocol).toBe('anthropic');
        expect(loaded[2].protocol).toBe('google');
        expect(loaded[3].protocol).toBe('aws');
    });
});
