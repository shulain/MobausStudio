/**
 * SkillExportModal 组件 (v3.0.0, v3.0.18 增强)
 *
 * 技能导出弹窗，支持选择性导出自定义技能
 * - 选择要导出的技能
 * - 设置导出元信息（作者、来源）
 * - 下载 JSON 文件
 *
 * v3.0.18: 支持导出附带文件，显示文件数量统计
 *
 * 对应文档: docs/modules/skills.md
 */

import React, { useState, useMemo } from 'react';
import {
    Download,
    FileJson,
    CheckCircle,
    AlertCircle,
    FolderOpen,
} from 'lucide-react';
import { Modal, Button, Input } from '../../common';
import { useI18n, getLocalizedText } from '../../../i18n';
import { exportSkillsToJson } from '../../../utils/skillUtils';
import type { Skill } from '../../../types';
import { logger, LogTags } from '../../../utils/logger';

interface SkillExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    skills: Skill[];
}

export const SkillExportModal: React.FC<SkillExportModalProps> = ({
    isOpen,
    onClose,
    skills,
}) => {
    const { t, language } = useI18n();

    // ==================== 状态 ====================

    // 只显示自定义技能（内置技能不可导出）
    const customSkills = useMemo(() => skills.filter((s) => !s.builtIn), [skills]);

    const [selectedSkills, setSelectedSkills] = useState<Set<string>>(
        () => new Set(customSkills.map((s) => s.id))
    );
    const [author, setAuthor] = useState('');
    const [source, setSource] = useState('');
    const [exportSuccess, setExportSuccess] = useState(false);

    // v3.0.18: 计算选中技能的附带文件总数
    const totalFiles = useMemo(() => {
        return customSkills
            .filter((s) => selectedSkills.has(s.id))
            .reduce((sum, skill) => sum + (skill.files?.length || 0), 0);
    }, [customSkills, selectedSkills]);

    // ==================== 技能选择 ====================

    const toggleSkillSelection = (id: string) => {
        const newSelected = new Set(selectedSkills);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedSkills(newSelected);
    };

    const toggleSelectAll = () => {
        if (selectedSkills.size === customSkills.length) {
            setSelectedSkills(new Set());
        } else {
            setSelectedSkills(new Set(customSkills.map((s) => s.id)));
        }
    };

    // ==================== 导出 ====================

    const handleExport = () => {
        const skillsToExport = customSkills.filter((s) => selectedSkills.has(s.id));

        if (skillsToExport.length === 0) {
            return;
        }

        const json = exportSkillsToJson(skillsToExport, {
            author: author.trim() || undefined,
            source: source.trim() || undefined,
        });

        // 创建下载链接
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `mobaus-skills-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        logger.info(LogTags.SKILL, `导出 ${skillsToExport.length} 个技能`);
        setExportSuccess(true);
    };

    // ==================== 重置 ====================

    const handleClose = () => {
        setSelectedSkills(new Set(customSkills.map((s) => s.id)));
        setAuthor('');
        setSource('');
        setExportSuccess(false);
        onClose();
    };

    // ==================== 渲染 ====================

    /**
     * 渲染导出成功页面
     */
    const renderSuccess = () => (
        <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">
                {t.skills.exportSuccess}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                {t.skills.exportedSkills.replace('{count}', String(selectedSkills.size))}
            </p>
            <div className="flex gap-3 justify-center">
                <Button variant="secondary" onClick={handleClose}>
                    {t.common.close}
                </Button>
                <Button
                    onClick={() => setExportSuccess(false)}
                    icon={<Download className="w-4 h-4" />}
                >
                    {t.skills.continueExport}
                </Button>
            </div>
        </div>
    );

    /**
     * 渲染无可导出技能提示
     */
    const renderEmpty = () => (
        <div className="text-center py-8">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">
                {t.skills.noExportableSkills}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                {t.skills.noExportableSkillsDesc}
            </p>
            <Button variant="secondary" onClick={handleClose}>
                {t.common.close}
            </Button>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={t.skills.exportSkills}
            size="lg"
        >
            {exportSuccess ? (
                renderSuccess()
            ) : customSkills.length === 0 ? (
                renderEmpty()
            ) : (
                <div className="space-y-4">
                    {/* 技能列表 */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                {t.skills.selectSkillsToExport}
                            </label>
                            <button
                                onClick={toggleSelectAll}
                                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                {selectedSkills.size === customSkills.length
                                    ? t.skills.deselectAll
                                    : t.common.selectAll}
                            </button>
                        </div>

                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {customSkills.map((skill) => (
                                <label
                                    key={skill.id}
                                    className={`flex items-center gap-3 p-3 rounded-[10px] cursor-pointer transition-colors ${
                                        selectedSkills.has(skill.id)
                                            ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
                                            : 'bg-gray-50 dark:bg-gray-800 border border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedSkills.has(skill.id)}
                                        onChange={() => toggleSkillSelection(skill.id)}
                                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-gray-800 dark:text-gray-100">
                                            {getLocalizedText(skill.name, language)}
                                        </div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                            {getLocalizedText(skill.description, language)}
                                        </div>
                                        {/* v3.0.18: 显示附带文件数量 */}
                                        {skill.files && skill.files.length > 0 && (
                                            <div className="flex items-center gap-1 text-xs text-blue-500 dark:text-blue-400 mt-1">
                                                <FolderOpen className="w-3 h-3" />
                                                {t.skills.filesCount.replace('{count}', String(skill.files.length))}
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-xs text-gray-400">
                                        v{skill.version}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* 元信息 */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
                            {t.skills.exportInfo}
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                    {t.skills.author}
                                </label>
                                <Input
                                    value={author}
                                    onChange={setAuthor}
                                    placeholder={t.skills.authorPlaceholder}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                    {t.skills.source}
                                </label>
                                <Input
                                    value={source}
                                    onChange={setSource}
                                    placeholder={t.skills.sourcePlaceholder}
                                />
                            </div>
                        </div>
                    </div>

                    {/* 预览 */}
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-[10px] p-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
                            <FileJson className="w-4 h-4" />
                            {t.skills.exportPreview}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                            <p>• {t.skills.skillCount}: {selectedSkills.size}</p>
                            {/* v3.0.18: 显示附带文件总数 */}
                            {totalFiles > 0 && (
                                <p>• {t.skills.attachedFiles}: {totalFiles}</p>
                            )}
                            <p>• {t.skills.fileFormat}: JSON (Mobaus Studio)</p>
                            <p>• {t.settings.version}: 1.0.0</p>
                            {author && <p>• {t.skills.author}: {author}</p>}
                            {source && <p>• {t.skills.source}: {source}</p>}
                        </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <Button
                            variant="secondary"
                            onClick={handleClose}
                            className="flex-1"
                        >
                            {t.common.cancel}
                        </Button>
                        <Button
                            onClick={handleExport}
                            disabled={selectedSkills.size === 0}
                            className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500"
                            icon={<Download className="w-4 h-4" />}
                        >
                            {t.skills.exportCount.replace('{count}', String(selectedSkills.size))}
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default SkillExportModal;
