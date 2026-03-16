import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { I18nProvider } from '../i18n';

// 模拟 Tauri API
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn().mockResolvedValue('mocked'),
}));

// Mock storage services to return empty arrays (will fall back to mockChats)
vi.mock('../services/storage', () => ({
    modelsStorage: {
        load: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    },
    chatsStorage: {
        load: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    },
    // v1.1.0: 添加 MCP 服务器存储 mock
    mcpServersStorage: {
        load: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    },
    // v2.1.0: 添加 Agent 存储 mock
    agentsStorage: {
        load: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    },
    // v2.2.0: 添加 Skills 存储 mock
    skillsStorage: {
        load: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    },
    // v4.1.48: 添加圆桌会议存储 mock
    roundtableChatsStorage: {
        load: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    },
    // v4.1.48: 添加 Provider 凭证存储 mock
    providerCredentialsStorage: {
        load: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    },
    // v2.6.0: 添加 Settings 存储 mock
    settingsStorage: {
        load: vi.fn().mockReturnValue({ theme: 'system', language: 'zh' }),
        loadAsync: vi.fn().mockResolvedValue({ theme: 'system', language: 'zh' }),
        save: vi.fn().mockResolvedValue(undefined),
        saveSync: vi.fn(),
    },
}));

// Setup localStorage mock
beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

const renderWithI18n = (component: React.ReactElement) => {
    return render(<I18nProvider>{component}</I18nProvider>);
};

describe('App', () => {
    it('should render Mobaus Studio header', () => {
        renderWithI18n(<App />);
        expect(screen.getByText('Mobaus Studio')).toBeDefined();
    });

    it('should render sidebar navigation', () => {
        renderWithI18n(<App />);
        expect(screen.getAllByText('对话').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Agent').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Skills').length).toBeGreaterThan(0);
        expect(screen.getAllByText('MCP').length).toBeGreaterThan(0);
    });

    it('should render new chat button', () => {
        renderWithI18n(<App />);
        expect(screen.getByText('新建对话')).toBeDefined();
    });

    it('should render stats button in sidebar', () => {
        renderWithI18n(<App />);
        expect(screen.getByText('统计')).toBeDefined();
    });

    it('should render settings button in sidebar', () => {
        renderWithI18n(<App />);
        expect(screen.getByText('设置')).toBeDefined();
    });

    it('should render chat page by default', () => {
        renderWithI18n(<App />);
        // 搜索对话输入框应该存在
        expect(screen.getByPlaceholderText('搜索对话...')).toBeDefined();
    });

    it('should render chat list', async () => {
        renderWithI18n(<App />);
        // 等待页面加载完成
        await screen.findByPlaceholderText('搜索对话...');
        // 验证新建对话按钮存在
        expect(screen.getByText('新建对话')).toBeDefined();
    });
});
