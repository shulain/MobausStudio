/**
 * Agent 编排工具函数
 *
 * 提供圆桌会议模式的核心工具函数：
 * - 创建圆桌对话
 * - 构建上下文
 * - 解析 @提及
 * - 验证配置
 *
 * @module components/features/AgentOrchestration/utils
 */

import { logger, LogTags } from '../../../utils/logger';
import type {
    Agent,
    RoundtableChat,
    RoundtableConfig,
    RoundtableParticipant,
    RoundtableRules,
    RoundtableMessage,
    RoundtableCreateInput,
} from '../../../types';
import { RoundtableErrorCodes } from '../../../types';

// ==================== 默认配置 ====================

/**
 * 默认圆桌会议规则
 */
const DEFAULT_ROUNDTABLE_RULES: RoundtableRules = {
    maxRounds: 3,
    speakMode: 'sequential',
    autoSummarize: true,
    allowCrossReference: true,
    summarizerAgentId: undefined,
    turnTimeLimit: undefined,
    requireResponse: false,
};

/**
 * 参与者默认颜色列表
 * 用于 UI 区分不同参与者
 */
const PARTICIPANT_COLORS = [
    'purple',
    'blue',
    'green',
    'orange',
    'pink',
    'cyan',
];

/**
 * 参与者默认头像列表
 */
const PARTICIPANT_AVATARS = [
    '🏗️',  // 架构师
    '🔧',  // 工程师
    '📊',  // 分析师
    '🎨',  // 设计师
    '📝',  // 产品经理
    '🔍',  // 审核员
];

// ==================== 创建函数 ====================

/**
 * 创建圆桌会议对话
 *
 * @param input - 创建输入参数
 * @param agents - 可用的 Agent 列表（用于验证）
 * @returns 创建的圆桌对话对象
 * @throws 如果验证失败则抛出错误
 *
 * @example
 * ```typescript
 * const chat = createRoundtableChat({
 *   topic: '如何设计高并发系统？',
 *   participants: [
 *     { agentId: 'agent-1', role: '架构师' },
 *     { agentId: 'agent-2', role: '后端专家' },
 *   ],
 *   rules: { maxRounds: 5 },
 * }, agents);
 * ```
 */
export function createRoundtableChat(
    input: RoundtableCreateInput,
    agents: Agent[]
): RoundtableChat {
    // 验证配置
    const validationError = validateRoundtableConfig(input, agents);
    if (validationError) {
        logger.error(LogTags.CHAT, '圆桌会议配置验证失败', { error: validationError });
        throw new Error(validationError);
    }

    // 构建参与者列表
    const participants: RoundtableParticipant[] = input.participants.map(
        (p, index) => ({
            id: `participant-${Date.now()}-${index}`,
            agentId: p.agentId,
            role: p.role,
            speakOrder: index + 1,
            avatar: p.avatar || PARTICIPANT_AVATARS[index % PARTICIPANT_AVATARS.length],
            color: p.color || PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length],
            messageCount: 0,
            lastSpokeAt: undefined,
        })
    );

    // 合并规则（使用默认值填充未指定的字段）
    const rules: RoundtableRules = {
        ...DEFAULT_ROUNDTABLE_RULES,
        ...input.rules,
    };

    // 如果未指定总结者，使用第一个参与者
    if (!rules.summarizerAgentId && participants.length > 0) {
        rules.summarizerAgentId = participants[0].agentId;
    }

    // 构建圆桌配置
    // v4.1.13: 添加 background 和 constraints 可选字段
    const roundtableConfig: RoundtableConfig = {
        topic: input.topic,
        background: input.background,
        constraints: input.constraints,
        participants,
        rules,
        currentRound: 1,
        status: 'setup',
    };

    // 创建对话对象
    const chatId = `roundtable-${Date.now()}`;
    const now = new Date();

    const chat: RoundtableChat = {
        id: chatId,
        title: `圆桌会议：${input.topic.slice(0, 20)}${input.topic.length > 20 ? '...' : ''}`,
        createdAt: now,
        updatedAt: now,
        starred: false,
        model: '', // 圆桌模式不使用单一模型
        messages: [],
        mode: 'roundtable',
        roundtableConfig,
    };

    logger.info(LogTags.CHAT, '创建圆桌会议', {
        chatId,
        topic: input.topic,
        participantCount: participants.length,
        speakMode: rules.speakMode,
    });

    return chat;
}

// ==================== 上下文构建 ====================

/**
 * 构建圆桌会议上下文
 *
 * 为指定参与者构建系统提示词，包含：
 * - 角色定义
 * - 讨论主题
 * - 其他参与者信息
 * - 之前的讨论内容（如果允许互相引用）
 *
 * @param config - 圆桌配置
 * @param participantId - 当前发言参与者 ID
 * @param messages - 之前的消息列表
 * @param agents - Agent 列表（用于获取 Agent 名称和系统提示词）
 * @returns 构建的系统提示词
 */
export function buildRoundtableContext(
    config: RoundtableConfig,
    participantId: string,
    messages: RoundtableMessage[],
    agents: Agent[]
): string {
    // 找到当前参与者
    const currentParticipant = config.participants.find(p => p.id === participantId);
    if (!currentParticipant) {
        logger.warn(LogTags.CHAT, '未找到参与者', { participantId });
        return '';
    }

    // v4.1.9: 获取当前参与者对应的 Agent，包含其系统提示词
    const currentAgent = agents.find(a => a.id === currentParticipant.agentId);

    // v4.1.12: 构建参与者列表描述（使用角色名，不使用 Agent 名字）
    const participantsList = config.participants
        .map(p => {
            const isCurrent = p.id === participantId;
            return `- ${p.avatar} ${p.role}${isCurrent ? ' ← You / 你' : ''}`;
        })
        .join('\n');

    // v4.1.12: 构建之前的讨论内容（包含用户消息）
    // v4.1.43: 移除工具调用信息的嵌入，改为使用标准 API 格式
    let previousMessages = '';
    if (config.rules.allowCrossReference && messages.length > 0) {
        previousMessages = messages
            // v4.1.43: 过滤掉工具调用消息（content 为空且有 toolCalls 的消息）
            .filter(msg => msg.content || msg.role === 'user')
            .map(msg => {
                // v4.1.12: 处理用户消息（participantId 为空）
                if (msg.role === 'user' || !msg.participantId) {
                    return `【👤 User / 用户】：${msg.content}`;
                }
                const participant = config.participants.find(p => p.id === msg.participantId);
                if (!participant) return '';

                // v4.1.43: 不再嵌入工具调用信息，工具调用将通过标准 API 格式传递
                return `【${participant.avatar} ${participant.role}】：${msg.content}`;
            })
            .filter(Boolean)
            .join('\n\n');
    }

    // v4.1.9: 构建 Agent 原始系统提示词部分
    const agentSystemPrompt = currentAgent?.systemPrompt
        ? `\n## Your Core Capabilities / 你的核心能力和知识\n${currentAgent.systemPrompt}\n`
        : '';

    // v4.1.13: 构建背景信息部分（可选）
    const backgroundSection = config.background
        ? `\n## Background / 背景信息\n${config.background}\n`
        : '';

    // v4.1.13: 构建约束信息部分（可选）
    const constraintsSection = config.constraints
        ? `\n## Constraints / 讨论约束\n${config.constraints}\n`
        : '';

    // 构建系统提示词
    // v4.1.9: 包含 Agent 原始系统提示词，确保 Agent 保持其专业能力
    // v4.1.11: 使用双语提示词，确保模型理解准确，同时支持多语言对话
    // v4.1.12: 圆桌会议改为圆桌会议
    // v4.1.13: 添加背景和约束信息
    const systemPrompt = `You are "${currentParticipant.role}" participating in a roundtable meeting about "${config.topic}".
你是「${currentParticipant.role}」，正在参与一场关于「${config.topic}」的圆桌会议。
${agentSystemPrompt}${backgroundSection}${constraintsSection}
## Discussion Rules / 讨论规则
1. Express your views based on your professional role (${currentParticipant.role}) and core competencies
   基于你的专业角色（${currentParticipant.role}）和核心能力发表观点
2. ${config.rules.allowCrossReference ? 'You may reference or respond to other participants\' views (use their role names) / 可以引用或回应其他参与者的观点（使用他们的角色名）' : 'Express your views independently / 独立发表你的观点'}
3. Keep the discussion constructive and professional / 保持讨论的建设性和专业性
4. Be concise and highlight key points / 回复应当简洁有力，突出重点
5. Output your views and analysis directly, not just thinking process / 直接输出你的观点和分析，不要只输出思考过程
6. Respond in the same language as the discussion topic or previous messages / 使用与讨论主题或之前消息相同的语言回复
7. Pay attention to user messages and respond to their questions / 注意用户的消息并回应他们的问题
${config.constraints ? '8. Strictly follow the constraints above / 严格遵守上述讨论约束\n' : ''}
## Current Participants / 当前参与者
${participantsList}

## Current Round / 当前轮次
Round ${config.currentRound}${config.rules.maxRounds === 999 ? '' : ` / Total ${config.rules.maxRounds} rounds`}
第 ${config.currentRound} 轮${config.rules.maxRounds === 999 ? '' : ` / 共 ${config.rules.maxRounds} 轮`}

${previousMessages ? `## Previous Discussion / 之前的讨论内容\n${previousMessages}` : ''}`;

    return systemPrompt;
}

/**
 * 构建总结上下文
 *
 * 为总结者构建系统提示词
 *
 * @param config - 圆桌配置
 * @param messages - 所有讨论消息
 * @param agents - Agent 列表
 * @returns 总结系统提示词
 */
export function buildSummaryContext(
    config: RoundtableConfig,
    messages: RoundtableMessage[],
    _agents: Agent[]
): string {
    // v4.1.12: 构建讨论内容（包含用户消息，使用角色名）
    const discussionContent = messages
        .map(msg => {
            // 处理用户消息
            if (msg.role === 'user' || !msg.participantId) {
                return `【👤 User / 用户】（Round ${msg.round} / 第 ${msg.round} 轮）：\n${msg.content}`;
            }
            const participant = config.participants.find(p => p.id === msg.participantId);
            if (!participant) return '';
            return `【${participant.avatar} ${participant.role}】（Round ${msg.round} / 第 ${msg.round} 轮）：\n${msg.content}`;
        })
        .filter(Boolean)
        .join('\n\n---\n\n');

    // v4.1.12: 构建参与者列表（使用角色名）
    const participantsList = config.participants
        .map(p => {
            return `- ${p.avatar} ${p.role}：${p.messageCount} messages / 发言 ${p.messageCount} 次`;
        })
        .join('\n');

    // v4.1.13: 构建背景信息部分（可选）
    const backgroundSection = config.background
        ? `\n## Background / 背景信息\n${config.background}\n`
        : '';

    // v4.1.13: 构建约束信息部分（可选）
    const constraintsSection = config.constraints
        ? `\n## Constraints / 讨论约束\n${config.constraints}\n`
        : '';

    // v4.1.12: 使用双语提示词，圆桌会议改为圆桌会议
    // v4.1.13: 添加背景和约束信息
    return `You are a meeting summarizer. Please summarize the following roundtable meeting about "${config.topic}".
你是一位会议总结专家。请对以下关于「${config.topic}」的圆桌会议进行总结。
${backgroundSection}${constraintsSection}
## Participants / 参与者
${participantsList}

## Discussion Content / 讨论内容
${discussionContent}

## Summary Requirements / 总结要求
1. Summarize the main points of each participant / 概括各方的主要观点
2. Identify consensus and disagreements / 指出共识和分歧
3. Extract key conclusions and recommendations / 提炼关键结论和建议
4. Remain objective and neutral / 保持客观中立
5. Use the same language as the discussion content / 使用与讨论内容相同的语言
${config.constraints ? '6. Consider the constraints when making recommendations / 在给出建议时考虑讨论约束\n' : ''}
Please generate a well-structured meeting summary.
请生成一份结构清晰的会议总结。`;
}

// ==================== @提及解析 ====================

/**
 * 解析消息中的 @提及
 *
 * 支持以下格式：
 * - @角色名（如 @架构师）
 * - @Agent名称（如 @Claude）
 *
 * @param content - 消息内容
 * @param participants - 参与者列表
 * @param agents - Agent 列表
 * @returns 被提及的参与者 ID 列表
 *
 * @example
 * ```typescript
 * const mentions = parseMentions('@架构师 你怎么看？', participants, agents);
 * // 返回: ['participant-xxx']
 * ```
 */
export function parseMentions(
    content: string,
    participants: RoundtableParticipant[],
    agents: Agent[]
): string[] {
    const mentionedIds: string[] = [];

    // 匹配 @xxx 格式
    const mentionPattern = /@(\S+)/g;
    let match;

    while ((match = mentionPattern.exec(content)) !== null) {
        const mentionText = match[1];

        // 尝试匹配角色名
        const byRole = participants.find(
            p => p.role.toLowerCase() === mentionText.toLowerCase()
        );
        if (byRole && !mentionedIds.includes(byRole.id)) {
            mentionedIds.push(byRole.id);
            continue;
        }

        // 尝试匹配 Agent 名称
        for (const participant of participants) {
            const agent = agents.find(a => a.id === participant.agentId);
            if (agent && agent.name.toLowerCase() === mentionText.toLowerCase()) {
                if (!mentionedIds.includes(participant.id)) {
                    mentionedIds.push(participant.id);
                }
                break;
            }
        }
    }

    return mentionedIds;
}

// ==================== 验证函数 ====================

/**
 * 验证圆桌会议配置
 *
 * @param input - 创建输入
 * @param agents - 可用的 Agent 列表
 * @returns 错误信息，如果验证通过则返回 null
 */
export function validateRoundtableConfig(
    input: RoundtableCreateInput,
    agents: Agent[]
): string | null {
    // 验证主题
    if (!input.topic || input.topic.trim().length === 0) {
        return `[${RoundtableErrorCodes.MISSING_TOPIC}] 请设置讨论主题`;
    }

    // 验证参与者数量
    if (!input.participants || input.participants.length < 2) {
        return `[${RoundtableErrorCodes.INSUFFICIENT_PARTICIPANTS}] 至少需要 2 个参与者`;
    }

    if (input.participants.length > 6) {
        return `[${RoundtableErrorCodes.TOO_MANY_PARTICIPANTS}] 最多支持 6 个参与者`;
    }

    // 验证每个参与者的 Agent 是否存在
    const agentIds = new Set(agents.map(a => a.id));
    for (const participant of input.participants) {
        if (!agentIds.has(participant.agentId)) {
            return `[${RoundtableErrorCodes.AGENT_NOT_FOUND}] Agent 不存在: ${participant.agentId}`;
        }

        if (!participant.role || participant.role.trim().length === 0) {
            return `请为所有参与者设置角色描述`;
        }
    }

    // 验证总结者（如果指定）
    if (input.rules?.summarizerAgentId) {
        if (!agentIds.has(input.rules.summarizerAgentId)) {
            return `[${RoundtableErrorCodes.SUMMARIZER_NOT_CONFIGURED}] 总结者 Agent 不存在`;
        }
    }

    // 验证最大轮数
    // v4.1.7: 支持无限制模式（999），不再强制 1-10 范围
    if (input.rules?.maxRounds !== undefined) {
        if (input.rules.maxRounds !== 999 && (input.rules.maxRounds < 1 || input.rules.maxRounds > 10)) {
            return '最大讨论轮数应在 1-10 之间';
        }
    }

    return null;
}

/**
 * 检查是否可以继续讨论
 *
 * v4.1.6: 支持无限制轮数模式（maxRounds = 999）
 *
 * @param config - 圆桌配置
 * @returns 是否可以继续
 */
export function canContinueDiscussion(config: RoundtableConfig): boolean {
    if (config.status === 'completed' || config.status === 'summarizing') {
        return false;
    }

    // v4.1.6: 无限制模式（999）始终可以继续
    if (config.rules.maxRounds === 999) {
        return true;
    }

    if (config.currentRound > config.rules.maxRounds) {
        return false;
    }

    return true;
}

/**
 * 获取下一个发言者
 *
 * 根据发言模式和当前状态，确定下一个应该发言的参与者
 *
 * @param config - 圆桌配置
 * @param lastSpeakerId - 上一个发言者 ID（可选）
 * @returns 下一个发言者 ID，如果没有则返回 null
 */
export function getNextSpeaker(
    config: RoundtableConfig,
    lastSpeakerId?: string
): string | null {
    if (config.rules.speakMode === 'free') {
        // 自由模式下不自动指定发言者
        return null;
    }

    // v4.1.10: 移除并行模式，只保留顺序模式
    // 顺序模式
    const sortedParticipants = [...config.participants].sort(
        (a, b) => a.speakOrder - b.speakOrder
    );

    if (!lastSpeakerId) {
        // 没有上一个发言者，返回第一个
        return sortedParticipants[0]?.id || null;
    }

    // 找到上一个发言者的位置
    const lastIndex = sortedParticipants.findIndex(p => p.id === lastSpeakerId);
    if (lastIndex === -1) {
        return sortedParticipants[0]?.id || null;
    }

    // 返回下一个发言者
    const nextIndex = lastIndex + 1;
    if (nextIndex >= sortedParticipants.length) {
        // 本轮结束，返回 null 表示需要进入下一轮
        return null;
    }

    return sortedParticipants[nextIndex]?.id || null;
}
