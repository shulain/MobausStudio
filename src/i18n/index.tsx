/**
 * 国际化模块 (v2.6.0)
 * 提供应用级别的语言状态管理和持久化
 *
 * 功能：
 * - 支持 zh/en 两种语言
 * - v4.2.0: 支持根据系统语言自动选择默认语言
 * - Tauri 环境：使用文件系统持久化（解决 Dev/Build 数据不一致问题）
 * - 浏览器环境：回退到 localStorage
 */
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { zh, type Translations } from './zh';
import { en } from './en';
import { settingsStorage } from '../services/storage';
import { logger, LogTags } from '../utils/logger';

type Language = 'zh' | 'en';

interface I18nContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: Translations;
}

const translations: Record<Language, Translations> = { zh, en };

const I18nContext = createContext<I18nContextType | undefined>(undefined);

/**
 * 验证并返回有效的语言代码
 *
 * @param lang - 语言设置值（可能是 'zh', 'en', 'auto' 或其他无效值）
 * @returns 有效的语言代码 'zh' | 'en'
 */
function validateLanguage(lang: string): Language {
    if (lang === 'zh' || lang === 'en') {
        return lang;
    }
    // 对于 'auto' 或其他无效值，settingsStorage.load() 已经处理过了
    // 这里作为兜底，默认返回英文
    logger.warn(LogTags.SETTINGS, `无效的语言设置: ${lang}，使用默认值 en`);
    return 'en';
}

/**
 * 国际化提供者组件
 * v2.6.0: 支持 Tauri 文件系统持久化
 * v4.2.0: 支持根据系统语言自动选择默认语言
 */
export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // 同步加载初始语言（确保 UI 立即可用）
    // settingsStorage.load() 会自动处理 'auto' 值，返回检测到的系统语言
    const [language, setLanguageState] = useState<Language>(() => {
        const settings = settingsStorage.load();
        return validateLanguage(settings.language);
    });

    /**
     * 应用启动时从 Tauri 异步加载设置
     * 确保 Dev 和 Build 环境数据一致
     */
    useEffect(() => {
        const loadFromTauri = async () => {
            try {
                const settings = await settingsStorage.loadAsync();
                const validLang = validateLanguage(settings.language);
                if (validLang !== language) {
                    setLanguageState(validLang);
                }
            } catch (error) {
                logger.error(LogTags.SETTINGS, '加载语言设置失败', error);
            }
        };
        loadFromTauri();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * 设置语言并异步持久化
     * v2.6.0: 使用 settingsStorage 支持 Tauri 和 localStorage
     */
    const setLanguage = useCallback((lang: Language) => {
        setLanguageState(lang);
        // 异步保存到 Tauri/localStorage
        const currentSettings = settingsStorage.load();
        settingsStorage.save({ ...currentSettings, language: lang });
    }, []);

    useEffect(() => {
        document.documentElement.lang = language;
    }, [language]);

    const value: I18nContextType = {
        language,
        setLanguage,
        t: translations[language],
    };

    return (
        <I18nContext.Provider value={value}>
            {children}
        </I18nContext.Provider>
    );
};

export const useI18n = (): I18nContextType => {
    const context = useContext(I18nContext);
    if (!context) {
        throw new Error('useI18n must be used within an I18nProvider');
    }
    return context;
};

/**
 * 获取多语言文本
 * 支持 string 或 { zh: string; en: string } 格式
 *
 * @param text - 文本内容（字符串或多语言对象）
 * @param language - 当前语言
 * @returns 对应语言的文本
 */
export const getLocalizedText = (
    text: string | { zh: string; en: string } | undefined,
    language: Language
): string => {
    if (!text) return '';
    if (typeof text === 'string') return text;
    return text[language] || text.en || text.zh || '';
};

/**
 * 翻译函数，支持参数插值
 *
 * @param key - 翻译 key（支持点号分隔的路径，如 'logs.model.fetchStart'）
 * @param translations - 翻译对象
 * @param params - 参数对象，用于替换 {{key}} 占位符
 * @returns 翻译后的字符串
 *
 * @example
 * translate('logs.provider.connecting', t, { provider: 'OpenAI' })
 * // 返回: "正在连接提供商：OpenAI"
 */
export const translate = (
    key: string,
    translations: Translations,
    params?: Record<string, string | number>
): string => {
    // 通过点号分隔的路径访问嵌套对象
    const keys = key.split('.');
    let result: any = translations;

    for (const k of keys) {
        if (result && typeof result === 'object' && k in result) {
            result = result[k];
        } else {
            // 如果找不到翻译，返回 key 本身
            return key;
        }
    }

    // 如果结果不是字符串，返回 key
    if (typeof result !== 'string') {
        return key;
    }

    // 替换参数
    if (params) {
        Object.entries(params).forEach(([paramKey, value]) => {
            result = result.replace(new RegExp(`\\{\\{${paramKey}\\}\\}`, 'g'), String(value));
        });
    }

    return result;
};

export type { Language, Translations };
