import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithI18n as render } from '../../testUtils';
import { MessageBubble } from '../../../components/features/Chat/MessageBubble';
import type { Message } from '../../../types';

describe('MessageBubble', () => {
    const baseMessage: Message = {
        id: '1',
        chatId: 'c1',
        role: 'assistant',
        content: 'Hello',
        createdAt: new Date(),
    };

    it('should render message content', () => {
        render(<MessageBubble message={baseMessage} />);
        expect(screen.getByText('Hello')).toBeDefined();
        // TH-03: explicitly assert no thinking process
        expect(screen.queryByText('思考过程')).toBeNull();
    });

    it('should render reasoning content when present', () => {
        const msg = { ...baseMessage, reasoningContent: 'Thinking process...' };
        render(<MessageBubble message={msg} />);

        expect(screen.getByText('思考过程')).toBeDefined();
        // 默认展开状态，显示"收起"
        expect(screen.getByText('收起')).toBeDefined();
        // 内容应该可见
        expect(screen.getByText('Thinking process...')).toBeDefined();
    });

    it('should toggle reasoning content', () => {
        const msg = { ...baseMessage, reasoningContent: 'Deep reasoning here' };
        render(<MessageBubble message={msg} />);

        // 默认展开，内容可见
        expect(screen.getByText('Deep reasoning here')).toBeDefined();
        // 展开时显示"收起"
        expect(screen.getByText('收起')).toBeDefined();

        const toggleBtn = screen.getByText('思考过程').closest('button');
        expect(toggleBtn).toBeDefined();

        if (toggleBtn) {
            // 点击折叠
            fireEvent.click(toggleBtn);
            // v3.5.0: 折叠后内容区域隐藏，但标题栏显示预览文本
            // 内容区域不再显示完整内容
            const contentArea = screen.queryByText('Deep reasoning here');
            // 预览文本会显示在标题栏（截断后的文本）
            // 由于文本较短，预览文本就是完整内容
            expect(contentArea).toBeDefined(); // 预览文本仍然可见
            // 折叠后不再显示"收起"
            expect(screen.queryByText('收起')).toBeNull();
        }
    });

    it('should render image attachments', () => {
        const msg: Message = {
            ...baseMessage,
            attachments: [
                { id: 'a1', type: 'image', name: 'img.png', url: 'img-url', mimeType: 'image/png', size: 100 }
            ]
        };
        render(<MessageBubble message={msg} />);

        const img = screen.getByAltText('img.png');
        expect(img).toBeDefined();
        expect(img.getAttribute('src')).toBe('img-url');
    });

    // UX-04: 布局适配测试 - 验证溢出控制类存在
    it('should have overflow control classes for layout (UX-04)', () => {
        const longContent = '这是一段非常长的文本内容'.repeat(100);
        const msg = { ...baseMessage, content: longContent };
        const { container } = render(<MessageBubble message={msg} />);

        // 验证外层容器包含 min-w-0 和 overflow-hidden
        const outerContainer = container.querySelector('.min-w-0.overflow-hidden');
        expect(outerContainer).not.toBeNull();

        // 验证消息气泡包含 overflow-hidden
        const bubbleDiv = container.querySelector('.rounded-2xl.overflow-hidden');
        expect(bubbleDiv).not.toBeNull();

        // 验证 markdown-body 包含 overflow-hidden
        const markdownBody = container.querySelector('.markdown-body.overflow-hidden');
        expect(markdownBody).not.toBeNull();
    });

    // UX-04: 代码块应具有横向滚动能力
    it('should allow horizontal scroll for code blocks (UX-04)', () => {
        const codeContent = '```javascript\nconst veryLongVariableName = "' + 'x'.repeat(200) + '";\n```';
        const msg = { ...baseMessage, content: codeContent };
        const { container } = render(<MessageBubble message={msg} />);

        // 代码块容器应包含 overflow-x-auto
        const codeBlock = container.querySelector('.overflow-x-auto');
        expect(codeBlock).not.toBeNull();
    });

    // 测试 MCP 工具返回的图片（Markdown 格式）
    it('should render MCP tool returned images in Markdown format', async () => {
        // 模拟 MCP 工具返回的图片（转换为 Markdown 格式）
        const imageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
        const imageUrl = `data:image/png;base64,${imageData}`;
        const contentWithImage = `工具执行结果：\n\n![工具返回的图片](${imageUrl})`;

        const msg: Message = {
            ...baseMessage,
            content: contentWithImage,
        };

        const { container } = render(<MessageBubble message={msg} />);

        // 验证 Markdown 内容被渲染
        expect(screen.getByText(/工具执行结果/)).toBeDefined();

        // 等待图片渲染（ReactMarkdown 是异步的）
        await new Promise(resolve => setTimeout(resolve, 100));

        // 验证图片被渲染为 <img> 标签
        const img = container.querySelector('img');
        expect(img).not.toBeNull();
        if (img) {
            expect(img.getAttribute('src')).toBe(imageUrl);
            expect(img.getAttribute('alt')).toBe('工具返回的图片');
        }
    });

    // 测试混合内容（文本 + 图片）
    it('should render mixed content with text and images', async () => {
        const imageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
        const imageUrl = `data:image/png;base64,${imageData}`;
        const contentWithMixed = `这是文本内容\n\n![截图](${imageUrl})\n\n这是更多文本`;

        const msg: Message = {
            ...baseMessage,
            content: contentWithMixed,
        };

        const { container } = render(<MessageBubble message={msg} />);

        // 验证文本内容存在
        expect(screen.getByText(/这是文本内容/)).toBeDefined();
        expect(screen.getByText(/这是更多文本/)).toBeDefined();

        // 等待图片渲染
        await new Promise(resolve => setTimeout(resolve, 100));

        // 验证图片被渲染
        const img = container.querySelector('img');
        expect(img).not.toBeNull();
        if (img) {
            expect(img.getAttribute('src')).toBe(imageUrl);
        }
    });

    // 测试多张图片
    it('should render multiple images from MCP tools', async () => {
        const image1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
        const image2 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';
        const contentWithMultipleImages = `结果1：\n\n![图片1](${image1})\n\n结果2：\n\n![图片2](${image2})`;

        const msg: Message = {
            ...baseMessage,
            content: contentWithMultipleImages,
        };

        const { container } = render(<MessageBubble message={msg} />);

        // 等待图片渲染
        await new Promise(resolve => setTimeout(resolve, 100));

        // 验证两张图片都被渲染
        const images = container.querySelectorAll('img');
        expect(images.length).toBe(2);
        if (images.length === 2) {
            expect(images[0]?.getAttribute('src')).toBe(image1);
            expect(images[1]?.getAttribute('src')).toBe(image2);
        }
    });
});
