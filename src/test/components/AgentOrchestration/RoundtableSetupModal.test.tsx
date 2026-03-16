/**
 * 圆桌会议配置弹窗组件单元测试
 *
 * 测试用例与文档 docs/modules/agent-orchestration.md 中的测试用例对应
 *
 * @module test/components/AgentOrchestration/RoundtableSetupModal.test
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoundtableSetupModal } from '../../../components/features/AgentOrchestration/RoundtableSetupModal';
import type { Agent, RoundtableCreateInput } from '../../../types';
import { renderWithI18n } from '../../testUtils';
import { I18nProvider } from '../../../i18n';

// ==================== 测试数据 ====================

/**
 * 模拟 Agent 数据
 */
const mockAgents: Agent[] = [
    {
        id: 'agent-1',
        name: 'Claude',
        description: '架构专家',
        model: 'claude-3',
        systemPrompt: '',
        temperature: 0.7,
        maxTokens: 4096,
        status: 'active',
        skills: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: 0,
    },
    {
        id: 'agent-2',
        name: 'GPT-4',
        description: '后端专家',
        model: 'gpt-4',
        systemPrompt: '',
        temperature: 0.7,
        maxTokens: 4096,
        status: 'active',
        skills: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: 0,
    },
    {
        id: 'agent-3',
        name: 'Gemini',
        description: 'DBA',
        model: 'gemini-pro',
        systemPrompt: '',
        temperature: 0.7,
        maxTokens: 4096,
        status: 'active',
        skills: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: 0,
    },
];

// ==================== 测试用例 ====================

describe('RoundtableSetupModal', () => {
    const mockOnClose = vi.fn();
    const mockOnCreate = vi.fn();

    beforeAll(() => {
        // Mock navigator.language 为中文，确保测试使用中文界面
        Object.defineProperty(navigator, 'language', {
            value: 'zh-CN',
            configurable: true,
        });
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ==================== TC-RSM-001: 打开弹窗 ====================
    describe('TC-RSM-001: 打开弹窗', () => {
        it('isOpen=true 时应该显示弹窗', () => {
            renderWithI18n(
                <RoundtableSetupModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onCreate={mockOnCreate}
                    agents={mockAgents}
                />
            );

            expect(screen.getByText('创建圆桌会议')).toBeDefined();
            expect(screen.getByText('多个 Agent 围绕主题展开讨论')).toBeDefined();
        });

        it('isOpen=false 时不应该显示弹窗', () => {
            renderWithI18n(
                <RoundtableSetupModal
                    isOpen={false}
                    onClose={mockOnClose}
                    onCreate={mockOnCreate}
                    agents={mockAgents}
                />
            );

            expect(screen.queryByText('创建圆桌会议')).toBeNull();
        });

        it('应该显示讨论主题输入框', () => {
            renderWithI18n(
                <RoundtableSetupModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onCreate={mockOnCreate}
                    agents={mockAgents}
                />
            );

            expect(screen.getByPlaceholderText(/如何设计一个高并发系统/)).toBeDefined();
        });
    });

    // ==================== TC-RSM-002: 添加参与者 ====================
    describe('TC-RSM-002: 添加参与者', () => {
        it('点击添加按钮应该增加参与者', async () => {
            const user = userEvent.setup();

            renderWithI18n(
                <RoundtableSetupModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onCreate={mockOnCreate}
                    agents={mockAgents}
                />
            );

            // 初始状态应该显示"至少添加 2 个参与者"
            expect(screen.getByText('至少添加 2 个参与者')).toBeDefined();

            // 点击添加按钮（初始状态是"点击添加第一个参与者"）
            const addButton = screen.getByText('点击添加第一个参与者');
            await user.click(addButton);

            // 应该显示第一个参与者
            expect(screen.getByText('参与者 (1/6)')).toBeDefined();
        });

        it('添加多个参与者后应该正确显示数量', async () => {
            const user = userEvent.setup();

            renderWithI18n(
                <RoundtableSetupModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onCreate={mockOnCreate}
                    agents={mockAgents}
                />
            );

            // 点击添加第一个参与者
            const firstAddButton = screen.getByText('点击添加第一个参与者');
            await user.click(firstAddButton);

            // 继续添加更多参与者
            const addButton = screen.getByText('添加参与者');
            await user.click(addButton);
            await user.click(addButton);

            expect(screen.getByText('参与者 (3/6)')).toBeDefined();
        });
    });

    // ==================== TC-RSM-003: 移除参与者 ====================
    describe('TC-RSM-003: 移除参与者', () => {
        it('点击删除按钮应该移除参与者', async () => {
            const user = userEvent.setup();

            renderWithI18n(
                <RoundtableSetupModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onCreate={mockOnCreate}
                    agents={mockAgents}
                />
            );

            // 先添加 2 个参与者
            const firstAddButton = screen.getByText('点击添加第一个参与者');
            await user.click(firstAddButton);
            const addButton = screen.getByText('添加参与者');
            await user.click(addButton);

            expect(screen.getByText('参与者 (2/6)')).toBeDefined();

            // 点击第一个删除按钮（通过 aria-label 或其他方式定位）
            const deleteButtons = document.querySelectorAll('button');
            const trashButton = Array.from(deleteButtons).find(btn =>
                btn.querySelector('.lucide-trash-2')
            );
            if (trashButton) {
                await user.click(trashButton);
            }

            expect(screen.getByText('参与者 (1/6)')).toBeDefined();
        });
    });

    // ==================== TC-RSM-005: 选择发言模式 ====================
    describe('TC-RSM-005: 选择发言模式', () => {
        it('应该显示发言模式选项', () => {
            renderWithI18n(
                <RoundtableSetupModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onCreate={mockOnCreate}
                    agents={mockAgents}
                />
            );

            expect(screen.getByText('顺序发言')).toBeDefined();
            expect(screen.getByText('自由发言')).toBeDefined();
        });

        it('点击发言模式应该切换选中状态', async () => {
            const user = userEvent.setup();

            renderWithI18n(
                <RoundtableSetupModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onCreate={mockOnCreate}
                    agents={mockAgents}
                />
            );

            const freeMode = screen.getByText('自由发言').closest('button');
            await user.click(freeMode!);

            // 自由发言按钮应该有选中样式
            expect(freeMode?.className).toContain('border-purple-500');
        });
    });

    // ==================== TC-RSM-006/TC-RSM-007: 轮数设置 ====================
    describe('TC-RSM-006/TC-RSM-007: 轮数设置', () => {
        it('默认应该是不限制轮数模式', () => {
            renderWithI18n(
                <RoundtableSetupModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onCreate={mockOnCreate}
                    agents={mockAgents}
                />
            );

            // 查找包含"不限制"文本的 radio（使用更精确的匹配）
            const unlimitedLabel = screen.getByText(/不限制（手动控制）/);
            const radioInput = unlimitedLabel.closest('label')?.querySelector('input[type="radio"]') as HTMLInputElement;
            expect(radioInput?.checked).toBe(true);
        });

        it('选择固定轮数后应该显示滑块', async () => {
            const user = userEvent.setup();

            renderWithI18n(
                <RoundtableSetupModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onCreate={mockOnCreate}
                    agents={mockAgents}
                />
            );

            const fixedLabel = screen.getByText(/固定轮数/);
            const fixedRadio = fixedLabel.closest('label')?.querySelector('input[type="radio"]');
            await user.click(fixedRadio!);

            // 应该显示轮数滑块
            expect(screen.getByRole('slider')).toBeDefined();
            expect(screen.getByText(/轮数:/)).toBeDefined();
        });
    });

    // ==================== TC-RSM-009: 创建验证失败 ====================
    describe('TC-RSM-009: 创建验证失败', () => {
        it('没有主题时点击创建应该显示错误', async () => {
            const user = userEvent.setup();

            renderWithI18n(
                <RoundtableSetupModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onCreate={mockOnCreate}
                    agents={mockAgents}
                />
            );

            // 添加 2 个参与者但不设置主题
            const firstAddButton = screen.getByText('点击添加第一个参与者');
            await user.click(firstAddButton);
            const addButton = screen.getByText('添加参与者');
            await user.click(addButton);

            // 设置角色
            const roleInputs = screen.getAllByPlaceholderText(/角色/);
            await user.type(roleInputs[0], '架构师');
            await user.type(roleInputs[1], '后端专家');

            // 点击创建
            const createButton = screen.getByText('创建讨论');
            await user.click(createButton);

            // 应该显示错误提示（包含错误码前缀）
            await waitFor(() => {
                expect(screen.getByText(/讨论主题/)).toBeDefined();
            });

            // onCreate 不应该被调用
            expect(mockOnCreate).not.toHaveBeenCalled();
        });

        it('参与者不足时应该禁用创建按钮', async () => {
            const user = userEvent.setup();

            renderWithI18n(
                <RoundtableSetupModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onCreate={mockOnCreate}
                    agents={mockAgents}
                />
            );

            // 设置主题
            const topicInput = screen.getByPlaceholderText(/如何设计一个高并发系统/);
            await user.type(topicInput, '测试主题');

            // 只添加 1 个参与者
            const addButton = screen.getByText('点击添加第一个参与者');
            await user.click(addButton);

            // 创建按钮应该被禁用（因为参与者不足 2 个）
            const createButton = screen.getByText('创建讨论');
            expect(createButton).toHaveProperty('disabled', true);
        });
    });

    // ==================== TC-RSM-010: 创建成功 ====================
    describe('TC-RSM-010: 创建成功', () => {
        it('填写完整信息后应该成功创建', async () => {
            const user = userEvent.setup();

            renderWithI18n(
                <RoundtableSetupModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onCreate={mockOnCreate}
                    agents={mockAgents}
                />
            );

            // 设置主题
            const topicInput = screen.getByPlaceholderText(/如何设计一个高并发系统/);
            await user.type(topicInput, '如何设计高并发系统？');

            // 添加 2 个参与者
            const firstAddButton = screen.getByText('点击添加第一个参与者');
            await user.click(firstAddButton);
            const addButton = screen.getByText('添加参与者');
            await user.click(addButton);

            // 设置角色
            const roleInputs = screen.getAllByPlaceholderText(/角色/);
            await user.type(roleInputs[0], '架构师');
            await user.type(roleInputs[1], '后端专家');

            // 点击创建
            const createButton = screen.getByText('创建讨论');
            await user.click(createButton);

            // onCreate 应该被调用
            await waitFor(() => {
                expect(mockOnCreate).toHaveBeenCalledTimes(1);
            });

            // 验证传入的参数
            const createInput: RoundtableCreateInput = mockOnCreate.mock.calls[0][0];
            expect(createInput.topic).toBe('如何设计高并发系统？');
            expect(createInput.participants).toHaveLength(2);
            expect(createInput.participants[0].role).toBe('架构师');
            expect(createInput.participants[1].role).toBe('后端专家');
        });

        it('创建成功后应该重置表单', async () => {
            const user = userEvent.setup();

            const { rerender } = render(
                <I18nProvider>
                    <RoundtableSetupModal
                        isOpen={true}
                        onClose={mockOnClose}
                        onCreate={mockOnCreate}
                        agents={mockAgents}
                    />
                </I18nProvider>
            );

            // 设置主题
            const topicInput = screen.getByPlaceholderText(/如何设计一个高并发系统/);
            await user.type(topicInput, '测试主题');

            // 添加参与者
            const firstAddButton = screen.getByText('点击添加第一个参与者');
            await user.click(firstAddButton);
            const addButton = screen.getByText('添加参与者');
            await user.click(addButton);

            // 设置角色
            const roleInputs = screen.getAllByPlaceholderText(/角色/);
            await user.type(roleInputs[0], '角色1');
            await user.type(roleInputs[1], '角色2');

            // 点击创建
            const createButton = screen.getByText('创建讨论');
            await user.click(createButton);

            // 重新打开弹窗
            rerender(
                <I18nProvider>
                    <RoundtableSetupModal
                        isOpen={true}
                        onClose={mockOnClose}
                        onCreate={mockOnCreate}
                        agents={mockAgents}
                    />
                </I18nProvider>
            );

            // 表单应该被重置
            const newTopicInput = screen.getByPlaceholderText(/如何设计一个高并发系统/) as HTMLInputElement;
            expect(newTopicInput.value).toBe('');
            expect(screen.getByText('至少添加 2 个参与者')).toBeDefined();
        });
    });

    // ==================== 关闭弹窗 ====================
    describe('关闭弹窗', () => {
        it('点击取消按钮应该调用 onClose', async () => {
            const user = userEvent.setup();

            renderWithI18n(
                <RoundtableSetupModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onCreate={mockOnCreate}
                    agents={mockAgents}
                />
            );

            const cancelButton = screen.getByText('取消');
            await user.click(cancelButton);

            expect(mockOnClose).toHaveBeenCalledTimes(1);
        });

        it('点击遮罩层应该调用 onClose', async () => {
            const user = userEvent.setup();

            renderWithI18n(
                <RoundtableSetupModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onCreate={mockOnCreate}
                    agents={mockAgents}
                />
            );

            // 点击遮罩层
            const overlay = document.querySelector('.bg-black\\/50');
            if (overlay) {
                await user.click(overlay);
            }

            expect(mockOnClose).toHaveBeenCalledTimes(1);
        });
    });

    // ==================== 高级选项 ====================
    describe('高级选项', () => {
        it('点击高级选项应该展开/收起', async () => {
            const user = userEvent.setup();

            renderWithI18n(
                <RoundtableSetupModal
                    isOpen={true}
                    onClose={mockOnClose}
                    onCreate={mockOnCreate}
                    agents={mockAgents}
                />
            );

            // 初始状态不显示高级选项内容
            expect(screen.queryByText('讨论结束后自动生成总结')).toBeNull();

            // 点击高级选项
            const advancedButton = screen.getByText('高级选项');
            await user.click(advancedButton);

            // 应该显示高级选项内容
            expect(screen.getByText('讨论结束后自动生成总结')).toBeDefined();
            expect(screen.getByText('允许 Agent 互相引用观点')).toBeDefined();
        });
    });
});
