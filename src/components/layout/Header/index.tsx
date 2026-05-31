import React from 'react';
import MobausLogoSvg from '../../../assets/Mobaus1.svg';
import { Bell, Download, Upload } from 'lucide-react';

/**
 * Header 组件
 *
 * 应用顶部标题栏 - Mobaus Studio 品牌风格
 * Mobaus Logo（专为首页设计的渐变圆形波纹图案） + 呼吸光晕 + 渐变标题 + PRO 标签
 * v9.1.1: 支持深色模式适配
 * 注意：data-tauri-drag-region 属性用于启用窗口拖动
 * 子元素需要显式添加此属性或使用 pointer-events-none 来允许拖动穿透
 */
interface HeaderProps {
    onNotifications: () => void;
    onExport: () => void;
    onImport: () => void;
    notificationCount?: number;
}

/**
 * MobausLogo - Mobaus Studio 品牌 Logo
 *
 * v4.2.5: 使用专为首页设计的 Mobaus1.svg
 * 渐变色圆形设计：金色 → 红色 → 橙色 → 紫色 → 蓝色
 * 中心波纹图案，代表创意与灵感的涌动
 */
const MobausLogo: React.FC = () => (
    <img
        src={MobausLogoSvg}
        alt="Mobaus Logo"
        className="w-10 h-10"
        data-testid="mobaus-header-logo"
    />
);

export const Header: React.FC<HeaderProps> = ({
    onNotifications,
    onExport,
    onImport,
    notificationCount = 0,
}) => {
    return (
        <div className="h-16 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200/60 dark:border-gray-700/60 flex items-center pl-20 pr-6" data-tauri-drag-region>
            {/* 品牌区域 - 支持拖动 */}
            <div className="flex items-center gap-4 pointer-events-none" data-tauri-drag-region>
                {/* Logo - Mobaus 渐变圆形 + 呼吸光晕 */}
                <div className="relative">
                    {/* 光晕层 */}
                    <div className="absolute inset-0 bg-gradient-to-br from-violet-400 to-cyan-400 rounded-[10px] opacity-25 dark:opacity-20 blur-lg animate-pulse" />
                    {/* Logo 容器 */}
                    <div className="relative w-10 h-10 rounded-[10px] flex items-center justify-center">
                        <MobausLogo />
                    </div>
                </div>

                {/* 标题 + 版本标签 */}
                <div className="flex items-center gap-2.5">
                    <h1 className="text-xl font-bold bg-gradient-to-r from-violet-600 via-blue-600 to-cyan-500 dark:from-violet-400 dark:via-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">
                        Mobaus Studio
                    </h1>
                    <span className="px-2 py-0.5 text-[10px] font-semibold text-white bg-gradient-to-r from-violet-500 to-blue-500 dark:from-violet-600 dark:to-blue-600 rounded-full shadow-sm">
                        PRO
                    </span>
                </div>
            </div>

            {/* 操作区 */}
            <div className="ml-auto flex items-center gap-2">
                <button
                    onClick={onNotifications}
                    className="h-8 px-2 rounded-md text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/80 flex items-center justify-center relative"
                    title="消息"
                    type="button"
                >
                    <Bell className="w-4 h-4" />
                    {notificationCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
                            {notificationCount > 9 ? '9+' : notificationCount}
                        </span>
                    )}
                </button>

                <button
                    onClick={onExport}
                    className="h-8 px-2 rounded-md text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/80 flex items-center justify-center"
                    title="导出配置"
                    type="button"
                >
                    <Download className="w-4 h-4" />
                </button>

                <button
                    onClick={onImport}
                    className="h-8 px-2 rounded-md text-gray-600 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/80 flex items-center justify-center"
                    title="导入配置"
                    type="button"
                >
                    <Upload className="w-4 h-4" />
                </button>

            </div>
        </div>
    );
};

export default Header;
