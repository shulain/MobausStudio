import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsPage } from '../../../components/features/Settings/SettingsPage';
import { I18nProvider } from '../../../i18n';
import { ThemeProvider } from '../../../theme';
// v2.6.5: 导入 storage services 用于验证清理数据调用
import {
    modelsStorage,
    chatsStorage,
    agentsStorage,
    skillsStorage,
    mcpServersStorage,
    roundtableChatsStorage,
    providerCredentialsStorage,
    settingsStorage,
} from '../../../services/storage';
import { customProviderStorage } from '../../../services/customProviderStorage';
import { modelFetcher } from '../../../services/modelFetcher';

// v2.6.2: Mock Tauri dialog 插件
vi.mock('@tauri-apps/plugin-dialog', () => ({
    save: vi.fn().mockResolvedValue(null),  // 用户取消保存
    message: vi.fn().mockResolvedValue(undefined),  // message dialog 返回 void
}));

// v3.0.23: Mock platform 模块，确保 isTauri 返回 false
vi.mock('../../../utils/platform', () => ({
    isTauri: vi.fn(() => false),
    isWeb: vi.fn(() => true),
}));

// v2.6.3: Mock storage services
// v2.6.5: 添加 roundtableChatsStorage mock
vi.mock('../../../services/storage', () => ({
    modelsStorage: {
        load: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    },
    chatsStorage: {
        load: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    },
    agentsStorage: {
        load: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    },
    skillsStorage: {
        load: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    },
    mcpServersStorage: {
        load: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    },
    roundtableChatsStorage: {
        load: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
    },
    providerCredentialsStorage: {
        load: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
    },
    settingsStorage: {
        load: vi.fn().mockReturnValue({ theme: 'system', language: 'zh' }),
        loadAsync: vi.fn().mockResolvedValue({ theme: 'system', language: 'zh' }),
        save: vi.fn().mockResolvedValue(undefined),
        saveSync: vi.fn(),
    },
}));

vi.mock('../../../services/customProviderStorage', () => ({
    customProviderStorage: {
        load: vi.fn().mockResolvedValue([]),
        save: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('../../../services/modelFetcher', () => ({
    modelFetcher: {
        clearCache: vi.fn().mockResolvedValue(undefined),
    },
}));

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

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
        removeItem: vi.fn((key: string) => { delete store[key]; }),
        clear: vi.fn(() => { store = {}; }),
    };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
});

/**
 * 渲染组件并包裹 I18nProvider 和 ThemeProvider (v2.3.0)
 * SettingsPage 现在依赖 useTheme hook，需要 ThemeProvider
 */
const renderWithProviders = (component: React.ReactElement) => {
    return render(
        <ThemeProvider>
            <I18nProvider>
                {component}
            </I18nProvider>
        </ThemeProvider>
    );
};

describe('SettingsPage', () => {
    // Mock global objects
    const mockReload = vi.fn();
    Object.defineProperty(window, 'location', {
        value: { reload: mockReload },
        writable: true
    });
    window.alert = vi.fn();
    window.confirm = vi.fn(() => true);
    window.URL.createObjectURL = vi.fn(() => 'blob:url');
    window.URL.revokeObjectURL = vi.fn();

    // Mock FileReader
    class MockFileReader {
        onload: ((e: any) => void) | null = null;
        readAsText(_file: Blob) {
            // Trigger onload asynchronously to simulate real behavior
            setTimeout(() => {
                if (this.onload) {
                    this.onload({ target: { result: JSON.stringify({ chats: [{ id: '1' }] }) } });
                }
            }, 0);
        }
    }
    window.FileReader = MockFileReader as any;

    it('renders initial state and applies theme', () => {
        renderWithProviders(<SettingsPage />);

        expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
        expect(screen.getByText('外观设置')).toBeInTheDocument();

        // v2.6.3: ThemeProvider 使用 settingsStorage，已通过 mock 提供默认值
        // 验证页面正确渲染即可，不再检查 localStorage 直接调用
    });

    it('switches tabs correctly', () => {
        renderWithProviders(<SettingsPage />);

        fireEvent.click(screen.getByText('数据管理'));
        expect(screen.getByText('备份与恢复')).toBeInTheDocument();

        fireEvent.click(screen.getByText('关于'));
        expect(screen.getByText('检查更新')).toBeInTheDocument();
    });

    /**
     * v2.6.2: handleExport 改为异步函数，测试需要等待异步操作完成
     */
    it('handles export flow', async () => {
        vi.mocked(customProviderStorage.load).mockResolvedValueOnce([{ id: 'custom-exported', name: 'Exported Provider' } as any]);

        renderWithProviders(<SettingsPage />);
        fireEvent.click(screen.getByText('数据管理'));
        fireEvent.click(screen.getByText('导出配置'));

        // Click export button in modal (assuming ExportModal is working and renders "导出配置")
        // Note: ExportModal usually has a button "导出" or similar.
        // Let's rely on the fact that we can find the confirm button.
        const buttons = screen.getAllByRole('button', { name: '导出配置' });
        const exportConfirmBtn = buttons[buttons.length - 1];
        fireEvent.click(exportConfirmBtn);

        // v2.6.2: 等待异步操作完成（storage services 读取 + 文件下载）
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(window.URL.createObjectURL).toHaveBeenCalled();
        expect(customProviderStorage.load).toHaveBeenCalled();
    });

    /**
     * v2.6.3: 导入使用 storage services 保存数据
     */
    it('handles import flow', async () => {
        renderWithProviders(<SettingsPage />);
        fireEvent.click(screen.getByText('数据管理'));
        fireEvent.click(screen.getByText('导入配置'));

        // Simulate file selection in ImportModal
        const file = new File(['{}'], 'config.json', { type: 'application/json' });
        const input = screen.getByLabelText(/选择文件/i);
        fireEvent.change(input, { target: { files: [file] } });

        // Click import button
        fireEvent.click(screen.getByText('开始导入'));

        // v2.6.3: 等待 FileReader + storage services 异步保存
        await new Promise(resolve => setTimeout(resolve, 200));

        expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('成功'));
        expect(mockReload).toHaveBeenCalled();
    });

    it('rejects empty import packages without writing storage', async () => {
        const OriginalFileReader = window.FileReader;
        class EmptyPackageFileReader {
            onload: ((e: any) => void) | null = null;
            readAsText(_file: Blob) {
                setTimeout(() => {
                    this.onload?.({ target: { result: '{}' } });
                }, 0);
            }
        }
        window.FileReader = EmptyPackageFileReader as any;

        try {
            renderWithProviders(<SettingsPage />);
            fireEvent.click(screen.getByText('数据管理'));
            fireEvent.click(screen.getByText('导入配置'));

            const file = new File(['{}'], 'empty-config.json', { type: 'application/json' });
            const input = screen.getByLabelText(/选择文件/i);
            fireEvent.change(input, { target: { files: [file] } });
            fireEvent.click(screen.getByText('开始导入'));

            await waitFor(() => {
                expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('导入失败'));
            });
            expect(chatsStorage.save).not.toHaveBeenCalled();
            expect(modelsStorage.save).not.toHaveBeenCalled();
            expect(mockReload).not.toHaveBeenCalled();
        } finally {
            window.FileReader = OriginalFileReader;
        }
    });

    it('reports file read failures without writing storage', async () => {
        const OriginalFileReader = window.FileReader;
        class FailingFileReader {
            onerror: ((e: any) => void) | null = null;
            error = new Error('read failed');
            readAsText(_file: Blob) {
                setTimeout(() => {
                    this.onerror?.({ target: this });
                }, 0);
            }
        }
        window.FileReader = FailingFileReader as any;

        try {
            renderWithProviders(<SettingsPage />);
            fireEvent.click(screen.getByText('数据管理'));
            fireEvent.click(screen.getByText('导入配置'));

            const unreadableFile = new File(['{}'], 'unreadable-config.json', { type: 'application/json' });
            const unreadableInput = screen.getByLabelText(/选择文件/i);
            fireEvent.change(unreadableInput, { target: { files: [unreadableFile] } });
            fireEvent.click(screen.getByText('开始导入'));

            await waitFor(() => {
                expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('导入失败'));
            });
            expect(chatsStorage.save).not.toHaveBeenCalled();
            expect(mockReload).not.toHaveBeenCalled();
        } finally {
            window.FileReader = OriginalFileReader;
        }
    });

    it('creates a full storage-service backup before importing', async () => {
        const OriginalGlobalBlob = globalThis.Blob;
        const OriginalWindowBlob = window.Blob;
        let fileBackupContent = '';
        class CapturingBlob extends OriginalGlobalBlob {
            constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
                if (parts?.some(part => typeof part === 'string' && part.includes('"backupType"'))) {
                    fileBackupContent = parts.map(part => String(part)).join('');
                }
                super(parts, options);
            }
        }
        Object.defineProperty(globalThis, 'Blob', { value: CapturingBlob, configurable: true });
        Object.defineProperty(window, 'Blob', { value: CapturingBlob, configurable: true });

        try {
            vi.mocked(modelsStorage.load).mockResolvedValueOnce([{ id: 'model-1', name: 'Model 1' } as any]);
            vi.mocked(chatsStorage.load).mockResolvedValueOnce([{ id: 'chat-1', title: 'Chat 1' } as any]);
            vi.mocked(agentsStorage.load).mockResolvedValueOnce([{ id: 'agent-1', name: 'Agent 1' } as any]);
            vi.mocked(skillsStorage.load).mockResolvedValueOnce([{ id: 'skill-1', name: 'Skill 1' } as any]);
            vi.mocked(mcpServersStorage.load).mockResolvedValueOnce([{ id: 'mcp-1', name: 'MCP 1' } as any]);
            vi.mocked(providerCredentialsStorage.load).mockResolvedValueOnce([{ providerId: 'openai', type: 'api_key', apiKey: 'sk-test' } as any]);
            vi.mocked(customProviderStorage.load).mockResolvedValueOnce([{ id: 'custom-1', name: 'Custom Provider' } as any]);
            vi.mocked(roundtableChatsStorage.load).mockResolvedValueOnce([{ id: 'roundtable-1', title: 'Roundtable 1' } as any]);

            renderWithProviders(<SettingsPage />);
            fireEvent.click(screen.getByText('数据管理'));
            fireEvent.click(screen.getByText('导入配置'));

            const file = new File(['{}'], 'config.json', { type: 'application/json' });
            const input = screen.getByLabelText(/选择文件/i);
            fireEvent.change(input, { target: { files: [file] } });
            fireEvent.click(screen.getByText('开始导入'));

            await waitFor(() => {
                expect(localStorageMock.setItem).toHaveBeenCalledWith('mobaus_backup', expect.any(String));
            });

            const backupCall = vi.mocked(localStorageMock.setItem).mock.calls.find(([key]) => key === 'mobaus_backup');
            expect(backupCall).toBeDefined();

            const backup = JSON.parse(backupCall![1]);
            expect(backup).toMatchObject({
                version: '1.0.0',
                backupType: 'pre-import',
                models: [{ id: 'model-1', name: 'Model 1' }],
                chats: [{ id: 'chat-1', title: 'Chat 1' }],
                agents: [{ id: 'agent-1', name: 'Agent 1' }],
                skills: [{ id: 'skill-1', name: 'Skill 1' }],
                mcp: [{ id: 'mcp-1', name: 'MCP 1' }],
                customProviders: [{ id: 'custom-1', name: 'Custom Provider' }],
                roundtableChats: [{ id: 'roundtable-1', title: 'Roundtable 1' }],
                settings: { theme: 'system', language: 'zh' },
            });
            expect(backup.providerCredentials).toBeUndefined();

            const fileBackup = JSON.parse(fileBackupContent);
            expect(fileBackup).toMatchObject({
                providerCredentials: [{ providerId: 'openai', type: 'api_key', apiKey: 'sk-test' }],
                customProviders: [{ id: 'custom-1', name: 'Custom Provider' }],
            });
            expect(window.URL.createObjectURL).toHaveBeenCalled();
        } finally {
            Object.defineProperty(globalThis, 'Blob', { value: OriginalGlobalBlob, configurable: true });
            Object.defineProperty(window, 'Blob', { value: OriginalWindowBlob, configurable: true });
        }
    });

    it('imports provider credentials and custom providers from backup packages', async () => {
        const OriginalFileReader = window.FileReader;
        class BackupFileReader {
            onload: ((e: any) => void) | null = null;
            readAsText(_file: Blob) {
                setTimeout(() => {
                    this.onload?.({
                        target: {
                            result: JSON.stringify({
                                providerCredentials: [
                                    { providerId: 'openai', type: 'api_key', apiKey: 'sk-imported' },
                                ],
                                customProviders: [
                                    { id: 'custom-imported', name: 'Imported Provider' },
                                ],
                            }),
                        },
                    });
                }, 0);
            }
        }

        window.FileReader = BackupFileReader as any;

        try {
            renderWithProviders(<SettingsPage />);
            fireEvent.click(screen.getByText('数据管理'));
            fireEvent.click(screen.getByText('导入配置'));

            const file = new File(['{}'], 'backup-config.json', { type: 'application/json' });
            const input = screen.getByLabelText(/选择文件/i);
            fireEvent.change(input, { target: { files: [file] } });
            fireEvent.click(screen.getByText('开始导入'));

            await waitFor(() => {
                expect(providerCredentialsStorage.save).toHaveBeenCalledWith([
                    { providerId: 'openai', type: 'api_key', apiKey: 'sk-imported' },
                ]);
                expect(customProviderStorage.save).toHaveBeenCalledWith([
                    { id: 'custom-imported', name: 'Imported Provider' },
                ]);
            });
        } finally {
            window.FileReader = OriginalFileReader;
        }
    });

    it('imports standalone skills and MCP servers when the package also contains agents', async () => {
        class FullConfigFileReader {
            onload: ((e: any) => void) | null = null;
            readAsText(_file: Blob) {
                setTimeout(() => {
                    this.onload?.({
                        target: {
                            result: JSON.stringify({
                                agents: [
                                    {
                                        id: 'agent-1',
                                        name: 'Agent 1',
                                        model: 'model-1',
                                        skills: ['skill-agent'],
                                        mcpServers: [{ serverId: 'mcp-agent' }],
                                    },
                                ],
                                skills: [
                                    { id: 'skill-agent', name: 'Agent Skill', enabled: true },
                                    { id: 'skill-standalone', name: 'Standalone Skill', enabled: true },
                                ],
                                mcp: [
                                    { id: 'mcp-agent', name: 'Agent MCP', transportType: 'stdio', command: 'node', args: [] },
                                    { id: 'mcp-standalone', name: 'Standalone MCP', transportType: 'stdio', command: 'node', args: [] },
                                ],
                            }),
                        },
                    });
                }, 0);
            }
        }
        window.FileReader = FullConfigFileReader as any;

        renderWithProviders(<SettingsPage />);
        fireEvent.click(screen.getByText('数据管理'));
        fireEvent.click(screen.getByText('导入配置'));

        const file = new File(['{}'], 'full-config.json', { type: 'application/json' });
        const input = screen.getByLabelText(/选择文件/i);
        fireEvent.change(input, { target: { files: [file] } });
        fireEvent.click(screen.getByText('开始导入'));

        await waitFor(() => {
            expect(skillsStorage.save).toHaveBeenCalledWith([
                { id: 'skill-agent', name: 'Agent Skill', enabled: true },
                { id: 'skill-standalone', name: 'Standalone Skill', enabled: true },
            ]);
            expect(mcpServersStorage.save).toHaveBeenCalledWith([
                { id: 'mcp-agent', name: 'Agent MCP', transportType: 'stdio', command: 'node', args: [] },
                { id: 'mcp-standalone', name: 'Standalone MCP', transportType: 'stdio', command: 'node', args: [] },
            ]);
        });
    });

    /**
     * v2.6.5: 清除数据使用 storage services 异步清理
     * 验证 storage services 的 save 方法被调用保存空数组
     */
    it('handles clear data flow', async () => {
        renderWithProviders(<SettingsPage />);
        fireEvent.click(screen.getByText('数据管理'));

        fireEvent.click(screen.getByText('清除所有数据'));

        expect(window.confirm).toHaveBeenCalled();

        // v2.6.5: 等待异步清理完成
        await new Promise(resolve => setTimeout(resolve, 300));

        // v2.6.5: 验证 storage services 的 save 方法被调用保存空数组
        expect(modelsStorage.save).toHaveBeenCalledWith([]);
        expect(chatsStorage.save).toHaveBeenCalledWith([]);
        expect(agentsStorage.save).toHaveBeenCalledWith([]);
        expect(skillsStorage.save).toHaveBeenCalledWith([]);
        expect(mcpServersStorage.save).toHaveBeenCalledWith([]);
        expect(roundtableChatsStorage.save).toHaveBeenCalledWith([]);
        expect(providerCredentialsStorage.clear).toHaveBeenCalled();
        expect(customProviderStorage.clear).toHaveBeenCalled();
        expect(settingsStorage.save).toHaveBeenCalledWith({ theme: 'system', language: 'zh' });
        expect(modelFetcher.clearCache).toHaveBeenCalledWith(undefined, true);

        // v2.6.5: 验证 localStorage 也被清理
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('mobaus_models');
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('mobaus_chats');
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('mobaus_agents');
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('mobaus_skills');
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('mobaus_mcp_servers');
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('mobaus_settings');
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('mobaus_provider_credentials');
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('mobaus_custom_providers');
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('mobaus_roundtable_chats');
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('mobaus_model_cache');
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('mobaus_models_dev_cache');
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('mobaus_device_id');
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('mobaus_first_launch');
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('mobaus_backup');
        expect(mockReload).toHaveBeenCalled();
    });

    /**
     * v3.0.23: 测试关于页面检查更新按钮
     * AboutSettings 组件使用内部 handleCheckUpdate，非 Tauri 环境会显示"当前已是最新版本"
     */
    it('handles check update in About tab', async () => {
        renderWithProviders(<SettingsPage />);
        fireEvent.click(screen.getByText('关于'));
        fireEvent.click(screen.getByText('检查更新'));

        // 非 Tauri 环境，点击后应显示"当前已是最新版本"
        await waitFor(() => {
            expect(screen.getByText('当前已是最新版本')).toBeInTheDocument();
        });
    });
});
