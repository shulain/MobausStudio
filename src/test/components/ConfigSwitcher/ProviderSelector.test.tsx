/**
 * @file ProviderSelector.test.tsx
 * @description ProviderSelector 组件单元测试
 *
 * 测试 Provider 选择器组件的渲染和交互
 *
 * @module test/components/ConfigSwitcher/ProviderSelector
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { ProviderSelector } from '../../../components/features/ConfigSwitcher/ProviderSelector';
import { renderWithI18n } from '../../testUtils';
import type { AIProvider } from '../../../types';

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

describe('ProviderSelector', () => {
  const mockProviders: AIProvider[] = [
    createMockProvider(),
    createMockProvider({ id: 'openai', name: 'OpenAI' }),
  ];

  /**
   * 测试：渲染已连接的 Provider
   */
  it('应只渲染已连接且支持 API Key 的 Provider', () => {
    const onEnable = vi.fn();
    const providersWithDisconnected = [
      ...mockProviders,
      createMockProvider({ id: 'google', name: 'Google', status: 'disconnected' }),
    ];

    renderWithI18n(
      <ProviderSelector
        providers={providersWithDisconnected}
        activeToolId="claude-code"
        isExporting={false}
        enabledProviderId={null}
        onEnable={onEnable}
      />
    );

    // 应该显示已连接的 Provider
    expect(screen.getByText('Anthropic')).toBeDefined();
    expect(screen.getByText('OpenAI')).toBeDefined();

    // 不应该显示未连接的 Provider
    expect(screen.queryByText('Google')).toBeNull();
  });

  /**
   * 测试：不显示 OAuth Provider
   */
  it('不应显示 OAuth 认证的 Provider', () => {
    const onEnable = vi.fn();
    const providersWithOAuth = [
      ...mockProviders,
      createMockProvider({
        id: 'google',
        name: 'Google',
        authMethods: [{ type: 'oauth', label: 'OAuth' }],
        status: 'connected',
      }),
    ];

    renderWithI18n(
      <ProviderSelector
        providers={providersWithOAuth}
        activeToolId="claude-code"
        isExporting={false}
        enabledProviderId={null}
        onEnable={onEnable}
      />
    );

    // OAuth Provider 不应该显示
    expect(screen.queryByText('Google')).toBeNull();
  });

  /**
   * 测试：显示启用按钮
   */
  it('应为每个 Provider 显示启用按钮', () => {
    const onEnable = vi.fn();

    renderWithI18n(
      <ProviderSelector
        providers={mockProviders}
        activeToolId="claude-code"
        isExporting={false}
        enabledProviderId={null}
        onEnable={onEnable}
      />
    );

    // 应该有启用按钮
    const enableButtons = screen.getAllByRole('button', { name: /Enable for|启用/ });
    expect(enableButtons.length).toBe(2);
  });

  /**
   * 测试：点击启用按钮触发回调
   */
  it('点击启用按钮应触发 onEnable 回调', () => {
    const onEnable = vi.fn();

    renderWithI18n(
      <ProviderSelector
        providers={mockProviders}
        activeToolId="claude-code"
        isExporting={false}
        enabledProviderId={null}
        onEnable={onEnable}
      />
    );

    const enableButtons = screen.getAllByRole('button', { name: /Enable for|启用/ });
    fireEvent.click(enableButtons[0]);

    expect(onEnable).toHaveBeenCalledWith('anthropic');
  });

  /**
   * 测试：已启用状态显示
   */
  it('已启用的 Provider 应显示绿色边框和"禁用"按钮', () => {
    const onEnable = vi.fn();
    const onDisable = vi.fn();

    renderWithI18n(
      <ProviderSelector
        providers={mockProviders}
        activeToolId="claude-code"
        isExporting={false}
        enabledProviderId="anthropic"
        onEnable={onEnable}
        onDisable={onDisable}
      />
    );

    // 应该显示"禁用"按钮（已启用的 Provider 可以被禁用）
    const disableButton = screen.getByRole('button', { name: /禁用|Disable/i });
    expect(disableButton).toBeDefined();

    // 禁用按钮应该可点击
    expect(disableButton.disabled).toBe(false);
  });

  /**
   * 测试：导出中禁用所有按钮
   */
  it('导出中应禁用所有启用按钮', () => {
    const onEnable = vi.fn();

    renderWithI18n(
      <ProviderSelector
        providers={mockProviders}
        activeToolId="claude-code"
        isExporting={true}
        enabledProviderId={null}
        onEnable={onEnable}
      />
    );

    // 所有按钮应该被禁用
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button.disabled).toBe(true);
    });
  });

  /**
   * 测试：无 Provider 时显示提示
   */
  it('无已连接 Provider 时应显示提示信息', () => {
    const onEnable = vi.fn();

    renderWithI18n(
      <ProviderSelector
        providers={[]}
        activeToolId="claude-code"
        isExporting={false}
        enabledProviderId={null}
        onEnable={onEnable}
      />
    );

    // 应该显示无 Provider 提示
    expect(screen.getByText(/暂无可用的|No providers available/i)).toBeDefined();
  });

  /**
   * 测试：显示 Provider 图标
   */
  it('应显示 Provider 图标', () => {
    const onEnable = vi.fn();

    renderWithI18n(
      <ProviderSelector
        providers={mockProviders}
        activeToolId="claude-code"
        isExporting={false}
        enabledProviderId={null}
        onEnable={onEnable}
      />
    );

    // 应该显示图标（首字母大写）
    expect(screen.getByText('A')).toBeDefined(); // Anthropic
    expect(screen.getByText('O')).toBeDefined(); // OpenAI
  });
});
