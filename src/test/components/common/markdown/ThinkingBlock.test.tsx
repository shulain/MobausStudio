/**
 * ThinkingBlock 组件测试
 *
 * 测试思考过程折叠组件的功能：
 * - 内容渲染
 * - 折叠/展开切换
 * - <think> 标签解析
 * - 复制功能
 *
 * @module test/components/common/markdown/ThinkingBlock.test
 */

import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithI18n as render } from '../../../testUtils';
import {
    ThinkingBlock,
    parseThinkingContent,
    removeThinkingTags,
} from '../../../../components/common/markdown';

describe('ThinkingBlock 组件', () => {
    // TB-01: 渲染思考内容
    it('TB-01: 有 content 时应该渲染思考过程区域', () => {
        render(<ThinkingBlock content="这是思考过程" />);

        expect(screen.getByText('思考过程')).toBeDefined();
        expect(screen.getByText('这是思考过程')).toBeDefined();
    });

    // TB-02: 无内容不渲染
    it('TB-02: 无 content 时不应该渲染任何内容', () => {
        const { container } = render(<ThinkingBlock content={undefined} />);

        expect(container.firstChild).toBeNull();
    });

    // TB-03: 解析 think 标签
    it('TB-03: 应该正确解析 rawContent 中的 <think> 标签', () => {
        render(<ThinkingBlock rawContent="<think>解析的思考内容</think>正常内容" />);

        expect(screen.getByText('思考过程')).toBeDefined();
        expect(screen.getByText('解析的思考内容')).toBeDefined();
    });

    // TB-04: 默认展开
    it('TB-04: defaultExpanded=true 时内容应该可见', () => {
        render(<ThinkingBlock content="展开的内容" defaultExpanded={true} />);

        expect(screen.getByText('展开的内容')).toBeDefined();
        expect(screen.getByText('收起')).toBeDefined();
    });

    // TB-05: 默认折叠
    it('TB-05: defaultExpanded=false 时内容应该隐藏', () => {
        render(<ThinkingBlock content="折叠的内容" defaultExpanded={false} />);

        // 折叠时显示预览文本，不显示"收起"
        expect(screen.queryByText('收起')).toBeNull();
        // 预览文本应该可见（短文本会完整显示）
        expect(screen.getByText('折叠的内容')).toBeDefined();
    });

    // TB-06: 切换折叠状态
    it('TB-06: 点击标题栏应该切换折叠状态', () => {
        render(<ThinkingBlock content="切换测试内容" defaultExpanded={true} />);

        // 初始展开，显示"收起"
        expect(screen.getByText('收起')).toBeDefined();

        // 点击折叠
        const toggleBtn = screen.getByText('思考过程').closest('button');
        expect(toggleBtn).toBeDefined();
        fireEvent.click(toggleBtn!);

        // 折叠后不显示"收起"
        expect(screen.queryByText('收起')).toBeNull();

        // 再次点击展开
        fireEvent.click(toggleBtn!);
        expect(screen.getByText('收起')).toBeDefined();
    });

    // TB-07: 复制功能
    it('TB-07: 点击复制按钮应该调用 onCopy 回调', async () => {
        const onCopy = vi.fn();
        // Mock clipboard API
        Object.assign(navigator, {
            clipboard: {
                writeText: vi.fn().mockResolvedValue(undefined),
            },
        });

        render(<ThinkingBlock content="要复制的内容" onCopy={onCopy} />);

        // 找到复制按钮（通过 title 属性）
        const copyBtn = screen.getByTitle('复制思考过程');
        expect(copyBtn).toBeDefined();

        fireEvent.click(copyBtn);

        // 等待异步操作
        await vi.waitFor(() => {
            expect(onCopy).toHaveBeenCalledWith('要复制的内容');
        });
    });

    // TB-08: 高度限制
    it('TB-08: 应该应用 maxHeight 样式', () => {
        const { container } = render(
            <ThinkingBlock content="长内容测试" maxHeight={200} defaultExpanded={true} />
        );

        // 查找内容区域
        const contentArea = container.querySelector('[style*="max-height"]');
        expect(contentArea).toBeDefined();
        expect(contentArea?.getAttribute('style')).toContain('200px');
    });

    // TB-09: 预览文本截断
    it('TB-09: 长思考内容折叠时应该显示截断的预览文本', () => {
        const longContent = '这是一段非常长的思考内容，超过50个字符后应该被截断显示省略号。这里继续添加更多内容来确保超过限制。';
        render(<ThinkingBlock content={longContent} defaultExpanded={false} />);

        // 折叠时标题栏会显示预览文本（前50字符 + ...）
        // 由于 CSS truncate 类会截断显示，但 DOM 中仍包含完整文本
        // 所以我们检查是否有 truncate 类
        const previewElement = screen.getByText(/这是一段非常长的思考内容/);
        expect(previewElement).toBeDefined();
        // 预览元素应该有 truncate 类
        expect(previewElement.className).toContain('truncate');
    });
});

describe('parseThinkingContent 工具函数', () => {
    it('应该正确解析 <think> 标签内容', () => {
        const result = parseThinkingContent('<think>思考内容</think>正常内容');
        expect(result).toBe('思考内容');
    });

    it('无 <think> 标签时应该返回 null', () => {
        const result = parseThinkingContent('没有思考标签的内容');
        expect(result).toBeNull();
    });

    it('空内容应该返回 null', () => {
        const result = parseThinkingContent('');
        expect(result).toBeNull();
    });

    it('应该处理多行思考内容', () => {
        const result = parseThinkingContent('<think>第一行\n第二行\n第三行</think>');
        expect(result).toBe('第一行\n第二行\n第三行');
    });
});

describe('removeThinkingTags 工具函数', () => {
    it('应该移除 <think> 标签及其内容', () => {
        const result = removeThinkingTags('<think>思考内容</think>正常内容');
        expect(result).toBe('正常内容');
    });

    it('无 <think> 标签时应该返回原内容', () => {
        const result = removeThinkingTags('没有思考标签的内容');
        expect(result).toBe('没有思考标签的内容');
    });

    it('空内容应该返回空字符串', () => {
        const result = removeThinkingTags('');
        expect(result).toBe('');
    });

    it('应该移除多个 <think> 标签', () => {
        const result = removeThinkingTags('<think>第一个</think>中间<think>第二个</think>结尾');
        expect(result).toBe('中间结尾');
    });
});
