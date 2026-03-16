//! 工具启用状态管理
//!
//! 记录每个外部工具当前启用的 Provider ID

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use super::error::ConfigExportError;
use super::writer::atomic_write;

/// 工具启用状态
///
/// 记录每个工具当前启用的 Provider ID
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EnabledState {
    /// 工具名 -> Provider ID 映射
    pub enabled_providers: HashMap<String, String>,
}

impl EnabledState {
    /// 从文件加载启用状态
    pub fn load(data_dir: &Path) -> Result<Self, ConfigExportError> {
        let path = Self::state_file_path(data_dir);

        if !path.exists() {
            log::info!("[EnabledState] 状态文件不存在，返回默认状态");
            return Ok(Self::default());
        }

        let content = fs::read_to_string(&path).map_err(ConfigExportError::IoError)?;
        let state: Self = serde_json::from_str(&content)?;

        log::info!(
            "[EnabledState] 加载启用状态: {} 个工具",
            state.enabled_providers.len()
        );

        Ok(state)
    }

    /// 保存启用状态到文件（原子写入）
    pub fn save(&self, data_dir: &Path) -> Result<(), ConfigExportError> {
        let path = Self::state_file_path(data_dir);
        let content = serde_json::to_string_pretty(self)?;

        // 使用原子写入：写入临时文件后 rename 替换，避免半写状态
        atomic_write(&path, content.as_bytes())?;

        log::info!(
            "[EnabledState] 保存启用状态: {} 个工具",
            self.enabled_providers.len()
        );

        Ok(())
    }

    /// 设置工具的启用 Provider
    pub fn set_enabled_provider(&mut self, tool_name: &str, provider_id: &str) {
        self.enabled_providers
            .insert(tool_name.to_string(), provider_id.to_string());
        log::info!(
            "[EnabledState] 设置启用状态: tool={}, provider={}",
            tool_name,
            provider_id
        );
    }

    /// 清除工具的启用状态
    pub fn clear_enabled_provider(&mut self, tool_name: &str) {
        self.enabled_providers.remove(tool_name);
        log::info!("[EnabledState] 清除启用状态: tool={}", tool_name);
    }

    /// 清理不存在的 Provider 的启用状态
    ///
    /// 当 Provider 被删除或断开时，清理所有工具中对该 Provider 的启用状态
    pub fn cleanup_deleted_providers(&mut self, valid_provider_ids: &[String]) -> usize {
        let mut removed_count = 0;

        // 收集需要清理的工具名
        let tools_to_clear: Vec<String> = self
            .enabled_providers
            .iter()
            .filter(|(_, provider_id)| !valid_provider_ids.contains(provider_id))
            .map(|(tool_name, _)| tool_name.clone())
            .collect();

        // 清理不存在的 Provider
        for tool_name in tools_to_clear {
            if let Some(removed_provider_id) = self.enabled_providers.remove(&tool_name) {
                removed_count += 1;
                log::info!(
                    "[EnabledState] 清理已删除的 Provider: tool={}, provider={}",
                    tool_name,
                    removed_provider_id
                );
            }
        }

        if removed_count > 0 {
            log::info!(
                "[EnabledState] 清理完成: 移除 {} 个已删除 Provider 的启用状态",
                removed_count
            );
        }

        removed_count
    }

    /// 获取状态文件路径
    fn state_file_path(data_dir: &Path) -> PathBuf {
        data_dir.join("tool_enabled_state.json")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn setup_test_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mobaus_enabled_state_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_load_nonexistent_file() {
        let dir = setup_test_dir();
        let state = EnabledState::load(&dir).unwrap();
        assert_eq!(state.enabled_providers.len(), 0);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_save_and_load() {
        let dir = setup_test_dir();

        let mut state = EnabledState::default();
        state.set_enabled_provider("claude-code", "provider-1");
        state.set_enabled_provider("codex", "provider-2");

        state.save(&dir).unwrap();

        let loaded = EnabledState::load(&dir).unwrap();
        assert_eq!(
            loaded.enabled_providers.get("claude-code"),
            Some(&"provider-1".to_string())
        );
        assert_eq!(
            loaded.enabled_providers.get("codex"),
            Some(&"provider-2".to_string())
        );
        assert_eq!(loaded.enabled_providers.get("gemini-cli"), None);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_clear_enabled_provider() {
        let dir = setup_test_dir();

        let mut state = EnabledState::default();
        state.set_enabled_provider("claude-code", "provider-1");
        state.clear_enabled_provider("claude-code");

        assert_eq!(state.enabled_providers.get("claude-code"), None);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_get_all_enabled_providers() {
        let dir = setup_test_dir();

        let mut state = EnabledState::default();
        state.set_enabled_provider("claude-code", "provider-1");

        // 直接访问 enabled_providers 字段
        assert_eq!(state.enabled_providers.len(), 1);
        assert_eq!(
            state.enabled_providers.get("claude-code"),
            Some(&"provider-1".to_string())
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_cleanup_deleted_providers() {
        let dir = setup_test_dir();

        let mut state = EnabledState::default();
        state.set_enabled_provider("claude-code", "provider-1");
        state.set_enabled_provider("codex", "provider-2");
        state.set_enabled_provider("gemini-cli", "provider-3");

        // 清理已删除的 Provider（只保留 provider-1 和 provider-3）
        let valid_providers = vec!["provider-1".to_string(), "provider-3".to_string()];
        let removed_count = state.cleanup_deleted_providers(&valid_providers);

        // 验证清理结果
        assert_eq!(removed_count, 1); // 移除了 provider-2
        assert_eq!(
            state.enabled_providers.get("claude-code"),
            Some(&"provider-1".to_string())
        );
        assert_eq!(state.enabled_providers.get("codex"), None); // provider-2 已清理
        assert_eq!(
            state.enabled_providers.get("gemini-cli"),
            Some(&"provider-3".to_string())
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_cleanup_all_deleted_providers() {
        let dir = setup_test_dir();

        let mut state = EnabledState::default();
        state.set_enabled_provider("claude-code", "provider-1");
        state.set_enabled_provider("codex", "provider-2");

        // 清理所有 Provider（空列表）
        let valid_providers: Vec<String> = vec![];
        let removed_count = state.cleanup_deleted_providers(&valid_providers);

        // 验证清理结果
        assert_eq!(removed_count, 2); // 移除了所有 Provider
        assert_eq!(state.enabled_providers.len(), 0);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_cleanup_no_deleted_providers() {
        let dir = setup_test_dir();

        let mut state = EnabledState::default();
        state.set_enabled_provider("claude-code", "provider-1");
        state.set_enabled_provider("codex", "provider-2");

        // 所有 Provider 都存在
        let valid_providers = vec!["provider-1".to_string(), "provider-2".to_string()];
        let removed_count = state.cleanup_deleted_providers(&valid_providers);

        // 验证清理结果
        assert_eq!(removed_count, 0); // 没有移除任何 Provider
        assert_eq!(state.enabled_providers.len(), 2);

        let _ = fs::remove_dir_all(&dir);
    }
}
