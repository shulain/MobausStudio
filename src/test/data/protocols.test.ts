/**
 * 协议配置模块测试 (v4.1.46)
 *
 * 测试协议选择器显示逻辑、默认协议获取等功能
 */

import { describe, expect, it } from 'vitest';
import {
    PROTOCOLS,
    PROVIDER_DEFAULT_PROTOCOL,
    getDefaultProtocol,
    getProtocolInfo,
    shouldShowProtocolSelector,
    getEffectiveProtocol
} from '../../data/protocols';
import type { ProtocolType } from '../../types';

describe('protocols', () => {
    describe('PROTOCOLS', () => {
        it('should contain all protocol definitions', () => {
            expect(PROTOCOLS).toHaveLength(4);
            expect(PROTOCOLS.map(p => p.id)).toEqual(['openai', 'anthropic', 'google', 'aws']);
        });

        it('should have valid protocol info structure', () => {
            PROTOCOLS.forEach(protocol => {
                expect(protocol).toHaveProperty('id');
                expect(protocol).toHaveProperty('name');
                expect(protocol).toHaveProperty('label');
                expect(protocol).toHaveProperty('description');
                expect(protocol).toHaveProperty('useCases');

                // 验证多语言字段
                expect(protocol.label).toHaveProperty('zh');
                expect(protocol.label).toHaveProperty('en');
                expect(protocol.description).toHaveProperty('zh');
                expect(protocol.description).toHaveProperty('en');
                expect(protocol.useCases).toHaveProperty('zh');
                expect(protocol.useCases).toHaveProperty('en');
            });
        });
    });

    describe('shouldShowProtocolSelector', () => {
        // TC-PROTO-001: 测试协议选择器显示逻辑 - 自定义提供商（custom）
        it('TC-PROTO-001: should show protocol selector for "custom" provider', () => {
            expect(shouldShowProtocolSelector('custom')).toBe(true);
        });

        // TC-PROTO-002: 测试协议选择器显示逻辑 - 自定义提供商（带时间戳）
        it('TC-PROTO-002: should show protocol selector for custom provider with timestamp', () => {
            expect(shouldShowProtocolSelector('custom-1706000000000')).toBe(true);
            expect(shouldShowProtocolSelector('custom-123')).toBe(true);
            expect(shouldShowProtocolSelector('custom-abc')).toBe(true);
        });

        // TC-PROTO-003: 测试协议选择器显示逻辑 - OpenAI 提供商
        it('TC-PROTO-003: should not show protocol selector for OpenAI provider', () => {
            expect(shouldShowProtocolSelector('openai')).toBe(false);
        });

        // TC-PROTO-004: 测试协议选择器显示逻辑 - Anthropic 提供商
        it('TC-PROTO-004: should not show protocol selector for Anthropic provider', () => {
            expect(shouldShowProtocolSelector('anthropic')).toBe(false);
        });

        // TC-PROTO-005: 测试协议选择器显示逻辑 - 未知提供商
        it('TC-PROTO-005: should show protocol selector for unknown provider', () => {
            expect(shouldShowProtocolSelector('unknown-provider')).toBe(true);
            expect(shouldShowProtocolSelector('my-custom-api')).toBe(true);
        });

        it('should handle case-insensitive provider IDs', () => {
            expect(shouldShowProtocolSelector('CUSTOM')).toBe(true);
            expect(shouldShowProtocolSelector('Custom-123')).toBe(true);
            expect(shouldShowProtocolSelector('OPENAI')).toBe(false);
        });

        it('should not show for built-in providers', () => {
            const builtInProviders = [
                'openai', 'deepseek', 'groq', 'together', 'openrouter',
                'mistral', 'xai', 'fireworks', 'perplexity', 'cerebras',
                'ollama', 'lmstudio', 'qwen', 'github-copilot',
                'anthropic', 'google', 'kiro', 'bedrock'
            ];

            builtInProviders.forEach(provider => {
                expect(shouldShowProtocolSelector(provider)).toBe(false);
            });
        });
    });

    describe('getDefaultProtocol', () => {
        // TC-PROTO-011: 测试默认协议获取 - OpenAI
        it('TC-PROTO-011: should return "openai" for OpenAI provider', () => {
            expect(getDefaultProtocol('openai')).toBe('openai');
        });

        // TC-PROTO-012: 测试默认协议获取 - DeepSeek
        it('TC-PROTO-012: should return "openai" for DeepSeek provider', () => {
            expect(getDefaultProtocol('deepseek')).toBe('openai');
        });

        // TC-PROTO-013: 测试默认协议获取 - Anthropic
        it('TC-PROTO-013: should return "anthropic" for Anthropic provider', () => {
            expect(getDefaultProtocol('anthropic')).toBe('anthropic');
        });

        // TC-PROTO-014: 测试默认协议获取 - Google
        it('TC-PROTO-014: should return "google" for Google provider', () => {
            expect(getDefaultProtocol('google')).toBe('google');
        });

        // TC-PROTO-015: 测试默认协议获取 - Kiro
        it('TC-PROTO-015: should return "aws" for Kiro provider', () => {
            expect(getDefaultProtocol('kiro')).toBe('aws');
        });

        // TC-PROTO-016: 测试默认协议获取 - 自定义提供商
        it('TC-PROTO-016: should return "openai" for custom provider', () => {
            expect(getDefaultProtocol('custom')).toBe('openai');
            expect(getDefaultProtocol('custom-1706000000000')).toBe('openai');
        });

        // TC-PROTO-017: 测试默认协议获取 - 未知提供商
        it('TC-PROTO-017: should return "openai" for unknown provider', () => {
            expect(getDefaultProtocol('unknown-provider')).toBe('openai');
        });

        it('should handle case-insensitive provider IDs', () => {
            expect(getDefaultProtocol('OPENAI')).toBe('openai');
            expect(getDefaultProtocol('DeepSeek')).toBe('openai');
            expect(getDefaultProtocol('ANTHROPIC')).toBe('anthropic');
        });

        it('should return correct protocol for all OpenAI-compatible providers', () => {
            const openaiCompatible = [
                'openai', 'deepseek', 'groq', 'together', 'openrouter',
                'mistral', 'xai', 'fireworks', 'perplexity', 'cerebras',
                'ollama', 'lmstudio', 'qwen', 'github-copilot'
            ];

            openaiCompatible.forEach(provider => {
                expect(getDefaultProtocol(provider)).toBe('openai');
            });
        });

        it('should return correct protocol for AWS providers', () => {
            expect(getDefaultProtocol('kiro')).toBe('aws');
            expect(getDefaultProtocol('bedrock')).toBe('aws');
        });
    });

    describe('getProtocolInfo', () => {
        it('should return protocol info for valid protocol ID', () => {
            const openaiInfo = getProtocolInfo('openai');
            expect(openaiInfo).toBeDefined();
            expect(openaiInfo?.id).toBe('openai');
            expect(openaiInfo?.name).toBe('OpenAI Chat Completions');
        });

        it('should return undefined for invalid protocol ID', () => {
            const invalidInfo = getProtocolInfo('invalid' as ProtocolType);
            expect(invalidInfo).toBeUndefined();
        });

        it('should return correct info for all protocols', () => {
            const protocols: ProtocolType[] = ['openai', 'anthropic', 'google', 'aws'];

            protocols.forEach(protocolId => {
                const info = getProtocolInfo(protocolId);
                expect(info).toBeDefined();
                expect(info?.id).toBe(protocolId);
            });
        });
    });

    describe('PROVIDER_DEFAULT_PROTOCOL', () => {
        it('should have mappings for all built-in providers', () => {
            expect(PROVIDER_DEFAULT_PROTOCOL).toHaveProperty('openai');
            expect(PROVIDER_DEFAULT_PROTOCOL).toHaveProperty('anthropic');
            expect(PROVIDER_DEFAULT_PROTOCOL).toHaveProperty('google');
            expect(PROVIDER_DEFAULT_PROTOCOL).toHaveProperty('kiro');
            expect(PROVIDER_DEFAULT_PROTOCOL).toHaveProperty('custom');
        });

        it('should map providers to valid protocol types', () => {
            const validProtocols: ProtocolType[] = ['openai', 'anthropic', 'google', 'aws'];

            Object.values(PROVIDER_DEFAULT_PROTOCOL).forEach(protocol => {
                expect(validProtocols).toContain(protocol);
            });
        });
    });

    describe('Protocol Configuration Integration', () => {
        // TC-PROTO-INT-001: 测试完整流程 - 创建自定义提供商
        it('TC-PROTO-INT-001: should support creating custom provider with Anthropic protocol', () => {
            const providerId = 'custom-1706000000000';

            // 1. 检查是否显示协议选择器
            expect(shouldShowProtocolSelector(providerId)).toBe(true);

            // 2. 获取默认协议
            const defaultProtocol = getDefaultProtocol(providerId);
            expect(defaultProtocol).toBe('openai');

            // 3. 用户选择 Anthropic 协议
            const selectedProtocol: ProtocolType = 'anthropic';
            const protocolInfo = getProtocolInfo(selectedProtocol);
            expect(protocolInfo).toBeDefined();
            expect(protocolInfo?.id).toBe('anthropic');
        });

        // TC-PROTO-INT-002: 测试完整流程 - 内置提供商
        it('TC-PROTO-INT-002: should use default protocol for built-in providers', () => {
            const providerId = 'openai';

            // 1. 不显示协议选择器
            expect(shouldShowProtocolSelector(providerId)).toBe(false);

            // 2. 自动使用默认协议
            const protocol = getDefaultProtocol(providerId);
            expect(protocol).toBe('openai');
        });

        // TC-PROTO-INT-003: 测试完整流程 - 多个自定义提供商
        it('TC-PROTO-INT-003: should support multiple custom providers with different protocols', () => {
            const providers = [
                { id: 'custom-1', protocol: 'openai' as ProtocolType },
                { id: 'custom-2', protocol: 'anthropic' as ProtocolType },
                { id: 'custom-3', protocol: 'google' as ProtocolType },
            ];

            providers.forEach(({ id, protocol }) => {
                expect(shouldShowProtocolSelector(id)).toBe(true);
                const info = getProtocolInfo(protocol);
                expect(info).toBeDefined();
                expect(info?.id).toBe(protocol);
            });
        });
    });

    describe('getEffectiveProtocol (v0.9.4)', () => {
        // TC-PROTO-PRIORITY-001: 模型指定协议
        it('TC-PROTO-PRIORITY-001: should use model protocol when specified', () => {
            const result = getEffectiveProtocol('anthropic', 'openai', 'custom-xxx');
            expect(result).toBe('anthropic');
        });

        // TC-PROTO-PRIORITY-002: 模型未指定，使用提供商
        it('TC-PROTO-PRIORITY-002: should use provider protocol when model not specified', () => {
            const result = getEffectiveProtocol(undefined, 'google', 'custom-xxx');
            expect(result).toBe('google');
        });

        // TC-PROTO-PRIORITY-003: 都未指定，使用推断
        it('TC-PROTO-PRIORITY-003: should infer protocol when both not specified', () => {
            const result = getEffectiveProtocol(undefined, undefined, 'openai');
            expect(result).toBe('openai');
        });

        // TC-PROTO-PRIORITY-004: 自定义提供商推断
        it('TC-PROTO-PRIORITY-004: should infer openai for custom provider', () => {
            const result = getEffectiveProtocol(undefined, undefined, 'custom-xxx');
            expect(result).toBe('openai');
        });

        it('should prioritize model protocol over provider protocol', () => {
            // 模型选择 anthropic，提供商默认 openai
            expect(getEffectiveProtocol('anthropic', 'openai', 'custom-1')).toBe('anthropic');

            // 模型选择 google，提供商默认 aws
            expect(getEffectiveProtocol('google', 'aws', 'custom-2')).toBe('google');
        });

        it('should use provider protocol when model protocol is undefined', () => {
            expect(getEffectiveProtocol(undefined, 'anthropic', 'custom-1')).toBe('anthropic');
            expect(getEffectiveProtocol(undefined, 'google', 'custom-2')).toBe('google');
            expect(getEffectiveProtocol(undefined, 'aws', 'custom-3')).toBe('aws');
        });

        it('should infer protocol from provider ID when both are undefined', () => {
            // 内置提供商
            expect(getEffectiveProtocol(undefined, undefined, 'openai')).toBe('openai');
            expect(getEffectiveProtocol(undefined, undefined, 'anthropic')).toBe('anthropic');
            expect(getEffectiveProtocol(undefined, undefined, 'google')).toBe('google');
            expect(getEffectiveProtocol(undefined, undefined, 'kiro')).toBe('aws');

            // 自定义提供商（默认 openai）
            expect(getEffectiveProtocol(undefined, undefined, 'custom')).toBe('openai');
            expect(getEffectiveProtocol(undefined, undefined, 'custom-123')).toBe('openai');
        });

        it('should handle all protocol types correctly', () => {
            const protocols: ProtocolType[] = ['openai', 'anthropic', 'google', 'aws'];

            protocols.forEach(protocol => {
                // 模型指定协议
                expect(getEffectiveProtocol(protocol, undefined, 'custom-1')).toBe(protocol);

                // 提供商指定协议
                expect(getEffectiveProtocol(undefined, protocol, 'custom-2')).toBe(protocol);
            });
        });
    });
});
