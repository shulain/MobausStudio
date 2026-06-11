/**
 * MCP 模块单元测试 (v2.6.0)
 *
 * 测试MCP服务器管理相关组件
 * - MCPCard: 服务器卡片组件
 * - MCPPage: 服务器列表页面
 * - MCPModal: 添加/编辑服务器弹窗
 * - v2.6.0: 删除确认功能测试
 *
 * 对应文档: docs/modules/mcp.md
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { MCPPage } from '../../../components/features/MCP';
import { MCPCard } from '../../../components/features/MCP/MCPCard';
import { MCPModal } from '../../../components/features/MCP/MCPModal';
import { renderWithI18n } from '../../testUtils';
import type { MCPServer, MCPStats } from '../../../types';

// v2.0.0: 更新 mock 数据以匹配新的类型定义
// v2.2.0: 添加 enabled/autoStart 字段
const mockServers: MCPServer[] = [
    {
        id: '1',
        name: 'filesystem',
        description: '文件系统访问',
        enabled: true,
        autoStart: false,
        status: 'connected',
        transportType: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        capabilities: { tools: {} },
        authType: 'none',
        requestCount: 1234,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastActiveAt: new Date(),
        serverInfo: { name: 'filesystem-server', version: '1.0.0' },
        tools: [{ name: 'read_file', description: '读取文件', inputSchema: { type: 'object' } }],
    },
    {
        id: '2',
        name: 'database',
        description: '数据库连接',
        enabled: true,
        autoStart: true,
        status: 'error',
        transportType: 'http',
        endpoint: 'http://db.example.com:5432',
        capabilities: { tools: {} },
        authType: 'token',
        authValue: '••••',
        requestCount: 567,
        createdAt: new Date(),
        updatedAt: new Date(),
        errorMessage: '连接超时',
    },
];

const mockStats: MCPStats = {
    connected: 1,
    disconnected: 0,
    error: 1,
    totalRequests: 1801,
};

describe('MCPCard', () => {
    const mockServer = mockServers[0];

    // v2.0.0: 更新 props 为 onConnect, onDisconnect
    const defaultCardProps = {
        server: mockServer,
        onConnect: () => { },
        onDisconnect: () => { },
        onConfigure: () => { },
        onDelete: () => { },
    };

    it('should render server name', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} />);
        expect(screen.getByText('filesystem')).toBeDefined();
    });

    it('should render server description', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} />);
        expect(screen.getByText('文件系统访问')).toBeDefined();
    });

    it('should render transport type badge', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} />);
        expect(screen.getByText('stdio')).toBeDefined();
    });

    it('should show connected status', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} />);
        expect(screen.getByText('已连接')).toBeDefined();
    });

    it('should show error status', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} server={mockServers[1]} />);
        expect(screen.getByText('错误')).toBeDefined();
    });

    it('should show error message when status is error', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} server={mockServers[1]} />);
        expect(screen.getByText('连接超时')).toBeDefined();
    });

    it('should show disconnect button when connected', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} />);
        expect(screen.getByText('断开')).toBeDefined();
    });

    it('should show connect button when disconnected', () => {
        const disconnectedServer = { ...mockServer, status: 'disconnected' as const };
        renderWithI18n(<MCPCard {...defaultCardProps} server={disconnectedServer} />);
        expect(screen.getByText('连接')).toBeDefined();
    });

    it('should call onDisconnect when disconnect button is clicked', () => {
        const handleDisconnect = vi.fn();
        renderWithI18n(<MCPCard {...defaultCardProps} onDisconnect={handleDisconnect} />);
        fireEvent.click(screen.getByText('断开'));
        expect(handleDisconnect).toHaveBeenCalled();
    });

    it('should call onConnect when connect button is clicked', () => {
        const handleConnect = vi.fn();
        const disconnectedServer = { ...mockServer, status: 'disconnected' as const };
        renderWithI18n(<MCPCard {...defaultCardProps} server={disconnectedServer} onConnect={handleConnect} />);
        fireEvent.click(screen.getByText('连接'));
        expect(handleConnect).toHaveBeenCalled();
    });

    it('should call onConfigure when configure button is clicked', () => {
        const handleConfigure = vi.fn();
        renderWithI18n(<MCPCard {...defaultCardProps} onConfigure={handleConfigure} />);
        fireEvent.click(screen.getByText('配置'));
        expect(handleConfigure).toHaveBeenCalled();
    });

    it('should display request count', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} />);
        expect(screen.getByText(/请求: 1234/)).toBeDefined();
    });

    it('should display server info when connected', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} />);
        expect(screen.getByText(/filesystem-server v1.0.0/)).toBeDefined();
    });

    it('should display tools when connected', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} />);
        expect(screen.getByText('read_file')).toBeDefined();
    });
});

describe('MCPPage', () => {
    // v2.0.0: 更新 props 为 onConnect, onDisconnect, isLoading
    const defaultProps = {
        servers: mockServers,
        stats: mockStats,
        onAddServer: vi.fn(),
        onUpdateServer: vi.fn(),
        onDeleteServer: vi.fn(),
        onConnect: vi.fn(),
        onDisconnect: vi.fn(),
        isLoading: vi.fn().mockReturnValue(false),
    };

    it('should render page title', () => {
        renderWithI18n(<MCPPage {...defaultProps} />);
        expect(screen.getByText('MCP 服务器')).toBeDefined();
    });

    it('should render add server button', () => {
        renderWithI18n(<MCPPage {...defaultProps} />);
        // v3.6.0: "添加服务器"出现多次（头部按钮+卡片）
        expect(screen.getAllByText('添加服务器').length).toBeGreaterThanOrEqual(1);
    });

    it('should render server cards', () => {
        renderWithI18n(<MCPPage {...defaultProps} />);
        expect(screen.getByText('filesystem')).toBeDefined();
        expect(screen.getByText('database')).toBeDefined();
    });

    it('should render stats cards', () => {
        renderWithI18n(<MCPPage {...defaultProps} />);
        // "已连接"可能会在stats卡片和server卡片中同时出现
        expect(screen.getAllByText('已连接').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('未连接')).toBeDefined();
        expect(screen.getAllByText('错误').length).toBeGreaterThanOrEqual(1);
    });

    it('should display stats values', () => {
        renderWithI18n(<MCPPage {...defaultProps} />);
        // "1" 可能出现多次 (connected=1, error=1)
        expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('1.8K')).toBeDefined(); // total requests (formatted)
    });

    it('should open modal when add button is clicked', () => {
        renderWithI18n(<MCPPage {...defaultProps} />);
        // v3.6.0: "添加服务器"出现多次（头部按钮+卡片），点击第一个（头部按钮）
        const addButtons = screen.getAllByText('添加服务器');
        fireEvent.click(addButtons[0]);
        // v3.5.0: Modal 标题改为 "添加服务器"
        expect(screen.getByText('MCP 服务器配置')).toBeDefined();
    });

    /**
     * v3.6.0: 空状态时显示添加卡片而非空提示
     */
    it('should show add card when no servers', () => {
        renderWithI18n(<MCPPage {...defaultProps} servers={[]} />);
        // v3.6.0: 现在空状态时显示添加卡片，"添加服务器"会出现多次（头部按钮+卡片）
        expect(screen.getAllByText('添加服务器').length).toBeGreaterThanOrEqual(1);
    });

    /**
     * v2.6.0: 删除确认功能测试
     * 对应测试用例: MCP-D01 ~ MCP-D04
     */
    describe('Delete Confirmation (v2.6.0)', () => {
        // MCP-D01: 点击删除按钮显示确认对话框
        it('should show delete confirmation dialog when delete button is clicked', () => {
            renderWithI18n(<MCPPage {...defaultProps} />);
            // 找到删除按钮并点击
            const deleteButtons = screen.getAllByRole('button', { name: '删除服务器' });
            // 点击第一个服务器的删除按钮
            if (deleteButtons.length > 0) {
                fireEvent.click(deleteButtons[0]);
            }
            // 检查确认对话框是否显示 - v3.5.0: 标题改为 "删除服务器"
            expect(screen.getByText('删除服务器')).toBeDefined();
            expect(screen.getByText(/确定要删除 MCP 服务器/)).toBeDefined();
        });

        // MCP-D02: 确认删除执行删除操作
        it('should call onDeleteServer when delete is confirmed', () => {
            const handleDelete = vi.fn();
            renderWithI18n(<MCPPage {...defaultProps} onDeleteServer={handleDelete} />);
            // 打开删除确认对话框
            fireEvent.click(screen.getAllByRole('button', { name: '删除服务器' })[0]);
            // 点击确认删除按钮
            const confirmDeleteBtn = screen.getByRole('button', { name: '删除' });
            fireEvent.click(confirmDeleteBtn);
            // 验证onDeleteServer被调用
            expect(handleDelete).toHaveBeenCalledWith('1');
        });

        // MCP-D03: 取消删除保留服务器
        it('should close dialog and keep server when cancel is clicked', () => {
            const handleDelete = vi.fn();
            renderWithI18n(<MCPPage {...defaultProps} onDeleteServer={handleDelete} />);
            // 打开删除确认对话框
            fireEvent.click(screen.getAllByRole('button', { name: '删除服务器' })[0]);
            // 点击取消按钮
            const cancelBtn = screen.getByRole('button', { name: '取消' });
            fireEvent.click(cancelBtn);
            // 验证onDeleteServer没有被调用
            expect(handleDelete).not.toHaveBeenCalled();
            // 验证对话框关闭（标题不再显示）- v3.5.0: 标题改为 "删除服务器"
            expect(screen.queryByText('删除服务器')).toBeNull();
        });

        // MCP-D04: 删除确认对话框显示正确信息
        it('should display server name in confirmation dialog', () => {
            renderWithI18n(<MCPPage {...defaultProps} />);
            // 打开删除确认对话框
            fireEvent.click(screen.getAllByRole('button', { name: '删除服务器' })[0]);
            // 验证显示服务器名称（在确认对话框的提示文本中）- v3.5.0: 文本格式变化
            expect(screen.getByText(/确定要删除 MCP 服务器 "filesystem" 吗/)).toBeDefined();
            expect(screen.getByText(/此操作无法撤销/)).toBeDefined();
        });
    });
});

describe('MCPModal', () => {
    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
        server: null,
        onSave: vi.fn(),
    };

    it('should render add modal title when server is null', () => {
        renderWithI18n(<MCPModal {...defaultProps} />);
        // v3.5.0: Modal 标题改为 "添加服务器"，使用 heading role 精确匹配标题
        expect(screen.getByRole('heading', { name: '添加服务器' })).toBeDefined();
    });

    it('should render edit modal title when server is provided', () => {
        renderWithI18n(<MCPModal {...defaultProps} server={mockServers[0]} />);
        // v3.5.0: Modal 标题改为 "编辑服务器"
        expect(screen.getByRole('heading', { name: '编辑服务器' })).toBeDefined();
    });

    it('should pre-fill form when editing a server', () => {
        renderWithI18n(<MCPModal {...defaultProps} server={mockServers[0]} />);
        expect(screen.getByDisplayValue('filesystem')).toBeDefined();
        expect(screen.getByDisplayValue('文件系统访问')).toBeDefined();
    });

    it('should render transport type selector', () => {
        renderWithI18n(<MCPModal {...defaultProps} />);
        expect(screen.getByText('传输类型')).toBeDefined();
        expect(screen.getByText('stdio')).toBeDefined();
        expect(screen.getByText('HTTP')).toBeDefined();
    });

    it('should show command input for stdio transport', () => {
        renderWithI18n(<MCPModal {...defaultProps} />);
        // 默认是 stdio
        expect(screen.getByText('启动命令')).toBeDefined();
        expect(screen.getByPlaceholderText(/npx.*node/)).toBeDefined();
    });

    it('should show endpoint input for http transport', () => {
        renderWithI18n(<MCPModal {...defaultProps} server={mockServers[1]} />);
        expect(screen.getByText('端点地址')).toBeDefined();
    });

    it('should render auth type selector', () => {
        renderWithI18n(<MCPModal {...defaultProps} />);
        expect(screen.getByText('认证方式')).toBeDefined();
        // v3.5.0: 检查认证选项存在（Select 组件）
        expect(screen.getByText('无需认证')).toBeDefined();
    });

    it('should show auth value input when auth type is not none', () => {
        renderWithI18n(<MCPModal {...defaultProps} server={mockServers[1]} />);
        expect(screen.getByPlaceholderText(/输入/)).toBeDefined();
    });

    it('should call onClose when cancel button is clicked', () => {
        const handleClose = vi.fn();
        renderWithI18n(<MCPModal {...defaultProps} onClose={handleClose} />);
        fireEvent.click(screen.getByText('取消'));
        expect(handleClose).toHaveBeenCalled();
    });

    it('should call onSave when add button is clicked with valid data', () => {
        const handleSave = vi.fn();
        renderWithI18n(<MCPModal {...defaultProps} onSave={handleSave} />);

        // 填写表单 (v2.0.0: stdio 模式)
        fireEvent.change(screen.getByPlaceholderText('例如: filesystem'), { target: { value: '新服务器' } });
        fireEvent.change(screen.getByPlaceholderText(/npx.*node/), { target: { value: 'npx' } });
        // v3.5.0: 使用 button role 精确匹配提交按钮
        fireEvent.click(screen.getByRole('button', { name: '添加服务器' }));
        expect(handleSave).toHaveBeenCalled();
    });
});

/**
 * MCPCard - enabled/autoStart 行为测试 (v2.2.0)
 * 对应测试用例: MCP-E08, MCP-E09
 */
describe('MCPCard - enabled/autoStart 显示', () => {
    const mockServer = mockServers[0];
    const defaultCardProps = {
        server: mockServer,
        onConnect: vi.fn(),
        onDisconnect: vi.fn(),
        onConfigure: vi.fn(),
        onDelete: vi.fn(),
    };

    // MCP-E09: UI 显示自启动标识
    it('MCP-E09: autoStart=true 时显示自启动徽章', () => {
        const autoStartServer = { ...mockServer, autoStart: true };
        renderWithI18n(<MCPCard {...defaultCardProps} server={autoStartServer} />);
        expect(screen.getByText('自启动')).toBeDefined();
    });

    it('autoStart=false 时不显示自启动徽章', () => {
        const noAutoStartServer = { ...mockServer, autoStart: false };
        renderWithI18n(<MCPCard {...defaultCardProps} server={noAutoStartServer} />);
        expect(screen.queryByText('自启动')).toBeNull();
    });
});

/**
 * MCPCard - 重连功能测试 (v2.2.0)
 * 对应测试用例: MCP-R01 ~ MCP-R03
 */
describe('MCPCard - 重连功能', () => {
    const connectedServer: MCPServer = {
        ...mockServers[0],
        status: 'connected',
    };

    const defaultCardProps = {
        server: connectedServer,
        onConnect: vi.fn(),
        onDisconnect: vi.fn(),
        onReconnect: vi.fn(),
        onConfigure: vi.fn(),
        onDelete: vi.fn(),
    };

    // MCP-R01: 已连接服务器显示重连按钮
    it('MCP-R01: 已连接服务器显示重连按钮', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} />);
        expect(screen.getByText('重连')).toBeDefined();
    });

    it('未连接服务器不显示重连按钮', () => {
        const disconnectedServer = { ...connectedServer, status: 'disconnected' as const };
        renderWithI18n(<MCPCard {...defaultCardProps} server={disconnectedServer} />);
        expect(screen.queryByText('重连')).toBeNull();
    });

    // MCP-R02: 点击重连按钮执行重连
    it('MCP-R02: 点击重连按钮调用 onReconnect', () => {
        const handleReconnect = vi.fn();
        renderWithI18n(<MCPCard {...defaultCardProps} onReconnect={handleReconnect} />);
        fireEvent.click(screen.getByText('重连'));
        expect(handleReconnect).toHaveBeenCalled();
    });

    // MCP-R03: 重连过程中按钮禁用
    it('MCP-R03: isLoading=true 时重连按钮禁用', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} isLoading={true} />);
        const reconnectButton = screen.getByText('重连').closest('button');
        expect(reconnectButton?.disabled).toBe(true);
    });

    it('无 onReconnect 回调时不显示重连按钮', () => {
        const propsWithoutReconnect = { ...defaultCardProps, onReconnect: undefined };
        renderWithI18n(<MCPCard {...propsWithoutReconnect} />);
        expect(screen.queryByText('重连')).toBeNull();
    });
});

/**
 * MCPCard - 工具展开显示测试 (v2.3.0)
 * 对应测试用例: MCP-T01 ~ MCP-T06
 */
describe('MCPCard - 工具展开显示', () => {
    // 创建有多个工具的服务器
    const manyToolsServer: MCPServer = {
        ...mockServers[0],
        status: 'connected',
        tools: [
            { name: 'tool1', description: '工具1描述', inputSchema: { type: 'object' } },
            { name: 'tool2', description: '工具2描述', inputSchema: { type: 'object' } },
            { name: 'tool3', description: '工具3描述', inputSchema: { type: 'object' } },
            { name: 'tool4', description: '工具4描述', inputSchema: { type: 'object' } },
            { name: 'tool5', description: '工具5描述', inputSchema: { type: 'object' } },
            { name: 'tool6', description: '工具6描述', inputSchema: { type: 'object' } },
            { name: 'tool7', description: '工具7描述', inputSchema: { type: 'object' } },
        ],
    };

    const fewToolsServer: MCPServer = {
        ...mockServers[0],
        status: 'connected',
        tools: [
            { name: 'tool1', description: '工具1描述', inputSchema: { type: 'object' } },
            { name: 'tool2', description: '工具2描述', inputSchema: { type: 'object' } },
            { name: 'tool3', description: '工具3描述', inputSchema: { type: 'object' } },
        ],
    };

    const defaultCardProps = {
        server: manyToolsServer,
        onConnect: vi.fn(),
        onDisconnect: vi.fn(),
        onConfigure: vi.fn(),
        onDelete: vi.fn(),
    };

    // MCP-T01: 工具列表默认折叠
    it('MCP-T01: 工具数量 > 5 时默认只显示前 5 个工具', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} />);
        // 应该显示前 5 个工具
        expect(screen.getByText('tool1')).toBeDefined();
        expect(screen.getByText('tool5')).toBeDefined();
        // 第 6、7 个工具不应该直接显示
        expect(screen.queryByText('tool6')).toBeNull();
        expect(screen.queryByText('tool7')).toBeNull();
        // 应该显示 "+2" 按钮
        expect(screen.getByText('+2')).toBeDefined();
    });

    // MCP-T02: 点击展开按钮
    it('MCP-T02: 点击展开全部显示所有工具', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} />);
        // 点击展开
        fireEvent.click(screen.getByText('展开全部'));
        // 现在应该显示所有工具（可能出现多次：标签和描述列表中）
        expect(screen.getAllByText('tool6').length).toBeGreaterThan(0);
        expect(screen.getAllByText('tool7').length).toBeGreaterThan(0);
        // 展开后按钮变为"收起"
        expect(screen.getByText('收起')).toBeDefined();
    });

    // MCP-T03: 点击收起按钮
    it('MCP-T03: 点击收起恢复只显示前 5 个工具', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} />);
        // 先展开
        fireEvent.click(screen.getByText('展开全部'));
        expect(screen.getAllByText('tool7').length).toBeGreaterThan(0);
        // 再收起
        fireEvent.click(screen.getByText('收起'));
        // 第 6、7 个工具不再显示
        expect(screen.queryByText('tool6')).toBeNull();
        expect(screen.queryByText('tool7')).toBeNull();
    });

    // MCP-T04: 工具显示描述
    it('MCP-T04: 展开后显示工具描述', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} />);
        // 展开工具列表
        fireEvent.click(screen.getByText('展开全部'));
        // 应该显示工具描述
        expect(screen.getByText('工具1描述')).toBeDefined();
        expect(screen.getByText('工具6描述')).toBeDefined();
    });

    // MCP-T05: 工具无描述
    it('MCP-T05: 工具无描述时显示"暂无描述"', () => {
        const noDescServer: MCPServer = {
            ...manyToolsServer,
            tools: [
                { name: 'tool1', inputSchema: { type: 'object' } },
                { name: 'tool2', inputSchema: { type: 'object' } },
                { name: 'tool3', inputSchema: { type: 'object' } },
                { name: 'tool4', inputSchema: { type: 'object' } },
                { name: 'tool5', inputSchema: { type: 'object' } },
                { name: 'tool6', inputSchema: { type: 'object' } },
            ],
        };
        renderWithI18n(<MCPCard {...defaultCardProps} server={noDescServer} />);
        // 展开工具列表
        fireEvent.click(screen.getByText('展开全部'));
        // 应该显示"暂无描述"
        expect(screen.getAllByText('暂无描述').length).toBeGreaterThan(0);
    });

    // MCP-T06: 少量工具不显示展开
    it('MCP-T06: 工具数量 <= 5 时不显示展开按钮', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} server={fewToolsServer} />);
        // 不应该显示展开按钮
        expect(screen.queryByText('展开全部')).toBeNull();
        expect(screen.queryByText('+2')).toBeNull();
        // 所有工具都应该显示
        expect(screen.getByText('tool1')).toBeDefined();
        expect(screen.getByText('tool2')).toBeDefined();
        expect(screen.getByText('tool3')).toBeDefined();
    });
});

/**
 * MCPCard - 请求计数显示测试 (v2.2.0)
 * 对应测试用例: MCP-C01 ~ MCP-C05 (UI 显示部分)
 */
describe('MCPCard - 请求计数显示', () => {
    const mockServer = mockServers[0];
    const defaultCardProps = {
        server: mockServer,
        onConnect: vi.fn(),
        onDisconnect: vi.fn(),
        onConfigure: vi.fn(),
        onDelete: vi.fn(),
    };

    // MCP-C03: 计数显示
    it('MCP-C03: 正确显示请求计数', () => {
        const serverWithCount = { ...mockServer, requestCount: 1234 };
        renderWithI18n(<MCPCard {...defaultCardProps} server={serverWithCount} />);
        expect(screen.getByText(/请求: 1234/)).toBeDefined();
    });

    // MCP-C05: lastActiveAt 显示
    it('MCP-C05: 显示最近活动时间', () => {
        const serverWithActivity = {
            ...mockServer,
            lastActiveAt: new Date('2026-01-20T10:30:00'),
        };
        renderWithI18n(<MCPCard {...defaultCardProps} server={serverWithActivity} />);
        expect(screen.getByText(/最近活动:/)).toBeDefined();
    });

    it('无 lastActiveAt 时不显示最近活动', () => {
        const serverWithoutActivity = { ...mockServer, lastActiveAt: undefined };
        renderWithI18n(<MCPCard {...defaultCardProps} server={serverWithoutActivity} />);
        expect(screen.queryByText(/最近活动:/)).toBeNull();
    });
});

/**
 * MCPCard - 删除按钮禁用测试 (v2.6.0)
 * 对应测试用例: MCP-D05
 */
describe('MCPCard - 删除按钮状态', () => {
    const mockServer = mockServers[0];
    const defaultCardProps = {
        server: mockServer,
        onConnect: vi.fn(),
        onDisconnect: vi.fn(),
        onConfigure: vi.fn(),
        onDelete: vi.fn(),
    };

    // MCP-D05: 连接中的服务器删除按钮禁用
    it('MCP-D05: isLoading=true 时删除按钮禁用', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} isLoading={true} />);
        const deleteButton = screen.getByRole('button', { name: '删除服务器' });
        expect(deleteButton).toBeDisabled();
    });

    it('status=connecting 时删除按钮禁用', () => {
        const connectingServer = { ...mockServer, status: 'connecting' as const };
        renderWithI18n(<MCPCard {...defaultCardProps} server={connectingServer} />);
        const deleteButton = screen.getByRole('button', { name: '删除服务器' });
        expect(deleteButton).toBeDisabled();
    });

    it('正常状态下删除按钮可用', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} isLoading={false} />);
        const deleteButton = screen.getByRole('button', { name: '删除服务器' });
        expect(deleteButton).toBeEnabled();
    });
});

/**
 * MCPCard - 连接状态显示测试
 * 补充连接状态相关测试
 */
describe('MCPCard - 连接状态显示', () => {
    const mockServer = mockServers[0];
    const defaultCardProps = {
        server: mockServer,
        onConnect: vi.fn(),
        onDisconnect: vi.fn(),
        onConfigure: vi.fn(),
        onDelete: vi.fn(),
    };

    it('connecting 状态显示连接中', () => {
        const connectingServer = { ...mockServer, status: 'connecting' as const };
        renderWithI18n(<MCPCard {...defaultCardProps} server={connectingServer} />);
        // v3.5.0: "连接中" 可能出现多次（状态标签和按钮），使用 getAllByText
        expect(screen.getAllByText('连接中').length).toBeGreaterThanOrEqual(1);
    });

    it('isLoading=true 时显示连接中', () => {
        renderWithI18n(<MCPCard {...defaultCardProps} isLoading={true} />);
        // v3.5.0: "连接中" 可能出现多次（状态标签和按钮），使用 getAllByText
        expect(screen.getAllByText('连接中').length).toBeGreaterThanOrEqual(1);
    });

    it('disconnected 状态显示未连接', () => {
        const disconnectedServer = { ...mockServer, status: 'disconnected' as const };
        renderWithI18n(<MCPCard {...defaultCardProps} server={disconnectedServer} />);
        expect(screen.getByText('未连接')).toBeDefined();
    });

    it('连接中时连接按钮显示"连接中"', () => {
        const disconnectedServer = { ...mockServer, status: 'disconnected' as const };
        renderWithI18n(<MCPCard {...defaultCardProps} server={disconnectedServer} isLoading={true} />);
        // v3.5.0: 按钮文本改为 "连接中"（不带省略号），且可能出现多次
        expect(screen.getAllByText('连接中').length).toBeGreaterThanOrEqual(1);
    });
});
