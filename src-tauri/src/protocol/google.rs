//! Google 协议实现 (v0.9.0, v4.1.37: 工具调用完整支持)
//!
//! 实现 Google Gemini / Cloud Code API 协议
//!
//! ## 适用场景
//! - Google AI Studio (API Key)
//! - Google Cloud Code (OAuth)
//!
//! ## 协议特点
//! - 端点: `/generateContent` 或 Cloud Code 内部端点
//! - 认证: API Key (URL 参数) 或 Bearer Token (OAuth)
//! - 消息格式: `contents: [{role, parts: [{text}]}]`
//! - 工具格式: `tools: [{functionDeclarations: [...]}]`
//! - 流式格式: SSE `data: {...}`
//!
//! ## v4.1.37 变更
//! - 支持工具注册（functionDeclarations）
//! - 支持结构化消息转换（functionCall/functionResponse parts）
//! - 支持 thought_signature 回传（Gemini 2.5 thinking 模型）
//! - 响应解析支持 functionCall part
//! - 消息截断防超限
//! - 连续同角色消息合并
//! - 未完成工具调用自动补充占位结果
//!
//! ## v0.9.1 变更（2026-02-27）
//! - 添加多端点降级机制（Sandbox → Daily → Prod）
//! - 添加智能重试策略（线性退避、指数退避）
//! - 添加账号轮换机制

use log::{debug, info, warn};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use reqwest::StatusCode;
use serde_json::json;
use tokio::time::{sleep, Duration};

use super::{ChatProtocol, ChatStreamRequest, ProtocolType, StreamBuffer, StreamEvent};

/// 粗略估算的最大 token 数限制（约 200k token，每个 token 约 4 字符）
const MAX_ESTIMATED_CHARS: usize = 800_000;

// Cloud Code v1internal endpoints (fallback order: Sandbox → Daily → Prod)
// 优先使用 Sandbox/Daily 环境以避免 Prod 环境的 429 错误
const V1_INTERNAL_BASE_URL_PROD: &str = "https://cloudcode-pa.googleapis.com/v1internal";
const V1_INTERNAL_BASE_URL_DAILY: &str = "https://daily-cloudcode-pa.googleapis.com/v1internal";
const V1_INTERNAL_BASE_URL_SANDBOX: &str =
    "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal";

const V1_INTERNAL_BASE_URL_FALLBACKS: [&str; 3] = [
    V1_INTERNAL_BASE_URL_SANDBOX, // 优先级 1: Sandbox (稳定性最高)
    V1_INTERNAL_BASE_URL_DAILY,   // 优先级 2: Daily (备用)
    V1_INTERNAL_BASE_URL_PROD,    // 优先级 3: Prod (仅作为兜底)
];

/// 重试策略枚举
#[derive(Debug, Clone)]
pub enum RetryStrategy {
    /// 不重试
    NoRetry,
    /// 固定延迟
    FixedDelay(Duration),
    /// 线性退避：base_ms * (attempt + 1)
    LinearBackoff { base_ms: u64 },
    /// 指数退避：base_ms * 2^attempt，上限 max_ms
    ExponentialBackoff { base_ms: u64, max_ms: u64 },
}

/// Google 协议实现
pub struct GoogleProtocol;

impl GoogleProtocol {
    /// 检测是否是 OAuth Token
    ///
    /// OAuth Token 以 "ya29." 或 "1//" 开头，或不以 "AIza" 开头
    pub fn is_oauth_token(api_key: &str) -> bool {
        api_key.starts_with("ya29.") || api_key.starts_with("1//") || !api_key.starts_with("AIza")
    }

    /// 判断是否应该尝试下一个端点（降级逻辑）
    pub fn should_try_next_endpoint(status: StatusCode) -> bool {
        status == StatusCode::TOO_MANY_REQUESTS
            || status == StatusCode::REQUEST_TIMEOUT
            || status == StatusCode::NOT_FOUND
            || status.is_server_error()
    }

    /// 根据错误状态码确定重试策略
    pub fn determine_retry_strategy(status_code: u16) -> RetryStrategy {
        match status_code {
            // 429 限流错误：线性退避
            429 => RetryStrategy::LinearBackoff { base_ms: 5000 },

            // 503 服务不可用：指数退避
            503 | 529 => RetryStrategy::ExponentialBackoff {
                base_ms: 10000,
                max_ms: 60000,
            },

            // 500 服务器内部错误：线性退避
            500 => RetryStrategy::LinearBackoff { base_ms: 3000 },

            // 401/403 认证/权限错误：固定延迟
            401 | 403 => RetryStrategy::FixedDelay(Duration::from_millis(200)),

            // 404 资源未找到：固定延迟
            404 => RetryStrategy::FixedDelay(Duration::from_millis(300)),

            // 其他错误：不重试
            _ => RetryStrategy::NoRetry,
        }
    }

    /// 执行退避策略
    pub async fn apply_retry_strategy(
        strategy: RetryStrategy,
        attempt: usize,
        status_code: u16,
    ) -> bool {
        match strategy {
            RetryStrategy::NoRetry => {
                debug!("[google] 不可重试的错误 {}", status_code);
                false
            }
            RetryStrategy::FixedDelay(duration) => {
                let ms = duration.as_millis() as u64;
                info!(
                    "[google] ⏱️ 固定延迟重试: status={}, attempt={}, delay={}ms",
                    status_code,
                    attempt + 1,
                    ms
                );
                sleep(duration).await;
                true
            }
            RetryStrategy::LinearBackoff { base_ms } => {
                let delay_ms = base_ms * (attempt as u64 + 1);
                info!(
                    "[google] ⏱️ 线性退避重试: status={}, attempt={}, delay={}ms",
                    status_code,
                    attempt + 1,
                    delay_ms
                );
                sleep(Duration::from_millis(delay_ms)).await;
                true
            }
            RetryStrategy::ExponentialBackoff { base_ms, max_ms } => {
                let delay_ms = (base_ms * 2_u64.pow(attempt as u32)).min(max_ms);
                info!(
                    "[google] ⏱️ 指数退避重试: status={}, attempt={}, delay={}ms",
                    status_code,
                    attempt + 1,
                    delay_ms
                );
                sleep(Duration::from_millis(delay_ms)).await;
                true
            }
        }
    }

    /// 带端点降级和重试的 OAuth 请求
    ///
    /// 实现三层端点降级（Sandbox → Daily → Prod）和智能重试策略
    pub async fn call_with_fallback_and_retry(
        client: &reqwest::Client,
        access_token: &str,
        body: &serde_json::Value,
        max_retries: usize,
    ) -> Result<reqwest::Response, String> {
        let mut last_error: Option<String> = None;

        // 遍历所有端点
        for (endpoint_idx, base_url) in V1_INTERNAL_BASE_URL_FALLBACKS.iter().enumerate() {
            let url = format!("{}:streamGenerateContent?alt=sse", base_url);
            info!(
                "[google] 尝试端点 {}/{}: {}",
                endpoint_idx + 1,
                V1_INTERNAL_BASE_URL_FALLBACKS.len(),
                base_url
            );

            // 对每个端点进行重试
            for retry in 0..max_retries {
                // 构建请求头
                let user_agent = format!(
                    "antigravity/{} {}/{}",
                    "4.1.37",
                    std::env::consts::OS,
                    std::env::consts::ARCH
                );

                let response = client
                    .post(&url)
                    .header(AUTHORIZATION, format!("Bearer {}", access_token.trim()))
                    .header(CONTENT_TYPE, "application/json")
                    .header("User-Agent", &user_agent)
                    .header("Accept", "text/event-stream")
                    .json(body)
                    .send()
                    .await;

                match response {
                    Ok(resp) => {
                        let status = resp.status();

                        if status.is_success() {
                            if endpoint_idx > 0 || retry > 0 {
                                info!(
                                    "[google] ✓ 请求成功 | 端点: {} | 重试次数: {} | 状态: {}",
                                    base_url, retry, status
                                );
                            }
                            return Ok(resp);
                        }

                        // 获取错误信息
                        let error_text = resp.text().await.unwrap_or_default();
                        let status_code = status.as_u16();

                        warn!(
                            "[google] 端点 {} 返回错误 {} (尝试 {}/{}): {}",
                            base_url,
                            status_code,
                            retry + 1,
                            max_retries,
                            &error_text[..error_text.len().min(200)]
                        );

                        // 判断是否应该切换端点
                        if Self::should_try_next_endpoint(status) {
                            // 如果还有下一个端点，切换端点
                            if endpoint_idx + 1 < V1_INTERNAL_BASE_URL_FALLBACKS.len() {
                                warn!("[google] 端点 {} 不可用，切换到下一个端点", base_url);
                                last_error = Some(format!(
                                    "端点 {} 返回 {}: {}",
                                    base_url, status_code, error_text
                                ));
                                break; // 跳出重试循环，尝试下一个端点
                            }

                            // 如果是最后一个端点，尝试重试
                            if retry + 1 < max_retries {
                                let strategy = Self::determine_retry_strategy(status_code);
                                if Self::apply_retry_strategy(strategy, retry, status_code).await {
                                    last_error = Some(format!(
                                        "端点 {} 返回 {}: {}",
                                        base_url, status_code, error_text
                                    ));
                                    continue; // 继续重试当前端点
                                }
                            }
                        }

                        // 不可重试的错误或已达最大重试次数
                        return Err(format!(
                            "请求失败: API Error {} {}: {}",
                            status_code,
                            status.canonical_reason().unwrap_or("Unknown"),
                            error_text
                        ));
                    }
                    Err(e) => {
                        warn!(
                            "[google] 端点 {} 网络错误 (尝试 {}/{}): {}",
                            base_url,
                            retry + 1,
                            max_retries,
                            e
                        );

                        // 如果还有下一个端点，切换端点
                        if endpoint_idx + 1 < V1_INTERNAL_BASE_URL_FALLBACKS.len() {
                            last_error = Some(format!("端点 {} 网络错误: {}", base_url, e));
                            break; // 跳出重试循环，尝试下一个端点
                        }

                        // 如果是最后一个端点且还有重试次数，等待后重试
                        if retry + 1 < max_retries {
                            sleep(Duration::from_secs(2)).await;
                            last_error = Some(format!("端点 {} 网络错误: {}", base_url, e));
                            continue;
                        }

                        return Err(format!("网络错误: {}", e));
                    }
                }
            }
        }

        Err(last_error.unwrap_or_else(|| "所有端点均失败".to_string()))
    }

    /// 映射模型名称到 Cloud Code API 支持的格式
    ///
    /// Cloud Code API 实际支持的模型 ID（来自 fetchAvailableModels）：
    /// - gemini-3-pro-low, gemini-3-pro-high
    /// - gemini-3-flash-preview
    /// - gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-thinking
    /// - gemini-2.0-flash-exp
    /// - gemini-1.5-pro, gemini-1.5-flash
    /// - claude-sonnet-4-5, claude-sonnet-4-5-thinking, claude-opus-4-5-thinking
    pub fn map_model_name(model_name: &str) -> String {
        match model_name {
            // Gemini 3 Pro 系列
            "gemini-3-pro-preview" | "gemini-3-pro" => "gemini-3-pro-low".to_string(),
            "gemini-3-pro-high" => "gemini-3-pro-high".to_string(),
            "gemini-3-pro-low" => "gemini-3-pro-low".to_string(),
            // Gemini 3 Flash 系列
            "gemini-3-flash" | "gemini-3-flash-preview" => "gemini-3-flash-preview".to_string(),
            // Claude 系列直接透传
            "claude-sonnet-4-5" | "claude-sonnet-4-5-thinking" | "claude-opus-4-5-thinking" => {
                model_name.to_string()
            }
            _ => {
                // 模糊匹配
                if model_name.starts_with("gemini-2.5-flash") {
                    "gemini-2.5-flash".to_string()
                } else if model_name.starts_with("gemini-2.5-pro") {
                    "gemini-2.5-pro".to_string()
                } else if model_name.starts_with("gemini-2.0-flash") {
                    "gemini-2.0-flash-exp".to_string()
                } else if model_name.starts_with("gemini-1.5-flash") {
                    "gemini-1.5-flash".to_string()
                } else if model_name.starts_with("gemini-1.5-pro") {
                    "gemini-1.5-pro".to_string()
                } else {
                    model_name.to_string()
                }
            }
        }
    }

    /// 将消息转换为 Gemini contents 格式
    ///
    /// 处理以下消息类型：
    /// - 普通文本消息 → text part
    /// - assistant 带 tool_calls → model 角色 functionCall part
    /// - tool 角色消息 → user 角色 functionResponse part
    fn convert_messages(messages: &[super::ChatMessage]) -> Vec<serde_json::Value> {
        let mut contents: Vec<serde_json::Value> = Vec::new();
        // 记录所有已有 functionResponse 的 tool_call_id，用于检测缺失的工具结果
        let mut responded_tool_ids: std::collections::HashSet<String> =
            std::collections::HashSet::new();
        // 收集所有 tool 消息的 callId
        for msg in messages.iter() {
            if msg.role == "tool" {
                if let Some(ref id) = msg.tool_call_id {
                    responded_tool_ids.insert(id.clone());
                }
            }
        }

        let mut i = 0;
        while i < messages.len() {
            let msg = &messages[i];

            if msg.role == "system" {
                // system 消息单独处理，不放入 contents
                i += 1;
                continue;
            }

            if msg.role == "assistant" {
                // 检查是否有工具调用
                if let Some(ref tool_calls) = msg.tool_calls {
                    if !tool_calls.is_empty() {
                        // 构建 functionCall parts
                        let mut parts: Vec<serde_json::Value> = Vec::new();

                        // 如果有文本内容，先添加 text part
                        if let Some(s) = msg.content.as_str() {
                            if !s.is_empty() {
                                parts.push(json!({ "text": s }));
                            }
                        }

                        // 添加 functionCall parts
                        for tc in tool_calls {
                            let name = tc["function"]["name"].as_str().unwrap_or("");
                            let args_str = tc["function"]["arguments"].as_str().unwrap_or("{}");
                            let args: serde_json::Value =
                                serde_json::from_str(args_str).unwrap_or(json!({}));

                            let mut fc = json!({
                                "functionCall": {
                                    "name": name,
                                    "args": args
                                }
                            });

                            // v4.1.36: 恢复 thought_signature（Gemini 2.5 thinking 模型需要）
                            // thought_signature 应放在 part 级别，与 functionCall 同级
                            if let Some(sig) = tc.get("thought_signature").and_then(|v| v.as_str())
                            {
                                fc["thoughtSignature"] = json!(sig);
                            }

                            // v4.1.29: 恢复 id 字段（Cloud Code API 代理 Claude 时需要）
                            if let Some(id) = tc["id"].as_str() {
                                fc["functionCall"]["id"] = json!(id);
                            }

                            parts.push(fc);
                        }

                        contents.push(json!({
                            "role": "model",
                            "parts": parts
                        }));

                        // 检查并补充缺失的 functionResponse（工具调用被中断时）
                        for tc in tool_calls {
                            let tc_id = tc["id"].as_str().unwrap_or("");
                            if !tc_id.is_empty() && !responded_tool_ids.contains(tc_id) {
                                let name = tc["function"]["name"].as_str().unwrap_or("unknown");
                                debug!(
                                    "[google] 补充占位 functionResponse: id={}, name={}",
                                    tc_id, name
                                );
                                contents.push(json!({
                                    "role": "user",
                                    "parts": [{
                                        "functionResponse": {
                                            "name": name,
                                            "id": tc_id,
                                            "response": {
                                                "result": "Tool call was interrupted or not executed."
                                            }
                                        }
                                    }]
                                }));
                            }
                        }

                        i += 1;
                        continue;
                    }
                }

                // 普通 assistant 消息（无工具调用）
                let text = if let Some(s) = msg.content.as_str() {
                    s.to_string()
                } else {
                    msg.content.to_string()
                };
                contents.push(json!({
                    "role": "model",
                    "parts": [{ "text": text }]
                }));
            } else if msg.role == "tool" {
                // tool 角色消息 → user 角色 functionResponse part
                let content = if let Some(s) = msg.content.as_str() {
                    s.to_string()
                } else {
                    msg.content.to_string()
                };
                let tool_call_id = msg.tool_call_id.as_deref().unwrap_or("");

                // 从前面的 assistant tool_calls 中查找对应工具名称
                let tool_name = Self::find_tool_name_by_id(messages, tool_call_id);

                contents.push(json!({
                    "role": "user",
                    "parts": [{
                        "functionResponse": {
                            "name": tool_name,
                            "id": tool_call_id,
                            "response": {
                                "result": content
                            }
                        }
                    }]
                }));
            } else {
                // user 消息
                let text = if let Some(s) = msg.content.as_str() {
                    s.to_string()
                } else {
                    msg.content.to_string()
                };
                contents.push(json!({
                    "role": "user",
                    "parts": [{ "text": text }]
                }));
            }

            i += 1;
        }

        // 合并连续同角色消息（Gemini API 要求 user/model 严格交替）
        Self::merge_consecutive_roles(&mut contents);

        // 消息截断防超限
        Self::truncate_messages(&mut contents);

        contents
    }

    /// 根据 tool_call_id 从消息历史中查找工具名称
    fn find_tool_name_by_id(messages: &[super::ChatMessage], tool_call_id: &str) -> String {
        for msg in messages.iter().rev() {
            if let Some(ref tool_calls) = msg.tool_calls {
                for tc in tool_calls {
                    if tc["id"].as_str() == Some(tool_call_id) {
                        return tc["function"]["name"]
                            .as_str()
                            .unwrap_or("unknown")
                            .to_string();
                    }
                }
            }
        }
        "unknown".to_string()
    }

    /// 合并连续同角色消息
    ///
    /// Gemini API 要求 user 和 model 角色严格交替，连续同角色消息会导致 400 错误
    fn merge_consecutive_roles(contents: &mut Vec<serde_json::Value>) {
        let mut merged: Vec<serde_json::Value> = Vec::new();

        for content in contents.drain(..) {
            let current_role = content["role"].as_str().unwrap_or("").to_string();

            if let Some(last) = merged.last_mut() {
                let last_role = last["role"].as_str().unwrap_or("").to_string();
                if current_role == last_role {
                    // 合并 parts
                    if let (Some(last_parts), Some(new_parts)) =
                        (last["parts"].as_array_mut(), content["parts"].as_array())
                    {
                        last_parts.extend(new_parts.iter().cloned());
                    }
                    continue;
                }
            }

            merged.push(content);
        }

        *contents = merged;
    }

    /// 消息截断防超限
    ///
    /// 粗略估算消息总字符数，超过限制时从头部截断旧消息
    /// 截断后确保以 user 消息开头（Gemini API 要求第一条为 user）
    fn truncate_messages(contents: &mut Vec<serde_json::Value>) {
        // 估算总字符数
        let total_chars: usize = contents.iter().map(|c| c.to_string().len()).sum();

        if total_chars <= MAX_ESTIMATED_CHARS {
            return;
        }

        debug!(
            "[google] 消息总字符数 {} 超过限制 {}，执行截断",
            total_chars, MAX_ESTIMATED_CHARS
        );

        // 从头部移除消息，直到总字符数在限制内
        while contents.len() > 2 {
            let first_len = contents[0].to_string().len();
            let remaining: usize = contents.iter().map(|c| c.to_string().len()).sum();
            if remaining <= MAX_ESTIMATED_CHARS {
                break;
            }
            debug!("[google] 移除头部消息，释放 {} 字符", first_len);
            contents.remove(0);
        }

        // 确保以 user 消息开头
        while !contents.is_empty() {
            if contents[0]["role"].as_str() == Some("user") {
                break;
            }
            debug!("[google] 移除非 user 开头消息");
            contents.remove(0);
        }
    }
}

impl ChatProtocol for GoogleProtocol {
    fn name(&self) -> &'static str {
        "Google Gemini"
    }

    fn protocol_type(&self) -> ProtocolType {
        ProtocolType::Google
    }

    fn build_url(&self, request: &ChatStreamRequest) -> String {
        let is_oauth = Self::is_oauth_token(&request.api_key);

        if is_oauth {
            // OAuth Token: 使用 Cloud Code API
            // 默认使用 Sandbox 端点（最稳定），fallback 逻辑在调用层处理
            "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:streamGenerateContent?alt=sse"
                .to_string()
        } else {
            // API Key: 使用 generativelanguage.googleapis.com
            let model = Self::map_model_name(&request.model_name);
            format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?key={}&alt=sse",
                model,
                request.api_key
            )
        }
    }

    fn build_headers(&self, request: &ChatStreamRequest) -> HeaderMap {
        let mut headers = HeaderMap::new();
        let is_oauth = Self::is_oauth_token(&request.api_key);

        if is_oauth {
            // OAuth 模式
            let auth_value = format!("Bearer {}", request.api_key.trim());
            if let Ok(value) = HeaderValue::from_str(&auth_value) {
                headers.insert(AUTHORIZATION, value);
            }
            // v0.9.0: 更新 User-Agent，与 Antigravity-Manager 保持一致
            let user_agent = format!(
                "antigravity/{} {}/{}",
                "4.1.37",
                std::env::consts::OS,
                std::env::consts::ARCH
            );
            if let Ok(value) = HeaderValue::from_str(&user_agent) {
                headers.insert("User-Agent", value);
            }
        }

        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert("Accept", HeaderValue::from_static("text/event-stream"));

        headers
    }

    fn build_body(&self, request: &ChatStreamRequest) -> serde_json::Value {
        let is_oauth = Self::is_oauth_token(&request.api_key);

        // v4.1.37: 使用新的消息转换逻辑，支持工具调用
        let contents = Self::convert_messages(&request.messages);

        // 提取 system 消息作为 systemInstruction
        let mut system_parts: Vec<serde_json::Value> = Vec::new();

        // 添加系统提示词
        if let Some(ref system_prompt) = request.system_prompt {
            if !system_prompt.is_empty() {
                system_parts.push(json!({ "text": system_prompt }));
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
                system_parts.push(json!({ "text": text }));
            }
        }

        // v0.9.0: 添加 safetySettings（参考 Antigravity-Manager request.rs）
        let safety_settings = json!([
            { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "OFF" },
            { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "OFF" },
            { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "OFF" },
            { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "OFF" },
            { "category": "HARM_CATEGORY_CIVIC_INTEGRITY", "threshold": "OFF" },
        ]);

        // 构建内部请求体
        let mut inner_request = json!({
            "contents": contents,
            "generationConfig": {
                "temperature": request.temperature.unwrap_or(0.7),
                "maxOutputTokens": request.max_tokens.unwrap_or(4096)
            },
            "safetySettings": safety_settings
        });

        // 添加 systemInstruction
        if !system_parts.is_empty() {
            inner_request["systemInstruction"] = json!({
                "role": "user",
                "parts": system_parts
            });
        }

        // v4.1.37: 添加工具注册（转换 OpenAI 格式 tools 为 Gemini functionDeclarations）
        if let Some(ref tools) = request.tools {
            if !tools.is_empty() {
                let function_declarations: Vec<serde_json::Value> = tools
                    .iter()
                    .map(|tool| {
                        let mut decl = json!({
                            "name": tool["function"]["name"],
                            "description": tool["function"]["description"]
                        });
                        // 添加参数 schema（如果有）
                        if let Some(params) = tool["function"].get("parameters") {
                            if !params.is_null() {
                                decl["parameters"] = params.clone();
                            }
                        }
                        decl
                    })
                    .collect();

                inner_request["tools"] = json!([{
                    "functionDeclarations": function_declarations
                }]);
            }
        }

        if is_oauth {
            // Cloud Code API 需要包装请求
            let mapped_model = Self::map_model_name(&request.model_name);
            let project_id = request.project_id.clone().unwrap_or_default();

            json!({
                "project": project_id,
                "requestId": format!("agent-{}", uuid::Uuid::new_v4()),
                "request": inner_request,
                "model": mapped_model,
                "userAgent": "antigravity",
                "requestType": "agent"
            })
        } else {
            // API Key 模式直接使用内部请求
            inner_request
        }
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
                    // 解析 JSON
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data_str) {
                        // Cloud Code API 响应需要解包
                        let response_data = json.get("response").unwrap_or(&json);

                        // 提取内容（文本和工具调用）
                        if let Some(candidates) =
                            response_data.get("candidates").and_then(|c| c.as_array())
                        {
                            for candidate in candidates {
                                if let Some(parts) = candidate["content"]["parts"].as_array() {
                                    for part in parts {
                                        // v4.1.37: 处理 text part
                                        if let Some(text) = part["text"].as_str() {
                                            if !text.is_empty() {
                                                events.push(StreamEvent::Chunk {
                                                    content: text.to_string(),
                                                });
                                            }
                                        }

                                        // v4.1.37: 处理 functionCall part
                                        if let Some(fc) = part.get("functionCall") {
                                            let name =
                                                fc["name"].as_str().unwrap_or("").to_string();
                                            let args = fc.get("args").cloned().unwrap_or(json!({}));
                                            let id = fc["id"].as_str().unwrap_or("").to_string();

                                            // 提取 thoughtSignature（Gemini 2.5 thinking 模型）
                                            // thoughtSignature 在 part 级别，与 functionCall 同级
                                            let thought_signature = part
                                                .get("thoughtSignature")
                                                .and_then(|v| v.as_str())
                                                .map(|s| s.to_string());

                                            // 使用 id 作为工具调用 ID，如果没有则生成一个
                                            let call_id = if id.is_empty() {
                                                format!(
                                                    "fc_{}",
                                                    &uuid::Uuid::new_v4()
                                                        .to_string()
                                                        .replace('-', "")[..12]
                                                )
                                            } else {
                                                id
                                            };

                                            debug!("[google] 解析到 functionCall: name={}, id={}, has_thought_signature={}",
                                                name, call_id, thought_signature.is_some());

                                            events.push(StreamEvent::ToolCallComplete {
                                                id: call_id,
                                                name,
                                                arguments: serde_json::to_string(&args)
                                                    .unwrap_or_default(),
                                                thought_signature,
                                            });
                                        }
                                    }
                                }

                                // 检查 finishReason
                                if let Some(finish_reason) = candidate["finishReason"].as_str() {
                                    if finish_reason == "STOP" || finish_reason == "END_TURN" {
                                        events.push(StreamEvent::Done);
                                    }
                                    // 注意：不处理 "TOOL_CALLS" finishReason，
                                    // 因为 functionCall part 已经在上面处理了
                                }
                            }
                        }

                        // 提取 usage 信息
                        if let Some(usage) = response_data.get("usageMetadata") {
                            let prompt_tokens =
                                usage["promptTokenCount"].as_i64().unwrap_or(0) as i32;
                            let completion_tokens =
                                usage["candidatesTokenCount"].as_i64().unwrap_or(0) as i32;
                            let total_tokens =
                                usage["totalTokenCount"].as_i64().unwrap_or(0) as i32;

                            if total_tokens > 0 {
                                events.push(StreamEvent::Usage {
                                    prompt_tokens,
                                    completion_tokens,
                                    total_tokens,
                                });
                            }
                        }

                        // 检查错误
                        if let Some(error) = json.get("error") {
                            let message = error["message"].as_str().unwrap_or("Unknown error");
                            events.push(StreamEvent::Error {
                                message: message.to_string(),
                            });
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

    /// TC-PROTO-MSG-003: Google 消息格式
    #[test]
    fn test_build_body_api_key() {
        let protocol = GoogleProtocol;
        let request = ChatStreamRequest {
            provider: "google".to_string(),
            api_key: "AIzaSyXXX".to_string(), // API Key 格式
            model_name: "gemini-2.5-flash".to_string(),
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

        // API Key 模式直接返回内部请求
        assert!(body.get("contents").is_some());
        assert!(body.get("generationConfig").is_some());
        assert!(body.get("systemInstruction").is_some());

        // 检查消息格式
        let contents = body["contents"].as_array().unwrap();
        assert_eq!(contents.len(), 1);
        assert_eq!(contents[0]["role"], "user");
        let parts = contents[0]["parts"].as_array().unwrap();
        assert_eq!(parts[0]["text"], "Hello");
    }

    /// 测试 OAuth 模式请求体
    #[test]
    fn test_build_body_oauth() {
        let protocol = GoogleProtocol;
        let request = ChatStreamRequest {
            provider: "google".to_string(),
            api_key: "ya29.xxx".to_string(), // OAuth Token 格式
            model_name: "gemini-2.5-flash".to_string(),
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
            project_id: Some("my-project".to_string()),
            message_id: None,
            protocol: None,
        };

        let body = protocol.build_body(&request);

        // OAuth 模式包装为 Cloud Code 格式
        assert_eq!(body["project"], "my-project");
        assert_eq!(body["model"], "gemini-2.5-flash");
        assert_eq!(body["userAgent"], "antigravity");
        assert_eq!(body["requestType"], "agent");
        assert!(body.get("request").is_some());
    }

    /// TC-PROTO-STREAM-003: Google SSE 解析
    #[test]
    fn test_parse_chunk_content() {
        let protocol = GoogleProtocol;
        let mut buffer = StreamBuffer::default();

        let chunk =
            b"data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Hello\"}]}}]}\n\n";
        let events = protocol.parse_chunk(chunk, &mut buffer);

        assert_eq!(events.len(), 1);
        match &events[0] {
            StreamEvent::Chunk { content } => {
                assert_eq!(content, "Hello");
            }
            _ => panic!("Expected Chunk event"),
        }
    }

    /// TC-PROTO-GOOGLE-TOOL-001: 工具注册
    #[test]
    fn test_build_body_with_tools() {
        let protocol = GoogleProtocol;
        let tools = vec![json!({
            "type": "function",
            "function": {
                "name": "search",
                "description": "Search the web",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string" }
                    },
                    "required": ["query"]
                }
            }
        })];

        let request = ChatStreamRequest {
            provider: "google".to_string(),
            api_key: "AIzaSyXXX".to_string(),
            model_name: "gemini-2.5-flash".to_string(),
            messages: vec![super::super::ChatMessage {
                role: "user".to_string(),
                content: serde_json::json!("Search for Rust"),
                tool_calls: None,
                tool_call_id: None,
            }],
            endpoint: None,
            temperature: None,
            max_tokens: None,
            system_prompt: None,
            tools: Some(tools),
            account_id: None,
            project_id: None,
            message_id: None,
            protocol: None,
        };

        let body = protocol.build_body(&request);

        // 验证 tools 字段存在
        assert!(body.get("tools").is_some());
        let tools_arr = body["tools"].as_array().unwrap();
        assert_eq!(tools_arr.len(), 1);
        let func_decls = tools_arr[0]["functionDeclarations"].as_array().unwrap();
        assert_eq!(func_decls.len(), 1);
        assert_eq!(func_decls[0]["name"], "search");
        assert_eq!(func_decls[0]["description"], "Search the web");
    }

    /// TC-PROTO-GOOGLE-TOOL-002: functionCall 消息转换
    #[test]
    fn test_convert_messages_with_tool_calls() {
        let messages = vec![
            super::super::ChatMessage {
                role: "user".to_string(),
                content: serde_json::json!("Search for Rust"),
                tool_calls: None,
                tool_call_id: None,
            },
            super::super::ChatMessage {
                role: "assistant".to_string(),
                content: serde_json::json!(""),
                tool_calls: Some(vec![json!({
                    "id": "call_123",
                    "type": "function",
                    "function": {
                        "name": "search",
                        "arguments": "{\"query\":\"Rust\"}"
                    }
                })]),
                tool_call_id: None,
            },
            super::super::ChatMessage {
                role: "tool".to_string(),
                content: serde_json::json!("Rust is a systems programming language"),
                tool_calls: None,
                tool_call_id: Some("call_123".to_string()),
            },
        ];

        let contents = GoogleProtocol::convert_messages(&messages);

        // 应该有 3 条消息：user, model(functionCall), user(functionResponse)
        assert_eq!(contents.len(), 3);

        // 第一条：user 文本消息
        assert_eq!(contents[0]["role"], "user");

        // 第二条：model functionCall
        assert_eq!(contents[1]["role"], "model");
        let parts = contents[1]["parts"].as_array().unwrap();
        assert!(parts.iter().any(|p| p.get("functionCall").is_some()));

        // 第三条：user functionResponse
        assert_eq!(contents[2]["role"], "user");
        let parts = contents[2]["parts"].as_array().unwrap();
        assert!(parts.iter().any(|p| p.get("functionResponse").is_some()));
    }

    /// TC-PROTO-GOOGLE-TOOL-005: 响应解析 functionCall
    #[test]
    fn test_parse_chunk_function_call() {
        let protocol = GoogleProtocol;
        let mut buffer = StreamBuffer::default();

        let chunk = b"data: {\"candidates\":[{\"content\":{\"parts\":[{\"functionCall\":{\"name\":\"search\",\"args\":{\"query\":\"Rust\"},\"id\":\"call_abc\"}}]}}]}\n\n";
        let events = protocol.parse_chunk(chunk, &mut buffer);

        assert!(!events.is_empty());
        let has_tool_call = events
            .iter()
            .any(|e| matches!(e, StreamEvent::ToolCallComplete { name, .. } if name == "search"));
        assert!(
            has_tool_call,
            "Expected ToolCallComplete event with name 'search'"
        );
    }

    /// TC-PROTO-GOOGLE-TOOL-006: 响应解析 thought_signature
    #[test]
    fn test_parse_chunk_function_call_with_thought_signature() {
        let protocol = GoogleProtocol;
        let mut buffer = StreamBuffer::default();

        let chunk = b"data: {\"candidates\":[{\"content\":{\"parts\":[{\"functionCall\":{\"name\":\"search\",\"args\":{\"query\":\"Rust\"},\"id\":\"call_abc\"},\"thoughtSignature\":\"sig_xyz\"}]}}]}\n\n";
        let events = protocol.parse_chunk(chunk, &mut buffer);

        let tc_event = events
            .iter()
            .find(|e| matches!(e, StreamEvent::ToolCallComplete { .. }));
        assert!(tc_event.is_some());
        match tc_event.unwrap() {
            StreamEvent::ToolCallComplete {
                thought_signature, ..
            } => {
                assert_eq!(thought_signature.as_deref(), Some("sig_xyz"));
            }
            _ => panic!("Expected ToolCallComplete"),
        }
    }

    /// TC-PROTO-GOOGLE-TOOL-008: 未完成工具调用补充占位结果
    #[test]
    fn test_convert_messages_missing_tool_result() {
        let messages = vec![
            super::super::ChatMessage {
                role: "user".to_string(),
                content: serde_json::json!("Search"),
                tool_calls: None,
                tool_call_id: None,
            },
            super::super::ChatMessage {
                role: "assistant".to_string(),
                content: serde_json::json!(""),
                tool_calls: Some(vec![json!({
                    "id": "call_missing",
                    "type": "function",
                    "function": {
                        "name": "search",
                        "arguments": "{}"
                    }
                })]),
                tool_call_id: None,
            },
            // 注意：没有对应的 tool 结果消息
        ];

        let contents = GoogleProtocol::convert_messages(&messages);

        // 应该有 3 条：user, model(functionCall), user(占位 functionResponse)
        assert_eq!(contents.len(), 3);
        // 最后一条应该是占位 functionResponse
        let last_parts = contents[2]["parts"].as_array().unwrap();
        assert!(last_parts[0].get("functionResponse").is_some());
    }

    /// 测试模型名称映射
    #[test]
    fn test_map_model_name() {
        assert_eq!(
            GoogleProtocol::map_model_name("gemini-3-pro-preview"),
            "gemini-3-pro-low"
        );
        assert_eq!(
            GoogleProtocol::map_model_name("gemini-3-pro"),
            "gemini-3-pro-low"
        );
        assert_eq!(
            GoogleProtocol::map_model_name("gemini-3-pro-high"),
            "gemini-3-pro-high"
        );
        assert_eq!(
            GoogleProtocol::map_model_name("gemini-2.5-flash-001"),
            "gemini-2.5-flash"
        );
        assert_eq!(
            GoogleProtocol::map_model_name("gemini-2.0-flash-exp"),
            "gemini-2.0-flash-exp"
        );
        assert_eq!(
            GoogleProtocol::map_model_name("claude-sonnet-4-5"),
            "claude-sonnet-4-5"
        );
    }

    /// 测试 OAuth Token 检测
    #[test]
    fn test_is_oauth_token() {
        assert!(GoogleProtocol::is_oauth_token("ya29.xxx"));
        assert!(GoogleProtocol::is_oauth_token("1//xxx"));
        assert!(!GoogleProtocol::is_oauth_token("AIzaSyXXX"));
    }

    /// 测试 URL 构建
    #[test]
    fn test_build_url() {
        let protocol = GoogleProtocol;

        // API Key 模式
        let request = ChatStreamRequest {
            provider: "google".to_string(),
            api_key: "AIzaSyXXX".to_string(),
            model_name: "gemini-2.5-flash".to_string(),
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
        assert!(url.contains("generativelanguage.googleapis.com"));
        assert!(url.contains("gemini-2.5-flash"));
        assert!(url.contains("key=AIzaSyXXX"));

        // OAuth 模式
        let request2 = ChatStreamRequest {
            api_key: "ya29.xxx".to_string(),
            ..request
        };
        let url2 = protocol.build_url(&request2);
        // v0.9.1: 优化后默认使用 Sandbox 端点
        assert!(url2.contains("daily-cloudcode-pa.sandbox.googleapis.com"));
    }

    /// TC-PROTO-GOOGLE-TOOL-007: 连续同角色消息合并
    #[test]
    fn test_merge_consecutive_roles() {
        let mut contents = vec![
            json!({"role": "user", "parts": [{"text": "Hello"}]}),
            json!({"role": "user", "parts": [{"text": "World"}]}),
            json!({"role": "model", "parts": [{"text": "Hi"}]}),
        ];

        GoogleProtocol::merge_consecutive_roles(&mut contents);

        // 两个 user 消息应合并为一个
        assert_eq!(contents.len(), 2);
        assert_eq!(contents[0]["role"], "user");
        let parts = contents[0]["parts"].as_array().unwrap();
        assert_eq!(parts.len(), 2);
    }
}
