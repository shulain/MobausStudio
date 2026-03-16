/**
 * 链接渲染组件
 *
 * 提供增强的链接渲染功能：
 * - 文件类型检测
 * - 可下载文件显示下载按钮
 * - 外部链接显示图标
 * - 安全的 target="_blank"
 *
 * @module components/common/markdown/LinkRenderer
 */

import React from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { isDownloadableFile, getFileName } from './fileUtils';

/**
 * LinkRenderer 组件 Props
 */
export interface LinkRendererProps {
    /** 链接 URL */
    href?: string;
    /** 链接文本（children） */
    children?: React.ReactNode;
    /** 是否启用文件下载检测（默认 true） */
    enableFileDownload?: boolean;
    /** 是否显示外部链接图标（默认 true） */
    showExternalIcon?: boolean;
    /** 自定义类名 */
    className?: string;
}

/**
 * 链接渲染组件
 *
 * 支持文件下载检测和外部链接图标
 */
export const LinkRenderer: React.FC<LinkRendererProps> = ({
    href,
    children,
    enableFileDownload = true,
    showExternalIcon = true,
    className = '',
}) => {
    const url = href || '';

    // 如果没有 URL，只渲染文本
    if (!url) {
        return <span>{children}</span>;
    }

    // 检测是否为可下载文件
    if (enableFileDownload && isDownloadableFile(url)) {
        const fileName = getFileName(url);

        return (
            <a
                href={url}
                download={fileName}
                className={`inline-flex items-center gap-1.5 px-2 py-1 my-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-[10px] text-blue-600 dark:text-blue-400 no-underline transition-colors text-sm ${className}`}
                title={`下载 ${fileName}`}
            >
                <Download size={14} className="flex-shrink-0" />
                <span className="truncate max-w-[200px]">{fileName}</span>
            </a>
        );
    }

    // 普通链接
    return (
        <a
            href={url}
            className={`text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-0.5 ${className}`}
            target="_blank"
            rel="noopener noreferrer"
        >
            {children}
            {showExternalIcon && (
                <ExternalLink size={12} className="opacity-50 flex-shrink-0" />
            )}
        </a>
    );
};

export default LinkRenderer;
