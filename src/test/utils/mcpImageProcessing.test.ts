/**
 * MCP 工具图片处理测试
 *
 * 测试 MCP 工具返回的图片内容是否正确转换为 Markdown 格式
 */

import { describe, it, expect } from 'vitest';

describe('MCP Image Processing', () => {
    /**
     * 模拟 App.tsx 中的图片处理逻辑
     */
    const processMCPToolResult = (content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>) => {
        const toolResultParts: string[] = [];
        for (const c of content) {
            if (c.type === 'text' && c.text) {
                toolResultParts.push(c.text);
            } else if (c.type === 'image' && c.data && c.mimeType) {
                // 将图片转换为 Markdown 格式
                const imageUrl = `data:${c.mimeType};base64,${c.data}`;
                toolResultParts.push(`![工具返回的图片](${imageUrl})`);
            }
        }
        return toolResultParts.join('\n\n');
    };

    it('should convert text content to plain text', () => {
        const content = [
            { type: 'text', text: '这是文本结果' }
        ];

        const result = processMCPToolResult(content);
        expect(result).toBe('这是文本结果');
    });

    it('should convert image content to Markdown format', () => {
        const imageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
        const content = [
            { type: 'image', data: imageData, mimeType: 'image/png' }
        ];

        const result = processMCPToolResult(content);
        expect(result).toBe(`![工具返回的图片](data:image/png;base64,${imageData})`);
    });

    it('should handle mixed text and image content', () => {
        const imageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
        const content = [
            { type: 'text', text: '截图如下：' },
            { type: 'image', data: imageData, mimeType: 'image/png' },
            { type: 'text', text: '以上是结果' }
        ];

        const result = processMCPToolResult(content);
        const expected = `截图如下：\n\n![工具返回的图片](data:image/png;base64,${imageData})\n\n以上是结果`;
        expect(result).toBe(expected);
    });

    it('should handle multiple images', () => {
        const image1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
        const image2 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';
        const content = [
            { type: 'image', data: image1, mimeType: 'image/png' },
            { type: 'image', data: image2, mimeType: 'image/jpeg' }
        ];

        const result = processMCPToolResult(content);
        const expected = `![工具返回的图片](data:image/png;base64,${image1})\n\n![工具返回的图片](data:image/jpeg;base64,${image2})`;
        expect(result).toBe(expected);
    });

    it('should ignore invalid content types', () => {
        const content = [
            { type: 'text', text: '有效文本' },
            { type: 'unknown', data: 'some data' } as any,
            { type: 'image' }, // 缺少 data 和 mimeType
            { type: 'text' }, // 缺少 text
        ];

        const result = processMCPToolResult(content);
        expect(result).toBe('有效文本');
    });

    it('should handle empty content array', () => {
        const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [];

        const result = processMCPToolResult(content);
        expect(result).toBe('');
    });

    it('should preserve different image MIME types', () => {
        const testCases = [
            { mimeType: 'image/png', data: 'png-data' },
            { mimeType: 'image/jpeg', data: 'jpeg-data' },
            { mimeType: 'image/gif', data: 'gif-data' },
            { mimeType: 'image/webp', data: 'webp-data' },
        ];

        for (const testCase of testCases) {
            const content = [{ type: 'image', ...testCase }];
            const result = processMCPToolResult(content);
            expect(result).toContain(`data:${testCase.mimeType};base64,${testCase.data}`);
        }
    });
});
