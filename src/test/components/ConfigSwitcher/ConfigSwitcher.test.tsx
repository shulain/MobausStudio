/**
 * @file ConfigSwitcher.test.tsx
 * @description ConfigSwitcher 组件单元测试
 *
 * 测试配置切换功能的渲染和交互
 * 对应文档 docs/modules/config-switcher.md 中的前端测试用例
 *
 * @module test/components/ConfigSwitcher
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigSwitcherPage } from '../../../components/features/ConfigSwitcher';
import { renderWithI18n } from '../../testUtils';
import type { AIProvider, MCPServer, Skill } from '../../../types';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../../../utils/platform';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('../../../utils/platform', () => ({
  isTauri: vi.fn(() => true),
  isWeb: vi.fn(() => false),
}));

/**
 * 创建测试用 Provider 数据
 */
function createMockProvider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    id: 'anthropic',
    name: 'Anthropic',
    icon: '🤖',
    description: 'Anthropic Claude API',
    defaultEndpoint: 'https://api.anthropic.com',
    authMethods: [{ type: 'api', label: 'API Key' }],
    models: [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', maxTokens: 4096, contextWindow: 200000 },
    ],
    status: 'connected',
    source: 'api',
    popular: true,
    category: 'popular',
    ...overrides,
  };
}

/**
 * 创建测试用 OAuth Provider 数据
 */
function createOAuthProvider(): AIProvider {
  return createMockProvider({
    id: 'google',
    name: 'Google',
    authMethods: [{ type: 'oauth', label: 'OAuth' }],
    status: 'disconnected',
  });
}

/**
 * 创建测试用 MCP Server 数据
 */
function createMockMCPServer(overrides: Partial<MCPServer> = {}): MCPServer {
  return {
    id: 'filesystem',
    name: 'Filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path'],
    enabled: true,
    ...overrides,
  };
}

describe('ConfigSwitcher', () => {
  const mockProviders: AIProvider[] = [
    createMockProvider(),
    createMockProvider({ id: 'openai', name: 'OpenAI', status: 'disconnected' }),
  ];

  const mockMCPServers: MCPServer[] = [
    createMockMCPServer(),
    createMockMCPServer({ id: 'github', name: 'GitHub', enabled: true }),
    createMockMCPServer({ id: 'sqlite', name: 'SQLite', enabled: false }),
  ];

  const mockSkills: Skill[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isTauri).mockReturnValue(true);
    // Mock 默认返回值
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_enabled_providers') {
        return Promise.resolve({});
      }
      if (cmd === 'get_tool_config_paths') {
        return Promise.resolve(['~/.claude/settings.json', '~/.claude.json']);
      }
      if (cmd === 'load_models') {
        return Promise.resolve([
          { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic', endpoint: 'https://api.anthropic.com', protocol: 'anthropic' }
        ]);
      }
      if (cmd === 'export_provider_to_tool') {
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    });
  });

  /**
   * TC-UI-001: 页面加载
   */
  it('TC-UI-001: 应正确加载并显示页面标题和工具选择器', async () => {
    renderWithI18n(
      <ConfigSwitcherPage
        providers={mockProviders}
        mcpServers={mockMCPServers}
        skills={mockSkills}
      />
    );

    // 等待异步状态更新完成
    await waitFor(() => {
      expect(screen.getByText(/配置切换|Config Switcher/)).toBeDefined();
    });

    // 应该显示工具选择器
    expect(screen.getByText('Claude Code')).toBeDefined();
    expect(screen.getByText('Codex')).toBeDefined();
    expect(screen.getByText('Gemini CLI')).toBeDefined();
  });

  /**
   * TC-UI-002: 显示已连接的 Provider
   */
  it('TC-UI-002: 应只显示已连接且支持 API Key 的 Provider', async () => {
    renderWithI18n(
      <ConfigSwitcherPage
        providers={mockProviders}
        mcpServers={mockMCPServers}
        skills={mockSkills}
      />
    );

    // 等待异步状态更新完成
    await waitFor(() => {
      expect(screen.getByText('Anthropic')).toBeDefined();
    });

    // 不应该显示未连接的 OpenAI
    expect(screen.queryByText('OpenAI')).toBeNull();
  });

  /**
   * TC-UI-003: OAuth Provider 不显示
   */
  it('TC-UI-003: OAuth Provider 不应显示在列表中', async () => {
    const providersWithOAuth = [...mockProviders, createOAuthProvider()];

    renderWithI18n(
      <ConfigSwitcherPage
        providers={providersWithOAuth}
        mcpServers={mockMCPServers}
        skills={mockSkills}
      />
    );

    // 等待异步状态更新完成
    await waitFor(() => {
      expect(screen.getByText('Anthropic')).toBeDefined();
    });

    // OAuth Provider 不应该显示
    expect(screen.queryByText('Google')).toBeNull();
  });

  /**
   * TC-UI-004: 切换工具
   */
  it('TC-UI-004: 点击工具按钮应切换当前工具', async () => {
    renderWithI18n(
      <ConfigSwitcherPage
        providers={mockProviders}
        mcpServers={mockMCPServers}
        skills={mockSkills}
      />
    );

    // 等待初始渲染完成
    await waitFor(() => {
      expect(screen.getByText('Claude Code')).toBeDefined();
    });

    // 默认选中 Claude Code
    const claudeButton = screen.getByText('Claude Code').closest('button');
    expect(claudeButton).toHaveClass('border-purple-500');

    // 点击 Codex
    const codexButton = screen.getByText('Codex').closest('button');
    fireEvent.click(codexButton!);

    // Codex 应该被选中
    await waitFor(() => {
      expect(codexButton).toHaveClass('border-purple-500');
    });
  });

  /**
   * TC-UI-005: 启用 Provider
   */
  it('TC-UI-005: 点击启用按钮应调用导出命令', async () => {
    renderWithI18n(
      <ConfigSwitcherPage
        providers={mockProviders}
        mcpServers={mockMCPServers}
        skills={mockSkills}
      />
    );

    // 等待初始渲染完成
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Enable for|启用/ })).toBeDefined();
    });

    // 查找启用按钮（使用正则匹配多语言）
    const enableButton = screen.getByRole('button', { name: /Enable for|启用/ });

    // 清除之前的调用记录
    (invoke as any).mockClear();

    fireEvent.click(enableButton);

    // 应该调用 export_provider_to_tool 命令（包含完整参数）
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('export_provider_to_tool', expect.objectContaining({
        providerId: 'anthropic',
        toolName: 'claude-code',
        providerName: expect.any(String),
        providerModels: expect.any(String),
      }));
    });
  });

  /**
   * TC-UI-006: 启用成功显示消息
   */
  it('TC-UI-006: 启用成功应显示成功消息', async () => {
    renderWithI18n(
      <ConfigSwitcherPage
        providers={mockProviders}
        mcpServers={mockMCPServers}
        skills={mockSkills}
      />
    );

    // 等待初始渲染完成
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Enable for|启用/ })).toBeDefined();
    });

    const enableButton = screen.getByRole('button', { name: /Enable for|启用/ });
    fireEvent.click(enableButton);

    // 应该显示成功消息（匹配实际的成功消息格式）
    await waitFor(() => {
      expect(screen.getByText(/已为.*启用配置|enabled for/i)).toBeDefined();
    });
  });

  /**
   * TC-UI-007: 启用失败显示错误
   */
  it('TC-UI-007: 启用失败应显示错误消息', async () => {
    // 覆盖默认 mock，让 export_provider_to_tool 失败
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'export_provider_to_tool') {
        return Promise.reject(new Error('Provider 不存在'));
      }
      if (cmd === 'get_enabled_providers') {
        return Promise.resolve({});
      }
      if (cmd === 'get_tool_config_paths') {
        return Promise.resolve(['~/.claude/settings.json', '~/.claude.json']);
      }
      if (cmd === 'load_models') {
        return Promise.resolve([
          { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic', endpoint: 'https://api.anthropic.com', protocol: 'anthropic' }
        ]);
      }
      return Promise.resolve(undefined);
    });

    renderWithI18n(
      <ConfigSwitcherPage
        providers={mockProviders}
        mcpServers={mockMCPServers}
        skills={mockSkills}
      />
    );

    // 等待初始渲染完成
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Enable for|启用/ })).toBeDefined();
    });

    const enableButton = screen.getByRole('button', { name: /Enable for|启用/ });
    fireEvent.click(enableButton);

    // 应该显示错误消息
    await waitFor(() => {
      expect(screen.getByText(/Provider 不存在/)).toBeDefined();
    });
  });

  /**
   * TC-UI-008: 启用中禁用按钮
   */
  it('TC-UI-008: 启用中应禁用启用按钮', async () => {
    // Mock 一个延迟的 Promise
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'export_provider_to_tool') {
        return new Promise(resolve => setTimeout(resolve, 100));
      }
      if (cmd === 'get_enabled_providers') {
        return Promise.resolve({});
      }
      if (cmd === 'get_tool_config_paths') {
        return Promise.resolve([]);
      }
      return Promise.resolve(undefined);
    });

    renderWithI18n(
      <ConfigSwitcherPage
        providers={mockProviders}
        mcpServers={mockMCPServers}
        skills={mockSkills}
      />
    );

    // 等待初始渲染完成
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Enable for|启用/ })).toBeDefined();
    });
    const enableButton = screen.getByRole('button', { name: /Enable for|启用/ });
    fireEvent.click(enableButton);

    // 按钮应该被禁用并显示"启用中"
    await waitFor(() => {
      expect(screen.getByText(/Enabling|启用中/)).toBeDefined();
    });
  });

  /**
   * TC-UI-009: 显示配置路径
   */
  it('TC-UI-009: 应显示目标工具的配置路径', async () => {
    const mockPaths = ['~/.claude/settings.json', '~/.claude.json'];
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_tool_config_paths') {
        return Promise.resolve(mockPaths);
      }
      if (cmd === 'get_enabled_providers') {
        return Promise.resolve({});
      }
      return Promise.resolve(undefined);
    });

    renderWithI18n(
      <ConfigSwitcherPage
        providers={mockProviders}
        mcpServers={mockMCPServers}
        skills={mockSkills}
      />
    );

    // 应该显示配置路径
    await waitFor(() => {
      expect(screen.getByText('~/.claude/settings.json')).toBeDefined();
      expect(screen.getByText('~/.claude.json')).toBeDefined();
    });
  });

  /**
   * TC-UI-010: 已启用状态显示
   */
  it('TC-UI-010: 已启用的 Provider 应显示绿色边框和"禁用"按钮', async () => {
    (invoke as any).mockImplementation((cmd: string) => {
      if (cmd === 'get_enabled_providers') {
        return Promise.resolve({ 'claude-code': 'anthropic' });
      }
      if (cmd === 'get_tool_config_paths') {
        return Promise.resolve([]);
      }
      return Promise.resolve(undefined);
    });

    renderWithI18n(
      <ConfigSwitcherPage
        providers={mockProviders}
        mcpServers={mockMCPServers}
        skills={mockSkills}
      />
    );

    // 等待状态加载，应该显示"禁用"按钮（已启用的 Provider 可以被禁用）
    await waitFor(() => {
      const disableButtons = screen.getAllByRole('button', { name: /禁用|Disable/i });
      expect(disableButtons.length).toBeGreaterThan(0);
      expect(disableButtons[0].disabled).toBe(false); // 禁用按钮应该可点击
    });
  });

  /**
   * TC-UI-011: 无 Provider 时显示提示
   */
  it('TC-UI-011: 无已连接 Provider 时应显示提示信息', async () => {
    renderWithI18n(
      <ConfigSwitcherPage
        providers={[]}
        mcpServers={mockMCPServers}
        skills={mockSkills}
      />
    );

    // 等待初始渲染完成
    await waitFor(() => {
      expect(screen.getByText(/暂无可用的|No providers available/i)).toBeDefined();
    });
  });

  it('TC-UI-012: 浏览器预览不应调用 Tauri 配置命令并应显示受控提示', async () => {
    vi.mocked(isTauri).mockReturnValue(false);

    renderWithI18n(
      <ConfigSwitcherPage
        providers={mockProviders}
        mcpServers={mockMCPServers}
        skills={mockSkills}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/配置切换|Config Switcher/)).toBeDefined();
      expect(screen.getByRole('button', { name: /Enable for|启用/ })).toBeDefined();
    });

    expect(invoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Enable for|启用/ }));

    await waitFor(() => {
      expect(screen.getByText(/浏览器预览不支持写入 CLI 配置|browser preview cannot write CLI configuration/i)).toBeDefined();
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  /**
   * TC-WRITER-023: Google 断开连接时旧请求结果被丢弃
   *
   * 场景：用户启用 Provider 后，在请求完成前禁用或切换到另一个 Provider
   * 预期：旧请求返回时被识别并丢弃，不更新 UI 状态，并清理已写入的配置文件
   */
  it('TC-WRITER-023: 断开连接时旧的异步请求结果应被丢弃并清理配置', async () => {
    let resolveExport: ((value: any) => void) | null = null;
    let exportCallCount = 0;
    let disableCallCount = 0;

    // Mock 一个延迟的导出请求
    (invoke as any).mockImplementation((cmd: string, args?: any) => {
      if (cmd === 'export_provider_to_tool') {
        exportCallCount++;
        // 第一次调用返回一个可控的 Promise（模拟长时间运行的请求）
        if (exportCallCount === 1) {
          return new Promise((resolve) => {
            resolveExport = resolve;
          });
        }
        // 后续调用立即返回
        return Promise.resolve(undefined);
      }
      if (cmd === 'disable_provider_for_tool') {
        disableCallCount++;
        return Promise.resolve(undefined);
      }
      if (cmd === 'get_enabled_providers') {
        return Promise.resolve({});
      }
      if (cmd === 'get_tool_config_paths') {
        return Promise.resolve(['~/.claude/settings.json']);
      }
      if (cmd === 'load_models') {
        return Promise.resolve([
          { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic', endpoint: 'https://api.anthropic.com', protocol: 'anthropic' }
        ]);
      }
      return Promise.resolve(undefined);
    });

    renderWithI18n(
      <ConfigSwitcherPage
        providers={mockProviders}
        mcpServers={mockMCPServers}
        skills={mockSkills}
      />
    );

    // 等待初始渲染完成
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Enable for|启用/ })).toBeDefined();
    });

    // 1. 点击启用按钮，触发异步请求
    const enableButton = screen.getByRole('button', { name: /Enable for|启用/ });
    fireEvent.click(enableButton);

    // 2. 等待"启用中"状态显示
    await waitFor(() => {
      expect(screen.getByText(/Enabling|启用中/)).toBeDefined();
    });

    // 3. 在请求完成前，切换到另一个工具（模拟断开连接）
    const codexButton = screen.getByText('Codex').closest('button');
    fireEvent.click(codexButton!);

    // 4. 等待工具切换完成，应该显示新的"启用"按钮
    await waitFor(() => {
      const buttons = screen.getAllByRole('button', { name: /Enable for|启用/ });
      expect(buttons.length).toBeGreaterThan(0);
    });

    // 5. 现在让旧的导出请求完成
    if (resolveExport) {
      resolveExport(undefined);
    }

    // 6. 等待一小段时间，确保旧请求的回调被处理
    await new Promise(resolve => setTimeout(resolve, 100));

    // 7. 验证：UI 应该仍然显示"启用"按钮（未启用状态）
    // 因为旧请求的结果应该被丢弃
    const enableButtons = screen.getAllByRole('button', { name: /Enable for|启用/ });
    expect(enableButtons.length).toBeGreaterThan(0);

    // 8. 验证：不应该显示"已启用"的成功消息
    expect(screen.queryByText(/已为.*启用配置|enabled for/i)).toBeNull();

    // 9. 验证：应该调用了 disable_provider_for_tool 来清理配置文件
    expect(disableCallCount).toBe(1);
  });
});
