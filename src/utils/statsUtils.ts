/**
 * 统计工具函数模块
 *
 * 从真实数据计算使用统计信息
 *
 * @module utils/statsUtils
 * @version 3.1.0
 */

import type {
    Chat,
    Message,
    Agent,
    AIModelConfig,
    UsageStats,
    ModelUsage,
    ActivityItem,
    TimeRange,
} from '../types';

/**
 * 模型颜色列表
 * 用于模型使用分布图表的颜色分配
 */
const MODEL_COLORS = [
    'bg-green-500',
    'bg-purple-500',
    'bg-blue-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-cyan-500',
    'bg-yellow-500',
    'bg-red-500',
    'bg-indigo-500',
    'bg-teal-500',
];

/**
 * 获取时间范围的起始时间点
 *
 * @param range - 时间范围类型
 * @returns 该范围的起始时间
 *
 * @example
 * const start = getTimeRangeStart('today');
 * // 返回今天 00:00:00 的 Date 对象
 */
export const getTimeRangeStart = (range: TimeRange): Date => {
    const now = new Date();
    switch (range) {
        case 'today':
            // 今天 00:00:00
            return new Date(now.getFullYear(), now.getMonth(), now.getDate());
        case 'week': {
            // 7 天前
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - 7);
            return weekStart;
        }
        case 'month': {
            // 30 天前
            const monthStart = new Date(now);
            monthStart.setDate(now.getDate() - 30);
            return monthStart;
        }
    }
};

/**
 * 确保日期对象有效
 * 从存储加载的日期可能是字符串，需要转换
 *
 * @param date - 日期值（可能是 Date 对象或字符串）
 * @returns Date 对象
 */
const ensureDate = (date: Date | string): Date => {
    if (date instanceof Date) {
        return date;
    }
    return new Date(date);
};

/**
 * 根据时间范围过滤消息
 *
 * @param chats - 对话列表
 * @param range - 时间范围
 * @returns 过滤后的消息数组（包含所属对话的模型信息）
 */
const filterMessagesByTimeRange = (
    chats: Chat[],
    range: TimeRange
): Array<Message & { chatModel: string }> => {
    const startTime = getTimeRangeStart(range);
    const messages: Array<Message & { chatModel: string }> = [];

    for (const chat of chats) {
        for (const message of chat.messages) {
            const messageTime = ensureDate(message.createdAt);
            if (messageTime >= startTime) {
                messages.push({
                    ...message,
                    chatModel: chat.model,
                });
            }
        }
    }

    return messages;
};

/**
 * 计算单个时间范围的使用统计
 *
 * @param chats - 对话列表
 * @param models - 模型配置列表
 * @param range - 时间范围
 * @returns 使用统计数据
 */
const calculateStatsForRange = (
    chats: Chat[],
    models: AIModelConfig[],
    range: TimeRange
): UsageStats => {
    const messages = filterMessagesByTimeRange(chats, range);

    // 统计消息数量
    const messageCount = messages.length;

    // 统计 Token 使用量和费用
    let totalTokens = 0;
    let totalCost = 0;

    // 按模型分组统计 tokens
    const modelTokens: Record<string, { input: number; output: number }> = {};

    for (const message of messages) {
        const tokens = message.tokens || 0;
        totalTokens += tokens;

        // 按角色区分输入/输出 tokens
        if (!modelTokens[message.chatModel]) {
            modelTokens[message.chatModel] = { input: 0, output: 0 };
        }

        if (message.role === 'user') {
            modelTokens[message.chatModel].input += tokens;
        } else if (message.role === 'assistant') {
            modelTokens[message.chatModel].output += tokens;
        }
    }

    // 计算费用
    for (const [modelId, tokens] of Object.entries(modelTokens)) {
        const model = models.find((m) => m.id === modelId);
        if (model && model.pricing) {
            // 费用计算：tokens / 1000 * 价格（价格单位是每 1K tokens）
            const inputCost = (tokens.input / 1000) * (model.pricing.input || 0);
            const outputCost = (tokens.output / 1000) * (model.pricing.output || 0);
            totalCost += inputCost + outputCost;
        }
    }

    return {
        messages: messageCount,
        tokens: totalTokens,
        cost: totalCost,
    };
};

/**
 * 计算所有时间范围的使用统计
 *
 * @param chats - 对话列表
 * @param models - 模型配置列表
 * @returns 包含 today/week/month 三个时间范围统计的对象
 *
 * @example
 * const stats = calculateAllStats(chats, models);
 * console.log(stats.today.messages); // 今日消息数
 */
export const calculateAllStats = (
    chats: Chat[],
    models: AIModelConfig[]
): Record<TimeRange, UsageStats> => {
    return {
        today: calculateStatsForRange(chats, models, 'today'),
        week: calculateStatsForRange(chats, models, 'week'),
        month: calculateStatsForRange(chats, models, 'month'),
    };
};

/**
 * 计算模型使用分布
 *
 * @param chats - 对话列表
 * @param models - 模型配置列表
 * @param range - 时间范围
 * @returns 模型使用分布数组，按使用量降序排列
 *
 * @example
 * const usage = calculateModelUsage(chats, models, 'week');
 * // [{ model: 'GPT-4', usage: 65, color: 'bg-green-500' }, ...]
 */
export const calculateModelUsage = (
    chats: Chat[],
    models: AIModelConfig[],
    range: TimeRange
): ModelUsage[] => {
    const messages = filterMessagesByTimeRange(chats, range);

    // 统计每个模型的消息数量
    const modelCounts: Record<string, number> = {};
    let totalMessages = 0;

    for (const message of messages) {
        const modelId = message.chatModel;
        modelCounts[modelId] = (modelCounts[modelId] || 0) + 1;
        totalMessages++;
    }

    // 如果没有消息，返回空数组
    if (totalMessages === 0) {
        return [];
    }

    // 转换为 ModelUsage 数组
    const usage: ModelUsage[] = [];
    let colorIndex = 0;

    // 按消息数量降序排列
    const sortedModels = Object.entries(modelCounts).sort(
        ([, a], [, b]) => b - a
    );

    for (const [modelId, count] of sortedModels) {
        // 查找模型名称
        const model = models.find((m) => m.id === modelId);
        const modelName = model?.name || modelId;

        // 计算百分比
        const percentage = Math.round((count / totalMessages) * 100);

        usage.push({
            model: modelName,
            usage: percentage,
            color: MODEL_COLORS[colorIndex % MODEL_COLORS.length],
        });

        colorIndex++;
    }

    return usage;
};

/**
 * 生成最近活动记录
 *
 * @param chats - 对话列表
 * @param agents - Agent 列表
 * @param limit - 返回数量限制（默认 10）
 * @returns 最近活动记录数组，按时间降序排列
 *
 * @example
 * const activities = generateRecentActivity(chats, agents, 5);
 */
export const generateRecentActivity = (
    chats: Chat[],
    agents: Agent[],
    limit: number = 10
): ActivityItem[] => {
    const activities: ActivityItem[] = [];

    // 从对话中提取活动
    for (const chat of chats) {
        // 对话创建活动
        activities.push({
            id: `chat-create-${chat.id}`,
            action: '创建对话',
            details: chat.title,
            time: ensureDate(chat.createdAt),
            type: 'chat',
        });

        // 如果有消息，添加最后一条消息的活动
        if (chat.messages.length > 0) {
            const lastMessage = chat.messages[chat.messages.length - 1];
            if (lastMessage.role === 'user') {
                activities.push({
                    id: `chat-msg-${lastMessage.id}`,
                    action: '发送消息',
                    details: chat.title,
                    time: ensureDate(lastMessage.createdAt),
                    type: 'chat',
                });
            }
        }
    }

    // 从 Agent 中提取活动
    for (const agent of agents) {
        // Agent 最后使用活动
        if (agent.lastUsedAt) {
            activities.push({
                id: `agent-use-${agent.id}`,
                action: '使用 Agent',
                details: agent.name,
                time: ensureDate(agent.lastUsedAt),
                type: 'agent',
            });
        }

        // Agent 更新活动
        activities.push({
            id: `agent-update-${agent.id}`,
            action: '更新 Agent',
            details: agent.name,
            time: ensureDate(agent.updatedAt),
            type: 'agent',
        });
    }

    // 按时间降序排序
    activities.sort((a, b) => {
        const timeA = a.time instanceof Date ? a.time.getTime() : new Date(a.time).getTime();
        const timeB = b.time instanceof Date ? b.time.getTime() : new Date(b.time).getTime();
        return timeB - timeA;
    });

    // 返回限制数量的活动
    return activities.slice(0, limit);
};
