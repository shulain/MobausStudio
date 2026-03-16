/**
 * Toast 通知组件
 *
 * v2.5.3: 右上角临时弹框，支持展开详情
 *
 * @module components/common/Toast
 */

import React, { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronUp, CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';
import { useI18n } from '../../../i18n';

export interface ToastItem {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    details?: string;
    statusCode?: number;
    duration?: number; // 自动关闭时间（毫秒），0 表示不自动关闭
}

interface ToastProps {
    toasts: ToastItem[];
    onDismiss: (id: string) => void;
}

// 单个 Toast 项
const ToastItemComponent: React.FC<{
    toast: ToastItem;
    onDismiss: () => void;
}> = ({ toast, onDismiss }) => {
    const { t } = useI18n();
    const [expanded, setExpanded] = useState(false);

    // 自动关闭
    useEffect(() => {
        const duration = toast.duration ?? 5000;
        if (duration > 0) {
            const timer = setTimeout(onDismiss, duration);
            return () => clearTimeout(timer);
        }
    }, [toast.duration, onDismiss]);

    // 图标和颜色配置
    const config = {
        success: {
            icon: CheckCircle,
            bg: 'bg-green-50 dark:bg-green-900/30',
            border: 'border-green-200 dark:border-green-800',
            iconColor: 'text-green-500',
            titleColor: 'text-green-700 dark:text-green-300',
        },
        error: {
            icon: XCircle,
            bg: 'bg-red-50 dark:bg-red-900/30',
            border: 'border-red-200 dark:border-red-800',
            iconColor: 'text-red-500',
            titleColor: 'text-red-700 dark:text-red-300',
        },
        warning: {
            icon: AlertCircle,
            bg: 'bg-yellow-50 dark:bg-yellow-900/30',
            border: 'border-yellow-200 dark:border-yellow-800',
            iconColor: 'text-yellow-500',
            titleColor: 'text-yellow-700 dark:text-yellow-300',
        },
        info: {
            icon: Info,
            bg: 'bg-blue-50 dark:bg-blue-900/30',
            border: 'border-blue-200 dark:border-blue-800',
            iconColor: 'text-blue-500',
            titleColor: 'text-blue-700 dark:text-blue-300',
        },
    };

    const { icon: Icon, bg, border, iconColor, titleColor } = config[toast.type];
    const hasDetails = toast.details || toast.statusCode !== undefined;

    return (
        <div
            className={`
                ${bg} ${border} border rounded-[10px] shadow-lg
                min-w-[320px] max-w-[400px]
                animate-slide-in-right
            `}
        >
            <div className="p-3">
                <div className="flex items-start gap-3">
                    <Icon className={`w-5 h-5 ${iconColor} flex-shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                        <p className={`font-medium ${titleColor} text-sm`}>{toast.title}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{toast.message}</p>
                    </div>
                    <button
                        onClick={onDismiss}
                        className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded transition-colors"
                    >
                        <X className="w-4 h-4 text-gray-500" />
                    </button>
                </div>

                {/* 展开详情按钮 */}
                {hasDetails && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mt-2 ml-8"
                    >
                        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {expanded ? t.toast.hideDetails : t.toast.showDetails}
                    </button>
                )}
            </div>

            {/* 详情区域 */}
            {expanded && hasDetails && (
                <div className="px-3 pb-3 ml-8 space-y-2">
                    {toast.statusCode !== undefined && (
                        <div className="text-xs">
                            <span className="text-gray-500">{t.toast.httpStatusCode}: </span>
                            <span className={`font-mono ${
                                toast.statusCode >= 200 && toast.statusCode < 300
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-red-600 dark:text-red-400'
                            }`}>
                                {toast.statusCode}
                            </span>
                        </div>
                    )}
                    {toast.details && (
                        <div className="text-xs text-gray-600 dark:text-gray-400 bg-black/5 dark:bg-white/5 rounded p-2 break-all">
                            {toast.details}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// Toast 容器
export const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
            {toasts.map((toast) => (
                <ToastItemComponent
                    key={toast.id}
                    toast={toast}
                    onDismiss={() => onDismiss(toast.id)}
                />
            ))}
        </div>
    );
};

export default Toast;
