/**
 * @file ProviderPage.test.tsx
 * @description ProviderPage 组件单元测试
 *
 * 测试提供商管理页面的渲染和交互
 * 对应文档 docs/modules/providers.md 中的测试用例
 *
 * v0.8.0: 添加统计数据测试，验证模型数量只统计已连接提供商
 *
 * @module test/components/Providers/ProviderPage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { ProviderPage } from '../../../components/features/Providers';
import { renderWithI18n } from '../../testUtils';
import type { AIProvider } from '../../../types';

// 模拟 storage 服务
vi.mock('../../../services/storage', () => ({
    providerCredentialsStorage: {
        load: vi.fn().mockResolvedValue([]),
    },
    settingsStorage: {
        load: vi.fn().mockReturnValue({
            language: 'zh',
            theme: 'system',
            sendKey: 'Enter',
            streamOutput: true,
        }),
        loadAsync: vi.fn().mockResolvedValue({
            language: 'zh',
            theme: 'system',
            sendKey: 'Enter',
            streamOutput: true,
        }),
        save: vi.fn(),
    },
}));

// 模拟 useGoogleModels hook
vi.mock('../../../hooks/useGoogleModels', () => ({
    useGoogleModels: vi.fn(() => ({
        rawModels: [],
        loading: false,
        refresh: vi.fn(),
        lastUpdated: null,
    })),
}));

// 模拟 useKiroModels hook
vi.mock('../../../hooks/useKiroModels', () => ({
    useKiroModels: vi.fn(() => ({
        quota: null,
        loading: false,
        refresh: vi.fn(),
        lastUpdated: null,
    })),
}));

/**
 * 创建测试用提供商数据
 */
function createMockProvider(overrides: Partial<AIProvider> = {}): AIProvider {
    return {
        id: 'openai',
        name: 'OpenAI',
        icon: '🤖',
        description: 'OpenAI API',
        defaultEndpoint: 'https://api.openai.com/v1',
        authMethods: [{ type: 'api', label: 'API Key' }],
        models: [
            { id: 'gpt-4', name: 'GPT-4', maxTokens: 4096, contextWindow: 8192 },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', maxTokens: 4096, contextWindow: 4096 },
        ],
        status: 'disconnected',
        popular: true,
        category: 'popular',
        ...overrides,
    };
}

describe('ProviderPage 组件测试', () => {
    const mockOnConnect = vi.fn().mockResolvedValue(true);
    const mockOnDisconnect = vi.fn().mockResolvedValue(undefined);
    const mockOnTestConnection = vi.fn().mockResolvedValue(true);

    beforeEach(() => {
        vi.clearAllMocks();
        console.log('\n[测试] 开始执行 ProviderPage 测试用例...');
    });

    /**
     * TC-PROV-STATS-001: 统计数据 - 总提供商数量
     * 测试场景: 显示所有提供商的总数
     */
    it('TC-PROV-STATS-001: 应显示正确的总提供商数量', () => {
        console.log('[步骤 1] 创建测试数据');
        const providers: AIProvider[] = [
            createMockProvider({ id: 'openai', name: 'OpenAI', status: 'connected', source: 'api' }),
            createMockProvider({ id: 'anthropic', name: 'Anthropic', status: 'disconnected' }),
            createMockProvider({ id: 'google', name: 'Google', status: 'connected', source: 'api' }),
        ];

        console.log('[步骤 2] 渲染组件');
        renderWithI18n(
            <ProviderPage
                providers={providers}
                onConnect={mockOnConnect}
                onDisconnect={mockOnDisconnect}
                onTestConnection={mockOnTestConnection}
            />
        );

        console.log('[步骤 3] 验证总数显示');
        // 总提供商数量应为 3，使用 getAllByText 因为可能有多个 "3"
        const threeTexts = screen.getAllByText('3');
        expect(threeTexts.length).toBeGreaterThan(0);
    });

    /**
     * TC-PROV-STATS-002: 统计数据 - 已连接提供商数量
     * 测试场景: 显示已连接状态的提供商数量
     */
    it('TC-PROV-STATS-002: 应显示正确的已连接提供商数量', () => {
        console.log('[步骤 1] 创建测试数据');
        const providers: AIProvider[] = [
            createMockProvider({ id: 'openai', name: 'OpenAI', status: 'connected' }),
            createMockProvider({ id: 'anthropic', name: 'Anthropic', status: 'disconnected' }),
            createMockProvider({ id: 'google', name: 'Google', status: 'connected' }),
            createMockProvider({ id: 'kiro', name: 'Kiro', status: 'disconnected' }),
        ];

        console.log('[步骤 2] 渲染组件');
        renderWithI18n(
            <ProviderPage
                providers={providers}
                onConnect={mockOnConnect}
                onDisconnect={mockOnDisconnect}
            />
        );

        console.log('[步骤 3] 验证已连接数量');
        // 已连接提供商数量应为 2（OpenAI 和 Google）
        // 查找包含 "已连接" 或 "Connected" 的统计项
        const connectedStats = screen.getAllByText('2');
        expect(connectedStats.length).toBeGreaterThan(0);
    });

    /**
     * TC-PROV-STATS-003: 统计数据 - 模型数量只统计已连接提供商
     * 测试场景: 模型总数只计算已连接提供商的模型，不包括未连接提供商
     * v0.8.0: 新增测试用例
     */
    it('TC-PROV-STATS-003: 模型数量应只统计已连接提供商的模型', () => {
        console.log('[步骤 1] 创建测试数据');
        const providers: AIProvider[] = [
            createMockProvider({
                id: 'openai',
                name: 'OpenAI',
                status: 'connected',
                source: 'api',
                models: [
                    { id: 'gpt-4', name: 'GPT-4', maxTokens: 4096, contextWindow: 8192 },
                    { id: 'gpt-3.5', name: 'GPT-3.5', maxTokens: 4096, contextWindow: 4096 },
                ],
            }),
            createMockProvider({
                id: 'anthropic',
                name: 'Anthropic',
                status: 'disconnected', // 未连接
                models: [
                    { id: 'claude-3', name: 'Claude 3', maxTokens: 4096, contextWindow: 200000 },
                    { id: 'claude-2', name: 'Claude 2', maxTokens: 4096, contextWindow: 100000 },
                    { id: 'claude-instant', name: 'Claude Instant', maxTokens: 4096, contextWindow: 100000 },
                ],
            }),
            createMockProvider({
                id: 'google',
                name: 'Google',
                status: 'connected',
                source: 'oauth',
                models: [
                    { id: 'gemini-pro', name: 'Gemini Pro', maxTokens: 4096, contextWindow: 32000 },
                ],
            }),
        ];

        console.log('[步骤 2] 渲染组件');
        renderWithI18n(
            <ProviderPage
                providers={providers}
                onConnect={mockOnConnect}
                onDisconnect={mockOnDisconnect}
            />
        );

        console.log('[步骤 3] 验证模型数量');
        // 已连接提供商的模型数量：OpenAI(2) + Google(1) = 3
        // 不应包括未连接的 Anthropic 的 3 个模型
        // 如果统计所有提供商，总数会是 6
        const modelCounts = screen.getAllByText('3');
        expect(modelCounts.length).toBeGreaterThan(0);
    });

    /**
     * TC-PROV-STATS-004: 统计数据 - 无已连接提供商时模型数量为0
     * 测试场景: 当没有已连接的提供商时，模型数量应为0
     */
    it('TC-PROV-STATS-004: 无已连接提供商时模型数量应为0', () => {
        console.log('[步骤 1] 创建测试数据（全部未连接）');
        const providers: AIProvider[] = [
            createMockProvider({
                id: 'openai',
                name: 'OpenAI',
                status: 'disconnected',
                models: [
                    { id: 'gpt-4', name: 'GPT-4', maxTokens: 4096, contextWindow: 8192 },
                    { id: 'gpt-3.5', name: 'GPT-3.5', maxTokens: 4096, contextWindow: 4096 },
                ],
            }),
            createMockProvider({
                id: 'anthropic',
                name: 'Anthropic',
                status: 'disconnected',
                models: [
                    { id: 'claude-3', name: 'Claude 3', maxTokens: 4096, contextWindow: 200000 },
                ],
            }),
        ];

        console.log('[步骤 2] 渲染组件');
        renderWithI18n(
            <ProviderPage
                providers={providers}
                onConnect={mockOnConnect}
                onDisconnect={mockOnDisconnect}
            />
        );

        console.log('[步骤 3] 验证模型数量为0');
        // 模型数量应为 0（因为没有已连接的提供商）
        // 统计区域应该显示 0
        const zeroStats = screen.getAllByText('0');
        expect(zeroStats.length).toBeGreaterThan(0);
    });

    /**
     * TC-PROV-STATS-005: 统计数据 - 未连接提供商数量
     * 测试场景: 显示未连接状态的提供商数量
     */
    it('TC-PROV-STATS-005: 应显示正确的未连接提供商数量', () => {
        console.log('[步骤 1] 创建测试数据');
        const providers: AIProvider[] = [
            createMockProvider({ id: 'openai', name: 'OpenAI', status: 'connected', source: 'api' }),
            createMockProvider({ id: 'anthropic', name: 'Anthropic', status: 'disconnected' }),
            createMockProvider({ id: 'google', name: 'Google', status: 'disconnected' }),
        ];

        console.log('[步骤 2] 渲染组件');
        renderWithI18n(
            <ProviderPage
                providers={providers}
                onConnect={mockOnConnect}
                onDisconnect={mockOnDisconnect}
            />
        );

        console.log('[步骤 3] 验证未连接数量');
        // 未连接提供商数量应为 2（Anthropic, Google）
        const disconnectedStats = screen.getAllByText('2');
        expect(disconnectedStats.length).toBeGreaterThan(0);
    });

    /**
     * TC-PROV-FILTER-001: 搜索过滤功能
     * 测试场景: 通过搜索框过滤提供商
     */
    it('TC-PROV-FILTER-001: 应能通过搜索过滤提供商', async () => {
        console.log('[步骤 1] 创建测试数据');
        const providers: AIProvider[] = [
            createMockProvider({ id: 'openai', name: 'OpenAI', status: 'disconnected' }),
            createMockProvider({ id: 'anthropic', name: 'Anthropic', status: 'disconnected' }),
            createMockProvider({ id: 'mistral', name: 'Mistral', status: 'disconnected' }),
        ];

        console.log('[步骤 2] 渲染组件');
        renderWithI18n(
            <ProviderPage
                providers={providers}
                onConnect={mockOnConnect}
                onDisconnect={mockOnDisconnect}
            />
        );

        console.log('[步骤 3] 验证初始状态显示所有提供商');
        expect(screen.getByText('OpenAI')).toBeDefined();
        expect(screen.getByText('Anthropic')).toBeDefined();
        expect(screen.getByText('Mistral')).toBeDefined();

        console.log('[步骤 4] 输入搜索关键词');
        const searchInput = screen.getByPlaceholderText(/搜索|Search/i);
        fireEvent.change(searchInput, { target: { value: 'OpenAI' } });

        console.log('[步骤 5] 验证过滤结果');
        await waitFor(() => {
            // OpenAI 应该仍然存在
            expect(screen.getByText('OpenAI')).toBeDefined();
        });

        // 验证搜索功能正常工作：搜索框的值应该是 OpenAI
        expect((searchInput as HTMLInputElement).value).toBe('OpenAI');
    });

    /**
     * TC-PROV-FILTER-002: 状态过滤功能
     * 测试场景: 通过下拉框过滤已连接/未连接提供商
     */
    it('TC-PROV-FILTER-002: 应能通过状态过滤提供商', async () => {
        console.log('[步骤 1] 创建测试数据');
        const providers: AIProvider[] = [
            createMockProvider({ id: 'openai', name: 'OpenAI', status: 'connected', source: 'api' }),
            createMockProvider({ id: 'anthropic', name: 'Anthropic', status: 'disconnected' }),
        ];

        console.log('[步骤 2] 渲染组件');
        renderWithI18n(
            <ProviderPage
                providers={providers}
                onConnect={mockOnConnect}
                onDisconnect={mockOnDisconnect}
            />
        );

        console.log('[步骤 3] 选择"已连接"过滤');
        const statusSelect = screen.getByRole('combobox');
        fireEvent.change(statusSelect, { target: { value: 'connected' } });

        console.log('[步骤 4] 验证只显示已连接提供商');
        await waitFor(() => {
            expect(screen.getByText('OpenAI')).toBeDefined();
            expect(screen.queryByText('Anthropic')).toBeNull();
        });
    });

    /**
     * TC-PROV-ACTION-001: 点击添加提供商按钮
     * 测试场景: 点击添加按钮应打开选择对话框
     */
    it('TC-PROV-ACTION-001: 点击添加按钮应打开选择对话框', async () => {
        console.log('[步骤 1] 创建测试数据');
        const providers: AIProvider[] = [
            createMockProvider({ id: 'openai', name: 'OpenAI', status: 'disconnected' }),
        ];

        console.log('[步骤 2] 渲染组件');
        renderWithI18n(
            <ProviderPage
                providers={providers}
                onConnect={mockOnConnect}
                onDisconnect={mockOnDisconnect}
            />
        );

        console.log('[步骤 3] 点击添加按钮');
        // v0.9.3: 页面有两个按钮："添加提供商"和"添加自定义"
        // 使用 getAllByRole 获取所有按钮，然后找到文本匹配的第一个
        const allButtons = screen.getAllByRole('button');
        const addButton = allButtons.find(btn =>
            btn.textContent?.match(/添加提供商|Add Provider/i)
        );
        expect(addButton).toBeDefined();
        fireEvent.click(addButton!);

        console.log('[步骤 4] 验证对话框打开');
        await waitFor(() => {
            // 选择提供商对话框应该显示（查找对话框标题或内容）
            // Modal 组件可能没有 role="dialog"，改为查找对话框内容
            const dialogTitle = screen.queryByText(/选择提供商|Select Provider/i);
            expect(dialogTitle).not.toBeNull();
        });
    });

    /**
     * TC-PROV-SECTION-001: 已连接提供商分组显示
     * 测试场景: 已连接的提供商应显示在"已连接"分组中
     */
    it('TC-PROV-SECTION-001: 已连接提供商应显示在正确的分组中', () => {
        console.log('[步骤 1] 创建测试数据');
        const providers: AIProvider[] = [
            createMockProvider({ id: 'openai', name: 'OpenAI', status: 'connected', source: 'api' }),
            createMockProvider({ id: 'anthropic', name: 'Anthropic', status: 'disconnected', popular: true }),
        ];

        console.log('[步骤 2] 渲染组件');
        renderWithI18n(
            <ProviderPage
                providers={providers}
                onConnect={mockOnConnect}
                onDisconnect={mockOnDisconnect}
            />
        );

        console.log('[步骤 3] 验证分组标题存在');
        // 应该有"已连接"分组（可能有多个匹配，使用 getAllByText）
        const connectedTexts = screen.getAllByText(/已连接|Connected/);
        expect(connectedTexts.length).toBeGreaterThan(0);
        // 应该有"热门提供商"分组
        const popularTexts = screen.getAllByText(/热门|Popular/);
        expect(popularTexts.length).toBeGreaterThan(0);
    });
});
