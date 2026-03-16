/**
 * 共享 Markdown 渲染模块
 *
 * 提供统一的 Markdown 渲染组件和配置：
 * - CodeBlock: 代码块组件（语法高亮、复制、懒加载）
 * - ImageRenderer: 图片渲染组件（懒加载、点击放大、错误处理）
 * - LinkRenderer: 链接渲染组件（文件下载检测、外部链接图标）
 * - ThinkingBlock: 思考过程折叠组件
 * - createMarkdownComponents: Markdown 组件配置工厂
 *
 * @module components/common/markdown
 */

// 代码块组件
export { CodeBlock } from './CodeBlock';
export type { CodeBlockProps } from './CodeBlock';

// 图片渲染组件
export { ImageRenderer } from './ImageRenderer';
export type { ImageRendererProps } from './ImageRenderer';

// 链接渲染组件
export { LinkRenderer } from './LinkRenderer';
export type { LinkRendererProps } from './LinkRenderer';

// 思考过程折叠组件
export {
    ThinkingBlock,
    parseThinkingContent,
    removeThinkingTags,
} from './ThinkingBlock';
export type { ThinkingBlockProps } from './ThinkingBlock';

// Markdown 组件配置
export {
    createMarkdownComponents,
    defaultMarkdownComponents,
    simpleMarkdownComponents,
    defaultMarkdownOptions,
} from './markdownComponents';
export type { MarkdownOptions } from './markdownComponents';

// 文件工具函数
export {
    FILE_EXTENSIONS,
    isDownloadableFile,
    isImageUrl,
    getFileExtension,
    getFileName,
    getFileCategory,
} from './fileUtils';
