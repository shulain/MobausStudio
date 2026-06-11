/**
 * AgentModal 组件 (v3.6.0)
 *
 * Agent 创建/编辑弹窗
 * - 基本信息配置（名称、描述、模型）
 * - 技能选择（v2.0.0: 支持新 Skill 类型，显示内置标签和提示词预览）
 * - 系统提示词配置
 * - MCP 工具配置
 * - 权限与安全配置 (v2.4.0)
 * - 可用模型筛选 (v3.6.0): 仅显示 status='online' 的模型
 *
 * 对应文档: docs/modules/agent.md
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Button, Input, Textarea, Select } from '../../common';
import {
    PlugZap, Wrench, Lock, Puzzle, Eye, Shield, FolderOpen,
    Plus, X, FileText, Clock, AlertTriangle, FolderSearch,
    CheckCircle2, XCircle, AlertCircle, Loader2
} from 'lucide-react';
import { useI18n, getLocalizedText } from '../../../i18n';
import type {
    Agent, AgentCreateInput, Skill, AIModel, MCPServer, AgentMCPConfig,
    AgentPermissions, AgentContext, AgentLimits, AgentAutoApprove, MCPServerStatus
} from '../../../types';
import { isTauri } from '../../../utils/platform';
import { logger, LogTags } from '../../../utils/logger';

/**
 * 分类显示名称映射 - 使用 i18n
 */
const getCategoryLabels = (t: ReturnType<typeof useI18n>['t']): Record<string, string> => ({
    writing: t.skills.categoryWriting,
    coding: t.skills.categoryCoding,
    analysis: t.skills.categoryAnalysis,
    translation: t.skills.categoryTranslation,
    creative: t.skills.categoryCreative,
    productivity: t.skills.categoryProductivity,
    custom: t.skills.categoryCustom,
});

/**
 * 预设的权限规则模板 - 使用 i18n
 */
const getPresetAllowRules = (t: ReturnType<typeof useI18n>['t']) => [
    { label: t.agent.presetReadFiles, value: 'Read' },
    { label: t.agent.presetNpmRun, value: 'Bash(npm run *)' },
    { label: t.agent.presetGitOps, value: 'Bash(git *)' },
    { label: t.agent.presetWebSearch, value: 'WebSearch' },
];

const getPresetDenyRules = (t: ReturnType<typeof useI18n>['t']) => [
    { label: t.agent.presetDenyDelete, value: 'Bash(rm -rf *)' },
    { label: t.agent.presetDenyFormat, value: 'Bash(mkfs *)' },
    { label: t.agent.presetDenyShutdown, value: 'Bash(shutdown *)' },
];

interface AgentModalProps {
    isOpen: boolean;
    onClose: () => void;
    agent: Agent | null;
    models: AIModel[];
    skills: Skill[];
    mcpServers: MCPServer[];  // MCP 服务器列表 (v2.1.0)
    onSave: (data: AgentCreateInput) => void;
}

export const AgentModal: React.FC<AgentModalProps> = ({
    isOpen,
    onClose,
    agent,
    models,
    skills,
    mcpServers,
    onSave,
}) => {
    const { t, language } = useI18n();

    // 生成本地化的选项
    const categoryLabels = getCategoryLabels(t);
    const PRESET_ALLOW_RULES = getPresetAllowRules(t);
    const PRESET_DENY_RULES = getPresetDenyRules(t);

    // 基本信息状态
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [model, setModel] = useState('');
    const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
    const [systemPrompt, setSystemPrompt] = useState('');
    const [temperature, setTemperature] = useState('0.7');
    const [maxTokens, setMaxTokens] = useState('2048');

    // MCP 配置状态 (v2.1.0)
    const [enableToolUse, setEnableToolUse] = useState(false);
    const [selectedMCPServers, setSelectedMCPServers] = useState<AgentMCPConfig[]>([]);

    // 权限配置状态 (v2.4.0)
    const [showPermissions, setShowPermissions] = useState(false);
    const [allowedPaths, setAllowedPaths] = useState<string[]>([]);
    const [deniedPaths, setDeniedPaths] = useState<string[]>([]);
    const [workingDirectory, setWorkingDirectory] = useState('');
    const [allowRules, setAllowRules] = useState<string[]>([]);
    const [denyRules, setDenyRules] = useState<string[]>([]);

    // 自动批准状态 (v2.4.0)
    const [autoApproveReadFiles, setAutoApproveReadFiles] = useState(false);
    const [autoApproveWriteFiles, setAutoApproveWriteFiles] = useState(false);
    const [autoApproveBashCommands, setAutoApproveBashCommands] = useState<string[]>([]);
    const [autoApproveMcpTools, setAutoApproveMcpTools] = useState<string[]>([]);

    // 上下文配置状态 (v2.4.0)
    const [contextFiles, setContextFiles] = useState<string[]>([]);
    const [contextUrls, setContextUrls] = useState<string[]>([]);
    const [additionalInstructions, setAdditionalInstructions] = useState('');

    // 执行限制状态 (v2.4.0)
    const [maxToolCalls, setMaxToolCalls] = useState('50');
    const [toolCallTimeout, setToolCallTimeout] = useState('30');
    const [maxFileSize, setMaxFileSize] = useState('10');
    const [sandboxMode, setSandboxMode] = useState(false);

    // 临时输入状态
    const [newPath, setNewPath] = useState('');
    const [newRule, setNewRule] = useState('');
    const [newContextFile, setNewContextFile] = useState('');
    const [newContextUrl, setNewContextUrl] = useState('');
    const [newBashCommand, setNewBashCommand] = useState('');

    // 检测是否在 Tauri 环境（使用工具函数）
    const inTauri = isTauri();

    /**
     * v3.0.25: 获取可显示的 MCP 服务器列表
     * 显示条件：已启用(enabled=true) 或 Agent 已关联（即使未启用也要显示）
     * 这样编辑 Agent 时，已关联但未启用的 MCP 仍然会显示并保持选中状态
     */
    const displayServers = useMemo(() => {
        const agentMcpIds = new Set(selectedMCPServers.map(s => s.serverId));
        return mcpServers.filter(s =>
            s.enabled || agentMcpIds.has(s.id)  // 已启用 或 Agent 已关联
        );
    }, [mcpServers, selectedMCPServers]);

    /**
     * v2.5.0: 获取 MCP 服务器状态图标
     */
    const getMCPStatusIcon = (status: MCPServerStatus) => {
        switch (status) {
            case 'connected':
                return <CheckCircle2 size={12} className="text-green-500" />;
            case 'connecting':
                return <Loader2 size={12} className="text-blue-500 animate-spin" />;
            case 'error':
                return <XCircle size={12} className="text-red-500" />;
            case 'disconnected':
            default:
                return <AlertCircle size={12} className="text-yellow-500" />;
        }
    };

    /**
     * v2.5.0: 获取 MCP 服务器状态文本
     */
    const getMCPStatusText = (status: MCPServerStatus) => {
        switch (status) {
            case 'connected':
                return t.mcp.connected;
            case 'connecting':
                return t.mcp.connecting;
            case 'error':
                return t.mcp.error;
            case 'disconnected':
            default:
                return t.mcp.disconnected;
        }
    };

    /**
     * v3.6.0: 筛选可用模型（status === 'online'）
     * Agent 编辑弹窗的模型选择器仅显示已验证可用的模型
     */
    const availableModels = useMemo(() => {
        return models.filter(m => m.status === 'online');
    }, [models]);

    const canSubmit = name.trim().length > 0 && availableModels.some(m => m.id === model);

    /**
     * 使用 Tauri 打开目录选择器
     * @param target 目标：'working' | 'allowed' | 'denied'
     */
    const handleSelectDirectory = async (target: 'working' | 'allowed' | 'denied') => {
        if (!inTauri) return;

        try {
            // 动态导入 Tauri dialog API
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({
                directory: true,
                multiple: target !== 'working', // 工作目录只能选一个，其他可以多选
                title: target === 'working' ? '选择工作目录' : target === 'allowed' ? '选择允许访问的目录' : '选择禁止访问的目录',
            });

            if (selected) {
                if (target === 'working') {
                    // 工作目录：单选
                    setWorkingDirectory(Array.isArray(selected) ? selected[0] : selected);
                } else if (target === 'allowed') {
                    // 允许路径：可多选
                    const paths = Array.isArray(selected) ? selected : [selected];
                    setAllowedPaths(prev => [...prev, ...paths.filter(p => !prev.includes(p))]);
                } else {
                    // 禁止路径：可多选
                    const paths = Array.isArray(selected) ? selected : [selected];
                    setDeniedPaths(prev => [...prev, ...paths.filter(p => !prev.includes(p))]);
                }
            }
        } catch (error) {
            logger.error(LogTags.AGENT, '选择目录失败:', error);
        }
    };

    useEffect(() => {
        if (agent) {
            // 基本信息
            setName(agent.name);
            setDescription(agent.description);
            setModel(agent.model);
            setSelectedSkills(agent.skills);
            setSystemPrompt(agent.systemPrompt || '');
            setTemperature(agent.temperature.toString());
            setMaxTokens(agent.maxTokens.toString());
            // MCP 配置 (v2.1.0)
            setEnableToolUse(agent.enableToolUse || false);
            setSelectedMCPServers(agent.mcpServers || []);
            // 权限配置 (v2.4.0)
            setAllowedPaths(agent.permissions?.allowedPaths || []);
            setDeniedPaths(agent.permissions?.deniedPaths || []);
            setWorkingDirectory(agent.permissions?.workingDirectory || '');
            setAllowRules(agent.permissions?.allow || []);
            setDenyRules(agent.permissions?.deny || []);
            setAutoApproveReadFiles(agent.permissions?.autoApprove?.readFiles || false);
            setAutoApproveWriteFiles(agent.permissions?.autoApprove?.writeFiles || false);
            setAutoApproveBashCommands(agent.permissions?.autoApprove?.bashCommands || []);
            setAutoApproveMcpTools(agent.permissions?.autoApprove?.mcpTools || []);
            // 上下文配置 (v2.4.0)
            setContextFiles(agent.context?.files || []);
            setContextUrls(agent.context?.urls || []);
            setAdditionalInstructions(agent.context?.additionalInstructions || '');
            // 执行限制 (v2.4.0)
            setMaxToolCalls((agent.limits?.maxToolCalls || 50).toString());
            setToolCallTimeout((agent.limits?.toolCallTimeout || 30).toString());
            setMaxFileSize(((agent.limits?.maxFileSize || 10485760) / 1048576).toString());
            setSandboxMode(agent.limits?.sandboxMode || false);
            // 如果有权限配置，展开权限区域
            if (agent.permissions || agent.context || agent.limits) {
                setShowPermissions(true);
            }
        } else {
            // 重置所有状态
            setName('');
            setDescription('');
            // v3.6.0: 默认选择第一个可用（online）模型
            const firstAvailableModel = models.find(m => m.status === 'online');
            setModel(firstAvailableModel?.id || '');
            setSelectedSkills([]);
            setSystemPrompt('');
            setTemperature('0.7');
            setMaxTokens('2048');
            setEnableToolUse(false);
            setSelectedMCPServers([]);
            setShowPermissions(false);
            setAllowedPaths([]);
            setDeniedPaths([]);
            setWorkingDirectory('');
            setAllowRules([]);
            setDenyRules([]);
            setAutoApproveReadFiles(false);
            setAutoApproveWriteFiles(false);
            setAutoApproveBashCommands([]);
            setAutoApproveMcpTools([]);
            setContextFiles([]);
            setContextUrls([]);
            setAdditionalInstructions('');
            setMaxToolCalls('50');
            setToolCallTimeout('30');
            setMaxFileSize('10');
            setSandboxMode(false);
        }
    }, [agent, models]);

    const handleSkillToggle = (skillId: string) => {
        setSelectedSkills((prev) =>
            prev.includes(skillId)
                ? prev.filter((id) => id !== skillId)
                : [...prev, skillId]
        );
    };

    // MCP 服务器切换 (v2.1.0)
    const handleMCPServerToggle = (server: MCPServer) => {
        setSelectedMCPServers((prev) => {
            const exists = prev.some(s => s.serverId === server.id);
            if (exists) {
                return prev.filter(s => s.serverId !== server.id);
            } else {
                return [...prev, {
                    serverId: server.id,
                    serverName: server.name,
                    enabledTools: undefined, // 全部启用
                }];
            }
        });
    };

    // 添加路径到列表
    const handleAddPath = (type: 'allowed' | 'denied') => {
        if (!newPath.trim()) return;
        if (type === 'allowed') {
            setAllowedPaths(prev => [...prev, newPath.trim()]);
        } else {
            setDeniedPaths(prev => [...prev, newPath.trim()]);
        }
        setNewPath('');
    };

    // 添加规则到列表
    const handleAddRule = (type: 'allow' | 'deny') => {
        if (!newRule.trim()) return;
        if (type === 'allow') {
            setAllowRules(prev => [...prev, newRule.trim()]);
        } else {
            setDenyRules(prev => [...prev, newRule.trim()]);
        }
        setNewRule('');
    };

    // 添加上下文文件
    const handleAddContextFile = () => {
        if (!newContextFile.trim()) return;
        setContextFiles(prev => [...prev, newContextFile.trim()]);
        setNewContextFile('');
    };

    // 添加上下文 URL
    const handleAddContextUrl = () => {
        if (!newContextUrl.trim()) return;
        setContextUrls(prev => [...prev, newContextUrl.trim()]);
        setNewContextUrl('');
    };

    // 添加自动批准的 Bash 命令
    const handleAddBashCommand = () => {
        if (!newBashCommand.trim()) return;
        setAutoApproveBashCommands(prev => [...prev, newBashCommand.trim()]);
        setNewBashCommand('');
    };

    const handleSubmit = () => {
        if (!canSubmit) {
            return;
        }

        // 构建权限配置
        const autoApprove: AgentAutoApprove | undefined =
            (autoApproveReadFiles || autoApproveWriteFiles || autoApproveBashCommands.length > 0 || autoApproveMcpTools.length > 0)
                ? {
                    readFiles: autoApproveReadFiles || undefined,
                    writeFiles: autoApproveWriteFiles || undefined,
                    bashCommands: autoApproveBashCommands.length > 0 ? autoApproveBashCommands : undefined,
                    mcpTools: autoApproveMcpTools.length > 0 ? autoApproveMcpTools : undefined,
                }
                : undefined;

        const permissions: AgentPermissions | undefined =
            (allowedPaths.length > 0 || deniedPaths.length > 0 || workingDirectory || allowRules.length > 0 || denyRules.length > 0 || autoApprove)
                ? {
                    allowedPaths: allowedPaths.length > 0 ? allowedPaths : undefined,
                    deniedPaths: deniedPaths.length > 0 ? deniedPaths : undefined,
                    workingDirectory: workingDirectory || undefined,
                    allow: allowRules.length > 0 ? allowRules : undefined,
                    deny: denyRules.length > 0 ? denyRules : undefined,
                    autoApprove,
                }
                : undefined;

        // 构建上下文配置
        const context: AgentContext | undefined =
            (contextFiles.length > 0 || contextUrls.length > 0 || additionalInstructions)
                ? {
                    files: contextFiles.length > 0 ? contextFiles : undefined,
                    urls: contextUrls.length > 0 ? contextUrls : undefined,
                    additionalInstructions: additionalInstructions || undefined,
                }
                : undefined;

        // 构建执行限制
        const limits: AgentLimits | undefined =
            (parseInt(maxToolCalls) !== 50 || parseInt(toolCallTimeout) !== 30 || parseFloat(maxFileSize) !== 10 || sandboxMode)
                ? {
                    maxToolCalls: parseInt(maxToolCalls) || 50,
                    toolCallTimeout: parseInt(toolCallTimeout) || 30,
                    maxFileSize: Math.round(parseFloat(maxFileSize) * 1048576) || 10485760,
                    sandboxMode: sandboxMode || undefined,
                }
                : undefined;

        onSave({
            name: name.trim(),
            description: description.trim(),
            model,
            skills: selectedSkills,
            systemPrompt,
            temperature: parseFloat(temperature),
            maxTokens: parseInt(maxTokens),
            // MCP 配置 (v2.1.0)
            enableToolUse,
            mcpServers: enableToolUse ? selectedMCPServers : undefined,
            // 权限与安全配置 (v2.4.0)
            permissions,
            context,
            limits,
        });
        onClose();
    };

    const getSkillColor = (color: string) => {
        const colors: Record<string, string> = {
            blue: 'from-blue-500 to-cyan-500',
            green: 'from-green-500 to-emerald-500',
            purple: 'from-[#F6C433] via-[#E90E55] via-[#E44F32] via-[#A188E3] to-[#0DB4EA]',
            orange: 'from-orange-500 to-red-500',
        };
        return colors[color] || colors.blue;
    };

    // 渲染标签列表组件
    const renderTagList = (
        items: string[],
        onRemove: (index: number) => void,
        colorClass: string = 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
    ) => (
        <div className="flex flex-wrap gap-2">
            {items.map((item, index) => (
                <span
                    key={index}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs ${colorClass}`}
                >
                    {item}
                    <button
                        type="button"
                        onClick={() => onRemove(index)}
                        className="hover:opacity-70"
                    >
                        <X size={12} />
                    </button>
                </span>
            ))}
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={agent ? t.agent.editAgent : t.agent.newAgent}
            size="lg"
        >
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                        {t.agent.agentName}
                    </label>
                    <Input
                        value={name}
                        onChange={setName}
                        placeholder={t.agent.namePlaceholder}
                    />
                </div>

                <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                        {t.agent.description}
                    </label>
                    <Textarea
                        value={description}
                        onChange={setDescription}
                        placeholder={t.agent.descriptionPlaceholder}
                        rows={3}
                    />
                </div>

                <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                        {t.agent.selectModel}
                    </label>
                    {/* v3.6.0: 仅显示可用（online）模型 */}
                    {availableModels.length === 0 ? (
                        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3 py-2 rounded-[10px]">
                            <AlertTriangle size={16} />
                            <span>{t.agent.configureModelFirst}</span>
                        </div>
                    ) : (
                        <Select
                            value={model}
                            onChange={setModel}
                            options={availableModels.map((m) => ({ value: m.id, label: m.name }))}
                        />
                    )}
                </div>

                <div>
                    <div className="flex items-center justify-between mb-3">
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                            <Puzzle className="w-4 h-4" />
                            {t.agent.configureSkills}
                        </label>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {t.agent.skillsSelected.replace('{count}', String(selectedSkills.length))}
                        </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                        {t.agent.skillsHint}
                    </p>
                    {skills.length === 0 ? (
                        <div className="text-center py-4 bg-gray-50 dark:bg-gray-800 rounded-[10px] border border-dashed border-gray-300 dark:border-gray-600">
                            <Puzzle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {t.agent.noSkillsAvailable}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                            {skills.filter(s => s.enabled).map((skill) => {
                                const isSelected = selectedSkills.includes(skill.id);
                                return (
                                    <div
                                        key={skill.id}
                                        onClick={() => handleSkillToggle(skill.id)}
                                        className={`p-3 border-2 rounded-[10px] cursor-pointer transition-all ${isSelected
                                            ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/30 dark:border-purple-500'
                                            : 'border-gray-200 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-500 bg-white dark:bg-gray-800'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => { }}
                                                className="w-4 h-4 accent-purple-500"
                                            />
                                            <div
                                                className={`p-2 bg-gradient-to-br ${getSkillColor(
                                                    skill.color
                                                )} rounded-[10px] text-white`}
                                            >
                                                <Puzzle size={14} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1">
                                                    <span className="font-medium text-sm text-gray-800 dark:text-gray-100 truncate">
                                                        {getLocalizedText(skill.name, language)}
                                                    </span>
                                                    {skill.builtIn && (
                                                        <Lock className="w-3 h-3 text-purple-500 flex-shrink-0" />
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                                    {categoryLabels[skill.category] || skill.category}
                                                </div>
                                            </div>
                                        </div>
                                        {/* 提示词预览 */}
                                        {isSelected && skill.promptTemplate && (
                                            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                                                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                    <Eye className="w-3 h-3" />
                                                    {t.agent.promptPreview}
                                                </div>
                                                <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">
                                                    {skill.promptTemplate.slice(0, 100)}...
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                        {t.agent.systemPrompt}
                    </label>
                    <Textarea
                        value={systemPrompt}
                        onChange={setSystemPrompt}
                        placeholder={t.agent.systemPromptPlaceholder}
                        rows={4}
                        className="font-mono text-sm"
                    />
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4">{t.agent.advancedSettings}</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-2">
                                {t.agent.temperature}
                            </label>
                            <Input
                                type="number"
                                value={temperature}
                                onChange={setTemperature}
                                className="text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-2">
                                {t.agent.maxTokens}
                            </label>
                            <Input
                                type="number"
                                value={maxTokens}
                                onChange={setMaxTokens}
                                className="text-sm"
                            />
                        </div>
                    </div>
                </div>

                {/* MCP 工具配置 (v2.1.0) */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <PlugZap className="w-5 h-5 text-green-600" />
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t.agent.mcpToolCall}</h3>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={enableToolUse}
                                onChange={(e) => setEnableToolUse(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-600"></div>
                        </label>
                    </div>

                    {enableToolUse && (
                        <div className="space-y-3">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {t.agent.mcpHint}
                            </p>
                            {/* v3.0.25: 显示所有启用的 MCP 服务器 + Agent 已关联的 MCP */}
                            {displayServers.length === 0 ? (
                                <div className="text-center py-4 bg-gray-50 dark:bg-gray-800 rounded-[10px] border border-dashed border-gray-300 dark:border-gray-600">
                                    <PlugZap className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        {t.agent.noMcpServers}
                                    </p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                        {t.agent.noMcpServersHint}
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3">
                                    {displayServers.map((server) => {
                                        const isSelected = selectedMCPServers.some(s => s.serverId === server.id);
                                        const toolCount = server.tools?.length || 0;
                                        const isConnected = server.status === 'connected';
                                        const statusIcon = getMCPStatusIcon(server.status);
                                        const statusText = getMCPStatusText(server.status);
                                        // v3.0.25: 标记未启用的 MCP
                                        const isDisabled = !server.enabled;

                                        return (
                                            <div
                                                key={server.id}
                                                onClick={() => handleMCPServerToggle(server)}
                                                className={`p-3 border-2 rounded-[10px] cursor-pointer transition-all ${isSelected
                                                    ? 'border-green-400 bg-green-50 dark:bg-green-900/30 dark:border-green-500'
                                                    : isDisabled
                                                        ? 'border-orange-200 dark:border-orange-600 hover:border-orange-300 dark:hover:border-orange-500 bg-orange-50/50 dark:bg-orange-900/20'
                                                        : 'border-gray-200 dark:border-gray-600 hover:border-green-300 dark:hover:border-green-500 bg-white dark:bg-gray-800'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => { }}
                                                        className="w-4 h-4 accent-green-500"
                                                    />
                                                    <div className={`p-2 rounded-[10px] text-white ${
                                                        isConnected
                                                            ? 'bg-gradient-to-br from-green-500 to-emerald-500'
                                                            : isDisabled
                                                                ? 'bg-gradient-to-br from-orange-400 to-orange-500'
                                                                : 'bg-gradient-to-br from-gray-400 to-gray-500'
                                                    }`}>
                                                        <PlugZap size={14} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1">
                                                            <span className="font-medium text-sm text-gray-800 dark:text-gray-100 truncate">
                                                                {server.name}
                                                            </span>
                                                            {/* v3.0.25: 未启用标记 */}
                                                            {isDisabled && (
                                                                <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400">
                                                                    {t.mcp.disabled || '未启用'}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 text-xs">
                                                            {/* 状态指示 */}
                                                            <span className="flex items-center gap-1">
                                                                {statusIcon}
                                                                <span className={`${
                                                                    isConnected ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
                                                                }`}>
                                                                    {statusText}
                                                                </span>
                                                            </span>
                                                            {/* 工具数量（仅已连接时显示） */}
                                                            {isConnected && toolCount > 0 && (
                                                                <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                                                                    <Wrench size={10} />
                                                                    <span>{toolCount}</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* 错误信息提示 */}
                                                {server.status === 'error' && server.errorMessage && (
                                                    <div className="mt-2 text-xs text-red-500 dark:text-red-400 truncate" title={server.errorMessage}>
                                                        {server.errorMessage}
                                                    </div>
                                                )}
                                                {/* v3.0.25: 未启用提示 */}
                                                {isDisabled && isSelected && (
                                                    <div className="mt-2 text-xs text-orange-500 dark:text-orange-400">
                                                        {t.agent.mcpDisabledHint || '此 MCP 未启用，请先在 MCP 页面启用'}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {/* v3.0.25: 提示未连接或未启用的 MCP 也可以选择 */}
                            {displayServers.some(s => s.status !== 'connected' || !s.enabled) && (
                                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                    <AlertTriangle size={12} />
                                    <span>未连接的 MCP 服务器也可以选择，但需要先启动才能使用工具</span>
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* 权限与安全配置 (v2.4.0) */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <div
                        className="flex items-center justify-between mb-4 cursor-pointer"
                        onClick={() => setShowPermissions(!showPermissions)}
                    >
                        <div className="flex items-center gap-2">
                            <Shield className="w-5 h-5 text-orange-600" />
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t.agent.permissionsAndSecurity}</h3>
                            <span className="text-xs text-gray-400">({t.common.optional})</span>
                        </div>
                        <button
                            type="button"
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                            {showPermissions ? t.agent.collapse : t.agent.expand}
                        </button>
                    </div>

                    {showPermissions && (
                        <div className="space-y-6">
                            {/* 文件系统权限 */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <FolderOpen className="w-4 h-4 text-blue-500" />
                                    <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300">{t.agent.fileSystemPermissions}</h4>
                                </div>

                                {/* 工作目录 */}
                                <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                        {t.agent.workingDirectory}
                                    </label>
                                    <div className="flex gap-2">
                                        <Input
                                            value={workingDirectory}
                                            onChange={setWorkingDirectory}
                                            placeholder={t.agent.workingDirectoryPlaceholder}
                                            className="text-sm font-mono flex-1"
                                        />
                                        {inTauri && (
                                            <Button
                                                variant="secondary"
                                                onClick={() => handleSelectDirectory('working')}
                                                className="px-3"
                                            >
                                                <FolderSearch size={16} />
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* 允许访问的路径 */}
                                <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                        {t.agent.allowedPaths}
                                    </label>
                                    <div className="flex gap-2 mb-2">
                                        <Input
                                            value={newPath}
                                            onChange={setNewPath}
                                            placeholder={t.agent.workingDirectoryPlaceholder}
                                            className="text-sm font-mono flex-1"
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddPath('allowed')}
                                        />
                                        <Button
                                            variant="secondary"
                                            onClick={() => handleAddPath('allowed')}
                                            className="px-3"
                                        >
                                            <Plus size={16} />
                                        </Button>
                                        {inTauri && (
                                            <Button
                                                variant="secondary"
                                                onClick={() => handleSelectDirectory('allowed')}
                                                className="px-3"
                                            >
                                                <FolderSearch size={16} />
                                            </Button>
                                        )}
                                    </div>
                                    {allowedPaths.length > 0 && renderTagList(
                                        allowedPaths,
                                        (i) => setAllowedPaths(prev => prev.filter((_, idx) => idx !== i)),
                                        'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                                    )}
                                </div>

                                {/* 禁止访问的路径 */}
                                <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                        {t.agent.deniedPaths}
                                    </label>
                                    <div className="flex gap-2 mb-2">
                                        <Input
                                            value={newPath}
                                            onChange={setNewPath}
                                            placeholder={t.agent.workingDirectoryPlaceholder}
                                            className="text-sm font-mono flex-1"
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddPath('denied')}
                                        />
                                        <Button
                                            variant="secondary"
                                            onClick={() => handleAddPath('denied')}
                                            className="px-3"
                                        >
                                            <Plus size={16} />
                                        </Button>
                                        {inTauri && (
                                            <Button
                                                variant="secondary"
                                                onClick={() => handleSelectDirectory('denied')}
                                                className="px-3"
                                            >
                                                <FolderSearch size={16} />
                                            </Button>
                                        )}
                                    </div>
                                    {deniedPaths.length > 0 && renderTagList(
                                        deniedPaths,
                                        (i) => setDeniedPaths(prev => prev.filter((_, idx) => idx !== i)),
                                        'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                                    )}
                                </div>
                            </div>

                            {/* 工具权限规则 */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Wrench className="w-4 h-4 text-purple-500" />
                                    <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300">{t.agent.toolPermissionRules}</h4>
                                </div>
                                <p className="text-xs text-gray-400">
                                    {t.agent.toolPermissionHint}
                                </p>

                                {/* 允许规则 */}
                                <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                        {t.agent.allowedOperations}
                                    </label>
                                    <div className="flex gap-2 mb-2">
                                        <Input
                                            value={newRule}
                                            onChange={setNewRule}
                                            placeholder={t.agent.allowedToolsPlaceholder}
                                            className="text-sm font-mono flex-1"
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddRule('allow')}
                                        />
                                        <Button
                                            variant="secondary"
                                            onClick={() => handleAddRule('allow')}
                                            className="px-3"
                                        >
                                            <Plus size={16} />
                                        </Button>
                                    </div>
                                    {/* 预设规则快捷按钮 */}
                                    <div className="flex flex-wrap gap-1 mb-2">
                                        {PRESET_ALLOW_RULES.map((rule) => (
                                            <button
                                                key={rule.value}
                                                type="button"
                                                onClick={() => !allowRules.includes(rule.value) && setAllowRules(prev => [...prev, rule.value])}
                                                className={`text-xs px-2 py-1 rounded border transition-colors ${
                                                    allowRules.includes(rule.value)
                                                        ? 'bg-green-100 border-green-300 text-green-700 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300'
                                                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'
                                                }`}
                                            >
                                                {rule.label}
                                            </button>
                                        ))}
                                    </div>
                                    {allowRules.length > 0 && renderTagList(
                                        allowRules,
                                        (i) => setAllowRules(prev => prev.filter((_, idx) => idx !== i)),
                                        'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                                    )}
                                </div>

                                {/* 禁止规则 */}
                                <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                        {t.agent.deniedOperations}
                                    </label>
                                    <div className="flex gap-2 mb-2">
                                        <Input
                                            value={newRule}
                                            onChange={setNewRule}
                                            placeholder={t.agent.deniedToolsPlaceholder}
                                            className="text-sm font-mono flex-1"
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddRule('deny')}
                                        />
                                        <Button
                                            variant="secondary"
                                            onClick={() => handleAddRule('deny')}
                                            className="px-3"
                                        >
                                            <Plus size={16} />
                                        </Button>
                                    </div>
                                    {/* 预设禁止规则快捷按钮 */}
                                    <div className="flex flex-wrap gap-1 mb-2">
                                        {PRESET_DENY_RULES.map((rule) => (
                                            <button
                                                key={rule.value}
                                                type="button"
                                                onClick={() => !denyRules.includes(rule.value) && setDenyRules(prev => [...prev, rule.value])}
                                                className={`text-xs px-2 py-1 rounded border transition-colors ${
                                                    denyRules.includes(rule.value)
                                                        ? 'bg-red-100 border-red-300 text-red-700 dark:bg-red-900/50 dark:border-red-700 dark:text-red-300'
                                                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'
                                                }`}
                                            >
                                                {rule.label}
                                            </button>
                                        ))}
                                    </div>
                                    {denyRules.length > 0 && renderTagList(
                                        denyRules,
                                        (i) => setDenyRules(prev => prev.filter((_, idx) => idx !== i)),
                                        'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                                    )}
                                </div>
                            </div>

                            {/* 自动批准 */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                                    <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300">{t.agent.autoApprove}</h4>
                                </div>
                                <p className="text-xs text-gray-400">
                                    {t.agent.autoApproveHint}
                                </p>

                                <div className="grid grid-cols-2 gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={autoApproveReadFiles}
                                            onChange={(e) => setAutoApproveReadFiles(e.target.checked)}
                                            className="w-4 h-4 accent-yellow-500"
                                        />
                                        <span className="text-sm text-gray-700 dark:text-gray-300">{t.agent.autoApproveRead}</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={autoApproveWriteFiles}
                                            onChange={(e) => setAutoApproveWriteFiles(e.target.checked)}
                                            className="w-4 h-4 accent-yellow-500"
                                        />
                                        <span className="text-sm text-gray-700 dark:text-gray-300">{t.agent.autoApproveWrite}</span>
                                    </label>
                                </div>

                                {/* 自动批准的命令 */}
                                <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                        {t.agent.autoApproveCommands}
                                    </label>
                                    <div className="flex gap-2 mb-2">
                                        <Input
                                            value={newBashCommand}
                                            onChange={setNewBashCommand}
                                            placeholder={t.agent.autoApproveCommandsPlaceholder}
                                            className="text-sm font-mono flex-1"
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddBashCommand()}
                                        />
                                        <Button
                                            variant="secondary"
                                            onClick={handleAddBashCommand}
                                            className="px-3"
                                        >
                                            <Plus size={16} />
                                        </Button>
                                    </div>
                                    {autoApproveBashCommands.length > 0 && renderTagList(
                                        autoApproveBashCommands,
                                        (i) => setAutoApproveBashCommands(prev => prev.filter((_, idx) => idx !== i)),
                                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                                    )}
                                </div>
                            </div>

                            {/* 上下文配置 */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-cyan-500" />
                                    <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300">{t.agent.contextConfig}</h4>
                                </div>
                                <p className="text-xs text-gray-400">
                                    {t.agent.contextConfigHint}
                                </p>

                                {/* 上下文文件 */}
                                <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                        {t.agent.autoLoadFiles}
                                    </label>
                                    <div className="flex gap-2 mb-2">
                                        <Input
                                            value={newContextFile}
                                            onChange={setNewContextFile}
                                            placeholder={t.agent.autoLoadFilesPlaceholder}
                                            className="text-sm font-mono flex-1"
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddContextFile()}
                                        />
                                        <Button
                                            variant="secondary"
                                            onClick={handleAddContextFile}
                                            className="px-3"
                                        >
                                            <Plus size={16} />
                                        </Button>
                                    </div>
                                    {contextFiles.length > 0 && renderTagList(
                                        contextFiles,
                                        (i) => setContextFiles(prev => prev.filter((_, idx) => idx !== i)),
                                        'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-300'
                                    )}
                                </div>

                                {/* 上下文 URL */}
                                <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                        {t.agent.autoFetchUrls}
                                    </label>
                                    <div className="flex gap-2 mb-2">
                                        <Input
                                            value={newContextUrl}
                                            onChange={setNewContextUrl}
                                            placeholder="https://docs.example.com/api"
                                            className="text-sm flex-1"
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddContextUrl()}
                                        />
                                        <Button
                                            variant="secondary"
                                            onClick={handleAddContextUrl}
                                            className="px-3"
                                        >
                                            <Plus size={16} />
                                        </Button>
                                    </div>
                                    {contextUrls.length > 0 && renderTagList(
                                        contextUrls,
                                        (i) => setContextUrls(prev => prev.filter((_, idx) => idx !== i)),
                                        'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-300'
                                    )}
                                </div>

                                {/* 额外指令 */}
                                <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                        {t.agent.additionalInstructions}
                                    </label>
                                    <Textarea
                                        value={additionalInstructions}
                                        onChange={setAdditionalInstructions}
                                        placeholder={t.agent.additionalInstructionsPlaceholder}
                                        rows={2}
                                        className="text-sm"
                                    />
                                </div>
                            </div>

                            {/* 执行限制 */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-gray-500" />
                                    <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300">{t.agent.executionLimits}</h4>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                            {t.agent.maxToolCalls}
                                        </label>
                                        <Input
                                            type="number"
                                            value={maxToolCalls}
                                            onChange={setMaxToolCalls}
                                            className="text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                            {t.agent.toolCallTimeout}
                                        </label>
                                        <Input
                                            type="number"
                                            value={toolCallTimeout}
                                            onChange={setToolCallTimeout}
                                            className="text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                            {t.agent.maxFileSize}
                                        </label>
                                        <Input
                                            type="number"
                                            value={maxFileSize}
                                            onChange={setMaxFileSize}
                                            className="text-sm"
                                        />
                                    </div>
                                    <div className="flex items-end">
                                        <label className="flex items-center gap-2 cursor-pointer pb-2">
                                            <input
                                                type="checkbox"
                                                checked={sandboxMode}
                                                onChange={(e) => setSandboxMode(e.target.checked)}
                                                className="w-4 h-4 accent-orange-500"
                                            />
                                            <span className="text-sm text-gray-700 dark:text-gray-300">{t.agent.sandboxMode}</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex gap-3 pt-4">
                    <Button variant="secondary" onClick={onClose} className="flex-1">
                        {t.common.cancel}
                    </Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit} className="flex-1">
                        {agent ? t.common.save : t.agent.createAgent}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default AgentModal;
