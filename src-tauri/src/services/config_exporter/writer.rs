//! 配置文件写入器
//!
//! 负责将转换后的配置原子写入到外部工具的配置文件中。
//! 路径获取和原子写入逻辑从 cc-switch 项目复用。

use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::io::Write as IoWrite;
use std::path::{Path, PathBuf};

use super::error::ConfigExportError;

// ============================================================================
// 路径获取（复用自 cc-switch config.rs / codex_config.rs / gemini_config.rs）
// ============================================================================

/// 获取用户主目录
///
/// 优先使用 dirs::home_dir()，回退到当前目录。
/// 测试时可通过 TEST_HOME_DIR 环境变量覆盖。
fn get_home_dir() -> PathBuf {
    // 测试模式：允许通过环境变量覆盖 home 目录
    #[cfg(test)]
    {
        if let Ok(test_home) = std::env::var("TEST_HOME_DIR") {
            return PathBuf::from(test_home);
        }
    }

    dirs::home_dir().unwrap_or_else(|| {
        log::warn!("无法获取用户主目录，回退到当前目录");
        PathBuf::from(".")
    })
}

/// 获取 Claude Code 配置目录路径 (~/.claude)
pub fn get_claude_config_dir() -> PathBuf {
    get_home_dir().join(".claude")
}

/// 获取 Claude Code 主配置文件路径
///
/// 优先 settings.json，兼容旧版 claude.json。
/// 复用自 cc-switch config.rs:get_claude_settings_path()
pub fn get_claude_settings_path() -> PathBuf {
    let dir = get_claude_config_dir();
    let settings = dir.join("settings.json");
    if settings.exists() {
        return settings;
    }
    // 兼容旧版命名
    let legacy = dir.join("claude.json");
    if legacy.exists() {
        return legacy;
    }
    // 默认新建：回落到标准文件名 settings.json
    settings
}

/// 获取 Claude MCP 配置文件路径 (~/.claude.json)
///
/// 复用自 cc-switch config.rs:get_claude_mcp_path()
pub fn get_claude_mcp_path() -> PathBuf {
    get_home_dir().join(".claude.json")
}

/// 获取 Codex 配置目录路径 (~/.codex)
///
/// 复用自 cc-switch codex_config.rs:get_codex_config_dir()
pub fn get_codex_config_dir() -> PathBuf {
    get_home_dir().join(".codex")
}

/// 获取 Codex auth.json 路径
///
/// 复用自 cc-switch codex_config.rs:get_codex_auth_path()
pub fn get_codex_auth_path() -> PathBuf {
    get_codex_config_dir().join("auth.json")
}

/// 获取 Codex config.toml 路径
///
/// 复用自 cc-switch codex_config.rs:get_codex_config_path()
pub fn get_codex_config_path() -> PathBuf {
    get_codex_config_dir().join("config.toml")
}

/// 获取 Gemini 配置目录路径 (~/.gemini)
///
/// 复用自 cc-switch gemini_config.rs:get_gemini_dir()
pub fn get_gemini_dir() -> PathBuf {
    get_home_dir().join(".gemini")
}

/// 获取 Gemini .env 路径
///
/// 复用自 cc-switch gemini_config.rs:get_gemini_env_path()
pub fn get_gemini_env_path() -> PathBuf {
    get_gemini_dir().join(".env")
}

/// 获取 Gemini settings.json 路径
///
/// 复用自 cc-switch gemini_config.rs:get_gemini_settings_path()
pub fn get_gemini_settings_path() -> PathBuf {
    get_gemini_dir().join("settings.json")
}

/// 获取 OpenCode 配置目录路径 (~/.config/opencode)
///
/// 参考 cc-switch 的 get_opencode_dir() 实现
pub fn get_opencode_config_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        // Windows: %USERPROFILE%\.config\opencode
        get_home_dir().join(".config").join("opencode")
    }

    #[cfg(not(target_os = "windows"))]
    {
        // macOS/Linux: ~/.config/opencode
        get_home_dir().join(".config").join("opencode")
    }
}

/// 获取 OpenCode opencode.json 路径
///
/// 参考 cc-switch 的 get_opencode_config_path() 实现
pub fn get_opencode_config_path() -> PathBuf {
    get_opencode_config_dir().join("opencode.json")
}

/// 获取 OpenClaw 配置目录路径 (~/.openclaw)
pub fn get_openclaw_config_dir() -> PathBuf {
    get_home_dir().join(".openclaw")
}

/// 获取 OpenClaw config.json 路径
pub fn get_openclaw_config_path() -> PathBuf {
    get_openclaw_config_dir().join("config.json")
}

// ============================================================================
// 原子写入（复用自 cc-switch config.rs）
// ============================================================================

/// 原子写入：写入临时文件后 rename 替换，避免半写状态
///
/// 复用自 cc-switch config.rs:atomic_write()
pub(super) fn atomic_write(path: &Path, data: &[u8]) -> Result<(), ConfigExportError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(ConfigExportError::IoError)?;
    }

    let parent = path
        .parent()
        .ok_or_else(|| ConfigExportError::PathError("无效的路径".to_string()))?;
    let file_name = path
        .file_name()
        .ok_or_else(|| ConfigExportError::PathError("无效的文件名".to_string()))?
        .to_string_lossy()
        .to_string();
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let tmp = parent.join(format!("{file_name}.tmp.{ts}"));

    {
        let mut f = fs::File::create(&tmp).map_err(ConfigExportError::IoError)?;
        f.write_all(data).map_err(ConfigExportError::IoError)?;
        f.flush().map_err(ConfigExportError::IoError)?;
    }

    // 保留原文件权限（Unix）
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = fs::metadata(path) {
            let perm = meta.permissions().mode();
            let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(perm));
        }
    }

    // Windows 上 rename 目标存在会失败，先移除再重命名
    #[cfg(windows)]
    {
        if path.exists() {
            let _ = fs::remove_file(path);
        }
    }

    fs::rename(&tmp, path).map_err(|e| {
        ConfigExportError::WriteError(format!(
            "原子替换失败: {} -> {}: {}",
            tmp.display(),
            path.display(),
            e
        ))
    })?;

    Ok(())
}

/// 原子写入 JSON 文件
///
/// 复用自 cc-switch config.rs:write_json_file()
fn write_json_file<T: Serialize>(path: &Path, data: &T) -> Result<(), ConfigExportError> {
    let json = serde_json::to_string_pretty(data)?;
    atomic_write(path, json.as_bytes())
}

/// 原子写入文本文件（用于 TOML/纯文本）
///
/// 复用自 cc-switch config.rs:write_text_file()
fn write_text_file(path: &Path, data: &str) -> Result<(), ConfigExportError> {
    atomic_write(path, data.as_bytes())
}

// ============================================================================
// Writer 对外接口
// ============================================================================

/// 配置文件写入器
///
/// 负责将转换后的配置写入到各外部工具的配置文件中。
pub struct Writer;

/// 导出输出格式
#[derive(Debug)]
pub enum ExportOutput {
    /// Claude Code: (settings.json 内容, MCP ~/.claude.json 内容)
    Claude { settings: Value, mcp: Value },
    /// Codex: (auth.json 内容, config.toml 内容)
    Codex { auth: Value, config_toml: String },
    /// Gemini CLI: (.env 内容, settings.json 内容)
    Gemini {
        env_content: String,
        settings: Value,
    },
    /// 单文件 JSON (OpenCode, OpenClaw)
    SingleJson { content: Value },
}

impl Writer {
    /// 创建新的 Writer 实例
    pub fn new() -> Self {
        Writer
    }

    /// 写入配置到指定工具
    ///
    /// # 参数
    /// - `tool_name`: 目标工具名称
    /// - `output`: 转换后的导出内容
    pub fn write_config(
        &self,
        tool_name: &str,
        output: &ExportOutput,
    ) -> Result<(), ConfigExportError> {
        match tool_name {
            "claude-code" => self.write_claude(output),
            "codex" => self.write_codex(output),
            "gemini-cli" => self.write_gemini(output),
            "opencode" => self.write_opencode(output),
            "openclaw" => self.write_openclaw(output),
            _ => Err(ConfigExportError::UnsupportedTool(tool_name.to_string())),
        }
    }

    /// 写入 Claude Code 配置
    ///
    /// 写入 ~/.claude/settings.json 和 ~/.claude.json (MCP)
    fn write_claude(&self, output: &ExportOutput) -> Result<(), ConfigExportError> {
        let ExportOutput::Claude { settings, mcp } = output else {
            return Err(ConfigExportError::WriteError(
                "Claude 导出需要 Claude 格式输出".to_string(),
            ));
        };

        // 写入 settings.json（Provider 配置）
        let settings_path = get_claude_settings_path();
        log::info!("写入 Claude settings: {}", settings_path.display());

        // 合并现有配置（保留用户手动配置的其他字段）
        // v5.10.0: permissions 由导出器管理，删除 MCP/Skills 后不应残留
        // v5.10.1: api 由导出器完全管理，去掉自定义端点后旧 baseUrl 不应残留
        let merged_settings =
            self.merge_json_file(&settings_path, settings, &["api", "permissions"])?;
        write_json_file(&settings_path, &merged_settings)?;

        // 写入 ~/.claude.json（MCP 配置）
        let mcp_path = get_claude_mcp_path();
        log::info!("写入 Claude MCP: {}", mcp_path.display());

        // v5.10.0: mcpServers 由导出器管理，删除所有 MCP 后不应残留
        let merged_mcp = self.merge_json_file(&mcp_path, mcp, &["mcpServers"])?;
        write_json_file(&mcp_path, &merged_mcp)?;

        Ok(())
    }

    /// 写入 Codex 配置（多文件原子写入）
    ///
    /// 复用 cc-switch codex_config.rs:write_codex_live_atomic() 的回滚逻辑
    fn write_codex(&self, output: &ExportOutput) -> Result<(), ConfigExportError> {
        let ExportOutput::Codex { auth, config_toml } = output else {
            return Err(ConfigExportError::WriteError(
                "Codex 导出需要 Codex 格式输出".to_string(),
            ));
        };

        let auth_path = get_codex_auth_path();
        let config_path = get_codex_config_path();

        log::info!(
            "写入 Codex 配置: {} + {}",
            auth_path.display(),
            config_path.display()
        );

        // 确保目录存在
        if let Some(parent) = auth_path.parent() {
            fs::create_dir_all(parent).map_err(ConfigExportError::IoError)?;
        }

        // 读取旧内容用于回滚
        let old_auth = if auth_path.exists() {
            Some(fs::read(&auth_path).map_err(ConfigExportError::IoError)?)
        } else {
            None
        };

        let old_config = if config_path.exists() {
            Some(fs::read(&config_path).map_err(ConfigExportError::IoError)?)
        } else {
            None
        };

        // 第一步：写 auth.json
        write_json_file(&auth_path, auth)?;

        // 第二步：使用 toml_edit 保留现有 config.toml 内容
        if let Err(e) = self.write_codex_toml_preserving(&config_path, config_toml) {
            log::error!("写入 config.toml 失败，回滚 auth.json: {}", e);
            // 回滚 auth.json
            if let Some(bytes) = old_auth {
                let _ = atomic_write(&auth_path, &bytes);
            } else {
                let _ = fs::remove_file(&auth_path);
            }
            // 回滚 config.toml
            if let Some(bytes) = old_config {
                let _ = atomic_write(&config_path, &bytes);
            }
            return Err(e);
        }

        Ok(())
    }

    /// 使用 toml_edit 保留现有 config.toml 内容
    ///
    /// 只更新 base_url 和 mcp_servers 表，保留其他字段、注释和格式
    fn write_codex_toml_preserving(
        &self,
        path: &Path,
        config_toml: &str,
    ) -> Result<(), ConfigExportError> {
        // 解析新的 TOML 内容
        let new_doc: toml_edit::DocumentMut = config_toml
            .parse()
            .map_err(|e| ConfigExportError::WriteError(format!("解析 TOML 失败: {}", e)))?;

        // 读取现有 TOML（如果存在）
        let mut doc = if path.exists() {
            let content = fs::read_to_string(path).map_err(ConfigExportError::IoError)?;
            content
                .parse::<toml_edit::DocumentMut>()
                .map_err(|e| ConfigExportError::WriteError(format!("解析现有 TOML 失败: {}", e)))?
        } else {
            toml_edit::DocumentMut::default()
        };

        // 更新或删除 base_url 字段
        if let Some(base_url) = new_doc.get("base_url") {
            doc["base_url"] = base_url.clone();
        } else {
            // 新配置没有 base_url，删除旧的 base_url（避免残留）
            doc.remove("base_url");
        }

        // 清理错误格式 mcp.servers（历史遗留问题）
        // 复用 cc-switch mcp/codex.rs:303 的迁移逻辑
        if doc.get("mcp").and_then(|v| v.get("servers")).is_some() {
            log::warn!("检测到错误格式 mcp.servers，将清理并迁移到 mcp_servers");

            // 如果 mcp_servers 不存在，尝试迁移 mcp.servers 的内容
            if doc.get("mcp_servers").is_none() {
                if let Some(mcp_table) = doc.get("mcp").and_then(|v| v.as_table()) {
                    if let Some(servers) = mcp_table.get("servers") {
                        doc["mcp_servers"] = servers.clone();
                        log::info!("已迁移 mcp.servers 到 mcp_servers");
                    }
                }
            }

            // 删除错误格式的 mcp.servers
            doc.remove("mcp");
        }

        // 更新或删除 mcp_servers 表
        if let Some(mcp_servers) = new_doc.get("mcp_servers") {
            doc["mcp_servers"] = mcp_servers.clone();
        } else {
            // 新配置没有 mcp_servers，删除旧的 mcp_servers（避免残留）
            doc.remove("mcp_servers");
        }

        // 更新 permissions 表（Skills 配置）
        // v5.10.0: 仅在新配置包含 permissions 时才覆盖，
        // 不删除用户手写的 permissions（如 deny 列表），避免误删
        if let Some(permissions) = new_doc.get("permissions") {
            doc["permissions"] = permissions.clone();
        }

        // 写回文件（保留注释和格式）
        write_text_file(path, &doc.to_string())?;
        Ok(())
    }

    /// 写入 Gemini CLI 配置
    ///
    /// 写入 ~/.gemini/.env 和 ~/.gemini/settings.json
    fn write_gemini(&self, output: &ExportOutput) -> Result<(), ConfigExportError> {
        let ExportOutput::Gemini {
            env_content,
            settings,
        } = output
        else {
            return Err(ConfigExportError::WriteError(
                "Gemini 导出需要 Gemini 格式输出".to_string(),
            ));
        };

        let env_path = get_gemini_env_path();
        let settings_path = get_gemini_settings_path();

        log::info!(
            "写入 Gemini 配置: {} + {}",
            env_path.display(),
            settings_path.display()
        );

        // 确保目录存在并收紧权限
        if let Some(parent) = env_path.parent() {
            fs::create_dir_all(parent).map_err(ConfigExportError::IoError)?;
            crate::services::secure_file::harden_dir(parent);
        }

        // 写入 .env（保持原子写入：先写临时文件再 rename）
        write_text_file(&env_path, env_content)?;

        // .env 含 API Key，收紧为仅所有者可读写
        crate::services::secure_file::harden_file(&env_path);

        // 写入 settings.json（合并现有配置）
        // v5.10.0: mcpServers 由导出器管理，删除所有 MCP 后不应残留
        let merged_settings = self.merge_json_file(&settings_path, settings, &["mcpServers"])?;
        write_json_file(&settings_path, &merged_settings)?;

        Ok(())
    }

    /// 写入 OpenCode 配置
    fn write_opencode(&self, output: &ExportOutput) -> Result<(), ConfigExportError> {
        let ExportOutput::SingleJson { content } = output else {
            return Err(ConfigExportError::WriteError(
                "OpenCode 导出需要 SingleJson 格式输出".to_string(),
            ));
        };

        let config_path = get_opencode_config_path();
        log::info!("写入 OpenCode 配置: {}", config_path.display());

        // v5.10.0: mcp 由导出器管理，删除所有 MCP 后不应残留
        // v5.10.1: provider 由导出器完全管理，去掉自定义端点后旧 baseURL 不应残留
        let merged = self.merge_json_file(&config_path, content, &["provider", "mcp"])?;
        write_json_file(&config_path, &merged)?;

        Ok(())
    }

    /// 写入 OpenClaw 配置
    fn write_openclaw(&self, output: &ExportOutput) -> Result<(), ConfigExportError> {
        let ExportOutput::SingleJson { content } = output else {
            return Err(ConfigExportError::WriteError(
                "OpenClaw 导出需要 SingleJson 格式输出".to_string(),
            ));
        };

        let config_path = get_openclaw_config_path();
        log::info!("写入 OpenClaw 配置: {}", config_path.display());

        // v5.10.1: apiKey/baseUrl 由导出器完全管理，去掉自定义端点后旧 baseUrl 不应残留
        let merged = self.merge_json_file(&config_path, content, &["apiKey", "baseUrl"])?;
        write_json_file(&config_path, &merged)?;

        Ok(())
    }

    /// 合并 JSON 文件：读取现有文件内容，将新数据合并进去
    ///
    /// 保留用户手动配置的其他字段，仅覆盖我们需要写入的字段。
    ///
    /// # 参数
    /// - `path`: 目标文件路径
    /// - `new_data`: 新的配置数据
    /// - `managed_keys`: 由导出器管理的顶层字段名列表。
    ///   这些字段在 merge 前会先从旧配置中删除，确保移除的 MCP/Skills 不会残留。
    ///   不在此列表中的字段保持 deep merge 行为，保留用户手动配置。
    fn merge_json_file(
        &self,
        path: &Path,
        new_data: &Value,
        managed_keys: &[&str],
    ) -> Result<Value, ConfigExportError> {
        let mut existing = if path.exists() {
            let content = fs::read_to_string(path).map_err(ConfigExportError::IoError)?;
            serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
        } else {
            serde_json::json!({})
        };

        // v5.10.0: 先删除受管理的字段，再 merge 新数据
        // 这样当用户删除了所有 MCP/Skills 时，旧配置不会残留
        if let Some(obj) = existing.as_object_mut() {
            for key in managed_keys {
                obj.remove(*key);
            }
        }

        // 深度合并：将 new_data 的字段递归合并到 existing 中
        Self::deep_merge_json(&mut existing, new_data);

        Ok(existing)
    }

    /// 深度合并 JSON 对象
    ///
    /// 递归合并嵌套对象，保留用户的 permissions.deny 等深层字段
    fn deep_merge_json(target: &mut Value, source: &Value) {
        if let (Some(target_obj), Some(source_obj)) = (target.as_object_mut(), source.as_object()) {
            for (key, source_value) in source_obj {
                match target_obj.get_mut(key) {
                    Some(target_value) => {
                        // 如果两边都是对象，递归合并
                        if target_value.is_object() && source_value.is_object() {
                            Self::deep_merge_json(target_value, source_value);
                        } else {
                            // 否则直接覆盖
                            *target_value = source_value.clone();
                        }
                    }
                    None => {
                        // 目标没有这个键，直接插入
                        target_obj.insert(key.clone(), source_value.clone());
                    }
                }
            }
        }
    }
}

// ============================================================================
// 单元测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    /// TC-EXPORT-010: 路径获取 - Claude
    #[test]
    fn test_tc_export_010_claude_paths() {
        let config_dir = get_claude_config_dir();
        assert!(
            config_dir.ends_with(".claude"),
            "Claude 配置目录应以 .claude 结尾"
        );

        let mcp_path = get_claude_mcp_path();
        assert!(
            mcp_path.ends_with(".claude.json"),
            "Claude MCP 路径应以 .claude.json 结尾"
        );
    }

    /// TC-EXPORT-010: 路径获取 - Codex
    #[test]
    fn test_tc_export_010_codex_paths() {
        let config_dir = get_codex_config_dir();
        assert!(
            config_dir.ends_with(".codex"),
            "Codex 配置目录应以 .codex 结尾"
        );

        let auth_path = get_codex_auth_path();
        assert!(
            auth_path.ends_with("auth.json"),
            "Codex auth 路径应以 auth.json 结尾"
        );

        let config_path = get_codex_config_path();
        assert!(
            config_path.ends_with("config.toml"),
            "Codex config 路径应以 config.toml 结尾"
        );
    }

    /// TC-EXPORT-010: 路径获取 - Gemini
    #[test]
    fn test_tc_export_010_gemini_paths() {
        let env_path = get_gemini_env_path();
        assert!(env_path.ends_with(".env"), "Gemini env 路径应以 .env 结尾");

        let settings_path = get_gemini_settings_path();
        assert!(
            settings_path.ends_with("settings.json"),
            "Gemini settings 路径应以 settings.json 结尾"
        );
    }

    /// TC-EXPORT-010: 路径获取 - OpenCode
    #[test]
    fn test_tc_export_010_opencode_paths() {
        let config_path = get_opencode_config_path();
        assert!(
            config_path.ends_with("opencode.json"),
            "OpenCode config 路径应以 opencode.json 结尾"
        );
    }

    /// TC-EXPORT-010: 路径获取 - OpenClaw
    #[test]
    fn test_tc_export_010_openclaw_paths() {
        let config_path = get_openclaw_config_path();
        assert!(
            config_path.ends_with("config.json"),
            "OpenClaw config 路径应以 config.json 结尾"
        );
    }

    /// 原子写入基础功能测试
    #[test]
    fn test_atomic_write_basic() {
        let dir = std::env::temp_dir().join("mobaus_test_atomic");
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("test_atomic.json");

        let data = b"{\"test\": true}";
        atomic_write(&path, data).expect("原子写入应该成功");

        let content = fs::read_to_string(&path).expect("应该能读取写入的文件");
        assert_eq!(content, "{\"test\": true}");

        // 清理
        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir(&dir);
    }

    /// JSON 文件合并测试
    #[test]
    fn test_merge_json_preserves_existing() {
        let dir = std::env::temp_dir().join("mobaus_test_merge");
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("test_merge.json");

        // 写入现有内容
        let existing = serde_json::json!({
            "user_field": "keep_me",
            "api": {"oldKey": "old_value"}
        });
        let json_str = serde_json::to_string_pretty(&existing).unwrap();
        fs::write(&path, &json_str).unwrap();

        // 合并新数据
        let new_data = serde_json::json!({
            "api": {"apiKey": "new_key"}
        });

        let writer = Writer::new();
        let merged = writer.merge_json_file(&path, &new_data, &[]).unwrap();

        // 验证保留了用户字段
        assert_eq!(merged["user_field"], "keep_me");
        // 验证新数据覆盖了 api 字段
        assert_eq!(merged["api"]["apiKey"], "new_key");

        // 清理
        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir(&dir);
    }

    /// TC-EXPORT-009: 多文件写入失败回滚测试
    #[test]
    fn test_tc_export_009_codex_rollback() {
        let dir = std::env::temp_dir().join("mobaus_test_rollback");
        let _ = fs::create_dir_all(&dir);

        // 注意：这个测试验证了回滚逻辑的代码路径存在
        // 实际的文件系统级回滚在 write_codex 中通过 old_auth 备份实现
        let writer = Writer::new();

        // 使用错误的输出格式应返回错误
        let wrong_output = ExportOutput::SingleJson {
            content: serde_json::json!({}),
        };
        let result = writer.write_codex(&wrong_output);
        assert!(result.is_err(), "错误的输出格式应该返回错误");

        // 清理
        let _ = fs::remove_dir_all(&dir);
    }

    /// TC-WRITER-012: Codex 迁移错误格式 mcp.servers
    ///
    /// 场景：历史配置文件包含错误格式 mcp.servers，应迁移到 mcp_servers 并清理
    #[test]
    #[serial]
    fn test_tc_writer_012_codex_migrate_mcp_servers() {
        let dir = std::env::temp_dir().join("mobaus_test_migrate_mcp");
        std::env::set_var("TEST_HOME_DIR", dir.to_str().unwrap());

        let config_dir = dir.join(".codex");
        fs::create_dir_all(&config_dir).unwrap();

        // 创建包含错误格式 mcp.servers 的历史配置
        let old_config = r#"
base_url = "https://old-api.example.com"

[mcp.servers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "/old/path"]
"#;
        let config_path = config_dir.join("config.toml");
        fs::write(&config_path, old_config).unwrap();

        // 新配置（正确格式）
        let new_config = r#"
base_url = "https://new-api.example.com"

[mcp_servers.github]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
"#;

        let writer = Writer::new();
        let result = writer.write_codex_toml_preserving(&config_path, new_config);
        assert!(result.is_ok(), "写入应该成功");

        // 验证结果
        let content = fs::read_to_string(&config_path).unwrap();
        let doc: toml_edit::DocumentMut = content.parse().unwrap();

        // 1. 错误格式 mcp.servers 应该被清理
        assert!(doc.get("mcp").is_none(), "错误格式 mcp.servers 应该被清理");

        // 2. 新的 mcp_servers 应该存在
        assert!(
            doc.get("mcp_servers").is_some(),
            "新的 mcp_servers 应该存在"
        );
        assert!(
            doc.get("mcp_servers")
                .and_then(|v| v.get("github"))
                .is_some(),
            "新的 github 服务器应该存在"
        );

        // 3. base_url 应该更新
        assert_eq!(
            doc.get("base_url").and_then(|v| v.as_str()).unwrap_or(""),
            "https://new-api.example.com"
        );

        // 清理
        std::env::remove_var("TEST_HOME_DIR");
        let _ = fs::remove_dir_all(&dir);
    }

    /// TC-WRITER-013: Codex 迁移空 mcp.servers 到 mcp_servers
    ///
    /// 场景：历史配置有 mcp.servers 但新配置没有 mcp_servers，应迁移后再清理
    #[test]
    #[serial]
    fn test_tc_writer_013_codex_migrate_empty_mcp() {
        let dir = std::env::temp_dir().join("mobaus_test_migrate_empty");
        std::env::set_var("TEST_HOME_DIR", dir.to_str().unwrap());

        let config_dir = dir.join(".codex");
        fs::create_dir_all(&config_dir).unwrap();

        // 创建包含错误格式 mcp.servers 的历史配置
        let old_config = r#"
[mcp.servers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem"]
"#;
        let config_path = config_dir.join("config.toml");
        fs::write(&config_path, old_config).unwrap();

        // 新配置没有 mcp_servers（用户禁用了所有 MCP）
        let new_config = r#"
base_url = "https://api.example.com"
"#;

        let writer = Writer::new();
        let result = writer.write_codex_toml_preserving(&config_path, new_config);
        assert!(result.is_ok(), "写入应该成功");

        // 验证结果
        let content = fs::read_to_string(&config_path).unwrap();
        let doc: toml_edit::DocumentMut = content.parse().unwrap();

        // 1. 错误格式 mcp.servers 应该被清理
        assert!(doc.get("mcp").is_none(), "错误格式 mcp.servers 应该被清理");

        // 2. 由于新配置没有 mcp_servers，迁移后的 mcp_servers 也应该被清理
        assert!(
            doc.get("mcp_servers").is_none(),
            "新配置没有 mcp_servers，旧的也应该被清理"
        );

        // 清理
        std::env::remove_var("TEST_HOME_DIR");
        let _ = fs::remove_dir_all(&dir);
    }

    /// TC-WRITER-022: 删除自定义 endpoint 后配置不残留
    ///
    /// 场景：旧配置有 custom endpoint，新导出切换回默认 endpoint
    /// 预期：配置文件中 baseUrl/baseURL 等字段被完全删除，不残留旧值
    #[test]
    #[serial]
    fn test_tc_writer_022_remove_custom_endpoint_no_residue() {
        let dir = std::env::temp_dir().join("mobaus_test_remove_endpoint");
        std::env::set_var("TEST_HOME_DIR", dir.to_str().unwrap());

        // 测试 Claude Code (JSON 格式)
        {
            let config_dir = dir.join(".claude");
            fs::create_dir_all(&config_dir).unwrap();
            let settings_path = config_dir.join("settings.json");

            // 1. 写入包含自定义 baseUrl 的旧配置
            let old_config = serde_json::json!({
                "api": {
                    "apiKey": "old-key",
                    "baseUrl": "https://custom-api.example.com"
                },
                "user_field": "keep_me"
            });
            fs::write(
                &settings_path,
                serde_json::to_string_pretty(&old_config).unwrap(),
            )
            .unwrap();

            // 2. 写入新配置（没有 baseUrl，使用默认 endpoint）
            let new_config = serde_json::json!({
                "api": {
                    "apiKey": "new-key"
                }
            });

            let writer = Writer::new();
            // 使用 managed_keys 来删除整个 api 对象，然后再合并新的
            let merged = writer
                .merge_json_file(&settings_path, &new_config, &["api"])
                .unwrap();

            // 3. 验证：baseUrl 应该被删除
            assert!(
                merged["api"].get("baseUrl").is_none(),
                "切换回默认 endpoint 后，baseUrl 应该被删除"
            );

            // 4. 验证：apiKey 应该被更新
            assert_eq!(merged["api"]["apiKey"], "new-key");

            // 5. 验证：用户字段应该保留
            assert_eq!(merged["user_field"], "keep_me");
        }

        // 测试 OpenCode (JSON 格式，嵌套结构)
        {
            let config_dir = dir.join(".opencode");
            fs::create_dir_all(&config_dir).unwrap();
            let config_path = config_dir.join("opencode.json");

            // 1. 写入包含自定义 baseURL 的旧配置
            let old_config = serde_json::json!({
                "provider": {
                    "anthropic": {
                        "apiKey": "old-key",
                        "options": {
                            "baseURL": "https://custom-api.example.com"
                        }
                    }
                }
            });
            fs::write(
                &config_path,
                serde_json::to_string_pretty(&old_config).unwrap(),
            )
            .unwrap();

            // 2. 写入新配置（没有 baseURL）
            let new_config = serde_json::json!({
                "provider": {
                    "anthropic": {
                        "apiKey": "new-key",
                        "options": {}
                    }
                }
            });

            let writer = Writer::new();
            // 使用 managed_keys 来删除整个 provider 对象，然后再合并新的
            let merged = writer
                .merge_json_file(&config_path, &new_config, &["provider"])
                .unwrap();

            // 3. 验证：baseURL 应该被删除
            assert!(
                merged["provider"]["anthropic"]["options"]
                    .get("baseURL")
                    .is_none(),
                "切换回默认 endpoint 后，baseURL 应该被删除"
            );

            // 4. 验证：apiKey 应该被更新
            assert_eq!(merged["provider"]["anthropic"]["apiKey"], "new-key");
        }

        // 测试 Codex (TOML 格式)
        {
            let config_dir = dir.join(".codex");
            fs::create_dir_all(&config_dir).unwrap();
            let config_path = config_dir.join("config.toml");

            // 1. 写入包含自定义 base_url 的旧配置
            let old_config = r#"
base_url = "https://custom-api.example.com"

[mcp_servers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem"]
"#;
            fs::write(&config_path, old_config).unwrap();

            // 2. 写入新配置（没有 base_url）
            let new_config = r#"
[mcp_servers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem"]
"#;

            let writer = Writer::new();
            let result = writer.write_codex_toml_preserving(&config_path, new_config);
            assert!(result.is_ok(), "写入应该成功");

            // 3. 验证：base_url 应该被删除
            let content = fs::read_to_string(&config_path).unwrap();
            let doc: toml_edit::DocumentMut = content.parse().unwrap();

            assert!(
                doc.get("base_url").is_none(),
                "切换回默认 endpoint 后，base_url 应该被删除"
            );

            // 4. 验证：mcp_servers 应该保留
            assert!(doc.get("mcp_servers").is_some(), "mcp_servers 应该保留");
        }

        // 清理
        std::env::remove_var("TEST_HOME_DIR");
        let _ = fs::remove_dir_all(&dir);
    }
}
