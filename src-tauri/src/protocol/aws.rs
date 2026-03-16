//! AWS 协议实现 (v0.9.0)
//!
//! 实现 AWS Bedrock / Amazon Q API 协议
//!
//! ## 适用场景
//! - AWS Bedrock
//! - Kiro (Amazon Q)
//!
//! ## 协议特点
//! - 端点: 自定义 AWS 端点
//! - 认证: Bearer Token
//! - 消息格式: `conversationState` 格式
//! - 流式格式: AWS Event Stream 二进制格式

use log::debug;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde_json::json;

use super::{ChatProtocol, ChatStreamRequest, ProtocolType, StreamBuffer, StreamEvent};

/// Kiro API 配置常量
const KIRO_API_REGION: &str = "us-east-1";
const KIRO_API_USER_AGENT: &str = "kiro-ide/1.0.0 (external, ide)";
const KIRO_API_AMZ_USER_AGENT: &str = "kiro-ide/1.0.0 (external, ide)";
const KIRO_API_AGENT_MODE: &str = "chat";

/// AWS 协议实现
pub struct AwsProtocol;

impl AwsProtocol {
    /// 解析 AWS Event Stream 消息
    ///
    /// AWS Event Stream 是二进制格式：
    /// - 4 bytes: total length (big-endian)
    /// - 4 bytes: headers length (big-endian)
    /// - 4 bytes: prelude CRC
    /// - N bytes: headers
    /// - M bytes: payload
    /// - 4 bytes: message CRC
    pub fn parse_event_stream_message(data: &[u8]) -> Option<(String, serde_json::Value)> {
        if data.len() < 16 {
            return None;
        }

        let total_length = u32::from_be_bytes([data[0], data[1], data[2], data[3]]) as usize;
        let headers_length = u32::from_be_bytes([data[4], data[5], data[6], data[7]]) as usize;

        if data.len() < total_length || total_length < 16 {
            return None;
        }

        // 跳过 prelude (8 bytes) 和 prelude CRC (4 bytes)
        let headers_start = 12;
        let headers_end = headers_start + headers_length;

        if headers_end > total_length {
            return None;
        }

        // 解析 headers
        let mut event_type = String::new();
        let mut pos = headers_start;

        while pos < headers_end {
            if pos >= data.len() {
                break;
            }

            // Header name length (1 byte)
            let name_len = data[pos] as usize;
            pos += 1;

            if pos + name_len > data.len() {
                break;
            }

            let name = String::from_utf8_lossy(&data[pos..pos + name_len]).to_string();
            pos += name_len;

            if pos >= data.len() {
                break;
            }

            // Header type (1 byte)
            let header_type = data[pos];
            pos += 1;

            // 类型 7 = string
            if header_type == 7 {
                if pos + 2 > data.len() {
                    break;
                }

                // Value length (2 bytes, big-endian)
                let value_len = u16::from_be_bytes([data[pos], data[pos + 1]]) as usize;
                pos += 2;

                if pos + value_len > data.len() {
                    break;
                }

                let value = String::from_utf8_lossy(&data[pos..pos + value_len]).to_string();
                pos += value_len;

                if name == ":event-type" {
                    event_type = value;
                }
            } else {
                // 跳过其他类型的 header
                break;
            }
        }

        // 解析 payload
        let payload_start = headers_end;
        let payload_end = total_length - 4; // 减去 message CRC

        if payload_start >= payload_end {
            return Some((event_type, json!({})));
        }

        let payload_data = &data[payload_start..payload_end];
        let payload: serde_json::Value = serde_json::from_slice(payload_data).unwrap_or(json!({}));

        Some((event_type, payload))
    }

    /// v4.1.34: 确保 user/assistant 严格交替
    ///
    /// Kiro API 要求 chatHistory 中 user 和 assistant 消息严格交替
    /// 连续 assistant 消息间插入占位 user 消息，连续 user 消息合并内容
    fn ensure_alternating_roles(history: &mut Vec<serde_json::Value>) {
        let mut merged: Vec<serde_json::Value> = Vec::new();

        for msg in history.drain(..) {
            let current_role = msg["role"].as_str().unwrap_or("").to_string();

            if let Some(last) = merged.last_mut() {
                let last_role = last["role"].as_str().unwrap_or("").to_string();
                if current_role == last_role {
                    if current_role == "user" {
                        // 连续 user 消息：合并内容
                        if let (Some(last_content), Some(new_content)) =
                            (last["content"].as_array_mut(), msg["content"].as_array())
                        {
                            last_content.extend(new_content.iter().cloned());
                        }
                        // 合并 toolResult（如果有）
                        continue;
                    } else if current_role == "assistant" {
                        // 连续 assistant 消息：插入占位 user 消息
                        merged.push(json!({
                            "role": "user",
                            "content": [{ "text": "continue" }]
                        }));
                    }
                }
            }

            merged.push(msg);
        }

        *history = merged;
    }

    /// v4.1.37: 消息截断防超限
    ///
    /// 粗略估算消息总字符数，超过约 200k 字符时从头部截断旧消息
    /// 截断后确保以 user 消息开头
    fn truncate_chat_history(history: &mut Vec<serde_json::Value>) {
        const MAX_CHARS: usize = 800_000; // 约 200k token

        let total_chars: usize = history.iter().map(|m| m.to_string().len()).sum();
        if total_chars <= MAX_CHARS {
            return;
        }

        debug!(
            "[aws] 消息总字符数 {} 超过限制 {}，执行截断",
            total_chars, MAX_CHARS
        );

        // 从头部移除消息
        while history.len() > 2 {
            let remaining: usize = history.iter().map(|m| m.to_string().len()).sum();
            if remaining <= MAX_CHARS {
                break;
            }
            history.remove(0);
        }

        // 确保以 user 消息开头
        while !history.is_empty() {
            if history[0]["role"].as_str() == Some("user") {
                break;
            }
            history.remove(0);
        }
    }
}

impl ChatProtocol for AwsProtocol {
    fn name(&self) -> &'static str {
        "AWS Bedrock / Amazon Q"
    }

    fn protocol_type(&self) -> ProtocolType {
        ProtocolType::Aws
    }

    fn build_url(&self, _request: &ChatStreamRequest) -> String {
        // Kiro API 端点
        format!(
            "https://q.{}.amazonaws.com/generateAssistantResponse",
            KIRO_API_REGION
        )
    }

    fn build_headers(&self, request: &ChatStreamRequest) -> HeaderMap {
        let mut headers = HeaderMap::new();

        // 从 api_key 中解析 access_token
        // 格式: access_token 或 access_token|profile_arn
        let access_token = if request.api_key.contains('|') {
            request
                .api_key
                .split('|')
                .next()
                .unwrap_or(&request.api_key)
        } else {
            &request.api_key
        };

        // Authorization header
        let auth_value = format!("Bearer {}", access_token.trim());
        if let Ok(value) = HeaderValue::from_str(&auth_value) {
            headers.insert(AUTHORIZATION, value);
        }

        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert("Accept", HeaderValue::from_static("*/*"));
        headers.insert("User-Agent", HeaderValue::from_static(KIRO_API_USER_AGENT));
        headers.insert(
            "X-Amz-User-Agent",
            HeaderValue::from_static(KIRO_API_AMZ_USER_AGENT),
        );
        headers.insert(
            "x-amzn-kiro-agent-mode",
            HeaderValue::from_static(KIRO_API_AGENT_MODE),
        );
        headers.insert(
            "x-amzn-codewhisperer-optout",
            HeaderValue::from_static("true"),
        );
        headers.insert(
            "Amz-Sdk-Request",
            HeaderValue::from_static("attempt=1; max=3"),
        );

        // 生成 invocation ID
        let invocation_id = uuid::Uuid::new_v4().to_string();
        if let Ok(value) = HeaderValue::from_str(&invocation_id) {
            headers.insert("Amz-Sdk-Invocation-Id", value);
        }

        headers
    }

    fn build_body(&self, request: &ChatStreamRequest) -> serde_json::Value {
        // 从 api_key 中解析 profile_arn
        let profile_arn = if request.api_key.contains('|') {
            request
                .api_key
                .split_once('|')
                .map(|x| x.1)
                .map(|s| s.to_string())
        } else {
            None
        };

        // v4.1.37: 构建消息历史，正确处理 tool 角色消息和去重 currentMessage
        let mut chat_history: Vec<serde_json::Value> = Vec::new();

        for msg in &request.messages {
            if msg.role == "system" {
                continue; // system 消息单独处理
            }

            let content = if let Some(s) = msg.content.as_str() {
                s.to_string()
            } else {
                msg.content.to_string()
            };

            if msg.role == "tool" {
                // v4.1.34: tool 角色消息包装为 userInputMessage + toolResults 格式
                let tool_call_id = msg.tool_call_id.as_deref().unwrap_or("");
                chat_history.push(json!({
                    "role": "user",
                    "content": [{
                        "toolResult": {
                            "toolUseId": tool_call_id,
                            "content": [{ "text": content }]
                        }
                    }]
                }));
            } else {
                // 转换角色名称
                let role = match msg.role.as_str() {
                    "assistant" => "assistant",
                    _ => "user",
                };

                // assistant 消息带 tool_calls 时，添加 toolUses
                if msg.role == "assistant" {
                    if let Some(ref tool_calls) = msg.tool_calls {
                        if !tool_calls.is_empty() {
                            let tool_uses: Vec<serde_json::Value> = tool_calls
                                .iter()
                                .map(|tc| {
                                    let tc_id = tc["id"].as_str().unwrap_or("");
                                    let name = tc["function"]["name"].as_str().unwrap_or("");
                                    let args_str =
                                        tc["function"]["arguments"].as_str().unwrap_or("{}");
                                    let input: serde_json::Value =
                                        serde_json::from_str(args_str).unwrap_or(json!({}));
                                    json!({
                                        "toolUseId": tc_id,
                                        "name": name,
                                        "input": input
                                    })
                                })
                                .collect();

                            let mut assistant_content: Vec<serde_json::Value> = Vec::new();
                            if !content.is_empty() {
                                assistant_content.push(json!({ "text": content }));
                            }

                            chat_history.push(json!({
                                "role": "assistant",
                                "content": assistant_content,
                                "toolUses": tool_uses
                            }));
                            continue;
                        }
                    }
                }

                chat_history.push(json!({
                    "role": role,
                    "content": [{
                        "text": content
                    }]
                }));
            }
        }

        // v4.1.34: 确保 user/assistant 严格交替
        Self::ensure_alternating_roles(&mut chat_history);

        // v4.1.37: 消息截断防超限（约 200k 字符限制）
        Self::truncate_chat_history(&mut chat_history);

        // v4.1.37: 从 chatHistory 中提取最后一条 user 消息作为 currentMessage，避免重复
        let current_message = if let Some(last) = chat_history.last() {
            if last["role"].as_str() == Some("user") {
                let cm = last.clone();
                chat_history.pop(); // 从 history 中移除最后一条
                cm
            } else {
                // 最后一条不是 user，构造一个空的
                json!({
                    "role": "user",
                    "content": [{ "text": "" }]
                })
            }
        } else {
            json!({
                "role": "user",
                "content": [{ "text": "" }]
            })
        };

        // 构建请求体
        let mut body = json!({
            "conversationState": {
                "chatHistory": chat_history,
                "currentMessage": current_message
            }
        });

        // 添加 profile ARN（如果有）
        if let Some(arn) = profile_arn {
            body["profileArn"] = json!(arn);
        }

        // 添加系统提示词
        if let Some(ref system_prompt) = request.system_prompt {
            if !system_prompt.is_empty() {
                body["conversationState"]["systemPrompt"] = json!({
                    "content": [{
                        "text": system_prompt
                    }]
                });
            }
        }

        // 添加工具（如果有）
        if let Some(ref tools) = request.tools {
            if !tools.is_empty() {
                let aws_tools: Vec<serde_json::Value> = tools
                    .iter()
                    .map(|tool| {
                        json!({
                            "toolSpec": {
                                "name": tool["function"]["name"],
                                "description": tool["function"]["description"],
                                "inputSchema": {
                                    "json": tool["function"]["parameters"]
                                }
                            }
                        })
                    })
                    .collect();
                body["toolConfiguration"] = json!({
                    "tools": aws_tools
                });
            }
        }

        body
    }

    fn parse_chunk(&self, chunk: &[u8], buffer: &mut StreamBuffer) -> Vec<StreamEvent> {
        let mut events = Vec::new();

        // 将 chunk 添加到二进制缓冲区
        buffer.binary.extend_from_slice(chunk);

        // 尝试解析 AWS Event Stream 消息
        while buffer.binary.len() >= 16 {
            // 读取消息长度
            let total_length = u32::from_be_bytes([
                buffer.binary[0],
                buffer.binary[1],
                buffer.binary[2],
                buffer.binary[3],
            ]) as usize;

            if !(16..=10 * 1024 * 1024).contains(&total_length) {
                // 无效的消息长度，跳过一个字节
                buffer.binary.remove(0);
                continue;
            }

            if buffer.binary.len() < total_length {
                // 数据不完整，等待更多数据
                break;
            }

            // 提取完整消息
            let message_data: Vec<u8> = buffer.binary.drain(..total_length).collect();

            // 解析消息
            if let Some((event_type, payload)) = Self::parse_event_stream_message(&message_data) {
                debug!("[aws] 事件类型: {}", event_type);

                match event_type.as_str() {
                    "assistantResponseEvent" => {
                        // 处理助手响应事件
                        if let Some(event_data) = payload.get("assistantResponseEvent") {
                            // 提取文本内容
                            if let Some(content) =
                                event_data.get("content").and_then(|v| v.as_str())
                            {
                                if !content.is_empty() {
                                    events.push(StreamEvent::Chunk {
                                        content: content.to_string(),
                                    });
                                }
                            }

                            // 提取工具调用
                            if let Some(tool_uses) =
                                event_data.get("toolUses").and_then(|v| v.as_array())
                            {
                                for tu in tool_uses {
                                    let tool_use_id =
                                        tu.get("toolUseId").and_then(|v| v.as_str()).unwrap_or("");
                                    let name =
                                        tu.get("name").and_then(|v| v.as_str()).unwrap_or("");
                                    let input = tu.get("input").cloned().unwrap_or(json!({}));

                                    if !tool_use_id.is_empty() && !name.is_empty() {
                                        events.push(StreamEvent::ToolCallComplete {
                                            id: tool_use_id.to_string(),
                                            name: name.to_string(),
                                            arguments: serde_json::to_string(&input)
                                                .unwrap_or_default(),
                                            thought_signature: None,
                                        });
                                    }
                                }
                            }
                        }

                        // 也尝试直接从 payload 提取
                        if let Some(content) = payload.get("content").and_then(|v| v.as_str()) {
                            if !content.is_empty() {
                                events.push(StreamEvent::Chunk {
                                    content: content.to_string(),
                                });
                            }
                        }
                    }
                    "reasoningContentEvent" => {
                        // 处理推理内容事件（thinking mode）
                        if let Some(content) = payload.get("content").and_then(|v| v.as_str()) {
                            if !content.is_empty() {
                                events.push(StreamEvent::ReasoningChunk {
                                    content: content.to_string(),
                                });
                            }
                        }
                    }
                    "toolUseEvent" => {
                        // 处理工具使用事件
                        let tool_use_id = payload
                            .get("toolUseId")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let name = payload.get("name").and_then(|v| v.as_str()).unwrap_or("");
                        let input = payload.get("input").cloned().unwrap_or(json!({}));

                        if !tool_use_id.is_empty() && !name.is_empty() {
                            events.push(StreamEvent::ToolCallComplete {
                                id: tool_use_id.to_string(),
                                name: name.to_string(),
                                arguments: serde_json::to_string(&input).unwrap_or_default(),
                                thought_signature: None,
                            });
                        }
                    }
                    "usageEvent" => {
                        // 处理使用统计事件
                        let input_tokens = payload
                            .get("inputTokens")
                            .and_then(|v| v.as_i64())
                            .unwrap_or(0) as i32;
                        let output_tokens = payload
                            .get("outputTokens")
                            .and_then(|v| v.as_i64())
                            .unwrap_or(0) as i32;

                        events.push(StreamEvent::Usage {
                            prompt_tokens: input_tokens,
                            completion_tokens: output_tokens,
                            total_tokens: input_tokens + output_tokens,
                        });
                    }
                    "messageStopEvent" | "endOfResponse" => {
                        // 消息结束
                        events.push(StreamEvent::Done);
                    }
                    "error" | "exception" => {
                        // 错误事件
                        let message = payload
                            .get("message")
                            .or_else(|| payload.get("errorMessage"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown error");
                        events.push(StreamEvent::Error {
                            message: message.to_string(),
                        });
                    }
                    _ => {
                        debug!("[aws] 未处理的事件类型: {}", event_type);
                    }
                }
            }
        }

        events
    }

    fn is_binary_stream(&self) -> bool {
        true
    }
}

// ==================== 单元测试 ====================

#[cfg(test)]
mod tests {
    use super::*;

    /// TC-PROTO-MSG-004: AWS 消息格式
    #[test]
    fn test_build_body_basic() {
        let protocol = AwsProtocol;
        let request = ChatStreamRequest {
            provider: "kiro".to_string(),
            api_key: "test-token".to_string(),
            model_name: "claude-3".to_string(),
            messages: vec![super::super::ChatMessage {
                role: "user".to_string(),
                content: serde_json::json!("Hello"),
                tool_calls: None,
                tool_call_id: None,
            }],
            endpoint: None,
            temperature: None,
            max_tokens: None,
            system_prompt: Some("You are helpful".to_string()),
            tools: None,
            account_id: None,
            project_id: None,
            message_id: None,
            protocol: None,
        };

        let body = protocol.build_body(&request);

        // 检查 conversationState 结构
        assert!(body.get("conversationState").is_some());
        assert!(body["conversationState"].get("chatHistory").is_some());
        assert!(body["conversationState"].get("systemPrompt").is_some());
    }

    /// 测试带 profile_arn 的请求
    #[test]
    fn test_build_body_with_profile_arn() {
        let protocol = AwsProtocol;
        let request = ChatStreamRequest {
            provider: "kiro".to_string(),
            api_key: "test-token|arn:aws:iam::123456789:role/MyRole".to_string(),
            model_name: "claude-3".to_string(),
            messages: vec![super::super::ChatMessage {
                role: "user".to_string(),
                content: serde_json::json!("Hello"),
                tool_calls: None,
                tool_call_id: None,
            }],
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

        let body = protocol.build_body(&request);

        assert_eq!(body["profileArn"], "arn:aws:iam::123456789:role/MyRole");
    }

    /// 测试 URL 构建
    #[test]
    fn test_build_url() {
        let protocol = AwsProtocol;
        let request = ChatStreamRequest {
            provider: "kiro".to_string(),
            api_key: "test".to_string(),
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

        let url = protocol.build_url(&request);
        assert!(url.contains("q.us-east-1.amazonaws.com"));
        assert!(url.contains("generateAssistantResponse"));
    }

    /// 测试二进制流标识
    #[test]
    fn test_is_binary_stream() {
        let protocol = AwsProtocol;
        assert!(protocol.is_binary_stream());
    }
}
