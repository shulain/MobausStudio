/**
 * @file ModelModal.test.tsx
 * @description ModelModal 组件单元测试。
 * 覆盖文档中"添加模型"和"编辑模型"场景的弹窗逻辑，以及自定义提供商的特殊处理。
 * 包含中文注释和详细步骤日志。
 */

import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ModelModal from '../../../components/features/Models/ModelModal';
import { renderWithI18n } from '../../testUtils';
import type { ModelProvider } from '../../../types';

// 模拟提供商数据
const mockProviders: ModelProvider[] = [
    {
        id: 'OpenAI',
        name: 'OpenAI',
        icon: '🤖',
        defaultEndpoint: 'https://api.openai.com',
        models: [
            { id: 'gpt-4', name: 'GPT-4', maxTokens: 8192 },
        ],
    },
];

describe('ModelModal 组件测试', () => {

    // 每个测试前重置模拟函数
    beforeEach(() => {
        vi.clearAllMocks();
        console.log('\n[测试] 开始执行 ModelModal 测试套件中的新用例...');
    });

    /**
     * 测试场景: 渲染弹窗
     * 对应功能: 添加/编辑模型的前置条件
     */
    it('渲染: 打开时应正确渲染标题和表单', () => {
        console.log('[步骤 1] 渲染打开状态的 ModelModal');
        renderWithI18n(
            <ModelModal
                isOpen={true}
                onClose={() => { }}
                model={null}
                providers={mockProviders}
                onSave={() => { }}
            />
        );

        console.log('[步骤 2] 验证模态框标题');
        expect(screen.getByRole('heading', { name: '添加模型' })).toBeInTheDocument();

        console.log('[步骤 3] 验证表单字段存在');
        expect(screen.getByText('模型提供商')).toBeInTheDocument();
    });

    /**
     * 测试场景: 回显数据 (编辑模式)
     * 对应功能: 编辑模型
     */
    it('编辑模式: 应自动填充已有模型的数据', () => {
        const mockModel: any = {
            id: '1',
            name: 'gpt-4',
            provider: 'OpenAI',
            apiKeySet: true,
            maxTokens: 8192,
            temperature: 0.7,
        };

        console.log('[步骤 1] 使用已有模型数据渲染 ModelModal (编辑模式)');
        renderWithI18n(
            <ModelModal
                isOpen={true}
                onClose={() => { }}
                model={mockModel}
                providers={mockProviders}
                onSave={() => { }}
            />
        );

        console.log('[步骤 2] 验证标题变为"编辑模型"');
        expect(screen.getByRole('heading', { name: '编辑模型' })).toBeInTheDocument();

        console.log('[步骤 3] 验证字段已填充 (例如 Max Tokens)');
        expect(screen.getByDisplayValue('8192')).toBeInTheDocument();
    });

    /**
     * 测试场景: 表单提交
     * 对应功能: 添加模型
     * v3.6.5: Select 组件改为自定义下拉，不再使用原生 combobox
     */
    it('提交: 点击添加按钮应调用 onSave 并传递表单数据', () => {
        const onSave = vi.fn();
        console.log('[步骤 1] 渲染 ModelModal 并传入 onSave 模拟函数');
        renderWithI18n(
            <ModelModal
                isOpen={true}
                onClose={() => { }}
                model={null}
                providers={mockProviders}
                onSave={onSave}
            />
        );

        console.log('[步骤 2] 默认已选择第一个提供商: OpenAI');
        // v3.6.5: Select 组件是自定义下拉，默认已选中第一个提供商

        console.log('[步骤 3] 点击提交按钮');
        fireEvent.click(screen.getByRole('button', { name: '添加模型' }));

        console.log('[步骤 4] 验证 onSave 被调用');
        expect(onSave).toHaveBeenCalled();
    });

    /**
     * 测试场景: 自定义提供商流程
     * 对应功能: 多提供商支持 (自定义提供商)
     * 说明: 这是一个高级场景，验证选择自定义提供商时是否出现相应输入框
     * v3.6.5: Select 组件改为自定义下拉，通过点击选项来切换
     * v4.1.46: 自定义提供商 ID 以 'custom-' 开头
     */
    it('自定义提供商: 选择自定义提供商应显示输入框并保存自定义名称', () => {
        const onSave = vi.fn();
        const customProviders = [
            ...mockProviders,
            {
                id: 'custom-test-123',
                name: 'My Custom Provider',
                icon: '⚙️',
                defaultEndpoint: 'https://api.example.com',
                models: [],
            }
        ];

        console.log('[步骤 1] 渲染包含自定义提供商的 ModelModal');
        renderWithI18n(
            <ModelModal
                isOpen={true}
                onClose={() => { }}
                model={null}
                providers={customProviders}
                onSave={onSave}
            />
        );

        console.log('[步骤 2] 点击提供商选择器打开下拉菜单');
        // v3.6.5: 自定义 Select 组件，需要先点击打开下拉菜单
        const providerButton = screen.getByText('OpenAI').closest('button');
        if (providerButton) {
            fireEvent.click(providerButton);
        }

        console.log('[步骤 3] 选择自定义提供商');
        fireEvent.click(screen.getByText('My Custom Provider'));

        console.log('[步骤 4] 验证自定义名称输入框出现并输入 "my-custom-model"');
        const nameInput = screen.getByPlaceholderText(/例如: gpt-4/);
        expect(nameInput).toBeInTheDocument();
        fireEvent.change(nameInput, { target: { value: 'my-custom-model' } });

        console.log('[步骤 5] 点击提交按钮');
        fireEvent.click(screen.getByRole('button', { name: '添加模型' }));

        console.log('[步骤 6] 验证 onSave 包含自定义名称');
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
            provider: 'custom-test-123',
            name: 'my-custom-model'
        }));
    });

    /**
     * 测试场景: 自动选中第一个模型（标准提供商）
     * 对应功能: 添加模型优化
     */
    it('标准提供商: 默认应选中第一个模型ID作为名称', () => {
        const onSave = vi.fn();
        console.log('[步骤 1] 渲染 ModelModal (添加模式)');
        renderWithI18n(
            <ModelModal
                isOpen={true}
                onClose={() => { }}
                model={null}
                providers={mockProviders} // 包含 OpenAI -> gpt-4
                onSave={onSave}
            />
        );

        console.log('[步骤 2] 直接点击提交按钮 (不手动选择)');
        fireEvent.click(screen.getByRole('button', { name: '添加模型' }));

        console.log('[步骤 3] 验证 onSave 自动包含了第一个模型的ID');
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
            provider: 'OpenAI',
            name: 'gpt-4' // 这里应该是 ID
        }));
    });

    /**
     * 测试场景: 切换提供商自动重置名称
     * 对应功能: 添加模型交互优化
     * v3.6.5: Select 组件改为自定义下拉，通过点击选项来切换
     */
    it('交互: 切换提供商应自动选中新提供商的第一个模型', () => {
        const onSave = vi.fn();
        const multiProviders = [
            mockProviders[0], // OpenAI
            {
                id: 'Anthropic',
                name: 'Anthropic',
                icon: '🧠',
                defaultEndpoint: '',
                models: [{ id: 'claude-3', name: 'Claude 3', maxTokens: 100000 }]
            }
        ];

        console.log('[步骤 1] 渲染多提供商的 ModelModal');
        renderWithI18n(
            <ModelModal
                isOpen={true}
                onClose={() => { }}
                model={null}
                providers={multiProviders}
                onSave={onSave}
            />
        );

        console.log('[步骤 2] 点击提供商选择器打开下拉菜单');
        // v3.6.5: 自定义 Select 组件，需要先点击打开下拉菜单
        const providerButton = screen.getByText('OpenAI').closest('button');
        if (providerButton) {
            fireEvent.click(providerButton);
        }

        console.log('[步骤 3] 切换提供商为 Anthropic');
        fireEvent.click(screen.getByText('Anthropic'));

        console.log('[步骤 4] 点击提交');
        fireEvent.click(screen.getByRole('button', { name: '添加模型' }));

        console.log('[步骤 5] 验证 onSave 包含了 Claude 的 ID');
        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
            provider: 'Anthropic',
            name: 'claude-3'
        }));
    });
});
