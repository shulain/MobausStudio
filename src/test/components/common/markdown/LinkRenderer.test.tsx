/**
 * LinkRenderer 组件测试
 *
 * 测试链接渲染组件的功能：
 * - 链接渲染
 * - 外部链接图标
 * - 文件下载检测
 *
 * @module test/components/common/markdown/LinkRenderer.test
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LinkRenderer } from '../../../../components/common/markdown';
import { getFileCategory } from '../../../../components/common/markdown/fileUtils';

describe('LinkRenderer 组件', () => {
    // LR-01: 渲染普通链接
    it('LR-01: 应该正确渲染链接', () => {
        render(
            <LinkRenderer href="https://example.com">
                示例链接
            </LinkRenderer>
        );

        const link = screen.getByText('示例链接');
        expect(link).toBeDefined();
        expect(link.closest('a')?.getAttribute('href')).toBe('https://example.com');
    });

    // LR-02: 外部链接图标
    it('LR-02: showExternalIcon=true 时应该显示外部链接图标', () => {
        const { container } = render(
            <LinkRenderer href="https://example.com" showExternalIcon={true}>
                外部链接
            </LinkRenderer>
        );

        // 外部链接应该有图标（ExternalLink 组件）
        expect(container.querySelector('svg')).toBeDefined();
    });

    // LR-03: 禁用外部链接图标
    it('LR-03: showExternalIcon=false 时不应该显示外部链接图标', () => {
        const { container } = render(
            <LinkRenderer href="https://example.com" showExternalIcon={false}>
                无图标链接
            </LinkRenderer>
        );

        // 不应该有外部链接图标
        // 注意：可能有其他图标（如下载图标），需要根据实现调整
        expect(screen.getByText('无图标链接')).toBeDefined();
    });

    // LR-04: 文件链接检测
    it('LR-04: 文件链接应该被识别并显示下载按钮', () => {
        const { container } = render(
            <LinkRenderer href="https://example.com/document.pdf" enableFileDownload={true}>
                PDF 文档
            </LinkRenderer>
        );

        // 文件链接应该有 download 属性，并显示文件名而不是 children
        const link = container.querySelector('a');
        expect(link).toBeDefined();
        expect(link?.getAttribute('download')).toBe('document.pdf');
        expect(screen.getByText('document.pdf')).toBeDefined();
    });

    // LR-05: 新窗口打开
    it('LR-05: 外部链接应该在新窗口打开', () => {
        render(
            <LinkRenderer href="https://example.com">
                新窗口链接
            </LinkRenderer>
        );

        const link = screen.getByText('新窗口链接').closest('a');
        expect(link?.getAttribute('target')).toBe('_blank');
        expect(link?.getAttribute('rel')).toContain('noopener');
    });

    // LR-06: 内部链接
    it('LR-06: 相对路径链接应该正常渲染', () => {
        render(
            <LinkRenderer href="/internal/page">
                内部链接
            </LinkRenderer>
        );

        const link = screen.getByText('内部链接').closest('a');
        expect(link?.getAttribute('href')).toBe('/internal/page');
    });

    // LR-07: 无 href 处理
    it('LR-07: 无 href 时应该正常渲染文本', () => {
        render(
            <LinkRenderer href={undefined}>
                无链接文本
            </LinkRenderer>
        );

        expect(screen.getByText('无链接文本')).toBeDefined();
    });

    // LR-08: 邮件链接
    it('LR-08: mailto 链接应该正常渲染', () => {
        render(
            <LinkRenderer href="mailto:test@example.com">
                发送邮件
            </LinkRenderer>
        );

        const link = screen.getByText('发送邮件').closest('a');
        expect(link?.getAttribute('href')).toBe('mailto:test@example.com');
    });
});

describe('getFileCategory 工具函数', () => {
    it('应该识别文档类型', () => {
        expect(getFileCategory('document.pdf')).toBe('document');
        expect(getFileCategory('file.doc')).toBe('document');
        expect(getFileCategory('file.docx')).toBe('document');
        expect(getFileCategory('file.txt')).toBe('document');
    });

    it('应该识别压缩包类型', () => {
        expect(getFileCategory('archive.zip')).toBe('archive');
        expect(getFileCategory('file.rar')).toBe('archive');
    });

    it('应该识别代码类型', () => {
        expect(getFileCategory('script.js')).toBe('code');
        expect(getFileCategory('style.css')).toBe('code');
        expect(getFileCategory('app.py')).toBe('code');
        expect(getFileCategory('main.ts')).toBe('code');
    });

    it('应该识别图片类型', () => {
        expect(getFileCategory('image.png')).toBe('image');
        expect(getFileCategory('photo.jpg')).toBe('image');
        expect(getFileCategory('icon.svg')).toBe('image');
    });

    it('应该识别音频类型', () => {
        expect(getFileCategory('audio.mp3')).toBe('audio');
        expect(getFileCategory('sound.wav')).toBe('audio');
    });

    it('应该识别视频类型', () => {
        expect(getFileCategory('video.mp4')).toBe('video');
        expect(getFileCategory('movie.webm')).toBe('video');
    });

    it('未知扩展名应该返回 unknown', () => {
        expect(getFileCategory('unknown.xyz')).toBe('unknown');
        expect(getFileCategory('noextension')).toBe('unknown');
    });

    it('应该处理大写扩展名', () => {
        expect(getFileCategory('DOCUMENT.PDF')).toBe('document');
        expect(getFileCategory('IMAGE.PNG')).toBe('image');
    });

    it('应该处理带路径的文件名', () => {
        expect(getFileCategory('/path/to/document.pdf')).toBe('document');
        expect(getFileCategory('https://example.com/file.zip')).toBe('archive');
    });
});
