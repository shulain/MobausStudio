//! 配置导出错误类型定义

use thiserror::Error;

/// 配置导出错误类型
#[derive(Debug, Error)]
pub enum ConfigExportError {
    /// Provider 不存在
    #[error("Provider 不存在: {0}")]
    ProviderNotFound(String),

    /// 不支持的认证类型
    #[error("不支持的认证类型: {0}")]
    UnsupportedAuthType(String),

    /// 不支持的外部工具
    #[error("不支持的外部工具: {0}")]
    UnsupportedTool(String),

    /// 配置转换失败
    #[error("配置转换失败: {0}")]
    TransformError(String),

    /// 配置文件写入失败
    #[error("配置文件写入失败: {0}")]
    WriteError(String),

    /// 路径错误
    #[error("路径错误: {0}")]
    PathError(String),

    /// JSON 解析错误
    #[error("JSON 解析错误: {0}")]
    JsonError(#[from] serde_json::Error),

    /// IO 错误
    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),

    /// TOML 序列化错误
    #[error("TOML 序列化错误: {0}")]
    TomlError(String),
}

// 实现从 ConfigExportError 到 String 的转换，用于 Tauri 命令返回
impl From<ConfigExportError> for String {
    fn from(err: ConfigExportError) -> String {
        err.to_string()
    }
}
