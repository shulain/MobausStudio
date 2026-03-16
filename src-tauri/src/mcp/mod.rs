//! MCP (Model Context Protocol) 模块
//!
//! 实现 Anthropic 官方 MCP 协议规范，支持：
//! - stdio 传输：本地子进程通信
//! - Streamable HTTP 传输：远程服务器连接
//!
//! 参考: https://modelcontextprotocol.io/specification/2025-03-26

pub mod client;
pub mod error;
pub mod protocol;
pub mod session;
pub mod transport;

// 重新导出常用类型 (供外部模块使用)
#[allow(unused_imports)]
pub use client::MCPClientManager;
#[allow(unused_imports)]
pub use error::MCPError;
#[allow(unused_imports)]
pub use protocol::*;
#[allow(unused_imports)]
pub use session::MCPSession;

// v4.1.45: 引入 MCP 测试模块
#[cfg(test)]
#[path = "mcp_test.rs"]
mod mcp_test;
