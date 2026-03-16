/**
 * SkillsPage 技能管理页面 (v3.5.0)
 *
 * 展示和管理所有技能（内置 + 自定义）
 * - 技能列表展示（支持搜索、分类筛选、状态筛选）
 * - 技能启用/禁用
 * - 自定义技能的创建/编辑/删除
 * - 内置技能只读查看
 * - v2.1.0: 删除自定义技能功能，包含二次确认对话框
 * - v3.0.0: 技能安装/导出功能
 * - v3.0.19: 统一"安装技能"和"新建技能"按钮样式
 * - v3.0.21: 官方仓库安装使用 Git Trees API（解决 API 限流）
 * - v3.5.0: 使用 PageHeader 组件优化头部布局，节省垂直空间
 *
 * 对应文档: docs/modules/skills.md
 */

import React, { useState } from 'react';
import { Puzzle, Plus, Download, Upload } from 'lucide-react';
import { Button, Modal, PageHeader } from '../../common';
import { SkillCard } from './SkillCard';
import { SkillModal } from './SkillModal';
import { SkillInstallModal } from './SkillInstallModal';
import { SkillExportModal } from './SkillExportModal';
import { useI18n, getLocalizedText } from '../../../i18n';
import type { Skill, SkillCreateInput } from '../../../types';

interface SkillsPageProps {
    skills: Skill[];
    onToggleSkill: (id: string, enabled: boolean) => void;
    onUpdateSkill: (id: string, data: SkillCreateInput) => void;
    onAddSkill: (data: SkillCreateInput) => void;
    onDeleteSkill?: (id: string) => void;
    /** v3.0.0: 批量安装技能 */
    onInstallSkills?: (skills: SkillCreateInput[]) => void;
}

export const SkillsPage: React.FC<SkillsPageProps> = ({
    skills,
    onToggleSkill,
    onUpdateSkill,
    onAddSkill,
    onDeleteSkill,
    onInstallSkills,
}) => {
    const { t, language } = useI18n();
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [showModal, setShowModal] = useState(false);
    const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
    // v2.1.0: 预览模式状态
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    // v2.1.0: 删除确认对话框状态
    const [deleteConfirmSkill, setDeleteConfirmSkill] = useState<Skill | null>(null);
    // v3.0.0: 安装/导出弹窗状态
    const [showInstallModal, setShowInstallModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);

    const categories = [...new Set(skills.map((s) => s.category))];

    const filteredSkills = skills.filter((skill) => {
        const skillName = getLocalizedText(skill.name, language);
        const skillDesc = getLocalizedText(skill.description, language);
        const matchesSearch =
            skillName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            skillDesc.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory =
            categoryFilter === 'all' || skill.category === categoryFilter;
        const matchesStatus =
            statusFilter === 'all' ||
            (statusFilter === 'enabled' && skill.enabled) ||
            (statusFilter === 'disabled' && !skill.enabled);
        return matchesSearch && matchesCategory && matchesStatus;
    });

    // 配置按钮：打开编辑模式
    const handleConfigure = (skill: Skill) => {
        setSelectedSkill(skill);
        setIsPreviewMode(false);
        setShowModal(true);
    };

    // v2.1.0: 预览按钮：打开预览模式（只读）
    const handlePreview = (skill: Skill) => {
        setSelectedSkill(skill);
        setIsPreviewMode(true);
        setShowModal(true);
    };

    const handleAdd = () => {
        setSelectedSkill(null);
        setIsPreviewMode(false);
        setShowModal(true);
    };

    const handleSave = (data: SkillCreateInput) => {
        if (selectedSkill) {
            onUpdateSkill(selectedSkill.id, data);
        } else {
            onAddSkill(data);
        }
    };

    /**
     * 确认删除技能 (v2.1.0)
     * 执行实际的删除操作并关闭确认对话框
     */
    const handleConfirmDelete = () => {
        if (deleteConfirmSkill && onDeleteSkill) {
            onDeleteSkill(deleteConfirmSkill.id);
            setDeleteConfirmSkill(null);
        }
    };

    return (
        <div className="flex-1 overflow-hidden">
            <div className="h-full flex flex-col">
                {/* v3.5.0: 使用 PageHeader 组件优化头部布局 */}
                <PageHeader
                    icon={<Puzzle className="text-blue-600" />}
                    title={t.skills.title}
                    subtitle={t.skills.subtitle}
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder={t.skills.searchSkills}
                    filters={
                        <>
                            <select
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-[10px] text-sm text-gray-800 dark:text-gray-100"
                            >
                                <option value="all">{t.skills.allCategories}</option>
                                {categories.map((cat) => (
                                    <option key={cat} value={cat}>
                                        {cat}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-[10px] text-sm text-gray-800 dark:text-gray-100"
                            >
                                <option value="all">{t.agent.all}</option>
                                <option value="enabled">{t.skills.enabled}</option>
                                <option value="disabled">{t.skills.disabled}</option>
                            </select>
                        </>
                    }
                    actions={
                        <div className="flex items-center gap-2">
                            {/* v3.0.19: 安装按钮使用渐变色样式，与新建按钮一致 */}
                            <Button
                                onClick={() => setShowInstallModal(true)}
                                icon={<Download className="w-4 h-4" />}
                                className="bg-gradient-to-bl from-[#A688F6] to-[#009BF3]"
                            >
                                {t.skills.installSkills}
                            </Button>
                            {/* v3.0.0: 导出按钮 */}
                            <Button
                                onClick={() => setShowExportModal(true)}
                                icon={<Upload className="w-4 h-4" />}
                                className="bg-gradient-to-bl from-[#A688F6] to-[#009BF3]"
                            >
                                {t.common.export}
                            </Button>
                            <Button
                                onClick={handleAdd}
                                icon={<Plus className="w-4 h-4" />}
                                className="bg-gradient-to-bl from-[#A688F6] to-[#009BF3]"
                            >
                                {t.skills.addSkill}
                            </Button>
                        </div>
                    }
                />

                {/* 技能列表 */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {filteredSkills.map((skill) => (
                            <SkillCard
                                key={skill.id}
                                skill={skill}
                                onToggle={(enabled) => onToggleSkill(skill.id, enabled)}
                                onConfigure={() => handleConfigure(skill)}
                                onPreview={() => handlePreview(skill)}
                                onDelete={!skill.builtIn && onDeleteSkill ? () => setDeleteConfirmSkill(skill) : undefined}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <SkillModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                skill={selectedSkill}
                onSave={handleSave}
                previewMode={isPreviewMode}
            />

            {/* v2.1.0: 删除确认对话框 */}
            <Modal
                isOpen={!!deleteConfirmSkill}
                onClose={() => setDeleteConfirmSkill(null)}
                title={t.skills.deleteSkill}
            >
                <div className="space-y-4">
                    <p className="text-gray-600 dark:text-gray-300">
                        {t.skills.deleteSkillConfirm.replace('{name}', deleteConfirmSkill ? getLocalizedText(deleteConfirmSkill.name, language) : '')}
                    </p>
                    <div className="flex justify-end gap-3">
                        <Button
                            variant="secondary"
                            onClick={() => setDeleteConfirmSkill(null)}
                        >
                            {t.common.cancel}
                        </Button>
                        <Button
                            variant="danger"
                            onClick={handleConfirmDelete}
                        >
                            {t.common.delete}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* v3.0.0: 安装技能弹窗 */}
            <SkillInstallModal
                isOpen={showInstallModal}
                onClose={() => setShowInstallModal(false)}
                existingSkills={skills}
                onInstall={onInstallSkills || ((newSkills) => newSkills.forEach(onAddSkill))}
                onUpdate={onUpdateSkill}
            />

            {/* v3.0.0: 导出技能弹窗 */}
            <SkillExportModal
                isOpen={showExportModal}
                onClose={() => setShowExportModal(false)}
                skills={skills}
            />
        </div>
    );
};

export default SkillsPage;
