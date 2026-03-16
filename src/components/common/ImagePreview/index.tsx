/**
 * 图片预览组件
 *
 * 提供全屏图片预览功能：
 * - 点击图片放大查看
 * - 支持下载
 * - ESC 键关闭
 * - 点击背景关闭
 *
 * @module components/common/ImagePreview
 */

import React, { useEffect } from 'react';
import { X, Download } from 'lucide-react';

/**
 * ImagePreview 组件 Props
 */
export interface ImagePreviewProps {
    /** 是否显示预览 */
    isOpen: boolean;
    /** 关闭回调 */
    onClose: () => void;
    /** 图片 URL */
    src: string;
    /** 图片描述 */
    alt?: string;
    /** 下载回调（可选，如果不提供则使用默认下载逻辑） */
    onDownload?: () => void;
}

/**
 * 图片预览组件
 *
 * 在全屏模态框中显示图片，支持下载和关闭
 */
export const ImagePreview: React.FC<ImagePreviewProps> = ({
    isOpen,
    onClose,
    src,
    alt,
    onDownload,
}) => {
    // ESC 键关闭
    useEffect(() => {
        if (!isOpen) return;

        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEsc);
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleEsc);
            document.body.style.overflow = 'auto';
        };
    }, [isOpen, onClose]);

    /**
     * 默认下载处理
     */
    const handleDownload = async () => {
        if (onDownload) {
            onDownload();
            return;
        }

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
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            {/* 背景遮罩 */}
            <div
                className="absolute inset-0 bg-black/90 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* 工具栏 */}
            <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                {/* 下载按钮 */}
                <button
                    onClick={handleDownload}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-[10px] transition-colors backdrop-blur-sm"
                    title="下载图片"
                >
                    <Download className="w-5 h-5 text-white" />
                </button>

                {/* 关闭按钮 */}
                <button
                    onClick={onClose}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-[10px] transition-colors backdrop-blur-sm"
                    title="关闭 (ESC)"
                >
                    <X className="w-5 h-5 text-white" />
                </button>
            </div>

            {/* 图片容器 */}
            <div
                className="relative max-w-[95vw] max-h-[95vh] animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <img
                    src={src}
                    alt={alt || '图片预览'}
                    className="max-w-full max-h-[95vh] object-contain rounded-[10px] shadow-2xl"
                />

                {/* Alt 文字显示 */}
                {alt && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur-sm text-white text-sm px-4 py-2 rounded-b-lg">
                        {alt}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ImagePreview;
