/**
 * 主题管理模块 (v2.6.0)
 * 提供应用级别的主题状态管理和持久化
 *
 * 功能：
 * - 支持 light/dark/system 三种主题模式
 * - Tauri 环境：使用文件系统持久化（解决 Dev/Build 数据不一致问题）
 * - 浏览器环境：回退到 localStorage
 * - 监听系统主题变化（当设置为 system 模式时）
 */
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { settingsStorage } from '../services/storage';
import { logger, LogTags } from '../utils/logger';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    effectiveTheme: 'light' | 'dark';  // 实际应用的主题
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * 获取系统主题偏好
 */
const getSystemTheme = (): 'light' | 'dark' => {
    if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
};

/**
 * 主题提供者组件
 * 在应用启动时自动恢复并应用保存的主题设置
 * v2.6.0: 支持 Tauri 文件系统持久化
 */
export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // 同步加载初始主题（确保 UI 立即可用）
    const [theme, setThemeState] = useState<Theme>(() => {
        const settings = settingsStorage.load();
        return settings.theme;
    });

    // 计算实际应用的主题
    const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(() => {
        const settings = settingsStorage.load();
        return settings.theme === 'system' ? getSystemTheme() : settings.theme;
    });

    /**
     * 应用启动时从 Tauri 异步加载设置
     * 确保 Dev 和 Build 环境数据一致
     */
    useEffect(() => {
        const loadFromTauri = async () => {
            try {
                const settings = await settingsStorage.loadAsync();
                if (settings.theme !== theme) {
                    setThemeState(settings.theme);
                }
            } catch (error) {
                logger.error(LogTags.SETTINGS, '加载主题设置失败', error);
            }
        };
        loadFromTauri();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * 设置主题并异步持久化
     * v2.6.0: 使用 settingsStorage 支持 Tauri 和 localStorage
     */
    const setTheme = useCallback((newTheme: Theme) => {
        setThemeState(newTheme);
        // 异步保存到 Tauri/localStorage
        const currentSettings = settingsStorage.load();
        settingsStorage.save({ ...currentSettings, theme: newTheme });
    }, []);

    /**
     * 应用主题到 DOM
     * 当 theme 或系统主题变化时触发
     */
    useEffect(() => {
        const root = document.documentElement;

        // 计算实际主题
        let actualTheme: 'light' | 'dark';
        if (theme === 'system') {
            actualTheme = getSystemTheme();
        } else {
            actualTheme = theme;
        }

        // 更新 effectiveTheme 状态
        setEffectiveTheme(actualTheme);

        // 移除旧的主题类
        root.classList.remove('light', 'dark');
        // 添加新的主题类
        root.classList.add(actualTheme);
    }, [theme]);

    /**
     * 监听系统主题变化
     * 当用户设置为 system 模式时，自动响应系统主题切换
     */
    useEffect(() => {
        if (theme !== 'system') return;

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const handleChange = (e: MediaQueryListEvent) => {
            const newTheme = e.matches ? 'dark' : 'light';
            setEffectiveTheme(newTheme);

            const root = document.documentElement;
            root.classList.remove('light', 'dark');
            root.classList.add(newTheme);
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme]);

    const value: ThemeContextType = {
        theme,
        setTheme,
        effectiveTheme,
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

/**
 * 获取主题上下文的 Hook
 * @returns ThemeContextType 主题上下文
 * @throws Error 如果在 ThemeProvider 外部使用
 */
export const useTheme = (): ThemeContextType => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
