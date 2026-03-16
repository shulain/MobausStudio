/**
 * 内置 AI 提供商配置
 *
 * 定义所有支持的 AI 服务提供商及其模型信息
 *
 * v3.4.8: 优化 Vertex AI 和 Custom 提供商配置
 * v3.4.10: 添加 website 字段，用于获取 API Key 链接
 * v0.7.2: 添加 Kiro（AWS Builder ID OAuth）和通义千问提供商
 *
 * @module data/providers
 * @version 0.7.2
 */

import type { AIProvider } from '../types';

/**
 * 热门提供商 ID 列表
 * 用于在 UI 中优先显示
 */
export const popularProviderIds = [
    'openai',
    'anthropic',
    'google',
    'deepseek',
    'qwen',
    'github-copilot',
    'kiro',
    'openrouter',
];

/**
 * 内置提供商配置列表
 * 包含 15+ 主流 AI 服务提供商
 */
export const builtinProviders: AIProvider[] = [
    // ==================== 热门提供商 ====================
    {
        id: 'openai',
        name: 'OpenAI',
        icon: '🤖',
        description: { zh: 'GPT-4、GPT-3.5 等模型的官方 API', en: 'Official API for GPT-4, GPT-3.5 and other models' },
        note: { zh: '支持 ChatGPT Plus/Pro 订阅', en: 'Includes ChatGPT Plus/Pro' },
        website: 'https://platform.openai.com/api-keys',
        defaultEndpoint: 'https://api.openai.com/v1',
        envKeys: ['OPENAI_API_KEY'],
        authMethods: [
            { type: 'oauth', label: 'ChatGPT Plus/Pro', description: '使用 ChatGPT 订阅账号授权' },
            { type: 'api', label: '手动输入 API Key', description: '从 platform.openai.com 获取' },
        ],
        models: [
            // ===== 免费/低成本模型（推荐）=====
            { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano ⭐最便宜', maxTokens: 32768, contextWindow: 1047576, capabilities: { vision: true, functionCalling: true, streaming: true } },
            { id: 'gpt-5-nano', name: 'GPT-5 Nano ⭐超低成本', maxTokens: 128000, contextWindow: 400000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini ⭐推荐', maxTokens: 16384, contextWindow: 128000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', maxTokens: 32768, contextWindow: 1047576, capabilities: { vision: true, functionCalling: true, streaming: true } },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', maxTokens: 4096, contextWindow: 16385, capabilities: { functionCalling: true, streaming: true } },
            // ===== 标准模型 =====
            { id: 'gpt-4o', name: 'GPT-4o', maxTokens: 16384, contextWindow: 128000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            { id: 'gpt-4o-2024-11-20', name: 'GPT-4o (2024-11-20)', maxTokens: 16384, contextWindow: 128000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', maxTokens: 4096, contextWindow: 128000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            { id: 'gpt-4', name: 'GPT-4', maxTokens: 8192, contextWindow: 8192, capabilities: { functionCalling: true, streaming: true } },
            // ===== GPT-5 系列 =====
            { id: 'gpt-5.1', name: 'GPT-5.1', maxTokens: 128000, contextWindow: 400000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', maxTokens: 128000, contextWindow: 400000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini', maxTokens: 128000, contextWindow: 400000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            // ===== o1/o3 推理模型 =====
            { id: 'o1', name: 'o1', maxTokens: 100000, contextWindow: 200000, capabilities: { streaming: true } },
            { id: 'o1-mini', name: 'o1 Mini', maxTokens: 65536, contextWindow: 128000, capabilities: { streaming: true } },
            { id: 'o1-preview', name: 'o1 Preview', maxTokens: 32768, contextWindow: 128000, capabilities: { streaming: true } },
            { id: 'o3-mini', name: 'o3 Mini', maxTokens: 100000, contextWindow: 200000, capabilities: { functionCalling: true, streaming: true } },
        ],
        status: 'disconnected',
        popular: true,
        category: 'popular',
    },
    {
        id: 'anthropic',
        name: 'Anthropic',
        icon: '🧠',
        description: { zh: 'Claude 系列模型的官方 API', en: 'Official API for Claude series models' },
        note: { zh: '支持 Claude Max 订阅', en: 'Includes Claude Max' },
        website: 'https://console.anthropic.com/settings/keys',
        defaultEndpoint: 'https://api.anthropic.com',
        envKeys: ['ANTHROPIC_API_KEY'],
        authMethods: [
            { type: 'oauth', label: 'Claude Pro/Max', description: '使用 Claude 订阅账号授权' },
            { type: 'oauth', label: '创建 API Key', description: '通过浏览器授权自动创建 API Key' },
            { type: 'api', label: '手动输入 API Key', description: '从 console.anthropic.com 获取' },
        ],
        models: [
            // ===== Claude 4.6 系列（最新）=====
            // 注意：models.dev 使用连字符 ID（claude-opus-4-6），Anthropic API 使用日期 ID（claude-opus-4-20260205）
            // 应用会从 models.dev 动态获取最新模型列表，这里的配置作为 fallback
            // 上下文窗口：基础 200K，Beta 扩展 1M（需要 context-1m-2025-08-07 header，超过 200K 部分额外付费）
            { id: 'claude-opus-4-6', name: 'Claude Opus 4.6 ⭐最强', maxTokens: 128000, contextWindow: 200000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 ⭐推荐', maxTokens: 64000, contextWindow: 200000, capabilities: { vision: true, functionCalling: true, streaming: true } },

            // ===== Claude 4.5 系列 =====
            { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', maxTokens: 64000, contextWindow: 200000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', maxTokens: 64000, contextWindow: 200000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', maxTokens: 64000, contextWindow: 200000, capabilities: { vision: true, functionCalling: true, streaming: true } },

            // ===== Claude 4.1 系列 =====
            { id: 'claude-opus-4-1', name: 'Claude Opus 4.1', maxTokens: 32000, contextWindow: 200000, capabilities: { vision: true, functionCalling: true, streaming: true } },

            // ===== Claude 4 系列 =====
            { id: 'claude-opus-4-0', name: 'Claude Opus 4', maxTokens: 32000, contextWindow: 200000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            { id: 'claude-sonnet-4-0', name: 'Claude Sonnet 4', maxTokens: 64000, contextWindow: 200000, capabilities: { vision: true, functionCalling: true, streaming: true } },

            // ===== Claude 3.7 系列（已废弃 2026-02-19）=====
            // { id: 'claude-3.7-sonnet', name: 'Claude 3.7 Sonnet (已废弃)', maxTokens: 8192, contextWindow: 200000, capabilities: { vision: true, functionCalling: true, streaming: true } },

            // ===== Claude 3.5 系列（已废弃 2025-10-28）=====
            // { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (已废弃)', maxTokens: 8192, contextWindow: 200000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            // { id: 'claude-3.5-haiku', name: 'Claude 3.5 Haiku (已废弃)', maxTokens: 8192, contextWindow: 200000, capabilities: { vision: true, functionCalling: true, streaming: true } },

            // ===== Claude 3 系列（已废弃）=====
            // { id: 'claude-3-opus', name: 'Claude 3 Opus (已废弃 2026-01-05)', maxTokens: 4096, contextWindow: 200000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            // { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet (已废弃 2025-07-21)', maxTokens: 4096, contextWindow: 200000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            // { id: 'claude-3-haiku', name: 'Claude 3 Haiku (将废弃 2026-04-19)', maxTokens: 4096, contextWindow: 200000, capabilities: { vision: true, functionCalling: true, streaming: true } },
        ],
        status: 'disconnected',
        popular: true,
        category: 'popular',
    },
    {
        id: 'google',
        name: 'Google AI',
        icon: '✨',
        description: { zh: 'Gemini 系列模型的官方 API', en: 'Official API for Gemini series models' },
        note: { zh: '支持 OAuth 登录', en: 'OAuth login supported' },
        website: 'https://aistudio.google.com/app/apikey',
        defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
        envKeys: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
        authMethods: [
            { type: 'oauth', label: 'Google 账号登录', description: '使用 Google 账号授权访问 Gemini API' },
            { type: 'api', label: '手动输入 API Key', description: '从 aistudio.google.com 获取' },
        ],
        models: [
            { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', maxTokens: 8192, contextWindow: 1000000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', maxTokens: 8192, contextWindow: 2000000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', maxTokens: 8192, contextWindow: 1000000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            { id: 'gemini-pro', name: 'Gemini Pro', maxTokens: 8192, contextWindow: 32000, capabilities: { functionCalling: true, streaming: true } },
        ],
        status: 'disconnected',
        popular: true,
        category: 'popular',
    },
    {
        id: 'deepseek',
        name: 'DeepSeek',
        icon: '🔍',
        description: { zh: 'DeepSeek 系列模型，支持深度推理', en: 'DeepSeek series models with deep reasoning' },
        note: { zh: '性价比极高', en: 'Very cost-effective' },
        website: 'https://platform.deepseek.com/api_keys',
        defaultEndpoint: 'https://api.deepseek.com/v1',
        envKeys: ['DEEPSEEK_API_KEY'],
        authMethods: [
            { type: 'api', label: 'API Key', description: '从 platform.deepseek.com 获取' },
        ],
        models: [
            { id: 'deepseek-chat', name: 'DeepSeek Chat', maxTokens: 8192, contextWindow: 64000, capabilities: { functionCalling: true, streaming: true } },
            { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', maxTokens: 8192, contextWindow: 64000, capabilities: { streaming: true } },
        ],
        status: 'disconnected',
        popular: true,
        category: 'popular',
    },
    {
        id: 'qwen',
        name: '通义千问',
        icon: '🌟',
        description: { zh: '阿里云通义千问系列模型', en: 'Alibaba Cloud Qwen series models' },
        note: { zh: '阿里云百炼平台', en: 'Alibaba DashScope' },
        website: 'https://dashscope.console.aliyun.com/apiKey',
        defaultEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        envKeys: ['DASHSCOPE_API_KEY', 'QWEN_API_KEY'],
        authMethods: [
            { type: 'api', label: 'API Key', description: '从阿里云百炼平台获取' },
        ],
        models: [
            { id: 'qwen-max', name: 'Qwen Max', maxTokens: 8192, contextWindow: 32000, capabilities: { functionCalling: true, streaming: true } },
            { id: 'qwen-plus', name: 'Qwen Plus', maxTokens: 8192, contextWindow: 131072, capabilities: { functionCalling: true, streaming: true } },
            { id: 'qwen-turbo', name: 'Qwen Turbo', maxTokens: 8192, contextWindow: 131072, capabilities: { functionCalling: true, streaming: true } },
            { id: 'qwen-long', name: 'Qwen Long', maxTokens: 8192, contextWindow: 1000000, capabilities: { streaming: true } },
            { id: 'qwen2.5-72b-instruct', name: 'Qwen 2.5 72B', maxTokens: 8192, contextWindow: 131072, capabilities: { functionCalling: true, streaming: true } },
            { id: 'qwen2.5-32b-instruct', name: 'Qwen 2.5 32B', maxTokens: 8192, contextWindow: 131072, capabilities: { functionCalling: true, streaming: true } },
            { id: 'qwen2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B', maxTokens: 8192, contextWindow: 131072, capabilities: { functionCalling: true, streaming: true } },
        ],
        status: 'disconnected',
        popular: true,
        category: 'popular',
    },
    {
        id: 'github-copilot',
        name: 'GitHub Copilot',
        icon: '🐙',
        description: { zh: '使用 GitHub Copilot 订阅访问多种模型', en: 'Access multiple models with GitHub Copilot subscription' },
        note: { zh: '需要 Copilot 订阅', en: 'Requires Copilot subscription' },
        website: 'https://github.com/settings/copilot',
        defaultEndpoint: 'https://api.githubcopilot.com',
        authMethods: [
            { type: 'oauth', label: 'GitHub 登录', description: '使用 GitHub 账号授权' },
        ],
        models: [
            { id: 'gpt-4o', name: 'GPT-4o (Copilot)', maxTokens: 16384, contextWindow: 128000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (Copilot)', maxTokens: 8192, contextWindow: 200000, capabilities: { vision: true, functionCalling: true, streaming: true } },
        ],
        status: 'disconnected',
        popular: true,
        category: 'popular',
    },
    {
        id: 'kiro',
        name: 'Kiro',
        icon: '🦊',
        description: { zh: 'AWS AI 编程助手，支持多种模型', en: 'AWS AI coding assistant with multiple models' },
        note: { zh: '支持 Google/GitHub/AWS Builder ID/IDC 登录', en: 'Support Google/GitHub/AWS Builder ID/IDC login' },
        website: 'https://kiro.dev',
        defaultEndpoint: 'https://kiro.api.amazoncodewhisperer.com',
        authMethods: [
            { type: 'oauth', label: 'Google', description: '使用 Google 账号登录（推荐）' },
            { type: 'oauth', label: 'GitHub', description: '使用 GitHub 账号登录' },
            { type: 'oauth', label: 'AWS Builder ID', description: '使用 AWS Builder ID 登录（个人账号）' },
            { type: 'oauth', label: 'AWS Identity Center (IDC)', description: '使用组织 SSO 登录（企业账号）' },
        ],
        models: [
            { id: 'claude-sonnet-4', name: 'Claude Sonnet 4 (Kiro)', maxTokens: 16384, contextWindow: 200000, capabilities: { vision: true, functionCalling: true, streaming: true } },
            { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (Kiro)', maxTokens: 8192, contextWindow: 200000, capabilities: { vision: true, functionCalling: true, streaming: true } },
        ],
        status: 'disconnected',
        popular: true,
        category: 'popular',
    },
    {
        id: 'openrouter',
        name: 'OpenRouter',
        icon: '🌐',
        description: { zh: '统一 API 访问多种模型', en: 'Unified API access to multiple models' },
        note: { zh: '一个 Key 用所有模型', en: 'One key for all models' },
        website: 'https://openrouter.ai/keys',
        defaultEndpoint: 'https://openrouter.ai/api/v1',
        envKeys: ['OPENROUTER_API_KEY'],
        authMethods: [
            { type: 'api', label: 'API Key', description: '从 openrouter.ai 获取' },
        ],
        models: [
            { id: 'openai/gpt-4o', name: 'GPT-4o', maxTokens: 16384, contextWindow: 128000 },
            { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', maxTokens: 8192, contextWindow: 200000 },
            { id: 'google/gemini-pro-1.5', name: 'Gemini 1.5 Pro', maxTokens: 8192, contextWindow: 2000000 },
            { id: 'meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', maxTokens: 4096, contextWindow: 128000 },
        ],
        status: 'disconnected',
        popular: true,
        category: 'popular',
    },

    // ==================== 扩展提供商 ====================
    {
        id: 'groq',
        name: 'Groq',
        icon: '⚡',
        description: { zh: '超快速推理，支持 Llama、Mixtral 等开源模型', en: 'Ultra-fast inference, supports Llama, Mixtral and other open-source models' },
        website: 'https://console.groq.com/keys',
        defaultEndpoint: 'https://api.groq.com/openai/v1',
        envKeys: ['GROQ_API_KEY'],
        authMethods: [
            { type: 'api', label: 'API Key', description: '从 console.groq.com 获取' },
        ],
        models: [
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', maxTokens: 32768, contextWindow: 128000, capabilities: { functionCalling: true, streaming: true } },
            { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', maxTokens: 8192, contextWindow: 128000, capabilities: { functionCalling: true, streaming: true } },
            { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', maxTokens: 32768, contextWindow: 32768, capabilities: { functionCalling: true, streaming: true } },
            { id: 'gemma2-9b-it', name: 'Gemma 2 9B', maxTokens: 8192, contextWindow: 8192, capabilities: { streaming: true } },
        ],
        status: 'disconnected',
        category: 'other',
    },
    {
        id: 'xai',
        name: 'xAI',
        icon: '🚀',
        description: { zh: 'Grok 系列模型', en: 'Grok series models' },
        website: 'https://console.x.ai/team/default/api-keys',
        defaultEndpoint: 'https://api.x.ai/v1',
        envKeys: ['XAI_API_KEY'],
        authMethods: [
            { type: 'api', label: 'API Key', description: '从 console.x.ai 获取' },
        ],
        models: [
            { id: 'grok-beta', name: 'Grok Beta', maxTokens: 4096, contextWindow: 131072, capabilities: { functionCalling: true, streaming: true } },
            { id: 'grok-2-1212', name: 'Grok 2', maxTokens: 4096, contextWindow: 131072, capabilities: { functionCalling: true, streaming: true } },
        ],
        status: 'disconnected',
        category: 'other',
    },
    {
        id: 'mistral',
        name: 'Mistral AI',
        icon: '🌪️',
        description: { zh: 'Mistral 系列开源模型', en: 'Mistral series open-source models' },
        website: 'https://console.mistral.ai/api-keys',
        defaultEndpoint: 'https://api.mistral.ai/v1',
        envKeys: ['MISTRAL_API_KEY'],
        authMethods: [
            { type: 'api', label: 'API Key', description: '从 console.mistral.ai 获取' },
        ],
        models: [
            { id: 'mistral-large-latest', name: 'Mistral Large', maxTokens: 8192, contextWindow: 128000, capabilities: { functionCalling: true, streaming: true } },
            { id: 'mistral-medium-latest', name: 'Mistral Medium', maxTokens: 8192, contextWindow: 32000, capabilities: { functionCalling: true, streaming: true } },
            { id: 'mistral-small-latest', name: 'Mistral Small', maxTokens: 8192, contextWindow: 32000, capabilities: { functionCalling: true, streaming: true } },
            { id: 'codestral-latest', name: 'Codestral', maxTokens: 8192, contextWindow: 32000, capabilities: { streaming: true } },
        ],
        status: 'disconnected',
        category: 'other',
    },
    {
        id: 'cohere',
        name: 'Cohere',
        icon: '🔷',
        description: { zh: 'Command 系列模型，擅长企业应用', en: 'Command series models, specialized for enterprise applications' },
        website: 'https://dashboard.cohere.com/api-keys',
        defaultEndpoint: 'https://api.cohere.ai/v1',
        envKeys: ['COHERE_API_KEY'],
        authMethods: [
            { type: 'api', label: 'API Key', description: '从 dashboard.cohere.com 获取' },
        ],
        models: [
            { id: 'command-r-plus', name: 'Command R+', maxTokens: 4096, contextWindow: 128000, capabilities: { functionCalling: true, streaming: true } },
            { id: 'command-r', name: 'Command R', maxTokens: 4096, contextWindow: 128000, capabilities: { functionCalling: true, streaming: true } },
            { id: 'command', name: 'Command', maxTokens: 4096, contextWindow: 4096, capabilities: { streaming: true } },
        ],
        status: 'disconnected',
        category: 'other',
    },
    {
        id: 'together',
        name: 'Together AI',
        icon: '🤝',
        description: { zh: '开源模型托管平台', en: 'Open-source model hosting platform' },
        website: 'https://api.together.ai/settings/api-keys',
        defaultEndpoint: 'https://api.together.xyz/v1',
        envKeys: ['TOGETHER_API_KEY'],
        authMethods: [
            { type: 'api', label: 'API Key', description: '从 api.together.ai 获取' },
        ],
        models: [
            { id: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo', name: 'Llama 3.1 405B', maxTokens: 4096, contextWindow: 128000, capabilities: { streaming: true } },
            { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', name: 'Llama 3.1 70B', maxTokens: 4096, contextWindow: 128000, capabilities: { streaming: true } },
            { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 72B', maxTokens: 4096, contextWindow: 32768, capabilities: { streaming: true } },
        ],
        status: 'disconnected',
        category: 'other',
    },
    {
        id: 'fireworks',
        name: 'Fireworks AI',
        icon: '🎆',
        description: { zh: '高性能模型推理平台', en: 'High-performance model inference platform' },
        website: 'https://fireworks.ai/account/api-keys',
        defaultEndpoint: 'https://api.fireworks.ai/inference/v1',
        envKeys: ['FIREWORKS_API_KEY'],
        authMethods: [
            { type: 'api', label: 'API Key', description: '从 fireworks.ai 获取' },
        ],
        models: [
            { id: 'accounts/fireworks/models/llama-v3p1-405b-instruct', name: 'Llama 3.1 405B', maxTokens: 4096, contextWindow: 128000, capabilities: { streaming: true } },
            { id: 'accounts/fireworks/models/llama-v3p1-70b-instruct', name: 'Llama 3.1 70B', maxTokens: 4096, contextWindow: 128000, capabilities: { streaming: true } },
            { id: 'accounts/fireworks/models/mixtral-8x22b-instruct', name: 'Mixtral 8x22B', maxTokens: 4096, contextWindow: 65536, capabilities: { streaming: true } },
        ],
        status: 'disconnected',
        category: 'other',
    },
    {
        id: 'perplexity',
        name: 'Perplexity',
        icon: '🔮',
        description: { zh: '联网搜索增强的 AI 模型', en: 'AI models enhanced with web search' },
        website: 'https://www.perplexity.ai/settings/api',
        defaultEndpoint: 'https://api.perplexity.ai',
        envKeys: ['PERPLEXITY_API_KEY'],
        authMethods: [
            { type: 'api', label: 'API Key', description: '从 perplexity.ai 获取' },
        ],
        models: [
            { id: 'llama-3.1-sonar-large-128k-online', name: 'Sonar Large (Online)', maxTokens: 4096, contextWindow: 128000, capabilities: { streaming: true } },
            { id: 'llama-3.1-sonar-small-128k-online', name: 'Sonar Small (Online)', maxTokens: 4096, contextWindow: 128000, capabilities: { streaming: true } },
            { id: 'llama-3.1-sonar-large-128k-chat', name: 'Sonar Large (Chat)', maxTokens: 4096, contextWindow: 128000, capabilities: { streaming: true } },
        ],
        status: 'disconnected',
        category: 'other',
    },
    {
        id: 'cerebras',
        name: 'Cerebras',
        icon: '🧩',
        description: { zh: '超快速推理，专用 AI 芯片', en: 'Ultra-fast inference with dedicated AI chips' },
        website: 'https://cloud.cerebras.ai/platform',
        defaultEndpoint: 'https://api.cerebras.ai/v1',
        envKeys: ['CEREBRAS_API_KEY'],
        authMethods: [
            { type: 'api', label: 'API Key', description: '从 inference.cerebras.ai 获取' },
        ],
        models: [
            { id: 'llama3.1-70b', name: 'Llama 3.1 70B', maxTokens: 8192, contextWindow: 128000, capabilities: { streaming: true } },
            { id: 'llama3.1-8b', name: 'Llama 3.1 8B', maxTokens: 8192, contextWindow: 128000, capabilities: { streaming: true } },
        ],
        status: 'disconnected',
        category: 'other',
    },

    // ==================== 企业/云服务提供商 ====================
    {
        id: 'azure',
        name: 'Azure OpenAI',
        icon: '☁️',
        description: { zh: '微软 Azure 托管的 OpenAI 模型', en: 'OpenAI models hosted on Microsoft Azure' },
        website: 'https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/~/OpenAI',
        defaultEndpoint: 'https://{resource}.openai.azure.com/openai/deployments/{deployment}',
        envKeys: ['AZURE_OPENAI_API_KEY', 'AZURE_RESOURCE_NAME'],
        authMethods: [
            { type: 'api', label: 'API Key', description: '从 Azure Portal 获取' },
            { type: 'env', label: '环境变量', description: '设置 AZURE_OPENAI_API_KEY 和 AZURE_RESOURCE_NAME' },
        ],
        models: [
            { id: 'gpt-4o', name: 'GPT-4o (Azure)', maxTokens: 16384, contextWindow: 128000 },
            { id: 'gpt-4', name: 'GPT-4 (Azure)', maxTokens: 8192, contextWindow: 8192 },
            { id: 'gpt-35-turbo', name: 'GPT-3.5 Turbo (Azure)', maxTokens: 4096, contextWindow: 16385 },
        ],
        status: 'disconnected',
        category: 'cloud',
    },
    {
        id: 'bedrock',
        name: 'AWS Bedrock',
        icon: '🏔️',
        description: { zh: 'AWS 托管的多种 AI 模型', en: 'Multiple AI models hosted on AWS' },
        website: 'https://console.aws.amazon.com/bedrock',
        defaultEndpoint: 'https://bedrock-runtime.{region}.amazonaws.com',
        envKeys: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
        authMethods: [
            { type: 'env', label: '环境变量', description: '设置 AWS_ACCESS_KEY_ID、AWS_SECRET_ACCESS_KEY、AWS_REGION' },
        ],
        models: [
            { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude 3.5 Sonnet (Bedrock)', maxTokens: 8192, contextWindow: 200000 },
            { id: 'anthropic.claude-3-opus-20240229-v1:0', name: 'Claude 3 Opus (Bedrock)', maxTokens: 4096, contextWindow: 200000 },
            { id: 'meta.llama3-1-405b-instruct-v1:0', name: 'Llama 3.1 405B (Bedrock)', maxTokens: 4096, contextWindow: 128000 },
        ],
        status: 'disconnected',
        category: 'cloud',
    },
    {
        id: 'vertex',
        name: 'Google Vertex AI',
        icon: '🔺',
        description: { zh: 'Google Cloud 托管的 AI 模型', en: 'AI models hosted on Google Cloud' },
        note: { zh: '企业级 AI 平台', en: 'Enterprise AI platform' },
        website: 'https://console.cloud.google.com/vertex-ai',
        defaultEndpoint: 'https://{region}-aiplatform.googleapis.com/v1',
        envKeys: ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT', 'VERTEX_LOCATION'],
        authMethods: [
            { type: 'api', label: 'Service Account JSON', description: '上传或粘贴 GCP 服务账号 JSON 密钥' },
            { type: 'env', label: '环境变量', description: '设置 GOOGLE_APPLICATION_CREDENTIALS 和 GOOGLE_CLOUD_PROJECT' },
        ],
        models: [
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Vertex)', maxTokens: 8192, contextWindow: 2000000 },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Vertex)', maxTokens: 8192, contextWindow: 1000000 },
            { id: 'claude-3-5-sonnet@20241022', name: 'Claude 3.5 Sonnet (Vertex)', maxTokens: 8192, contextWindow: 200000 },
        ],
        status: 'disconnected',
        category: 'cloud',
    },

    // ==================== 本地/自定义 ====================
    {
        id: 'ollama',
        name: 'Ollama',
        icon: '🦙',
        description: { zh: '本地运行开源模型', en: 'Run open-source models locally' },
        defaultEndpoint: 'http://localhost:11434/v1',
        authMethods: [
            { type: 'none', label: '无需认证', description: '本地服务，无需 API Key' },
        ],
        models: [
            { id: 'llama3.2', name: 'Llama 3.2', maxTokens: 4096, contextWindow: 128000, capabilities: { streaming: true } },
            { id: 'qwen2.5', name: 'Qwen 2.5', maxTokens: 4096, contextWindow: 32768, capabilities: { streaming: true } },
            { id: 'mistral', name: 'Mistral', maxTokens: 4096, contextWindow: 32768, capabilities: { streaming: true } },
            { id: 'codellama', name: 'Code Llama', maxTokens: 4096, contextWindow: 16384, capabilities: { streaming: true } },
        ],
        status: 'disconnected',
        category: 'local',
    },
    {
        id: 'lmstudio',
        name: 'LM Studio',
        icon: '🎬',
        description: { zh: '本地运行开源模型的桌面应用', en: 'Desktop app for running open-source models locally' },
        defaultEndpoint: 'http://localhost:1234/v1',
        authMethods: [
            { type: 'none', label: '无需认证', description: '本地服务，无需 API Key' },
        ],
        models: [
            { id: 'local-model', name: '本地模型', maxTokens: 4096, contextWindow: 32768, capabilities: { streaming: true } },
        ],
        status: 'disconnected',
        category: 'local',
    },
];

/**
 * 根据 ID 获取提供商配置
 *
 * @param id - 提供商 ID
 * @returns 提供商配置或 undefined
 */
export function getProviderById(id: string): AIProvider | undefined {
    return builtinProviders.find(p => p.id === id);
}

/**
 * 获取热门提供商列表
 *
 * @returns 热门提供商列表
 */
export function getPopularProviders(): AIProvider[] {
    return builtinProviders.filter(p => p.popular);
}

/**
 * 按分类获取提供商列表
 *
 * @param category - 分类
 * @returns 该分类的提供商列表
 */
export function getProvidersByCategory(category: AIProvider['category']): AIProvider[] {
    return builtinProviders.filter(p => p.category === category);
}
