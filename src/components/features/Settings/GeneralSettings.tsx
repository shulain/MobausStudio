import React from 'react';
import { Moon, Sun, Monitor, Languages, Laptop } from 'lucide-react';
import { useI18n } from '../../../i18n';

interface GeneralSettingsProps {
    theme: 'light' | 'dark' | 'system';
    language: 'zh' | 'en';
    onThemeChange: (theme: 'light' | 'dark' | 'system') => void;
    onLanguageChange: (lang: 'zh' | 'en') => void;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({
    theme,
    language,
    onThemeChange,
    onLanguageChange,
}) => {
    const { t } = useI18n();

    return (
        <div className="space-y-8">
            {/* 主题设置 */}
            <section>
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                    <Monitor className="w-5 h-5" />
                    {t.settings.appearance}
                </h3>
                <div className="grid grid-cols-3 gap-4">
                    <button
                        onClick={() => onThemeChange('light')}
                        className={`p-4 border rounded-[10px] flex flex-col items-center gap-2 transition-all ${theme === 'light'
                            ? 'border-purple-600 bg-purple-50 text-purple-700'
                            : 'border-gray-200 hover:border-gray-300 text-gray-600'
                            }`}
                    >
                        <Sun className="w-6 h-6" />
                        <span className="text-sm font-medium">{t.settings.lightMode}</span>
                    </button>
                    <button
                        onClick={() => onThemeChange('dark')}
                        className={`p-4 border rounded-[10px] flex flex-col items-center gap-2 transition-all ${theme === 'dark'
                            ? 'border-purple-600 bg-purple-50 text-purple-700'
                            : 'border-gray-200 hover:border-gray-300 text-gray-600'
                            }`}
                    >
                        <Moon className="w-6 h-6" />
                        <span className="text-sm font-medium">{t.settings.darkMode}</span>
                    </button>
                    <button
                        onClick={() => onThemeChange('system')}
                        className={`p-4 border rounded-[10px] flex flex-col items-center gap-2 transition-all ${theme === 'system'
                            ? 'border-purple-600 bg-purple-50 text-purple-700'
                            : 'border-gray-200 hover:border-gray-300 text-gray-600'
                            }`}
                    >
                        <Laptop className="w-6 h-6" />
                        <span className="text-sm font-medium">{t.settings.systemMode}</span>
                    </button>
                </div>
            </section>

            {/* 语言设置 */}
            <section>
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                    <Languages className="w-5 h-5" />
                    {t.settings.language}
                </h3>
                <div className="space-y-3">
                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-[10px] cursor-pointer hover:bg-gray-50 transition-colors">
                        <input
                            type="radio"
                            name="language"
                            value="zh"
                            checked={language === 'zh'}
                            onChange={() => onLanguageChange('zh')}
                            className="w-4 h-4 text-purple-600 focus:ring-purple-500 border-gray-300"
                        />
                        <span className="text-gray-700">{t.settings.chinese}</span>
                    </label>
                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-[10px] cursor-pointer hover:bg-gray-50 transition-colors">
                        <input
                            type="radio"
                            name="language"
                            value="en"
                            checked={language === 'en'}
                            onChange={() => onLanguageChange('en')}
                            className="w-4 h-4 text-purple-600 focus:ring-purple-500 border-gray-300"
                        />
                        <span className="text-gray-700">{t.settings.english}</span>
                    </label>
                </div>
            </section>
        </div>
    );
};
