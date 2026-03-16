/**
 * @file PageHeader.test.tsx
 * @description PageHeader 统一页面头部组件单元测试
 *
 * 对应文档 docs/modules/test-report-v0.9.2.md 中的测试用例
 * TC-HEADER-001 ~ TC-HEADER-003
 *
 * @module test/components/common/PageHeader
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '../../../components/common/PageHeader';

describe('PageHeader 页面头部', () => {
    /**
     * TC-HEADER-001: 基本渲染
     * 测试场景: 传入 title 和 icon 时应正确渲染
     */
    it('TC-HEADER-001: 渲染标题和图标', () => {
        render(
            <PageHeader
                icon={<span data-testid="icon">📦</span>}
                title="测试页面"
            />
        );

        expect(screen.getByText('测试页面')).toBeDefined();
        expect(screen.getByTestId('icon')).toBeDefined();
    });

    /**
     * TC-HEADER-002: 带副标题
     * 测试场景: 传入 subtitle 时应显示副标题
     */
    it('TC-HEADER-002: 渲染副标题', () => {
        render(
            <PageHeader
                icon={<span>📦</span>}
                title="测试页面"
                subtitle="管理你的设置"
            />
        );

        expect(screen.getByText('测试页面')).toBeDefined();
        expect(screen.getByText('管理你的设置')).toBeDefined();
    });

    /**
     * TC-HEADER-003: 带操作按钮
     * 测试场景: 传入 actions 时应渲染操作区域
     */
    it('TC-HEADER-003: 渲染操作按钮', () => {
        render(
            <PageHeader
                icon={<span>📦</span>}
                title="测试页面"
                actions={<button data-testid="action-btn">添加</button>}
            />
        );

        expect(screen.getByTestId('action-btn')).toBeDefined();
        expect(screen.getByText('添加')).toBeDefined();
    });
});
