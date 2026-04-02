/**
 * SkillModal 组件 (v3.0.15)
 *
 * 技能编辑/预览弹窗
 * - 新建自定义技能
 * - 编辑自定义技能（内置技能只读）
 * - 预览提示词模板
 * - 配置变量默认值
 * - v3.0.15: 展示技能附带文件列表
 *
 * 对应文档: docs/modules/skills.md
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
    Lock,
    Eye,
    Code,
    FileText,
    Tag,
    Plus,
    Trash2,
    AlertCircle,
    FolderOpen,
    ChevronDown,
    ChevronRight,
} from 'lucide-react';
import { Modal, Button, Input, Textarea, Select } from '../../common';
import { previewSkillPrompt } from '../../../utils/skillUtils';
import { logger, LogTags } from '../../../utils/logger';
import { useI18n, getLocalizedText } from '../../../i18n';
import type {
    Skill,
    SkillCategory,
    SkillColor,
    SkillOutputFormat,
    SkillTrigger,
    SkillVariable,
    SkillCreateInput,
} from '../../../types';

interface SkillModalProps {
    isOpen: boolean;
    onClose: () => void;
    skill: Skill | null;
    onSave: (data: SkillCreateInput) => void;
    /** 是否为预览模式（只读，不可编辑） (v2.1.0) */
    previewMode?: boolean;
}

/**
 * 分类选项
 */
const getCategoryOptions = (t: ReturnType<typeof useI18n>['t']): { value: SkillCategory; label: string }[] => [
    { value: 'writing', label: t.skills.categoryWriting },
    { value: 'coding', label: t.skills.categoryCoding },
    { value: 'analysis', label: t.skills.categoryAnalysis },
    { value: 'translation', label: t.skills.categoryTranslation },
    { value: 'creative', label: t.skills.categoryCreative },
    { value: 'productivity', label: t.skills.categoryProductivity },
    { value: 'custom', label: t.skills.categoryCustom },
];

/**
 * 颜色选项
 */
const getColorOptions = (t: ReturnType<typeof useI18n>['t']): { value: SkillColor; label: string; class: string }[] => [
    { value: 'blue', label: t.skills.colorBlue, class: 'bg-blue-500' },
    { value: 'green', label: t.skills.colorGreen, class: 'bg-green-500' },
    { value: 'purple', label: t.skills.colorPurple, class: 'bg-purple-500' },
    { value: 'orange', label: t.skills.colorOrange, class: 'bg-orange-500' },
    { value: 'red', label: t.skills.colorRed, class: 'bg-red-500' },
    { value: 'cyan', label: t.skills.colorCyan, class: 'bg-cyan-500' },
];

/**
 * 输出格式选项
 */
const getOutputFormatOptions = (t: ReturnType<typeof useI18n>['t']): { value: SkillOutputFormat; label: string }[] => [
    { value: 'markdown', label: t.skills.formatMarkdown },
    { value: 'json', label: t.skills.formatJson },
    { value: 'code', label: t.skills.formatCode },
    { value: 'table', label: t.skills.formatTable },
    { value: 'free', label: t.skills.formatFree },
];

/**
 * 图标选项
 */
const getIconOptions = (t: ReturnType<typeof useI18n>['t']) => [
    { value: 'code', label: t.skills.iconCode },
    { value: 'pen-line', label: t.skills.iconWriting },
    { value: 'languages', label: t.skills.iconTranslation },
    { value: 'lightbulb', label: t.skills.iconCreative },
    { value: 'zap', label: t.skills.iconEfficiency },
    { value: 'search', label: t.skills.iconSearch },
    { value: 'file', label: t.skills.iconFile },
];

export const SkillModal: React.FC<SkillModalProps> = ({
    isOpen,
    onClose,
    skill,
    onSave,
    previewMode = false,
}) => {
    const { t, language } = useI18n();

    // 生成选项列表
    const categoryOptions = getCategoryOptions(t);
    const colorOptions = getColorOptions(t);
    const outputFormatOptions = getOutputFormatOptions(t);
    const iconOptions = getIconOptions(t);

    // ==================== 表单状态 ====================

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState<SkillCategory>('custom');
    const [icon, setIcon] = useState('code');
    const [color, setColor] = useState<SkillColor>('blue');
    const [promptTemplate, setPromptTemplate] = useState('');
    const [outputFormat, setOutputFormat] = useState<SkillOutputFormat>('markdown');
    const [triggers, setTriggers] = useState<SkillTrigger[]>([]);
    const [variables, setVariables] = useState<SkillVariable[]>([]);

    // 预览模式
    const [showPreview, setShowPreview] = useState(false);
    // 变量预览值
    const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({});
    // v3.0.15: 展开的文件索引集合
    const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set());

    // v2.1.0: 只读模式 = 内置技能 OR 预览模式
    const isReadOnly = (skill?.builtIn ?? false) || previewMode;
    // 是否为编辑模式
    const isEditMode = skill !== null;

    // ==================== 初始化表单 ====================

    useEffect(() => {
        if (skill) {
            // v3.0.15: 调试日志 - 检查传入的 skill 对象
            logger.debug(LogTags.SKILL, `初始化 skill`, {
                id: skill.id,
                name: skill.name,
                hasFiles: !!skill.files,
                filesCount: skill.files?.length ?? 0,
                filesPaths: skill.files?.map(f => f.path),
            });

            setName(getLocalizedText(skill.name, language));
            setDescription(getLocalizedText(skill.description, language));
            setCategory(skill.category);
            setIcon(skill.icon);
            setColor(skill.color);
            setPromptTemplate(skill.promptTemplate || '');
            setOutputFormat(skill.outputFormat || 'markdown');
            setTriggers(skill.triggers || []);
            setVariables(skill.variables || []);
            // 初始化预览值为默认值
            const defaultValues: Record<string, unknown> = {};
            skill.variables?.forEach((v) => {
                defaultValues[v.name] = v.defaultValue;
            });
            setPreviewValues(defaultValues);
        } else {
            // 新建技能，重置表单
            setName('');
            setDescription('');
            setCategory('custom');
            setIcon('code');
            setColor('blue');
            setPromptTemplate('');
            setOutputFormat('markdown');
            setTriggers([]);
            setVariables([]);
            setPreviewValues({});
        }
        setShowPreview(false);
    }, [skill, isOpen, language]);

    // ==================== 预览提示词 ====================

    const previewContent = useMemo(() => {
        if (!promptTemplate) return '';
        // 构造临时 Skill 对象用于预览
        const tempSkill: Skill = {
            id: 'preview',
            name,
            description,
            category,
            icon,
            color,
            enabled: true,
            builtIn: false,
            version: '1.0.0',
            promptTemplate,
            variables,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        return previewSkillPrompt(tempSkill, previewValues);
    }, [promptTemplate, variables, previewValues, name, description, category, icon, color]);

    // ==================== 触发条件操作 ====================

    const handleAddTrigger = () => {
        setTriggers([
            ...triggers,
            { type: 'keyword', pattern: '', priority: 10 },
        ]);
    };

    const handleUpdateTrigger = (
        index: number,
        field: keyof SkillTrigger,
        value: string | number
    ) => {
        const updated = [...triggers];
        updated[index] = { ...updated[index], [field]: value };
        setTriggers(updated);
    };

    const handleRemoveTrigger = (index: number) => {
        setTriggers(triggers.filter((_, i) => i !== index));
    };

    // ==================== 变量操作 ====================

    const handleAddVariable = () => {
        setVariables([
            ...variables,
            {
                name: `${t.skills.newVariableName}${variables.length + 1}`,
                label: `${t.skills.newVariableLabel}${variables.length + 1}`,
                type: 'string',
                defaultValue: '',
            },
        ]);
    };

    const handleUpdateVariable = (
        index: number,
        field: keyof SkillVariable,
        value: unknown
    ) => {
        const updated = [...variables];
        updated[index] = { ...updated[index], [field]: value };
        setVariables(updated);
    };

    const handleRemoveVariable = (index: number) => {
        setVariables(variables.filter((_, i) => i !== index));
    };

    // ==================== v3.0.15: 文件展开/收起 ====================

    /**
     * 切换文件展开/收起状态
     * @param index - 文件索引
     */
    const toggleFileExpand = (index: number) => {
        setExpandedFiles((prev) => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    // ==================== 提交表单 ====================

    const handleSubmit = () => {
        if (isReadOnly) {
            onClose();
            return;
        }

        const data: SkillCreateInput = {
            name,
            description,
            category,
            icon,
            color,
            promptTemplate,
            outputFormat,
            triggers: triggers.filter((t) => t.pattern.trim() !== ''),
            variables,
        };

        onSave(data);
        onClose();
    };

    // ==================== 渲染 ====================

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={
                previewMode
                    ? `${t.skills.previewSkill}: ${skill?.name}`
                    : isReadOnly
                    ? `${t.skills.viewSkill}: ${skill?.name}`
                    : isEditMode
                    ? t.skills.editSkill
                    : t.skills.createSkill
            }
            size="lg"
        >
            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                {/* 只读提示 */}
                {isReadOnly && (
                    <div className="flex items-center gap-2 p-3 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-[10px] text-sm">
                        <Lock className="w-4 h-4" />
                        {previewMode
                            ? t.skills.previewModeHint
                            : t.skills.builtInHint}
                    </div>
                )}

                {/* 技能头部信息 */}
                {skill && (
                    <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 rounded-[10px] border border-blue-200 dark:border-blue-700">
                        <div
                            className={`p-3 bg-gradient-to-br ${
                                colorOptions.find((c) => c.value === color)?.class ||
                                'bg-blue-500'
                            } rounded-[10px] text-white`}
                        >
                            <Code className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800 dark:text-gray-100">
                                {getLocalizedText(skill.name, language)}
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {skill.builtIn ? t.skills.builtInSkill : t.skills.customSkill} · v
                                {skill.version}
                            </p>
                        </div>
                    </div>
                )}

                {/* 基本信息 */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                            {t.skills.skillName} *
                        </label>
                        <Input
                            value={name}
                            onChange={setName}
                            placeholder={t.skills.namePlaceholder}
                            disabled={isReadOnly}
                        />
                    </div>

                    <div className="col-span-2">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                            {t.skills.description}
                        </label>
                        <Textarea
                            value={description}
                            onChange={setDescription}
                            placeholder={t.skills.descriptionPlaceholder}
                            rows={2}
                            disabled={isReadOnly}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                            {t.skills.category}
                        </label>
                        <Select
                            value={category}
                            onChange={(v) => setCategory(v as SkillCategory)}
                            options={categoryOptions}
                            disabled={isReadOnly}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                            {t.skills.outputFormat}
                        </label>
                        <Select
                            value={outputFormat}
                            onChange={(v) => setOutputFormat(v as SkillOutputFormat)}
                            options={outputFormatOptions}
                            disabled={isReadOnly}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                            {t.skills.icon}
                        </label>
                        <Select
                            value={icon}
                            onChange={setIcon}
                            options={iconOptions}
                            disabled={isReadOnly}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                            {t.skills.themeColor}
                        </label>
                        <div className="flex gap-2">
                            {colorOptions.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => !isReadOnly && setColor(opt.value)}
                                    className={`w-8 h-8 rounded-full ${opt.class} ${
                                        color === opt.value
                                            ? 'ring-2 ring-offset-2 ring-blue-500'
                                            : ''
                                    } ${isReadOnly ? 'cursor-not-allowed opacity-50' : ''}`}
                                    title={opt.label}
                                    disabled={isReadOnly}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* 提示词模板 */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            {t.skills.promptTemplate} *
                        </label>
                        <button
                            type="button"
                            onClick={() => setShowPreview(!showPreview)}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                        >
                            <Eye className="w-4 h-4" />
                            {showPreview ? t.skills.hidePreview : t.skills.showPreview}
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        {t.skills.promptTemplateHint}
                    </p>

                    {showPreview ? (
                        <div className="bg-gray-50 dark:bg-gray-800 rounded-[10px] p-4 border border-gray-200 dark:border-gray-700">
                            <div className="text-xs text-gray-500 mb-2">{t.skills.previewEffect}</div>
                            <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
                                {previewContent || t.skills.emptyTemplate}
                            </pre>
                        </div>
                    ) : (
                        <Textarea
                            value={promptTemplate}
                            onChange={setPromptTemplate}
                            placeholder={t.skills.promptTemplatePlaceholder}
                            rows={8}
                            disabled={isReadOnly}
                            className="font-mono text-sm"
                        />
                    )}
                </div>

                {/* 变量定义 */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <div className="flex items-center justify-between mb-4">
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                            <Code className="w-4 h-4" />
                            {t.skills.variables}
                        </label>
                        {!isReadOnly && (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleAddVariable}
                                icon={<Plus className="w-4 h-4" />}
                            >
                                {t.skills.addVariable}
                            </Button>
                        )}
                    </div>

                    {variables.length === 0 ? (
                        <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4 bg-gray-50 dark:bg-gray-800 rounded-[10px]">
                            {t.skills.noVariables}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {variables.map((variable, index) => (
                                <div
                                    key={index}
                                    className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-[10px]"
                                >
                                    <div className="flex-1 grid grid-cols-4 gap-2">
                                        <Input
                                            value={variable.name}
                                            onChange={(v) =>
                                                handleUpdateVariable(index, 'name', v)
                                            }
                                            placeholder={t.skills.variableName}
                                            disabled={isReadOnly}
                                        />
                                        <Input
                                            value={variable.label}
                                            onChange={(v) =>
                                                handleUpdateVariable(index, 'label', v)
                                            }
                                            placeholder={t.skills.variableLabel}
                                            disabled={isReadOnly}
                                        />
                                        <Select
                                            value={variable.type}
                                            onChange={(v) =>
                                                handleUpdateVariable(index, 'type', v)
                                            }
                                            options={[
                                                { value: 'string', label: t.skills.variableTypeString },
                                                { value: 'number', label: t.skills.variableTypeNumber },
                                                { value: 'boolean', label: t.skills.variableTypeBoolean },
                                                { value: 'select', label: t.skills.variableTypeSelect },
                                            ]}
                                            disabled={isReadOnly}
                                        />
                                        <Input
                                            value={String(variable.defaultValue)}
                                            onChange={(v) =>
                                                handleUpdateVariable(
                                                    index,
                                                    'defaultValue',
                                                    variable.type === 'number'
                                                        ? Number(v)
                                                        : variable.type === 'boolean'
                                                        ? v === 'true'
                                                        : v
                                                )
                                            }
                                            placeholder={t.skills.variableDefault}
                                            disabled={isReadOnly}
                                        />
                                    </div>
                                    {!isReadOnly && (
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveVariable(index)}
                                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-[10px]"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 变量预览输入（用于实时预览） */}
                    {showPreview && variables.length > 0 && (
                        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-[10px]">
                            <div className="text-xs text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                {t.skills.adjustVariables}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {variables.map((variable) => (
                                    <div key={variable.name} className="flex items-center gap-2">
                                        <span className="text-xs text-gray-600 dark:text-gray-400 w-20">
                                            {variable.label}:
                                        </span>
                                        <Input
                                            value={String(previewValues[variable.name] ?? variable.defaultValue)}
                                            onChange={(v) =>
                                                setPreviewValues({
                                                    ...previewValues,
                                                    [variable.name]: v,
                                                })
                                            }
                                            className="flex-1 text-sm"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* 触发条件 */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <div className="flex items-center justify-between mb-4">
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                            <Tag className="w-4 h-4" />
                            {t.skills.triggersOptional}
                        </label>
                        {!isReadOnly && (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleAddTrigger}
                                icon={<Plus className="w-4 h-4" />}
                            >
                                {t.skills.addTrigger}
                            </Button>
                        )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                        {t.skills.triggerHint}
                    </p>

                    {triggers.length === 0 ? (
                        <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4 bg-gray-50 dark:bg-gray-800 rounded-[10px]">
                            {t.skills.noTriggers}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {triggers.map((trigger, index) => (
                                <div
                                    key={index}
                                    className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-[10px]"
                                >
                                    <Select
                                        value={trigger.type}
                                        onChange={(v) =>
                                            handleUpdateTrigger(
                                                index,
                                                'type',
                                                v as 'keyword' | 'regex' | 'intent'
                                            )
                                        }
                                        options={[
                                            { value: 'keyword', label: t.skills.triggerTypeKeyword },
                                            { value: 'regex', label: t.skills.triggerTypeRegex },
                                            { value: 'intent', label: t.skills.triggerTypeIntent },
                                        ]}
                                        disabled={isReadOnly}
                                    />
                                    <Input
                                        value={trigger.pattern}
                                        onChange={(v) =>
                                            handleUpdateTrigger(index, 'pattern', v)
                                        }
                                        placeholder={
                                            trigger.type === 'keyword'
                                                ? t.skills.triggerTypeKeyword
                                                : trigger.type === 'regex'
                                                ? t.skills.triggerTypeRegex
                                                : t.skills.triggerTypeIntent
                                        }
                                        className="flex-1"
                                        disabled={isReadOnly}
                                    />
                                    <Input
                                        value={String(trigger.priority)}
                                        onChange={(v) =>
                                            handleUpdateTrigger(
                                                index,
                                                'priority',
                                                parseInt(v) || 10
                                            )
                                        }
                                        placeholder={t.skills.triggerPriority}
                                        className="w-20"
                                        disabled={isReadOnly}
                                    />
                                    {!isReadOnly && (
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveTrigger(index)}
                                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-[10px]"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 附带文件 (v3.0.15) */}
                {skill?.files && skill.files.length > 0 && (
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2 mb-4">
                            <FolderOpen className="w-4 h-4" />
                            {t.skills.attachedFiles} ({skill.files.length})
                        </label>
                        <div className="space-y-2">
                            {skill.files.map((file, index) => (
                                <div
                                    key={index}
                                    className="bg-gray-50 dark:bg-gray-800 rounded-[10px] border border-gray-200 dark:border-gray-700"
                                >
                                    {/* 文件头部 */}
                                    <button
                                        type="button"
                                        onClick={() => toggleFileExpand(index)}
                                        className="w-full flex items-center justify-between p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-[10px] transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            {expandedFiles.has(index) ? (
                                                <ChevronDown className="w-4 h-4 text-gray-500" />
                                            ) : (
                                                <ChevronRight className="w-4 h-4 text-gray-500" />
                                            )}
                                            <FileText className="w-4 h-4 text-blue-500" />
                                            <span className="text-sm font-mono text-gray-700 dark:text-gray-300">
                                                {file.path}
                                            </span>
                                        </div>
                                        <span className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded text-gray-600 dark:text-gray-300">
                                            {file.type}
                                        </span>
                                    </button>
                                    {/* 文件内容 */}
                                    {expandedFiles.has(index) && (
                                        <div className="px-3 pb-3">
                                            <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-3 rounded overflow-x-auto max-h-60 overflow-y-auto font-mono text-gray-700 dark:text-gray-300">
                                                {file.content}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 操作按钮 */}
                <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <Button variant="secondary" onClick={onClose} className="flex-1">
                        {isReadOnly ? t.common.close : t.common.cancel}
                    </Button>
                    {!isReadOnly && (
                        <Button
                            onClick={handleSubmit}
                            className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500"
                            disabled={!name.trim() || !promptTemplate.trim()}
                        >
                            {isEditMode ? t.skills.saveChanges : t.skills.createSkill}
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default SkillModal;
