/**
 * @file ProviderCard.test.tsx
 * @description ProviderCard 组件单元测试
 *
 * 测试提供商卡片组件的渲染和交互
 * 对应文档 docs/modules/providers.md 中的 UI 组件测试用例
 *
 * v3.4.6: 初始版本
 *
 * @module test/components/Providers/ProviderCard
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { ProviderCard } from '../../../components/features/Providers/ProviderCard';
import { renderWithI18n } from '../../testUtils';
import type { AIProvider } from '../../../types';

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

describe('ProviderCard', () => {
    /**
     * TC-PROV-020: 渲染提供商基本信息
     */
    it('TC-PROV-020: 应正确渲染提供商名称和图标', () => {
        const provider = createMockProvider();
        renderWithI18n(<ProviderCard provider={provider} />);

        expect(screen.getByText('OpenAI')).toBeDefined();
        expect(screen.getByText('🤖')).toBeDefined();
    });

    /**
     * TC-PROV-021: 渲染未连接状态
     */
    it('TC-PROV-021: 未连接状态应显示连接按钮', () => {
        const provider = createMockProvider({ status: 'disconnected' });
        renderWithI18n(<ProviderCard provider={provider} />);

        // 应该显示未连接状态
        expect(screen.getByText(/未连接|Disconnected/)).toBeDefined();
        // 应该显示连接按钮（使用 getByRole 更精确）
        expect(screen.getByRole('button', { name: /连接|Connect/i })).toBeDefined();
    });

    /**
     * TC-PROV-022: 渲染已连接状态
     */
    it('TC-PROV-022: 已连接状态应显示断开按钮', () => {
        const provider = createMockProvider({
            status: 'connected',
            source: 'api',
        });
        renderWithI18n(<ProviderCard provider={provider} />);

        // 应该显示已连接状态
        expect(screen.getByText(/已连接|Connected/)).toBeDefined();
        // 应该显示断开按钮（使用 getByRole 更精确）
        expect(screen.getByRole('button', { name: /断开|Disconnect/i })).toBeDefined();
    });

    /**
     * TC-PROV-023: 渲染错误状态
     */
    it('TC-PROV-023: 错误状态应显示错误信息', () => {
        const provider = createMockProvider({
            status: 'error',
            errorMessage: 'API Key 无效',
        });
        renderWithI18n(<ProviderCard provider={provider} />);

        // v3.5.0: 错误状态显示 "错误" 而不是 "连接错误"
        expect(screen.getByText(/错误|Error/)).toBeDefined();
        // 应该显示错误信息
        expect(screen.getByText('API Key 无效')).toBeDefined();
    });

    /**
     * TC-PROV-024: 点击连接按钮
     */
    it('TC-PROV-024: 点击连接按钮应触发 onConnect 回调', () => {
        const provider = createMockProvider({ status: 'disconnected' });
        const onConnect = vi.fn();

        renderWithI18n(<ProviderCard provider={provider} onConnect={onConnect} />);

        // 使用 getByRole 获取按钮，更精确
        const connectButton = screen.getByRole('button', { name: /连接|Connect/i });
        fireEvent.click(connectButton);

        expect(onConnect).toHaveBeenCalledTimes(1);
    });

    /**
     * TC-PROV-025: 点击断开按钮
     */
    it('TC-PROV-025: 点击断开按钮应触发 onDisconnect 回调', () => {
        const provider = createMockProvider({
            status: 'connected',
            source: 'api',
        });
        const onDisconnect = vi.fn();

        renderWithI18n(<ProviderCard provider={provider} onDisconnect={onDisconnect} />);

        // 使用 getByRole 获取按钮
        const disconnectButton = screen.getByRole('button', { name: /断开|Disconnect/i });
        fireEvent.click(disconnectButton);

        expect(onDisconnect).toHaveBeenCalledTimes(1);
    });

    /**
     * TC-PROV-026: 连接中状态禁用按钮
     */
    it('TC-PROV-026: 连接中状态应禁用连接按钮', () => {
        const provider = createMockProvider({ status: 'disconnected' });
        const onConnect = vi.fn();

        renderWithI18n(
            <ProviderCard
                provider={provider}
                onConnect={onConnect}
                isConnecting={true}
            />
        );

        // 连接中时按钮文本变为"连接中..."
        const connectButton = screen.getByText(/连接中|Connecting/).closest('button');
        expect(connectButton?.disabled).toBe(true);
    });

    /**
     * TC-PROV-027: 显示模型数量
     */
    it('TC-PROV-027: 应显示可用模型数量', () => {
        const provider = createMockProvider({
            models: [
                { id: 'gpt-4', name: 'GPT-4', maxTokens: 4096, contextWindow: 8192 },
                { id: 'gpt-3.5', name: 'GPT-3.5', maxTokens: 4096, contextWindow: 4096 },
                { id: 'gpt-4o', name: 'GPT-4o', maxTokens: 4096, contextWindow: 128000 },
            ],
        });
        renderWithI18n(<ProviderCard provider={provider} />);

        // 应该显示模型数量
        expect(screen.getByText(/3.*模型|3.*models/)).toBeDefined();
    });

    /**
     * TC-PROV-028: 显示连接来源标签 - API Key
     */
    it('TC-PROV-028: 已连接时应显示 API Key 来源标签', () => {
        const provider = createMockProvider({
            status: 'connected',
            source: 'api',
        });
        renderWithI18n(<ProviderCard provider={provider} />);

        // v3.5.0: 来源标签改为 "API Key 认证"
        expect(screen.getByText(/API Key/)).toBeDefined();
    });

    /**
     * TC-PROV-029: 显示连接来源标签 - OAuth
     */
    it('TC-PROV-029: 已连接时应显示 OAuth 来源标签', () => {
        const provider = createMockProvider({
            status: 'connected',
            source: 'oauth',
        });
        renderWithI18n(<ProviderCard provider={provider} />);

        // v3.5.0: 来源标签改为 "OAuth 登录"
        expect(screen.getByText(/OAuth/)).toBeDefined();
    });

    /**
     * TC-PROV-030: 环境变量连接不显示断开按钮
     */
    it('TC-PROV-030: 环境变量连接应不显示断开按钮', () => {
        const provider = createMockProvider({
            status: 'connected',
            source: 'env',
        });
        renderWithI18n(<ProviderCard provider={provider} />);

        // 不应该显示断开按钮
        expect(screen.queryByText(/断开|Disconnect/)).toBeNull();
        // 应该显示环境变量提示（使用 queryAllByText 因为可能有多个匹配）
        const envTexts = screen.queryAllByText(/环境变量|environment/i);
        expect(envTexts.length).toBeGreaterThan(0);
    });

    /**
     * TC-PROV-031: 显示提供商说明文字
     */
    it('TC-PROV-031: 应显示提供商说明文字', () => {
        const provider = createMockProvider({
            note: {
                zh: '需要 ChatGPT Plus 订阅',
                en: 'Requires ChatGPT Plus subscription',
            },
        });
        renderWithI18n(<ProviderCard provider={provider} />);

        // 应该显示说明文字（中文或英文）
        const noteText = screen.queryByText(/ChatGPT Plus/);
        expect(noteText).not.toBeNull();
    });

    /**
     * TC-PROV-032: 本地服务不显示外部链接
     */
    it('TC-PROV-032: 本地服务不应显示外部链接按钮', () => {
        const provider = createMockProvider({
            id: 'ollama',
            name: 'Ollama',
            defaultEndpoint: 'http://localhost:11434',
            status: 'connected',
            source: 'api',
        });
        const { container } = renderWithI18n(<ProviderCard provider={provider} />);

        // 不应该有外部链接按钮（查找包含 lucide-external-link 类的 svg）
        const externalLinkIcon = container.querySelector('.lucide-external-link');
        expect(externalLinkIcon).toBeNull();
    });
});
