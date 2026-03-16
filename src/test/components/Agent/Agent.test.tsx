import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentPage } from '../../../components/features/Agent';
import { AgentCard } from '../../../components/features/Agent/AgentCard';
import { AgentModal } from '../../../components/features/Agent/AgentModal';
import { I18nProvider } from '../../../i18n';
import type { Agent, Skill, AIModel, MCPServer } from '../../../types';

// Mock navigator.language 为中文，确保测试使用中文界面
beforeAll(() => {
    Object.defineProperty(navigator, 'language', {
        value: 'zh-CN',
        configurable: true,
    });
});

const renderWithI18n = (component: React.ReactElement) => {
    return render(<I18nProvider>{component}</I18nProvider>);
};

const mockModels: AIModel[] = [
    { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI', status: 'online', apiKeySet: true, endpoint: '', maxTokens: 128000, pricing: { input: 0.01, output: 0.03 } },
    { id: 'claude', name: 'Claude', provider: 'Anthropic', status: 'online', apiKeySet: true, endpoint: '', maxTokens: 200000, pricing: { input: 0.003, output: 0.015 } },
];

// v2.0.0: 更新 Skill 类型以匹配 SkillCategory
const mockSkills: Skill[] = [
    {
        id: '1',
        name: 'Web搜索',
        description: '搜索互联网',
        category: 'productivity',  // v2.0.0: 使用 SkillCategory 类型
        enabled: true,
        icon: 'search',
        color: 'blue',
        builtIn: false,
        version: '1.0.0',
        promptTemplate: '搜索: {{query}}',
        createdAt: new Date(),
        updatedAt: new Date()
    },
    {
        id: '2',
        name: '代码执行',
        description: '执行代码',
        category: 'coding',  // v2.0.0: 使用 SkillCategory 类型
        enabled: true,
        icon: 'code',
        color: 'green',
        builtIn: false,
        version: '1.0.0',
        promptTemplate: '执行代码: {{code}}',
        createdAt: new Date(),
        updatedAt: new Date()
    },
];

// v2.3.0: 更新 mockAgents，使用真实的模型 ID 和技能 ID
const mockAgents: Agent[] = [
    { id: '1', name: '代码助手', description: '专业的编程助手', model: 'gpt-4', skills: ['1', '2'], systemPrompt: '', temperature: 0.7, maxTokens: 4096, status: 'active', createdAt: new Date(), updatedAt: new Date(), usageCount: 156 },
    { id: '2', name: '数据分析师', description: '分析数据', model: 'claude', skills: [], systemPrompt: '', temperature: 0.5, maxTokens: 8192, status: 'inactive', createdAt: new Date(), updatedAt: new Date(), usageCount: 89 },
];

// MCP 服务器 Mock 数据 (v2.1.0, v2.2.0: 添加 enabled/autoStart)
const mockMCPServers: MCPServer[] = [
    { id: 'fs', name: 'filesystem', description: '文件系统访问', enabled: true, autoStart: false, status: 'connected', transportType: 'stdio', command: 'npx', args: [], authType: 'none', requestCount: 0, createdAt: new Date(), updatedAt: new Date(), tools: [{ name: 'read_file', inputSchema: { type: 'object' } }] },
];

/**
 * AgentCard 组件测试 (v2.3.0)
 * 对应文档测试用例 AG-20 到 AG-32, AG-60 到 AG-64
 */
describe('AgentCard (v2.3.0)', () => {
    // v2.3.0: 添加 models、skills、mcpServers 到 defaultProps
    const defaultProps = {
        agent: mockAgents[0],
        models: mockModels,
        skills: mockSkills,
        mcpServers: mockMCPServers,
        onEdit: vi.fn(),
        onDelete: vi.fn(),
        onToggleStatus: vi.fn(),
        onRun: vi.fn(),
    };

    it('AG-01: 应正确渲染 Agent 卡片', () => {
        renderWithI18n(<AgentCard {...defaultProps} />);
        expect(screen.getByText('代码助手')).toBeDefined();
        expect(screen.getByText('专业的编程助手')).toBeDefined();
    });

    it('AG-32: 应正确显示活跃状态标签', () => {
        renderWithI18n(<AgentCard {...defaultProps} />);
        expect(screen.getByText('活跃')).toBeDefined();
    });

    it('AG-32: 应正确显示未激活状态标签', () => {
        renderWithI18n(<AgentCard {...defaultProps} agent={mockAgents[1]} />);
        expect(screen.getByText('未激活')).toBeDefined();
    });

    it('AG-30/AG-31: 点击状态切换按钮应调用 onToggleStatus', () => {
        const handleToggle = vi.fn();
        renderWithI18n(<AgentCard {...defaultProps} onToggleStatus={handleToggle} />);
        const toggleButton = screen.getByTitle('停用 Agent');
        fireEvent.click(toggleButton);
        expect(handleToggle).toHaveBeenCalled();
    });

    it('AG-06: 点击编辑按钮应调用 onEdit', () => {
        const handleEdit = vi.fn();
        renderWithI18n(<AgentCard {...defaultProps} onEdit={handleEdit} />);
        const editButton = screen.getByTitle('编辑');
        fireEvent.click(editButton);
        expect(handleEdit).toHaveBeenCalled();
    });

    it('AG-20: 点击删除按钮应调用 onDelete', () => {
        const handleDelete = vi.fn();
        renderWithI18n(<AgentCard {...defaultProps} onDelete={handleDelete} />);
        const deleteButton = screen.getByTitle('删除');
        fireEvent.click(deleteButton);
        expect(handleDelete).toHaveBeenCalled();
    });

    it('应显示使用次数', () => {
        renderWithI18n(<AgentCard {...defaultProps} />);
        expect(screen.getByText('使用 156 次')).toBeDefined();
    });

    // v2.3.0: 显示优化测试 AG-60 到 AG-64
    it('AG-60: 应显示模型名字而非 ID', () => {
        renderWithI18n(<AgentCard {...defaultProps} />);
        // 模型 ID 是 'gpt-4'，应显示名字 'GPT-4'
        expect(screen.getByText('GPT-4')).toBeDefined();
    });

    it('AG-61: 模型未找到时应回退显示原始 ID', () => {
        const agentWithUnknownModel = {
            ...mockAgents[0],
            model: 'unknown-model-id',
        };
        renderWithI18n(<AgentCard {...defaultProps} agent={agentWithUnknownModel} />);
        expect(screen.getByText('unknown-model-id')).toBeDefined();
    });

    it('AG-62: 应显示技能名字而非 ID', () => {
        renderWithI18n(<AgentCard {...defaultProps} />);
        // 技能 ID 是 ['1', '2']，应显示名字 'Web搜索' 和 '代码执行'
        expect(screen.getByText('Web搜索')).toBeDefined();
        expect(screen.getByText('代码执行')).toBeDefined();
    });

    it('AG-63: 技能未找到时应回退显示原始 ID', () => {
        const agentWithUnknownSkill = {
            ...mockAgents[0],
            skills: ['unknown-skill-id'],
        };
        renderWithI18n(<AgentCard {...defaultProps} agent={agentWithUnknownSkill} />);
        expect(screen.getByText('unknown-skill-id')).toBeDefined();
    });

    it('AG-64: 应显示所有技能名字', () => {
        renderWithI18n(<AgentCard {...defaultProps} />);
        // Agent 绑定了两个技能 ID ['1', '2']
        const skillTags = screen.getAllByText(/Web搜索|代码执行/);
        expect(skillTags.length).toBe(2);
    });

    it('AG-80: 点击运行按钮应调用 onRun', () => {
        const handleRun = vi.fn();
        renderWithI18n(<AgentCard {...defaultProps} onRun={handleRun} />);
        const runButton = screen.getByTitle('运行');
        fireEvent.click(runButton);
        expect(handleRun).toHaveBeenCalled();
    });

    // v2.3.0: MCP 显示测试 AG-65, AG-66
    it('AG-65: 应显示 MCP 服务器名字', () => {
        const agentWithMCP = {
            ...mockAgents[0],
            enableToolUse: true,
            mcpServers: [{ serverId: 'fs', serverName: 'filesystem' }],
        };
        renderWithI18n(<AgentCard {...defaultProps} agent={agentWithMCP} />);
        expect(screen.getByText('filesystem')).toBeDefined();
    });

    it('AG-66: 无 MCP 服务器时应显示提示', () => {
        renderWithI18n(<AgentCard {...defaultProps} />);
        expect(screen.getByText('无绑定 MCP')).toBeDefined();
    });
});

describe('AgentPage', () => {
    const defaultProps = {
        agents: mockAgents,
        models: mockModels,
        skills: mockSkills,
        mcpServers: mockMCPServers,
        onCreateAgent: vi.fn(),
        onUpdateAgent: vi.fn(),
        onDeleteAgent: vi.fn(),
        onToggleStatus: vi.fn(),
        onRunAgent: vi.fn(),
    };

    it('AG-01: 应渲染 Agent 列表', () => {
        renderWithI18n(<AgentPage {...defaultProps} />);
        expect(screen.getByText('Agent 管理')).toBeDefined();
    });

    it('AG-02: 空列表应显示创建卡片', () => {
        renderWithI18n(<AgentPage {...defaultProps} agents={[]} />);
        expect(screen.getAllByText('创建 Agent').length).toBeGreaterThan(0);
    });

    it('should render create agent button', () => {
        renderWithI18n(<AgentPage {...defaultProps} />);
        expect(screen.getAllByText('创建 Agent').length).toBeGreaterThan(0);
    });

    it('should render agent cards', () => {
        renderWithI18n(<AgentPage {...defaultProps} />);
        expect(screen.getByText('代码助手')).toBeDefined();
        expect(screen.getByText('数据分析师')).toBeDefined();
    });

    /**
     * v3.5.0: 更新测试以适配 ExpandableSearch 组件（需先点击展开）
     */
    it('AG-03: 应按搜索关键词过滤 Agent', () => {
        renderWithI18n(<AgentPage {...defaultProps} />);
        // v3.5.0: ExpandableSearch 默认折叠，需先点击展开
        const searchButton = screen.getByTitle('搜索 Agent...');
        fireEvent.click(searchButton);
        const searchInput = screen.getByPlaceholderText('搜索 Agent...');
        fireEvent.change(searchInput, { target: { value: '代码' } });
        expect(screen.getByText('代码助手')).toBeDefined();
        expect(screen.queryByText('数据分析师')).toBeNull();
    });

    it('AG-04: 应按状态过滤 Agent', () => {
        renderWithI18n(<AgentPage {...defaultProps} />);
        const statusSelect = screen.getByRole('combobox');
        fireEvent.change(statusSelect, { target: { value: 'active' } });
        expect(screen.getByText('代码助手')).toBeDefined();
        expect(screen.queryByText('数据分析师')).toBeNull();
    });

    it('AG-05: 点击创建按钮应打开创建弹窗', () => {
        renderWithI18n(<AgentPage {...defaultProps} />);
        const createButtons = screen.getAllByText('创建 Agent');
        fireEvent.click(createButtons[0]);
        expect(screen.getByText('创建新 Agent')).toBeDefined();
    });

    it('AG-21: 点击删除按钮应显示确认对话框', () => {
        renderWithI18n(<AgentPage {...defaultProps} />);
        const deleteButtons = screen.getAllByTitle('删除');
        fireEvent.click(deleteButtons[0]);
        expect(screen.getByText(/确定要删除 Agent/)).toBeDefined();
    });

    it('AG-22: 取消删除应保留 Agent', () => {
        const handleDelete = vi.fn();
        renderWithI18n(<AgentPage {...defaultProps} onDeleteAgent={handleDelete} />);
        const deleteButtons = screen.getAllByTitle('删除');
        fireEvent.click(deleteButtons[0]);
        // 点击取消按钮
        fireEvent.click(screen.getByText('取消'));
        expect(handleDelete).not.toHaveBeenCalled();
    });

    it('AG-20: 确认删除应调用 onDeleteAgent', () => {
        const handleDelete = vi.fn();
        renderWithI18n(<AgentPage {...defaultProps} onDeleteAgent={handleDelete} />);
        const deleteButtons = screen.getAllByTitle('删除');
        fireEvent.click(deleteButtons[0]);
        // 点击确认对话框中的删除按钮（获取所有删除按钮，最后一个是对话框中的）
        const allDeleteButtons = screen.getAllByRole('button', { name: '删除' });
        fireEvent.click(allDeleteButtons[allDeleteButtons.length - 1]);
        expect(handleDelete).toHaveBeenCalledWith('1');
    });

    it('should show create agent card', () => {
        renderWithI18n(<AgentPage {...defaultProps} />);
        expect(screen.getAllByText('创建 Agent').length).toBeGreaterThan(0);
    });
});


describe('AgentModal', () => {
    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
        agent: null,
        models: mockModels,
        skills: mockSkills,
        mcpServers: mockMCPServers,
        onSave: vi.fn(),
    };

    it('should render create modal title when agent is null', () => {
        renderWithI18n(<AgentModal {...defaultProps} />);
        expect(screen.getByText('创建新 Agent')).toBeDefined();
    });

    it('AG-06: 应显示编辑弹窗标题', () => {
        renderWithI18n(<AgentModal {...defaultProps} agent={mockAgents[0]} />);
        expect(screen.getByText('编辑 Agent')).toBeDefined();
    });

    it('AG-11: 编辑时应预填表单', () => {
        renderWithI18n(<AgentModal {...defaultProps} agent={mockAgents[0]} />);
        expect(screen.getByDisplayValue('代码助手')).toBeDefined();
        expect(screen.getByDisplayValue('专业的编程助手')).toBeDefined();
    });

    it('AG-13: 应渲染模型选择器', () => {
        renderWithI18n(<AgentModal {...defaultProps} />);
        expect(screen.getByText('选择模型')).toBeDefined();
        expect(screen.getByText('GPT-4')).toBeDefined();
    });

    it('AG-14: 应渲染技能复选框', () => {
        renderWithI18n(<AgentModal {...defaultProps} />);
        expect(screen.getByText('配置技能')).toBeDefined();
        expect(screen.getByText('Web搜索')).toBeDefined();
        expect(screen.getByText('代码执行')).toBeDefined();
    });

    it('should call onClose when cancel button is clicked', () => {
        const handleClose = vi.fn();
        renderWithI18n(<AgentModal {...defaultProps} onClose={handleClose} />);
        fireEvent.click(screen.getByText('取消'));
        expect(handleClose).toHaveBeenCalled();
    });

    it('AG-10: 创建 Agent 应调用 onSave', () => {
        const handleSave = vi.fn();
        renderWithI18n(<AgentModal {...defaultProps} onSave={handleSave} />);

        // Fill in form
        fireEvent.change(screen.getByPlaceholderText('例如: 代码助手'), { target: { value: '新Agent' } });

        // Submit
        fireEvent.click(screen.getByText('创建 Agent'));
        expect(handleSave).toHaveBeenCalled();
    });

    it('AG-16/AG-17: 应渲染高级设置', () => {
        renderWithI18n(<AgentModal {...defaultProps} />);
        expect(screen.getByText('高级设置')).toBeDefined();
        expect(screen.getByText('温度')).toBeDefined();
        expect(screen.getByText(/Max Tokens|最大令牌/)).toBeDefined();
    });

    // AG-50~AG-54: MCP 集成测试
    it('AG-50: 应显示 MCP 工具调用开关', () => {
        renderWithI18n(<AgentModal {...defaultProps} />);
        expect(screen.getByText('MCP 工具调用')).toBeDefined();
    });

    it('AG-51: 启用工具调用时应显示服务器选择列表', () => {
        renderWithI18n(<AgentModal {...defaultProps} />);
        // MCP 开关是一个隐藏的 checkbox (sr-only)，通过 getAllByRole 获取所有 checkbox
        const checkboxes = screen.getAllByRole('checkbox', { hidden: true });
        // 最后一个 checkbox 是 MCP 开关（在技能 checkbox 之后）
        const mcpToggle = checkboxes[checkboxes.length - 1];
        fireEvent.click(mcpToggle);
        // 应显示服务器选择提示
        expect(screen.getByText(/选择此 Agent 可以使用的 MCP 服务器工具/)).toBeDefined();
    });

    it('AG-52: 选择 MCP 服务器应加入 mcpServers', () => {
        const handleSave = vi.fn();
        renderWithI18n(<AgentModal {...defaultProps} onSave={handleSave} />);

        // 填写必填字段
        fireEvent.change(screen.getByPlaceholderText('例如: 代码助手'), { target: { value: '测试Agent' } });

        // 启用 MCP 工具调用
        const checkboxes = screen.getAllByRole('checkbox', { hidden: true });
        const mcpToggle = checkboxes[checkboxes.length - 1];
        fireEvent.click(mcpToggle);

        // 选择服务器（点击服务器名称所在的卡片）
        const serverName = screen.getByText('filesystem');
        fireEvent.click(serverName);

        // 提交
        fireEvent.click(screen.getByText('创建 Agent'));

        expect(handleSave).toHaveBeenCalledWith(
            expect.objectContaining({
                enableToolUse: true,
                mcpServers: expect.arrayContaining([
                    expect.objectContaining({ serverId: 'fs' })
                ])
            })
        );
    });

    it('AG-53: 选择有工具的服务器应显示工具数量', () => {
        renderWithI18n(<AgentModal {...defaultProps} />);

        // 启用 MCP 工具调用
        const checkboxes = screen.getAllByRole('checkbox', { hidden: true });
        const mcpToggle = checkboxes[checkboxes.length - 1];
        fireEvent.click(mcpToggle);

        // v2.5.0: 工具数量仅显示数字（如 "1"），不带"个工具"文字
        // mockMCPServers[0] 有 1 个工具
        // 查找包含 Wrench 图标旁边的数字
        expect(screen.getByText('1')).toBeDefined();
    });

    // v2.5.0: 改为显示所有启用的 MCP 服务器（包括未连接的），而不是只显示已连接的
    // 所以当服务器 enabled=true 但 status=disconnected 时，仍会显示服务器列表
    it('AG-54: 无启用的服务器时应显示提示信息', () => {
        // 传入空数组或所有服务器 enabled=false 时才会显示提示
        const disabledServers = mockMCPServers.map(s => ({ ...s, enabled: false }));
        renderWithI18n(<AgentModal {...defaultProps} mcpServers={disabledServers} />);

        // 启用 MCP 工具调用
        const checkboxes = screen.getAllByRole('checkbox', { hidden: true });
        const mcpToggle = checkboxes[checkboxes.length - 1];
        fireEvent.click(mcpToggle);

        // 应显示无可用服务器提示（匹配中英文）
        expect(screen.getByText(/暂无已连接的 MCP 服务器|No connected MCP servers/i)).toBeDefined();
    });
});

// ==================== Agent 持久化测试 (v2.2.0) ====================

describe('agentsStorage 持久化', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    /**
     * AG-40: 保存 Agent
     * 验证创建新 Agent 后数据正确持久化到存储
     */
    it('AG-40: 创建 Agent 应正确持久化到存储', async () => {
        const { agentsStorage } = await import('../../../services/storage');

        const newAgent: Agent = {
            id: 'test-agent-1',
            name: '测试 Agent',
            description: '用于测试的 Agent',
            model: 'gpt-4',
            skills: ['skill-1', 'skill-2'],
            systemPrompt: '你是一个测试助手',
            temperature: 0.7,
            maxTokens: 4096,
            status: 'active',
            createdAt: new Date('2024-01-15T10:00:00Z'),
            updatedAt: new Date('2024-01-15T10:00:00Z'),
            usageCount: 0,
        };

        // 保存
        await agentsStorage.save([newAgent]);

        // 验证 localStorage 中的数据
        const stored = localStorage.getItem('mobaus_agents');
        expect(stored).toBeTruthy();
        const parsed = JSON.parse(stored!);
        expect(parsed).toHaveLength(1);
        expect(parsed[0].id).toBe('test-agent-1');
        expect(parsed[0].name).toBe('测试 Agent');
        expect(parsed[0].skills).toEqual(['skill-1', 'skill-2']);
    });

    /**
     * AG-41: 加载 Agent
     * 验证刷新页面后 Agent 数据正确恢复
     */
    it('AG-41: 加载 Agent 应正确恢复数据', async () => {
        const { agentsStorage } = await import('../../../services/storage');

        // 模拟已保存的数据
        const savedData = [{
            id: 'saved-agent',
            name: '已保存的 Agent',
            description: '测试描述',
            model: 'claude',
            skills: ['skill-1'],
            systemPrompt: '系统提示词',
            temperature: 0.5,
            maxTokens: 8192,
            status: 'active',
            createdAt: '2024-01-10T08:00:00.000Z',
            updatedAt: '2024-01-10T08:00:00.000Z',
            usageCount: 10,
            lastUsedAt: '2024-01-14T15:30:00.000Z',
        }];
        localStorage.setItem('mobaus_agents', JSON.stringify(savedData));

        // 加载
        const loaded = await agentsStorage.load();

        expect(loaded).toHaveLength(1);
        expect(loaded[0].id).toBe('saved-agent');
        expect(loaded[0].name).toBe('已保存的 Agent');
        expect(loaded[0].model).toBe('claude');
        expect(loaded[0].skills).toEqual(['skill-1']);
        expect(loaded[0].usageCount).toBe(10);
    });

    /**
     * AG-42: Date 类型恢复
     * 验证加载保存的数据时 createdAt/updatedAt/lastUsedAt 为 Date 对象
     */
    it('AG-42: 加载时 Date 类型应正确恢复', async () => {
        const { agentsStorage } = await import('../../../services/storage');

        const savedData = [{
            id: 'date-test-agent',
            name: 'Date 测试',
            description: '',
            model: 'gpt-4',
            skills: [],
            systemPrompt: '',
            temperature: 0.7,
            maxTokens: 4096,
            status: 'active',
            createdAt: '2024-01-15T10:00:00.000Z',
            updatedAt: '2024-01-16T12:30:00.000Z',
            usageCount: 5,
            lastUsedAt: '2024-01-16T12:30:00.000Z',
        }];
        localStorage.setItem('mobaus_agents', JSON.stringify(savedData));

        const loaded = await agentsStorage.load();

        // 验证 Date 类型
        expect(loaded[0].createdAt).toBeInstanceOf(Date);
        expect(loaded[0].updatedAt).toBeInstanceOf(Date);
        expect(loaded[0].lastUsedAt).toBeInstanceOf(Date);

        // 验证时间值正确
        expect(loaded[0].createdAt.toISOString()).toBe('2024-01-15T10:00:00.000Z');
        expect(loaded[0].updatedAt.toISOString()).toBe('2024-01-16T12:30:00.000Z');
        expect(loaded[0].lastUsedAt!.toISOString()).toBe('2024-01-16T12:30:00.000Z');
    });

    /**
     * AG-43: MCP 配置持久化
     * 验证保存带 MCP 配置的 Agent 后 mcpServers 正确恢复
     */
    it('AG-43: MCP 配置应正确持久化和恢复', async () => {
        const { agentsStorage } = await import('../../../services/storage');

        const agentWithMCP: Agent = {
            id: 'mcp-agent',
            name: 'MCP Agent',
            description: '带 MCP 配置的 Agent',
            model: 'gpt-4',
            skills: [],
            systemPrompt: '',
            temperature: 0.7,
            maxTokens: 4096,
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
            usageCount: 0,
            enableToolUse: true,
            mcpServers: [
                { serverId: 'fs', serverName: 'filesystem', enabledTools: ['read_file', 'write_file'] },
                { serverId: 'github', serverName: 'GitHub', enabledTools: undefined },
            ],
        };

        // 保存
        await agentsStorage.save([agentWithMCP]);

        // 加载
        const loaded = await agentsStorage.load();

        expect(loaded[0].enableToolUse).toBe(true);
        expect(loaded[0].mcpServers).toHaveLength(2);
        expect(loaded[0].mcpServers![0].serverId).toBe('fs');
        expect(loaded[0].mcpServers![0].serverName).toBe('filesystem');
        expect(loaded[0].mcpServers![0].enabledTools).toEqual(['read_file', 'write_file']);
        expect(loaded[0].mcpServers![1].serverId).toBe('github');
        expect(loaded[0].mcpServers![1].enabledTools).toBeUndefined();
    });

    /**
     * AG-70: 使用次数初始值
     * 验证新创建的 Agent usageCount=0
     */
    it('AG-70: 新创建的 Agent usageCount 应为 0', async () => {
        const { agentsStorage } = await import('../../../services/storage');

        const newAgent: Agent = {
            id: 'new-agent',
            name: '新 Agent',
            description: '',
            model: 'gpt-4',
            skills: [],
            systemPrompt: '',
            temperature: 0.7,
            maxTokens: 4096,
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
            usageCount: 0,
        };

        await agentsStorage.save([newAgent]);
        const loaded = await agentsStorage.load();

        expect(loaded[0].usageCount).toBe(0);
        expect(loaded[0].lastUsedAt).toBeUndefined();
    });

    /**
     * AG-71: 使用次数递增
     * 验证使用 Agent 发送消息后 usageCount +1
     */
    it('AG-71: 更新 usageCount 应正确持久化', async () => {
        const { agentsStorage } = await import('../../../services/storage');

        const agent: Agent = {
            id: 'usage-agent',
            name: '使用统计测试',
            description: '',
            model: 'gpt-4',
            skills: [],
            systemPrompt: '',
            temperature: 0.7,
            maxTokens: 4096,
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
            usageCount: 5,
        };

        await agentsStorage.save([agent]);

        // 模拟使用后递增
        await agentsStorage.update('usage-agent', { usageCount: 6 });

        const loaded = await agentsStorage.load();
        expect(loaded[0].usageCount).toBe(6);
    });

    /**
     * AG-72: 最后使用时间更新
     * 验证使用 Agent 发送消息后 lastUsedAt 更新为当前时间
     */
    it('AG-72: 更新 lastUsedAt 应正确持久化', async () => {
        const { agentsStorage } = await import('../../../services/storage');

        const agent: Agent = {
            id: 'last-used-agent',
            name: '最后使用时间测试',
            description: '',
            model: 'gpt-4',
            skills: [],
            systemPrompt: '',
            temperature: 0.7,
            maxTokens: 4096,
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
            usageCount: 0,
        };

        await agentsStorage.save([agent]);

        // 模拟使用后更新 lastUsedAt
        const useTime = new Date('2024-01-20T14:00:00Z');
        await agentsStorage.update('last-used-agent', {
            usageCount: 1,
            lastUsedAt: useTime,
        });

        const loaded = await agentsStorage.load();
        expect(loaded[0].lastUsedAt).toBeInstanceOf(Date);
        expect(loaded[0].lastUsedAt!.getTime()).toBe(useTime.getTime());
    });

    /**
     * AG-73: 使用次数持久化
     * 验证使用后重启应用 usageCount 保持不变
     */
    it('AG-73: usageCount 应在重启后保持不变', async () => {
        const { agentsStorage } = await import('../../../services/storage');

        // 模拟已有使用记录的数据
        const savedData = [{
            id: 'persistent-agent',
            name: '持久化测试',
            description: '',
            model: 'gpt-4',
            skills: [],
            systemPrompt: '',
            temperature: 0.7,
            maxTokens: 4096,
            status: 'active',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-15T10:00:00.000Z',
            usageCount: 156,
            lastUsedAt: '2024-01-15T10:00:00.000Z',
        }];
        localStorage.setItem('mobaus_agents', JSON.stringify(savedData));

        // 模拟"重启"后加载
        const loaded = await agentsStorage.load();

        expect(loaded[0].usageCount).toBe(156);
        expect(loaded[0].lastUsedAt).toBeInstanceOf(Date);
    });

    /**
     * 边界情况：空 lastUsedAt
     * 验证 lastUsedAt 为空时正确处理
     */
    it('lastUsedAt 为空时应正确处理', async () => {
        const { agentsStorage } = await import('../../../services/storage');

        const savedData = [{
            id: 'no-last-used',
            name: '无使用记录',
            description: '',
            model: 'gpt-4',
            skills: [],
            systemPrompt: '',
            temperature: 0.7,
            maxTokens: 4096,
            status: 'active',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
            usageCount: 0,
            // 没有 lastUsedAt 字段
        }];
        localStorage.setItem('mobaus_agents', JSON.stringify(savedData));

        const loaded = await agentsStorage.load();

        expect(loaded[0].lastUsedAt).toBeUndefined();
    });

    /**
     * 边界情况：多 Agent 持久化
     * 验证多个 Agent 正确保存和加载
     */
    it('多个 Agent 应正确持久化', async () => {
        const { agentsStorage } = await import('../../../services/storage');

        const agents: Agent[] = [
            {
                id: 'agent-1',
                name: 'Agent 1',
                description: '',
                model: 'gpt-4',
                skills: ['skill-1'],
                systemPrompt: '',
                temperature: 0.7,
                maxTokens: 4096,
                status: 'active',
                createdAt: new Date(),
                updatedAt: new Date(),
                usageCount: 10,
            },
            {
                id: 'agent-2',
                name: 'Agent 2',
                description: '',
                model: 'claude',
                skills: ['skill-2', 'skill-3'],
                systemPrompt: '系统提示',
                temperature: 0.5,
                maxTokens: 8192,
                status: 'inactive',
                createdAt: new Date(),
                updatedAt: new Date(),
                usageCount: 5,
            },
        ];

        await agentsStorage.save(agents);
        const loaded = await agentsStorage.load();

        expect(loaded).toHaveLength(2);
        expect(loaded[0].name).toBe('Agent 1');
        expect(loaded[1].name).toBe('Agent 2');
        expect(loaded[0].skills).toEqual(['skill-1']);
        expect(loaded[1].skills).toEqual(['skill-2', 'skill-3']);
    });
});
