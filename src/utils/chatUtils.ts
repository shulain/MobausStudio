/**
 * 聊天工具函数模块
 *
 * 提供聊天相关的工具函数：
 * - buildApiMessages: 构造 API 请求消息列表
 * - 处理多模态消息格式转换（文本 + 图片）
 * - 滑动窗口机制：限制历史消息数量，降低 token 消耗
 *
 * @module utils/chatUtils
 */

import type { Attachment, Message } from '../types';

// ==================== 配置常量 ====================

/**
 * 默认历史消息窗口大小
 *
 * v4.1.38: 从 100 条调整为 50 条
 * - 50 条消息约 10k tokens（假设每条 200 tokens）
 * - 覆盖 95% 的使用场景（大多数对话在 30 轮内结束）
 * - 在保留足够上下文的同时，最大化成本节省
 */
export const DEFAULT_MAX_HISTORY_MESSAGES = 50;

// ==================== 类型定义 ====================

/**
 * 文本内容部分
 * 用于多模态消息中的文本内容
 */
interface TextContentPart {
    type: 'text';
    text: string;
}

/**
 * 图片内容部分
 * 用于多模态消息中的图片内容
 * 支持 base64 或 URL 格式
 */
interface ImageContentPart {
    type: 'image_url';
    image_url: {
        url: string;  // base64 data URL 或 http(s) URL
    };
}

/**
 * 消息内容部分联合类型
 * 支持文本和图片两种类型
 */
type ContentPart = TextContentPart | ImageContentPart;

/**
 * API 消息格式
 * 兼容 OpenAI/Anthropic 等主流 API 格式
 * v4.1.24: 扩展支持工具调用和工具结果消息
 */
export interface ApiMessage {
    /** 消息角色：user/assistant/system/tool */
    role: string;
    /** 消息内容：纯文本或多模态内容数组 */
    content: string | ContentPart[];
    /** 工具调用列表（assistant 消息） */
    tool_calls?: Array<{
        id: string;
        type: string;
        function: {
            name: string;
            arguments: string;
        };
        // v4.1.37: Gemini thinking 模型多轮对话需要
        thought_signature?: string;
    }>;
    /** 工具调用 ID（tool 消息） */
    tool_call_id?: string;
}

// ==================== 工具函数 ====================

/**
 * 构造用于 API 请求的消息列表
 *
 * 将应用内部的 Message 格式转换为 API 请求所需的格式。
 * 主要处理多模态消息（文本 + 图片）的格式转换。
 *
 * v4.1.38: 添加滑动窗口机制，限制历史消息数量以降低 token 消耗
 *
 * @param historyMessages - 历史消息列表（不包含当前消息）
 * @param currentContent - 当前用户输入的文本内容
 * @param currentAttachments - 当前用户上传的附件列表
 * @param maxHistoryMessages - 最大历史消息数量（默认 50 条）
 * @param stripToolImages - 是否移除工具结果中的 base64 图片（默认 false）
 * @returns 格式化后的 API 消息列表
 *
 * @example
 * // 纯文本消息
 * const messages = buildApiMessages([], '你好', []);
 * // 返回: [{ role: 'user', content: '你好' }]
 *
 * @example
 * // 带图片的多模态消息
 * const messages = buildApiMessages([], '这是什么？', [
 *   { id: '1', type: 'image', url: 'data:image/png;base64,...', name: 'photo.png' }
 * ]);
 * // 返回: [{
 * //   role: 'user',
 * //   content: [
 * //     { type: 'text', text: '这是什么？' },
 * //     { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }
 * //   ]
 * // }]
 *
 * @example
 * // 自定义窗口大小
 * const messages = buildApiMessages(history, '继续', [], 100);
 * // 保留最近 100 条历史消息
 */
export const buildApiMessages = (
    historyMessages: Message[],
    currentContent: string,
    currentAttachments: Attachment[],
    maxHistoryMessages: number = DEFAULT_MAX_HISTORY_MESSAGES,
    stripToolImages: boolean = false
): ApiMessage[] => {

    /**
     * 将附件列表转换为图片内容部分
     * 只处理 type='image' 的附件
     */
    const attachmentsToImageParts = (attachments: Attachment[]): ImageContentPart[] => {
        return attachments
            .filter(a => a.type === 'image')
            .map(a => ({
                type: 'image_url' as const,
                image_url: { url: a.url }
            }));
    };

    /**
     * 将单条消息转换为 API 格式
     * 如果有图片附件，转换为多模态格式；否则保持纯文本
     */
    const messageToApiFormat = (message: Message): ApiMessage => {
        // 检查是否有图片附件
        const images = message.attachments
            ? attachmentsToImageParts(message.attachments)
            : [];

        // 有图片时使用多模态格式
        if (images.length > 0) {
            return {
                role: message.role,
                content: [
                    { type: 'text', text: message.content },
                    ...images
                ]
            };
        }

        // 无图片时使用纯文本格式
        return {
            role: message.role,
            content: message.content
        };
    };

    // ==================== 滑动窗口处理 ====================
    // v4.1.38: 限制历史消息数量，避免长对话的 token 二次增长
    // 只保留最近 maxHistoryMessages 条消息
    let windowedHistory = historyMessages.slice(-maxHistoryMessages);

    // 确保工具调用完整性：如果窗口第一条是包含 toolResults 的消息，
    // 需要向前查找对应的包含 toolCalls 的 assistant 消息
    // 否则会导致 tool_call_id 找不到对应的 tool_calls，API 返回 400 错误
    if (windowedHistory.length > 0 && windowedHistory.length < historyMessages.length) {
        const firstMsg = windowedHistory[0];

        // 检查第一条消息是否包含 tool 结果
        if (firstMsg.toolResults && firstMsg.toolResults.length > 0) {
            const firstToolCallId = firstMsg.toolResults[0].callId;

            // 从完整历史中向前查找包含该 tool_call_id 的消息
            const assistantIndex = historyMessages.findIndex(
                m => m.toolCalls?.some(tc => tc.id === firstToolCallId)
            );

            // 如果找到了对应的 assistant 消息，从该消息开始截取
            if (assistantIndex >= 0) {
                windowedHistory = historyMessages.slice(assistantIndex);
            }
        }
    }

    // 处理历史消息：包含工具调用和工具结果消息
    // v4.1.24: 工具调用消息需要拆分为 assistant(tool_calls) + tool(result) 格式
    // v4.1.55: 直接生成 Anthropic 格式，避免 Rust 后端重复转换导致 tool_result 重复
    const formattedHistory: ApiMessage[] = [];
    for (const m of windowedHistory) {
        if (m.toolCalls && m.toolCalls.length > 0) {
            // 这是一条包含工具调用的 assistant 消息
            // 1. 添加 assistant 消息（带 tool_calls）
            formattedHistory.push({
                role: 'assistant',
                content: m.content || '',
                tool_calls: m.toolCalls.map(tc => ({
                    id: tc.id,
                    type: 'function',
                    function: {
                        name: `${tc.serverId}__${tc.name}`,
                        arguments: tc.arguments,
                    },
                    // v4.1.36: 传递 thought_signature（Gemini 2.5 thinking 模型需要）
                    ...(tc.thoughtSignature ? { thought_signature: tc.thoughtSignature } : {}),
                })),
            });
            // 2. 为每个工具调用添加对应的 tool 结果消息
            // v4.1.55: 生成 OpenAI 格式，让 Rust 后端统一转换成 Anthropic 格式
            if (m.toolResults) {
                for (const tr of m.toolResults) {
                    let toolContent = tr.content || '';
                    if (stripToolImages) {
                        toolContent = toolContent.replace(/!\[.*?\]\(data:image\/[^;]+;base64,[^)]+\)/g, '[图片已省略]');
                    }
                    formattedHistory.push({
                        role: 'tool',
                        content: toolContent,
                        tool_call_id: tr.callId,
                    });
                }
            }
        } else if (m.content) {
            // 普通消息（有内容）
            formattedHistory.push(messageToApiFormat(m));
        }
    }

    // 处理当前消息
    // v4.1.27: 如果 currentContent 为空且无附件，不添加多余的 user 消息
    // 工具续传场景下，functionResponse 后模型会自动继续，无需额外 user 消息
    if (!currentContent && currentAttachments.length === 0) {
        return formattedHistory;
    }

    const currentImages = attachmentsToImageParts(currentAttachments);
    const currentMessage: ApiMessage = currentImages.length > 0
        ? {
            role: 'user',
            content: [
                { type: 'text', text: currentContent },
                ...currentImages
            ]
        }
        : {
            role: 'user',
            content: currentContent
        };

    // 合并历史消息和当前消息
    return [...formattedHistory, currentMessage];
};
