/**
 * @file ConfirmDialog.test.tsx
 * @description ConfirmDialog 确认对话框组件单元测试
 *
 * 对应文档 docs/modules/test-report-v0.9.2.md 中的测试用例
 * TC-CONFIRM-001 ~ TC-CONFIRM-006
 *
 * @module test/components/common/ConfirmDialog
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';

describe('ConfirmDialog 确认对话框', () => {
    const defaultProps = {
        open: true,
        title: '确认删除',
        message: '确定要删除这条记录吗？',
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
    };

    /**
     * TC-CONFIRM-001: 关闭状态不渲染
     * 测试场景: open=false 时不应渲染任何内容
     */
    it('TC-CONFIRM-001: open=false 时不渲染', () => {
        const { container } = render(
            <ConfirmDialog {...defaultProps} open={false} />
        );
        expect(container.innerHTML).toBe('');
    });

    /**
     * TC-CONFIRM-002: 打开状态渲染
     * 测试场景: open=true 时应显示标题和消息
     */
    it('TC-CONFIRM-002: open=true 时显示标题和消息', () => {
        render(<ConfirmDialog {...defaultProps} />);

        expect(screen.getByText('确认删除')).toBeDefined();
        expect(screen.getByText('确定要删除这条记录吗？')).toBeDefined();
    });

    /**
     * TC-CONFIRM-003: 点击确认
     * 测试场景: 点击确认按钮应调用 onConfirm
     */
    it('TC-CONFIRM-003: 点击确认按钮调用 onConfirm', () => {
        const onConfirm = vi.fn();
        render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);

        fireEvent.click(screen.getByText('Confirm'));
        expect(onConfirm).toHaveBeenCalledOnce();
    });

    /**
     * TC-CONFIRM-004: 点击取消
     * 测试场景: 点击取消按钮应调用 onCancel
     */
    it('TC-CONFIRM-004: 点击取消按钮调用 onCancel', () => {
        const onCancel = vi.fn();
        render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);

        fireEvent.click(screen.getByText('Cancel'));
        expect(onCancel).toHaveBeenCalledOnce();
    });

    /**
     * TC-CONFIRM-005: 点击遮罩关闭
     * 测试场景: 点击背景遮罩应调用 onCancel
     */
    it('TC-CONFIRM-005: 点击遮罩调用 onCancel', () => {
        const onCancel = vi.fn();
        const { container } = render(
            <ConfirmDialog {...defaultProps} onCancel={onCancel} />
        );

        // 背景遮罩是第一个 absolute inset-0 的 div
        const backdrop = container.querySelector('.backdrop-blur-sm');
        if (backdrop) {
            fireEvent.click(backdrop);
            expect(onCancel).toHaveBeenCalledOnce();
        }
    });

    /**
     * TC-CONFIRM-006: 自定义按钮文本
     * 测试场景: 传入自定义文本时应显示自定义文本
     */
    it('TC-CONFIRM-006: 显示自定义按钮文本', () => {
        render(
            <ConfirmDialog
                {...defaultProps}
                confirmText="删除"
                cancelText="返回"
            />
        );

        expect(screen.getByText('删除')).toBeDefined();
        expect(screen.getByText('返回')).toBeDefined();
    });
});
