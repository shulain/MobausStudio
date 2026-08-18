/**
 * @file Header.test.tsx
 * @description Header 应用顶栏组件单元测试 - Mobaus 渐变圆形品牌风格
 *
 * 对应文档 docs/components/layout.md 中的测试用例
 * TC-HEADER-001 ~ TC-HEADER-005
 *
 * @module test/components/layout/Header
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from '../../../components/layout/Header';

/** 默认 props */
const defaultProps = {
    onNotifications: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
    notificationCount: 0,
};

describe('Header 应用顶栏', () => {
    /**
     * TC-HEADER-001: 渲染品牌 Logo
     * 测试场景: 默认渲染时应显示带光晕动画的 Mobaus Logo（外部 SVG 文件）
     */
    it('TC-HEADER-001: 渲染 Mobaus 渐变圆形 Logo 带光晕动画', () => {
        const { container } = render(<Header {...defaultProps} />);

        // 光晕层应存在且带 animate-pulse 类
        const glowLayer = container.querySelector('.animate-pulse');
        expect(glowLayer).toBeTruthy();

        // Logo 图片应存在（使用 img 标签引用外部 SVG）
        const logoImg = screen.getByTestId('mobaus-header-logo');
        expect(logoImg).toBeTruthy();
        expect(logoImg.tagName).toBe('IMG');

        // 应有正确的 alt 文本
        expect(logoImg.getAttribute('alt')).toBe('Mobaus Logo');

        // 应有正确的尺寸类名
        expect(logoImg.className).toContain('w-10');
        expect(logoImg.className).toContain('h-10');
    });

    /**
     * TC-HEADER-002: 渲染渐变标题
     * 测试场景: "Mobaus Studio" 应显示渐变色文字
     */
    it('TC-HEADER-002: 渲染渐变标题文字', () => {
        render(<Header {...defaultProps} />);

        const title = screen.getByText('Mobaus Studio');
        expect(title).toBeTruthy();
        // 渐变文字使用 bg-clip-text + text-transparent
        expect(title.className).toContain('bg-clip-text');
        expect(title.className).toContain('text-transparent');
    });

    /**
     * TC-HEADER-003: 渲染版本标签
     * 测试场景: 应显示 "PRO" 渐变标签
     */
    it('TC-HEADER-003: 渲染 PRO 版本标签', () => {
        render(<Header {...defaultProps} />);

        const badge = screen.getByText('PRO');
        expect(badge).toBeTruthy();
        expect(badge.className).toContain('rounded-full');
    });

    /**
     * TC-HEADER-004: 右侧按钮渲染
     * 测试场景: 右侧功能按钮（消息、导出、导入）应渲染
     */
    it('TC-HEADER-004: 右侧功能按钮已渲染', () => {
        render(<Header {...defaultProps} />);

        expect(screen.getByTitle('消息')).toBeTruthy();
        expect(screen.getByTitle('导出配置')).toBeTruthy();
        expect(screen.getByTitle('导入配置')).toBeTruthy();
    });

    /**
     * TC-HEADER-005: 窗口拖动支持
     * 测试场景: 顶栏应包含 data-tauri-drag-region 属性
     */
    it('TC-HEADER-005: 支持 Tauri 窗口拖动', () => {
        const { container } = render(<Header {...defaultProps} />);

        const dragRegion = container.querySelector('[data-tauri-drag-region]');
        expect(dragRegion).toBeTruthy();
    });
});
