/**
 * AgentPage Agent管理页面 (v3.5.0)
 *
 * 管理智能代理的创建、编辑、删除和运行
 * - v2.2.0: 新增删除和状态切换功能
 * - v2.3.0: AgentCard 显示关联的模型、技能、MCP服务器名称
 * - v3.5.0: 使用 PageHeader 组件优化头部布局，节省垂直空间
 * - v1.0.0-templates: 新增模板安装入口
 *
 * 对应文档: docs/modules/agent.md
 */

import React, { useState } from 'react';
import { Workflow, Plus, Package } from 'lucide-react';
import { Button, Modal, PageHeader } from '../../common';
import { AgentCard } from './AgentCard';
import { AgentModal } from './AgentModal';
import { TemplateInstallModal } from '../Templates';
import { useI18n } from '../../../i18n';
import type { Agent, AgentCreateInput, Skill, AIModel, MCPServer, MCPServerCreateInput, SkillCreateInput } from '../../../types';

/**
 * AgentPage 组件 Props (v2.2.0)
 * 新增 onDeleteAgent 和 onToggleStatus 回调
 * v1.0.0-templates: 新增模板安装相关回调
 */
interface AgentPageProps {
    agents: Agent[];
    models: AIModel[];
    skills: Skill[];
    mcpServers: MCPServer[];  // MCP 服务器列表 (v2.1.0)
    onCreateAgent: (data: AgentCreateInput) => void;
    onUpdateAgent: (id: string, data: AgentCreateInput) => void;
    onDeleteAgent: (id: string) => void;           // v2.2.0: 删除 Agent
    onToggleStatus: (id: string) => void;          // v2.2.0: 切换状态
    onRunAgent: (id: string) => void;
    // v1.0.0-templates: 模板安装相关回调
    onCreateMCPServer?: (data: MCPServerCreateInput) => void;
    onCreateSkill?: (data: SkillCreateInput) => void;
}

export const AgentPage: React.FC<AgentPageProps> = ({
    agents,
    models,
    skills,
    mcpServers,
    onCreateAgent,
    onUpdateAgent,
    onDeleteAgent,
    onToggleStatus,
    onRunAgent,
    onCreateMCPServer,
    onCreateSkill,
}) => {
    const { t } = useI18n();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [showModal, setShowModal] = useState(false);
    const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
    // v2.2.0: 删除确认对话框状态
    const [deleteConfirmAgent, setDeleteConfirmAgent] = useState<Agent | null>(null);
    // v1.0.0-templates: 模板安装弹窗状态
    const [showTemplateModal, setShowTemplateModal] = useState(false);

    const filteredAgents = agents.filter((agent) => {
        const matchesSearch =
            agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            agent.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus =
            statusFilter === 'all' || agent.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const handleEdit = (agent: Agent) => {
        setSelectedAgent(agent);
        setShowModal(true);
    };

    const handleCreate = () => {
        setSelectedAgent(null);
        setShowModal(true);
    };

    const handleSave = (data: AgentCreateInput) => {
        if (selectedAgent) {
            onUpdateAgent(selectedAgent.id, data);
        } else {
            onCreateAgent(data);
        }
    };

    /**
     * 确认删除 Agent (v2.2.0)
     */
    const handleConfirmDelete = () => {
        if (deleteConfirmAgent) {
            onDeleteAgent(deleteConfirmAgent.id);
            setDeleteConfirmAgent(null);
        }
    };

    return (
        <div className="flex-1 overflow-hidden">
            <div className="h-full flex flex-col">
                {/* v3.5.0: 使用 PageHeader 组件优化头部布局 */}
                <PageHeader
                    icon={<Workflow className="text-purple-600" />}
                    title={t.agent.title}
                    subtitle={t.agent.subtitle}
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder={t.agent.searchAgents}
                    filters={
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-[10px] text-sm text-gray-800 dark:text-gray-100"
                        >
                            <option value="all">{t.agent.all}</option>
                            <option value="active">{t.agent.active}</option>
                            <option value="inactive">{t.agent.inactive}</option>
                        </select>
                    }
                    actions={
                        <div className="flex gap-2">
                            {/* v1.0.0-templates: 安装模板按钮 */}
                            {onCreateMCPServer && onCreateSkill && (
                                <Button
                                    onClick={() => setShowTemplateModal(true)}
                                    icon={<Package className="w-4 h-4" />}
                                    className="bg-gradient-to-bl from-[#A688F6] to-[#009BF3]"
                                >
                                    安装模板
                                </Button>
                            )}
                            <Button onClick={handleCreate} icon={<Plus className="w-4 h-4" />}>
                                {t.agent.createAgent}
                            </Button>
                        </div>
                    }
                />

                {/* Agent 列表 */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                        {/* v2.3.0: 传递 models、skills、mcpServers 给 AgentCard 用于显示名字 */}
                        {filteredAgents.map((agent) => (
                            <AgentCard
                                key={agent.id}
                                agent={agent}
                                models={models}
                                skills={skills}
                                mcpServers={mcpServers}
                                onEdit={() => handleEdit(agent)}
                                onDelete={() => setDeleteConfirmAgent(agent)}
                                onToggleStatus={() => onToggleStatus(agent.id)}
                                onRun={() => onRunAgent(agent.id)}
                            />
                        ))}

                        {/* 添加新 Agent 卡片 */}
                        <div
                            onClick={handleCreate}
                            className="bg-white dark:bg-gray-800 rounded-[10px] border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all p-5 flex items-center justify-center cursor-pointer min-h-[200px]"
                        >
                            <div className="text-center">
                                <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/50 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Plus className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                                </div>
                                <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">{t.agent.createAgent}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{t.agent.subtitle}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>


            <AgentModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                agent={selectedAgent}
                models={models}
                skills={skills}
                mcpServers={mcpServers}
                onSave={handleSave}
            />

            {/* v2.2.0: 删除确认对话框 */}
            <Modal
                isOpen={!!deleteConfirmAgent}
                onClose={() => setDeleteConfirmAgent(null)}
                title={t.agent.deleteAgent}
            >
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                    {t.agent.deleteAgentConfirm.replace('{name}', deleteConfirmAgent?.name || '')}
                </p>
                <div className="flex justify-end gap-3">
                    <Button variant="secondary" onClick={() => setDeleteConfirmAgent(null)}>
                        {t.common.cancel}
                    </Button>
                    <Button variant="danger" onClick={handleConfirmDelete}>
                        {t.common.delete}
                    </Button>
                </div>
            </Modal>

            {/* v1.0.0-templates: 模板安装弹窗 */}
            {onCreateMCPServer && onCreateSkill && (
                <TemplateInstallModal
                    isOpen={showTemplateModal}
                    onClose={() => setShowTemplateModal(false)}
                    existingMCPServers={mcpServers}
                    existingSkills={skills}
                    existingAgents={agents}
                    onCreateMCPServer={onCreateMCPServer}
                    onCreateSkill={onCreateSkill}
                    onCreateAgent={onCreateAgent}
                />
            )}
        </div>
    );
};

export default AgentPage;
