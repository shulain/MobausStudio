/**
 * 共享 Markdown 组件配置
 *
 * 提供统一的 Markdown 渲染配置：
 * - 代码块语法高亮
 * - 图片点击放大
 * - 链接文件下载检测
 * - 表格、列表等基础样式
 *
 * @module components/common/markdown/markdownComponents
 */

import type { ReactNode } from 'react';
import { CodeBlock } from './CodeBlock';
import { ImageRenderer } from './ImageRenderer';
import { LinkRenderer } from './LinkRenderer';

/**
 * react-markdown 组件 props 类型
 */
interface MarkdownComponentProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node?: any;
    children?: ReactNode;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

/**
 * 代码块组件 props
 */
interface CodeComponentProps extends MarkdownComponentProps {
    inline?: boolean;
    className?: string;
}

/**
 * 图片组件 props
 */
interface ImgComponentProps extends MarkdownComponentProps {
    src?: string;
    alt?: string;
}

/**
 * 链接组件 props
 */
interface AnchorComponentProps extends MarkdownComponentProps {
    href?: string;
}

/**
 * Markdown 渲染选项
 */
export interface MarkdownOptions {
    /** 是否启用代码语法高亮（默认 true） */
    enableCodeHighlight?: boolean;
    /** 是否启用代码复制按钮（默认 true） */
    enableCodeCopy?: boolean;
    /** 是否启用代码块懒加载（默认 true） */
    enableCodeLazyLoad?: boolean;
    /** 是否启用图片点击放大（默认 true） */
    enableImageZoom?: boolean;
    /** 是否启用图片懒加载（默认 true） */
    enableImageLazyLoad?: boolean;
    /** 图片最大高度（像素，默认 400） */
    maxImageHeight?: number;
    /** 是否启用文件下载检测（默认 true） */
    enableFileDownload?: boolean;
    /** 是否显示外部链接图标（默认 true） */
    showExternalLinkIcon?: boolean;
    /** 是否为用户消息（影响某些样式） */
    isUserMessage?: boolean;
}

/**
 * 默认 Markdown 渲染选项
 */
export const defaultMarkdownOptions: MarkdownOptions = {
    enableCodeHighlight: true,
    enableCodeCopy: true,
    enableCodeLazyLoad: true,
    enableImageZoom: true,
    enableImageLazyLoad: true,
    maxImageHeight: 400,
    enableFileDownload: true,
    showExternalLinkIcon: true,
    isUserMessage: false,
};

/**
 * 创建 Markdown 组件配置
 *
 * 用于 react-markdown 的 components 属性
 *
 * @param options - 渲染选项
 * @returns Markdown 组件配置对象
 *
 * @example
 * ```tsx
 * import { createMarkdownComponents } from './markdownComponents';
 *
 * const components = createMarkdownComponents({
 *     enableCodeHighlight: true,
 *     enableImageZoom: true,
 * });
 *
 * <ReactMarkdown components={components}>
 *     {content}
 * </ReactMarkdown>
 * ```
 */
export const createMarkdownComponents = (options?: MarkdownOptions) => {
    const opts = { ...defaultMarkdownOptions, ...options };

    return {
        /**
         * 代码块/行内代码渲染
         */
        code({ node: _node, inline, className, children, ...props }: CodeComponentProps) {
            const match = /language-(\w+)/.exec(className || '');
            const codeContent = String(children).replace(/\n$/, '');

            // 行内代码
            if (inline || !match) {
                return (
                    <code
                        className={`${className || ''} bg-gray-100 dark:bg-gray-700 rounded px-1 py-0.5 text-xs font-mono`}
                        {...props}
                    >
                        {children}
                    </code>
                );
            }

            // 代码块
            return (
                <CodeBlock
                    language={match[1]}
                    value={codeContent}
                    enableHighlight={opts.enableCodeHighlight}
                    enableCopy={opts.enableCodeCopy}
                    enableLazyLoad={opts.enableCodeLazyLoad}
                />
            );
        },

        /**
         * 图片渲染
         */
        img({ node: _node, ...props }: ImgComponentProps) {
            return (
                <ImageRenderer
                    src={props.src}
                    alt={props.alt}
                    enableZoom={opts.enableImageZoom}
                    enableLazyLoad={opts.enableImageLazyLoad}
                    maxHeight={opts.maxImageHeight}
                />
            );
        },

        /**
         * 链接渲染
         */
        a({ node: _node, children, ...props }: AnchorComponentProps) {
            return (
                <LinkRenderer
                    href={props.href}
                    enableFileDownload={opts.enableFileDownload}
                    showExternalIcon={opts.showExternalLinkIcon}
                >
                    {children}
                </LinkRenderer>
            );
        },

        /**
         * 无序列表
         */
        ul({ node: _node, ...props }: MarkdownComponentProps) {
            return (
                <ul
                    className="list-disc list-inside space-y-1 my-1"
                    {...props}
                />
            );
        },

        /**
         * 有序列表
         */
        ol({ node: _node, ...props }: MarkdownComponentProps) {
            return (
                <ol
                    className="list-decimal list-inside space-y-1 my-1"
                    {...props}
                />
            );
        },

        /**
         * 段落
         */
        p({ node: _node, ...props }: MarkdownComponentProps) {
            return (
                <p
                    className="mb-2 last:mb-0 leading-relaxed"
                    {...props}
                />
            );
        },

        /**
         * 预格式化文本（非代码块的 pre）
         */
        pre({ node: _node, ...props }: MarkdownComponentProps) {
            return (
                <div className="overflow-x-auto my-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-[10px]">
                    <pre
                        className="font-mono text-xs whitespace-pre-wrap break-all"
                        {...props}
                    />
                </div>
            );
        },

        /**
         * 表格容器
         */
        table({ node: _node, ...props }: MarkdownComponentProps) {
            return (
                <div className="overflow-x-auto my-4 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700">
                    <table
                        className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-[10px] overflow-hidden"
                        {...props}
                    />
                </div>
            );
        },

        /**
         * 表头
         */
        thead({ node: _node, ...props }: MarkdownComponentProps) {
            return (
                <thead
                    className="bg-gray-50 dark:bg-gray-800"
                    {...props}
                />
            );
        },

        /**
         * 表体
         */
        tbody({ node: _node, ...props }: MarkdownComponentProps) {
            return (
                <tbody
                    className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700"
                    {...props}
                />
            );
        },

        /**
         * 表格行
         */
        tr({ node: _node, ...props }: MarkdownComponentProps) {
            return (
                <tr
                    className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    {...props}
                />
            );
        },

        /**
         * 表头单元格
         */
        th({ node: _node, ...props }: MarkdownComponentProps) {
            return (
                <th
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700"
                    {...props}
                />
            );
        },

        /**
         * 表格单元格
         */
        td({ node: _node, ...props }: MarkdownComponentProps) {
            return (
                <td
                    className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-gray-800 last:border-0"
                    {...props}
                />
            );
        },

        /**
         * 引用块
         */
        blockquote({ node: _node, ...props }: MarkdownComponentProps) {
            return (
                <blockquote
                    className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 my-2 italic text-gray-600 dark:text-gray-400"
                    {...props}
                />
            );
        },

        /**
         * 水平分割线
         */
        hr({ node: _node, ...props }: MarkdownComponentProps) {
            return (
                <hr
                    className="my-4 border-gray-200 dark:border-gray-700"
                    {...props}
                />
            );
        },

        /**
         * 标题 h1
         */
        h1({ node: _node, ...props }: MarkdownComponentProps) {
            return (
                <h1
                    className="text-2xl font-bold mt-4 mb-2"
                    {...props}
                />
            );
        },

        /**
         * 标题 h2
         */
        h2({ node: _node, ...props }: MarkdownComponentProps) {
            return (
                <h2
                    className="text-xl font-bold mt-3 mb-2"
                    {...props}
                />
            );
        },

        /**
         * 标题 h3
         */
        h3({ node: _node, ...props }: MarkdownComponentProps) {
            return (
                <h3
                    className="text-lg font-bold mt-2 mb-1"
                    {...props}
                />
            );
        },

        /**
         * 标题 h4
         */
        h4({ node: _node, ...props }: MarkdownComponentProps) {
            return (
                <h4
                    className="text-base font-bold mt-2 mb-1"
                    {...props}
                />
            );
        },

        /**
         * 强调（斜体）
         */
        em({ node: _node, ...props }: MarkdownComponentProps) {
            return (
                <em
                    className="italic"
                    {...props}
                />
            );
        },

        /**
         * 加粗
         */
        strong({ node: _node, ...props }: MarkdownComponentProps) {
            return (
                <strong
                    className="font-bold"
                    {...props}
                />
            );
        },

        /**
         * 删除线
         */
        del({ node: _node, ...props }: MarkdownComponentProps) {
            return (
                <del
                    className="line-through text-gray-500"
                    {...props}
                />
            );
        },
    };
};

/**
 * 预创建的默认 Markdown 组件配置
 *
 * 适用于大多数场景，避免每次渲染都创建新对象
 */
export const defaultMarkdownComponents = createMarkdownComponents();

/**
 * 预创建的简化 Markdown 组件配置
 *
 * 禁用高级功能，适用于性能敏感场景
 */
export const simpleMarkdownComponents = createMarkdownComponents({
    enableCodeHighlight: false,
    enableCodeLazyLoad: false,
    enableImageZoom: false,
    enableFileDownload: false,
    showExternalLinkIcon: false,
});

export default createMarkdownComponents;
