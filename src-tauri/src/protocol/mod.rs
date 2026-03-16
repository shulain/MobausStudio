//! 协议模块 (v0.9.0)
//!
//! 统一管理 AI 服务提供商的通信协议
//!
//! ## 功能
//! - 协议抽象层定义
//! - 内置协议实现（OpenAI、Anthropic、Google、AWS）
//! - 协议自动选择和手动选择
//! - 消息格式转换
//! - 流式响应解析
//!
//! ## 支持的协议
//! - `openai`: OpenAI Chat Completions API（默认）
//! - `anthropic`: Anthropic Messages API
//! - `google`: Google Gemini / Cloud Code API
//! - `aws`: AWS Bedrock / Amazon Q API

pub mod anthropic;
pub mod aws;
pub mod google;
pub mod openai;

#[cfg(test)]
mod google_test;

use log::debug;
use reqwest::header::HeaderMap;
use serde::{Deserialize, Serialize};
use tauri::Window;

// ==================== 协议类型定义 ====================

/// 协议类型枚举
///
/// v0.9.0: 定义支持的 AI 服务协议类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ProtocolType {
    /// OpenAI Chat Completions API（默认）
    /// 适用于：OpenAI、DeepSeek、Groq、Together、Ollama 等
    #[default]
    OpenAI,
    /// Anthropic Messages API
    /// 适用于：Claude API 兼容服务
    Anthropic,
    /// Google Gemini / Cloud Code API
    /// 适用于：Gemini API 兼容服务
    Google,
    /// AWS Bedrock / Amazon Q API
    /// 适用于：AWS Bedrock、Kiro 等
    Aws,
}

impl ProtocolType {
    /// 从字符串解析协议类型
    pub fn parse(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "anthropic" => ProtocolType::Anthropic,
            "google" => ProtocolType::Google,
            "aws" | "bedrock" | "kiro" => ProtocolType::Aws,
            _ => ProtocolType::OpenAI,
        }
    }

    /// 转换为字符串
    pub fn as_str(&self) -> &'static str {
        match self {
            ProtocolType::OpenAI => "openai",
            ProtocolType::Anthropic => "anthropic",
            ProtocolType::Google => "google",
            ProtocolType::Aws => "aws",
        }
    }
}

// ==================== 流式事件定义 ====================

/// 流式响应事件
///
/// 统一的流式响应事件类型，各协议解析后都转换为此格式
#[derive(Debug, Clone)]
pub enum StreamEvent {
    /// 文本内容块
    Chunk { content: String },
    /// 推理内容块（thinking mode）
    ReasoningChunk { content: String },
    /// 工具调用开始
    ToolCallStart {
        index: usize,
        id: String,
        name: String,
    },
    /// 工具调用参数增量
    ToolCallDelta { index: usize, arguments: String },
    /// 工具调用完成
    /// v4.1.37: 添加 thought_signature 支持 Gemini 2.5 thinking 模型
    ToolCallComplete {
        id: String,
        name: String,
        arguments: String,
        thought_signature: Option<String>,
    },
    /// 使用统计
    Usage {
        prompt_tokens: i32,
        completion_tokens: i32,
        total_tokens: i32,
    },
    /// 完成
    Done,
    /// 错误
    Error { message: String },
}

/// 流式解析缓冲区
///
/// 用于跨 chunk 边界的数据累积
#[derive(Debug, Default)]
pub struct StreamBuffer {
    /// 文本缓冲区（用于 SSE 解析）
    pub text: String,
    /// 二进制缓冲区（用于 AWS Event Stream 解析）
    pub binary: Vec<u8>,
    /// 当前工具调用累积器
    pub tool_calls: std::collections::HashMap<usize, ToolCallAccumulator>,
}

/// 工具调用累积器
#[derive(Debug, Clone, Default)]
pub struct ToolCallAccumulator {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

// ==================== 请求结构定义 ====================

/// 聊天消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    #[serde(default)]
    pub content: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

/// 流式聊天请求
///
/// 统一的请求结构，包含所有协议可能需要的字段
#[derive(Debug, Clone)]
pub struct ChatStreamRequest {
    /// 提供商 ID
    pub provider: String,
    /// API Key 或 Access Token
    pub api_key: String,
    /// 模型名称
    pub model_name: String,
    /// 消息列表
    pub messages: Vec<ChatMessage>,
    /// API 端点（可选）
    pub endpoint: Option<String>,
    /// 温度参数
    pub temperature: Option<f64>,
    /// 最大 token 数
    pub max_tokens: Option<i32>,
    /// 系统提示词
    pub system_prompt: Option<String>,
    /// 工具列表
    pub tools: Option<Vec<serde_json::Value>>,
    /// ChatGPT 账户 ID（用于 Codex API）
    pub account_id: Option<String>,
    /// GCP 项目 ID（用于 Google Cloud Code API）
    pub project_id: Option<String>,
    /// 消息 ID
    pub message_id: Option<String>,
    /// 协议类型（v0.9.0）
    pub protocol: Option<ProtocolType>,
}

// ==================== 协议 Trait 定义 ====================

/// 聊天协议 trait
///
/// 定义了不同 AI 服务提供商的通信协议接口
/// 各协议实现此 trait 以提供统一的调用方式
pub trait ChatProtocol: Send + Sync {
    /// 获取协议名称
    fn name(&self) -> &'static str;

    /// 获取协议类型
    fn protocol_type(&self) -> ProtocolType;

    /// 构建请求 URL
    fn build_url(&self, request: &ChatStreamRequest) -> String;

    /// 构建请求头
    fn build_headers(&self, request: &ChatStreamRequest) -> HeaderMap;

    /// 构建请求体
    fn build_body(&self, request: &ChatStreamRequest) -> serde_json::Value;

    /// 解析流式响应块
    ///
    /// # 参数
    /// - `chunk`: 原始响应数据块
    /// - `buffer`: 跨 chunk 的缓冲区
    ///
    /// # 返回
    /// 解析出的事件列表
    fn parse_chunk(&self, chunk: &[u8], buffer: &mut StreamBuffer) -> Vec<StreamEvent>;

    /// 是否使用二进制流（AWS Event Stream）
    fn is_binary_stream(&self) -> bool {
        false
    }
}

// ==================== 协议工厂 ====================

/// 根据协议类型获取协议实现
pub fn get_protocol(protocol_type: ProtocolType) -> Box<dyn ChatProtocol> {
    match protocol_type {
        ProtocolType::OpenAI => Box::new(openai::OpenAIProtocol),
        ProtocolType::Anthropic => Box::new(anthropic::AnthropicProtocol),
        ProtocolType::Google => Box::new(google::GoogleProtocol),
        ProtocolType::Aws => Box::new(aws::AwsProtocol),
    }
}

/// 根据提供商 ID 获取默认协议类型
///
/// 内置提供商自动匹配对应协议，自定义提供商默认使用 OpenAI
pub fn get_default_protocol(provider_id: &str) -> ProtocolType {
    match provider_id.to_lowercase().as_str() {
        // Anthropic
        "anthropic" => ProtocolType::Anthropic,

        // Google
        "google" => ProtocolType::Google,

        // AWS / Kiro
        "kiro" | "bedrock" | "aws" => ProtocolType::Aws,

        // OpenAI 兼容（默认）
        // 包括：openai, deepseek, groq, together, openrouter, mistral,
        //       xai, fireworks, perplexity, cerebras, ollama, lmstudio, custom
        _ => ProtocolType::OpenAI,
    }
}

/// 确定请求使用的协议
///
/// 优先级：
/// 1. 请求中明确指定的协议
/// 2. 提供商的默认协议
pub fn resolve_protocol(request: &ChatStreamRequest) -> ProtocolType {
    if let Some(protocol) = request.protocol {
        debug!("[protocol] 使用请求指定的协议: {:?}", protocol);
        return protocol;
    }

    let default = get_default_protocol(&request.provider);
    debug!(
        "[protocol] 使用提供商默认协议: {} -> {:?}",
        request.provider, default
    );
    default
}

// ==================== 流式处理辅助函数 ====================

/// 发送流式事件到前端
pub fn emit_stream_event(window: &Window, msg_id: &str, event: &StreamEvent) {
    use tauri::Emitter;

    let payload = match event {
        StreamEvent::Chunk { content } => {
            serde_json::json!({
                "id": msg_id,
                "event": "chunk",
                "content": content
            })
        }
        StreamEvent::ReasoningChunk { content } => {
            serde_json::json!({
                "id": msg_id,
                "event": "reasoning_chunk",
                "content": content
            })
        }
        StreamEvent::ToolCallStart { index, id, name } => {
            serde_json::json!({
                "id": msg_id,
                "event": "tool_call_start",
                "index": index,
                "tool_call_id": id,
                "name": name
            })
        }
        StreamEvent::ToolCallDelta { index, arguments } => {
            serde_json::json!({
                "id": msg_id,
                "event": "tool_call_delta",
                "index": index,
                "arguments": arguments
            })
        }
        StreamEvent::ToolCallComplete {
            id,
            name,
            arguments,
            thought_signature,
        } => {
            let mut tool_call = serde_json::json!({
                "id": id,
                "type": "function",
                "function": {
                    "name": name,
                    "arguments": arguments
                }
            });
            // v4.1.37: 传递 thought_signature（Gemini 2.5 thinking 模型需要）
            if let Some(ref sig) = thought_signature {
                tool_call["thought_signature"] = serde_json::json!(sig);
            }
            serde_json::json!({
                "id": msg_id,
                "event": "tool_call",
                "tool_call": tool_call
            })
        }
        StreamEvent::Usage {
            prompt_tokens,
            completion_tokens,
            total_tokens,
        } => {
            serde_json::json!({
                "id": msg_id,
                "event": "usage",
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": total_tokens
                }
            })
        }
        StreamEvent::Done => {
            serde_json::json!({
                "id": msg_id,
                "event": "done"
            })
        }
        StreamEvent::Error { message } => {
            serde_json::json!({
                "id": msg_id,
                "event": "error",
                "error": message
            })
        }
    };

    let _ = window.emit("chat-event", payload);
}

/// 规范化 URL，移除末尾的斜杠
pub fn normalize_url(url: &str) -> String {
    url.trim_end_matches('/').to_string()
}

// ==================== 单元测试 ====================

#[cfg(test)]
mod tests {
    use super::*;

    /// TC-PROTO-001: 内置提供商自动选择协议 - OpenAI
    #[test]
    fn test_get_default_protocol_openai() {
        assert_eq!(get_default_protocol("openai"), ProtocolType::OpenAI);
        assert_eq!(get_default_protocol("OpenAI"), ProtocolType::OpenAI);
        assert_eq!(get_default_protocol("deepseek"), ProtocolType::OpenAI);
        assert_eq!(get_default_protocol("groq"), ProtocolType::OpenAI);
    }

    /// TC-PROTO-002: 内置提供商自动选择协议 - Anthropic
    #[test]
    fn test_get_default_protocol_anthropic() {
        assert_eq!(get_default_protocol("anthropic"), ProtocolType::Anthropic);
        assert_eq!(get_default_protocol("Anthropic"), ProtocolType::Anthropic);
    }

    /// TC-PROTO-003: 内置提供商自动选择协议 - Google
    #[test]
    fn test_get_default_protocol_google() {
        assert_eq!(get_default_protocol("google"), ProtocolType::Google);
        assert_eq!(get_default_protocol("Google"), ProtocolType::Google);
    }

    /// TC-PROTO-004: 内置提供商自动选择协议 - AWS
    #[test]
    fn test_get_default_protocol_aws() {
        assert_eq!(get_default_protocol("kiro"), ProtocolType::Aws);
        assert_eq!(get_default_protocol("Kiro"), ProtocolType::Aws);
        assert_eq!(get_default_protocol("bedrock"), ProtocolType::Aws);
    }

    /// TC-PROTO-005: 自定义提供商默认协议
    #[test]
    fn test_get_default_protocol_custom() {
        assert_eq!(get_default_protocol("custom"), ProtocolType::OpenAI);
        assert_eq!(get_default_protocol("my-provider"), ProtocolType::OpenAI);
    }

    /// TC-PROTO-006: 协议类型字符串转换
    #[test]
    fn test_protocol_type_conversion() {
        assert_eq!(ProtocolType::parse("openai"), ProtocolType::OpenAI);
        assert_eq!(ProtocolType::parse("anthropic"), ProtocolType::Anthropic);
        assert_eq!(ProtocolType::parse("google"), ProtocolType::Google);
        assert_eq!(ProtocolType::parse("aws"), ProtocolType::Aws);
        assert_eq!(ProtocolType::parse("unknown"), ProtocolType::OpenAI);

        assert_eq!(ProtocolType::OpenAI.as_str(), "openai");
        assert_eq!(ProtocolType::Anthropic.as_str(), "anthropic");
        assert_eq!(ProtocolType::Google.as_str(), "google");
        assert_eq!(ProtocolType::Aws.as_str(), "aws");
    }
}
