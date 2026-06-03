//! 数据结构定义
//!
//! 定义 Chat Completions API 和 Codex Responses API 之间的所有数据结构，
//! 以及 SSE 流事件类型。
//!
//! @module services/chatgpt_web/types
//! @version 0.1.0

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ==================== Chat Completions API 数据结构（标准 OpenAI 格式）====================

/// 标准 OpenAI Chat Completions 请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionsRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_completion_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_options: Option<StreamOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<Tool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service_tier: Option<String>,
}

/// 流选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_usage: Option<bool>,
}

/// Chat 消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// 工具调用
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: FunctionCall,
}

/// 函数调用
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

/// 工具定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tool {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: ToolFunction,
}

/// 工具函数定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolFunction {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<serde_json::Value>,
}

// ==================== Chat Completions 响应（标准 OpenAI 格式）====================

/// 标准 OpenAI Chat Completions 流式 chunk
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionChunk {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<ChunkChoice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<UsageInfo>,
}

/// Chunk 中的选项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkChoice {
    pub index: u32,
    pub delta: ChunkDelta,
    pub finish_reason: Option<String>,
}

/// Chunk 增量数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkDelta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ChunkToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
}

/// Chunk 中的工具调用增量
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkToolCall {
    pub index: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "type")]
    pub call_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function: Option<ChunkFunctionCall>,
}

/// Chunk 中的函数调用增量
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkFunctionCall {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<String>,
}

/// 使用量信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageInfo {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
}

// ==================== Codex Responses API 数据结构 ====================

/// Codex Responses API 请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponsesRequest {
    pub model: String,
    pub input: Vec<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instructions: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    pub stream: bool,
    pub store: bool,
    /// 工具定义（Responses API 扁平格式，使用 Value 以区分 Chat Completions 嵌套格式）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<ReasoningConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service_tier: Option<String>,
    /// 固定为 ["reasoning.encrypted_content"]
    pub include: Vec<String>,
}

/// 推理配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReasoningConfig {
    pub effort: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
}

// ==================== Responses API SSE 事件 ====================

/// Responses API 流式事件
#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct ResponsesStreamEvent {
    /// 事件类型：response.created, response.output_text.delta, response.completed 等
    #[serde(rename = "type")]
    pub event_type: String,
    /// response 对象（response.created/completed/failed 时有值）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<ResponsesResponse>,
    /// output item（output_item.added 时有值）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<ResponsesOutputItem>,
    /// 输出序号
    #[serde(default)]
    pub output_index: u32,
    /// 增量文本/参数
    #[serde(default)]
    pub delta: String,
    /// 完成时的完整文本
    #[serde(default)]
    pub text: String,
}

/// Responses 完整响应对象
#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct ResponsesResponse {
    pub id: Option<String>,
    pub status: Option<String>,
    #[serde(default)]
    pub output: Vec<ResponsesOutputItem>,
    pub usage: Option<ResponsesUsage>,
    /// incomplete 原因
    pub incomplete_details: Option<IncompleteDetails>,
    /// failed 时的错误信息
    pub error: Option<ResponsesErrorDetails>,
}

/// failed 时的错误详细信息
#[derive(Debug, Clone, Deserialize)]
pub struct ResponsesErrorDetails {
    pub message: Option<String>,
    #[serde(rename = "type")]
    pub error_type: Option<String>,
}

/// incomplete 详细信息
#[derive(Debug, Clone, Deserialize)]
pub struct IncompleteDetails {
    pub reason: Option<String>,
}

/// Responses 输出项
#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct ResponsesOutputItem {
    #[serde(rename = "type")]
    pub item_type: Option<String>,
    pub id: Option<String>,
    pub call_id: Option<String>,
    pub name: Option<String>,
    pub arguments: Option<String>,
    pub content: Option<Vec<ResponsesContentPart>>,
    pub text: Option<String>,
}

/// Responses 内容片段
#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct ResponsesContentPart {
    #[serde(rename = "type")]
    pub part_type: Option<String>,
    pub text: Option<String>,
}

/// Responses 使用量
#[derive(Debug, Clone, Deserialize)]
pub struct ResponsesUsage {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
}

// ==================== OAuth 相关 ====================

/// OAuth Token 响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthTokenResponse {
    pub access_token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id_token: Option<String>,
    pub token_type: String,
    pub expires_in: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
}

/// ChatGPT 账号凭证
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatGptCredentials {
    pub access_token: String,
    pub refresh_token: String,
    /// OAuth Client ID
    pub client_id: String,
    /// Token 过期时间（Unix 时间戳，秒）
    pub expires_at: u64,
    /// ID Token（JWT，包含 chatgpt_account_id 等）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id_token: Option<String>,
    /// 从 ID Token 解析出的 chatgpt_account_id
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chatgpt_account_id: Option<String>,
}

// ==================== Codex 模型映射 ====================

/// 将用户输入的模型名规范化为 Codex 端点支持的模型 ID
pub fn normalize_codex_model(model: &str) -> &'static str {
    // 精确匹配表
    static MODEL_MAP: once_cell::sync::Lazy<HashMap<&'static str, &'static str>> =
        once_cell::sync::Lazy::new(|| {
            let mut m = HashMap::new();
            // ChatGPT Web/Codex 账号模式当前实测可闭环的模型。
            // 注意：chatgpt.com/backend-api/models 会列出很多 ChatGPT 聊天模型，
            // 但 Codex Responses 端点会拒绝其中大多数模型。这里优先映射到
            // 已通过真实 store=false 流式 smoke test 的 gpt-5.4-mini。
            let chatgpt_web_default = "gpt-5.4-mini";

            // GPT-5.4 系列
            for suffix in &["", "-none", "-low", "-medium", "-high", "-xhigh"] {
                m.insert(
                    leak_string(format!("gpt-5.4{}", suffix)),
                    chatgpt_web_default,
                );
            }
            m.insert("gpt-5.4-mini", chatgpt_web_default);
            m.insert("gpt-5.4-nano", chatgpt_web_default);
            m.insert("gpt-5.2-chat-latest", chatgpt_web_default);

            // GPT-5.3 系列
            for suffix in &[
                "",
                "-codex",
                "-codex-none",
                "-codex-low",
                "-codex-medium",
                "-codex-high",
                "-codex-xhigh",
                "-none",
                "-low",
                "-medium",
                "-high",
                "-xhigh",
            ] {
                m.insert(
                    leak_string(format!("gpt-5.3{}", suffix)),
                    chatgpt_web_default,
                );
            }

            // GPT-5.2 系列
            for suffix in &["", "-none", "-low", "-medium", "-high", "-xhigh"] {
                m.insert(
                    leak_string(format!("gpt-5.2{}", suffix)),
                    chatgpt_web_default,
                );
            }
            for suffix in &["", "-none", "-low", "-medium", "-high", "-xhigh"] {
                m.insert(
                    leak_string(format!("gpt-5.2-codex{}", suffix)),
                    chatgpt_web_default,
                );
            }

            // GPT-5.1 系列
            for suffix in &["", "-none", "-low", "-medium", "-high", "-xhigh"] {
                m.insert(
                    leak_string(format!("gpt-5.1{}", suffix)),
                    chatgpt_web_default,
                );
                m.insert(
                    leak_string(format!("gpt-5.1-codex{}", suffix)),
                    chatgpt_web_default,
                );
                m.insert(
                    leak_string(format!("gpt-5.1-codex-max{}", suffix)),
                    chatgpt_web_default,
                );
                m.insert(
                    leak_string(format!("gpt-5.1-codex-mini{}", suffix)),
                    chatgpt_web_default,
                );
            }

            // GPT-5 通用别名
            m.insert("gpt-5", chatgpt_web_default);
            m.insert("gpt-5-mini", chatgpt_web_default);
            m.insert("gpt-5-nano", chatgpt_web_default);
            m.insert("gpt-5-codex", chatgpt_web_default);
            m.insert("gpt-5-codex-mini", chatgpt_web_default);
            m.insert("codex-mini-latest", chatgpt_web_default);

            m
        });

    // 精确匹配
    let lower = model.to_lowercase();
    if let Some(&mapped) = MODEL_MAP.get(lower.as_str()) {
        return mapped;
    }

    // 模糊匹配（包含关键词）
    let fuzzy_rules: &[(&str, &str)] = &[
        ("gpt-5.4-mini", "gpt-5.4-mini"),
        ("gpt-5.4-nano", "gpt-5.4-mini"),
        ("gpt-5.4", "gpt-5.4-mini"),
        ("gpt-5.3-codex", "gpt-5.4-mini"),
        ("gpt-5.3", "gpt-5.4-mini"),
        ("gpt-5.2-chat-latest", "gpt-5.4-mini"),
        ("gpt-5.2-codex", "gpt-5.4-mini"),
        ("gpt-5.2", "gpt-5.4-mini"),
        ("gpt-5.1-codex-max", "gpt-5.4-mini"),
        ("gpt-5.1-codex-mini", "gpt-5.4-mini"),
        ("gpt-5.1-codex", "gpt-5.4-mini"),
        ("gpt-5.1", "gpt-5.4-mini"),
        ("codex", "gpt-5.4-mini"),
        ("gpt-5", "gpt-5.4-mini"),
    ];

    for (keyword, target) in fuzzy_rules {
        if lower.contains(keyword) {
            return target;
        }
    }

    // 默认
    "gpt-5.4-mini"
}

/// 将 format!() 生成的 String 泄漏为 &'static str，用于静态 HashMap
/// 仅在初始化时调用，泄漏量有限
fn leak_string(s: String) -> &'static str {
    Box::leak(s.into_boxed_str())
}
