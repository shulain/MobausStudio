// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

use base64::Engine; // v4.2.5: 用于图片 base64 编码
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Read;
use std::sync::RwLock;
use tauri::{Emitter, Manager, Window}; // 导入 Manager 和 Emitter // v0.9.2.8: gzip 解压缩

// ==================== MCP 模块 (v2.0.0 - 真实 MCP 协议支持) ====================
mod mcp;

// ==================== 协议模块 (v0.9.0 - 通用协议抽象) ====================
pub mod protocol;

// ==================== Signature Cache 模块 (v0.9.2 - Thought Signature 缓存) ====================
mod signature_cache;

// ==================== Skills.sh 集成模块 (v3.0.23 - HTML 抓取模式) ====================
mod skills_sh;

// ==================== 配置导出模块 (config-switcher) ====================
mod services;

#[cfg(test)]
mod skills_sh_test;

use mcp::client::MCPClientManager;
use mcp::protocol::{
    CallToolResult, MCPServerConfig as MCPConnectConfig, Resource, Tool, TransportType,
};
use once_cell::sync::Lazy;

/// 全局 MCP 客户端管理器
///
/// 使用 Lazy 延迟初始化，确保线程安全
static MCP_MANAGER: Lazy<MCPClientManager> = Lazy::new(|| {
    info!("[MCP] 初始化全局 MCP 客户端管理器");
    MCPClientManager::new()
});

/// v3.4.4: 全局 Google Project ID 缓存
/// 避免每次请求都调用 loadCodeAssist API，节省配额
static GOOGLE_PROJECT_CACHE: Lazy<RwLock<HashMap<String, String>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

/// v3.4.5: Cloud Code API 模型名称映射
/// v3.6.2: 修复映射错误，根据 fetchAvailableModels API 返回的实际模型 ID
///
/// Cloud Code API 实际支持的模型 ID（来自 fetchAvailableModels）：
/// - gemini-3-pro-low, gemini-3-pro-high (不是 gemini-3-pro-preview!)
/// - gemini-3-flash-preview
/// - gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-thinking
/// - gemini-2.0-flash-exp
/// - gemini-1.5-pro, gemini-1.5-flash
/// - claude-sonnet-4-5, claude-sonnet-4-5-thinking, claude-opus-4-5-thinking
fn map_cloud_code_model(model_name: &str) -> String {
    // v3.6.2: 根据 fetchAvailableModels API 返回的实际模型 ID 进行映射
    match model_name {
        // Gemini 3 Pro 系列：用户配置的名称 -> API 实际支持的名称
        // 默认使用 gemini-3-pro-low（配额更充足）
        "gemini-3-pro-preview" => return "gemini-3-pro-low".to_string(),
        "gemini-3-pro" => return "gemini-3-pro-low".to_string(),
        // 如果用户明确指定 high/low，直接透传
        "gemini-3-pro-high" => return "gemini-3-pro-high".to_string(),
        "gemini-3-pro-low" => return "gemini-3-pro-low".to_string(),
        // Gemini 3 Flash 系列
        "gemini-3-flash" => return "gemini-3-flash-preview".to_string(),
        "gemini-3-flash-preview" => return "gemini-3-flash-preview".to_string(),
        // Claude 系列直接透传
        "claude-sonnet-4-5" => return "claude-sonnet-4-5".to_string(),
        "claude-sonnet-4-5-thinking" => return "claude-sonnet-4-5-thinking".to_string(),
        "claude-opus-4-5-thinking" => return "claude-opus-4-5-thinking".to_string(),
        _ => {}
    }

    // 模糊匹配：处理带版本号后缀的模型名
    if model_name.starts_with("gemini-2.5-flash") {
        return "gemini-2.5-flash".to_string();
    }
    if model_name.starts_with("gemini-2.5-pro") {
        return "gemini-2.5-pro".to_string();
    }
    if model_name.starts_with("gemini-2.0-flash") {
        return "gemini-2.0-flash-exp".to_string();
    }
    if model_name.starts_with("gemini-1.5-flash") {
        return "gemini-1.5-flash".to_string();
    }
    if model_name.starts_with("gemini-1.5-pro") {
        return "gemini-1.5-pro".to_string();
    }

    // 其他模型直接透传
    model_name.to_string()
}

/// 规范化 URL，移除末尾的斜杠
fn normalize_url(url: &str) -> &str {
    url.trim_end_matches('/')
}

/// 模型测试请求参数
#[derive(Debug, Deserialize)]
pub struct TestModelRequest {
    pub provider: String,
    pub api_key: String,
    pub endpoint: Option<String>,
    pub model_name: Option<String>,
    /// v4.1.46: 协议类型（用于自定义供应商）
    /// 可选值: "openai", "anthropic", "google" 等
    pub protocol: Option<String>,
}

/// 模型测试响应
#[derive(Debug, Serialize)]
pub struct TestModelResponse {
    pub success: bool,
    pub message: String,
    pub status_code: Option<u16>,
    pub details: Option<String>, // 新增：详细调试信息
}

/// 测试模型 API 连接
///
/// 根据不同的提供商调用相应的 API 端点验证连接
#[tauri::command]
async fn test_model(request: TestModelRequest) -> Result<TestModelResponse, String> {
    info!("[test_model] 开始测试模型连接");
    debug!(
        "[test_model] 请求参数: provider={}, endpoint={:?}, model_name={:?}",
        request.provider, request.endpoint, request.model_name
    );

    let client = reqwest::Client::new();

    // v3.4.2: 使用小写比较，避免大小写不匹配问题
    let provider_lower = request.provider.to_lowercase();

    // v4.1.46: 优先使用 protocol 字段（用于自定义供应商）
    let protocol = request
        .protocol
        .as_ref()
        .map(|p| p.to_lowercase())
        .unwrap_or_else(|| provider_lower.clone());

    let result = match provider_lower.as_str() {
        "openai" => {
            info!("[test_model] 使用 OpenAI 测试策略");
            test_openai(&client, &request).await
        }
        "anthropic" => {
            info!("[test_model] 使用 Anthropic 测试策略");
            test_anthropic(&client, &request).await
        }
        "google" => {
            info!("[test_model] 使用 Google AI 测试策略");
            test_google(&client, &request).await
        }
        "kiro" => {
            info!("[test_model] 使用 Kiro 测试策略");
            test_kiro(&client, &request).await
        }
        _ => {
            // v4.1.46: 自定义供应商根据 protocol 字段选择测试策略
            match protocol.as_str() {
                "anthropic" => {
                    info!("[test_model] 使用 Anthropic 兼容接口测试策略 (自定义提供商)");
                    test_anthropic(&client, &request).await
                }
                "google" => {
                    info!("[test_model] 使用 Google 兼容接口测试策略 (自定义提供商)");
                    test_google(&client, &request).await
                }
                _ => {
                    info!("[test_model] 使用 OpenAI 兼容接口测试策略 (自定义提供商)");
                    test_openai_compatible(&client, &request).await
                }
            }
        }
    };

    match &result {
        Ok(response) => {
            if response.success {
                info!("[test_model] 测试成功: {}", response.message);
            } else {
                warn!("[test_model] 测试失败: {}", response.message);
            }
            debug!("[test_model] 响应详情: {:?}", response);
        }
        Err(e) => {
            error!("[test_model] 测试错误: {}", e);
        }
    }

    result
}

/// 测试 OpenAI API
/// v3.4.2: 支持 API Key 和 OAuth Token 两种认证方式
/// - API Key: 使用 /v1/models 端点测试
/// - OAuth Token: 使用 /v1/chat/completions 端点测试（OAuth Token 没有 api.model.read 权限）
async fn test_openai(
    client: &reqwest::Client,
    request: &TestModelRequest,
) -> Result<TestModelResponse, String> {
    let endpoint = normalize_url(
        request
            .endpoint
            .as_deref()
            .unwrap_or("https://api.openai.com/v1"),
    );

    // 检测是否是 OAuth Token（ChatGPT Plus/Pro）
    // OAuth Token 通常以 "eyJ" 开头（JWT 格式）或者很长
    let is_oauth_token = request.api_key.starts_with("eyJ") || request.api_key.len() > 100;

    if is_oauth_token {
        // OAuth Token: 使用 chat/completions 端点测试
        let url = format!("{}/chat/completions", endpoint);
        let model_name = request.model_name.as_deref().unwrap_or("gpt-4o-mini");

        debug!("[test_openai] OAuth Token 检测，使用 chat/completions 端点");
        debug!("[test_openai] 请求 URL: {}", url);
        debug!("[test_openai] 使用模型: {}", model_name);

        let response = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", request.api_key))
            .header("Content-Type", "application/json")
            .json(&serde_json::json!({
                "model": model_name,
                "messages": [{"role": "user", "content": "Hi"}],
                "max_tokens": 1
            }))
            .send()
            .await
            .map_err(|e| {
                error!("[test_openai] 网络请求失败: {}", e);
                format!("请求失败: {}", e)
            })?;

        let status = response.status();
        debug!("[test_openai] 响应状态码: {}", status.as_u16());

        if status.is_success() {
            let body = response.text().await.unwrap_or_default();
            debug!("[test_openai] 响应体: {}", body);
            Ok(TestModelResponse {
                success: true,
                message: "OpenAI API 连接成功 (OAuth Token)".to_string(),
                status_code: Some(status.as_u16()),
                details: Some(format!("模型: {}, 端点: {}", model_name, url)),
            })
        } else if status.as_u16() == 401 {
            warn!("[test_openai] OAuth Token 验证失败");
            Ok(TestModelResponse {
                success: false,
                message: "OAuth Token 无效或已过期".to_string(),
                status_code: Some(status.as_u16()),
                details: Some("认证失败，请重新登录".to_string()),
            })
        } else {
            let error_text = response.text().await.unwrap_or_default();
            warn!(
                "[test_openai] API 返回错误: {} - {}",
                status.as_u16(),
                error_text
            );
            Ok(TestModelResponse {
                success: false,
                message: format!("API 返回错误: {} - {}", status.as_u16(), error_text),
                status_code: Some(status.as_u16()),
                details: Some(format!("模型: {}, 错误响应: {}", model_name, error_text)),
            })
        }
    } else {
        // API Key: 使用 /v1/models 端点测试
        let url = format!("{}/models", endpoint);

        debug!("[test_openai] API Key 检测，使用 models 端点");
        debug!("[test_openai] 请求 URL: {}", url);

        let response = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", request.api_key))
            .send()
            .await
            .map_err(|e| {
                error!("[test_openai] 网络请求失败: {}", e);
                format!("请求失败: {}", e)
            })?;

        let status = response.status();
        debug!("[test_openai] 响应状态码: {}", status.as_u16());

        if status.is_success() {
            let body = response.text().await.unwrap_or_default();
            debug!("[test_openai] 响应体长度: {} bytes", body.len());
            Ok(TestModelResponse {
                success: true,
                message: "OpenAI API 连接成功".to_string(),
                status_code: Some(status.as_u16()),
                details: Some(format!("端点: {}, 响应大小: {} bytes", url, body.len())),
            })
        } else if status.as_u16() == 401 {
            warn!("[test_openai] API Key 验证失败");
            Ok(TestModelResponse {
                success: false,
                message: "API Key 无效或已过期".to_string(),
                status_code: Some(status.as_u16()),
                details: Some("认证失败，请检查 API Key 是否正确".to_string()),
            })
        } else {
            let error_text = response.text().await.unwrap_or_default();
            warn!(
                "[test_openai] API 返回错误: {} - {}",
                status.as_u16(),
                error_text
            );
            Ok(TestModelResponse {
                success: false,
                message: format!("API 返回错误: {} - {}", status.as_u16(), error_text),
                status_code: Some(status.as_u16()),
                details: Some(format!("完整错误响应: {}", error_text)),
            })
        }
    }
}

/// 测试 Anthropic API
/// v3.4.2: 支持 API Key 和 OAuth Token 两种认证方式
/// 参考 CLIProxyAPIPlus claude_executor.go 实现：
/// - API Key: 以 "sk-ant-api" 开头，通过 x-api-key 头部传递
/// - OAuth Token: 以 "sk-ant-oat" 开头，通过 Authorization: Bearer 头部传递，需要 oauth beta header
async fn test_anthropic(
    client: &reqwest::Client,
    request: &TestModelRequest,
) -> Result<TestModelResponse, String> {
    // 获取并规范化 endpoint
    let mut endpoint = normalize_url(
        request
            .endpoint
            .as_deref()
            .unwrap_or("https://api.anthropic.com"),
    )
    .to_string();

    // 如果 endpoint 不以 /v1 结尾，自动添加 /v1
    if !endpoint.ends_with("/v1") {
        endpoint = format!("{}/v1", endpoint);
    }
    let url = format!("{}/messages", endpoint);

    let model_name = request
        .model_name
        .as_deref()
        .unwrap_or("claude-3-sonnet-20240229");

    // 判断是 API Key 还是 OAuth Token
    // OAuth Token 以 "sk-ant-oat" 开头（参考 CLIProxyAPIPlus isClaudeOAuthToken）
    let is_oauth_token = request.api_key.contains("sk-ant-oat");

    debug!("[test_anthropic] 请求 URL: {}", url);
    debug!("[test_anthropic] 使用模型: {}", model_name);
    debug!(
        "[test_anthropic] 认证类型: {}",
        if is_oauth_token {
            "OAuth Token"
        } else {
            "API Key"
        }
    );

    let messages = serde_json::json!([{"role": "user", "content": "Hi"}]);

    // 构建请求
    let mut req_builder = client
        .post(&url)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json");

    if is_oauth_token {
        // OAuth Token: 使用 Bearer 认证，需要 oauth beta header
        // 参考 CLIProxyAPIPlus claude_executor.go applyClaudeHeaders
        info!("[test_anthropic] 检测到 OAuth Token，使用 Authorization: Bearer 认证");
        req_builder = req_builder
            .header("Authorization", format!("Bearer {}", request.api_key))
            // 必须包含 oauth-2025-04-20 beta header，否则会返回 401
            .header(
                "Anthropic-Beta",
                "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14",
            )
            // Claude Code 特有的 headers（参考 CLIProxyAPIPlus）
            .header("Anthropic-Dangerous-Direct-Browser-Access", "true")
            .header("X-App", "cli")
            .header("User-Agent", "claude-cli/1.0.83 (external, cli)");
    } else {
        // API Key: 使用 x-api-key 头部
        info!("[test_anthropic] 检测到 API Key，使用 x-api-key 头部认证");
        req_builder = req_builder.header("x-api-key", &request.api_key);
    }

    let response = req_builder
        .json(&serde_json::json!({
            "model": model_name,
            "max_tokens": 1,
            "messages": messages
        }))
        .send()
        .await
        .map_err(|e| {
            error!("[test_anthropic] 网络请求失败: {}", e);
            format!("请求失败: {}", e)
        })?;

    let status = response.status();
    debug!("[test_anthropic] 响应状态码: {}", status.as_u16());

    if status.is_success() {
        let body = response.text().await.unwrap_or_default();
        debug!("[test_anthropic] 响应体: {}", body);
        let auth_type = if is_oauth_token {
            "OAuth Token"
        } else {
            "API Key"
        };
        Ok(TestModelResponse {
            success: true,
            message: format!("Anthropic API 连接成功 ({})", auth_type),
            status_code: Some(status.as_u16()),
            details: Some(format!("模型: {}, 端点: {}", model_name, url)),
        })
    } else if status.as_u16() == 401 {
        warn!("[test_anthropic] 认证失败 (401)");
        let auth_hint = if is_oauth_token {
            "OAuth Token 可能已过期，请重新授权"
        } else {
            "API Key 无效或已过期"
        };
        Ok(TestModelResponse {
            success: false,
            message: auth_hint.to_string(),
            status_code: Some(status.as_u16()),
            details: Some(format!("端点: {}, 认证失败", url)),
        })
    } else {
        let error_text = response.text().await.unwrap_or_default();
        warn!(
            "[test_anthropic] API 返回错误: {} - {}",
            status.as_u16(),
            error_text
        );
        Ok(TestModelResponse {
            success: false,
            message: format!("API 返回错误: {} - {}", status.as_u16(), error_text),
            status_code: Some(status.as_u16()),
            details: Some(format!(
                "请求模型: {}, 错误响应: {}",
                model_name, error_text
            )),
        })
    }
}

/// 测试 Google AI API
/// v3.3.0: 支持 API Key 和 OAuth Access Token 两种认证方式
/// v3.4.2: OAuth Token 使用 Cloud Code API（与 Antigravity-Manager 一致）
/// 参考 CLIProxyAPIPlus gemini_executor.go 和 Antigravity-Manager upstream/client.rs 实现：
/// - API Key: 以 "AIza" 开头，使用 generativelanguage.googleapis.com
/// - OAuth Token: 以 "ya29." 开头，使用 cloudcode-pa.googleapis.com（需要 cloud-platform scope）
async fn test_google(
    client: &reqwest::Client,
    request: &TestModelRequest,
) -> Result<TestModelResponse, String> {
    // 判断是 API Key 还是 OAuth Token
    // Google API Key 通常以 "AIza" 开头
    // OAuth Access Token 通常以 "ya29." 开头
    let is_oauth_token = request.api_key.starts_with("ya29.")
        || request.api_key.starts_with("1//")
        || !request.api_key.starts_with("AIza");

    if is_oauth_token {
        // OAuth Token: 使用 Cloud Code API 的 loadCodeAssist 端点测试
        // 参考 Antigravity-Manager src-tauri/src/modules/quota.rs
        // loadCodeAssist 不需要 project ID，适合用于测试 token 有效性
        let url = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
        info!("[test_google] 检测到 OAuth Token，使用 Cloud Code API (loadCodeAssist)");
        debug!("[test_google] 请求 URL: {}", url);

        let response = client
            .post(url)
            .header("Authorization", format!("Bearer {}", request.api_key))
            .header("Content-Type", "application/json")
            .header("User-Agent", "MobausStudio/1.0")
            .json(&serde_json::json!({"metadata": {"ideType": "ANTIGRAVITY"}}))
            .send()
            .await
            .map_err(|e| {
                error!("[test_google] 网络请求失败: {}", e);
                format!("请求失败: {}", e)
            })?;

        let status = response.status();
        debug!("[test_google] 响应状态码: {}", status.as_u16());

        if status.is_success() {
            let body = response.text().await.unwrap_or_default();
            debug!("[test_google] 响应体: {}", body);
            // 尝试解析项目 ID
            let project_info = if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
                json.get("cloudaicompanionProject")
                    .and_then(|v| v.as_str())
                    .map(|s| format!("项目: {}", s))
                    .unwrap_or_else(|| "已连接".to_string())
            } else {
                "已连接".to_string()
            };
            Ok(TestModelResponse {
                success: true,
                message: "Google Cloud Code API 连接成功 (OAuth Token)".to_string(),
                status_code: Some(status.as_u16()),
                details: Some(project_info),
            })
        } else if status.as_u16() == 401 {
            warn!("[test_google] OAuth Token 认证失败 (401)");
            Ok(TestModelResponse {
                success: false,
                message: "OAuth Token 可能已过期，请重新授权".to_string(),
                status_code: Some(status.as_u16()),
                details: Some(format!("端点: {}, 认证失败", url)),
            })
        } else if status.as_u16() == 403 {
            let error_text = response.text().await.unwrap_or_default();
            warn!("[test_google] OAuth Token 权限不足 (403): {}", error_text);
            Ok(TestModelResponse {
                success: false,
                message: "OAuth Token 权限不足，请重新授权".to_string(),
                status_code: Some(status.as_u16()),
                details: Some(format!("错误: {}", error_text)),
            })
        } else {
            let error_text = response.text().await.unwrap_or_default();
            warn!(
                "[test_google] API 返回错误: {} - {}",
                status.as_u16(),
                error_text
            );
            Ok(TestModelResponse {
                success: false,
                message: format!("API 返回错误: {} - {}", status.as_u16(), error_text),
                status_code: Some(status.as_u16()),
                details: Some(format!("完整错误响应: {}", error_text)),
            })
        }
    } else {
        // API Key: 使用 Google AI Studio API (generativelanguage.googleapis.com)
        let url = "https://generativelanguage.googleapis.com/v1beta/models";
        info!("[test_google] 检测到 API Key，使用 Google AI Studio API");
        debug!("[test_google] 请求 URL: {}", url);

        let response = client
            .get(url)
            .header("x-goog-api-key", &request.api_key)
            .send()
            .await
            .map_err(|e| {
                error!("[test_google] 网络请求失败: {}", e);
                format!("请求失败: {}", e)
            })?;

        let status = response.status();
        debug!("[test_google] 响应状态码: {}", status.as_u16());

        if status.is_success() {
            let body = response.text().await.unwrap_or_default();
            debug!("[test_google] 响应体长度: {} bytes", body.len());
            Ok(TestModelResponse {
                success: true,
                message: "Google AI API 连接成功 (API Key)".to_string(),
                status_code: Some(status.as_u16()),
                details: Some(format!("响应大小: {} bytes", body.len())),
            })
        } else if status.as_u16() == 401 || status.as_u16() == 400 {
            warn!("[test_google] API Key 验证失败");
            Ok(TestModelResponse {
                success: false,
                message: "API Key 无效或已过期".to_string(),
                status_code: Some(status.as_u16()),
                details: Some("请检查 Google AI API Key 配置".to_string()),
            })
        } else if status.as_u16() == 403 {
            warn!("[test_google] API Key 权限不足");
            Ok(TestModelResponse {
                success: false,
                message: "API Key 权限不足".to_string(),
                status_code: Some(status.as_u16()),
                details: Some("请检查 Google AI API Key 权限配置".to_string()),
            })
        } else {
            let error_text = response.text().await.unwrap_or_default();
            warn!(
                "[test_google] API 返回错误: {} - {}",
                status.as_u16(),
                error_text
            );
            Ok(TestModelResponse {
                success: false,
                message: format!("API 返回错误: {} - {}", status.as_u16(), error_text),
                status_code: Some(status.as_u16()),
                details: Some(format!("完整错误响应: {}", error_text)),
            })
        }
    }
}

/// 测试 Kiro API 连接
///
/// v0.8.0: Kiro 使用 Amazon Q API，需要特殊的测试方式
/// v0.9.0: 支持 IDC/Builder ID 认证方式区分
/// 由于 Kiro 没有简单的健康检查端点，我们通过验证 token 格式来确认连接
async fn test_kiro(
    client: &reqwest::Client,
    request: &TestModelRequest,
) -> Result<TestModelResponse, String> {
    // v4.1.31: 从 api_key 中解析 access_token、profile_arn、auth_method 和 sso_region
    // 格式: access_token|profile_arn|auth_method|sso_region
    let api_key = &request.api_key;

    if api_key.is_empty() {
        return Ok(TestModelResponse {
            success: false,
            message: "Kiro access token 未配置".to_string(),
            status_code: None,
            details: Some("请先通过 OAuth 登录获取 access token".to_string()),
        });
    }

    let (access_token, profile_arn, auth_method, sso_region) = {
        let parts: Vec<&str> = api_key.splitn(4, '|').collect();
        match parts.len() {
            4 => (
                parts[0].to_string(),
                Some(parts[1].to_string()),
                parts[2].to_string(),
                Some(parts[3].to_string()),
            ),
            3 => (
                parts[0].to_string(),
                Some(parts[1].to_string()),
                parts[2].to_string(),
                None,
            ),
            2 => (
                parts[0].to_string(),
                Some(parts[1].to_string()),
                "aws".to_string(),
                None,
            ),
            _ => (api_key.clone(), None, "aws".to_string(), None),
        }
    };

    // 过滤空的 profile_arn
    let profile_arn = profile_arn.filter(|s| !s.is_empty());

    // 判断是否是 IDC 认证
    let is_idc = auth_method.to_lowercase() == "idc";

    // 根据认证方式选择 User-Agent
    let user_agent = if is_idc {
        KIRO_API_USER_AGENT_IDC
    } else {
        KIRO_API_USER_AGENT_AWS
    };

    // 验证 token 格式（AWS SSO token 通常以 eyJ 开头，是 JWT 格式）
    if !access_token.starts_with("eyJ") && access_token.len() < 100 {
        return Ok(TestModelResponse {
            success: false,
            message: "Kiro access token 格式无效".to_string(),
            status_code: None,
            details: Some("Token 应该是 JWT 格式（以 eyJ 开头）".to_string()),
        });
    }

    // 尝试调用 Amazon Q API 进行简单测试
    // 使用 GetUsageLimits API 来验证 token 有效性
    // v4.1.33: IDC 用户的 CodeWhisperer 端点也需要使用 ssoRegion
    // 注意：codewhisperer.{region} 域名只在 us-east-1 存在
    // IDC 用户使用 q.{ssoRegion}.amazonaws.com 端点（与 chat_stream_kiro 一致）
    // Builder ID 用户继续使用 codewhisperer.us-east-1
    let url = if is_idc {
        let region = sso_region.as_deref().unwrap_or(KIRO_API_REGION);
        format!("https://q.{}.amazonaws.com/", region)
    } else {
        format!("https://codewhisperer.{}.amazonaws.com/", KIRO_API_REGION)
    };

    debug!("[test_kiro] 测试 Kiro API 连接");
    debug!("[test_kiro] Access Token 长度: {}", access_token.len());
    debug!("[test_kiro] Profile ARN: {:?}", profile_arn);
    debug!("[test_kiro] 认证方式: {} (is_idc={})", auth_method, is_idc);
    debug!("[test_kiro] 端点: {}", url);

    // 构建 GetUsageLimits 请求
    // AWS Builder ID 用户不需要 profileArn，只有 Social Auth 用户需要
    let mut payload = serde_json::json!({
        "origin": "AI_EDITOR",
        "resourceType": "AGENTIC_REQUEST"
    });

    // 只有当 profileArn 存在且非空时才添加
    if let Some(ref arn) = profile_arn {
        if !arn.is_empty() {
            payload["profileArn"] = serde_json::json!(arn);
        }
    }

    let response = client
        .post(&url)
        .header("Content-Type", "application/x-amz-json-1.0")
        .header("x-amz-target", "AmazonCodeWhispererService.GetUsageLimits")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Accept", "application/json")
        .header("User-Agent", user_agent)
        .json(&payload)
        .send()
        .await
        .map_err(|e| {
            error!("[test_kiro] 网络请求失败: {}", e);
            format!("请求失败: {}", e)
        })?;

    let status = response.status();
    debug!("[test_kiro] 响应状态码: {}", status.as_u16());

    if status.is_success() {
        let body = response.text().await.unwrap_or_default();
        debug!("[test_kiro] 响应体: {}", body);

        // v0.8.0: 简化测试结果，配额信息在 ProviderCard 中显示
        Ok(TestModelResponse {
            success: true,
            message: "Kiro 连接成功！".to_string(),
            status_code: Some(status.as_u16()),
            details: Some("Token 有效".to_string()),
        })
    } else {
        let error_text = response.text().await.unwrap_or_default();
        error!("[test_kiro] API 错误: {} - {}", status.as_u16(), error_text);

        // 根据状态码提供更详细的错误信息
        let message = match status.as_u16() {
            401 => "Token 已过期或无效，请重新登录".to_string(),
            403 => "访问被拒绝，可能是权限不足或账户被暂停".to_string(),
            429 => "请求过于频繁，请稍后再试".to_string(),
            _ => format!("API 返回错误: {}", status.as_u16()),
        };

        Ok(TestModelResponse {
            success: false,
            message,
            status_code: Some(status.as_u16()),
            details: Some(format!("错误响应: {}", error_text)),
        })
    }
}

/// 测试 OpenAI 兼容 API（用于自定义提供商）
/// v2.5.2: 使用 chat/completions 端点进行真实测试，确保 API Key 有效性验证
async fn test_openai_compatible(
    client: &reqwest::Client,
    request: &TestModelRequest,
) -> Result<TestModelResponse, String> {
    let endpoint = match &request.endpoint {
        Some(ep) if !ep.is_empty() => normalize_url(ep).to_string(),
        _ => {
            warn!("[test_openai_compatible] 自定义提供商未配置端点");
            return Ok(TestModelResponse {
                success: false,
                message: "自定义提供商需要配置端点地址".to_string(),
                status_code: None,
                details: Some("请在模型配置中设置 Base URL".to_string()),
            });
        }
    };

    // v2.5.2: 使用 chat/completions 端点进行真实测试（/models 端点可能不需要认证）
    let url = format!("{}/chat/completions", endpoint);
    let model_name = request.model_name.as_deref().unwrap_or("gpt-3.5-turbo");

    debug!("[test_openai_compatible] 请求 URL: {}", url);
    debug!("[test_openai_compatible] 使用模型: {}", model_name);

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", request.api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": model_name,
            "messages": [{"role": "user", "content": "Hi"}],
            "max_tokens": 1
        }))
        .send()
        .await
        .map_err(|e| {
            error!("[test_openai_compatible] 网络请求失败: {}", e);
            format!("请求失败: {}", e)
        })?;

    let status = response.status();
    debug!("[test_openai_compatible] 响应状态码: {}", status.as_u16());

    if status.is_success() {
        let body = response.text().await.unwrap_or_default();
        debug!("[test_openai_compatible] 响应体: {}", body);
        Ok(TestModelResponse {
            success: true,
            message: "API 连接成功".to_string(),
            status_code: Some(status.as_u16()),
            details: Some(format!("模型: {}, 端点: {}", model_name, endpoint)),
        })
    } else if status.as_u16() == 401 {
        warn!("[test_openai_compatible] API Key 验证失败");
        Ok(TestModelResponse {
            success: false,
            message: "API Key 无效或已过期".to_string(),
            status_code: Some(status.as_u16()),
            details: Some(format!("端点: {}, 认证失败", endpoint)),
        })
    } else {
        let error_text = response.text().await.unwrap_or_default();
        warn!(
            "[test_openai_compatible] API 返回错误: {} - {}",
            status.as_u16(),
            error_text
        );
        Ok(TestModelResponse {
            success: false,
            message: format!("API 返回错误: {} - {}", status.as_u16(), error_text),
            status_code: Some(status.as_u16()),
            details: Some(format!("端点: {}, 错误响应: {}", endpoint, error_text)),
        })
    }
}

// ==================== 数据存储模块 ====================

use std::fs;
use std::path::PathBuf;

/// 模型定价信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPricing {
    pub input: f64,
    pub output: f64,
}

/// AI 模型配置结构
/// 对应前端 AIModelConfig 类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIModelConfig {
    pub id: String,
    pub name: String,
    /// Model ID / 接入点 ID (自定义提供商用，如火山引擎的 ep-xxx)
    #[serde(rename = "modelId", skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    pub provider: String,
    pub status: String, // "online" | "offline" | "error"
    #[serde(rename = "apiKeySet")]
    pub api_key_set: bool,
    #[serde(rename = "apiKey", skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    #[serde(rename = "baseUrl", skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(rename = "maxTokens")]
    pub max_tokens: i32,
    /// 定价信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pricing: Option<ModelPricing>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    /// 上下文窗口大小
    #[serde(rename = "contextWindow", skip_serializing_if = "Option::is_none")]
    pub context_window: Option<i32>,
    /// v3.3.5: ChatGPT 账户 ID（用于 Codex API）
    #[serde(rename = "accountId", skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    /// v3.4.3: GCP 项目 ID（用于 Google Cloud Code API）
    #[serde(rename = "projectId", skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    /// v3.6.0: 是否使用提供商凭证（区分独立 API Key）
    #[serde(
        rename = "useProviderCredential",
        skip_serializing_if = "Option::is_none"
    )]
    pub use_provider_credential: Option<bool>,
    /// v4.1.46: 协议类型（用于模型级别协议配置）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub protocol: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

/// 对话结构
/// v2.3.0: 新增 agent_id 字段支持 Agent 选择持久化
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chat {
    pub id: String,
    pub title: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    pub starred: bool,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    /// Agent 选择持久化 (v2.3.0)
    #[serde(rename = "agentId", skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
}

/// 工具调用记录 (v2.5.0)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
    #[serde(rename = "serverId")]
    pub server_id: String,
}

/// 工具执行结果 (v2.5.0)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    #[serde(rename = "callId")]
    pub call_id: String,
    pub content: String,
    #[serde(rename = "isError")]
    pub is_error: bool,
    /// 执行耗时（毫秒）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<i64>,
}

/// 对话消息结构
/// v2.5.0: 新增 toolCalls 和 toolResults 字段支持 MCP 工具调用持久化
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    #[serde(rename = "chatId")]
    pub chat_id: String,
    pub role: String, // "user" | "assistant" | "system"
    pub content: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens: Option<i32>,
    /// 思考模式内容 (v2.5.0)
    #[serde(rename = "reasoningContent", skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
    /// MCP 工具调用列表 (v2.5.0)
    #[serde(rename = "toolCalls", skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    /// MCP 工具执行结果 (v2.5.0)
    #[serde(rename = "toolResults", skip_serializing_if = "Option::is_none")]
    pub tool_results: Option<Vec<ToolResult>>,
}

/// 获取应用数据目录路径
/// 在 macOS 上通常是 ~/Library/Application Support/com.mobaus.studio/
fn get_data_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))
}

/// 保存模型配置到本地文件
///
/// # 参数
/// - `app_handle`: Tauri 应用句柄
/// - `models`: 模型配置数组
///
/// # 返回
/// - 成功返回 Ok(())，失败返回错误信息
#[tauri::command]
async fn save_models(
    app_handle: tauri::AppHandle,
    models: Vec<AIModelConfig>,
) -> Result<(), String> {
    info!("[save_models] 开始保存模型配置，数量: {}", models.len());

    // 获取数据目录
    let data_dir = get_data_dir(&app_handle)?;

    // 确保目录存在
    if !data_dir.exists() {
        debug!("[save_models] 创建数据目录: {:?}", data_dir);
        fs::create_dir_all(&data_dir).map_err(|e| format!("创建数据目录失败: {}", e))?;
    }

    // 构建文件路径
    let file_path = data_dir.join("models.json");
    debug!("[save_models] 保存路径: {:?}", file_path);

    // 序列化并写入文件
    let json =
        serde_json::to_string_pretty(&models).map_err(|e| format!("序列化模型数据失败: {}", e))?;

    fs::write(&file_path, &json).map_err(|e| format!("写入文件失败: {}", e))?;

    info!("[save_models] 保存成功，文件大小: {} bytes", json.len());
    Ok(())
}

/// 从本地文件加载模型配置
///
/// # 参数
/// - `app_handle`: Tauri 应用句柄
///
/// # 返回
/// - 成功返回模型配置数组，文件不存在时返回空数组
#[tauri::command]
async fn load_models(app_handle: tauri::AppHandle) -> Result<Vec<AIModelConfig>, String> {
    info!("[load_models] 开始加载模型配置");

    // 获取数据目录
    let data_dir = get_data_dir(&app_handle)?;
    let file_path = data_dir.join("models.json");

    debug!("[load_models] 读取路径: {:?}", file_path);

    // 检查文件是否存在
    if !file_path.exists() {
        info!("[load_models] 文件不存在，返回空数组");
        return Ok(Vec::new());
    }

    // 读取并解析文件
    let content = fs::read_to_string(&file_path).map_err(|e| format!("读取文件失败: {}", e))?;

    let models: Vec<AIModelConfig> =
        serde_json::from_str(&content).map_err(|e| format!("解析模型数据失败: {}", e))?;

    info!("[load_models] 加载成功，模型数量: {}", models.len());
    Ok(models)
}

/// 保存对话到本地文件
#[tauri::command]
async fn save_chats(app_handle: tauri::AppHandle, chats: Vec<Chat>) -> Result<(), String> {
    info!("[save_chats] 开始保存对话，数量: {}", chats.len());

    let data_dir = get_data_dir(&app_handle)?;

    if !data_dir.exists() {
        fs::create_dir_all(&data_dir).map_err(|e| format!("创建数据目录失败: {}", e))?;
    }

    let file_path = data_dir.join("chats.json");
    let json =
        serde_json::to_string_pretty(&chats).map_err(|e| format!("序列化对话数据失败: {}", e))?;

    fs::write(&file_path, &json).map_err(|e| format!("写入文件失败: {}", e))?;

    info!("[save_chats] 保存成功");
    Ok(())
}

/// 从本地文件加载对话
#[tauri::command]
async fn load_chats(app_handle: tauri::AppHandle) -> Result<Vec<Chat>, String> {
    info!("[load_chats] 开始加载对话");

    let data_dir = get_data_dir(&app_handle)?;
    let file_path = data_dir.join("chats.json");

    if !file_path.exists() {
        info!("[load_chats] 文件不存在，返回空数组");
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&file_path).map_err(|e| format!("读取文件失败: {}", e))?;

    let chats: Vec<Chat> =
        serde_json::from_str(&content).map_err(|e| format!("解析对话数据失败: {}", e))?;

    info!("[load_chats] 加载成功，对话数量: {}", chats.len());
    Ok(chats)
}

// ==================== 圆桌对话存储模块 (v4.0.0) ====================

/// 保存圆桌对话到本地文件
///
/// 圆桌对话与普通对话分开存储，便于管理和查询
///
/// # 参数
/// - `app_handle`: Tauri 应用句柄，用于获取数据目录
/// - `chats`: 圆桌对话列表（JSON 格式）
///
/// # 返回
/// - 成功: `Ok(())`
/// - 失败: `Err(错误信息)`
#[tauri::command]
async fn save_roundtable_chats(
    app_handle: tauri::AppHandle,
    chats: Vec<serde_json::Value>,
) -> Result<(), String> {
    info!(
        "[save_roundtable_chats] 开始保存圆桌对话，数量: {}",
        chats.len()
    );

    let data_dir = get_data_dir(&app_handle)?;

    // 确保数据目录存在
    if !data_dir.exists() {
        fs::create_dir_all(&data_dir).map_err(|e| format!("创建数据目录失败: {}", e))?;
    }

    let file_path = data_dir.join("roundtable_chats.json");
    let json = serde_json::to_string_pretty(&chats)
        .map_err(|e| format!("序列化圆桌对话数据失败: {}", e))?;

    fs::write(&file_path, &json).map_err(|e| format!("写入文件失败: {}", e))?;

    info!(
        "[save_roundtable_chats] 保存成功，文件路径: {:?}",
        file_path
    );
    Ok(())
}

/// 从本地文件加载圆桌对话
///
/// # 参数
/// - `app_handle`: Tauri 应用句柄，用于获取数据目录
///
/// # 返回
/// - 成功: `Ok(圆桌对话列表)`
/// - 失败: `Err(错误信息)`
/// - 文件不存在时返回空数组
#[tauri::command]
async fn load_roundtable_chats(
    app_handle: tauri::AppHandle,
) -> Result<Vec<serde_json::Value>, String> {
    info!("[load_roundtable_chats] 开始加载圆桌对话");

    let data_dir = get_data_dir(&app_handle)?;
    let file_path = data_dir.join("roundtable_chats.json");

    // 文件不存在时返回空数组
    if !file_path.exists() {
        info!("[load_roundtable_chats] 文件不存在，返回空数组");
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&file_path).map_err(|e| format!("读取文件失败: {}", e))?;

    let chats: Vec<serde_json::Value> =
        serde_json::from_str(&content).map_err(|e| format!("解析圆桌对话数据失败: {}", e))?;

    info!(
        "[load_roundtable_chats] 加载成功，圆桌对话数量: {}",
        chats.len()
    );
    Ok(chats)
}

// ==================== Agent 存储模块 (v2.5.1) ====================

/// Agent 配置结构体
///
/// 用于持久化存储 Agent 配置信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub model: String,
    pub skills: Vec<String>,
    pub system_prompt: String,
    pub temperature: f64,
    pub max_tokens: u32,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_used_at: Option<String>,
    #[serde(default)]
    pub usage_count: u32,
    // MCP 配置 (v2.1.0)
    #[serde(default)]
    pub enable_tool_use: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mcp_servers: Option<serde_json::Value>,
}

/// 保存 Agent 到本地文件
#[tauri::command]
async fn save_agents(
    app_handle: tauri::AppHandle,
    agents: Vec<serde_json::Value>,
) -> Result<(), String> {
    info!("[save_agents] 开始保存 Agent，数量: {}", agents.len());

    let data_dir = get_data_dir(&app_handle)?;

    if !data_dir.exists() {
        fs::create_dir_all(&data_dir).map_err(|e| format!("创建数据目录失败: {}", e))?;
    }

    let file_path = data_dir.join("agents.json");
    let json = serde_json::to_string_pretty(&agents)
        .map_err(|e| format!("序列化 Agent 数据失败: {}", e))?;

    fs::write(&file_path, &json).map_err(|e| format!("写入文件失败: {}", e))?;

    info!("[save_agents] 保存成功");
    Ok(())
}

/// 从本地文件加载 Agent
#[tauri::command]
async fn load_agents(app_handle: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    info!("[load_agents] 开始加载 Agent");

    let data_dir = get_data_dir(&app_handle)?;
    let file_path = data_dir.join("agents.json");

    if !file_path.exists() {
        info!("[load_agents] 文件不存在，返回空数组");
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&file_path).map_err(|e| format!("读取文件失败: {}", e))?;

    let agents: Vec<serde_json::Value> =
        serde_json::from_str(&content).map_err(|e| format!("解析 Agent 数据失败: {}", e))?;

    info!("[load_agents] 加载成功，Agent 数量: {}", agents.len());
    Ok(agents)
}

// ==================== Skills 存储模块 (v2.6.0) ====================

// ==================== skills.sh 代理模块 (v3.0.23 - HTML 抓取模式) ====================

/// skills.sh 获取参数
pub use skills_sh::SkillsShFetchParams;

/// skills.sh 技能项
pub use skills_sh::SkillsShItem;

/// skills.sh API 响应
pub use skills_sh::SkillsShResponse;

/// 从 skills.sh 获取技能列表（代理请求）(v3.0.23 - HTML 抓取模式)
///
/// 由于 skills.sh 移除了 REST API，现在通过抓取 HTML 页面并解析嵌入的数据。
/// 通过 Rust 后端代理请求绕过 CORS 限制。
///
/// # 参数
/// - `params`: 分页和搜索参数
///
/// # 返回
/// - 成功: SkillsShResponse
/// - 失败: 错误信息
#[tauri::command]
async fn fetch_skills_sh(params: SkillsShFetchParams) -> Result<SkillsShResponse, String> {
    skills_sh::fetch_skills_sh(params).await
}

/// 通用 URL 内容获取代理（v3.0.7）
///
/// 用于获取 GitHub raw 文件等可能有 CORS 限制的资源
/// 主要用于获取技能仓库中的 AGENTS.md、SKILL.md 等文件
///
/// # 参数
/// - `url`: 要获取的 URL
///
/// # 返回
/// - 成功: 文件内容字符串
/// - 失败: 错误信息
#[tauri::command]
async fn fetch_url_content(url: String) -> Result<String, String> {
    info!("[fetch_url_content] 获取 URL 内容: {}", url);

    // 创建带超时的 HTTP 客户端
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| {
            error!("[fetch_url_content] 创建 HTTP 客户端失败: {}", e);
            format!("创建 HTTP 客户端失败: {}", e)
        })?;

    // 发送请求
    let response = client
        .get(&url)
        .header("User-Agent", "MobausStudio/1.0")
        .send()
        .await
        .map_err(|e| {
            error!("[fetch_url_content] 网络请求失败: {}", e);
            format!("请求失败: {}", e)
        })?;

    let status = response.status();
    debug!("[fetch_url_content] 响应状态码: {}", status.as_u16());

    // 检查响应状态
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!(
            "[fetch_url_content] HTTP 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Err(format!("HTTP 错误 ({}): {}", status.as_u16(), error_text));
    }

    // 读取响应内容
    let content = response.text().await.map_err(|e| {
        error!("[fetch_url_content] 读取响应失败: {}", e);
        format!("读取响应失败: {}", e)
    })?;

    info!(
        "[fetch_url_content] 成功获取内容，大小: {} 字节",
        content.len()
    );

    Ok(content)
}

/// 获取 GitHub 目录内容（代理 GitHub Contents API）
///
/// 由于前端直接调用 GitHub API 会遇到 CORS 问题，通过后端代理请求
#[tauri::command]
async fn fetch_github_contents(
    owner: String,
    repo: String,
    path: String,
    branch: String,
) -> Result<String, String> {
    info!(
        "[fetch_github_contents] 获取 GitHub 目录: {}/{}/{} (branch: {})",
        owner, repo, path, branch
    );

    let api_url = format!(
        "https://api.github.com/repos/{}/{}/contents/{}?ref={}",
        owner, repo, path, branch
    );

    // 创建带超时的 HTTP 客户端
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| {
            error!("[fetch_github_contents] 创建 HTTP 客户端失败: {}", e);
            format!("创建 HTTP 客户端失败: {}", e)
        })?;

    // 发送请求
    let response = client
        .get(&api_url)
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "MobausStudio/1.0")
        .send()
        .await
        .map_err(|e| {
            error!("[fetch_github_contents] 网络请求失败: {}", e);
            format!("请求失败: {}", e)
        })?;

    let status = response.status();
    debug!("[fetch_github_contents] 响应状态码: {}", status.as_u16());

    // 检查响应状态
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!(
            "[fetch_github_contents] HTTP 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Err(format!("HTTP 错误 ({}): {}", status.as_u16(), error_text));
    }

    // 读取响应内容
    let content = response.text().await.map_err(|e| {
        error!("[fetch_github_contents] 读取响应失败: {}", e);
        format!("读取响应失败: {}", e)
    })?;

    info!(
        "[fetch_github_contents] 成功获取内容，大小: {} 字节",
        content.len()
    );

    Ok(content)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveSkillLocation {
    path: String,
    name: String,
    definition_file: String,
    definition_content: String,
}

/// 通过下载 GitHub 仓库 tar.gz 离线包扫描技能定义文件
///
/// 用于在 GitHub API 限流时回退，避免继续调用 API。
#[tauri::command]
async fn scan_github_skills_archive(
    owner: String,
    repo: String,
    branch: String,
) -> Result<String, String> {
    info!(
        "[scan_github_skills_archive] 开始扫描仓库离线包: {}/{}@{}",
        owner, repo, branch
    );

    let archive_url = format!(
        "https://codeload.github.com/{}/{}/tar.gz/{}",
        owner, repo, branch
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| {
            error!("[scan_github_skills_archive] 创建 HTTP 客户端失败: {}", e);
            format!("创建 HTTP 客户端失败: {}", e)
        })?;

    let response = client
        .get(&archive_url)
        .header("User-Agent", "MobausStudio/1.0")
        .send()
        .await
        .map_err(|e| {
            error!("[scan_github_skills_archive] 下载离线包失败: {}", e);
            format!("下载离线包失败: {}", e)
        })?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!(
            "[scan_github_skills_archive] HTTP 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Err(format!("HTTP 错误 ({}): {}", status.as_u16(), error_text));
    }

    let archive_bytes = response.bytes().await.map_err(|e| {
        error!("[scan_github_skills_archive] 读取离线包失败: {}", e);
        format!("读取离线包失败: {}", e)
    })?;
    debug!(
        "[scan_github_skills_archive] 离线包下载完成，大小: {} 字节",
        archive_bytes.len()
    );

    let cursor = std::io::Cursor::new(archive_bytes);
    let decoder = flate2::read::GzDecoder::new(cursor);
    let mut archive = tar::Archive::new(decoder);

    let mut root_prefix = String::new();
    let mut by_skill_path: HashMap<String, ArchiveSkillLocation> = HashMap::new();

    let entries = archive.entries().map_err(|e| {
        error!("[scan_github_skills_archive] 读取 tar 条目失败: {}", e);
        format!("读取 tar 条目失败: {}", e)
    })?;

    for entry_result in entries {
        let mut entry = entry_result.map_err(|e| {
            error!("[scan_github_skills_archive] 读取 tar 条目失败: {}", e);
            format!("读取 tar 条目失败: {}", e)
        })?;

        let path = entry.path().map_err(|e| {
            error!("[scan_github_skills_archive] 读取 tar 路径失败: {}", e);
            format!("读取 tar 路径失败: {}", e)
        })?;
        let full_path = path.to_string_lossy().replace('\\', "/");

        if root_prefix.is_empty() {
            if let Some(prefix) = full_path.split('/').next() {
                if !prefix.is_empty() {
                    root_prefix = format!("{}/", prefix);
                }
            }
        }

        let relative_path = if !root_prefix.is_empty() && full_path.starts_with(&root_prefix) {
            full_path[root_prefix.len()..].to_string()
        } else {
            full_path.clone()
        };

        let definition_file = if relative_path.ends_with("/SKILL.md") || relative_path == "SKILL.md"
        {
            "SKILL.md"
        } else if relative_path.ends_with("/SKILLS.md") || relative_path == "SKILLS.md" {
            "SKILLS.md"
        } else {
            continue;
        };

        let mut content = String::new();
        entry.read_to_string(&mut content).map_err(|e| {
            error!(
                "[scan_github_skills_archive] 读取文件内容失败 ({}): {}",
                relative_path, e
            );
            format!("读取文件内容失败: {}", e)
        })?;

        let skill_path = if relative_path == "SKILL.md" || relative_path == "SKILLS.md" {
            String::new()
        } else {
            relative_path
                .trim_end_matches("/SKILL.md")
                .trim_end_matches("/SKILLS.md")
                .to_string()
        };

        let skill_name = if skill_path.is_empty() {
            repo.clone()
        } else {
            skill_path
                .split('/')
                .next_back()
                .unwrap_or_default()
                .to_string()
        };

        let location = ArchiveSkillLocation {
            path: skill_path.clone(),
            name: skill_name,
            definition_file: definition_file.to_string(),
            definition_content: content,
        };

        // 同一路径优先保留 SKILL.md
        if let Some(existing) = by_skill_path.get(&skill_path) {
            if existing.definition_file == "SKILL.md" && definition_file == "SKILLS.md" {
                continue;
            }
        }
        by_skill_path.insert(skill_path, location);
    }

    let locations: Vec<ArchiveSkillLocation> = by_skill_path.into_values().collect();
    info!(
        "[scan_github_skills_archive] 扫描完成，发现 {} 个技能定义",
        locations.len()
    );

    serde_json::to_string(&locations).map_err(|e| {
        error!("[scan_github_skills_archive] 序列化结果失败: {}", e);
        format!("序列化结果失败: {}", e)
    })
}

/// 保存 Skills 到本地文件
///
/// 仅保存自定义技能，内置技能从代码加载
#[tauri::command]
async fn save_skills(
    app_handle: tauri::AppHandle,
    skills: Vec<serde_json::Value>,
) -> Result<(), String> {
    info!("[save_skills] 开始保存 Skills，数量: {}", skills.len());

    let data_dir = get_data_dir(&app_handle)?;

    if !data_dir.exists() {
        fs::create_dir_all(&data_dir).map_err(|e| format!("创建数据目录失败: {}", e))?;
    }

    let file_path = data_dir.join("skills.json");
    let json = serde_json::to_string_pretty(&skills)
        .map_err(|e| format!("序列化 Skills 数据失败: {}", e))?;

    fs::write(&file_path, &json).map_err(|e| format!("写入文件失败: {}", e))?;

    info!("[save_skills] 保存成功");
    Ok(())
}

/// 从本地文件加载 Skills
#[tauri::command]
async fn load_skills(app_handle: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    info!("[load_skills] 开始加载 Skills");

    let data_dir = get_data_dir(&app_handle)?;
    let file_path = data_dir.join("skills.json");

    if !file_path.exists() {
        info!("[load_skills] 文件不存在，返回空数组");
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&file_path).map_err(|e| format!("读取文件失败: {}", e))?;

    let skills: Vec<serde_json::Value> =
        serde_json::from_str(&content).map_err(|e| format!("解析 Skills 数据失败: {}", e))?;

    info!("[load_skills] 加载成功，Skills 数量: {}", skills.len());
    Ok(skills)
}

// ==================== Settings 存储模块 (v2.6.0) ====================

/// 应用设置结构体
///
/// 存储用户偏好设置（主题、语言等）
/// v4.1.7: 添加侧边栏折叠状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    /// 主题设置: "light" | "dark" | "system"
    pub theme: String,
    /// 语言设置: "zh" | "en"
    pub language: String,
    /// v4.1.7: 侧边栏折叠状态
    #[serde(default)]
    pub sidebar_collapsed: bool,
}

/// 保存应用设置到本地文件
///
/// # 参数
/// - `app_handle`: Tauri 应用句柄
/// - `settings`: 应用设置
///
/// # 返回
/// - 成功返回 Ok(())，失败返回错误信息
#[tauri::command]
async fn save_settings(app_handle: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    info!(
        "[save_settings] 开始保存应用设置: theme={}, language={}, sidebar_collapsed={}",
        settings.theme, settings.language, settings.sidebar_collapsed
    );

    let data_dir = get_data_dir(&app_handle)?;

    if !data_dir.exists() {
        fs::create_dir_all(&data_dir).map_err(|e| format!("创建数据目录失败: {}", e))?;
    }

    let file_path = data_dir.join("settings.json");
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("序列化设置数据失败: {}", e))?;

    fs::write(&file_path, &json).map_err(|e| format!("写入文件失败: {}", e))?;

    info!("[save_settings] 保存成功");
    Ok(())
}

/// 从本地文件加载应用设置
///
/// # 参数
/// - `app_handle`: Tauri 应用句柄
///
/// # 返回
/// - 成功返回应用设置，文件不存在时返回默认设置
#[tauri::command]
async fn load_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, String> {
    info!("[load_settings] 开始加载应用设置");

    let data_dir = get_data_dir(&app_handle)?;
    let file_path = data_dir.join("settings.json");

    if !file_path.exists() {
        info!("[load_settings] 文件不存在，返回默认设置（语言设为 auto，由前端检测系统语言）");
        return Ok(AppSettings {
            theme: "system".to_string(),
            language: "auto".to_string(),
            sidebar_collapsed: false,
        });
    }

    let content = fs::read_to_string(&file_path).map_err(|e| format!("读取文件失败: {}", e))?;

    let settings: AppSettings =
        serde_json::from_str(&content).map_err(|e| format!("解析设置数据失败: {}", e))?;

    info!(
        "[load_settings] 加载成功: theme={}, language={}, sidebar_collapsed={}",
        settings.theme, settings.language, settings.sidebar_collapsed
    );
    Ok(settings)
}

// ==================== API Keys 存储模块 (v2.5.2) ====================

/// 保存 API Keys 到本地文件
///
/// API Keys 以 HashMap<modelId, apiKey> 格式存储
/// 注意：当前为明文存储，生产环境建议使用加密存储
#[tauri::command]
async fn save_api_keys(
    app_handle: tauri::AppHandle,
    api_keys: HashMap<String, String>,
) -> Result<(), String> {
    info!(
        "[save_api_keys] 开始保存 API Keys，数量: {}",
        api_keys.len()
    );

    let data_dir = get_data_dir(&app_handle)?;

    if !data_dir.exists() {
        fs::create_dir_all(&data_dir).map_err(|e| format!("创建数据目录失败: {}", e))?;
    }

    let file_path = data_dir.join("api_keys.json");
    let json = serde_json::to_string_pretty(&api_keys)
        .map_err(|e| format!("序列化 API Keys 失败: {}", e))?;

    fs::write(&file_path, &json).map_err(|e| format!("写入文件失败: {}", e))?;

    info!("[save_api_keys] 保存成功");
    Ok(())
}

/// 从本地文件加载 API Keys
#[tauri::command]
async fn load_api_keys(app_handle: tauri::AppHandle) -> Result<HashMap<String, String>, String> {
    info!("[load_api_keys] 开始加载 API Keys");

    let data_dir = get_data_dir(&app_handle)?;
    let file_path = data_dir.join("api_keys.json");

    if !file_path.exists() {
        info!("[load_api_keys] 文件不存在，返回空 HashMap");
        return Ok(HashMap::new());
    }

    let content = fs::read_to_string(&file_path).map_err(|e| format!("读取文件失败: {}", e))?;

    let api_keys: HashMap<String, String> =
        serde_json::from_str(&content).map_err(|e| format!("解析 API Keys 失败: {}", e))?;

    info!(
        "[load_api_keys] 加载成功，API Keys 数量: {}",
        api_keys.len()
    );
    Ok(api_keys)
}

// ==================== Provider Credentials 存储 (v0.9.0) ====================

/// Provider 凭证结构体
///
/// 用于持久化存储 AI 提供商的认证凭证
/// v0.9.0: 添加 auth_method 字段支持 Kiro IDC/Builder ID 区分
/// v0.9.1: 添加 Kiro 客户端注册信息持久化（修复重启后登录状态丢失问题）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderCredential {
    /// 提供商 ID
    pub provider_id: String,
    /// 认证类型: "api" | "oauth"
    #[serde(rename = "type")]
    pub auth_type: String,
    /// API Key（API 认证时使用）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    /// 访问令牌（OAuth 认证时使用）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    /// 刷新令牌（OAuth 认证时使用）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    /// 令牌过期时间戳（毫秒）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<u64>,
    /// ChatGPT 账户 ID（OpenAI OAuth 时使用）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    /// GCP 项目 ID（Google OAuth 时使用）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    /// Kiro Profile ARN（Kiro OAuth 时使用）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_arn: Option<String>,
    /// Kiro 认证方式: "idc" | "aws"（用于选择正确的 User-Agent）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_method: Option<String>,
    /// v0.9.1: Kiro 客户端 ID（AWS SSO OIDC 注册后获取，用于 token 刷新）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kiro_client_id: Option<String>,
    /// v0.9.1: Kiro 客户端密钥（AWS SSO OIDC 注册后获取，用于 token 刷新）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kiro_client_secret: Option<String>,
    /// v0.9.1: Kiro SSO 区域（用于 token 刷新时构建正确的 endpoint）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kiro_sso_region: Option<String>,
    /// v0.9.1: Kiro IDC Start URL（IDC 认证时使用）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kiro_start_url: Option<String>,
    /// 创建时间
    pub created_at: String,
    /// 更新时间
    pub updated_at: String,
}

/// 保存 Provider 凭证到本地文件
#[tauri::command]
async fn save_provider_credentials(
    app_handle: tauri::AppHandle,
    credentials: Vec<ProviderCredential>,
) -> Result<(), String> {
    info!(
        "[save_provider_credentials] 保存 Provider 凭证，数量: {}",
        credentials.len()
    );

    let data_dir = get_data_dir(&app_handle)?;
    let file_path = data_dir.join("provider_credentials.json");

    let json =
        serde_json::to_string_pretty(&credentials).map_err(|e| format!("序列化凭证失败: {}", e))?;

    fs::write(&file_path, json).map_err(|e| format!("写入文件失败: {}", e))?;

    info!("[save_provider_credentials] 保存成功: {:?}", file_path);

    // 清理已删除 Provider 的启用状态
    // 如果某个 Provider 被删除（不在新的 credentials 列表中），需要清理其启用状态
    let valid_provider_ids: Vec<String> =
        credentials.iter().map(|c| c.provider_id.clone()).collect();

    // 加载启用状态并清理
    if let Ok(mut enabled_state) =
        services::config_exporter::enabled_state::EnabledState::load(&data_dir)
    {
        let removed_count = enabled_state.cleanup_deleted_providers(&valid_provider_ids);

        // 如果有清理操作，保存更新后的状态
        if removed_count > 0 {
            if let Err(e) = enabled_state.save(&data_dir) {
                warn!("[save_provider_credentials] 保存启用状态失败: {}", e);
            } else {
                info!(
                    "[save_provider_credentials] 清理完成: 移除 {} 个已删除 Provider 的启用状态",
                    removed_count
                );
            }
        }
    }

    Ok(())
}

/// 从本地文件加载 Provider 凭证
#[tauri::command]
async fn load_provider_credentials(
    app_handle: tauri::AppHandle,
) -> Result<Vec<ProviderCredential>, String> {
    info!("[load_provider_credentials] 开始加载 Provider 凭证");

    let data_dir = get_data_dir(&app_handle)?;
    let file_path = data_dir.join("provider_credentials.json");

    if !file_path.exists() {
        info!("[load_provider_credentials] 文件不存在，返回空列表");
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&file_path).map_err(|e| format!("读取文件失败: {}", e))?;

    let credentials: Vec<ProviderCredential> =
        serde_json::from_str(&content).map_err(|e| format!("解析凭证失败: {}", e))?;

    info!(
        "[load_provider_credentials] 加载成功，凭证数量: {}",
        credentials.len()
    );
    Ok(credentials)
}

// ==================== 自定义提供商存储 (v0.9.3) ====================

/// 保存自定义提供商配置到本地文件
#[tauri::command]
async fn save_custom_providers(
    app_handle: tauri::AppHandle,
    providers: String,
) -> Result<(), String> {
    info!("[save_custom_providers] 保存自定义提供商配置");

    let data_dir = get_data_dir(&app_handle)?;
    let file_path = data_dir.join("custom_providers.json");

    fs::write(&file_path, providers).map_err(|e| format!("写入文件失败: {}", e))?;

    info!("[save_custom_providers] 保存成功: {:?}", file_path);
    Ok(())
}

/// 从本地文件加载自定义提供商配置
#[tauri::command]
async fn load_custom_providers(app_handle: tauri::AppHandle) -> Result<String, String> {
    info!("[load_custom_providers] 开始加载自定义提供商配置");

    let data_dir = get_data_dir(&app_handle)?;
    let file_path = data_dir.join("custom_providers.json");

    if !file_path.exists() {
        info!("[load_custom_providers] 文件不存在，返回空数组");
        return Ok("[]".to_string());
    }

    let content = fs::read_to_string(&file_path).map_err(|e| format!("读取文件失败: {}", e))?;

    info!("[load_custom_providers] 加载成功");
    Ok(content)
}

// ==================== MCP 服务器模块 ====================

/// MCP 服务器配置结构体 (v2.2.0)
///
/// 用于持久化存储 MCP 服务器配置信息
///
/// v2.0.0 新增: transport_type, command, args, env 字段支持 stdio 传输
/// v2.0.1 修复: 确保所有字段正确持久化
/// v2.2.0 新增: enabled, auto_start 字段支持启用/禁用和自动启动
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPServerConfig {
    /// 服务器唯一标识
    pub id: String,
    /// 服务器名称
    pub name: String,
    /// 服务器描述
    pub description: String,

    /// 是否启用 (v2.2.0): false = 完全禁用，不参与任何操作
    #[serde(default = "default_enabled")]
    pub enabled: bool,

    /// 是否自动启动 (v2.2.0): 应用启动时自动连接
    #[serde(default = "default_auto_start")]
    pub auto_start: bool,

    /// 传输类型 (v2.0.0): "stdio" | "http"
    #[serde(default = "default_transport_type")]
    pub transport_type: String,

    /// stdio 传输: 启动命令 (如 "npx")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,

    /// stdio 传输: 命令参数 (如 ["-y", "@modelcontextprotocol/server-filesystem"])
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,

    /// stdio 传输: 环境变量
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<std::collections::HashMap<String, String>>,

    /// HTTP 传输: 端点地址
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,

    /// 连接状态: "connected" | "disconnected" | "error"
    pub status: String,

    /// 服务器能力（已弃用，保留兼容性）
    #[serde(default)]
    pub capabilities: Vec<String>,

    /// 认证类型: "none" | "apikey" | "token"
    pub auth_type: String,

    /// 认证值（敏感数据）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_value: Option<String>,

    /// 最后活跃时间 (ISO 8601 格式)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_active_at: Option<String>,

    /// 请求计数
    #[serde(default)]
    pub request_count: i32,

    /// 错误信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,

    /// 创建时间 (ISO 8601 格式)
    pub created_at: String,

    /// 更新时间 (ISO 8601 格式)
    pub updated_at: String,
}

/// 默认传输类型为 http（兼容旧版本数据）
fn default_transport_type() -> String {
    "http".to_string()
}

/// 默认启用 (v2.2.0)
fn default_enabled() -> bool {
    true
}

/// 默认不自动启动 (v2.2.0)
fn default_auto_start() -> bool {
    false
}

/// 测试 MCP 服务器连接
///
/// 通过 HTTP HEAD 请求测试端点是否可达
///
/// # 参数
/// - `endpoint`: 服务器端点地址 (支持 URL 或 host:port 格式)
///
/// # 返回
/// - `Ok(true)`: 连接成功
/// - `Err(String)`: 连接失败，包含错误原因
#[tauri::command]
async fn mcp_test_connection(endpoint: String) -> Result<bool, String> {
    info!("[mcp_test_connection] 开始测试连接: {}", endpoint);

    // 1. 解析端点地址 - 支持 URL 或 host:port 格式
    let url = if endpoint.starts_with("http://") || endpoint.starts_with("https://") {
        endpoint.clone()
    } else {
        // host:port 格式，默认使用 http 协议
        format!("http://{}", endpoint)
    };

    debug!("[mcp_test_connection] 解析后的 URL: {}", url);

    // 2. 创建带超时的 HTTP 客户端 (5 秒超时)
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| {
            error!("[mcp_test_connection] 创建 HTTP 客户端失败: {}", e);
            format!("创建客户端失败: {}", e)
        })?;

    // 3. 发送 HEAD 请求测试连通性 (HEAD 请求更轻量)
    match client.head(&url).send().await {
        Ok(response) => {
            let status = response.status();
            debug!("[mcp_test_connection] 响应状态码: {}", status);

            // 2xx 成功状态码或 3xx 重定向都视为连接成功
            if status.is_success() || status.is_redirection() {
                info!("[mcp_test_connection] 连接成功: {}", endpoint);
                Ok(true)
            } else {
                // 4xx/5xx 错误状态码
                let msg = format!("服务器返回错误状态: {}", status);
                warn!("[mcp_test_connection] {}", msg);
                Err(msg)
            }
        }
        Err(e) => {
            // 根据错误类型返回友好的错误信息
            let msg = if e.is_timeout() {
                "连接超时".to_string()
            } else if e.is_connect() {
                "连接被拒绝".to_string()
            } else if e.is_request() {
                format!("请求错误: {}", e)
            } else {
                format!("连接失败: {}", e)
            };

            error!("[mcp_test_connection] {}: {}", msg, endpoint);
            Err(msg)
        }
    }
}

/// 保存 MCP 服务器配置到本地文件
///
/// # 参数
/// - `app_handle`: Tauri 应用句柄
/// - `servers`: MCP 服务器配置数组
///
/// # 返回
/// - 成功返回 Ok(())，失败返回错误信息
#[tauri::command]
async fn save_mcp_servers(
    app_handle: tauri::AppHandle,
    servers: Vec<MCPServerConfig>,
) -> Result<(), String> {
    info!(
        "[save_mcp_servers] 开始保存 MCP 服务器配置，数量: {}",
        servers.len()
    );

    // 获取数据目录
    let data_dir = get_data_dir(&app_handle)?;

    // 确保目录存在
    if !data_dir.exists() {
        debug!("[save_mcp_servers] 创建数据目录: {:?}", data_dir);
        fs::create_dir_all(&data_dir).map_err(|e| format!("创建数据目录失败: {}", e))?;
    }

    // 构建文件路径
    let file_path = data_dir.join("mcp_servers.json");
    debug!("[save_mcp_servers] 保存路径: {:?}", file_path);

    // 序列化并写入文件
    let json = serde_json::to_string_pretty(&servers)
        .map_err(|e| format!("序列化 MCP 服务器数据失败: {}", e))?;

    fs::write(&file_path, &json).map_err(|e| format!("写入文件失败: {}", e))?;

    info!(
        "[save_mcp_servers] 保存成功，文件大小: {} bytes",
        json.len()
    );
    Ok(())
}

/// 从本地文件加载 MCP 服务器配置
///
/// # 参数
/// - `app_handle`: Tauri 应用句柄
///
/// # 返回
/// - 成功返回 MCP 服务器配置数组，文件不存在时返回空数组
#[tauri::command]
async fn load_mcp_servers(app_handle: tauri::AppHandle) -> Result<Vec<MCPServerConfig>, String> {
    info!("[load_mcp_servers] 开始加载 MCP 服务器配置");

    // 获取数据目录
    let data_dir = get_data_dir(&app_handle)?;
    let file_path = data_dir.join("mcp_servers.json");

    debug!("[load_mcp_servers] 读取路径: {:?}", file_path);

    // 检查文件是否存在
    if !file_path.exists() {
        info!("[load_mcp_servers] 文件不存在，返回空数组");
        return Ok(Vec::new());
    }

    // 读取并解析文件
    let content = fs::read_to_string(&file_path).map_err(|e| format!("读取文件失败: {}", e))?;

    let servers: Vec<MCPServerConfig> =
        serde_json::from_str(&content).map_err(|e| format!("解析 MCP 服务器数据失败: {}", e))?;

    info!("[load_mcp_servers] 加载成功，服务器数量: {}", servers.len());
    Ok(servers)
}

// ==================== MCP 真实协议命令 (v2.0.0) ====================

/// MCP 连接请求参数
///
/// 前端传入的 MCP 服务器连接配置
#[derive(Debug, Deserialize)]
pub struct MCPConnectRequest {
    /// 服务器唯一标识
    pub server_id: String,
    /// 传输类型: "stdio" | "http"
    pub transport_type: String,
    /// stdio 传输: 启动命令 (如 "npx", "node")
    pub command: Option<String>,
    /// stdio 传输: 命令参数
    pub args: Option<Vec<String>>,
    /// stdio 传输: 环境变量
    pub env: Option<HashMap<String, String>>,
    /// http 传输: 端点地址
    pub endpoint: Option<String>,
}

/// MCP 连接响应
#[derive(Debug, Serialize)]
pub struct MCPConnectResponse {
    /// 是否连接成功
    pub success: bool,
    /// 服务器名称
    pub server_name: Option<String>,
    /// 服务器版本
    pub server_version: Option<String>,
    /// 协议版本
    pub protocol_version: Option<String>,
    /// 错误信息
    pub error: Option<String>,
}

/// 连接到 MCP 服务器
///
/// 使用 MCP 协议连接到本地或远程 MCP 服务器
///
/// # 参数
/// - `request`: 连接配置，包含传输类型和连接参数
///
/// # 返回
/// - 成功: 服务器信息
/// - 失败: 错误信息
#[tauri::command]
async fn mcp_connect(request: MCPConnectRequest) -> Result<MCPConnectResponse, String> {
    info!("[mcp_connect] 开始连接 MCP 服务器: {}", request.server_id);
    debug!("[mcp_connect] 传输类型: {}", request.transport_type);

    // 解析传输类型
    let transport_type = match request.transport_type.as_str() {
        "stdio" => TransportType::Stdio,
        "http" => TransportType::Http,
        _ => {
            error!("[mcp_connect] 不支持的传输类型: {}", request.transport_type);
            return Ok(MCPConnectResponse {
                success: false,
                server_name: None,
                server_version: None,
                protocol_version: None,
                error: Some(format!("不支持的传输类型: {}", request.transport_type)),
            });
        }
    };

    // 构建连接配置
    let config = MCPConnectConfig {
        transport_type,
        command: request.command,
        args: request.args,
        env: request.env,
        endpoint: request.endpoint,
        auth_type: None, // 认证在前端配置中单独管理
        auth_value: None,
    };

    // 执行连接
    match MCP_MANAGER.connect(&request.server_id, config).await {
        Ok(result) => {
            // MCPConnectionResult 的字段是 Option 类型
            let server_name = result.server_info.as_ref().map(|s| s.name.clone());
            let server_version = result.server_info.as_ref().map(|s| s.version.clone());

            if let (Some(name), Some(version)) = (&server_name, &server_version) {
                info!("[mcp_connect] 连接成功: {} v{}", name, version);
            }

            Ok(MCPConnectResponse {
                success: result.success,
                server_name,
                server_version,
                protocol_version: result.protocol_version,
                error: result.error,
            })
        }
        Err(e) => {
            error!("[mcp_connect] 连接失败: {}", e);
            Ok(MCPConnectResponse {
                success: false,
                server_name: None,
                server_version: None,
                protocol_version: None,
                error: Some(e.to_string()),
            })
        }
    }
}

/// 断开 MCP 服务器连接
///
/// # 参数
/// - `server_id`: 服务器唯一标识
///
/// # 返回
/// - 成功: true
/// - 失败: 错误信息
#[tauri::command]
async fn mcp_disconnect(server_id: String) -> Result<bool, String> {
    info!("[mcp_disconnect] 断开 MCP 服务器: {}", server_id);

    match MCP_MANAGER.disconnect(&server_id).await {
        Ok(()) => {
            info!("[mcp_disconnect] 断开成功: {}", server_id);
            Ok(true)
        }
        Err(e) => {
            error!("[mcp_disconnect] 断开失败: {}", e);
            Err(e.to_string())
        }
    }
}

/// 列出 MCP 服务器支持的工具
///
/// # 参数
/// - `server_id`: 服务器唯一标识
///
/// # 返回
/// - 成功: 工具列表
/// - 失败: 错误信息
#[tauri::command]
async fn mcp_list_tools(server_id: String) -> Result<Vec<Tool>, String> {
    info!("[mcp_list_tools] 列出服务器工具: {}", server_id);

    match MCP_MANAGER.list_tools(&server_id).await {
        Ok(tools) => {
            info!("[mcp_list_tools] 获取到 {} 个工具", tools.len());
            for tool in &tools {
                debug!("[mcp_list_tools] 工具: {}", tool.name);
            }
            Ok(tools)
        }
        Err(e) => {
            error!("[mcp_list_tools] 获取工具列表失败: {}", e);
            Err(e.to_string())
        }
    }
}

/// 调用 MCP 工具
///
/// # 参数
/// - `server_id`: 服务器唯一标识
/// - `tool_name`: 工具名称
/// - `arguments`: 工具参数 (JSON 对象)
///
/// # 返回
/// - 成功: 工具执行结果
/// - 失败: 错误信息
#[tauri::command]
async fn mcp_call_tool(
    server_id: String,
    tool_name: String,
    arguments: serde_json::Value,
) -> Result<CallToolResult, String> {
    info!("[mcp_call_tool] 调用工具: {} @ {}", tool_name, server_id);
    debug!("[mcp_call_tool] 参数: {}", arguments);

    match MCP_MANAGER
        .call_tool(&server_id, &tool_name, arguments)
        .await
    {
        Ok(result) => {
            info!("[mcp_call_tool] 工具执行完成");
            if result.is_error.unwrap_or(false) {
                warn!("[mcp_call_tool] 工具返回错误");
            }
            Ok(result)
        }
        Err(e) => {
            error!("[mcp_call_tool] 工具调用失败: {}", e);
            Err(e.to_string())
        }
    }
}

/// 列出 MCP 服务器可用的资源
///
/// # 参数
/// - `server_id`: 服务器唯一标识
///
/// # 返回
/// - 成功: 资源列表
/// - 失败: 错误信息
#[tauri::command]
async fn mcp_list_resources(server_id: String) -> Result<Vec<Resource>, String> {
    info!("[mcp_list_resources] 列出服务器资源: {}", server_id);

    match MCP_MANAGER.list_resources(&server_id).await {
        Ok(resources) => {
            info!("[mcp_list_resources] 获取到 {} 个资源", resources.len());
            Ok(resources)
        }
        Err(e) => {
            error!("[mcp_list_resources] 获取资源列表失败: {}", e);
            Err(e.to_string())
        }
    }
}

/// 检查 MCP 服务器是否已连接
///
/// # 参数
/// - `server_id`: 服务器唯一标识
///
/// # 返回
/// - 是否已连接
#[tauri::command]
async fn mcp_is_connected(server_id: String) -> bool {
    let connected = MCP_MANAGER.is_connected(&server_id).await;
    debug!(
        "[mcp_is_connected] 服务器 {} 连接状态: {}",
        server_id, connected
    );
    connected
}

/// 获取所有已连接的 MCP 服务器 ID
///
/// # 返回
/// - 已连接的服务器 ID 列表
#[tauri::command]
async fn mcp_get_connected_servers() -> Vec<String> {
    let servers = MCP_MANAGER.get_connected_servers().await;
    info!(
        "[mcp_get_connected_servers] 当前已连接 {} 个服务器",
        servers.len()
    );
    servers
}

/// 断开所有 MCP 服务器连接
///
/// # 返回
/// - 成功: true
/// - 失败: 错误信息
#[tauri::command]
async fn mcp_disconnect_all() -> Result<bool, String> {
    info!("[mcp_disconnect_all] 断开所有 MCP 服务器");

    match MCP_MANAGER.disconnect_all().await {
        Ok(()) => {
            info!("[mcp_disconnect_all] 所有服务器已断开");
            Ok(true)
        }
        Err(e) => {
            error!("[mcp_disconnect_all] 断开失败: {}", e);
            Err(e.to_string())
        }
    }
}

// ==================== AI 对话模块 ====================

// ==================== OAuth 认证模块 (v3.1.0) ====================

/// GitHub Copilot OAuth Client ID
/// 来源: opencode 项目
const GITHUB_COPILOT_CLIENT_ID: &str = "Ov23li8tweQw6odWQebz";

/// Google OAuth User-Agent 配置
/// 参考 Antigravity-Manager 实现，使用与官方客户端一致的 User-Agent
/// 格式: vscode/1.X.X (Antigravity/版本号)
/// 这样可以避免被 Google 识别为非官方客户端而触发风控
const GOOGLE_OAUTH_USER_AGENT: &str = "vscode/1.95.0 (Antigravity/4.1.37)";

/// Kiro OAuth 配置
/// 来源: CLIProxyAPIPlus 项目 (internal/auth/kiro/sso_oidc.go, social_auth.go)
/// AWS Builder ID (Device Flow) 配置
const KIRO_CLIENT_NAME: &str = "Kiro IDE";
const KIRO_SSO_REGION: &str = "us-east-1";
const KIRO_START_URL: &str = "https://view.awsapps.com/start";
const KIRO_USER_AGENT: &str = "KiroIDE";
const KIRO_SCOPES: &[&str] = &[
    "codewhisperer:completions",
    "codewhisperer:analysis",
    "codewhisperer:conversations",
    "codewhisperer:transformations",
    "codewhisperer:taskassist",
];

/// Kiro Social Auth (Google/GitHub) 配置
const KIRO_AUTH_SERVICE_ENDPOINT: &str = "https://prod.us-east-1.auth.desktop.kiro.dev";
const KIRO_SOCIAL_CALLBACK_PORT: u16 = 9876;

/// OAuth Device Code 请求参数
#[derive(Debug, Deserialize)]
pub struct OAuthDeviceCodeRequest {
    /// 提供商 ID (github-copilot, kiro 等)
    pub provider_id: String,
    /// 认证方式 (可选，用于 Kiro: "google", "github", "aws", "idc")
    pub auth_method: Option<String>,
    /// IDC Start URL (仅用于 AWS Identity Center)
    pub start_url: Option<String>,
    /// IDC Region (仅用于 AWS Identity Center，默认 us-east-1)
    pub region: Option<String>,
}

/// OAuth Device Code 响应
#[derive(Debug, Serialize)]
pub struct OAuthDeviceCodeResponse {
    /// 是否成功
    pub success: bool,
    /// 设备码 (Device Flow)
    pub device_code: Option<String>,
    /// 用户码（需要用户输入，Device Flow）
    pub user_code: Option<String>,
    /// 验证 URL
    pub verification_uri: Option<String>,
    /// 过期时间（秒）
    pub expires_in: Option<u32>,
    /// 轮询间隔（秒）
    pub interval: Option<u32>,
    /// 错误信息
    pub error: Option<String>,
    /// 认证 URL (Social Auth - Authorization Code Flow)
    pub auth_url: Option<String>,
    /// Code Verifier (Social Auth - PKCE)
    pub code_verifier: Option<String>,
    /// State (Social Auth - CSRF protection)
    pub state: Option<String>,
    /// Redirect URI (Social Auth)
    pub redirect_uri: Option<String>,
}

/// 请求 OAuth Device Code
///
/// 用于 GitHub Copilot、Kiro 等 OAuth 认证
///
/// # 参数
/// - `request`: 包含 provider_id 和可选的 auth_method
///
/// # 返回
/// - 成功: Device Code 信息或 Auth URL
/// - 失败: 错误信息
#[tauri::command]
async fn oauth_request_device_code(
    request: OAuthDeviceCodeRequest,
) -> Result<OAuthDeviceCodeResponse, String> {
    info!(
        "[oauth_request_device_code] 请求 OAuth, provider: {}, auth_method: {:?}",
        request.provider_id, request.auth_method
    );

    match request.provider_id.as_str() {
        "github-copilot" => request_github_device_code().await,
        "kiro" => {
            // Kiro 支持多种认证方式
            let auth_method = request.auth_method.as_deref().unwrap_or("aws");
            match auth_method.to_lowercase().as_str() {
                "google" => request_kiro_social_auth("Google").await,
                "github" => request_kiro_social_auth("Github").await,
                "idc" | "aws identity center" | "aws identity center (idc)" => {
                    // IDC 需要 start_url 和 region 参数
                    let start_url = request
                        .start_url
                        .as_deref()
                        .ok_or_else(|| "IDC 认证需要提供 Start URL".to_string())?;
                    let region = request.region.as_deref().unwrap_or("us-east-1");
                    request_kiro_idc_device_code(start_url, region).await
                }
                _ => request_kiro_device_code().await,
            }
        }
        _ => Ok(OAuthDeviceCodeResponse {
            success: false,
            device_code: None,
            user_code: None,
            verification_uri: None,
            expires_in: None,
            interval: None,
            error: Some(format!("不支持的 OAuth 提供商: {}", request.provider_id)),
            auth_url: None,
            code_verifier: None,
            state: None,
            redirect_uri: None,
        }),
    }
}

/// 请求 GitHub Copilot Device Code
async fn request_github_device_code() -> Result<OAuthDeviceCodeResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let response = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header("User-Agent", "MobausStudio/1.0")
        .json(&serde_json::json!({
            "client_id": GITHUB_COPILOT_CLIENT_ID,
            "scope": "read:user"
        }))
        .send()
        .await
        .map_err(|e| {
            error!("[oauth_request_device_code] 网络请求失败: {}", e);
            format!("网络请求失败: {}", e)
        })?;

    let status = response.status();
    debug!(
        "[oauth_request_device_code] 响应状态码: {}",
        status.as_u16()
    );

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!(
            "[oauth_request_device_code] API 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Ok(OAuthDeviceCodeResponse {
            success: false,
            device_code: None,
            user_code: None,
            verification_uri: None,
            expires_in: None,
            interval: None,
            error: Some(format!(
                "GitHub API 错误 ({}): {}",
                status.as_u16(),
                error_text
            )),
            auth_url: None,
            code_verifier: None,
            state: None,
            redirect_uri: None,
        });
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    info!(
        "[oauth_request_device_code] Device Code 获取成功, user_code: {}",
        data["user_code"].as_str().unwrap_or("")
    );

    Ok(OAuthDeviceCodeResponse {
        success: true,
        device_code: data["device_code"].as_str().map(|s| s.to_string()),
        user_code: data["user_code"].as_str().map(|s| s.to_string()),
        verification_uri: data["verification_uri"].as_str().map(|s| s.to_string()),
        expires_in: data["expires_in"].as_u64().map(|n| n as u32),
        interval: data["interval"].as_u64().map(|n| n as u32),
        error: None,
        auth_url: None,
        code_verifier: None,
        state: None,
        redirect_uri: None,
    })
}

/// Kiro 客户端注册信息（用于存储 clientId 和 clientSecret）
static KIRO_CLIENT_REGISTRATION: once_cell::sync::Lazy<std::sync::Mutex<Option<(String, String)>>> =
    once_cell::sync::Lazy::new(|| std::sync::Mutex::new(None));

/// 请求 Kiro (AWS Builder ID) Device Code
///
/// Kiro 使用 AWS SSO OIDC Device Flow:
/// 1. 先调用 RegisterClient 注册客户端
/// 2. 再调用 StartDeviceAuthorization 获取设备码
async fn request_kiro_device_code() -> Result<OAuthDeviceCodeResponse, String> {
    info!("[request_kiro_device_code] 开始 Kiro OAuth 流程");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let sso_oidc_endpoint = format!("https://oidc.{}.amazonaws.com", KIRO_SSO_REGION);

    // 步骤 1: 注册客户端
    info!("[request_kiro_device_code] 步骤 1: 注册 OIDC 客户端");
    let register_response = client
        .post(format!("{}/client/register", sso_oidc_endpoint))
        .header("Content-Type", "application/json")
        .header("User-Agent", KIRO_USER_AGENT)
        .json(&serde_json::json!({
            "clientName": KIRO_CLIENT_NAME,
            "clientType": "public",
            "scopes": KIRO_SCOPES,
            "grantTypes": ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"]
        }))
        .send()
        .await
        .map_err(|e| {
            error!("[request_kiro_device_code] 客户端注册请求失败: {}", e);
            format!("客户端注册请求失败: {}", e)
        })?;

    if !register_response.status().is_success() {
        let error_text = register_response.text().await.unwrap_or_default();
        error!("[request_kiro_device_code] 客户端注册失败: {}", error_text);
        return Ok(OAuthDeviceCodeResponse {
            success: false,
            device_code: None,
            user_code: None,
            verification_uri: None,
            expires_in: None,
            interval: None,
            error: Some(format!("Kiro 客户端注册失败: {}", error_text)),
            auth_url: None,
            code_verifier: None,
            state: None,
            redirect_uri: None,
        });
    }

    let register_data: serde_json::Value = register_response
        .json()
        .await
        .map_err(|e| format!("解析注册响应失败: {}", e))?;

    let client_id = register_data["clientId"]
        .as_str()
        .ok_or("注册响应缺少 clientId")?;
    let client_secret = register_data["clientSecret"]
        .as_str()
        .ok_or("注册响应缺少 clientSecret")?;

    info!(
        "[request_kiro_device_code] 客户端注册成功, clientId: {}",
        client_id
    );

    // 保存客户端凭证供后续 token 轮询使用
    {
        let mut registration = KIRO_CLIENT_REGISTRATION.lock().unwrap();
        *registration = Some((client_id.to_string(), client_secret.to_string()));
    }

    // 步骤 2: 启动设备授权
    info!("[request_kiro_device_code] 步骤 2: 启动设备授权");
    let device_response = client
        .post(format!("{}/device_authorization", sso_oidc_endpoint))
        .header("Content-Type", "application/json")
        .header("User-Agent", KIRO_USER_AGENT)
        .json(&serde_json::json!({
            "clientId": client_id,
            "clientSecret": client_secret,
            "startUrl": KIRO_START_URL
        }))
        .send()
        .await
        .map_err(|e| {
            error!("[request_kiro_device_code] 设备授权请求失败: {}", e);
            format!("设备授权请求失败: {}", e)
        })?;

    if !device_response.status().is_success() {
        let error_text = device_response.text().await.unwrap_or_default();
        error!("[request_kiro_device_code] 设备授权失败: {}", error_text);
        return Ok(OAuthDeviceCodeResponse {
            success: false,
            device_code: None,
            user_code: None,
            verification_uri: None,
            expires_in: None,
            interval: None,
            error: Some(format!("Kiro 设备授权失败: {}", error_text)),
            auth_url: None,
            code_verifier: None,
            state: None,
            redirect_uri: None,
        });
    }

    let device_data: serde_json::Value = device_response
        .json()
        .await
        .map_err(|e| format!("解析设备授权响应失败: {}", e))?;

    info!(
        "[request_kiro_device_code] Device Code 获取成功, userCode: {}",
        device_data["userCode"].as_str().unwrap_or("")
    );

    Ok(OAuthDeviceCodeResponse {
        success: true,
        device_code: device_data["deviceCode"].as_str().map(|s| s.to_string()),
        user_code: device_data["userCode"].as_str().map(|s| s.to_string()),
        verification_uri: device_data["verificationUriComplete"]
            .as_str()
            .or(device_data["verificationUri"].as_str())
            .map(|s| s.to_string()),
        expires_in: device_data["expiresIn"].as_u64().map(|n| n as u32),
        interval: device_data["interval"]
            .as_u64()
            .map(|n| n as u32)
            .or(Some(5)),
        error: None,
        auth_url: None,
        code_verifier: None,
        state: None,
        redirect_uri: None,
    })
}

/// Kiro IDC 客户端注册信息类型别名
type KiroIdcClientRegistration = (String, String, String, String);

/// Kiro IDC 客户端注册信息（用于存储 clientId、clientSecret、startUrl、region）
static KIRO_IDC_CLIENT_REGISTRATION: once_cell::sync::Lazy<
    std::sync::Mutex<Option<KiroIdcClientRegistration>>,
> = once_cell::sync::Lazy::new(|| std::sync::Mutex::new(None));

/// 请求 Kiro (AWS Identity Center / IDC) Device Code
///
/// IDC 使用 AWS SSO OIDC Device Flow，但需要自定义 Start URL 和 Region:
/// 1. 先调用 RegisterClient 注册客户端（使用指定的 region）
/// 2. 再调用 StartDeviceAuthorization 获取设备码（使用自定义 startUrl）
///
/// # 参数
/// - `start_url`: 组织的 SSO 门户 URL
/// - `region`: AWS 区域（如 us-east-1）
async fn request_kiro_idc_device_code(
    start_url: &str,
    region: &str,
) -> Result<OAuthDeviceCodeResponse, String> {
    info!(
        "[request_kiro_idc_device_code] 开始 Kiro IDC OAuth 流程, start_url: {}, region: {}",
        start_url, region
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    // IDC 使用指定区域的 OIDC 端点
    let sso_oidc_endpoint = format!("https://oidc.{}.amazonaws.com", region);

    // 步骤 1: 注册客户端
    info!(
        "[request_kiro_idc_device_code] 步骤 1: 注册 OIDC 客户端 (region: {})",
        region
    );
    let register_response = client
        .post(format!("{}/client/register", sso_oidc_endpoint))
        .header("Content-Type", "application/json")
        .header("User-Agent", KIRO_USER_AGENT)
        .json(&serde_json::json!({
            "clientName": KIRO_CLIENT_NAME,
            "clientType": "public",
            "scopes": KIRO_SCOPES,
            "grantTypes": ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"]
        }))
        .send()
        .await
        .map_err(|e| {
            error!("[request_kiro_idc_device_code] 客户端注册请求失败: {}", e);
            format!("客户端注册请求失败: {}", e)
        })?;

    if !register_response.status().is_success() {
        let error_text = register_response.text().await.unwrap_or_default();
        error!(
            "[request_kiro_idc_device_code] 客户端注册失败: {}",
            error_text
        );
        return Ok(OAuthDeviceCodeResponse {
            success: false,
            device_code: None,
            user_code: None,
            verification_uri: None,
            expires_in: None,
            interval: None,
            error: Some(format!("Kiro IDC 客户端注册失败: {}", error_text)),
            auth_url: None,
            code_verifier: None,
            state: None,
            redirect_uri: None,
        });
    }

    let register_data: serde_json::Value = register_response
        .json()
        .await
        .map_err(|e| format!("解析注册响应失败: {}", e))?;

    let client_id = register_data["clientId"]
        .as_str()
        .ok_or("注册响应缺少 clientId")?;
    let client_secret = register_data["clientSecret"]
        .as_str()
        .ok_or("注册响应缺少 clientSecret")?;

    info!(
        "[request_kiro_idc_device_code] 客户端注册成功, clientId: {}",
        client_id
    );

    // 保存客户端凭证供后续 token 轮询使用（包含 startUrl 和 region）
    {
        let mut registration = KIRO_IDC_CLIENT_REGISTRATION.lock().unwrap();
        *registration = Some((
            client_id.to_string(),
            client_secret.to_string(),
            start_url.to_string(),
            region.to_string(),
        ));
    }

    // 同时更新普通的 KIRO_CLIENT_REGISTRATION（用于 poll_kiro_token）
    {
        let mut registration = KIRO_CLIENT_REGISTRATION.lock().unwrap();
        *registration = Some((client_id.to_string(), client_secret.to_string()));
    }

    // 步骤 2: 启动设备授权（使用自定义 startUrl）
    info!(
        "[request_kiro_idc_device_code] 步骤 2: 启动设备授权 (startUrl: {})",
        start_url
    );
    let device_response = client
        .post(format!("{}/device_authorization", sso_oidc_endpoint))
        .header("Content-Type", "application/json")
        .header("User-Agent", KIRO_USER_AGENT)
        .json(&serde_json::json!({
            "clientId": client_id,
            "clientSecret": client_secret,
            "startUrl": start_url
        }))
        .send()
        .await
        .map_err(|e| {
            error!("[request_kiro_idc_device_code] 设备授权请求失败: {}", e);
            format!("设备授权请求失败: {}", e)
        })?;

    if !device_response.status().is_success() {
        let error_text = device_response.text().await.unwrap_or_default();
        error!(
            "[request_kiro_idc_device_code] 设备授权失败: {}",
            error_text
        );
        return Ok(OAuthDeviceCodeResponse {
            success: false,
            device_code: None,
            user_code: None,
            verification_uri: None,
            expires_in: None,
            interval: None,
            error: Some(format!("Kiro IDC 设备授权失败: {}", error_text)),
            auth_url: None,
            code_verifier: None,
            state: None,
            redirect_uri: None,
        });
    }

    let device_data: serde_json::Value = device_response
        .json()
        .await
        .map_err(|e| format!("解析设备授权响应失败: {}", e))?;

    info!(
        "[request_kiro_idc_device_code] Device Code 获取成功, userCode: {}",
        device_data["userCode"].as_str().unwrap_or("")
    );

    Ok(OAuthDeviceCodeResponse {
        success: true,
        device_code: device_data["deviceCode"].as_str().map(|s| s.to_string()),
        user_code: device_data["userCode"].as_str().map(|s| s.to_string()),
        verification_uri: device_data["verificationUriComplete"]
            .as_str()
            .or(device_data["verificationUri"].as_str())
            .map(|s| s.to_string()),
        expires_in: device_data["expiresIn"].as_u64().map(|n| n as u32),
        interval: device_data["interval"]
            .as_u64()
            .map(|n| n as u32)
            .or(Some(5)),
        error: None,
        auth_url: None,
        code_verifier: None,
        state: None,
        redirect_uri: None,
    })
}

/// Kiro Social Auth 状态存储（用于存储 PKCE 和 state）
static KIRO_SOCIAL_AUTH_STATE: once_cell::sync::Lazy<
    std::sync::Mutex<Option<(String, String, String)>>,
> = once_cell::sync::Lazy::new(|| std::sync::Mutex::new(None));

/// 生成 PKCE code_verifier 和 code_challenge
fn generate_pkce() -> (String, String) {
    use base64::Engine;
    use sha2::{Digest, Sha256};

    // 生成 32 字节随机数作为 code_verifier
    let mut verifier_bytes = [0u8; 32];
    getrandom::getrandom(&mut verifier_bytes).unwrap_or_else(|_| {
        // 降级方案：使用时间戳
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        verifier_bytes[..16].copy_from_slice(&now.to_le_bytes());
    });
    let code_verifier = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(verifier_bytes);

    // 计算 SHA256 哈希作为 code_challenge
    let mut hasher = Sha256::new();
    hasher.update(code_verifier.as_bytes());
    let hash = hasher.finalize();
    let code_challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hash);

    (code_verifier, code_challenge)
}

/// 生成随机 state 参数
fn generate_state() -> String {
    use base64::Engine;

    let mut state_bytes = [0u8; 16];
    getrandom::getrandom(&mut state_bytes).unwrap_or_else(|_| {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        state_bytes[..16].copy_from_slice(&now.to_le_bytes());
    });
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(state_bytes)
}

/// 请求 Kiro Social Auth (Google/GitHub)
///
/// 使用 Authorization Code Flow + PKCE
/// 返回 auth_url 供前端打开浏览器
async fn request_kiro_social_auth(provider: &str) -> Result<OAuthDeviceCodeResponse, String> {
    info!(
        "[request_kiro_social_auth] 开始 Kiro {} OAuth 流程",
        provider
    );

    // 生成 PKCE
    let (code_verifier, code_challenge) = generate_pkce();

    // 生成 state
    let state = generate_state();

    // 构建 redirect_uri (本地回调服务器)
    let redirect_uri = format!(
        "http://localhost:{}/oauth/callback",
        KIRO_SOCIAL_CALLBACK_PORT
    );

    // 保存状态供后续 token 交换使用
    {
        let mut auth_state = KIRO_SOCIAL_AUTH_STATE.lock().unwrap();
        *auth_state = Some((code_verifier.clone(), state.clone(), redirect_uri.clone()));
    }

    // 构建 Kiro AuthService 登录 URL
    // 格式: /login?idp=Google&redirect_uri=...&code_challenge=...&code_challenge_method=S256&state=...&prompt=select_account
    let auth_url = format!(
        "{}/login?idp={}&redirect_uri={}&code_challenge={}&code_challenge_method=S256&state={}&prompt=select_account",
        KIRO_AUTH_SERVICE_ENDPOINT,
        provider,
        urlencoding::encode(&redirect_uri),
        code_challenge,
        state
    );

    info!("[request_kiro_social_auth] 生成认证 URL: {}", auth_url);

    Ok(OAuthDeviceCodeResponse {
        success: true,
        device_code: None,
        user_code: None,
        verification_uri: None,
        expires_in: Some(600), // 10 分钟超时
        interval: None,
        error: None,
        auth_url: Some(auth_url),
        code_verifier: Some(code_verifier),
        state: Some(state),
        redirect_uri: Some(redirect_uri),
    })
}

/// OAuth Token 轮询请求参数
#[derive(Debug, Deserialize)]
pub struct OAuthPollTokenRequest {
    /// 提供商 ID
    pub provider_id: String,
    /// 设备码
    pub device_code: String,
}

/// OAuth Token 轮询响应
#[derive(Debug, Serialize)]
pub struct OAuthPollTokenResponse {
    /// 是否成功获取 token
    pub success: bool,
    /// 访问令牌
    pub access_token: Option<String>,
    /// 状态: "pending" | "slow_down" | "expired" | "error" | "success"
    pub status: String,
    /// 错误信息
    pub error: Option<String>,
    /// 新的轮询间隔（slow_down 时返回）
    pub new_interval: Option<u32>,
    /// Kiro Profile ARN（用于获取模型列表和配额）
    pub profile_arn: Option<String>,
    /// 刷新令牌
    pub refresh_token: Option<String>,
    /// Token 有效期（秒）v0.9.0
    pub expires_in: Option<u64>,
    /// v0.9.0: 认证方式 ("idc" | "aws")
    /// IDC 用户需要使用 Kiro IDE 风格 User-Agent
    /// Builder ID 用户使用 Amazon Q CLI 风格 User-Agent
    pub auth_method: Option<String>,
    /// v0.9.1: Kiro 客户端 ID（用于 token 刷新，需要持久化）
    pub kiro_client_id: Option<String>,
    /// v0.9.1: Kiro 客户端密钥（用于 token 刷新，需要持久化）
    pub kiro_client_secret: Option<String>,
    /// v0.9.1: Kiro SSO 区域（用于 token 刷新，需要持久化）
    pub kiro_sso_region: Option<String>,
    /// v0.9.1: Kiro IDC Start URL（IDC 认证时使用，需要持久化）
    pub kiro_start_url: Option<String>,
}

/// 轮询获取 OAuth Access Token
///
/// 用于 GitHub/Kiro Device Flow 的 token 轮询
///
/// # 参数
/// - `request`: 包含 provider_id 和 device_code
///
/// # 返回
/// - 成功: Access Token
/// - 待定: status = "pending"
/// - 失败: 错误信息
#[tauri::command]
async fn oauth_poll_token(
    request: OAuthPollTokenRequest,
) -> Result<OAuthPollTokenResponse, String> {
    debug!(
        "[oauth_poll_token] 轮询 Token, provider: {}",
        request.provider_id
    );

    match request.provider_id.as_str() {
        "github-copilot" => poll_github_token(&request.device_code).await,
        "kiro" => poll_kiro_token(&request.device_code).await,
        _ => Ok(OAuthPollTokenResponse {
            success: false,
            access_token: None,
            status: "error".to_string(),
            error: Some(format!("不支持的 OAuth 提供商: {}", request.provider_id)),
            new_interval: None,
            profile_arn: None,
            refresh_token: None,
            expires_in: None,
            auth_method: None,
            kiro_client_id: None,
            kiro_client_secret: None,
            kiro_sso_region: None,
            kiro_start_url: None,
        }),
    }
}

/// 轮询 GitHub Copilot Token
async fn poll_github_token(device_code: &str) -> Result<OAuthPollTokenResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let response = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header("User-Agent", "MobausStudio/1.0")
        .json(&serde_json::json!({
            "client_id": GITHUB_COPILOT_CLIENT_ID,
            "device_code": device_code,
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code"
        }))
        .send()
        .await
        .map_err(|e| {
            error!("[poll_github_token] 网络请求失败: {}", e);
            format!("网络请求失败: {}", e)
        })?;

    let status = response.status();

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!(
            "[poll_github_token] HTTP 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Ok(OAuthPollTokenResponse {
            success: false,
            access_token: None,
            status: "error".to_string(),
            error: Some(format!("HTTP 错误 ({})", status.as_u16())),
            new_interval: None,
            profile_arn: None,
            refresh_token: None,
            expires_in: None,
            auth_method: None,
            kiro_client_id: None,
            kiro_client_secret: None,
            kiro_sso_region: None,
            kiro_start_url: None,
        });
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    // 成功获取 token
    if let Some(token) = data["access_token"].as_str() {
        info!("[poll_github_token] Access Token 获取成功");
        return Ok(OAuthPollTokenResponse {
            success: true,
            access_token: Some(token.to_string()),
            status: "success".to_string(),
            error: None,
            new_interval: None,
            profile_arn: None,
            refresh_token: data["refresh_token"].as_str().map(|s| s.to_string()),
            expires_in: data["expires_in"].as_u64(),
            auth_method: None,
            kiro_client_id: None,
            kiro_client_secret: None,
            kiro_sso_region: None,
            kiro_start_url: None,
        });
    }

    // 检查错误状态
    parse_oauth_error(&data)
}

/// 轮询 Kiro (AWS Builder ID) Token
/// v0.9.1: 返回客户端注册信息用于持久化，解决重启后无法刷新 token 的问题
async fn poll_kiro_token(device_code: &str) -> Result<OAuthPollTokenResponse, String> {
    // 优先检查 IDC 注册信息（包含 region 和 start_url）
    // v0.9.1: 同时获取 start_url 用于持久化
    let (client_id, client_secret, region, start_url, is_idc) = {
        let idc_registration = KIRO_IDC_CLIENT_REGISTRATION.lock().unwrap();
        if let Some((id, secret, url, reg)) = idc_registration.as_ref() {
            info!("[poll_kiro_token] 使用 IDC 认证, region: {}", reg);
            (
                id.clone(),
                secret.clone(),
                reg.clone(),
                Some(url.clone()),
                true,
            )
        } else {
            drop(idc_registration); // 释放锁
                                    // 回退到普通的 Builder ID 注册
            let registration = KIRO_CLIENT_REGISTRATION.lock().unwrap();
            match registration.as_ref() {
                Some((id, secret)) => {
                    info!(
                        "[poll_kiro_token] 使用 Builder ID 认证, region: {}",
                        KIRO_SSO_REGION
                    );
                    (
                        id.clone(),
                        secret.clone(),
                        KIRO_SSO_REGION.to_string(),
                        None,
                        false,
                    )
                }
                None => {
                    return Ok(OAuthPollTokenResponse {
                        success: false,
                        access_token: None,
                        status: "error".to_string(),
                        error: Some("Kiro 客户端未注册，请重新开始授权".to_string()),
                        new_interval: None,
                        profile_arn: None,
                        refresh_token: None,
                        expires_in: None,
                        auth_method: None,
                        kiro_client_id: None,
                        kiro_client_secret: None,
                        kiro_sso_region: None,
                        kiro_start_url: None,
                    });
                }
            }
        }
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    // 使用正确的 region 构建 endpoint
    let sso_oidc_endpoint = format!("https://oidc.{}.amazonaws.com", region);
    debug!("[poll_kiro_token] 使用 endpoint: {}", sso_oidc_endpoint);

    let response = client
        .post(format!("{}/token", sso_oidc_endpoint))
        .header("Content-Type", "application/json")
        .header("User-Agent", KIRO_USER_AGENT)
        .json(&serde_json::json!({
            "clientId": client_id,
            "clientSecret": client_secret,
            "deviceCode": device_code,
            "grantType": "urn:ietf:params:oauth:grant-type:device_code"
        }))
        .send()
        .await
        .map_err(|e| {
            error!("[poll_kiro_token] 网络请求失败: {}", e);
            format!("网络请求失败: {}", e)
        })?;

    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();

    // AWS SSO OIDC 在授权待定时返回 400 状态码
    let data: serde_json::Value =
        serde_json::from_str(&response_text).map_err(|e| format!("解析响应失败: {}", e))?;

    // 成功获取 token
    if status.is_success() {
        if let Some(token) = data["accessToken"].as_str() {
            info!(
                "[poll_kiro_token] Access Token 获取成功, is_idc: {}",
                is_idc
            );

            // 尝试获取 Profile ARN（用于模型列表和配额查询）
            // IDC 用户可能需要 profileArn，Builder ID 用户通常不需要
            info!("[poll_kiro_token] 尝试获取 Profile ARN...");
            let profile_arn = fetch_kiro_profile_arn(token).await;
            match &profile_arn {
                Some(arn) => info!("[poll_kiro_token] Profile ARN 获取成功: {}", arn),
                None => info!("[poll_kiro_token] Profile ARN 未获取（Builder ID 用户无需此字段，IDC 用户可能需要检查权限）"),
            }

            // 获取 refresh token（如果有）
            let refresh_token = data["refreshToken"].as_str().map(|s| s.to_string());
            debug!(
                "[poll_kiro_token] Refresh Token: {:?}",
                refresh_token.is_some()
            );

            // v0.9.0: 获取 token 有效期（秒）
            let expires_in = data["expiresIn"].as_u64();
            debug!("[poll_kiro_token] Expires In: {:?} seconds", expires_in);

            return Ok(OAuthPollTokenResponse {
                success: true,
                access_token: Some(token.to_string()),
                status: "success".to_string(),
                error: None,
                new_interval: None,
                profile_arn,
                refresh_token,
                expires_in,
                auth_method: Some(if is_idc { "idc" } else { "aws" }.to_string()),
                // v0.9.1: 返回客户端注册信息用于持久化
                kiro_client_id: Some(client_id.clone()),
                kiro_client_secret: Some(client_secret.clone()),
                kiro_sso_region: Some(region.clone()),
                kiro_start_url: start_url.clone(),
            });
        }
    }

    // 检查 AWS SSO OIDC 错误状态
    if let Some(error) = data["error"].as_str() {
        match error {
            "authorization_pending" | "AuthorizationPendingException" => {
                debug!("[poll_kiro_token] 授权待定，继续轮询");
                return Ok(OAuthPollTokenResponse {
                    success: false,
                    access_token: None,
                    status: "pending".to_string(),
                    error: None,
                    new_interval: None,
                    profile_arn: None,
                    refresh_token: None,
                    expires_in: None,
                    auth_method: None,
                    kiro_client_id: None,
                    kiro_client_secret: None,
                    kiro_sso_region: None,
                    kiro_start_url: None,
                });
            }
            "slow_down" | "SlowDownException" => {
                info!("[poll_kiro_token] 收到 slow_down");
                return Ok(OAuthPollTokenResponse {
                    success: false,
                    access_token: None,
                    status: "slow_down".to_string(),
                    error: None,
                    new_interval: Some(10), // AWS 建议增加到 10 秒
                    profile_arn: None,
                    refresh_token: None,
                    expires_in: None,
                    auth_method: None,
                    kiro_client_id: None,
                    kiro_client_secret: None,
                    kiro_sso_region: None,
                    kiro_start_url: None,
                });
            }
            "expired_token" | "ExpiredTokenException" => {
                warn!("[poll_kiro_token] Device Code 已过期");
                return Ok(OAuthPollTokenResponse {
                    success: false,
                    access_token: None,
                    status: "expired".to_string(),
                    error: Some("授权码已过期，请重新开始".to_string()),
                    new_interval: None,
                    profile_arn: None,
                    refresh_token: None,
                    expires_in: None,
                    auth_method: None,
                    kiro_client_id: None,
                    kiro_client_secret: None,
                    kiro_sso_region: None,
                    kiro_start_url: None,
                });
            }
            "access_denied" | "AccessDeniedException" => {
                warn!("[poll_kiro_token] 用户拒绝授权");
                return Ok(OAuthPollTokenResponse {
                    success: false,
                    access_token: None,
                    status: "error".to_string(),
                    error: Some("用户拒绝授权".to_string()),
                    new_interval: None,
                    profile_arn: None,
                    refresh_token: None,
                    expires_in: None,
                    auth_method: None,
                    kiro_client_id: None,
                    kiro_client_secret: None,
                    kiro_sso_region: None,
                    kiro_start_url: None,
                });
            }
            _ => {
                let error_desc = data["error_description"]
                    .as_str()
                    .or(data["message"].as_str())
                    .unwrap_or(error);
                error!("[poll_kiro_token] OAuth 错误: {}", error_desc);
                return Ok(OAuthPollTokenResponse {
                    success: false,
                    access_token: None,
                    status: "error".to_string(),
                    error: Some(error_desc.to_string()),
                    new_interval: None,
                    profile_arn: None,
                    refresh_token: None,
                    expires_in: None,
                    auth_method: None,
                    kiro_client_id: None,
                    kiro_client_secret: None,
                    kiro_sso_region: None,
                    kiro_start_url: None,
                });
            }
        }
    }

    // 未知响应
    warn!("[poll_kiro_token] 未知响应: {:?}", data);
    Ok(OAuthPollTokenResponse {
        success: false,
        access_token: None,
        status: "error".to_string(),
        error: Some(format!("未知响应: {}", response_text)),
        new_interval: None,
        profile_arn: None,
        refresh_token: None,
        expires_in: None,
        auth_method: None,
        kiro_client_id: None,
        kiro_client_secret: None,
        kiro_sso_region: None,
        kiro_start_url: None,
    })
}

/// 获取 Kiro Profile ARN
///
/// 调用 CodeWhisperer API 获取用户的 Profile ARN
///
/// **重要说明**：
/// - AWS SSO OIDC (Builder ID/IDC) 用户**不需要** profileArn，获取失败是正常行为
/// - 只有 Kiro Desktop 社交登录（Google/GitHub）用户才需要 profileArn
/// - 对于 Builder ID 用户，API 调用时不应包含 profileArn 字段，否则会导致 403 错误
///
/// 尝试顺序：
/// 1. ListProfiles API（IDC 认证）
/// 2. ListAvailableCustomizations API（社交登录认证）
///
/// 返回 None 对于 Builder ID 用户是正常的，不应视为错误
async fn fetch_kiro_profile_arn(access_token: &str) -> Option<String> {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(_) => return None,
    };

    // 先尝试 ListProfiles API
    if let Some(arn) = try_list_profiles(&client, access_token).await {
        return Some(arn);
    }

    // Fallback: 尝试 ListAvailableCustomizations API
    if let Some(arn) = try_list_customizations(&client, access_token).await {
        return Some(arn);
    }

    // Builder ID/IDC 用户获取不到 profileArn 是正常行为，不需要警告
    debug!("[fetch_kiro_profile_arn] 未能获取 profileArn（Builder ID/IDC 用户无需此字段）");
    None
}

/// 尝试通过 ListProfiles API 获取 Profile ARN
async fn try_list_profiles(client: &reqwest::Client, access_token: &str) -> Option<String> {
    let payload = serde_json::json!({
        "origin": "AI_EDITOR"
    });

    let response = match client
        .post(KIRO_CODEWHISPERER_ENDPOINT)
        .header("Content-Type", "application/x-amz-json-1.0")
        .header("x-amz-target", "AmazonCodeWhispererService.ListProfiles")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Accept", "application/json")
        .json(&payload)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            debug!("[try_list_profiles] 请求失败: {}", e);
            return None;
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let error_body = response.text().await.unwrap_or_default();
        debug!(
            "[try_list_profiles] API 返回错误状态: {}, 响应: {}",
            status, error_body
        );
        return None;
    }

    let data: serde_json::Value = match response.json().await {
        Ok(d) => d,
        Err(e) => {
            debug!("[try_list_profiles] 解析响应失败: {}", e);
            return None;
        }
    };

    debug!("[try_list_profiles] 响应: {:?}", data);

    // 尝试从 profileArn 字段获取
    if let Some(arn) = data["profileArn"].as_str() {
        if !arn.is_empty() {
            info!("[try_list_profiles] 获取到 profileArn: {}", arn);
            return Some(arn.to_string());
        }
    }

    // 尝试从 profiles 数组获取
    if let Some(profiles) = data["profiles"].as_array() {
        if let Some(first) = profiles.first() {
            if let Some(arn) = first["arn"].as_str() {
                info!("[try_list_profiles] 从 profiles 获取到 ARN: {}", arn);
                return Some(arn.to_string());
            }
        }
    }

    None
}

/// 尝试通过 ListAvailableCustomizations API 获取 Profile ARN
/// 这是 AWS Builder ID 认证的 fallback 方法
async fn try_list_customizations(client: &reqwest::Client, access_token: &str) -> Option<String> {
    let payload = serde_json::json!({
        "origin": "AI_EDITOR"
    });

    let response = match client
        .post(KIRO_CODEWHISPERER_ENDPOINT)
        .header("Content-Type", "application/x-amz-json-1.0")
        .header(
            "x-amz-target",
            "AmazonCodeWhispererService.ListAvailableCustomizations",
        )
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Accept", "application/json")
        .json(&payload)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            debug!("[try_list_customizations] 请求失败: {}", e);
            return None;
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let error_body = response.text().await.unwrap_or_default();
        debug!(
            "[try_list_customizations] API 返回错误状态: {}, 响应: {}",
            status, error_body
        );
        return None;
    }

    let data: serde_json::Value = match response.json().await {
        Ok(d) => d,
        Err(e) => {
            debug!("[try_list_customizations] 解析响应失败: {}", e);
            return None;
        }
    };

    debug!("[try_list_customizations] 响应: {:?}", data);

    // 尝试从 profileArn 字段获取
    if let Some(arn) = data["profileArn"].as_str() {
        if !arn.is_empty() {
            info!("[try_list_customizations] 获取到 profileArn: {}", arn);
            return Some(arn.to_string());
        }
    }

    // 尝试从 customizations 数组获取
    if let Some(customizations) = data["customizations"].as_array() {
        if let Some(first) = customizations.first() {
            if let Some(arn) = first["arn"].as_str() {
                info!(
                    "[try_list_customizations] 从 customizations 获取到 ARN: {}",
                    arn
                );
                return Some(arn.to_string());
            }
        }
    }

    None
}

/// 解析 OAuth 错误响应（GitHub 格式）
fn parse_oauth_error(data: &serde_json::Value) -> Result<OAuthPollTokenResponse, String> {
    if let Some(error) = data["error"].as_str() {
        match error {
            "authorization_pending" => {
                debug!("[oauth_poll_token] 授权待定，继续轮询");
                return Ok(OAuthPollTokenResponse {
                    success: false,
                    access_token: None,
                    status: "pending".to_string(),
                    error: None,
                    new_interval: None,
                    profile_arn: None,
                    refresh_token: None,
                    expires_in: None,
                    auth_method: None,
                    kiro_client_id: None,
                    kiro_client_secret: None,
                    kiro_sso_region: None,
                    kiro_start_url: None,
                });
            }
            "slow_down" => {
                let new_interval = data["interval"].as_u64().map(|n| n as u32);
                info!(
                    "[oauth_poll_token] 收到 slow_down, new_interval: {:?}",
                    new_interval
                );
                return Ok(OAuthPollTokenResponse {
                    success: false,
                    access_token: None,
                    status: "slow_down".to_string(),
                    error: None,
                    new_interval,
                    profile_arn: None,
                    refresh_token: None,
                    expires_in: None,
                    auth_method: None,
                    kiro_client_id: None,
                    kiro_client_secret: None,
                    kiro_sso_region: None,
                    kiro_start_url: None,
                });
            }
            "expired_token" => {
                warn!("[oauth_poll_token] Device Code 已过期");
                return Ok(OAuthPollTokenResponse {
                    success: false,
                    access_token: None,
                    status: "expired".to_string(),
                    error: Some("授权码已过期，请重新开始".to_string()),
                    new_interval: None,
                    profile_arn: None,
                    refresh_token: None,
                    expires_in: None,
                    auth_method: None,
                    kiro_client_id: None,
                    kiro_client_secret: None,
                    kiro_sso_region: None,
                    kiro_start_url: None,
                });
            }
            "access_denied" => {
                warn!("[oauth_poll_token] 用户拒绝授权");
                return Ok(OAuthPollTokenResponse {
                    success: false,
                    access_token: None,
                    status: "error".to_string(),
                    error: Some("用户拒绝授权".to_string()),
                    new_interval: None,
                    profile_arn: None,
                    refresh_token: None,
                    expires_in: None,
                    auth_method: None,
                    kiro_client_id: None,
                    kiro_client_secret: None,
                    kiro_sso_region: None,
                    kiro_start_url: None,
                });
            }
            _ => {
                let error_desc = data["error_description"].as_str().unwrap_or(error);
                error!("[oauth_poll_token] OAuth 错误: {}", error_desc);
                return Ok(OAuthPollTokenResponse {
                    success: false,
                    access_token: None,
                    status: "error".to_string(),
                    error: Some(error_desc.to_string()),
                    new_interval: None,
                    profile_arn: None,
                    refresh_token: None,
                    expires_in: None,
                    auth_method: None,
                    kiro_client_id: None,
                    kiro_client_secret: None,
                    kiro_sso_region: None,
                    kiro_start_url: None,
                });
            }
        }
    }

    // 未知响应
    warn!("[oauth_poll_token] 未知响应: {:?}", data);
    Ok(OAuthPollTokenResponse {
        success: false,
        access_token: None,
        status: "error".to_string(),
        error: Some("未知响应".to_string()),
        new_interval: None,
        profile_arn: None,
        refresh_token: None,
        expires_in: None,
        auth_method: None,
        kiro_client_id: None,
        kiro_client_secret: None,
        kiro_sso_region: None,
        kiro_start_url: None,
    })
}

// ==================== Anthropic OAuth 模块 (v3.2.0) ====================

/// Anthropic Token 交换响应
#[derive(Debug, Serialize, Deserialize)]
pub struct AnthropicTokenResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
}

/// 交换 Anthropic OAuth 授权码获取 Token
///
/// 使用 PKCE 流程交换授权码
///
/// # 参数
/// - `code`: 授权码
/// - `state`: 状态（用于验证）
/// - `verifier`: PKCE 验证器
/// - `client_id`: OAuth 客户端 ID
/// - `redirect_uri`: 重定向 URI
///
/// # 返回
/// - 成功: Token 信息
/// - 失败: 错误信息
#[tauri::command]
async fn anthropic_exchange_token(
    code: String,
    state: String,
    verifier: String,
    client_id: String,
    redirect_uri: String,
) -> Result<AnthropicTokenResponse, String> {
    info!("[anthropic_exchange_token] 开始交换 Anthropic OAuth Token");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let response = client
        .post("https://console.anthropic.com/v1/oauth/token")
        .header("Content-Type", "application/json")
        .header("User-Agent", "MobausStudio/1.0")
        .json(&serde_json::json!({
            "code": code,
            "state": state,
            "grant_type": "authorization_code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "code_verifier": verifier
        }))
        .send()
        .await
        .map_err(|e| {
            error!("[anthropic_exchange_token] 网络请求失败: {}", e);
            format!("网络请求失败: {}", e)
        })?;

    let status = response.status();
    debug!("[anthropic_exchange_token] 响应状态码: {}", status.as_u16());

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!(
            "[anthropic_exchange_token] API 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Err(format!(
            "Anthropic OAuth 错误 ({}): {}",
            status.as_u16(),
            error_text
        ));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    // v3.4.2: 添加调试日志，查看 token 格式
    let access_token = data["access_token"].as_str().unwrap_or("");
    info!("[anthropic_exchange_token] Token 交换成功");
    info!(
        "[anthropic_exchange_token] Access Token 前缀: {}...",
        &access_token[..std::cmp::min(20, access_token.len())]
    );
    info!(
        "[anthropic_exchange_token] 是否包含 sk-ant-oat: {}",
        access_token.contains("sk-ant-oat")
    );

    Ok(AnthropicTokenResponse {
        access_token: access_token.to_string(),
        refresh_token: data["refresh_token"].as_str().unwrap_or("").to_string(),
        expires_in: data["expires_in"].as_u64().unwrap_or(3600),
    })
}

/// 刷新 Anthropic OAuth Token
///
/// # 参数
/// - `refresh_token`: 刷新令牌
/// - `client_id`: OAuth 客户端 ID
///
/// # 返回
/// - 成功: 新的 Token 信息
/// - 失败: 错误信息
#[tauri::command]
async fn anthropic_refresh_token(
    refresh_token: String,
    client_id: String,
) -> Result<AnthropicTokenResponse, String> {
    info!("[anthropic_refresh_token] 开始刷新 Anthropic OAuth Token");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let response = client
        .post("https://api.anthropic.com/v1/oauth/token")
        .header("Content-Type", "application/json")
        .header("User-Agent", "MobausStudio/1.0")
        .json(&serde_json::json!({
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id
        }))
        .send()
        .await
        .map_err(|e| {
            error!("[anthropic_refresh_token] 网络请求失败: {}", e);
            format!("网络请求失败: {}", e)
        })?;

    let status = response.status();
    debug!("[anthropic_refresh_token] 响应状态码: {}", status.as_u16());

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!(
            "[anthropic_refresh_token] API 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Err(format!(
            "Token 刷新失败: {}",
            error_text
        ));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    info!("[anthropic_refresh_token] Token 刷新成功");

    Ok(AnthropicTokenResponse {
        access_token: data["access_token"].as_str().unwrap_or("").to_string(),
        refresh_token: data["refresh_token"].as_str().unwrap_or("").to_string(),
        expires_in: data["expires_in"].as_u64().unwrap_or(3600),
    })
}

/// Anthropic API Key 创建响应
#[derive(Debug, Serialize, Deserialize)]
pub struct AnthropicApiKeyResponse {
    pub raw_key: String,
}

/// 使用 OAuth Token 创建 Anthropic API Key
///
/// 通过 OAuth 授权后自动创建 API Key
///
/// # 参数
/// - `access_token`: OAuth 访问令牌
///
/// # 返回
/// - 成功: API Key
/// - 失败: 错误信息
#[tauri::command]
async fn anthropic_create_api_key(access_token: String) -> Result<AnthropicApiKeyResponse, String> {
    info!("[anthropic_create_api_key] 开始创建 Anthropic API Key");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let response = client
        .post("https://api.anthropic.com/api/oauth/claude_cli/create_api_key")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "MobausStudio/1.0")
        .send()
        .await
        .map_err(|e| {
            error!("[anthropic_create_api_key] 网络请求失败: {}", e);
            format!("网络请求失败: {}", e)
        })?;

    let status = response.status();
    debug!("[anthropic_create_api_key] 响应状态码: {}", status.as_u16());

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!(
            "[anthropic_create_api_key] API 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Err(format!(
            "创建 API Key 失败 ({}): {}",
            status.as_u16(),
            error_text
        ));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    info!("[anthropic_create_api_key] API Key 创建成功");

    Ok(AnthropicApiKeyResponse {
        raw_key: data["raw_key"].as_str().unwrap_or("").to_string(),
    })
}

// ==================== OpenAI OAuth 模块 (v3.2.0) ====================

/// OpenAI Device Code 响应
#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIDeviceCodeResponse {
    pub device_auth_id: String,
    pub user_code: String,
    pub verification_uri: String,
    pub interval: u64,
    pub expires_in: u64,
}

/// 请求 OpenAI Device Code
///
/// 使用 Device Flow 开始 OAuth 认证
///
/// # 参数
/// - `client_id`: OAuth 客户端 ID
/// - `issuer`: OAuth 服务器地址
///
/// # 返回
/// - 成功: Device Code 信息
/// - 失败: 错误信息
#[tauri::command]
async fn openai_request_device_code(
    client_id: String,
    issuer: String,
) -> Result<OpenAIDeviceCodeResponse, String> {
    info!("[openai_request_device_code] 开始请求 OpenAI Device Code");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let response = client
        .post(format!("{}/api/accounts/deviceauth/usercode", issuer))
        .header("Content-Type", "application/json")
        .header("User-Agent", "MobausStudio/1.0")
        .json(&serde_json::json!({
            "client_id": client_id
        }))
        .send()
        .await
        .map_err(|e| {
            error!("[openai_request_device_code] 网络请求失败: {}", e);
            format!("网络请求失败: {}", e)
        })?;

    let status = response.status();
    debug!(
        "[openai_request_device_code] 响应状态码: {}",
        status.as_u16()
    );

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!(
            "[openai_request_device_code] API 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Err(format!(
            "OpenAI Device Code 请求失败 ({}): {}",
            status.as_u16(),
            error_text
        ));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    info!("[openai_request_device_code] Device Code 请求成功");

    Ok(OpenAIDeviceCodeResponse {
        device_auth_id: data["device_auth_id"].as_str().unwrap_or("").to_string(),
        user_code: data["user_code"].as_str().unwrap_or("").to_string(),
        verification_uri: format!("{}/codex/device", issuer),
        interval: data["interval"]
            .as_str()
            .and_then(|s| s.parse().ok())
            .unwrap_or(5),
        expires_in: data["expires_in"].as_u64().unwrap_or(900),
    })
}

/// OpenAI Token 轮询响应
#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIPollTokenResponse {
    pub success: bool,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub id_token: Option<String>,
    pub expires_in: Option<u64>,
    pub account_id: Option<String>,
    pub status: String,
    pub error: Option<String>,
}

/// 轮询 OpenAI Token
///
/// 检查用户是否已完成授权
///
/// # 参数
/// - `device_auth_id`: 设备授权 ID
/// - `user_code`: 用户码
/// - `client_id`: OAuth 客户端 ID
/// - `issuer`: OAuth 服务器地址
///
/// # 返回
/// - 成功: Token 信息
/// - 等待中: status = "pending"
/// - 失败: 错误信息
#[tauri::command]
async fn openai_poll_token(
    device_auth_id: String,
    user_code: String,
    client_id: String,
    issuer: String,
) -> Result<OpenAIPollTokenResponse, String> {
    debug!("[openai_poll_token] 轮询 OpenAI Token");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    // 第一步：检查授权状态
    let response = client
        .post(format!("{}/api/accounts/deviceauth/token", issuer))
        .header("Content-Type", "application/json")
        .header("User-Agent", "MobausStudio/1.0")
        .json(&serde_json::json!({
            "device_auth_id": device_auth_id,
            "user_code": user_code
        }))
        .send()
        .await
        .map_err(|e| {
            error!("[openai_poll_token] 网络请求失败: {}", e);
            format!("网络请求失败: {}", e)
        })?;

    let status = response.status();

    // 403 或 404 表示用户尚未授权
    if status.as_u16() == 403 || status.as_u16() == 404 {
        return Ok(OpenAIPollTokenResponse {
            success: false,
            access_token: None,
            refresh_token: None,
            id_token: None,
            expires_in: None,
            account_id: None,
            status: "pending".to_string(),
            error: None,
        });
    }

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!(
            "[openai_poll_token] API 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Ok(OpenAIPollTokenResponse {
            success: false,
            access_token: None,
            refresh_token: None,
            id_token: None,
            expires_in: None,
            account_id: None,
            status: "error".to_string(),
            error: Some(error_text),
        });
    }

    // 用户已授权，获取授权码
    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    let authorization_code = data["authorization_code"].as_str().unwrap_or("");
    let code_verifier = data["code_verifier"].as_str().unwrap_or("");

    if authorization_code.is_empty() {
        return Ok(OpenAIPollTokenResponse {
            success: false,
            access_token: None,
            refresh_token: None,
            id_token: None,
            expires_in: None,
            account_id: None,
            status: "error".to_string(),
            error: Some("未获取到授权码".to_string()),
        });
    }

    // 第二步：交换授权码获取 Token
    let token_response = client
        .post(format!("{}/oauth/token", issuer))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("User-Agent", "MobausStudio/1.0")
        .body(format!(
            "grant_type=authorization_code&code={}&redirect_uri={}/deviceauth/callback&client_id={}&code_verifier={}",
            authorization_code, issuer, client_id, code_verifier
        ))
        .send()
        .await
        .map_err(|e| {
            error!("[openai_poll_token] Token 交换请求失败: {}", e);
            format!("Token 交换请求失败: {}", e)
        })?;

    let token_status = token_response.status();
    if !token_status.is_success() {
        let error_text = token_response.text().await.unwrap_or_default();
        error!(
            "[openai_poll_token] Token 交换失败: {} - {}",
            token_status.as_u16(),
            error_text
        );
        return Ok(OpenAIPollTokenResponse {
            success: false,
            access_token: None,
            refresh_token: None,
            id_token: None,
            expires_in: None,
            account_id: None,
            status: "error".to_string(),
            error: Some(format!("Token 交换失败: {}", error_text)),
        });
    }

    let token_data: serde_json::Value = token_response
        .json()
        .await
        .map_err(|e| format!("解析 Token 响应失败: {}", e))?;

    info!("[openai_poll_token] Token 获取成功");

    // 从 id_token 或 access_token 中提取 account_id
    let account_id = extract_openai_account_id(&token_data);

    Ok(OpenAIPollTokenResponse {
        success: true,
        access_token: token_data["access_token"].as_str().map(|s| s.to_string()),
        refresh_token: token_data["refresh_token"].as_str().map(|s| s.to_string()),
        id_token: token_data["id_token"].as_str().map(|s| s.to_string()),
        expires_in: token_data["expires_in"].as_u64(),
        account_id,
        status: "success".to_string(),
        error: None,
    })
}

/// 从 JWT Token 中提取 OpenAI Account ID
fn extract_openai_account_id(token_data: &serde_json::Value) -> Option<String> {
    // 尝试从 id_token 提取
    if let Some(id_token) = token_data["id_token"].as_str() {
        if let Some(account_id) = parse_jwt_account_id(id_token) {
            return Some(account_id);
        }
    }
    // 尝试从 access_token 提取
    if let Some(access_token) = token_data["access_token"].as_str() {
        if let Some(account_id) = parse_jwt_account_id(access_token) {
            return Some(account_id);
        }
    }
    None
}

/// 解析 JWT 获取 account_id
fn parse_jwt_account_id(token: &str) -> Option<String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return None;
    }

    // Base64 解码 payload
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    let payload = URL_SAFE_NO_PAD.decode(parts[1]).ok()?;
    let claims: serde_json::Value = serde_json::from_slice(&payload).ok()?;

    // 尝试多种字段
    if let Some(id) = claims["chatgpt_account_id"].as_str() {
        return Some(id.to_string());
    }
    if let Some(auth) = claims["https://api.openai.com/auth"].as_object() {
        if let Some(id) = auth.get("chatgpt_account_id").and_then(|v| v.as_str()) {
            return Some(id.to_string());
        }
    }
    if let Some(orgs) = claims["organizations"].as_array() {
        if let Some(first) = orgs.first() {
            if let Some(id) = first["id"].as_str() {
                return Some(id.to_string());
            }
        }
    }

    None
}

/// 刷新 OpenAI Token
///
/// # 参数
/// - `refresh_token`: 刷新令牌
/// - `client_id`: OAuth 客户端 ID
/// - `issuer`: OAuth 服务器地址
///
/// # 返回
/// - 成功: 新的 Token 信息
/// - 失败: 错误信息
#[tauri::command]
async fn openai_refresh_token(
    refresh_token: String,
    client_id: String,
    issuer: String,
) -> Result<OpenAIPollTokenResponse, String> {
    info!("[openai_refresh_token] 开始刷新 OpenAI Token");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let response = client
        .post(format!("{}/oauth/token", issuer))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("User-Agent", "MobausStudio/1.0")
        .body(format!(
            "grant_type=refresh_token&refresh_token={}&client_id={}",
            refresh_token, client_id
        ))
        .send()
        .await
        .map_err(|e| {
            error!("[openai_refresh_token] 网络请求失败: {}", e);
            format!("网络请求失败: {}", e)
        })?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!(
            "[openai_refresh_token] API 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Err(format!(
            "Token 刷新失败 ({}): {}",
            status.as_u16(),
            error_text
        ));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    info!("[openai_refresh_token] Token 刷新成功");

    Ok(OpenAIPollTokenResponse {
        success: true,
        access_token: data["access_token"].as_str().map(|s| s.to_string()),
        refresh_token: data["refresh_token"].as_str().map(|s| s.to_string()),
        id_token: data["id_token"].as_str().map(|s| s.to_string()),
        expires_in: data["expires_in"].as_u64(),
        account_id: extract_openai_account_id(&data),
        status: "success".to_string(),
        error: None,
    })
}

// ==================== OpenAI OAuth v2 模块 (v3.4.0) ====================
// 使用标准 Authorization Code Flow + PKCE，参考 CLIProxyAPIPlus codex/openai_auth.go

/// OpenAI Token 交换响应 (v2)
#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIExchangeTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub id_token: Option<String>,
    pub expires_in: u64,
    pub account_id: Option<String>,
    pub email: Option<String>,
}

/// 交换 OpenAI OAuth 授权码获取 Token (v2)
///
/// 使用标准 Authorization Code Flow + PKCE
/// 参考 CLIProxyAPIPlus codex/openai_auth.go ExchangeCodeForTokens
///
/// # 参数
/// - `code`: 授权码
/// - `verifier`: PKCE 验证器
/// - `client_id`: OAuth 客户端 ID
/// - `redirect_uri`: 重定向 URI
///
/// # 返回
/// - 成功: Token 信息
/// - 失败: 错误信息
#[tauri::command]
async fn openai_exchange_code(
    code: String,
    verifier: String,
    client_id: String,
    redirect_uri: String,
) -> Result<OpenAIExchangeTokenResponse, String> {
    info!("[openai_exchange_code] 开始交换 OpenAI OAuth Token (v2)");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    // 使用 form-urlencoded 格式，参考 CLIProxyAPIPlus
    let response = client
        .post("https://auth.openai.com/oauth/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Accept", "application/json")
        .header("User-Agent", "MobausStudio/1.0")
        .body(format!(
            "grant_type=authorization_code&code={}&redirect_uri={}&client_id={}&code_verifier={}",
            urlencoding::encode(&code),
            urlencoding::encode(&redirect_uri),
            urlencoding::encode(&client_id),
            urlencoding::encode(&verifier)
        ))
        .send()
        .await
        .map_err(|e| {
            error!("[openai_exchange_code] 网络请求失败: {}", e);
            format!("网络请求失败: {}", e)
        })?;

    let status = response.status();
    debug!("[openai_exchange_code] 响应状态码: {}", status.as_u16());

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!(
            "[openai_exchange_code] API 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Err(format!(
            "Token 交换失败 ({}): {}",
            status.as_u16(),
            error_text
        ));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    info!("[openai_exchange_code] Token 交换成功");

    // 从 id_token 提取用户信息
    let (account_id, email) = extract_openai_user_info(&data);

    Ok(OpenAIExchangeTokenResponse {
        access_token: data["access_token"].as_str().unwrap_or("").to_string(),
        refresh_token: data["refresh_token"].as_str().map(|s| s.to_string()),
        id_token: data["id_token"].as_str().map(|s| s.to_string()),
        expires_in: data["expires_in"].as_u64().unwrap_or(3600),
        account_id,
        email,
    })
}

/// 从 OpenAI Token 响应中提取用户信息
fn extract_openai_user_info(token_data: &serde_json::Value) -> (Option<String>, Option<String>) {
    if let Some(id_token) = token_data["id_token"].as_str() {
        if let Some((account_id, email)) = parse_jwt_user_info(id_token) {
            return (account_id, email);
        }
    }
    (extract_openai_account_id(token_data), None)
}

/// 解析 JWT 获取用户信息
fn parse_jwt_user_info(token: &str) -> Option<(Option<String>, Option<String>)> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return None;
    }

    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    let payload = URL_SAFE_NO_PAD.decode(parts[1]).ok()?;
    let claims: serde_json::Value = serde_json::from_slice(&payload).ok()?;

    let mut account_id = None;
    let mut email = None;

    // 提取 email
    if let Some(e) = claims["email"].as_str() {
        email = Some(e.to_string());
    }

    // 提取 account_id
    if let Some(id) = claims["chatgpt_account_id"].as_str() {
        account_id = Some(id.to_string());
    } else if let Some(auth) = claims["https://api.openai.com/auth"].as_object() {
        if let Some(id) = auth.get("chatgpt_account_id").and_then(|v| v.as_str()) {
            account_id = Some(id.to_string());
        }
    } else if let Some(orgs) = claims["organizations"].as_array() {
        if let Some(first) = orgs.first() {
            if let Some(id) = first["id"].as_str() {
                account_id = Some(id.to_string());
            }
        }
    }

    Some((account_id, email))
}

/// 刷新 OpenAI Token (v2)
///
/// # 参数
/// - `refresh_token`: 刷新令牌
/// - `client_id`: OAuth 客户端 ID
///
/// # 返回
/// - 成功: 新的 Token 信息
/// - 失败: 错误信息
#[tauri::command]
async fn openai_refresh_token_v2(
    refresh_token: String,
    client_id: String,
) -> Result<OpenAIExchangeTokenResponse, String> {
    info!("[openai_refresh_token_v2] 开始刷新 OpenAI Token");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let response = client
        .post("https://auth.openai.com/oauth/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Accept", "application/json")
        .header("User-Agent", "MobausStudio/1.0")
        .body(format!(
            "grant_type=refresh_token&refresh_token={}&client_id={}&scope=openid%20profile%20email",
            urlencoding::encode(&refresh_token),
            urlencoding::encode(&client_id)
        ))
        .send()
        .await
        .map_err(|e| {
            error!("[openai_refresh_token_v2] 网络请求失败: {}", e);
            format!("网络请求失败: {}", e)
        })?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!(
            "[openai_refresh_token_v2] API 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Err(format!(
            "Token 刷新失败: {}",
            error_text
        ));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    info!("[openai_refresh_token_v2] Token 刷新成功");

    let (account_id, email) = extract_openai_user_info(&data);

    Ok(OpenAIExchangeTokenResponse {
        access_token: data["access_token"].as_str().unwrap_or("").to_string(),
        refresh_token: data["refresh_token"].as_str().map(|s| s.to_string()),
        id_token: data["id_token"].as_str().map(|s| s.to_string()),
        expires_in: data["expires_in"].as_u64().unwrap_or(3600),
        account_id,
        email,
    })
}

/// OpenAI OAuth 回调服务器响应
#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIOAuthCallbackResponse {
    pub success: bool,
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

/// 启动 OpenAI OAuth 回调服务器
///
/// 启动本地 HTTP 服务器等待 OAuth 回调
/// 参考 CLIProxyAPIPlus codex/oauth_server.go
///
/// # 参数
/// - `port`: 监听端口
/// - `timeout`: 超时时间（秒）
///
/// # 返回
/// - 成功: 授权码和 state
/// - 失败: 错误信息
#[tauri::command]
async fn openai_start_oauth_callback_server(
    port: u16,
    timeout: u64,
) -> Result<OpenAIOAuthCallbackResponse, String> {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::time::{Duration, Instant};

    info!(
        "[openai_oauth_callback] 启动 OAuth 回调服务器，端口: {}",
        port
    );

    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))
        .map_err(|e| format!("无法绑定端口 {}: {}", port, e))?;

    listener
        .set_nonblocking(true)
        .map_err(|e| format!("设置非阻塞模式失败: {}", e))?;

    let start = Instant::now();
    let timeout_duration = Duration::from_secs(timeout);

    loop {
        if start.elapsed() > timeout_duration {
            return Ok(OpenAIOAuthCallbackResponse {
                success: false,
                code: None,
                state: None,
                error: Some("等待授权超时".to_string()),
            });
        }

        match listener.accept() {
            Ok((mut stream, _)) => {
                let mut buffer = [0; 4096];
                stream.set_read_timeout(Some(Duration::from_secs(5))).ok();

                if let Ok(size) = stream.read(&mut buffer) {
                    let request = String::from_utf8_lossy(&buffer[..size]);

                    // 支持多种回调路径
                    if request.starts_with("GET /auth/callback")
                        || request.starts_with("GET /callback")
                    {
                        let query_start = request.find('?').unwrap_or(0);
                        let query_end = request.find(" HTTP").unwrap_or(request.len());
                        let query = &request[query_start + 1..query_end];

                        let mut code = None;
                        let mut state = None;
                        let mut error = None;

                        for param in query.split('&') {
                            let parts: Vec<&str> = param.splitn(2, '=').collect();
                            if parts.len() == 2 {
                                match parts[0] {
                                    "code" => {
                                        code = Some(
                                            urlencoding::decode(parts[1])
                                                .unwrap_or_default()
                                                .to_string(),
                                        )
                                    }
                                    "state" => {
                                        state = Some(
                                            urlencoding::decode(parts[1])
                                                .unwrap_or_default()
                                                .to_string(),
                                        )
                                    }
                                    "error" => {
                                        error = Some(
                                            urlencoding::decode(parts[1])
                                                .unwrap_or_default()
                                                .to_string(),
                                        )
                                    }
                                    _ => {}
                                }
                            }
                        }

                        let html = if code.is_some() {
                            r#"<!DOCTYPE html><html><head><meta charset="utf-8"><title>授权成功</title></head>
                            <body style="font-family: system-ui; text-align: center; padding: 50px;">
                            <h1 style="color: #22c55e;">✓ OpenAI 授权成功</h1>
                            <p>您可以关闭此窗口并返回 MobausStudio</p>
                            </body></html>"#
                        } else {
                            r#"<!DOCTYPE html><html><head><meta charset="utf-8"><title>授权失败</title></head>
                            <body style="font-family: system-ui; text-align: center; padding: 50px;">
                            <h1 style="color: #ef4444;">✗ 授权失败</h1>
                            <p>请关闭此窗口并重试</p>
                            </body></html>"#
                        };

                        let response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            html.len(),
                            html
                        );

                        stream.write_all(response.as_bytes()).ok();
                        stream.flush().ok();

                        if let Some(err) = error {
                            return Ok(OpenAIOAuthCallbackResponse {
                                success: false,
                                code: None,
                                state: None,
                                error: Some(err),
                            });
                        }

                        if code.is_some() {
                            info!("[openai_oauth_callback] 收到授权码");
                            return Ok(OpenAIOAuthCallbackResponse {
                                success: true,
                                code,
                                state,
                                error: None,
                            });
                        }
                    }
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => {
                error!("[openai_oauth_callback] 接受连接失败: {}", e);
            }
        }
    }
}

/// 停止 OpenAI OAuth 回调服务器
#[tauri::command]
async fn openai_stop_oauth_callback_server() -> Result<(), String> {
    info!("[openai_oauth_callback] 停止 OAuth 回调服务器");
    Ok(())
}

// ==================== Anthropic OAuth v2 模块 (v3.4.0) ====================
// 使用本地回调服务器，参考 CLIProxyAPIPlus claude/anthropic_auth.go

/// Anthropic OAuth 回调服务器响应
#[derive(Debug, Serialize, Deserialize)]
pub struct AnthropicOAuthCallbackResponse {
    pub success: bool,
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

/// 启动 Anthropic OAuth 回调服务器
///
/// 启动本地 HTTP 服务器等待 OAuth 回调
/// 参考 CLIProxyAPIPlus claude/oauth_server.go
///
/// # 参数
/// - `port`: 监听端口
/// - `timeout`: 超时时间（秒）
///
/// # 返回
/// - 成功: 授权码和 state
/// - 失败: 错误信息
#[tauri::command]
async fn anthropic_start_oauth_callback_server(
    port: u16,
    timeout: u64,
) -> Result<AnthropicOAuthCallbackResponse, String> {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::time::{Duration, Instant};

    info!(
        "[anthropic_oauth_callback] 启动 OAuth 回调服务器，端口: {}",
        port
    );

    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))
        .map_err(|e| format!("无法绑定端口 {}: {}", port, e))?;

    listener
        .set_nonblocking(true)
        .map_err(|e| format!("设置非阻塞模式失败: {}", e))?;

    let start = Instant::now();
    let timeout_duration = Duration::from_secs(timeout);

    loop {
        if start.elapsed() > timeout_duration {
            return Ok(AnthropicOAuthCallbackResponse {
                success: false,
                code: None,
                state: None,
                error: Some("等待授权超时".to_string()),
            });
        }

        match listener.accept() {
            Ok((mut stream, _)) => {
                let mut buffer = [0; 4096];
                stream.set_read_timeout(Some(Duration::from_secs(5))).ok();

                if let Ok(size) = stream.read(&mut buffer) {
                    let request = String::from_utf8_lossy(&buffer[..size]);

                    // 支持回调路径
                    if request.starts_with("GET /callback") {
                        let query_start = request.find('?').unwrap_or(0);
                        let query_end = request.find(" HTTP").unwrap_or(request.len());
                        let query = &request[query_start + 1..query_end];

                        let mut code = None;
                        let mut state = None;
                        let mut error = None;

                        for param in query.split('&') {
                            let parts: Vec<&str> = param.splitn(2, '=').collect();
                            if parts.len() == 2 {
                                match parts[0] {
                                    "code" => {
                                        code = Some(
                                            urlencoding::decode(parts[1])
                                                .unwrap_or_default()
                                                .to_string(),
                                        )
                                    }
                                    "state" => {
                                        state = Some(
                                            urlencoding::decode(parts[1])
                                                .unwrap_or_default()
                                                .to_string(),
                                        )
                                    }
                                    "error" => {
                                        error = Some(
                                            urlencoding::decode(parts[1])
                                                .unwrap_or_default()
                                                .to_string(),
                                        )
                                    }
                                    _ => {}
                                }
                            }
                        }

                        let html = if code.is_some() {
                            r#"<!DOCTYPE html><html><head><meta charset="utf-8"><title>授权成功</title></head>
                            <body style="font-family: system-ui; text-align: center; padding: 50px;">
                            <h1 style="color: #22c55e;">✓ Anthropic 授权成功</h1>
                            <p>您可以关闭此窗口并返回 MobausStudio</p>
                            </body></html>"#
                        } else {
                            r#"<!DOCTYPE html><html><head><meta charset="utf-8"><title>授权失败</title></head>
                            <body style="font-family: system-ui; text-align: center; padding: 50px;">
                            <h1 style="color: #ef4444;">✗ 授权失败</h1>
                            <p>请关闭此窗口并重试</p>
                            </body></html>"#
                        };

                        let response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            html.len(),
                            html
                        );

                        stream.write_all(response.as_bytes()).ok();
                        stream.flush().ok();

                        if let Some(err) = error {
                            return Ok(AnthropicOAuthCallbackResponse {
                                success: false,
                                code: None,
                                state: None,
                                error: Some(err),
                            });
                        }

                        if code.is_some() {
                            info!("[anthropic_oauth_callback] 收到授权码");
                            return Ok(AnthropicOAuthCallbackResponse {
                                success: true,
                                code,
                                state,
                                error: None,
                            });
                        }
                    }
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => {
                error!("[anthropic_oauth_callback] 接受连接失败: {}", e);
            }
        }
    }
}

/// 停止 Anthropic OAuth 回调服务器
#[tauri::command]
async fn anthropic_stop_oauth_callback_server() -> Result<(), String> {
    info!("[anthropic_oauth_callback] 停止 OAuth 回调服务器");
    Ok(())
}

// ==================== Google OAuth 模块 (v3.3.0) ====================

/// Google OAuth Token 响应
#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: u64,
    pub token_type: String,
}

/// Google 用户信息响应
#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleUserInfoResponse {
    pub email: String,
}

/// 交换 Google OAuth 授权码获取 Token
///
/// 使用 Authorization Code Flow 交换 Token
///
/// # 参数
/// - `code`: 授权码
/// - `verifier`: PKCE 验证器
/// - `client_id`: OAuth 客户端 ID
/// - `client_secret`: OAuth 客户端密钥
/// - `redirect_uri`: 重定向 URI
///
/// # 返回
/// - 成功: Token 信息
/// - 失败: 错误信息
#[tauri::command]
async fn google_exchange_token(
    code: String,
    verifier: String,
    client_id: String,
    redirect_uri: String,
) -> Result<GoogleTokenResponse, String> {
    info!("[google_exchange_token] 开始交换 Google OAuth Token");

    // Google OAuth Client Secret（安全存储在后端）
    // 使用 Antigravity 的客户端凭证，参考 CLIProxyAPIPlus antigravity/constants.go
    const GOOGLE_CLIENT_SECRET: &str = "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";

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let response = client
        .post("https://oauth2.googleapis.com/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("User-Agent", GOOGLE_OAUTH_USER_AGENT)
        .body(format!(
            "grant_type=authorization_code&code={}&redirect_uri={}&client_id={}&client_secret={}&code_verifier={}",
            urlencoding::encode(&code),
            urlencoding::encode(&redirect_uri),
            urlencoding::encode(&client_id),
            urlencoding::encode(GOOGLE_CLIENT_SECRET),
            urlencoding::encode(&verifier)
        ))
        .send()
        .await
        .map_err(|e| {
            error!("[google_exchange_token] 网络请求失败: {}", e);
            format!("网络请求失败: {}", e)
        })?;

    let status = response.status();
    debug!("[google_exchange_token] 响应状态码: {}", status.as_u16());

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!(
            "[google_exchange_token] API 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Err(format!(
            "Token 交换失败 ({}): {}",
            status.as_u16(),
            error_text
        ));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    info!("[google_exchange_token] Token 交换成功");

    Ok(GoogleTokenResponse {
        access_token: data["access_token"].as_str().unwrap_or("").to_string(),
        refresh_token: data["refresh_token"].as_str().map(|s| s.to_string()),
        expires_in: data["expires_in"].as_u64().unwrap_or(3600),
        token_type: data["token_type"].as_str().unwrap_or("Bearer").to_string(),
    })
}

/// 获取 Google 用户信息
///
/// # 参数
/// - `access_token`: 访问令牌
///
/// # 返回
/// - 成功: 用户信息
/// - 失败: 错误信息
#[tauri::command]
async fn google_get_user_info(access_token: String) -> Result<GoogleUserInfoResponse, String> {
    info!("[google_get_user_info] 获取 Google 用户信息");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let response = client
        .get("https://www.googleapis.com/oauth2/v1/userinfo")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", GOOGLE_OAUTH_USER_AGENT)
        .send()
        .await
        .map_err(|e| {
            error!("[google_get_user_info] 网络请求失败: {}", e);
            format!("网络请求失败: {}", e)
        })?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!(
            "[google_get_user_info] API 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Err(format!(
            "获取用户信息失败 ({}): {}",
            status.as_u16(),
            error_text
        ));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    Ok(GoogleUserInfoResponse {
        email: data["email"].as_str().unwrap_or("").to_string(),
    })
}

/// 刷新 Google OAuth Token
///
/// # 参数
/// - `refresh_token`: 刷新令牌
/// - `client_id`: OAuth 客户端 ID
///
/// # 返回
/// - 成功: 新的 Token 信息
/// - 失败: 错误信息
#[tauri::command]
async fn google_refresh_token(
    refresh_token: String,
    client_id: String,
) -> Result<GoogleTokenResponse, String> {
    info!("[google_refresh_token] 开始刷新 Google Token");

    // Google OAuth Client Secret（安全存储在后端）
    // 使用 Antigravity 的客户端凭证，参考 CLIProxyAPIPlus antigravity/constants.go
    const GOOGLE_CLIENT_SECRET: &str = "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";

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let response = client
        .post("https://oauth2.googleapis.com/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("User-Agent", GOOGLE_OAUTH_USER_AGENT)
        .body(format!(
            "grant_type=refresh_token&refresh_token={}&client_id={}&client_secret={}",
            urlencoding::encode(&refresh_token),
            urlencoding::encode(&client_id),
            urlencoding::encode(GOOGLE_CLIENT_SECRET)
        ))
        .send()
        .await
        .map_err(|e| {
            error!("[google_refresh_token] 网络请求失败: {}", e);
            format!("网络请求失败: {}", e)
        })?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!(
            "[google_refresh_token] API 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Err(format!(
            "Token 刷新失败: {}",
            error_text
        ));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    info!("[google_refresh_token] Token 刷新成功");

    Ok(GoogleTokenResponse {
        access_token: data["access_token"].as_str().unwrap_or("").to_string(),
        // Google might return a new refresh token, so we should use it if it exists
        refresh_token: data["refresh_token"].as_str().map(|s| s.to_string()).or(Some(refresh_token)),
        expires_in: data["expires_in"].as_u64().unwrap_or(3600),
        token_type: data["token_type"].as_str().unwrap_or("Bearer").to_string(),
    })
}

/// Google OAuth 回调服务器响应
#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleOAuthCallbackResponse {
    pub success: bool,
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

/// 启动 Google OAuth 回调服务器
///
/// 启动本地 HTTP 服务器等待 OAuth 回调
///
/// # 参数
/// - `port`: 监听端口
/// - `timeout`: 超时时间（秒）
///
/// # 返回
/// - 成功: 授权码和 state
/// - 失败: 错误信息
#[tauri::command]
async fn google_start_oauth_callback_server(
    port: u16,
    timeout: u64,
) -> Result<GoogleOAuthCallbackResponse, String> {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::time::{Duration, Instant};

    info!(
        "[google_oauth_callback] 启动 OAuth 回调服务器，端口: {}",
        port
    );

    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))
        .map_err(|e| format!("无法绑定端口 {}: {}", port, e))?;

    // 设置非阻塞模式
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("设置非阻塞模式失败: {}", e))?;

    let start = Instant::now();
    let timeout_duration = Duration::from_secs(timeout);

    loop {
        // 检查超时
        if start.elapsed() > timeout_duration {
            return Ok(GoogleOAuthCallbackResponse {
                success: false,
                code: None,
                state: None,
                error: Some("等待授权超时".to_string()),
            });
        }

        // 尝试接受连接
        match listener.accept() {
            Ok((mut stream, _)) => {
                let mut buffer = [0; 4096];

                // 设置读取超时
                stream.set_read_timeout(Some(Duration::from_secs(5))).ok();

                if let Ok(size) = stream.read(&mut buffer) {
                    let request = String::from_utf8_lossy(&buffer[..size]);

                    // 解析请求 - 支持两种回调路径
                    if request.starts_with("GET /oauth2callback")
                        || request.starts_with("GET /oauth-callback")
                    {
                        // 提取查询参数
                        let query_start = request.find('?').unwrap_or(0);
                        let query_end = request.find(" HTTP").unwrap_or(request.len());
                        let query = &request[query_start + 1..query_end];

                        let mut code = None;
                        let mut state = None;
                        let mut error = None;

                        for param in query.split('&') {
                            let parts: Vec<&str> = param.splitn(2, '=').collect();
                            if parts.len() == 2 {
                                match parts[0] {
                                    "code" => {
                                        code = Some(
                                            urlencoding::decode(parts[1])
                                                .unwrap_or_default()
                                                .to_string(),
                                        )
                                    }
                                    "state" => {
                                        state = Some(
                                            urlencoding::decode(parts[1])
                                                .unwrap_or_default()
                                                .to_string(),
                                        )
                                    }
                                    "error" => {
                                        error = Some(
                                            urlencoding::decode(parts[1])
                                                .unwrap_or_default()
                                                .to_string(),
                                        )
                                    }
                                    _ => {}
                                }
                            }
                        }

                        // 发送响应
                        let html = if code.is_some() {
                            r#"<!DOCTYPE html><html><head><meta charset="utf-8"><title>授权成功</title></head>
                            <body style="font-family: system-ui; text-align: center; padding: 50px;">
                            <h1 style="color: #22c55e;">✓ 授权成功</h1>
                            <p>您可以关闭此窗口并返回 MobausStudio</p>
                            </body></html>"#
                        } else {
                            r#"<!DOCTYPE html><html><head><meta charset="utf-8"><title>授权失败</title></head>
                            <body style="font-family: system-ui; text-align: center; padding: 50px;">
                            <h1 style="color: #ef4444;">✗ 授权失败</h1>
                            <p>请关闭此窗口并重试</p>
                            </body></html>"#
                        };

                        let response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            html.len(),
                            html
                        );

                        stream.write_all(response.as_bytes()).ok();
                        stream.flush().ok();

                        if let Some(err) = error {
                            return Ok(GoogleOAuthCallbackResponse {
                                success: false,
                                code: None,
                                state: None,
                                error: Some(err),
                            });
                        }

                        if code.is_some() {
                            info!("[google_oauth_callback] 收到授权码");
                            return Ok(GoogleOAuthCallbackResponse {
                                success: true,
                                code,
                                state,
                                error: None,
                            });
                        }
                    }
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                // 没有连接，等待一下再试
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => {
                error!("[google_oauth_callback] 接受连接失败: {}", e);
            }
        }
    }
}

/// 停止 Google OAuth 回调服务器
///
/// 注意：由于使用的是同步阻塞方式，此命令主要用于清理
#[tauri::command]
async fn google_stop_oauth_callback_server() -> Result<(), String> {
    info!("[google_oauth_callback] 停止 OAuth 回调服务器");
    // 服务器会在超时或收到回调后自动停止
    Ok(())
}

// ==================== 通用 OAuth 回调服务 (v3.4.9) ====================
// 支持动态端口分配，避免端口冲突

/// 通用 OAuth 回调响应
#[derive(Debug, Serialize, Deserialize)]
pub struct GenericOAuthCallbackResponse {
    pub success: bool,
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    /// 实际使用的端口（动态分配时返回）
    pub actual_port: u16,
}

/// 启动通用 OAuth 回调服务器（支持动态端口）
///
/// v3.4.9: 新增通用 OAuth 回调服务，支持动态端口分配
///
/// # 参数
/// - `preferred_port`: 首选端口，如果为 0 则自动分配
/// - `fallback_ports`: 备选端口列表（首选端口被占用时尝试）
/// - `callback_paths`: 支持的回调路径列表（如 ["/callback", "/oauth-callback"]）
/// - `timeout`: 超时时间（秒）
///
/// # 返回
/// - 成功: 授权码、state 和实际使用的端口
/// - 失败: 错误信息
#[tauri::command]
async fn start_oauth_callback_server(
    preferred_port: u16,
    fallback_ports: Vec<u16>,
    callback_paths: Vec<String>,
    timeout: u64,
) -> Result<GenericOAuthCallbackResponse, String> {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::time::{Duration, Instant};

    info!("[oauth_callback] 启动通用 OAuth 回调服务器");
    debug!(
        "[oauth_callback] 首选端口: {}, 备选端口: {:?}",
        preferred_port, fallback_ports
    );

    // 尝试绑定端口（首选 -> 备选 -> 动态分配）
    let (listener, actual_port) = {
        // 构建尝试端口列表
        let mut ports_to_try: Vec<u16> = vec![preferred_port];
        ports_to_try.extend(fallback_ports);

        let mut bound_listener: Option<(TcpListener, u16)> = None;

        for port in &ports_to_try {
            if *port == 0 {
                continue; // 跳过 0，最后再尝试动态分配
            }
            match TcpListener::bind(format!("127.0.0.1:{}", port)) {
                Ok(l) => {
                    info!("[oauth_callback] 成功绑定端口: {}", port);
                    bound_listener = Some((l, *port));
                    break;
                }
                Err(e) => {
                    warn!("[oauth_callback] 端口 {} 绑定失败: {}", port, e);
                }
            }
        }

        // 如果所有指定端口都失败，尝试动态分配
        if bound_listener.is_none() {
            match TcpListener::bind("127.0.0.1:0") {
                Ok(l) => {
                    let port = l.local_addr().map(|addr| addr.port()).unwrap_or(0);
                    info!("[oauth_callback] 动态分配端口: {}", port);
                    bound_listener = Some((l, port));
                }
                Err(e) => {
                    error!("[oauth_callback] 动态端口分配失败: {}", e);
                    return Err(format!("无法绑定任何端口: {}", e));
                }
            }
        }

        bound_listener.ok_or_else(|| "无法绑定端口".to_string())?
    };

    // 设置非阻塞模式
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("设置非阻塞模式失败: {}", e))?;

    let start = Instant::now();
    let timeout_duration = Duration::from_secs(timeout);

    // 构建回调路径匹配模式
    let paths: Vec<String> = if callback_paths.is_empty() {
        vec![
            "/callback".to_string(),
            "/oauth-callback".to_string(),
            "/auth/callback".to_string(),
        ]
    } else {
        callback_paths
    };

    loop {
        // 检查超时
        if start.elapsed() > timeout_duration {
            return Ok(GenericOAuthCallbackResponse {
                success: false,
                code: None,
                state: None,
                error: Some("等待授权超时".to_string()),
                actual_port,
            });
        }

        // 尝试接受连接
        match listener.accept() {
            Ok((mut stream, _)) => {
                let mut buffer = [0; 4096];
                stream.set_read_timeout(Some(Duration::from_secs(5))).ok();

                if let Ok(size) = stream.read(&mut buffer) {
                    let request = String::from_utf8_lossy(&buffer[..size]);

                    // 检查是否匹配任一回调路径
                    let is_callback = paths.iter().any(|path| {
                        request.starts_with(&format!("GET {}", path))
                            || request.starts_with(&format!("GET {}?", path))
                    });

                    if is_callback {
                        // 提取查询参数
                        let query_start = request.find('?').unwrap_or(0);
                        let query_end = request.find(" HTTP").unwrap_or(request.len());
                        let query = &request[query_start + 1..query_end];

                        let mut code = None;
                        let mut state = None;
                        let mut error = None;

                        for param in query.split('&') {
                            let parts: Vec<&str> = param.splitn(2, '=').collect();
                            if parts.len() == 2 {
                                match parts[0] {
                                    "code" => {
                                        code = Some(
                                            urlencoding::decode(parts[1])
                                                .unwrap_or_default()
                                                .to_string(),
                                        )
                                    }
                                    "state" => {
                                        state = Some(
                                            urlencoding::decode(parts[1])
                                                .unwrap_or_default()
                                                .to_string(),
                                        )
                                    }
                                    "error" => {
                                        error = Some(
                                            urlencoding::decode(parts[1])
                                                .unwrap_or_default()
                                                .to_string(),
                                        )
                                    }
                                    _ => {}
                                }
                            }
                        }

                        // 发送响应
                        let html = if code.is_some() {
                            r#"<!DOCTYPE html><html><head><meta charset="utf-8"><title>授权成功</title>
                            <style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);}
                            .card{background:white;padding:3rem;border-radius:1rem;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center;max-width:400px;}
                            h1{color:#22c55e;margin-bottom:1rem;}p{color:#666;}</style></head>
                            <body><div class="card"><h1>✓ 授权成功</h1><p>您可以关闭此窗口并返回 MobausStudio</p></div></body></html>"#
                        } else {
                            r#"<!DOCTYPE html><html><head><meta charset="utf-8"><title>授权失败</title>
                            <style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);}
                            .card{background:white;padding:3rem;border-radius:1rem;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center;max-width:400px;}
                            h1{color:#ef4444;margin-bottom:1rem;}p{color:#666;}</style></head>
                            <body><div class="card"><h1>✗ 授权失败</h1><p>请关闭此窗口并重试</p></div></body></html>"#
                        };

                        let response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            html.len(),
                            html
                        );

                        stream.write_all(response.as_bytes()).ok();
                        stream.flush().ok();

                        if let Some(err) = error {
                            return Ok(GenericOAuthCallbackResponse {
                                success: false,
                                code: None,
                                state: None,
                                error: Some(err),
                                actual_port,
                            });
                        }

                        if code.is_some() {
                            info!("[oauth_callback] 收到授权码");
                            return Ok(GenericOAuthCallbackResponse {
                                success: true,
                                code,
                                state,
                                error: None,
                                actual_port,
                            });
                        }
                    }
                }
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(e) => {
                error!("[oauth_callback] 接受连接失败: {}", e);
            }
        }
    }
}

/// 检查端口是否可用
///
/// v3.4.9: 用于前端预检查端口可用性
#[tauri::command]
async fn check_port_available(port: u16) -> Result<bool, String> {
    use std::net::TcpListener;

    match TcpListener::bind(format!("127.0.0.1:{}", port)) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// 获取可用端口
///
/// v3.4.9: 让系统分配一个可用端口并返回
#[tauri::command]
async fn get_available_port() -> Result<u16, String> {
    use std::net::TcpListener;

    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("无法分配端口: {}", e))?;

    let port = listener
        .local_addr()
        .map(|addr| addr.port())
        .map_err(|e| format!("无法获取端口: {}", e))?;

    Ok(port)
}

// ==================== Antigravity Onboard 模块 (v3.3.1) ====================

/// Antigravity API 配置
/// v0.9.0: 更新端点顺序，优先使用 Sandbox/Daily 环境（参考 Antigravity-Manager Issue #1176）
const ANTIGRAVITY_API_ENDPOINT: &str = "https://daily-cloudcode-pa.sandbox.googleapis.com";
const ANTIGRAVITY_API_VERSION: &str = "v1internal";

/// v0.9.0: 动态生成 User-Agent，格式与 Antigravity-Manager 一致
/// 格式: antigravity/{version} {os}/{arch}
fn get_antigravity_user_agent() -> String {
    // 使用固定版本号，与 Antigravity-Manager 最新版本保持一致
    const VERSION: &str = "4.1.24";
    format!(
        "antigravity/{} {}/{}",
        VERSION,
        std::env::consts::OS,
        std::env::consts::ARCH
    )
}

/// 清洗工具名称，使其符合 Gemini API 的命名规则
/// Gemini 要求: 以字母或下划线开头，只能包含 a-z, A-Z, 0-9, _, ., :, -，最长64个字符
fn sanitize_gemini_tool_name(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == ':' || c == '-' {
                c
            } else {
                '_' // 将非法字符替换为下划线
            }
        })
        .collect();

    // 确保以字母或下划线开头
    let sanitized = if sanitized.starts_with(|c: char| c.is_ascii_alphabetic() || c == '_') {
        sanitized
    } else {
        format!("_{}", sanitized)
    };

    // 截断到64个字符
    if sanitized.len() > 64 {
        sanitized[..64].to_string()
    } else {
        sanitized
    }
}

/// v4.1.35: 消息截断 - 防止超过模型 token 限制
///
/// 粗略估算 token 数（中英混合约 2 字符/token），从头部截断旧消息
/// 从 data URL 中提取 base64 图片数据和 MIME type
///
/// # 参数
/// - `data_url`: data URL 字符串，格式如 "data:image/png;base64,iVBORw0KG..."
///
/// # 返回
/// - `Some((mime_type, base64_data))`: 成功提取时返回 MIME type 和 base64 数据
/// - `None`: 解析失败时返回 None
///
/// # 示例
/// ```ignore
/// let (mime, data) = extract_base64_image("data:image/png;base64,iVBORw0KG...").unwrap();
/// assert_eq!(mime, "image/png");
/// assert_eq!(data, "iVBORw0KG...");
/// ```
fn extract_base64_image(data_url: &str) -> Option<(String, String)> {
    // 检查是否以 "data:" 开头
    if !data_url.starts_with("data:") {
        return None;
    }

    // 分割为 header 和 data 两部分
    let parts: Vec<&str> = data_url.splitn(2, ',').collect();
    if parts.len() != 2 {
        return None;
    }

    let header = parts[0]; // "data:image/png;base64"
    let data = parts[1]; // "iVBORw0KG..."

    // 从 header 中提取 MIME type
    let mime_type = header.strip_prefix("data:")?.split(';').next()?.to_string();

    Some((mime_type, data.to_string()))
}

/// 判断 URL 是否为 HTTP(S) URL
///
/// # 参数
/// - `url`: URL 字符串
///
/// # 返回
/// - `true`: 是 HTTP(S) URL
/// - `false`: 不是 HTTP(S) URL
fn is_http_url(url: &str) -> bool {
    url.starts_with("http://") || url.starts_with("https://")
}

/// 验证 IP 地址是否为内网地址
///
/// # 参数
/// - `ip`: IP 地址
///
/// # 返回
/// - `true`: 是内网地址
/// - `false`: 不是内网地址
fn is_private_ip(ip: std::net::IpAddr) -> bool {
    use std::net::IpAddr;

    match ip {
        IpAddr::V4(ipv4) => {
            let octets = ipv4.octets();
            // 127.0.0.0/8 - Loopback
            octets[0] == 127
                // 10.0.0.0/8 - Private
                || octets[0] == 10
                // 172.16.0.0/12 - Private
                || (octets[0] == 172 && (16..=31).contains(&octets[1]))
                // 192.168.0.0/16 - Private
                || (octets[0] == 192 && octets[1] == 168)
                // 169.254.0.0/16 - Link-local
                || (octets[0] == 169 && octets[1] == 254)
                // 0.0.0.0/8 - Current network
                || octets[0] == 0
        }
        IpAddr::V6(ipv6) => {
            // ::1 - Loopback
            ipv6.is_loopback()
                // fe80::/10 - Link-local
                || ((ipv6.segments()[0] & 0xffc0) == 0xfe80)
                // fc00::/7 - Unique local
                || ((ipv6.segments()[0] & 0xfe00) == 0xfc00)
                // ::ffff:0:0/96 - IPv4-mapped IPv6 (检查映射的 IPv4 是否为私有)
                || ipv6.to_ipv4_mapped().is_some_and(|ipv4| {
                    let octets = ipv4.octets();
                    octets[0] == 127
                        || octets[0] == 10
                        || (octets[0] == 172 && (16..=31).contains(&octets[1]))
                        || (octets[0] == 192 && octets[1] == 168)
                        || (octets[0] == 169 && octets[1] == 254)
                        || octets[0] == 0
                })
        }
    }
}

/// 下载远程图片并转换为 base64
///
/// # 参数
/// - `url`: 图片 URL
/// - `client`: HTTP 客户端
///
/// # 返回
/// - `Ok((mime_type, base64_data))`: 成功返回 MIME 类型和 base64 数据
/// - `Err(error_message)`: 失败返回错误信息
async fn download_image_as_base64(url: &str) -> Result<(String, String), String> {
    // v4.2.5: 解析 URL
    let parsed = url::Url::parse(url).map_err(|e| format!("URL 解析失败: {}", e))?;

    // 只允许 http 和 https 协议
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(format!("不支持的协议: {}", scheme));
    }

    // 获取主机名和端口
    let host = parsed
        .host_str()
        .ok_or_else(|| "URL 缺少主机名".to_string())?;
    let port = parsed.port_or_known_default().unwrap_or(443);

    // 第一层：检查 hostname 字符串（快速过滤）
    let blocked_patterns = [
        "localhost",
        "127.",
        "0.0.0.0",
        "10.",
        "172.16.",
        "172.17.",
        "172.18.",
        "172.19.",
        "172.20.",
        "172.21.",
        "172.22.",
        "172.23.",
        "172.24.",
        "172.25.",
        "172.26.",
        "172.27.",
        "172.28.",
        "172.29.",
        "172.30.",
        "172.31.",
        "192.168.",
        "169.254.",
        "[::1]",
    ];

    let host_lower = host.to_lowercase();
    for pattern in &blocked_patterns {
        if host_lower.starts_with(pattern) || host_lower.contains(pattern) {
            return Err(format!("禁止访问内网地址: {}", host));
        }
    }

    // 阻止云服务元数据端点
    let metadata_endpoints = [
        "169.254.169.254",
        "metadata.google.internal",
        "metadata.azure.com",
    ];

    for endpoint in &metadata_endpoints {
        if host_lower.contains(endpoint) {
            return Err(format!("禁止访问元数据端点: {}", host));
        }
    }

    // 第二层：DNS 解析并验证 IP 地址
    let addrs = tokio::net::lookup_host(format!("{}:{}", host, port))
        .await
        .map_err(|e| format!("DNS 解析失败: {}", e))?;

    let mut safe_addrs = Vec::new();
    for addr in addrs {
        let ip = addr.ip();
        if is_private_ip(ip) {
            return Err(format!("域名 {} 解析到内网地址 {}，禁止访问", host, ip));
        }
        // 收集所有验证通过的地址
        safe_addrs.push(addr);
    }

    if safe_addrs.is_empty() {
        return Err("DNS 解析未返回任何有效地址".to_string());
    }

    info!(
        "[download_image_as_base64] 域名 {} 解析到 {} 个安全地址",
        host,
        safe_addrs.len()
    );

    // 第三层：使用 resolve_to_addrs 创建临时 client（防止 DNS rebinding）
    // 保持请求 URL 为原始域名，但强制 TCP 连接只能走验证过的 IP
    let safe_client = reqwest::Client::builder()
        .resolve_to_addrs(host, &safe_addrs)
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建安全 HTTP 客户端失败: {}", e))?;

    // 下载图片，使用原始 URL（TLS SNI 和证书校验都正常）
    let response = safe_client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("下载图片失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("下载图片失败: HTTP {}", response.status()));
    }

    // 获取 MIME 类型
    let mime_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();

    // 读取图片数据
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取图片数据失败: {}", e))?;

    // 转换为 base64
    let base64_data = base64::engine::general_purpose::STANDARD.encode(&bytes);

    Ok((mime_type, base64_data))
}

/// 保留最后一条 user 消息和最近的历史
///
/// # 参数
/// - `messages`: 消息列表
/// - `max_tokens`: 最大 token 数
///
/// # 返回
/// - 截断后的消息列表
fn truncate_messages_by_tokens(
    messages: Vec<serde_json::Value>,
    max_tokens: usize,
) -> Vec<serde_json::Value> {
    // 估算总 token 数
    let total_chars: usize = messages
        .iter()
        .map(|m| serde_json::to_string(m).unwrap_or_default().len())
        .sum();
    let estimated_tokens = total_chars / 2; // 保守估算：2 字符/token

    if estimated_tokens <= max_tokens {
        return messages;
    }

    info!(
        "[truncate_messages] 消息过长，估算 {} tokens > {} 限制，开始截断",
        estimated_tokens, max_tokens
    );

    // 从头部开始移除消息，直到 token 数在限制内
    // 但至少保留最后 2 条消息（最后的 user 消息 + 可能的 assistant）
    let min_keep = 2.min(messages.len());
    let mut start_idx = 0;
    let mut current_chars: usize = total_chars;

    while current_chars / 2 > max_tokens && start_idx < messages.len() - min_keep {
        let msg_chars = serde_json::to_string(&messages[start_idx])
            .unwrap_or_default()
            .len();
        current_chars -= msg_chars;
        start_idx += 1;
    }

    // 确保不会从 tool_result 开始（需要有对应的 tool_use）
    // 如果截断后第一条是 tool/tool_result/assistant/model 消息，继续往后跳直到找到 user 消息
    while start_idx < messages.len() - min_keep {
        let first = &messages[start_idx];
        let role = first.get("role").and_then(|r| r.as_str()).unwrap_or("");

        // 检查是否是 user/userInputMessage 开头
        let is_user = role == "user" || first.get("userInputMessage").is_some();
        if is_user {
            // 额外检查：如果是纯 tool_result/functionResponse 的 user 消息，也跳过
            let has_tool_result = first
                .get("content")
                .and_then(|c| c.as_array())
                .map(|blocks| {
                    blocks
                        .iter()
                        .all(|b| b.get("type").and_then(|t| t.as_str()) == Some("tool_result"))
                })
                .unwrap_or(false);
            let has_function_response = first
                .get("parts")
                .and_then(|p| p.as_array())
                .map(|parts| parts.iter().all(|p| p.get("functionResponse").is_some()))
                .unwrap_or(false);

            if has_tool_result || has_function_response {
                start_idx += 1;
                continue;
            }
            break; // 找到正常的 user 消息，停止
        }

        start_idx += 1;
    }

    info!(
        "[truncate_messages] 截断前 {} 条消息，保留 {} 条",
        start_idx,
        messages.len() - start_idx
    );
    messages[start_idx..].to_vec()
}

/// Antigravity onboard 响应
#[derive(Debug, Serialize)]
pub struct AntigravityOnboardResponse {
    pub success: bool,
    pub project_id: Option<String>,
    pub error: Option<String>,
}

/// 调用 Antigravity loadCodeAssist API 获取项目 ID
///
/// 参考 CLIProxyAPIPlus antigravity/auth.go FetchProjectID
#[tauri::command]
async fn google_load_code_assist(
    access_token: String,
) -> Result<AntigravityOnboardResponse, String> {
    info!("[google_load_code_assist] 调用 loadCodeAssist API");

    let client = reqwest::Client::new();
    let url = format!(
        "{}/{}:loadCodeAssist",
        ANTIGRAVITY_API_ENDPOINT, ANTIGRAVITY_API_VERSION
    );

    // v3.6.1: 更新 metadata，ideType 改为 ANTIGRAVITY（与 OpenClaw 保持一致）
    let body = serde_json::json!({
        "metadata": {
            "ideType": "ANTIGRAVITY",
            "platform": "PLATFORM_UNSPECIFIED",
            "pluginType": "GEMINI"
        }
    });

    let user_agent = get_antigravity_user_agent();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .header("User-Agent", &user_agent)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("loadCodeAssist 请求失败: {}", e))?;

    let status = response.status();
    debug!("[google_load_code_assist] 响应状态码: {}", status.as_u16());

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        warn!(
            "[google_load_code_assist] API 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Ok(AntigravityOnboardResponse {
            success: false,
            project_id: None,
            error: Some(format!("API 错误 ({}): {}", status.as_u16(), error_text)),
        });
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    // 尝试从响应中提取 project_id
    let project_id = data["cloudaicompanionProject"]
        .as_str()
        .map(|s| s.to_string())
        .or_else(|| {
            data["cloudaicompanionProject"]["id"]
                .as_str()
                .map(|s| s.to_string())
        });

    if let Some(ref pid) = project_id {
        info!("[google_load_code_assist] 获取到项目 ID: {}", pid);
        return Ok(AntigravityOnboardResponse {
            success: true,
            project_id: Some(pid.clone()),
            error: None,
        });
    }

    // 如果没有项目 ID，需要 onboard
    info!("[google_load_code_assist] 未找到项目 ID，需要 onboard");

    // 获取 tier ID
    let tier_id = data["allowedTiers"]
        .as_array()
        .and_then(|tiers| {
            tiers.iter().find_map(|tier| {
                if tier["isDefault"].as_bool() == Some(true) {
                    tier["id"].as_str().map(|s| s.to_string())
                } else {
                    None
                }
            })
        })
        .unwrap_or_else(|| "legacy-tier".to_string());

    Ok(AntigravityOnboardResponse {
        success: false,
        project_id: None,
        error: Some(format!("NEED_ONBOARD:{}", tier_id)),
    })
}

/// 调用 Antigravity onboardUser API 创建项目
///
/// 参考 CLIProxyAPIPlus antigravity/auth.go OnboardUser
#[tauri::command]
async fn google_onboard_user(
    access_token: String,
    tier_id: String,
) -> Result<AntigravityOnboardResponse, String> {
    info!(
        "[google_onboard_user] 调用 onboardUser API，tier: {}",
        tier_id
    );

    let client = reqwest::Client::new();
    let url = format!(
        "{}/{}:onboardUser",
        ANTIGRAVITY_API_ENDPOINT, ANTIGRAVITY_API_VERSION
    );

    let body = serde_json::json!({
        "tierId": tier_id,
        "metadata": {
            "ideType": "IDE_UNSPECIFIED",
            "platform": "PLATFORM_UNSPECIFIED",
            "pluginType": "GEMINI"
        }
    });

    let user_agent = get_antigravity_user_agent();

    // 轮询等待 onboard 完成
    for attempt in 1..=5 {
        info!("[google_onboard_user] 轮询尝试 {}/5", attempt);

        let response = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .header("Content-Type", "application/json")
            .header("User-Agent", &user_agent)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("onboardUser 请求失败: {}", e))?;

        let status = response.status();

        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            warn!(
                "[google_onboard_user] API 错误: {} - {}",
                status.as_u16(),
                error_text
            );
            return Ok(AntigravityOnboardResponse {
                success: false,
                project_id: None,
                error: Some(format!("API 错误 ({}): {}", status.as_u16(), error_text)),
            });
        }

        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("解析响应失败: {}", e))?;

        // 检查是否完成
        if data["done"].as_bool() == Some(true) {
            let project_id = data["response"]["cloudaicompanionProject"]
                .as_str()
                .map(|s| s.to_string())
                .or_else(|| {
                    data["response"]["cloudaicompanionProject"]["id"]
                        .as_str()
                        .map(|s| s.to_string())
                });

            if let Some(pid) = project_id {
                info!("[google_onboard_user] Onboard 成功，项目 ID: {}", pid);
                return Ok(AntigravityOnboardResponse {
                    success: true,
                    project_id: Some(pid),
                    error: None,
                });
            }
        }

        // 等待 2 秒后重试
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    }

    Ok(AntigravityOnboardResponse {
        success: false,
        project_id: None,
        error: Some("Onboard 超时".to_string()),
    })
}

/// 可用模型信息
#[derive(Debug, Serialize)]
pub struct AvailableModel {
    /// 模型 ID
    pub id: String,
    /// 显示名称
    pub display_name: Option<String>,
    /// 剩余配额比例 (0.0 - 1.0)
    pub remaining_fraction: Option<f64>,
    /// 配额重置时间 (ISO 8601)
    pub reset_time: Option<String>,
    /// 配额是否已耗尽
    pub is_exhausted: bool,
}

/// fetchAvailableModels 响应
#[derive(Debug, Serialize)]
pub struct FetchAvailableModelsResponse {
    pub success: bool,
    pub models: Vec<AvailableModel>,
    pub error: Option<String>,
}

// ==================== Kiro API (v0.7.3) ====================

/// Kiro CodeWhisperer API 端点
const KIRO_CODEWHISPERER_ENDPOINT: &str = "https://codewhisperer.us-east-1.amazonaws.com";

/// Kiro 模型信息
#[derive(Debug, Serialize, Deserialize)]
pub struct KiroModel {
    /// 模型 ID
    pub model_id: String,
    /// 模型名称
    pub model_name: String,
    /// 模型描述
    pub description: Option<String>,
    /// 速率倍数
    pub rate_multiplier: Option<f64>,
    /// 速率单位
    pub rate_unit: Option<String>,
    /// 最大输入 token 数
    pub max_input_tokens: Option<i32>,
}

/// Kiro 模型列表响应
#[derive(Debug, Serialize)]
pub struct KiroModelsResponse {
    /// 是否成功
    pub success: bool,
    /// 模型列表
    pub models: Vec<KiroModel>,
    /// 错误信息
    pub error: Option<String>,
}

/// Kiro 配额信息
#[derive(Debug, Serialize)]
pub struct KiroQuotaInfo {
    /// 总配额
    pub total_limit: f64,
    /// 当前使用量
    pub current_usage: f64,
    /// 剩余配额
    pub remaining_quota: f64,
    /// 是否已耗尽
    pub is_exhausted: bool,
    /// 资源类型
    pub resource_type: Option<String>,
    /// 下次重置时间（毫秒时间戳）
    pub next_reset: Option<f64>,
    /// 订阅类型
    pub subscription_title: Option<String>,
}

/// Kiro 配额响应
#[derive(Debug, Serialize)]
pub struct KiroQuotaResponse {
    /// 是否成功
    pub success: bool,
    /// 配额信息
    pub quota: Option<KiroQuotaInfo>,
    /// 错误信息
    pub error: Option<String>,
}

/// 获取 Kiro 可用模型列表
///
/// 调用 CodeWhisperer API 获取当前用户可用的模型
///
/// # 参数
/// - `access_token`: OAuth 访问令牌
/// - `profile_arn`: 用户配置文件 ARN
///
/// # 返回
/// - 成功: 模型列表
/// - 失败: 错误信息
#[tauri::command]
async fn kiro_list_models(
    access_token: String,
    profile_arn: Option<String>,
    auth_method: Option<String>,
    sso_region: Option<String>,
) -> Result<KiroModelsResponse, String> {
    info!("[kiro_list_models] 获取 Kiro 可用模型列表");
    debug!("[kiro_list_models] Profile ARN: {:?}", profile_arn);

    // v4.1.33: 判断是否是 IDC 认证，IDC 用户使用 ssoRegion
    let is_idc = auth_method
        .as_deref()
        .map(|m| m.to_lowercase() == "idc")
        .unwrap_or(false);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    // v4.1.33: IDC 用户使用 q.{ssoRegion}.amazonaws.com 端点
    // codewhisperer.{region} 域名只在 us-east-1 存在
    let url = if is_idc {
        let region = sso_region.as_deref().unwrap_or(KIRO_API_REGION);
        format!("https://q.{}.amazonaws.com/", region)
    } else {
        format!("https://codewhisperer.{}.amazonaws.com/", KIRO_API_REGION)
    };

    // 构建请求体
    let mut payload = serde_json::json!({
        "origin": "AI_EDITOR"
    });

    if let Some(ref arn) = profile_arn {
        if !arn.is_empty() {
            payload["profileArn"] = serde_json::json!(arn);
        }
    }

    let response = client
        .post(&url)
        .header("Content-Type", "application/x-amz-json-1.0")
        .header(
            "x-amz-target",
            "AmazonCodeWhispererService.ListAvailableModels",
        )
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Accept", "application/json")
        .json(&payload)
        .send()
        .await;

    // 尝试动态获取模型列表
    let models = match response {
        Ok(resp) if resp.status().is_success() => {
            let response_text = resp.text().await.unwrap_or_default();
            debug!("[kiro_list_models] 动态获取成功: {}", response_text);

            if let Ok(data) = serde_json::from_str::<serde_json::Value>(&response_text) {
                if let Some(models_array) = data["models"].as_array() {
                    models_array
                        .iter()
                        .filter_map(|m| {
                            Some(KiroModel {
                                model_id: m["modelId"].as_str()?.to_string(),
                                model_name: m["modelName"].as_str().unwrap_or_default().to_string(),
                                description: m["description"].as_str().map(|s| s.to_string()),
                                rate_multiplier: m["rateMultiplier"].as_f64(),
                                rate_unit: m["rateUnit"].as_str().map(|s| s.to_string()),
                                max_input_tokens: m["tokenLimits"]["maxInputTokens"]
                                    .as_i64()
                                    .map(|n| n as i32),
                            })
                        })
                        .collect()
                } else {
                    vec![]
                }
            } else {
                vec![]
            }
        }
        Ok(resp) => {
            let status = resp.status();
            let error_text = resp.text().await.unwrap_or_default();
            warn!(
                "[kiro_list_models] 动态获取失败 ({}): {}, 使用静态模型列表",
                status.as_u16(),
                error_text
            );
            vec![]
        }
        Err(e) => {
            warn!("[kiro_list_models] 请求失败: {}, 使用静态模型列表", e);
            vec![]
        }
    };

    // 如果动态获取失败，使用静态模型列表（参考 CLIProxyAPIPlus）
    let models = if models.is_empty() {
        info!("[kiro_list_models] 使用静态模型列表");
        get_static_kiro_models()
    } else {
        models
    };

    info!("[kiro_list_models] 获取到 {} 个模型", models.len());

    Ok(KiroModelsResponse {
        success: true,
        models,
        error: None,
    })
}

/// 获取静态 Kiro 模型列表（参考 CLIProxyAPIPlus registry/model_definitions.go）
/// 当动态获取失败时使用
fn get_static_kiro_models() -> Vec<KiroModel> {
    vec![
        // --- Base Models ---
        KiroModel {
            model_id: "auto".to_string(),
            model_name: "Kiro Auto".to_string(),
            description: Some("Automatic model selection by Kiro".to_string()),
            rate_multiplier: Some(1.0),
            rate_unit: Some("credit".to_string()),
            max_input_tokens: Some(200000),
        },
        KiroModel {
            model_id: "claude-opus-4.5".to_string(),
            model_name: "Claude Opus 4.5".to_string(),
            description: Some("Claude Opus 4.5 via Kiro (2.2x credit)".to_string()),
            rate_multiplier: Some(2.2),
            rate_unit: Some("credit".to_string()),
            max_input_tokens: Some(200000),
        },
        KiroModel {
            model_id: "claude-sonnet-4.5".to_string(),
            model_name: "Claude Sonnet 4.5".to_string(),
            description: Some("Claude Sonnet 4.5 via Kiro (1.3x credit)".to_string()),
            rate_multiplier: Some(1.3),
            rate_unit: Some("credit".to_string()),
            max_input_tokens: Some(200000),
        },
        KiroModel {
            model_id: "claude-sonnet-4".to_string(),
            model_name: "Claude Sonnet 4".to_string(),
            description: Some("Claude Sonnet 4 via Kiro (1.3x credit)".to_string()),
            rate_multiplier: Some(1.3),
            rate_unit: Some("credit".to_string()),
            max_input_tokens: Some(200000),
        },
        KiroModel {
            model_id: "claude-haiku-4.5".to_string(),
            model_name: "Claude Haiku 4.5".to_string(),
            description: Some("Claude Haiku 4.5 via Kiro (0.4x credit)".to_string()),
            rate_multiplier: Some(0.4),
            rate_unit: Some("credit".to_string()),
            max_input_tokens: Some(200000),
        },
        // --- Agentic Variants (Optimized for coding agents with chunked writes) ---
        KiroModel {
            model_id: "claude-opus-4.5-agentic".to_string(),
            model_name: "Claude Opus 4.5 (Agentic)".to_string(),
            description: Some(
                "Claude Opus 4.5 optimized for coding agents (chunked writes)".to_string(),
            ),
            rate_multiplier: Some(2.2),
            rate_unit: Some("credit".to_string()),
            max_input_tokens: Some(200000),
        },
        KiroModel {
            model_id: "claude-sonnet-4.5-agentic".to_string(),
            model_name: "Claude Sonnet 4.5 (Agentic)".to_string(),
            description: Some(
                "Claude Sonnet 4.5 optimized for coding agents (chunked writes)".to_string(),
            ),
            rate_multiplier: Some(1.3),
            rate_unit: Some("credit".to_string()),
            max_input_tokens: Some(200000),
        },
        KiroModel {
            model_id: "claude-sonnet-4-agentic".to_string(),
            model_name: "Claude Sonnet 4 (Agentic)".to_string(),
            description: Some(
                "Claude Sonnet 4 optimized for coding agents (chunked writes)".to_string(),
            ),
            rate_multiplier: Some(1.3),
            rate_unit: Some("credit".to_string()),
            max_input_tokens: Some(200000),
        },
        KiroModel {
            model_id: "claude-haiku-4.5-agentic".to_string(),
            model_name: "Claude Haiku 4.5 (Agentic)".to_string(),
            description: Some(
                "Claude Haiku 4.5 optimized for coding agents (chunked writes)".to_string(),
            ),
            rate_multiplier: Some(0.4),
            rate_unit: Some("credit".to_string()),
            max_input_tokens: Some(200000),
        },
    ]
}

/// 获取 Kiro 配额信息
///
/// 调用 CodeWhisperer API 获取当前用户的配额使用情况
///
/// # 参数
/// - `access_token`: OAuth 访问令牌
/// - `profile_arn`: 用户配置文件 ARN（可选，AWS Builder ID 用户没有）
/// - `auth_method`: 认证方式 ("idc" | "aws")，用于选择正确的 User-Agent (v0.9.0)
///
/// # 返回
/// - 成功: 配额信息
/// - 失败: 错误信息
#[tauri::command]
async fn kiro_get_quota(
    access_token: String,
    profile_arn: Option<String>,
    auth_method: Option<String>,
    sso_region: Option<String>,
) -> Result<KiroQuotaResponse, String> {
    info!("[kiro_get_quota] 获取 Kiro 配额信息");
    debug!("[kiro_get_quota] Profile ARN: {:?}", profile_arn);
    debug!("[kiro_get_quota] Auth Method: {:?}", auth_method);

    // v0.9.0: 根据认证方式选择 User-Agent
    let is_idc = auth_method
        .as_deref()
        .map(|m| m.to_lowercase() == "idc")
        .unwrap_or(false);
    let user_agent = if is_idc {
        KIRO_API_USER_AGENT_IDC
    } else {
        KIRO_API_USER_AGENT_AWS
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    // v4.1.33: IDC 用户使用 q.{ssoRegion}.amazonaws.com 端点
    // codewhisperer.{region} 域名只在 us-east-1 存在
    let url = if is_idc {
        let region = sso_region.as_deref().unwrap_or(KIRO_API_REGION);
        format!("https://q.{}.amazonaws.com/", region)
    } else {
        format!("https://codewhisperer.{}.amazonaws.com/", KIRO_API_REGION)
    };

    // 构建请求体
    let mut payload = serde_json::json!({
        "origin": "AI_EDITOR",
        "resourceType": "AGENTIC_REQUEST"
    });

    if let Some(ref arn) = profile_arn {
        if !arn.is_empty() {
            payload["profileArn"] = serde_json::json!(arn);
        }
    }

    let response = client
        .post(&url)
        .header("Content-Type", "application/x-amz-json-1.0")
        .header("x-amz-target", "AmazonCodeWhispererService.GetUsageLimits")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Accept", "application/json")
        .header("User-Agent", user_agent)
        .json(&payload)
        .send()
        .await
        .map_err(|e| {
            error!("[kiro_get_quota] 请求失败: {}", e);
            format!("请求失败: {}", e)
        })?;

    let status = response.status();
    debug!("[kiro_get_quota] 响应状态码: {}", status.as_u16());

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!(
            "[kiro_get_quota] API 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Ok(KiroQuotaResponse {
            success: false,
            quota: None,
            error: Some(format!("API 错误 ({}): {}", status.as_u16(), error_text)),
        });
    }

    let response_text = response.text().await.unwrap_or_default();
    info!("[kiro_get_quota] 原始响应: {}", response_text);

    let data: serde_json::Value =
        serde_json::from_str(&response_text).map_err(|e| format!("解析响应失败: {}", e))?;

    // 打印响应结构以便调试
    debug!(
        "[kiro_get_quota] 响应结构: {}",
        serde_json::to_string_pretty(&data).unwrap_or_default()
    );

    // 解析配额信息
    let mut quota_info = KiroQuotaInfo {
        total_limit: 0.0,
        current_usage: 0.0,
        remaining_quota: 0.0,
        is_exhausted: true,
        resource_type: None,
        next_reset: data["nextDateReset"].as_f64(),
        subscription_title: data["subscriptionInfo"]["subscriptionTitle"]
            .as_str()
            .map(|s| s.to_string()),
    };

    // 解析 usageBreakdownList
    if let Some(breakdown_list) = data["usageBreakdownList"].as_array() {
        info!(
            "[kiro_get_quota] 找到 usageBreakdownList，长度: {}",
            breakdown_list.len()
        );
        for breakdown in breakdown_list {
            let limit = breakdown["usageLimitWithPrecision"].as_f64().unwrap_or(0.0);
            let usage = breakdown["currentUsageWithPrecision"]
                .as_f64()
                .unwrap_or(0.0);
            debug!(
                "[kiro_get_quota] breakdown: limit={}, usage={}",
                limit, usage
            );

            quota_info.total_limit += limit;
            quota_info.current_usage += usage;
            quota_info.resource_type = breakdown["resourceType"].as_str().map(|s| s.to_string());

            // 检查 freeTrialInfo
            if let Some(free_trial) = breakdown.get("freeTrialInfo") {
                let free_limit = free_trial["usageLimitWithPrecision"]
                    .as_f64()
                    .unwrap_or(0.0);
                let free_usage = free_trial["currentUsageWithPrecision"]
                    .as_f64()
                    .unwrap_or(0.0);
                quota_info.total_limit += free_limit;
                quota_info.current_usage += free_usage;
            }
        }
    }

    quota_info.remaining_quota = quota_info.total_limit - quota_info.current_usage;
    quota_info.is_exhausted = quota_info.remaining_quota <= 0.0;

    info!(
        "[kiro_get_quota] 配额: {}/{}, 剩余: {}",
        quota_info.current_usage, quota_info.total_limit, quota_info.remaining_quota
    );

    Ok(KiroQuotaResponse {
        success: true,
        quota: Some(quota_info),
        error: None,
    })
}

/// Kiro Token 刷新响应
#[derive(Debug, Serialize)]
pub struct KiroRefreshTokenResponse {
    /// 是否成功
    pub success: bool,
    /// 新的访问令牌
    pub access_token: Option<String>,
    /// 新的刷新令牌（如果有）
    pub refresh_token: Option<String>,
    /// Token 有效期（秒）
    pub expires_in: Option<u64>,
    /// 错误信息
    pub error: Option<String>,
    /// v0.9.2: 是否需要重新认证（不可恢复的错误，如 refresh_token 失效）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub needs_reauth: Option<bool>,
}

/// 刷新 Kiro Access Token
///
/// 使用 AWS SSO OIDC refresh_token grant 刷新 token
///
/// v0.9.1: 支持从持久化凭证中传入客户端注册信息，解决重启后无法刷新的问题
///
/// # 参数
/// - `refresh_token`: 刷新令牌
/// - `client_id`: 可选，客户端 ID（从持久化凭证中获取）
/// - `client_secret`: 可选，客户端密钥（从持久化凭证中获取）
/// - `sso_region`: 可选，SSO 区域（从持久化凭证中获取）
///
/// # 返回
/// - 成功: 新的 access_token 和 refresh_token
/// - 失败: 错误信息
#[tauri::command]
async fn kiro_refresh_token(
    refresh_token: String,
    client_id: Option<String>,
    client_secret: Option<String>,
    sso_region: Option<String>,
) -> Result<KiroRefreshTokenResponse, String> {
    info!("[kiro_refresh_token] 刷新 Kiro Access Token");

    // v0.9.1: 优先使用传入的客户端注册信息（从持久化凭证中获取）
    // 这样即使应用重启后内存中的注册信息丢失，也能正常刷新 token
    let (final_client_id, final_client_secret, final_region) = if let (Some(id), Some(secret)) =
        (client_id.clone(), client_secret.clone())
    {
        let region = sso_region
            .clone()
            .unwrap_or_else(|| KIRO_SSO_REGION.to_string());
        info!(
            "[kiro_refresh_token] 使用持久化的客户端注册信息, region: {}",
            region
        );

        // 同时恢复内存中的注册信息，以便后续使用
        if sso_region.is_some()
            && sso_region
                .as_ref()
                .map(|r| r != KIRO_SSO_REGION)
                .unwrap_or(false)
        {
            // IDC 认证（非默认 region）
            let mut idc_registration = KIRO_IDC_CLIENT_REGISTRATION.lock().unwrap();
            *idc_registration = Some((id.clone(), secret.clone(), String::new(), region.clone()));
            info!("[kiro_refresh_token] 已恢复 IDC 客户端注册信息到内存");
        } else {
            // Builder ID 认证
            let mut registration = KIRO_CLIENT_REGISTRATION.lock().unwrap();
            *registration = Some((id.clone(), secret.clone()));
            info!("[kiro_refresh_token] 已恢复 Builder ID 客户端注册信息到内存");
        }

        (id, secret, region)
    } else {
        // 回退到内存中的注册信息
        // 优先检查 IDC 注册信息
        let idc_registration = KIRO_IDC_CLIENT_REGISTRATION.lock().unwrap();
        if let Some((id, secret, _start_url, reg)) = idc_registration.as_ref() {
            info!(
                "[kiro_refresh_token] 使用内存中的 IDC 认证信息, region: {}",
                reg
            );
            (id.clone(), secret.clone(), reg.clone())
        } else {
            drop(idc_registration); // 释放锁
                                    // 回退到普通的 Builder ID 注册
            let registration = KIRO_CLIENT_REGISTRATION.lock().unwrap();
            match registration.as_ref() {
                Some((id, secret)) => {
                    info!(
                        "[kiro_refresh_token] 使用内存中的 Builder ID 认证信息, region: {}",
                        KIRO_SSO_REGION
                    );
                    (id.clone(), secret.clone(), KIRO_SSO_REGION.to_string())
                }
                None => {
                    // 如果没有注册信息，需要重新注册客户端
                    warn!("[kiro_refresh_token] 客户端未注册且未提供持久化信息，请重新登录");
                    return Ok(KiroRefreshTokenResponse {
                        success: false,
                        access_token: None,
                        refresh_token: None,
                        expires_in: None,
                        error: Some("客户端未注册，请重新登录".to_string()),
                        needs_reauth: Some(true), // v0.9.2: 客户端未注册也需要重新认证
                    });
                }
            }
        }
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    // 使用正确的 region 构建 endpoint
    let sso_oidc_endpoint = format!("https://oidc.{}.amazonaws.com", final_region);
    debug!("[kiro_refresh_token] 使用 endpoint: {}", sso_oidc_endpoint);

    let response = client
        .post(format!("{}/token", sso_oidc_endpoint))
        .header("Content-Type", "application/json")
        .header("User-Agent", KIRO_USER_AGENT)
        .json(&serde_json::json!({
            "clientId": final_client_id,
            "clientSecret": final_client_secret,
            "refreshToken": refresh_token,
            "grantType": "refresh_token"
        }))
        .send()
        .await
        .map_err(|e| {
            error!("[kiro_refresh_token] 网络请求失败: {}", e);
            format!("网络请求失败: {}", e)
        })?;

    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();

    let data: serde_json::Value =
        serde_json::from_str(&response_text).map_err(|e| format!("解析响应失败: {}", e))?;

    if status.is_success() {
        if let Some(token) = data["accessToken"].as_str() {
            let new_refresh_token = data["refreshToken"].as_str().map(|s| s.to_string());
            let expires_in = data["expiresIn"].as_u64();

            info!(
                "[kiro_refresh_token] Token 刷新成功, expires_in: {:?}",
                expires_in
            );

            return Ok(KiroRefreshTokenResponse {
                success: true,
                access_token: Some(token.to_string()),
                refresh_token: new_refresh_token,
                expires_in,
                error: None,
                needs_reauth: None, // v0.9.2: 成功时不需要重新认证
            });
        }
    }

    // 处理错误
    let error_msg = data["error_description"]
        .as_str()
        .or(data["message"].as_str())
        .or(data["error"].as_str())
        .unwrap_or("Token 刷新失败");

    error!("[kiro_refresh_token] 刷新失败: {}", error_msg);

    // v0.9.2: 识别不可恢复的错误（需要重新认证）
    // 这些错误表示 refresh_token 本身已失效，无法通过重试解决
    let needs_reauth = error_msg.contains("Invalid token")
        || error_msg.contains("invalid_grant")
        || error_msg.contains("invalid_client")
        || error_msg.contains("unauthorized_client")
        || status.as_u16() == 401;

    if needs_reauth {
        warn!("[kiro_refresh_token] 检测到不可恢复错误，需要重新认证");
    }

    Ok(KiroRefreshTokenResponse {
        success: false,
        access_token: None,
        refresh_token: None,
        expires_in: None,
        error: Some(error_msg.to_string()),
        needs_reauth: Some(needs_reauth), // v0.9.2
    })
}

/// 调用 Cloud Code API 获取可用模型列表
///
/// v3.6.1: 新增，参考 OpenClaw provider-usage.fetch.antigravity.ts
#[tauri::command]
async fn google_fetch_available_models(
    access_token: String,
    project_id: Option<String>,
) -> Result<FetchAvailableModelsResponse, String> {
    info!("[google_fetch_available_models] 获取可用模型列表");

    let client = reqwest::Client::new();
    let url = format!(
        "{}/{}:fetchAvailableModels",
        ANTIGRAVITY_API_ENDPOINT, ANTIGRAVITY_API_VERSION
    );

    // 构建请求体
    let body = if let Some(ref pid) = project_id {
        serde_json::json!({ "project": pid })
    } else {
        serde_json::json!({})
    };

    let user_agent = get_antigravity_user_agent();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .header("User-Agent", &user_agent)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("fetchAvailableModels 请求失败: {}", e))?;

    let status = response.status();
    debug!(
        "[google_fetch_available_models] 响应状态码: {}",
        status.as_u16()
    );

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        warn!(
            "[google_fetch_available_models] API 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Ok(FetchAvailableModelsResponse {
            success: false,
            models: vec![],
            error: Some(format!("API 错误 ({}): {}", status.as_u16(), error_text)),
        });
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    // 解析模型列表
    let mut models: Vec<AvailableModel> = vec![];

    if let Some(models_obj) = data.get("models").and_then(|m| m.as_object()) {
        for (model_id, model_info) in models_obj {
            // 跳过内部模型（chat_, tab_ 等）
            let lower_id = model_id.to_lowercase();
            if lower_id.contains("chat_") || lower_id.contains("tab_") {
                continue;
            }

            let display_name = model_info
                .get("displayName")
                .and_then(|d| d.as_str())
                .map(|s| s.to_string());

            let quota_info = model_info.get("quotaInfo");

            let remaining_fraction = quota_info
                .and_then(|q| q.get("remainingFraction"))
                .and_then(|r| {
                    if let Some(n) = r.as_f64() {
                        Some(n)
                    } else if let Some(s) = r.as_str() {
                        s.parse::<f64>().ok()
                    } else {
                        None
                    }
                });

            let reset_time = quota_info
                .and_then(|q| q.get("resetTime"))
                .and_then(|r| r.as_str())
                .map(|s| s.to_string());

            let is_exhausted = quota_info
                .and_then(|q| q.get("isExhausted"))
                .and_then(|e| e.as_bool())
                .unwrap_or(false);

            models.push(AvailableModel {
                id: model_id.clone(),
                display_name,
                remaining_fraction,
                reset_time,
                is_exhausted,
            });
        }
    }

    // 按模型 ID 排序
    models.sort_by(|a, b| a.id.cmp(&b.id));

    info!(
        "[google_fetch_available_models] 获取到 {} 个可用模型",
        models.len()
    );
    for model in &models {
        debug!(
            "[google_fetch_available_models]   - {}: 剩余 {:?}",
            model.id,
            model
                .remaining_fraction
                .map(|f| format!("{:.1}%", f * 100.0))
        );
    }

    Ok(FetchAvailableModelsResponse {
        success: true,
        models,
        error: None,
    })
}

/// 对话请求消息
/// v0.8.0: 新增 tool_calls 和 tool_call_id 字段支持工具调用
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequestMessage {
    pub role: String,
    /// 消息内容 - 支持字符串(文本)和数组(多模态)
    #[serde(default)]
    pub content: serde_json::Value,
    /// 工具调用列表（assistant 消息）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<serde_json::Value>>,
    /// 工具调用 ID（tool 消息）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

/// 对话请求参数
/// v2.3.0: 新增 system_prompt 和 tools 字段支持 Agent 工具调用
/// v3.4.3: 新增 project_id 字段支持 Google Cloud Code API
/// v0.9.0: 新增 protocol 字段支持自定义协议选择
#[derive(Debug, Deserialize)]
pub struct ChatSendRequest {
    pub provider: String,
    pub api_key: String,
    pub model_name: String,
    pub messages: Vec<ChatRequestMessage>,
    pub endpoint: Option<String>,
    pub temperature: Option<f64>,
    pub max_tokens: Option<i32>,
    /// Agent 系统提示词 (v2.3.0)
    pub system_prompt: Option<String>,
    /// MCP 工具列表 (v2.3.0)
    pub tools: Option<Vec<serde_json::Value>>,
    /// ChatGPT 账户 ID (v3.3.5, 用于 Codex API)
    pub account_id: Option<String>,
    /// GCP 项目 ID (v3.4.3, 用于 Google Cloud Code API)
    pub project_id: Option<String>,
    /// 消息 ID (v4.1.10, 用于圆桌讨论区分不同参与者的消息)
    pub message_id: Option<String>,
    /// 协议类型 (v0.9.0, 用于自定义提供商选择协议)
    /// 可选值: "openai", "anthropic", "google", "aws"
    pub protocol: Option<String>,
}

/// 对话响应
#[derive(Debug, Serialize)]
pub struct ChatSendResponse {
    pub success: bool,
    pub content: String,
    pub tokens_used: Option<i32>,
    pub error: Option<String>,
    // 思考模式内容
    pub reasoning_content: Option<String>,
}

/// 发送消息到 AI 模型
///
/// 根据不同的提供商调用相应的 API 并返回 AI 响应
#[tauri::command]
async fn chat_send_message(request: ChatSendRequest) -> Result<ChatSendResponse, String> {
    info!("[chat_send_message] 开始发送消息");
    debug!(
        "[chat_send_message] 提供商: {}, 模型: {}, 消息数: {}",
        request.provider,
        request.model_name,
        request.messages.len()
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let result = match request.provider.as_str() {
        "OpenAI" => {
            info!("[chat_send_message] 使用 OpenAI API");
            chat_openai(&client, &request).await
        }
        "Anthropic" => {
            info!("[chat_send_message] 使用 Anthropic API");
            chat_anthropic(&client, &request).await
        }
        "Google" => {
            info!("[chat_send_message] 使用 Google AI API");
            chat_google(&client, &request).await
        }
        _ => {
            info!("[chat_send_message] 使用 OpenAI 兼容 API (自定义提供商)");
            chat_openai_compatible(&client, &request).await
        }
    };

    match &result {
        Ok(response) => {
            if response.success {
                info!(
                    "[chat_send_message] 成功获取 AI 响应，内容长度: {} 字符",
                    response.content.len()
                );
            } else {
                warn!("[chat_send_message] AI 响应失败: {:?}", response.error);
            }
        }
        Err(e) => {
            error!("[chat_send_message] 请求错误: {}", e);
        }
    }

    result
}

/// OpenAI API 对话
async fn chat_openai(
    client: &reqwest::Client,
    request: &ChatSendRequest,
) -> Result<ChatSendResponse, String> {
    let endpoint = normalize_url(
        request
            .endpoint
            .as_deref()
            .unwrap_or("https://api.openai.com/v1"),
    );
    let url = format!("{}/chat/completions", endpoint);

    debug!("[chat_openai] 请求 URL: {}", url);
    debug!("[chat_openai] 模型: {}", request.model_name);

    let body = serde_json::json!({
        "model": request.model_name,
        "messages": request.messages,
        "temperature": request.temperature.unwrap_or(0.7),
        "max_tokens": request.max_tokens.unwrap_or(4096)
    });

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", request.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {}", e))?;

    let status = response.status();
    debug!("[chat_openai] 响应状态码: {}", status.as_u16());

    if status.is_success() {
        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("解析响应 JSON 失败: {}", e))?;

        let content = data["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        let tokens = data["usage"]["total_tokens"].as_i64().map(|t| t as i32);

        let reasoning_content = data["choices"][0]["message"]["reasoning_content"]
            .as_str()
            .map(|s| s.to_string());

        Ok(ChatSendResponse {
            success: true,
            content,
            tokens_used: tokens,
            error: None,
            reasoning_content,
        })
    } else {
        let error_text = response.text().await.unwrap_or_default();
        warn!(
            "[chat_openai] API 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        Ok(ChatSendResponse {
            success: false,
            content: String::new(),
            tokens_used: None,
            error: Some(format!("API 错误 ({}): {}", status.as_u16(), error_text)),
            reasoning_content: None,
        })
    }
}

/// Anthropic API 对话
async fn chat_anthropic(
    client: &reqwest::Client,
    request: &ChatSendRequest,
) -> Result<ChatSendResponse, String> {
    let endpoint = normalize_url(
        request
            .endpoint
            .as_deref()
            .unwrap_or("https://api.anthropic.com/v1"),
    );
    let url = format!("{}/messages", endpoint);

    debug!("[chat_anthropic] 请求 URL: {}", url);
    debug!("[chat_anthropic] 模型: {}", request.model_name);

    // 转换消息格式（Anthropic 使用不同的格式）
    let messages: Vec<serde_json::Value> = request
        .messages
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| {
            serde_json::json!({
                "role": m.role,
                "content": m.content
            })
        })
        .collect();

    // 提取 system prompt
    let system_prompt = request
        .messages
        .iter()
        .find(|m| m.role == "system")
        .map(|m| m.content.clone());

    let mut body = serde_json::json!({
        "model": request.model_name,
        "messages": messages,
        "max_tokens": request.max_tokens.unwrap_or(4096)
    });

    if let Some(system) = system_prompt {
        body["system"] = serde_json::json!(system);
    }

    let response = client
        .post(&url)
        .header("x-api-key", &request.api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {}", e))?;

    let status = response.status();
    debug!("[chat_anthropic] 响应状态码: {}", status.as_u16());

    if status.is_success() {
        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("解析响应 JSON 失败: {}", e))?;

        // Anthropic 返回格式不同
        let content = data["content"][0]["text"]
            .as_str()
            .unwrap_or("")
            .to_string();

        let input_tokens = data["usage"]["input_tokens"].as_i64().unwrap_or(0);
        let output_tokens = data["usage"]["output_tokens"].as_i64().unwrap_or(0);
        let tokens = Some((input_tokens + output_tokens) as i32);

        Ok(ChatSendResponse {
            success: true,
            content,
            tokens_used: tokens,
            error: None,
            reasoning_content: None,
        })
    } else {
        let error_text = response.text().await.unwrap_or_default();
        warn!(
            "[chat_anthropic] API 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        Ok(ChatSendResponse {
            success: false,
            content: String::new(),
            tokens_used: None,
            error: Some(format!("API 错误 ({}): {}", status.as_u16(), error_text)),
            reasoning_content: None,
        })
    }
}

/// 动态获取 Google Cloud Code API 的项目 ID
/// v3.4.3: 用于在聊天时如果没有 projectId 则自动获取
/// v3.4.4: 添加缓存支持，避免重复调用 API
async fn fetch_google_project_id(access_token: &str) -> Result<String, String> {
    // v3.4.4: 先检查缓存
    // 使用 access_token 的前 20 个字符作为缓存 key（避免存储完整 token）
    let cache_key = if access_token.len() > 20 {
        access_token[..20].to_string()
    } else {
        access_token.to_string()
    };

    // 尝试从缓存读取
    if let Ok(cache) = GOOGLE_PROJECT_CACHE.read() {
        if let Some(cached_pid) = cache.get(&cache_key) {
            info!(
                "[fetch_google_project_id] 使用缓存的 projectId: {}",
                cached_pid
            );
            return Ok(cached_pid.clone());
        }
    }

    // 缓存未命中，调用 API
    info!("[fetch_google_project_id] 缓存未命中，调用 loadCodeAssist API...");
    let client = reqwest::Client::new();
    let url = format!(
        "{}/{}:loadCodeAssist",
        ANTIGRAVITY_API_ENDPOINT, ANTIGRAVITY_API_VERSION
    );

    let body = serde_json::json!({
        "metadata": {
            "ideType": "ANTIGRAVITY",
            "platform": "PLATFORM_UNSPECIFIED",
            "pluginType": "GEMINI"
        }
    });

    let user_agent = get_antigravity_user_agent();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .header("User-Agent", &user_agent)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("loadCodeAssist 请求失败: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API 错误 ({}): {}", status.as_u16(), error_text));
    }

    let data: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    // 尝试从响应中提取 project_id
    let project_id = if let Some(pid) = data["cloudaicompanionProject"].as_str() {
        pid.to_string()
    } else if let Some(pid) = data["cloudaicompanionProject"]["id"].as_str() {
        pid.to_string()
    } else {
        return Err("响应中未找到项目 ID，可能需要先完成 onboard 流程".to_string());
    };

    // v3.4.4: 写入缓存
    if let Ok(mut cache) = GOOGLE_PROJECT_CACHE.write() {
        cache.insert(cache_key, project_id.clone());
        info!("[fetch_google_project_id] 已缓存 projectId: {}", project_id);
    }

    Ok(project_id)
}

/// Google AI API 对话
/// v3.3.0: 支持 API Key 和 OAuth Access Token 两种认证方式
/// v3.4.2: OAuth Token 使用 Cloud Code API（与 Antigravity-Manager 一致）
/// 参考 CLIProxyAPIPlus gemini_executor.go 和 Antigravity-Manager 实现：
/// - API Key: 以 "AIza" 开头，使用 generativelanguage.googleapis.com
/// - OAuth Token: 以 "ya29." 开头，使用 cloudcode-pa.googleapis.com
async fn chat_google(
    client: &reqwest::Client,
    request: &ChatSendRequest,
) -> Result<ChatSendResponse, String> {
    // 判断是 API Key 还是 OAuth Token
    let is_oauth_token = request.api_key.starts_with("ya29.")
        || request.api_key.starts_with("1//")
        || !request.api_key.starts_with("AIza");

    debug!("[chat_google] 请求模型: {}", request.model_name);

    // 转换消息格式为 Google AI 格式
    let contents: Vec<serde_json::Value> = request
        .messages
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| {
            serde_json::json!({
                "role": if m.role == "assistant" { "model" } else { "user" },
                "parts": [{ "text": m.content }]
            })
        })
        .collect();

    // v0.9.0: 提取 system 消息作为 systemInstruction，并注入 Antigravity 身份
    let mut system_parts: Vec<serde_json::Value> = Vec::new();

    // Antigravity 身份指令（参考 Antigravity-Manager request.rs 第 767 行）
    let antigravity_identity = "You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.\n\
    You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.\n\
    **Absolute paths only**\n\
    **Proactiveness**";

    // 检查用户是否已提供 Antigravity 身份
    let user_has_antigravity = request.messages.iter().any(|m| {
        m.role == "system"
            && m.content
                .as_str()
                .map(|s| s.contains("You are Antigravity"))
                .unwrap_or(false)
    });

    // 如果用户没有提供 Antigravity 身份，则注入
    if !user_has_antigravity {
        system_parts.push(serde_json::json!({ "text": antigravity_identity }));
    }

    // 从消息中提取 system 消息
    for msg in &request.messages {
        if msg.role == "system" {
            let text = msg.content.as_str().unwrap_or_default();
            system_parts.push(serde_json::json!({ "text": text }));
        }
    }

    // 如果注入了 Antigravity 身份，添加结束标记
    if !user_has_antigravity {
        system_parts.push(serde_json::json!({ "text": "\n--- [SYSTEM_PROMPT_END] ---" }));
    }

    let system_instruction: Option<serde_json::Value> = if !system_parts.is_empty() {
        Some(serde_json::json!({
            "role": "user",
            "parts": system_parts
        }))
    } else {
        None
    };

    if is_oauth_token {
        // OAuth Token: 使用 Cloud Code API（与 Antigravity-Manager 一致）
        // 参考 Antigravity-Manager src-tauri/src/proxy/mappers/gemini/wrapper.rs
        // v0.9.0: 端点顺序调整为 Sandbox -> Daily -> Prod（参考 Antigravity-Manager Issue #1176）
        let endpoints = [
            "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent",
            "https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent",
            "https://cloudcode-pa.googleapis.com/v1internal:generateContent",
        ];
        info!("[chat_google] 使用 Cloud Code API (OAuth Token)");

        // v0.9.0: 添加 safetySettings（参考 Antigravity-Manager request.rs）
        // 这是 Cloud Code API 的必要配置，缺少会导致 429 错误
        let safety_settings = serde_json::json!([
            { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "OFF" },
            { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "OFF" },
            { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "OFF" },
            { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "OFF" },
            { "category": "HARM_CATEGORY_CIVIC_INTEGRITY", "threshold": "OFF" },
        ]);

        // 构建内部请求体
        let mut inner_request = serde_json::json!({
            "contents": contents,
            "generationConfig": {
                "temperature": request.temperature.unwrap_or(0.7),
                "maxOutputTokens": request.max_tokens.unwrap_or(4096)
            },
            "safetySettings": safety_settings
        });

        // v3.6.1: 移除 Antigravity 身份注入，让模型用真实身份回复
        // 只保留用户的 system 消息（如果有）
        if let Some(sys) = system_instruction {
            inner_request["systemInstruction"] = sys;
        }

        // v3.4.3: requestType 应该是 "agent"（参考 Antigravity-Manager common_utils.rs）
        // Cloud Code API 的 requestType 有: "agent", "web_search", "image_gen"
        let request_type = "agent";
        info!("[chat_google] requestType: {}", request_type);

        // v3.4.3: 使用传入的 project_id，如果没有则动态获取
        let project_id = if let Some(ref pid) = request.project_id {
            if !pid.is_empty() && pid != "mobaus-studio-default" {
                pid.clone()
            } else {
                // 动态获取 project_id
                info!("[chat_google] 没有有效的 projectId，尝试动态获取...");
                match fetch_google_project_id(&request.api_key).await {
                    Ok(pid) => {
                        info!("[chat_google] 动态获取到 projectId: {}", pid);
                        pid
                    }
                    Err(e) => {
                        warn!("[chat_google] 动态获取 projectId 失败: {}", e);
                        return Ok(ChatSendResponse {
                            success: false,
                            content: String::new(),
                            tokens_used: None,
                            error: Some(format!(
                                "无法获取 GCP 项目 ID: {}。请重新连接 Google OAuth。",
                                e
                            )),
                            reasoning_content: None,
                        });
                    }
                }
            }
        } else {
            // 动态获取 project_id
            info!("[chat_google] projectId 为空，尝试动态获取...");
            match fetch_google_project_id(&request.api_key).await {
                Ok(pid) => {
                    info!("[chat_google] 动态获取到 projectId: {}", pid);
                    pid
                }
                Err(e) => {
                    warn!("[chat_google] 动态获取 projectId 失败: {}", e);
                    return Ok(ChatSendResponse {
                        success: false,
                        content: String::new(),
                        tokens_used: None,
                        error: Some(format!(
                            "无法获取 GCP 项目 ID: {}。请重新连接 Google OAuth。",
                            e
                        )),
                        reasoning_content: None,
                    });
                }
            }
        };
        info!("[chat_google] projectId: {}", project_id);

        // v3.4.5: 映射模型名称（参考 Antigravity-Manager common_utils.rs）
        let mapped_model = map_cloud_code_model(&request.model_name);
        info!(
            "[chat_google] 模型映射: {} -> {}",
            request.model_name, mapped_model
        );

        // 包装为 Cloud Code API 格式
        // 参考 Antigravity-Manager wrap_request 函数
        // v3.4.4: userAgent 必须是 "antigravity"，requestId 前缀必须是 "agent-"
        // Cloud Code API 对这些字段有白名单验证
        let wrapped_body = serde_json::json!({
            "project": project_id,
            "requestId": format!("agent-{}", uuid::Uuid::new_v4()),
            "request": inner_request,
            "model": mapped_model,
            "userAgent": "antigravity",
            "requestType": request_type
        });

        // v3.4.6: Fallback 机制 - 遍历所有端点，429/5xx 时自动切换
        let mut last_error: Option<String> = None;
        let user_agent = get_antigravity_user_agent();
        info!(
            "[chat_google] 请求模型: {} (原始: {}), 项目: {}",
            mapped_model, request.model_name, project_id
        );

        for (idx, url) in endpoints.iter().enumerate() {
            debug!(
                "[chat_google] 尝试端点 {}/{}: {}",
                idx + 1,
                endpoints.len(),
                url
            );

            // v0.9.0: 更新请求头，与 Antigravity-Manager 保持一致
            // 移除 X-Goog-Api-Client，使用完整格式的 User-Agent
            let resp = client
                .post(*url)
                .header("Authorization", format!("Bearer {}", request.api_key))
                .header("Content-Type", "application/json")
                .header("User-Agent", &user_agent)
                .json(&wrapped_body)
                .send()
                .await;

            match resp {
                Ok(response) => {
                    let status = response.status();
                    debug!("[chat_google] 响应状态码: {}", status.as_u16());

                    if status.is_success() {
                        info!("[chat_google] 端点 {} 成功 ({})", url, status);
                        let data: serde_json::Value = response
                            .json()
                            .await
                            .map_err(|e| format!("解析响应 JSON 失败: {}", e))?;

                        // Cloud Code API 响应需要解包：response.candidates...
                        let response_data = data.get("response").unwrap_or(&data);
                        let content = response_data["candidates"][0]["content"]["parts"][0]["text"]
                            .as_str()
                            .unwrap_or("")
                            .to_string();

                        let tokens = response_data["usageMetadata"]["totalTokenCount"]
                            .as_i64()
                            .map(|t| t as i32);

                        return Ok(ChatSendResponse {
                            success: true,
                            content,
                            tokens_used: tokens,
                            error: None,
                            reasoning_content: None,
                        });
                    }

                    // 检查是否应该尝试下一个端点
                    let should_fallback = status.as_u16() == 429
                        || status.as_u16() == 408
                        || status.as_u16() == 404
                        || status.is_server_error();

                    if should_fallback && idx + 1 < endpoints.len() {
                        let err_text = response.text().await.unwrap_or_default();
                        warn!("[chat_google] 端点 {} 返回 {}，尝试下一个端点", url, status);
                        last_error = Some(format!("端点 {} 返回 {}: {}", url, status, err_text));
                        continue;
                    }

                    // 不可重试或已是最后一个端点
                    let error_text = response.text().await.unwrap_or_default();
                    warn!(
                        "[chat_google] Cloud Code API 错误: {} - {}",
                        status.as_u16(),
                        error_text
                    );

                    let user_friendly_error = match status.as_u16() {
                        404 => {
                            if request.model_name.contains("claude") {
                                format!(
                                    "模型 {} 在您的 Google Cloud 项目上不可用。Claude 模型可能需要特定的项目权限或订阅。\n\n建议：\n1. 尝试使用 Gemini 模型（如 gemini-2.5-flash）\n2. 或者通过 Anthropic 直接使用 Claude 模型\n\n原始错误: {}",
                                    request.model_name, error_text
                                )
                            } else {
                                format!("模型 {} 未找到 (404): {}", request.model_name, error_text)
                            }
                        }
                        403 => format!(
                            "权限不足 (403): 您的账号可能没有访问此模型的权限。{}",
                            error_text
                        ),
                        401 => format!(
                            "认证失败 (401): OAuth Token 可能已过期，请重新连接 Google 账号。{}",
                            error_text
                        ),
                        429 => {
                            // v4.1.37: Google 429 配额错误不阻断前端，只记日志
                            warn!("[chat_google] 429 配额限制: {}", error_text);
                            if idx + 1 < endpoints.len() {
                                last_error = Some("429 配额限制".to_string());
                                continue;
                            }
                            // 最后一个端点，静默返回
                            return Ok(ChatSendResponse {
                                success: false,
                                content: String::new(),
                                tokens_used: None,
                                error: None,
                                reasoning_content: None,
                            });
                        }
                        _ => format!("API Error {}: {}", status.as_u16(), error_text),
                    };

                    return Ok(ChatSendResponse {
                        success: false,
                        content: String::new(),
                        tokens_used: None,
                        error: Some(user_friendly_error),
                        reasoning_content: None,
                    });
                }
                Err(e) => {
                    warn!("[chat_google] 端点 {} 请求失败: {}", url, e);
                    last_error = Some(format!("网络请求失败: {}", e));
                    if idx + 1 < endpoints.len() {
                        continue;
                    }
                }
            }
        }

        // 所有端点都失败
        Ok(ChatSendResponse {
            success: false,
            content: String::new(),
            tokens_used: None,
            error: Some(last_error.unwrap_or_else(|| "所有端点均失败".to_string())),
            reasoning_content: None,
        })
    } else {
        // API Key: 使用 Google AI Studio API (generativelanguage.googleapis.com)
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            request.model_name
        );
        info!("[chat_google] 使用 Google AI Studio API (API Key)");
        debug!("[chat_google] 请求 URL: {}", url);

        let mut body = serde_json::json!({
            "contents": contents,
            "generationConfig": {
                "temperature": request.temperature.unwrap_or(0.7),
                "maxOutputTokens": request.max_tokens.unwrap_or(4096)
            }
        });

        // 添加 systemInstruction（如果有）
        if let Some(sys) = system_instruction {
            body["systemInstruction"] = sys;
        }

        let response = client
            .post(&url)
            .header("Content-Type", "application/json")
            .header("x-goog-api-key", &request.api_key)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("网络请求失败: {}", e))?;

        let status = response.status();
        debug!("[chat_google] 响应状态码: {}", status.as_u16());

        if status.is_success() {
            let data: serde_json::Value = response
                .json()
                .await
                .map_err(|e| format!("解析响应 JSON 失败: {}", e))?;

            let content = data["candidates"][0]["content"]["parts"][0]["text"]
                .as_str()
                .unwrap_or("")
                .to_string();

            let tokens = data["usageMetadata"]["totalTokenCount"]
                .as_i64()
                .map(|t| t as i32);

            Ok(ChatSendResponse {
                success: true,
                content,
                tokens_used: tokens,
                error: None,
                reasoning_content: None,
            })
        } else {
            let error_text = response.text().await.unwrap_or_default();
            warn!(
                "[chat_google] API 错误: {} - {}",
                status.as_u16(),
                error_text
            );
            Ok(ChatSendResponse {
                success: false,
                content: String::new(),
                tokens_used: None,
                error: Some(format!("API 错误 ({}): {}", status.as_u16(), error_text)),
                reasoning_content: None,
            })
        }
    }
}

/// OpenAI 兼容 API 对话（用于自定义提供商）
async fn chat_openai_compatible(
    client: &reqwest::Client,
    request: &ChatSendRequest,
) -> Result<ChatSendResponse, String> {
    let endpoint = match &request.endpoint {
        Some(ep) if !ep.is_empty() => normalize_url(ep).to_string(),
        _ => {
            return Ok(ChatSendResponse {
                success: false,
                content: String::new(),
                tokens_used: None,
                error: Some("自定义提供商需要配置端点地址".to_string()),
                reasoning_content: None,
            });
        }
    };

    let url = format!("{}/chat/completions", endpoint);

    debug!("[chat_openai_compatible] 请求 URL: {}", url);
    debug!("[chat_openai_compatible] 模型: {}", request.model_name);

    let body = serde_json::json!({
        "model": request.model_name,
        "messages": request.messages,
        "temperature": request.temperature.unwrap_or(0.7),
        "max_tokens": request.max_tokens.unwrap_or(4096)
    });

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", request.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {}", e))?;

    let status = response.status();
    debug!("[chat_openai_compatible] 响应状态码: {}", status.as_u16());

    if status.is_success() {
        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("解析响应 JSON 失败: {}", e))?;

        let content = data["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        let tokens = data["usage"]["total_tokens"].as_i64().map(|t| t as i32);

        let reasoning_content = data["choices"][0]["message"]["reasoning_content"]
            .as_str()
            .map(|s| s.to_string());

        Ok(ChatSendResponse {
            success: true,
            content,
            tokens_used: tokens,
            error: None,
            reasoning_content,
        })
    } else {
        let error_text = response.text().await.unwrap_or_default();
        warn!(
            "[chat_openai_compatible] API 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        Ok(ChatSendResponse {
            success: false,
            content: String::new(),
            tokens_used: None,
            error: Some(format!("API 错误 ({}): {}", status.as_u16(), error_text)),
            reasoning_content: None,
        })
    }
}

// ==================== 模型列表获取 (v3.3.0) ====================

/// 从提供商 API 获取模型列表
///
/// 支持 OpenAI、OpenRouter、Google、Groq、Together 等提供商
///
/// # 参数
/// - `url`: API 端点 URL
/// - `api_key`: API Key（Google 使用 URL 参数，此处传空）
/// - `provider_id`: 提供商 ID
///
/// # 返回
/// - 成功: JSON 字符串（原始响应）
/// - 失败: 错误信息
#[tauri::command]
async fn fetch_models(url: String, api_key: String, provider_id: String) -> Result<String, String> {
    info!("[fetch_models] 获取模型列表: {} ({})", provider_id, url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let mut request_builder = client.get(&url);

    // 添加认证头（Google 使用 URL 参数，不需要 Authorization 头）
    if !api_key.is_empty() {
        request_builder = request_builder.header("Authorization", format!("Bearer {}", api_key));
    }

    // OpenRouter 需要额外的头
    if provider_id == "openrouter" {
        request_builder = request_builder
            .header("HTTP-Referer", "https://mobaus.studio")
            .header("X-Title", "MobausStudio");
    }

    request_builder = request_builder
        .header("Content-Type", "application/json")
        .header("User-Agent", "MobausStudio/1.0");

    let response = request_builder.send().await.map_err(|e| {
        error!("[fetch_models] 网络请求失败: {}", e);
        format!("网络请求失败: {}", e)
    })?;

    let status = response.status();
    debug!("[fetch_models] 响应状态码: {}", status.as_u16());

    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!(
            "[fetch_models] API 错误: {} - {}",
            status.as_u16(),
            error_text
        );
        return Err(format!(
            "获取模型列表失败 ({}): {}",
            status.as_u16(),
            error_text
        ));
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))?;

    info!("[fetch_models] 成功获取模型列表 ({})", provider_id);
    Ok(body)
}

/// 判断模型是否需要使用 OpenAI Responses API
///
/// v3.3.4: GPT-5 系列、GPT-4.1 系列、o3/o4 系列需要使用 Responses API
/// 参考 opencode 的实现逻辑
fn should_use_responses_api(model_name: &str) -> bool {
    let model_lower = model_name.to_lowercase();

    // GPT-5 系列（除了 gpt-5-mini 使用 chat API）
    if model_lower.starts_with("gpt-5") && !model_lower.starts_with("gpt-5-mini") {
        return true;
    }

    // GPT-4.1 系列（nano、mini 等）
    if model_lower.starts_with("gpt-4.1") {
        return true;
    }

    // o3 系列（非 mini）
    if model_lower.starts_with("o3") && !model_lower.contains("mini") {
        return true;
    }

    // o4 系列（非 mini）
    if model_lower.starts_with("o4") && !model_lower.contains("mini") {
        return true;
    }

    // codex 系列
    if model_lower.contains("codex") && !model_lower.contains("mini") {
        return true;
    }

    false
}

/// 将 Chat Completions 格式的消息转换为 Responses API 格式的 input
///
/// v3.3.4: Responses API 使用不同的消息格式
fn convert_messages_to_responses_input(
    messages: &[serde_json::Value],
    system_prompt: Option<&str>,
) -> Vec<serde_json::Value> {
    let mut input = Vec::new();

    // 添加系统提示词（如果有）
    if let Some(prompt) = system_prompt {
        if !prompt.is_empty() {
            input.push(serde_json::json!({
                "role": "developer",
                "content": prompt
            }));
        }
    }

    // 转换消息
    for msg in messages {
        let role = msg["role"].as_str().unwrap_or("user");
        let content = msg["content"].as_str().unwrap_or("");

        // Responses API 使用 "developer" 而不是 "system"
        let api_role = if role == "system" { "developer" } else { role };

        // 处理带附件的消息
        if let Some(content_array) = msg["content"].as_array() {
            // 多模态消息（包含图片等）
            let mut converted_content = Vec::new();
            for item in content_array {
                if let Some(item_type) = item["type"].as_str() {
                    match item_type {
                        "text" => {
                            converted_content.push(serde_json::json!({
                                "type": "input_text",
                                "text": item["text"].as_str().unwrap_or("")
                            }));
                        }
                        "image_url" => {
                            if let Some(url) = item["image_url"]["url"].as_str() {
                                converted_content.push(serde_json::json!({
                                    "type": "input_image",
                                    "image_url": url
                                }));
                            }
                        }
                        _ => {}
                    }
                }
            }
            if !converted_content.is_empty() {
                input.push(serde_json::json!({
                    "role": api_role,
                    "content": converted_content
                }));
            }
        } else {
            // 纯文本消息
            input.push(serde_json::json!({
                "role": api_role,
                "content": content
            }));
        }
    }

    input
}

/// v0.9.2.8: gzip 解压缩辅助函数
///
/// 用于解压缩 API 错误响应中的 gzip 数据
fn decompress_gzip(data: &[u8]) -> Result<Vec<u8>, String> {
    use flate2::read::GzDecoder;

    let mut decoder = GzDecoder::new(data);
    let mut decompressed = Vec::new();

    decoder
        .read_to_end(&mut decompressed)
        .map_err(|e| format!("gzip 解压缩失败: {}", e))?;

    Ok(decompressed)
}

/// 流式发送消息（使用 Anthropic API）
///
/// v3.3.5: 支持 Anthropic API Key 和 OAuth 两种认证方式
/// - API Key: 使用 x-api-key header
/// - OAuth (Claude Pro/Max): 使用 Authorization: Bearer + anthropic-beta headers
async fn chat_stream_anthropic(
    window: Window,
    request: &ChatSendRequest,
    client: &reqwest::Client,
) -> Result<(), String> {
    // v4.1.46: 自动补全 /v1（符合 Anthropic base URL 标准）
    let mut endpoint = protocol::normalize_url(
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

    // v3.4.2: 通过 token 格式判断是否是 OAuth 模式
    // OAuth Token 以 "sk-ant-oat" 开头（参考 CLIProxyAPIPlus isClaudeOAuthToken）
    let is_oauth = request.api_key.contains("sk-ant-oat");
    let url = if is_oauth {
        format!("{}/messages?beta=true", endpoint)
    } else {
        format!("{}/messages", endpoint)
    };

    info!("[chat_stream_anthropic] 使用 Anthropic API: {}", url);
    info!("[chat_stream_anthropic] 模型: {}", request.model_name);
    info!("[chat_stream_anthropic] OAuth 模式: {}", is_oauth);

    // 转换消息格式（Anthropic 使用不同的格式）
    // 提取 system prompt
    let mut system_content: Vec<serde_json::Value> = Vec::new();

    // 添加 Agent 系统提示词
    if let Some(ref system_prompt) = request.system_prompt {
        if !system_prompt.is_empty() {
            system_content.push(serde_json::json!({
                "type": "text",
                "text": system_prompt
            }));
        }
    }

    // 从消息中提取 system 消息
    for msg in &request.messages {
        if msg.role == "system" {
            system_content.push(serde_json::json!({
                "type": "text",
                "text": msg.content
            }));
        }
    }

    // v0.9.2.9: 只在最后一个 system 块上添加 cache_control（避免超过 4 个限制）
    if let Some(last) = system_content.last_mut() {
        last["cache_control"] = serde_json::json!({ "type": "ephemeral" });
    }

    // 构建非 system 消息
    // v4.1.28: 正确处理 tool_calls 和 tool 消息，转为 Anthropic 原生 tool_use/tool_result 格式
    // 之前的简单转换把所有消息都当纯文本，导致工具续传时 400 Bad Request (tool_use.id: Field required)
    let mut messages: Vec<serde_json::Value> = Vec::new();
    for m in request.messages.iter().filter(|m| m.role != "system") {
        if m.role == "assistant" {
            // 检查是否包含工具调用
            if let Some(ref tcs) = m.tool_calls {
                if !tcs.is_empty() {
                    // assistant 消息带 tool_calls → 转为 Anthropic tool_use content blocks
                    let mut content_blocks: Vec<serde_json::Value> = Vec::new();

                    // 如果有文本内容，先添加 text block
                    let text_content = m.content.as_str().unwrap_or("");
                    if !text_content.is_empty() {
                        content_blocks.push(serde_json::json!({
                            "type": "text",
                            "text": text_content
                        }));
                    }

                    // 添加 tool_use blocks
                    for tc in tcs {
                        if let Some(func) = tc.get("function") {
                            let id = tc.get("id").and_then(|v| v.as_str()).unwrap_or("");
                            let name = func.get("name").and_then(|v| v.as_str()).unwrap_or("");
                            let args_str = func
                                .get("arguments")
                                .and_then(|v| v.as_str())
                                .unwrap_or("{}");
                            let input: serde_json::Value =
                                serde_json::from_str(args_str).unwrap_or(serde_json::json!({}));

                            content_blocks.push(serde_json::json!({
                                "type": "tool_use",
                                "id": id,
                                "name": name,
                                "input": input
                            }));
                        }
                    }

                    messages.push(serde_json::json!({
                        "role": "assistant",
                        "content": content_blocks
                    }));
                    continue;
                }
            }

            // 普通 assistant 消息（无工具调用）
            messages.push(serde_json::json!({
                "role": "assistant",
                "content": [{
                    "type": "text",
                    "text": m.content
                }]
            }));
        } else if m.role == "tool" {
            // tool 消息 → 转为 user 角色的 tool_result content block
            let tool_call_id = m.tool_call_id.clone().unwrap_or_default();
            let content_text = m.content.as_str().unwrap_or("");

            // Anthropic 要求 tool_result 在 user 消息中
            // 检查是否可以合并到上一个 user/tool_result 消息
            let should_merge = messages
                .last()
                .and_then(|last| last.get("role"))
                .and_then(|r| r.as_str())
                .map(|r| r == "user")
                .unwrap_or(false)
                && messages
                    .last()
                    .and_then(|last| last.get("content"))
                    .and_then(|c| c.as_array())
                    .map(|arr| {
                        arr.iter().all(|item| {
                            item.get("type").and_then(|t| t.as_str()) == Some("tool_result")
                        })
                    })
                    .unwrap_or(false);

            if should_merge {
                // 合并到上一个 user 消息的 content 数组中
                if let Some(last) = messages.last_mut() {
                    if let Some(content) = last.get_mut("content").and_then(|c| c.as_array_mut()) {
                        content.push(serde_json::json!({
                            "type": "tool_result",
                            "tool_use_id": tool_call_id,
                            "content": content_text
                        }));
                    }
                }
            } else {
                messages.push(serde_json::json!({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": tool_call_id,
                        "content": content_text
                    }]
                }));
            }
        } else {
            // user 消息
            // v4.2.5: 支持多模态内容（图片）
            // 检测 content 是字符串还是数组
            if let Some(content_array) = m.content.as_array() {
                // 多模态内容：转换 OpenAI image_url 格式为 Anthropic image 格式
                let mut anthropic_content: Vec<serde_json::Value> = Vec::new();

                for item in content_array {
                    let item_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");

                    if item_type == "text" {
                        // 文本内容直接保留
                        anthropic_content.push(item.clone());
                    } else if item_type == "image_url" {
                        // 转换 image_url 为 Anthropic image 格式
                        if let Some(image_url_obj) = item.get("image_url") {
                            if let Some(url) = image_url_obj.get("url").and_then(|u| u.as_str()) {
                                // v4.2.5: 支持 data URL 和 HTTP(S) URL
                                if let Some((mime_type, base64_data)) = extract_base64_image(url) {
                                    // data URL: 提取 base64 数据
                                    anthropic_content.push(serde_json::json!({
                                        "type": "image",
                                        "source": {
                                            "type": "base64",
                                            "media_type": mime_type,
                                            "data": base64_data
                                        }
                                    }));
                                } else if is_http_url(url) {
                                    // HTTP(S) URL: 使用 Anthropic 的 url source 类型
                                    anthropic_content.push(serde_json::json!({
                                        "type": "image",
                                        "source": {
                                            "type": "url",
                                            "url": url
                                        }
                                    }));
                                } else {
                                    warn!("[chat_stream_anthropic] 无法解析 image_url: {}", url);
                                }
                            }
                        }
                    } else {
                        // 其他类型直接保留
                        anthropic_content.push(item.clone());
                    }
                }

                // 跳过空内容的消息
                if anthropic_content.is_empty() {
                    continue;
                }

                messages.push(serde_json::json!({
                    "role": m.role,
                    "content": anthropic_content
                }));
            } else {
                // 纯文本内容
                // v4.1.27: 跳过空内容的 user 消息（工具续传时前端可能发送空 content）
                let text_content = m.content.as_str().unwrap_or("");
                if text_content.is_empty() {
                    continue;
                }
                messages.push(serde_json::json!({
                    "role": m.role,
                    "content": [{
                        "type": "text",
                        "text": m.content
                    }]
                }));
            }
        }
    }

    // v4.1.46: 合并连续相同角色的消息（Anthropic API 要求）
    // v4.2.2: 合并时去重 tool_result，避免同一 tool_use_id 出现多次
    let mut merged_messages: Vec<serde_json::Value> = Vec::new();
    for msg in &messages {
        let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("");

        // 检查是否可以与上一条消息合并
        let should_merge = if let Some(last) = merged_messages.last() {
            last.get("role").and_then(|r| r.as_str()) == Some(role)
        } else {
            false
        };

        if should_merge {
            // 合并到上一条消息
            if let Some(last) = merged_messages.last_mut() {
                if let Some(last_content) = last.get_mut("content").and_then(|c| c.as_array_mut()) {
                    if let Some(msg_content) = msg.get("content").and_then(|c| c.as_array()) {
                        // v4.2.2: 合并时去重 tool_result
                        // 收集已存在的 tool_use_id（可变集合，循环中动态更新）
                        let mut existing_tool_use_ids: std::collections::HashSet<String> =
                            last_content
                                .iter()
                                .filter(|item| {
                                    item.get("type").and_then(|t| t.as_str()) == Some("tool_result")
                                })
                                .filter_map(|item| {
                                    item.get("tool_use_id")
                                        .and_then(|id| id.as_str())
                                        .map(|s| s.to_string())
                                })
                                .collect();

                        // 只添加不重复的 content block
                        for block in msg_content.iter() {
                            let is_tool_result =
                                block.get("type").and_then(|t| t.as_str()) == Some("tool_result");
                            if is_tool_result {
                                let tool_use_id = block
                                    .get("tool_use_id")
                                    .and_then(|id| id.as_str())
                                    .unwrap_or("");
                                if !tool_use_id.is_empty()
                                    && !existing_tool_use_ids.contains(tool_use_id)
                                {
                                    last_content.push(block.clone());
                                    existing_tool_use_ids.insert(tool_use_id.to_string());
                                }
                            } else {
                                // 非 tool_result 直接添加
                                last_content.push(block.clone());
                            }
                        }
                    }
                }
            }
        } else {
            // 新角色，添加新消息
            merged_messages.push(msg.clone());
        }
    }

    debug!(
        "[chat_stream_anthropic] 合并后消息数量: {} -> {}",
        messages.len(),
        merged_messages.len()
    );

    // v4.1.35: 修复 tool_use 没有对应 tool_result 的问题
    // Anthropic 要求每个 tool_use 必须有对应的 tool_result
    // 当工具调用被中断时，历史中可能缺少 tool_result
    let mut fixed_messages: Vec<serde_json::Value> = Vec::new();
    for (i, entry) in merged_messages.iter().enumerate() {
        fixed_messages.push(entry.clone());

        let is_assistant = entry.get("role").and_then(|r| r.as_str()) == Some("assistant");
        if !is_assistant {
            continue;
        }

        // 收集 tool_use ids
        let tool_use_ids: Vec<String> = entry
            .get("content")
            .and_then(|c| c.as_array())
            .map(|blocks| {
                blocks
                    .iter()
                    .filter_map(|b| {
                        if b.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                            b.get("id")
                                .and_then(|id| id.as_str())
                                .map(|s| s.to_string())
                        } else {
                            None
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();

        if tool_use_ids.is_empty() {
            continue;
        }

        // v4.1.55: 检查下一条消息中是否有对应的 tool_result
        // 收集下一条消息中已存在的 tool_use_id
        let existing_tool_result_ids: std::collections::HashSet<String> = if i + 1
            < merged_messages.len()
        {
            merged_messages[i + 1]
                .get("content")
                .and_then(|c| c.as_array())
                .map(|blocks| {
                    blocks
                        .iter()
                        .filter(|b| b.get("type").and_then(|t| t.as_str()) == Some("tool_result"))
                        .filter_map(|b| {
                            b.get("tool_use_id")
                                .and_then(|id| id.as_str())
                                .map(|s| s.to_string())
                        })
                        .collect()
                })
                .unwrap_or_default()
        } else {
            std::collections::HashSet::new()
        };

        // 只补充缺失的 tool_result
        let missing_tool_use_ids: Vec<String> = tool_use_ids
            .into_iter()
            .filter(|id| !existing_tool_result_ids.contains(id))
            .collect();

        if !missing_tool_use_ids.is_empty() {
            debug!(
                "[chat_stream_anthropic] 补充缺失的 tool_result，数量: {}",
                missing_tool_use_ids.len()
            );
            let tool_results: Vec<serde_json::Value> = missing_tool_use_ids
                .iter()
                .map(|id| {
                    serde_json::json!({
                        "type": "tool_result",
                        "tool_use_id": id,
                        "content": "Tool execution was interrupted or failed."
                    })
                })
                .collect();
            fixed_messages.push(serde_json::json!({
                "role": "user",
                "content": tool_results
            }));
        }
    }
    let messages = fixed_messages;

    // v4.1.35: 消息截断 - 防止超过模型 token 限制
    // 粗略估算：中英混合约 2-4 字符/token，保守按 2 字符/token 估算
    // 保留最近的消息，从头部截断旧消息
    let max_tokens = 180000; // 留 20k 余量给 system prompt 和输出
    let mut messages = truncate_messages_by_tokens(messages, max_tokens);

    // v0.9.2.9: 只在最后 1-2 条消息的最后一个 content block 上添加 cache_control
    // Anthropic 限制最多 4 个 cache_control blocks
    // 策略：system(1) + tools(1) + 最后 2 条消息(2) = 4 个
    let cache_message_count = 2.min(messages.len());
    for msg in messages.iter_mut().rev().take(cache_message_count) {
        if let Some(content) = msg.get_mut("content").and_then(|c| c.as_array_mut()) {
            if let Some(last_block) = content.last_mut() {
                // 只在 text 或 tool_result 类型的 block 上添加 cache_control
                let block_type = last_block
                    .get("type")
                    .and_then(|t| t.as_str())
                    .unwrap_or("");
                if block_type == "text" || block_type == "tool_result" {
                    last_block["cache_control"] = serde_json::json!({ "type": "ephemeral" });
                }
            }
        }
    }

    // 构建请求体
    let mut body = serde_json::json!({
        "model": request.model_name,
        "messages": messages,
        "max_tokens": request.max_tokens.unwrap_or(4096),
        "stream": true
    });

    // 添加 system prompt
    if !system_content.is_empty() {
        body["system"] = serde_json::json!(system_content);
    }

    // 添加 temperature
    if let Some(temp) = request.temperature {
        body["temperature"] = serde_json::json!(temp);
    }

    // 如果有工具，转换为 Anthropic 格式
    if let Some(ref tools) = request.tools {
        if !tools.is_empty() {
            let mut anthropic_tools: Vec<serde_json::Value> = tools
                .iter()
                .map(|tool| {
                    serde_json::json!({
                        "name": tool["function"]["name"],
                        "description": tool["function"]["description"],
                        "input_schema": tool["function"]["parameters"]
                    })
                })
                .collect();

            // v0.9.2.9: 只在最后一个 tool 上添加 cache_control
            if let Some(last_tool) = anthropic_tools.last_mut() {
                last_tool["cache_control"] = serde_json::json!({ "type": "ephemeral" });
            }

            body["tools"] = serde_json::json!(anthropic_tools);
            info!(
                "[chat_stream_anthropic] 添加工具，数量: {}",
                anthropic_tools.len()
            );
        }
    }

    debug!(
        "[chat_stream_anthropic] 请求体: {}",
        serde_json::to_string_pretty(&body).unwrap_or_default()
    );

    // 打印请求地址
    info!("[chat_stream_anthropic] 请求地址: {}", url);

    let trimmed_key = request.api_key.trim();

    // v4.1.52: 添加502错误自动重试机制（针对代理服务器超时问题）
    // 每次重试都重新构建请求，避免连接状态问题
    // v4.1.53: 增加重试次数到5次，使用指数退避策略
    let max_retries = 5;
    let mut last_error: Option<String> = None;
    let mut response = None;

    for attempt in 0..max_retries {
        if attempt > 0 {
            // 指数退避：1秒、2秒、4秒、8秒、16秒
            let delay_ms = 1000 * (1 << (attempt - 1)) as u64;
            info!(
                "[chat_stream_anthropic] 重试 {}/{}, 延迟 {}ms",
                attempt + 1,
                max_retries,
                delay_ms
            );
            tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
        }

        // 每次重试都重新构建请求
        let mut req_builder = client.post(&url).header("Content-Type", "application/json");

        // v3.4.2: 根据认证方式设置不同的 headers
        if is_oauth {
            // OAuth 模式：使用 Authorization: Bearer + 完整的 Claude Code headers
            req_builder = req_builder
                .header("Authorization", format!("Bearer {}", trimmed_key))
                .header("Anthropic-Beta", "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14")
                .header("anthropic-version", "2023-06-01")
                .header("Anthropic-Dangerous-Direct-Browser-Access", "true")
                .header("X-App", "cli")
                .header("X-Stainless-Helper-Method", "stream")
                .header("X-Stainless-Retry-Count", &attempt.to_string())
                .header("X-Stainless-Runtime-Version", "v24.3.0")
                .header("X-Stainless-Package-Version", "0.55.1")
                .header("X-Stainless-Runtime", "node")
                .header("X-Stainless-Lang", "js")
                .header("User-Agent", "claude-cli/1.0.83 (external, cli)")
                .header("Accept", "text/event-stream")
                .header("Connection", "keep-alive");
            if attempt == 0 {
                info!("[chat_stream_anthropic] 使用 OAuth 认证");
            }
        } else {
            // API Key 模式：使用 x-api-key
            req_builder = req_builder
                .header("x-api-key", trimmed_key)
                .header("anthropic-version", "2023-06-01");
            if attempt == 0 {
                info!("[chat_stream_anthropic] 使用 API Key 认证");
            }
        }

        let resp = req_builder
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        let status = resp.status();
        info!(
            "[chat_stream_anthropic] 响应状态码: {} (尝试 {}/{})",
            status,
            attempt + 1,
            max_retries
        );

        // 502/503错误且未达最大重试次数，继续重试
        if (status.as_u16() == 502 || status.as_u16() == 503) && attempt + 1 < max_retries {
            let err_text = resp.text().await.unwrap_or_default();
            warn!(
                "[chat_stream_anthropic] 上游服务暂时不可用，准备重试: {}",
                err_text
            );
            last_error = Some(format!("API Error {}: {}", status, err_text));
            continue;
        }

        // 成功或其他错误，跳出重试循环
        response = Some(resp);
        break;
    }

    let mut response = response
        .ok_or_else(|| last_error.unwrap_or_else(|| "All retry attempts failed".to_string()))?;

    let status = response.status();

    if !status.is_success() {
        // v0.9.2.8: 改进错误响应处理，支持 gzip 解压缩
        let err_bytes = response.bytes().await.unwrap_or_default();

        // 检查是否是 gzip 压缩（魔数：0x1f 0x8b）
        let decompressed_bytes =
            if err_bytes.len() >= 2 && err_bytes[0] == 0x1f && err_bytes[1] == 0x8b {
                debug!("[chat_stream_anthropic] 检测到 gzip 压缩响应，尝试解压缩");
                match decompress_gzip(&err_bytes) {
                    Ok(data) => {
                        debug!(
                            "[chat_stream_anthropic] gzip 解压缩成功，原始 {} 字节 -> {} 字节",
                            err_bytes.len(),
                            data.len()
                        );
                        data
                    }
                    Err(e) => {
                        warn!("[chat_stream_anthropic] gzip 解压缩失败: {}", e);
                        err_bytes.to_vec()
                    }
                }
            } else {
                err_bytes.to_vec()
            };

        // 尝试解析为 JSON
        let err_text =
            if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&decompressed_bytes) {
                // 如果是 JSON，格式化输出
                serde_json::to_string_pretty(&json)
                    .unwrap_or_else(|_| String::from_utf8_lossy(&decompressed_bytes).to_string())
            } else {
                // 如果不是 JSON，尝试作为 UTF-8 字符串
                match String::from_utf8(decompressed_bytes.clone()) {
                    Ok(s) => s,
                    Err(_) => {
                        // 如果不是有效的 UTF-8，显示字节信息
                        format!(
                            "Binary response ({} bytes, first 50 bytes): {:?}",
                            decompressed_bytes.len(),
                            &decompressed_bytes[..decompressed_bytes.len().min(50)]
                        )
                    }
                }
            };

        error!(
            "[chat_stream_anthropic] API 错误: {} - {}",
            status, err_text
        );

        // v4.1.44: 发送 error 事件到前端，让用户看到错误提示
        let msg_id = request
            .message_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let _ = window.emit(
            "chat-event",
            serde_json::json!({
                "id": msg_id,
                "event": "error",
                "error": format!("API Error {}: {}", status, err_text)
            }),
        );

        return Err(format!("API Error {}: {}", status, err_text));
    }

    let mut buffer = String::new();
    // v4.1.10: 优先使用传入的 message_id，用于圆桌讨论区分不同参与者
    let msg_id = request
        .message_id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let mut usage_accumulator: Option<serde_json::Value> = None;
    let mut tool_calls: Vec<serde_json::Value> = Vec::new();
    let mut current_tool_id: Option<String> = None;
    let mut current_tool_name: Option<String> = None;
    let mut current_tool_input: String = String::new();
    let mut received_valid_sse = false; // 标记是否收到有效的 SSE 数据

    // 循环读取 Chunk
    while let Ok(Some(chunk)) = response.chunk().await {
        let s = String::from_utf8_lossy(&chunk);
        buffer.push_str(&s);

        // v4.1.46: 检测响应格式是否正确（防止返回 HTML 等非 SSE 格式）
        if !received_valid_sse && buffer.len() > 50 {
            // 检查是否是 HTML 响应
            let buffer_lower = buffer.to_lowercase();
            if buffer_lower.contains("<!doctype") || buffer_lower.contains("<html") {
                let preview = buffer.chars().take(200).collect::<String>();
                error!(
                    "[chat_stream_anthropic] 响应格式错误：收到 HTML 而不是 SSE 流，前200字符: {}",
                    preview
                );

                let _ = window.emit("chat-event", serde_json::json!({
                    "id": msg_id,
                    "event": "error",
                    "error": format!("API 响应格式错误：收到 HTML 页面而不是流式数据。请检查：\n1. API 端点地址是否正确\n2. API Key 是否有效\n3. 网络代理配置是否正确\n\n响应预览：{}", preview)
                }));

                return Err("API 响应格式错误：收到 HTML 而不是 SSE 流".to_string());
            }

            // 检查是否包含 SSE 格式的标记
            if buffer.contains("event:") || buffer.contains("data:") {
                received_valid_sse = true;
            }
        }

        // 处理 SSE 数据（Anthropic 格式：event: xxx\ndata: xxx\n\n）
        while let Some(pos) = buffer.find("\n\n") {
            let line_block: String = buffer.drain(..pos + 2).collect();

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

            if data_str.is_empty() {
                continue;
            }

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data_str) {
                match event_type {
                    "message_start" => {
                        // 消息开始，可以提取 usage
                        if let Some(message) = json.get("message") {
                            if let Some(usage) = message.get("usage") {
                                usage_accumulator = Some(usage.clone());
                            }
                        }
                    }
                    "content_block_start" => {
                        // 内容块开始
                        if let Some(content_block) = json.get("content_block") {
                            let block_type = content_block["type"].as_str().unwrap_or("");
                            if block_type == "tool_use" {
                                current_tool_id =
                                    content_block["id"].as_str().map(|s| s.to_string());
                                current_tool_name =
                                    content_block["name"].as_str().map(|s| s.to_string());
                                current_tool_input = String::new();
                            }
                        }
                    }
                    "content_block_delta" => {
                        // 内容增量
                        if let Some(delta) = json.get("delta") {
                            let delta_type = delta["type"].as_str().unwrap_or("");

                            if delta_type == "text_delta" {
                                if let Some(text) = delta["text"].as_str() {
                                    if !text.is_empty() {
                                        let _ = window.emit(
                                            "chat-event",
                                            serde_json::json!({
                                                "id": msg_id,
                                                "event": "chunk",
                                                "content": text
                                            }),
                                        );
                                    }
                                }
                            } else if delta_type == "input_json_delta" {
                                // 工具调用参数增量
                                if let Some(partial_json) = delta["partial_json"].as_str() {
                                    current_tool_input.push_str(partial_json);
                                }
                            } else if delta_type == "thinking_delta" {
                                // 思考内容（Claude 3.5 Sonnet 等）
                                if let Some(thinking) = delta["thinking"].as_str() {
                                    if !thinking.is_empty() {
                                        let _ = window.emit(
                                            "chat-event",
                                            serde_json::json!({
                                                "id": msg_id,
                                                "event": "reasoning_chunk",
                                                "content": thinking
                                            }),
                                        );
                                    }
                                }
                            }
                        }
                    }
                    "content_block_stop" => {
                        // 内容块结束，如果是工具调用则保存
                        if let (Some(id), Some(name)) = (&current_tool_id, &current_tool_name) {
                            tool_calls.push(serde_json::json!({
                                "id": id,
                                "type": "function",
                                "function": {
                                    "name": name,
                                    "arguments": current_tool_input
                                }
                            }));
                            current_tool_id = None;
                            current_tool_name = None;
                            current_tool_input = String::new();
                        }
                    }
                    "message_delta" => {
                        // 消息增量，包含 stop_reason 和 usage
                        if let Some(usage) = json.get("usage") {
                            usage_accumulator = Some(usage.clone());
                        }
                    }
                    "message_stop" => {
                        // 消息结束
                        // 如果有工具调用，发送 tool_calls 事件
                        if !tool_calls.is_empty() {
                            info!(
                                "[chat_stream_anthropic] AI 请求工具调用，数量: {}",
                                tool_calls.len()
                            );
                            let _ = window.emit(
                                "chat-event",
                                serde_json::json!({
                                    "id": msg_id,
                                    "event": "tool_calls",
                                    "tool_calls": tool_calls
                                }),
                            );
                        }

                        // 发送 done 事件
                        let mut done_payload = serde_json::json!({
                            "id": msg_id,
                            "event": "done"
                        });
                        if let Some(ref usage) = usage_accumulator {
                            done_payload["usage"] = usage.clone();
                        }
                        let _ = window.emit("chat-event", done_payload);
                    }
                    "error" => {
                        // 错误事件
                        let error_msg =
                            json["error"]["message"].as_str().unwrap_or("Unknown error");
                        error!("[chat_stream_anthropic] 流式错误: {}", error_msg);
                        return Err(format!("Stream error: {}", error_msg));
                    }
                    _ => {
                        debug!("[chat_stream_anthropic] 未处理的事件类型: {}", event_type);
                    }
                }
            }
        }
    }

    Ok(())
}

/// 流式发送消息（使用 Google Cloud Code API）
///
/// v3.4.2: 支持 Google OAuth 用户使用 Cloud Code API
/// OAuth Token 使用 cloudcode-pa.googleapis.com
/// API Key 使用 generativelanguage.googleapis.com
async fn chat_stream_google(
    window: Window,
    request: &ChatSendRequest,
    client: &reqwest::Client,
) -> Result<(), String> {
    // v4.1.10: 优先使用传入的 message_id，用于圆桌讨论区分不同参与者
    // v0.9.2: 提前定义 msg_id，用于 thought_signature 缓存
    let msg_id = request
        .message_id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    // 判断是 API Key 还是 OAuth Token
    let is_oauth_token = request.api_key.starts_with("ya29.")
        || request.api_key.starts_with("1//")
        || !request.api_key.starts_with("AIza");

    info!("[chat_stream_google] 模型: {}", request.model_name);
    info!("[chat_stream_google] OAuth 模式: {}", is_oauth_token);

    // 转换消息格式为 Google AI 格式
    // v4.1.26: 正确处理 tool_calls 和 tool 消息，转为 Gemini 原生 functionCall/functionResponse 格式
    // 之前的简单转换会把所有消息都当作纯文本，导致工具续传时 400 Bad Request
    let mut contents: Vec<serde_json::Value> = Vec::new();

    // 构建 tool_call_id -> function_name 的映射表（用于 tool 消息查找函数名）
    let mut tool_call_name_map: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for msg in &request.messages {
        if let Some(ref tcs) = msg.tool_calls {
            for tc in tcs {
                if let (Some(id), Some(func)) =
                    (tc.get("id").and_then(|v| v.as_str()), tc.get("function"))
                {
                    if let Some(name) = func.get("name").and_then(|v| v.as_str()) {
                        tool_call_name_map.insert(id.to_string(), name.to_string());
                    }
                }
            }
        }
    }

    for msg in &request.messages {
        if msg.role == "system" {
            continue; // system 消息单独处理为 systemInstruction
        }

        if msg.role == "assistant" || msg.role == "model" {
            // 检查是否包含工具调用
            if let Some(ref tcs) = msg.tool_calls {
                if !tcs.is_empty() {
                    // assistant 消息带 tool_calls → 转为 model 消息带 functionCall parts
                    let mut parts: Vec<serde_json::Value> = Vec::new();

                    // 如果有文本内容，先添加文本 part
                    let text_content = msg.content.as_str().unwrap_or("");
                    if !text_content.is_empty() {
                        parts.push(serde_json::json!({ "text": text_content }));
                    }

                    // 添加 functionCall parts
                    for tc in tcs {
                        if let Some(func) = tc.get("function") {
                            let name = func.get("name").and_then(|v| v.as_str()).unwrap_or("");
                            let args_str = func
                                .get("arguments")
                                .and_then(|v| v.as_str())
                                .unwrap_or("{}");
                            // 解析参数 JSON 字符串为对象
                            let args: serde_json::Value =
                                serde_json::from_str(args_str).unwrap_or(serde_json::json!({}));

                            // v4.1.24: 对工具名称进行清洗（Gemini 有命名限制）
                            let sanitized_name = sanitize_gemini_tool_name(name);

                            // v4.1.29: 保留 tool call id，Cloud Code API 的 Claude 代理需要 id 字段
                            // 标准 Gemini 会忽略多余字段，但 Claude 模型需要 id 来映射 tool_use
                            let tool_id = tc.get("id").and_then(|v| v.as_str()).unwrap_or("");
                            let mut fc = serde_json::json!({
                                "functionCall": {
                                    "name": sanitized_name,
                                    "args": args
                                }
                            });
                            if !tool_id.is_empty() {
                                fc["functionCall"]["id"] = serde_json::json!(tool_id);
                            }
                            // v4.1.36: 保留 thought_signature（Gemini 2.5 thinking 模型需要）
                            // 前端通过 tool_calls[].thought_signature 传回
                            // v0.9.2: 如果没有 thought_signature，从缓存中获取
                            // v0.9.2.5: 过滤无效的占位符
                            let has_valid_signature = tc
                                .get("thought_signature")
                                .and_then(|ts| ts.as_str())
                                .map(|s| {
                                    !s.is_empty() && s != "default_thinking_signature_placeholder"
                                })
                                .unwrap_or(false);

                            if has_valid_signature {
                                // 使用前端传回的 thought_signature
                                fc["thoughtSignature"] = tc["thought_signature"].clone();
                                debug!("[chat_stream_google] 使用前端传回的 thought_signature (长度: {})",
                                    tc["thought_signature"].as_str().unwrap_or("").len());
                            } else {
                                // 从缓存中获取 thought_signature
                                if let Some(sig) = signature_cache::SignatureCache::global()
                                    .get_session_signature(&msg_id)
                                {
                                    fc["thoughtSignature"] = serde_json::json!(sig);
                                    debug!("[chat_stream_google] 从缓存注入 thought_signature (长度: {})", sig.len());
                                } else {
                                    // v0.9.2.4: 缓存未命中时使用全局降级签名（已在 SignatureCache 中实现）
                                    debug!("[chat_stream_google] 工具调用缺少 thought_signature，已尝试全局降级: {} (session: {})", name, msg_id);
                                }
                            }
                            parts.push(fc);
                        }
                    }

                    contents.push(serde_json::json!({
                        "role": "model",
                        "parts": parts
                    }));
                    continue;
                }
            }

            // 普通 assistant 消息（无工具调用）
            contents.push(serde_json::json!({
                "role": "model",
                "parts": [{ "text": msg.content }]
            }));
        } else if msg.role == "tool" {
            // tool 消息 → 转为 user 消息带 functionResponse part
            let tool_call_id = msg.tool_call_id.clone().unwrap_or_default();
            let func_name = tool_call_name_map
                .get(&tool_call_id)
                .map(|n| sanitize_gemini_tool_name(n))
                .unwrap_or_else(|| format!("tool_{}", tool_call_id));
            let content_text = msg.content.as_str().unwrap_or("");

            // Gemini 要求 functionResponse 的 response 是对象格式
            let response_obj = serde_json::json!({
                "content": content_text
            });

            // v4.1.29: 构建 functionResponse，包含 id 字段（Cloud Code API Claude 代理需要）
            let mut fr = serde_json::json!({
                "functionResponse": {
                    "name": func_name,
                    "response": response_obj
                }
            });
            if !tool_call_id.is_empty() {
                fr["functionResponse"]["id"] = serde_json::json!(tool_call_id);
            }

            // 检查是否可以合并到上一个 user/functionResponse 消息
            // Gemini 要求连续的 functionResponse 在同一个 user 消息中
            let should_merge = contents
                .last()
                .and_then(|last| last.get("role"))
                .and_then(|r| r.as_str())
                .map(|r| r == "user")
                .unwrap_or(false)
                && contents
                    .last()
                    .and_then(|last| last.get("parts"))
                    .and_then(|p| p.as_array())
                    .map(|parts| parts.iter().all(|p| p.get("functionResponse").is_some()))
                    .unwrap_or(false);

            if should_merge {
                // v4.2.2: 合并到上一个 user 消息的 parts 中（去重 functionResponse.id）
                if let Some(last) = contents.last_mut() {
                    if let Some(parts) = last.get_mut("parts").and_then(|p| p.as_array_mut()) {
                        // 收集已有的 functionResponse id
                        let mut existing_fr_ids: std::collections::HashSet<String> = parts
                            .iter()
                            .filter_map(|item| {
                                item.get("functionResponse")
                                    .and_then(|f| f.get("id"))
                                    .and_then(|id| id.as_str())
                                    .map(|s| s.to_string())
                            })
                            .collect();

                        // 检查当前 functionResponse 的 id 是否已存在
                        let fr_id = fr
                            .get("functionResponse")
                            .and_then(|f| f.get("id"))
                            .and_then(|id| id.as_str())
                            .map(|s| s.to_string())
                            .unwrap_or_default();

                        if !fr_id.is_empty() && !existing_fr_ids.contains(&fr_id) {
                            parts.push(fr);
                            existing_fr_ids.insert(fr_id);
                        } else if fr_id.is_empty() {
                            // 没有 id 的 functionResponse 直接追加（理论上不应该出现）
                            parts.push(fr);
                        }
                        // 如果 id 已存在，跳过不添加
                    }
                }
            } else {
                contents.push(serde_json::json!({
                    "role": "user",
                    "parts": [fr]
                }));
            }
        } else {
            // user 消息
            // v4.2.5: 支持多模态内容（图片）
            // 检测 content 是字符串还是数组
            if let Some(content_array) = msg.content.as_array() {
                // 多模态内容：转换 OpenAI image_url 格式为 Gemini inlineData 格式
                let mut gemini_parts: Vec<serde_json::Value> = Vec::new();

                for item in content_array {
                    let item_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");

                    if item_type == "text" {
                        // 文本内容
                        if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                            if !text.is_empty() {
                                gemini_parts.push(serde_json::json!({ "text": text }));
                            }
                        }
                    } else if item_type == "image_url" {
                        // 转换 image_url 为 Gemini inlineData 格式
                        if let Some(image_url_obj) = item.get("image_url") {
                            if let Some(url) = image_url_obj.get("url").and_then(|u| u.as_str()) {
                                // v4.2.5: 支持 data URL 和 HTTP(S) URL
                                if let Some((mime_type, base64_data)) = extract_base64_image(url) {
                                    // data URL: 使用 inlineData
                                    gemini_parts.push(serde_json::json!({
                                        "inlineData": {
                                            "mimeType": mime_type,
                                            "data": base64_data
                                        }
                                    }));
                                } else if is_http_url(url) {
                                    // HTTP(S) URL: Gemini 不直接支持 URL，需要下载并转换为 base64
                                    info!(
                                        "[chat_stream_google] 检测到远程图片 URL，开始下载: {}",
                                        url
                                    );
                                    match download_image_as_base64(url).await {
                                        Ok((mime_type, base64_data)) => {
                                            gemini_parts.push(serde_json::json!({
                                                "inlineData": {
                                                    "mimeType": mime_type,
                                                    "data": base64_data
                                                }
                                            }));
                                            info!("[chat_stream_google] 远程图片下载成功，已转换为 base64");
                                        }
                                        Err(e) => {
                                            warn!("[chat_stream_google] 远程图片下载失败: {}, 使用占位符", e);
                                            gemini_parts.push(serde_json::json!({
                                                "text": format!("[图片下载失败: {}]", url)
                                            }));
                                        }
                                    }
                                } else {
                                    warn!("[chat_stream_google] 无法解析 image_url: {}", url);
                                }
                            }
                        }
                    } else {
                        // 其他类型（如 functionResponse）直接保留
                        gemini_parts.push(item.clone());
                    }
                }

                // 跳过空内容的消息
                if gemini_parts.is_empty() {
                    continue;
                }

                // v4.1.27: 检查是否需要合并到上一个 user 消息
                // Gemini 要求严格的 user/model 交替，连续 user 消息会导致 400 错误
                let should_merge_user = contents
                    .last()
                    .and_then(|last| last.get("role"))
                    .and_then(|r| r.as_str())
                    .map(|r| r == "user")
                    .unwrap_or(false);

                if should_merge_user {
                    // 合并到上一个 user 消息的 parts 中
                    if let Some(last) = contents.last_mut() {
                        if let Some(parts) = last.get_mut("parts").and_then(|p| p.as_array_mut()) {
                            parts.extend(gemini_parts);
                        }
                    }
                } else {
                    contents.push(serde_json::json!({
                        "role": "user",
                        "parts": gemini_parts
                    }));
                }
            } else {
                // 纯文本内容
                // v4.1.27: 跳过空内容的 user 消息（工具续传时前端可能发送空 content）
                let text_content = msg.content.as_str().unwrap_or("");
                if text_content.is_empty() {
                    continue;
                }

                // v4.1.27: 检查是否需要合并到上一个 user 消息
                // Gemini 要求严格的 user/model 交替，连续 user 消息会导致 400 错误
                let should_merge_user = contents
                    .last()
                    .and_then(|last| last.get("role"))
                    .and_then(|r| r.as_str())
                    .map(|r| r == "user")
                    .unwrap_or(false);

                if should_merge_user {
                    // 合并到上一个 user 消息的 parts 中
                    if let Some(last) = contents.last_mut() {
                        if let Some(parts) = last.get_mut("parts").and_then(|p| p.as_array_mut()) {
                            parts.push(serde_json::json!({ "text": text_content }));
                        }
                    }
                } else {
                    contents.push(serde_json::json!({
                        "role": "user",
                        "parts": [{ "text": msg.content }]
                    }));
                }
            }
        }
    }

    // v4.1.35: 修复 tool_use 没有对应 tool_result 的问题
    // Cloud Code API 代理 Claude 时要求每个 functionCall 必须有对应的 functionResponse
    // 当工具调用被中断（如执行失败、用户取消）时，历史中可能缺少 functionResponse
    let mut fixed_contents: Vec<serde_json::Value> = Vec::new();
    for (i, entry) in contents.iter().enumerate() {
        fixed_contents.push(entry.clone());

        // 检查当前消息是否是 model 消息且包含 functionCall
        let is_model = entry.get("role").and_then(|r| r.as_str()) == Some("model");
        if !is_model {
            continue;
        }

        let has_function_calls = entry
            .get("parts")
            .and_then(|p| p.as_array())
            .map(|parts| parts.iter().any(|p| p.get("functionCall").is_some()))
            .unwrap_or(false);

        if !has_function_calls {
            continue;
        }

        // 收集这条消息中所有的 functionCall id 和 name
        let function_calls: Vec<(String, String)> = entry
            .get("parts")
            .and_then(|p| p.as_array())
            .map(|parts| {
                parts
                    .iter()
                    .filter_map(|p| {
                        let fc = p.get("functionCall")?;
                        let name = fc
                            .get("name")
                            .and_then(|n| n.as_str())
                            .unwrap_or("unknown")
                            .to_string();
                        let id = fc
                            .get("id")
                            .and_then(|n| n.as_str())
                            .unwrap_or("")
                            .to_string();
                        Some((id, name))
                    })
                    .collect()
            })
            .unwrap_or_default();

        // 检查下一条消息是否有对应的 functionResponse
        let next_has_responses = if i + 1 < contents.len() {
            contents[i + 1]
                .get("parts")
                .and_then(|p| p.as_array())
                .map(|parts| parts.iter().any(|p| p.get("functionResponse").is_some()))
                .unwrap_or(false)
        } else {
            false
        };

        if !next_has_responses && !function_calls.is_empty() {
            // 缺少 functionResponse，补充占位结果
            debug!(
                "[chat_stream_google] 补充缺失的 functionResponse，数量: {}",
                function_calls.len()
            );
            let mut response_parts: Vec<serde_json::Value> = Vec::new();
            for (id, name) in &function_calls {
                let mut fr = serde_json::json!({
                    "functionResponse": {
                        "name": name,
                        "response": {
                            "content": "Tool execution was interrupted or failed."
                        }
                    }
                });
                if !id.is_empty() {
                    fr["functionResponse"]["id"] = serde_json::json!(id);
                }
                response_parts.push(fr);
            }
            fixed_contents.push(serde_json::json!({
                "role": "user",
                "parts": response_parts
            }));
        }
    }
    let contents = fixed_contents;

    // v4.1.35: 确保 Gemini 消息格式合规
    // 1. model(functionCall) 必须紧跟在 user 或 functionResponse 之后
    // 2. 不能有连续的 model 消息
    let mut final_contents: Vec<serde_json::Value> = Vec::new();
    for entry in contents.iter() {
        let is_model = entry.get("role").and_then(|r| r.as_str()) == Some("model");
        let is_user = entry.get("role").and_then(|r| r.as_str()) == Some("user");

        if let Some(last) = final_contents.last() {
            let last_is_model = last.get("role").and_then(|r| r.as_str()) == Some("model");
            let last_is_user = last.get("role").and_then(|r| r.as_str()) == Some("user");

            if is_model && last_is_model {
                // 连续 model 消息：合并 parts
                if let Some(last_entry) = final_contents.last_mut() {
                    if let (Some(last_parts), Some(new_parts)) = (
                        last_entry.get_mut("parts").and_then(|p| p.as_array_mut()),
                        entry.get("parts").and_then(|p| p.as_array()),
                    ) {
                        for part in new_parts {
                            last_parts.push(part.clone());
                        }
                    }
                }
                continue;
            } else if is_user && last_is_user {
                // v4.2.2: 连续 user 消息：合并 parts（去重 functionResponse.id）
                if let Some(last_entry) = final_contents.last_mut() {
                    if let (Some(last_parts), Some(new_parts)) = (
                        last_entry.get_mut("parts").and_then(|p| p.as_array_mut()),
                        entry.get("parts").and_then(|p| p.as_array()),
                    ) {
                        // 收集已有的 functionResponse id
                        let mut existing_fr_ids: std::collections::HashSet<String> = last_parts
                            .iter()
                            .filter_map(|item| {
                                item.get("functionResponse")
                                    .and_then(|f| f.get("id"))
                                    .and_then(|id| id.as_str())
                                    .map(|s| s.to_string())
                            })
                            .collect();

                        for part in new_parts {
                            // 如果是 functionResponse，检查 id 是否重复
                            if let Some(fr) = part.get("functionResponse") {
                                let fr_id = fr.get("id").and_then(|id| id.as_str()).unwrap_or("");
                                if !fr_id.is_empty() && !existing_fr_ids.contains(fr_id) {
                                    last_parts.push(part.clone());
                                    existing_fr_ids.insert(fr_id.to_string());
                                } else if fr_id.is_empty() {
                                    // 没有 id 的 functionResponse 直接追加
                                    last_parts.push(part.clone());
                                }
                                // 如果 id 已存在，跳过不添加
                            } else {
                                // 非 functionResponse 直接追加
                                last_parts.push(part.clone());
                            }
                        }
                    }
                }
                continue;
            }
        }
        final_contents.push(entry.clone());
    }
    let contents = final_contents;

    // v4.1.35: 消息截断 - 防止超过模型 token 限制
    let contents = truncate_messages_by_tokens(contents, 180000);

    // v0.9.2.3: 清理历史消息中的无效 thought_signature
    // 移除所有值为 "default_thinking_signature_placeholder" 的 thoughtSignature 和 thought_signature
    let mut cleaned_contents: Vec<serde_json::Value> = Vec::new();
    for entry in contents.iter() {
        let mut cleaned_entry = entry.clone();
        if let Some(parts) = cleaned_entry
            .get_mut("parts")
            .and_then(|p| p.as_array_mut())
        {
            for part in parts.iter_mut() {
                if let Some(obj) = part.as_object_mut() {
                    // 检查并移除无效的 thoughtSignature（Google API 格式）
                    let should_remove_thought_sig = if let Some(ts) = obj.get("thoughtSignature") {
                        if let Some(ts_str) = ts.as_str() {
                            ts_str == "default_thinking_signature_placeholder" || ts_str.is_empty()
                        } else {
                            false
                        }
                    } else {
                        false
                    };

                    if should_remove_thought_sig {
                        obj.remove("thoughtSignature");
                        debug!("[chat_stream_google] 移除无效的 thoughtSignature");
                    }

                    // v0.9.2.5: 同时检查并移除无效的 thought_signature（前端格式）
                    let should_remove_ts = if let Some(ts) = obj.get("thought_signature") {
                        if let Some(ts_str) = ts.as_str() {
                            ts_str == "default_thinking_signature_placeholder" || ts_str.is_empty()
                        } else {
                            false
                        }
                    } else {
                        false
                    };

                    if should_remove_ts {
                        obj.remove("thought_signature");
                        debug!("[chat_stream_google] 移除无效的 thought_signature (前端格式)");
                    }
                }
            }
        }
        cleaned_contents.push(cleaned_entry);
    }
    let contents = cleaned_contents;

    // v0.9.2.6: 调试日志 - 打印消息顺序和类型
    debug!(
        "[chat_stream_google] 清理后消息顺序 (共 {} 条):",
        contents.len()
    );
    for (idx, entry) in contents.iter().enumerate() {
        let role = entry
            .get("role")
            .and_then(|r| r.as_str())
            .unwrap_or("unknown");
        let parts = entry
            .get("parts")
            .and_then(|p| p.as_array())
            .map(|arr| arr.len())
            .unwrap_or(0);
        let has_fc = entry
            .get("parts")
            .and_then(|p| p.as_array())
            .map(|parts| parts.iter().any(|p| p.get("functionCall").is_some()))
            .unwrap_or(false);
        let has_fr = entry
            .get("parts")
            .and_then(|p| p.as_array())
            .map(|parts| parts.iter().any(|p| p.get("functionResponse").is_some()))
            .unwrap_or(false);
        debug!(
            "[chat_stream_google]   [{}] role={}, parts={}, functionCall={}, functionResponse={}",
            idx, role, parts, has_fc, has_fr
        );
    }

    // v0.9.2.6: 验证并修复 functionCall/functionResponse 顺序
    // Google API 要求 functionResponse 必须紧跟在 functionCall 之后
    let mut validated_contents: Vec<serde_json::Value> = Vec::new();
    let mut pending_function_call: Option<serde_json::Value> = None;

    for entry in contents.iter() {
        let role = entry.get("role").and_then(|r| r.as_str()).unwrap_or("");
        let has_fc = entry
            .get("parts")
            .and_then(|p| p.as_array())
            .map(|parts| parts.iter().any(|p| p.get("functionCall").is_some()))
            .unwrap_or(false);
        let has_fr = entry
            .get("parts")
            .and_then(|p| p.as_array())
            .map(|parts| parts.iter().any(|p| p.get("functionResponse").is_some()))
            .unwrap_or(false);

        if has_fc {
            // 如果有待处理的 functionCall，先添加它
            if let Some(pending) = pending_function_call.take() {
                validated_contents.push(pending);
            }
            // 保存当前的 functionCall，等待 functionResponse
            pending_function_call = Some(entry.clone());
        } else if has_fr {
            // 找到 functionResponse，添加待处理的 functionCall（如果有）
            if let Some(pending) = pending_function_call.take() {
                validated_contents.push(pending);
            }
            validated_contents.push(entry.clone());
        } else {
            // 普通消息
            if role == "user" && pending_function_call.is_some() {
                // 如果是 user 消息且有待处理的 functionCall，跳过这条 user 消息
                // 因为它会打断 functionCall -> functionResponse 的顺序
                warn!(
                    "[chat_stream_google] 跳过打断 functionCall/functionResponse 顺序的 user 消息"
                );
                continue;
            }
            // 如果有待处理的 functionCall，先添加它
            if let Some(pending) = pending_function_call.take() {
                validated_contents.push(pending);
            }
            validated_contents.push(entry.clone());
        }
    }

    // 处理最后可能剩余的 functionCall
    if let Some(pending) = pending_function_call.take() {
        validated_contents.push(pending);
    }

    let contents = validated_contents;

    debug!(
        "[chat_stream_google] 验证后消息顺序 (共 {} 条):",
        contents.len()
    );
    for (idx, entry) in contents.iter().enumerate() {
        let role = entry
            .get("role")
            .and_then(|r| r.as_str())
            .unwrap_or("unknown");
        let has_fc = entry
            .get("parts")
            .and_then(|p| p.as_array())
            .map(|parts| parts.iter().any(|p| p.get("functionCall").is_some()))
            .unwrap_or(false);
        let has_fr = entry
            .get("parts")
            .and_then(|p| p.as_array())
            .map(|parts| parts.iter().any(|p| p.get("functionResponse").is_some()))
            .unwrap_or(false);
        debug!(
            "[chat_stream_google]   [{}] role={}, functionCall={}, functionResponse={}",
            idx, role, has_fc, has_fr
        );
    }

    // 提取 system 消息作为 systemInstruction
    let mut system_parts: Vec<serde_json::Value> = Vec::new();

    // v0.9.0: 添加 Antigravity 身份指令（参考 Antigravity-Manager request.rs 第 767 行）
    // 这是 Cloud Code API 识别请求合法性的关键
    let antigravity_identity = "You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.\n\
    You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.\n\
    **Absolute paths only**\n\
    **Proactiveness**";

    // 检查用户是否已提供 Antigravity 身份
    let user_has_antigravity = request
        .system_prompt
        .as_ref()
        .map(|s| s.contains("You are Antigravity"))
        .unwrap_or(false)
        || request.messages.iter().any(|m| {
            m.role == "system"
                && m.content
                    .as_str()
                    .map(|s| s.contains("You are Antigravity"))
                    .unwrap_or(false)
        });

    // 如果用户没有提供 Antigravity 身份，则注入
    if !user_has_antigravity {
        system_parts.push(serde_json::json!({ "text": antigravity_identity }));
    }

    // 添加 Agent 系统提示词
    if let Some(ref system_prompt) = request.system_prompt {
        if !system_prompt.is_empty() {
            system_parts.push(serde_json::json!({ "text": system_prompt }));
        }
    }

    // 从消息中提取 system 消息
    for msg in &request.messages {
        if msg.role == "system" {
            let text = msg.content.as_str().unwrap_or_default();
            system_parts.push(serde_json::json!({ "text": text }));
        }
    }

    // 如果注入了 Antigravity 身份，添加结束标记
    if !user_has_antigravity {
        system_parts.push(serde_json::json!({ "text": "\n--- [SYSTEM_PROMPT_END] ---" }));
    }

    let system_instruction = if !system_parts.is_empty() {
        Some(serde_json::json!({
            "role": "user",
            "parts": system_parts
        }))
    } else {
        None
    };

    // v0.9.2: msg_id 已在函数开头定义

    if is_oauth_token {
        // OAuth Token: 使用 Cloud Code API（与 Antigravity-Manager 一致）
        // v0.9.1: 端点管理已移至 protocol::google::GoogleProtocol::call_with_fallback_and_retry
        info!("[chat_stream_google] 使用 Cloud Code API");

        // v0.9.0: 检测是否是 Thinking 模型（需要特殊配置）
        let model_lower = request.model_name.to_lowercase();
        let is_thinking_model = model_lower.contains("-thinking")
            || model_lower.contains("opus-4-5")
            || model_lower.contains("opus-4.5");

        // 构建内部请求体
        let mut generation_config = serde_json::json!({
            "temperature": request.temperature.unwrap_or(0.7),
            "maxOutputTokens": request.max_tokens.unwrap_or(4096)
            // v0.9.3: 移除 stopSequences，因为它可能会错误地截断响应
            // 原来的配置: "stopSequences": ["<|user|>", "<|end_of_turn|>", "\n\nHuman:"]
        });

        // v0.9.0: 为 Thinking 模型添加 thinkingConfig（参考 Antigravity-Manager）
        if is_thinking_model {
            info!("[chat_stream_google] 检测到 Thinking 模型，添加 thinkingConfig");
            let thinking_budget: i64 = 24576; // 默认 thinking budget
            generation_config["thinkingConfig"] = serde_json::json!({
                "includeThoughts": true,
                "thinkingBudget": thinking_budget
            });

            // v0.9.0: 确保 maxOutputTokens > thinkingBudget（API 强约束）
            // 参考 Antigravity-Manager request.rs 第 1779-1793 行
            let current_max = request.max_tokens.unwrap_or(4096) as i64;
            if current_max <= thinking_budget {
                let new_max = thinking_budget + 8192;
                info!("[chat_stream_google] 调整 maxOutputTokens: {} -> {} (必须大于 thinkingBudget {})",
                      current_max, new_max, thinking_budget);
                generation_config["maxOutputTokens"] = serde_json::json!(new_max);
            }
        }

        // v0.9.0: 添加 safetySettings（参考 Antigravity-Manager request.rs）
        // 这是 Cloud Code API 的必要配置，缺少会导致 429 错误
        let safety_settings = serde_json::json!([
            { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "OFF" },
            { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "OFF" },
            { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "OFF" },
            { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "OFF" },
            { "category": "HARM_CATEGORY_CIVIC_INTEGRITY", "threshold": "OFF" },
        ]);

        let mut inner_request = serde_json::json!({
            "contents": contents,
            "generationConfig": generation_config,
            "safetySettings": safety_settings
        });

        // v3.6.1: 移除 Antigravity 身份注入，让模型用真实身份回复
        // 只保留用户的 system 消息（如果有）
        if let Some(sys) = system_instruction {
            inner_request["systemInstruction"] = sys;
        }

        // v0.9.3: 添加工具支持（Function Calling）
        // 将 OpenAI 格式的工具转换为 Google AI 格式
        // v4.1.24: 清洗工具名称，使其符合 Gemini API 命名规则，并建立反向映射
        let mut tool_name_map: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();
        if let Some(ref tools) = request.tools {
            if !tools.is_empty() {
                let google_tools: Vec<serde_json::Value> = tools
                    .iter()
                    .filter_map(|tool| {
                        // OpenAI 格式: { "type": "function", "function": { "name": ..., "description": ..., "parameters": ... } }
                        // Google 格式: { "functionDeclarations": [{ "name": ..., "description": ..., "parameters": ... }] }
                        let func = tool.get("function")?;
                        let name = func.get("name")?.as_str()?;
                        let sanitized_name = sanitize_gemini_tool_name(name);
                        // 记录清洗后名称到原始名称的映射，用于响应时还原
                        if sanitized_name != name {
                            info!(
                                "[chat_stream_google] 工具名称已清洗: {} -> {}",
                                name, sanitized_name
                            );
                            tool_name_map.insert(sanitized_name.clone(), name.to_string());
                        }
                        let description = func
                            .get("description")
                            .and_then(|d| d.as_str())
                            .unwrap_or("");
                        let parameters = func
                            .get("parameters")
                            .cloned()
                            .unwrap_or(serde_json::json!({"type": "object", "properties": {}}));

                        Some(serde_json::json!({
                            "name": sanitized_name,
                            "description": description,
                            "parameters": parameters
                        }))
                    })
                    .collect();

                if !google_tools.is_empty() {
                    inner_request["tools"] = serde_json::json!([{
                        "functionDeclarations": google_tools
                    }]);
                    info!(
                        "[chat_stream_google] 添加工具支持，数量: {}",
                        google_tools.len()
                    );
                }
            }
        }

        // v3.4.3: requestType 应该是 "agent"（参考 Antigravity-Manager common_utils.rs）
        // Cloud Code API 的 requestType 有: "agent", "web_search", "image_gen"
        let request_type = "agent";
        info!("[chat_stream_google] requestType: {}", request_type);

        // v3.4.3: 使用传入的 project_id，如果没有则动态获取
        let project_id = if let Some(ref pid) = request.project_id {
            if !pid.is_empty() && pid != "mobaus-studio-default" {
                pid.clone()
            } else {
                // 动态获取 project_id
                info!("[chat_stream_google] 没有有效的 projectId，尝试动态获取...");
                match fetch_google_project_id(&request.api_key).await {
                    Ok(pid) => {
                        info!("[chat_stream_google] 动态获取到 projectId: {}", pid);
                        pid
                    }
                    Err(e) => {
                        warn!("[chat_stream_google] 动态获取 projectId 失败: {}", e);
                        let _ = window.emit("chat-event", serde_json::json!({
                            "event": "error",
                            "id": msg_id,
                            "error": format!("无法获取 GCP 项目 ID: {}。请重新连接 Google OAuth。", e)
                        }));
                        return Err(format!("无法获取 GCP 项目 ID: {}", e));
                    }
                }
            }
        } else {
            // 动态获取 project_id
            info!("[chat_stream_google] projectId 为空，尝试动态获取...");
            match fetch_google_project_id(&request.api_key).await {
                Ok(pid) => {
                    info!("[chat_stream_google] 动态获取到 projectId: {}", pid);
                    pid
                }
                Err(e) => {
                    warn!("[chat_stream_google] 动态获取 projectId 失败: {}", e);
                    let _ = window.emit("chat-event", serde_json::json!({
                        "event": "error",
                        "id": msg_id,
                        "error": format!("无法获取 GCP 项目 ID: {}。请重新连接 Google OAuth。", e)
                    }));
                    return Err(format!("无法获取 GCP 项目 ID: {}", e));
                }
            }
        };
        info!("[chat_stream_google] projectId: {}", project_id);

        // v3.4.5: 映射模型名称（参考 Antigravity-Manager common_utils.rs）
        let mapped_model = map_cloud_code_model(&request.model_name);
        info!(
            "[chat_stream_google] 模型映射: {} -> {}",
            request.model_name, mapped_model
        );

        // 包装为 Cloud Code API 格式
        // v3.4.4: userAgent 必须是 "antigravity"，requestId 前缀必须是 "agent-"
        // Cloud Code API 对这些字段有白名单验证
        let wrapped_body = serde_json::json!({
            "project": project_id,
            "requestId": format!("agent-{}", uuid::Uuid::new_v4()),
            "request": inner_request,
            "model": mapped_model,
            "userAgent": "antigravity",
            "requestType": request_type
        });

        debug!(
            "[chat_stream_google] 请求体: {}",
            serde_json::to_string_pretty(&wrapped_body).unwrap_or_default()
        );

        // v0.9.1: 使用优化的端点降级和重试机制
        // 实现三层端点降级（Sandbox → Daily → Prod）和智能重试策略
        info!("[chat_stream_google] 使用优化的端点降级和重试机制");
        let mut response = match protocol::google::GoogleProtocol::call_with_fallback_and_retry(
            client,
            &request.api_key,
            &wrapped_body,
            3, // 最大重试次数
        )
        .await
        {
            Ok(resp) => resp,
            Err(e) => {
                error!("[chat_stream_google] 请求失败: {}", e);

                // 解析错误信息，提供友好的错误提示
                let user_friendly_error = if e.contains("404") {
                    if request.model_name.contains("claude") {
                        format!(
                            "模型 {} 在您的 Google Cloud 项目上不可用。Claude 模型可能需要特定的项目权限或订阅。建议使用 Gemini 模型或通过 Anthropic 直接使用 Claude。",
                            request.model_name
                        )
                    } else {
                        format!("模型 {} 未找到 (404)", request.model_name)
                    }
                } else if e.contains("403") {
                    "权限不足 (403): 您的账号可能没有访问此模型的权限".to_string()
                } else if e.contains("401") {
                    let error_msg =
                        "认证失败 (401): OAuth Token 可能已过期，请重新连接 Google 账号"
                            .to_string();

                    // v2.4.4: 发送 token_expired 事件到前端，触发自动刷新
                    let _ = window.emit(
                        "token_expired",
                        serde_json::json!({
                            "providerId": "google",
                            "error": error_msg.clone()
                        }),
                    );

                    error_msg
                } else if e.contains("429") {
                    // v4.1.37: Google 429 配额错误不阻断前端，只记日志
                    warn!("[chat_stream_google] 429 配额限制: {}", e);

                    // v0.9.2: 解析配额错误信息，提供更友好的提示
                    let user_friendly_error = if e.contains("QUOTA_EXHAUSTED") {
                        // 尝试提取模型名称和重置时间
                        let model_hint = if e.contains("claude") {
                            "Claude 模型"
                        } else if e.contains("gemini") {
                            "Gemini 模型"
                        } else {
                            "当前模型"
                        };

                        // 尝试提取重置时间
                        let reset_hint = if e.contains("quotaResetDelay") {
                            if e.contains("135h") || e.contains("100h") {
                                "（约 5-6 天后重置）"
                            } else if e.contains("24h") {
                                "（约 1 天后重置）"
                            } else {
                                ""
                            }
                        } else {
                            ""
                        };

                        format!(
                            "⚠️ {} 配额已耗尽{}。\n\n建议：\n1. 切换到其他模型（如 Gemini 2.5 Flash）\n2. 使用其他 Google 账号\n3. 等待配额重置后再试",
                            model_hint, reset_hint
                        )
                    } else {
                        "配额限制，请稍后重试或切换模型".to_string()
                    };

                    // 发送友好的错误提示
                    let _ = window.emit(
                        "chat-event",
                        serde_json::json!({
                            "id": &msg_id,
                            "event": "error",
                            "error": user_friendly_error
                        }),
                    );

                    // 发送 done 事件
                    let done_payload = serde_json::json!({
                        "id": &msg_id,
                        "event": "done"
                    });
                    let _ = window.emit("chat-event", done_payload);
                    return Ok(());
                } else if e.contains("503") {
                    format!("服务暂时不可用 (503): {}。请稍后重试。", e)
                } else {
                    e
                };

                // v4.1.44: 发送 error 事件到前端（除了 429 已经单独处理）
                let msg_id = request
                    .message_id
                    .clone()
                    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                let _ = window.emit(
                    "chat-event",
                    serde_json::json!({
                        "id": msg_id,
                        "event": "error",
                        "error": user_friendly_error.clone()
                    }),
                );

                return Err(user_friendly_error);
            }
        };

        let mut buffer = String::new();

        // 循环读取 Chunk
        while let Ok(Some(chunk)) = response.chunk().await {
            let s = String::from_utf8_lossy(&chunk);
            buffer.push_str(&s);

            // 处理 SSE 数据
            while let Some(pos) = buffer.find('\n') {
                let line: String = buffer.drain(..pos + 1).collect();
                let line = line.trim();

                if line.is_empty() {
                    continue;
                }

                if let Some(data_str) = line.strip_prefix("data: ") {
                    if data_str == "[DONE]" {
                        // 发送完成事件
                        let _ = window.emit(
                            "chat-event",
                            serde_json::json!({
                                "event": "done",
                                "id": msg_id
                            }),
                        );
                        return Ok(());
                    }

                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data_str) {
                        // Cloud Code API 响应需要解包：response.candidates...
                        let response_data = json.get("response").unwrap_or(&json);

                        if let Some(candidates) =
                            response_data.get("candidates").and_then(|c| c.as_array())
                        {
                            for candidate in candidates {
                                if let Some(content) = candidate.get("content") {
                                    if let Some(parts) =
                                        content.get("parts").and_then(|p| p.as_array())
                                    {
                                        // v0.9.3: 收集工具调用
                                        let mut tool_calls: Vec<serde_json::Value> = Vec::new();

                                        for part in parts {
                                            // v0.9.3: 检查是否为工具调用（functionCall）
                                            if let Some(function_call) = part.get("functionCall") {
                                                let sanitized_name = function_call
                                                    .get("name")
                                                    .and_then(|n| n.as_str())
                                                    .unwrap_or("");
                                                let args = function_call
                                                    .get("args")
                                                    .cloned()
                                                    .unwrap_or(serde_json::json!({}));

                                                if !sanitized_name.is_empty() {
                                                    // v4.1.24: 通过反向映射还原原始工具名称
                                                    let original_name = tool_name_map
                                                        .get(sanitized_name)
                                                        .map(|s| s.as_str())
                                                        .unwrap_or(sanitized_name);
                                                    let call_id = format!(
                                                        "call_{}",
                                                        &uuid::Uuid::new_v4()
                                                            .to_string()
                                                            .replace("-", "")[..24]
                                                    );
                                                    let mut tc = serde_json::json!({
                                                        "id": call_id,
                                                        "type": "function",
                                                        "function": {
                                                            "name": original_name,
                                                            "arguments": serde_json::to_string(&args).unwrap_or("{}".to_string())
                                                        }
                                                    });
                                                    // v4.1.36: 保留 thought_signature（Gemini 2.5 thinking 模型需要）
                                                    if let Some(ts) = part.get("thoughtSignature") {
                                                        tc["thought_signature"] = ts.clone();
                                                        // v0.9.2: 缓存 thought_signature 供后续请求使用
                                                        if let Some(sig_str) = ts.as_str() {
                                                            signature_cache::SignatureCache::global()
                                                                .cache_session_signature(&msg_id, sig_str.to_string());
                                                            debug!("[chat_stream_google] 缓存 thought_signature (长度: {})", sig_str.len());
                                                        }
                                                    }
                                                    // 也检查 functionCall 内部的 thought_signature
                                                    if let Some(ts) =
                                                        function_call.get("thoughtSignature")
                                                    {
                                                        tc["thought_signature"] = ts.clone();
                                                        // v0.9.2: 缓存 thought_signature
                                                        if let Some(sig_str) = ts.as_str() {
                                                            signature_cache::SignatureCache::global()
                                                                .cache_session_signature(&msg_id, sig_str.to_string());
                                                            debug!("[chat_stream_google] 缓存 thought_signature (长度: {})", sig_str.len());
                                                        }
                                                    }
                                                    tool_calls.push(tc);
                                                    info!("[chat_stream_google] 检测到工具调用: {} (原始: {})", sanitized_name, original_name);
                                                }
                                            }

                                            if let Some(text) =
                                                part.get("text").and_then(|t| t.as_str())
                                            {
                                                // v0.9.2: 检查是否为 thinking 内容（Gemini Thinking 模型）
                                                // Gemini 2.0 Flash Thinking 等模型会在 parts 中返回 thought: true 标记
                                                let is_thought = part
                                                    .get("thought")
                                                    .and_then(|t| t.as_bool())
                                                    .unwrap_or(false);

                                                if is_thought {
                                                    // 发送推理内容块
                                                    let _ = window.emit(
                                                        "chat-event",
                                                        serde_json::json!({
                                                            "event": "reasoning_chunk",
                                                            "id": msg_id,
                                                            "content": text
                                                        }),
                                                    );
                                                } else {
                                                    // 发送普通文本块
                                                    let _ = window.emit(
                                                        "chat-event",
                                                        serde_json::json!({
                                                            "event": "chunk",
                                                            "id": msg_id,
                                                            "content": text
                                                        }),
                                                    );
                                                }
                                            }
                                        }

                                        // v0.9.3: 如果有工具调用，发送 tool_calls 事件
                                        if !tool_calls.is_empty() {
                                            info!(
                                                "[chat_stream_google] AI 请求工具调用，数量: {}",
                                                tool_calls.len()
                                            );
                                            let _ = window.emit(
                                                "chat-event",
                                                serde_json::json!({
                                                    "id": msg_id,
                                                    "event": "tool_calls",
                                                    "tool_calls": tool_calls
                                                }),
                                            );
                                        }
                                    }
                                }

                                // v0.9.3: 检查 finishReason，用于调试截断问题
                                if let Some(finish_reason) =
                                    candidate.get("finishReason").and_then(|f| f.as_str())
                                {
                                    info!("[chat_stream_google] finishReason: {}", finish_reason);

                                    // 根据不同的 finishReason 处理
                                    match finish_reason {
                                        "SAFETY" => {
                                            warn!("[chat_stream_google] 响应因安全原因被截断");
                                        }
                                        "RECITATION" => {
                                            warn!("[chat_stream_google] 响应因引用检测被截断");
                                        }
                                        "MALFORMED_FUNCTION_CALL" => {
                                            // v0.9.4: AI 尝试调用工具但格式错误
                                            // 通常是因为请求中没有提供 tools 字段，或工具定义不完整
                                            warn!("[chat_stream_google] AI 尝试调用工具但格式错误 (MALFORMED_FUNCTION_CALL)");
                                            warn!("[chat_stream_google] 请检查: 1) 请求是否包含 tools 字段 2) 工具定义是否完整");
                                            // 发送错误提示给前端
                                            let _ = window.emit("chat-event", serde_json::json!({
                                                "event": "chunk",
                                                "id": msg_id,
                                                "content": "\n\n⚠️ AI 尝试调用工具但失败了。请确保 Agent 已正确配置 MCP 服务器，并且服务器已启动。"
                                            }));
                                        }
                                        "OTHER" => {
                                            warn!("[chat_stream_google] 响应因其他原因被截断");
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }

                        // 检查 usage
                        if let Some(usage) = response_data.get("usageMetadata") {
                            if let Some(total) =
                                usage.get("totalTokenCount").and_then(|t| t.as_i64())
                            {
                                let _ = window.emit(
                                    "chat-event",
                                    serde_json::json!({
                                        "event": "usage",
                                        "id": msg_id,
                                        "tokens": total
                                    }),
                                );
                            }
                        }
                    }
                }
            }
        }

        // 发送完成事件
        let _ = window.emit(
            "chat-event",
            serde_json::json!({
                "event": "done",
                "id": msg_id
            }),
        );
    } else {
        // API Key: 使用 Google AI Studio API (generativelanguage.googleapis.com)
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse",
            request.model_name
        );
        info!("[chat_stream_google] 使用 Google AI Studio API");
        debug!("[chat_stream_google] 请求 URL: {}", url);

        let mut body = serde_json::json!({
            "contents": contents,
            "generationConfig": {
                "temperature": request.temperature.unwrap_or(0.7),
                "maxOutputTokens": request.max_tokens.unwrap_or(4096)
            }
        });

        // 添加 systemInstruction（如果有）
        if let Some(sys) = system_instruction {
            body["systemInstruction"] = sys;
        }

        // v0.9.3: 添加工具支持（Function Calling）- API Key 模式
        // v4.1.24: 清洗工具名称，使其符合 Gemini API 命名规则，并建立反向映射
        let mut tool_name_map: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();
        if let Some(ref tools) = request.tools {
            if !tools.is_empty() {
                let google_tools: Vec<serde_json::Value> = tools
                    .iter()
                    .filter_map(|tool| {
                        let func = tool.get("function")?;
                        let name = func.get("name")?.as_str()?;
                        let sanitized_name = sanitize_gemini_tool_name(name);
                        // 记录清洗后名称到原始名称的映射，用于响应时还原
                        if sanitized_name != name {
                            info!(
                                "[chat_stream_google] API Key 模式 - 工具名称已清洗: {} -> {}",
                                name, sanitized_name
                            );
                            tool_name_map.insert(sanitized_name.clone(), name.to_string());
                        }
                        let description = func
                            .get("description")
                            .and_then(|d| d.as_str())
                            .unwrap_or("");
                        let parameters = func
                            .get("parameters")
                            .cloned()
                            .unwrap_or(serde_json::json!({"type": "object", "properties": {}}));

                        Some(serde_json::json!({
                            "name": sanitized_name,
                            "description": description,
                            "parameters": parameters
                        }))
                    })
                    .collect();

                if !google_tools.is_empty() {
                    body["tools"] = serde_json::json!([{
                        "functionDeclarations": google_tools
                    }]);
                    info!(
                        "[chat_stream_google] API Key 模式 - 添加工具支持，数量: {}",
                        google_tools.len()
                    );
                }
            }
        }

        debug!(
            "[chat_stream_google] 请求体: {}",
            serde_json::to_string_pretty(&body).unwrap_or_default()
        );

        // 打印请求地址
        info!("[chat_stream_google] API Key 模式 - 请求地址: {}", url);

        let mut response = client
            .post(&url)
            .header("Content-Type", "application/json")
            .header("x-goog-api-key", request.api_key.trim())
            .header("Accept", "text/event-stream")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        let status = response.status();
        info!("[chat_stream_google] API Key 模式 - 响应状态码: {}", status);

        if !status.is_success() {
            let err_text = response.text().await.unwrap_or_default();
            error!("[chat_stream_google] API 错误: {} - {}", status, err_text);

            // v4.1.44: 发送 error 事件到前端
            let msg_id = request
                .message_id
                .clone()
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let _ = window.emit(
                "chat-event",
                serde_json::json!({
                    "id": msg_id,
                    "event": "error",
                    "error": format!("API Error {}: {}", status, err_text)
                }),
            );

            return Err(format!("API Error {}: {}", status, err_text));
        }

        let mut buffer = String::new();
        let mut received_valid_sse = false; // 标记是否收到有效的 SSE 数据

        // 循环读取 Chunk
        while let Ok(Some(chunk)) = response.chunk().await {
            let s = String::from_utf8_lossy(&chunk);
            buffer.push_str(&s);

            // v4.1.46: 检测响应格式是否正确（防止返回 HTML 等非 SSE 格式）
            if !received_valid_sse && buffer.len() > 50 {
                // 检查是否是 HTML 响应
                let buffer_lower = buffer.to_lowercase();
                if buffer_lower.contains("<!doctype") || buffer_lower.contains("<html") {
                    let preview = buffer.chars().take(200).collect::<String>();
                    error!("[chat_stream_google] API Key 模式 - 响应格式错误：收到 HTML 而不是 SSE 流，前200字符: {}", preview);

                    let _ = window.emit("chat-event", serde_json::json!({
                        "id": msg_id,
                        "event": "error",
                        "error": format!("API 响应格式错误：收到 HTML 页面而不是流式数据。请检查：\n1. API 端点地址是否正确\n2. API Key 是否有效\n3. 网络代理配置是否正确\n\n响应预览：{}", preview)
                    }));

                    return Err("API 响应格式错误：收到 HTML 而不是 SSE 流".to_string());
                }

                // 检查是否包含 SSE 格式的标记
                if buffer.contains("data:") {
                    received_valid_sse = true;
                }
            }

            // 处理 SSE 数据
            while let Some(pos) = buffer.find('\n') {
                let line: String = buffer.drain(..pos + 1).collect();
                let line = line.trim();

                if line.is_empty() {
                    continue;
                }

                if let Some(data_str) = line.strip_prefix("data: ") {
                    if data_str == "[DONE]" {
                        let _ = window.emit(
                            "chat-event",
                            serde_json::json!({
                                "event": "done",
                                "id": msg_id
                            }),
                        );
                        return Ok(());
                    }

                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data_str) {
                        if let Some(candidates) = json.get("candidates").and_then(|c| c.as_array())
                        {
                            for candidate in candidates {
                                if let Some(content) = candidate.get("content") {
                                    if let Some(parts) =
                                        content.get("parts").and_then(|p| p.as_array())
                                    {
                                        // v0.9.3: 收集工具调用
                                        let mut tool_calls: Vec<serde_json::Value> = Vec::new();

                                        for part in parts {
                                            // v0.9.3: 检查是否为工具调用（functionCall）
                                            if let Some(function_call) = part.get("functionCall") {
                                                let sanitized_name = function_call
                                                    .get("name")
                                                    .and_then(|n| n.as_str())
                                                    .unwrap_or("");
                                                let args = function_call
                                                    .get("args")
                                                    .cloned()
                                                    .unwrap_or(serde_json::json!({}));

                                                if !sanitized_name.is_empty() {
                                                    // v4.1.24: 通过反向映射还原原始工具名称
                                                    let original_name = tool_name_map
                                                        .get(sanitized_name)
                                                        .map(|s| s.as_str())
                                                        .unwrap_or(sanitized_name);
                                                    let call_id = format!(
                                                        "call_{}",
                                                        &uuid::Uuid::new_v4()
                                                            .to_string()
                                                            .replace("-", "")[..24]
                                                    );
                                                    let mut tc = serde_json::json!({
                                                        "id": call_id,
                                                        "type": "function",
                                                        "function": {
                                                            "name": original_name,
                                                            "arguments": serde_json::to_string(&args).unwrap_or("{}".to_string())
                                                        }
                                                    });
                                                    // v4.1.36: 保留 thought_signature
                                                    if let Some(ts) = part.get("thoughtSignature") {
                                                        tc["thought_signature"] = ts.clone();
                                                        // v0.9.2: 缓存 thought_signature
                                                        if let Some(sig_str) = ts.as_str() {
                                                            signature_cache::SignatureCache::global()
                                                                .cache_session_signature(&msg_id, sig_str.to_string());
                                                            debug!("[chat_stream_google] API Key 模式 - 缓存 thought_signature (长度: {})", sig_str.len());
                                                        }
                                                    }
                                                    if let Some(ts) =
                                                        function_call.get("thoughtSignature")
                                                    {
                                                        tc["thought_signature"] = ts.clone();
                                                        // v0.9.2: 缓存 thought_signature
                                                        if let Some(sig_str) = ts.as_str() {
                                                            signature_cache::SignatureCache::global()
                                                                .cache_session_signature(&msg_id, sig_str.to_string());
                                                            debug!("[chat_stream_google] API Key 模式 - 缓存 thought_signature (长度: {})", sig_str.len());
                                                        }
                                                    }
                                                    tool_calls.push(tc);
                                                    info!("[chat_stream_google] API Key 模式 - 检测到工具调用: {} (原始: {})", sanitized_name, original_name);
                                                }
                                            }

                                            if let Some(text) =
                                                part.get("text").and_then(|t| t.as_str())
                                            {
                                                // v0.9.2: 检查是否为 thinking 内容（Gemini Thinking 模型）
                                                let is_thought = part
                                                    .get("thought")
                                                    .and_then(|t| t.as_bool())
                                                    .unwrap_or(false);

                                                if is_thought {
                                                    // 发送推理内容块
                                                    let _ = window.emit(
                                                        "chat-event",
                                                        serde_json::json!({
                                                            "event": "reasoning_chunk",
                                                            "id": msg_id,
                                                            "content": text
                                                        }),
                                                    );
                                                } else {
                                                    // 发送普通文本块
                                                    let _ = window.emit(
                                                        "chat-event",
                                                        serde_json::json!({
                                                            "event": "chunk",
                                                            "id": msg_id,
                                                            "content": text
                                                        }),
                                                    );
                                                }
                                            }
                                        }

                                        // v0.9.3: 如果有工具调用，发送 tool_calls 事件
                                        if !tool_calls.is_empty() {
                                            info!("[chat_stream_google] API Key 模式 - AI 请求工具调用，数量: {}", tool_calls.len());
                                            let _ = window.emit(
                                                "chat-event",
                                                serde_json::json!({
                                                    "id": msg_id,
                                                    "event": "tool_calls",
                                                    "tool_calls": tool_calls
                                                }),
                                            );
                                        }
                                    }
                                }

                                // v0.9.4: 检查 finishReason（API Key 模式）
                                if let Some(finish_reason) =
                                    candidate.get("finishReason").and_then(|f| f.as_str())
                                {
                                    info!(
                                        "[chat_stream_google] API Key 模式 - finishReason: {}",
                                        finish_reason
                                    );

                                    match finish_reason {
                                        "SAFETY" => {
                                            warn!("[chat_stream_google] API Key 模式 - 响应因安全原因被截断");
                                        }
                                        "RECITATION" => {
                                            warn!("[chat_stream_google] API Key 模式 - 响应因引用检测被截断");
                                        }
                                        "MALFORMED_FUNCTION_CALL" => {
                                            warn!("[chat_stream_google] API Key 模式 - AI 尝试调用工具但格式错误");
                                            let _ = window.emit("chat-event", serde_json::json!({
                                                "event": "chunk",
                                                "id": msg_id,
                                                "content": "\n\n⚠️ AI 尝试调用工具但失败了。请确保 Agent 已正确配置 MCP 服务器，并且服务器已启动。"
                                            }));
                                        }
                                        "OTHER" => {
                                            warn!("[chat_stream_google] API Key 模式 - 响应因其他原因被截断");
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }

                        // 检查 usage
                        if let Some(usage) = json.get("usageMetadata") {
                            if let Some(total) =
                                usage.get("totalTokenCount").and_then(|t| t.as_i64())
                            {
                                let _ = window.emit(
                                    "chat-event",
                                    serde_json::json!({
                                        "event": "usage",
                                        "id": msg_id,
                                        "tokens": total
                                    }),
                                );
                            }
                        }
                    }
                }
            }
        }

        // 发送完成事件
        let _ = window.emit(
            "chat-event",
            serde_json::json!({
                "event": "done",
                "id": msg_id
            }),
        );
    }

    Ok(())
}

/// Kiro API 常量配置
/// 来源: CLIProxyAPIPlus 项目 (internal/runtime/executor/kiro_executor.go)
///
/// v0.9.0: 根据认证方式选择不同的 User-Agent
/// - IDC 用户: 使用 Kiro IDE 风格（与 CLIProxyAPIPlus 对 IDC 用户的行为一致）
/// - Builder ID 用户: 使用 Amazon Q CLI 风格（与 CLIProxyAPIPlus 对 Builder ID 用户的行为一致）
const KIRO_API_REGION: &str = "us-east-1";

/// Amazon Q CLI 风格 User-Agent（用于 Builder ID 用户）
const KIRO_API_USER_AGENT_AWS: &str = "aws-sdk-rust/1.3.9 os/macos lang/rust/1.87.0";
/// Amazon Q CLI 风格 X-Amz-User-Agent（用于 Builder ID 用户）
const KIRO_API_AMZ_USER_AGENT_AWS: &str = "aws-sdk-rust/1.3.9 ua/2.1 api/ssooidc/1.88.0 os/macos lang/rust/1.87.0 m/E app/AmazonQ-For-CLI";

/// Kiro IDE 风格 User-Agent（用于 IDC 用户）
/// 格式: aws-sdk-js/{SDKVersion} ua/2.1 os/{OSType}#{OSVersion} lang/js md/nodejs#{NodeVersion} api/codewhispererstreaming#{SDKVersion} m/E KiroIDE-{KiroVersion}-{KiroHash}
const KIRO_API_USER_AGENT_IDC: &str = "aws-sdk-js/1.0.27 ua/2.1 os/darwin#14.5 lang/js md/nodejs#20.12.0 api/codewhispererstreaming#1.0.27 m/E KiroIDE-0.8.1-mobaus";
/// Kiro IDE 风格 X-Amz-User-Agent（用于 IDC 用户）
const KIRO_API_AMZ_USER_AGENT_IDC: &str = "aws-sdk-js/1.0.27 KiroIDE-0.8.1-mobaus";

/// Agent 模式: vibe (Kiro IDE 默认模式)
const KIRO_API_AGENT_MODE: &str = "vibe";

/// Kiro 模型 ID 映射
/// 将用户配置的模型名称映射到 Kiro API 实际支持的模型 ID
fn map_kiro_model(model_name: &str) -> String {
    match model_name.to_lowercase().as_str() {
        // Claude Sonnet 4 系列
        "claude-sonnet-4" | "claude-sonnet-4-20250514" => "claude-sonnet-4".to_string(),
        // Claude Sonnet 4.5 系列
        "claude-sonnet-4-5" | "claude-sonnet-4.5" | "claude-sonnet-4-5-20250929" => {
            "claude-sonnet-4.5".to_string()
        }
        // Claude Opus 4.5 系列
        "claude-opus-4-5" | "claude-opus-4.5" => "claude-opus-4.5".to_string(),
        // Claude Haiku 4.5 系列
        "claude-haiku-4-5" | "claude-haiku-4.5" => "claude-haiku-4.5".to_string(),
        // 自动选择
        "auto" => "auto".to_string(),
        // 默认使用 Sonnet 4.5
        _ => {
            warn!(
                "[map_kiro_model] 未知模型 '{}', 使用默认 claude-sonnet-4.5",
                model_name
            );
            "claude-sonnet-4.5".to_string()
        }
    }
}

/// 从 serde_json::Value 中提取字符串内容
///
/// 支持以下格式:
/// - 字符串: "hello" -> "hello"
/// - 数组（多模态）: [{"type": "text", "text": "hello"}] -> "hello"
/// - null: null -> ""
fn get_content_as_string(content: &serde_json::Value) -> String {
    match content {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(arr) => {
            // 多模态内容，提取所有 text 类型的内容
            arr.iter()
                .filter_map(|item| {
                    if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                        item.get("text")
                            .and_then(|t| t.as_str())
                            .map(|s| s.to_string())
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
                .join("\n")
        }
        serde_json::Value::Null => String::new(),
        _ => content.to_string(),
    }
}

/// 构建 Kiro API 请求体
///
/// 将 OpenAI 格式的消息转换为 Kiro API 格式
///
/// Kiro API 请求格式:
/// ```json
/// {
///   "conversationState": {
///     "chatTriggerType": "MANUAL",
///     "conversationId": "uuid",
///     "currentMessage": {
///       "userInputMessage": {
///         "content": "用户消息",
///         "modelId": "claude-sonnet-4.5",
///         "origin": "AI_EDITOR",
///         "userInputMessageContext": {
///           "tools": [...],
///           "toolResults": [...]
///         }
///       }
///     },
///     "history": [...]
///   },
///   "profileArn": "arn:aws:...",  // 可选，仅 Social Auth 需要
///   "inferenceConfig": {
///     "maxTokens": 4096,
///     "temperature": 0.7
///   }
/// }
/// ```
fn build_kiro_request_body(
    request: &ChatSendRequest,
    profile_arn: Option<&str>,
) -> serde_json::Value {
    let model_id = map_kiro_model(&request.model_name);
    let conversation_id = uuid::Uuid::new_v4().to_string();

    // 提取系统提示词
    let mut system_prompt = request.system_prompt.clone().unwrap_or_default();

    // 添加时间戳上下文
    let timestamp = chrono::Local::now()
        .format("%Y-%m-%d %H:%M:%S %Z")
        .to_string();
    let timestamp_context = format!("[Context: Current time is {}]", timestamp);
    if !system_prompt.is_empty() {
        system_prompt = format!("{}\n\n{}", timestamp_context, system_prompt);
    } else {
        system_prompt = timestamp_context;
    }

    // 构建历史消息和当前消息
    let mut history: Vec<serde_json::Value> = Vec::new();
    let mut current_user_content = String::new();
    let mut current_tool_results: Vec<serde_json::Value> = Vec::new();

    // 处理消息列表
    let messages = &request.messages;
    let msg_count = messages.len();

    for (i, msg) in messages.iter().enumerate() {
        let is_last = i == msg_count - 1;
        let role = msg.role.as_str();

        match role {
            "system" => {
                // 系统消息合并到 system_prompt
                let content = get_content_as_string(&msg.content);
                if !content.is_empty() {
                    if !system_prompt.is_empty() {
                        system_prompt.push_str("\n\n");
                    }
                    system_prompt.push_str(&content);
                }
            }
            "user" => {
                let content = get_content_as_string(&msg.content);
                if is_last {
                    current_user_content = content;
                } else {
                    // 添加到历史
                    history.push(serde_json::json!({
                        "userInputMessage": {
                            "content": content,
                            "modelId": model_id,
                            "origin": "AI_EDITOR"
                        }
                    }));
                }
            }
            "assistant" => {
                let content = get_content_as_string(&msg.content);
                let mut assistant_msg = serde_json::json!({
                    "content": content
                });

                // 处理 tool_calls
                if let Some(tool_calls) = &msg.tool_calls {
                    let mut tool_uses: Vec<serde_json::Value> = Vec::new();
                    for tc in tool_calls {
                        if let Some(tc_obj) = tc.as_object() {
                            let tool_use_id =
                                tc_obj.get("id").and_then(|v| v.as_str()).unwrap_or("");
                            let function = tc_obj.get("function").and_then(|v| v.as_object());
                            if let Some(func) = function {
                                let name = func.get("name").and_then(|v| v.as_str()).unwrap_or("");
                                let arguments = func
                                    .get("arguments")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("{}");
                                let input: serde_json::Value = serde_json::from_str(arguments)
                                    .unwrap_or(serde_json::json!({}));

                                tool_uses.push(serde_json::json!({
                                    "toolUseId": tool_use_id,
                                    "name": name,
                                    "input": input
                                }));
                            }
                        }
                    }
                    if !tool_uses.is_empty() {
                        assistant_msg["toolUses"] = serde_json::json!(tool_uses);
                    }
                }

                history.push(serde_json::json!({
                    "assistantResponseMessage": assistant_msg
                }));
            }
            "tool" => {
                // 工具结果消息
                let tool_call_id = msg.tool_call_id.clone().unwrap_or_default();
                let content = get_content_as_string(&msg.content);

                if is_last {
                    // v4.2.2: 最后一条工具结果，放到 currentMessage 的 toolResults 中（去重 toolUseId）
                    let tool_use_id = tool_call_id.clone();
                    // 检查是否已存在相同 toolUseId
                    let already_exists = current_tool_results.iter().any(|tr| {
                        tr.get("toolUseId")
                            .and_then(|id| id.as_str())
                            .map(|id| id == tool_use_id)
                            .unwrap_or(false)
                    });

                    if !already_exists {
                        current_tool_results.push(serde_json::json!({
                            "toolUseId": tool_call_id,
                            "content": [{"text": content}],
                            "status": "success"
                        }));
                    }
                } else {
                    // v4.2.2: 历史中的工具结果，需要包装成 userInputMessage + toolResults（去重 toolUseId）
                    // Kiro API 要求工具结果以 userInputMessage 形式传递
                    let tool_use_id = tool_call_id.clone();

                    // 检查是否已存在相同 toolUseId
                    let already_exists = current_tool_results.iter().any(|tr| {
                        tr.get("toolUseId")
                            .and_then(|id| id.as_str())
                            .map(|id| id == tool_use_id)
                            .unwrap_or(false)
                    });

                    if !already_exists {
                        let tool_result = serde_json::json!({
                            "toolUseId": tool_call_id,
                            "content": [{"text": content}],
                            "status": "success"
                        });

                        // 检查下一条消息是否也是 tool（同一轮多个工具结果）
                        // 如果是，先累积；如果不是，打包成 userInputMessage
                        let next_is_tool = if i + 1 < msg_count {
                            messages[i + 1].role.as_str() == "tool"
                        } else {
                            false
                        };

                        current_tool_results.push(tool_result);

                        if !next_is_tool {
                            // 当前是这一轮最后一个工具结果，打包成 userInputMessage
                            history.push(serde_json::json!({
                                "userInputMessage": {
                                    "content": "Tool results provided.",
                                    "modelId": model_id,
                                    "origin": "AI_EDITOR",
                                    "userInputMessageContext": {
                                        "toolResults": current_tool_results.clone()
                                    }
                                }
                            }));
                            current_tool_results.clear();
                        }
                    } else {
                        // 如果是重复的 toolUseId，检查是否需要打包
                        let next_is_tool = if i + 1 < msg_count {
                            messages[i + 1].role.as_str() == "tool"
                        } else {
                            false
                        };

                        if !next_is_tool && !current_tool_results.is_empty() {
                            // 当前是这一轮最后一个工具结果，打包成 userInputMessage
                            history.push(serde_json::json!({
                                "userInputMessage": {
                                    "content": "Tool results provided.",
                                    "modelId": model_id,
                                    "origin": "AI_EDITOR",
                                    "userInputMessageContext": {
                                        "toolResults": current_tool_results.clone()
                                    }
                                }
                            }));
                            current_tool_results.clear();
                        }
                    }
                }
            }
            _ => {
                debug!("[build_kiro_request_body] 忽略未知角色: {}", role);
            }
        }
    }

    // 构建最终内容（包含系统提示词）
    let final_content = if !system_prompt.is_empty() {
        format!(
            "--- SYSTEM PROMPT ---\n{}\n--- END SYSTEM PROMPT ---\n\n{}",
            system_prompt, current_user_content
        )
    } else {
        current_user_content
    };

    // 确保内容不为空
    let final_content = if final_content.trim().is_empty() {
        if !current_tool_results.is_empty() {
            "Tool results provided.".to_string()
        } else {
            "Continue".to_string()
        }
    } else {
        final_content
    };

    // 构建 userInputMessageContext
    let mut user_input_context = serde_json::json!({});

    // v4.1.34: 清理 history，确保 userInputMessage 和 assistantResponseMessage 严格交替
    // Kiro API 要求历史消息交替出现，连续的同角色消息会导致 400 Improperly formed request
    let mut cleaned_history: Vec<serde_json::Value> = Vec::new();
    for entry in history.into_iter() {
        let is_user = entry.get("userInputMessage").is_some();
        let is_assistant = entry.get("assistantResponseMessage").is_some();

        if let Some(last) = cleaned_history.last() {
            let last_is_user = last.get("userInputMessage").is_some();
            let last_is_assistant = last.get("assistantResponseMessage").is_some();

            if is_user && last_is_user {
                // 连续 user 消息：合并内容
                if let Some(last_entry) = cleaned_history.last_mut() {
                    let last_content = last_entry["userInputMessage"]["content"]
                        .as_str()
                        .unwrap_or("")
                        .to_string();
                    let new_content = entry["userInputMessage"]["content"]
                        .as_str()
                        .unwrap_or("")
                        .to_string();
                    last_entry["userInputMessage"]["content"] =
                        serde_json::json!(format!("{}\n{}", last_content, new_content));
                }
                continue;
            } else if is_assistant && last_is_assistant {
                // 连续 assistant 消息：在中间插入占位 user 消息
                cleaned_history.push(serde_json::json!({
                    "userInputMessage": {
                        "content": "继续",
                        "modelId": model_id,
                        "origin": "AI_EDITOR"
                    }
                }));
            }
        }
        cleaned_history.push(entry);
    }
    let history = cleaned_history;

    // v4.1.36: 消息截断 - 防止 Kiro API "Input is too long" 错误
    // Kiro API 的 token 限制约 200k，使用与 Anthropic/Google 相同的截断逻辑
    let history = {
        // 将 history 转为 Vec<Value> 进行截断
        let truncated = truncate_messages_by_tokens(history, 180000);
        // 截断后确保第一条是 userInputMessage（不能从 assistantResponseMessage 开始）
        let mut start = 0;
        while start < truncated.len() {
            if truncated[start].get("userInputMessage").is_some() {
                break;
            }
            start += 1;
        }
        if start > 0 && start < truncated.len() {
            truncated[start..].to_vec()
        } else {
            truncated
        }
    };

    // 添加工具定义
    if let Some(tools) = &request.tools {
        if !tools.is_empty() {
            let kiro_tools: Vec<serde_json::Value> = tools
                .iter()
                .filter_map(|tool| {
                    let tool_obj = tool.as_object()?;
                    if tool_obj.get("type")?.as_str()? != "function" {
                        return None;
                    }
                    let function = tool_obj.get("function")?.as_object()?;
                    let name = function.get("name")?.as_str()?;
                    let default_desc = format!("Tool: {}", name);
                    let description = function
                        .get("description")
                        .and_then(|v| v.as_str())
                        .unwrap_or(&default_desc);
                    let parameters =
                        function
                            .get("parameters")
                            .cloned()
                            .unwrap_or(serde_json::json!({
                                "type": "object",
                                "properties": {}
                            }));

                    Some(serde_json::json!({
                        "toolSpecification": {
                            "name": name,
                            "description": description,
                            "inputSchema": {
                                "json": parameters
                            }
                        }
                    }))
                })
                .collect();

            if !kiro_tools.is_empty() {
                user_input_context["tools"] = serde_json::json!(kiro_tools);
            }
        }
    }

    // 添加工具结果
    if !current_tool_results.is_empty() {
        user_input_context["toolResults"] = serde_json::json!(current_tool_results);
    }

    // 构建 currentMessage
    let mut current_message = serde_json::json!({
        "userInputMessage": {
            "content": final_content,
            "modelId": model_id,
            "origin": "AI_EDITOR"
        }
    });

    // 添加 userInputMessageContext（如果有内容）
    if user_input_context
        .as_object()
        .map(|o| !o.is_empty())
        .unwrap_or(false)
    {
        current_message["userInputMessage"]["userInputMessageContext"] = user_input_context;
    }

    // 构建完整请求体
    let mut body = serde_json::json!({
        "conversationState": {
            "chatTriggerType": "MANUAL",
            "conversationId": conversation_id,
            "currentMessage": current_message,
            "history": history
        }
    });

    // 添加 profileArn（仅 Social Auth 需要）
    if let Some(arn) = profile_arn {
        if !arn.is_empty() {
            body["profileArn"] = serde_json::json!(arn);
        }
    }

    // 添加 inferenceConfig
    let mut inference_config = serde_json::json!({});
    if let Some(max_tokens) = request.max_tokens {
        inference_config["maxTokens"] = serde_json::json!(max_tokens);
    }
    if let Some(temperature) = request.temperature {
        inference_config["temperature"] = serde_json::json!(temperature);
    }
    if inference_config
        .as_object()
        .map(|o| !o.is_empty())
        .unwrap_or(false)
    {
        body["inferenceConfig"] = inference_config;
    }

    body
}

/// 解析 AWS Event Stream 消息
///
/// AWS Event Stream 二进制格式:
/// - Prelude (12 bytes): total_length (4) + headers_length (4) + prelude_crc (4)
/// - Headers (variable): header entries
/// - Payload (variable): JSON data
/// - Message CRC (4 bytes)
fn parse_aws_event_stream_message(data: &[u8]) -> Option<(String, serde_json::Value)> {
    if data.len() < 16 {
        return None;
    }

    // 读取 prelude
    let total_length = u32::from_be_bytes([data[0], data[1], data[2], data[3]]) as usize;
    let headers_length = u32::from_be_bytes([data[4], data[5], data[6], data[7]]) as usize;

    if total_length > data.len() || total_length < 16 {
        return None;
    }

    // 解析 headers
    let headers_start = 12;
    let headers_end = headers_start + headers_length;
    if headers_end > total_length - 4 {
        return None;
    }

    let mut event_type = String::new();
    let mut pos = headers_start;

    while pos < headers_end {
        if pos >= data.len() {
            break;
        }

        // Header name length (1 byte)
        let name_len = data[pos] as usize;
        pos += 1;

        if pos + name_len > headers_end {
            break;
        }

        // Header name
        let name = String::from_utf8_lossy(&data[pos..pos + name_len]).to_string();
        pos += name_len;

        if pos >= headers_end {
            break;
        }

        // Header type (1 byte) - 7 = string
        let header_type = data[pos];
        pos += 1;

        if header_type == 7 {
            // String value
            if pos + 2 > headers_end {
                break;
            }
            let value_len = u16::from_be_bytes([data[pos], data[pos + 1]]) as usize;
            pos += 2;

            if pos + value_len > headers_end {
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
        return Some((event_type, serde_json::json!({})));
    }

    let payload_data = &data[payload_start..payload_end];
    let payload: serde_json::Value =
        serde_json::from_slice(payload_data).unwrap_or(serde_json::json!({}));

    Some((event_type, payload))
}

/// 流式发送消息（使用 Kiro API / Amazon Q）
///
/// v0.8.0: 支持 Kiro OAuth 用户通过 AWS Builder ID 或 IDC 登录后使用
/// v0.9.0: 根据认证方式（IDC/Builder ID）选择不同的 User-Agent
/// 使用 Amazon Q 端点: https://q.{region}.amazonaws.com/generateAssistantResponse
///
/// Kiro API 返回 AWS Event Stream 二进制格式，需要特殊解析
async fn chat_stream_kiro(
    window: Window,
    request: &ChatSendRequest,
    client: &reqwest::Client,
) -> Result<(), String> {
    // v4.1.31: 从 api_key 中解析 access_token、profile_arn、auth_method 和 sso_region
    // 格式: access_token|profile_arn|auth_method|sso_region
    // auth_method: "idc" 或 "aws"（默认 aws = Builder ID）
    // sso_region: IDC 用户的 SSO 区域（用于确定 API 端点）
    let (access_token, profile_arn, auth_method, sso_region) = {
        let parts: Vec<&str> = request.api_key.splitn(4, '|').collect();
        match parts.len() {
            4 => (
                parts[0].to_string(),
                Some(parts[1].to_string()),
                parts[2].to_string(),
                Some(parts[3].to_string()),
            ),
            3 => (
                parts[0].to_string(),
                Some(parts[1].to_string()),
                parts[2].to_string(),
                None,
            ),
            2 => (
                parts[0].to_string(),
                Some(parts[1].to_string()),
                "aws".to_string(),
                None,
            ),
            _ => (request.api_key.clone(), None, "aws".to_string(), None),
        }
    };

    // 过滤空的 profile_arn 和 sso_region
    let profile_arn = profile_arn.filter(|s| !s.is_empty());
    let sso_region = sso_region.filter(|s| !s.is_empty());

    // 判断是否是 IDC 认证
    let is_idc = auth_method.to_lowercase() == "idc";

    if access_token.is_empty() {
        return Err("Kiro access token is required".to_string());
    }

    // v0.9.0: 根据认证方式选择 User-Agent
    let (user_agent, amz_user_agent) = if is_idc {
        (KIRO_API_USER_AGENT_IDC, KIRO_API_AMZ_USER_AGENT_IDC)
    } else {
        (KIRO_API_USER_AGENT_AWS, KIRO_API_AMZ_USER_AGENT_AWS)
    };

    // v4.1.31: 构建 Kiro API 端点
    // IDC 用户使用其 SSO 区域对应的端点，Builder ID 用户使用默认 us-east-1
    let api_region = if is_idc {
        sso_region.as_deref().unwrap_or(KIRO_API_REGION)
    } else {
        KIRO_API_REGION
    };
    let url = format!(
        "https://q.{}.amazonaws.com/generateAssistantResponse",
        api_region
    );

    info!("[chat_stream_kiro] 使用 Kiro API: {}", url);
    info!("[chat_stream_kiro] 模型: {}", request.model_name);
    info!("[chat_stream_kiro] Profile ARN: {:?}", profile_arn);
    info!(
        "[chat_stream_kiro] 认证方式: {} (is_idc={})",
        auth_method, is_idc
    );
    info!(
        "[chat_stream_kiro] API 区域: {} (sso_region={:?})",
        api_region, sso_region
    );

    // v0.9.0: 打印请求头用于调试
    info!("[chat_stream_kiro] User-Agent: {}", user_agent);
    info!("[chat_stream_kiro] X-Amz-User-Agent: {}", amz_user_agent);
    info!(
        "[chat_stream_kiro] x-amzn-kiro-agent-mode: {}",
        KIRO_API_AGENT_MODE
    );

    // 构建请求体
    // v4.1.30: IDC 和 Builder ID 用户不应包含 profileArn，否则会导致 403 错误
    // 只有社交登录（Google/GitHub）用户才需要 profileArn
    // IDC 用户虽然可能通过 ListProfiles 获取到 profileArn，但 generateAssistantResponse 不接受
    let effective_profile_arn = if is_idc {
        debug!("[chat_stream_kiro] IDC 用户，不传递 profileArn（避免 403）");
        None
    } else {
        profile_arn.as_deref()
    };
    let body = build_kiro_request_body(request, effective_profile_arn);

    debug!(
        "[chat_stream_kiro] 请求体: {}",
        serde_json::to_string_pretty(&body).unwrap_or_default()
    );

    // 发送请求
    let invocation_id = uuid::Uuid::new_v4().to_string();
    let mut response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Accept", "*/*")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", user_agent)
        .header("X-Amz-User-Agent", amz_user_agent)
        .header("x-amzn-kiro-agent-mode", KIRO_API_AGENT_MODE)
        .header("x-amzn-codewhisperer-optout", "true")
        .header("Amz-Sdk-Request", "attempt=1; max=3")
        .header("Amz-Sdk-Invocation-Id", &invocation_id)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            error!("[chat_stream_kiro] 请求失败: {}", e);
            format!("Kiro API request failed: {}", e)
        })?;

    let status = response.status();
    info!("[chat_stream_kiro] 响应状态码: {}", status);

    if !status.is_success() {
        let err_text = response.text().await.unwrap_or_default();
        error!("[chat_stream_kiro] API 错误 {}: {}", status, err_text);

        // v4.1.30: 403 错误可能是 profileArn 导致的
        // 如果请求体中包含 profileArn，尝试移除后重试
        if status.as_u16() == 403 && body.get("profileArn").is_some() {
            warn!("[chat_stream_kiro] 403 错误，尝试移除 profileArn 后重试");
            let mut retry_body = body.clone();
            retry_body.as_object_mut().map(|o| o.remove("profileArn"));

            let retry_invocation_id = uuid::Uuid::new_v4().to_string();
            let retry_response = client
                .post(&url)
                .header("Content-Type", "application/json")
                .header("Accept", "*/*")
                .header("Authorization", format!("Bearer {}", access_token))
                .header("User-Agent", user_agent)
                .header("X-Amz-User-Agent", amz_user_agent)
                .header("x-amzn-kiro-agent-mode", KIRO_API_AGENT_MODE)
                .header("x-amzn-codewhisperer-optout", "true")
                .header("Amz-Sdk-Request", "attempt=1; max=3")
                .header("Amz-Sdk-Invocation-Id", &retry_invocation_id)
                .json(&retry_body)
                .send()
                .await
                .map_err(|e| {
                    error!("[chat_stream_kiro] 重试请求失败: {}", e);
                    format!("Kiro API retry failed: {}", e)
                })?;

            let retry_status = retry_response.status();
            if retry_status.is_success() {
                info!("[chat_stream_kiro] 移除 profileArn 后重试成功");
                response = retry_response;
            } else {
                let retry_err = retry_response.text().await.unwrap_or_default();
                error!(
                    "[chat_stream_kiro] 重试仍然失败 {}: {}",
                    retry_status, retry_err
                );

                // v4.1.44: 发送 error 事件到前端
                let msg_id = request
                    .message_id
                    .clone()
                    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                let _ = window.emit(
                    "chat-event",
                    serde_json::json!({
                        "id": msg_id,
                        "event": "error",
                        "error": format!("Kiro API Error {}: {}", retry_status, retry_err)
                    }),
                );

                return Err(format!("Kiro API Error {}: {}", retry_status, retry_err));
            }
        } else {
            // v4.1.44: 发送 error 事件到前端
            let msg_id = request
                .message_id
                .clone()
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let _ = window.emit(
                "chat-event",
                serde_json::json!({
                    "id": msg_id,
                    "event": "error",
                    "error": format!("Kiro API Error {}: {}", status, err_text)
                }),
            );

            return Err(format!("Kiro API Error {}: {}", status, err_text));
        }
    }

    info!("[chat_stream_kiro] 开始接收流式响应");

    // 生成消息 ID
    let msg_id = request
        .message_id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    // 用于累积数据
    let mut buffer: Vec<u8> = Vec::new();
    let mut content_accumulator = String::new();
    let mut tool_calls_accumulator: Vec<serde_json::Value> = Vec::new();
    let mut usage_accumulator: Option<serde_json::Value> = None;
    let mut reasoning_accumulator = String::new();
    let mut received_valid_event = false; // 标记是否收到有效的事件流数据

    // 读取流式响应
    while let Ok(Some(chunk)) = response.chunk().await {
        buffer.extend_from_slice(&chunk);

        // v4.1.46: 检测响应格式是否正确（防止返回 HTML 等非二进制事件流格式）
        if !received_valid_event && buffer.len() > 50 {
            // 检查是否是 HTML 响应（转为字符串检查）
            if let Ok(text) = std::str::from_utf8(&buffer[..buffer.len().min(100)]) {
                let text_lower = text.to_lowercase();
                if text_lower.contains("<!doctype") || text_lower.contains("<html") {
                    let preview =
                        String::from_utf8_lossy(&buffer[..buffer.len().min(200)]).to_string();
                    error!("[chat_stream_kiro] 响应格式错误：收到 HTML 而不是二进制事件流，前200字符: {}", preview);

                    let _ = window.emit("chat-event", serde_json::json!({
                        "id": msg_id,
                        "event": "error",
                        "error": format!("API 响应格式错误：收到 HTML 页面而不是事件流数据。请检查：\n1. API 端点地址是否正确\n2. Access Token 是否有效\n3. 网络代理配置是否正确\n\n响应预览：{}", preview)
                    }));

                    return Err("API 响应格式错误：收到 HTML 而不是二进制事件流".to_string());
                }
            }

            // 检查是否是有效的 AWS Event Stream（检查前12字节的消息头）
            if buffer.len() >= 12 {
                received_valid_event = true;
            }
        }

        // 尝试解析 AWS Event Stream 消息
        while buffer.len() >= 16 {
            // 读取消息长度
            let total_length =
                u32::from_be_bytes([buffer[0], buffer[1], buffer[2], buffer[3]]) as usize;

            if !(16..=10 * 1024 * 1024).contains(&total_length) {
                // 无效的消息长度，跳过一个字节
                buffer.remove(0);
                continue;
            }

            if buffer.len() < total_length {
                // 数据不完整，等待更多数据
                break;
            }

            // 提取完整消息
            let message_data: Vec<u8> = buffer.drain(..total_length).collect();

            // 解析消息
            if let Some((event_type, payload)) = parse_aws_event_stream_message(&message_data) {
                debug!(
                    "[chat_stream_kiro] 事件类型: {}, payload: {}",
                    event_type,
                    serde_json::to_string(&payload).unwrap_or_default()
                );

                match event_type.as_str() {
                    "assistantResponseEvent" => {
                        // 处理助手响应事件
                        if let Some(event_data) = payload.get("assistantResponseEvent") {
                            // 提取文本内容
                            if let Some(content) =
                                event_data.get("content").and_then(|v| v.as_str())
                            {
                                if !content.is_empty() {
                                    content_accumulator.push_str(content);

                                    // 发送 chunk 事件
                                    let _ = window.emit(
                                        "chat-event",
                                        serde_json::json!({
                                            "id": msg_id,
                                            "event": "chunk",
                                            "content": content
                                        }),
                                    );
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
                                    let input =
                                        tu.get("input").cloned().unwrap_or(serde_json::json!({}));

                                    if !tool_use_id.is_empty() && !name.is_empty() {
                                        tool_calls_accumulator.push(serde_json::json!({
                                            "id": tool_use_id,
                                            "type": "function",
                                            "function": {
                                                "name": name,
                                                "arguments": serde_json::to_string(&input).unwrap_or_default()
                                            }
                                        }));
                                    }
                                }
                            }
                        }

                        // 也尝试直接从 payload 提取
                        if let Some(content) = payload.get("content").and_then(|v| v.as_str()) {
                            if !content.is_empty() && !content_accumulator.contains(content) {
                                content_accumulator.push_str(content);
                                let _ = window.emit(
                                    "chat-event",
                                    serde_json::json!({
                                        "id": msg_id,
                                        "event": "chunk",
                                        "content": content
                                    }),
                                );
                            }
                        }
                    }
                    "reasoningContentEvent" => {
                        // 处理推理内容事件（thinking mode）
                        // v0.9.2: 修复嵌套结构提取，与 assistantResponseEvent 保持一致
                        let event_data = payload.get("reasoningContentEvent").unwrap_or(&payload);
                        if let Some(content) = event_data.get("content").and_then(|v| v.as_str()) {
                            if !content.is_empty() {
                                reasoning_accumulator.push_str(content);
                                let _ = window.emit(
                                    "chat-event",
                                    serde_json::json!({
                                        "id": msg_id,
                                        "event": "reasoning_chunk",
                                        "content": content
                                    }),
                                );
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
                        let input = payload
                            .get("input")
                            .cloned()
                            .unwrap_or(serde_json::json!({}));

                        if !tool_use_id.is_empty() && !name.is_empty() {
                            // 检查是否已存在
                            let exists = tool_calls_accumulator.iter().any(|tc| {
                                tc.get("id").and_then(|v| v.as_str()) == Some(tool_use_id)
                            });

                            if !exists {
                                tool_calls_accumulator.push(serde_json::json!({
                                    "id": tool_use_id,
                                    "type": "function",
                                    "function": {
                                        "name": name,
                                        "arguments": serde_json::to_string(&input).unwrap_or_default()
                                    }
                                }));
                            }
                        }
                    }
                    "messageMetadataEvent" | "metadataEvent" => {
                        // 处理元数据事件（包含 token 使用信息）
                        let metadata = payload
                            .get("messageMetadataEvent")
                            .or_else(|| payload.get("metadataEvent"))
                            .unwrap_or(&payload);

                        if let Some(token_usage) = metadata.get("tokenUsage") {
                            let input_tokens = token_usage
                                .get("uncachedInputTokens")
                                .or_else(|| token_usage.get("inputTokens"))
                                .and_then(|v| v.as_i64())
                                .unwrap_or(0);
                            let output_tokens = token_usage
                                .get("outputTokens")
                                .and_then(|v| v.as_i64())
                                .unwrap_or(0);

                            usage_accumulator = Some(serde_json::json!({
                                "prompt_tokens": input_tokens,
                                "completion_tokens": output_tokens,
                                "total_tokens": input_tokens + output_tokens
                            }));
                        }
                    }
                    "meteringEvent" => {
                        // 计量事件，记录日志
                        let usage = payload.get("usage").and_then(|v| v.as_f64()).unwrap_or(0.0);
                        let unit = payload.get("unit").and_then(|v| v.as_str()).unwrap_or("");
                        info!("[chat_stream_kiro] 计量: {} {}", usage, unit);
                    }
                    "error" | "exception" | "internalServerException" => {
                        // 错误事件
                        let error_msg = payload
                            .get("message")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown error");
                        error!("[chat_stream_kiro] API 错误: {}", error_msg);
                        return Err(format!("Kiro API error: {}", error_msg));
                    }
                    "followupPromptEvent" => {
                        // 忽略后续提示事件
                        debug!("[chat_stream_kiro] 忽略 followupPromptEvent");
                    }
                    _ => {
                        // 其他事件类型
                        debug!("[chat_stream_kiro] 未处理的事件类型: {}", event_type);
                    }
                }
            }
        }
    }

    // 发送工具调用事件（如果有）
    if !tool_calls_accumulator.is_empty() {
        info!(
            "[chat_stream_kiro] AI 请求工具调用，数量: {}",
            tool_calls_accumulator.len()
        );
        let _ = window.emit(
            "chat-event",
            serde_json::json!({
                "id": msg_id,
                "event": "tool_calls",
                "tool_calls": tool_calls_accumulator
            }),
        );
    }

    // 发送完成事件
    let mut done_payload = serde_json::json!({
        "id": msg_id,
        "event": "done"
    });
    if let Some(usage) = usage_accumulator {
        done_payload["usage"] = usage;
    }
    let _ = window.emit("chat-event", done_payload);

    info!("[chat_stream_kiro] 流式响应完成");

    Ok(())
}

/// 流式发送消息（使用 ChatGPT Codex API）
///
/// v3.3.5: 支持 ChatGPT Plus/Pro 用户通过 OAuth 登录后使用
/// 使用 chatgpt.com/backend-api/codex/responses 端点
async fn chat_stream_codex_api(
    window: Window,
    request: &ChatSendRequest,
    client: &reqwest::Client,
) -> Result<(), String> {
    // ChatGPT Codex API 端点
    let url = "https://chatgpt.com/backend-api/codex/responses";

    info!("[chat_stream_codex_api] 使用 ChatGPT Codex API: {}", url);
    info!("[chat_stream_codex_api] 模型: {}", request.model_name);
    info!(
        "[chat_stream_codex_api] Account ID: {:?}",
        request.account_id
    );

    // 构建消息列表
    let mut messages = Vec::new();
    for msg in &request.messages {
        messages.push(serde_json::to_value(msg).unwrap_or_default());
    }

    // 转换为 Responses API 格式（Codex API 使用相同的格式）
    let input = convert_messages_to_responses_input(&messages, request.system_prompt.as_deref());

    // 构建请求体
    let mut body = serde_json::json!({
        "model": request.model_name,
        "input": input,
        "stream": true
    });

    // 添加 max_tokens
    if let Some(max_tokens) = request.max_tokens {
        body["max_output_tokens"] = serde_json::json!(max_tokens);
    }

    // 添加 temperature（某些模型不支持）
    if let Some(temp) = request.temperature {
        let model_lower = request.model_name.to_lowercase();
        if !model_lower.starts_with("o1")
            && !model_lower.starts_with("o3")
            && !model_lower.starts_with("o4")
        {
            body["temperature"] = serde_json::json!(temp);
        }
    }

    // 如果有工具，转换为 Responses API 格式
    if let Some(ref tools) = request.tools {
        if !tools.is_empty() {
            let mut api_tools = Vec::new();
            for tool in tools {
                api_tools.push(serde_json::json!({
                    "type": "function",
                    "name": tool["function"]["name"],
                    "description": tool["function"]["description"],
                    "parameters": tool["function"]["parameters"]
                }));
            }
            body["tools"] = serde_json::json!(api_tools);
            info!(
                "[chat_stream_codex_api] 添加工具，数量: {}",
                api_tools.len()
            );
        }
    }

    debug!(
        "[chat_stream_codex_api] 请求体: {}",
        serde_json::to_string_pretty(&body).unwrap_or_default()
    );

    // 打印请求地址
    info!("[chat_stream_codex_api] 请求地址: {}", url);

    // 构建请求，添加必要的 headers
    let trimmed_key = request.api_key.trim();
    let mut req_builder = client
        .post(url)
        .header("Authorization", format!("Bearer {}", trimmed_key))
        .header("Content-Type", "application/json");

    // v3.3.5: 添加 ChatGPT-Account-Id header（关键！）
    if let Some(ref account_id) = request.account_id {
        req_builder = req_builder.header("ChatGPT-Account-Id", account_id);
        info!("[chat_stream_codex_api] 添加 ChatGPT-Account-Id header");
    }

    let mut response = req_builder
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status();
    info!("[chat_stream_codex_api] 响应状态码: {}", status);

    if !status.is_success() {
        let err_text = response.text().await.unwrap_or_default();
        error!(
            "[chat_stream_codex_api] API 错误: {} - {}",
            status, err_text
        );

        // v4.1.44: 发送 error 事件到前端
        let msg_id = request
            .message_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let _ = window.emit(
            "chat-event",
            serde_json::json!({
                "id": msg_id,
                "event": "error",
                "error": format!("API Error {}: {}", status, err_text)
            }),
        );

        return Err(format!("API Error {}: {}", status, err_text));
    }

    let mut buffer = String::new();
    // v4.1.10: 优先使用传入的 message_id，用于圆桌讨论区分不同参与者
    let msg_id = request
        .message_id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let mut usage_accumulator: Option<serde_json::Value> = None;
    let mut function_calls: Vec<serde_json::Value> = Vec::new();
    let mut received_valid_sse = false; // 标记是否收到有效的 SSE 数据

    // 循环读取 Chunk
    while let Ok(Some(chunk)) = response.chunk().await {
        let s = String::from_utf8_lossy(&chunk);
        buffer.push_str(&s);

        // v4.1.46: 检测响应格式是否正确（防止返回 HTML 等非 SSE 格式）
        if !received_valid_sse && buffer.len() > 50 {
            // 检查是否是 HTML 响应
            let buffer_lower = buffer.to_lowercase();
            if buffer_lower.contains("<!doctype") || buffer_lower.contains("<html") {
                let preview = buffer.chars().take(200).collect::<String>();
                error!(
                    "[chat_stream_codex_api] 响应格式错误：收到 HTML 而不是 SSE 流，前200字符: {}",
                    preview
                );

                let _ = window.emit("chat-event", serde_json::json!({
                    "id": msg_id,
                    "event": "error",
                    "error": format!("API 响应格式错误：收到 HTML 页面而不是流式数据。请检查：\n1. API 端点地址是否正确\n2. Access Token 是否有效\n3. Account ID 是否正确\n\n响应预览：{}", preview)
                }));

                return Err("API 响应格式错误：收到 HTML 而不是 SSE 流".to_string());
            }

            // 检查是否包含 SSE 格式的标记
            if buffer.contains("data:") {
                received_valid_sse = true;
            }
        }

        // 处理 SSE 数据
        while let Some(pos) = buffer.find("\n\n") {
            let line_block: String = buffer.drain(..pos + 2).collect();
            for line in line_block.lines() {
                let line = line.trim();
                if let Some(data_str) = line.strip_prefix("data: ") {
                    if data_str == "[DONE]" {
                        let mut done_payload = serde_json::json!({
                            "id": msg_id,
                            "event": "done"
                        });
                        if let Some(ref usage) = usage_accumulator {
                            done_payload["usage"] = usage.clone();
                        }
                        let _ = window.emit("chat-event", done_payload);
                        continue;
                    }

                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data_str) {
                        // 提取 usage 信息
                        if json.get("usage").is_some() && !json["usage"].is_null() {
                            usage_accumulator = Some(json["usage"].clone());
                        }

                        // 处理 Responses API 格式的事件
                        if let Some(event_type) = json["type"].as_str() {
                            match event_type {
                                "response.output_text.delta" => {
                                    if let Some(delta) = json["delta"].as_str() {
                                        if !delta.is_empty() {
                                            let _ = window.emit(
                                                "chat-event",
                                                serde_json::json!({
                                                    "id": msg_id,
                                                    "event": "chunk",
                                                    "content": delta
                                                }),
                                            );
                                        }
                                    }
                                }
                                "response.function_call_arguments.delta" => {
                                    // 处理函数调用参数增量
                                }
                                "response.output_item.done" => {
                                    // 检查是否有函数调用
                                    if let Some(item) = json.get("item") {
                                        if item["type"].as_str() == Some("function_call") {
                                            function_calls.push(item.clone());
                                        }
                                    }
                                }
                                "response.done" => {
                                    // 检查是否有工具调用需要处理
                                    if !function_calls.is_empty() {
                                        info!(
                                            "[chat_stream_codex_api] AI 请求工具调用，数量: {}",
                                            function_calls.len()
                                        );
                                        let tool_calls: Vec<serde_json::Value> = function_calls.iter().map(|fc| {
                                            serde_json::json!({
                                                "id": fc["call_id"].as_str().unwrap_or(""),
                                                "type": "function",
                                                "function": {
                                                    "name": fc["name"].as_str().unwrap_or(""),
                                                    "arguments": fc["arguments"].as_str().unwrap_or("{}")
                                                }
                                            })
                                        }).collect();

                                        let _ = window.emit(
                                            "chat-event",
                                            serde_json::json!({
                                                "id": msg_id,
                                                "event": "tool_calls",
                                                "tool_calls": tool_calls
                                            }),
                                        );
                                    }
                                }
                                _ => {
                                    debug!(
                                        "[chat_stream_codex_api] 未处理的事件类型: {}",
                                        event_type
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

/// 流式发送消息（使用 OpenAI Responses API）
///
/// v3.3.4: 支持 GPT-5、GPT-4.1-nano 等新模型
async fn chat_stream_responses_api(
    window: Window,
    request: &ChatSendRequest,
    client: &reqwest::Client,
) -> Result<(), String> {
    let endpoint = normalize_url(
        request
            .endpoint
            .as_deref()
            .unwrap_or("https://api.openai.com/v1"),
    );
    let url = format!("{}/responses", endpoint);

    info!("[chat_stream_responses_api] 使用 Responses API: {}", url);
    info!("[chat_stream_responses_api] 模型: {}", request.model_name);

    // 构建消息列表
    let mut messages = Vec::new();
    for msg in &request.messages {
        messages.push(serde_json::to_value(msg).unwrap_or_default());
    }

    // 转换为 Responses API 格式
    let input = convert_messages_to_responses_input(&messages, request.system_prompt.as_deref());

    // 构建请求体
    let mut body = serde_json::json!({
        "model": request.model_name,
        "input": input,
        "stream": true
    });

    // 添加 max_tokens（Responses API 使用 max_output_tokens）
    if let Some(max_tokens) = request.max_tokens {
        body["max_output_tokens"] = serde_json::json!(max_tokens);
    }

    // 添加 temperature（某些模型不支持）
    if let Some(temp) = request.temperature {
        // GPT-5 系列和推理模型不支持 temperature
        let model_lower = request.model_name.to_lowercase();
        if !model_lower.starts_with("o1")
            && !model_lower.starts_with("o3")
            && !model_lower.starts_with("o4")
        {
            body["temperature"] = serde_json::json!(temp);
        }
    }

    // 如果有工具，转换为 Responses API 格式
    if let Some(ref tools) = request.tools {
        if !tools.is_empty() {
            let mut api_tools = Vec::new();
            for tool in tools {
                api_tools.push(serde_json::json!({
                    "type": "function",
                    "name": tool["function"]["name"],
                    "description": tool["function"]["description"],
                    "parameters": tool["function"]["parameters"]
                }));
            }
            body["tools"] = serde_json::json!(api_tools);
            info!(
                "[chat_stream_responses_api] 添加工具，数量: {}",
                api_tools.len()
            );
        }
    }

    debug!(
        "[chat_stream_responses_api] 请求体: {}",
        serde_json::to_string_pretty(&body).unwrap_or_default()
    );

    // 打印请求地址
    info!("[chat_stream_responses_api] 请求地址: {}", url);

    let trimmed_key = request.api_key.trim();
    let mut response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", trimmed_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status();
    info!("[chat_stream_responses_api] 响应状态码: {}", status);

    if !status.is_success() {
        let err_text = response.text().await.unwrap_or_default();
        error!(
            "[chat_stream_responses_api] API 错误: {} - {}",
            status, err_text
        );

        // v4.1.44: 发送 error 事件到前端
        let msg_id = request
            .message_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let _ = window.emit(
            "chat-event",
            serde_json::json!({
                "id": msg_id,
                "event": "error",
                "error": format!("API Error {}: {}", status, err_text)
            }),
        );

        return Err(format!("API Error {}: {}", status, err_text));
    }

    let mut buffer = String::new();
    // v4.1.10: 优先使用传入的 message_id，用于圆桌讨论区分不同参与者
    let msg_id = request
        .message_id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let mut usage_accumulator: Option<serde_json::Value> = None;

    // 用于累积 function_call 数据
    let mut function_calls: Vec<serde_json::Value> = Vec::new();
    let mut received_valid_sse = false; // 标记是否收到有效的 SSE 数据

    // 循环读取 Chunk
    while let Ok(Some(chunk)) = response.chunk().await {
        let s = String::from_utf8_lossy(&chunk);
        buffer.push_str(&s);

        // v4.1.46: 检测响应格式是否正确（防止返回 HTML 等非 SSE 格式）
        if !received_valid_sse && buffer.len() > 50 {
            // 检查是否是 HTML 响应
            let buffer_lower = buffer.to_lowercase();
            if buffer_lower.contains("<!doctype") || buffer_lower.contains("<html") {
                let preview = buffer.chars().take(200).collect::<String>();
                error!("[chat_stream_responses_api] 响应格式错误：收到 HTML 而不是 SSE 流，前200字符: {}", preview);

                let _ = window.emit("chat-event", serde_json::json!({
                    "id": msg_id,
                    "event": "error",
                    "error": format!("API 响应格式错误：收到 HTML 页面而不是流式数据。请检查：\n1. API 端点地址是否正确\n2. API Key 是否有效\n3. 网络代理配置是否正确\n\n响应预览：{}", preview)
                }));

                return Err("API 响应格式错误：收到 HTML 而不是 SSE 流".to_string());
            }

            // 检查是否包含 SSE 格式的标记
            if buffer.contains("data:") {
                received_valid_sse = true;
            }
        }

        // 处理 SSE 数据
        while let Some(pos) = buffer.find("\n\n") {
            let line_block: String = buffer.drain(..pos + 2).collect();
            for line in line_block.lines() {
                let line = line.trim();
                if let Some(data_str) = line.strip_prefix("data: ") {
                    if data_str == "[DONE]" {
                        // 发送 done 事件
                        let mut done_payload = serde_json::json!({
                            "id": msg_id,
                            "event": "done"
                        });
                        if let Some(ref usage) = usage_accumulator {
                            done_payload["usage"] = usage.clone();
                        }
                        let _ = window.emit("chat-event", done_payload);
                        continue;
                    }

                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data_str) {
                        // 提取 usage 信息
                        if json.get("usage").is_some() && !json["usage"].is_null() {
                            usage_accumulator = Some(json["usage"].clone());
                        }

                        // 处理 Responses API 的输出格式
                        // 格式: { "type": "response.output_text.delta", "delta": "..." }
                        // 或: { "type": "response.output_item.done", "item": { "type": "message", ... } }

                        if let Some(event_type) = json["type"].as_str() {
                            match event_type {
                                // 文本增量
                                "response.output_text.delta" => {
                                    if let Some(delta) = json["delta"].as_str() {
                                        if !delta.is_empty() {
                                            let _ = window.emit(
                                                "chat-event",
                                                serde_json::json!({
                                                    "id": msg_id,
                                                    "event": "chunk",
                                                    "content": delta
                                                }),
                                            );
                                        }
                                    }
                                }
                                // 推理内容增量（reasoning）
                                "response.reasoning.delta"
                                | "response.reasoning_summary_text.delta" => {
                                    if let Some(delta) = json["delta"].as_str() {
                                        if !delta.is_empty() {
                                            let _ = window.emit(
                                                "chat-event",
                                                serde_json::json!({
                                                    "id": msg_id,
                                                    "event": "reasoning_chunk",
                                                    "content": delta
                                                }),
                                            );
                                        }
                                    }
                                }
                                // 函数调用
                                "response.function_call_arguments.done" => {
                                    let call_id = json["call_id"].as_str().unwrap_or("");
                                    let name = json["name"].as_str().unwrap_or("");
                                    let arguments = json["arguments"].as_str().unwrap_or("{}");

                                    if !call_id.is_empty() && !name.is_empty() {
                                        function_calls.push(serde_json::json!({
                                            "id": call_id,
                                            "type": "function",
                                            "function": {
                                                "name": name,
                                                "arguments": arguments
                                            }
                                        }));
                                    }
                                }
                                // 响应完成
                                "response.done" => {
                                    // 如果有函数调用，发送 tool_calls 事件
                                    if !function_calls.is_empty() {
                                        info!(
                                            "[chat_stream_responses_api] AI 请求工具调用，数量: {}",
                                            function_calls.len()
                                        );
                                        let _ = window.emit(
                                            "chat-event",
                                            serde_json::json!({
                                                "id": msg_id,
                                                "event": "tool_calls",
                                                "tool_calls": function_calls.clone()
                                            }),
                                        );
                                    }

                                    // 提取 usage
                                    if let Some(response_obj) = json.get("response") {
                                        if let Some(usage) = response_obj.get("usage") {
                                            usage_accumulator = Some(usage.clone());
                                        }
                                    }
                                }
                                _ => {
                                    // 其他事件类型，记录日志
                                    debug!(
                                        "[chat_stream_responses_api] 未处理的事件类型: {}",
                                        event_type
                                    );
                                }
                            }
                        }

                        // 兼容旧格式（某些情况下可能返回）
                        if let Some(output) = json.get("output") {
                            if let Some(output_array) = output.as_array() {
                                for item in output_array {
                                    if item["type"].as_str() == Some("message") {
                                        if let Some(content_array) = item["content"].as_array() {
                                            for content_item in content_array {
                                                if content_item["type"].as_str()
                                                    == Some("output_text")
                                                {
                                                    if let Some(text) =
                                                        content_item["text"].as_str()
                                                    {
                                                        let _ = window.emit(
                                                            "chat-event",
                                                            serde_json::json!({
                                                                "id": msg_id,
                                                                "event": "chunk",
                                                                "content": text
                                                            }),
                                                        );
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

/// 流式发送消息
/// v2.3.0: 支持 system_prompt 和 tools 参数
/// v3.3.4: 支持 OpenAI Responses API（GPT-5、GPT-4.1-nano 等新模型）
/// v3.3.5: 支持 ChatGPT Codex API（OAuth 用户使用 chatgpt.com 端点）
/// v3.3.5: 支持 Anthropic OAuth（Claude Pro/Max 用户）
#[tauri::command]
async fn chat_stream_message(window: Window, request: ChatSendRequest) -> Result<(), String> {
    info!("[chat_stream_message] 开始流式发送");
    info!("[chat_stream_message] 模型: {}", request.model_name);
    info!("[chat_stream_message] Provider: {}", request.provider);

    // 构建 HTTP 客户端
    // v4.1.50: 禁用连接池，避免多轮对话时连接复用导致的502错误
    // 特别是通过代理访问时，第一轮请求后连接可能被关闭，但客户端仍尝试复用
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .pool_max_idle_per_host(0) // 禁用连接池
        .build()
        .map_err(|e| format!("Client error: {}", e))?;

    // v3.3.5: 判断是否使用 ChatGPT Codex API（OAuth 用户）
    // 如果有 account_id，说明是通过 OAuth 登录的 ChatGPT Plus/Pro 用户
    if request.account_id.is_some() && request.provider == "OpenAI" {
        info!("[chat_stream_message] 使用 ChatGPT Codex API（OAuth 用户）");
        return chat_stream_codex_api(window, &request, &client).await;
    }

    // v4.1.46: 优先使用 protocol 字段（用于自定义供应商）
    let protocol = request
        .protocol
        .as_ref()
        .map(|p| p.to_lowercase())
        .unwrap_or_else(|| request.provider.to_lowercase());

    // v3.3.5: Anthropic 使用专门的 API
    if protocol == "anthropic" || request.provider.to_lowercase() == "anthropic" {
        info!("[chat_stream_message] 使用 Anthropic API");
        return chat_stream_anthropic(window, &request, &client).await;
    }

    // v3.4.2: Google 使用专门的 API
    if protocol == "google" || request.provider.to_lowercase() == "google" {
        info!("[chat_stream_message] 使用 Google Cloud Code API");
        return chat_stream_google(window, &request, &client).await;
    }

    // v0.8.0: Kiro 使用专门的 API（AWS CodeWhisperer / Amazon Q）
    if protocol == "aws" || request.provider.to_lowercase() == "kiro" {
        info!("[chat_stream_message] 使用 Kiro API（Amazon Q）");
        return chat_stream_kiro(window, &request, &client).await;
    }

    // v3.3.4: 判断是否使用 Responses API
    // 仅对 OpenAI 官方端点使用 Responses API
    let endpoint = request
        .endpoint
        .as_deref()
        .unwrap_or("https://api.openai.com/v1");
    let is_openai_endpoint = endpoint.contains("api.openai.com");
    let use_responses_api = is_openai_endpoint && should_use_responses_api(&request.model_name);

    if use_responses_api {
        info!(
            "[chat_stream_message] 使用 Responses API（模型: {}）",
            request.model_name
        );
        return chat_stream_responses_api(window, &request, &client).await;
    }

    // 使用传统的 Chat Completions API
    info!("[chat_stream_message] 使用 Chat Completions API");

    let endpoint = normalize_url(
        request
            .endpoint
            .as_deref()
            .unwrap_or("https://api.openai.com/v1"),
    );
    let url = format!("{}/chat/completions", endpoint);

    // v2.3.0: 构建消息列表，如果有 system_prompt 则添加到开头
    let mut messages = Vec::new();
    if let Some(ref system_prompt) = request.system_prompt {
        if !system_prompt.is_empty() {
            messages.push(serde_json::json!({
                "role": "system",
                "content": system_prompt
            }));
            info!(
                "[chat_stream_message] 添加 Agent 系统提示词，长度: {} 字符",
                system_prompt.len()
            );
        }
    }
    // 添加用户消息
    for msg in &request.messages {
        messages.push(serde_json::to_value(msg).unwrap_or_default());
    }

    // v2.3.0: 构建请求体，包含 tools 参数（如果有）
    // v3.1.1: 添加 stream_options 以获取 usage 信息
    let mut body = serde_json::json!({
        "model": request.model_name,
        "messages": messages,
        "temperature": request.temperature.unwrap_or(0.7),
        "max_tokens": request.max_tokens.unwrap_or(4096),
        "stream": true,
        "stream_options": {
            "include_usage": true
        }
    });

    // 如果有工具，添加到请求体
    if let Some(ref tools) = request.tools {
        if !tools.is_empty() {
            body["tools"] = serde_json::json!(tools);
            info!("[chat_stream_message] 添加 MCP 工具，数量: {}", tools.len());
        }
    }

    info!(
        "[chat_stream_message] API Key check: len={}",
        request.api_key.len()
    );
    info!("[chat_stream_message] 发送请求到: {}", url);
    let trimmed_key = request.api_key.trim();
    let mut response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", trimmed_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status();
    info!("[chat_stream_message] 收到响应，状态码: {}", status);
    if !status.is_success() {
        let err_text = response.text().await.unwrap_or_default();
        error!("[chat_stream_message] API 错误: {}", err_text);
        return Err(format!("API Error {}: {}", status, err_text));
    }

    // v4.2.3: 检查 Content-Type，如果是 HTML 则提前报错
    if let Some(content_type) = response.headers().get("content-type") {
        let content_type_str = content_type.to_str().unwrap_or("");
        if content_type_str.contains("text/html") {
            error!("[chat_stream_message] 服务器返回 HTML 页面而不是 JSON 流");
            return Err(format!(
                "API 配置错误：服务器返回了 HTML 页面而不是 API 响应。\n\
                请检查 Endpoint 配置是否正确。\n\
                当前请求地址: {}\n\
                提示：大多数 OpenAI 兼容 API 的 endpoint 应该以 /v1 结尾",
                url
            ));
        }
    }

    let mut buffer = String::new();
    // v4.1.10: 优先使用传入的 message_id，用于圆桌讨论区分不同参与者
    let msg_id = request
        .message_id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    // v2.3.0: 用于累积 tool_calls 数据（流式响应中 tool_calls 是分片返回的）
    let mut tool_calls_accumulator: HashMap<usize, serde_json::Value> = HashMap::new();

    // v3.1.1: 用于累积 usage 数据（token 统计）
    let mut usage_accumulator: Option<serde_json::Value> = None;

    // 循环读取 Chunk
    info!("[chat_stream_message] 开始读取流式响应");
    let mut chunk_count = 0;
    let start_time = std::time::Instant::now();
    let timeout_duration = std::time::Duration::from_secs(120); // 2分钟超时

    loop {
        // v4.2.3: 检查超时
        if start_time.elapsed() > timeout_duration {
            error!("[chat_stream_message] 读取响应超时（超过 120 秒）");
            return Err("读取响应超时，请检查网络连接或 API 服务状态".to_string());
        }

        match response.chunk().await {
            Ok(Some(chunk)) => {
                chunk_count += 1;
                let s = String::from_utf8_lossy(&chunk);

                // v4.2.3: 检测第一个 chunk 是否是 HTML（防止 Content-Type 检测失效）
                if chunk_count == 1
                    && (s.trim_start().starts_with("<!doctype html>")
                        || s.trim_start().starts_with("<!DOCTYPE html>")
                        || s.trim_start().starts_with("<html"))
                {
                    error!("[chat_stream_message] 检测到服务器返回 HTML 内容");
                    return Err(format!(
                        "API 配置错误：服务器返回了 HTML 页面而不是 API 响应。\n\
                        请检查 Endpoint 配置是否正确。\n\
                        当前请求地址: {}\n\
                        提示：大多数 OpenAI 兼容 API 的 endpoint 应该以 /v1 结尾",
                        url
                    ));
                }

                // v4.2.3: 调试日志 - 打印接收到的原始数据
                if chunk_count <= 3 {
                    info!("[chat_stream_message] Chunk #{}: {}", chunk_count, s);
                }
                buffer.push_str(&s);
            }
            Ok(None) => {
                info!(
                    "[chat_stream_message] 流式响应结束，共接收 {} 个 chunk",
                    chunk_count
                );
                if !buffer.is_empty() {
                    info!("[chat_stream_message] 剩余未处理的 buffer: {}", buffer);
                }
                break;
            }
            Err(e) => {
                error!("[chat_stream_message] 读取 chunk 失败: {}", e);
                return Err(format!("读取响应失败: {}", e));
            }
        }

        // 处理 SSE 数据 (split by \n\n)
        while let Some(pos) = buffer.find("\n\n") {
            let line_block: String = buffer.drain(..pos + 2).collect();
            for line in line_block.lines() {
                let line = line.trim();
                if let Some(data_str) = line.strip_prefix("data: ") {
                    if data_str == "[DONE]" {
                        info!("[chat_stream_message] 收到 [DONE] 信号");
                        // v3.1.1: 在 done 事件中包含 usage 信息
                        let mut done_payload = serde_json::json!({
                            "id": msg_id,
                            "event": "done"
                        });
                        if let Some(ref usage) = usage_accumulator {
                            done_payload["usage"] = usage.clone();
                        }
                        let _ = window.emit("chat-event", done_payload);
                        continue;
                    }

                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data_str) {
                        // v3.1.1: 提取 usage 信息（OpenAI 流式响应在最后一个 chunk 中包含 usage）
                        if json.get("usage").is_some() && !json["usage"].is_null() {
                            usage_accumulator = Some(json["usage"].clone());
                        }

                        // 提取 content
                        if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                            if !content.is_empty() {
                                let _ = window.emit(
                                    "chat-event",
                                    serde_json::json!({
                                        "id": msg_id,
                                        "event": "chunk",
                                        "content": content
                                    }),
                                );
                            }
                        }
                        // 提取 reasoning_content (DeepSeek)
                        if let Some(reasoning) =
                            json["choices"][0]["delta"]["reasoning_content"].as_str()
                        {
                            if !reasoning.is_empty() {
                                let _ = window.emit(
                                    "chat-event",
                                    serde_json::json!({
                                        "id": msg_id,
                                        "event": "reasoning_chunk",
                                        "content": reasoning
                                    }),
                                );
                            }
                        }

                        // v2.3.0: 处理 tool_calls（流式响应中分片返回）
                        if let Some(tool_calls) =
                            json["choices"][0]["delta"]["tool_calls"].as_array()
                        {
                            for tool_call in tool_calls {
                                if let Some(index) = tool_call["index"].as_u64() {
                                    let idx = index as usize;

                                    // 获取或创建累积器
                                    let accumulated =
                                        tool_calls_accumulator.entry(idx).or_insert_with(|| {
                                            serde_json::json!({
                                                "id": "",
                                                "type": "function",
                                                "function": {
                                                    "name": "",
                                                    "arguments": ""
                                                }
                                            })
                                        });

                                    // 累积 id
                                    if let Some(id) = tool_call["id"].as_str() {
                                        accumulated["id"] = serde_json::json!(id);
                                    }

                                    // 累积 function.name
                                    if let Some(name) = tool_call["function"]["name"].as_str() {
                                        accumulated["function"]["name"] = serde_json::json!(name);
                                    }

                                    // 累积 function.arguments（逐步拼接）
                                    if let Some(args) = tool_call["function"]["arguments"].as_str()
                                    {
                                        let current_args = accumulated["function"]["arguments"]
                                            .as_str()
                                            .unwrap_or("");
                                        accumulated["function"]["arguments"] =
                                            serde_json::json!(format!("{}{}", current_args, args));
                                    }
                                }
                            }
                        }

                        // v2.3.0: 检查 finish_reason 是否为 tool_calls
                        // v2.5.0: 增强日志和兼容性处理
                        // v4.2.2: 防止重复发送 tool_calls 事件
                        if let Some(finish_reason) = json["choices"][0]["finish_reason"].as_str() {
                            debug!("[chat_stream_message] finish_reason: {}", finish_reason);

                            // 处理 tool_calls finish_reason
                            if finish_reason == "tool_calls" {
                                // 发送 tool_calls 事件到前端
                                let tool_calls_vec: Vec<serde_json::Value> =
                                    tool_calls_accumulator.values().cloned().collect();

                                if !tool_calls_vec.is_empty() {
                                    info!(
                                        "[chat_stream_message] AI 请求工具调用，数量: {}",
                                        tool_calls_vec.len()
                                    );
                                    let _ = window.emit(
                                        "chat-event",
                                        serde_json::json!({
                                            "id": msg_id,
                                            "event": "tool_calls",
                                            "tool_calls": tool_calls_vec
                                        }),
                                    );
                                    // v4.2.2: 发送后清空累积器，防止 stop 分支重复发送
                                    tool_calls_accumulator.clear();
                                }
                            } else if finish_reason == "stop" {
                                // v2.5.0: 检查是否有未发送的 tool_calls（某些模型可能返回 stop 而不是 tool_calls）
                                // v4.2.2: 只有累积器非空时才发送（避免重复）
                                if !tool_calls_accumulator.is_empty() {
                                    let tool_calls_vec: Vec<serde_json::Value> =
                                        tool_calls_accumulator.values().cloned().collect();

                                    // 检查是否有有效的工具调用（id 和 name 不为空）
                                    let valid_calls: Vec<_> = tool_calls_vec
                                        .iter()
                                        .filter(|tc| {
                                            let id = tc["id"].as_str().unwrap_or("");
                                            let name =
                                                tc["function"]["name"].as_str().unwrap_or("");
                                            !id.is_empty() && !name.is_empty()
                                        })
                                        .cloned()
                                        .collect();

                                    if !valid_calls.is_empty() {
                                        info!("[chat_stream_message] AI 请求工具调用（finish_reason=stop），数量: {}", valid_calls.len());
                                        let _ = window.emit(
                                            "chat-event",
                                            serde_json::json!({
                                                "id": msg_id,
                                                "event": "tool_calls",
                                                "tool_calls": valid_calls
                                            }),
                                        );
                                        // v4.2.2: 发送后清空累积器
                                        tool_calls_accumulator.clear();
                                    }
                                }
                            }
                        }
                    } else {
                        // v4.2.3: JSON 解析失败，记录原始数据
                        error!("[chat_stream_message] JSON 解析失败: {}", data_str);
                    }
                }
            }
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化日志系统 (仅在 debug 构建时启用详细日志)
    #[cfg(debug_assertions)]
    {
        env_logger::Builder::from_default_env()
            .filter_level(log::LevelFilter::Debug)
            .init();
        info!("[init] MobausStudio 后端启动 (Debug 模式)");
    }

    #[cfg(not(debug_assertions))]
    {
        env_logger::Builder::from_default_env()
            .filter_level(log::LevelFilter::Info)
            .init();
        info!("[init] MobausStudio 后端启动 (Release 模式)");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init()) // v2.6.2: 文件保存对话框
        .plugin(tauri_plugin_fs::init()) // v2.6.2: 文件系统写入
        .plugin(tauri_plugin_updater::Builder::new().build()) // 软件自动更新
        .plugin(tauri_plugin_process::init()) // 进程管理（重启应用）
        // v2.7.0: 应用退出时清理 MCP 连接
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                info!("[MCP] 窗口关闭请求，开始清理 MCP 连接");

                // 使用 tokio 运行时执行异步清理
                let handle = window.app_handle().clone();
                std::thread::spawn(move || {
                    // 创建一个新的 tokio 运行时来执行异步操作
                    let rt = tokio::runtime::Runtime::new().unwrap();
                    rt.block_on(async {
                        // 设置总超时时间为 10 秒
                        match tokio::time::timeout(
                            std::time::Duration::from_secs(10),
                            MCP_MANAGER.disconnect_all(),
                        )
                        .await
                        {
                            Ok(Ok(())) => {
                                info!("[MCP] 所有 MCP 连接已清理完成");
                            }
                            Ok(Err(e)) => {
                                error!("[MCP] 清理 MCP 连接时出错: {}", e);
                            }
                            Err(_) => {
                                warn!("[MCP] 清理 MCP 连接超时（10秒）");
                            }
                        }
                    });
                    // 通知应用可以继续退出
                    handle.exit(0);
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            test_model,
            save_models,
            load_models,
            save_chats,
            load_chats,
            // 圆桌对话存储命令 (v4.0.0)
            save_roundtable_chats,
            load_roundtable_chats,
            // Agent 存储命令 (v2.5.1)
            save_agents,
            load_agents,
            // Skills 存储命令 (v2.6.0)
            save_skills,
            load_skills,
            // skills.sh 代理命令 (v3.0.6)
            fetch_skills_sh,
            // 通用 URL 获取代理 (v3.0.7)
            fetch_url_content,
            // GitHub Contents API 代理 (v3.0.26)
            fetch_github_contents,
            // GitHub 离线包扫描（v3.0.27）
            scan_github_skills_archive,
            // Settings 存储命令 (v2.6.0)
            save_settings,
            load_settings,
            // API Keys 存储命令 (v2.5.2)
            save_api_keys,
            load_api_keys,
            // Provider Credentials 存储命令 (v0.9.0)
            save_provider_credentials,
            load_provider_credentials,
            // 自定义提供商存储命令 (v0.9.3)
            save_custom_providers,
            load_custom_providers,
            // MCP 服务器命令 (v1.1.0 - 配置持久化)
            mcp_test_connection,
            save_mcp_servers,
            load_mcp_servers,
            // MCP 真实协议命令 (v2.0.0 - 实时连接)
            mcp_connect,
            mcp_disconnect,
            mcp_list_tools,
            mcp_call_tool,
            mcp_list_resources,
            mcp_is_connected,
            mcp_get_connected_servers,
            mcp_disconnect_all,
            // AI 对话命令
            chat_send_message,
            chat_stream_message,
            // 模型列表获取 (v3.3.0)
            fetch_models,
            // OAuth 认证命令 (v3.1.0)
            oauth_request_device_code,
            oauth_poll_token,
            // Anthropic OAuth 命令 (v3.2.0)
            anthropic_exchange_token,
            anthropic_refresh_token,
            anthropic_create_api_key,
            // Anthropic OAuth v2 命令 (v3.4.0) - 本地回调服务器
            anthropic_start_oauth_callback_server,
            anthropic_stop_oauth_callback_server,
            // OpenAI OAuth 命令 (v3.2.0)
            openai_request_device_code,
            openai_poll_token,
            openai_refresh_token,
            // OpenAI OAuth v2 命令 (v3.4.0) - Authorization Code Flow
            openai_exchange_code,
            openai_refresh_token_v2,
            openai_start_oauth_callback_server,
            openai_stop_oauth_callback_server,
            // Google OAuth 命令 (v3.3.0)
            google_exchange_token,
            google_get_user_info,
            google_refresh_token,
            google_start_oauth_callback_server,
            google_stop_oauth_callback_server,
            // 通用 OAuth 回调服务 (v3.4.9)
            start_oauth_callback_server,
            check_port_available,
            get_available_port,
            // Antigravity Onboard 命令 (v3.3.1)
            google_load_code_assist,
            google_onboard_user,
            // v3.6.1: 获取可用模型列表
            google_fetch_available_models,
            // Kiro API 命令 (v0.7.3)
            kiro_list_models,
            kiro_get_quota,
            // v0.9.0: Kiro Token 刷新
            kiro_refresh_token,
            // 配置导出命令 (config-switcher)
            export_provider_to_tool,
            batch_export_providers,
            get_supported_tools,
            get_tool_config_paths,
            get_enabled_providers,
            disable_provider_for_tool
        ])
        .setup(|app| {
            // 初始化配置文件监听器
            let data_dir = get_data_dir(app.handle())?;
            let opencode_config_path = dirs::home_dir()
                .ok_or("无法获取用户目录")?
                .join(".config")
                .join("opencode")
                .join("opencode.json");

            match services::config_exporter::ConfigWatcher::new(data_dir, opencode_config_path) {
                Ok(watcher) => {
                    info!("[init] 配置文件监听器已初始化");
                    watcher.start();
                }
                Err(e) => {
                    warn!("[init] 配置文件监听器初始化失败: {}", e);
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ==================== 配置导出 Tauri 命令 (config-switcher) ====================

/// 导出 Provider 配置到指定外部工具
///
/// # 参数
/// - `app_handle`: Tauri 应用句柄
/// - `provider_id`: Provider ID
/// - `provider_name`: Provider 名称（用于 OpenCode 配置）
/// - `provider_models`: Provider 模型列表（JSON 字符串）
/// - `tool_name`: 目标工具名 ("claude-code"/"codex"/"gemini-cli"/"opencode"/"openclaw")
#[tauri::command]
async fn export_provider_to_tool(
    app_handle: tauri::AppHandle,
    provider_id: String,
    provider_name: String,
    provider_models: String,
    provider_protocol: Option<String>,
    provider_base_url: Option<String>,
    tool_name: String,
) -> Result<(), String> {
    info!(
        "[export_provider_to_tool] 导出配置: provider={}, name={}, protocol={:?}, baseURL={:?}, tool={}",
        provider_id, provider_name, provider_protocol, provider_base_url, tool_name
    );

    let data_dir = get_data_dir(&app_handle)?;
    let service = services::config_exporter::ExportService::new();

    service
        .export_provider_with_name_and_protocol(
            &data_dir,
            &provider_id,
            &provider_name,
            &provider_models,
            provider_protocol.as_deref(),
            provider_base_url.as_deref(),
            &tool_name,
        )
        .map_err(|e| e.to_string())
}

/// 批量导出配置到多个外部工具
///
/// # 参数
/// - `app_handle`: Tauri 应用句柄
/// - `exports`: 导出请求列表
#[tauri::command]
async fn batch_export_providers(
    app_handle: tauri::AppHandle,
    exports: Vec<services::config_exporter::export_service::ExportRequest>,
) -> Result<services::config_exporter::export_service::BatchExportResult, String> {
    info!(
        "[batch_export_providers] 批量导出: {} 个请求",
        exports.len()
    );

    let data_dir = get_data_dir(&app_handle)?;
    let service = services::config_exporter::ExportService::new();

    Ok(service.batch_export(&data_dir, &exports))
}

/// 获取支持的外部工具列表
#[tauri::command]
fn get_supported_tools() -> Vec<services::config_exporter::export_service::ExternalTool> {
    services::config_exporter::ExportService::get_supported_tools()
}

/// 获取指定工具的配置文件路径
///
/// # 参数
/// - `tool_name`: 工具名称 ("claude-code"/"codex"/"gemini-cli"/"opencode"/"openclaw")
///
/// # 返回
/// - 配置文件路径列表（已展开 ~ 为实际 home 目录）
#[tauri::command]
fn get_tool_config_paths(tool_name: String) -> Result<Vec<String>, String> {
    info!(
        "[get_tool_config_paths] 获取工具配置路径: tool={}",
        tool_name
    );

    services::config_exporter::ExportService::get_tool_config_paths(&tool_name)
        .map_err(|e| e.to_string())
}

/// 获取所有工具的启用状态
///
/// # 返回
/// - 工具名 -> Provider ID 映射
#[tauri::command]
fn get_enabled_providers(
    app_handle: tauri::AppHandle,
) -> Result<std::collections::HashMap<String, String>, String> {
    info!("[get_enabled_providers] 获取所有工具的启用状态");

    let data_dir = get_data_dir(&app_handle)?;
    services::config_exporter::ExportService::get_enabled_providers(&data_dir)
        .map_err(|e| e.to_string())
}

/// 禁用工具的 Provider 配置
///
/// 清除指定工具的启用状态，但不删除配置文件
///
/// # 参数
/// - `app_handle`: Tauri 应用句柄
/// - `tool_name`: 工具名称（如 "claude-code", "codex"）
#[tauri::command]
fn disable_provider_for_tool(
    app_handle: tauri::AppHandle,
    tool_name: String,
) -> Result<(), String> {
    info!(
        "[disable_provider_for_tool] 禁用工具配置: tool={}",
        tool_name
    );

    let data_dir = get_data_dir(&app_handle)?;
    services::config_exporter::ExportService::disable_provider_for_tool(&data_dir, &tool_name)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_url_logic() {
        assert_eq!(
            normalize_url("https://api.openai.com/v1/"),
            "https://api.openai.com/v1"
        );
        assert_eq!(
            normalize_url("https://api.openai.com/v1"),
            "https://api.openai.com/v1"
        );
        assert_eq!(
            normalize_url("http://localhost:8080/"),
            "http://localhost:8080"
        );
    }

    #[test]
    fn test_extract_base64_image_valid() {
        // 测试正常的 data URL
        let data_url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA";
        let result = extract_base64_image(data_url);
        assert!(result.is_some());
        let (mime_type, data) = result.unwrap();
        assert_eq!(mime_type, "image/png");
        assert_eq!(data, "iVBORw0KGgoAAAANSUhEUgAAAAUA");
    }

    #[test]
    fn test_extract_base64_image_jpeg() {
        // 测试 JPEG 格式
        let data_url = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAA";
        let result = extract_base64_image(data_url);
        assert!(result.is_some());
        let (mime_type, data) = result.unwrap();
        assert_eq!(mime_type, "image/jpeg");
        assert_eq!(data, "/9j/4AAQSkZJRgABAQAA");
    }

    #[test]
    fn test_extract_base64_image_invalid_prefix() {
        // 测试无效的前缀
        let data_url = "http://example.com/image.png";
        let result = extract_base64_image(data_url);
        assert!(result.is_none());
    }

    #[test]
    fn test_extract_base64_image_no_comma() {
        // 测试缺少逗号分隔符
        let data_url = "data:image/png;base64";
        let result = extract_base64_image(data_url);
        assert!(result.is_none());
    }

    #[test]
    fn test_extract_base64_image_empty_data() {
        // 测试空数据
        let data_url = "data:image/png;base64,";
        let result = extract_base64_image(data_url);
        assert!(result.is_some());
        let (mime_type, data) = result.unwrap();
        assert_eq!(mime_type, "image/png");
        assert_eq!(data, "");
    }

    #[test]
    fn test_is_http_url_http() {
        // 测试 HTTP URL
        assert!(is_http_url("http://example.com/image.png"));
    }

    #[test]
    fn test_is_http_url_https() {
        // 测试 HTTPS URL
        assert!(is_http_url("https://example.com/image.png"));
    }

    #[test]
    fn test_is_http_url_data() {
        // 测试 data URL（不是 HTTP）
        assert!(!is_http_url("data:image/png;base64,iVBORw0KG"));
    }

    #[test]
    fn test_is_http_url_file() {
        // 测试 file URL（不是 HTTP）
        assert!(!is_http_url("file:///path/to/image.png"));
    }

    #[test]
    fn test_is_http_url_relative() {
        // 测试相对路径（不是 HTTP）
        assert!(!is_http_url("/path/to/image.png"));
    }

    // v4.2.5: 测试 IP 地址判断函数（核心安全逻辑）
    #[test]
    fn test_is_private_ip_v4() {
        use std::net::{IpAddr, Ipv4Addr};

        // Loopback
        assert!(is_private_ip(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1))));
        assert!(is_private_ip(IpAddr::V4(Ipv4Addr::new(127, 255, 255, 255))));

        // Private networks
        assert!(is_private_ip(IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1))));
        assert!(is_private_ip(IpAddr::V4(Ipv4Addr::new(172, 16, 0, 1))));
        assert!(is_private_ip(IpAddr::V4(Ipv4Addr::new(172, 31, 255, 255))));
        assert!(is_private_ip(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 1))));

        // Link-local
        assert!(is_private_ip(IpAddr::V4(Ipv4Addr::new(169, 254, 169, 254))));

        // Public IPs
        assert!(!is_private_ip(IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8))));
        assert!(!is_private_ip(IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1))));
    }
}

// v4.1.45: 引入扩展测试模块
#[cfg(test)]
#[path = "lib_test.rs"]
mod lib_test;
