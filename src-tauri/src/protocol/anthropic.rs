//! Anthropic 协议实现 (v0.9.0)
//!
//! 实现 Anthropic Messages API 协议
//!
//! ## 适用场景
//! - Anthropic 官方 API
//! - Claude API 兼容服务
//!
//! ## 协议特点
//! - 端点: `/messages`
//! - 认证: x-api-key 或 Bearer Token (OAuth)
//! - 消息格式: `messages: [{role, content: [{type, text}]}]`
//! - 流式格式: SSE `event: xxx\ndata: {...}`

use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde_json::json;

use super::{
    normalize_url, ChatProtocol, ChatStreamRequest, ProtocolType, StreamBuffer, StreamEvent,
    ToolCallAccumulator,
};

/// Anthropic 协议实现
pub struct AnthropicProtocol;

impl AnthropicProtocol {
    /// 检测是否是 OAuth Token
    ///
    /// OAuth Token 以 "sk-ant-oat" 开头
    fn is_oauth_token(api_key: &str) -> bool {
        api_key.contains("sk-ant-oat")
    }
}

impl ChatProtocol for AnthropicProtocol {
    fn name(&self) -> &'static str {
        "Anthropic Messages"
    }

    fn protocol_type(&self) -> ProtocolType {
        ProtocolType::Anthropic
    }

    fn build_url(&self, request: &ChatStreamRequest) -> String {
        let mut endpoint = normalize_url(
            request
                .endpoint
                .as_deref()
                .unwrap_or("https://api.anthropic.com"),
        );

        // 移除末尾的斜杠
        endpoint = endpoint.trim_end_matches('/').to_string();

        // 如果 endpoint 已经包含 /v1，不重复添加
        // 如果没有，自动添加 /v1
        if !endpoint.ends_with("/v1") {
            endpoint = format!("{}/v1", endpoint);
        }

        // OAuth 模式需要添加 beta 参数
        if Self::is_oauth_token(&request.api_key) {
            format!("{}/messages?beta=true", endpoint)
        } else {
            format!("{}/messages", endpoint)
        }
    }

    fn build_headers(&self, request: &ChatStreamRequest) -> HeaderMap {
        let mut headers = HeaderMap::new();
        let trimmed_key = request.api_key.trim();
        let is_oauth = Self::is_oauth_token(trimmed_key);

        if is_oauth {
            // OAuth 模式：使用 Authorization: Bearer + Claude Code headers
            let auth_value = format!("Bearer {}", trimmed_key);
            if let Ok(value) = HeaderValue::from_str(&auth_value) {
                headers.insert(AUTHORIZATION, value);
            }

            // 必须包含 oauth-2025-04-20 beta header
            headers.insert(
                "Anthropic-Beta",
                HeaderValue::from_static("claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14"),
            );
            headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
            // Claude Code 特有的 headers
            headers.insert(
                "Anthropic-Dangerous-Direct-Browser-Access",
                HeaderValue::from_static("true"),
            );
            headers.insert("X-App", HeaderValue::from_static("cli"));
            headers.insert(
                "User-Agent",
                HeaderValue::from_static("claude-cli/1.0.83 (external, cli)"),
            );
            headers.insert("Accept", HeaderValue::from_static("text/event-stream"));
        } else {
            // API Key 模式：使用 x-api-key
            if let Ok(value) = HeaderValue::from_str(trimmed_key) {
                headers.insert("x-api-key", value);
            }
            headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
        }

        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        headers
    }

    fn build_body(&self, request: &ChatStreamRequest) -> serde_json::Value {
        // 构建 system content（支持缓存）
        let mut system_content: Vec<serde_json::Value> = Vec::new();

        // 添加系统提示词
        if let Some(ref system_prompt) = request.system_prompt {
            if !system_prompt.is_empty() {
                system_content.push(json!({
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": { "type": "ephemeral" }
                }));
            }
        }

        // 从消息中提取 system 消息
        for msg in &request.messages {
            if msg.role == "system" {
                let text = if let Some(s) = msg.content.as_str() {
                    s.to_string()
                } else {
                    msg.content.to_string()
                };
                system_content.push(json!({
                    "type": "text",
                    "text": text,
                    "cache_control": { "type": "ephemeral" }
                }));
            }
        }

        // 构建非 system 消息（转换为 Anthropic 格式）
        let messages: Vec<serde_json::Value> = request
            .messages
            .iter()
            .filter(|m| m.role != "system")
            .map(|m| {
                // 转换 content 为 Anthropic 格式
                let content = if let Some(s) = m.content.as_str() {
                    // 纯文本
                    vec![json!({
                        "type": "text",
                        "text": s,
                        "cache_control": { "type": "ephemeral" }
                    })]
                } else if let Some(arr) = m.content.as_array() {
                    // 已经是数组格式，转换每个元素
                    arr.iter()
                        .map(|item| {
                            if item["type"].as_str() == Some("text") {
                                json!({
                                    "type": "text",
                                    "text": item["text"],
                                    "cache_control": { "type": "ephemeral" }
                                })
                            } else {
                                item.clone()
                            }
                        })
                        .collect()
                } else {
                    // 其他情况，转为文本
                    vec![json!({
                        "type": "text",
                        "text": m.content.to_string(),
                        "cache_control": { "type": "ephemeral" }
                    })]
                };

                json!({
                    "role": m.role,
                    "content": content
                })
            })
            .collect();

        // 构建请求体
        let mut body = json!({
            "model": request.model_name,
            "messages": messages,
            "max_tokens": request.max_tokens.unwrap_or(4096),
            "stream": true
        });

        // 添加 system prompt
        if !system_content.is_empty() {
            body["system"] = json!(system_content);
        }

        // 添加 temperature
        if let Some(temp) = request.temperature {
            body["temperature"] = json!(temp);
        }

        // 转换工具为 Anthropic 格式
        if let Some(ref tools) = request.tools {
            if !tools.is_empty() {
                let anthropic_tools: Vec<serde_json::Value> = tools
                    .iter()
                    .map(|tool| {
                        json!({
                            "name": tool["function"]["name"],
                            "description": tool["function"]["description"],
                            "input_schema": tool["function"]["parameters"],
                            "cache_control": { "type": "ephemeral" }
                        })
                    })
                    .collect();
                body["tools"] = json!(anthropic_tools);
            }
        }

        body
    }

    fn parse_chunk(&self, chunk: &[u8], buffer: &mut StreamBuffer) -> Vec<StreamEvent> {
        let mut events = Vec::new();

        // 将 chunk 添加到缓冲区
        let chunk_str = String::from_utf8_lossy(chunk);
        buffer.text.push_str(&chunk_str);

        // 处理 SSE 数据（Anthropic 格式：event: xxx\ndata: xxx\n\n）
        while let Some(pos) = buffer.text.find("\n\n") {
            let line_block: String = buffer.text.drain(..pos + 2).collect();

            // 解析 event 和 data
            let mut event_type = "";
            let mut data_str = "";

            for line in line_block.lines() {
                let line = line.trim();
                if let Some(stripped) = line.strip_prefix("event: ") {
                    event_type = stripped;
                } else if let Some(stripped) = line.strip_prefix("data: ") {
                    data_str = stripped;
                }
            }

            // 跳过空数据
            if data_str.is_empty() {
                continue;
            }

            // 解析 JSON
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data_str) {
                match event_type {
                    "content_block_start" => {
                        // 内容块开始（可能是文本或工具调用）
                        let index = json["index"].as_u64().unwrap_or(0) as usize;
                        let block_type = json["content_block"]["type"].as_str().unwrap_or("");

                        if block_type == "tool_use" {
                            let id = json["content_block"]["id"].as_str().unwrap_or("");
                            let name = json["content_block"]["name"].as_str().unwrap_or("");

                            buffer.tool_calls.insert(
                                index,
                                ToolCallAccumulator {
                                    id: id.to_string(),
                                    name: name.to_string(),
                                    arguments: String::new(),
                                },
                            );

                            events.push(StreamEvent::ToolCallStart {
                                index,
                                id: id.to_string(),
                                name: name.to_string(),
                            });
                        }
                    }
                    "content_block_delta" => {
                        // 内容块增量
                        let index = json["index"].as_u64().unwrap_or(0) as usize;
                        let delta_type = json["delta"]["type"].as_str().unwrap_or("");

                        match delta_type {
                            "text_delta" => {
                                if let Some(text) = json["delta"]["text"].as_str() {
                                    if !text.is_empty() {
                                        events.push(StreamEvent::Chunk {
                                            content: text.to_string(),
                                        });
                                    }
                                }
                            }
                            "thinking_delta" => {
                                // 思考模式内容
                                if let Some(thinking) = json["delta"]["thinking"].as_str() {
                                    if !thinking.is_empty() {
                                        events.push(StreamEvent::ReasoningChunk {
                                            content: thinking.to_string(),
                                        });
                                    }
                                }
                            }
                            "input_json_delta" => {
                                // 工具调用参数增量
                                if let Some(partial_json) = json["delta"]["partial_json"].as_str() {
                                    if !partial_json.is_empty() {
                                        // 累积参数
                                        if let Some(acc) = buffer.tool_calls.get_mut(&index) {
                                            acc.arguments.push_str(partial_json);
                                        }

                                        events.push(StreamEvent::ToolCallDelta {
                                            index,
                                            arguments: partial_json.to_string(),
                                        });
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                    "content_block_stop" => {
                        // 内容块结束
                        let index = json["index"].as_u64().unwrap_or(0) as usize;

                        // 如果是工具调用，发送完成事件
                        if let Some(acc) = buffer.tool_calls.remove(&index) {
                            if !acc.id.is_empty() {
                                events.push(StreamEvent::ToolCallComplete {
                                    id: acc.id,
                                    name: acc.name,
                                    arguments: acc.arguments,
                                    thought_signature: None,
                                });
                            }
                        }
                    }
                    "message_delta" => {
                        // 消息增量（包含 usage）
                        if let Some(usage) = json.get("usage") {
                            let output_tokens = usage["output_tokens"].as_i64().unwrap_or(0) as i32;
                            // Anthropic 在 message_delta 中只返回 output_tokens
                            events.push(StreamEvent::Usage {
                                prompt_tokens: 0,
                                completion_tokens: output_tokens,
                                total_tokens: output_tokens,
                            });
                        }
                    }
                    "message_start" => {
                        // 消息开始（包含 input_tokens）
                        if let Some(usage) = json["message"].get("usage") {
                            let input_tokens = usage["input_tokens"].as_i64().unwrap_or(0) as i32;
                            events.push(StreamEvent::Usage {
                                prompt_tokens: input_tokens,
                                completion_tokens: 0,
                                total_tokens: input_tokens,
                            });
                        }
                    }
                    "message_stop" => {
                        // 消息结束
                        events.push(StreamEvent::Done);
                    }
                    "error" => {
                        // 错误事件
                        let error_msg =
                            json["error"]["message"].as_str().unwrap_or("Unknown error");
                        events.push(StreamEvent::Error {
                            message: error_msg.to_string(),
                        });
                    }
                    _ => {
                        // 未处理的事件类型
                    }
                }
            }
        }

        events
    }
}

// ==================== 单元测试 ====================

#[cfg(test)]
mod tests {
    use super::*;

    /// TC-PROTO-MSG-002: Anthropic 消息格式
    #[test]
    fn test_build_body_basic() {
        let protocol = AnthropicProtocol;
        let request = ChatStreamRequest {
            provider: "anthropic".to_string(),
            api_key: "test-key".to_string(),
            model_name: "claude-3-opus".to_string(),
            messages: vec![super::super::ChatMessage {
                role: "user".to_string(),
                content: serde_json::json!("Hello"),
                tool_calls: None,
                tool_call_id: None,
            }],
            endpoint: None,
            temperature: Some(0.5),
            max_tokens: Some(1000),
            system_prompt: Some("You are helpful".to_string()),
            tools: None,
            account_id: None,
            project_id: None,
            message_id: None,
            protocol: None,
        };

        let body = protocol.build_body(&request);

        assert_eq!(body["model"], "claude-3-opus");
        assert_eq!(body["max_tokens"], 1000);
        assert_eq!(body["temperature"], 0.5);
        assert_eq!(body["stream"], true);

        // 检查 system
        let system = body["system"].as_array().unwrap();
        assert_eq!(system.len(), 1);
        assert_eq!(system[0]["type"], "text");
        assert_eq!(system[0]["text"], "You are helpful");

        // 检查消息格式（Anthropic 使用 content 数组）
        let messages = body["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0]["role"], "user");
        let content = messages[0]["content"].as_array().unwrap();
        assert_eq!(content[0]["type"], "text");
        assert_eq!(content[0]["text"], "Hello");
    }

    /// TC-PROTO-STREAM-002: Anthropic SSE 解析
    #[test]
    fn test_parse_chunk_content() {
        let protocol = AnthropicProtocol;
        let mut buffer = StreamBuffer::default();

        let chunk = b"event: content_block_delta\ndata: {\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello\"}}\n\n";
        let events = protocol.parse_chunk(chunk, &mut buffer);

        assert_eq!(events.len(), 1);
        match &events[0] {
            StreamEvent::Chunk { content } => {
                assert_eq!(content, "Hello");
            }
            _ => panic!("Expected Chunk event"),
        }
    }

    /// 测试 message_stop 解析
    #[test]
    fn test_parse_chunk_done() {
        let protocol = AnthropicProtocol;
        let mut buffer = StreamBuffer::default();

        let chunk = b"event: message_stop\ndata: {}\n\n";
        let events = protocol.parse_chunk(chunk, &mut buffer);

        assert_eq!(events.len(), 1);
        match &events[0] {
            StreamEvent::Done => {}
            _ => panic!("Expected Done event"),
        }
    }

    /// 测试 OAuth Token 检测
    #[test]
    fn test_is_oauth_token() {
        assert!(AnthropicProtocol::is_oauth_token("sk-ant-oat-xxx"));
        assert!(!AnthropicProtocol::is_oauth_token("sk-ant-api-xxx"));
        assert!(!AnthropicProtocol::is_oauth_token("regular-api-key"));
    }

    /// 测试 URL 构建
    #[test]
    fn test_build_url() {
        let protocol = AnthropicProtocol;

        // 默认 endpoint（不提供时使用 base URL）
        let request = ChatStreamRequest {
            provider: "anthropic".to_string(),
            api_key: "sk-ant-api-xxx".to_string(),
            model_name: "claude-3".to_string(),
            messages: vec![],
            endpoint: None,
            temperature: None,
            max_tokens: None,
            system_prompt: None,
            tools: None,
            account_id: None,
            project_id: None,
            message_id: None,
            protocol: None,
        };
        assert_eq!(
            protocol.build_url(&request),
            "https://api.anthropic.com/v1/messages"
        );

        // OAuth 模式
        let request2 = ChatStreamRequest {
            api_key: "sk-ant-oat-xxx".to_string(),
            ..request.clone()
        };
        assert_eq!(
            protocol.build_url(&request2),
            "https://api.anthropic.com/v1/messages?beta=true"
        );

        // 用户输入 base URL（不带 /v1）
        let request3 = ChatStreamRequest {
            endpoint: Some("https://api.anthropic.com".to_string()),
            ..request.clone()
        };
        assert_eq!(
            protocol.build_url(&request3),
            "https://api.anthropic.com/v1/messages"
        );

        // 用户输入完整 URL（带 /v1）
        let request4 = ChatStreamRequest {
            endpoint: Some("https://api.anthropic.com/v1".to_string()),
            ..request.clone()
        };
        assert_eq!(
            protocol.build_url(&request4),
            "https://api.anthropic.com/v1/messages"
        );

        // 用户输入带末尾斜杠的 base URL
        let request5 = ChatStreamRequest {
            endpoint: Some("https://api.anthropic.com/".to_string()),
            ..request.clone()
        };
        assert_eq!(
            protocol.build_url(&request5),
            "https://api.anthropic.com/v1/messages"
        );

        // 自定义端点（代理服务器）
        let request6 = ChatStreamRequest {
            endpoint: Some("https://custom-proxy.com".to_string()),
            ..request
        };
        assert_eq!(
            protocol.build_url(&request6),
            "https://custom-proxy.com/v1/messages"
        );
    }
}
