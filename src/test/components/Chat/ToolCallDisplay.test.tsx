/**
 * ToolCallDisplay 组件单元测试 (v2.1.0, v2.4.0, v2.5.0)
 *
 * 测试工具调用 UI 展示组件
 */

import React from 'react';

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ToolCallDisplay, ToolCallList } from '../../../components/features/Chat/ToolCallDisplay';
import { containsMarkdownImage } from '../../../components/features/Chat/ToolCallDisplay';
import { I18nProvider } from '../../../i18n';
import type { ToolCall, ToolResult } from '../../../types';

/** 包裹 I18nProvider 的渲染辅助函数（v2.6.0: ToolCallList 使用了 useI18n） */
function renderWithI18n(component: React.ReactElement) {
    return render(<I18nProvider>{component}</I18nProvider>);
}

// 测试数据
const mockToolCall: ToolCall = {
    id: 'call-1',
    name: 'read_file',
    arguments: '{"path":"/tmp/test.txt"}',
    serverId: 'filesystem',
};

// v2.5.0: 带 serverName 的工具调用
const mockToolCallWithServerName: ToolCall = {
    id: 'call-2',
    name: 'read_file',
    arguments: '{"path":"/tmp/test.txt"}',
    serverId: 'fs-server',
    serverName: '文件系统',
};

const mockSuccessResult: ToolResult = {
    callId: 'call-1',
    content: 'Hello World',
    isError: false,
};

const mockErrorResult: ToolResult = {
    callId: 'call-1',
    content: '文件不存在: /tmp/test.txt',
    isError: true,
};

// v2.4.0: 带耗时的结果
const mockResultWithDuration: ToolResult = {
    callId: 'call-1',
    content: 'Hello World',
    isError: false,
    duration: 1234,
};

const mockResultWithShortDuration: ToolResult = {
    callId: 'call-1',
    content: 'Hello World',
    isError: false,
    duration: 456,
};

describe('ToolCallDisplay', () => {
    describe('状态显示', () => {
        it('显示执行中状态', () => {
            renderWithI18n(
                <ToolCallDisplay
                    toolCall={mockToolCall}
                    isExecuting={true}
                />
            );

            expect(screen.getByText('read_file')).toBeInTheDocument();
            expect(screen.getByText('执行中...')).toBeInTheDocument();
            expect(screen.getByText('(filesystem)')).toBeInTheDocument();
        });

        it('显示成功状态和结果', () => {
            renderWithI18n(
                <ToolCallDisplay
                    toolCall={mockToolCall}
                    result={mockSuccessResult}
                />
            );

            expect(screen.getByText('read_file')).toBeInTheDocument();
            expect(screen.getByText('执行成功')).toBeInTheDocument();
        });

        it('显示错误状态', () => {
            renderWithI18n(
                <ToolCallDisplay
                    toolCall={mockToolCall}
                    result={mockErrorResult}
                />
            );

            expect(screen.getByText('read_file')).toBeInTheDocument();
            expect(screen.getByText('执行失败')).toBeInTheDocument();
        });
    });

    describe('交互功能', () => {
        it('可折叠/展开详情', async () => {
            renderWithI18n(
                <ToolCallDisplay
                    toolCall={mockToolCall}
                    result={mockSuccessResult}
                />
            );

            // v2.4.0: 有结果时默认展开，显示参数
            await waitFor(() => {
                expect(screen.getByText('参数:')).toBeInTheDocument();
            });

            // 点击收起
            const button = screen.getByRole('button');
            fireEvent.click(button);

            // 收起后不显示参数
            expect(screen.queryByText('参数:')).not.toBeInTheDocument();

            // 再次点击展开
            fireEvent.click(button);
            expect(screen.getByText('参数:')).toBeInTheDocument();
            expect(screen.getByText('结果:')).toBeInTheDocument();
            expect(screen.getByText('Hello World')).toBeInTheDocument();
        });

        it('正确显示工具参数', async () => {
            renderWithI18n(
                <ToolCallDisplay
                    toolCall={mockToolCall}
                    result={mockSuccessResult}
                />
            );

            // v2.4.0: 有结果时默认展开
            await waitFor(() => {
                // 检查格式化后的参数
                expect(screen.getByText(/\/tmp\/test\.txt/)).toBeInTheDocument();
            });
        });

        it('错误状态显示错误标签', async () => {
            renderWithI18n(
                <ToolCallDisplay
                    toolCall={mockToolCall}
                    result={mockErrorResult}
                />
            );

            // v2.4.0: 有结果时默认展开
            await waitFor(() => {
                // 检查错误标签
                expect(screen.getByText('错误:')).toBeInTheDocument();
                expect(screen.getByText(/文件不存在/)).toBeInTheDocument();
            });
        });
    });

    // v2.4.0: 增强展示测试
    describe('v2.4.0 增强展示', () => {
        it('MCP-79: 执行完成后默认展开', async () => {
            renderWithI18n(
                <ToolCallDisplay
                    toolCall={mockToolCall}
                    result={mockSuccessResult}
                />
            );

            // 有结果时应自动展开，显示参数和结果
            await waitFor(() => {
                expect(screen.getByText('参数:')).toBeInTheDocument();
                expect(screen.getByText('结果:')).toBeInTheDocument();
            });
        });

        it('MCP-79a: 执行中默认展开显示参数', () => {
            renderWithI18n(
                <ToolCallDisplay
                    toolCall={mockToolCall}
                    isExecuting={true}
                />
            );

            // v4.1.31: 执行中时也默认展开，显示参数
            expect(screen.queryByText('参数:')).toBeInTheDocument();
        });

        it('MCP-79b: 显示执行耗时（秒）', async () => {
            renderWithI18n(
                <ToolCallDisplay
                    toolCall={mockToolCall}
                    result={mockResultWithDuration}
                />
            );

            // 1234ms 应显示为 1.23s
            await waitFor(() => {
                expect(screen.getByText('1.23s')).toBeInTheDocument();
            });
        });

        it('MCP-79b: 显示执行耗时（毫秒）', async () => {
            renderWithI18n(
                <ToolCallDisplay
                    toolCall={mockToolCall}
                    result={mockResultWithShortDuration}
                />
            );

            // 456ms 应显示为 456ms
            await waitFor(() => {
                expect(screen.getByText('456ms')).toBeInTheDocument();
            });
        });

        it('MCP-79c: 耗时未知不显示', async () => {
            renderWithI18n(
                <ToolCallDisplay
                    toolCall={mockToolCall}
                    result={mockSuccessResult}
                />
            );

            // 没有 duration 字段时不显示耗时
            await waitFor(() => {
                expect(screen.queryByText(/ms$/)).not.toBeInTheDocument();
                expect(screen.queryByText(/s$/)).not.toBeInTheDocument();
            });
        });
    });

    // v2.5.0: serverName 显示测试
    describe('v2.5.0 serverName 显示', () => {
        it('MCP-81a: 优先显示 serverName', () => {
            renderWithI18n(
                <ToolCallDisplay
                    toolCall={mockToolCallWithServerName}
                    isExecuting={true}
                />
            );

            // 应显示服务器名称而非 ID
            expect(screen.getByText('(文件系统)')).toBeInTheDocument();
            expect(screen.queryByText('(fs-server)')).not.toBeInTheDocument();
        });

        it('MCP-81b: serverName 为空时回退显示 serverId', () => {
            renderWithI18n(
                <ToolCallDisplay
                    toolCall={mockToolCall}
                    isExecuting={true}
                />
            );

            // 没有 serverName 时应显示 serverId
            expect(screen.getByText('(filesystem)')).toBeInTheDocument();
        });

        it('MCP-81c: serverName 在成功状态下正确显示', async () => {
            const resultWithServerName: ToolResult = {
                callId: 'call-2',
                content: '文件内容',
                isError: false,
            };

            renderWithI18n(
                <ToolCallDisplay
                    toolCall={mockToolCallWithServerName}
                    result={resultWithServerName}
                />
            );

            // 成功状态下也应显示服务器名称
            await waitFor(() => {
                expect(screen.getByText('(文件系统)')).toBeInTheDocument();
                expect(screen.getByText('执行成功')).toBeInTheDocument();
            });
        });
    });
});

describe('ToolCallList', () => {
    it('渲染多个工具调用', () => {
        const toolCalls: ToolCall[] = [
            mockToolCall,
            {
                id: 'call-2',
                name: 'write_file',
                arguments: '{"path":"/tmp/out.txt","content":"test"}',
                serverId: 'filesystem',
            },
        ];

        renderWithI18n(<ToolCallList toolCalls={toolCalls} />);

        expect(screen.getByText('read_file')).toBeInTheDocument();
        expect(screen.getByText('write_file')).toBeInTheDocument();
    });

    it('显示部分完成的结果', () => {
        const toolCalls: ToolCall[] = [
            mockToolCall,
            {
                id: 'call-2',
                name: 'write_file',
                arguments: '{}',
                serverId: 'filesystem',
            },
        ];

        const results = new Map<string, ToolResult>([
            ['call-1', mockSuccessResult],
        ]);

        renderWithI18n(
            <ToolCallList
                toolCalls={toolCalls}
                results={results}
            />
        );

        // 第一个应该显示成功，第二个显示执行中
        expect(screen.getByText('执行成功')).toBeInTheDocument();
        expect(screen.getByText('执行中...')).toBeInTheDocument();
    });

    it('空列表不渲染任何内容', () => {
        const { container } = renderWithI18n(<ToolCallList toolCalls={[]} />);
        expect(container.firstChild).toBeNull();
    });

    it('处理执行中状态', () => {
        const executingIds = new Set(['call-1']);

        renderWithI18n(
            <ToolCallList
                toolCalls={[mockToolCall]}
                executingIds={executingIds}
            />
        );

        expect(screen.getByText('执行中...')).toBeInTheDocument();
    });

    // v2.6.0: 进度摘要测试
    it('多工具调用显示进度摘要', () => {
        const toolCalls: ToolCall[] = [
            mockToolCall,
            {
                id: 'call-2',
                name: 'write_file',
                arguments: '{}',
                serverId: 'filesystem',
            },
            {
                id: 'call-3',
                name: 'list_files',
                arguments: '{}',
                serverId: 'filesystem',
            },
        ];

        const results = new Map<string, ToolResult>([
            ['call-1', mockSuccessResult],
        ]);

        renderWithI18n(
            <ToolCallList
                toolCalls={toolCalls}
                results={results}
            />
        );

        // 应显示进度摘要 "工具调用 (1/3)"
        expect(screen.getByText(/1\/3/)).toBeInTheDocument();
    });

    it('全部完成时显示完成摘要', () => {
        const toolCalls: ToolCall[] = [
            mockToolCall,
            {
                id: 'call-2',
                name: 'write_file',
                arguments: '{}',
                serverId: 'filesystem',
            },
        ];

        const results = new Map<string, ToolResult>([
            ['call-1', mockSuccessResult],
            ['call-2', { callId: 'call-2', content: 'ok', isError: false }],
        ]);

        renderWithI18n(
            <ToolCallList
                toolCalls={toolCalls}
                results={results}
            />
        );

        // 应显示完成摘要 "2/2"
        expect(screen.getByText(/2\/2/)).toBeInTheDocument();
    });

    it('单个工具调用不显示进度摘要', () => {
        renderWithI18n(
            <ToolCallList
                toolCalls={[mockToolCall]}
            />
        );

        // 只有 1 个工具调用时不应显示进度摘要
        expect(screen.queryByText(/\/1/)).not.toBeInTheDocument();
    });
});

// v4.2.2: 图片渲染测试
describe('ToolCallDisplay 图片渲染 (v4.2.2)', () => {
    // 1x1 像素的 PNG base64
    const imageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
    const imageUrl = `data:image/png;base64,${imageData}`;

    describe('containsMarkdownImage 辅助函数', () => {
        it('应该检测到 base64 图片 markdown', () => {
            expect(containsMarkdownImage(`![图片](${imageUrl})`)).toBe(true);
        });

        it('应该检测到混合内容中的图片', () => {
            expect(containsMarkdownImage(`文本内容\n\n![图片](${imageUrl})\n\n更多文本`)).toBe(true);
        });

        it('应该对纯文本返回 false', () => {
            expect(containsMarkdownImage('Hello World')).toBe(false);
        });

        it('应该对 JSON 内容返回 false', () => {
            expect(containsMarkdownImage('{"key": "value"}')).toBe(false);
        });

        it('应该对普通 URL 图片返回 false', () => {
            expect(containsMarkdownImage('![图片](https://example.com/img.png)')).toBe(false);
        });
    });

    it('MCP-IMG-01: 工具结果包含 base64 图片应渲染为 img 标签', async () => {
        const resultWithImage: ToolResult = {
            callId: 'call-1',
            content: `![工具返回的图片](${imageUrl})`,
            isError: false,
        };

        const { container } = renderWithI18n(
            <ToolCallDisplay
                toolCall={mockToolCall}
                result={resultWithImage}
            />
        );

        // 等待 ReactMarkdown 渲染
        await waitFor(() => {
            const img = container.querySelector('img');
            expect(img).not.toBeNull();
            expect(img?.getAttribute('src')).toBe(imageUrl);
        });
    });

    it('MCP-IMG-02: 工具结果包含文本和图片混合内容', async () => {
        const resultWithMixed: ToolResult = {
            callId: 'call-1',
            content: `请扫码登录 👇\n\n![工具返回的图片](${imageUrl})`,
            isError: false,
        };

        const { container } = renderWithI18n(
            <ToolCallDisplay
                toolCall={mockToolCall}
                result={resultWithMixed}
            />
        );

        await waitFor(() => {
            // 验证文本存在
            expect(screen.getByText(/请扫码登录/)).toBeInTheDocument();
            // 验证图片渲染
            const img = container.querySelector('img');
            expect(img).not.toBeNull();
            expect(img?.getAttribute('src')).toBe(imageUrl);
        });
    });

    it('MCP-IMG-03: 纯文本结果保持 pre 标签渲染', async () => {
        const { container } = renderWithI18n(
            <ToolCallDisplay
                toolCall={mockToolCall}
                result={mockSuccessResult}
            />
        );

        await waitFor(() => {
            // 结果区域应使用 pre 标签渲染（第二个 pre 是结果，第一个是参数）
            const pres = container.querySelectorAll('pre');
            const resultPre = pres[pres.length - 1];
            expect(resultPre).toBeDefined();
            expect(resultPre?.textContent).toContain('Hello World');
            // 不应有 img 标签
            expect(container.querySelector('img')).toBeNull();
        });
    });

    it('MCP-IMG-04: 多张图片都应渲染为 img 标签', async () => {
        const image2 = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
        const resultWithMultipleImages: ToolResult = {
            callId: 'call-1',
            content: `![图片1](${imageUrl})\n\n![图片2](${image2})`,
            isError: false,
        };

        const { container } = renderWithI18n(
            <ToolCallDisplay
                toolCall={mockToolCall}
                result={resultWithMultipleImages}
            />
        );

        await waitFor(() => {
            const images = container.querySelectorAll('img');
            expect(images.length).toBe(2);
        });
    });

    it('MCP-IMG-05: 错误结果不渲染图片（保持 pre 标签）', async () => {
        const errorResultWithImage: ToolResult = {
            callId: 'call-1',
            content: `错误 ![图片](${imageUrl})`,
            isError: true,
        };

        const { container } = renderWithI18n(
            <ToolCallDisplay
                toolCall={mockToolCall}
                result={errorResultWithImage}
            />
        );

        await waitFor(() => {
            // 错误结果应使用 pre 标签
            const pre = container.querySelector('pre');
            expect(pre).not.toBeNull();
            // 不应有 img 标签
            expect(container.querySelector('img')).toBeNull();
        });
    });
});
