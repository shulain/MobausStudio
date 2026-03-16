//! MCP 会话管理
//!
//! 管理单个 MCP 服务器连接的生命周期，包括：
//! - 初始化握手
//! - 工具/资源发现
//! - 工具调用
//! - 优雅关闭 (v2.7.0)

use crate::mcp::error::MCPError;
use crate::mcp::protocol::*;
use crate::mcp::transport::MCPTransport;
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{timeout, Duration};

/// 初始化超时时间 (秒)
const INITIALIZE_TIMEOUT: u64 = 30;

/// shutdown 通知超时时间 (秒)
/// 发送 shutdown 通知后等待的时间，不需要太长
const SHUTDOWN_NOTIFICATION_TIMEOUT: u64 = 2;

/// MCP 会话
///
/// 代表与单个 MCP 服务器的连接会话
pub struct MCPSession {
    /// 传输层
    transport: Arc<dyn MCPTransport>,
    /// 服务器信息 (初始化后可用)
    server_info: RwLock<Option<ServerInfo>>,
    /// 服务器能力 (初始化后可用)
    capabilities: RwLock<Option<ServerCapabilities>>,
    /// 协议版本
    protocol_version: RwLock<Option<String>>,
    /// 是否已初始化
    initialized: RwLock<bool>,
}

impl MCPSession {
    /// 创建新的 MCP 会话
    ///
    /// # 参数
    /// - `transport`: 传输层实例
    pub fn new(transport: Arc<dyn MCPTransport>) -> Self {
        Self {
            transport,
            server_info: RwLock::new(None),
            capabilities: RwLock::new(None),
            protocol_version: RwLock::new(None),
            initialized: RwLock::new(false),
        }
    }

    /// 执行初始化握手
    ///
    /// 发送 initialize 请求并等待响应，然后发送 initialized 通知
    ///
    /// # 返回
    /// 初始化结果，包含服务器信息和能力
    pub async fn initialize(&self) -> Result<InitializeResult, MCPError> {
        log::info!("[MCP Session] 开始初始化握手");

        // 构建初始化参数
        let params = InitializeParams::default();
        let params_value = serde_json::to_value(&params)?;

        // 发送 initialize 请求 (带超时)
        let result = timeout(
            Duration::from_secs(INITIALIZE_TIMEOUT),
            self.transport.send_request("initialize", params_value),
        )
        .await
        .map_err(|_| MCPError::InitializeTimeout)??;

        // 解析响应
        let init_result: InitializeResult = serde_json::from_value(result)?;

        log::info!(
            "[MCP Session] 服务器响应: {} v{}",
            init_result.server_info.name,
            init_result.server_info.version
        );
        log::info!("[MCP Session] 协议版本: {}", init_result.protocol_version);

        // 存储服务器信息
        {
            let mut server_info = self.server_info.write().await;
            *server_info = Some(init_result.server_info.clone());
        }
        {
            let mut capabilities = self.capabilities.write().await;
            *capabilities = Some(init_result.capabilities.clone());
        }
        {
            let mut version = self.protocol_version.write().await;
            *version = Some(init_result.protocol_version.clone());
        }

        // 发送 initialized 通知
        self.transport
            .send_notification("notifications/initialized", json!({}))
            .await?;

        log::info!("[MCP Session] 初始化完成");

        // 标记为已初始化
        {
            let mut initialized = self.initialized.write().await;
            *initialized = true;
        }

        Ok(init_result)
    }

    /// 检查是否已初始化
    pub async fn is_initialized(&self) -> bool {
        *self.initialized.read().await
    }

    /// 获取服务器信息 (预留供未来使用)
    #[allow(dead_code)]
    pub async fn get_server_info(&self) -> Option<ServerInfo> {
        self.server_info.read().await.clone()
    }

    /// 获取服务器能力 (预留供未来使用)
    #[allow(dead_code)]
    pub async fn get_capabilities(&self) -> Option<ServerCapabilities> {
        self.capabilities.read().await.clone()
    }

    /// 列出服务器支持的工具
    ///
    /// # 返回
    /// 工具列表
    pub async fn list_tools(&self) -> Result<Vec<Tool>, MCPError> {
        if !self.is_initialized().await {
            return Err(MCPError::NotConnected);
        }

        log::debug!("[MCP Session] 请求工具列表");

        let result = self.transport.send_request("tools/list", json!({})).await?;

        let list_result: ListToolsResult = serde_json::from_value(result)?;

        log::info!("[MCP Session] 获取到 {} 个工具", list_result.tools.len());

        Ok(list_result.tools)
    }

    /// 调用工具
    ///
    /// # 参数
    /// - `tool_name`: 工具名称
    /// - `arguments`: 工具参数
    ///
    /// # 返回
    /// 工具执行结果
    pub async fn call_tool(
        &self,
        tool_name: &str,
        arguments: Value,
    ) -> Result<CallToolResult, MCPError> {
        if !self.is_initialized().await {
            return Err(MCPError::NotConnected);
        }

        log::info!("[MCP Session] 调用工具: {}", tool_name);
        log::debug!("[MCP Session] 工具参数: {}", arguments);

        let params = CallToolParams {
            name: tool_name.to_string(),
            arguments: if arguments.is_null() {
                None
            } else {
                Some(arguments)
            },
        };

        let result = self
            .transport
            .send_request("tools/call", serde_json::to_value(&params)?)
            .await?;

        let call_result: CallToolResult = serde_json::from_value(result)?;

        if call_result.is_error.unwrap_or(false) {
            log::warn!("[MCP Session] 工具执行返回错误");
        } else {
            log::info!("[MCP Session] 工具执行成功");
        }

        Ok(call_result)
    }

    /// 列出服务器可用的资源
    ///
    /// # 返回
    /// 资源列表
    pub async fn list_resources(&self) -> Result<Vec<Resource>, MCPError> {
        if !self.is_initialized().await {
            return Err(MCPError::NotConnected);
        }

        log::debug!("[MCP Session] 请求资源列表");

        let result = self
            .transport
            .send_request("resources/list", json!({}))
            .await?;

        let list_result: ListResourcesResult = serde_json::from_value(result)?;

        log::info!(
            "[MCP Session] 获取到 {} 个资源",
            list_result.resources.len()
        );

        Ok(list_result.resources)
    }

    /// 关闭会话 (v2.7.0 优雅关闭)
    ///
    /// 优雅关闭流程：
    /// 1. 标记为未初始化，阻止新请求
    /// 2. 尝试发送 shutdown 通知（如果服务器支持）
    /// 3. 关闭传输层
    pub async fn shutdown(&self) -> Result<(), MCPError> {
        log::info!("[MCP Session] 开始关闭会话");

        // 1. 标记为未初始化
        {
            let mut initialized = self.initialized.write().await;
            *initialized = false;
        }

        // 2. 尝试发送 shutdown 通知
        // 注意：MCP 协议中 shutdown 是可选的，某些服务器可能不支持
        // 使用短超时，失败不影响后续关闭流程
        log::debug!("[MCP Session] 尝试发送 shutdown 通知");
        match timeout(
            Duration::from_secs(SHUTDOWN_NOTIFICATION_TIMEOUT),
            self.transport.send_notification(
                "notifications/cancelled",
                json!({
                    "reason": "client_shutdown"
                }),
            ),
        )
        .await
        {
            Ok(Ok(())) => {
                log::debug!("[MCP Session] shutdown 通知已发送");
            }
            Ok(Err(e)) => {
                // 发送失败，可能服务器不支持或连接已断开
                log::debug!("[MCP Session] 发送 shutdown 通知失败（忽略）: {}", e);
            }
            Err(_) => {
                // 超时
                log::debug!("[MCP Session] 发送 shutdown 通知超时（忽略）");
            }
        }

        // 3. 关闭传输层
        self.transport.shutdown().await?;

        log::info!("[MCP Session] 会话已关闭");
        Ok(())
    }
}
