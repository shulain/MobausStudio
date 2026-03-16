//! MCP 协议消息定义
//!
//! 实现 JSON-RPC 2.0 消息格式和 MCP 特定的消息类型
//! 参考: https://modelcontextprotocol.io/specification/2025-03-26

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// MCP 协议版本
pub const PROTOCOL_VERSION: &str = "2025-03-26";

/// 客户端信息
pub const CLIENT_NAME: &str = "MobausStudio";
pub const CLIENT_VERSION: &str = env!("CARGO_PKG_VERSION");

// ==================== JSON-RPC 基础类型 ====================

/// JSON-RPC 请求消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    /// JSON-RPC 版本，固定为 "2.0"
    pub jsonrpc: String,
    /// 请求 ID
    pub id: u64,
    /// 方法名
    pub method: String,
    /// 参数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

impl JsonRpcRequest {
    /// 创建新的 JSON-RPC 请求
    pub fn new(id: u64, method: &str, params: Option<Value>) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            method: method.to_string(),
            params,
        }
    }
}

/// JSON-RPC 通知消息 (无 id，不期待响应)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcNotification {
    /// JSON-RPC 版本
    pub jsonrpc: String,
    /// 方法名
    pub method: String,
    /// 参数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
}

impl JsonRpcNotification {
    /// 创建新的 JSON-RPC 通知
    pub fn new(method: &str, params: Option<Value>) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            method: method.to_string(),
            params,
        }
    }
}

/// JSON-RPC 响应消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    /// JSON-RPC 版本
    pub jsonrpc: String,
    /// 请求 ID
    pub id: u64,
    /// 成功结果
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    /// 错误信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

/// JSON-RPC 错误
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    /// 错误码
    pub code: i64,
    /// 错误信息
    pub message: String,
    /// 额外数据
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

// ==================== MCP 特定类型 ====================

/// 客户端信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientInfo {
    pub name: String,
    pub version: String,
}

impl Default for ClientInfo {
    fn default() -> Self {
        Self {
            name: CLIENT_NAME.to_string(),
            version: CLIENT_VERSION.to_string(),
        }
    }
}

/// 服务器信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub name: String,
    pub version: String,
}

/// 服务器能力
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ServerCapabilities {
    /// 支持工具
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Value>,
    /// 支持资源
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resources: Option<Value>,
    /// 支持提示模板
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompts: Option<Value>,
    /// 支持日志
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logging: Option<Value>,
}

/// 客户端能力 (当前为空，预留扩展)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ClientCapabilities {}

// ==================== initialize 消息 ====================

/// initialize 请求参数
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeParams {
    /// 协议版本
    pub protocol_version: String,
    /// 客户端能力
    pub capabilities: ClientCapabilities,
    /// 客户端信息
    pub client_info: ClientInfo,
}

impl Default for InitializeParams {
    fn default() -> Self {
        Self {
            protocol_version: PROTOCOL_VERSION.to_string(),
            capabilities: ClientCapabilities::default(),
            client_info: ClientInfo::default(),
        }
    }
}

/// initialize 响应结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeResult {
    /// 协议版本
    pub protocol_version: String,
    /// 服务器能力
    pub capabilities: ServerCapabilities,
    /// 服务器信息
    pub server_info: ServerInfo,
}

// ==================== tools/list 消息 ====================

/// 工具定义
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tool {
    /// 工具名称
    pub name: String,
    /// 工具描述
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// 输入参数 JSON Schema
    pub input_schema: Value,
}

/// tools/list 响应结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListToolsResult {
    /// 工具列表
    pub tools: Vec<Tool>,
}

// ==================== tools/call 消息 ====================

/// tools/call 请求参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallToolParams {
    /// 工具名称
    pub name: String,
    /// 工具参数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<Value>,
}

/// 工具内容类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ToolContent {
    /// 文本内容
    Text { text: String },
    /// 图片内容
    Image {
        data: String,
        #[serde(rename = "mimeType")]
        mime_type: String,
    },
    /// 资源内容
    Resource {
        uri: String,
        #[serde(rename = "mimeType", skip_serializing_if = "Option::is_none")]
        mime_type: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        text: Option<String>,
    },
}

/// tools/call 响应结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CallToolResult {
    /// 内容列表
    pub content: Vec<ToolContent>,
    /// 是否为错误
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_error: Option<bool>,
}

// ==================== resources/list 消息 ====================

/// 资源定义
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Resource {
    /// 资源 URI
    pub uri: String,
    /// 资源名称
    pub name: String,
    /// 资源描述
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// MIME 类型
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
}

/// resources/list 响应结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListResourcesResult {
    /// 资源列表
    pub resources: Vec<Resource>,
}

// ==================== 传输配置 ====================

/// 传输类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TransportType {
    /// stdio 传输 (本地子进程)
    Stdio,
    /// HTTP 传输 (远程服务器)
    Http,
}

/// MCP 服务器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MCPServerConfig {
    /// 传输类型
    pub transport_type: TransportType,

    /// stdio: 启动命令
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,

    /// stdio: 命令参数
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,

    /// stdio: 环境变量
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<std::collections::HashMap<String, String>>,

    /// HTTP: 端点 URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,

    /// 认证类型
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_type: Option<String>,

    /// 认证值
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_value: Option<String>,
}

/// MCP 连接结果 (返回给前端)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MCPConnectionResult {
    /// 是否成功
    pub success: bool,
    /// 服务器信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub server_info: Option<ServerInfo>,
    /// 服务器能力
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<ServerCapabilities>,
    /// 协议版本
    #[serde(skip_serializing_if = "Option::is_none")]
    pub protocol_version: Option<String>,
    /// 错误信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl MCPConnectionResult {
    /// 创建成功结果
    pub fn success(result: InitializeResult) -> Self {
        Self {
            success: true,
            server_info: Some(result.server_info),
            capabilities: Some(result.capabilities),
            protocol_version: Some(result.protocol_version),
            error: None,
        }
    }

    /// 创建失败结果 (预留供未来使用)
    #[allow(dead_code)]
    pub fn failure(error: String) -> Self {
        Self {
            success: false,
            server_info: None,
            capabilities: None,
            protocol_version: None,
            error: Some(error),
        }
    }
}
