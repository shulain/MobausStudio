//! MCP 错误类型定义
//!
//! 定义 MCP 客户端可能遇到的各种错误类型

use serde::{Deserialize, Serialize};
use std::fmt;

/// MCP 错误类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MCPError {
    /// 服务器未连接
    NotConnected,

    /// 已经连接
    AlreadyConnected,

    /// 子进程启动失败
    SpawnFailed(String),

    /// stdin 不可用
    StdinNotAvailable,

    /// stdout 不可用
    StdoutNotAvailable,

    /// 读取失败
    ReadFailed(String),

    /// 写入失败
    WriteFailed(String),

    /// 请求超时
    Timeout,

    /// 初始化超时
    InitializeTimeout,

    /// JSON 序列化/反序列化错误
    JsonError(String),

    /// 服务器返回错误
    ServerError { code: i64, message: String },

    /// 协议版本不兼容
    ProtocolVersionMismatch {
        client_version: String,
        server_version: String,
    },

    /// 关闭失败
    ShutdownFailed(String),

    /// HTTP 连接失败
    HttpConnectionFailed(String),

    /// 无效的传输配置
    InvalidTransportConfig(String),

    /// 工具不存在
    ToolNotFound(String),

    /// 内部错误
    Internal(String),

    /// HTTP 错误 (v2.5.0)
    HttpError(String),

    /// 连接失败 (v2.5.0)
    ConnectionFailed(String),

    /// 认证错误 (v2.5.0)
    AuthError(String),

    /// 解析错误 (v2.5.0)
    ParseError(String),
}

impl fmt::Display for MCPError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MCPError::NotConnected => write!(f, "服务器未连接"),
            MCPError::AlreadyConnected => write!(f, "服务器已连接"),
            MCPError::SpawnFailed(msg) => write!(f, "启动服务器失败: {}", msg),
            MCPError::StdinNotAvailable => write!(f, "stdin 不可用"),
            MCPError::StdoutNotAvailable => write!(f, "stdout 不可用"),
            MCPError::ReadFailed(msg) => write!(f, "读取失败: {}", msg),
            MCPError::WriteFailed(msg) => write!(f, "写入失败: {}", msg),
            MCPError::Timeout => write!(f, "请求超时"),
            MCPError::InitializeTimeout => write!(f, "初始化超时"),
            MCPError::JsonError(msg) => write!(f, "JSON 错误: {}", msg),
            MCPError::ServerError { code, message } => {
                write!(f, "服务器错误 [{}]: {}", code, message)
            }
            MCPError::ProtocolVersionMismatch {
                client_version,
                server_version,
            } => write!(
                f,
                "协议版本不兼容: 客户端 {} vs 服务器 {}",
                client_version, server_version
            ),
            MCPError::ShutdownFailed(msg) => write!(f, "关闭失败: {}", msg),
            MCPError::HttpConnectionFailed(msg) => write!(f, "HTTP 连接失败: {}", msg),
            MCPError::InvalidTransportConfig(msg) => write!(f, "无效的传输配置: {}", msg),
            MCPError::ToolNotFound(name) => write!(f, "工具不存在: {}", name),
            MCPError::Internal(msg) => write!(f, "内部错误: {}", msg),
            MCPError::HttpError(msg) => write!(f, "HTTP 错误: {}", msg),
            MCPError::ConnectionFailed(msg) => write!(f, "连接失败: {}", msg),
            MCPError::AuthError(msg) => write!(f, "认证错误: {}", msg),
            MCPError::ParseError(msg) => write!(f, "解析错误: {}", msg),
        }
    }
}

impl std::error::Error for MCPError {}

impl From<std::io::Error> for MCPError {
    fn from(err: std::io::Error) -> Self {
        MCPError::Internal(err.to_string())
    }
}

impl From<serde_json::Error> for MCPError {
    fn from(err: serde_json::Error) -> Self {
        MCPError::JsonError(err.to_string())
    }
}

impl From<tokio::time::error::Elapsed> for MCPError {
    fn from(_: tokio::time::error::Elapsed) -> Self {
        MCPError::Timeout
    }
}

/// 将 MCPError 转换为可序列化的字符串 (用于 Tauri 命令返回)
impl From<MCPError> for String {
    fn from(err: MCPError) -> Self {
        err.to_string()
    }
}
