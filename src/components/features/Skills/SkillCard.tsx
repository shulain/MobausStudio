/**
 * SkillCard 组件 (v3.0.22)
 *
 * 展示单个技能卡片
 * - 显示技能基本信息（名称、描述、分类）
 * - 显示内置/自定义标签
 * - 显示变量配置预览
 * - 显示触发条件预览
 * - 支持启用/禁用切换
 * - 支持配置/预览操作
 * - v2.1.0: 自定义技能支持删除操作
 * - v3.0.19: 显示附带文件数量
 * - v3.0.22: 显示技能来源信息
 *
 * 对应文档: docs/modules/skills.md
 */

import React from 'react';
import {
    Search,
    Code,
    Image,
    Paperclip,
    Languages,
    PenLine,
    Lightbulb,
    Zap,
    Settings,
    Lock,
    Tag,
    Eye,
    Trash2,
    FileText,
    Link,
} from 'lucide-react';
import { Toggle } from '../../common';
import { useI18n, getLocalizedText } from '../../../i18n';
import type { Skill, SkillCategory } from '../../../types';

interface SkillCardProps {
    skill: Skill;
    onToggle: (enabled: boolean) => void;
    onConfigure: () => void;
    onPreview?: () => void;
    /** v2.1.0: 删除技能回调（仅自定义技能可删除） */
    onDelete?: () => void;
}

/**
 * 图标映射表
 * 将图标名称映射到 Lucide 图标组件
 */
const iconMap: Record<string, React.ReactNode> = {
    search: <Search className="w-5 h-5" />,
    code: <Code className="w-5 h-5" />,
    image: <Image className="w-5 h-5" />,
    file: <Paperclip className="w-5 h-5" />,
    languages: <Languages className="w-5 h-5" />,
    'pen-line': <PenLine className="w-5 h-5" />,
    lightbulb: <Lightbulb className="w-5 h-5" />,
    zap: <Zap className="w-5 h-5" />,
};

/**
 * 颜色样式映射
 */
const colorStyles: Record<string, string> = {
    blue: 'from-blue-500 to-cyan-500',
    green: 'from-green-500 to-emerald-500',
    purple: 'from-[#F6C433] via-[#E90E55] via-[#E44F32] via-[#A188E3] to-[#0DB4EA]',
    orange: 'from-orange-500 to-amber-500',
    red: 'from-red-500 to-rose-500',
    cyan: 'from-cyan-500 to-teal-500',
};

export const SkillCard: React.FC<SkillCardProps> = ({
    skill,
    onToggle,
    onConfigure,
    onPreview,
    onDelete,
}) => {
    const { t, language } = useI18n();

    /**
     * 分类显示名称映射
     */
    const categoryLabels: Record<SkillCategory, string> = {
        writing: t.skills.categoryWriting,
        coding: t.skills.categoryCoding,
        analysis: t.skills.categoryAnalysis,
        translation: t.skills.categoryTranslation,
        creative: t.skills.categoryCreative,
        productivity: t.skills.categoryProductivity,
        custom: t.skills.categoryCustom,
    };

    /**
     * 获取技能颜色渐变样式
     */
    const getSkillColor = (color: string) => {
        return colorStyles[color] || colorStyles.blue;
    };

    /**
     * 获取技能图标
     */
    const getIcon = () => {
        return iconMap[skill.icon] || <Code className="w-5 h-5" />;
    };

    /**
     * 获取分类显示名称
     */
    const getCategoryLabel = () => {
        return categoryLabels[skill.category as SkillCategory] || skill.category;
    };

    /**
     * 获取触发条件预览文本
     */
    const getTriggersPreview = () => {
        if (!skill.triggers || skill.triggers.length === 0) {
            return null;
        }
        // 只显示前 3 个触发关键词
        const keywords = skill.triggers
            .filter((t) => t.type === 'keyword')
            .slice(0, 3)
            .map((t) => t.pattern);
        return keywords.length > 0 ? keywords : null;
    };

    /**
     * 获取变量预览
     */
    const getVariablesPreview = () => {
        if (!skill.variables || skill.variables.length === 0) {
            return null;
        }
        return skill.variables.slice(0, 3);
    };

    const triggersPreview = getTriggersPreview();
    const variablesPreview = getVariablesPreview();

    return (
        <div className="bg-white dark:bg-gray-800 rounded-[10px] border-2 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-lg transition-all p-5">
            <div className="flex items-start gap-4">
                {/* 图标 */}
                <div
                    className={`w-14 h-14 bg-gradient-to-br ${getSkillColor(
                        skill.color
                    )} rounded-[10px] flex items-center justify-center text-white flex-shrink-0`}
                >
                    {getIcon()}
                </div>

                <div className="flex-1 min-w-0">
                    {/* 标题栏 */}
                    <div className="flex items-start justify-between mb-2">
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-gray-800 dark:text-gray-100">
                                    {getLocalizedText(skill.name, language)}
                                </h3>
                                {/* 内置标签 */}
                                {skill.builtIn && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full text-xs font-medium">
                                        <Lock className="w-3 h-3" />
                                        {t.skills.builtInSkill}
                                    </span>
                                )}
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                {getCategoryLabel()}
                                {skill.version && ` · v${skill.version}`}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* v2.1.0: 自定义技能显示删除按钮 */}
                            {!skill.builtIn && onDelete && (
                                <button
                                    onClick={onDelete}
                                    className="p-1.5 rounded-[10px] hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                    title={t.skills.deleteSkill}
                                >
                                    <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                                </button>
                            )}
                            <Toggle
                                checked={skill.enabled}
                                onChange={onToggle}
                            />
                        </div>
                    </div>

                    {/* 描述 */}
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 line-clamp-2">
                        {getLocalizedText(skill.description, language)}
                    </p>

                    {/* v3.0.19: 附带文件数量显示 */}
                    {skill.files && skill.files.length > 0 && (
                        <div className="flex items-center gap-1 mb-3 text-xs text-gray-500 dark:text-gray-400">
                            <FileText className="w-3 h-3" />
                            <span>{t.skills.filesAttached.replace('{count}', String(skill.files.length))}</span>
                        </div>
                    )}

                    {/* v3.0.22: 技能来源信息显示 */}
                    {skill.source && skill.source.repoUrl && (
                        <div className="flex items-center gap-1 mb-3 text-xs">
                            <Link className="w-3 h-3 text-gray-400" />
                            <a
                                href={skill.source.repoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:text-blue-600 hover:underline truncate max-w-[200px]"
                                title={skill.source.installCommand || skill.source.repoUrl}
                            >
                                {skill.source.repoOwner}/{skill.source.repoName}
                            </a>
                            {skill.source.type === 'skills.sh' && (
                                <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded text-xs">
                                    skills.sh
                                </span>
                            )}
                        </div>
                    )}

                    {/* 触发关键词预览 */}
                    {triggersPreview && (
                        <div className="flex flex-wrap gap-1 mb-3">
                            {triggersPreview.map((keyword, index) => (
                                <span
                                    key={index}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-xs"
                                >
                                    <Tag className="w-3 h-3" />
                                    {keyword}
                                </span>
                            ))}
                            {skill.triggers && skill.triggers.length > 3 && (
                                <span className="text-xs text-gray-400">
                                    +{skill.triggers.length - 3}
                                </span>
                            )}
                        </div>
                    )}

                    {/* 变量配置预览 */}
                    {variablesPreview && (
                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-[10px] p-3 space-y-2 mb-3">
                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                                <Settings className="w-3 h-3" />
                                {t.skills.variables}
                            </div>
                            {variablesPreview.map((variable) => (
                                <div
                                    key={variable.name}
                                    className="flex items-center justify-between"
                                >
                                    <span className="text-xs text-gray-600 dark:text-gray-400">
                                        {variable.label}:
                                    </span>
                                    <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
                                        {variable.type === 'select' && variable.options
                                            ? variable.options.slice(0, 2).join('/')
                                            : String(variable.defaultValue)}
                                    </span>
                                </div>
                            ))}
                            {skill.variables && skill.variables.length > 3 && (
                                <div className="text-xs text-gray-400 text-center">
                                    +{skill.variables.length - 3}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex gap-2">
                        {/* 内置技能只能查看，自定义技能可以配置 */}
                        {skill.builtIn ? (
                            <button
                                onClick={onPreview || onConfigure}
                                className="flex-1 py-2 px-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-[10px] text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-1"
                            >
                                <Eye className="w-4 h-4" />
                                {t.skills.viewSkill}
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={onConfigure}
                                    className="flex-1 py-2 px-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-[10px] text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center justify-center gap-1"
                                >
                                    <Settings className="w-4 h-4" />
                                    {t.common.edit}
                                </button>
                                {/* v2.1.0: 预览按钮使用 onPreview 回调 */}
                                <button
                                    onClick={onPreview}
                                    className="flex-1 py-2 px-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-[10px] text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-1"
                                >
                                    <Eye className="w-4 h-4" />
                                    {t.skills.previewSkill}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SkillCard;
