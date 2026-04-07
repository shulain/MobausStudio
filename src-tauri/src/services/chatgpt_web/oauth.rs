//! OpenAI OAuth 认证模块
//!
//! 实现 OpenAI 官方 OAuth 2.0 + PKCE 流程，
//! 用于获取和刷新 ChatGPT 的 access_token。
//!
//! @module services/chatgpt_web/oauth
//! @version 0.1.0

use log::info;

/// OAuth 授权 URL
const AUTHORIZE_URL: &str = "https://auth.openai.com/oauth/authorize";
/// OAuth Token URL
const TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
/// 默认 Client ID
const DEFAULT_CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
/// 回调 URL
const REDIRECT_URI: &str = "https://chatgpt.com";

/// 生成 PKCE 授权 URL
///
/// 前端需要打开此 URL 让用户登录，登录成功后会重定向到回调 URL，
/// 附带 authorization code 参数。
///
/// @param code_challenge PKCE code_challenge（S256 哈希）
/// @param state 防 CSRF 的随机 state 值
/// @returns 完整的授权 URL
pub fn build_authorize_url(code_challenge: &str, state: &str) -> String {
    format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&state={}&id_token_add_organizations=true&codex_cli_simplified_flow=true",
        AUTHORIZE_URL,
        DEFAULT_CLIENT_ID,
        urlencoding::encode(REDIRECT_URI),
        urlencoding::encode("openid profile email offline_access"),
        code_challenge,
        state,
    )
}

/// 生成 PKCE code_verifier 和 code_challenge
///
/// @returns (code_verifier, code_challenge)
pub fn generate_pkce_pair() -> (String, String) {
    // 生成 64 字节随机数
    let mut bytes = [0u8; 64];
    getrandom::getrandom(&mut bytes).expect("随机数生成失败");
    let verifier = hex::encode(bytes);

    // SHA256 哈希后 Base64url 编码
    use sha2::Digest;
    let hash = sha2::Sha256::digest(verifier.as_bytes());
    use base64::Engine;
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hash);

    info!("[OAuth] 生成 PKCE pair，verifier 长度: {}", verifier.len());

    (verifier, challenge)
}

/// 使用 authorization code 换取 token
///
/// @param code 授权码（从回调 URL 中提取）
/// @param code_verifier PKCE code_verifier
/// @returns Token 响应的 JSON 字符串
pub async fn exchange_code(
    client: &rquest::Client,
    code: &str,
    code_verifier: &str,
) -> Result<super::types::OAuthTokenResponse, String> {
    let params = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", REDIRECT_URI),
        ("client_id", DEFAULT_CLIENT_ID),
        ("code_verifier", code_verifier),
    ];

    let response = client
        .post(TOKEN_URL)
        .header("user-agent", "codex-cli/0.91.0")
        .header("content-type", "application/x-www-form-urlencoded")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token 交换请求失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Token 交换失败 HTTP {}: {}", status, body));
    }

    response
        .json()
        .await
        .map_err(|e| format!("解析 Token 响应失败: {}", e))
}

/// 使用 hex 编码（避免引入额外依赖）
mod hex {
    const HEX_CHARS: &[u8; 16] = b"0123456789abcdef";

    pub fn encode(bytes: impl AsRef<[u8]>) -> String {
        let bytes = bytes.as_ref();
        let mut s = String::with_capacity(bytes.len() * 2);
        for &b in bytes {
            s.push(HEX_CHARS[(b >> 4) as usize] as char);
            s.push(HEX_CHARS[(b & 0x0f) as usize] as char);
        }
        s
    }
}
