/**
 * 模型动态获取服务
 *
 * v3.3.0: 支持从 API 动态获取模型列表
 * v3.3.3: 支持从 models.dev 获取模型数据（与 opencode 相同实现）
 * v3.4.6: 优化缓存持久化，支持 Tauri 文件系统存储
 * v3.4.7: 调整获取优先级，官方 API 优先，models.dev 作为补充
 * v3.4.10: 添加 getCachedModels/getAllCachedModels 方法，支持启动时恢复模型数据
 *
 * 获取策略（按优先级）：
 * 1. 提供商 API：调用提供商 API 获取实时模型列表（最准确）
 * 2. models.dev：从远程数据库获取模型列表（补充价格等元信息）
 * 3. 缓存数据：使用本地缓存的模型列表（即使过期也可用作 fallback）
 * 4. 内置数据：使用代码中写死的基础数据
 *
 * 缓存存储：
 * - Tauri 环境：使用文件系统存储（用户数据目录）
 * - 浏览器环境：回退到 localStorage
 *
 * @module services/modelFetcher
 * @version 3.4.10
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../utils/platform';
import { logger, LogTags } from '../utils/logger';
import { ModelFetchError } from '../utils/errors';
import type { ProviderModel } from '../types';

/**
 * models.dev API 地址
 */
const MODELS_DEV_URL = 'https://models.dev/api.json';

/**
 * models.dev 缓存 Key
 */
const MODELS_DEV_CACHE_KEY = 'mobaus_models_dev_cache';

/**
 * models.dev 数据结构
 */
interface ModelsDevModel {
    id: string;
    name: string;
    family?: string;
    attachment?: boolean;      // 是否支持附件（图片等）
    reasoning?: boolean;       // 是否为推理模型
    tool_call?: boolean;       // 是否支持函数调用
    structured_output?: boolean;
    temperature?: boolean;
    knowledge?: string;        // 知识截止日期
    release_date?: string;
    modalities?: {
        input?: string[];      // 输入模态：text, image, audio, video, pdf
        output?: string[];     // 输出模态
    };
    open_weights?: boolean;
    cost?: {
        input: number;         // 输入价格 ($/1M tokens)
        output: number;        // 输出价格 ($/1M tokens)
        cache_read?: number;
        cache_write?: number;
    };
    limit?: {
        context: number;       // 上下文窗口
        input?: number;        // 最大输入
        output: number;        // 最大输出
    };
}

interface ModelsDevProvider {
    id: string;
    name: string;
    env?: string[];
    npm?: string;
    api?: string;
    doc?: string;
    models: Record<string, ModelsDevModel>;
}

interface ModelsDevData {
    [providerId: string]: ModelsDevProvider;
}

/**
 * models.dev 缓存结构
 */
interface ModelsDevCache {
    data: ModelsDevData;
    fetchedAt: number;
}

/**
 * 模型缓存数据结构
 */
interface ModelCache {
    providerId: string;
    models: ProviderModel[];
    fetchedAt: number;  // 获取时间戳
    source: 'api' | 'remote' | 'builtin' | 'models.dev';  // 数据来源
}

/**
 * 缓存有效期（毫秒）
 * 默认 24 小时
 */
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * 本地缓存 Key
 */
const CACHE_KEY = 'mobaus_model_cache';

/**
 * 支持从提供商 API 动态获取模型列表的提供商
 * 注意：所有提供商都可以从 models.dev 获取，这里只是标记支持直接 API 获取的
 */
const DYNAMIC_FETCH_PROVIDERS = ['openai', 'openrouter', 'google', 'groq', 'together'];

/**
 * models.dev 支持的提供商列表
 * v3.4.2: 添加 anthropic 等更多提供商，使用 providers.ts 中的 ID
 */
const MODELS_DEV_PROVIDERS = [
    'openai', 'anthropic', 'google', 'deepseek', 'openrouter',
    'groq', 'mistral', 'cohere', 'together', 'fireworks',
    'perplexity', 'cerebras', 'xai', 'bedrock', 'azure',
    'github-copilot', 'vertex', 'ollama', 'lmstudio'
];

/**
 * 提供商 ID 映射：providers.ts ID -> models.dev ID
 * v3.4.2: 处理 ID 不一致的情况
 */
const PROVIDER_ID_TO_MODELS_DEV: Record<string, string> = {
    'together': 'togetherai',
    'fireworks': 'fireworks-ai',
    'bedrock': 'amazon-bedrock',
    'vertex': 'google-vertex',
    'ollama': 'ollama-cloud',
};

/**
 * 获取 models.dev 中的提供商 ID
 */
function getModelsDevProviderId(providerId: string): string {
    return PROVIDER_ID_TO_MODELS_DEV[providerId] || providerId;
}

/**
 * 提供商 API 端点配置
 */
const PROVIDER_MODEL_ENDPOINTS: Record<string, string> = {
    openai: '/v1/models',
    openrouter: '/api/v1/models',
    google: '/v1beta/models',
    groq: '/openai/v1/models',
    together: '/v1/models',
};

/**
 * 从 API 响应中解析模型列表
 *
 * v3.3.2: 改进过滤逻辑，保留更多聊天模型，支持 GPT-5、nano 等新模型
 */
function parseModelsFromResponse(providerId: string, data: unknown): ProviderModel[] {
    const models: ProviderModel[] = [];

    // OpenAI 格式: { data: [{ id, ... }] }
    if (providerId === 'openai' || providerId === 'groq' || providerId === 'together') {
        const response = data as { data?: Array<{ id: string; owned_by?: string }> };
        if (response.data && Array.isArray(response.data)) {
            for (const model of response.data) {
                const modelId = model.id.toLowerCase();

                // 过滤掉非聊天模型
                if (modelId.includes('embedding') ||
                    modelId.includes('whisper') ||
                    modelId.includes('tts') ||
                    modelId.includes('dall-e') ||
                    modelId.includes('moderation') ||
                    modelId.includes('realtime') ||
                    modelId.includes('audio') ||
                    modelId.includes('search') ||
                    (modelId.includes('instruct') && !modelId.includes('gpt-5')) ||  // 旧版 instruct 模型，但保留 gpt-5
                    modelId.startsWith('ft:') ||     // 微调模型
                    modelId.includes('babbage') ||   // 旧版基础模型
                    modelId.includes('davinci') ||   // 旧版基础模型
                    modelId.includes('curie') ||     // 旧版基础模型
                    (modelId.includes('ada') && !modelId.includes('codex'))) {  // 旧版基础模型，但保留 codex
                    continue;
                }

                // 只保留聊天模型（gpt、o1、o3、o4、chatgpt、codex 等）
                // v4.3.0: 添加 o4 前缀支持（o4-mini 等）
                const isChatModel = modelId.includes('gpt') ||
                    modelId.startsWith('o1') ||
                    modelId.startsWith('o3') ||
                    modelId.startsWith('o4') ||
                    modelId.includes('chatgpt') ||
                    modelId.includes('codex') ||
                    modelId.includes('nano') ||
                    modelId.includes('llama') ||
                    modelId.includes('mixtral') ||
                    modelId.includes('gemma') ||
                    modelId.includes('qwen');

                if (!isChatModel && providerId === 'openai') {
                    continue;
                }

                // 标记低成本/推荐模型
                let displayName = formatModelName(model.id);
                if (modelId.includes('nano')) {
                    displayName = `${displayName} ⭐最便宜`;
                } else if (modelId.includes('gpt-4o-mini') || modelId.includes('gpt-4.1-mini')) {
                    displayName = `${displayName} ⭐推荐`;
                }

                models.push({
                    id: model.id,
                    name: displayName,
                    maxTokens: guessMaxTokens(model.id),
                    contextWindow: guessContextWindow(model.id),
                    capabilities: guessCapabilities(model.id),
                });
            }

            // 按模型排序：nano 最前，然后是 mini，然后按名称
            models.sort((a, b) => {
                const aId = a.id.toLowerCase();
                const bId = b.id.toLowerCase();
                // nano 模型优先
                const aNano = aId.includes('nano');
                const bNano = bId.includes('nano');
                if (aNano && !bNano) return -1;
                if (!aNano && bNano) return 1;
                // mini 模型次之（排除推理系列的 mini 变体和 codex-mini）
                const aMini = aId.includes('mini') && !aId.includes('o1-mini') && !aId.includes('o3-mini') && !aId.includes('o4-mini') && !aId.includes('codex-mini');
                const bMini = bId.includes('mini') && !bId.includes('o1-mini') && !bId.includes('o3-mini') && !bId.includes('o4-mini') && !bId.includes('codex-mini');
                if (aMini && !bMini) return -1;
                if (!aMini && bMini) return 1;
                return a.id.localeCompare(b.id);
            });
        }
    }

    // OpenRouter 格式: { data: [{ id, name, context_length, ... }] }
    if (providerId === 'openrouter') {
        const response = data as {
            data?: Array<{
                id: string;
                name?: string;
                context_length?: number;
                top_provider?: { max_completion_tokens?: number };
            }>
        };
        if (response.data && Array.isArray(response.data)) {
            for (const model of response.data) {
                models.push({
                    id: model.id,
                    name: model.name || formatModelName(model.id),
                    maxTokens: model.top_provider?.max_completion_tokens || 4096,
                    contextWindow: model.context_length || 4096,
                    capabilities: guessCapabilities(model.id),
                });
            }
        }
    }

    // Google 格式: { models: [{ name, displayName, ... }] }
    if (providerId === 'google') {
        const response = data as {
            models?: Array<{
                name: string;
                displayName?: string;
                inputTokenLimit?: number;
                outputTokenLimit?: number;
            }>
        };
        if (response.models && Array.isArray(response.models)) {
            for (const model of response.models) {
                // 提取模型 ID（去掉 "models/" 前缀）
                const modelId = model.name.replace('models/', '');
                // 只保留 gemini 模型
                if (!modelId.includes('gemini')) continue;

                models.push({
                    id: modelId,
                    name: model.displayName || formatModelName(modelId),
                    maxTokens: model.outputTokenLimit || 8192,
                    contextWindow: model.inputTokenLimit || 32000,
                    capabilities: {
                        vision: modelId.includes('vision') || modelId.includes('1.5') || modelId.includes('2.0'),
                        functionCalling: true,
                        streaming: true,
                    },
                });
            }
        }
    }

    return models;
}

/**
 * 格式化模型名称
 */
function formatModelName(modelId: string): string {
    return modelId
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .replace(/Gpt/g, 'GPT')
        .replace(/Ai/g, 'AI')
        .replace(/3\.5/g, '3.5')
        .replace(/4o/g, '4o');
}

/**
 * 根据模型 ID 猜测 maxTokens
 *
 * v3.3.2: 添加 o3、chatgpt、gpt-5、nano 等新模型支持
 * v4.3.0: 添加 o3-pro、o4-mini、chatgpt-4o-latest 支持
 * v4.3.2: GPT-5.x 系列统一 128000
 */
function guessMaxTokens(modelId: string): number {
    // GPT-5 系列（包括 codex 变体）
    if (modelId.includes('gpt-5')) return 128000;
    // GPT-4.1 系列
    if (modelId.includes('gpt-4.1')) return 32768;
    // Nano 系列（最便宜）
    if (modelId.includes('nano')) return 32768;
    // GPT-4o 系列
    if (modelId.includes('chatgpt-4o')) return 16384;
    if (modelId.includes('gpt-4o')) return 16384;
    if (modelId.includes('gpt-4-turbo')) return 4096;
    if (modelId.includes('gpt-4')) return 8192;
    if (modelId.includes('gpt-3.5')) return 4096;
    // o 系列推理模型
    if (modelId.includes('o4-mini')) return 100000;
    if (modelId.includes('o3-pro')) return 100000;
    if (modelId.includes('o3-mini')) return 100000;
    if (modelId.includes('o3')) return 100000;
    if (modelId.includes('o1')) return 100000;
    if (modelId.includes('claude-3')) return 8192;
    if (modelId.includes('gemini')) return 8192;
    return 4096;
}

/**
 * 根据模型 ID 猜测 contextWindow
 *
 * v3.3.2: 添加 o3、chatgpt、gpt-5、nano 等新模型支持
 * v4.3.0: 添加 o3-pro、o4-mini、chatgpt-4o-latest 支持
 * v4.3.2: GPT-5.x 细化 codex 系列上下文窗口（codex/codex-max 为 1M，其他为 400K）
 */
function guessContextWindow(modelId: string): number {
    // GPT-5 系列
    // codex/codex-max 系列上下文更大（1M），标准 GPT-5 和 codex-mini 为 400K
    if (modelId.includes('gpt-5') && modelId.includes('codex') && !modelId.includes('codex-mini')) return 1047576;
    if (modelId.includes('gpt-5.4')) return 1047576;  // 5.4/5.4-mini 最新旗舰级上下文
    if (modelId.includes('gpt-5')) return 400000;
    // GPT-4.1 系列（超大上下文）
    if (modelId.includes('gpt-4.1')) return 1047576;
    // Nano 系列
    if (modelId.includes('nano') && modelId.includes('gpt-5')) return 400000;
    if (modelId.includes('nano') && modelId.includes('gpt-4')) return 1047576;
    // GPT-4o 系列
    if (modelId.includes('chatgpt-4o')) return 128000;
    if (modelId.includes('gpt-4o')) return 128000;
    if (modelId.includes('gpt-4-turbo')) return 128000;
    if (modelId.includes('gpt-4-32k')) return 32768;
    if (modelId.includes('gpt-4')) return 8192;
    if (modelId.includes('gpt-3.5-turbo-16k')) return 16385;
    if (modelId.includes('gpt-3.5')) return 16385;
    // o 系列推理模型
    if (modelId.includes('o4-mini')) return 200000;
    if (modelId.includes('o3-pro')) return 200000;
    if (modelId.includes('o3-mini')) return 200000;
    if (modelId.includes('o3')) return 200000;
    if (modelId.includes('o1-mini')) return 128000;
    if (modelId.includes('o1')) return 200000;
    if (modelId.includes('claude-3')) return 200000;
    if (modelId.includes('gemini-1.5')) return 1000000;
    if (modelId.includes('gemini-2')) return 1000000;
    return 4096;
}

/**
 * 根据模型 ID 猜测能力
 *
 * v3.3.2: 添加 o3、chatgpt 等新模型支持
 * v4.3.0: o3/o3-pro/o4-mini 支持函数调用和视觉，区分各模型能力
 * v4.3.2: GPT-5.x codex 系列支持视觉和函数调用
 */
function guessCapabilities(modelId: string): ProviderModel['capabilities'] {
    const hasVision = modelId.includes('vision') ||
        modelId.includes('gpt-4o') ||
        modelId.includes('gpt-4-turbo') ||
        modelId.includes('gpt-4.1') ||
        modelId.includes('gpt-5') ||
        modelId.includes('claude-3') ||
        modelId.includes('gemini') ||
        modelId.includes('chatgpt-4o') ||
        modelId.includes('o3') ||
        modelId.includes('o4-mini');

    // o1 系列不支持函数调用；o3/o3-pro/o4-mini 支持
    const noFunctionCalling = modelId.includes('o1');

    return {
        vision: hasVision,
        functionCalling: !noFunctionCalling,
        streaming: true,
    };
}

/**
 * 从本地存储加载缓存
 * v3.4.6: 支持 Tauri 文件系统存储
 */
async function loadCacheAsync(): Promise<Record<string, ModelCache>> {
    // Tauri 环境优先使用文件系统
    if (isTauri()) {
        try {
            const cached = await invoke<string>('load_model_cache');
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (error) {
            logger.debug(LogTags.MODEL, '从 Tauri 加载模型缓存失败，回退到 localStorage', error);
        }
    }

    // 回退到 localStorage
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (error) {
        logger.warn(LogTags.MODEL, '加载模型缓存失败', error);
    }
    return {};
}

/**
 * 从本地存储加载缓存（同步版本，用于兼容）
 */
function loadCache(): Record<string, ModelCache> {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (error) {
        logger.warn(LogTags.MODEL, '加载模型缓存失败', error);
    }
    return {};
}

/**
 * 保存缓存到本地存储
 * v3.4.6: 支持 Tauri 文件系统存储
 */
async function saveCacheAsync(cache: Record<string, ModelCache>): Promise<void> {
    const cacheStr = JSON.stringify(cache);

    // Tauri 环境优先使用文件系统
    if (isTauri()) {
        try {
            await invoke('save_model_cache', { cache: cacheStr });
            logger.debug(LogTags.MODEL, '模型缓存已保存到 Tauri 文件系统');
        } catch (error) {
            logger.debug(LogTags.MODEL, '保存到 Tauri 失败，回退到 localStorage', error);
            // 回退到 localStorage
            try {
                localStorage.setItem(CACHE_KEY, cacheStr);
            } catch (e) {
                logger.warn(LogTags.MODEL, '保存模型缓存失败', e);
            }
        }
        return;
    }

    // 浏览器环境使用 localStorage
    try {
        localStorage.setItem(CACHE_KEY, cacheStr);
    } catch (error) {
        logger.warn(LogTags.MODEL, '保存模型缓存失败', error);
    }
}

/**
 * 保存缓存到本地存储（同步版本，用于兼容）
 */
function saveCache(cache: Record<string, ModelCache>): void {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        // 异步保存到 Tauri（不阻塞）
        if (isTauri()) {
            saveCacheAsync(cache).catch(err => {
                logger.warn(LogTags.MODEL, 'Tauri 异步保存模型缓存失败', { error: err });
            });
        }
    } catch (error) {
        logger.warn(LogTags.MODEL, '保存模型缓存失败', error);
    }
}

/**
 * 检查缓存是否有效
 */
function isCacheValid(cache: ModelCache | undefined): boolean {
    if (!cache) return false;
    return Date.now() - cache.fetchedAt < CACHE_TTL;
}

/**
 * 从本地存储加载 models.dev 缓存
 * v3.4.6: 支持 Tauri 文件系统存储
 */
async function loadModelsDevCacheAsync(): Promise<ModelsDevCache | null> {
    // Tauri 环境优先使用文件系统
    if (isTauri()) {
        try {
            const cached = await invoke<string>('load_models_dev_cache');
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (error) {
            logger.debug(LogTags.MODEL, '从 Tauri 加载 models.dev 缓存失败，回退到 localStorage', error);
        }
    }

    // 回退到 localStorage
    try {
        const cached = localStorage.getItem(MODELS_DEV_CACHE_KEY);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (error) {
        logger.warn(LogTags.MODEL, '加载 models.dev 缓存失败', error);
    }
    return null;
}

/**
 * 从本地存储加载 models.dev 缓存（同步版本，用于兼容）
 */
function loadModelsDevCache(): ModelsDevCache | null {
    try {
        const cached = localStorage.getItem(MODELS_DEV_CACHE_KEY);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (error) {
        logger.warn(LogTags.MODEL, '加载 models.dev 缓存失败', error);
    }
    return null;
}

/**
 * 保存 models.dev 缓存到本地存储
 * v3.4.6: 支持 Tauri 文件系统存储
 */
async function saveModelsDevCacheAsync(cache: ModelsDevCache): Promise<void> {
    const cacheStr = JSON.stringify(cache);

    // Tauri 环境优先使用文件系统
    if (isTauri()) {
        try {
            await invoke('save_models_dev_cache', { cache: cacheStr });
            logger.debug(LogTags.MODEL, 'models.dev 缓存已保存到 Tauri 文件系统');
        } catch (error) {
            logger.debug(LogTags.MODEL, '保存到 Tauri 失败，回退到 localStorage', error);
            // 回退到 localStorage
            try {
                localStorage.setItem(MODELS_DEV_CACHE_KEY, cacheStr);
            } catch (e) {
                logger.warn(LogTags.MODEL, '保存 models.dev 缓存失败', e);
            }
        }
        return;
    }

    // 浏览器环境使用 localStorage
    try {
        localStorage.setItem(MODELS_DEV_CACHE_KEY, cacheStr);
    } catch (error) {
        logger.warn(LogTags.MODEL, '保存 models.dev 缓存失败', error);
    }
}

/**
 * 将 models.dev 模型数据转换为 ProviderModel 格式
 *
 * @param modelsDevModels models.dev 模型数据
 * @returns ProviderModel 数组
 */
function convertModelsDevToProviderModels(
    modelsDevModels: Record<string, ModelsDevModel>
): ProviderModel[] {
    const models: ProviderModel[] = [];

    for (const [, model] of Object.entries(modelsDevModels)) {
        // 过滤掉非聊天模型（embedding、whisper 等）
        const family = model.family?.toLowerCase() || '';
        if (family.includes('embedding') ||
            family.includes('whisper') ||
            family.includes('tts') ||
            family.includes('dall-e') ||
            family.includes('moderation')) {
            continue;
        }

        // 检查是否支持文本输出（聊天模型的基本要求）
        const outputModalities = model.modalities?.output || ['text'];
        if (!outputModalities.includes('text')) {
            continue;
        }

        // 构建显示名称，添加成本标记
        let displayName = model.name;
        const modelId = model.id.toLowerCase();

        // 标记低成本模型
        if (modelId.includes('nano')) {
            displayName = `${displayName} ⭐最便宜`;
        } else if (modelId.includes('mini') && !modelId.includes('o1-mini') && !modelId.includes('o3-mini') && !modelId.includes('o4-mini') && !modelId.includes('codex-mini')) {
            displayName = `${displayName} ⭐推荐`;
        }

        // 添加价格信息（如果有）
        if (model.cost && model.cost.input > 0) {
            const inputCost = model.cost.input;
            if (inputCost < 0.2) {
                displayName = `${displayName} ($${inputCost}/M)`;
            }
        }

        models.push({
            id: model.id,
            name: displayName,
            maxTokens: model.limit?.output || 4096,
            contextWindow: model.limit?.context || 4096,
            pricing: model.cost ? {
                input: model.cost.input,
                output: model.cost.output,
            } : undefined,
            capabilities: {
                vision: model.attachment || (model.modalities?.input?.includes('image') ?? false),
                functionCalling: model.tool_call ?? false,
                streaming: true,
            },
        });
    }

    // 排序：nano 最前，然后是 mini，然后按价格
    models.sort((a, b) => {
        const aId = a.id.toLowerCase();
        const bId = b.id.toLowerCase();

        // nano 模型优先
        const aNano = aId.includes('nano');
        const bNano = bId.includes('nano');
        if (aNano && !bNano) return -1;
        if (!aNano && bNano) return 1;

        // mini 模型次之（排除 o1-mini、o3-mini、o4-mini、codex-mini）
        const aMini = aId.includes('mini') && !aId.includes('o1-mini') && !aId.includes('o3-mini') && !aId.includes('o4-mini') && !aId.includes('codex-mini');
        const bMini = bId.includes('mini') && !bId.includes('o1-mini') && !bId.includes('o3-mini') && !bId.includes('o4-mini') && !bId.includes('codex-mini');
        if (aMini && !bMini) return -1;
        if (!aMini && bMini) return 1;

        // 按价格排序（便宜的在前）
        const aPrice = a.pricing?.input || 999;
        const bPrice = b.pricing?.input || 999;
        if (aPrice !== bPrice) return aPrice - bPrice;

        return a.id.localeCompare(b.id);
    });

    return models;
}

/**
 * Google Cloud Code API 支持的 Claude 模型列表
 * v3.4.3: 当使用 Google OAuth 时，自动添加这些模型
 * 参考 Antigravity-Manager 的 model_mapping.rs
 */
const GOOGLE_CLOUD_CODE_CLAUDE_MODELS: ProviderModel[] = [
    {
        id: 'claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5 (via Cloud Code)',
        maxTokens: 8192,
        contextWindow: 200000,
        capabilities: { vision: true, functionCalling: true, streaming: true },
    },
    {
        id: 'claude-sonnet-4-5-thinking',
        name: 'Claude Sonnet 4.5 Thinking (via Cloud Code)',
        maxTokens: 16000,
        contextWindow: 200000,
        capabilities: { vision: true, functionCalling: true, streaming: true },
    },
    {
        id: 'claude-opus-4-5-thinking',
        name: 'Claude Opus 4.5 Thinking (via Cloud Code) ⭐最强',
        maxTokens: 32000,
        contextWindow: 200000,
        capabilities: { vision: true, functionCalling: true, streaming: true },
    },
];

/**
 * 检测是否为 Google OAuth Token
 * OAuth Token 以 ya29. 或 1// 开头，API Key 以 AIza 开头
 */
function isGoogleOAuthToken(apiKey: string): boolean {
    return apiKey.startsWith('ya29.') ||
           apiKey.startsWith('1//') ||
           (!apiKey.startsWith('AIza') && apiKey.length > 100);
}

const OPENAI_CHATGPT_WEB_SUPPORTED_MODEL_IDS = new Set(['gpt-5.4-mini']);

const OPENAI_CHATGPT_WEB_FALLBACK_MODELS: ProviderModel[] = [
    {
        id: 'gpt-5.4-mini',
        name: 'GPT-5.4 Mini',
        maxTokens: 128000,
        contextWindow: 1047576,
        capabilities: { vision: true, functionCalling: true, streaming: true },
    },
];

function getOpenAIChatGPTWebModels(builtinModels?: ProviderModel[]): ProviderModel[] {
    const filtered = (builtinModels || []).filter((model) =>
        OPENAI_CHATGPT_WEB_SUPPORTED_MODEL_IDS.has(model.id)
    );

    return filtered.length > 0 ? filtered : OPENAI_CHATGPT_WEB_FALLBACK_MODELS;
}

/**
 * 模型获取服务
 */
export const modelFetcher = {
    /**
     * models.dev 数据缓存（内存）
     */
    _modelsDevData: null as ModelsDevData | null,

    /**
     * 获取提供商的模型列表
     *
     * v3.3.3: 优先使用 models.dev 数据源
     * v3.4.3: Google OAuth 时自动添加 Cloud Code API 支持的 Claude 模型
     * v3.4.7: 调整优先级，官方 API 优先，models.dev 作为补充
     *
     * 获取策略（按优先级）：
     * 1. 提供商 API：调用提供商 API 获取实时模型列表（最准确）
     * 2. models.dev：从远程数据库获取模型列表（补充价格等元信息）
     * 3. 缓存数据：使用本地缓存的模型列表（即使过期也可用）
     * 4. 内置数据：使用代码中写死的基础数据
     *
     * @param providerId 提供商 ID
     * @param apiKey API Key（用于动态获取）
     * @param baseUrl API 端点（可选）
     * @param builtinModels 内置模型列表（作为 fallback）
     * @returns 模型列表
     */
    async fetchModels(
        providerId: string,
        apiKey: string,
        baseUrl?: string,
        builtinModels?: ProviderModel[]
    ): Promise<{ models: ProviderModel[]; source: 'api' | 'cache' | 'remote' | 'builtin' | 'models.dev' }> {
        const cache = await loadCacheAsync();

        // 辅助函数：添加 Google Cloud Code Claude 模型
        const addClaudeModelsIfNeeded = (models: ProviderModel[]): ProviderModel[] => {
            if (providerId === 'google' && apiKey && isGoogleOAuthToken(apiKey)) {
                const hasClaudeModels = models.some(m => m.id.startsWith('claude-'));
                if (!hasClaudeModels) {
                    logger.info(LogTags.MODEL, '检测到 Google OAuth Token，添加 Cloud Code Claude 模型');
                    return [...GOOGLE_CLOUD_CODE_CLAUDE_MODELS, ...models];
                }
            }
            return models;
        };

        // 1. 优先尝试从提供商 API 动态获取（最准确的数据源）
        // v4.3.2: 如果是 OpenAI 的 OAuth Web 凭证，由于没有 api.model.read 权限，跳过动态获取和缓存
        // 强制使用内置的 Web 可用模型列表（在 providers.ts 中定义的 GPT-5 系列）
        if (providerId === 'openai' && apiKey && !apiKey.startsWith('sk-') && apiKey.length > 50) {
            const webModels = getOpenAIChatGPTWebModels(builtinModels);
            logger.info(LogTags.MODEL, '检测到 ChatGPT Plus/Pro OAuth 凭证，跳过 API 模型拉取，使用实测可用的 ChatGPT Web 模型列表', {
                modelCount: webModels.length,
            });
            return { models: webModels, source: 'builtin' };
        }

        if (DYNAMIC_FETCH_PROVIDERS.includes(providerId) && apiKey) {
            try {
                let models = await this.fetchFromApi(providerId, apiKey, baseUrl);
                if (models.length > 0) {
                    models = addClaudeModelsIfNeeded(models);

                    // 更新缓存
                    cache[providerId] = {
                        providerId,
                        models,
                        fetchedAt: Date.now(),
                        source: 'api',
                    };
                    await saveCacheAsync(cache);
                    logger.info(LogTags.MODEL, `从 API 获取到 ${models.length} 个模型`, { providerId });
                    return { models, source: 'api' };
                }
            } catch (error) {
                logger.warn(LogTags.MODEL, `API 获取失败，尝试其他数据源`, { providerId, error });
            }
        }

        // 2. 尝试从 models.dev 获取（作为 API 失败时的补充）
        try {
            let models = await this.fetchFromModelsDev(providerId);
            if (models.length > 0) {
                models = addClaudeModelsIfNeeded(models);

                // 🔍 调试日志：验证 Anthropic 模型获取
                if (providerId === 'anthropic') {
                    logger.debug(LogTags.MODEL, 'Fetched Anthropic models from models.dev', {
                        modelCount: models.length,
                        modelIds: models.map(m => m.id),
                        has4_6: models.some(m => m.id.includes('4-6')),
                        firstModel: models[0],
                    });
                }

                // 更新缓存
                cache[providerId] = {
                    providerId,
                    models,
                    fetchedAt: Date.now(),
                    source: 'models.dev',
                };
                await saveCacheAsync(cache);
                logger.info(LogTags.MODEL, `从 models.dev 获取到 ${models.length} 个模型`, { providerId });
                return { models, source: 'models.dev' };
            }
        } catch (error) {
            logger.warn(LogTags.MODEL, `models.dev 获取失败`, { providerId, error });
        }

        // 3. 检查缓存（即使过期也可用作 fallback）
        const cachedData = cache[providerId];
        if (cachedData && cachedData.models && cachedData.models.length > 0) {
            const isExpired = !isCacheValid(cachedData);
            if (isExpired) {
                logger.info(LogTags.MODEL, `使用过期缓存数据作为 fallback`, {
                    providerId,
                    cachedAt: new Date(cachedData.fetchedAt).toISOString(),
                    modelCount: cachedData.models.length
                });
            } else {
                logger.debug(LogTags.MODEL, `使用有效缓存数据`, { providerId });
            }
            const models = addClaudeModelsIfNeeded(cachedData.models);
            return { models, source: 'cache' };
        }

        // 4. 使用内置数据
        if (builtinModels && builtinModels.length > 0) {
            logger.debug(LogTags.MODEL, `使用内置数据`, { providerId });
            const models = addClaudeModelsIfNeeded(builtinModels);
            return { models, source: 'builtin' };
        }

        // 5. 最后的 fallback：如果是 Google OAuth，至少返回 Claude 模型
        if (providerId === 'google' && apiKey && isGoogleOAuthToken(apiKey)) {
            logger.info(LogTags.MODEL, 'Google OAuth 无其他模型，返回 Cloud Code Claude 模型');
            return { models: GOOGLE_CLOUD_CODE_CLAUDE_MODELS, source: 'builtin' };
        }

        return { models: [], source: 'builtin' };
    },

    /**
     * 从 models.dev 获取模型列表
     *
     * v3.3.3: 与 opencode 相同的实现方式
     * v3.4.2: 添加提供商 ID 映射支持
     * v3.4.6: 使用异步缓存函数，统一日志
     *
     * @param providerId 提供商 ID（providers.ts 中的 ID）
     * @returns ProviderModel 数组
     */
    async fetchFromModelsDev(providerId: string): Promise<ProviderModel[]> {
        // v3.4.2: 转换为 models.dev 中的 ID
        const modelsDevId = getModelsDevProviderId(providerId);

        // 1. 检查内存缓存
        if (this._modelsDevData) {
            const provider = this._modelsDevData[modelsDevId];
            if (provider && provider.models) {
                return convertModelsDevToProviderModels(provider.models);
            }
            return [];
        }

        // 2. 检查本地存储缓存
        const localCache = await loadModelsDevCacheAsync();
        if (localCache && Date.now() - localCache.fetchedAt < CACHE_TTL) {
            this._modelsDevData = localCache.data;
            const provider = localCache.data[modelsDevId];
            if (provider && provider.models) {
                logger.debug(LogTags.MODEL, `使用 models.dev 本地缓存`, { providerId, modelsDevId });
                return convertModelsDevToProviderModels(provider.models);
            }
            return [];
        }

        // 3. 从远程获取
        logger.info(LogTags.MODEL, `从 ${MODELS_DEV_URL} 获取模型数据...`);

        let data: ModelsDevData;

        // 使用 Tauri 后端发起请求（避免 CORS）
        if (isTauri()) {
            try {
                const response = await invoke<string>('fetch_url_content', {
                    url: MODELS_DEV_URL,
                });
                data = JSON.parse(response);
            } catch (error) {
                logger.error(LogTags.MODEL, `Tauri 请求 models.dev 失败`, error);
                // 尝试使用 fetch
                const response = await fetch(MODELS_DEV_URL);
                if (!response.ok) {
                    throw new ModelFetchError(`HTTP ${response.status}: ${response.statusText}`);
                }
                data = await response.json();
            }
        } else {
            // Web 环境使用 fetch
            const response = await fetch(MODELS_DEV_URL);
            if (!response.ok) {
                throw new ModelFetchError(`HTTP ${response.status}: ${response.statusText}`);
            }
            data = await response.json();
        }

        // 保存到缓存
        this._modelsDevData = data;
        await saveModelsDevCacheAsync({
            data,
            fetchedAt: Date.now(),
        });

        logger.info(LogTags.MODEL, `models.dev 数据已缓存`, { providerCount: Object.keys(data).length });

        // 返回指定提供商的模型（使用映射后的 ID）
        const provider = data[modelsDevId];
        if (provider && provider.models) {
            return convertModelsDevToProviderModels(provider.models);
        }

        return [];
    },

    /**
     * 获取 models.dev 支持的所有提供商列表
     *
     * @returns 提供商 ID 数组
     */
    async getModelsDevProviders(): Promise<string[]> {
        try {
            // 确保数据已加载
            await this.fetchFromModelsDev('openai');
            if (this._modelsDevData) {
                return Object.keys(this._modelsDevData);
            }
        } catch (error) {
            logger.warn(LogTags.MODEL, '获取 models.dev 提供商列表失败', error);
        }
        return [];
    },

    /**
     * 刷新 models.dev 数据
     *
     * 强制从远程重新获取数据
     */
    async refreshModelsDev(): Promise<void> {
        // 清除缓存
        this._modelsDevData = null;
        localStorage.removeItem(MODELS_DEV_CACHE_KEY);
        logger.info(LogTags.MODEL, 'models.dev 缓存已清除，将重新获取');
    },

    /**
     * 从 API 动态获取模型列表
     */
    async fetchFromApi(
        providerId: string,
        apiKey: string,
        baseUrl?: string
    ): Promise<ProviderModel[]> {
        const endpoint = PROVIDER_MODEL_ENDPOINTS[providerId];
        if (!endpoint) {
            throw new ModelFetchError(`不支持动态获取: ${providerId}`);
        }

        // 构建完整 URL
        const defaultEndpoints: Record<string, string> = {
            openai: 'https://api.openai.com',
            openrouter: 'https://openrouter.ai',
            google: 'https://generativelanguage.googleapis.com',
            groq: 'https://api.groq.com',
            together: 'https://api.together.xyz',
        };

        let url = baseUrl || defaultEndpoints[providerId];
        // 移除末尾的 /v1 等路径（如果有）
        url = url.replace(/\/v1\/?$/, '').replace(/\/v1beta\/?$/, '');
        url = `${url}${endpoint}`;

        // Google API 需要特殊处理
        // v3.4.11: 区分 API Key 和 OAuth Token
        // - API Key (以 AIza 开头): 使用 URL 参数 ?key=xxx
        // - OAuth Token: 使用 Authorization: Bearer xxx 请求头
        const isGoogleOAuth = providerId === 'google' && isGoogleOAuthToken(apiKey);
        if (providerId === 'google' && !isGoogleOAuth) {
            // API Key 模式：使用 URL 参数
            url = `${url}?key=${apiKey}`;
        }

        logger.debug(LogTags.MODEL, `请求模型列表: ${url}`, { isGoogleOAuth });

        // 使用 Tauri 后端发起请求（避免 CORS）
        if (isTauri()) {
            try {
                const response = await invoke<string>('fetch_models', {
                    url,
                    // v3.4.11: Google OAuth 需要传递 token 用于 Bearer 认证
                    // API Key 模式已经在 URL 中，不需要再传
                    apiKey: (providerId === 'google' && !isGoogleOAuth) ? '' : apiKey,
                    providerId,
                });
                const data = JSON.parse(response);
                return parseModelsFromResponse(providerId, data);
            } catch (error) {
                logger.error(LogTags.MODEL, 'Tauri 请求失败', error);
                throw error;
            }
        }

        // Web 环境使用 fetch（可能有 CORS 问题）
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        // v3.4.11: Google OAuth 也需要 Bearer 认证
        if (providerId !== 'google' || isGoogleOAuth) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(url, { headers });
        if (!response.ok) {
            throw new ModelFetchError(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return parseModelsFromResponse(providerId, data);
    },

    /**
     * 清除指定提供商的缓存
     *
     * v3.4.6: 同时清除 Tauri 文件系统和 localStorage 缓存
     *
     * @param providerId 提供商 ID（可选，不传则清除所有）
     * @param includeModelsDev 是否同时清除 models.dev 缓存
     */
    async clearCache(providerId?: string, includeModelsDev: boolean = false): Promise<void> {
        if (providerId) {
            const cache = loadCache();
            delete cache[providerId];
            saveCache(cache);
            logger.info(LogTags.MODEL, `已清除缓存`, { providerId });
        } else {
            localStorage.removeItem(CACHE_KEY);
            // 同时清除 Tauri 缓存
            if (isTauri()) {
                try {
                    await invoke('clear_model_cache');
                } catch (e) {
                    logger.debug(LogTags.MODEL, '清除 Tauri 模型缓存失败', e);
                }
            }
            logger.info(LogTags.MODEL, '已清除所有模型缓存');
        }

        // 清除 models.dev 缓存
        if (includeModelsDev) {
            this._modelsDevData = null;
            localStorage.removeItem(MODELS_DEV_CACHE_KEY);
            // 同时清除 Tauri 缓存
            if (isTauri()) {
                try {
                    await invoke('clear_models_dev_cache');
                } catch (e) {
                    logger.debug(LogTags.MODEL, '清除 Tauri models.dev 缓存失败', e);
                }
            }
            logger.info(LogTags.MODEL, '已清除 models.dev 缓存');
        }
    },

    /**
     * 获取指定提供商的缓存模型列表
     *
     * v3.4.10: 用于应用启动时恢复 providers 的模型数据
     *
     * @param providerId 提供商 ID
     * @returns 缓存的模型列表，如果没有缓存则返回 undefined
     */
    async getCachedModels(providerId: string): Promise<ProviderModel[] | undefined> {
        const cache = await loadCacheAsync();
        const cachedData = cache[providerId];
        if (cachedData && cachedData.models && cachedData.models.length > 0) {
            return cachedData.models;
        }
        return undefined;
    },

    /**
     * 获取所有缓存的模型数据
     *
     * v3.4.10: 用于应用启动时批量恢复 providers 的模型数据
     *
     * @returns 提供商 ID 到模型列表的映射
     */
    async getAllCachedModels(): Promise<Record<string, ProviderModel[]>> {
        const cache = await loadCacheAsync();
        const result: Record<string, ProviderModel[]> = {};
        for (const [providerId, data] of Object.entries(cache)) {
            if (data.models && data.models.length > 0) {
                result[providerId] = data.models;
            }
        }
        return result;
    },

    /**
     * 获取缓存状态
     */
    getCacheStatus(): Record<string, { fetchedAt: number; source: string; count: number }> {
        const cache = loadCache();
        const status: Record<string, { fetchedAt: number; source: string; count: number }> = {};

        for (const [providerId, data] of Object.entries(cache)) {
            status[providerId] = {
                fetchedAt: data.fetchedAt,
                source: data.source,
                count: data.models.length,
            };
        }

        // 添加 models.dev 缓存状态
        const modelsDevCache = loadModelsDevCache();
        if (modelsDevCache) {
            status['_models.dev'] = {
                fetchedAt: modelsDevCache.fetchedAt,
                source: 'models.dev',
                count: Object.keys(modelsDevCache.data).length,
            };
        }

        return status;
    },

    /**
     * 检查提供商是否支持动态获取
     *
     * v3.4.2: 同时检查 API 动态获取和 models.dev 支持
     */
    supportsDynamicFetch(providerId: string): boolean {
        // 支持从提供商 API 直接获取，或者在 models.dev 中有数据
        return DYNAMIC_FETCH_PROVIDERS.includes(providerId) ||
               MODELS_DEV_PROVIDERS.includes(providerId);
    },

    /**
     * 检查提供商是否支持从 API 直接获取
     */
    supportsApiFetch(providerId: string): boolean {
        return DYNAMIC_FETCH_PROVIDERS.includes(providerId);
    },

    /**
     * 检查提供商是否在 models.dev 中
     *
     * @param providerId 提供商 ID
     * @returns 是否支持
     */
    async supportsModelsDev(providerId: string): Promise<boolean> {
        const providers = await this.getModelsDevProviders();
        return providers.includes(providerId);
    },

    /**
     * 初始化模型缓存服务
     *
     * v3.4.7: 在应用启动时调用，预加载持久化的缓存到内存
     * 这样可以确保重启后缓存数据不会丢失
     *
     * @returns 加载的缓存状态
     */
    async initialize(): Promise<{ modelCacheLoaded: boolean; modelsDevCacheLoaded: boolean }> {
        let modelCacheLoaded = false;
        let modelsDevCacheLoaded = false;

        try {
            // 1. 加载模型缓存
            const modelCache = await loadCacheAsync();
            const modelCacheCount = Object.keys(modelCache).length;
            if (modelCacheCount > 0) {
                modelCacheLoaded = true;
                logger.info(LogTags.MODEL, '模型缓存已加载', {
                    providerCount: modelCacheCount,
                    providers: Object.keys(modelCache),
                });
            }

            // 2. 加载 models.dev 缓存到内存
            const modelsDevCache = await loadModelsDevCacheAsync();
            if (modelsDevCache && modelsDevCache.data) {
                this._modelsDevData = modelsDevCache.data;
                modelsDevCacheLoaded = true;
                const providerCount = Object.keys(modelsDevCache.data).length;
                const cacheAge = Date.now() - modelsDevCache.fetchedAt;
                const cacheAgeHours = Math.round(cacheAge / (1000 * 60 * 60));
                logger.info(LogTags.MODEL, 'models.dev 缓存已加载到内存', {
                    providerCount,
                    cacheAgeHours: `${cacheAgeHours}h`,
                    isExpired: cacheAge > CACHE_TTL,
                });
            }

            logger.info(LogTags.MODEL, '模型缓存服务初始化完成', {
                modelCacheLoaded,
                modelsDevCacheLoaded,
            });
        } catch (error) {
            logger.error(LogTags.MODEL, '模型缓存服务初始化失败', error);
        }

        return { modelCacheLoaded, modelsDevCacheLoaded };
    },
};

export default modelFetcher;
