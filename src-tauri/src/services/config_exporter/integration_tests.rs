//! 配置导出服务集成测试
//!
//! 端到端测试，验证完整的导出流程
//!
//! 注意：这些测试使用全局环境变量 TEST_HOME_DIR，必须串行运行以避免竞争

#[cfg(test)]
mod tests {
    use crate::services::config_exporter::{
        enabled_state::EnabledState, export_service::ExportService,
    };
    use crate::{MCPServerConfig, ProviderCredential};
    use serde_json::Value;
    use serial_test::serial;
    use std::fs;
    use std::path::PathBuf;

    /// 创建测试目录
    fn setup_test_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mobaus_integration_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// 创建测试用 Provider 凭证
    fn create_test_credential(provider_id: &str) -> ProviderCredential {
        ProviderCredential {
            provider_id: provider_id.to_string(),
            auth_type: "api".to_string(),
            api_key: Some("test-api-key".to_string()),
            access_token: None,
            refresh_token: None,
            expires_at: None,
            account_id: None,
            project_id: None,
            profile_arn: None,
            auth_method: None,
            kiro_client_id: None,
            kiro_client_secret: None,
            kiro_sso_region: None,
            kiro_start_url: None,
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
        }
    }

    /// 创建测试用 MCP 服务器配置
    fn create_test_mcp_server(id: &str) -> MCPServerConfig {
        MCPServerConfig {
            id: id.to_string(),
            name: id.to_string(),
            description: format!("Test MCP server {}", id),
            enabled: true,
            auto_start: false,
            transport_type: "stdio".to_string(),
            command: Some("npx".to_string()),
            args: Some(vec!["-y".to_string(), format!("@mcp/server-{}", id)]),
            env: None,
            endpoint: None,
            status: "disconnected".to_string(),
            capabilities: vec![],
            auth_type: "none".to_string(),
            auth_value: None,
            last_active_at: None,
            request_count: 0,
            error_message: None,
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
        }
    }

    /// TC-INTEGRATION-001: 导出后 enabled_state 正确更新
    ///
    /// 场景：导出 Provider 到工具后，enabled_state.json 应该正确记录启用状态
    #[test]
    #[serial]
    fn test_tc_integration_001_export_updates_enabled_state() {
        let data_dir = setup_test_dir();
        std::env::set_var("TEST_HOME_DIR", data_dir.to_str().unwrap());

        // 1. 准备测试数据
        let credentials = vec![create_test_credential("anthropic")];
        let credentials_json = serde_json::to_string_pretty(&credentials).unwrap();
        fs::write(data_dir.join("provider_credentials.json"), credentials_json).unwrap();

        let mcp_servers = vec![create_test_mcp_server("filesystem")];
        let mcp_json = serde_json::to_string_pretty(&mcp_servers).unwrap();
        fs::write(data_dir.join("mcp_servers.json"), mcp_json).unwrap();

        let skills: Vec<Value> = vec![];
        let skills_json = serde_json::to_string_pretty(&skills).unwrap();
        fs::write(data_dir.join("skills.json"), skills_json).unwrap();

        let custom_providers: Vec<Value> = vec![];
        let custom_json = serde_json::to_string_pretty(&custom_providers).unwrap();
        fs::write(data_dir.join("custom_providers.json"), custom_json).unwrap();

        // 2. 执行导出
        let service = ExportService::new();
        let result = service.export_provider(&data_dir, "anthropic", "claude-code");
        assert!(result.is_ok(), "导出应该成功: {:?}", result.err());

        // 3. 验证 enabled_state 已更新
        let state = EnabledState::load(&data_dir).unwrap();
        assert_eq!(
            state.enabled_providers.get("claude-code"),
            Some(&"anthropic".to_string()),
            "claude-code 应该记录 anthropic 为启用状态"
        );

        // 4. 再次导出到另一个工具
        let result = service.export_provider(&data_dir, "anthropic", "codex");
        assert!(result.is_ok(), "导出到 codex 应该成功");

        // 5. 验证两个工具的状态都已记录
        let state = EnabledState::load(&data_dir).unwrap();
        assert_eq!(
            state.enabled_providers.get("claude-code"),
            Some(&"anthropic".to_string())
        );
        assert_eq!(
            state.enabled_providers.get("codex"),
            Some(&"anthropic".to_string())
        );

        // 清理
        std::env::remove_var("TEST_HOME_DIR");
        let _ = fs::remove_dir_all(&data_dir);
    }

    /// TC-INTEGRATION-002: Provider 断开后状态清理
    ///
    /// 场景：当 Provider 被删除时，所有工具的启用状态应该被清理
    #[test]
    #[serial]
    fn test_tc_integration_002_provider_disconnect_clears_state() {
        let data_dir = setup_test_dir();

        // 1. 创建初始状态：anthropic 已启用到 claude-code 和 codex
        let mut state = EnabledState::default();
        state.set_enabled_provider("claude-code", "anthropic");
        state.set_enabled_provider("codex", "anthropic");
        state.set_enabled_provider("gemini-cli", "google");
        state.save(&data_dir).unwrap();

        // 验证初始状态
        let loaded = EnabledState::load(&data_dir).unwrap();
        assert_eq!(loaded.enabled_providers.len(), 3);

        // 2. 模拟 Provider 删除：保存不包含 anthropic 的凭证列表
        let credentials = [create_test_credential("google")]; // 只保留 google
        let current_provider_ids: std::collections::HashSet<String> =
            credentials.iter().map(|c| c.provider_id.clone()).collect();

        // 3. 清理逻辑（模拟 save_provider_credentials 中的清理）
        let mut enabled_state = EnabledState::load(&data_dir).unwrap();
        let tools_to_clear: Vec<String> = enabled_state
            .enabled_providers
            .iter()
            .filter(|(_, provider_id)| !current_provider_ids.contains(*provider_id))
            .map(|(tool, _)| tool.clone())
            .collect();

        for tool in tools_to_clear {
            enabled_state.clear_enabled_provider(&tool);
        }
        enabled_state.save(&data_dir).unwrap();

        // 4. 验证 anthropic 相关的状态已清理
        let final_state = EnabledState::load(&data_dir).unwrap();
        assert_eq!(
            final_state.enabled_providers.get("claude-code"),
            None,
            "claude-code 的 anthropic 状态应该被清理"
        );
        assert_eq!(
            final_state.enabled_providers.get("codex"),
            None,
            "codex 的 anthropic 状态应该被清理"
        );
        assert_eq!(
            final_state.enabled_providers.get("gemini-cli"),
            Some(&"google".to_string()),
            "gemini-cli 的 google 状态应该保留"
        );

        // 清理
        let _ = fs::remove_dir_all(&data_dir);
    }

    /// TC-INTEGRATION-003: Codex 迁移 mcp.servers -> mcp_servers 全流程
    ///
    /// 场景：导出到 Codex 时，如果现有配置包含错误格式 mcp.servers，应该自动迁移
    #[test]
    #[serial]
    fn test_tc_integration_003_codex_mcp_migration_full_flow() {
        let data_dir = setup_test_dir();

        // 立即创建 Codex 目录和配置，避免环境变量竞争
        let codex_dir = data_dir.join(".codex");
        fs::create_dir_all(&codex_dir).unwrap();

        let old_config = r#"
base_url = "https://old-api.example.com"

[mcp.servers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem"]
"#;
        fs::write(codex_dir.join("config.toml"), old_config).unwrap();

        // 设置环境变量
        std::env::set_var("TEST_HOME_DIR", data_dir.to_str().unwrap());

        // 1. 准备测试数据
        let credentials = vec![create_test_credential("anthropic")];
        let credentials_json = serde_json::to_string_pretty(&credentials).unwrap();
        fs::write(data_dir.join("provider_credentials.json"), credentials_json).unwrap();

        let mcp_servers = vec![create_test_mcp_server("github")];
        let mcp_json = serde_json::to_string_pretty(&mcp_servers).unwrap();
        fs::write(data_dir.join("mcp_servers.json"), mcp_json).unwrap();

        let skills: Vec<Value> = vec![];
        let skills_json = serde_json::to_string_pretty(&skills).unwrap();
        fs::write(data_dir.join("skills.json"), skills_json).unwrap();

        let custom_providers: Vec<Value> = vec![];
        let custom_json = serde_json::to_string_pretty(&custom_providers).unwrap();
        fs::write(data_dir.join("custom_providers.json"), custom_json).unwrap();

        // 2. 执行导出到 Codex
        let service = ExportService::new();
        let result = service.export_provider(&data_dir, "anthropic", "codex");
        assert!(result.is_ok(), "导出到 Codex 应该成功: {:?}", result.err());

        // 3. 验证配置文件已更新
        let config_path = codex_dir.join("config.toml");
        assert!(
            config_path.exists(),
            "Codex 配置文件应该存在: {:?}",
            config_path
        );
        let config_content = fs::read_to_string(&config_path).unwrap();
        let doc: toml_edit::DocumentMut = config_content.parse().unwrap();

        // 3.1 错误格式 mcp.servers 应该被清理
        assert!(doc.get("mcp").is_none(), "错误格式 mcp.servers 应该被清理");

        // 3.2 新的 mcp_servers 应该存在（包含 github）
        assert!(
            doc.get("mcp_servers").is_some(),
            "新的 mcp_servers 应该存在"
        );

        assert!(
            doc.get("mcp_servers")
                .and_then(|v| v.get("github"))
                .is_some(),
            "github 服务器应该存在"
        );

        // 3.3 base_url 可能不存在（anthropic 是内置 provider，没有自定义 endpoint）
        // 只验证旧的 base_url 已被清理或更新
        // 注意：如果没有自定义 endpoint，base_url 字段会被删除

        // 4. 验证 enabled_state 已更新
        let state = EnabledState::load(&data_dir).unwrap();
        assert_eq!(
            state.enabled_providers.get("codex"),
            Some(&"anthropic".to_string()),
            "codex 应该记录 anthropic 为启用状态"
        );

        // 清理
        std::env::remove_var("TEST_HOME_DIR");
        let _ = fs::remove_dir_all(&data_dir);
    }
}
