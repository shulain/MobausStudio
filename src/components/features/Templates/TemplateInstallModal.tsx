/**
 * TemplateInstallModal 组件 (v1.1.0)
 *
 * Agent 模板安装弹窗，支持一键安装 Agent 配置模板。
 * 用户可以从 URL 或本地文件导入模板，预览组件列表，配置变量后一键安装。
 *
 * v1.1.0: 支持 GitHub 仓库扫描，自动发现所有模板文件
 *
 * 对应文档: docs/modules/templates.md
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
    Link,
    FileUp,
    Download,
    AlertCircle,
    CheckCircle,
    Loader2,
    Check,
    Server,
    Sparkles,
    Bot,
    ChevronDown,
    ChevronRight,
    FolderOpen,
    Key,
    FolderInput,
    Search,
    Package,
    ArrowLeft,
} from 'lucide-react';
import { Modal, Button, Input } from '../../common';
import { useI18n } from '../../../i18n';
import { logger, LogTags } from '../../../utils/logger';
import {
    parseTemplate,
    getRequiredVariables,
    installTemplate,
    discoverTemplatesFromRepo,
    isGitHubRepoUrl,
    DiscoveredTemplate,
} from '../../../services/templateService';
import type {
    AgentTemplatePackage,
    TemplateVariable,
    TemplateInstallResult,
    MCPServer,
    Skill,
    Agent,
    MCPServerCreateInput,
    SkillCreateInput,
    AgentCreateInput,
} from '../../../types';

// ==================== 类型定义 ====================

interface TemplateInstallModalProps {
    /** 弹窗是否打开 */
    isOpen: boolean;
    /** 关闭弹窗回调 */
    onClose: () => void;
    /** 现有 MCP 服务器列表 */
    existingMCPServers: MCPServer[];
    /** 现有技能列表 */
    existingSkills: Skill[];
    /** 现有 Agent 列表 */
    existingAgents: Agent[];
    /** 创建 MCP 服务器回调 */
    onCreateMCPServer: (input: MCPServerCreateInput) => Promise<void> | void;
    /** 创建技能回调 */
    onCreateSkill: (input: SkillCreateInput) => Promise<void> | void;
    /** 创建 Agent 回调 */
    onCreateAgent: (input: AgentCreateInput) => Promise<void> | void;
}

type InstallSourceType = 'url' | 'file';

// ==================== 组件 ====================

export const TemplateInstallModal: React.FC<TemplateInstallModalProps> = ({
    isOpen,
    onClose,
    existingMCPServers,
    existingSkills,
    existingAgents,
    onCreateMCPServer,
    onCreateSkill,
    onCreateAgent,
}) => {
    const { t } = useI18n();

    // ==================== 状态 ====================

    const [activeTab, setActiveTab] = useState<InstallSourceType>('url');
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 模板数据
    const [template, setTemplate] = useState<AgentTemplatePackage | null>(null);
    const [variables, setVariables] = useState<TemplateVariable[]>([]);
    const [variableValues, setVariableValues] = useState<Record<string, string>>({});

    // v1.1.0: 发现的模板列表（GitHub 仓库扫描结果）
    const [discoveredTemplates, setDiscoveredTemplates] = useState<DiscoveredTemplate[]>([]);

    // 组件展开状态
    const [expandedSections, setExpandedSections] = useState<Set<string>>(
        new Set(['mcpServers', 'skills', 'agents'])
    );

    // 安装选项
    const [skipExisting, setSkipExisting] = useState(true);

    // 安装结果
    const [installResult, setInstallResult] = useState<TemplateInstallResult | null>(null);

    // ==================== Tab 配置 ====================

    const TABS: { id: InstallSourceType; label: string; icon: React.ReactNode }[] = [
        { id: 'url', label: t.templates.installFromUrl || '从 URL 安装', icon: <Link className="w-4 h-4" /> },
        { id: 'file', label: t.templates.installFromFile || '从文件导入', icon: <FileUp className="w-4 h-4" /> },
    ];

    // ==================== 重置状态 ====================

    const resetState = useCallback(() => {
        setUrl('');
        setError(null);
        setTemplate(null);
        setVariables([]);
        setVariableValues({});
        setInstallResult(null);
        setDiscoveredTemplates([]);
    }, []);

    // ==================== 关闭弹窗 ====================

    const handleClose = useCallback(() => {
        resetState();
        onClose();
    }, [resetState, onClose]);

    // ==================== 切换 Tab ====================

    const handleTabChange = useCallback(
        (tab: InstallSourceType) => {
            setActiveTab(tab);
            resetState();
        },
        [resetState]
    );

    // ==================== 切换展开状态 ====================

    const toggleSection = useCallback((section: string) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(section)) {
                next.delete(section);
            } else {
                next.add(section);
            }
            return next;
        });
    }, []);

    // ==================== 从 URL 获取模板 ====================

    const handleFetchTemplate = async () => {
        if (!url.trim()) {
            setError(t.templates.errorInvalidUrl || '请输入有效的模板 URL');
            return;
        }

        setIsLoading(true);
        setError(null);
        setTemplate(null);
        setDiscoveredTemplates([]);

        const trimmedUrl = url.trim();

        try {
            // v1.1.0: 如果是 GitHub 仓库地址，先扫描发现所有模板
            if (isGitHubRepoUrl(trimmedUrl)) {
                logger.info(LogTags.SKILL, '[Template] 扫描 GitHub 仓库', { url: trimmedUrl });
                const templates = await discoverTemplatesFromRepo(trimmedUrl);

                if (templates.length === 0) {
                    setError(t.templates.errorNoTemplates || '该仓库中没有找到有效的模板文件\n\n请确保仓库中包含符合格式的 JSON 文件');
                } else if (templates.length === 1) {
                    // 只有一个模板，直接加载
                    await loadTemplateFromUrl(templates[0].rawUrl);
                } else {
                    // 多个模板，显示列表让用户选择
                    setDiscoveredTemplates(templates);
                    logger.info(LogTags.SKILL, '[Template] 发现多个模板', { count: templates.length });
                }
            } else {
                // 直接加载模板文件
                await loadTemplateFromUrl(trimmedUrl);
            }
        } catch (err) {
            logger.error(LogTags.SKILL, '[Template] 获取模板失败', err);
            setError(err instanceof Error ? err.message : (t.templates.errorFetchFailed || '获取失败，请检查 URL 是否正确'));
        } finally {
            setIsLoading(false);
        }
    };

    // ==================== 加载模板 ====================

    const loadTemplateFromUrl = async (templateUrl: string) => {
        const result = await parseTemplate(templateUrl);
        setTemplate(result);

        // 提取变量
        const vars = getRequiredVariables(result);
        setVariables(vars);

        // 初始化变量值（使用默认值）
        const initialValues: Record<string, string> = {};
        vars.forEach((v) => {
            if (v.defaultValue) {
                initialValues[v.name] = v.defaultValue;
            }
        });
        setVariableValues(initialValues);

        logger.info(LogTags.SKILL, '[Template] 模板加载成功', {
            id: result.id,
            name: result.name,
            variables: vars.length,
        });
    };

    // ==================== 选择发现的模板 ====================

    const handleSelectDiscoveredTemplate = async (discovered: DiscoveredTemplate) => {
        setIsLoading(true);
        setError(null);
        setDiscoveredTemplates([]);

        try {
            await loadTemplateFromUrl(discovered.rawUrl);
        } catch (err) {
            logger.error(LogTags.SKILL, '[Template] 加载模板失败', err);
            setError(err instanceof Error ? err.message : (t.templates.errorLoadFailed || '加载模板失败'));
        } finally {
            setIsLoading(false);
        }
    };

    // ==================== 文件导入 ====================

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setError(null);
        setTemplate(null);
        setIsLoading(true);

        try {
            const content = await file.text();
            const result = await parseTemplate(content);
            setTemplate(result);

            // 提取变量
            const vars = getRequiredVariables(result);
            setVariables(vars);

            // 初始化变量值
            const initialValues: Record<string, string> = {};
            vars.forEach((v) => {
                if (v.defaultValue) {
                    initialValues[v.name] = v.defaultValue;
                }
            });
            setVariableValues(initialValues);

            logger.info(LogTags.SKILL, '[Template] 文件导入成功', {
                id: result.id,
                name: result.name,
            });
        } catch (err) {
            logger.error(LogTags.SKILL, '[Template] 解析文件失败', err);
            setError(err instanceof Error ? err.message : (t.templates.errorParseFailed || '文件解析失败，请确保是有效的模板 JSON 格式'));
        } finally {
            setIsLoading(false);
        }

        // 清空 input 以便重复选择同一文件
        event.target.value = '';
    };

    // ==================== 更新变量值 ====================

    const handleVariableChange = useCallback((name: string, value: string) => {
        setVariableValues((prev) => ({
            ...prev,
            [name]: value,
        }));
    }, []);

    // ==================== 检查变量是否完整 ====================

    const isVariablesComplete = useMemo(() => {
        return variables.every((v) => !v.required || variableValues[v.name]?.trim());
    }, [variables, variableValues]);

    // ==================== 安装模板 ====================

    const handleInstall = async () => {
        if (!template) return;

        setIsLoading(true);
        setError(null);

        try {
            const result = await installTemplate(
                template,
                {
                    variables: variableValues,
                    skipExisting,
                    dryRun: false,
                },
                {
                    getMCPServers: () => existingMCPServers,
                    getSkills: () => existingSkills,
                    getAgents: () => existingAgents,
                    createMCPServer: onCreateMCPServer,
                    createSkill: onCreateSkill,
                    createAgent: onCreateAgent,
                }
            );

            setInstallResult(result);

            if (result.success) {
                logger.info(LogTags.SKILL, '[Template] 模板安装成功', result);
            } else {
                logger.warn(LogTags.SKILL, '[Template] 模板安装部分失败', result);
            }
        } catch (err) {
            logger.error(LogTags.SKILL, '[Template] 安装失败', err);
            setError(err instanceof Error ? err.message : (t.templates.errorInstallFailed || '安装失败'));
        } finally {
            setIsLoading(false);
        }
    };

    // ==================== 渲染变量输入 ====================

    const renderVariableInput = (variable: TemplateVariable) => {
        const value = variableValues[variable.name] || '';
        const Icon = variable.type === 'secret' ? Key : variable.type === 'path' ? FolderInput : null;

        return (
            <div key={variable.name} className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    {Icon && <Icon className="w-4 h-4 text-gray-400" />}
                    {variable.label}
                    {variable.required && <span className="text-red-500">*</span>}
                </label>
                <Input
                    type={variable.type === 'secret' ? 'password' : 'text'}
                    value={value}
                    onChange={(val) => handleVariableChange(variable.name, val)}
                    placeholder={variable.description || (t.templates.enterVariable || '请输入 {label}').replace('{label}', variable.label)}
                    className="w-full"
                />
                {variable.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{variable.description}</p>
                )}
            </div>
        );
    };

    // ==================== 渲染组件列表 ====================

    const renderComponentSection = (
        title: string,
        icon: React.ReactNode,
        sectionKey: string,
        items: Array<{ id: string; name: string; description?: string }>,
        colorClass: string
    ) => {
        const isExpanded = expandedSections.has(sectionKey);
        const count = items.length;

        if (count === 0) return null;

        return (
            <div className="border border-gray-200 dark:border-gray-700 rounded-[10px] overflow-hidden">
                <button
                    type="button"
                    onClick={() => toggleSection(sectionKey)}
                    className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                        ) : (
                            <ChevronRight className="w-4 h-4 text-gray-500" />
                        )}
                        <span className={colorClass}>{icon}</span>
                        <span className="font-medium text-gray-700 dark:text-gray-200">{title}</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">({count})</span>
                    </div>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                </button>
                {isExpanded && (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {items.map((item) => (
                            <div
                                key={item.id}
                                className="p-3 flex items-center gap-3 bg-white dark:bg-gray-900"
                            >
                                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-gray-800 dark:text-gray-100 truncate">
                                        {item.name}
                                    </div>
                                    {item.description && (
                                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                            {item.description}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // ==================== 渲染安装结果 ====================

    const renderInstallResult = () => {
        if (!installResult) return null;

        const totalInstalled =
            installResult.installed.mcpServers.length +
            installResult.installed.skills.length +
            installResult.installed.agents.length;

        const totalSkipped =
            installResult.skipped.mcpServers.length +
            installResult.skipped.skills.length +
            installResult.skipped.agents.length;

        return (
            <div className="space-y-4">
                {/* 结果概要 */}
                <div
                    className={`p-4 rounded-[10px] ${
                        installResult.success
                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                            : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                    }`}
                >
                    <div className="flex items-center gap-2">
                        {installResult.success ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                            <AlertCircle className="w-5 h-5 text-yellow-500" />
                        )}
                        <span
                            className={`font-medium ${
                                installResult.success
                                    ? 'text-green-700 dark:text-green-300'
                                    : 'text-yellow-700 dark:text-yellow-300'
                            }`}
                        >
                            {installResult.success ? (t.templates.installComplete || '安装完成') : (t.templates.installPartialFail || '安装完成（部分失败）')}
                        </span>
                    </div>
                    <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        <p>✅ {t.templates.installed || '已安装'}: {totalInstalled} {t.templates.components || '个组件'}</p>
                        {totalSkipped > 0 && <p>⏭️ {t.templates.skipped || '已跳过'}: {totalSkipped} {t.templates.components || '个组件'} {t.templates.existingSkipped || '（已存在）'}</p>}
                        {installResult.errors.length > 0 && (
                            <p>❌ {t.templates.failed || '失败'}: {installResult.errors.length} {t.templates.components || '个组件'}</p>
                        )}
                    </div>
                </div>

                {/* 错误详情 */}
                {installResult.errors.length > 0 && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-[10px]">
                        <div className="font-medium text-red-700 dark:text-red-300 mb-2">{t.templates.installErrors || '安装错误:'}</div>
                        <ul className="text-sm text-red-600 dark:text-red-400 space-y-1">
                            {installResult.errors.map((err, index) => (
                                <li key={index}>
                                    • [{err.component}] {err.id}: {err.error}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        );
    };

    // ==================== 渲染发现的模板列表 ====================

    const renderDiscoveredTemplates = () => {
        return (
            <div className="space-y-4">
                {/* 返回按钮和标题 */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setDiscoveredTemplates([])}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-[10px] transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-500" />
                    </button>
                    <div>
                        <h3 className="font-semibold text-gray-800 dark:text-gray-100">
                            {(t.templates.discoveredTemplates || '发现 {count} 个模板').replace('{count}', discoveredTemplates.length.toString())}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {t.templates.selectTemplate || '选择要安装的模板'}
                        </p>
                    </div>
                </div>

                {/* 模板列表 */}
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {discoveredTemplates.map((discovered) => (
                        <div
                            key={discovered.path}
                            onClick={() => handleSelectDiscoveredTemplate(discovered)}
                            className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-[10px] hover:border-purple-400 dark:hover:border-purple-500 hover:shadow-md transition-all cursor-pointer"
                        >
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-[#FEF3C7] to-[#DBEAFE] dark:from-purple-900/50 dark:to-pink-900/50 rounded-[10px] flex items-center justify-center flex-shrink-0">
                                    {discovered.icon ? (
                                        <span className="text-xl">{discovered.icon}</span>
                                    ) : (
                                        <Package className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-medium text-gray-800 dark:text-gray-100 truncate">
                                            {discovered.name}
                                        </h4>
                                        <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                            v{discovered.version}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">
                                        {discovered.description}
                                    </p>
                                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                                        {discovered.stats.mcpServers > 0 && (
                                            <span className="flex items-center gap-1">
                                                <Server className="w-3 h-3" />
                                                {discovered.stats.mcpServers} MCP
                                            </span>
                                        )}
                                        {discovered.stats.skills > 0 && (
                                            <span className="flex items-center gap-1">
                                                <Sparkles className="w-3 h-3" />
                                                {discovered.stats.skills} {t.templates.skills || '技能'}
                                            </span>
                                        )}
                                        {discovered.stats.agents > 0 && (
                                            <span className="flex items-center gap-1">
                                                <Bot className="w-3 h-3" />
                                                {discovered.stats.agents} Agent
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1 truncate">
                                        📁 {discovered.path}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // ==================== 渲染内容 ====================

    const renderContent = () => {
        // 显示安装结果
        if (installResult) {
            return (
                <div className="space-y-4">
                    {renderInstallResult()}
                    <div className="flex justify-end">
                        <Button onClick={handleClose}>{t.templates.done || '完成'}</Button>
                    </div>
                </div>
            );
        }

        // v1.1.0: 显示发现的模板列表
        if (discoveredTemplates.length > 0) {
            return renderDiscoveredTemplates();
        }

        // 显示模板预览和变量配置
        if (template) {
            return (
                <div className="space-y-6">
                    {/* 模板信息 */}
                    <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-[10px] border border-purple-200 dark:border-purple-800">
                        <div className="flex items-center gap-3">
                            {template.icon && <span className="text-2xl">{template.icon}</span>}
                            <div>
                                <h3 className="font-semibold text-gray-800 dark:text-gray-100">
                                    {template.name}
                                </h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {template.description}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-gray-500">v{template.version}</span>
                                    {template.author && (
                                        <span className="text-xs text-gray-500">by {template.author}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 组件列表 */}
                    <div className="space-y-3">
                        <h4 className="font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2">
                            <FolderOpen className="w-4 h-4" />
                            {t.templates.willInstall || '将安装以下组件:'}
                        </h4>

                        {renderComponentSection(
                            t.templates.mcpServers || 'MCP 服务器',
                            <Server className="w-4 h-4" />,
                            'mcpServers',
                            template.components.mcpServers?.map((s) => ({
                                id: s.id,
                                name: s.name,
                                description: s.description,
                            })) || [],
                            'text-green-500'
                        )}

                        {renderComponentSection(
                            t.templates.skills || '技能',
                            <Sparkles className="w-4 h-4" />,
                            'skills',
                            template.components.skills?.map((s, i) => ({
                                id: s.inline?.id || `skill-${i}`,
                                name: s.inline?.name || s.url || (t.templates.installFromUrl || '从 URL 安装'),
                                description: s.inline?.description || s.url,
                            })) || [],
                            'text-blue-500'
                        )}

                        {renderComponentSection(
                            'Agent',
                            <Bot className="w-4 h-4" />,
                            'agents',
                            template.components.agents?.map((a) => ({
                                id: a.id,
                                name: a.name,
                                description: a.description,
                            })) || [],
                            'text-purple-500'
                        )}
                    </div>

                    {/* 变量配置 */}
                    {variables.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2">
                                <Key className="w-4 h-4" />
                                {t.templates.configureVariables || '配置变量:'}
                            </h4>
                            <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-[10px]">
                                {variables.map(renderVariableInput)}
                            </div>
                        </div>
                    )}

                    {/* 安装选项 */}
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="skipExisting"
                            checked={skipExisting}
                            onChange={(e) => setSkipExisting(e.target.checked)}
                            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        <label htmlFor="skipExisting" className="text-sm text-gray-600 dark:text-gray-400">
                            {t.templates.skipExisting || '跳过已存在的组件（不覆盖）'}
                        </label>
                    </div>

                    {/* 错误提示 */}
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-[10px] flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                            <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
                        </div>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex justify-end gap-3">
                        <Button variant="secondary" onClick={() => setTemplate(null)}>
                            {t.templates.back || '返回'}
                        </Button>
                        <Button
                            onClick={handleInstall}
                            disabled={isLoading || !isVariablesComplete}
                            className="bg-gradient-to-bl from-[#A688F6] to-[#009BF3] hover:opacity-90"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    {t.templates.installing || '安装中...'}
                                </>
                            ) : (
                                <>
                                    <Download className="w-4 h-4 mr-2" />
                                    {t.templates.install || '安装模板'}
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            );
        }

        // 显示输入界面
        return (
            <div className="space-y-4">
                {/* Tab 切换 */}
                <div className="flex border-b border-gray-200 dark:border-gray-700">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === tab.id
                                    ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* URL 输入 */}
                {activeTab === 'url' && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {t.templates.urlLabel || '模板 URL 或 GitHub 仓库地址'}
                            </label>
                            <div className="flex gap-2">
                                <Input
                                    value={url}
                                    onChange={(val) => setUrl(val)}
                                    placeholder={t.templates.urlPlaceholder || 'https://github.com/user/repo'}
                                    className="flex-1"
                                    onKeyDown={(e) => e.key === 'Enter' && handleFetchTemplate()}
                                />
                                <Button onClick={handleFetchTemplate} disabled={isLoading || !url.trim()}>
                                    {isLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <><Search className="w-4 h-4 mr-1" />{t.templates.search || '搜索'}</>
                                    )}
                                </Button>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                                <p>✨ {t.templates.urlHint || '输入 GitHub 仓库地址，自动扫描发现所有模板文件'}</p>
                                <p className="text-gray-400">{t.templates.urlFormatHint || '支持格式: https://github.com/用户名/仓库名'}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* 文件导入 */}
                {activeTab === 'file' && (
                    <div className="space-y-4">
                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-[10px] p-8 text-center">
                            <FileUp className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                            <p className="text-gray-600 dark:text-gray-400 mb-4">
                                {t.templates.dropFileHere || '拖拽 JSON 文件到此处，或点击选择文件'}
                            </p>
                            <label className="inline-block">
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                <span className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-[10px] cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                    {t.templates.selectFile || '选择文件'}
                                </span>
                            </label>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                                {t.templates.supportedFormat || '支持 .json 格式的模板文件'}
                            </p>
                        </div>
                    </div>
                )}

                {/* 错误提示 */}
                {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-[10px] flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">
                            {error}
                        </span>
                    </div>
                )}

                {/* 加载状态 */}
                {isLoading && (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                        <span className="ml-3 text-gray-600 dark:text-gray-400">{t.templates.loading || '正在加载模板...'}</span>
                    </div>
                )}
            </div>
        );
    };

    // ==================== 渲染 ====================

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={`📦 ${t.templates.title || '安装 Agent 模板'}`}
            size="lg"
        >
            <div className="p-4">{renderContent()}</div>
        </Modal>
    );
};

export default TemplateInstallModal;
