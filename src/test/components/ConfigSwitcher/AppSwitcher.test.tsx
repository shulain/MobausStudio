/**
 * @file AppSwitcher.test.tsx
 * @description AppSwitcher 组件单元测试
 *
 * 测试工具切换器组件的渲染和交互
 *
 * @module test/components/ConfigSwitcher/AppSwitcher
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { AppSwitcher } from '../../../components/features/ConfigSwitcher/AppSwitcher';
import { renderWithI18n } from '../../testUtils';

describe('AppSwitcher', () => {
  /**
   * 测试：渲染所有工具按钮
   */
  it('应渲染所有工具按钮', () => {
    const onSwitch = vi.fn();
    renderWithI18n(<AppSwitcher activeApp="claude-code" onSwitch={onSwitch} />);

    expect(screen.getByText('Claude Code')).toBeDefined();
    expect(screen.getByText('Codex')).toBeDefined();
    expect(screen.getByText('Gemini CLI')).toBeDefined();
    expect(screen.getByText('OpenCode')).toBeDefined();
    expect(screen.getByText('OpenClaw')).toBeDefined();
  });

  /**
   * 测试：高亮当前选中的工具
   */
  it('应高亮当前选中的工具', () => {
    const onSwitch = vi.fn();
    renderWithI18n(<AppSwitcher activeApp="codex" onSwitch={onSwitch} />);

    const codexButton = screen.getByText('Codex').closest('button');
    // v5.11.0: 选中样式改为 border-purple-500
    expect(codexButton).toHaveClass('border-purple-500');
  });

  /**
   * 测试：点击工具按钮触发回调
   */
  it('点击工具按钮应触发 onSwitch 回调', () => {
    const onSwitch = vi.fn();
    renderWithI18n(<AppSwitcher activeApp="claude-code" onSwitch={onSwitch} />);

    const codexButton = screen.getByText('Codex');
    fireEvent.click(codexButton);

    expect(onSwitch).toHaveBeenCalledWith('codex');
  });

  /**
   * 测试：多选模式显示 checkbox
   */
  it('多选模式应显示 checkbox', () => {
    const onSwitch = vi.fn();
    const onToggle = vi.fn();
    const { container } = renderWithI18n(
      <AppSwitcher
        multiSelect={true}
        selectedApps={['claude-code']}
        onSwitch={onSwitch}
        onToggle={onToggle}
      />
    );

    // 应该有 checkbox 图标（多选模式下每个工具都有 checkbox + 工具图标）
    const checkboxes = container.querySelectorAll('svg');
    expect(checkboxes.length).toBeGreaterThan(0);
  });

  /**
   * 测试：多选模式点击触发 onToggle
   */
  it('多选模式点击应触发 onToggle 回调', () => {
    const onSwitch = vi.fn();
    const onToggle = vi.fn();
    renderWithI18n(
      <AppSwitcher
        multiSelect={true}
        selectedApps={['claude-code']}
        onSwitch={onSwitch}
        onToggle={onToggle}
      />
    );

    const codexButton = screen.getByText('Codex');
    fireEvent.click(codexButton);

    expect(onToggle).toHaveBeenCalledWith('codex');
    expect(onSwitch).not.toHaveBeenCalled();
  });

  /**
   * 测试：多选模式显示多个选中状态
   */
  it('多选模式应正确显示多个选中状态', () => {
    const onSwitch = vi.fn();
    const onToggle = vi.fn();
    renderWithI18n(
      <AppSwitcher
        multiSelect={true}
        selectedApps={['claude-code', 'codex']}
        onSwitch={onSwitch}
        onToggle={onToggle}
      />
    );

    const claudeButton = screen.getByText('Claude Code').closest('button');
    const codexButton = screen.getByText('Codex').closest('button');

    // v5.11.0: 选中样式改为 border-purple-500
    expect(claudeButton).toHaveClass('border-purple-500');
    expect(codexButton).toHaveClass('border-purple-500');
  });
});
