/**
 * Skills 模块单元测试 (v2.1.0)
 *
 * 测试技能管理相关组件
 * - SkillCard: 技能卡片组件
 * - SkillsPage: 技能列表页面
 * - SkillModal: 创建/编辑技能弹窗
 * - v2.1.0: 删除自定义技能功能测试
 *
 * 对应文档: docs/modules/skills.md
 */

import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { SkillsPage } from '../../../components/features/Skills';
import { SkillCard } from '../../../components/features/Skills/SkillCard';
import { SkillModal } from '../../../components/features/Skills/SkillModal';
import { renderWithI18n } from '../../testUtils';
import type { Skill } from '../../../types';

// v2.0.0: 更新测试数据以匹配新的 Skill 类型
const mockSkills: Skill[] = [
    {
        id: '1',
        name: 'Web搜索',
        description: '搜索互联网获取最新信息',
        category: 'productivity',  // v2.0.0: 使用 SkillCategory 类型
        enabled: true,
        icon: 'search',
        color: 'blue',
        builtIn: false,
        version: '1.0.0',
        promptTemplate: '搜索关键词: {{query}}',
        variables: [
            { name: 'query', label: '搜索关键词', type: 'string', defaultValue: '' },
            { name: 'maxResults', label: '最大结果数', type: 'number', defaultValue: 10 },
        ],
        triggers: [
            { type: 'keyword', pattern: '搜索', priority: 1 },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: '2',
        name: '代码执行',
        description: '执行Python和JavaScript代码',
        category: 'coding',  // v2.0.0: 使用 SkillCategory 类型
        enabled: false,
        icon: 'code',
        color: 'green',
        builtIn: false,
        version: '1.0.0',
        promptTemplate: '执行代码: {{code}}',
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    // v2.1.0: 添加内置技能测试数据
    {
        id: '3',
        name: '代码审查',
        description: '专业的代码审查检查清单',
        category: 'coding',
        enabled: true,
        icon: 'code',
        color: 'purple',
        builtIn: true,  // 内置技能
        version: '1.0.0',
        promptTemplate: '代码审查模板',
        createdAt: new Date(),
        updatedAt: new Date(),
    },
];

describe('SkillCard', () => {
    const mockSkill = mockSkills[0];

    it('should render skill name', () => {
        renderWithI18n(<SkillCard skill={mockSkill} onToggle={() => { }} onConfigure={() => { }} />);
        expect(screen.getByText('Web搜索')).toBeDefined();
    });

    it('should render skill description', () => {
        renderWithI18n(<SkillCard skill={mockSkill} onToggle={() => { }} onConfigure={() => { }} />);
        expect(screen.getByText('搜索互联网获取最新信息')).toBeDefined();
    });

    // v2.0.0: 分类现在使用 SkillCategory 显示名称
    it('should render skill category', () => {
        renderWithI18n(<SkillCard skill={mockSkill} onToggle={() => { }} onConfigure={() => { }} />);
        // 'productivity' 分类显示为 '效率'
        expect(screen.getByText(/效率/)).toBeDefined();
    });

    // v2.0.0: 变量配置替代旧的 config
    it('should render variables preview', () => {
        const { container } = renderWithI18n(<SkillCard skill={mockSkill} onToggle={() => { }} onConfigure={() => { }} />);
        // 检查变量标签
        expect(container.innerHTML).toContain('搜索关键词');
        expect(container.innerHTML).toContain('最大结果数');
    });

    it('should call onToggle when toggle is changed', () => {
        const handleToggle = vi.fn();
        renderWithI18n(<SkillCard skill={mockSkill} onToggle={handleToggle} onConfigure={() => { }} />);
        const toggle = screen.getByRole('checkbox');
        fireEvent.click(toggle);
        expect(handleToggle).toHaveBeenCalledWith(false);
    });

    it('should call onConfigure when configure button is clicked', () => {
        const handleConfigure = vi.fn();
        renderWithI18n(<SkillCard skill={mockSkill} onToggle={() => { }} onConfigure={handleConfigure} />);
        const buttons = screen.getAllByRole('button');
        fireEvent.click(buttons[0]);
        expect(handleConfigure).toHaveBeenCalled();
    });

    // v2.0.0: 按钮文本从 '测试' 改为 '预览技能'
    it('should render preview button', () => {
        renderWithI18n(<SkillCard skill={mockSkill} onToggle={() => { }} onConfigure={() => { }} />);
        // v3.5.0: 按钮文本改为 "预览技能"
        expect(screen.getByText('预览技能')).toBeDefined();
    });

    it('should apply correct color gradient', () => {
        const { container } = renderWithI18n(<SkillCard skill={mockSkill} onToggle={() => { }} onConfigure={() => { }} />);
        expect(container.innerHTML).toContain('from-blue-500');
    });

    /**
     * v2.1.0: 删除按钮测试
     * 对应测试用例: SK-30 ~ SK-33
     */
    describe('Delete Button (v2.1.0)', () => {
        // SK-33: 内置技能无删除按钮
        it('should not show delete button for built-in skill', () => {
            const builtInSkill = mockSkills[2]; // builtIn: true
            const handleDelete = vi.fn();
            const { container } = renderWithI18n(
                <SkillCard
                    skill={builtInSkill}
                    onToggle={() => { }}
                    onConfigure={() => { }}
                    onDelete={handleDelete}
                />
            );
            // 内置技能不应该显示删除按钮
            expect(container.innerHTML).not.toContain('lucide-trash-2');
        });

        // SK-30: 自定义技能显示删除按钮
        it('should show delete button for custom skill when onDelete is provided', () => {
            const handleDelete = vi.fn();
            const { container } = renderWithI18n(
                <SkillCard
                    skill={mockSkill}
                    onToggle={() => { }}
                    onConfigure={() => { }}
                    onDelete={handleDelete}
                />
            );
            // 自定义技能应该显示删除按钮
            expect(container.innerHTML).toContain('lucide-trash-2');
        });

        // SK-30: 点击删除按钮调用onDelete
        it('should call onDelete when delete button is clicked', () => {
            const handleDelete = vi.fn();
            renderWithI18n(
                <SkillCard
                    skill={mockSkill}
                    onToggle={() => { }}
                    onConfigure={() => { }}
                    onDelete={handleDelete}
                />
            );
            // 找到删除按钮并点击
            const deleteButton = screen.getByTitle('删除技能');
            fireEvent.click(deleteButton);
            expect(handleDelete).toHaveBeenCalled();
        });

        // 不提供onDelete时不显示删除按钮
        it('should not show delete button when onDelete is not provided', () => {
            const { container } = renderWithI18n(
                <SkillCard
                    skill={mockSkill}
                    onToggle={() => { }}
                    onConfigure={() => { }}
                />
            );
            expect(container.innerHTML).not.toContain('lucide-trash-2');
        });
    });
});

describe('SkillsPage', () => {
    const defaultProps = {
        skills: mockSkills,
        onToggleSkill: vi.fn(),
        onUpdateSkill: vi.fn(),
        onAddSkill: vi.fn(),
    };

    it('should render page title', () => {
        renderWithI18n(<SkillsPage {...defaultProps} />);
        expect(screen.getByText('技能管理')).toBeDefined();
    });

    it('should render add skill button', () => {
        renderWithI18n(<SkillsPage {...defaultProps} />);
        expect(screen.getByText('添加技能')).toBeDefined();
    });

    it('should render skill cards', () => {
        renderWithI18n(<SkillsPage {...defaultProps} />);
        expect(screen.getByText('Web搜索')).toBeDefined();
        expect(screen.getByText('代码执行')).toBeDefined();
    });

    /**
     * v3.5.0: 更新测试以适配 ExpandableSearch 组件（需先点击展开）
     */
    it('should filter skills by search query', () => {
        renderWithI18n(<SkillsPage {...defaultProps} />);
        // v3.5.0: ExpandableSearch 默认折叠，需先点击展开
        const searchButton = screen.getByTitle('搜索技能...');
        fireEvent.click(searchButton);
        const searchInput = screen.getByPlaceholderText('搜索技能...');
        fireEvent.change(searchInput, { target: { value: 'Web' } });
        expect(screen.getByText('Web搜索')).toBeDefined();
        expect(screen.queryByText('代码执行')).toBeNull();
    });

    // v2.0.0: 分类筛选使用 SkillCategory 值
    it('should filter skills by category', () => {
        renderWithI18n(<SkillsPage {...defaultProps} />);
        const categorySelect = screen.getAllByRole('combobox')[0];
        fireEvent.change(categorySelect, { target: { value: 'productivity' } });
        expect(screen.getByText('Web搜索')).toBeDefined();
        expect(screen.queryByText('代码执行')).toBeNull();
    });

    it('should filter skills by status', () => {
        renderWithI18n(<SkillsPage {...defaultProps} />);
        const statusSelect = screen.getAllByRole('combobox')[1];
        fireEvent.change(statusSelect, { target: { value: 'enabled' } });
        expect(screen.getByText('Web搜索')).toBeDefined();
        expect(screen.queryByText('代码执行')).toBeNull();
    });

    // v2.0.0: Modal 标题现在显示 "新建技能" 而非 "添加新技能"
    it('should open modal when add button is clicked', () => {
        renderWithI18n(<SkillsPage {...defaultProps} />);
        fireEvent.click(screen.getByText('添加技能'));
        // 检查 Modal 是否打开（通过检查表单元素）
        expect(screen.getByPlaceholderText('例如: 代码审查')).toBeDefined();
    });

    /**
     * v2.1.0: 删除确认功能测试
     * 对应测试用例: SK-30 ~ SK-33
     */
    describe('Delete Confirmation (v2.1.0)', () => {
        const propsWithDelete = {
            ...defaultProps,
            onDeleteSkill: vi.fn(),
        };

        // SK-31: 删除确认对话框
        it('should show delete confirmation dialog when delete button is clicked', () => {
            renderWithI18n(<SkillsPage {...propsWithDelete} />);
            // 找到删除按钮并点击
            const deleteButton = screen.getAllByTitle('删除技能')[0];
            fireEvent.click(deleteButton);
            // 检查确认对话框是否显示
            expect(screen.getByText('删除技能')).toBeDefined();
            expect(screen.getByText(/确定要删除技能/)).toBeDefined();
        });

        // SK-30: 确认删除执行删除操作
        it('should call onDeleteSkill when delete is confirmed', () => {
            const handleDelete = vi.fn();
            renderWithI18n(<SkillsPage {...defaultProps} onDeleteSkill={handleDelete} />);
            // 打开删除确认对话框
            const deleteButton = screen.getAllByTitle('删除技能')[0];
            fireEvent.click(deleteButton);
            // 点击确认删除按钮
            const confirmDeleteBtn = screen.getByRole('button', { name: '删除' });
            fireEvent.click(confirmDeleteBtn);
            // 验证onDeleteSkill被调用
            expect(handleDelete).toHaveBeenCalledWith('1');
        });

        // SK-32: 取消删除保留技能
        it('should close dialog and keep skill when cancel is clicked', () => {
            const handleDelete = vi.fn();
            renderWithI18n(<SkillsPage {...defaultProps} onDeleteSkill={handleDelete} />);
            // 打开删除确认对话框
            const deleteButton = screen.getAllByTitle('删除技能')[0];
            fireEvent.click(deleteButton);
            // 点击取消按钮
            const cancelBtn = screen.getByRole('button', { name: '取消' });
            fireEvent.click(cancelBtn);
            // 验证onDeleteSkill没有被调用
            expect(handleDelete).not.toHaveBeenCalled();
        });

        // 删除确认对话框显示正确的技能名称
        it('should display skill name in confirmation dialog', () => {
            renderWithI18n(<SkillsPage {...propsWithDelete} />);
            // 打开删除确认对话框
            const deleteButton = screen.getAllByTitle('删除技能')[0];
            fireEvent.click(deleteButton);
            // v3.5.0: 验证显示技能名称（格式改为 "确定要删除技能 "{name}" 吗？"）
            expect(screen.getByText(/确定要删除技能 "Web搜索" 吗/)).toBeDefined();
            expect(screen.getByText(/此操作无法撤销/)).toBeDefined();
        });

        // SK-33: 内置技能不显示删除按钮（卡片级别测试）
        it('should not show delete button for built-in skills', () => {
            // 只包含内置技能的列表
            const builtInOnlySkills = [mockSkills[2]]; // 内置技能
            renderWithI18n(
                <SkillsPage
                    {...defaultProps}
                    skills={builtInOnlySkills}
                    onDeleteSkill={vi.fn()}
                />
            );
            // 内置技能不应该有删除按钮
            expect(screen.queryAllByTitle('删除技能')).toHaveLength(0);
        });
    });
});

describe('SkillModal', () => {
    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
        skill: null,
        onSave: vi.fn(),
    };

    // v2.0.0: 新建技能时显示 "创建技能" 标题
    it('should render add modal title when skill is null', () => {
        renderWithI18n(<SkillModal {...defaultProps} />);
        // v3.5.0: 标题改为 "创建技能"
        expect(screen.getByRole('heading', { name: '创建技能' })).toBeDefined();
    });

    // v2.0.0: 编辑技能时显示 "自定义技能" + 技能名称
    it('should render configure modal title when skill is provided', () => {
        renderWithI18n(<SkillModal {...defaultProps} skill={mockSkills[0]} />);
        // 标题区域显示技能名称
        expect(screen.getByDisplayValue('Web搜索')).toBeDefined();
    });

    it('should pre-fill form when editing a skill', () => {
        renderWithI18n(<SkillModal {...defaultProps} skill={mockSkills[0]} />);
        expect(screen.getByDisplayValue('Web搜索')).toBeDefined();
        expect(screen.getByDisplayValue('搜索互联网获取最新信息')).toBeDefined();
    });

    it('should render category selector', () => {
        renderWithI18n(<SkillModal {...defaultProps} />);
        expect(screen.getByText('分类')).toBeDefined();
    });

    it('should call onClose when cancel button is clicked', () => {
        const handleClose = vi.fn();
        renderWithI18n(<SkillModal {...defaultProps} onClose={handleClose} />);
        fireEvent.click(screen.getByText('取消'));
        expect(handleClose).toHaveBeenCalled();
    });

    // v2.0.0: 新建模式按钮文本为 "创建技能"，需要填写 name 和 promptTemplate
    it('should call onSave when save button is clicked', () => {
        const handleSave = vi.fn();
        renderWithI18n(<SkillModal {...defaultProps} onSave={handleSave} />);

        // 填写必填字段：技能名称
        fireEvent.change(screen.getByPlaceholderText('例如: 代码审查'), { target: { value: '新技能' } });
        // 填写必填字段：提示词模板（通过 label 查找 textarea）
        const templateTextarea = screen.getByPlaceholderText(/示例：/);
        fireEvent.change(templateTextarea, { target: { value: '测试模板内容' } });

        // 使用 getByRole 更精确地选择按钮
        fireEvent.click(screen.getByRole('button', { name: '创建技能' }));
        expect(handleSave).toHaveBeenCalled();
    });

    // v2.0.0: 变量配置区域
    it('should show variables section when editing a skill with variables', () => {
        renderWithI18n(<SkillModal {...defaultProps} skill={mockSkills[0]} />);
        // 检查变量配置区域存在
        expect(screen.getByText('可配置变量')).toBeDefined();
    });
});
