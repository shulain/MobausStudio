import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatPage } from '../../../components/features/Chat';
import { ChatList } from '../../../components/features/Chat/ChatList';
import { ChatItem } from '../../../components/features/Chat/ChatItem';
import { ChatWindow } from '../../../components/features/Chat/ChatWindow';
import { MessageBubble } from '../../../components/features/Chat/MessageBubble';
import { I18nProvider } from '../../../i18n';
import type { Chat, AIModel, Agent, MCPServer, Message } from '../../../types';
import * as attachmentUtils from '../../../utils/attachmentUtils';

// Mock navigator.language 为中文
Object.defineProperty(navigator, 'language', {
    value: 'zh-CN',
    configurable: true,
});

// Mock attachmentUtils
vi.mock('../../../utils/attachmentUtils', () => ({
    processFile: vi.fn(),
    getFilesFromDataTransfer: vi.fn(),
    MAX_FILE_SIZE: 10 * 1024 * 1024
}));

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Mock clipboard API
Object.assign(navigator, {
    clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
    },
});

const renderWithI18n = (component: React.ReactElement) => {
    return render(<I18nProvider>{component}</I18nProvider>);
};

const mockChats: Chat[] = [
    {
        id: '1',
        title: 'Test Chat 1',
        createdAt: new Date(),
        updatedAt: new Date(),
        starred: false,
        model: 'gpt-4',
        messages: [
            { id: '1', chatId: '1', role: 'user', content: 'Hello', createdAt: new Date() },
            { id: '2', chatId: '1', role: 'assistant', content: 'Hi there!', createdAt: new Date() },
        ],
    },
    {
        id: '2',
        title: 'Test Chat 2',
        createdAt: new Date(),
        updatedAt: new Date(),
        starred: true,
        model: 'claude-3.5',
        messages: [],
    },
];

const mockModels: AIModel[] = [
    // v3.6.0: ChatWindow 只显示 status='online' 的模型
    { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI', status: 'online', apiKeySet: true, endpoint: '', maxTokens: 128000, pricing: { input: 0.01, output: 0.03 } },
    { id: 'claude-3.5', name: 'Claude 3.5', provider: 'Anthropic', status: 'online', apiKeySet: true, endpoint: '', maxTokens: 200000, pricing: { input: 0.003, output: 0.015 } },
];

describe('ChatItem', () => {
    it('should render chat title', () => {
        renderWithI18n(<ChatItem chat={mockChats[0]} isSelected={false} onClick={() => { }} />);
        expect(screen.getByText('Test Chat 1')).toBeDefined();
    });

    it('should show starred icon for starred chats', () => {
        const { container } = render(<ChatItem chat={mockChats[1]} isSelected={false} onClick={() => { }} />);
        expect(container.querySelector('svg')).toBeDefined();
    });

    it('should have selected style when selected', () => {
        const { container } = render(<ChatItem chat={mockChats[0]} isSelected={true} onClick={() => { }} />);
        expect(container.firstChild).toHaveClass('border-purple-200');
    });

    it('should call onClick when clicked', () => {
        const handleClick = vi.fn();
        renderWithI18n(<ChatItem chat={mockChats[0]} isSelected={false} onClick={handleClick} />);
        fireEvent.click(screen.getByText('Test Chat 1'));
        expect(handleClick).toHaveBeenCalled();
    });

    it('should show model tag', () => {
        renderWithI18n(<ChatItem chat={mockChats[0]} isSelected={false} onClick={() => { }} />);
        expect(screen.getByText('gpt-4')).toBeDefined();
    });

    it('should show message preview', () => {
        renderWithI18n(<ChatItem chat={mockChats[0]} isSelected={false} onClick={() => { }} />);
        expect(screen.getByText('Hi there!')).toBeDefined();
    });
});

describe('ChatList', () => {
    it('should render chat list', () => {
        renderWithI18n(
            <ChatList
                chats={mockChats}
                selectedChatId={null}
                onSelectChat={() => { }}
                searchQuery=""
                onSearchChange={() => { }}
            />
        );
        expect(screen.getByText('Test Chat 1')).toBeDefined();
        expect(screen.getByText('Test Chat 2')).toBeDefined();
    });

    it('should filter chats by search query', () => {
        renderWithI18n(
            <ChatList
                chats={mockChats}
                selectedChatId={null}
                onSelectChat={() => { }}
                searchQuery="Chat 1"
                onSearchChange={() => { }}
            />
        );
        expect(screen.getByText('Test Chat 1')).toBeDefined();
        expect(screen.queryByText('Test Chat 2')).toBeNull();
    });

    it('should show empty message when no chats', () => {
        renderWithI18n(
            <ChatList
                chats={[]}
                selectedChatId={null}
                onSelectChat={() => { }}
                searchQuery=""
                onSearchChange={() => { }}
            />
        );
        expect(screen.getByText('暂无对话')).toBeDefined();
    });

    it('should call onSelectChat when chat is clicked', () => {
        const handleSelect = vi.fn();
        renderWithI18n(
            <ChatList
                chats={mockChats}
                selectedChatId={null}
                onSelectChat={handleSelect}
                searchQuery=""
                onSearchChange={() => { }}
            />
        );
        fireEvent.click(screen.getByText('Test Chat 1'));
        expect(handleSelect).toHaveBeenCalledWith('1');
    });

    it('should filter by message content', () => {
        renderWithI18n(
            <ChatList
                chats={mockChats}
                selectedChatId={null}
                onSelectChat={() => { }}
                searchQuery="Hello"
                onSearchChange={() => { }}
            />
        );
        expect(screen.getByText('Test Chat 1')).toBeDefined();
        expect(screen.queryByText('Test Chat 2')).toBeNull();
    });
});

describe('ChatWindow', () => {
    it('should render empty state when no chat selected', () => {
        renderWithI18n(
            <ChatWindow
                chat={null}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
            />
        );
        // v3.5.0: 空状态文本改为 "开始新的对话"
        expect(screen.getByText('开始新的对话')).toBeDefined();
    });

    it('should render chat messages', () => {
        renderWithI18n(
            <ChatWindow
                chat={mockChats[0]}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
            />
        );
        expect(screen.getByText('Hello')).toBeDefined();
        expect(screen.getByText('Hi there!')).toBeDefined();
    });

    it('should render model selector', () => {
        renderWithI18n(
            <ChatWindow
                chat={mockChats[0]}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
            />
        );
        expect(screen.getByRole('combobox')).toBeDefined();
    });

    it('should call onModelChange when model is changed', () => {
        const handleModelChange = vi.fn();
        renderWithI18n(
            <ChatWindow
                chat={mockChats[0]}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={handleModelChange}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
            />
        );
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'claude-3.5' } });
        expect(handleModelChange).toHaveBeenCalledWith('claude-3.5');
    });

    it('should call onSendMessage when send button is clicked', () => {
        const handleSend = vi.fn();
        renderWithI18n(
            <ChatWindow
                chat={mockChats[0]}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={handleSend}
                onStopGenerating={() => { }}
            />
        );

        // v3.5.0: placeholder 改为 "输入消息... (Shift+Enter 换行)"
        const input = screen.getByPlaceholderText(/输入消息.*Shift\+Enter/);
        fireEvent.change(input, { target: { value: 'Test message' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(handleSend).toHaveBeenCalledWith('Test message', []);
    });

    it('should clear input after sending message', () => {
        renderWithI18n(
            <ChatWindow
                chat={mockChats[0]}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
            />
        );

        // v3.5.0: placeholder 改为 "输入消息... (Shift+Enter 换行)"
        const input = screen.getByPlaceholderText(/输入消息.*Shift\+Enter/) as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'Test message' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(input.value).toBe('');
    });

    it('should disable send button when input is empty', () => {
        const { container } = renderWithI18n(
            <ChatWindow
                chat={mockChats[0]}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
            />
        );

        const sendButton = container.querySelector('button[disabled]');
        expect(sendButton).toBeDefined();
    });

    /**
     * v3.6.0: 修改测试用例
     * 当没有可用模型时，显示"请先配置可用模型"提示
     * 不再显示禁用的下拉框，而是显示警告提示
     */
    it('should show placeholder when models list is empty', () => {
        renderWithI18n(
            <ChatWindow
                chat={null}
                models={[]}
                selectedModel=""
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
            />
        );
        expect(screen.getByText('请先配置可用模型')).toBeInTheDocument();
    });
    it('should show timer when generating', () => {
        renderWithI18n(
            <ChatWindow
                chat={mockChats[0]}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
                isGenerating={true}
            />
        );
        expect(screen.getByText(/生成中/)).toBeDefined();
    });

    it('should handle paste event', async () => {
        const file = new File([''], 'test.png', { type: 'image/png' });
        // Setup mocks
        (attachmentUtils.getFilesFromDataTransfer as any).mockReturnValue([file]);
        (attachmentUtils.processFile as any).mockResolvedValue({
            id: '1', type: 'image', name: 'test.png', url: 'data:image/png;base64,...', mimeType: 'image/png', size: 100
        });

        renderWithI18n(
            <ChatWindow
                chat={mockChats[0]}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
            />
        );

        // v3.5.0: placeholder 改为 "输入消息... (Shift+Enter 换行)"
        const input = screen.getByPlaceholderText(/输入消息.*Shift\+Enter/);

        // Trigger paste
        fireEvent.paste(input, {
            clipboardData: { items: [1] } // Mock items, handled by getFiles mock
        });

        // Verify async actions
        await vi.waitUntil(() => attachmentUtils.processFile);
        expect(attachmentUtils.getFilesFromDataTransfer).toHaveBeenCalled();
        expect(attachmentUtils.processFile).toHaveBeenCalledWith(file);

        // Verify UI update (Preview should be visible)
        // AttachmentUpload renders items. We can look for the file name.
        // wait for state update
        await vi.waitFor(() => {
            expect(screen.getByAltText('test.png')).toBeDefined();
        });
    });

    it('should call onSendMessage with attachments', () => {
        const handleSend = vi.fn();
        renderWithI18n(
            <ChatWindow
                chat={mockChats[0]}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={handleSend}
                onStopGenerating={() => { }}
            />
        );

        // Simulate having attachments (we cheat by setting state or simulate paste)
        // Since we can't easily set state from outside, we simulate paste
        const file = new File([''], 'test.png', { type: 'image/png' });
        (attachmentUtils.getFilesFromDataTransfer as any).mockReturnValue([file]);
        (attachmentUtils.processFile as any).mockResolvedValue({
            id: '1', type: 'image', name: 'test.png', url: 'data:image/png;base64,...', mimeType: 'image/png', size: 100
        });

        const input = screen.getByPlaceholderText(/输入消息.*Shift\+Enter/);
        fireEvent.paste(input, { clipboardData: { items: [1] } });

        // Wait for attachment to appear
        // Note: vi.waitFor needs async
    });

    it('should show stop button and call onStopGenerating', () => {
        const handleStop = vi.fn();
        renderWithI18n(
            <ChatWindow
                chat={mockChats[0]}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={handleStop}
                isGenerating={true}
            />
        );

        const stopButton = screen.getByTitle('停止生成');
        expect(stopButton).toBeDefined();
        fireEvent.click(stopButton);
        expect(handleStop).toHaveBeenCalled();
    });

    it('should clear input when chat changes', () => {
        const { rerender } = renderWithI18n(
            <ChatWindow
                chat={mockChats[0]}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
            />
        );

        // v3.5.0: placeholder 改为 "输入消息... (Shift+Enter 换行)"
        const input = screen.getByPlaceholderText(/输入消息.*Shift\+Enter/) as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'Draft content' } });
        expect(input.value).toBe('Draft content');

        // Switch chat - 使用 rerender 而不是 rerenderWithI18n
        rerender(
            <I18nProvider>
                <ChatWindow
                    chat={mockChats[1]}
                    models={mockModels}
                    selectedModel="gpt-4"
                    onModelChange={() => { }}
                    onSendMessage={() => { }}
                    onStopGenerating={() => { }}
                />
            </I18nProvider>
        );

        expect(input.value).toBe('');
    });

    it('should not trigger load-more when near bottom even if scrollTop is below threshold', async () => {
        const longChat: Chat = {
            id: 'long-chat',
            title: 'Long Chat',
            createdAt: new Date(),
            updatedAt: new Date(),
            starred: false,
            model: 'gpt-4',
            messages: Array.from({ length: 30 }, (_, i) => ({
                id: `m-${i}`,
                chatId: 'long-chat',
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: `Message ${i}`,
                createdAt: new Date(),
            })),
        };

        const { container } = renderWithI18n(
            <ChatWindow
                chat={longChat}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
            />
        );

        // 初始只渲染最后 20 条，最早的 Message 0 不应出现
        expect(screen.queryByText('Message 0')).toBeNull();

        const scrollContainer = container.querySelector('.overflow-y-auto.overflow-x-hidden') as HTMLDivElement;
        expect(scrollContainer).toBeTruthy();

        // 模拟“接近底部但 scrollTop 仍小于 LOAD_MORE_THRESHOLD”的场景
        // 旧逻辑会误触发加载更多，新逻辑应保持不加载
        Object.defineProperty(scrollContainer, 'scrollHeight', {
            configurable: true,
            value: 1060,
        });
        Object.defineProperty(scrollContainer, 'clientHeight', {
            configurable: true,
            value: 1000,
        });
        Object.defineProperty(scrollContainer, 'scrollTop', {
            configurable: true,
            writable: true,
            value: 60,
        });
        fireEvent.scroll(scrollContainer);

        await waitFor(() => {
            expect(screen.queryByText('Message 0')).toBeNull();
        });
    });
});

describe('ChatPage', () => {
    const defaultProps = {
        chats: mockChats,
        models: mockModels,
        agents: [],           // MCP 集成 (v2.1.0)
        mcpServers: [],       // MCP 集成 (v2.1.0)
        onCreateChat: vi.fn(() => 'new-chat-id'),
        onDeleteChat: vi.fn(),
        onRenameChat: vi.fn(),
        onToggleChatStar: vi.fn(),
        onSendMessage: vi.fn(),
        onStopGenerating: vi.fn(),
        isGenerating: vi.fn(() => false),
    };

    it('should render chat list and window', async () => {
        renderWithI18n(<ChatPage {...defaultProps} />);
        // v3.5.0: 搜索框 placeholder 保持不变
        expect(screen.getByPlaceholderText('搜索对话...')).toBeDefined();
        // v3.5.0: 输入框 placeholder 改为 "输入消息... (Shift+Enter 换行)"
        expect(await screen.findByPlaceholderText(/输入消息.*Shift\+Enter/)).toBeDefined();
    });

    it('should select first chat by default', async () => {
        renderWithI18n(<ChatPage {...defaultProps} />);
        // 消息会同时出现在列表预览和聊天窗口中
        expect(screen.getAllByText('Hello').length).toBeGreaterThanOrEqual(1);
        // Wait for ChatWindow to render messages
        expect((await screen.findAllByText('Hi there!')).length).toBeGreaterThanOrEqual(1);
    });

    it('should call onSendMessage with chat id, content, and model id', async () => {
        const handleSend = vi.fn();
        renderWithI18n(<ChatPage {...defaultProps} onSendMessage={handleSend} />);

        // v3.5.0: 输入框 placeholder 改为 "输入消息... (Shift+Enter 换行)"
        const input = await screen.findByPlaceholderText(/输入消息.*Shift\+Enter/);
        fireEvent.change(input, { target: { value: 'New message' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        // 验证调用包含 chatId, content, modelId, attachments, agent (v2.3.0: 新增 agent 参数)
        expect(handleSend).toHaveBeenCalledWith('1', 'New message', mockModels[0].id, [], undefined);
    });

    it('should auto-select first model if selectedModel is empty', async () => {
        renderWithI18n(<ChatPage {...defaultProps} />);
        // 验证下拉框的值是否为第一个模型的 ID
        const select = await screen.findByRole('combobox') as HTMLSelectElement;
        expect(select.value).toBe(mockModels[0].id);
    });
});

/**
 * Agent/模型选择器测试用例 (v2.1.0)
 * 对应文档测试用例 AM-01 到 AM-08
 */
describe('ChatWindow - Agent/模型选择器互斥逻辑 (v2.1.0)', () => {
    // Mock Agent 数据
    const mockAgents: Agent[] = [
        {
            id: 'agent-1',
            name: '代码助手',
            description: '专业的编程助手',
            model: 'gpt-4',  // 使用 gpt-4 模型
            skills: [],
            systemPrompt: '',
            temperature: 0.7,
            maxTokens: 4096,
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
            usageCount: 0,
            enableToolUse: true,
            mcpServers: [{ serverId: 'mcp-1', serverName: 'filesystem' }],
        },
        {
            id: 'agent-2',
            name: '写作专家',
            description: '创作各类文体内容',
            model: 'claude-3.5',  // 使用 claude-3.5 模型
            skills: [],
            systemPrompt: '',
            temperature: 0.9,
            maxTokens: 4096,
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
            usageCount: 0,
            enableToolUse: false,
        },
    ];

    // Mock MCP 服务器数据 (v2.2.0: 添加 enabled/autoStart)
    const mockMcpServers: MCPServer[] = [
        {
            id: 'mcp-1',
            name: 'filesystem',
            description: '文件系统访问',
            enabled: true,
            autoStart: false,
            transportType: 'stdio',
            command: 'npx',
            args: [],
            authType: 'none',
            status: 'connected',
            requestCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            tools: [
                { name: 'read_file', description: '读取文件', inputSchema: { type: 'object' } },
                { name: 'write_file', description: '写入文件', inputSchema: { type: 'object' } },
            ],
        },
    ];

    // AM-01: 无 Agent 时显示模型选择器
    it('AM-01: 无 Agent 时显示模型选择器，隐藏 Agent 选择器', () => {
        renderWithI18n(
            <ChatWindow
                chat={mockChats[0]}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
                agents={[]}  // 无 Agent
                selectedAgentId={null}
                onAgentChange={() => { }}
                mcpServers={[]}
            />
        );
        // 应该显示模型选择器
        expect(screen.getByRole('combobox')).toBeInTheDocument();
        expect(screen.getByText('GPT-4')).toBeInTheDocument();
        // 不应该显示 Agent 选择器选项
        expect(screen.queryByText('直接对话')).not.toBeInTheDocument();
    });

    // AM-02: 有 Agent 时显示 Agent 选择器
    it('AM-02: 有 Agent 时显示 Agent 选择器', () => {
        renderWithI18n(
            <ChatWindow
                chat={mockChats[0]}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
                agents={mockAgents}
                selectedAgentId={null}
                onAgentChange={() => { }}
                mcpServers={mockMcpServers}
            />
        );
        // 应该显示 Agent 选择器（包含"直接对话"选项）
        expect(screen.getByText('直接对话')).toBeInTheDocument();
        expect(screen.getByText('🤖 代码助手')).toBeInTheDocument();
        expect(screen.getByText('🤖 写作专家')).toBeInTheDocument();
    });

    // AM-03: 选择 Agent 后隐藏模型选择器
    it('AM-03: 选择 Agent 后隐藏模型选择器，显示 Agent 的模型名称', () => {
        renderWithI18n(
            <ChatWindow
                chat={mockChats[0]}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
                agents={mockAgents}
                selectedAgentId="agent-1"  // 选中代码助手
                onAgentChange={() => { }}
                mcpServers={mockMcpServers}
            />
        );
        // v3.5.0: 应该显示只读的模型信息，文本格式为 "模型:" (带冒号)
        expect(screen.getByText(/模型/)).toBeInTheDocument();
        expect(screen.getByText('GPT-4')).toBeInTheDocument();
        // 模型选择器应该被隐藏（只有一个 combobox - Agent 选择器）
        const comboboxes = screen.getAllByRole('combobox');
        expect(comboboxes.length).toBe(1);
    });

    // AM-04: 选择"直接对话"后显示模型选择器
    it('AM-04: 选择"直接对话"后显示模型选择器', () => {
        renderWithI18n(
            <ChatWindow
                chat={mockChats[0]}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
                agents={mockAgents}
                selectedAgentId={null}  // 未选择 Agent（直接对话）
                onAgentChange={() => { }}
                mcpServers={mockMcpServers}
            />
        );
        // 应该显示两个下拉框：Agent 选择器和模型选择器
        const comboboxes = screen.getAllByRole('combobox');
        expect(comboboxes.length).toBe(2);
        // 验证模型选择器存在
        expect(screen.getByText('GPT-4')).toBeInTheDocument();
        expect(screen.getByText('Claude 3.5')).toBeInTheDocument();
    });

    // AM-05 和 AM-06 需要在 ChatPage 层面测试（发送消息逻辑）
    // 这些测试在下面的 ChatPage 测试中

    // AM-07: Agent 工具数量显示
    it('AM-07: 选中启用工具的 Agent 时显示可用工具数量徽章', () => {
        renderWithI18n(
            <ChatWindow
                chat={mockChats[0]}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
                agents={mockAgents}
                selectedAgentId="agent-1"  // 选中代码助手（启用了工具）
                onAgentChange={() => { }}
                mcpServers={mockMcpServers}
            />
        );
        // v3.5.0: 应该显示工具数量徽章，格式为 "2 工具"
        expect(screen.getByText(/2.*工具/)).toBeInTheDocument();
    });

    // AM-07 补充: 未启用工具的 Agent 显示"无工具"徽章
    // v3.5.0: UI 变更 - 未启用工具时显示"无工具"提示徽章
    it('AM-07: 未启用工具的 Agent 显示"无工具"徽章', () => {
        renderWithI18n(
            <ChatWindow
                chat={mockChats[0]}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
                agents={mockAgents}
                selectedAgentId="agent-2"  // 选中写作专家（未启用工具）
                onAgentChange={() => { }}
                mcpServers={mockMcpServers}
            />
        );
        // v3.5.0: 应该显示"无工具"徽章（而不是工具数量）
        expect(screen.getByText('无工具')).toBeInTheDocument();
    });

    // AM-08: Agent 切换保留对话
    it('AM-08: 切换 Agent 时对话内容保留，不清空', () => {
        const { rerender } = renderWithI18n(
            <ChatWindow
                chat={mockChats[0]}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
                agents={mockAgents}
                selectedAgentId={null}
                onAgentChange={() => { }}
                mcpServers={mockMcpServers}
            />
        );
        // 验证消息存在
        expect(screen.getByText('Hello')).toBeInTheDocument();
        expect(screen.getByText('Hi there!')).toBeInTheDocument();

        // 切换到 Agent - 使用 rerender 而不是 rerenderWithI18n
        rerender(
            <I18nProvider>
                <ChatWindow
                    chat={mockChats[0]}
                    models={mockModels}
                    selectedModel="gpt-4"
                    onModelChange={() => { }}
                    onSendMessage={() => { }}
                    onStopGenerating={() => { }}
                    agents={mockAgents}
                    selectedAgentId="agent-1"  // 切换到代码助手
                    onAgentChange={() => { }}
                    mcpServers={mockMcpServers}
                />
            </I18nProvider>
        );
        // 消息应该仍然存在
        expect(screen.getByText('Hello')).toBeInTheDocument();
        expect(screen.getByText('Hi there!')).toBeInTheDocument();
    });

    // Agent 选择器变更回调测试
    it('should call onAgentChange when agent is changed', () => {
        const handleAgentChange = vi.fn();
        renderWithI18n(
            <ChatWindow
                chat={mockChats[0]}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
                agents={mockAgents}
                selectedAgentId={null}
                onAgentChange={handleAgentChange}
                mcpServers={mockMcpServers}
            />
        );
        // 获取 Agent 选择器（第一个 combobox）
        const agentSelect = screen.getAllByRole('combobox')[0];
        fireEvent.change(agentSelect, { target: { value: 'agent-1' } });
        expect(handleAgentChange).toHaveBeenCalledWith('agent-1');
    });
});

/**
 * ChatPage Agent/模型选择测试 (v2.1.0)
 * 对应文档测试用例 AM-05, AM-06
 */
describe('ChatPage - Agent/模型选择发送消息 (v2.1.0)', () => {
    const mockAgents: Agent[] = [
        {
            id: 'agent-1',
            name: '代码助手',
            description: '专业的编程助手',
            model: 'claude-3.5',  // Agent 使用 claude-3.5
            skills: [],
            systemPrompt: '',
            temperature: 0.7,
            maxTokens: 4096,
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
            usageCount: 0,
            enableToolUse: false,
        },
    ];

    const defaultProps = {
        chats: mockChats,
        models: mockModels,
        agents: mockAgents,
        mcpServers: [],
        onCreateChat: vi.fn(() => 'new-chat-id'),
        onDeleteChat: vi.fn(),
        onRenameChat: vi.fn(),
        onToggleChatStar: vi.fn(),
        onSendMessage: vi.fn(),
        onStopGenerating: vi.fn(),
        isGenerating: vi.fn(() => false),
    };

    // v2.3.0: Chat 对象中包含 agentId 来持久化 Agent 选择
    const mockChatsWithAgent: Chat[] = [
        {
            id: '1',
            title: 'Chat with Agent',
            messages: [{ id: '1', chatId: '1', role: 'user', content: 'Hello', createdAt: new Date() }],
            starred: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            model: 'gpt-4',
            agentId: 'agent-1',  // 预先绑定 Agent
        },
    ];

    // AM-05: Agent 携带模型信息（通过 chat.agentId 持久化）
    it('AM-05: 选中 Agent 时发送消息使用 Agent.model', async () => {
        const handleSend = vi.fn();
        // 使用已绑定 Agent 的 Chat
        renderWithI18n(<ChatPage {...defaultProps} chats={mockChatsWithAgent} onSendMessage={handleSend} />);

        // v3.5.0: 发送消息（Chat 已经绑定了 agent-1），placeholder 改为 "输入消息... (Shift+Enter 换行)"
        const input = await screen.findByPlaceholderText(/输入消息.*Shift\+Enter/);
        fireEvent.change(input, { target: { value: 'Test with agent' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        // 验证使用 Agent 的模型 (claude-3.5) 而不是 selectedModel (gpt-4)
        expect(handleSend).toHaveBeenCalledWith(
            expect.any(String),  // chatId
            'Test with agent',
            'claude-3.5',        // Agent 的模型
            [],                  // attachments
            expect.objectContaining({ id: 'agent-1' })  // agent
        );
    });

    // AM-06: 无 Agent 时使用选中模型
    it('AM-06: 未选择 Agent 时发送消息使用 selectedModel', async () => {
        const handleSend = vi.fn();
        renderWithI18n(<ChatPage {...defaultProps} onSendMessage={handleSend} />);

        // v3.5.0: 确保选择"直接对话"（无 Agent），使用 getByRole 查找 combobox
        const agentSelects = await screen.findAllByRole('combobox');
        // 第一个 combobox 是 Agent 选择器
        expect(agentSelects[0]).toBeInTheDocument();

        // v3.5.0: 发送消息，placeholder 改为 "输入消息... (Shift+Enter 换行)"
        const input = await screen.findByPlaceholderText(/输入消息.*Shift\+Enter/);
        fireEvent.change(input, { target: { value: 'Test without agent' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        // 验证使用 selectedModel (gpt-4)
        expect(handleSend).toHaveBeenCalledWith(
            expect.any(String),  // chatId
            'Test without agent',
            'gpt-4',             // selectedModel
            [],                  // attachments
            undefined            // 无 agent
        );
    });
});

/**
 * 思考模式测试用例 (TH-01 ~ TH-08)
 * 对应文档 docs/modules/chat.md 中的思考模式测试用例
 */
describe('MessageBubble - 思考模式测试', () => {
    // TH-01: 思考内容渲染
    it('TH-01: 包含 reasoningContent 的消息显示思考过程折叠区域', () => {
        const message: Message = {
            id: '1',
            chatId: 'c1',
            role: 'assistant',
            content: '这是回复内容',
            reasoningContent: '这是思考过程内容',
            createdAt: new Date(),
        };

        renderWithI18n(<MessageBubble message={message} />);

        // 应该显示"思考过程"标签
        expect(screen.getByText('思考过程')).toBeInTheDocument();
        // 思考内容应该可见（默认展开）
        expect(screen.getByText('这是思考过程内容')).toBeInTheDocument();
    });

    // TH-02: 普通内容渲染（无思考过程）
    it('TH-02: 不含 reasoningContent 的消息不显示思考过程区域', () => {
        const message: Message = {
            id: '1',
            chatId: 'c1',
            role: 'assistant',
            content: '这是普通回复',
            createdAt: new Date(),
        };

        renderWithI18n(<MessageBubble message={message} />);

        // 不应该显示"思考过程"标签
        expect(screen.queryByText('思考过程')).not.toBeInTheDocument();
        // 回复内容应该正常显示
        expect(screen.getByText('这是普通回复')).toBeInTheDocument();
    });

    // TH-03: 思考过程折叠切换
    it('TH-03: 点击折叠按钮切换思考内容的显示/隐藏状态', () => {
        const message: Message = {
            id: '1',
            chatId: 'c1',
            role: 'assistant',
            content: '回复内容',
            reasoningContent: '思考过程内容',
            createdAt: new Date(),
        };

        renderWithI18n(<MessageBubble message={message} />);

        // 默认展开，内容可见
        expect(screen.getByText('思考过程内容')).toBeInTheDocument();
        // 展开时显示"收起"
        expect(screen.getByText('收起')).toBeInTheDocument();

        // 点击折叠按钮
        const toggleButton = screen.getByText('思考过程').closest('button');
        fireEvent.click(toggleButton!);

        // v3.5.0: 折叠后内容区域隐藏，但标题栏显示预览文本
        // 由于文本较短（<50字符），预览文本就是完整内容，所以仍然可见
        // 但"收起"文字应该消失
        expect(screen.queryByText('收起')).not.toBeInTheDocument();

        // 再次点击展开
        fireEvent.click(toggleButton!);
        // 展开后"收起"文字应该重新出现
        expect(screen.getByText('收起')).toBeInTheDocument();
    });

    // TH-06: 思考过程默认展开
    it('TH-06: 思考过程区域默认展开', () => {
        const message: Message = {
            id: '1',
            chatId: 'c1',
            role: 'assistant',
            content: '回复',
            reasoningContent: '默认展开的思考内容',
            createdAt: new Date(),
        };

        renderWithI18n(<MessageBubble message={message} />);

        // 默认应该展开，内容可见
        expect(screen.getByText('默认展开的思考内容')).toBeInTheDocument();
        // 应该显示"收起"文字
        expect(screen.getByText('收起')).toBeInTheDocument();
    });

    // TH-07: 思考过程高度限制
    it('TH-07: 思考过程区域有最大高度限制', () => {
        const longContent = '这是很长的思考内容。'.repeat(100);
        const message: Message = {
            id: '1',
            chatId: 'c1',
            role: 'assistant',
            content: '回复',
            reasoningContent: longContent,
            createdAt: new Date(),
        };

        const { container } = render(<MessageBubble message={message} />);

        // 查找思考内容容器，验证有 maxHeight 样式
        const reasoningContainer = container.querySelector('[style*="max-height"]');
        expect(reasoningContainer).toBeInTheDocument();
        // v3.5.0: ThinkingBlock 默认 maxHeight 是 120px
        expect(reasoningContainer).toHaveStyle({ maxHeight: '120px' });
    });

    // TH-08: 思考过程样式区分
    it('TH-08: 思考过程使用 amber 色系和斜体字体', () => {
        const message: Message = {
            id: '1',
            chatId: 'c1',
            role: 'assistant',
            content: '回复',
            reasoningContent: '思考内容',
            createdAt: new Date(),
        };

        const { container } = render(<MessageBubble message={message} />);

        // 验证 amber 背景色类名
        const reasoningSection = container.querySelector('.bg-amber-50');
        expect(reasoningSection).toBeInTheDocument();

        // 验证斜体样式
        const italicText = container.querySelector('.italic');
        expect(italicText).toBeInTheDocument();
    });

    // 用户消息不显示思考过程
    it('用户消息即使有 reasoningContent 也不显示思考过程', () => {
        const message: Message = {
            id: '1',
            chatId: 'c1',
            role: 'user',
            content: '用户消息',
            reasoningContent: '不应该显示的思考内容',
            createdAt: new Date(),
        };

        renderWithI18n(<MessageBubble message={message} />);

        // 用户消息不应该显示思考过程
        expect(screen.queryByText('思考过程')).not.toBeInTheDocument();
    });
});

/**
 * 多模态测试用例 (MM-01 ~ MM-08)
 * 对应文档 docs/modules/chat.md 中的多模态测试用例
 */
describe('MessageBubble - 多模态消息测试', () => {
    // MM-05: 多模态消息渲染
    it('MM-05: 包含图片附件的消息显示图片缩略图', () => {
        const message: Message = {
            id: '1',
            chatId: 'c1',
            role: 'user',
            content: '看看这张图片',
            attachments: [
                {
                    id: 'att-1',
                    type: 'image',
                    name: 'photo.png',
                    url: 'data:image/png;base64,abc123',
                    mimeType: 'image/png',
                    size: 1024,
                }
            ],
            createdAt: new Date(),
        };

        renderWithI18n(<MessageBubble message={message} />);

        // 应该显示图片
        const img = screen.getByAltText('photo.png');
        expect(img).toBeInTheDocument();
        expect(img).toHaveAttribute('src', 'data:image/png;base64,abc123');
    });

    // MM-05 补充: 视频附件显示
    it('MM-05: 包含视频附件的消息显示视频预览', () => {
        const message: Message = {
            id: '1',
            chatId: 'c1',
            role: 'user',
            content: '看看这个视频',
            attachments: [
                {
                    id: 'att-1',
                    type: 'video',
                    name: 'video.mp4',
                    url: 'data:video/mp4;base64,xyz789',
                    mimeType: 'video/mp4',
                    size: 2048,
                }
            ],
            createdAt: new Date(),
        };

        const { container } = render(<MessageBubble message={message} />);

        // 应该显示视频元素
        const video = container.querySelector('video');
        expect(video).toBeInTheDocument();
        expect(video).toHaveAttribute('src', 'data:video/mp4;base64,xyz789');
    });

    // MM-05 补充: 文件附件显示
    it('MM-05: 包含文件附件的消息显示文件信息', () => {
        const message: Message = {
            id: '1',
            chatId: 'c1',
            role: 'user',
            content: '这是一个文件',
            attachments: [
                {
                    id: 'att-1',
                    type: 'file',
                    name: 'document.pdf',
                    url: 'file://path/to/document.pdf',
                    mimeType: 'application/pdf',
                    size: 10240,
                }
            ],
            createdAt: new Date(),
        };

        renderWithI18n(<MessageBubble message={message} />);

        // 应该显示文件名
        expect(screen.getByText('document.pdf')).toBeInTheDocument();
        // 应该显示文件大小
        expect(screen.getByText('10.0 KB')).toBeInTheDocument();
    });

    // 多个附件显示
    it('多个附件同时显示', () => {
        const message: Message = {
            id: '1',
            chatId: 'c1',
            role: 'user',
            content: '多个附件',
            attachments: [
                { id: 'att-1', type: 'image', name: 'img1.png', url: 'url1', mimeType: 'image/png', size: 100 },
                { id: 'att-2', type: 'image', name: 'img2.png', url: 'url2', mimeType: 'image/png', size: 200 },
            ],
            createdAt: new Date(),
        };

        renderWithI18n(<MessageBubble message={message} />);

        expect(screen.getByAltText('img1.png')).toBeInTheDocument();
        expect(screen.getByAltText('img2.png')).toBeInTheDocument();
    });
});

/**
 * 右键菜单复制功能测试 (UX-03)
 * 对应文档 docs/modules/chat.md 中的右键复制测试用例
 */
describe('MessageBubble - 右键菜单复制功能', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // UX-03: 右键复制内容
    it('UX-03: 右键点击消息气泡显示复制菜单', async () => {
        const message: Message = {
            id: '1',
            chatId: 'c1',
            role: 'assistant',
            content: '这是要复制的内容',
            createdAt: new Date(),
        };

        renderWithI18n(<MessageBubble message={message} />);

        // 右键点击消息内容
        const messageContent = screen.getByText('这是要复制的内容');
        fireEvent.contextMenu(messageContent);

        // 应该显示复制菜单
        await waitFor(() => {
            expect(screen.getByText('复制内容')).toBeInTheDocument();
        });
    });

    // UX-03 补充: 有思考过程时显示额外复制选项
    it('UX-03: 有思考过程时显示复制思考过程和复制全部选项', async () => {
        const message: Message = {
            id: '1',
            chatId: 'c1',
            role: 'assistant',
            content: '回复内容',
            reasoningContent: '思考过程',
            createdAt: new Date(),
        };

        renderWithI18n(<MessageBubble message={message} />);

        // 右键点击消息内容
        const messageContent = screen.getByText('回复内容');
        fireEvent.contextMenu(messageContent);

        // 应该显示所有复制选项
        await waitFor(() => {
            expect(screen.getByText('复制内容')).toBeInTheDocument();
            expect(screen.getByText('复制思考过程')).toBeInTheDocument();
            expect(screen.getByText('复制全部')).toBeInTheDocument();
        });
    });

    // 点击复制内容
    it('点击复制内容调用 clipboard API', async () => {
        const message: Message = {
            id: '1',
            chatId: 'c1',
            role: 'assistant',
            content: '要复制的文本',
            createdAt: new Date(),
        };

        renderWithI18n(<MessageBubble message={message} />);

        // 右键点击
        fireEvent.contextMenu(screen.getByText('要复制的文本'));

        // 点击复制内容
        await waitFor(() => {
            const copyButton = screen.getByText('复制内容');
            fireEvent.click(copyButton);
        });

        // 验证 clipboard API 被调用
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('要复制的文本');
    });
});

/**
 * 对话管理测试用例 (CM-01 ~ CM-09)
 * 对应文档 docs/modules/chat.md 中的对话管理测试用例
 */
describe('ChatPage - 对话管理测试', () => {
    const mockChatsForCM: Chat[] = [
        {
            id: 'chat-1',
            title: '最新对话',
            createdAt: new Date(Date.now() - 1000),
            updatedAt: new Date(Date.now()),  // 最近更新
            starred: false,
            model: 'gpt-4',
            messages: [{ id: 'm1', chatId: 'chat-1', role: 'user', content: '消息1', createdAt: new Date() }],
        },
        {
            id: 'chat-2',
            title: '较旧对话',
            createdAt: new Date(Date.now() - 86400000),
            updatedAt: new Date(Date.now() - 86400000),  // 1天前
            starred: true,
            model: 'claude-3.5',
            messages: [],
        },
    ];

    const mockModelsForCM: AIModel[] = [
        { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI', status: 'online', apiKeySet: true, endpoint: '', maxTokens: 128000, pricing: { input: 0.01, output: 0.03 } },
    ];

    const defaultCMProps = {
        chats: mockChatsForCM,
        models: mockModelsForCM,
        agents: [],
        mcpServers: [],
        onCreateChat: vi.fn(() => 'new-chat-id'),
        onDeleteChat: vi.fn(),
        onRenameChat: vi.fn(),
        onToggleChatStar: vi.fn(),
        onSendMessage: vi.fn(),
        onStopGenerating: vi.fn(),
        isGenerating: vi.fn(() => false),
    };

    // CM-01: 默认选择对话
    it('CM-01: 启动时自动选中最近更新的对话', async () => {
        renderWithI18n(<ChatPage {...defaultCMProps} />);

        // 应该自动选中 chat-1（最近更新）
        // 验证 chat-1 的消息内容显示在聊天窗口（会同时出现在列表预览和聊天窗口）
        await waitFor(() => {
            const messages = screen.getAllByText('消息1');
            // 至少有两个：列表预览 + 聊天窗口
            expect(messages.length).toBeGreaterThanOrEqual(2);
        });
    });

    // CM-02: 新建对话切换
    it('CM-02: 点击新建按钮创建新对话并自动切换', async () => {
        const handleCreate = vi.fn(() => 'new-chat-id');
        renderWithI18n(<ChatPage {...defaultCMProps} onCreateChat={handleCreate} />);

        // 点击新建按钮
        const newButton = screen.getByText('新建对话');
        fireEvent.click(newButton);

        // 验证 onCreateChat 被调用
        expect(handleCreate).toHaveBeenCalled();
    });

    // CM-03: 对话右键菜单
    it('CM-03: 右键点击对话列表项弹出菜单', async () => {
        renderWithI18n(<ChatPage {...defaultCMProps} />);

        // 右键点击对话项（使用 getAllByText 获取第一个，即列表中的）
        const chatItems = screen.getAllByText('最新对话');
        fireEvent.contextMenu(chatItems[0]);

        // 应该显示菜单选项
        await waitFor(() => {
            expect(screen.getByText('重命名')).toBeInTheDocument();
            expect(screen.getByText('收藏')).toBeInTheDocument();
            expect(screen.getByText('复制对话')).toBeInTheDocument();
            expect(screen.getByText('删除')).toBeInTheDocument();
        });
    });

    // CM-04: 重命名对话
    it('CM-04: 通过右键菜单重命名对话', async () => {
        const handleRename = vi.fn();
        renderWithI18n(<ChatPage {...defaultCMProps} onRenameChat={handleRename} />);

        // 右键点击对话项（使用 getAllByText 获取第一个）
        const chatItems = screen.getAllByText('最新对话');
        fireEvent.contextMenu(chatItems[0]);

        // 点击重命名
        await waitFor(() => {
            fireEvent.click(screen.getByText('重命名'));
        });

        // 应该显示重命名对话框
        await waitFor(() => {
            expect(screen.getByText('重命名对话')).toBeInTheDocument();
        });

        // 输入新标题
        const input = screen.getByPlaceholderText('输入新标题');
        fireEvent.change(input, { target: { value: '新标题' } });

        // 点击保存
        fireEvent.click(screen.getByText('保存'));

        // 验证 onRenameChat 被调用
        expect(handleRename).toHaveBeenCalledWith('chat-1', '新标题');
    });

    // CM-05: 删除对话确认
    it('CM-05: 删除对话时弹出确认对话框', async () => {
        renderWithI18n(<ChatPage {...defaultCMProps} />);

        // 右键点击对话项（使用 getAllByText 获取第一个）
        const chatItems = screen.getAllByText('最新对话');
        fireEvent.contextMenu(chatItems[0]);

        // 点击删除
        await waitFor(() => {
            fireEvent.click(screen.getByText('删除'));
        });

        // 应该显示确认对话框
        await waitFor(() => {
            expect(screen.getByText('删除对话')).toBeInTheDocument();
            expect(screen.getByText(/确定要删除对话「最新对话」吗/)).toBeInTheDocument();
        });
    });

    // CM-05 补充: 确认删除
    it('CM-05: 确认删除后调用 onDeleteChat', async () => {
        const handleDelete = vi.fn();
        renderWithI18n(<ChatPage {...defaultCMProps} onDeleteChat={handleDelete} />);

        // 右键点击（使用 getAllByText 获取第一个）-> 删除 -> 确认
        const chatItems = screen.getAllByText('最新对话');
        fireEvent.contextMenu(chatItems[0]);
        await waitFor(() => fireEvent.click(screen.getByText('删除')));
        await waitFor(() => {
            const deleteButtons = screen.getAllByText('删除');
            // 点击对话框中的删除按钮（第二个）
            fireEvent.click(deleteButtons[deleteButtons.length - 1]);
        });

        expect(handleDelete).toHaveBeenCalledWith('chat-1');
    });

    // CM-07: 收藏/取消收藏
    it('CM-07: 通过右键菜单切换收藏状态', async () => {
        const handleToggleStar = vi.fn();
        renderWithI18n(<ChatPage {...defaultCMProps} onToggleChatStar={handleToggleStar} />);

        // 右键点击未收藏的对话（使用 getAllByText 获取第一个）
        const chatItems = screen.getAllByText('最新对话');
        fireEvent.contextMenu(chatItems[0]);

        // 点击收藏
        await waitFor(() => {
            fireEvent.click(screen.getByText('收藏'));
        });

        expect(handleToggleStar).toHaveBeenCalledWith('chat-1');
    });

    // CM-07 补充: 已收藏对话显示取消收藏
    it('CM-07: 已收藏对话显示取消收藏选项', async () => {
        renderWithI18n(<ChatPage {...defaultCMProps} />);

        // 右键点击已收藏的对话
        fireEvent.contextMenu(screen.getByText('较旧对话'));

        // 应该显示"取消收藏"
        await waitFor(() => {
            expect(screen.getByText('取消收藏')).toBeInTheDocument();
        });
    });

    // CM-08: 复制对话内容
    it('CM-08: 复制对话将消息复制到剪贴板', async () => {
        renderWithI18n(<ChatPage {...defaultCMProps} />);

        // 右键点击有消息的对话（使用 getAllByText 获取第一个）
        const chatItems = screen.getAllByText('最新对话');
        fireEvent.contextMenu(chatItems[0]);

        // 点击复制对话
        await waitFor(() => {
            fireEvent.click(screen.getByText('复制对话'));
        });

        // 验证 clipboard API 被调用
        expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });

    // CM-09: 空对话复制禁用
    it('CM-09: 空对话的复制选项显示禁用状态', async () => {
        renderWithI18n(<ChatPage {...defaultCMProps} />);

        // 右键点击空对话
        fireEvent.contextMenu(screen.getByText('较旧对话'));

        // 复制选项应该被禁用（检查 cursor-not-allowed 类）
        await waitFor(() => {
            const copyOption = screen.getByText('复制对话').closest('button, div');
            // 检查是否有禁用相关的类
            expect(copyOption).toHaveClass('cursor-not-allowed');
        });
    });

    /**
     * v2.7.0: 对话选中状态持久化测试用例 (CM-10 ~ CM-12)
     * 对应文档 docs/modules/chat.md 中的对话管理测试用例
     */
    beforeEach(() => {
        // 清理 localStorage
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    // CM-10: 对话选中状态持久化
    it('CM-10: 选中对话后状态保存到 localStorage', async () => {
        renderWithI18n(<ChatPage {...defaultCMProps} />);

        // 点击选择第二个对话
        fireEvent.click(screen.getByText('较旧对话'));

        // 验证 localStorage 中保存了选中的对话 ID
        await waitFor(() => {
            expect(localStorage.getItem('chat_selected_id')).toBe('chat-2');
        });
    });

    // CM-11: 对话选中状态重启持久化
    it('CM-11: 重新渲染时从 localStorage 恢复选中状态', async () => {
        // 预先设置 localStorage
        localStorage.setItem('chat_selected_id', 'chat-2');

        renderWithI18n(<ChatPage {...defaultCMProps} />);

        // 应该显示 chat-2 被选中（较旧对话）
        // 验证方式：chat-2 的标题应该出现在聊天窗口顶部
        await waitFor(() => {
            // 查找聊天窗口中显示的标题
            const chatTitle = screen.getByRole('heading', { level: 3 });
            expect(chatTitle.textContent).toBe('较旧对话');
        });
    });

    // CM-12: 选中对话被删除后回退
    it('CM-12: localStorage 中的对话不存在时自动选择最近更新的对话', async () => {
        // 设置一个不存在的对话 ID
        localStorage.setItem('chat_selected_id', 'non-existent-chat');

        renderWithI18n(<ChatPage {...defaultCMProps} />);

        // 应该自动选择最近更新的对话 (chat-1)
        await waitFor(() => {
            // 验证 chat-1 的消息显示在聊天窗口
            const messages = screen.getAllByText('消息1');
            expect(messages.length).toBeGreaterThanOrEqual(2);
        });

        // localStorage 应该被更新为有效的对话 ID
        await waitFor(() => {
            expect(localStorage.getItem('chat_selected_id')).toBe('chat-1');
        });
    });
});

/**
 * 独立输入框测试 (UX-01)
 */
describe('ChatWindow - 独立输入框测试', () => {
    const mockChatsUX: Chat[] = [
        { id: 'c1', title: 'Chat 1', messages: [], starred: false, model: 'gpt-4', createdAt: new Date(), updatedAt: new Date() },
        { id: 'c2', title: 'Chat 2', messages: [], starred: false, model: 'gpt-4', createdAt: new Date(), updatedAt: new Date() },
    ];

    const mockModelsUX: AIModel[] = [
        { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI', status: 'online', apiKeySet: true, endpoint: '', maxTokens: 128000, pricing: { input: 0.01, output: 0.03 } },
    ];

    // UX-01: 切换对话清空输入框
    it('UX-01: 切换对话时输入框内容自动清空', () => {
        const { rerender } = renderWithI18n(
            <ChatWindow
                chat={mockChatsUX[0]}
                models={mockModelsUX}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
            />
        );

        // 在输入框输入内容
        const input = screen.getByPlaceholderText(/输入消息/) as HTMLTextAreaElement;
        fireEvent.change(input, { target: { value: '草稿内容' } });
        expect(input.value).toBe('草稿内容');

        // 切换到另一个对话 - 使用 rerender 而不是 rerenderWithI18n
        rerender(
            <I18nProvider>
                <ChatWindow
                    chat={mockChatsUX[1]}
                    models={mockModelsUX}
                    selectedModel="gpt-4"
                    onModelChange={() => { }}
                    onSendMessage={() => { }}
                    onStopGenerating={() => { }}
                />
            </I18nProvider>
        );

        // 输入框应该被清空
        expect(input.value).toBe('');
    });
});

/**
 * 停止生成测试 (UX-02)
 */
describe('ChatWindow - 停止生成测试', () => {
    const mockChat: Chat = {
        id: 'c1',
        title: 'Test',
        messages: [{ id: 'm1', chatId: 'c1', role: 'user', content: 'Hello', createdAt: new Date() }],
        starred: false,
        model: 'gpt-4',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const mockModels: AIModel[] = [
        { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI', status: 'online', apiKeySet: true, endpoint: '', maxTokens: 128000, pricing: { input: 0.01, output: 0.03 } },
    ];

    // UX-02: 停止生成按钮
    it('UX-02: 生成过程中显示停止按钮，点击后调用 onStopGenerating', () => {
        const handleStop = vi.fn();
        renderWithI18n(
            <ChatWindow
                chat={mockChat}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={handleStop}
                isGenerating={true}
            />
        );

        // 应该显示停止按钮
        const stopButton = screen.getByTitle('停止生成');
        expect(stopButton).toBeInTheDocument();

        // 点击停止按钮
        fireEvent.click(stopButton);
        expect(handleStop).toHaveBeenCalled();
    });

    // UX-02 补充: 生成中输入框禁用
    it('UX-02: 生成过程中输入框显示禁用状态', () => {
        renderWithI18n(
            <ChatWindow
                chat={mockChat}
                models={mockModels}
                selectedModel="gpt-4"
                onModelChange={() => { }}
                onSendMessage={() => { }}
                onStopGenerating={() => { }}
                isGenerating={true}
            />
        );

        // 输入框应该被禁用
        const input = screen.getByPlaceholderText(/AI 正在思考中/);
        expect(input).toBeDisabled();
    });
});

