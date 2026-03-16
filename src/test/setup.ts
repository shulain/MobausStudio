/**
 * Vitest 测试环境配置
 *
 * 此文件在每个测试文件运行前加载，用于配置全局测试环境
 *
 * v3.4.6: 添加 IntersectionObserver mock
 */

import { vi, afterEach } from 'vitest';
import '@testing-library/jest-dom';

// 模拟 IntersectionObserver（jsdom 不支持）
class MockIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string = '';
    readonly thresholds: ReadonlyArray<number> = [];

    constructor(
        private callback: IntersectionObserverCallback,
        _options?: IntersectionObserverInit
    ) {}

    observe(_target: Element): void {
        // 模拟立即触发一次回调，表示元素可见
        this.callback([{
            isIntersecting: true,
            boundingClientRect: {} as DOMRectReadOnly,
            intersectionRatio: 1,
            intersectionRect: {} as DOMRectReadOnly,
            rootBounds: null,
            target: _target,
            time: Date.now(),
        }], this);
    }

    unobserve(_target: Element): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] { return []; }
}

// 注入到全局
global.IntersectionObserver = MockIntersectionObserver;

// 模拟 Tauri API
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

// 模拟 Tauri 插件
vi.mock('@tauri-apps/plugin-opener', () => ({
    open: vi.fn(),
}));

// 全局清理
afterEach(() => {
    vi.clearAllMocks();
});
