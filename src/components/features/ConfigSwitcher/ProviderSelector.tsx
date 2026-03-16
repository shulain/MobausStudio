/**
 * ProviderSelector 组件
 *
 * 显示 Provider 列表，每个 Provider 带品牌色图标和启用/禁用操作
 */

import React from 'react';
import type { AIProvider } from '../../../types';
import type { ToolId } from './types';
import { useI18n } from '../../../i18n';

interface ProviderSelectorProps {
  providers: AIProvider[];
  activeToolId: ToolId;
  isExporting: boolean;
  enabledProviderId: string | null; // 当前工具已启用的 Provider ID
  onEnable: (providerId: string) => void;
  onDisable: () => void; // 禁用当前工具的配置
}

/** 根据 Provider 名称首字母生成渐变色 */
const getProviderGradient = (name: string): string => {
  const gradients = [
    'from-blue-500 to-cyan-500',
    'from-violet-500 to-purple-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-amber-500',
    'from-rose-500 to-pink-500',
    'from-indigo-500 to-blue-500',
  ];
  const index = name.charCodeAt(0) % gradients.length;
  return gradients[index];
};

export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  providers,
  activeToolId,
  isExporting,
  enabledProviderId,
  onEnable,
  onDisable,
}) => {
  const { t } = useI18n();

  // 只显示已连接且支持 API Key 的 Provider
  const connectedProviders = providers.filter(
    (p) => p.status === 'connected' && p.authMethods.some((m) => m.type === 'api')
  );

  return (
    <div>
      {connectedProviders.length > 0 ? (
        <div className="space-y-2.5">
          {connectedProviders.map((provider) => {
            const isEnabled = enabledProviderId === provider.id;
            const gradient = getProviderGradient(provider.name);

            return (
              <div
                key={provider.id}
                className={`
                  relative overflow-hidden rounded-[10px] border-2 p-4 transition-all duration-300
                  ${isEnabled
                    ? 'border-green-500/60 bg-green-50/50 dark:bg-green-900/10 shadow-md shadow-green-500/10'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md'
                  }
                `}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Provider 渐变色图标 */}
                    <div className={`
                      h-10 w-10 rounded-[10px] bg-gradient-to-br ${gradient}
                      flex items-center justify-center flex-shrink-0
                      transition-transform duration-200 hover:scale-105
                      ${isEnabled ? 'ring-2 ring-green-400 ring-offset-2 dark:ring-offset-gray-800' : ''}
                    `}>
                      <span className="text-base font-bold text-white">
                        {provider.name.charAt(0).toUpperCase()}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-white truncate">
                        {provider.name}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {/* 状态圆点 */}
                        <span className={`
                          inline-block w-1.5 h-1.5 rounded-full flex-shrink-0
                          ${isEnabled ? 'bg-green-500' : 'bg-gray-400'}
                        `} />
                        <span className={`
                          text-xs
                          ${isEnabled ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}
                        `}>
                          {isEnabled ? t.configSwitcher.enabled : t.configSwitcher.connected}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 启用/禁用按钮 */}
                  <button
                    onClick={() => isEnabled ? onDisable() : onEnable(provider.id)}
                    disabled={isExporting}
                    className={`
                      px-4 py-2 rounded-[10px] font-medium transition-all text-sm flex-shrink-0
                      ${isEnabled
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30 hover:shadow-sm'
                        : isExporting
                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-bl from-[#A688F6] to-[#009BF3] text-white hover:shadow-lg hover:scale-105'
                      }
                    `}
                  >
                    {isEnabled
                      ? t.configSwitcher.disable
                      : isExporting
                      ? t.configSwitcher.enabling
                      : t.configSwitcher.enableFor.replace('{tool}', activeToolId)}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 rounded-[10px] border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">{t.configSwitcher.noProviders}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{t.configSwitcher.addProviderHint}</p>
        </div>
      )}
    </div>
  );
};
