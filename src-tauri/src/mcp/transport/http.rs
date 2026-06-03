//! HTTP 传输层实现 (v2.5.0)
//!
//! 通过 HTTP/HTTPS 与远程 MCP 服务器通信
//! 实现 MCP Streamable HTTP 传输规范
//! 参考: https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http

use crate::mcp::error::MCPError;
use crate::mcp::protocol::{JsonRpcNotification, JsonRpcRequest, JsonRpcResponse};
use crate::mcp::transport::MCPTransport;
use async_trait::async_trait;
use reqwest::{Client, Response, StatusCode};
use serde_json::Value;
use std::net::IpAddr;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;
use url::Url;

/// 默认请求超时时间 (秒)
const DEFAULT_REQUEST_TIMEOUT: u64 = 60;

/// MCP HTTP 传输的 Content-Type (请求体)
const MCP_CONTENT_TYPE: &str = "application/json";

/// MCP HTTP 传输的 Accept (符合 Streamable HTTP 规范，必须同时包含 JSON 和 SSE)
const MCP_ACCEPT: &str = "application/json, text/event-stream";

/// HTTP 传输层
///
/// 通过 HTTP/HTTPS 与远程 MCP 服务器通信
/// 支持 MCP Streamable HTTP 传输协议
pub struct HttpTransport {
    /// HTTP 客户端（测试时可为 None）
    client: Option<Client>,
    /// 服务器端点 URL
    endpoint: String,
    /// 认证头 (可选)
    auth_header: Option<String>,
    /// 请求 ID 计数器
    request_id: AtomicU64,
    /// 是否活跃
    alive: AtomicBool,
    /// MCP 会话 ID (服务器分配，用于后续请求)
    session_id: tokio::sync::RwLock<Option<String>>,
}

impl HttpTransport {
    /// 创建 HTTP 传输
    ///
    /// # 参数
    /// - `endpoint`: MCP 服务器 HTTP 端点 URL (如 "https://mcp.example.com/mcp")
    /// - `auth_type`: 认证类型 ("none", "apikey", "token")
    /// - `auth_value`: 认证值 (API Key 或 Bearer Token)
    ///
    /// # 示例
    /// ```ignore
    /// let transport = HttpTransport::new(
    ///     "https://mcp.example.com/mcp",
    ///     Some("apikey"),
    ///     Some("sk-xxxxx"),
    /// )?;
    /// ```
    pub fn new(
        endpoint: &str,
        auth_type: Option<&str>,
        auth_value: Option<&str>,
    ) -> Result<Self, MCPError> {
        log::info!("[MCP HTTP] 创建 HTTP 传输: {}", endpoint);

        // 验证端点 URL
        if endpoint.is_empty() {
            return Err(MCPError::InvalidTransportConfig(
                "HTTP 端点不能为空".to_string(),
            ));
        }

        // 验证 URL 格式
        if !endpoint.starts_with("http://") && !endpoint.starts_with("https://") {
            return Err(MCPError::InvalidTransportConfig(
                "HTTP 端点必须以 http:// 或 https:// 开头".to_string(),
            ));
        }

        // 构建认证头
        let auth_header = match (auth_type, auth_value) {
            (Some("apikey"), Some(key)) if !key.is_empty() => {
                log::debug!("[MCP HTTP] 使用 API Key 认证");
                Some(format!("Bearer {}", key))
            }
            (Some("token"), Some(token)) if !token.is_empty() => {
                log::debug!("[MCP HTTP] 使用 Bearer Token 认证");
                Some(format!("Bearer {}", token))
            }
            _ => {
                log::debug!("[MCP HTTP] 无认证");
                None
            }
        };

        // 创建 HTTP 客户端
        //
        // 本机 MCP 服务不应经过系统代理。真实运行中，Surge/Clash 等代理可能会拦截
        // http://localhost:* 请求并返回自己的错误页，导致本地 MCP 服务器连接失败。
        // 仅对 loopback endpoint 禁用代理，远程 MCP 仍保留系统代理能力。
        let mut client_builder =
            Client::builder().timeout(Duration::from_secs(DEFAULT_REQUEST_TIMEOUT));

        if Self::endpoint_uses_loopback_host(endpoint) {
            log::debug!("[MCP HTTP] 检测到本机 endpoint，禁用系统代理: {}", endpoint);
            client_builder = client_builder.no_proxy();
        }

        let client = client_builder.build().map_err(|e| {
            MCPError::InvalidTransportConfig(format!("创建 HTTP 客户端失败: {}", e))
        })?;

        Ok(Self {
            client: Some(client),
            endpoint: endpoint.to_string(),
            auth_header,
            request_id: AtomicU64::new(1),
            alive: AtomicBool::new(true),
            session_id: tokio::sync::RwLock::new(None),
        })
    }

    /// 创建用于测试的 HTTP 传输（不构建真实 Client）
    ///
    /// 仅用于单元测试，避免环境依赖
    #[cfg(test)]
    pub fn new_for_test(
        endpoint: &str,
        auth_type: Option<&str>,
        auth_value: Option<&str>,
    ) -> Result<Self, MCPError> {
        log::info!("[MCP HTTP] 创建测试 HTTP 传输: {}", endpoint);

        // 验证端点 URL
        if endpoint.is_empty() {
            return Err(MCPError::InvalidTransportConfig(
                "HTTP 端点不能为空".to_string(),
            ));
        }

        // 验证 URL 格式
        if !endpoint.starts_with("http://") && !endpoint.starts_with("https://") {
            return Err(MCPError::InvalidTransportConfig(
                "HTTP 端点必须以 http:// 或 https:// 开头".to_string(),
            ));
        }

        // 构建认证头
        let auth_header = match (auth_type, auth_value) {
            (Some("apikey"), Some(key)) if !key.is_empty() => Some(format!("Bearer {}", key)),
            (Some("token"), Some(token)) if !token.is_empty() => Some(format!("Bearer {}", token)),
            _ => None,
        };

        Ok(Self {
            client: None, // 测试时不构建 Client
            endpoint: endpoint.to_string(),
            auth_header,
            request_id: AtomicU64::new(1),
            alive: AtomicBool::new(true),
            session_id: tokio::sync::RwLock::new(None),
        })
    }

    /// 获取下一个请求 ID
    fn next_request_id(&self) -> u64 {
        self.request_id.fetch_add(1, Ordering::SeqCst)
    }

    /// 判断 endpoint 是否指向本机 loopback。
    ///
    /// 对本机 MCP 服务禁用系统代理，避免代理软件拦截 localhost/127.0.0.1/::1。
    fn endpoint_uses_loopback_host(endpoint: &str) -> bool {
        let Ok(url) = Url::parse(endpoint) else {
            return false;
        };

        let Some(host) = url.host_str() else {
            return false;
        };

        let normalized_host = host.trim_end_matches('.').to_ascii_lowercase();
        if normalized_host == "localhost" || normalized_host.ends_with(".localhost") {
            return true;
        }

        let ip_host = normalized_host
            .strip_prefix('[')
            .and_then(|host| host.strip_suffix(']'))
            .unwrap_or(&normalized_host);

        ip_host
            .parse::<IpAddr>()
            .map(|ip| ip.is_loopback())
            .unwrap_or(false)
    }

    /// 从 SSE 事件流中提取最后一个 JSON-RPC 消息
    ///
    /// SSE 格式示例:
    /// ```text
    /// event: message
    /// data: {"jsonrpc":"2.0","id":1,"result":{...}}
    /// ```
    ///
    /// # 参数
    /// - `sse_body`: SSE 格式的响应体
    ///
    /// # 返回
    /// 提取出的 JSON 字符串
    #[cfg(test)]
    fn extract_json_from_sse(sse_body: &str) -> Result<String, MCPError> {
        let mut last_data: Option<String> = None;

        for block in sse_body.replace("\r\n", "\n").split("\n\n") {
            if let Some(data) = Self::extract_data_from_sse_block(block) {
                last_data = Some(data);
            }
        }

        last_data.ok_or_else(|| {
            MCPError::ParseError(format!("SSE 响应中未找到有效的 data 字段: {}", sse_body))
        })
    }

    /// 从一个 SSE 事件块中提取 data 内容。
    fn extract_data_from_sse_block(block: &str) -> Option<String> {
        let data_lines: Vec<&str> = block
            .lines()
            .filter_map(|line| line.trim().strip_prefix("data:").map(str::trim))
            .filter(|data| !data.is_empty())
            .collect();

        if data_lines.is_empty() {
            None
        } else {
            Some(data_lines.join("\n"))
        }
    }

    /// 判断 SSE data 是否为当前请求的 JSON-RPC 响应。
    fn json_rpc_response_matches_id(data: &str, expected_id: u64) -> bool {
        serde_json::from_str::<JsonRpcResponse>(data)
            .map(|response| response.id == expected_id)
            .unwrap_or(false)
    }

    /// 读取 SSE 响应流，拿到匹配请求 ID 的 JSON-RPC 响应后立即返回。
    async fn read_sse_response(
        mut response: Response,
        expected_id: u64,
    ) -> Result<String, MCPError> {
        let mut buffer = String::new();

        loop {
            match response.chunk().await {
                Ok(Some(chunk)) => {
                    buffer.push_str(&String::from_utf8_lossy(&chunk));
                    if buffer.contains('\r') {
                        buffer = buffer.replace("\r\n", "\n");
                    }

                    while let Some(pos) = buffer.find("\n\n") {
                        let block: String = buffer.drain(..pos + 2).collect();
                        if let Some(data) = Self::extract_data_from_sse_block(&block) {
                            if Self::json_rpc_response_matches_id(&data, expected_id) {
                                log::debug!("[MCP HTTP] 收到 SSE JSON-RPC 响应: {}", data);
                                return Ok(data);
                            }
                            log::debug!("[MCP HTTP] 忽略非当前请求的 SSE 消息: {}", data);
                        }
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    return if e.is_timeout() {
                        Err(MCPError::Timeout)
                    } else {
                        Err(MCPError::ReadFailed(format!("读取 SSE 响应失败: {}", e)))
                    };
                }
            }
        }

        if let Some(data) = Self::extract_data_from_sse_block(&buffer) {
            if Self::json_rpc_response_matches_id(&data, expected_id) {
                log::debug!("[MCP HTTP] 收到 SSE JSON-RPC 响应: {}", data);
                return Ok(data);
            }
        }

        Err(MCPError::ParseError(format!(
            "SSE 响应流结束但未找到请求 {} 的 JSON-RPC 响应",
            expected_id
        )))
    }

    /// 发送 HTTP POST 请求
    async fn send_post(&self, body: &str, expected_id: Option<u64>) -> Result<String, MCPError> {
        log::debug!("[MCP HTTP] 发送请求: {}", body);

        // 构建请求
        let client = self.client.as_ref().ok_or_else(|| {
            MCPError::InvalidTransportConfig("HTTP 客户端未初始化（仅测试环境）".to_string())
        })?;

        let mut request = client
            .post(&self.endpoint)
            .header("Content-Type", MCP_CONTENT_TYPE)
            .header("Accept", MCP_ACCEPT);

        // 添加认证头
        if let Some(auth) = &self.auth_header {
            request = request.header("Authorization", auth);
        }

        // 添加会话 ID (如果有)
        {
            let session_id = self.session_id.read().await;
            if let Some(sid) = session_id.as_ref() {
                request = request.header("Mcp-Session-Id", sid);
            }
        }

        // 发送请求
        let response = request.body(body.to_string()).send().await.map_err(|e| {
            if e.is_timeout() {
                MCPError::Timeout
            } else if e.is_connect() {
                MCPError::ConnectionFailed(format!("无法连接到服务器: {}", e))
            } else {
                MCPError::HttpError(format!("HTTP 请求失败: {}", e))
            }
        })?;

        // 检查状态码
        let status = response.status();

        // 保存会话 ID (如果服务器返回)
        if let Some(session_id) = response.headers().get("Mcp-Session-Id") {
            if let Ok(sid) = session_id.to_str() {
                let mut stored_session_id = self.session_id.write().await;
                *stored_session_id = Some(sid.to_string());
                log::debug!("[MCP HTTP] 保存会话 ID: {}", sid);
            }
        }

        match status {
            StatusCode::OK => {
                // 根据 Content-Type 区分响应格式
                let content_type = response
                    .headers()
                    .get("content-type")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("")
                    .to_string();

                // 如果是 SSE 格式，从事件流中提取 JSON 数据
                let result = if content_type.contains("text/event-stream") {
                    log::debug!("[MCP HTTP] 收到 SSE 响应，解析事件流");
                    if let Some(id) = expected_id {
                        tokio::time::timeout(
                            Duration::from_secs(DEFAULT_REQUEST_TIMEOUT),
                            Self::read_sse_response(response, id),
                        )
                        .await
                        .map_err(|_| MCPError::Timeout)??
                    } else {
                        return Ok(String::new());
                    }
                } else {
                    response
                        .text()
                        .await
                        .map_err(|e| MCPError::ReadFailed(format!("读取响应失败: {}", e)))?
                };

                log::debug!("[MCP HTTP] 收到响应: {}", result);
                Ok(result)
            }
            StatusCode::ACCEPTED => {
                // 202 Accepted - 通知已接收，无响应体
                log::debug!("[MCP HTTP] 通知已接收 (202)");
                Ok(String::new())
            }
            StatusCode::UNAUTHORIZED => {
                Err(MCPError::AuthError("认证失败: 无效的凭证".to_string()))
            }
            StatusCode::FORBIDDEN => Err(MCPError::AuthError("访问被拒绝: 权限不足".to_string())),
            StatusCode::NOT_FOUND => Err(MCPError::HttpError("MCP 端点不存在 (404)".to_string())),
            StatusCode::BAD_REQUEST => {
                let body = response.text().await.unwrap_or_default();
                Err(MCPError::ServerError {
                    code: 400,
                    message: format!("请求格式错误: {}", body),
                })
            }
            StatusCode::INTERNAL_SERVER_ERROR => {
                let body = response.text().await.unwrap_or_default();
                Err(MCPError::ServerError {
                    code: 500,
                    message: format!("服务器内部错误: {}", body),
                })
            }
            _ => {
                let body = response.text().await.unwrap_or_default();
                Err(MCPError::HttpError(format!(
                    "HTTP 错误 {}: {}",
                    status.as_u16(),
                    body
                )))
            }
        }
    }
}

#[async_trait]
impl MCPTransport for HttpTransport {
    /// 发送 JSON-RPC 请求并等待响应
    async fn send_request(&self, method: &str, params: Value) -> Result<Value, MCPError> {
        if !self.alive.load(Ordering::SeqCst) {
            return Err(MCPError::NotConnected);
        }

        let id = self.next_request_id();

        // 构建 JSON-RPC 请求
        let request = JsonRpcRequest::new(id, method, Some(params));
        let request_str = serde_json::to_string(&request)?;

        // 发送 HTTP 请求
        let response_str = self.send_post(&request_str, Some(id)).await?;

        // 空响应（不应该发生在请求中）
        if response_str.is_empty() {
            return Err(MCPError::ServerError {
                code: -1,
                message: "服务器返回空响应".to_string(),
            });
        }

        // 解析响应
        let response: JsonRpcResponse = serde_json::from_str(&response_str)
            .map_err(|e| MCPError::ParseError(format!("解析响应失败: {} - {}", e, response_str)))?;

        // 检查响应 ID 是否匹配
        if response.id != id {
            log::warn!(
                "[MCP HTTP] 响应 ID 不匹配: 期望 {}, 实际 {}",
                id,
                response.id
            );
        }

        // 检查错误
        if let Some(error) = response.error {
            return Err(MCPError::ServerError {
                code: error.code,
                message: error.message,
            });
        }

        // 返回结果
        response.result.ok_or_else(|| MCPError::ServerError {
            code: -1,
            message: "响应中缺少 result 字段".to_string(),
        })
    }

    /// 发送 JSON-RPC 通知 (不期待响应)
    async fn send_notification(&self, method: &str, params: Value) -> Result<(), MCPError> {
        if !self.alive.load(Ordering::SeqCst) {
            return Err(MCPError::NotConnected);
        }

        // 构建通知
        let notification = JsonRpcNotification::new(method, Some(params));
        let notification_str = serde_json::to_string(&notification)?;

        // 发送 HTTP 请求 (通知可能返回 202 或空响应)
        let _ = self.send_post(&notification_str, None).await?;

        Ok(())
    }

    /// 关闭传输连接
    async fn shutdown(&self) -> Result<(), MCPError> {
        log::info!("[MCP HTTP] 关闭 HTTP 传输");
        self.alive.store(false, Ordering::SeqCst);

        // 清除会话 ID
        {
            let mut session_id = self.session_id.write().await;
            *session_id = None;
        }

        Ok(())
    }

    /// 检查传输是否活跃
    fn is_alive(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }
}

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

    /// 测试 HTTP 传输创建 - 有效端点
    #[test]
    fn test_http_transport_new_valid() {
        let transport = HttpTransport::new_for_test("https://mcp.example.com/mcp", None, None);
        assert!(transport.is_ok());
    }

    /// 测试 HTTP 传输创建 - 空端点
    #[test]
    fn test_http_transport_new_empty_endpoint() {
        let transport = HttpTransport::new_for_test("", None, None);
        assert!(transport.is_err());
        if let Err(MCPError::InvalidTransportConfig(msg)) = transport {
            assert!(msg.contains("不能为空"));
        }
    }

    /// 测试 HTTP 传输创建 - 无效协议
    #[test]
    fn test_http_transport_new_invalid_protocol() {
        let transport = HttpTransport::new_for_test("ftp://example.com", None, None);
        assert!(transport.is_err());
        if let Err(MCPError::InvalidTransportConfig(msg)) = transport {
            assert!(msg.contains("http://") || msg.contains("https://"));
        }
    }

    /// 测试请求 ID 递增
    #[test]
    fn test_request_id_increment() {
        let transport = HttpTransport::new_for_test("https://example.com", None, None).unwrap();
        assert_eq!(transport.next_request_id(), 1);
        assert_eq!(transport.next_request_id(), 2);
        assert_eq!(transport.next_request_id(), 3);
    }

    /// 测试本机 endpoint 检测 - 应禁用代理
    #[test]
    fn test_endpoint_uses_loopback_host_true() {
        assert!(HttpTransport::endpoint_uses_loopback_host(
            "http://localhost:18060/mcp"
        ));
        assert!(HttpTransport::endpoint_uses_loopback_host(
            "http://localhost.:18060/mcp"
        ));
        assert!(HttpTransport::endpoint_uses_loopback_host(
            "http://api.localhost:18060/mcp"
        ));
        assert!(HttpTransport::endpoint_uses_loopback_host(
            "http://127.0.0.1:18060/mcp"
        ));
        assert!(HttpTransport::endpoint_uses_loopback_host(
            "http://127.42.0.1:18060/mcp"
        ));
        assert!(HttpTransport::endpoint_uses_loopback_host(
            "http://[::1]:18060/mcp"
        ));
    }

    /// 测试非本机 endpoint 检测 - 保留系统代理
    #[test]
    fn test_endpoint_uses_loopback_host_false() {
        assert!(!HttpTransport::endpoint_uses_loopback_host(
            "https://mcp.example.com/mcp"
        ));
        assert!(!HttpTransport::endpoint_uses_loopback_host(
            "http://192.168.1.10:18060/mcp"
        ));
        assert!(!HttpTransport::endpoint_uses_loopback_host(
            "http://10.0.0.5:18060/mcp"
        ));
        assert!(!HttpTransport::endpoint_uses_loopback_host("not-a-url"));
    }

    /// 测试本机 HTTP MCP 请求真实闭环。
    ///
    /// 使用 localhost endpoint 访问 127.0.0.1 mock 服务，覆盖：
    /// - HttpTransport::new 为 loopback endpoint 构建真实 reqwest client
    /// - send_request 发出 JSON-RPC POST
    /// - 响应 JSON-RPC result 被正确解析
    ///
    /// 如果 localhost 被系统代理拦截，这个测试会无法命中 mock server。
    #[tokio::test]
    async fn test_loopback_http_request_completes_json_rpc() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let endpoint = format!("http://localhost:{}/mcp", port);

        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let request = read_http_request(&mut stream);

            assert!(request.starts_with("POST /mcp "));
            assert!(request.contains("\"method\":\"initialize\""));
            assert!(request.contains("application/json"));

            let response_body = r#"{"jsonrpc":"2.0","id":1,"result":{"ok":true}}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nMcp-Session-Id: test-session\r\nConnection: close\r\n\r\n{}",
                response_body.len(),
                response_body
            );
            stream.write_all(response.as_bytes()).unwrap();
        });

        let transport = HttpTransport::new(&endpoint, None, None).unwrap();
        let result = transport
            .send_request("initialize", serde_json::json!({}))
            .await
            .unwrap();

        assert_eq!(result["ok"], true);
        assert_eq!(
            transport.session_id.read().await.as_deref(),
            Some("test-session")
        );
        server.join().unwrap();
    }

    /// 测试认证头构建 - API Key
    #[test]
    fn test_auth_header_apikey() {
        let transport =
            HttpTransport::new_for_test("https://example.com", Some("apikey"), Some("sk-test-key"))
                .unwrap();
        assert!(transport.auth_header.is_some());
        assert!(transport
            .auth_header
            .unwrap()
            .contains("Bearer sk-test-key"));
    }

    /// 测试认证头构建 - Bearer Token
    #[test]
    fn test_auth_header_token() {
        let transport =
            HttpTransport::new_for_test("https://example.com", Some("token"), Some("my-token"))
                .unwrap();
        assert!(transport.auth_header.is_some());
        assert!(transport.auth_header.unwrap().contains("Bearer my-token"));
    }

    /// 测试认证头构建 - 无认证
    #[test]
    fn test_auth_header_none() {
        let transport =
            HttpTransport::new_for_test("https://example.com", Some("none"), None).unwrap();
        assert!(transport.auth_header.is_none());
    }

    /// 测试 SSE 事件流解析 - 标准格式
    #[test]
    fn test_extract_json_from_sse_standard() {
        let sse = "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}\n\n";
        let result = HttpTransport::extract_json_from_sse(sse).unwrap();
        assert!(result.contains("\"jsonrpc\""));
        assert!(result.contains("\"result\""));
    }

    /// 测试 SSE 事件流解析 - 多个事件取最后一个
    #[test]
    fn test_extract_json_from_sse_multiple_events() {
        let sse = "event: message\ndata: {\"partial\":true}\n\nevent: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{\"final\":true}}\n\n";
        let result = HttpTransport::extract_json_from_sse(sse).unwrap();
        assert!(result.contains("\"final\""));
    }

    /// 测试 SSE CRLF 换行解析
    #[test]
    fn test_extract_json_from_sse_crlf() {
        let sse = "event: message\r\ndata: {\"jsonrpc\":\"2.0\",\"id\":7,\"result\":{}}\r\n\r\n";
        let result = HttpTransport::extract_json_from_sse(sse).unwrap();
        assert!(result.contains("\"id\":7"));
    }

    /// 测试 JSON-RPC 响应 ID 匹配
    #[test]
    fn test_json_rpc_response_matches_id() {
        let data = "{\"jsonrpc\":\"2.0\",\"id\":42,\"result\":{}}";
        assert!(HttpTransport::json_rpc_response_matches_id(data, 42));
        assert!(!HttpTransport::json_rpc_response_matches_id(data, 43));
        assert!(!HttpTransport::json_rpc_response_matches_id(
            "{\"method\":\"ping\"}",
            42
        ));
    }

    /// 测试 SSE 事件流解析 - 空内容报错
    #[test]
    fn test_extract_json_from_sse_empty() {
        let sse = "event: message\n\n";
        let result = HttpTransport::extract_json_from_sse(sse);
        assert!(result.is_err());
    }
}
