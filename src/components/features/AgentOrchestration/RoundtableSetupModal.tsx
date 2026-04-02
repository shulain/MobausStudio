/**
 * 圆桌会议配置弹窗组件
 *
 * 用于创建和配置圆桌会议：
 * - 设置讨论主题
 * - 添加/移除参与者（2-6 个 Agent）
 * - 为每个参与者设置角色描述
 * - 配置发言规则
 *
 * @module components/features/AgentOrchestration/RoundtableSetupModal
 */

import {
    AlertCircle,
    ChevronDown,
    ChevronUp,
    MessageCircle,
    Plus,
    Settings,
    Trash2,
    Users,
    X,
} from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { useI18n } from '../../../i18n';
import type {
    Agent,
    RoundtableCreateInput,
    RoundtableSpeakMode,
} from '../../../types';
import { validateRoundtableConfig } from './utils';

/**
 * 组件 Props
 */
interface RoundtableSetupModalProps {
    /** 是否显示弹窗 */
    isOpen: boolean;
    /** 关闭弹窗回调 */
    onClose: () => void;
    /** 确认创建回调 */
    onCreate: (input: RoundtableCreateInput) => void;
    /** 可用的 Agent 列表 */
    agents: Agent[];
}

/**
 * 参与者配置项
 */
interface ParticipantConfig {
    id: string;
    agentId: string;
    role: string;
    avatar?: string;
    color?: string;
}

/**
 * v4.1.9: 拟人化角色头像映射表
 * 根据角色关键词智能匹配合适的人物头像
 */
const ROLE_AVATAR_MAP: Record<string, string[]> = {
    // 技术类 - 使用人物头像
    '架构': ['👨‍💻', '👩‍💻', '🧑‍💻', '👨‍🔬'],
    '工程': ['👷', '👷‍♂️', '👷‍♀️', '🧑‍🔧'],
    '开发': ['👨‍💻', '👩‍💻', '🧑‍💻', '💻'],
    '程序': ['👨‍💻', '👩‍💻', '🧑‍💻', '🖥️'],
    '前端': ['👨‍🎨', '👩‍🎨', '🧑‍🎨', '👨‍💻'],
    '后端': ['👨‍💻', '👩‍💻', '🧑‍🔬', '🧑‍💻'],
    '全栈': ['🦸‍♂️', '🦸‍♀️', '🦸', '🧑‍💻'],
    '测试': ['🕵️', '🕵️‍♂️', '🕵️‍♀️', '👨‍🔬'],
    'QA': ['🕵️‍♂️', '🕵️‍♀️', '👩‍🔬', '👨‍🔬'],
    '运维': ['👨‍🔧', '👩‍🔧', '🧑‍🔧', '🛠️'],
    'DevOps': ['🦹‍♂️', '🦹‍♀️', '🧑‍🚀', '👨‍🔧'],
    '数据': ['👨‍🔬', '👩‍🔬', '🧑‍🔬', '📊'],
    'AI': ['🤖', '👨‍🔬', '👩‍🔬', '🧠'],
    '算法': ['🧙‍♂️', '🧙‍♀️', '👨‍🔬', '👩‍🔬'],
    '安全': ['🦸‍♂️', '🦸‍♀️', '🕵️', '🛡️'],

    // 设计类
    '设计': ['👨‍🎨', '👩‍🎨', '🧑‍🎨', '🎨'],
    'UI': ['👨‍🎨', '👩‍🎨', '🧑‍🎨', '✨'],
    'UX': ['🧑‍🎨', '👨‍🎨', '👩‍🎨', '🎯'],
    '产品': ['👨‍💼', '👩‍💼', '🧑‍💼', '📦'],
    'PM': ['👨‍💼', '👩‍💼', '🧑‍💼', '📋'],

    // 商业类
    '商业': ['👨‍💼', '👩‍💼', '🧑‍💼', '💼'],
    '市场': ['📣', '👨‍💼', '👩‍💼', '🎯'],
    '营销': ['🧑‍💼', '👨‍💼', '👩‍💼', '📢'],
    '销售': ['🤵', '🤵‍♂️', '🤵‍♀️', '🤝'],
    '运营': ['👨‍💼', '👩‍💼', '🧑‍💼', '⚡'],
    '财务': ['🧑‍💼', '👨‍💼', '👩‍💼', '💰'],
    '法务': ['👨‍⚖️', '👩‍⚖️', '🧑‍⚖️', '⚖️'],
    '人事': ['🧑‍💼', '👨‍💼', '👩‍💼', '👥'],
    'HR': ['👩‍💼', '👨‍💼', '🧑‍💼', '🤝'],

    // 管理类
    '经理': ['👨‍💼', '👩‍💼', '🧑‍💼', '👔'],
    '总监': ['🤴', '👸', '👨‍💼', '👩‍💼'],
    '主管': ['👨‍💼', '👩‍💼', '🧑‍💼', '📋'],
    '领导': ['🤴', '👸', '👑', '🌟'],
    'CEO': ['🤴', '👸', '👨‍💼', '👩‍💼'],
    'CTO': ['🧙‍♂️', '🧙‍♀️', '👨‍💻', '👩‍💻'],
    'CFO': ['🧑‍💼', '👨‍💼', '👩‍💼', '💰'],

    // 专业类
    '专家': ['🧙‍♂️', '🧙‍♀️', '👨‍🎓', '👩‍🎓'],
    '顾问': ['🧓', '👴', '👵', '🧙'],
    '分析': ['🕵️‍♂️', '🕵️‍♀️', '👨‍🔬', '👩‍🔬'],
    '研究': ['👨‍🔬', '👩‍🔬', '🧑‍🔬', '🔬'],
    '教授': ['👨‍🏫', '👩‍🏫', '🧑‍🏫', '🎓'],
    '老师': ['👨‍🏫', '👩‍🏫', '🧑‍🏫', '📚'],
    '医生': ['👨‍⚕️', '👩‍⚕️', '🧑‍⚕️', '🏥'],
    '律师': ['👨‍⚖️', '👩‍⚖️', '🧑‍⚖️', '⚖️'],

    // 创意类
    '作家': ['✍️', '👨‍💻', '👩‍💻', '📝'],
    '编辑': ['👨‍💻', '👩‍💻', '📝', '✏️'],
    '记者': ['🧑‍💻', '👨‍💻', '👩‍💻', '📰'],
    '导演': ['🎬', '👨‍🎨', '👩‍🎨', '🎥'],
    '艺术': ['👨‍🎨', '👩‍🎨', '🧑‍🎨', '🎭'],
    '音乐': ['👨‍🎤', '👩‍🎤', '🧑‍🎤', '🎵'],

    // 性别/角色类
    '男': ['👨', '🧔', '👨‍💼', '🤵'],
    '女': ['👩', '👩‍💼', '💃', '👸'],
    '用户': ['🙋', '🙋‍♂️', '🙋‍♀️', '👤'],
    '客户': ['🤝', '👥', '🙋', '👤'],

    // 性格/立场类
    '乐观': ['😊', '🌞', '😄', '🤗'],
    '悲观': ['😔', '🤔', '😟', '💭'],
    '理性': ['🧐', '🤓', '👨‍🔬', '👩‍🔬'],
    '感性': ['🥰', '😊', '💖', '🌸'],
    '保守': ['🧓', '👴', '👵', '🏛️'],
    '激进': ['🦸', '🦹', '💪', '🔥'],
    '批评': ['🧐', '🕵️', '🤨', '👀'],
    '支持': ['👍', '💪', '🤝', '✅'],
};

/**
 * v4.1.9: 通用拟人化头像池（当无法匹配角色时使用）
 * 全部使用人物类头像
 */
const GENERAL_AVATARS = [
    // 职业人物
    '👨‍💼', '👩‍💼', '🧑‍💼', '👨‍🔬', '👩‍🔬', '👨‍💻', '👩‍💻',
    '👨‍🎨', '👩‍🎨', '👨‍🏫', '👩‍🏫', '👨‍⚕️', '👩‍⚕️', '👨‍⚖️', '👩‍⚖️',
    // 奇幻人物（拟人化）
    '🧙‍♂️', '🧙‍♀️', '🦸‍♂️', '🦸‍♀️', '🦹‍♂️', '🦹‍♀️', '🧝‍♂️', '🧝‍♀️',
    '🧚‍♂️', '🧚‍♀️', '🧛‍♂️', '🧛‍♀️', '🧜‍♂️', '🧜‍♀️', '🥷', '🤴', '👸',
    // 普通人物
    '🙋‍♂️', '🙋‍♀️', '🙆‍♂️', '🙆‍♀️', '💁‍♂️', '💁‍♀️', '🤷‍♂️', '🤷‍♀️',
];

/**
 * v4.1.9: 根据角色名称智能匹配头像
 * @param role - 角色名称
 * @param usedAvatars - 已使用的头像列表（避免重复）
 * @returns 匹配的头像
 */
function getSmartAvatar(role: string, usedAvatars: string[]): string {
    // 遍历角色映射表，查找匹配的关键词
    for (const [keyword, avatars] of Object.entries(ROLE_AVATAR_MAP)) {
        if (role.includes(keyword)) {
            // 找到未使用的头像
            const available = avatars.filter(a => !usedAvatars.includes(a));
            if (available.length > 0) {
                return available[Math.floor(Math.random() * available.length)];
            }
            // 如果都用过了，随机返回一个
            return avatars[Math.floor(Math.random() * avatars.length)];
        }
    }

    // 没有匹配到，从通用池中选择
    const available = GENERAL_AVATARS.filter(a => !usedAvatars.includes(a));
    if (available.length > 0) {
        return available[Math.floor(Math.random() * available.length)];
    }

    // 通用池也用完了，随机返回
    return GENERAL_AVATARS[Math.floor(Math.random() * GENERAL_AVATARS.length)];
}

/**
 * 默认颜色列表
 */
const DEFAULT_COLORS = ['purple', 'blue', 'green', 'orange', 'pink', 'cyan'];

/**
 * 发言模式选项
 * v4.1.10: 移除并行发言模式，因为流式响应无法正确区分来源
 */
const getSpeakModeOptions = (t: ReturnType<typeof useI18n>['t']): Array<{
    value: RoundtableSpeakMode;
    label: string;
    description: string;
}> => [
        {
            value: 'sequential',
            label: t.roundtable.speakModeSequential,
            description: t.roundtable.speakModeSequentialDesc || 'Agent 按顺序轮流发言，每轮每人发言一次',
        },
        {
            value: 'free',
            label: t.roundtable.speakModeFree,
            description: t.roundtable.speakModeFreeDesc || '用户 @指定 Agent 发言，灵活控制讨论节奏',
        },
    ];

/**
 * 圆桌会议配置弹窗组件
 */
export const RoundtableSetupModal: React.FC<RoundtableSetupModalProps> = ({
    isOpen,
    onClose,
    onCreate,
    agents,
}) => {
    const { t } = useI18n();

    // 生成发言模式选项
    const SPEAK_MODE_OPTIONS = getSpeakModeOptions(t);

    // ==================== 状态管理 ====================

    // 讨论主题
    const [topic, setTopic] = useState('');

    // v4.1.13: 内容背景/上下文（可选）
    const [background, setBackground] = useState('');

    // v4.1.13: 讨论约束/边界（可选）
    const [constraints, setConstraints] = useState('');

    // v4.1.13: 是否显示背景输入
    const [showBackground, setShowBackground] = useState(false);

    // v4.1.13: 是否显示约束输入
    const [showConstraints, setShowConstraints] = useState(false);

    // 参与者列表
    const [participants, setParticipants] = useState<ParticipantConfig[]>([]);

    // 发言模式
    const [speakMode, setSpeakMode] = useState<RoundtableSpeakMode>('sequential');

    // 最大轮数 - v4.1.7: 默认为不固定（999）
    const [maxRounds, setMaxRounds] = useState(999);

    // 是否自动总结
    const [autoSummarize, setAutoSummarize] = useState(true);

    // 是否允许互相引用
    const [allowCrossReference, setAllowCrossReference] = useState(true);

    // 总结者 Agent ID
    const [summarizerAgentId, setSummarizerAgentId] = useState<string>('');

    // 显示高级选项
    const [showAdvanced, setShowAdvanced] = useState(false);

    // 验证错误
    const [error, setError] = useState<string | null>(null);

    // ==================== 计算属性 ====================

    // 可用的 Agent（排除已添加的）
    const availableAgents = useMemo(() => {
        const usedAgentIds = new Set(participants.map(p => p.agentId));
        return agents.filter(a => a.status === 'active' && !usedAgentIds.has(a.id));
    }, [agents, participants]);

    // 是否可以添加更多参与者
    const canAddMore = participants.length < 6 && availableAgents.length > 0;

    // 是否可以创建
    const canCreate = topic.trim().length > 0 && participants.length >= 2;

    // ==================== 事件处理 ====================

    /**
     * 添加参与者
     * v4.1.9: 使用智能头像匹配
     */
    const handleAddParticipant = useCallback(() => {
        if (!canAddMore) return;

        const nextAgent = availableAgents[0];
        if (!nextAgent) return;

        const index = participants.length;
        // v4.1.9: 收集已使用的头像
        const usedAvatars = participants.map(p => p.avatar).filter((a): a is string => !!a);
        // 使用 Agent 名称智能匹配头像
        const smartAvatar = getSmartAvatar(nextAgent.name, usedAvatars);

        const newParticipant: ParticipantConfig = {
            id: `temp-${Date.now()}`,
            agentId: nextAgent.id,
            role: '',
            avatar: smartAvatar,
            color: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
        };

        setParticipants(prev => [...prev, newParticipant]);
        setError(null);
    }, [canAddMore, availableAgents, participants]);

    /**
     * 移除参与者
     */
    const handleRemoveParticipant = useCallback((id: string) => {
        setParticipants(prev => prev.filter(p => p.id !== id));
        setError(null);
    }, []);

    /**
     * 更新参与者配置
     */
    const handleUpdateParticipant = useCallback((
        id: string,
        field: keyof ParticipantConfig,
        value: string
    ) => {
        setParticipants(prev => prev.map(p =>
            p.id === id ? { ...p, [field]: value } : p
        ));
        setError(null);
    }, []);

    /**
     * 移动参与者顺序
     */
    const handleMoveParticipant = useCallback((id: string, direction: 'up' | 'down') => {
        setParticipants(prev => {
            const index = prev.findIndex(p => p.id === id);
            if (index === -1) return prev;

            const newIndex = direction === 'up' ? index - 1 : index + 1;
            if (newIndex < 0 || newIndex >= prev.length) return prev;

            const newList = [...prev];
            [newList[index], newList[newIndex]] = [newList[newIndex], newList[index]];
            return newList;
        });
    }, []);

    /**
     * 重置表单
     * v4.1.7: 默认轮数改为不固定（999）
     * v4.1.13: 重置背景和约束字段
     */
    const handleReset = useCallback(() => {
        setTopic('');
        setBackground('');
        setConstraints('');
        setShowBackground(false);
        setShowConstraints(false);
        setParticipants([]);
        setSpeakMode('sequential');
        setMaxRounds(999);
        setAutoSummarize(true);
        setAllowCrossReference(true);
        setSummarizerAgentId('');
        setShowAdvanced(false);
        setError(null);
    }, []);

    /**
     * 创建圆桌会议
     * v4.1.13: 添加 background 和 constraints 可选字段
     */
    const handleCreate = useCallback(() => {
        // 构建输入
        const input: RoundtableCreateInput = {
            topic: topic.trim(),
            // v4.1.13: 添加背景和约束（仅在有内容时传递）
            background: background.trim() || undefined,
            constraints: constraints.trim() || undefined,
            participants: participants.map((p, index) => ({
                agentId: p.agentId,
                // 默认角色名使用"参与人1"、"参与人2"等
                role: p.role.trim() || `参与人${index + 1}`,
                avatar: p.avatar,
                color: p.color,
            })),
            rules: {
                maxRounds,
                speakMode,
                autoSummarize,
                allowCrossReference,
                summarizerAgentId: summarizerAgentId || undefined,
            },
        };

        // 验证
        const validationError = validateRoundtableConfig(input, agents);
        if (validationError) {
            setError(validationError);
            return;
        }

        // 创建
        onCreate(input);
        handleReset();
    }, [
        topic,
        background,
        constraints,
        participants,
        maxRounds,
        speakMode,
        autoSummarize,
        allowCrossReference,
        summarizerAgentId,
        agents,
        onCreate,
        handleReset,
    ]);

    /**
     * 关闭弹窗
     */
    const handleClose = useCallback(() => {
        handleReset();
        onClose();
    }, [handleReset, onClose]);

    // ==================== 渲染 ====================

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* 遮罩层 */}
            <div
                className="absolute inset-0 bg-black/50"
                onClick={handleClose}
            />

            {/* 弹窗内容 */}
            <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* 标题栏 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-[10px] bg-gradient-to-bl from-[#A688F6] to-[#009BF3] flex items-center justify-center">
                            <Users className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                {t.roundtable.create}
                            </h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {t.roundtable.createDesc}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-[10px] transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* 表单内容 */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* 错误提示 */}
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-[10px] text-red-700 dark:text-red-400 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* 讨论主题 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            <MessageCircle className="w-4 h-4 inline mr-1" />
                            {t.roundtable.topic} <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            placeholder={t.roundtable.topicExample}
                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-[10px] focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                        />
                    </div>

                    {/* v4.1.13: 背景信息（可选，可折叠） */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowBackground(!showBackground)}
                            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                        >
                            {showBackground ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            {t.roundtable.addBackground}
                            {background.trim() && <span className="text-green-500">✓</span>}
                        </button>
                        {showBackground && (
                            <div className="mt-2">
                                <textarea
                                    value={background}
                                    onChange={(e) => setBackground(e.target.value)}
                                    placeholder={t.roundtable.backgroundPlaceholder}
                                    rows={3}
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-[10px] focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all resize-none text-sm"
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    💡 {t.roundtable.backgroundHint}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* v4.1.13: 讨论约束（可选，可折叠） */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowConstraints(!showConstraints)}
                            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                        >
                            {showConstraints ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            {t.roundtable.addConstraints}
                            {constraints.trim() && <span className="text-green-500">✓</span>}
                        </button>
                        {showConstraints && (
                            <div className="mt-2">
                                <textarea
                                    value={constraints}
                                    onChange={(e) => setConstraints(e.target.value)}
                                    placeholder={t.roundtable.constraintsPlaceholder}
                                    rows={4}
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-[10px] focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all resize-none text-sm"
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    💡 {t.roundtable.constraintsHint}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* 参与者列表 */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                <Users className="w-4 h-4 inline mr-1" />
                                {t.roundtable.participants} ({participants.length}/6) <span className="text-red-500">*</span>
                            </label>
                            <button
                                onClick={handleAddParticipant}
                                disabled={!canAddMore}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-[10px] hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                {t.roundtable.addParticipant}
                            </button>
                        </div>

                        {participants.length === 0 ? (
                            <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-[10px] border-2 border-dashed border-gray-200 dark:border-gray-700">
                                <Users className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {t.roundtable.minParticipantsHint}
                                </p>
                                <button
                                    onClick={handleAddParticipant}
                                    disabled={!canAddMore}
                                    className="mt-2 text-sm text-purple-600 dark:text-purple-400 hover:underline"
                                >
                                    {t.roundtable.addFirstParticipant}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {participants.map((participant, index) => (
                                    <div
                                        key={participant.id}
                                        className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-[10px] border border-gray-200 dark:border-gray-700"
                                    >
                                        {/* 顺序调整 */}
                                        <div className="flex flex-col gap-0.5 flex-shrink-0">
                                            <button
                                                onClick={() => handleMoveParticipant(participant.id, 'up')}
                                                disabled={index === 0}
                                                className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-30"
                                            >
                                                <ChevronUp className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={() => handleMoveParticipant(participant.id, 'down')}
                                                disabled={index === participants.length - 1}
                                                className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-30"
                                            >
                                                <ChevronDown className="w-3 h-3" />
                                            </button>
                                        </div>

                                        {/* 头像 */}
                                        <span className="text-2xl flex-shrink-0">{participant.avatar}</span>

                                        {/* Agent 选择 - v4.1.9: 调整宽度比例 */}
                                        <select
                                            value={participant.agentId}
                                            onChange={(e) => handleUpdateParticipant(participant.id, 'agentId', e.target.value)}
                                            className="flex-[2] min-w-0 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-[10px] text-sm"
                                        >
                                            {/* 当前选中的 Agent */}
                                            {agents.filter(a => a.id === participant.agentId).map(a => (
                                                <option key={a.id} value={a.id}>{a.name}</option>
                                            ))}
                                            {/* 其他可用的 Agent */}
                                            {availableAgents.map(a => (
                                                <option key={a.id} value={a.id}>{a.name}</option>
                                            ))}
                                        </select>

                                        {/* 角色描述 - v4.1.9: 增加宽度，使用 flex-1 */}
                                        <input
                                            type="text"
                                            value={participant.role}
                                            onChange={(e) => handleUpdateParticipant(participant.id, 'role', e.target.value)}
                                            placeholder={t.roundtable.roleInputPlaceholder}
                                            className="flex-1 min-w-[120px] px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-[10px] text-sm"
                                        />

                                        {/* 删除按钮 */}
                                        <button
                                            onClick={() => handleRemoveParticipant(participant.id)}
                                            className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded-[10px] transition-colors flex-shrink-0"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 发言模式 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            {t.roundtable.speakMode}
                        </label>
                        <div className="grid grid-cols-3 gap-3">
                            {SPEAK_MODE_OPTIONS.map(option => (
                                <button
                                    key={option.value}
                                    onClick={() => setSpeakMode(option.value)}
                                    className={`p-3 rounded-[10px] border-2 text-left transition-all ${speakMode === option.value
                                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                        }`}
                                >
                                    <div className={`text-sm font-medium ${speakMode === option.value
                                            ? 'text-purple-700 dark:text-purple-300'
                                            : 'text-gray-700 dark:text-gray-300'
                                        }`}>
                                        {option.label}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        {option.description}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* v4.1.6: 轮数设置 - 支持无限制模式 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            {t.roundtable.discussionRounds}
                        </label>
                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="roundsMode"
                                    checked={maxRounds === 999}
                                    onChange={() => setMaxRounds(999)}
                                    className="w-4 h-4 text-purple-500 focus:ring-purple-500"
                                />
                                <span className="text-sm text-gray-600 dark:text-gray-400">{t.roundtable.unlimitedRounds}</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="roundsMode"
                                    checked={maxRounds !== 999}
                                    onChange={() => setMaxRounds(3)}
                                    className="w-4 h-4 text-purple-500 focus:ring-purple-500"
                                />
                                <span className="text-sm text-gray-600 dark:text-gray-400">{t.roundtable.fixedRounds}</span>
                            </label>
                        </div>
                        {maxRounds !== 999 && (
                            <div className="mt-3">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm text-gray-500 dark:text-gray-400">{t.roundtable.maxRounds}: {maxRounds}</span>
                                </div>
                                <input
                                    type="range"
                                    min={1}
                                    max={10}
                                    value={maxRounds}
                                    onChange={(e) => setMaxRounds(Number(e.target.value))}
                                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-[10px] appearance-none cursor-pointer accent-purple-500"
                                />
                                <div className="flex justify-between text-xs text-gray-400 mt-1">
                                    <span>1</span>
                                    <span>10</span>
                                </div>
                            </div>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                            {maxRounds === 999
                                ? `💡 ${t.roundtable.roundsHintUnlimited}`
                                : `💡 ${t.roundtable.roundsHintFixed.replace('{count}', String(maxRounds))}`
                            }
                        </p>
                    </div>

                    {/* 高级选项 */}
                    <div>
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                        >
                            <Settings className="w-4 h-4" />
                            {t.roundtable.advancedOptions}
                            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {showAdvanced && (
                            <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-[10px] space-y-4">
                                {/* 自动总结 */}
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={autoSummarize}
                                        onChange={(e) => setAutoSummarize(e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-300 text-purple-500 focus:ring-purple-500"
                                    />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                        {t.roundtable.autoSummarizeDesc}
                                    </span>
                                </label>

                                {/* 允许互相引用 */}
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={allowCrossReference}
                                        onChange={(e) => setAllowCrossReference(e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-300 text-purple-500 focus:ring-purple-500"
                                    />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                        {t.roundtable.allowCrossReferenceDesc}
                                    </span>
                                </label>

                                {/* 总结者选择 */}
                                {autoSummarize && (
                                    <div>
                                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                                            {t.roundtable.summarizerAgent}
                                        </label>
                                        <select
                                            value={summarizerAgentId}
                                            onChange={(e) => setSummarizerAgentId(e.target.value)}
                                            className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-[10px] text-sm"
                                        >
                                            <option value="">{t.roundtable.useFirstParticipant}</option>
                                            {participants.map(p => {
                                                const agent = agents.find(a => a.id === p.agentId);
                                                return (
                                                    <option key={p.id} value={p.agentId}>
                                                        {p.avatar} {p.role || agent?.name || ''}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* 底部按钮 */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                    >
                        {t.common.cancel}
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={!canCreate}
                        className="px-6 py-2 bg-gradient-to-bl from-[#A688F6] to-[#009BF3] text-white text-sm font-medium rounded-[10px] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {t.roundtable.createDiscussion}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RoundtableSetupModal;
