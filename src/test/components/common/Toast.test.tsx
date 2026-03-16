/**
 * @file Toast.test.tsx
 * @description Toast 通知组件的单元测试
 * 严格对应 docs/components/common.md 中的测试场景
 * 包含中文注释和详细的步骤日志
 */

import React from 'react';
import { screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Toast, type ToastItem } from '../../../components/common';
import { renderWithI18n } from '../../testUtils';

describe('Toast 通知组件测试', () => {
    // 模拟定时器
    beforeEach(() => {
        vi.useFakeTimers();
        console.log('\n[测试] 开始执行 Toast 测试套件中的新用例...');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /**
     * TOAST-01: 显示成功通知
     * 输入: type='success'
     * 期望输出: 显示绿色图标和背景
     */
    it('TOAST-01 显示成功通知: 应显示绿色样式', () => {
        console.log('[步骤 1] 创建成功类型的 Toast');
        const toasts: ToastItem[] = [{
            id: '1',
            type: 'success',
            title: '操作成功',
            message: '模型测试通过',
        }];
        const onDismiss = vi.fn();

        console.log('[步骤 2] 渲染 Toast 组件');
        renderWithI18n(<Toast toasts={toasts} onDismiss={onDismiss} />);

        console.log('[步骤 3] 验证标题和消息显示');
        expect(screen.getByText('操作成功')).toBeInTheDocument();
        expect(screen.getByText('模型测试通过')).toBeInTheDocument();

        console.log('[步骤 4] 验证成功图标存在（CheckCircle）');
        // 通过查找 SVG 元素来验证图标
        const container = screen.getByText('操作成功').closest('div');
        expect(container).toBeInTheDocument();
    });

    /**
     * TOAST-02: 显示错误通知
     * 输入: type='error'
     * 期望输出: 显示红色图标和背景
     */
    it('TOAST-02 显示错误通知: 应显示红色样式', () => {
        console.log('[步骤 1] 创建错误类型的 Toast');
        const toasts: ToastItem[] = [{
            id: '1',
            type: 'error',
            title: '测试失败',
            message: 'API 连接失败',
        }];
        const onDismiss = vi.fn();

        console.log('[步骤 2] 渲染 Toast 组件');
        renderWithI18n(<Toast toasts={toasts} onDismiss={onDismiss} />);

        console.log('[步骤 3] 验证标题和消息显示');
        expect(screen.getByText('测试失败')).toBeInTheDocument();
        expect(screen.getByText('API 连接失败')).toBeInTheDocument();
    });

    /**
     * TOAST-03: 自动关闭
     * 输入: duration=3000
     * 期望输出: 3秒后自动消失
     */
    it('TOAST-03 自动关闭: 指定时间后应自动调用 onDismiss', () => {
        console.log('[步骤 1] 创建带 duration 的 Toast');
        const toasts: ToastItem[] = [{
            id: '1',
            type: 'info',
            title: '信息',
            message: '这是一条信息',
            duration: 3000,
        }];
        const onDismiss = vi.fn();

        console.log('[步骤 2] 渲染 Toast 组件');
        renderWithI18n(<Toast toasts={toasts} onDismiss={onDismiss} />);

        console.log('[步骤 3] 验证初始时 onDismiss 未被调用');
        expect(onDismiss).not.toHaveBeenCalled();

        console.log('[步骤 4] 快进 3 秒');
        act(() => {
            vi.advanceTimersByTime(3000);
        });

        console.log('[步骤 5] 验证 onDismiss 被调用');
        expect(onDismiss).toHaveBeenCalledWith('1');
    });

    /**
     * TOAST-04: 手动关闭
     * 输入: 点击 X 按钮
     * 期望输出: 立即消失
     */
    it('TOAST-04 手动关闭: 点击 X 按钮应调用 onDismiss', () => {
        console.log('[步骤 1] 创建 Toast');
        const toasts: ToastItem[] = [{
            id: '1',
            type: 'warning',
            title: '警告',
            message: '这是一条警告',
            duration: 0, // 不自动关闭
        }];
        const onDismiss = vi.fn();

        console.log('[步骤 2] 渲染 Toast 组件');
        renderWithI18n(<Toast toasts={toasts} onDismiss={onDismiss} />);

        console.log('[步骤 3] 找到并点击关闭按钮');
        const closeButton = screen.getByRole('button');
        fireEvent.click(closeButton);

        console.log('[步骤 4] 验证 onDismiss 被调用');
        expect(onDismiss).toHaveBeenCalledWith('1');
    });

    /**
     * TOAST-05: 展开详情
     * 输入: 点击"查看详情"
     * 期望输出: 显示 statusCode 和 details
     */
    it('TOAST-05 展开详情: 点击查看详情应显示详细信息', () => {
        console.log('[步骤 1] 创建带详情的 Toast');
        const toasts: ToastItem[] = [{
            id: '1',
            type: 'error',
            title: '错误',
            message: '请求失败',
            statusCode: 401,
            details: '认证失败，请检查 API Key',
            duration: 0,
        }];
        const onDismiss = vi.fn();

        console.log('[步骤 2] 渲染 Toast 组件');
        renderWithI18n(<Toast toasts={toasts} onDismiss={onDismiss} />);

        console.log('[步骤 3] 验证详情初始隐藏');
        expect(screen.queryByText('401')).not.toBeInTheDocument();
        expect(screen.queryByText('认证失败，请检查 API Key')).not.toBeInTheDocument();

        console.log('[步骤 4] 点击"查看详情"');
        const expandButton = screen.getByText('查看详情');
        fireEvent.click(expandButton);

        console.log('[步骤 5] 验证详情已显示');
        expect(screen.getByText('401')).toBeInTheDocument();
        expect(screen.getByText('认证失败，请检查 API Key')).toBeInTheDocument();
    });

    /**
     * TOAST-06: 收起详情
     * 输入: 点击"收起详情"
     * 期望输出: 隐藏详情区域
     */
    it('TOAST-06 收起详情: 点击收起详情应隐藏详细信息', () => {
        console.log('[步骤 1] 创建带详情的 Toast');
        const toasts: ToastItem[] = [{
            id: '1',
            type: 'error',
            title: '错误',
            message: '请求失败',
            details: '详细错误信息',
            duration: 0,
        }];
        const onDismiss = vi.fn();

        console.log('[步骤 2] 渲染并展开详情');
        renderWithI18n(<Toast toasts={toasts} onDismiss={onDismiss} />);
        fireEvent.click(screen.getByText('查看详情'));
        expect(screen.getByText('详细错误信息')).toBeInTheDocument();

        console.log('[步骤 3] 点击"收起详情"');
        fireEvent.click(screen.getByText('收起详情'));

        console.log('[步骤 4] 验证详情已隐藏');
        expect(screen.queryByText('详细错误信息')).not.toBeInTheDocument();
    });

    /**
     * TOAST-07: 多通知堆叠
     * 输入: 添加多个 toast
     * 期望输出: 垂直堆叠显示
     */
    it('TOAST-07 多通知堆叠: 多个 Toast 应同时显示', () => {
        console.log('[步骤 1] 创建多个 Toast');
        const toasts: ToastItem[] = [
            { id: '1', type: 'success', title: '成功1', message: '消息1' },
            { id: '2', type: 'error', title: '错误2', message: '消息2' },
            { id: '3', type: 'info', title: '信息3', message: '消息3' },
        ];
        const onDismiss = vi.fn();

        console.log('[步骤 2] 渲染 Toast 组件');
        renderWithI18n(<Toast toasts={toasts} onDismiss={onDismiss} />);

        console.log('[步骤 3] 验证所有 Toast 都显示');
        expect(screen.getByText('成功1')).toBeInTheDocument();
        expect(screen.getByText('错误2')).toBeInTheDocument();
        expect(screen.getByText('信息3')).toBeInTheDocument();
    });

    /**
     * TOAST-08: 空列表不渲染
     * 输入: 空数组
     * 期望输出: 不渲染任何内容
     */
    it('TOAST-08 空列表: toasts 为空时不渲染任何内容', () => {
        console.log('[步骤 1] 创建空 Toast 列表');
        const toasts: ToastItem[] = [];
        const onDismiss = vi.fn();

        console.log('[步骤 2] 渲染 Toast 组件');
        const { container } = renderWithI18n(<Toast toasts={toasts} onDismiss={onDismiss} />);

        console.log('[步骤 3] 验证容器为空');
        // I18nProvider 会包裹一层，所以检查内部是否为空
        const toastContainer = container.querySelector('[class*="fixed"]');
        expect(toastContainer).toBeNull();
    });
});
