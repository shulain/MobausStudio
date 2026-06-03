//! 导出服务（核心逻辑）
//!
//! 协调整个导出流程：读取内部数据 → 格式转换 → 配置写入。

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

use super::enabled_state::EnabledState;
use super::error::ConfigExportError;
use super::transformer::Transformer;
use super::writer::Writer;

// 复用 lib.rs 中的类型定义
use crate::{MCPServerConfig, ProviderCredential};

/// 导出请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportRequest {
    /// Provider ID
    pub provider_id: String,
    /// 目标工具名称
    pub tool_name: String,
}

/// 批量导出结果
#[derive(Debug, Clone, Serialize)]
pub struct BatchExportResult {
    /// 成功数量
    pub success_count: usize,
    /// 失败的导出
    pub failed_exports: Vec<FailedExport>,
}

/// 失败的导出详情
#[derive(Debug, Clone, Serialize)]
pub struct FailedExport {
    /// Provider ID
    pub provider_id: String,
    /// 目标工具名称
    pub tool_name: String,
    /// 错误信息
    pub error: String,
}

/// 支持的外部工具信息
#[derive(Debug, Clone, Serialize)]
pub struct ExternalTool {
    /// 工具标识
    pub id: String,
    /// 工具名称
    pub name: String,
    /// 配置文件路径列表
    pub config_files: Vec<String>,
    /// 是否支持 MCP
    pub supports_mcp: bool,
    /// 是否支持 Skills
    pub supports_skills: bool,
}

// ============================================================================
// ExportService 核心实现
// ============================================================================

/// 配置导出服务
///
/// 协调整个导出流程：读取内部数据 → 格式转换 → 配置写入。
pub struct ExportService {
    /// 格式转换器
    transformer: Transformer,
    /// 配置文件写入器
    writer: Writer,
}

impl ExportService {
    /// 创建新的 ExportService 实例
    pub fn new() -> Self {
        Self {
            transformer: Transformer::new(),
            writer: Writer::new(),
        }
    }

    /// 导出 Provider 配置到指定外部工具（使用传入的 provider_name 和 protocol）
    ///
    /// # 参数
    /// - `data_dir`: 数据目录路径
    /// - `provider_id`: Provider ID
    /// - `provider_name`: Provider 名称（用于 OpenCode 配置）
    /// - `provider_models`: Provider 模型列表（JSON 字符串）
    /// - `provider_protocol`: Provider 协议（从前端传递）
    /// - `provider_base_url`: Provider baseURL（从前端传递）
    /// - `tool_name`: 目标工具名称
    ///
    /// # 返回
    /// - 成功返回 Ok(())，失败返回 ConfigExportError
    #[allow(clippy::too_many_arguments)]
    pub fn export_provider_with_name_and_protocol(
        &self,
        data_dir: &Path,
        provider_id: &str,
        provider_name: &str,
        provider_models: &str,
        provider_protocol: Option<&str>,
        provider_base_url: Option<&str>,
        tool_name: &str,
    ) -> Result<(), ConfigExportError> {
        log::info!(
            "开始导出配置: provider={}, name={}, protocol={:?}, baseURL={:?}, tool={}",
            provider_id,
            provider_name,
            provider_protocol,
            provider_base_url,
            tool_name
        );

        // 1. 读取 Provider 凭证
        let credentials = self.load_credentials(data_dir)?;
        let credential = credentials
            .iter()
            .find(|c| c.provider_id == provider_id)
            .ok_or_else(|| ConfigExportError::ProviderNotFound(provider_id.to_string()))?;

        // 2. 检查认证类型（仅支持 API Key）
        if credential.auth_type != "api" {
            return Err(ConfigExportError::UnsupportedAuthType(
                "仅支持 API Key 认证类型，OAuth 需要使用代理服务器".to_string(),
            ));
        }

        let api_key = credential.api_key.as_deref().ok_or_else(|| {
            ConfigExportError::TransformError("Provider 缺少 api_key 字段".to_string())
        })?;

        // 规范化 Provider 名称
        let normalized_name = self.normalize_provider_name(provider_name);
        log::info!(
            "[export_provider_with_name_and_protocol] Provider 名称规范化: {} -> {}",
            provider_name,
            normalized_name
        );

        // 解析模型列表
        let models: HashMap<String, Value> = serde_json::from_str(provider_models)
            .map_err(|e| ConfigExportError::TransformError(format!("解析模型列表失败: {}", e)))?;
        log::info!(
            "[export_provider_with_name_and_protocol] 模型数量: {}",
            models.len()
        );

        // 4. 读取 MCP 服务器配置（过滤已启用的）
        let mcp_servers = self.load_enabled_mcp_servers(data_dir)?;

        // 5. 读取 Skills 配置
        let skills = self.load_skills(data_dir)?;

        // 6. 格式转换（使用规范化的 provider_name、模型列表和 protocol）
        let output = self.transformer.transform_with_models(
            tool_name,
            &normalized_name,
            api_key,
            provider_base_url, // 使用前端传递的 baseURL
            provider_protocol, // 使用前端传递的 protocol
            &models,
            &mcp_servers,
            &skills,
        )?;

        // 7. 写入配置文件
        // 设置"正在写入配置"标志，避免监听器误判
        super::watcher::set_writing_config(true);
        let write_result = self.writer.write_config(tool_name, &output);

        // 延迟清除标志，确保监听器能看到这个标志
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_millis(1000));
            super::watcher::set_writing_config(false);
        });

        write_result?;

        // 8. 更新启用状态（只在写入成功后更新）
        // 对于 OpenCode，使用规范化后的名称作为 provider_id
        let state_provider_id = if tool_name == "opencode" {
            &normalized_name
        } else {
            provider_id
        };

        // 如果是 OpenCode，处理切换逻辑
        if tool_name == "opencode" {
            // 加载当前启用状态，检查是否有旧的提供商
            let current_state = EnabledState::load(data_dir)?;
            if let Some(old_provider_id) = current_state.enabled_providers.get("opencode") {
                // 如果旧提供商与新提供商不同，删除旧提供商
                if old_provider_id != state_provider_id {
                    log::info!(
                        "[ExportService] 检测到切换提供商: {} -> {}，删除旧提供商",
                        old_provider_id,
                        state_provider_id
                    );
                    Self::remove_opencode_provider(old_provider_id)?;
                }
            }

            // 从 disabled_providers 中移除新提供商（如果存在）
            Self::remove_from_disabled_providers(state_provider_id)?;
        }

        let mut state = EnabledState::load(data_dir)?;
        state.set_enabled_provider(tool_name, state_provider_id);
        state.save(data_dir)?;

        log::info!("导出配置成功: provider={}, tool={}", provider_id, tool_name);

        Ok(())
    }

    /// 导出 Provider 配置到指定外部工具
    ///
    /// # 参数
    /// - `data_dir`: MobausStudio 数据目录路径
    /// - `provider_id`: Provider ID
    /// - `tool_name`: 目标工具名称
    ///
    /// # 返回
    /// - 成功返回 Ok(())，失败返回 ConfigExportError
    pub fn export_provider(
        &self,
        data_dir: &Path,
        provider_id: &str,
        tool_name: &str,
    ) -> Result<(), ConfigExportError> {
        log::info!("开始导出配置: provider={}, tool={}", provider_id, tool_name);

        // 1. 读取 Provider 凭证
        let credentials = self.load_credentials(data_dir)?;
        let credential = credentials
            .iter()
            .find(|c| c.provider_id == provider_id)
            .ok_or_else(|| ConfigExportError::ProviderNotFound(provider_id.to_string()))?;

        // 2. 检查认证类型（仅支持 API Key）
        if credential.auth_type != "api" {
            return Err(ConfigExportError::UnsupportedAuthType(
                "仅支持 API Key 认证类型，OAuth 需要使用代理服务器".to_string(),
            ));
        }

        let api_key = credential.api_key.as_deref().ok_or_else(|| {
            ConfigExportError::TransformError("Provider 缺少 api_key 字段".to_string())
        })?;

        // 3. 读取自定义 Provider 配置（获取 base_url、name 和 protocol）
        let custom_providers = self.load_custom_providers(data_dir)?;
        let base_url = self.extract_base_url(provider_id, &custom_providers);
        let protocol = self.extract_protocol(provider_id, &custom_providers);

        // 提取 Provider 名称（用于 OpenCode 配置的 provider ID）
        // 优先使用 name 字段，如果不存在则使用 provider_id
        let provider_name = custom_providers
            .get(provider_id)
            .and_then(|p| {
                log::info!(
                    "[export_provider] Provider 数据: id={}, data={:?}",
                    provider_id,
                    p
                );
                p.get("name")
            })
            .and_then(|v| v.as_str())
            .map(|s| {
                let normalized = self.normalize_provider_name(s);
                log::info!(
                    "[export_provider] Provider 名称规范化: {} -> {}",
                    s,
                    normalized
                );
                normalized
            })
            .unwrap_or_else(|| {
                log::warn!(
                    "[export_provider] Provider {} 没有 name 字段，使用 ID",
                    provider_id
                );
                provider_id.to_string()
            });

        // 4. 读取 MCP 服务器配置（过滤已启用的）
        let mcp_servers = self.load_enabled_mcp_servers(data_dir)?;

        // 5. 读取 Skills 配置
        let skills = self.load_skills(data_dir)?;

        // 6. 格式转换（使用规范化的 provider_name、protocol 而不是内部 ID）
        let output = self.transformer.transform(
            tool_name,
            &provider_name,
            api_key,
            base_url.as_deref(),
            protocol.as_deref(),
            &mcp_servers,
            &skills,
        )?;

        // 7. 写入配置文件
        // 设置"正在写入配置"标志，避免监听器误判
        super::watcher::set_writing_config(true);
        let write_result = self.writer.write_config(tool_name, &output);

        // 延迟清除标志，确保监听器能看到这个标志
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_millis(1000));
            super::watcher::set_writing_config(false);
        });

        write_result?;

        // 8. 更新启用状态（只在写入成功后更新）
        // 对于 OpenCode，使用规范化后的名称作为 provider_id
        let state_provider_id = if tool_name == "opencode" {
            &provider_name
        } else {
            provider_id
        };

        // 如果是 OpenCode，处理切换逻辑
        if tool_name == "opencode" {
            // 加载当前启用状态，检查是否有旧的提供商
            let current_state = EnabledState::load(data_dir)?;
            if let Some(old_provider_id) = current_state.enabled_providers.get("opencode") {
                // 如果旧提供商与新提供商不同，删除旧提供商
                if old_provider_id != state_provider_id {
                    log::info!(
                        "[ExportService] 检测到切换提供商: {} -> {}，删除旧提供商",
                        old_provider_id,
                        state_provider_id
                    );
                    Self::remove_opencode_provider(old_provider_id)?;
                }
            }

            // 从 disabled_providers 中移除新提供商（如果存在）
            Self::remove_from_disabled_providers(state_provider_id)?;
        }

        let mut state = EnabledState::load(data_dir)?;
        state.set_enabled_provider(tool_name, state_provider_id);
        state.save(data_dir)?;

        log::info!("导出配置成功: provider={}, tool={}", provider_id, tool_name);

        Ok(())
    }

    /// 批量导出配置
    ///
    /// 每个导出请求独立执行，单个失败不影响其他导出。
    pub fn batch_export(&self, data_dir: &Path, exports: &[ExportRequest]) -> BatchExportResult {
        let mut success_count = 0;
        let mut failed_exports = Vec::new();

        for req in exports {
            match self.export_provider(data_dir, &req.provider_id, &req.tool_name) {
                Ok(()) => {
                    success_count += 1;
                }
                Err(e) => {
                    log::error!(
                        "导出失败: provider={}, tool={}, error={}",
                        req.provider_id,
                        req.tool_name,
                        e
                    );

                    // 导出失败时清理启用状态（避免 UI 显示已启用但实际不可用）
                    if let Ok(mut state) = EnabledState::load(data_dir) {
                        state.clear_enabled_provider(&req.tool_name);
                        let _ = state.save(data_dir);
                    }

                    failed_exports.push(FailedExport {
                        provider_id: req.provider_id.clone(),
                        tool_name: req.tool_name.clone(),
                        error: e.to_string(),
                    });
                }
            }
        }

        BatchExportResult {
            success_count,
            failed_exports,
        }
    }

    /// 获取支持的外部工具列表
    pub fn get_supported_tools() -> Vec<ExternalTool> {
        vec![
            ExternalTool {
                id: "claude-code".to_string(),
                name: "Claude Code".to_string(),
                config_files: vec![
                    "~/.claude/settings.json".to_string(),
                    "~/.claude.json".to_string(),
                ],
                supports_mcp: true,
                supports_skills: true,
            },
            ExternalTool {
                id: "codex".to_string(),
                name: "Codex".to_string(),
                config_files: vec![
                    "~/.codex/auth.json".to_string(),
                    "~/.codex/config.toml".to_string(),
                ],
                supports_mcp: true,
                supports_skills: true,
            },
            ExternalTool {
                id: "gemini-cli".to_string(),
                name: "Gemini CLI".to_string(),
                config_files: vec![
                    "~/.gemini/.env".to_string(),
                    "~/.gemini/settings.json".to_string(),
                ],
                supports_mcp: true,
                supports_skills: false,
            },
            ExternalTool {
                id: "opencode".to_string(),
                name: "OpenCode".to_string(),
                config_files: vec!["~/.config/opencode/opencode.json".to_string()],
                supports_mcp: true,
                supports_skills: false,
            },
            ExternalTool {
                id: "openclaw".to_string(),
                name: "OpenClaw".to_string(),
                config_files: vec!["~/.openclaw/config.json".to_string()],
                supports_mcp: false,
                supports_skills: false,
            },
        ]
    }

    /// 获取指定工具的配置文件路径
    ///
    /// # 参数
    /// - `tool_name`: 工具名称
    ///
    /// # 返回
    /// - 配置文件路径列表（已展开 ~ 为实际 home 目录）
    pub fn get_tool_config_paths(tool_name: &str) -> Result<Vec<String>, ConfigExportError> {
        log::info!(
            "[get_tool_config_paths] 获取工具配置路径: tool={}",
            tool_name
        );

        // 查找工具
        let tools = Self::get_supported_tools();
        let tool = tools
            .iter()
            .find(|t| t.id == tool_name)
            .ok_or_else(|| ConfigExportError::UnsupportedTool(tool_name.to_string()))?;

        // 展开路径中的 ~
        let expanded_paths: Vec<String> = tool
            .config_files
            .iter()
            .map(|path| {
                if path.starts_with("~/") {
                    // 展开 ~ 为 home 目录
                    if let Some(home) = dirs::home_dir() {
                        let expanded = path.replacen("~", &home.to_string_lossy(), 1);
                        return expanded;
                    }
                }
                path.clone()
            })
            .collect();

        Ok(expanded_paths)
    }

    /// 获取所有工具的启用状态
    ///
    /// # 参数
    /// - `data_dir`: MobausStudio 数据目录路径
    ///
    /// # 返回
    /// - 工具名 -> Provider ID 映射
    pub fn get_enabled_providers(
        data_dir: &Path,
    ) -> Result<HashMap<String, String>, ConfigExportError> {
        let state = EnabledState::load(data_dir)?;
        Ok(state.enabled_providers)
    }

    /// 禁用工具的 Provider 配置
    ///
    /// 清除指定工具的启用状态，但不删除配置文件
    ///
    /// # 参数
    /// - `data_dir`: MobausStudio 数据目录路径
    /// - `tool_name`: 工具名称（如 "claude-code", "codex"）
    pub fn disable_provider_for_tool(
        data_dir: &Path,
        tool_name: &str,
    ) -> Result<(), ConfigExportError> {
        log::info!("[ExportService] 禁用工具配置: tool={}", tool_name);

        // 加载启用状态
        let mut state = EnabledState::load(data_dir)?;
        log::info!(
            "[ExportService] 当前启用状态: {:?}",
            state.enabled_providers
        );

        // 获取当前启用的 provider_id
        let provider_id = state.enabled_providers.get(tool_name).cloned();
        log::info!(
            "[ExportService] 工具 {} 当前启用的提供商: {:?}",
            tool_name,
            provider_id
        );

        // 清除启用状态
        state.clear_enabled_provider(tool_name);

        // 保存状态
        state.save(data_dir)?;
        log::info!("[ExportService] 启用状态已保存");

        // 如果是 OpenCode，从配置文件中删除提供商
        if tool_name == "opencode" {
            log::info!("[ExportService] 检测到 OpenCode 工具，准备删除配置文件中的提供商");
            if let Some(provider_id) = provider_id {
                log::info!("[ExportService] 开始删除提供商: {}", provider_id);
                Self::remove_opencode_provider(&provider_id)?;
            } else {
                log::warn!("[ExportService] 没有找到启用的提供商，跳过删除");
            }
        }

        log::info!("[ExportService] 禁用成功: tool={}", tool_name);
        Ok(())
    }

    /// 从 OpenCode 配置文件中删除提供商
    fn remove_opencode_provider(provider_id: &str) -> Result<(), ConfigExportError> {
        log::info!(
            "[ExportService] remove_opencode_provider 开始: provider_id={}",
            provider_id
        );

        let opencode_config_path = dirs::home_dir()
            .ok_or_else(|| {
                ConfigExportError::IoError(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "无法获取用户目录",
                ))
            })?
            .join(".config")
            .join("opencode")
            .join("opencode.json");

        log::info!(
            "[ExportService] OpenCode 配置文件路径: {:?}",
            opencode_config_path
        );

        if !opencode_config_path.exists() {
            log::warn!("[ExportService] OpenCode 配置文件不存在，跳过删除");
            return Ok(());
        }

        // 读取配置文件
        log::info!("[ExportService] 读取 OpenCode 配置文件");
        let content =
            std::fs::read_to_string(&opencode_config_path).map_err(ConfigExportError::IoError)?;

        let mut config: serde_json::Value = serde_json::from_str(&content)?;
        log::info!("[ExportService] 配置文件解析成功");

        // 从 provider 对象中删除提供商
        if let Some(providers) = config.get_mut("provider").and_then(|p| p.as_object_mut()) {
            log::info!(
                "[ExportService] 当前配置中的提供商: {:?}",
                providers.keys().collect::<Vec<_>>()
            );

            if providers.remove(provider_id).is_some() {
                log::info!("[ExportService] 成功从配置中移除提供商: {}", provider_id);

                // 写回配置文件
                let updated_content = serde_json::to_string_pretty(&config)?;
                log::info!("[ExportService] 准备写回配置文件");
                std::fs::write(&opencode_config_path, updated_content)
                    .map_err(ConfigExportError::IoError)?;
                log::info!("[ExportService] 配置文件写入成功");
            } else {
                log::warn!(
                    "[ExportService] 提供商 {} 不在 OpenCode 配置中",
                    provider_id
                );
            }
        } else {
            log::warn!("[ExportService] 配置文件中没有 provider 字段");
        }

        log::info!("[ExportService] remove_opencode_provider 完成");
        Ok(())
    }

    /// 从 OpenCode 配置文件的 disabled_providers 中移除提供商
    ///
    /// 当启用提供商时，需要确保它不在禁用列表中
    fn remove_from_disabled_providers(provider_id: &str) -> Result<(), ConfigExportError> {
        log::info!(
            "[ExportService] remove_from_disabled_providers 开始: provider_id={}",
            provider_id
        );

        let opencode_config_path = dirs::home_dir()
            .ok_or_else(|| {
                ConfigExportError::IoError(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "无法获取用户目录",
                ))
            })?
            .join(".config")
            .join("opencode")
            .join("opencode.json");

        if !opencode_config_path.exists() {
            log::info!("[ExportService] OpenCode 配置文件不存在，无需处理");
            return Ok(());
        }

        // 读取配置文件
        let content =
            std::fs::read_to_string(&opencode_config_path).map_err(ConfigExportError::IoError)?;

        let mut config: serde_json::Value = serde_json::from_str(&content)?;

        // 检查 disabled_providers 数组
        if let Some(disabled) = config
            .get_mut("disabled_providers")
            .and_then(|d| d.as_array_mut())
        {
            // 查找并移除该提供商
            if let Some(pos) = disabled
                .iter()
                .position(|v| v.as_str() == Some(provider_id))
            {
                disabled.remove(pos);
                log::info!(
                    "[ExportService] 从 disabled_providers 中移除提供商: {}",
                    provider_id
                );

                // 写回配置文件
                let updated_content = serde_json::to_string_pretty(&config)?;
                std::fs::write(&opencode_config_path, updated_content)
                    .map_err(ConfigExportError::IoError)?;
                log::info!("[ExportService] 配置文件更新成功");
            } else {
                log::info!(
                    "[ExportService] 提供商 {} 不在 disabled_providers 中",
                    provider_id
                );
            }
        } else {
            log::info!("[ExportService] 配置文件中没有 disabled_providers 字段");
        }

        Ok(())
    }

    // ========================================================================
    // 内部辅助方法
    // ========================================================================

    /// 加载 Provider 凭证
    fn load_credentials(
        &self,
        data_dir: &Path,
    ) -> Result<Vec<ProviderCredential>, ConfigExportError> {
        let path = data_dir.join("provider_credentials.json");
        if !path.exists() {
            log::info!("provider_credentials.json 不存在，返回空列表");
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(&path).map_err(ConfigExportError::IoError)?;
        let credentials: Vec<ProviderCredential> = serde_json::from_str(&content)?;
        log::info!("加载 Provider 凭证: {} 个", credentials.len());

        Ok(credentials)
    }

    /// 加载自定义 Provider 配置（用于获取 base_url）
    ///
    /// custom_providers.json 包含用户自定义的 Provider 配置，
    /// 其中可能包含 baseUrl 字段。
    fn load_custom_providers(
        &self,
        data_dir: &Path,
    ) -> Result<HashMap<String, Value>, ConfigExportError> {
        let path = data_dir.join("custom_providers.json");
        if !path.exists() {
            log::info!("custom_providers.json 不存在，返回空 Map");
            return Ok(HashMap::new());
        }

        let content = fs::read_to_string(&path).map_err(ConfigExportError::IoError)?;
        let providers: Vec<Value> = serde_json::from_str(&content)?;

        // 转换为 Map: provider_id -> provider_config
        let mut map = HashMap::new();
        for provider in providers {
            if let Some(id) = provider.get("id").and_then(|v| v.as_str()) {
                map.insert(id.to_string(), provider);
            }
        }

        log::info!("加载自定义 Provider 配置: {} 个", map.len());
        Ok(map)
    }

    /// 提取 Provider 的 base_url
    ///
    /// 从 custom_providers.json 中查找对应 provider_id 的 endpoint 字段。
    fn extract_base_url(
        &self,
        provider_id: &str,
        custom_providers: &HashMap<String, Value>,
    ) -> Option<String> {
        custom_providers
            .get(provider_id)
            .and_then(|p| p.get("endpoint")) // 修改：使用 endpoint 而不是 baseUrl
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    }

    /// 提取 Provider 的 protocol 类型
    ///
    /// 从 custom_providers.json 中查找对应 provider_id 的 protocol 字段。
    /// 返回值: "openai", "anthropic", "google" 等
    fn extract_protocol(
        &self,
        provider_id: &str,
        custom_providers: &HashMap<String, Value>,
    ) -> Option<String> {
        custom_providers
            .get(provider_id)
            .and_then(|p| p.get("protocol"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    }

    /// 规范化 Provider 名称，使其适合作为配置键
    ///
    /// 转换规则：
    /// - 转小写
    /// - 空格替换为连字符
    /// - 移除特殊字符（只保留字母、数字、连字符、下划线）
    fn normalize_provider_name(&self, name: &str) -> String {
        name.to_lowercase()
            .replace(' ', "-")
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
            .collect()
    }

    /// 加载已启用的 MCP 服务器配置
    ///
    /// 过滤出 enabled==true 的服务器，并转换为外部工具通用的 JSON 格式。
    fn load_enabled_mcp_servers(
        &self,
        data_dir: &Path,
    ) -> Result<HashMap<String, Value>, ConfigExportError> {
        let path = data_dir.join("mcp_servers.json");
        if !path.exists() {
            log::info!("mcp_servers.json 不存在，返回空列表");
            return Ok(HashMap::new());
        }

        let content = fs::read_to_string(&path).map_err(ConfigExportError::IoError)?;
        let servers: Vec<MCPServerConfig> = serde_json::from_str(&content)?;

        let mut result = HashMap::new();
        for server in servers {
            if !server.enabled {
                continue;
            }

            // 将 MCPServerConfig 转换为通用的 JSON 格式
            let spec = self.mcp_config_to_spec(&server);
            result.insert(server.id.clone(), spec);
        }

        log::info!("加载已启用的 MCP 服务器: {} 个", result.len());
        Ok(result)
    }

    /// 将 MobausStudio 的 MCPServerConfig 转换为通用的 MCP 服务器规格
    ///
    /// 这是适配层：将内部数据结构转换为 cc-switch 兼容的格式。
    fn mcp_config_to_spec(&self, server: &MCPServerConfig) -> Value {
        let mut spec = serde_json::Map::new();

        match server.transport_type.as_str() {
            "stdio" => {
                spec.insert("type".to_string(), Value::String("stdio".to_string()));

                // Windows 命令包装（复用公共函数）
                #[cfg(target_os = "windows")]
                {
                    if let Some(ref cmd) = server.command {
                        use super::windows_cmd_wrapper::{
                            needs_windows_wrapping, wrap_windows_command,
                        };

                        if needs_windows_wrapping(cmd) {
                            // Windows: command="cmd", args=["/c", "npx", ...原args]
                            let args = server.args.as_ref().map(|v| v.clone()).unwrap_or_default();
                            let (wrapped_cmd, wrapped_args) = wrap_windows_command(cmd, &args);

                            spec.insert("command".to_string(), Value::String(wrapped_cmd));
                            spec.insert(
                                "args".to_string(),
                                Value::Array(
                                    wrapped_args
                                        .iter()
                                        .map(|a| Value::String(a.clone()))
                                        .collect(),
                                ),
                            );
                        } else {
                            // 非 Node.js 工具链命令，保持原样
                            spec.insert("command".to_string(), Value::String(cmd.clone()));
                            if let Some(ref args) = server.args {
                                spec.insert(
                                    "args".to_string(),
                                    Value::Array(
                                        args.iter().map(|a| Value::String(a.clone())).collect(),
                                    ),
                                );
                            }
                        }
                    }
                }

                // 非 Windows 平台，保持原样
                #[cfg(not(target_os = "windows"))]
                {
                    if let Some(ref cmd) = server.command {
                        spec.insert("command".to_string(), Value::String(cmd.clone()));
                    }
                    if let Some(ref args) = server.args {
                        spec.insert(
                            "args".to_string(),
                            Value::Array(args.iter().map(|a| Value::String(a.clone())).collect()),
                        );
                    }
                }

                if let Some(ref env) = server.env {
                    let env_obj: serde_json::Map<String, Value> = env
                        .iter()
                        .map(|(k, v)| (k.clone(), Value::String(v.clone())))
                        .collect();
                    spec.insert("env".to_string(), Value::Object(env_obj));
                }
            }
            "http" | "sse" => {
                spec.insert(
                    "type".to_string(),
                    Value::String(server.transport_type.clone()),
                );
                if let Some(ref endpoint) = server.endpoint {
                    spec.insert("url".to_string(), Value::String(endpoint.clone()));
                }
            }
            _ => {
                spec.insert(
                    "type".to_string(),
                    Value::String(server.transport_type.clone()),
                );
            }
        }

        Value::Object(spec)
    }

    /// 加载 Skills 配置
    fn load_skills(&self, data_dir: &Path) -> Result<Vec<Value>, ConfigExportError> {
        let path = data_dir.join("skills.json");
        if !path.exists() {
            log::info!("skills.json 不存在，返回空列表");
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(&path).map_err(ConfigExportError::IoError)?;
        let skills: Vec<Value> = serde_json::from_str(&content)?;
        log::info!("加载 Skills 配置: {} 个", skills.len());

        Ok(skills)
    }
}

// ============================================================================
// 单元测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

    /// 创建测试用的临时数据目录
    fn setup_test_dir() -> PathBuf {
        let counter = TEST_DIR_COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "mobaus_export_test_{}_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            counter
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// 写入测试用的 provider_credentials.json
    fn write_test_credentials(dir: &Path, credentials: &Value) {
        let path = dir.join("provider_credentials.json");
        fs::write(&path, serde_json::to_string_pretty(credentials).unwrap()).unwrap();
    }

    /// 写入测试用的 mcp_servers.json
    fn write_test_mcp_servers(dir: &Path, servers: &Value) {
        let path = dir.join("mcp_servers.json");
        fs::write(&path, serde_json::to_string_pretty(servers).unwrap()).unwrap();
    }

    /// TC-EXPORT-004: Provider 不存在
    #[test]
    fn test_tc_export_004_provider_not_found() {
        let dir = setup_test_dir();
        let credentials = serde_json::json!([]);
        write_test_credentials(&dir, &credentials);

        let service = ExportService::new();
        let result = service.export_provider(&dir, "non-existent", "claude-code");

        assert!(result.is_err(), "不存在的 Provider 应返回错误");
        let err = result.unwrap_err();
        assert!(
            matches!(err, ConfigExportError::ProviderNotFound(_)),
            "应返回 ProviderNotFound 错误"
        );

        let _ = fs::remove_dir_all(&dir);
    }

    /// TC-EXPORT-003: 不支持的认证类型 (OAuth)
    #[test]
    fn test_tc_export_003_oauth_unsupported() {
        let dir = setup_test_dir();
        let credentials = serde_json::json!([{
            "provider_id": "p2",
            "type": "oauth",
            "access_token": "token123",
            "created_at": "2024-01-01",
            "updated_at": "2024-01-01"
        }]);
        write_test_credentials(&dir, &credentials);

        let service = ExportService::new();
        let result = service.export_provider(&dir, "p2", "claude-code");

        assert!(result.is_err(), "OAuth Provider 应返回错误");
        let err = result.unwrap_err();
        assert!(
            matches!(err, ConfigExportError::UnsupportedAuthType(_)),
            "应返回 UnsupportedAuthType 错误"
        );

        let _ = fs::remove_dir_all(&dir);
    }

    /// TC-EXPORT-006: 导出包含 MCP 服务器
    #[test]
    fn test_tc_export_006_with_mcp_servers() {
        let dir = setup_test_dir();

        // 写入 API Key Provider
        let credentials = serde_json::json!([{
            "provider_id": "p1",
            "type": "api",
            "api_key": "sk-test-xxx",
            "created_at": "2024-01-01",
            "updated_at": "2024-01-01"
        }]);
        write_test_credentials(&dir, &credentials);

        // 写入 MCP 服务器（1个启用，1个禁用）
        let servers = serde_json::json!([
            {
                "id": "fs-server",
                "name": "Filesystem",
                "description": "文件系统服务器",
                "enabled": true,
                "auto_start": false,
                "transport_type": "stdio",
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
                "status": "disconnected",
                "capabilities": [],
                "auth_type": "none",
                "request_count": 0,
                "created_at": "2024-01-01",
                "updated_at": "2024-01-01"
            },
            {
                "id": "disabled-server",
                "name": "Disabled",
                "description": "禁用的服务器",
                "enabled": false,
                "auto_start": false,
                "transport_type": "stdio",
                "command": "echo",
                "args": ["disabled"],
                "status": "disconnected",
                "capabilities": [],
                "auth_type": "none",
                "request_count": 0,
                "created_at": "2024-01-01",
                "updated_at": "2024-01-01"
            }
        ]);
        write_test_mcp_servers(&dir, &servers);

        let service = ExportService::new();

        // 加载 MCP 服务器应只返回启用的
        let mcp = service.load_enabled_mcp_servers(&dir).unwrap();
        assert_eq!(mcp.len(), 1, "应只加载 1 个启用的 MCP 服务器");
        assert!(mcp.contains_key("fs-server"), "应包含 fs-server");
        assert!(!mcp.contains_key("disabled-server"), "不应包含禁用的服务器");

        let _ = fs::remove_dir_all(&dir);
    }

    /// TC-EXPORT-011: 批量导出部分失败
    #[test]
    #[serial]
    fn test_tc_export_011_batch_partial_failure() {
        let dir = setup_test_dir();

        // 设置测试用的 home 目录，避免污染真实配置
        std::env::set_var("TEST_HOME_DIR", dir.to_str().unwrap());

        let credentials = serde_json::json!([{
            "provider_id": "p1",
            "type": "api",
            "api_key": "sk-test-xxx",
            "created_at": "2024-01-01",
            "updated_at": "2024-01-01"
        }]);
        write_test_credentials(&dir, &credentials);

        let service = ExportService::new();
        let exports = vec![
            ExportRequest {
                provider_id: "p1".to_string(),
                tool_name: "openclaw".to_string(),
            },
            ExportRequest {
                provider_id: "non-existent".to_string(),
                tool_name: "claude-code".to_string(),
            },
            ExportRequest {
                provider_id: "p1".to_string(),
                tool_name: "invalid-tool".to_string(),
            },
        ];

        let result = service.batch_export(&dir, &exports);

        // p1 -> openclaw 应成功
        assert_eq!(result.success_count, 1, "应有 1 个成功");
        // non-existent + invalid-tool 应失败
        assert_eq!(result.failed_exports.len(), 2, "应有 2 个失败");

        // 清理环境变量
        std::env::remove_var("TEST_HOME_DIR");
        let _ = fs::remove_dir_all(&dir);
    }

    /// 获取支持的工具列表
    #[test]
    fn test_get_supported_tools() {
        let tools = ExportService::get_supported_tools();
        assert_eq!(tools.len(), 5, "应有 5 个支持的工具");

        // 验证 OpenClaw 不支持 MCP
        let openclaw = tools.iter().find(|t| t.id == "openclaw").unwrap();
        assert!(!openclaw.supports_mcp, "OpenClaw 不应支持 MCP");

        // 验证 Claude Code 配置路径
        let claude = tools.iter().find(|t| t.id == "claude-code").unwrap();
        assert!(
            claude
                .config_files
                .contains(&"~/.claude/settings.json".to_string()),
            "Claude 应包含 settings.json 路径"
        );
    }

    /// TC-EXPORT-015: 取消配置（禁用 Provider）
    #[test]
    #[serial]
    fn test_tc_export_015_disable_provider() {
        let dir = setup_test_dir();

        // 1. 先设置启用状态
        let mut state = EnabledState::default();
        state.set_enabled_provider("claude-code", "provider-1");
        state.set_enabled_provider("codex", "provider-2");
        state.save(&dir).unwrap();

        // 2. 禁用 claude-code 的配置
        ExportService::disable_provider_for_tool(&dir, "claude-code").unwrap();

        // 3. 验证状态已清除
        let loaded_state = EnabledState::load(&dir).unwrap();
        assert_eq!(
            loaded_state.enabled_providers.get("claude-code"),
            None,
            "claude-code 的启用状态应被清除"
        );
        assert_eq!(
            loaded_state.enabled_providers.get("codex"),
            Some(&"provider-2".to_string()),
            "codex 的启用状态应保持不变"
        );

        let _ = fs::remove_dir_all(&dir);
    }

    /// TC-EXPORT-016: 取消不存在的配置
    #[test]
    #[serial]
    fn test_tc_export_016_disable_nonexistent() {
        let dir = setup_test_dir();

        // 1. 设置初始状态（只有 codex 启用）
        let mut state = EnabledState::default();
        state.set_enabled_provider("codex", "provider-1");
        state.save(&dir).unwrap();

        // 2. 禁用未启用的工具（claude-code）
        let result = ExportService::disable_provider_for_tool(&dir, "claude-code");
        assert!(result.is_ok(), "禁用不存在的配置应成功返回");

        // 3. 验证状态文件不变
        let loaded_state = EnabledState::load(&dir).unwrap();
        assert_eq!(
            loaded_state.enabled_providers.get("claude-code"),
            None,
            "claude-code 应仍然为空"
        );
        assert_eq!(
            loaded_state.enabled_providers.get("codex"),
            Some(&"provider-1".to_string()),
            "codex 的启用状态应保持不变"
        );

        let _ = fs::remove_dir_all(&dir);
    }
}
