/**
 * SkillExportModal 组件单元测试
 *
 * 测试用例对应文档 docs/modules/skills.md 中的：
 * - SK-170 ~ SK-176: 导出功能测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkillExportModal } from '../../../components/features/Skills/SkillExportModal';
import { renderWithI18n } from '../../testUtils';
import type { Skill } from '../../../types';

// ==================== Mock 数据 ====================

/**
 * 创建测试用的技能对象
 */
function createTestSkill(overrides: Partial<Skill> = {}): Skill {
    return {
        id: 'test-skill',
        name: '测试技能',
        description: '用于测试的技能',
        category: 'custom',
        icon: 'code',
        color: 'blue',
        enabled: true,
        builtIn: false,
        version: '1.0.0',
        promptTemplate: '这是一个测试模板',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

// Mock URL.createObjectURL 和 URL.revokeObjectURL
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();

// 用于追踪下载链接
let capturedLink: HTMLAnchorElement | null = null;
const mockClick = vi.fn();

// ==================== 测试套件 ====================

describe('SkillExportModal', () => {
    // Mock handlers
    const mockOnClose = vi.fn();

    // 测试用的技能数据
    const customSkills: Skill[] = [
        createTestSkill({ id: 'skill-1', name: '自定义技能1', description: '描述1' }),
        createTestSkill({ id: 'skill-2', name: '自定义技能2', description: '描述2' }),
        createTestSkill({ id: 'skill-3', name: '自定义技能3', description: '描述3' }),
    ];

    const builtInSkills: Skill[] = [
        createTestSkill({ id: 'builtin-1', name: '内置技能1', builtIn: true }),
        createTestSkill({ id: 'builtin-2', name: '内置技能2', builtIn: true }),
    ];

    const mixedSkills = [...customSkills, ...builtInSkills];

    // 默认 props
    const defaultProps = {
        isOpen: true,
        onClose: mockOnClose,
        skills: mixedSkills,
    };

    // 保存原始方法
    const originalCreateElement = document.createElement.bind(document);
    const originalAppendChild = document.body.appendChild.bind(document.body);
    const originalRemoveChild = document.body.removeChild.bind(document.body);

    beforeEach(() => {
        vi.resetAllMocks();
        capturedLink = null;

        // Mock URL APIs
        global.URL.createObjectURL = mockCreateObjectURL;
        global.URL.revokeObjectURL = mockRevokeObjectURL;

        // 拦截 createElement 来捕获 anchor 元素
        vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
            const element = originalCreateElement(tagName);
            if (tagName === 'a') {
                capturedLink = element as HTMLAnchorElement;
                // Mock click 方法以避免实际的导航
                vi.spyOn(element, 'click').mockImplementation(mockClick);
            }
            return element;
        });
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        capturedLink = null;
        // 恢复原始方法
        document.body.appendChild = originalAppendChild;
        document.body.removeChild = originalRemoveChild;
    });

    // ==================== 基础 UI 测试 ====================

    describe('基础 UI 测试', () => {
        // SK-170: 打开导出弹窗
        it('SK-170: 打开导出弹窗时显示技能列表', () => {
            renderWithI18n(<SkillExportModal {...defaultProps} />);

            // 应该显示弹窗标题
            expect(screen.getByText(/导出技能|Export Skills/i)).toBeInTheDocument();

            // 应该显示自定义技能
            expect(screen.getByText('自定义技能1')).toBeInTheDocument();
            expect(screen.getByText('自定义技能2')).toBeInTheDocument();
            expect(screen.getByText('自定义技能3')).toBeInTheDocument();
        });

        // SK-171: 仅显示自定义技能（内置技能不可导出）
        it('SK-171: 只显示自定义技能，内置技能不显示', () => {
            renderWithI18n(<SkillExportModal {...defaultProps} />);

            // 自定义技能应该显示
            expect(screen.getByText('自定义技能1')).toBeInTheDocument();

            // 内置技能不应该显示在可选列表中
            expect(screen.queryByText('内置技能1')).not.toBeInTheDocument();
            expect(screen.queryByText('内置技能2')).not.toBeInTheDocument();
        });

        it('弹窗关闭时不显示', () => {
            renderWithI18n(<SkillExportModal {...defaultProps} isOpen={false} />);

            expect(screen.queryByText(/导出技能|Export Skills/i)).not.toBeInTheDocument();
        });

        it('无自定义技能时显示提示', () => {
            renderWithI18n(
                <SkillExportModal {...defaultProps} skills={builtInSkills} />
            );

            // 应该显示没有可导出技能的提示
            expect(screen.getByText(/没有可导出的技能/i)).toBeInTheDocument();
        });
    });

    // ==================== 技能选择测试 ====================

    describe('技能选择测试', () => {
        // SK-172: 选择导出技能
        it('SK-172: 勾选技能后导出按钮显示数量', async () => {
            const user = userEvent.setup();
            renderWithI18n(<SkillExportModal {...defaultProps} />);

            // 默认应该全选，显示 3 个
            expect(screen.getByText(/导出.*3/i)).toBeInTheDocument();

            // 取消选择一个技能
            const checkboxes = screen.getAllByRole('checkbox');
            await user.click(checkboxes[0]); // 取消第一个

            // 应该显示 2 个
            expect(screen.getByText(/导出.*2/i)).toBeInTheDocument();
        });

        it('全选和取消全选功能', async () => {
            const user = userEvent.setup();
            renderWithI18n(<SkillExportModal {...defaultProps} />);

            // 默认全选
            const checkboxes = screen.getAllByRole('checkbox');
            checkboxes.forEach(checkbox => {
                expect(checkbox).toBeChecked();
            });

            // 点击取消全选
            await user.click(screen.getByText(/取消全选/i));

            // 所有复选框应该取消选中
            checkboxes.forEach(checkbox => {
                expect(checkbox).not.toBeChecked();
            });

            // 点击全选
            await user.click(screen.getByText(/全选/i));

            // 所有复选框应该选中
            checkboxes.forEach(checkbox => {
                expect(checkbox).toBeChecked();
            });
        });

        // SK-176: 空选择不可导出
        it('SK-176: 未选择任何技能时导出按钮禁用', async () => {
            const user = userEvent.setup();
            renderWithI18n(<SkillExportModal {...defaultProps} />);

            // 取消全选
            await user.click(screen.getByText(/取消全选/i));

            // 导出按钮应该禁用
            const exportButton = screen.getByRole('button', { name: /导出.*0/i });
            expect(exportButton).toBeDisabled();
        });
    });

    // ==================== 导出选项测试 ====================

    describe('导出选项测试', () => {
        it('可以输入作者信息', async () => {
            const user = userEvent.setup();
            renderWithI18n(<SkillExportModal {...defaultProps} />);

            // 找到作者输入框
            const authorInput = screen.getByPlaceholderText(/名字|团队/i);
            await user.type(authorInput, '测试作者');

            expect(authorInput).toHaveValue('测试作者');
        });

        it('可以输入来源信息', async () => {
            const user = userEvent.setup();
            renderWithI18n(<SkillExportModal {...defaultProps} />);

            // 找到来源输入框
            const sourceInput = screen.getByPlaceholderText(/仓库|URL/i);
            await user.type(sourceInput, 'https://example.com');

            expect(sourceInput).toHaveValue('https://example.com');
        });

        it('显示导出预览信息', () => {
            renderWithI18n(<SkillExportModal {...defaultProps} />);

            // 应该显示预览区域
            expect(screen.getByText(/导出预览/i)).toBeInTheDocument();
            expect(screen.getByText(/技能数量.*3/i)).toBeInTheDocument();
            expect(screen.getByText(/JSON/i)).toBeInTheDocument();
        });
    });

    // ==================== 导出执行测试 ====================

    describe('导出执行测试', () => {
        // SK-173: 执行导出
        it('SK-173: 点击导出按钮后下载 JSON 文件', async () => {
            const user = userEvent.setup();
            renderWithI18n(<SkillExportModal {...defaultProps} />);

            // 点击导出按钮
            const exportButton = screen.getByRole('button', { name: /导出.*3/i });
            await user.click(exportButton);

            // 应该创建 Blob URL
            expect(mockCreateObjectURL).toHaveBeenCalled();

            // 应该触发下载（capturedLink.click 被调用）
            expect(capturedLink).not.toBeNull();
            expect(mockClick).toHaveBeenCalled();

            // 应该清理资源
            expect(mockRevokeObjectURL).toHaveBeenCalled();
        });

        it('导出成功后显示成功信息', async () => {
            const user = userEvent.setup();
            renderWithI18n(<SkillExportModal {...defaultProps} />);

            // 点击导出按钮
            await user.click(screen.getByRole('button', { name: /导出.*3/i }));

            // 应该显示成功信息
            await waitFor(() => {
                expect(screen.getByText(/导出成功/i)).toBeInTheDocument();
            });
        });

        it('导出成功后可以继续导出或关闭', async () => {
            const user = userEvent.setup();
            renderWithI18n(<SkillExportModal {...defaultProps} />);

            // 完成导出
            await user.click(screen.getByRole('button', { name: /导出.*3/i }));

            // 等待成功状态
            await waitFor(() => {
                expect(screen.getByText(/导出成功/i)).toBeInTheDocument();
            });

            // 应该有关闭按钮和继续导出按钮
            expect(screen.getByRole('button', { name: /关闭/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /继续导出/i })).toBeInTheDocument();
        });

        it('点击继续导出后重置状态', async () => {
            const user = userEvent.setup();
            renderWithI18n(<SkillExportModal {...defaultProps} />);

            // 完成导出
            await user.click(screen.getByRole('button', { name: /导出.*3/i }));

            // 等待成功状态
            await waitFor(() => {
                expect(screen.getByText(/导出成功/i)).toBeInTheDocument();
            });

            // 点击继续导出
            await user.click(screen.getByRole('button', { name: /继续导出/i }));

            // 应该回到选择界面
            await waitFor(() => {
                expect(screen.getByText('自定义技能1')).toBeInTheDocument();
            });
        });

        it('点击关闭按钮调用 onClose', async () => {
            const user = userEvent.setup();
            renderWithI18n(<SkillExportModal {...defaultProps} />);

            // 完成导出
            await user.click(screen.getByRole('button', { name: /导出.*3/i }));

            // 等待成功状态
            await waitFor(() => {
                expect(screen.getByText(/导出成功/i)).toBeInTheDocument();
            });

            // 点击关闭
            await user.click(screen.getByRole('button', { name: /关闭/i }));

            expect(mockOnClose).toHaveBeenCalled();
        });
    });

    // ==================== 元信息测试 ====================

    describe('元信息测试', () => {
        // SK-174: 导出包含元信息
        it('SK-174: 导出的 JSON 包含元信息', async () => {
            const user = userEvent.setup();
            renderWithI18n(<SkillExportModal {...defaultProps} />);

            // 输入作者
            const authorInput = screen.getByPlaceholderText(/名字|团队/i);
            await user.type(authorInput, '测试作者');

            // 预览应该显示作者信息
            expect(screen.getByText(/作者.*测试作者/i)).toBeInTheDocument();
        });

        // SK-175: 美化输出
        it('SK-175: 导出的 JSON 格式化', async () => {
            // 这个测试主要验证 exportSkillsToJson 函数的行为
            // 在 skillUtils.test.ts 中已经测试过
            // 这里只验证调用正确
            const user = userEvent.setup();
            renderWithI18n(<SkillExportModal {...defaultProps} />);

            await user.click(screen.getByRole('button', { name: /导出.*3/i }));

            // 验证 Blob 被创建
            expect(mockCreateObjectURL).toHaveBeenCalled();
        });
    });

    // ==================== 关闭弹窗测试 ====================

    describe('关闭弹窗测试', () => {
        it('点击取消按钮调用 onClose', async () => {
            const user = userEvent.setup();
            renderWithI18n(<SkillExportModal {...defaultProps} />);

            // 点击取消按钮（使用精确匹配避免与"取消全选"冲突）
            const buttons = screen.getAllByRole('button', { name: /取消/i });
            // 找到底部操作区的取消按钮（内容只是"取消"而不是"取消全选"）
            const cancelButton = buttons.find(btn => btn.textContent === '取消');
            expect(cancelButton).toBeDefined();
            await user.click(cancelButton!);

            expect(mockOnClose).toHaveBeenCalled();
        });

        it('无可导出技能时点击关闭按钮调用 onClose', async () => {
            const user = userEvent.setup();
            renderWithI18n(
                <SkillExportModal {...defaultProps} skills={builtInSkills} />
            );

            // 点击关闭按钮
            await user.click(screen.getByRole('button', { name: /关闭/i }));

            expect(mockOnClose).toHaveBeenCalled();
        });
    });
});
