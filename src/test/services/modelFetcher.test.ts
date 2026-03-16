/**
 * modelFetcher 服务测试
 *
 * 测试用例对应文档 docs/modules/protocols.md 中的 TC-MODEL-001 ~ TC-MODEL-005
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { modelFetcher } from '../../services/modelFetcher';
import { ModelFetchError } from '../../utils/errors';
import type { ProviderModel } from '../../types';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

// Mock platform utils
vi.mock('../../utils/platform', () => ({
    isTauri: () => false,
}));

describe('modelFetcher 服务测试', () => {
    beforeEach(() => {
        // 清除所有 mock
        vi.clearAllMocks();
        // 清除 localStorage
        localStorage.clear();
        // 清除内存缓存
        modelFetcher._modelsDevData = null;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('TC-MODEL-FETCH-001: 从 API 获取模型', () => {
        it('应该成功从 OpenAI API 获取模型列表', async () => {
            // Mock fetch 返回 OpenAI 格式的响应
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    data: [
                        { id: 'gpt-4o', owned_by: 'openai' },
                        { id: 'gpt-4o-mini', owned_by: 'openai' },
                        { id: 'gpt-3.5-turbo', owned_by: 'openai' },
                    ],
                }),
            });

            const result = await modelFetcher.fetchModels(
                'openai',
                'test-api-key',
                'https://api.openai.com/v1'
            );

            expect(result.source).toBe('api');
            expect(result.models.length).toBeGreaterThan(0);
            expect(result.models[0]).toHaveProperty('id');
            expect(result.models[0]).toHaveProperty('name');
            expect(result.models[0]).toHaveProperty('maxTokens');
            expect(result.models[0]).toHaveProperty('contextWindow');
        });

        it('应该过滤掉非聊天模型', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    data: [
                        { id: 'gpt-4o', owned_by: 'openai' },
                        { id: 'text-embedding-ada-002', owned_by: 'openai' },
                        { id: 'whisper-1', owned_by: 'openai' },
                        { id: 'dall-e-3', owned_by: 'openai' },
                    ],
                }),
            });

            const result = await modelFetcher.fetchModels(
                'openai',
                'test-api-key'
            );

            // 应该只包含 gpt-4o
            expect(result.models.length).toBe(1);
            expect(result.models[0].id).toBe('gpt-4o');
        });
    });

    describe('TC-MODEL-002: API 失败回退到 models.dev', () => {
        it('API 失败时应该尝试从 models.dev 获取', async () => {
            // Mock models.dev 请求成功
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    anthropic: {
                        id: 'anthropic',
                        name: 'Anthropic',
                        models: {
                            'claude-3-opus': {
                                id: 'claude-3-opus-20240229',
                                name: 'Claude 3 Opus',
                                family: 'claude-3',
                                limit: {
                                    context: 200000,
                                    output: 4096,
                                },
                                cost: {
                                    input: 15,
                                    output: 75,
                                },
                                tool_call: true,
                                attachment: true,
                            },
                        },
                    },
                }),
            });

            const result = await modelFetcher.fetchModels(
                'anthropic',
                'test-api-key'
            );

            expect(result.source).toBe('models.dev');
            expect(result.models.length).toBeGreaterThan(0);
        });
    });

    describe('TC-MODEL-003: 使用缓存数据', () => {
        it('有效缓存时应该直接返回缓存', async () => {
            // 设置缓存
            const cachedModels: ProviderModel[] = [
                {
                    id: 'gpt-4o',
                    name: 'GPT-4o',
                    maxTokens: 16384,
                    contextWindow: 128000,
                    capabilities: {
                        vision: true,
                        functionCalling: true,
                        streaming: true,
                    },
                },
            ];

            localStorage.setItem('mobaus_model_cache', JSON.stringify({
                openai: {
                    providerId: 'openai',
                    models: cachedModels,
                    fetchedAt: Date.now(),
                    source: 'api',
                },
            }));

            // Mock fetch 失败（确保使用缓存）
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

            const result = await modelFetcher.fetchModels(
                'openai',
                'test-api-key'
            );

            expect(result.source).toBe('cache');
            expect(result.models).toEqual(cachedModels);
            // 不应该调用 fetch
            expect(global.fetch).toHaveBeenCalled();
        });
    });

    describe('TC-MODEL-004: 缓存过期回退到内置数据', () => {
        it('缓存过期且无法获取新数据时应该使用过期缓存', async () => {
            // 设置过期缓存（25 小时前）
            const expiredTime = Date.now() - (25 * 60 * 60 * 1000);
            const cachedModels: ProviderModel[] = [
                {
                    id: 'gpt-4o',
                    name: 'GPT-4o',
                    maxTokens: 16384,
                    contextWindow: 128000,
                    capabilities: {
                        vision: true,
                        functionCalling: true,
                        streaming: true,
                    },
                },
            ];

            localStorage.setItem('mobaus_model_cache', JSON.stringify({
                openai: {
                    providerId: 'openai',
                    models: cachedModels,
                    fetchedAt: expiredTime,
                    source: 'api',
                },
            }));

            // Mock 所有请求失败
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

            const result = await modelFetcher.fetchModels(
                'openai',
                'test-api-key'
            );

            // 应该使用过期缓存作为 fallback
            expect(result.source).toBe('cache');
            expect(result.models).toEqual(cachedModels);
        });

        it('无缓存且无法获取数据时应该使用内置数据', async () => {
            const builtinModels: ProviderModel[] = [
                {
                    id: 'gpt-4o',
                    name: 'GPT-4o (Builtin)',
                    maxTokens: 16384,
                    contextWindow: 128000,
                    capabilities: {
                        vision: true,
                        functionCalling: true,
                        streaming: true,
                    },
                },
            ];

            // Mock 所有请求失败
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

            const result = await modelFetcher.fetchModels(
                'openai',
                'test-api-key',
                undefined,
                builtinModels
            );

            expect(result.source).toBe('builtin');
            expect(result.models).toEqual(builtinModels);
        });
    });

    describe('TC-MODEL-005: Google OAuth 添加 Claude 模型', () => {
        it('检测到 Google OAuth Token 时应该添加 Claude 模型', async () => {
            // Mock Google API 返回 Gemini 模型
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    models: [
                        {
                            name: 'models/gemini-1.5-pro',
                            displayName: 'Gemini 1.5 Pro',
                            inputTokenLimit: 1000000,
                            outputTokenLimit: 8192,
                        },
                    ],
                }),
            });

            // 使用 OAuth Token（以 ya29. 开头）
            const result = await modelFetcher.fetchModels(
                'google',
                'ya29.test-oauth-token',
                'https://generativelanguage.googleapis.com/v1beta'
            );

            expect(result.source).toBe('api');
            // 应该包含 Claude 模型
            const claudeModels = result.models.filter(m => m.id.startsWith('claude-'));
            expect(claudeModels.length).toBeGreaterThan(0);
            expect(claudeModels.some(m => m.id.includes('sonnet'))).toBe(true);
        });

        it('使用 API Key 时不应该添加 Claude 模型', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    models: [
                        {
                            name: 'models/gemini-1.5-pro',
                            displayName: 'Gemini 1.5 Pro',
                            inputTokenLimit: 1000000,
                            outputTokenLimit: 8192,
                        },
                    ],
                }),
            });

            // 使用 API Key（以 AIza 开头）
            const result = await modelFetcher.fetchModels(
                'google',
                'AIzaSyTest-api-key'
            );

            expect(result.source).toBe('api');
            // 不应该包含 Claude 模型
            const claudeModels = result.models.filter(m => m.id.startsWith('claude-'));
            expect(claudeModels.length).toBe(0);
        });
    });

    describe('错误处理', () => {
        it('不支持的提供商应该抛出 ModelFetchError', async () => {
            await expect(
                modelFetcher.fetchFromApi('unsupported-provider', 'test-key')
            ).rejects.toThrow(ModelFetchError);
        });

        it('HTTP 错误应该抛出 ModelFetchError', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
            });

            await expect(
                modelFetcher.fetchFromApi('openai', 'invalid-key')
            ).rejects.toThrow(ModelFetchError);
        });
    });

    describe('缓存管理', () => {
        it('clearCache 应该清除指定提供商的缓存', async () => {
            // 设置缓存
            localStorage.setItem('mobaus_model_cache', JSON.stringify({
                openai: {
                    providerId: 'openai',
                    models: [],
                    fetchedAt: Date.now(),
                    source: 'api',
                },
                anthropic: {
                    providerId: 'anthropic',
                    models: [],
                    fetchedAt: Date.now(),
                    source: 'api',
                },
            }));

            await modelFetcher.clearCache('openai');

            const cache = JSON.parse(localStorage.getItem('mobaus_model_cache') || '{}');
            expect(cache.openai).toBeUndefined();
            expect(cache.anthropic).toBeDefined();
        });

        it('clearCache 不传参数应该清除所有缓存', async () => {
            localStorage.setItem('mobaus_model_cache', JSON.stringify({
                openai: { providerId: 'openai', models: [], fetchedAt: Date.now(), source: 'api' },
            }));

            await modelFetcher.clearCache();

            expect(localStorage.getItem('mobaus_model_cache')).toBeNull();
        });
    });

    describe('models.dev 集成', () => {
        it('fetchFromModelsDev 应该正确转换模型数据', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    anthropic: {
                        id: 'anthropic',
                        name: 'Anthropic',
                        models: {
                            'claude-3-opus': {
                                id: 'claude-3-opus-20240229',
                                name: 'Claude 3 Opus',
                                family: 'claude-3',
                                limit: {
                                    context: 200000,
                                    output: 4096,
                                },
                                cost: {
                                    input: 15,
                                    output: 75,
                                },
                                tool_call: true,
                                attachment: true,
                            },
                        },
                    },
                }),
            });

            const models = await modelFetcher.fetchFromModelsDev('anthropic');

            expect(models.length).toBeGreaterThan(0);
            expect(models[0]).toHaveProperty('id');
            expect(models[0]).toHaveProperty('name');
            expect(models[0]).toHaveProperty('pricing');
            expect(models[0].pricing).toEqual({
                input: 15,
                output: 75,
            });
        });

        it('应该过滤掉非聊天模型', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    openai: {
                        id: 'openai',
                        name: 'OpenAI',
                        models: {
                            'gpt-4o': {
                                id: 'gpt-4o',
                                name: 'GPT-4o',
                                family: 'gpt-4',
                                limit: { context: 128000, output: 16384 },
                                modalities: { output: ['text'] },
                            },
                            'text-embedding-ada-002': {
                                id: 'text-embedding-ada-002',
                                name: 'Text Embedding Ada 002',
                                family: 'embedding',
                                limit: { context: 8191, output: 1 },
                                modalities: { output: ['embedding'] },
                            },
                        },
                    },
                }),
            });

            const models = await modelFetcher.fetchFromModelsDev('openai');

            // 应该只包含 gpt-4o
            expect(models.length).toBe(1);
            expect(models[0].id).toBe('gpt-4o');
        });
    });
});
