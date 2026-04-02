/**
 * ConfigSwitcher 主页面
 *
 * 配置切换功能的主界面
 * v0.9.5: 使用协议优先级逻辑获取提供商协议
 * v0.9.6: 使用 PageHeader 组件统一布局，添加统计数据展示
 * v5.11.0: UI 美化优化，卡片网格布局，品牌色图标，统一视觉风格
 */

import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Download, CheckCircle } from 'lucide-react';
import { PageHeader, type StatItem } from '../../common';
import { AppSwitcher } from './AppSwitcher';
import { ProviderSelector } from './ProviderSelector';
import type { ToolId } from './types';
import type { AIProvider, AIModelConfig, CustomProvider, MCPServer, Skill } from '../../../types';
import { useI18n } from '../../../i18n';
import { getDefaultProtocol, getEffectiveProtocol } from '../../../data/protocols';
import { logger, LogTags } from '../../../utils/logger';

interface ConfigSwitcherPageProps {
  providers: AIProvider[];
  mcpServers: MCPServer[];
  skills: Skill[];
}

export const ConfigSwitcherPage: React.FC<ConfigSwitcherPageProps> = ({
  providers,
  mcpServers,
}) => {
  const { t } = useI18n();
  const [activeToolId, setActiveToolId] = useState<ToolId>('claude-code');
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');
  const [configPaths, setConfigPaths] = useState<string[]>([]);

  // 用于跟踪当前有效的导出请求ID，防止竞态条件
  const currentExportIdRef = useRef<number>(0);

  const [enabledProviders, setEnabledProviders] = useState<Record<ToolId, string | null>>({
    'claude-code': null,
    'codex': null,
    'gemini-cli': null,
    'opencode': null,
    'openclaw': null,
  });

  const enabledMcpCount = mcpServers.filter((s) => s.enabled).length;

  // v0.9.6: 统计数据
  const totalTools = 5;
  const enabledToolsCount = Object.values(enabledProviders).filter((p) => p !== null).length;
  const connectedProvidersCount = providers.filter((p) => p.status === 'connected').length;

  const stats: StatItem[] = [
    { label: t.configSwitcher.supportedTools, value: totalTools, color: 'default' },
    { label: t.configSwitcher.configuredTools, value: enabledToolsCount, icon: <CheckCircle />, color: 'success' },
    { label: t.configSwitcher.connectedProviders, value: connectedProvidersCount, icon: <CheckCircle />, color: 'success' },
  ];

  // 从后端加载启用状态
  useEffect(() => {
    const loadEnabledProviders = async () => {
      try {
        const state = await invoke<Record<string, string>>('get_enabled_providers');
        setEnabledProviders({
          'claude-code': state['claude-code'] || null,
          'codex': state['codex'] || null,
          'gemini-cli': state['gemini-cli'] || null,
          'opencode': state['opencode'] || null,
          'openclaw': state['openclaw'] || null,
        });
      } catch (error) {
        console.error('Failed to load enabled providers:', error);
      }
    };
    loadEnabledProviders();
  }, []);

  // 获取工具配置路径（从后端）
  useEffect(() => {
    const fetchConfigPaths = async () => {
      try {
        const paths = await invoke<string[]>('get_tool_config_paths', { toolName: activeToolId });
        setConfigPaths(paths);
      } catch (error) {
        console.error('Failed to fetch config paths:', error);
        setConfigPaths([]);
      }
    };
    fetchConfigPaths();
  }, [activeToolId]);

  // 处理启用（导出）
  const handleEnable = async (providerId: string) => {
    // 生成新的请求ID，用于防止竞态条件
    const exportId = Date.now();
    currentExportIdRef.current = exportId;

    // 记录当前工具ID，用于后续清理
    const targetToolId = activeToolId;

    setIsExporting(true);
    setMessageType('info');
    setExportMessage(t.configSwitcher.enablingFor.replace('{tool}', activeToolId));
    try {
      const provider = providers.find(p => p.id === providerId);
      if (!provider) throw new Error(`Provider ${providerId} not found`);

      const allModels = await invoke<AIModelConfig[]>('load_models');
      const providerModels = allModels.filter(m => m.provider === providerId);
      const providerDefaultProtocol = getDefaultProtocol(providerId);
      const firstModel = providerModels[0];
      const effectiveProtocol = firstModel
        ? getEffectiveProtocol(firstModel.protocol, providerDefaultProtocol, providerId)
        : providerDefaultProtocol;

      const customProvider = provider as unknown as CustomProvider;
      const baseURL = firstModel?.endpoint
        || provider.customEndpoint
        || customProvider.endpoint
        || provider.defaultEndpoint;

      const models = providerModels.reduce((acc, model) => {
        const modelKey = model.modelId || model.name.toLowerCase().replace(/\s+/g, '-');
        acc[modelKey] = { name: modelKey };
        return acc;
      }, {} as Record<string, { name: string }>);

      await invoke('export_provider_to_tool', {
        providerId, providerName: provider.name,
        providerModels: JSON.stringify(models),
        providerProtocol: effectiveProtocol,
        providerBaseUrl: baseURL,
        toolName: targetToolId,
      });

      // 检查请求ID是否仍然有效（防止竞态条件）
      if (currentExportIdRef.current !== exportId) {
        // 请求已过期，需要清理已写入的配置文件
        logger.debug(LogTags.SETTINGS, '[ConfigSwitcher] 请求已过期，清理配置文件', { exportId, current: currentExportIdRef.current, targetToolId });
        try {
          await invoke('disable_provider_for_tool', { toolName: targetToolId });
        } catch (cleanupError) {
          logger.error(LogTags.SETTINGS, '[ConfigSwitcher] 清理配置文件失败', cleanupError);
        }
        return;
      }

      // 请求仍然有效，更新状态
      setEnabledProviders(prev => ({ ...prev, [activeToolId]: providerId }));
      const mcpInfo = enabledMcpCount > 0
        ? t.configSwitcher.enableSuccessWithMcp.replace('{tool}', activeToolId).replace('{count}', String(enabledMcpCount))
        : t.configSwitcher.enableSuccess.replace('{tool}', activeToolId);
      setMessageType('success');
      setExportMessage(mcpInfo);
      setTimeout(() => setExportMessage(''), 3000);
    } catch (error) {
      // 检查请求ID是否仍然有效
      if (currentExportIdRef.current !== exportId) {
        // 请求已过期，丢弃错误
        logger.debug(LogTags.SETTINGS, '[ConfigSwitcher] 丢弃过期的导出请求错误', { exportId, current: currentExportIdRef.current });
        return;
      }

      // 请求仍然有效，显示错误
      setMessageType('error');
      const errorMsg = error instanceof Error ? error.message : String(error);
      setExportMessage(t.configSwitcher.enableFailed.replace('{error}', errorMsg));
      setTimeout(() => setExportMessage(''), 5000);
    } finally {
      setIsExporting(false);
    }
  };

  // 处理禁用
  const handleDisable = async () => {
    // 使当前请求失效，防止竞态条件
    currentExportIdRef.current = Date.now();

    setIsExporting(true);
    setMessageType('info');
    setExportMessage(t.configSwitcher.disabling);
    try {
      await invoke('disable_provider_for_tool', { toolName: activeToolId });
      setEnabledProviders(prev => ({ ...prev, [activeToolId]: null }));
      setMessageType('success');
      setExportMessage(t.configSwitcher.disableSuccess.replace('{tool}', activeToolId));
      setTimeout(() => setExportMessage(''), 3000);
    } catch (error) {
      setMessageType('error');
      const errorMsg = error instanceof Error ? error.message : String(error);
      setExportMessage(t.configSwitcher.disableFailed.replace('{error}', errorMsg));
      setTimeout(() => setExportMessage(''), 5000);
    } finally {
      setIsExporting(false);
    }
  };

  // 复制路径到剪贴板
  const handleCopyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setMessageType('success');
      setExportMessage('✓ ' + t.configSwitcher.pathCopied);
      setTimeout(() => setExportMessage(''), 2000);
    } catch (error) {
      console.error('Failed to copy path:', error);
      setMessageType('error');
      setExportMessage('❌ ' + t.configSwitcher.copyFailed);
      setTimeout(() => setExportMessage(''), 2000);
    }
  };

  return (
    <div className="flex-1 overflow-hidden">
      <div className="h-full flex flex-col">
        <PageHeader
          icon={<Download className="text-purple-600 dark:text-purple-400" />}
          title={t.configSwitcher.title}
          subtitle={t.configSwitcher.subtitle}
          stats={stats}
        />

        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          <div className="max-w-5xl mx-auto p-5 space-y-3">
            {/* 统一配置卡片 */}
            <div className="bg-white dark:bg-gray-800 rounded-[10px] shadow-sm border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/50">

              {/* Section 1: 工具选择 */}
              <div className="flex items-center gap-5 px-5 py-4">
                <div className="flex items-center gap-2.5 min-w-[130px] flex-shrink-0">
                  <div className="w-[3px] h-4 rounded-full bg-gradient-to-b from-purple-500 to-blue-500" />
                  <h2 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {t.configSwitcher.selectTargetTool}
                  </h2>
                </div>
                <div className="flex-1">
                  <AppSwitcher
                    activeApp={activeToolId}
                    multiSelect={false}
                    enabledProviders={enabledProviders}
                    onSwitch={(toolId) => {
                      setActiveToolId(toolId);
                      setExportMessage('');
                      currentExportIdRef.current = Date.now();
                    }}
                  />
                </div>
              </div>

              {/* Section 2: Provider 选择 */}
              <div className="flex gap-5 px-5 py-4">
                <div className="flex items-start gap-2.5 min-w-[130px] flex-shrink-0 pt-2">
                  <div className="w-[3px] h-4 rounded-full bg-gradient-to-b from-purple-500 to-blue-500" />
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {t.configSwitcher.selectProvider}
                  </h3>
                </div>
                <div key={activeToolId} className="flex-1 animate-fadeIn">
                  <ProviderSelector
                    providers={providers}
                    activeToolId={activeToolId}
                    isExporting={isExporting}
                    enabledProviderId={enabledProviders[activeToolId]}
                    onEnable={handleEnable}
                    onDisable={handleDisable}
                  />
                </div>
              </div>

              {/* Section 3: 目标路径 */}
              <div className="flex gap-5 px-5 py-4">
                <div className="flex items-start gap-2.5 min-w-[130px] flex-shrink-0 pt-1.5">
                  <div className="w-[3px] h-4 rounded-full bg-gradient-to-b from-purple-500 to-blue-500" />
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {t.configSwitcher.targetPath}
                  </h3>
                </div>
                <div className="flex-1 space-y-1">
                  {configPaths.map((path, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between group hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg px-2.5 py-1.5 transition-colors"
                    >
                      <div className="text-xs font-mono text-gray-600 dark:text-gray-400 flex-1 truncate">
                        {path}
                      </div>
                      <button
                        onClick={() => handleCopyPath(path)}
                        className="opacity-0 group-hover:opacity-100 ml-2 p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                        title={t.configSwitcher.copyPath}
                      >
                        <svg className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 状态消息 */}
            {exportMessage && (
              <div className={`
                text-sm px-4 py-2.5 rounded-[10px] flex items-center gap-2 animate-fadeIn border
                ${messageType === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' : ''}
                ${messageType === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' : ''}
                ${messageType === 'info' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' : ''}
              `}>
                {messageType === 'success' && (
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
                {messageType === 'error' && (
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
                {messageType === 'info' && (
                  <svg className="w-4 h-4 flex-shrink-0 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                <span className="flex-1">{exportMessage}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
