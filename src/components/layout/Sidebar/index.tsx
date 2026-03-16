import React from 'react';
import { MessageCircle, Workflow, Puzzle, PlugZap, Cpu, Activity, Settings, Plug, ArrowRightLeft } from 'lucide-react';
import { useI18n } from '../../../i18n';

export type PageType = 'chat' | 'agents' | 'skills' | 'mcp' | 'models' | 'providers' | 'config-switcher' | 'settings';

interface SidebarProps {
    currentPage: PageType;
    onPageChange: (page: PageType) => void;
    onStatsClick: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    currentPage,
    onPageChange,
    onStatsClick,
}) => {
    const { t } = useI18n();

    const navItems: { key: PageType; icon: React.ReactNode; label: string }[] = [
        { key: 'chat', icon: <MessageCircle className="w-5 h-5 lg:w-6 lg:h-6" />, label: t.nav.chat },
        { key: 'agents', icon: <Workflow className="w-5 h-5 lg:w-6 lg:h-6" />, label: t.nav.agents },
        { key: 'skills', icon: <Puzzle className="w-5 h-5 lg:w-6 lg:h-6" />, label: t.nav.skills },
        { key: 'mcp', icon: <PlugZap className="w-5 h-5 lg:w-6 lg:h-6" />, label: t.nav.mcp },
        { key: 'models', icon: <Cpu className="w-5 h-5 lg:w-6 lg:h-6" />, label: t.nav.models },
        { key: 'providers', icon: <Plug className="w-5 h-5 lg:w-6 lg:h-6" />, label: t.nav.providers },
        { key: 'config-switcher', icon: <ArrowRightLeft className="w-5 h-5 lg:w-6 lg:h-6" />, label: t.nav.configSwitcher },
    ];

    return (
        <div className="bg-white dark:bg-gray-900 text-gray-800 dark:text-white border-r border-gray-200 dark:border-gray-800 flex flex-col items-center py-6 gap-2 w-16 lg:w-20 transition-all duration-300">

            {/* Navigation */}
            <nav className="flex-1 w-full px-2 space-y-2">
                {navItems.map((item) => (
                    <button
                        key={item.key}
                        onClick={() => onPageChange(item.key)}
                        className={`w-full p-2 lg:p-3 rounded-[10px] flex flex-col items-center gap-1 transition-all group relative ${currentPage === item.key
                            ? 'bg-gradient-to-bl from-[#A688F6] to-[#009BF3] text-white shadow-lg shadow-blue-500/30'
                            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        title={item.label}
                    >
                        {item.icon}
                        <span className="text-[10px] font-medium hidden lg:block opacity-80 group-hover:opacity-100">{item.label}</span>
                        {currentPage === item.key && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full -ml-2" />
                        )}
                    </button>
                ))}
            </nav>

            {/* Bottom Actions */}
            <div className="w-full px-2 space-y-2 mt-auto">
                <button
                    onClick={onStatsClick}
                    className="w-full p-2 lg:p-3 rounded-[10px] flex flex-col items-center gap-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-all group"
                    title={t.nav.stats}
                >
                    <Activity className="w-5 h-5 lg:w-6 lg:h-6" />
                    <span className="text-[10px] font-medium hidden lg:block opacity-80 group-hover:opacity-100">{t.nav.stats}</span>
                </button>
                <button
                    onClick={() => onPageChange('settings')}
                    className={`w-full p-2 lg:p-3 rounded-[10px] flex flex-col items-center gap-1 transition-all group relative ${currentPage === 'settings'
                        ? 'bg-gradient-to-bl from-[#A688F6] to-[#009BF3] text-white shadow-lg shadow-blue-500/30'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                        }`}
                    title={t.nav.settings}
                >
                    <Settings className="w-5 h-5 lg:w-6 lg:h-6" />
                    <span className="text-[10px] font-medium hidden lg:block opacity-80 group-hover:opacity-100">{t.nav.settings}</span>
                    {currentPage === 'settings' && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full -ml-2" />
                    )}
                </button>
            </div>
        </div>
    );
};

export default Sidebar;

