/**
 * 图片渲染组件
 *
 * 提供增强的图片渲染功能：
 * - 懒加载
 * - 点击放大（应用内模态框预览，v4.2.4）
 * - 右键下载
 * - 加载失败处理（显示占位符）
 * - Alt 文字显示
 * - 最大高度限制
 *
 * @module components/common/markdown/ImageRenderer
 */

import React, { useState, useCallback } from 'react';
import { ImageIcon, Download } from 'lucide-react';
import { ContextMenu, type ContextMenuItem } from '../ContextMenu';
import { ImagePreview } from '../ImagePreview';

/**
 * ImageRenderer 组件 Props
 */
export interface ImageRendererProps {
    /** 图片 URL */
    src?: string;
    /** 图片描述 */
    alt?: string;
    /** 是否启用点击放大（默认 true） */
    enableZoom?: boolean;
    /** 最大高度（像素，默认 400） */
    maxHeight?: number;
    /** 是否启用懒加载（默认 true） */
    enableLazyLoad?: boolean;
    /** 自定义类名 */
    className?: string;
}

/**
 * 图片渲染组件
 *
 * 支持点击放大、右键下载、加载失败处理等功能
 */
export const ImageRenderer: React.FC<ImageRendererProps> = ({
    src,
    alt,
    enableZoom = true,
    maxHeight = 400,
    enableLazyLoad = true,
    className = '',
}) => {
    // 加载失败状态
    const [loadError, setLoadError] = useState(false);
    // 加载中状态
    const [isLoading, setIsLoading] = useState(true);
    // 预览状态
    const [showPreview, setShowPreview] = useState(false);

    /**
     * 处理图片点击 - 打开预览模态框
     */
    const handleClick = useCallback(() => {
        if (enableZoom && src) {
            setShowPreview(true);
        }
    }, [enableZoom, src]);

    /**
     * 处理图片下载
     */
    const handleDownload = useCallback(async () => {
        if (!src) return;

        try {
            // 如果是 data URL，直接下载
            if (src.startsWith('data:')) {
                const link = document.createElement('a');
                link.href = src;
                link.download = alt || 'image';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                return;
            }

            // 如果是普通 URL，通过 fetch 下载
            const response = await fetch(src);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = alt || 'image';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('图片下载失败:', error);
        }
    }, [src, alt]);

    /**
     * 处理图片加载失败
     */
    const handleError = useCallback(() => {
        setLoadError(true);
        setIsLoading(false);
    }, []);

    /**
     * 处理图片加载完成
     */
    const handleLoad = useCallback(() => {
        setIsLoading(false);
    }, []);

    // 如果没有 src，不渲染
    if (!src) {
        return null;
    }

    // 加载失败时显示占位符
    if (loadError) {
        return (
            <span className="inline-flex items-center gap-2 px-3 py-2 my-2 bg-gray-100 dark:bg-gray-700 rounded-[10px] text-sm text-gray-500 dark:text-gray-400">
                <ImageIcon size={16} className="opacity-50" />
                <span>图片加载失败</span>
            </span>
        );
    }

    // 右键菜单项
    const contextMenuItems: ContextMenuItem[] = [
        {
            id: 'download',
            label: '下载图片',
            icon: <Download size={14} />,
            onClick: handleDownload,
        },
    ];

    return (
        <>
            <ContextMenu items={contextMenuItems}>
                <span className="block my-2">
                    {/* 加载中占位符 */}
                    {isLoading && (
                        <span className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-[10px] text-sm text-gray-500 dark:text-gray-400 animate-pulse">
                            <ImageIcon size={16} className="opacity-50" />
                            <span>加载中...</span>
                        </span>
                    )}

                    {/* 图片 - 点击事件直接绑定到 img 元素 */}
                    <img
                        src={src}
                        alt={alt || '图片'}
                        loading={enableLazyLoad ? 'lazy' : undefined}
                        className={`max-w-full h-auto rounded-[10px] shadow-sm transition-opacity ${
                            enableZoom ? 'cursor-pointer hover:opacity-90' : ''
                        } ${isLoading ? 'hidden' : ''} ${className}`}
                        style={{ maxHeight: `${maxHeight}px` }}
                        onClick={(e) => {
                            // 阻止事件冒泡，确保点击事件不被 ContextMenu 拦截
                            e.stopPropagation();
                            handleClick();
                        }}
                        onError={handleError}
                        onLoad={handleLoad}
                    />

                    {/* Alt 文字显示 */}
                    {alt && !isLoading && (
                        <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {alt}
                        </span>
                    )}
                </span>
            </ContextMenu>

            {/* 图片预览模态框 */}
            {showPreview && (
                <ImagePreview
                    isOpen={showPreview}
                    onClose={() => setShowPreview(false)}
                    src={src}
                    alt={alt}
                    onDownload={handleDownload}
                />
            )}
        </>
    );
};

export default ImageRenderer;
