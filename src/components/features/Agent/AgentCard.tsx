/**
 * AgentCard 组件 (v2.4.0)
 *
 * Agent 卡片展示组件，显示 Agent 的基本信息和关联组件状态
 *
 * v2.2.0: 新增 onDelete 和 onToggleStatus 回调
 * v2.3.0: 新增 models、skills、mcpServers 用于显示名字而非 ID
 * v2.4.0: 优化组件状态展示
 *   - 显示 MCP 服务器运行状态（connected/disconnected/error）
 *   - 显示 Skill 是否存在（可能被删除）
 *   - 用不同颜色/图标区分状态
 *   - 处理关联组件被删除的情况
 *
 * 对应文档: docs/modules/agent.md
 */

import React from 'react';
import {
    Brain,
    Edit3,
    Play,
    Trash2,
    ToggleLeft,
    ToggleRight,
    Cpu,
    Zap,
    Server,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Loader2,
    AlertTriangle,
} from 'lucide-react';
import { useI18n, getLocalizedText } from '../../../i18n';
import type { Agent, AIModel, Skill, MCPServer, MCPServerStatus } from '../../../types';

/**
 * AgentCard 组件 Props (v2.4.0)
 */
interface AgentCardProps {
    agent: Agent;
    models: AIModel[];              // 用于显示模型名字
    skills: Skill[];                // 用于显示技能名字
    mcpServers: MCPServer[];        // 用于显示 MCP 服务器名字和状态
    onEdit: () => void;
    onDelete: () => void;
    onToggleStatus: () => void;
    onRun: () => void;
}

/**
 * v2.4.0: 技能状态信息
 */
interface SkillStatusInfo {
    id: string;
    name: string;
    exists: boolean;  // 技能是否存在（未被删除）
}

/**
 * v2.4.0: MCP 服务器状态信息
 */
interface MCPStatusInfo {
    id: string;
    name: string;
    exists: boolean;           // 服务器是否存在（未被删除）
    status: MCPServerStatus;   // 连接状态
    errorMessage?: string;     // 错误信息
    toolCount: number;         // 工具数量
}

/**
 * v2.4.0: 状态图标组件
 * 根据 MCP 服务器状态显示对应图标
 */
const StatusIcon: React.FC<{ status: MCPServerStatus; exists: boolean }> = ({ status, exists }) => {
    if (!exists) {
        // 已删除
        return <AlertTriangle className="w-3 h-3 text-red-500" />;
    }

    switch (status) {
        case 'connected':
            return <CheckCircle2 className="w-3 h-3 text-green-500" />;
        case 'connecting':
            return <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />;
        case 'error':
            return <XCircle className="w-3 h-3 text-red-500" />;
        case 'disconnected':
        default:
            return <AlertCircle className="w-3 h-3 text-yellow-500" />;
    }
};

/**
 * v2.4.0: 获取状态对应的样式类
 */
const getStatusStyles = (status: MCPServerStatus, exists: boolean): string => {
    if (!exists) {
        // 已删除 - 红色警告
        return 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800';
    }

    switch (status) {
        case 'connected':
            // 已连接 - 绿色
            return 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400';
        case 'connecting':
            // 连接中 - 蓝色
            return 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';
        case 'error':
            // 错误 - 红色
            return 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400';
        case 'disconnected':
        default:
            // 未连接 - 黄色
            return 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400';
    }
};

/**
 * v2.4.0: 获取状态提示文本
 */
const getStatusTooltip = (info: MCPStatusInfo): string => {
    if (!info.exists) {
        return `${info.name}: 已被删除，请重新配置`;
    }

    switch (info.status) {
        case 'connected':
            return `${info.name}: 已连接 (${info.toolCount} 个工具)`;
        case 'connecting':
            return `${info.name}: 连接中...`;
        case 'error':
            return `${info.name}: 连接失败 - ${info.errorMessage || '未知错误'}`;
        case 'disconnected':
        default:
            return `${info.name}: 未启动`;
    }
};

export const AgentCard: React.FC<AgentCardProps> = ({
    agent,
    models,
    skills,
    mcpServers,
    onEdit,
    onDelete,
    onToggleStatus,
    onRun
}) => {
    const { language } = useI18n();

    /**
     * v2.3.0: 根据模型 ID 查找模型名字
     * v2.4.0: 如果模型不存在或离线，标记为异常
     */
    const modelInfo = React.useMemo(() => {
        const model = models.find(m => m.id === agent.model);
        if (!model) {
            return {
                name: agent.model || '未设置模型',
                exists: false,
                isOnline: false,
            };
        }
        return {
            name: model.name,
            exists: true,
            isOnline: model.status === 'online',
        };
    }, [models, agent.model]);

    /**
     * v2.4.0: 获取技能状态信息列表
     * 检查每个技能是否存在，如果被删除则标记
     */
    const skillStatusList = React.useMemo((): SkillStatusInfo[] => {
        return agent.skills.map(skillId => {
            const skill = skills.find(s => s.id === skillId);
            return {
                id: skillId,
                name: skill ? getLocalizedText(skill.name, language) : skillId,
                exists: !!skill,
            };
        });
    }, [skills, agent.skills, language]);

    /**
     * v2.4.0: 获取 MCP 服务器状态信息列表
     * 包含连接状态、是否存在、工具数量等
     */
    const mcpStatusList = React.useMemo((): MCPStatusInfo[] => {
        if (!agent.enableToolUse || !agent.mcpServers || agent.mcpServers.length === 0) {
            return [];
        }

        return agent.mcpServers.map(config => {
            const server = mcpServers.find(s => s.id === config.serverId);
            return {
                id: config.serverId,
                name: config.serverName || server?.name || config.serverId,
                exists: !!server,
                status: server?.status || 'disconnected',
                errorMessage: server?.errorMessage,
                toolCount: server?.tools?.length || 0,
            };
        });
    }, [mcpServers, agent.mcpServers, agent.enableToolUse]);

    /**
     * v2.4.0: 计算组件健康状态摘要
     * 包含模型、技能、MCP 的状态检查
     */
    const healthSummary = React.useMemo(() => {
        const deletedSkills = skillStatusList.filter(s => !s.exists).length;
        const deletedMcp = mcpStatusList.filter(m => !m.exists).length;
        const errorMcp = mcpStatusList.filter(m => m.exists && m.status === 'error').length;
        const disconnectedMcp = mcpStatusList.filter(m => m.exists && m.status === 'disconnected').length;
        const connectedMcp = mcpStatusList.filter(m => m.exists && m.status === 'connected').length;

        // v2.4.0: 检查模型状态
        const modelMissing = !modelInfo.exists;
        const modelOffline = modelInfo.exists && !modelInfo.isOnline;

        const hasIssues = deletedSkills > 0 || deletedMcp > 0 || errorMcp > 0 || modelMissing;
        const hasWarnings = disconnectedMcp > 0 || modelOffline;

        return {
            deletedSkills,
            deletedMcp,
            errorMcp,
            disconnectedMcp,
            connectedMcp,
            modelMissing,
            modelOffline,
            hasIssues,
            hasWarnings,
            totalMcp: mcpStatusList.length,
        };
    }, [skillStatusList, mcpStatusList, modelInfo]);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-[10px] border-2 border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-lg transition-all p-5">
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-bl from-[#A688F6] to-[#009BF3] rounded-[10px] flex items-center justify-center">
                        <Brain className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 dark:text-gray-100">{agent.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                            {/* Agent 状态 */}
                            <span
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${agent.status === 'active'
                                    ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                }`}
                            >
                                {agent.status === 'active' ? '活跃' : '未激活'}
                            </span>

                            {/* v2.4.0: 组件健康状态指示器 */}
                            {healthSummary.hasIssues && (
                                <span
                                    className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400 flex items-center gap-1"
                                    title={`${healthSummary.deletedSkills} 个技能已删除, ${healthSummary.deletedMcp} 个 MCP 已删除, ${healthSummary.errorMcp} 个 MCP 连接失败`}
                                >
                                    <XCircle className="w-3 h-3" />
                                    异常
                                </span>
                            )}
                            {!healthSummary.hasIssues && healthSummary.hasWarnings && (
                                <span
                                    className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400 flex items-center gap-1"
                                    title={`${healthSummary.disconnectedMcp} 个 MCP 未启动`}
                                >
                                    <AlertCircle className="w-3 h-3" />
                                    {healthSummary.disconnectedMcp} 未启动
                                </span>
                            )}
                            {!healthSummary.hasIssues && !healthSummary.hasWarnings && healthSummary.totalMcp > 0 && (
                                <span
                                    className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 flex items-center gap-1"
                                    title={`${healthSummary.connectedMcp} 个 MCP 已连接`}
                                >
                                    <CheckCircle2 className="w-3 h-3" />
                                    就绪
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                {/* 状态切换按钮 */}
                <button
                    onClick={onToggleStatus}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-[10px] transition-colors"
                    title={agent.status === 'active' ? '停用 Agent' : '激活 Agent'}
                >
                    {agent.status === 'active' ? (
                        <ToggleRight className="w-5 h-5 text-green-500" />
                    ) : (
                        <ToggleLeft className="w-5 h-5 text-gray-400" />
                    )}
                </button>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{agent.description}</p>

            {/* 组件信息区域 */}
            <div className="space-y-3 mb-4">
                {/* v2.4.0: 模型（带状态） */}
                <div className="flex items-center gap-2 text-sm">
                    <Cpu className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600 dark:text-gray-400">模型:</span>
                    {modelInfo.exists ? (
                        <span className={`font-medium ${
                            modelInfo.isOnline
                                ? 'text-gray-800 dark:text-gray-200'
                                : 'text-yellow-600 dark:text-yellow-400'
                        }`}>
                            {modelInfo.name}
                            {!modelInfo.isOnline && (
                                <span className="ml-1 text-xs">(离线)</span>
                            )}
                        </span>
                    ) : (
                        <span className="font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {modelInfo.name}
                            <span className="text-xs">(不存在)</span>
                        </span>
                    )}
                </div>

                {/* v2.4.0: 技能列表（带状态） */}
                <div>
                    <div className="flex items-center gap-2 text-sm mb-2">
                        <Zap className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600 dark:text-gray-400">技能:</span>
                        {healthSummary.deletedSkills > 0 && (
                            <span className="text-xs text-red-500">
                                ({healthSummary.deletedSkills} 个已删除)
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {skillStatusList.length > 0 ? (
                            skillStatusList.map((skillInfo) => (
                                <span
                                    key={skillInfo.id}
                                    className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                                        skillInfo.exists
                                            ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                                            : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800'
                                    }`}
                                    title={skillInfo.exists ? skillInfo.name : `${skillInfo.name}: 已被删除`}
                                >
                                    {!skillInfo.exists && <AlertTriangle className="w-3 h-3" />}
                                    {skillInfo.name}
                                </span>
                            ))
                        ) : (
                            <span className="text-xs text-gray-400">无绑定技能</span>
                        )}
                    </div>
                </div>

                {/* v2.4.0: MCP 服务器列表（带状态） */}
                <div>
                    <div className="flex items-center gap-2 text-sm mb-2">
                        <Server className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600 dark:text-gray-400">MCP:</span>
                        {mcpStatusList.length > 0 && (
                            <span className="text-xs text-gray-500">
                                ({healthSummary.connectedMcp}/{healthSummary.totalMcp} 已连接)
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {mcpStatusList.length > 0 ? (
                            mcpStatusList.map((mcpInfo) => (
                                <span
                                    key={mcpInfo.id}
                                    className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${getStatusStyles(mcpInfo.status, mcpInfo.exists)}`}
                                    title={getStatusTooltip(mcpInfo)}
                                >
                                    <StatusIcon status={mcpInfo.status} exists={mcpInfo.exists} />
                                    {mcpInfo.name}
                                    {mcpInfo.exists && mcpInfo.status === 'connected' && mcpInfo.toolCount > 0 && (
                                        <span className="text-[10px] opacity-70">({mcpInfo.toolCount})</span>
                                    )}
                                </span>
                            ))
                        ) : (
                            <span className="text-xs text-gray-400">无绑定 MCP</span>
                        )}
                    </div>
                </div>
            </div>

            {/* 底部操作栏 */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                    <span>使用 {agent.usageCount} 次</span>
                    {agent.lastUsedAt && (
                        <>
                            <span className="mx-1">•</span>
                            <span>
                                {new Date(agent.lastUsedAt).toLocaleDateString('zh-CN')}
                            </span>
                        </>
                    )}
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={onEdit}
                        className="p-2 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-[10px] transition-colors"
                        title="编辑"
                    >
                        <Edit3 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    </button>
                    <button
                        onClick={onDelete}
                        className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-[10px] transition-colors"
                        title="删除"
                    >
                        <Trash2 className="w-4 h-4 text-red-500 dark:text-red-400" />
                    </button>
                    <button
                        onClick={onRun}
                        className="p-2 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-[10px] transition-colors"
                        title="运行"
                    >
                        <Play className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AgentCard;
