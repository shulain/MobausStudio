/**
 * @file statsUtils.test.ts
 * @description statsUtils 统计工具函数的单元测试
 * 严格对应 docs/modules/stats.md 中的测试用例
 * 包含中文注释和详细的步骤日志
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    getTimeRangeStart,
    calculateAllStats,
    calculateModelUsage,
    generateRecentActivity,
} from '../../utils/statsUtils';
import type { Chat, Agent, AIModelConfig } from '../../types';

describe('statsUtils 统计工具函数', () => {

    beforeEach(() => {
        console.log('\n[测试] 开始执行 statsUtils 测试套件中的新用例...');
    });

    describe('getTimeRangeStart 时间范围计算', () => {

        /**
         * TC-STATS-TIME-001: 今日时间范围
         */
        it('TC-STATS-TIME-001: today 应返回今天 00:00:00', () => {
            console.log('[步骤 1] 调用 getTimeRangeStart("today")');
            const result = getTimeRangeStart('today');

            console.log('[步骤 2] 验证返回的是今天的开始时间');
            const now = new Date();
            const expected = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            expect(result.getFullYear()).toBe(expected.getFullYear());
            expect(result.getMonth()).toBe(expected.getMonth());
            expect(result.getDate()).toBe(expected.getDate());
            expect(result.getHours()).toBe(0);
            expect(result.getMinutes()).toBe(0);
            expect(result.getSeconds()).toBe(0);
        });

        /**
         * TC-STATS-TIME-002: 本周时间范围
         */
        it('TC-STATS-TIME-002: week 应返回 7 天前的时间', () => {
            console.log('[步骤 1] 调用 getTimeRangeStart("week")');
            const result = getTimeRangeStart('week');

            console.log('[步骤 2] 验证返回的是 7 天前');
            const now = new Date();
            const expected = new Date(now);
            expected.setDate(now.getDate() - 7);

            // 允许 1 秒的误差
            const diff = Math.abs(result.getTime() - expected.getTime());
            expect(diff).toBeLessThan(1000);
        });

        /**
         * TC-STATS-TIME-003: 本月时间范围
         */
        it('TC-STATS-TIME-003: month 应返回 30 天前的时间', () => {
            console.log('[步骤 1] 调用 getTimeRangeStart("month")');
            const result = getTimeRangeStart('month');

            console.log('[步骤 2] 验证返回的是 30 天前');
            const now = new Date();
            const expected = new Date(now);
            expected.setDate(now.getDate() - 30);

            // 允许 1 秒的误差
            const diff = Math.abs(result.getTime() - expected.getTime());
            expect(diff).toBeLessThan(1000);
        });
    });

    describe('calculateAllStats 使用统计计算', () => {

        /**
         * TC-STATS-001: 空数据统计
         */
        it('TC-STATS-001: 空数据应返回全 0', () => {
            console.log('[步骤 1] 准备空数据');
            const chats: Chat[] = [];
            const models: AIModelConfig[] = [];

            console.log('[步骤 2] 调用 calculateAllStats');
            const result = calculateAllStats(chats, models);

            console.log('[步骤 3] 验证所有时间范围都返回 0');
            expect(result.today).toEqual({ messages: 0, tokens: 0, cost: 0 });
            expect(result.week).toEqual({ messages: 0, tokens: 0, cost: 0 });
            expect(result.month).toEqual({ messages: 0, tokens: 0, cost: 0 });
        });

        /**
         * TC-STATS-002: 今日统计
         */
        it('TC-STATS-002: 今日有消息应正确统计', () => {
            console.log('[步骤 1] 准备今日消息数据');
            const now = new Date();
            const chats: Chat[] = [{
                id: '1',
                title: '测试对话',
                createdAt: now,
                updatedAt: now,
                starred: false,
                model: 'model-1',
                messages: [
                    { id: 'm1', chatId: '1', role: 'user', content: 'Hello', createdAt: now, tokens: 10 },
                    { id: 'm2', chatId: '1', role: 'assistant', content: 'Hi', createdAt: now, tokens: 20 },
                ],
            }];
            const models: AIModelConfig[] = [{
                id: 'model-1',
                name: 'Test Model',
                provider: 'OpenAI',
                status: 'online',
                apiKeySet: true,
                endpoint: '',
                maxTokens: 4096,
                pricing: { input: 0.01, output: 0.02 },
                createdAt: now,
                updatedAt: now,
            }];

            console.log('[步骤 2] 调用 calculateAllStats');
            const result = calculateAllStats(chats, models);

            console.log('[步骤 3] 验证今日统计');
            expect(result.today.messages).toBe(2);
            expect(result.today.tokens).toBe(30);
            // 费用 = (10/1000 * 0.01) + (20/1000 * 0.02) = 0.0001 + 0.0004 = 0.0005
            expect(result.today.cost).toBeCloseTo(0.0005, 6);
        });

        /**
         * TC-STATS-007: Token 统计
         */
        it('TC-STATS-007: 消息有 tokens 字段应正确累加', () => {
            console.log('[步骤 1] 准备带 tokens 的消息数据');
            const now = new Date();
            const chats: Chat[] = [{
                id: '1',
                title: '测试对话',
                createdAt: now,
                updatedAt: now,
                starred: false,
                model: 'model-1',
                messages: [
                    { id: 'm1', chatId: '1', role: 'user', content: 'A', createdAt: now, tokens: 100 },
                    { id: 'm2', chatId: '1', role: 'assistant', content: 'B', createdAt: now, tokens: 200 },
                    { id: 'm3', chatId: '1', role: 'user', content: 'C', createdAt: now, tokens: 150 },
                ],
            }];
            const models: AIModelConfig[] = [];

            console.log('[步骤 2] 调用 calculateAllStats');
            const result = calculateAllStats(chats, models);

            console.log('[步骤 3] 验证 tokens 累加正确');
            expect(result.today.tokens).toBe(450);
        });

        /**
         * TC-STATS-TOKEN-UNDEFINED: tokens 字段为 undefined 时按 0 计算
         */
        it('tokens 字段为 undefined 时应按 0 计算', () => {
            console.log('[步骤 1] 准备无 tokens 字段的消息数据');
            const now = new Date();
            const chats: Chat[] = [{
                id: '1',
                title: '测试对话',
                createdAt: now,
                updatedAt: now,
                starred: false,
                model: 'model-1',
                messages: [
                    { id: 'm1', chatId: '1', role: 'user', content: 'A', createdAt: now },
                    { id: 'm2', chatId: '1', role: 'assistant', content: 'B', createdAt: now },
                ],
            }];
            const models: AIModelConfig[] = [];

            console.log('[步骤 2] 调用 calculateAllStats');
            const result = calculateAllStats(chats, models);

            console.log('[步骤 3] 验证 tokens 为 0');
            expect(result.today.tokens).toBe(0);
            expect(result.today.messages).toBe(2);
        });

        /**
         * TC-STATS-008: 费用计算
         */
        it('TC-STATS-008: 有 pricing 配置应正确计算费用', () => {
            console.log('[步骤 1] 准备带 pricing 的模型和消息数据');
            const now = new Date();
            const chats: Chat[] = [{
                id: '1',
                title: '测试对话',
                createdAt: now,
                updatedAt: now,
                starred: false,
                model: 'gpt-4',
                messages: [
                    { id: 'm1', chatId: '1', role: 'user', content: 'Hello', createdAt: now, tokens: 1000 },
                    { id: 'm2', chatId: '1', role: 'assistant', content: 'Hi there!', createdAt: now, tokens: 2000 },
                ],
            }];
            const models: AIModelConfig[] = [{
                id: 'gpt-4',
                name: 'GPT-4',
                provider: 'OpenAI',
                status: 'online',
                apiKeySet: true,
                endpoint: '',
                maxTokens: 8192,
                pricing: { input: 0.03, output: 0.06 }, // $0.03/1K input, $0.06/1K output
                createdAt: now,
                updatedAt: now,
            }];

            console.log('[步骤 2] 调用 calculateAllStats');
            const result = calculateAllStats(chats, models);

            console.log('[步骤 3] 验证费用计算');
            // 费用 = (1000/1000 * 0.03) + (2000/1000 * 0.06) = 0.03 + 0.12 = 0.15
            expect(result.today.cost).toBeCloseTo(0.15, 4);
        });

        /**
         * TC-STATS-OLD-MESSAGE: 旧消息不计入今日统计
         */
        it('旧消息不应计入今日统计', () => {
            console.log('[步骤 1] 准备包含旧消息的数据');
            const now = new Date();
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);

            const chats: Chat[] = [{
                id: '1',
                title: '测试对话',
                createdAt: yesterday,
                updatedAt: now,
                starred: false,
                model: 'model-1',
                messages: [
                    { id: 'm1', chatId: '1', role: 'user', content: 'Old', createdAt: yesterday, tokens: 100 },
                    { id: 'm2', chatId: '1', role: 'user', content: 'New', createdAt: now, tokens: 50 },
                ],
            }];
            const models: AIModelConfig[] = [];

            console.log('[步骤 2] 调用 calculateAllStats');
            const result = calculateAllStats(chats, models);

            console.log('[步骤 3] 验证今日只统计今天的消息');
            expect(result.today.messages).toBe(1);
            expect(result.today.tokens).toBe(50);

            console.log('[步骤 4] 验证本周统计包含所有消息');
            expect(result.week.messages).toBe(2);
            expect(result.week.tokens).toBe(150);
        });
    });

    describe('calculateModelUsage 模型使用分布', () => {

        /**
         * TC-STATS-005: 模型分布计算
         */
        it('TC-STATS-005: 多模型使用应正确计算百分比', () => {
            console.log('[步骤 1] 准备多模型消息数据');
            const now = new Date();
            const chats: Chat[] = [
                {
                    id: '1',
                    title: '对话1',
                    createdAt: now,
                    updatedAt: now,
                    starred: false,
                    model: 'gpt-4',
                    messages: [
                        { id: 'm1', chatId: '1', role: 'user', content: 'A', createdAt: now },
                        { id: 'm2', chatId: '1', role: 'assistant', content: 'B', createdAt: now },
                        { id: 'm3', chatId: '1', role: 'user', content: 'C', createdAt: now },
                    ],
                },
                {
                    id: '2',
                    title: '对话2',
                    createdAt: now,
                    updatedAt: now,
                    starred: false,
                    model: 'claude-3',
                    messages: [
                        { id: 'm4', chatId: '2', role: 'user', content: 'D', createdAt: now },
                    ],
                },
            ];
            const models: AIModelConfig[] = [
                {
                    id: 'gpt-4',
                    name: 'GPT-4',
                    provider: 'OpenAI',
                    status: 'online',
                    apiKeySet: true,
                    endpoint: '',
                    maxTokens: 8192,
                    pricing: { input: 0, output: 0 },
                    createdAt: now,
                    updatedAt: now,
                },
                {
                    id: 'claude-3',
                    name: 'Claude 3',
                    provider: 'Anthropic',
                    status: 'online',
                    apiKeySet: true,
                    endpoint: '',
                    maxTokens: 200000,
                    pricing: { input: 0, output: 0 },
                    createdAt: now,
                    updatedAt: now,
                },
            ];

            console.log('[步骤 2] 调用 calculateModelUsage');
            const result = calculateModelUsage(chats, models, 'week');

            console.log('[步骤 3] 验证模型分布');
            expect(result.length).toBe(2);

            // GPT-4: 3/4 = 75%
            const gpt4 = result.find(m => m.model === 'GPT-4');
            expect(gpt4).toBeDefined();
            expect(gpt4!.usage).toBe(75);

            // Claude 3: 1/4 = 25%
            const claude = result.find(m => m.model === 'Claude 3');
            expect(claude).toBeDefined();
            expect(claude!.usage).toBe(25);
        });

        /**
         * TC-STATS-MODEL-EMPTY: 无消息时返回空数组
         */
        it('无消息时应返回空数组', () => {
            console.log('[步骤 1] 准备空数据');
            const chats: Chat[] = [];
            const models: AIModelConfig[] = [];

            console.log('[步骤 2] 调用 calculateModelUsage');
            const result = calculateModelUsage(chats, models, 'week');

            console.log('[步骤 3] 验证返回空数组');
            expect(result).toEqual([]);
        });

        /**
         * TC-STATS-MODEL-COLOR: 模型应分配颜色
         */
        it('模型应分配颜色', () => {
            console.log('[步骤 1] 准备单模型数据');
            const now = new Date();
            const chats: Chat[] = [{
                id: '1',
                title: '对话',
                createdAt: now,
                updatedAt: now,
                starred: false,
                model: 'model-1',
                messages: [
                    { id: 'm1', chatId: '1', role: 'user', content: 'A', createdAt: now },
                ],
            }];
            const models: AIModelConfig[] = [];

            console.log('[步骤 2] 调用 calculateModelUsage');
            const result = calculateModelUsage(chats, models, 'week');

            console.log('[步骤 3] 验证颜色已分配');
            expect(result[0].color).toMatch(/^bg-\w+-500$/);
        });

        /**
         * TC-STATS-MODEL-SORT: 模型应按使用量降序排列
         */
        it('模型应按使用量降序排列', () => {
            console.log('[步骤 1] 准备多模型数据（使用量不同）');
            const now = new Date();
            const chats: Chat[] = [
                {
                    id: '1',
                    title: '对话1',
                    createdAt: now,
                    updatedAt: now,
                    starred: false,
                    model: 'model-a',
                    messages: [{ id: 'm1', chatId: '1', role: 'user', content: 'A', createdAt: now }],
                },
                {
                    id: '2',
                    title: '对话2',
                    createdAt: now,
                    updatedAt: now,
                    starred: false,
                    model: 'model-b',
                    messages: [
                        { id: 'm2', chatId: '2', role: 'user', content: 'B', createdAt: now },
                        { id: 'm3', chatId: '2', role: 'user', content: 'C', createdAt: now },
                        { id: 'm4', chatId: '2', role: 'user', content: 'D', createdAt: now },
                    ],
                },
            ];
            const models: AIModelConfig[] = [];

            console.log('[步骤 2] 调用 calculateModelUsage');
            const result = calculateModelUsage(chats, models, 'week');

            console.log('[步骤 3] 验证按使用量降序排列');
            expect(result[0].model).toBe('model-b'); // 3 条消息
            expect(result[1].model).toBe('model-a'); // 1 条消息
        });
    });

    describe('generateRecentActivity 最近活动', () => {

        /**
         * TC-STATS-006: 最近活动生成
         */
        it('TC-STATS-006: 有对话和 Agent 应按时间排序显示', () => {
            console.log('[步骤 1] 准备对话和 Agent 数据');
            const now = new Date();
            const earlier = new Date(now.getTime() - 3600000); // 1 小时前

            const chats: Chat[] = [{
                id: '1',
                title: '测试对话',
                createdAt: earlier,
                updatedAt: now,
                starred: false,
                model: 'model-1',
                messages: [
                    { id: 'm1', chatId: '1', role: 'user', content: 'Hello', createdAt: now },
                ],
            }];

            const agents: Agent[] = [{
                id: 'a1',
                name: '代码助手',
                description: '帮助编写代码',
                model: 'gpt-4',
                skills: [],
                systemPrompt: '',
                temperature: 0.7,
                maxTokens: 4096,
                status: 'active',
                createdAt: earlier,
                updatedAt: earlier,
                usageCount: 5,
                lastUsedAt: now,
            }];

            console.log('[步骤 2] 调用 generateRecentActivity');
            const result = generateRecentActivity(chats, agents, 10);

            console.log('[步骤 3] 验证活动记录');
            expect(result.length).toBeGreaterThan(0);

            // 验证包含对话活动
            const chatActivity = result.find(a => a.type === 'chat');
            expect(chatActivity).toBeDefined();

            // 验证包含 Agent 活动
            const agentActivity = result.find(a => a.type === 'agent');
            expect(agentActivity).toBeDefined();
        });

        /**
         * TC-STATS-ACTIVITY-EMPTY: 空数据返回空数组
         */
        it('空数据应返回空数组', () => {
            console.log('[步骤 1] 准备空数据');
            const chats: Chat[] = [];
            const agents: Agent[] = [];

            console.log('[步骤 2] 调用 generateRecentActivity');
            const result = generateRecentActivity(chats, agents, 10);

            console.log('[步骤 3] 验证返回空数组');
            expect(result).toEqual([]);
        });

        /**
         * TC-STATS-ACTIVITY-LIMIT: 应遵守数量限制
         */
        it('应遵守数量限制', () => {
            console.log('[步骤 1] 准备多条活动数据');
            const now = new Date();
            const chats: Chat[] = [];

            // 创建 20 个对话
            for (let i = 0; i < 20; i++) {
                chats.push({
                    id: `chat-${i}`,
                    title: `对话 ${i}`,
                    createdAt: new Date(now.getTime() - i * 60000),
                    updatedAt: new Date(now.getTime() - i * 60000),
                    starred: false,
                    model: 'model-1',
                    messages: [],
                });
            }

            const agents: Agent[] = [];

            console.log('[步骤 2] 调用 generateRecentActivity，限制为 5');
            const result = generateRecentActivity(chats, agents, 5);

            console.log('[步骤 3] 验证返回数量不超过限制');
            expect(result.length).toBeLessThanOrEqual(5);
        });

        /**
         * TC-STATS-ACTIVITY-SORT: 应按时间降序排列
         */
        it('应按时间降序排列', () => {
            console.log('[步骤 1] 准备不同时间的活动数据');
            const now = new Date();
            const earlier = new Date(now.getTime() - 3600000);
            const earliest = new Date(now.getTime() - 7200000);

            const chats: Chat[] = [
                {
                    id: '1',
                    title: '最早的对话',
                    createdAt: earliest,
                    updatedAt: earliest,
                    starred: false,
                    model: 'model-1',
                    messages: [],
                },
                {
                    id: '2',
                    title: '最新的对话',
                    createdAt: now,
                    updatedAt: now,
                    starred: false,
                    model: 'model-1',
                    messages: [],
                },
                {
                    id: '3',
                    title: '中间的对话',
                    createdAt: earlier,
                    updatedAt: earlier,
                    starred: false,
                    model: 'model-1',
                    messages: [],
                },
            ];

            const agents: Agent[] = [];

            console.log('[步骤 2] 调用 generateRecentActivity');
            const result = generateRecentActivity(chats, agents, 10);

            console.log('[步骤 3] 验证按时间降序排列');
            // 第一个应该是最新的
            expect(result[0].details).toBe('最新的对话');
        });
    });
});
