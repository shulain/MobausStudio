/**
 * @file ExpandableSearch.test.tsx
 * @description ExpandableSearch 可展开搜索框组件单元测试
 *
 * 对应文档 docs/modules/test-report-v0.9.2.md 中的测试用例
 * TC-SEARCH-001 ~ TC-SEARCH-004
 *
 * @module test/components/common/ExpandableSearch
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExpandableSearch } from '../../../components/common/ExpandableSearch';
import { I18nProvider } from '../../../i18n';

describe('ExpandableSearch 可展开搜索框', () => {
    const renderWithProvider = (ui: React.ReactElement) => {
        return render(<I18nProvider>{ui}</I18nProvider>);
    };

    /**
     * TC-SEARCH-001: 初始折叠状态
     * 测试场景: 默认渲染时输入框应不可交互
     */
    it('TC-SEARCH-001: 初始状态输入框 tabIndex 为 -1', () => {
        renderWithProvider(
            <ExpandableSearch value="" onChange={vi.fn()} />
        );

        const input = screen.getByRole('textbox', { hidden: true });
        expect(input.tabIndex).toBe(-1);
    });

    /**
     * TC-SEARCH-002: 输入值变化
     * 测试场景: 输入文本时应调用 onChange
     */
    it('TC-SEARCH-002: 输入文本调用 onChange', () => {
        const onChange = vi.fn();
        renderWithProvider(
            <ExpandableSearch value="" onChange={onChange} />
        );

        const input = screen.getByRole('textbox', { hidden: true });
        fireEvent.change(input, { target: { value: 'test' } });

        expect(onChange).toHaveBeenCalledWith('test');
    });

    /**
     * TC-SEARCH-003: ESC 键清空
     * 测试场景: 按 ESC 键应调用 onChange('')
     */
    it('TC-SEARCH-003: ESC 键清空输入', () => {
        const onChange = vi.fn();
        renderWithProvider(
            <ExpandableSearch value="test" onChange={onChange} />
        );

        const input = screen.getByRole('textbox', { hidden: true });
        fireEvent.keyDown(input, { key: 'Escape' });

        expect(onChange).toHaveBeenCalledWith('');
    });

    /**
     * TC-SEARCH-004: 有值时保持展开
     * 测试场景: value 不为空时应保持展开状态
     */
    it('TC-SEARCH-004: 有值时输入框 tabIndex 为 0', () => {
        renderWithProvider(
            <ExpandableSearch value="search text" onChange={vi.fn()} />
        );

        const input = screen.getByRole('textbox');
        // 有值时应自动展开，tabIndex 为 0
        expect(input.tabIndex).toBe(0);
    });
});
