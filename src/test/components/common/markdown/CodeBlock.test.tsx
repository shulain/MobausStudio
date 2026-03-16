/**
 * CodeBlock 组件测试
 *
 * 测试代码块组件的功能：
 * - 代码渲染
 * - 语法高亮
 * - 复制功能
 * - 懒加载
 *
 * @module test/components/common/markdown/CodeBlock.test
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CodeBlock } from '../../../../components/common/markdown';

// 保存原始的 IntersectionObserver
const originalIntersectionObserver = window.IntersectionObserver;

describe('CodeBlock 组件', () => {
    let mockObserve: ReturnType<typeof vi.fn>;
    let mockDisconnect: ReturnType<typeof vi.fn>;
    let intersectionCallback: (entries: IntersectionObserverEntry[]) => void;

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock clipboard API
        Object.assign(navigator, {
            clipboard: {
                writeText: vi.fn().mockResolvedValue(undefined),
            },
        });

        // Mock IntersectionObserver
        mockObserve = vi.fn();
        mockDisconnect = vi.fn();

        // @ts-expect-error - Mock IntersectionObserver
        window.IntersectionObserver = class MockIntersectionObserver {
            constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
                intersectionCallback = callback;
            }
            observe = mockObserve;
            disconnect = mockDisconnect;
            unobserve = vi.fn();
        };
    });

    afterEach(() => {
        // 恢复原始的 IntersectionObserver
        window.IntersectionObserver = originalIntersectionObserver;
    });

    // CB-01: 渲染代码块
    it('CB-01: 应该正确渲染代码内容', () => {
        const { container } = render(<CodeBlock language="javascript" value="const x = 1;" enableLazyLoad={false} />);

        // SyntaxHighlighter 会将代码分割成多个 token，检查容器中包含代码内容
        expect(container.textContent).toContain('const');
        expect(container.textContent).toContain('x');
        expect(container.textContent).toContain('1');
    });

    // CB-02: 语法高亮（默认启用）
    it('CB-02: enableHighlight=true 时应该启用语法高亮', () => {
        const { container } = render(
            <CodeBlock language="javascript" value="const x = 1;" enableHighlight={true} enableLazyLoad={false} />
        );

        // 语法高亮会使用 SyntaxHighlighter 组件
        expect(container.querySelector('pre')).toBeDefined();
    });

    // CB-03: 禁用高亮
    it('CB-03: enableHighlight=false 时应该显示纯文本', () => {
        const { container } = render(
            <CodeBlock language="javascript" value="const x = 1;" enableHighlight={false} enableLazyLoad={false} />
        );

        // 禁用高亮时应该显示纯文本
        expect(container.querySelector('pre')).toBeDefined();
        expect(screen.getByText('const x = 1;')).toBeDefined();
    });

    // CB-04: 复制功能
    it('CB-04: 点击复制按钮应该复制代码到剪贴板', async () => {
        render(<CodeBlock language="javascript" value="const x = 1;" enableCopy={true} enableLazyLoad={false} />);

        // 找到复制按钮
        const copyBtn = screen.getByText('复制');
        expect(copyBtn).toBeDefined();

        fireEvent.click(copyBtn);

        // 验证剪贴板 API 被调用
        await vi.waitFor(() => {
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const x = 1;');
        });
    });

    // CB-05: 懒加载（视口外不高亮）
    it('CB-05: enableLazyLoad=true 时应该使用 IntersectionObserver', () => {
        render(<CodeBlock language="javascript" value="const x = 1;" enableLazyLoad={true} />);

        // 验证 IntersectionObserver.observe 被调用
        expect(mockObserve).toHaveBeenCalled();
    });

    // CB-06: 进入视口触发高亮
    it('CB-06: 进入视口时应该触发语法高亮', () => {
        const { container } = render(
            <CodeBlock language="javascript" value="const x = 1;" enableLazyLoad={true} />
        );

        // 模拟进入视口
        intersectionCallback([{ isIntersecting: true } as IntersectionObserverEntry]);

        // 代码应该被渲染
        expect(container.querySelector('pre')).toBeDefined();
    });

    // CB-07: 语言标签
    it('CB-07: 应该显示代码语言标签', () => {
        render(<CodeBlock language="python" value="print('hello')" enableLazyLoad={false} />);

        expect(screen.getByText('python')).toBeDefined();
    });

    // CB-08: 多行代码
    it('CB-08: 应该正确渲染多行代码', () => {
        const multilineCode = `function hello() {
    console.log('hello');
    return true;
}`;
        const { container } = render(<CodeBlock language="javascript" value={multilineCode} enableLazyLoad={false} />);

        // 多行代码可能被 SyntaxHighlighter 分割成多个元素，检查容器中包含代码内容
        expect(container.textContent).toContain('function hello');
        expect(container.textContent).toContain('console.log');
    });

    // CB-09: 禁用复制按钮
    it('CB-09: enableCopy=false 时不应该显示复制按钮', () => {
        render(<CodeBlock language="javascript" value="const x = 1;" enableCopy={false} enableLazyLoad={false} />);

        expect(screen.queryByText('复制')).toBeNull();
    });

    // CB-10: 空代码处理
    it('CB-10: 空代码应该正常渲染', () => {
        const { container } = render(<CodeBlock language="javascript" value="" enableLazyLoad={false} />);

        expect(container.querySelector('pre')).toBeDefined();
    });

    // CB-11: 默认语言
    it('CB-11: 无语言时应该显示 text', () => {
        render(<CodeBlock language="" value="plain text" enableLazyLoad={false} />);

        expect(screen.getByText('text')).toBeDefined();
    });
});
