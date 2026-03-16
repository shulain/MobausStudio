/**
 * Mock 数据模块
 *
 * 提供开发和演示用的模拟数据
 * 注意：这些数据仅用于 UI 展示，实际数据从持久化存储加载
 *
 * v3.6.1: Google 提供商支持动态模型列表
 *
 * @module data/mockData
 */

import type {
  Chat,
  ModelProvider,
  AppNotification,
  UsageStats,
  ModelUsage,
  ActivityItem,
  TimeRange,
} from '../types';

/**
 * 模型提供商列表
 * 用于模型配置页面的提供商选择
 *
 * v3.6.1: Google 提供商标记为支持动态模型，静态列表仅作为回退
 */
export const mockProviders: ModelProvider[] = [
  {
    id: 'OpenAI',
    name: 'OpenAI',
    icon: '🤖',
    defaultEndpoint: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', maxTokens: 128000 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', maxTokens: 16385 },
    ],
  },
  {
    id: 'Anthropic',
    name: 'Anthropic',
    icon: '🧠',
    defaultEndpoint: 'https://api.anthropic.com',
    models: [
      { id: 'claude-3-opus', name: 'Claude 3 Opus', maxTokens: 200000 },
      { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', maxTokens: 200000 },
      { id: 'claude-3-haiku', name: 'Claude 3 Haiku', maxTokens: 200000 },
    ],
  },
  {
    id: 'Google',
    name: 'Google AI',
    icon: '✨',
    defaultEndpoint: 'https://cloudcode-pa.googleapis.com',
    // v3.6.1: 支持动态模型列表，静态列表仅作为回退
    supportsDynamicModels: true,
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', maxTokens: 65536 },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', maxTokens: 65536 },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', maxTokens: 65536 },
    ],
  },
];

/**
 * 默认对话列表
 * 当存储中没有数据时使用
 */
export const defaultChats: Chat[] = [
  {
    id: '1',
    title: '新对话',
    createdAt: new Date(),
    updatedAt: new Date(),
    starred: false,
    model: 'gpt-4',
    messages: [],
  },
  {
    id: '2',
    title: 'React 开发问题',
    createdAt: new Date(Date.now() - 7200000),
    updatedAt: new Date(Date.now() - 7200000),
    starred: true,
    model: 'claude-3.5',
    messages: [
      {
        id: '1',
        chatId: '2',
        role: 'user',
        content: '请帮我解释 useState 的使用方法',
        createdAt: new Date(),
      },
    ],
  },
  {
    id: '3',
    title: 'Python 数据分析',
    createdAt: new Date(Date.now() - 86400000),
    updatedAt: new Date(Date.now() - 86400000),
    starred: false,
    model: 'gpt-4',
    messages: [],
  },
];

/**
 * 默认通知列表
 * 用于通知面板展示
 */
export const defaultNotifications: AppNotification[] = [
  {
    id: '1',
    type: 'success',
    title: 'Agent 创建成功',
    message: '代码助手已成功创建',
    createdAt: new Date(Date.now() - 120000),
    read: false,
  },
  {
    id: '2',
    type: 'info',
    title: 'MCP 服务器连接',
    message: 'filesystem 服务器已连接',
    createdAt: new Date(Date.now() - 3600000),
    read: false,
  },
  {
    id: '3',
    type: 'warning',
    title: 'Token 使用提醒',
    message: '本月 Token 使用已达80%',
    createdAt: new Date(Date.now() - 10800000),
    read: true,
  },
  {
    id: '4',
    type: 'error',
    title: '连接失败',
    message: 'github 服务器连接失败',
    createdAt: new Date(Date.now() - 86400000),
    read: true,
  },
];

/**
 * 使用统计数据（按时间范围）
 * 用于统计弹窗展示
 */
export const mockStats: Record<TimeRange, UsageStats> = {
  today: { messages: 45, tokens: 12500, cost: 0.25 },
  week: { messages: 234, tokens: 89400, cost: 1.78 },
  month: { messages: 1052, tokens: 428600, cost: 8.57 },
};

/**
 * 模型使用占比
 * 用于统计弹窗的饼图展示
 */
export const mockModelUsage: ModelUsage[] = [
  { model: 'GPT-4', usage: 65, color: 'bg-green-500' },
  { model: 'Claude 3.5', usage: 25, color: 'bg-purple-500' },
  { model: 'Gemini Pro', usage: 10, color: 'bg-blue-500' },
];

/**
 * 最近活动记录
 * 用于统计弹窗的活动列表
 * action 使用类型标识符，在 UI 层根据语言翻译
 */
export const mockActivity: ActivityItem[] = [
  {
    id: '1',
    action: 'createChat',
    details: 'React 开发问题',
    time: new Date(Date.now() - 600000),
    type: 'chat',
  },
  {
    id: '2',
    action: 'enableSkill',
    details: 'Web搜索',
    time: new Date(Date.now() - 3600000),
    type: 'skill',
  },
  {
    id: '3',
    action: 'editAgent',
    details: '代码助手',
    time: new Date(Date.now() - 7200000),
    type: 'agent',
  },
  {
    id: '4',
    action: 'connectMcp',
    details: 'database 服务器',
    time: new Date(Date.now() - 10800000),
    type: 'mcp',
  },
];
