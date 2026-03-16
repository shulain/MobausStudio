/**
 * ThemeProvider 单元测试 (v2.6.0)
 * 对应文档测试用例 SET-01 到 SET-07, SET-30
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../../theme';

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
    };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock matchMedia
const mockMatchMedia = vi.fn();
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: mockMatchMedia,
});

// v2.6.0: 辅助函数 - 设置 mock settings
const setMockSettings = (theme: string, language: string = 'zh') => {
    localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'mobaus_settings') {
            return JSON.stringify({ theme, language });
        }
        return null;
    });
};

/**
 * 测试用组件，用于访问 useTheme hook
 */
const TestComponent: React.FC = () => {
    const { theme, setTheme, effectiveTheme } = useTheme();
    return (
        <div>
            <span data-testid="theme">{theme}</span>
            <span data-testid="effectiveTheme">{effectiveTheme}</span>
            <button onClick={() => setTheme('light')}>Light</button>
            <button onClick={() => setTheme('dark')}>Dark</button>
            <button onClick={() => setTheme('system')}>System</button>
        </div>
    );
};

describe('ThemeProvider (v2.6.0)', () => {
    let mediaQueryListeners: ((e: { matches: boolean }) => void)[] = [];

    beforeEach(() => {
        localStorageMock.clear();
        document.documentElement.classList.remove('light', 'dark');
        mediaQueryListeners = [];

        // 默认 Mock: 系统为浅色模式
        mockMatchMedia.mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn((_event: string, listener: (e: { matches: boolean }) => void) => {
                mediaQueryListeners.push(listener);
            }),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    /**
     * SET-01: 主题切换-深色
     */
    it('SET-01: 应支持切换到深色主题并持久化', () => {
        render(
            <ThemeProvider>
                <TestComponent />
            </ThemeProvider>
        );

        fireEvent.click(screen.getByText('Dark'));

        expect(screen.getByTestId('theme').textContent).toBe('dark');
        expect(screen.getByTestId('effectiveTheme').textContent).toBe('dark');
        // v2.6.0: 现在保存到 mobaus_settings
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
            'mobaus_settings',
            expect.stringContaining('"theme":"dark"')
        );
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    /**
     * SET-02: 主题切换-浅色
     */
    it('SET-02: 应支持切换到浅色主题并持久化', () => {
        render(
            <ThemeProvider>
                <TestComponent />
            </ThemeProvider>
        );

        fireEvent.click(screen.getByText('Light'));

        expect(screen.getByTestId('theme').textContent).toBe('light');
        expect(screen.getByTestId('effectiveTheme').textContent).toBe('light');
        // v2.6.0: 现在保存到 mobaus_settings
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
            'mobaus_settings',
            expect.stringContaining('"theme":"light"')
        );
        expect(document.documentElement.classList.contains('light')).toBe(true);
    });

    /**
     * SET-03: 主题切换-跟随系统
     */
    it('SET-03: 应支持切换到系统主题模式', () => {
        render(
            <ThemeProvider>
                <TestComponent />
            </ThemeProvider>
        );

        fireEvent.click(screen.getByText('System'));

        expect(screen.getByTestId('theme').textContent).toBe('system');
        // v2.6.0: 现在保存到 mobaus_settings
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
            'mobaus_settings',
            expect.stringContaining('"theme":"system"')
        );
    });

    /**
     * SET-06: 主题重启恢复
     */
    it('SET-06: 应从 localStorage 恢复保存的主题设置', () => {
        // v2.6.0: 使用 settings 对象格式
        setMockSettings('dark');

        render(
            <ThemeProvider>
                <TestComponent />
            </ThemeProvider>
        );

        expect(screen.getByTestId('theme').textContent).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    /**
     * SET-06: 主题重启恢复 - 默认值
     */
    it('SET-06: localStorage 无值时应使用 system 作为默认值', () => {
        localStorageMock.getItem.mockReturnValue(null);

        render(
            <ThemeProvider>
                <TestComponent />
            </ThemeProvider>
        );

        expect(screen.getByTestId('theme').textContent).toBe('system');
    });

    /**
     * SET-07: 系统主题监听 - 深色系统
     */
    it('SET-07: System 模式下应响应系统深色主题', () => {
        // Mock 系统为深色模式
        mockMatchMedia.mockImplementation((query: string) => ({
            matches: query === '(prefers-color-scheme: dark)',
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        // v2.6.0: 使用 settings 对象格式
        setMockSettings('system');

        render(
            <ThemeProvider>
                <TestComponent />
            </ThemeProvider>
        );

        expect(screen.getByTestId('effectiveTheme').textContent).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    /**
     * SET-07: 系统主题监听 - 浅色系统
     */
    it('SET-07: System 模式下应响应系统浅色主题', () => {
        // Mock 系统为浅色模式
        mockMatchMedia.mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        // v2.6.0: 使用 settings 对象格式
        setMockSettings('system');

        render(
            <ThemeProvider>
                <TestComponent />
            </ThemeProvider>
        );

        expect(screen.getByTestId('effectiveTheme').textContent).toBe('light');
        expect(document.documentElement.classList.contains('light')).toBe(true);
    });

    /**
     * 测试: useTheme 在 Provider 外使用应抛出错误
     */
    it('应在 ThemeProvider 外使用 useTheme 时抛出错误', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        expect(() => {
            render(<TestComponent />);
        }).toThrow('useTheme must be used within a ThemeProvider');

        consoleError.mockRestore();
    });

    /**
     * 测试: 切换主题时应移除旧的主题类
     */
    it('切换主题时应正确移除旧的主题类', () => {
        render(
            <ThemeProvider>
                <TestComponent />
            </ThemeProvider>
        );

        // 切换到深色
        fireEvent.click(screen.getByText('Dark'));
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.classList.contains('light')).toBe(false);

        // 切换到浅色
        fireEvent.click(screen.getByText('Light'));
        expect(document.documentElement.classList.contains('light')).toBe(true);
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
});
