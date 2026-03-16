/**
 * 圆桌会议工具函数单元测试
 *
 * 测试用例与文档 docs/modules/agent-orchestration.md 中的测试用例对应
 *
 * @module test/components/AgentOrchestration/utils.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    createRoundtableChat,
    buildRoundtableContext,
    buildSummaryContext,
    parseMentions,
    validateRoundtableConfig,
    canContinueDiscussion,
    getNextSpeaker,
} from '../../../components/features/AgentOrchestration/utils';
import type {
    Agent,
    RoundtableCreateInput,
    RoundtableConfig,
    RoundtableParticipant,
    RoundtableMessage,
} from '../../../types';

// ==================== 测试数据 ====================

/**
 * 模拟 Agent 数据
 */
const mockAgents: Agent[] = [
    {
        id: 'agent-1',
        name: 'Claude',
        description: '架构专家',
        model: 'claude-3',
        systemPrompt: '',
        temperature: 0.7,
        maxTokens: 4096,
        status: 'active',
        skills: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: 0,
    },
    {
        id: 'agent-2',
        name: 'GPT-4',
        description: '后端专家',
        model: 'gpt-4',
        systemPrompt: '',
        temperature: 0.7,
        maxTokens: 4096,
        status: 'active',
        skills: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: 0,
    },
    {
        id: 'agent-3',
        name: 'Gemini',
        description: 'DBA',
        model: 'gemini-pro',
        systemPrompt: '',
        temperature: 0.7,
        maxTokens: 4096,
        status: 'active',
        skills: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        usageCount: 0,
    },
];

/**
 * 有效的创建输入
 */
const validInput: RoundtableCreateInput = {
    topic: '如何设计一个高并发系统？',
    participants: [
        { agentId: 'agent-1', role: '架构师' },
        { agentId: 'agent-2', role: '后端专家' },
    ],
    rules: {
        maxRounds: 3,
        speakMode: 'sequential',
    },
};

// ==================== 测试用例 ====================

describe('AgentOrchestration Utils', () => {
    // ==================== TC-RT-001: 创建圆桌会议 ====================
    describe('createRoundtableChat - TC-RT-001', () => {
        it('应该成功创建圆桌会议对话', () => {
            const chat = createRoundtableChat(validInput, mockAgents);

            expect(chat).toBeDefined();
            expect(chat.mode).toBe('roundtable');
            expect(chat.roundtableConfig.topic).toBe('如何设计一个高并发系统？');
            expect(chat.roundtableConfig.participants).toHaveLength(2);
            expect(chat.roundtableConfig.status).toBe('setup');
            expect(chat.roundtableConfig.currentRound).toBe(1);
            expect(chat.messages).toHaveLength(0);
        });

        it('应该正确设置参与者信息', () => {
            const chat = createRoundtableChat(validInput, mockAgents);
            const participants = chat.roundtableConfig.participants;

            expect(participants[0].agentId).toBe('agent-1');
            expect(participants[0].role).toBe('架构师');
            expect(participants[0].speakOrder).toBe(1);
            expect(participants[0].messageCount).toBe(0);

            expect(participants[1].agentId).toBe('agent-2');
            expect(participants[1].role).toBe('后端专家');
            expect(participants[1].speakOrder).toBe(2);
        });

        it('应该使用默认规则填充未指定的字段', () => {
            const input: RoundtableCreateInput = {
                topic: '测试主题',
                participants: [
                    { agentId: 'agent-1', role: '角色1' },
                    { agentId: 'agent-2', role: '角色2' },
                ],
                rules: {},
            };

            const chat = createRoundtableChat(input, mockAgents);
            const rules = chat.roundtableConfig.rules;

            expect(rules.maxRounds).toBe(3); // 默认值
            expect(rules.speakMode).toBe('sequential'); // 默认值
            expect(rules.autoSummarize).toBe(true); // 默认值
            expect(rules.allowCrossReference).toBe(true); // 默认值
        });

        it('应该自动设置总结者为第一个参与者', () => {
            const chat = createRoundtableChat(validInput, mockAgents);

            expect(chat.roundtableConfig.rules.summarizerAgentId).toBe('agent-1');
        });
    });

    // ==================== TC-RT-002: 参与者数量校验 ====================
    describe('validateRoundtableConfig - TC-RT-002', () => {
        it('应该拒绝少于 2 个参与者', () => {
            const input: RoundtableCreateInput = {
                topic: '测试',
                participants: [{ agentId: 'agent-1', role: '角色1' }],
                rules: {},
            };

            const error = validateRoundtableConfig(input, mockAgents);

            expect(error).not.toBeNull();
            expect(error).toContain('RT-001');
            expect(error).toContain('至少需要 2 个参与者');
        });

        it('应该拒绝超过 6 个参与者', () => {
            const input: RoundtableCreateInput = {
                topic: '测试',
                participants: [
                    { agentId: 'agent-1', role: '角色1' },
                    { agentId: 'agent-2', role: '角色2' },
                    { agentId: 'agent-1', role: '角色3' },
                    { agentId: 'agent-2', role: '角色4' },
                    { agentId: 'agent-1', role: '角色5' },
                    { agentId: 'agent-2', role: '角色6' },
                    { agentId: 'agent-1', role: '角色7' },
                ],
                rules: {},
            };

            const error = validateRoundtableConfig(input, mockAgents);

            expect(error).not.toBeNull();
            expect(error).toContain('RT-002');
            expect(error).toContain('最多支持 6 个参与者');
        });

        it('应该拒绝空主题', () => {
            const input: RoundtableCreateInput = {
                topic: '',
                participants: [
                    { agentId: 'agent-1', role: '角色1' },
                    { agentId: 'agent-2', role: '角色2' },
                ],
                rules: {},
            };

            const error = validateRoundtableConfig(input, mockAgents);

            expect(error).not.toBeNull();
            expect(error).toContain('RT-003');
        });

        it('应该拒绝不存在的 Agent', () => {
            const input: RoundtableCreateInput = {
                topic: '测试',
                participants: [
                    { agentId: 'non-existent', role: '角色1' },
                    { agentId: 'agent-2', role: '角色2' },
                ],
                rules: {},
            };

            const error = validateRoundtableConfig(input, mockAgents);

            expect(error).not.toBeNull();
            expect(error).toContain('RT-004');
        });

        it('应该通过有效配置的验证', () => {
            const error = validateRoundtableConfig(validInput, mockAgents);

            expect(error).toBeNull();
        });
    });

    // ==================== TC-RT-007: 上下文传递 ====================
    describe('buildRoundtableContext - TC-RT-007', () => {
        let mockConfig: RoundtableConfig;
        let mockParticipants: RoundtableParticipant[];

        beforeEach(() => {
            mockParticipants = [
                {
                    id: 'p1',
                    agentId: 'agent-1',
                    role: '架构师',
                    speakOrder: 1,
                    avatar: '🏗️',
                    messageCount: 1,
                },
                {
                    id: 'p2',
                    agentId: 'agent-2',
                    role: '后端专家',
                    speakOrder: 2,
                    avatar: '🔧',
                    messageCount: 0,
                },
            ];

            mockConfig = {
                topic: '如何设计高并发系统？',
                participants: mockParticipants,
                rules: {
                    maxRounds: 3,
                    speakMode: 'sequential',
                    autoSummarize: true,
                    allowCrossReference: true,
                },
                currentRound: 1,
                status: 'discussing',
            };
        });

        it('应该包含角色信息和讨论主题', () => {
            const context = buildRoundtableContext(mockConfig, 'p1', [], mockAgents);

            expect(context).toContain('架构师');
            expect(context).toContain('如何设计高并发系统？');
        });

        it('应该包含所有参与者列表', () => {
            const context = buildRoundtableContext(mockConfig, 'p1', [], mockAgents);

            expect(context).toContain('架构师');
            expect(context).toContain('后端专家');
            expect(context).toContain('🏗️');
            expect(context).toContain('🔧');
        });

        it('当 allowCrossReference=true 时应该包含之前的讨论内容', () => {
            const messages: RoundtableMessage[] = [
                {
                    id: 'm1',
                    chatId: 'chat1',
                    role: 'assistant',
                    content: '从架构角度来看，我建议使用微服务架构',
                    createdAt: new Date(),
                    participantId: 'p1',
                    round: 1,
                },
            ];

            const context = buildRoundtableContext(mockConfig, 'p2', messages, mockAgents);

            expect(context).toContain('从架构角度来看');
            expect(context).toContain('微服务架构');
        });

        it('当 allowCrossReference=false 时不应该包含之前的讨论内容', () => {
            mockConfig.rules.allowCrossReference = false;

            const messages: RoundtableMessage[] = [
                {
                    id: 'm1',
                    chatId: 'chat1',
                    role: 'assistant',
                    content: '从架构角度来看，我建议使用微服务架构',
                    createdAt: new Date(),
                    participantId: 'p1',
                    round: 1,
                },
            ];

            const context = buildRoundtableContext(mockConfig, 'p2', messages, mockAgents);

            expect(context).not.toContain('从架构角度来看');
        });

        it('应该包含当前轮次信息', () => {
            mockConfig.currentRound = 2;

            const context = buildRoundtableContext(mockConfig, 'p1', [], mockAgents);

            expect(context).toContain('第 2 轮');
            expect(context).toContain('共 3 轮');
        });
    });

    // ==================== TC-RT-005/TC-RT-006: @提及解析 ====================
    describe('parseMentions - TC-RT-005/TC-RT-006', () => {
        const participants: RoundtableParticipant[] = [
            {
                id: 'p1',
                agentId: 'agent-1',
                role: '架构师',
                speakOrder: 1,
                messageCount: 0,
            },
            {
                id: 'p2',
                agentId: 'agent-2',
                role: '后端专家',
                speakOrder: 2,
                messageCount: 0,
            },
        ];

        it('应该正确解析 @角色名', () => {
            const content = '@架构师 你怎么看这个方案？';
            const mentions = parseMentions(content, participants, mockAgents);

            expect(mentions).toHaveLength(1);
            expect(mentions[0]).toBe('p1');
        });

        it('应该正确解析 @Agent名称', () => {
            const content = '@Claude 请分析一下';
            const mentions = parseMentions(content, participants, mockAgents);

            expect(mentions).toHaveLength(1);
            expect(mentions[0]).toBe('p1');
        });

        it('应该解析多个 @提及', () => {
            const content = '@架构师 和 @后端专家 你们觉得呢？';
            const mentions = parseMentions(content, participants, mockAgents);

            expect(mentions).toHaveLength(2);
            expect(mentions).toContain('p1');
            expect(mentions).toContain('p2');
        });

        it('应该忽略不存在的 @提及', () => {
            const content = '@不存在的角色 你好';
            const mentions = parseMentions(content, participants, mockAgents);

            expect(mentions).toHaveLength(0);
        });

        it('应该不重复添加同一个参与者', () => {
            const content = '@架构师 @架构师 重复提及';
            const mentions = parseMentions(content, participants, mockAgents);

            expect(mentions).toHaveLength(1);
        });
    });

    // ==================== TC-RT-008/TC-RT-009: 轮次管理 ====================
    describe('canContinueDiscussion - TC-RT-008/TC-RT-009', () => {
        it('当未达到最大轮数时应该返回 true', () => {
            const config: RoundtableConfig = {
                topic: '测试',
                participants: [],
                rules: { maxRounds: 3, speakMode: 'sequential', autoSummarize: false, allowCrossReference: true },
                currentRound: 2,
                status: 'discussing',
            };

            expect(canContinueDiscussion(config)).toBe(true);
        });

        it('当达到最大轮数时应该返回 false', () => {
            const config: RoundtableConfig = {
                topic: '测试',
                participants: [],
                rules: { maxRounds: 3, speakMode: 'sequential', autoSummarize: false, allowCrossReference: true },
                currentRound: 4,
                status: 'discussing',
            };

            expect(canContinueDiscussion(config)).toBe(false);
        });

        it('当状态为 completed 时应该返回 false', () => {
            const config: RoundtableConfig = {
                topic: '测试',
                participants: [],
                rules: { maxRounds: 3, speakMode: 'sequential', autoSummarize: false, allowCrossReference: true },
                currentRound: 1,
                status: 'completed',
            };

            expect(canContinueDiscussion(config)).toBe(false);
        });

        it('当状态为 summarizing 时应该返回 false', () => {
            const config: RoundtableConfig = {
                topic: '测试',
                participants: [],
                rules: { maxRounds: 3, speakMode: 'sequential', autoSummarize: false, allowCrossReference: true },
                currentRound: 1,
                status: 'summarizing',
            };

            expect(canContinueDiscussion(config)).toBe(false);
        });
    });

    // ==================== TC-RT-003: 顺序发言模式 ====================
    describe('getNextSpeaker - TC-RT-003', () => {
        const participants: RoundtableParticipant[] = [
            { id: 'p1', agentId: 'agent-1', role: '角色1', speakOrder: 1, messageCount: 0 },
            { id: 'p2', agentId: 'agent-2', role: '角色2', speakOrder: 2, messageCount: 0 },
            { id: 'p3', agentId: 'agent-3', role: '角色3', speakOrder: 3, messageCount: 0 },
        ];

        it('顺序模式下应该返回第一个发言者', () => {
            const config: RoundtableConfig = {
                topic: '测试',
                participants,
                rules: { maxRounds: 3, speakMode: 'sequential', autoSummarize: false, allowCrossReference: true },
                currentRound: 1,
                status: 'discussing',
            };

            const next = getNextSpeaker(config);

            expect(next).toBe('p1');
        });

        it('顺序模式下应该返回下一个发言者', () => {
            const config: RoundtableConfig = {
                topic: '测试',
                participants,
                rules: { maxRounds: 3, speakMode: 'sequential', autoSummarize: false, allowCrossReference: true },
                currentRound: 1,
                status: 'discussing',
            };

            const next = getNextSpeaker(config, 'p1');

            expect(next).toBe('p2');
        });

        it('顺序模式下最后一个发言者后应该返回 null', () => {
            const config: RoundtableConfig = {
                topic: '测试',
                participants,
                rules: { maxRounds: 3, speakMode: 'sequential', autoSummarize: false, allowCrossReference: true },
                currentRound: 1,
                status: 'discussing',
            };

            const next = getNextSpeaker(config, 'p3');

            expect(next).toBeNull();
        });

        it('自由模式下应该返回 null', () => {
            const config: RoundtableConfig = {
                topic: '测试',
                participants,
                rules: { maxRounds: 3, speakMode: 'free', autoSummarize: false, allowCrossReference: true },
                currentRound: 1,
                status: 'discussing',
            };

            const next = getNextSpeaker(config);

            expect(next).toBeNull();
        });
    });

    // ==================== TC-RT-018/TC-RT-024: 无限制轮数模式 ====================
    describe('无限制轮数模式 - TC-RT-018/TC-RT-024', () => {
        it('TC-RT-018: 无限制轮数上下文不显示总轮数', () => {
            const mockParticipants: RoundtableParticipant[] = [
                { id: 'p1', agentId: 'agent-1', role: '架构师', speakOrder: 1, avatar: '🏗️', messageCount: 0 },
                { id: 'p2', agentId: 'agent-2', role: '后端专家', speakOrder: 2, avatar: '🔧', messageCount: 0 },
            ];

            const config: RoundtableConfig = {
                topic: '测试主题',
                participants: mockParticipants,
                rules: { maxRounds: 999, speakMode: 'sequential', autoSummarize: true, allowCrossReference: true },
                currentRound: 5,
                status: 'discussing',
            };

            const context = buildRoundtableContext(config, 'p1', [], mockAgents);

            // 应该包含当前轮次
            expect(context).toContain('第 5 轮');
            // 不应该包含"共 999 轮"
            expect(context).not.toContain('共 999 轮');
        });

        it('TC-RT-024: 无限制模式始终可以继续讨论', () => {
            const config: RoundtableConfig = {
                topic: '测试',
                participants: [],
                rules: { maxRounds: 999, speakMode: 'sequential', autoSummarize: false, allowCrossReference: true },
                currentRound: 100, // 即使轮数很大
                status: 'discussing',
            };

            expect(canContinueDiscussion(config)).toBe(true);
        });
    });

    // ==================== TC-RT-019: Agent 系统提示词包含 ====================
    describe('buildRoundtableContext 包含 Agent 系统提示词 - TC-RT-019', () => {
        it('应该包含 Agent 的系统提示词', () => {
            const agentsWithPrompt: Agent[] = [
                {
                    ...mockAgents[0],
                    systemPrompt: '你是一位资深架构师，擅长分布式系统设计。',
                },
                mockAgents[1],
            ];

            const mockParticipants: RoundtableParticipant[] = [
                { id: 'p1', agentId: 'agent-1', role: '架构师', speakOrder: 1, avatar: '🏗️', messageCount: 0 },
                { id: 'p2', agentId: 'agent-2', role: '后端专家', speakOrder: 2, avatar: '🔧', messageCount: 0 },
            ];

            const config: RoundtableConfig = {
                topic: '如何设计高并发系统？',
                participants: mockParticipants,
                rules: { maxRounds: 3, speakMode: 'sequential', autoSummarize: true, allowCrossReference: true },
                currentRound: 1,
                status: 'discussing',
            };

            const context = buildRoundtableContext(config, 'p1', [], agentsWithPrompt);

            // 应该包含 Agent 的系统提示词
            expect(context).toContain('你是一位资深架构师');
            expect(context).toContain('分布式系统设计');
            expect(context).toContain('核心能力和知识');
        });

        it('Agent 没有系统提示词时不应该包含该部分', () => {
            const mockParticipants: RoundtableParticipant[] = [
                { id: 'p1', agentId: 'agent-1', role: '架构师', speakOrder: 1, avatar: '🏗️', messageCount: 0 },
            ];

            const config: RoundtableConfig = {
                topic: '测试主题',
                participants: mockParticipants,
                rules: { maxRounds: 3, speakMode: 'sequential', autoSummarize: true, allowCrossReference: true },
                currentRound: 1,
                status: 'discussing',
            };

            const context = buildRoundtableContext(config, 'p1', [], mockAgents);

            // 不应该包含"核心能力和知识"部分（因为 mockAgents 的 systemPrompt 为空）
            expect(context).not.toContain('核心能力和知识');
        });
    });

    // ==================== TC-RT-029: 总结上下文构建 ====================
    describe('buildSummaryContext - TC-RT-029', () => {
        it('应该包含所有参与者发言和总结要求', () => {
            const mockParticipants: RoundtableParticipant[] = [
                { id: 'p1', agentId: 'agent-1', role: '架构师', speakOrder: 1, avatar: '🏗️', messageCount: 2 },
                { id: 'p2', agentId: 'agent-2', role: '后端专家', speakOrder: 2, avatar: '🔧', messageCount: 2 },
            ];

            const config: RoundtableConfig = {
                topic: '如何设计高并发系统？',
                participants: mockParticipants,
                rules: { maxRounds: 3, speakMode: 'sequential', autoSummarize: true, allowCrossReference: true },
                currentRound: 2,
                status: 'summarizing',
            };

            const messages: RoundtableMessage[] = [
                {
                    id: 'm1',
                    chatId: 'chat1',
                    role: 'assistant',
                    content: '从架构角度，我建议使用微服务架构',
                    createdAt: new Date(),
                    participantId: 'p1',
                    round: 1,
                },
                {
                    id: 'm2',
                    chatId: 'chat1',
                    role: 'assistant',
                    content: '后端方面需要考虑缓存和数据库优化',
                    createdAt: new Date(),
                    participantId: 'p2',
                    round: 1,
                },
            ];

            const context = buildSummaryContext(config, messages, mockAgents);

            // 应该包含讨论主题
            expect(context).toContain('如何设计高并发系统？');
            // 应该包含参与者信息
            expect(context).toContain('架构师');
            expect(context).toContain('后端专家');
            expect(context).toContain('发言 2 次');
            // 应该包含讨论内容
            expect(context).toContain('微服务架构');
            expect(context).toContain('缓存和数据库优化');
            // 应该包含总结要求
            expect(context).toContain('概括各方的主要观点');
            expect(context).toContain('指出共识和分歧');
            expect(context).toContain('提炼关键结论和建议');
        });
    });

    // ==================== TC-RT-030/TC-RT-031/TC-RT-032: 轮数验证 ====================
    describe('validateRoundtableConfig 轮数验证 - TC-RT-030/TC-RT-031/TC-RT-032', () => {
        it('TC-RT-030: 有效范围内的轮数应该通过验证', () => {
            const input: RoundtableCreateInput = {
                topic: '测试主题',
                participants: [
                    { agentId: 'agent-1', role: '角色1' },
                    { agentId: 'agent-2', role: '角色2' },
                ],
                rules: { maxRounds: 5 },
            };

            const error = validateRoundtableConfig(input, mockAgents);

            expect(error).toBeNull();
        });

        it('TC-RT-031: 无限制轮数（999）应该通过验证', () => {
            const input: RoundtableCreateInput = {
                topic: '测试主题',
                participants: [
                    { agentId: 'agent-1', role: '角色1' },
                    { agentId: 'agent-2', role: '角色2' },
                ],
                rules: { maxRounds: 999 },
            };

            const error = validateRoundtableConfig(input, mockAgents);

            expect(error).toBeNull();
        });

        it('TC-RT-032: 超出范围的轮数应该返回错误', () => {
            const input: RoundtableCreateInput = {
                topic: '测试主题',
                participants: [
                    { agentId: 'agent-1', role: '角色1' },
                    { agentId: 'agent-2', role: '角色2' },
                ],
                rules: { maxRounds: 15 },
            };

            const error = validateRoundtableConfig(input, mockAgents);

            expect(error).not.toBeNull();
            expect(error).toContain('1-10');
        });

        it('轮数为 0 应该返回错误', () => {
            const input: RoundtableCreateInput = {
                topic: '测试主题',
                participants: [
                    { agentId: 'agent-1', role: '角色1' },
                    { agentId: 'agent-2', role: '角色2' },
                ],
                rules: { maxRounds: 0 },
            };

            const error = validateRoundtableConfig(input, mockAgents);

            expect(error).not.toBeNull();
            expect(error).toContain('1-10');
        });

        it('轮数为边界值 1 应该通过验证', () => {
            const input: RoundtableCreateInput = {
                topic: '测试主题',
                participants: [
                    { agentId: 'agent-1', role: '角色1' },
                    { agentId: 'agent-2', role: '角色2' },
                ],
                rules: { maxRounds: 1 },
            };

            const error = validateRoundtableConfig(input, mockAgents);

            expect(error).toBeNull();
        });

        it('轮数为边界值 10 应该通过验证', () => {
            const input: RoundtableCreateInput = {
                topic: '测试主题',
                participants: [
                    { agentId: 'agent-1', role: '角色1' },
                    { agentId: 'agent-2', role: '角色2' },
                ],
                rules: { maxRounds: 10 },
            };

            const error = validateRoundtableConfig(input, mockAgents);

            expect(error).toBeNull();
        });
    });

    // ==================== TC-RT-033 ~ TC-RT-038: 背景和约束字段 ====================
    describe('v4.1.13: background 和 constraints 字段', () => {
        const mockParticipants: RoundtableParticipant[] = [
            { id: 'p1', agentId: 'agent-1', role: '架构师', speakOrder: 1, avatar: '🏗️', messageCount: 0 },
            { id: 'p2', agentId: 'agent-2', role: '后端专家', speakOrder: 2, avatar: '🔧', messageCount: 0 },
        ];

        it('TC-RT-033: 上下文应该包含背景信息', () => {
            const config: RoundtableConfig = {
                topic: '如何优化用户注册流程？',
                background: '我们是 B2B SaaS 产品，当前注册转化率 15%',
                participants: mockParticipants,
                rules: { maxRounds: 3, speakMode: 'sequential', autoSummarize: true, allowCrossReference: true },
                currentRound: 1,
                status: 'discussing',
            };

            const context = buildRoundtableContext(config, 'p1', [], mockAgents);

            // 应该包含背景信息部分
            expect(context).toContain('Background');
            expect(context).toContain('背景信息');
            expect(context).toContain('B2B SaaS 产品');
            expect(context).toContain('注册转化率 15%');
        });

        it('TC-RT-034: 上下文应该包含约束信息', () => {
            const config: RoundtableConfig = {
                topic: '如何提升系统性能？',
                constraints: '预算不超过 5 万元，需要在 2 周内完成',
                participants: mockParticipants,
                rules: { maxRounds: 3, speakMode: 'sequential', autoSummarize: true, allowCrossReference: true },
                currentRound: 1,
                status: 'discussing',
            };

            const context = buildRoundtableContext(config, 'p1', [], mockAgents);

            // 应该包含约束信息部分
            expect(context).toContain('Constraints');
            expect(context).toContain('讨论约束');
            expect(context).toContain('5 万元');
            expect(context).toContain('2 周内完成');
            // 应该包含遵守约束的规则
            expect(context).toContain('严格遵守上述讨论约束');
        });

        it('TC-RT-035: 未设置背景时上下文不应包含背景部分', () => {
            const config: RoundtableConfig = {
                topic: '测试主题',
                // background 未设置
                participants: mockParticipants,
                rules: { maxRounds: 3, speakMode: 'sequential', autoSummarize: true, allowCrossReference: true },
                currentRound: 1,
                status: 'discussing',
            };

            const context = buildRoundtableContext(config, 'p1', [], mockAgents);

            // 不应该包含背景信息部分
            expect(context).not.toContain('Background / 背景信息');
        });

        it('TC-RT-036: 未设置约束时上下文不应包含约束部分', () => {
            const config: RoundtableConfig = {
                topic: '测试主题',
                // constraints 未设置
                participants: mockParticipants,
                rules: { maxRounds: 3, speakMode: 'sequential', autoSummarize: true, allowCrossReference: true },
                currentRound: 1,
                status: 'discussing',
            };

            const context = buildRoundtableContext(config, 'p1', [], mockAgents);

            // 不应该包含约束信息部分
            expect(context).not.toContain('Constraints / 讨论约束');
            // 不应该包含遵守约束的规则
            expect(context).not.toContain('严格遵守上述讨论约束');
        });

        it('TC-RT-037: 总结上下文应该包含背景信息', () => {
            const config: RoundtableConfig = {
                topic: '如何优化用户注册流程？',
                background: '我们是 B2B SaaS 产品，当前注册转化率 15%',
                participants: mockParticipants,
                rules: { maxRounds: 3, speakMode: 'sequential', autoSummarize: true, allowCrossReference: true },
                currentRound: 2,
                status: 'summarizing',
            };

            const messages: RoundtableMessage[] = [
                {
                    id: 'm1',
                    chatId: 'chat1',
                    role: 'assistant',
                    content: '建议简化注册步骤',
                    createdAt: new Date(),
                    participantId: 'p1',
                    round: 1,
                },
            ];

            const context = buildSummaryContext(config, messages, mockAgents);

            // 应该包含背景信息
            expect(context).toContain('Background');
            expect(context).toContain('背景信息');
            expect(context).toContain('B2B SaaS 产品');
        });

        it('TC-RT-038: 总结上下文应该包含约束信息', () => {
            const config: RoundtableConfig = {
                topic: '如何提升系统性能？',
                constraints: '预算不超过 5 万元',
                participants: mockParticipants,
                rules: { maxRounds: 3, speakMode: 'sequential', autoSummarize: true, allowCrossReference: true },
                currentRound: 2,
                status: 'summarizing',
            };

            const messages: RoundtableMessage[] = [
                {
                    id: 'm1',
                    chatId: 'chat1',
                    role: 'assistant',
                    content: '建议增加缓存',
                    createdAt: new Date(),
                    participantId: 'p1',
                    round: 1,
                },
            ];

            const context = buildSummaryContext(config, messages, mockAgents);

            // 应该包含约束信息
            expect(context).toContain('Constraints');
            expect(context).toContain('讨论约束');
            expect(context).toContain('5 万元');
            // 应该包含考虑约束的总结要求
            expect(context).toContain('在给出建议时考虑讨论约束');
        });

        it('创建圆桌会议时应该正确传递 background 和 constraints', () => {
            const input: RoundtableCreateInput = {
                topic: '测试主题',
                background: '这是背景信息',
                constraints: '这是约束条件',
                participants: [
                    { agentId: 'agent-1', role: '角色1' },
                    { agentId: 'agent-2', role: '角色2' },
                ],
                rules: { maxRounds: 3 },
            };

            const chat = createRoundtableChat(input, mockAgents);

            expect(chat.roundtableConfig.background).toBe('这是背景信息');
            expect(chat.roundtableConfig.constraints).toBe('这是约束条件');
        });

        it('创建圆桌会议时 background 和 constraints 为空应该正常工作', () => {
            const input: RoundtableCreateInput = {
                topic: '测试主题',
                // background 和 constraints 未设置
                participants: [
                    { agentId: 'agent-1', role: '角色1' },
                    { agentId: 'agent-2', role: '角色2' },
                ],
                rules: { maxRounds: 3 },
            };

            const chat = createRoundtableChat(input, mockAgents);

            expect(chat.roundtableConfig.background).toBeUndefined();
            expect(chat.roundtableConfig.constraints).toBeUndefined();
        });
    });
});
