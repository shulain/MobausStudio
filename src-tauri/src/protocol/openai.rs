//! OpenAI 协议实现 (v0.9.0)
//!
//! 实现 OpenAI Chat Completions API 协议
//!
//! ## 适用场景
//! - OpenAI 官方 API
//! - DeepSeek、Groq、Together、Ollama 等 OpenAI 兼容服务
//!
//! ## 协议特点
//! - 端点: `/chat/completions`
//! - 认证: Bearer Token
//! - 消息格式: `messages: [{role, content}]`
//! - 流式格式: SSE `data: {...}`

#[allow(unused_imports)]
use log::debug;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde_json::json;

use super::{
    normalize_url, ChatProtocol, ChatStreamRequest, ProtocolType, StreamBuffer, StreamEvent,
};

/// OpenAI 协议实现
pub struct OpenAIProtocol;

impl ChatProtocol for OpenAIProtocol {
    fn name(&self) -> &'static str {
        "OpenAI Chat Completions"
    }

    fn protocol_type(&self) -> ProtocolType {
        ProtocolType::OpenAI
    }

    fn build_url(&self, request: &ChatStreamRequest) -> String {
        let endpoint = normalize_url(
            request
                .endpoint
                .as_deref()
                .unwrap_or("https://api.openai.com/v1"),
        );
        format!("{}/chat/completions", endpoint)
    }

    fn build_headers(&self, request: &ChatStreamRequest) -> HeaderMap {
        let mut headers = HeaderMap::new();

        // Authorization header
        let auth_value = format!("Bearer {}", request.api_key.trim());
        if let Ok(value) = HeaderValue::from_str(&auth_value) {
            headers.insert(AUTHORIZATION, value);
        }

        // Content-Type
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        headers
    }

    fn build_body(&self, request: &ChatStreamRequest) -> serde_json::Value {
        // 构建消息列表
        let mut messages = Vec::new();

        // 添加系统提示词
        if let Some(ref system_prompt) = request.system_prompt {
            if !system_prompt.is_empty() {
                messages.push(json!({
                    "role": "system",
                    "content": system_prompt
                }));
            }
        }

        // 添加用户消息
        for msg in &request.messages {
            let mut message = json!({
                "role": msg.role,
                "content": msg.content
            });

            // 添加工具调用（assistant 消息）
            if let Some(ref tool_calls) = msg.tool_calls {
                message["tool_calls"] = json!(tool_calls);
            }

            // 添加工具调用 ID（tool 消息）
            if let Some(ref tool_call_id) = msg.tool_call_id {
                message["tool_call_id"] = json!(tool_call_id);
            }

            messages.push(message);
        }

        // 构建请求体
        let mut body = json!({
            "model": request.model_name,
            "messages": messages,
            "temperature": request.temperature.unwrap_or(0.7),
            "max_tokens": request.max_tokens.unwrap_or(4096),
            "stream": true,
            "stream_options": {
                "include_usage": true
            }
        });

        // 添加工具
        if let Some(ref tools) = request.tools {
            if !tools.is_empty() {
                body["tools"] = json!(tools);
            }
        }

        body
    }

    fn parse_chunk(&self, chunk: &[u8], buffer: &mut StreamBuffer) -> Vec<StreamEvent> {
        let mut events = Vec::new();

        // 将 chunk 添加到缓冲区
        let chunk_str = String::from_utf8_lossy(chunk);
        buffer.text.push_str(&chunk_str);

        // 处理 SSE 数据（按 \n\n 分割）
        while let Some(pos) = buffer.text.find("\n\n") {
            let line_block: String = buffer.text.drain(..pos + 2).collect();

            for line in line_block.lines() {
                let line = line.trim();
                if let Some(data_str) = line.strip_prefix("data: ") {
                    // 检查是否完成
                    if data_str == "[DONE]" {
                        events.push(StreamEvent::Done);
                        continue;
                    }

                    // 解析 JSON
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data_str) {
                        // 提取 usage 信息
                        if let Some(usage) = json.get("usage") {
                            if !usage.is_null() {
                                let prompt_tokens =
                                    usage["prompt_tokens"].as_i64().unwrap_or(0) as i32;
                                let completion_tokens =
                                    usage["completion_tokens"].as_i64().unwrap_or(0) as i32;
                                let total_tokens =
                                    usage["total_tokens"].as_i64().unwrap_or(0) as i32;
                                events.push(StreamEvent::Usage {
                                    prompt_tokens,
                                    completion_tokens,
                                    total_tokens,
                                });
                            }
                        }

                        // 提取 content
                        if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                            if !content.is_empty() {
                                events.push(StreamEvent::Chunk {
                                    content: content.to_string(),
                                });
                            }
                        }

                        // 提取 reasoning_content（思考模式）
                        if let Some(reasoning) =
                            json["choices"][0]["delta"]["reasoning_content"].as_str()
                        {
                            if !reasoning.is_empty() {
                                events.push(StreamEvent::ReasoningChunk {
                                    content: reasoning.to_string(),
                                });
                            }
                        }

                        // 提取 tool_calls
                        if let Some(tool_calls) =
                            json["choices"][0]["delta"]["tool_calls"].as_array()
                        {
                            for tc in tool_calls {
                                let index = tc["index"].as_u64().unwrap_or(0) as usize;

                                // 工具调用开始（有 id 和 function.name）
                                if let Some(id) = tc["id"].as_str() {
                                    let name = tc["function"]["name"].as_str().unwrap_or("");

                                    // 初始化累积器
                                    buffer.tool_calls.insert(
                                        index,
                                        super::ToolCallAccumulator {
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

                                // 工具调用参数增量
                                if let Some(args) = tc["function"]["arguments"].as_str() {
                                    if !args.is_empty() {
                                        // 累积参数
                                        if let Some(acc) = buffer.tool_calls.get_mut(&index) {
                                            acc.arguments.push_str(args);
                                        }

                                        events.push(StreamEvent::ToolCallDelta {
                                            index,
                                            arguments: args.to_string(),
                                        });
                                    }
                                }
                            }
                        }

                        // 检查 finish_reason
                        if let Some(finish_reason) = json["choices"][0]["finish_reason"].as_str() {
                            if finish_reason == "tool_calls" {
                                // 发送完整的工具调用
                                for (_, acc) in buffer.tool_calls.drain() {
                                    events.push(StreamEvent::ToolCallComplete {
                                        id: acc.id,
                                        name: acc.name,
                                        arguments: acc.arguments,
                                        thought_signature: None,
                                    });
                                }
                            }
                        }
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
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    fn read_http_request(stream: &mut std::net::TcpStream) -> String {
        let mut buffer = Vec::new();
        let mut chunk = [0_u8; 4096];

        loop {
            let size = stream.read(&mut chunk).unwrap();
            if size == 0 {
                break;
            }

            buffer.extend_from_slice(&chunk[..size]);

            let header_end = buffer
                .windows(4)
                .position(|window| window == b"\r\n\r\n")
                .map(|pos| pos + 4);

            if let Some(header_end) = header_end {
                let headers = String::from_utf8_lossy(&buffer[..header_end]);
                let content_length = headers
                    .lines()
                    .find_map(|line| {
                        let (name, value) = line.split_once(':')?;
                        if name.eq_ignore_ascii_case("content-length") {
                            value.trim().parse::<usize>().ok()
                        } else {
                            None
                        }
                    })
                    .unwrap_or(0);

                if buffer.len() >= header_end + content_length {
                    break;
                }
            }
        }

        String::from_utf8_lossy(&buffer).to_string()
    }

    /// TC-PROTO-MSG-001: OpenAI 消息格式
    #[test]
    fn test_build_body_basic() {
        let protocol = OpenAIProtocol;
        let request = ChatStreamRequest {
            provider: "openai".to_string(),
            api_key: "test-key".to_string(),
            model_name: "gpt-4".to_string(),
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

        assert_eq!(body["model"], "gpt-4");
        assert_eq!(body["temperature"], 0.5);
        assert_eq!(body["max_tokens"], 1000);
        assert_eq!(body["stream"], true);

        // 检查消息
        let messages = body["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 2); // system + user
        assert_eq!(messages[0]["role"], "system");
        assert_eq!(messages[0]["content"], "You are helpful");
        assert_eq!(messages[1]["role"], "user");
        assert_eq!(messages[1]["content"], "Hello");
    }

    /// TC-PROTO-STREAM-001: OpenAI SSE 解析
    #[test]
    fn test_parse_chunk_content() {
        let protocol = OpenAIProtocol;
        let mut buffer = StreamBuffer::default();

        let chunk = b"data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n";
        let events = protocol.parse_chunk(chunk, &mut buffer);

        assert_eq!(events.len(), 1);
        match &events[0] {
            StreamEvent::Chunk { content } => {
                assert_eq!(content, "Hello");
            }
            _ => panic!("Expected Chunk event"),
        }
    }

    /// 测试 [DONE] 解析
    #[test]
    fn test_parse_chunk_done() {
        let protocol = OpenAIProtocol;
        let mut buffer = StreamBuffer::default();

        let chunk = b"data: [DONE]\n\n";
        let events = protocol.parse_chunk(chunk, &mut buffer);

        assert_eq!(events.len(), 1);
        match &events[0] {
            StreamEvent::Done => {}
            _ => panic!("Expected Done event"),
        }
    }

    /// 测试 usage 解析
    #[test]
    fn test_parse_chunk_usage() {
        let protocol = OpenAIProtocol;
        let mut buffer = StreamBuffer::default();

        let chunk = b"data: {\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":20,\"total_tokens\":30}}\n\n";
        let events = protocol.parse_chunk(chunk, &mut buffer);

        assert!(events.iter().any(|e| matches!(
            e,
            StreamEvent::Usage {
                prompt_tokens: 10,
                completion_tokens: 20,
                total_tokens: 30
            }
        )));
    }

    /// 测试 URL 构建
    #[test]
    fn test_build_url() {
        let protocol = OpenAIProtocol;

        // 默认端点
        let request = ChatStreamRequest {
            provider: "openai".to_string(),
            api_key: "test".to_string(),
            model_name: "gpt-4".to_string(),
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
            "https://api.openai.com/v1/chat/completions"
        );

        // 自定义端点
        let request2 = ChatStreamRequest {
            endpoint: Some("https://api.deepseek.com/v1/".to_string()),
            ..request
        };
        assert_eq!(
            protocol.build_url(&request2),
            "https://api.deepseek.com/v1/chat/completions"
        );
    }

    /// 本机 OpenAI-compatible mock 服务闭环：
    /// 构建请求 -> 真实 HTTP POST -> 接收 SSE -> 协议解析出 chunk/usage/done。
    #[tokio::test]
    async fn test_openai_compatible_local_stream_roundtrip() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let endpoint = format!("http://127.0.0.1:{}/v1", port);

        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let request = read_http_request(&mut stream);

            assert!(request.starts_with("POST /v1/chat/completions "));
            assert!(request
                .to_ascii_lowercase()
                .contains("authorization: bearer test-key"));
            assert!(request.contains("\"model\":\"mock-model\""));
            assert!(request.contains("\"stream\":true"));

            let response_body = concat!(
                "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n",
                "data: {\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":2,\"total_tokens\":5}}\n\n",
                "data: [DONE]\n\n"
            );
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response_body.len(),
                response_body
            );
            stream.write_all(response.as_bytes()).unwrap();
        });

        let protocol = OpenAIProtocol;
        let request = ChatStreamRequest {
            provider: "custom".to_string(),
            api_key: "test-key".to_string(),
            model_name: "mock-model".to_string(),
            messages: vec![super::super::ChatMessage {
                role: "user".to_string(),
                content: serde_json::json!("hello"),
                tool_calls: None,
                tool_call_id: None,
            }],
            endpoint: Some(endpoint),
            temperature: Some(0.2),
            max_tokens: Some(32),
            system_prompt: None,
            tools: None,
            account_id: None,
            project_id: None,
            message_id: None,
            protocol: None,
        };

        let response = reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap()
            .post(protocol.build_url(&request))
            .headers(protocol.build_headers(&request))
            .json(&protocol.build_body(&request))
            .send()
            .await
            .unwrap();

        assert!(response.status().is_success());

        let mut stream_buffer = StreamBuffer::default();
        let mut events = Vec::new();
        let mut response = response;
        while let Some(chunk) = response.chunk().await.unwrap() {
            events.extend(protocol.parse_chunk(&chunk, &mut stream_buffer));
        }

        assert!(events.iter().any(|event| matches!(
            event,
            StreamEvent::Chunk { content } if content == "Hello"
        )));
        assert!(events.iter().any(|event| matches!(
            event,
            StreamEvent::Usage {
                prompt_tokens: 3,
                completion_tokens: 2,
                total_tokens: 5
            }
        )));
        assert!(events
            .iter()
            .any(|event| matches!(event, StreamEvent::Done)));
        server.join().unwrap();
    }
}
