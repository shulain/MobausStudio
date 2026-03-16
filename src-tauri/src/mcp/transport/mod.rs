//! MCP 传输层抽象
//!
//! 定义传输层接口和具体实现

pub mod http;
pub mod stdio;

use crate::mcp::error::MCPError;
use async_trait::async_trait;
use serde_json::Value;

/// MCP 传输层 trait
///
/// 所有传输实现 (stdio, HTTP) 都需要实现此 trait
#[async_trait]
pub trait MCPTransport: Send + Sync {
    /// 发送 JSON-RPC 请求并等待响应
    ///
    /// # 参数
    /// - `method`: 方法名 (如 "initialize", "tools/list")
    /// - `params`: 请求参数
    ///
    /// # 返回
    /// 响应的 result 字段值
    async fn send_request(&self, method: &str, params: Value) -> Result<Value, MCPError>;

    /// 发送 JSON-RPC 通知 (不期待响应)
    ///
    /// # 参数
    /// - `method`: 方法名 (如 "notifications/initialized")
    /// - `params`: 通知参数
    async fn send_notification(&self, method: &str, params: Value) -> Result<(), MCPError>;

    /// 关闭传输连接
    async fn shutdown(&self) -> Result<(), MCPError>;

    /// 检查传输是否活跃 (预留供未来使用)
    #[allow(dead_code)]
    fn is_alive(&self) -> bool;
}

// 重新导出
pub use http::HttpTransport;
pub use stdio::StdioTransport;
