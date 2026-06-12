import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, Sliders, Database, Info } from 'lucide-react';
import { GeneralSettings } from './GeneralSettings';
import { DataSettings } from './DataSettings';
import { AboutSettings } from './AboutSettings';
import { ExportModal } from './ExportModal';
import { ImportModal } from './ImportModal';
import { useI18n } from '../../../i18n';
import { useTheme } from '../../../theme';
import { trackEvents } from '../../../services/analytics';
import type { CustomProvider, ExportConfig, ImportOptions, ProviderCredential } from '../../../types';
// v2.6.5: 导入 storage services 用于异步数据读取和清理
import {
    modelsStorage,
    chatsStorage,
    agentsStorage,
    skillsStorage,
    mcpServersStorage,
    roundtableChatsStorage,  // v2.6.5: 圆桌对话存储
    settingsStorage,         // v2.6.5: 应用设置存储
    providerCredentialsStorage,
} from '../../../services/storage';
import { customProviderStorage } from '../../../services/customProviderStorage';
import { modelFetcher } from '../../../services/modelFetcher';
// v2.6.2: 导入 Tauri dialog 用于文件保存对话框和消息提示
import { save, message } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { logger, LogTags } from '../../../utils/logger';

type SettingsTab = 'general' | 'data' | 'about';

/**
 * 检测是否在 Tauri 环境中运行 (v2.6.2)
 */
function isTauriEnvironment(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * localStorage 键名
 * 注意: THEME 已迁移到 ThemeProvider 管理 (v2.3.0)
 * v2.6.1: 修正 MCP 键名，添加 MODELS 键
 */
const STORAGE_KEYS = {
    MODELS: 'mobaus_models',      // v2.6.1: 新增 AI 模型配置
    CHATS: 'mobaus_chats',
    AGENTS: 'mobaus_agents',
    SKILLS: 'mobaus_skills',
    MCP: 'mobaus_mcp_servers',    // v2.6.1: 修正键名，与 storage.ts 保持一致
    SETTINGS: 'mobaus_settings',
    API_KEYS: 'mobaus_api_keys',
    PROVIDER_CREDENTIALS: 'mobaus_provider_credentials',
    CUSTOM_PROVIDERS: 'mobaus_custom_providers',
    ROUNDTABLE_CHATS: 'mobaus_roundtable_chats',
    MODEL_CACHE: 'mobaus_model_cache',
    MODELS_DEV_CACHE: 'mobaus_models_dev_cache',
    DEVICE_ID: 'mobaus_device_id',
    FIRST_LAUNCH: 'mobaus_first_launch',
};

const BACKUP_STORAGE_KEY = 'mobaus_backup';
const BACKUP_CANCELLED_MESSAGE = '导入前备份已取消，导入未执行。';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface SettingsPageProps {
    // Props can be extended as needed
}

/**
 * 设置页面组件 (v2.3.0)
 * 主题管理已迁移到 ThemeProvider，语言管理由 I18nProvider 处理
 */
export const SettingsPage: React.FC<SettingsPageProps> = () => {
    const { t, language, setLanguage } = useI18n();
    const { theme, setTheme } = useTheme();  // v2.3.0: 使用全局主题管理
    const [activeTab, setActiveTab] = useState<SettingsTab>('general');
    const [showExportModal, setShowExportModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [storageSize, setStorageSize] = useState('0 KB');
    const [storagePercent, setStoragePercent] = useState(0);  // v2.3.0: 存储占用百分比
    const importingRef = useRef(false);  // v2.6.2: 防止导入重复触发

    // v2.6.0: 主题切换埋点包装
    const handleThemeChange = useCallback((newTheme: 'light' | 'dark' | 'system') => {
        setTheme(newTheme);
        trackEvents.themeChanged({ theme: newTheme });
    }, [setTheme]);

    // v2.6.0: 语言切换埋点包装
    const handleLanguageChange = useCallback((newLanguage: 'zh' | 'en') => {
        setLanguage(newLanguage);
        trackEvents.languageChanged({ language: newLanguage });
    }, [setLanguage]);

    // 计算存储使用量
    // v2.3.0: 同时计算存储大小和占用百分比
    useEffect(() => {
        const calculateStorageSize = () => {
            let total = 0;
            for (const key in localStorage) {
                if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
                    total += localStorage.getItem(key)?.length || 0;
                }
            }
            const sizeInKB = (total * 2) / 1024; // UTF-16 编码
            if (sizeInKB < 1024) {
                setStorageSize(`${sizeInKB.toFixed(2)} KB`);
            } else {
                setStorageSize(`${(sizeInKB / 1024).toFixed(2)} MB`);
            }

            // v2.3.0: 计算存储占用百分比
            // localStorage 通常限制为 5MB (5 * 1024 KB)
            const maxStorageKB = 5 * 1024;
            const percent = (sizeInKB / maxStorageKB) * 100;
            setStoragePercent(Math.min(percent, 100));
        };
        calculateStorageSize();
    }, []);

    /**
     * 导出配置
     * v2.6.1: 添加 models 导出，修正 MCP 键名
     * v2.6.2: 使用 storage services 异步读取数据，支持 Tauri 文件对话框
     * v2.6.5: 添加 roundtableChats 和 settings 导出支持
     */
    const handleExport = useCallback(async (config: ExportConfig) => {
        const exportData: Record<string, unknown> = {
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
        };

        // v2.6.2: 使用 storage services 异步读取数据（支持 Tauri 文件系统）
        if (config.models) {
            exportData.models = await modelsStorage.load();
        }
        if (config.customProviders) {
            exportData.customProviders = await customProviderStorage.load();
        }
        if (config.chats) {
            // v2.6.2: 使用 chatsStorage 确保在 Tauri 环境正确读取对话数据
            exportData.chats = await chatsStorage.load();
        }
        if (config.agents) {
            exportData.agents = await agentsStorage.load();
        }
        if (config.skills) {
            exportData.skills = await skillsStorage.load();
        }
        if (config.mcp) {
            exportData.mcp = await mcpServersStorage.load();
        }
        // v2.6.5: 添加圆桌对话导出
        if (config.roundtableChats) {
            exportData.roundtableChats = await roundtableChatsStorage.load();
        }
        // v2.6.5: 添加应用设置导出
        if (config.settings) {
            exportData.settings = await settingsStorage.loadAsync();
        }

        const jsonContent = JSON.stringify(exportData, null, 2);
        const defaultFileName = `mobaus-config-${new Date().toISOString().split('T')[0]}.json`;

        // v2.6.2: Tauri 环境使用文件对话框选择保存位置
        if (isTauriEnvironment()) {
            try {
                const filePath = await save({
                    defaultPath: defaultFileName,
                    filters: [{
                        name: 'JSON',
                        extensions: ['json']
                    }]
                });

                if (filePath) {
                    await writeTextFile(filePath, jsonContent);
                    alert(t.messages.exportSuccess || '导出成功！');
                }
                // 用户取消选择时 filePath 为 null，不显示任何提示
            } catch (error) {
                logger.error(LogTags.SETTINGS, '导出失败', error);
                alert(t.messages.exportError || '导出失败，请重试。');
            }
        } else {
            // 浏览器环境使用传统下载方式
            const blob = new Blob([jsonContent], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = defaultFileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            alert(t.messages.exportSuccess || '导出成功！');
        }

        setShowExportModal(false);
    }, [t]);

    /**
     * 导入前备份
     * 使用 storage services 读取真实持久化数据，并生成用户可恢复的 JSON 备份文件。
     */
    const createPreImportBackup = useCallback(async () => {
        const backupData = {
            version: '1.0.0',
            backupType: 'pre-import',
            exportedAt: new Date().toISOString(),
            models: await modelsStorage.load(),
            chats: await chatsStorage.load(),
            agents: await agentsStorage.load(),
            skills: await skillsStorage.load(),
            mcp: await mcpServersStorage.load(),
            providerCredentials: await providerCredentialsStorage.load(),
            customProviders: await customProviderStorage.load(),
            roundtableChats: await roundtableChatsStorage.load(),
            settings: await settingsStorage.loadAsync(),
        };

        const jsonContent = JSON.stringify(backupData, null, 2);
        const localBackupData: Record<string, unknown> = { ...backupData };
        delete localBackupData.providerCredentials;
        const localBackupContent = JSON.stringify(localBackupData, null, 2);
        const defaultFileName = `mobaus-backup-${new Date().toISOString().split('T')[0]}.json`;

        try {
            localStorage.setItem(BACKUP_STORAGE_KEY, localBackupContent);
        } catch (error) {
            logger.warn(LogTags.SETTINGS, '导入前本地应急备份写入失败，继续创建备份文件', error);
        }

        if (isTauriEnvironment()) {
            const filePath = await save({
                defaultPath: defaultFileName,
                filters: [{
                    name: 'JSON',
                    extensions: ['json']
                }]
            });

            if (!filePath) {
                throw new Error(BACKUP_CANCELLED_MESSAGE);
            }

            await writeTextFile(filePath, jsonContent);
            return;
        }

        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, []);

    /**
     * 导入配置
     * v2.6.1: 添加 models 导入，修正 MCP 键名
     * v2.6.2: 添加防重复调用机制，使用 Tauri message dialog
     * v2.6.3: 使用 storage services 保存数据，确保 Tauri 环境正确持久化
     */
    const handleImport = useCallback((file: File, options: ImportOptions) => {
        // v2.6.2: 防止重复调用
        if (importingRef.current) {
            logger.debug(LogTags.SETTINGS, '导入正在进行中，忽略重复调用');
            return;
        }
        importingRef.current = true;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const raw = e.target?.result;
                if (typeof raw !== 'string') {
                    throw new Error('导入文件内容无效');
                }

                const data = JSON.parse(raw);
                const hasImportPayload = [
                    'models',
                    'chats',
                    'agents',
                    'skills',
                    'mcp',
                    'mcpServers',
                    'providerCredentials',
                    'customProviders',
                    'roundtableChats',
                    'settings',
                ].some((key) => Object.prototype.hasOwnProperty.call(data, key));

                if (!hasImportPayload) {
                    throw new Error('导入文件中未检测到可识别的配置字段');
                }

                if (options.backup) {
                    await createPreImportBackup();
                }

                // v2.6.3: 使用 storage services 保存数据，确保 Tauri 环境正确持久化
                // v2.6.4: 合并时根据 ID 去重，已存在的记录用导入数据覆盖
                const mergeById = <T extends { id: string }>(existing: T[], imported: T[]): T[] => {
                    const idMap = new Map<string, T>();
                    // 先添加现有数据
                    existing.forEach(item => idMap.set(item.id, item));
                    // 导入数据覆盖同 ID 的现有数据
                    imported.forEach(item => idMap.set(item.id, item));
                    return Array.from(idMap.values());
                };
                const importMcp = Array.isArray(data.mcp)
                    ? data.mcp
                    : (Array.isArray(data.mcpServers) ? data.mcpServers : undefined);
                const providerCredentials = Array.isArray(data.providerCredentials)
                    ? (data.providerCredentials as ProviderCredential[])
                    : undefined;
                const customProviders = Array.isArray(data.customProviders)
                    ? (data.customProviders as CustomProvider[])
                    : undefined;

                if (data.models) {
                    if (options.merge) {
                        const existing = await modelsStorage.load();
                        const merged = mergeById(existing, data.models);
                        await modelsStorage.save(merged);
                    } else {
                        await modelsStorage.save(data.models);
                    }
                }
                if (data.chats) {
                    if (options.merge) {
                        const existing = await chatsStorage.load();
                        const merged = mergeById(existing, data.chats);
                        await chatsStorage.save(merged);
                    } else {
                        await chatsStorage.save(data.chats);
                    }
                }

                /**
                 * v3.0.25: Agent 导入时自动创建缺失的依赖资源
                 * 在导入 agents 之前，先检查并创建缺失的 skills 和 mcp
                 * 这样可以确保 Agent 的依赖资源完整
                 */
                if (data.agents && Array.isArray(data.agents)) {
                    // 加载当前已有的资源
                    const existingSkills = await skillsStorage.load();
                    const existingMcp = await mcpServersStorage.load();
                    const existingModels = await modelsStorage.load();

                    const existingSkillIds = new Set(existingSkills.map((s: { id: string }) => s.id));
                    const existingMcpIds = new Set(existingMcp.map((m: { id: string }) => m.id));
                    const existingModelIds = new Set(existingModels.map((m: { id: string }) => m.id));

                    // 收集需要创建的资源
                    const skillsToCreate: typeof data.skills = [];
                    const mcpToCreate: typeof data.mcp = [];
                    const missingModels: string[] = [];

                    for (const agent of data.agents) {
                        // 检查 Agent 依赖的 Skills
                        if (agent.skills && Array.isArray(agent.skills)) {
                            for (const skillId of agent.skills) {
                                if (!existingSkillIds.has(skillId)) {
                                    // 从导入数据中查找
                                    if (data.skills && Array.isArray(data.skills)) {
                                        const skillData = data.skills.find((s: { id: string }) => s.id === skillId);
                                        if (skillData && !skillsToCreate.some((s: { id: string }) => s.id === skillId)) {
                                            skillsToCreate.push(skillData);
                                            existingSkillIds.add(skillId);  // 标记为已处理
                                            logger.info(LogTags.SETTINGS, `自动创建缺失的 Skill: ${skillId}`);
                                        }
                                    }
                                }
                            }
                        }

                        // 检查 Agent 依赖的 MCP
                        if (agent.mcpServers && Array.isArray(agent.mcpServers)) {
                            for (const mcpConfig of agent.mcpServers) {
                                const mcpId = mcpConfig.serverId;
                                if (!existingMcpIds.has(mcpId)) {
                                    // 从导入数据中查找
                                    if (importMcp) {
                                        const mcpData = importMcp.find((m: { id: string }) => m.id === mcpId);
                                        if (mcpData && !mcpToCreate.some((m: { id: string }) => m.id === mcpId)) {
                                            mcpToCreate.push(mcpData);
                                            existingMcpIds.add(mcpId);  // 标记为已处理
                                            logger.info(LogTags.SETTINGS, `自动创建缺失的 MCP: ${mcpId}`);
                                        }
                                    }
                                }
                            }
                        }

                        // 检查 Agent 依赖的 Model（仅记录警告，无法自动创建）
                        if (agent.model && !existingModelIds.has(agent.model)) {
                            if (!missingModels.includes(agent.model)) {
                                missingModels.push(agent.model);
                                logger.warn(LogTags.SETTINGS, `Agent "${agent.name}" 依赖的模型 "${agent.model}" 不存在，需要手动配置`);
                            }
                        }
                    }

                    // 先创建缺失的 Skills
                    if (skillsToCreate.length > 0) {
                        const currentSkills = await skillsStorage.load();
                        const mergedSkills = options.merge
                            ? mergeById(currentSkills, skillsToCreate)
                            : [...currentSkills, ...skillsToCreate];
                        await skillsStorage.save(mergedSkills);
                        logger.info(LogTags.SETTINGS, `已自动创建 ${skillsToCreate.length} 个缺失的 Skills`);
                    }

                    // 再创建缺失的 MCP
                    if (mcpToCreate.length > 0) {
                        const currentMcp = await mcpServersStorage.load();
                        const mergedMcp = options.merge
                            ? mergeById(currentMcp, mcpToCreate)
                            : [...currentMcp, ...mcpToCreate];
                        await mcpServersStorage.save(mergedMcp);
                        logger.info(LogTags.SETTINGS, `已自动创建 ${mcpToCreate.length} 个缺失的 MCP 服务器`);
                    }

                    // 最后导入 Agents
                    if (options.merge) {
                        const existing = await agentsStorage.load();
                        const merged = mergeById(existing, data.agents);
                        await agentsStorage.save(merged);
                    } else {
                        await agentsStorage.save(data.agents);
                    }

                    // 如果有缺失的模型，显示警告
                    if (missingModels.length > 0) {
                        logger.warn(LogTags.SETTINGS, `以下模型不存在，相关 Agent 可能无法正常工作: ${missingModels.join(', ')}`);
                    }
                } else if (data.agents) {
                    // 兼容旧逻辑：如果 agents 不是数组，直接保存
                    if (options.merge) {
                        const existing = await agentsStorage.load();
                        const merged = mergeById(existing, data.agents);
                        await agentsStorage.save(merged);
                    } else {
                        await agentsStorage.save(data.agents);
                    }
                }

                // v3.0.25: Skills 和 MCP 的独立导入
                // 即使导入包同时包含 Agents，也必须导入所有独立 Skills/MCP，避免完整配置迁移时丢失未被 Agent 引用的资源。
                if (data.skills) {
                    if (options.merge) {
                        const existing = await skillsStorage.load();
                        const merged = mergeById(existing, data.skills);
                        await skillsStorage.save(merged);
                    } else {
                        await skillsStorage.save(data.skills);
                    }
                }
                if (importMcp) {
                    if (options.merge) {
                        const existing = await mcpServersStorage.load();
                        const merged = mergeById(existing, importMcp);
                        await mcpServersStorage.save(merged);
                    } else {
                        await mcpServersStorage.save(importMcp);
                    }
                }
                if (providerCredentials) {
                    if (options.merge) {
                        const existing = await providerCredentialsStorage.load();
                        const credentialMap = new Map<string, ProviderCredential>();
                        existing.forEach((item) => credentialMap.set(item.providerId.toLowerCase(), item));
                        providerCredentials.forEach((item) => credentialMap.set(item.providerId.toLowerCase(), item));
                        await providerCredentialsStorage.save(Array.from(credentialMap.values()));
                    } else {
                        await providerCredentialsStorage.save(providerCredentials);
                    }
                }
                if (customProviders) {
                    if (options.merge) {
                        const existing = await customProviderStorage.load();
                        const merged = mergeById(existing, customProviders);
                        await customProviderStorage.save(merged);
                    } else {
                        await customProviderStorage.save(customProviders);
                    }
                }
                // v2.6.5: 添加圆桌对话导入
                if (data.roundtableChats) {
                    if (options.merge) {
                        const existing = await roundtableChatsStorage.load();
                        const merged = mergeById(existing, data.roundtableChats);
                        await roundtableChatsStorage.save(merged);
                    } else {
                        await roundtableChatsStorage.save(data.roundtableChats);
                    }
                }
                // v2.6.5: 添加应用设置导入（设置不支持合并，直接覆盖）
                if (data.settings) {
                    await settingsStorage.save(data.settings);
                }

                // v2.6.2: Tauri 环境使用 message dialog，浏览器环境使用 alert
                const successMessage = t.messages.importSuccess || '导入成功！页面将刷新以应用更改。';
                if (isTauriEnvironment()) {
                    // Tauri 的 message() 是异步的，等待用户关闭后再 reload
                    await message(successMessage, { title: 'Mobaus Studio', kind: 'info' });
                    window.location.reload();
                } else {
                    alert(successMessage);
                    window.location.reload();
                }
            } catch (error) {
                logger.error(LogTags.SETTINGS, '导入失败', error);
                // v2.6.2: 错误提示也使用 Tauri message dialog
                const errorMessage = error instanceof Error && error.message === BACKUP_CANCELLED_MESSAGE
                    ? BACKUP_CANCELLED_MESSAGE
                    : (t.messages.importError || '导入失败：文件格式无效');
                if (isTauriEnvironment()) {
                    await message(errorMessage, { title: 'Mobaus Studio', kind: 'error' });
                } else {
                    alert(errorMessage);
                }
                importingRef.current = false;  // 错误时重置，允许重试
            }
        };
        reader.readAsText(file);
        // v2.6.2: 不需要在这里关闭 modal，ImportModal 内部已经调用 onClose()
    }, [createPreImportBackup, t]);

    /**
     * 清除数据
     * v2.6.1: 添加 MODELS 键的清除
     * v2.6.5: 使用 storage services 清理数据，确保 Tauri 环境正确清理文件系统数据
     * v2.6.6: 使用 Tauri message dialog 替代 alert，解决重复弹窗问题
     */
    const handleClearData = useCallback(async () => {
        if (confirm(t.messages.confirmClearData)) {
            try {
                // v2.6.5: 使用 storage services 清理数据
                // 这样可以确保 Tauri 环境下文件系统中的数据也被清理
                await modelsStorage.save([]);
                await chatsStorage.save([]);
                await agentsStorage.save([]);
                await skillsStorage.save([]);
                await mcpServersStorage.save([]);
                await roundtableChatsStorage.save([]);
                await providerCredentialsStorage.clear();
                await customProviderStorage.clear();
                await settingsStorage.save({ theme: 'system', language: 'zh' });
                await modelFetcher.clearCache(undefined, true);

                // 同时清理 localStorage（确保浏览器环境和 Tauri 环境都被清理）
                Object.values(STORAGE_KEYS).forEach((key) => {
                    localStorage.removeItem(key);
                });
                localStorage.removeItem(BACKUP_STORAGE_KEY);

                logger.info(LogTags.SETTINGS, '数据清理完成');

                // v2.6.6: Tauri 环境使用 message dialog，浏览器环境使用 alert
                const successMessage = t.messages.dataCleared || '数据已清除。页面将刷新。';
                if (isTauriEnvironment()) {
                    await message(successMessage, { title: 'Mobaus Studio', kind: 'info' });
                    window.location.reload();
                } else {
                    alert(successMessage);
                    window.location.reload();
                }
            } catch (error) {
                logger.error(LogTags.SETTINGS, '数据清理失败', error);
                // v2.6.6: 错误提示也使用 Tauri message dialog
                const errorMessage = '数据清理失败，请重试';
                if (isTauriEnvironment()) {
                    await message(errorMessage, { title: 'Mobaus Studio', kind: 'error' });
                } else {
                    alert(errorMessage);
                }
            }
        }
    }, [t]);

    const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
        { id: 'general', label: t.settings.general, icon: <Sliders className="w-5 h-5" /> },
        { id: 'data', label: t.settings.data, icon: <Database className="w-5 h-5" /> },
        { id: 'about', label: t.settings.about, icon: <Info className="w-5 h-5" /> },
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'general':
                return (
                    <GeneralSettings
                        theme={theme}
                        language={language}
                        onThemeChange={handleThemeChange}
                        onLanguageChange={handleLanguageChange}
                    />
                );
            case 'data':
                return (
                    <DataSettings
                        onExport={() => setShowExportModal(true)}
                        onImport={() => setShowImportModal(true)}
                        onClearData={handleClearData}
                        storageSize={storageSize}
                        storagePercent={storagePercent}
                    />
                );
            case 'about':
                return (
                    <AboutSettings
                        version="1.0.0"
                        onCheckUpdate={() => alert(t.messages.upToDate)}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-gray-50 overflow-hidden">
            {/* 头部 */}
            <div className="bg-white border-b border-gray-200 px-8 py-6">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                    <Settings className="w-7 h-7 text-gray-600" />
                    {t.settings.title}
                </h2>
                <p className="text-gray-500 mt-1 ml-10">{t.settings.subtitle}</p>
            </div>

            <div className="flex-1 overflow-hidden flex">
                {/* 侧边导航栏 */}
                <div className="w-64 bg-white border-r border-gray-200 flex-shrink-0">
                    <div className="p-4 space-y-1">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-[10px] text-sm font-medium transition-colors ${activeTab === tab.id
                                    ? 'bg-purple-50 text-purple-700'
                                    : 'text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 内容区域 */}
                <div className="flex-1 overflow-y-auto">
                    <div className="max-w-3xl mx-auto p-8">
                        {renderContent()}
                    </div>
                </div>
            </div>

            {/* Modals */}
            <ExportModal
                isOpen={showExportModal}
                onClose={() => setShowExportModal(false)}
                onExport={handleExport}
            />
            <ImportModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                onImport={handleImport}
            />
        </div>
    );
};

export default SettingsPage;
