/**
 * @file ModelCard.test.tsx
 * @description ModelCard 组件单元测试。
 * 覆盖文档中"渲染模型列表"场景的卡片展示逻辑，以及状态显隐测试。
 * 包含中文注释。
 */

import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ModelCard from '../../../components/features/Models/ModelCard';
import { renderWithI18n } from '../../testUtils';
import type { AIModelConfig } from '../../../types';

// 模拟数据模型
const mockModel: AIModelConfig = {
    id: '1',
    name: 'Test Model',
    provider: 'OpenAI',
    status: 'online',
    apiKeySet: true,
    endpoint: 'https://api.openai.com',
    maxTokens: 4096,
    pricing: { input: 0.01, output: 0.02 },
    createdAt: new Date(),
    updatedAt: new Date(),
};

describe('ModelCard 组件测试', () => {

    /**
     * 测试场景: 渲染模型信息
     * 输入: 模拟模型数据
     * 期望输出: 正确显示名称、提供商、状态等
     */
    it('应正确渲染模型基本信息', () => {
        renderWithI18n(
            <ModelCard
                model={mockModel}
                onEdit={() => { }}
                onTest={() => { }}
                onDelete={() => { }}
            />
        );

        expect(screen.getByText('Test Model')).toBeInTheDocument();
        expect(screen.getByText('OpenAI')).toBeInTheDocument();
        expect(screen.getByText('API Key 已设置')).toBeInTheDocument();
        expect(screen.getByText('在线')).toBeInTheDocument();
    });

    it('自定义提供商应显示用户配置的名称而不是内部 ID', () => {
        renderWithI18n(
            <ModelCard
                model={{ ...mockModel, provider: 'custom-test-123' }}
                providerDisplayName="My Custom Provider"
                onEdit={() => { }}
                onTest={() => { }}
                onDelete={() => { }}
            />
        );

        expect(screen.getByText('My Custom Provider')).toBeInTheDocument();
        expect(screen.queryByText('custom-test-123')).not.toBeInTheDocument();
    });

    /**
     * 测试场景: 渲染离线状态
     * 输入: 离线状态的模型数据
     * 期望输出: 显示"离线"标签
     */
    it('应正确显示离线状态', () => {
        const offlineModel = { ...mockModel, status: 'offline' as const };
        renderWithI18n(
            <ModelCard
                model={offlineModel}
                onEdit={() => { }}
                onTest={() => { }}
                onDelete={() => { }}
            />
        );

        expect(screen.getByText('离线')).toBeInTheDocument();
    });

    /**
     * 测试场景: 按钮交互
     * 输入: 点击测试/编辑/删除按钮
     * 期望输出: 触发相应的回调函数
     */
    it('点击操作按钮应触发对应的回调函数', () => {
        const onEdit = vi.fn();
        const onTest = vi.fn();
        const onDelete = vi.fn();

        renderWithI18n(
            <ModelCard
                model={mockModel}
                onEdit={onEdit}
                onTest={onTest}
                onDelete={onDelete}
            />
        );

        // 点击测试按钮
        fireEvent.click(screen.getByText('测试'));
        expect(onTest).toHaveBeenCalledTimes(1);

        // 点击编辑按钮（假设是第二个按钮）和删除按钮（第三个）
        // 更稳健的做法是根据图标或特定标识，这里沿用按钮顺序逻辑
        const buttons = screen.getAllByRole('button');

        // 编辑
        fireEvent.click(buttons[1]);
        expect(onEdit).toHaveBeenCalledTimes(1);

        // 删除
        fireEvent.click(buttons[2]);
        expect(onDelete).toHaveBeenCalledTimes(1);
    });

    /**
     * 测试场景: 禁用测试按钮
     * 输入: 未设置 API Key 的模型
     * 期望输出: 测试按钮处于禁用状态
     */
    it('未设置 API Key 时应禁用测试按钮', () => {
        const noKeyModel = { ...mockModel, apiKeySet: false };
        renderWithI18n(
            <ModelCard
                model={noKeyModel}
                onEdit={() => { }}
                onTest={() => { }}
                onDelete={() => { }}
            />
        );

        const testButton = screen.getByText('测试').closest('button');
        expect(testButton).toBeDisabled();
    });

    /**
     * 测试场景: 测试加载状态
     * 输入: isTesting=true
     * 期望输出: 显示"测试中..."文案
     */
    it('测试进行中应显示加载状态', () => {
        renderWithI18n(
            <ModelCard
                model={mockModel}
                onEdit={() => { }}
                onTest={() => { }}
                onDelete={() => { }}
                isTesting={true}
            />
        );

        expect(screen.getByText('测试中...')).toBeInTheDocument();
    });
});
