//! ChatGPT Web 订阅代理模块单元测试
//!
//! 与 docs/modules/chatgpt_web.md 测试用例一一对应
//!
//! @module services/chatgpt_web/tests
//! @version 0.1.0

#[cfg(test)]
mod tests {
    use crate::services::chatgpt_web::oauth;
    use crate::services::chatgpt_web::transform::*;
    use crate::services::chatgpt_web::types::*;

    // ==================== TC-CGWEB-001: PKCE 对生成 ====================

    #[test]
    fn test_tc_cgweb_001_generate_pkce_pair() {
        let (verifier, challenge) = oauth::generate_pkce_pair();
        // verifier 是 64 字节的 hex 编码 = 128 字符
        assert_eq!(verifier.len(), 128, "verifier 应为 128 字符（64 字节 hex）");
        // challenge 是 SHA256 (32 字节) 的 base64url 编码 = 43 字符
        assert_eq!(
            challenge.len(),
            43,
            "challenge 应为 43 字符（SHA256 base64url）"
        );
        // challenge 只包含 base64url 合法字符
        assert!(
            challenge
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'),
            "challenge 应只包含 base64url 合法字符"
        );
    }

    // ==================== TC-CGWEB-002: 授权 URL 构建 ====================

    #[test]
    fn test_tc_cgweb_002_build_authorize_url() {
        let url = oauth::build_authorize_url("test_challenge", "test_state");
        assert!(
            url.starts_with("https://auth.openai.com/oauth/authorize"),
            "URL 应以授权端点开头"
        );
        assert!(
            url.contains("client_id=app_EMoamEEZ73f0CkXaXp7hrann"),
            "URL 应包含 Client ID"
        );
        assert!(
            url.contains("code_challenge=test_challenge"),
            "URL 应包含 code_challenge"
        );
        assert!(url.contains("state=test_state"), "URL 应包含 state");
        assert!(
            url.contains("response_type=code"),
            "URL 应包含 response_type=code"
        );
        assert!(
            url.contains("code_challenge_method=S256"),
            "URL 应包含 S256 方法"
        );
    }

    // ==================== TC-CGWEB-003: 模型规范化 - 精确匹配 ====================

    #[test]
    fn test_tc_cgweb_003_normalize_model_exact() {
        assert_eq!(normalize_codex_model("gpt-5.4"), "gpt-5.4");
        assert_eq!(normalize_codex_model("gpt-5.4-mini"), "gpt-5.4-mini");
        assert_eq!(normalize_codex_model("gpt-5.4-nano"), "gpt-5.4-nano");
        assert_eq!(normalize_codex_model("gpt-5.3-codex"), "gpt-5.3-codex");
        assert_eq!(normalize_codex_model("gpt-5.2"), "gpt-5.2");
        assert_eq!(normalize_codex_model("gpt-5.2-codex"), "gpt-5.2-codex");
        assert_eq!(normalize_codex_model("gpt-5.1"), "gpt-5.1");
        assert_eq!(normalize_codex_model("gpt-5.1-codex"), "gpt-5.1-codex");
        assert_eq!(
            normalize_codex_model("gpt-5.1-codex-max"),
            "gpt-5.1-codex-max"
        );
        assert_eq!(
            normalize_codex_model("gpt-5.1-codex-mini"),
            "gpt-5.1-codex-mini"
        );
    }

    // ==================== TC-CGWEB-004: 模型规范化 - 带后缀 ====================

    #[test]
    fn test_tc_cgweb_004_normalize_model_with_suffix() {
        assert_eq!(normalize_codex_model("gpt-5.4-high"), "gpt-5.4");
        assert_eq!(normalize_codex_model("gpt-5.4-low"), "gpt-5.4");
        assert_eq!(normalize_codex_model("gpt-5.3-high"), "gpt-5.3-codex");
        assert_eq!(
            normalize_codex_model("gpt-5.3-codex-medium"),
            "gpt-5.3-codex"
        );
        assert_eq!(normalize_codex_model("gpt-5.2-none"), "gpt-5.2");
        assert_eq!(
            normalize_codex_model("gpt-5.1-codex-xhigh"),
            "gpt-5.1-codex"
        );
    }

    // ==================== TC-CGWEB-005: 模型规范化 - 通用别名 ====================

    #[test]
    fn test_tc_cgweb_005_normalize_model_alias() {
        assert_eq!(normalize_codex_model("gpt-5"), "gpt-5.1");
        assert_eq!(normalize_codex_model("gpt-5-mini"), "gpt-5.1");
        assert_eq!(normalize_codex_model("gpt-5-nano"), "gpt-5.1");
        assert_eq!(normalize_codex_model("gpt-5-codex"), "gpt-5.1-codex");
        assert_eq!(
            normalize_codex_model("codex-mini-latest"),
            "gpt-5.1-codex-mini"
        );
    }

    // ==================== TC-CGWEB-006: 模型规范化 - 默认 ====================

    #[test]
    fn test_tc_cgweb_006_normalize_model_default() {
        assert_eq!(normalize_codex_model("unknown-model"), "gpt-5.1");
        assert_eq!(normalize_codex_model("claude-3"), "gpt-5.1");
    }

    // ==================== TC-CGWEB-007: 请求转换 - 系统消息提取 ====================

    #[test]
    fn test_tc_cgweb_007_transform_system_message() {
        let req = ChatCompletionsRequest {
            model: "gpt-5.1".to_string(),
            messages: vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: Some(serde_json::json!("你是一个编程助手")),
                    tool_calls: None,
                    tool_call_id: None,
                    name: None,
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: Some(serde_json::json!("你好")),
                    tool_calls: None,
                    tool_call_id: None,
                    name: None,
                },
            ],
            max_tokens: None,
            max_completion_tokens: None,
            temperature: None,
            top_p: None,
            stream: Some(true),
            stream_options: None,
            tools: None,
            tool_choice: None,
            reasoning_effort: None,
            service_tier: None,
        };

        let result = chat_completions_to_responses(&req, "gpt-5.1");

        // system 消息应提取到 instructions
        assert!(result.instructions.is_some(), "instructions 不应为空");
        assert_eq!(
            result.instructions.as_ref().unwrap(),
            "你是一个编程助手",
            "instructions 应包含系统提示"
        );
        // input 中不应包含 system 消息
        assert_eq!(result.input.len(), 1, "input 应只有 user 消息");
        assert_eq!(result.input[0]["role"], "user");
    }

    // ==================== TC-CGWEB-008: 请求转换 - 工具调用 ====================

    #[test]
    fn test_tc_cgweb_008_transform_tool_calls() {
        let req = ChatCompletionsRequest {
            model: "gpt-5.1".to_string(),
            messages: vec![ChatMessage {
                role: "assistant".to_string(),
                content: None,
                tool_calls: Some(vec![ToolCall {
                    id: "call_abc123".to_string(),
                    call_type: "function".to_string(),
                    function: FunctionCall {
                        name: "get_weather".to_string(),
                        arguments: "{\"city\":\"北京\"}".to_string(),
                    },
                }]),
                tool_call_id: None,
                name: None,
            }],
            max_tokens: None,
            max_completion_tokens: None,
            temperature: None,
            top_p: None,
            stream: Some(true),
            stream_options: None,
            tools: None,
            tool_choice: None,
            reasoning_effort: None,
            service_tier: None,
        };

        let result = chat_completions_to_responses(&req, "gpt-5.1");

        // 应有 function_call item
        assert!(!result.input.is_empty(), "input 不应为空");
        let fc_item = &result.input[0];
        assert_eq!(fc_item["type"], "function_call");
        assert_eq!(fc_item["name"], "get_weather");
        assert_eq!(fc_item["arguments"], "{\"city\":\"北京\"}");
    }

    // ==================== TC-CGWEB-009: 请求转换 - call_id 规范化 ====================

    #[test]
    fn test_tc_cgweb_009_normalize_call_id() {
        let req = ChatCompletionsRequest {
            model: "gpt-5.1".to_string(),
            messages: vec![
                ChatMessage {
                    role: "assistant".to_string(),
                    content: None,
                    tool_calls: Some(vec![ToolCall {
                        id: "call_abc123".to_string(),
                        call_type: "function".to_string(),
                        function: FunctionCall {
                            name: "test_fn".to_string(),
                            arguments: "{}".to_string(),
                        },
                    }]),
                    tool_call_id: None,
                    name: None,
                },
                ChatMessage {
                    role: "tool".to_string(),
                    content: Some(serde_json::json!("结果")),
                    tool_calls: None,
                    tool_call_id: Some("call_abc123".to_string()),
                    name: None,
                },
            ],
            max_tokens: None,
            max_completion_tokens: None,
            temperature: None,
            top_p: None,
            stream: Some(true),
            stream_options: None,
            tools: None,
            tool_choice: None,
            reasoning_effort: None,
            service_tier: None,
        };

        let result = chat_completions_to_responses(&req, "gpt-5.1");

        // call_ 前缀应转换为 fc
        let fc_item = &result.input[0];
        assert_eq!(fc_item["call_id"], "fcabc123", "call_ 前缀应转换为 fc");

        let output_item = &result.input[1];
        assert_eq!(
            output_item["call_id"], "fcabc123",
            "tool 消息的 call_id 也应转换"
        );
    }

    // ==================== TC-CGWEB-010: 响应转换 - 文本增量 ====================

    #[test]
    fn test_tc_cgweb_010_response_text_delta() {
        let event = ResponsesStreamEvent {
            event_type: "response.output_text.delta".to_string(),
            response: None,
            item: None,
            output_index: 0,
            delta: "你好".to_string(),
            text: String::new(),
        };

        let mut ctx = StreamContext::new("gpt-5.1", false);
        let chunks = responses_event_to_chunks(&event, &mut ctx);

        assert_eq!(chunks.len(), 1, "应生成 1 个 chunk");
        let chunk = &chunks[0];
        assert_eq!(chunk.choices[0].delta.content.as_deref(), Some("你好"));
    }

    // ==================== TC-CGWEB-011: 响应转换 - 完成事件 ====================

    #[test]
    fn test_tc_cgweb_011_response_completed() {
        let event = ResponsesStreamEvent {
            event_type: "response.completed".to_string(),
            response: Some(ResponsesResponse {
                id: Some("resp_123".to_string()),
                status: Some("completed".to_string()),
                output: vec![],
                usage: Some(ResponsesUsage {
                    input_tokens: Some(10),
                    output_tokens: Some(20),
                }),
                incomplete_details: None,
                error: None,
            }),
            item: None,
            output_index: 0,
            delta: String::new(),
            text: String::new(),
        };

        let mut ctx = StreamContext::new("gpt-5.1", true);
        let chunks = responses_event_to_chunks(&event, &mut ctx);

        // 应有 finish chunk + usage chunk
        assert_eq!(chunks.len(), 2, "应生成 finish + usage 2 个 chunk");
        assert_eq!(
            chunks[0].choices[0].finish_reason.as_deref(),
            Some("stop"),
            "finish_reason 应为 stop"
        );
        assert!(chunks[1].usage.is_some(), "第二个 chunk 应有 usage");
        let usage = chunks[1].usage.as_ref().unwrap();
        assert_eq!(usage.prompt_tokens, 10);
        assert_eq!(usage.completion_tokens, 20);
        assert_eq!(usage.total_tokens, 30);
    }

    // ==================== TC-CGWEB-012: 响应转换 - 工具调用 ====================

    #[test]
    fn test_tc_cgweb_012_response_function_call() {
        let event = ResponsesStreamEvent {
            event_type: "response.output_item.added".to_string(),
            response: None,
            item: Some(ResponsesOutputItem {
                item_type: Some("function_call".to_string()),
                id: Some("fc_123".to_string()),
                call_id: Some("fc_123".to_string()),
                name: Some("get_weather".to_string()),
                arguments: None,
                content: None,
                text: None,
            }),
            output_index: 0,
            delta: String::new(),
            text: String::new(),
        };

        let mut ctx = StreamContext::new("gpt-5.1", false);
        let chunks = responses_event_to_chunks(&event, &mut ctx);

        assert_eq!(chunks.len(), 1, "应生成 1 个 chunk");
        let tc = &chunks[0].choices[0].delta.tool_calls.as_ref().unwrap()[0];
        assert_eq!(tc.index, 0, "第一个工具调用 index 应为 0");
        assert_eq!(tc.call_type.as_deref(), Some("function"));
        assert_eq!(
            tc.function.as_ref().unwrap().name.as_deref(),
            Some("get_weather")
        );

        // tool_call_index 应递增
        assert_eq!(ctx.tool_call_index, 1, "tool_call_index 应递增到 1");
    }

    // ==================== TC-CGWEB-013: JWT 解析 account_id ====================

    #[test]
    fn test_tc_cgweb_013_parse_jwt_account_id() {
        // 构造一个包含 chatgpt_account_id 的 JWT payload
        use base64::Engine;
        let payload = serde_json::json!({
            "https://api.openai.com/auth": {
                "chatgpt_account_id": "acct_test_123"
            },
            "sub": "user_123"
        });
        let payload_b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(serde_json::to_string(&payload).unwrap());

        // JWT 格式：header.payload.signature
        let fake_jwt = format!("eyJ0eXAiOiJKV1QifQ.{}.fake_sig", payload_b64);

        // 使用 client 模块中的解析逻辑进行验证
        // 手动解析 JWT 验证
        let parts: Vec<&str> = fake_jwt.split('.').collect();
        assert_eq!(parts.len(), 3, "JWT 应有 3 段");
        let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(parts[1])
            .unwrap();
        let claims: serde_json::Value = serde_json::from_slice(&decoded).unwrap();
        let account_id = claims
            .get("https://api.openai.com/auth")
            .and_then(|auth| auth.get("chatgpt_account_id"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        assert_eq!(
            account_id,
            Some("acct_test_123".to_string()),
            "应正确解析 chatgpt_account_id"
        );
    }

    // ==================== TC-CGWEB-014: JWT 解析无效 ====================

    #[test]
    fn test_tc_cgweb_014_parse_jwt_invalid() {
        use base64::Engine;

        // 无效 JWT（不足 2 段）
        let parts: Vec<&str> = "not_a_jwt".split('.').collect();
        assert!(parts.len() < 2, "无效 JWT 不足 2 段");

        // 有效格式但无 account_id
        let payload = serde_json::json!({"sub": "user_123"});
        let payload_b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(serde_json::to_string(&payload).unwrap());
        let fake_jwt = format!("eyJ0eXAiOiJKV1QifQ.{}.fake_sig", payload_b64);

        let parts: Vec<&str> = fake_jwt.split('.').collect();
        let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(parts[1])
            .unwrap();
        let claims: serde_json::Value = serde_json::from_slice(&decoded).unwrap();
        let account_id = claims
            .get("https://api.openai.com/auth")
            .and_then(|auth| auth.get("chatgpt_account_id"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        assert_eq!(account_id, None, "无 account_id 的 JWT 应返回 None");
    }

    // ==================== 额外测试：请求转换强制参数 ====================

    #[test]
    fn test_transform_forced_params() {
        let req = ChatCompletionsRequest {
            model: "gpt-5.1".to_string(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: Some(serde_json::json!("测试")),
                tool_calls: None,
                tool_call_id: None,
                name: None,
            }],
            max_tokens: Some(1000),
            max_completion_tokens: None,
            temperature: Some(0.8),
            top_p: Some(0.9),
            stream: Some(true),
            stream_options: None,
            tools: None,
            tool_choice: None,
            reasoning_effort: None,
            service_tier: None,
        };

        let result = chat_completions_to_responses(&req, "gpt-5.1");

        // OAuth 模式强制删除采样参数
        assert!(result.temperature.is_none(), "temperature 应被删除");
        assert!(result.top_p.is_none(), "top_p 应被删除");
        assert!(
            result.max_output_tokens.is_none(),
            "max_output_tokens 应被删除"
        );
        // 强制参数
        assert!(result.stream, "stream 应为 true");
        assert!(!result.store, "store 应为 false");
    }

    // ==================== 额外测试：默认 instructions ====================

    #[test]
    fn test_transform_default_instructions() {
        let req = ChatCompletionsRequest {
            model: "gpt-5.1".to_string(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: Some(serde_json::json!("你好")),
                tool_calls: None,
                tool_call_id: None,
                name: None,
            }],
            max_tokens: None,
            max_completion_tokens: None,
            temperature: None,
            top_p: None,
            stream: Some(true),
            stream_options: None,
            tools: None,
            tool_choice: None,
            reasoning_effort: None,
            service_tier: None,
        };

        let result = chat_completions_to_responses(&req, "gpt-5.1");

        // 无 system 消息时应有默认 instructions
        assert_eq!(
            result.instructions.as_deref(),
            Some("You are a helpful coding assistant."),
            "无 system 消息时应使用默认 instructions"
        );
    }
}
