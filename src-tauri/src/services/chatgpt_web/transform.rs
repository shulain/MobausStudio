//! 协议转换模块
//!
//! 负责 Chat Completions API ⇔ Codex Responses API 之间的双向转换：
//! - 请求转换：Chat Completions → Responses API
//! - 响应转换：Responses SSE 事件 → Chat Completions chunk
//!
//! @module services/chatgpt_web/transform
//! @version 0.1.0

use super::types::*;
use serde_json::json;

// ==================== 请求转换：Chat Completions → Responses API ====================

/// 将标准 Chat Completions 请求转换为 Codex Responses API 请求
///
/// 转换规则：
/// 1. messages → input（逐条转换角色和内容格式）
/// 2. system 消息提取到 instructions 字段（OAuth 不支持 input 中的 system）
/// 3. 强制 store=false, stream=true
/// 4. 删除 OAuth 不支持的采样参数（temperature, top_p, max_output_tokens）
///
/// @param req 标准 Chat Completions 请求
/// @param model_override 覆盖模型名（已规范化的 Codex 模型 ID）
/// @returns Codex Responses API 请求
pub fn chat_completions_to_responses(
    req: &ChatCompletionsRequest,
    model_override: &str,
) -> ResponsesRequest {
    let mut input: Vec<serde_json::Value> = Vec::new();
    let mut instructions: Option<String> = None;

    // 逐条转换消息
    for msg in &req.messages {
        match msg.role.as_str() {
            "system" => {
                // OAuth 模式下 system 消息需要提取到 instructions
                let text = extract_text_content(&msg.content);
                match &mut instructions {
                    Some(existing) => {
                        existing.push('\n');
                        existing.push_str(&text);
                    }
                    None => instructions = Some(text),
                }
            }
            "user" => {
                let content = convert_user_content(&msg.content);
                input.push(json!({
                    "role": "user",
                    "content": content,
                }));
            }
            "assistant" => {
                // 有 tool_calls 时，每个 tool_call 拆分为独立的 function_call item
                if let Some(tool_calls) = &msg.tool_calls {
                    for tc in tool_calls {
                        let call_id = normalize_call_id(&tc.id);
                        input.push(json!({
                            "type": "function_call",
                            "call_id": call_id,
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        }));
                    }
                }
                // 有文本内容时，转为 output_text
                let text = extract_text_content(&msg.content);
                if !text.is_empty() {
                    input.push(json!({
                        "role": "assistant",
                        "content": [{
                            "type": "output_text",
                            "text": text,
                        }],
                    }));
                }
            }
            "tool" => {
                // tool 消息转为 function_call_output
                let output = extract_text_content(&msg.content);
                let call_id = msg.tool_call_id.as_deref().unwrap_or("");
                let call_id = normalize_call_id(call_id);
                input.push(json!({
                    "type": "function_call_output",
                    "call_id": call_id,
                    "output": if output.is_empty() { "(empty)".to_string() } else { output },
                }));
            }
            _ => {
                // 未知角色，按 user 处理
                let text = extract_text_content(&msg.content);
                if !text.is_empty() {
                    input.push(json!({
                        "role": "user",
                        "content": [{ "type": "input_text", "text": text }],
                    }));
                }
            }
        }
    }

    // 默认 instructions
    if instructions.is_none() || instructions.as_ref().is_none_or(|s| s.trim().is_empty()) {
        instructions = Some("You are a helpful coding assistant.".to_string());
    }

    ResponsesRequest {
        model: model_override.to_string(),
        input,
        instructions,
        // OAuth 不支持这些采样参数，强制删除
        max_output_tokens: None,
        temperature: None,
        top_p: None,
        stream: true,
        store: false,
        tools: req.tools.clone(),
        tool_choice: req.tool_choice.clone(),
        reasoning: req.reasoning_effort.as_ref().map(|effort| ReasoningConfig {
            effort: effort.clone(),
            summary: Some("auto".to_string()),
        }),
        service_tier: req.service_tier.clone(),
        include: vec!["reasoning.encrypted_content".to_string()],
    }
}

// ==================== 响应转换：Responses SSE → Chat Completions chunk ====================

/// SSE 流转换上下文，跟踪跨事件的状态
pub struct StreamContext {
    /// 响应 ID（来自 response.created 事件）
    pub response_id: String,
    /// 原始请求的模型名
    pub model: String,
    /// 创建时间戳
    pub created: u64,
    /// 当前工具调用计数器（用于 tool_calls 数组的 index）
    pub tool_call_index: u32,
    /// 映射 output_index -> tool_call_index
    pub tool_call_map: std::collections::HashMap<u32, u32>,
    /// 是否包含 usage（来自 stream_options.include_usage）
    pub include_usage: bool,
}

impl StreamContext {
    pub fn new(model: &str, include_usage: bool) -> Self {
        Self {
            response_id: generate_chunk_id(),
            model: model.to_string(),
            created: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            tool_call_index: 0,
            tool_call_map: std::collections::HashMap::new(),
            include_usage,
        }
    }
}

/// 将单个 Responses SSE 事件转换为 0~N 个 Chat Completions chunks
///
/// @param event 上游 SSE 事件
/// @param ctx 流转换上下文（跨事件状态）
/// @returns 转换后的 chunk 列表
pub fn responses_event_to_chunks(
    event: &ResponsesStreamEvent,
    ctx: &mut StreamContext,
) -> Vec<ChatCompletionChunk> {
    let mut chunks = Vec::new();

    match event.event_type.as_str() {
        // response.created: 发送 role 声明
        "response.created" => {
            // 更新 response_id
            if let Some(ref resp) = event.response {
                if let Some(ref id) = resp.id {
                    ctx.response_id = id.clone();
                }
            }
            chunks.push(make_chunk(
                ctx,
                ChunkDelta {
                    role: Some("assistant".to_string()),
                    content: None,
                    tool_calls: None,
                    reasoning_content: None,
                },
                None,
            ));
        }

        // response.output_text.delta: 文本增量
        "response.output_text.delta" => {
            if !event.delta.is_empty() {
                chunks.push(make_chunk(
                    ctx,
                    ChunkDelta {
                        role: None,
                        content: Some(event.delta.clone()),
                        tool_calls: None,
                        reasoning_content: None,
                    },
                    None,
                ));
            }
        }

        // response.output_item.added: 新的输出项开始（可能是 function_call）
        "response.output_item.added" => {
            if let Some(ref item) = event.item {
                if item.item_type.as_deref() == Some("function_call") {
                    // 记录 output_index 与 tool_call_index 的映射
                    ctx.tool_call_map.insert(event.output_index, ctx.tool_call_index);

                    let tc = ChunkToolCall {
                        index: ctx.tool_call_index,
                        id: item.call_id.clone(),
                        call_type: Some("function".to_string()),
                        function: Some(ChunkFunctionCall {
                            name: item.name.clone(),
                            arguments: None,
                        }),
                    };
                    chunks.push(make_chunk(
                        ctx,
                        ChunkDelta {
                            role: None,
                            content: None,
                            tool_calls: Some(vec![tc]),
                            reasoning_content: None,
                        },
                        None,
                    ));
                    ctx.tool_call_index += 1;
                }
            }
        }

        // response.function_call_arguments.delta: 工具调用参数增量
        "response.function_call_arguments.delta" => {
            if !event.delta.is_empty() {
                // 根据 output_index 查找对应的 tool_call_index，如果找不到则回退到最新的
                let index = *ctx.tool_call_map.get(&event.output_index).unwrap_or(&{
                    if ctx.tool_call_index > 0 {
                        ctx.tool_call_index - 1
                    } else {
                        0
                    }
                });
                let tc = ChunkToolCall {
                    index,
                    id: None,
                    call_type: None,
                    function: Some(ChunkFunctionCall {
                        name: None,
                        arguments: Some(event.delta.clone()),
                    }),
                };
                chunks.push(make_chunk(
                    ctx,
                    ChunkDelta {
                        role: None,
                        content: None,
                        tool_calls: Some(vec![tc]),
                        reasoning_content: None,
                    },
                    None,
                ));
            }
        }

        // response.reasoning_summary_text.delta: 推理摘要增量
        "response.reasoning_summary_text.delta" => {
            if !event.delta.is_empty() {
                chunks.push(make_chunk(
                    ctx,
                    ChunkDelta {
                        role: None,
                        content: None,
                        tool_calls: None,
                        reasoning_content: Some(event.delta.clone()),
                    },
                    None,
                ));
            }
        }

        // response.completed: 完成
        "response.completed" => {
            let finish_reason = determine_finish_reason(event, ctx.tool_call_index > 0);
            // 发送 finish chunk
            chunks.push(make_chunk(
                ctx,
                ChunkDelta {
                    role: None,
                    content: None,
                    tool_calls: None,
                    reasoning_content: None,
                },
                Some(finish_reason),
            ));

            // 如果需要，发送 usage chunk
            if ctx.include_usage {
                if let Some(ref resp) = event.response {
                    if let Some(ref usage) = resp.usage {
                        let input = usage.input_tokens.unwrap_or(0);
                        let output = usage.output_tokens.unwrap_or(0);
                        chunks.push(ChatCompletionChunk {
                            id: ctx.response_id.clone(),
                            object: "chat.completion.chunk".to_string(),
                            created: ctx.created,
                            model: ctx.model.clone(),
                            choices: vec![],
                            usage: Some(UsageInfo {
                                prompt_tokens: input,
                                completion_tokens: output,
                                total_tokens: input + output,
                            }),
                        });
                    }
                }
            }
        }

        // response.incomplete: 不完整（被截断）
        "response.incomplete" => {
            let reason = event
                .response
                .as_ref()
                .and_then(|r| r.incomplete_details.as_ref())
                .and_then(|d| d.reason.as_deref());
            let finish_reason = if reason == Some("max_output_tokens") {
                "length"
            } else {
                "stop"
            };
            chunks.push(make_chunk(
                ctx,
                ChunkDelta {
                    role: None,
                    content: None,
                    tool_calls: None,
                    reasoning_content: None,
                },
                Some(finish_reason.to_string()),
            ));
        }

        // 其他事件忽略
        _ => {}
    }

    chunks
}

// ==================== 辅助函数 ====================

/// 从 content 字段提取纯文本
fn extract_text_content(content: &Option<serde_json::Value>) -> String {
    match content {
        None => String::new(),
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Array(parts)) => {
            let mut text = String::new();
            for part in parts {
                if let Some(t) = part.get("text").and_then(|v| v.as_str()) {
                    if part.get("type").and_then(|v| v.as_str()) == Some("text") {
                        text.push_str(t);
                    }
                }
            }
            text
        }
        _ => String::new(),
    }
}

/// 转换 user 消息的 content（处理文本和图片 parts）
fn convert_user_content(content: &Option<serde_json::Value>) -> serde_json::Value {
    match content {
        None => json!([]),
        Some(serde_json::Value::String(s)) => {
            json!([{ "type": "input_text", "text": s }])
        }
        Some(serde_json::Value::Array(parts)) => {
            let converted: Vec<serde_json::Value> = parts
                .iter()
                .filter_map(|part| {
                    let part_type = part.get("type").and_then(|v| v.as_str())?;
                    match part_type {
                        "text" => {
                            let text = part.get("text").and_then(|v| v.as_str()).unwrap_or("");
                            Some(json!({ "type": "input_text", "text": text }))
                        }
                        "image_url" => {
                            let url = part
                                .get("image_url")
                                .and_then(|v| v.get("url"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            Some(json!({ "type": "input_image", "image_url": url }))
                        }
                        _ => None,
                    }
                })
                .collect();
            serde_json::Value::Array(converted)
        }
        _ => json!([]),
    }
}

/// 规范化 call_id（call_ 前缀转为 fc）
fn normalize_call_id(id: &str) -> String {
    if let Some(stripped) = id.strip_prefix("call_") {
        format!("fc{}", stripped)
    } else {
        id.to_string()
    }
}

/// 确定 finish_reason
fn determine_finish_reason(event: &ResponsesStreamEvent, has_tool_calls: bool) -> String {
    if let Some(ref resp) = event.response {
        match resp.status.as_deref() {
            Some("completed") => {
                if has_tool_calls {
                    "tool_calls".to_string()
                } else {
                    "stop".to_string()
                }
            }
            Some("incomplete") => {
                let reason = resp
                    .incomplete_details
                    .as_ref()
                    .and_then(|d| d.reason.as_deref());
                if reason == Some("max_output_tokens") {
                    "length".to_string()
                } else {
                    "stop".to_string()
                }
            }
            _ => "stop".to_string(),
        }
    } else {
        "stop".to_string()
    }
}

/// 生成 chunk ID
fn generate_chunk_id() -> String {
    format!(
        "chatcmpl-{}",
        &uuid::Uuid::new_v4().to_string().replace("-", "")[..24]
    )
}

/// 构造一个 ChatCompletionChunk
fn make_chunk(
    ctx: &StreamContext,
    delta: ChunkDelta,
    finish_reason: Option<String>,
) -> ChatCompletionChunk {
    ChatCompletionChunk {
        id: ctx.response_id.clone(),
        object: "chat.completion.chunk".to_string(),
        created: ctx.created,
        model: ctx.model.clone(),
        choices: vec![ChunkChoice {
            index: 0,
            delta,
            finish_reason,
        }],
        usage: None,
    }
}
