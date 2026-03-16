//! MCP 客户端管理器
//!
//! 管理所有 MCP 服务器连接的生命周期

use crate::mcp::error::MCPError;
use crate::mcp::protocol::*;
use crate::mcp::session::MCPSession;
use crate::mcp::transport::{HttpTransport, MCPTransport, StdioTransport};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// MCP 客户端管理器
///
/// 全局单例，管理所有 MCP 服务器连接
pub struct MCPClientManager {
    /// 活跃的 MCP 会话映射 (server_id -> Session)
    sessions: Arc<RwLock<HashMap<String, Arc<MCPSession>>>>,
}

impl MCPClientManager {
    /// 创建新的客户端管理器
    pub fn new() -> Self {
        log::info!("[MCP Manager] 创建客户端管理器");
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 连接到 MCP 服务器
    ///
    /// # 参数
    /// - `server_id`: 服务器唯一标识
    /// - `config`: 服务器配置
    ///
    /// # 返回
    /// 连接结果，包含服务器信息和能力
    pub async fn connect(
        &self,
        server_id: &str,
        config: MCPServerConfig,
    ) -> Result<MCPConnectionResult, MCPError> {
        log::info!("[MCP Manager] 连接服务器: {}", server_id);

        // 检查是否已连接
        {
            let sessions = self.sessions.read().await;
            if sessions.contains_key(server_id) {
                log::warn!("[MCP Manager] 服务器已连接: {}", server_id);
                return Err(MCPError::AlreadyConnected);
            }
        }

        // 根据传输类型创建传输层
        let transport: Arc<dyn MCPTransport> = match config.transport_type {
            TransportType::Stdio => {
                // 验证 stdio 配置
                let command = config.command.ok_or_else(|| {
                    MCPError::InvalidTransportConfig("stdio 传输需要 command 字段".to_string())
                })?;

                let args = config.args.unwrap_or_default();
                let env = config.env.unwrap_or_default();

                log::info!("[MCP Manager] 创建 stdio 传输: {} {:?}", command, args);

                Arc::new(StdioTransport::new(&command, &args, &env).await?)
            }
            TransportType::Http => {
                // v2.5.0: HTTP 传输实现
                let endpoint = config.endpoint.ok_or_else(|| {
                    MCPError::InvalidTransportConfig("http 传输需要 endpoint 字段".to_string())
                })?;

                let auth_type = config.auth_type.as_deref();
                let auth_value = config.auth_value.as_deref();

                log::info!("[MCP Manager] 创建 HTTP 传输: {}", endpoint);

                Arc::new(HttpTransport::new(&endpoint, auth_type, auth_value)?)
            }
        };

        // 创建会话
        let session = Arc::new(MCPSession::new(transport));

        // 执行初始化握手
        let result = session.initialize().await?;

        // 存储会话
        {
            let mut sessions = self.sessions.write().await;
            sessions.insert(server_id.to_string(), session);
        }

        log::info!(
            "[MCP Manager] 服务器连接成功: {} ({} v{})",
            server_id,
            result.server_info.name,
            result.server_info.version
        );

        Ok(MCPConnectionResult::success(result))
    }

    /// 断开服务器连接
    ///
    /// # 参数
    /// - `server_id`: 服务器唯一标识
    pub async fn disconnect(&self, server_id: &str) -> Result<(), MCPError> {
        log::info!("[MCP Manager] 断开服务器: {}", server_id);

        let session = {
            let mut sessions = self.sessions.write().await;
            sessions.remove(server_id)
        };

        if let Some(session) = session {
            session.shutdown().await?;
            log::info!("[MCP Manager] 服务器已断开: {}", server_id);
            Ok(())
        } else {
            log::warn!("[MCP Manager] 服务器未连接: {}", server_id);
            Err(MCPError::NotConnected)
        }
    }

    /// 列出服务器支持的工具
    ///
    /// # 参数
    /// - `server_id`: 服务器唯一标识
    ///
    /// # 返回
    /// 工具列表
    pub async fn list_tools(&self, server_id: &str) -> Result<Vec<Tool>, MCPError> {
        let session = self.get_session(server_id).await?;
        session.list_tools().await
    }

    /// 调用工具
    ///
    /// # 参数
    /// - `server_id`: 服务器唯一标识
    /// - `tool_name`: 工具名称
    /// - `arguments`: 工具参数
    ///
    /// # 返回
    /// 工具执行结果
    pub async fn call_tool(
        &self,
        server_id: &str,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> Result<CallToolResult, MCPError> {
        let session = self.get_session(server_id).await?;
        session.call_tool(tool_name, arguments).await
    }

    /// 列出服务器可用的资源
    ///
    /// # 参数
    /// - `server_id`: 服务器唯一标识
    ///
    /// # 返回
    /// 资源列表
    pub async fn list_resources(&self, server_id: &str) -> Result<Vec<Resource>, MCPError> {
        let session = self.get_session(server_id).await?;
        session.list_resources().await
    }

    /// 获取服务器会话
    async fn get_session(&self, server_id: &str) -> Result<Arc<MCPSession>, MCPError> {
        let sessions = self.sessions.read().await;
        sessions
            .get(server_id)
            .cloned()
            .ok_or(MCPError::NotConnected)
    }

    /// 检查服务器是否已连接
    pub async fn is_connected(&self, server_id: &str) -> bool {
        let sessions = self.sessions.read().await;
        sessions.contains_key(server_id)
    }

    /// 获取所有已连接的服务器 ID
    pub async fn get_connected_servers(&self) -> Vec<String> {
        let sessions = self.sessions.read().await;
        sessions.keys().cloned().collect()
    }

    /// 断开所有服务器连接
    pub async fn disconnect_all(&self) -> Result<(), MCPError> {
        log::info!("[MCP Manager] 断开所有服务器");

        let server_ids: Vec<String> = {
            let sessions = self.sessions.read().await;
            sessions.keys().cloned().collect()
        };

        for server_id in server_ids {
            if let Err(e) = self.disconnect(&server_id).await {
                log::error!("[MCP Manager] 断开服务器失败 {}: {}", server_id, e);
            }
        }

        Ok(())
    }
}

impl Default for MCPClientManager {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for MCPClientManager {
    fn drop(&mut self) {
        log::info!("[MCP Manager] 客户端管理器销毁");
    }
}
