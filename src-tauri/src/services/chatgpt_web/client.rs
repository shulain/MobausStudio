//! 具有浏览器 TLS 指纹伪装的 HTTP 客户端
//!
//! 使用 rquest 库模拟现代 Chrome 浏览器的 TLS/HTTP2 指纹，
//! 发送请求到 chatgpt.com 的 Codex Responses API 端点。
//!
//! @module services/chatgpt_web/client
//! @version 0.1.0

use super::types::*;
use log::{debug, error, info};
use rquest_util::Emulation;
use std::sync::Arc;
use tokio::sync::Mutex;

/// ChatGPT Web 客户端
///
/// 封装了具有浏览器指纹伪装的 HTTP 客户端，
/// 用于与 chatgpt.com 的内部 API 通信。
pub struct ChatGptWebClient {
    /// rquest 客户端（具有 Chrome TLS 指纹）
    client: rquest::Client,
    /// 当前凭证
    credentials: Arc<Mutex<Option<ChatGptCredentials>>>,
}

/// Codex Responses API 端点
const CODEX_RESPONSES_URL: &str = "https://chatgpt.com/backend-api/codex/responses";

/// OAuth Token 刷新端点
const TOKEN_URL: &str = "https://auth.openai.com/oauth/token";

/// 默认 OAuth Client ID
const DEFAULT_CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";

impl ChatGptWebClient {
    /// 创建新的 ChatGPT Web 客户端
    ///
    /// 使用 rquest 构建具有 Chrome 136 浏览器指纹的 HTTP 客户端，
    /// 确保 TLS Client Hello 和 HTTP/2 帧特征与真实浏览器一致。
    pub fn new() -> Result<Self, String> {
        let client = rquest::Client::builder()
            .emulation(Emulation::Chrome136)
            .build()
            .map_err(|e| format!("创建 rquest 客户端失败: {}", e))?;

        Ok(Self {
            client,
            credentials: Arc::new(Mutex::new(None)),
        })
    }

    /// 获取底层 rquest 客户端
    pub fn get_client(&self) -> &rquest::Client {
        &self.client
    }

    /// 设置 OAuth 凭证
    pub async fn set_credentials(&self, credentials: ChatGptCredentials) {
        let mut cred = self.credentials.lock().await;
        *cred = Some(credentials);
    }

    /// 获取当前 access_token（必要时自动刷新）
    ///
    /// Token 提前 3 分钟刷新，避免请求时才发现过期
    pub async fn get_access_token(&self) -> Result<String, String> {
        let mut cred_guard = self.credentials.lock().await;
        let cred = cred_guard.as_mut().ok_or("未设置 ChatGPT 凭证")?;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // 提前 180 秒刷新
        if now + 180 >= cred.expires_at {
            info!("[ChatGPT Web] Token 即将过期，开始刷新...");
            let new_token = self.refresh_token_inner(cred).await?;
            cred.access_token = new_token.access_token.clone();
            cred.expires_at = now + new_token.expires_in;
            if let Some(ref rt) = new_token.refresh_token {
                cred.refresh_token = rt.clone();
            }
            if let Some(ref id_token) = new_token.id_token {
                cred.id_token = Some(id_token.clone());
                // 从 ID Token 解析 chatgpt_account_id
                if let Some(account_id) = parse_chatgpt_account_id(id_token) {
                    cred.chatgpt_account_id = Some(account_id);
                }
            }
            info!(
                "[ChatGPT Web] Token 刷新成功，新过期时间: {}",
                cred.expires_at
            );
        }

        Ok(cred.access_token.clone())
    }

    /// 获取当前 chatgpt_account_id
    pub async fn get_account_id(&self) -> Option<String> {
        let cred = self.credentials.lock().await;
        cred.as_ref().and_then(|c| c.chatgpt_account_id.clone())
    }

    /// 发送 Codex Responses API 请求（流式）
    ///
    /// @param request Codex Responses API 请求体
    /// @returns 原始 HTTP 响应（SSE 流）
    pub async fn send_responses_request(
        &self,
        request: &ResponsesRequest,
    ) -> Result<rquest::Response, String> {
        let access_token = self.get_access_token().await?;
        let account_id = self.get_account_id().await;

        let body = serde_json::to_string(request).map_err(|e| format!("序列化请求失败: {}", e))?;

        debug!(
            "[ChatGPT Web] 发送请求到 {}, model={}",
            CODEX_RESPONSES_URL, request.model
        );

        let mut req_builder = self
            .client
            .post(CODEX_RESPONSES_URL)
            .header("authorization", format!("Bearer {}", access_token))
            .header("accept", "text/event-stream")
            .header("content-type", "application/json")
            .header("openai-beta", "responses=experimental")
            .header("originator", "codex_cli_rs")
            .header("user-agent", "codex_cli_rs/0.104.0");

        // 设置 chatgpt-account-id（从 ID Token 解析）
        if let Some(ref aid) = account_id {
            req_builder = req_builder.header("chatgpt-account-id", aid.as_str());
        }

        let response = req_builder
            .body(body)
            .send()
            .await
            .map_err(|e| format!("请求发送失败: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let status_code = status.as_u16();
            // 尝试读取错误响应体
            let error_body = response.text().await.unwrap_or_default();
            error!(
                "[ChatGPT Web] 上游返回错误: {} - {}",
                status_code, error_body
            );
            return Err(format!("上游返回 HTTP {}: {}", status_code, error_body));
        }

        Ok(response)
    }

    /// 内部 Token 刷新逻辑
    async fn refresh_token_inner(
        &self,
        cred: &ChatGptCredentials,
    ) -> Result<OAuthTokenResponse, String> {
        let params = [
            ("grant_type", "refresh_token"),
            ("refresh_token", &cred.refresh_token),
            (
                "client_id",
                if cred.client_id.is_empty() {
                    DEFAULT_CLIENT_ID
                } else {
                    &cred.client_id
                },
            ),
            ("scope", "openid profile email"),
        ];

        debug!(
            "[ChatGPT Web] 刷新 Token，client_id={}",
            if cred.client_id.is_empty() {
                DEFAULT_CLIENT_ID
            } else {
                &cred.client_id
            }
        );

        let response = self
            .client
            .post(TOKEN_URL)
            .header("user-agent", "codex-cli/0.91.0")
            .header("content-type", "application/x-www-form-urlencoded")
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Token 刷新请求失败: {}", e))?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Token 刷新失败 HTTP {}: {}", status, body));
        }

        let token_resp: OAuthTokenResponse = response
            .json()
            .await
            .map_err(|e| format!("解析 Token 响应失败: {}", e))?;

        Ok(token_resp)
    }

    /// 测试连接是否正常
    ///
    /// 发送一个简单的请求验证凭证有效性
    pub async fn test_connection(&self) -> Result<bool, String> {
        let access_token = self.get_access_token().await?;

        // 用一个轻量的请求测试
        let response = self
            .client
            .get("https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27")
            .header("authorization", format!("Bearer {}", access_token))
            .header("user-agent", "codex_cli_rs/0.104.0")
            .send()
            .await
            .map_err(|e| format!("测试连接失败: {}", e))?;

        Ok(response.status().is_success())
    }
}

/// 从 ID Token (JWT) 中解析 chatgpt_account_id
///
/// JWT 格式：header.payload.signature
/// payload 中包含 https://api.openai.com/auth 命名空间下的 claims
fn parse_chatgpt_account_id(id_token: &str) -> Option<String> {
    let parts: Vec<&str> = id_token.split('.').collect();
    if parts.len() < 2 {
        return None;
    }

    // Base64 解码 payload（JWT 使用 URL-safe Base64 无 padding）
    let payload = parts[1];
    let decoded = base64_url_decode(payload)?;
    let claims: serde_json::Value = serde_json::from_slice(&decoded).ok()?;

    // 从 https://api.openai.com/auth 命名空间获取
    claims
        .get("https://api.openai.com/auth")
        .and_then(|auth| auth.get("chatgpt_account_id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// URL-safe Base64 解码（JWT payload）
fn base64_url_decode(input: &str) -> Option<Vec<u8>> {
    use base64::Engine;
    let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
    engine.decode(input).ok()
}
