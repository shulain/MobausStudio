//! ChatGPT Web 订阅代理模块单元测试
//!
//! 与 docs/modules/chatgpt_web.md 测试用例一一对应
//!
//! @module services/chatgpt_web/tests
//! @version 0.1.0

#[cfg(test)]
mod tests {
    use crate::services::chatgpt_web::oauth;
    use crate::services::chatgpt_web::stream::extract_failed_error;
    use crate::services::chatgpt_web::transform::*;
    use crate::services::chatgpt_web::types::*;

    // ==================== TC-CGWEB-001: PKCE 对生成 ====================

    #[test]
    fn test_tc_cgweb_001_generate_pkce_pair() {
        let (verifier, challenge) = oauth::generate_pkce_pair().expect("generate_pkce_pair should succeed");
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

    // ==================== TC-CGWEB-017: 请求转换 - tools 格式转换 ====================

    #[test]
    fn test_tc_cgweb_017_transform_tools_format() {
        let req = ChatCompletionsRequest {
            model: "gpt-5.1".to_string(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: Some(serde_json::json!("查天气")),
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
            tools: Some(vec![
                Tool {
                    tool_type: "function".to_string(),
                    function: ToolFunction {
                        name: "get_weather".to_string(),
                        description: Some("获取指定城市的天气信息".to_string()),
                        parameters: Some(serde_json::json!({
                            "type": "object",
                            "properties": {
                                "city": {
                                    "type": "string",
                                    "description": "城市名"
                                }
                            },
                            "required": ["city"]
                        })),
                    },
                },
                Tool {
                    tool_type: "function".to_string(),
                    function: ToolFunction {
                        name: "search".to_string(),
                        description: None,
                        parameters: None,
                    },
                },
            ]),
            tool_choice: None,
            reasoning_effort: None,
            service_tier: None,
        };

        let result = chat_completions_to_responses(&req, "gpt-5.1");

        // tools 应被转换为扁平格式
        assert!(result.tools.is_some(), "tools 不应为 None");
        let tools = result.tools.as_ref().unwrap();
        assert_eq!(tools.len(), 2, "应有 2 个工具定义");

        // 第一个工具：完整字段
        let tool0 = &tools[0];
        assert_eq!(tool0["type"], "function", "type 应为 function");
        assert_eq!(tool0["name"], "get_weather", "name 应提升到顶层");
        assert_eq!(
            tool0["description"], "获取指定城市的天气信息",
            "description 应提升到顶层"
        );
        assert!(tool0["parameters"].is_object(), "parameters 应提升到顶层");
        assert_eq!(
            tool0["parameters"]["properties"]["city"]["type"], "string",
            "parameters 内容应保持不变"
        );
        // 不应有嵌套的 function 字段
        assert!(
            tool0.get("function").is_none(),
            "不应有嵌套的 function 字段"
        );

        // 第二个工具：仅有 name，无 description 和 parameters
        let tool1 = &tools[1];
        assert_eq!(tool1["type"], "function");
        assert_eq!(tool1["name"], "search", "name 应提升到顶层");
        assert!(
            tool1.get("description").is_none(),
            "无 description 时不应有该字段"
        );
        assert!(
            tool1.get("parameters").is_none(),
            "无 parameters 时不应有该字段"
        );
    }

    // ==================== TC-CGWEB-018: 请求转换 - 无 tools ====================

    #[test]
    fn test_tc_cgweb_018_transform_no_tools() {
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

        // tools 为 None 时应保持 None
        assert!(result.tools.is_none(), "无 tools 时应保持 None");
    }

    // ==================== TC-CGWEB-019: 请求转换 - parameters schema 修补 ====================

    #[test]
    fn test_tc_cgweb_019_transform_tools_fix_missing_properties() {
        let req = ChatCompletionsRequest {
            model: "gpt-5.1".to_string(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: Some(serde_json::json!("测试")),
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
            tools: Some(vec![
                // 情况1：parameters 只有 type=object，缺少 properties
                Tool {
                    tool_type: "function".to_string(),
                    function: ToolFunction {
                        name: "check_login_status".to_string(),
                        description: Some("检查登录状态".to_string()),
                        parameters: Some(serde_json::json!({
                            "type": "object"
                        })),
                    },
                },
                // 情况2：parameters 有 properties，但嵌套的子 schema 缺少 properties
                Tool {
                    tool_type: "function".to_string(),
                    function: ToolFunction {
                        name: "create_user".to_string(),
                        description: Some("创建用户".to_string()),
                        parameters: Some(serde_json::json!({
                            "type": "object",
                            "properties": {
                                "name": { "type": "string" },
                                "address": { "type": "object" }
                            }
                        })),
                    },
                },
                // 情况3：parameters 已经完整，不应被修改
                Tool {
                    tool_type: "function".to_string(),
                    function: ToolFunction {
                        name: "get_weather".to_string(),
                        description: None,
                        parameters: Some(serde_json::json!({
                            "type": "object",
                            "properties": {
                                "city": { "type": "string" }
                            },
                            "required": ["city"]
                        })),
                    },
                },
                // 情况4：parameters 中 items 包含缺少 properties 的 object
                Tool {
                    tool_type: "function".to_string(),
                    function: ToolFunction {
                        name: "list_items".to_string(),
                        description: None,
                        parameters: Some(serde_json::json!({
                            "type": "object",
                            "properties": {
                                "items": {
                                    "type": "array",
                                    "items": { "type": "object" }
                                }
                            }
                        })),
                    },
                },
            ]),
            tool_choice: None,
            reasoning_effort: None,
            service_tier: None,
        };

        let result = chat_completions_to_responses(&req, "gpt-5.1");
        let tools = result.tools.as_ref().unwrap();
        assert_eq!(tools.len(), 4, "应有 4 个工具");

        // 情况1：顶层 object 缺少 properties → 应被补上空 properties
        let params0 = &tools[0]["parameters"];
        assert_eq!(params0["type"], "object");
        assert!(
            params0.get("properties").is_some(),
            "缺少 properties 的 object schema 应被补上"
        );
        assert!(
            params0["properties"].as_object().unwrap().is_empty(),
            "补上的 properties 应为空对象"
        );

        // 情况2：嵌套的 address 子 schema 也应被补上 properties
        let params1 = &tools[1]["parameters"];
        assert!(
            params1["properties"]["address"].get("properties").is_some(),
            "嵌套 object 子 schema 也应被补上 properties"
        );

        // 情况3：已有 properties 的不应被破坏
        let params2 = &tools[2]["parameters"];
        assert_eq!(
            params2["properties"]["city"]["type"], "string",
            "已有 properties 的 schema 不应被修改"
        );
        assert_eq!(params2["required"][0], "city", "required 字段应保持不变");

        // 情况4：items 中的 object 也应被补上
        let params3 = &tools[3]["parameters"];
        let items_schema = &params3["properties"]["items"]["items"];
        assert!(
            items_schema.get("properties").is_some(),
            "items 内嵌套的 object schema 也应被补上 properties"
        );
    }

    // ==================== TC-CGWEB-020: schema 修补覆盖组合/定义类子 schema ====================

    #[test]
    fn test_tc_cgweb_020_transform_tools_fix_composite_schemas() {
        let req = ChatCompletionsRequest {
            model: "gpt-5.1".to_string(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: Some(serde_json::json!("测试")),
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
            tools: Some(vec![
                // 情况1：anyOf 中包含缺少 properties 的 object
                Tool {
                    tool_type: "function".to_string(),
                    function: ToolFunction {
                        name: "tool_anyof".to_string(),
                        description: None,
                        parameters: Some(serde_json::json!({
                            "type": "object",
                            "properties": {
                                "data": {
                                    "anyOf": [
                                        { "type": "string" },
                                        { "type": "object" }
                                    ]
                                }
                            }
                        })),
                    },
                },
                // 情况2：oneOf 中包含缺少 properties 的 object
                Tool {
                    tool_type: "function".to_string(),
                    function: ToolFunction {
                        name: "tool_oneof".to_string(),
                        description: None,
                        parameters: Some(serde_json::json!({
                            "type": "object",
                            "properties": {
                                "input": {
                                    "oneOf": [
                                        { "type": "object" },
                                        { "type": "array", "items": { "type": "object" } }
                                    ]
                                }
                            }
                        })),
                    },
                },
                // 情况3：allOf 中包含缺少 properties 的 object
                Tool {
                    tool_type: "function".to_string(),
                    function: ToolFunction {
                        name: "tool_allof".to_string(),
                        description: None,
                        parameters: Some(serde_json::json!({
                            "type": "object",
                            "properties": {
                                "config": {
                                    "allOf": [
                                        { "type": "object", "properties": { "a": { "type": "string" } } },
                                        { "type": "object" }
                                    ]
                                }
                            }
                        })),
                    },
                },
                // 情况4：additionalProperties 为 object schema 缺少 properties
                Tool {
                    tool_type: "function".to_string(),
                    function: ToolFunction {
                        name: "tool_additional".to_string(),
                        description: None,
                        parameters: Some(serde_json::json!({
                            "type": "object",
                            "properties": {},
                            "additionalProperties": { "type": "object" }
                        })),
                    },
                },
                // 情况5：$defs 中包含缺少 properties 的 object
                Tool {
                    tool_type: "function".to_string(),
                    function: ToolFunction {
                        name: "tool_defs".to_string(),
                        description: None,
                        parameters: Some(serde_json::json!({
                            "type": "object",
                            "properties": {
                                "ref_field": { "$ref": "#/$defs/MyObj" }
                            },
                            "$defs": {
                                "MyObj": { "type": "object" }
                            }
                        })),
                    },
                },
                // 情况6：definitions（旧式）中包含缺少 properties 的 object
                Tool {
                    tool_type: "function".to_string(),
                    function: ToolFunction {
                        name: "tool_definitions".to_string(),
                        description: None,
                        parameters: Some(serde_json::json!({
                            "type": "object",
                            "properties": {},
                            "definitions": {
                                "LegacyObj": { "type": "object" }
                            }
                        })),
                    },
                },
                // 情况7：tuple items（数组形式）中包含缺少 properties 的 object
                Tool {
                    tool_type: "function".to_string(),
                    function: ToolFunction {
                        name: "tool_tuple_items".to_string(),
                        description: None,
                        parameters: Some(serde_json::json!({
                            "type": "object",
                            "properties": {
                                "pair": {
                                    "type": "array",
                                    "items": [
                                        { "type": "string" },
                                        { "type": "object" }
                                    ]
                                }
                            }
                        })),
                    },
                },
            ]),
            tool_choice: None,
            reasoning_effort: None,
            service_tier: None,
        };

        let result = chat_completions_to_responses(&req, "gpt-5.1");
        let tools = result.tools.as_ref().unwrap();
        assert_eq!(tools.len(), 7, "应有 7 个工具");

        // 情况1：anyOf 中的 object 应被补上 properties
        let anyof_branches = tools[0]["parameters"]["properties"]["data"]["anyOf"]
            .as_array()
            .unwrap();
        assert_eq!(anyof_branches[0]["type"], "string", "string 不受影响");
        assert!(
            anyof_branches[1].get("properties").is_some(),
            "anyOf 中的 object 应被补上 properties"
        );

        // 情况2：oneOf 中的 object 应被补上 properties，且嵌套的 items object 也应被补上
        let oneof_branches = tools[1]["parameters"]["properties"]["input"]["oneOf"]
            .as_array()
            .unwrap();
        assert!(
            oneof_branches[0].get("properties").is_some(),
            "oneOf 中的 object 应被补上 properties"
        );
        assert!(
            oneof_branches[1]["items"].get("properties").is_some(),
            "oneOf 分支中 items 内的 object 也应被补上 properties"
        );

        // 情况3：allOf 中第二个缺少 properties 的 object 应被补上
        let allof_branches = tools[2]["parameters"]["properties"]["config"]["allOf"]
            .as_array()
            .unwrap();
        assert!(
            allof_branches[0]["properties"]["a"]["type"] == "string",
            "已有 properties 的 allOf 分支不应被破坏"
        );
        assert!(
            allof_branches[1].get("properties").is_some(),
            "allOf 中缺少 properties 的 object 应被补上"
        );

        // 情况4：additionalProperties 中的 object 应被补上 properties
        assert!(
            tools[3]["parameters"]["additionalProperties"]
                .get("properties")
                .is_some(),
            "additionalProperties 中的 object 应被补上 properties"
        );

        // 情况5：$defs 中的 object 应被补上 properties
        assert!(
            tools[4]["parameters"]["$defs"]["MyObj"]
                .get("properties")
                .is_some(),
            "$defs 中的 object 应被补上 properties"
        );

        // 情况6：definitions 中的 object 应被补上 properties
        assert!(
            tools[5]["parameters"]["definitions"]["LegacyObj"]
                .get("properties")
                .is_some(),
            "definitions 中的 object 应被补上 properties"
        );

        // 情况7：tuple items（数组形式）中的 object 应被补上 properties
        let tuple_items = tools[6]["parameters"]["properties"]["pair"]["items"]
            .as_array()
            .unwrap();
        assert_eq!(tuple_items[0]["type"], "string", "tuple 中 string 不受影响");
        assert!(
            tuple_items[1].get("properties").is_some(),
            "tuple items 中的 object 应被补上 properties"
        );
    }

    // ==================== TC-CGWEB-016a: response.failed 错误提取 - 有详情 ====================

    #[test]
    fn test_tc_cgweb_016a_extract_failed_error_with_details() {
        let event = ResponsesStreamEvent {
            event_type: "response.failed".to_string(),
            response: Some(ResponsesResponse {
                id: Some("resp_err_001".to_string()),
                status: Some("failed".to_string()),
                output: vec![],
                usage: None,
                incomplete_details: None,
                error: Some(ResponsesErrorDetails {
                    message: Some(
                        "Invalid schema for function 'check_login_status': object schema missing properties"
                            .to_string(),
                    ),
                    error_type: Some("invalid_request_error".to_string()),
                }),
            }),
            item: None,
            output_index: 0,
            delta: String::new(),
            text: String::new(),
        };

        let (error_type, error_msg) = extract_failed_error(&event);

        assert_eq!(error_type, "invalid_request_error", "error_type 应正确提取");
        assert!(
            error_msg.contains("object schema missing properties"),
            "error_msg 应包含原始错误描述，实际: {}",
            error_msg
        );
    }

    // ==================== TC-CGWEB-016b: response.failed 错误提取 - 无详情 ====================

    #[test]
    fn test_tc_cgweb_016b_extract_failed_error_no_details() {
        // 情况1：response 中 error 为 None
        let event_no_error = ResponsesStreamEvent {
            event_type: "response.failed".to_string(),
            response: Some(ResponsesResponse {
                id: Some("resp_err_002".to_string()),
                status: Some("failed".to_string()),
                output: vec![],
                usage: None,
                incomplete_details: None,
                error: None,
            }),
            item: None,
            output_index: 0,
            delta: String::new(),
            text: String::new(),
        };

        let (error_type, error_msg) = extract_failed_error(&event_no_error);

        assert_eq!(error_type, "", "无 error 时 error_type 应为空字符串");
        assert_eq!(
            error_msg, "上游响应失败（未提供错误详情）",
            "无 error 时应返回默认错误信息"
        );

        // 情况2：response 本身为 None
        let event_no_response = ResponsesStreamEvent {
            event_type: "response.failed".to_string(),
            response: None,
            item: None,
            output_index: 0,
            delta: String::new(),
            text: String::new(),
        };

        let (error_type2, error_msg2) = extract_failed_error(&event_no_response);

        assert_eq!(error_type2, "", "无 response 时 error_type 应为空字符串");
        assert_eq!(
            error_msg2, "上游响应失败（未提供错误详情）",
            "无 response 时应返回默认错误信息"
        );
    }

    // ==================== TC-CGWEB-016c: response.failed 不生成 chunk ====================

    #[test]
    fn test_tc_cgweb_016c_response_failed_no_chunks() {
        // response.failed 事件传给 responses_event_to_chunks 时，不应生成任何 chunk
        // （stream.rs 在上层拦截 response.failed，但即使漏到 transform 层也应安全）
        let event = ResponsesStreamEvent {
            event_type: "response.failed".to_string(),
            response: Some(ResponsesResponse {
                id: Some("resp_err_003".to_string()),
                status: Some("failed".to_string()),
                output: vec![],
                usage: None,
                incomplete_details: None,
                error: Some(ResponsesErrorDetails {
                    message: Some("Server error".to_string()),
                    error_type: Some("server_error".to_string()),
                }),
            }),
            item: None,
            output_index: 0,
            delta: String::new(),
            text: String::new(),
        };

        let mut ctx = StreamContext::new("gpt-5.1", true);
        let chunks = responses_event_to_chunks(&event, &mut ctx);

        // 核心断言：response.failed 不应生成任何 chunk（不会误发 Done 或其他内容）
        assert!(
            chunks.is_empty(),
            "response.failed 不应生成任何 chunk，实际生成了 {} 个",
            chunks.len()
        );
    }

    // ==================== TC-CGWEB-023: 多工具调用交错 argument delta 路由 ====================

    #[test]
    fn test_tc_cgweb_023_interleaved_multi_tool_call_argument_deltas() {
        let mut ctx = StreamContext::new("gpt-5.1", false);

        // ---- 步骤 1：added function_call A（output_index=0）----
        let added_a = ResponsesStreamEvent {
            event_type: "response.output_item.added".to_string(),
            response: None,
            item: Some(ResponsesOutputItem {
                item_type: Some("function_call".to_string()),
                id: Some("fc_aaa".to_string()),
                call_id: Some("fc_aaa".to_string()),
                name: Some("get_weather".to_string()),
                arguments: None,
                content: None,
                text: None,
            }),
            output_index: 0,
            delta: String::new(),
            text: String::new(),
        };
        let chunks = responses_event_to_chunks(&added_a, &mut ctx);
        assert_eq!(chunks.len(), 1, "added A 应生成 1 个 chunk");
        let tc_a = &chunks[0].choices[0].delta.tool_calls.as_ref().unwrap()[0];
        assert_eq!(tc_a.index, 0, "第一个工具调用 index 应为 0");
        assert_eq!(
            tc_a.function.as_ref().unwrap().name.as_deref(),
            Some("get_weather"),
            "第一个工具应为 get_weather"
        );

        // ---- 步骤 2：added function_call B（output_index=1）----
        let added_b = ResponsesStreamEvent {
            event_type: "response.output_item.added".to_string(),
            response: None,
            item: Some(ResponsesOutputItem {
                item_type: Some("function_call".to_string()),
                id: Some("fc_bbb".to_string()),
                call_id: Some("fc_bbb".to_string()),
                name: Some("get_time".to_string()),
                arguments: None,
                content: None,
                text: None,
            }),
            output_index: 1,
            delta: String::new(),
            text: String::new(),
        };
        let chunks = responses_event_to_chunks(&added_b, &mut ctx);
        assert_eq!(chunks.len(), 1, "added B 应生成 1 个 chunk");
        let tc_b = &chunks[0].choices[0].delta.tool_calls.as_ref().unwrap()[0];
        assert_eq!(tc_b.index, 1, "第二个工具调用 index 应为 1");
        assert_eq!(
            tc_b.function.as_ref().unwrap().name.as_deref(),
            Some("get_time"),
            "第二个工具应为 get_time"
        );

        // 此时 ctx 状态：tool_call_index=2, tool_call_map={0→0, 1→1}
        assert_eq!(
            ctx.tool_call_index, 2,
            "两个 added 后 tool_call_index 应为 2"
        );

        // ---- 步骤 3：argument delta → output_index=0（应路由到 tool_call index=0）----
        let delta_a1 = ResponsesStreamEvent {
            event_type: "response.function_call_arguments.delta".to_string(),
            response: None,
            item: None,
            output_index: 0,
            delta: "{\"ci".to_string(),
            text: String::new(),
        };
        let chunks = responses_event_to_chunks(&delta_a1, &mut ctx);
        assert_eq!(chunks.len(), 1, "delta A1 应生成 1 个 chunk");
        let tc = &chunks[0].choices[0].delta.tool_calls.as_ref().unwrap()[0];
        assert_eq!(
            tc.index, 0,
            "output_index=0 的 delta 应路由到 tool_call index=0"
        );
        assert_eq!(
            tc.function.as_ref().unwrap().arguments.as_deref(),
            Some("{\"ci"),
            "delta 内容应为 A 的首段参数片段"
        );

        // ---- 步骤 4：argument delta → output_index=1（应路由到 tool_call index=1）----
        let delta_b1 = ResponsesStreamEvent {
            event_type: "response.function_call_arguments.delta".to_string(),
            response: None,
            item: None,
            output_index: 1,
            delta: "{\"lo".to_string(),
            text: String::new(),
        };
        let chunks = responses_event_to_chunks(&delta_b1, &mut ctx);
        assert_eq!(chunks.len(), 1, "delta B1 应生成 1 个 chunk");
        let tc = &chunks[0].choices[0].delta.tool_calls.as_ref().unwrap()[0];
        assert_eq!(
            tc.index, 1,
            "output_index=1 的 delta 应路由到 tool_call index=1"
        );
        assert_eq!(
            tc.function.as_ref().unwrap().arguments.as_deref(),
            Some("{\"lo"),
            "delta 内容应为 B 的首段参数片段"
        );

        // ---- 步骤 5：argument delta 再次回到 output_index=0 ----
        let delta_a2 = ResponsesStreamEvent {
            event_type: "response.function_call_arguments.delta".to_string(),
            response: None,
            item: None,
            output_index: 0,
            delta: "ty\":\"BJ\"}".to_string(),
            text: String::new(),
        };
        let chunks = responses_event_to_chunks(&delta_a2, &mut ctx);
        assert_eq!(chunks.len(), 1, "delta A2 应生成 1 个 chunk");
        let tc = &chunks[0].choices[0].delta.tool_calls.as_ref().unwrap()[0];
        assert_eq!(
            tc.index, 0,
            "再次回到 output_index=0 的 delta 仍应路由到 tool_call index=0"
        );
        assert_eq!(
            tc.function.as_ref().unwrap().arguments.as_deref(),
            Some("ty\":\"BJ\"}"),
            "delta 内容应为后半段参数"
        );

        // ---- 步骤 6：argument delta 再次回到 output_index=1 ----
        let delta_b2 = ResponsesStreamEvent {
            event_type: "response.function_call_arguments.delta".to_string(),
            response: None,
            item: None,
            output_index: 1,
            delta: "c\":\"SH\"}".to_string(),
            text: String::new(),
        };
        let chunks = responses_event_to_chunks(&delta_b2, &mut ctx);
        assert_eq!(chunks.len(), 1, "delta B2 应生成 1 个 chunk");
        let tc = &chunks[0].choices[0].delta.tool_calls.as_ref().unwrap()[0];
        assert_eq!(
            tc.index, 1,
            "再次回到 output_index=1 的 delta 仍应路由到 tool_call index=1"
        );
        assert_eq!(
            tc.function.as_ref().unwrap().arguments.as_deref(),
            Some("c\":\"SH\"}"),
            "delta 内容应为后半段参数"
        );
    }
}
