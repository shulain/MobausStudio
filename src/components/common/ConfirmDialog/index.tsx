/**
 * 确认对话框组件
 *
 * 提供统一风格的确认对话框
 *
 * @module components/common/ConfirmDialog
 * @version 0.9.3.5
 */

import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '../Button';

interface ConfirmDialogProps {
    /** 是否显示 */
    open: boolean;
    /** 标题 */
    title: string;
    /** 消息内容 */
    message: string;
    /** 确认按钮文本 */
    confirmText?: string;
    /** 取消按钮文本 */
    cancelText?: string;
    /** 确认按钮样式 */
    confirmVariant?: 'primary' | 'danger';
    /** 确认回调 */
    onConfirm: () => void;
    /** 取消回调 */
    onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    open,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    confirmVariant = 'danger',
    onConfirm,
    onCancel,
}) => {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* 背景遮罩 */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onCancel}
            />

            {/* 对话框 */}
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                {/* 头部 */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {title}
                        </h2>
                    </div>
                    <button
                        onClick={onCancel}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* 内容 */}
                <div className="p-6">
                    <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                        {message}
                    </p>
                </div>

                {/* 底部按钮 */}
                <div className="flex items-center justify-end gap-3 p-6 bg-gray-50 dark:bg-gray-900/50">
                    <Button
                        onClick={onCancel}
                        variant="secondary"
                        size="md"
                    >
                        {cancelText}
                    </Button>
                    <Button
                        onClick={onConfirm}
                        variant={confirmVariant}
                        size="md"
                    >
                        {confirmText}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialog;
