/**
 * @file ModelPage.test.tsx
 * @description ModelPage 组件的集成测试。
 * 严格对应 docs/modules/models.md 中的测试场景。
 * 包含中文注释和详细的步骤日志。
 */

import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ModelPage from '../../../components/features/Models';
import { renderWithI18n } from '../../testUtils';
import type { AIModelConfig, ModelProvider } from '../../../types';

// 模拟数据
const mockModels: AIModelConfig[] = [
    {
        id: '1',
        name: 'GPT-4',
        provider: 'OpenAI',
        status: 'online',
        apiKeySet: true,
        endpoint: 'https://api.openai.com',
        maxTokens: 8192,
        pricing: { input: 0.03, output: 0.06 },
        createdAt: new Date(),
        updatedAt: new Date(),
    },
];

const mockProviders: ModelProvider[] = [
    {
        id: 'OpenAI',
        name: 'OpenAI',
        icon: '🤖',
        defaultEndpoint: 'https://api.openai.com',
        models: [{ id: 'gpt-4', name: 'GPT-4', maxTokens: 8192 }],
    },
];

describe('ModelPage 集成测试', () => {

    // 模拟函数
    const onAddModel = vi.fn();
    const onUpdateModel = vi.fn();
    const onDeleteModel = vi.fn();
    const onTestModel = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        console.log('\n[测试] 开始执行 ModelPage 测试套件中的新用例...');
    });

    /**
     * 测试场景: 渲染模型列表
     * 输入: 模拟数据
     * 期望输出: 正确显示模型卡片
     */
    it('渲染模型列表: 应正确显示模型卡片', () => {
        console.log('[步骤 1] 使用模拟数据渲染 ModelPage');
        renderWithI18n(
            <ModelPage
                models={mockModels}
                providers={mockProviders}
                onAddModel={onAddModel}
                onUpdateModel={onUpdateModel}
                onDeleteModel={onDeleteModel}
                onTestModel={onTestModel}
            />
        );

        console.log('[步骤 2] 验证页面标题');
        expect(screen.getByText('模型配置')).toBeInTheDocument();

        console.log('[步骤 3] 验证模型卡片是否存在');
        expect(screen.getByText('GPT-4')).toBeInTheDocument();
        expect(screen.getAllByText('在线').length).toBeGreaterThan(0);
    });

    /**
     * 测试场景: 过滤模型
     * 输入: 输入搜索关键词
     * 期望输出: 列表仅显示匹配项
     * v3.5.0: 更新测试以适配 ExpandableSearch 组件（需先点击展开）
     * v3.6.0: 移除空状态判断，搜索无结果时只显示添加卡片
     */
    it('过滤模型: 输入搜索关键词后列表仅显示匹配项', () => {
        console.log('[步骤 1] 渲染 ModelPage');
        renderWithI18n(
            <ModelPage
                models={mockModels}
                providers={mockProviders}
                onAddModel={onAddModel}
                onUpdateModel={onUpdateModel}
                onDeleteModel={onDeleteModel}
                onTestModel={onTestModel}
            />
        );

        console.log('[步骤 2] 点击搜索图标展开搜索框');
        // v3.5.0: ExpandableSearch 默认折叠，需先点击展开
        const searchButton = screen.getByTitle('搜索模型...');
        fireEvent.click(searchButton);

        console.log('[步骤 3] 输入不存在的模型名称 "NonExistent"');
        const searchInput = screen.getByPlaceholderText('搜索模型...');
        fireEvent.change(searchInput, { target: { value: 'NonExistent' } });

        console.log('[步骤 4] 验证原模型已被过滤，只剩添加卡片');
        expect(screen.queryByText('GPT-4')).not.toBeInTheDocument();
        // v3.6.0: 现在始终显示添加卡片，"添加模型"会出现多次（头部按钮+卡片）
        expect(screen.getAllByText('添加模型').length).toBeGreaterThanOrEqual(1);
    });

    /**
     * 测试场景: 添加模型
     * 输入: 点击添加按钮，填写表单
     * 期望输出: 触发添加回调
     */
    it('添加模型: 点击添加按钮并提交应当调用 onAddModel', () => {
        console.log('[步骤 1] 渲染 ModelPage');
        renderWithI18n(
            <ModelPage
                models={mockModels}
                providers={mockProviders}
                onAddModel={onAddModel}
                onUpdateModel={onUpdateModel}
                onDeleteModel={onDeleteModel}
                onTestModel={onTestModel}
            />
        );

        console.log('[步骤 2] 点击"添加模型"按钮（页面头部）');
        // 查找所有按钮，找到包含特定文本的那个
        const addButtons = screen.getAllByRole('button');
        const addButton = addButtons.find(btn => btn.textContent?.includes('添加模型'));
        if (!addButton) throw new Error('未找到添加模型按钮');
        fireEvent.click(addButton);

        console.log('[步骤 3] 验证模态框已打开');
        const headings = screen.getAllByRole('heading', { name: '添加模型' });
        expect(headings.length).toBeGreaterThan(0);

        console.log('[步骤 4] 填写表单（选择提供商）');
        const selects = screen.getAllByRole('combobox');
        fireEvent.change(selects[0], { target: { value: 'OpenAI' } });

        console.log('[步骤 5] 点击模态框中的提交按钮');
        const allButtons = screen.getAllByRole('button', { name: '添加模型' });
        const modalSubmitBtn = allButtons[allButtons.length - 1]; // 最后一个通常是模态框内的按钮
        fireEvent.click(modalSubmitBtn);

        console.log('[步骤 6] 验证 onAddModel 被调用');
        expect(onAddModel).toHaveBeenCalled();
    });

    /**
     * TC-MODEL-004: 删除模型 - 弹出确认对话框
     * 输入: 点击删除按钮
     * 期望输出: 弹出确认对话框
     * v3.5.0: 删除确认文本格式变化
     */
    it('TC-MODEL-004 删除模型: 点击删除按钮应弹出确认对话框', () => {
        console.log('[步骤 1] 渲染 ModelPage');
        renderWithI18n(
            <ModelPage
                models={mockModels}
                providers={mockProviders}
                onAddModel={onAddModel}
                onUpdateModel={onUpdateModel}
                onDeleteModel={onDeleteModel}
                onTestModel={onTestModel}
            />
        );

        console.log('[步骤 2] 在模型卡片中找到删除按钮');
        const cardHeader = screen.getByText('GPT-4').closest('.bg-white');
        if (!cardHeader) throw new Error('未找到模型卡片');

        const cardButtons = cardHeader.querySelectorAll('button');
        const deleteBtn = cardButtons[cardButtons.length - 1];
        if (!deleteBtn) throw new Error('未找到删除按钮');

        console.log('[步骤 3] 点击删除按钮');
        fireEvent.click(deleteBtn);

        console.log('[步骤 4] 验证确认对话框出现');
        expect(screen.getByText('删除模型')).toBeInTheDocument();
        // v3.5.0: 文本格式变化，使用 {name} 占位符替换为实际名称
        expect(screen.getByText(/确定要删除模型 "GPT-4" 吗/)).toBeInTheDocument();

        console.log('[步骤 5] 验证 onDeleteModel 尚未被调用');
        expect(onDeleteModel).not.toHaveBeenCalled();
    });

    /**
     * TC-MODEL-005: 确认删除 - 执行删除
     * 输入: 确认对话框点击删除
     * 期望输出: 模型从列表中移除
     */
    it('TC-MODEL-005 确认删除: 点击确认后应调用 onDeleteModel', () => {
        console.log('[步骤 1] 渲染 ModelPage');
        renderWithI18n(
            <ModelPage
                models={mockModels}
                providers={mockProviders}
                onAddModel={onAddModel}
                onUpdateModel={onUpdateModel}
                onDeleteModel={onDeleteModel}
                onTestModel={onTestModel}
            />
        );

        console.log('[步骤 2] 点击删除按钮打开确认对话框');
        const cardHeader = screen.getByText('GPT-4').closest('.bg-white');
        if (!cardHeader) throw new Error('未找到模型卡片');
        const cardButtons = cardHeader.querySelectorAll('button');
        const deleteBtn = cardButtons[cardButtons.length - 1];
        fireEvent.click(deleteBtn);

        console.log('[步骤 3] 点击对话框中的"删除"按钮');
        const confirmDeleteBtn = screen.getByRole('button', { name: '删除' });
        fireEvent.click(confirmDeleteBtn);

        console.log('[步骤 4] 验证 onDeleteModel 被调用');
        expect(onDeleteModel).toHaveBeenCalledWith('1');
    });

    /**
     * TC-MODEL-006: 取消删除 - 关闭对话框
     * 输入: 确认对话框点击取消
     * 期望输出: 对话框关闭，模型保留
     */
    it('TC-MODEL-006 取消删除: 点击取消后对话框关闭且不删除', () => {
        console.log('[步骤 1] 渲染 ModelPage');
        renderWithI18n(
            <ModelPage
                models={mockModels}
                providers={mockProviders}
                onAddModel={onAddModel}
                onUpdateModel={onUpdateModel}
                onDeleteModel={onDeleteModel}
                onTestModel={onTestModel}
            />
        );

        console.log('[步骤 2] 点击删除按钮打开确认对话框');
        const cardHeader = screen.getByText('GPT-4').closest('.bg-white');
        if (!cardHeader) throw new Error('未找到模型卡片');
        const cardButtons = cardHeader.querySelectorAll('button');
        const deleteBtn = cardButtons[cardButtons.length - 1];
        fireEvent.click(deleteBtn);

        console.log('[步骤 3] 验证对话框已打开');
        expect(screen.getByText('删除模型')).toBeInTheDocument();

        console.log('[步骤 4] 点击"取消"按钮');
        const cancelBtn = screen.getByRole('button', { name: '取消' });
        fireEvent.click(cancelBtn);

        console.log('[步骤 5] 验证对话框关闭（删除模型标题不再可见）');
        expect(screen.queryByText(/确定要删除模型/)).not.toBeInTheDocument();

        console.log('[步骤 6] 验证 onDeleteModel 未被调用');
        expect(onDeleteModel).not.toHaveBeenCalled();
    });

    /**
     * 测试场景: 测试模型
     * 输入: 点击测试按钮
     * 期望输出: 触发测试回调
     */
    it('测试模型: 点击测试按钮应当调用 onTestModel', () => {
        console.log('[步骤 1] 渲染 ModelPage');
        renderWithI18n(
            <ModelPage
                models={mockModels}
                providers={mockProviders}
                onAddModel={onAddModel}
                onUpdateModel={onUpdateModel}
                onDeleteModel={onDeleteModel}
                onTestModel={onTestModel}
            />
        );

        console.log('[步骤 2] 找到并点击测试按钮');
        const testBtn = screen.getByText('测试');
        fireEvent.click(testBtn);

        console.log('[步骤 3] 验证 onTestModel 被调用');
        expect(onTestModel).toHaveBeenCalledWith('1');
    });

    /**
     * 测试场景: 编辑模型
     * 输入: 点击编辑按钮
     * 期望输出: 弹窗回显数据，保存后触发更新回调
     */
    it('编辑模型: 点击编辑按钮并保存应当调用 onUpdateModel', async () => {
        console.log('[步骤 1] 渲染 ModelPage');
        renderWithI18n(
            <ModelPage
                models={mockModels}
                providers={mockProviders}
                onAddModel={onAddModel}
                onUpdateModel={onUpdateModel}
                onDeleteModel={onDeleteModel}
                onTestModel={onTestModel}
            />
        );

        console.log('[步骤 2] 找到并点击编辑按钮');
        const cardHeader = screen.getByText('GPT-4').closest('.bg-white');
        if (!cardHeader) throw new Error('未找到模型卡片');

        const cardButtons = cardHeader.querySelectorAll('button');
        const editBtn = cardButtons[cardButtons.length - 2]; // 倒数第二个通常是编辑按钮

        if (!editBtn) throw new Error('未找到编辑按钮');
        fireEvent.click(editBtn);

        console.log('[步骤 3] 验证模态框以编辑模式打开');
        expect(screen.getByRole('heading', { name: '编辑模型' })).toBeInTheDocument();

        console.log('[步骤 4] 修改 Max Tokens 值');
        const input = screen.getByDisplayValue('8192');
        fireEvent.change(input, { target: { value: '16384' } });

        console.log('[步骤 5] 点击保存按钮');
        const allButtons = screen.getAllByRole('button');
        const saveBtn = allButtons[allButtons.length - 1]; // 模态框内的按钮

        fireEvent.click(saveBtn);

        console.log('[步骤 6] 验证 onUpdateModel 被调用且参数正确');
        expect(onUpdateModel).toHaveBeenCalledWith('1', expect.objectContaining({
            maxTokens: 16384
        }));
    });

});
