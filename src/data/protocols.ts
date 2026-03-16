/**
 * 协议配置数据 (v0.9.0)
 *
 * 定义支持的 AI 服务通信协议及其配置
 *
 * @module data/protocols
 * @version 0.9.0
 */

import type { ProtocolType } from '../types';

/**
 * 协议信息定义
 */
export interface ProtocolInfo {
    /** 协议 ID */
    id: ProtocolType;
    /** 显示名称 */
    name: string;
    /** 多语言名称 */
    label: { zh: string; en: string };
    /** 协议描述 */
    description: { zh: string; en: string };
    /** 适用场景说明 */
    useCases: { zh: string; en: string };
}

/**
 * 内置协议配置列表
 */
export const PROTOCOLS: ProtocolInfo[] = [
    {
        id: 'openai',
        name: 'OpenAI Chat Completions',
        label: { zh: 'OpenAI 兼容', en: 'OpenAI Compatible' },
        description: {
            zh: 'OpenAI Chat Completions API 协议',
            en: 'OpenAI Chat Completions API protocol',
        },
        useCases: {
            zh: '适用于 OpenAI、DeepSeek、Groq、Together、Ollama 等兼容服务',
            en: 'For OpenAI, DeepSeek, Groq, Together, Ollama and other compatible services',
        },
    },
    {
        id: 'anthropic',
        name: 'Anthropic Messages',
        label: { zh: 'Anthropic 兼容', en: 'Anthropic Compatible' },
        description: {
            zh: 'Anthropic Messages API 协议',
            en: 'Anthropic Messages API protocol',
        },
        useCases: {
            zh: '适用于 Claude API 兼容服务',
            en: 'For Claude API compatible services',
        },
    },
    {
        id: 'google',
        name: 'Google Gemini',
        label: { zh: 'Google Gemini', en: 'Google Gemini' },
        description: {
            zh: 'Google Gemini / Cloud Code API 协议',
            en: 'Google Gemini / Cloud Code API protocol',
        },
        useCases: {
            zh: '适用于 Gemini API 兼容服务',
            en: 'For Gemini API compatible services',
        },
    },
    {
        id: 'aws',
        name: 'AWS Bedrock',
        label: { zh: 'AWS Bedrock', en: 'AWS Bedrock' },
        description: {
            zh: 'AWS Bedrock / Amazon Q API 协议',
            en: 'AWS Bedrock / Amazon Q API protocol',
        },
        useCases: {
            zh: '适用于 AWS Bedrock、Kiro 等服务',
            en: 'For AWS Bedrock, Kiro and similar services',
        },
    },
];

/**
 * 提供商默认协议映射
 *
 * 内置提供商自动匹配对应协议，无需用户选择
 * 自定义提供商默认使用 OpenAI 协议
 */
export const PROVIDER_DEFAULT_PROTOCOL: Record<string, ProtocolType> = {
    // ===== OpenAI 兼容 =====
    'openai': 'openai',
    'deepseek': 'openai',
    'groq': 'openai',
    'together': 'openai',
    'openrouter': 'openai',
    'mistral': 'openai',
    'xai': 'openai',
    'fireworks': 'openai',
    'perplexity': 'openai',
    'cerebras': 'openai',
    'ollama': 'openai',
    'lmstudio': 'openai',
    'qwen': 'openai',
    'github-copilot': 'openai',
    'custom': 'openai',

    // ===== Anthropic =====
    'anthropic': 'anthropic',

    // ===== Google =====
    'google': 'google',

    // ===== AWS =====
    'kiro': 'aws',
    'bedrock': 'aws',
};

/**
 * 获取提供商的默认协议
 *
 * @param providerId 提供商 ID
 * @returns 默认协议类型
 */
export function getDefaultProtocol(providerId: string): ProtocolType {
    const lowerId = providerId.toLowerCase();
    return PROVIDER_DEFAULT_PROTOCOL[lowerId] || 'openai';
}

/**
 * 获取协议信息
 *
 * @param protocolId 协议 ID
 * @returns 协议信息，未找到返回 undefined
 */
export function getProtocolInfo(protocolId: ProtocolType): ProtocolInfo | undefined {
    return PROTOCOLS.find(p => p.id === protocolId);
}

/**
 * 判断提供商是否需要显示协议选择器
 *
 * 只有自定义提供商需要显示协议选择器
 * 内置提供商自动使用对应协议
 *
 * v4.1.46: 支持识别 custom-xxx 格式的自定义提供商 ID
 *
 * @param providerId 提供商 ID
 * @returns 是否需要显示协议选择器
 */
export function shouldShowProtocolSelector(providerId: string): boolean {
    const lowerId = providerId.toLowerCase();
    // 自定义提供商需要显示协议选择器
    // 支持 "custom" 或 "custom-xxx" 格式
    return lowerId === 'custom' || lowerId.startsWith('custom-') || !PROVIDER_DEFAULT_PROTOCOL[lowerId];
}

/**
 * 获取模型的有效协议（考虑优先级）
 *
 * v0.9.4: 实现协议优先级逻辑
 * 优先级：模型协议 > 提供商默认协议 > 推断协议
 *
 * @param modelProtocol 模型指定的协议
 * @param providerProtocol 提供商的默认协议
 * @param providerId 提供商 ID（用于推断）
 * @returns 有效的协议类型
 */
export function getEffectiveProtocol(
    modelProtocol: ProtocolType | undefined,
    providerProtocol: ProtocolType | undefined,
    providerId: string
): ProtocolType {
    // 1. 优先使用模型指定的协议
    if (modelProtocol) {
        return modelProtocol;
    }

    // 2. 其次使用提供商的默认协议
    if (providerProtocol) {
        return providerProtocol;
    }

    // 3. 最后根据提供商 ID 推断
    return getDefaultProtocol(providerId);
}

