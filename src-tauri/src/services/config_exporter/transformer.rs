//! 格式转换器
//!
//! 将 MobausStudio 内部格式转换为外部工具配置格式。
//! TOML 转换逻辑从 cc-switch mcp/codex.rs 复用。

use serde_json::Value;
use std::collections::HashMap;

use super::error::ConfigExportError;
use super::writer::ExportOutput;

/// 格式转换器
///
/// 将 MobausStudio 内部的 Provider/MCP/Skills 数据
/// 转换为各外部工具所需的配置格式。
pub struct Transformer;

impl Transformer {
    /// 创建新的 Transformer 实例
    pub fn new() -> Self {
        Transformer
    }

    /// 根据目标工具名转换配置（带模型列表）
    ///
    /// # 参数
    /// - `tool_name`: 目标工具名 ("claude-code"/"codex"/"gemini-cli"/"opencode"/"openclaw")
    /// - `provider_id`: Provider ID（用于 OpenCode 配置）
    /// - `api_key`: API Key
    /// - `base_url`: 可选的 API Base URL
    /// - `protocol`: 可选的协议类型 ("openai", "anthropic", "google" 等)
    /// - `models`: 模型列表（model_id -> {name: "Model Name"}）
    /// - `mcp_servers`: MCP 服务器配置列表 (id -> spec)
    /// - `skills`: Skills 配置列表
    #[allow(clippy::too_many_arguments)]
    pub fn transform_with_models(
        &self,
        tool_name: &str,
        provider_id: &str,
        api_key: &str,
        base_url: Option<&str>,
        protocol: Option<&str>,
        models: &HashMap<String, Value>,
        mcp_servers: &HashMap<String, Value>,
        skills: &[Value],
    ) -> Result<ExportOutput, ConfigExportError> {
        match tool_name {
            "claude-code" => self.to_claude_format(api_key, base_url, mcp_servers, skills),
            "codex" => self.to_codex_format(api_key, base_url, mcp_servers, skills),
            "gemini-cli" => self.to_gemini_format(api_key, base_url, mcp_servers),
            "opencode" => self.to_opencode_format_with_models(
                provider_id,
                api_key,
                base_url,
                protocol,
                models,
                mcp_servers,
            ),
            "openclaw" => self.to_openclaw_format(api_key, base_url),
            _ => Err(ConfigExportError::UnsupportedTool(tool_name.to_string())),
        }
    }

    /// 根据目标工具名转换配置
    ///
    /// # 参数
    /// - `tool_name`: 目标工具名 ("claude-code"/"codex"/"gemini-cli"/"opencode"/"openclaw")
    /// - `provider_id`: Provider ID（用于 OpenCode 配置）
    /// - `api_key`: API Key
    /// - `base_url`: 可选的 API Base URL
    /// - `protocol`: 可选的协议类型 ("openai", "anthropic", "google" 等)
    /// - `mcp_servers`: MCP 服务器配置列表 (id -> spec)
    /// - `skills`: Skills 配置列表
    #[allow(clippy::too_many_arguments)]
    pub fn transform(
        &self,
        tool_name: &str,
        provider_id: &str,
        api_key: &str,
        base_url: Option<&str>,
        protocol: Option<&str>,
        mcp_servers: &HashMap<String, Value>,
        skills: &[Value],
    ) -> Result<ExportOutput, ConfigExportError> {
        match tool_name {
            "claude-code" => self.to_claude_format(api_key, base_url, mcp_servers, skills),
            "codex" => self.to_codex_format(api_key, base_url, mcp_servers, skills),
            "gemini-cli" => self.to_gemini_format(api_key, base_url, mcp_servers),
            "opencode" => {
                self.to_opencode_format(provider_id, api_key, base_url, protocol, mcp_servers)
            }
            "openclaw" => self.to_openclaw_format(api_key, base_url),
            _ => Err(ConfigExportError::UnsupportedTool(tool_name.to_string())),
        }
    }

    /// 转换为 Claude Code 格式
    ///
    /// 输出：
    /// - settings.json: Provider API 配置 + Skills permissions
    /// - ~/.claude.json: MCP 服务器配置
    fn to_claude_format(
        &self,
        api_key: &str,
        base_url: Option<&str>,
        mcp_servers: &HashMap<String, Value>,
        skills: &[Value],
    ) -> Result<ExportOutput, ConfigExportError> {
        // 构建 settings.json
        let mut api_obj = serde_json::json!({
            "apiKey": api_key,
        });
        if let Some(url) = base_url {
            api_obj["baseUrl"] = Value::String(url.to_string());
        }

        let mut settings = serde_json::json!({
            "api": api_obj,
        });

        // 添加 Skills 到 permissions.allow
        if !skills.is_empty() {
            let skill_names: Vec<String> = skills
                .iter()
                .filter_map(|s| {
                    s.get("name")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
                .collect();

            if !skill_names.is_empty() {
                settings["permissions"] = serde_json::json!({
                    "allow": skill_names,
                });
            }
        }

        // 构建 ~/.claude.json MCP 配置
        let mcp = if mcp_servers.is_empty() {
            serde_json::json!({})
        } else {
            serde_json::json!({
                "mcpServers": mcp_servers,
            })
        };

        Ok(ExportOutput::Claude { settings, mcp })
    }

    /// 转换为 Codex 格式
    ///
    /// 输出：
    /// - auth.json: 扁平结构 { "OPENAI_API_KEY": "..." }
    /// - config.toml: MCP 服务器配置 + Skills
    ///
    /// TOML 转换逻辑复用自 cc-switch mcp/codex.rs
    fn to_codex_format(
        &self,
        api_key: &str,
        base_url: Option<&str>,
        mcp_servers: &HashMap<String, Value>,
        skills: &[Value],
    ) -> Result<ExportOutput, ConfigExportError> {
        // auth.json: 扁平结构
        let auth = serde_json::json!({
            "OPENAI_API_KEY": api_key,
        });

        // config.toml: 使用 toml_edit 构建
        let mut doc = toml_edit::DocumentMut::new();

        // 添加 base_url 配置（使用 base_url 而非 api_base_url，与 writer 保持一致）
        if let Some(url) = base_url {
            doc["base_url"] = toml_edit::value(url);
        }

        // 转换 MCP 服务器为 TOML 格式
        if !mcp_servers.is_empty() {
            let mut mcp_table = toml_edit::Table::new();
            for (id, spec) in mcp_servers {
                match json_server_to_toml_table(spec) {
                    Ok(table) => {
                        mcp_table[id] = toml_edit::Item::Table(table);
                    }
                    Err(e) => {
                        log::warn!("跳过 MCP 服务器 '{}' 的 TOML 转换: {}", id, e);
                    }
                }
            }
            if !mcp_table.is_empty() {
                doc["mcp_servers"] = toml_edit::Item::Table(mcp_table);
            }
        }

        // 添加 Skills 到 permissions.allow
        if !skills.is_empty() {
            let skill_names: Vec<String> = skills
                .iter()
                .filter_map(|s| {
                    s.get("name")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
                .collect();

            if !skill_names.is_empty() {
                let mut allow_arr = toml_edit::Array::default();
                for name in skill_names {
                    allow_arr.push(name);
                }
                let mut permissions_table = toml_edit::Table::new();
                permissions_table["allow"] =
                    toml_edit::Item::Value(toml_edit::Value::Array(allow_arr));
                doc["permissions"] = toml_edit::Item::Table(permissions_table);
            }
        }

        Ok(ExportOutput::Codex {
            auth,
            config_toml: doc.to_string(),
        })
    }

    /// 转换为 Gemini CLI 格式
    ///
    /// 输出：
    /// - .env: 环境变量格式
    /// - settings.json: MCP 配置
    fn to_gemini_format(
        &self,
        api_key: &str,
        base_url: Option<&str>,
        mcp_servers: &HashMap<String, Value>,
    ) -> Result<ExportOutput, ConfigExportError> {
        // .env 内容
        let mut env_lines = vec![format!("GEMINI_API_KEY={}", api_key)];
        if let Some(url) = base_url {
            env_lines.push(format!("GOOGLE_GEMINI_BASE_URL={}", url));
        }
        let env_content = env_lines.join("\n") + "\n";

        // settings.json
        let settings = if mcp_servers.is_empty() {
            serde_json::json!({})
        } else {
            serde_json::json!({
                "mcpServers": mcp_servers,
            })
        };

        Ok(ExportOutput::Gemini {
            env_content,
            settings,
        })
    }

    /// 转换为 OpenCode 格式（带模型列表）
    ///
    /// 输出：单个 opencode.json（基于 AI SDK 的 Provider 配置）
    ///
    /// 参考 cc-switch 的实现：
    /// - Provider 配置在 `provider.{id}` 对象中
    /// - 需要 `npm` 字段指定 AI SDK 包
    /// - API Key 和 Base URL 在 `options` 对象中
    /// - 模型定义在 `models` 对象中
    fn to_opencode_format_with_models(
        &self,
        provider_id: &str,
        api_key: &str,
        base_url: Option<&str>,
        protocol: Option<&str>,
        models: &HashMap<String, Value>,
        mcp_servers: &HashMap<String, Value>,
    ) -> Result<ExportOutput, ConfigExportError> {
        log::info!(
            "[to_opencode_format_with_models] 开始转换: provider_id={}, base_url={:?}, protocol={:?}",
            provider_id,
            base_url,
            protocol
        );

        // 尝试从模型中提取 protocol（模型级别的 protocol 更准确）
        let model_protocol = models
            .values()
            .next()
            .and_then(|model| model.get("protocol"))
            .and_then(|p| p.as_str());

        // 优先使用模型的 protocol，其次使用提供商的 protocol
        let final_protocol = model_protocol.or(protocol);

        // 根据 protocol 选择 npm 包
        let npm_package = match final_protocol {
            Some("anthropic") => "@ai-sdk/anthropic",
            Some("google") | Some("gemini") => "@ai-sdk/google",
            Some("openai") | Some(_) => "@ai-sdk/openai-compatible",
            None => "@ai-sdk/openai-compatible", // 默认使用 OpenAI 兼容
        };

        // 构建 Provider 配置
        let mut provider_config = serde_json::json!({
            "npm": npm_package,
            "options": {
                "apiKey": api_key,
            },
            "models": models
        });

        // 自定义提供商需要 baseURL（如果有的话就设置）
        if let Some(url) = base_url {
            provider_config["options"]["baseURL"] = Value::String(url.to_string());
            log::info!("[to_opencode_format_with_models] ✅ 设置 baseURL: {}", url);
        } else {
            log::warn!(
                "[to_opencode_format_with_models] ⚠️ 提供商 {} 没有 baseURL，使用默认配置",
                provider_id
            );
        }

        // 构建完整配置
        let mut content = serde_json::json!({
            "$schema": "https://opencode.ai/config.json",
            "provider": {
                provider_id: provider_config
            }
        });

        // 转换 MCP 服务器配置（stdio → local，合并 command + args）
        if !mcp_servers.is_empty() {
            let mut mcp_config = serde_json::Map::new();

            for (id, spec) in mcp_servers {
                let converted = self.convert_mcp_to_opencode_format(spec)?;
                mcp_config.insert(id.clone(), converted);
            }

            content["mcp"] = Value::Object(mcp_config);
        }

        Ok(ExportOutput::SingleJson { content })
    }

    /// 转换为 OpenCode 格式
    ///
    /// 输出：单个 opencode.json（基于 AI SDK 的 Provider 配置）
    ///
    /// 参考 cc-switch 的实现：
    /// - Provider 配置在 `provider.{id}` 对象中
    /// - 需要 `npm` 字段指定 AI SDK 包
    /// - API Key 和 Base URL 在 `options` 对象中
    /// - 模型定义在 `models` 对象中
    fn to_opencode_format(
        &self,
        provider_id: &str,
        api_key: &str,
        base_url: Option<&str>,
        protocol: Option<&str>,
        mcp_servers: &HashMap<String, Value>,
    ) -> Result<ExportOutput, ConfigExportError> {
        // 根据 protocol 选择 npm 包
        let npm_package = match protocol {
            Some("anthropic") => "@ai-sdk/anthropic",
            Some("google") | Some("gemini") => "@ai-sdk/google",
            Some("openai") | Some(_) => "@ai-sdk/openai-compatible",
            None => "@ai-sdk/openai-compatible", // 默认使用 OpenAI 兼容
        };

        // 构建 Provider 配置
        let mut provider_config = serde_json::json!({
            "npm": npm_package,
            "options": {
                "apiKey": api_key,
            },
            "models": {
                "claude-opus-4-6": {
                    "name": "Claude Opus 4.6"
                }
            }
        });

        // 自定义提供商需要 baseURL（如果有的话就设置）
        if let Some(url) = base_url {
            provider_config["options"]["baseURL"] = Value::String(url.to_string());
            log::info!("[to_opencode_format_with_models] 设置 baseURL: {}", url);
        } else {
            log::warn!(
                "[to_opencode_format_with_models] 提供商 {} 没有 baseURL，使用默认配置",
                provider_id
            );
        }

        // 构建完整配置
        let mut content = serde_json::json!({
            "$schema": "https://opencode.ai/config.json",
            "provider": {
                provider_id: provider_config
            }
        });

        // 转换 MCP 服务器配置（stdio → local，合并 command + args）
        if !mcp_servers.is_empty() {
            let mut mcp_config = serde_json::Map::new();

            for (id, spec) in mcp_servers {
                let converted = self.convert_mcp_to_opencode_format(spec)?;
                mcp_config.insert(id.clone(), converted);
            }

            content["mcp"] = Value::Object(mcp_config);
        }

        Ok(ExportOutput::SingleJson { content })
    }

    /// 转换 MCP 服务器配置为 OpenCode 格式
    ///
    /// 参考 cc-switch 的 convert_to_opencode_format() 实现：
    /// - stdio → local，command + args 合并为 command 数组
    /// - http/sse → remote，保留 url
    /// - env → environment
    fn convert_mcp_to_opencode_format(&self, spec: &Value) -> Result<Value, ConfigExportError> {
        let obj = spec.as_object().ok_or_else(|| {
            ConfigExportError::TransformError("MCP spec must be a JSON object".to_string())
        })?;

        let typ = obj.get("type").and_then(|v| v.as_str()).unwrap_or("stdio");
        let mut result = serde_json::Map::new();

        match typ {
            "stdio" => {
                // 转换为 "local" 类型
                result.insert("type".into(), serde_json::json!("local"));

                // 合并 command 和 args 为单个数组
                let cmd = obj.get("command").and_then(|v| v.as_str()).unwrap_or("");
                let mut command_arr = vec![serde_json::json!(cmd)];

                if let Some(args) = obj.get("args").and_then(|v| v.as_array()) {
                    for arg in args {
                        command_arr.push(arg.clone());
                    }
                }
                result.insert("command".into(), Value::Array(command_arr));

                // 转换 env → environment
                if let Some(env) = obj.get("env") {
                    if env.is_object() && !env.as_object().map(|o| o.is_empty()).unwrap_or(true) {
                        result.insert("environment".into(), env.clone());
                    }
                }

                // 添加 enabled 标志
                result.insert("enabled".into(), serde_json::json!(true));
            }
            "http" | "sse" => {
                // 转换为 "remote" 类型
                result.insert("type".into(), serde_json::json!("remote"));

                // 保留 url
                if let Some(url) = obj.get("url") {
                    result.insert("url".into(), url.clone());
                }

                // 转换 headers（如果有）
                if let Some(headers) = obj.get("headers") {
                    if headers.is_object()
                        && !headers.as_object().map(|o| o.is_empty()).unwrap_or(true)
                    {
                        result.insert("headers".into(), headers.clone());
                    }
                }

                // 添加 enabled 标志
                result.insert("enabled".into(), serde_json::json!(true));
            }
            _ => {
                return Err(ConfigExportError::TransformError(format!(
                    "Unknown MCP type: {}",
                    typ
                )));
            }
        }

        Ok(Value::Object(result))
    }

    /// 转换为 OpenClaw 格式
    ///
    /// 输出：单个 config.json（不支持 MCP）
    fn to_openclaw_format(
        &self,
        api_key: &str,
        base_url: Option<&str>,
    ) -> Result<ExportOutput, ConfigExportError> {
        let mut content = serde_json::json!({
            "apiKey": api_key,
        });
        if let Some(url) = base_url {
            content["baseUrl"] = Value::String(url.to_string());
        }

        Ok(ExportOutput::SingleJson { content })
    }
}

// ============================================================================
// TOML 转换函数（复用自 cc-switch mcp/codex.rs）
// ============================================================================

/// 将 JSON Value 转换为 toml_edit::Item
///
/// 支持 String、Number、Boolean、简单类型数组、浅层对象。
/// 复用自 cc-switch mcp/codex.rs:json_value_to_toml_item()
fn json_value_to_toml_item(value: &Value, field_name: &str) -> Option<toml_edit::Item> {
    use toml_edit::{Array, InlineTable, Item};

    match value {
        Value::String(s) => Some(toml_edit::value(s.as_str())),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Some(toml_edit::value(i))
            } else if let Some(f) = n.as_f64() {
                Some(toml_edit::value(f))
            } else {
                log::warn!("跳过字段 '{field_name}': 无法转换的数字类型 {n}");
                None
            }
        }
        Value::Bool(b) => Some(toml_edit::value(*b)),
        Value::Array(arr) => {
            let mut toml_arr = Array::default();
            let mut all_same_type = true;
            for item in arr {
                match item {
                    Value::String(s) => toml_arr.push(s.as_str()),
                    Value::Number(n) if n.is_i64() => {
                        if let Some(i) = n.as_i64() {
                            toml_arr.push(i);
                        } else {
                            all_same_type = false;
                            break;
                        }
                    }
                    Value::Number(n) if n.is_f64() => {
                        if let Some(f) = n.as_f64() {
                            toml_arr.push(f);
                        } else {
                            all_same_type = false;
                            break;
                        }
                    }
                    Value::Bool(b) => toml_arr.push(*b),
                    _ => {
                        all_same_type = false;
                        break;
                    }
                }
            }
            if all_same_type && !toml_arr.is_empty() {
                Some(Item::Value(toml_edit::Value::Array(toml_arr)))
            } else {
                log::warn!("跳过字段 '{field_name}': 不支持的数组类型（混合类型或嵌套结构）");
                None
            }
        }
        Value::Object(obj) => {
            let mut inline_table = InlineTable::new();
            let mut all_strings = true;
            for (k, v) in obj {
                if let Some(s) = v.as_str() {
                    inline_table.insert(k, s.into());
                } else {
                    all_strings = false;
                    break;
                }
            }
            if all_strings && !inline_table.is_empty() {
                Some(Item::Value(toml_edit::Value::InlineTable(inline_table)))
            } else {
                log::warn!("跳过字段 '{field_name}': 对象值包含非字符串类型，建议使用子表语法");
                None
            }
        }
        Value::Null => {
            log::debug!("跳过字段 '{field_name}': TOML 不支持 null 值");
            None
        }
    }
}

/// 将 JSON MCP 服务器规格转换为 toml_edit::Table
///
/// 处理核心字段（type, command, args, url, headers, env, cwd）以及扩展字段。
/// 复用自 cc-switch mcp/codex.rs:json_server_to_toml_table()
fn json_server_to_toml_table(spec: &Value) -> Result<toml_edit::Table, ConfigExportError> {
    use toml_edit::{Array, Item, Table};

    let mut t = Table::new();
    let typ = spec.get("type").and_then(|v| v.as_str()).unwrap_or("stdio");
    t["type"] = toml_edit::value(typ);

    // 核心字段白名单
    let core_fields = match typ {
        "stdio" => vec!["type", "command", "args", "env", "cwd"],
        "http" | "sse" => vec!["type", "url", "http_headers"],
        _ => vec!["type"],
    };

    // 扩展字段白名单
    let extended_fields = [
        "timeout",
        "timeout_ms",
        "startup_timeout_ms",
        "startup_timeout_sec",
        "connection_timeout",
        "read_timeout",
        "debug",
        "log_level",
        "disabled",
        "shell",
        "encoding",
        "working_dir",
        "restart_on_exit",
        "max_restart_count",
        "retry_count",
        "max_retry_attempts",
        "retry_delay",
        "cache_tools_list",
        "verify_ssl",
        "insecure",
        "proxy",
    ];

    // 处理核心字段
    match typ {
        "stdio" => {
            let cmd = spec.get("command").and_then(|v| v.as_str()).unwrap_or("");
            t["command"] = toml_edit::value(cmd);

            if let Some(args) = spec.get("args").and_then(|v| v.as_array()) {
                let mut arr_v = Array::default();
                for a in args.iter().filter_map(|x| x.as_str()) {
                    arr_v.push(a);
                }
                if !arr_v.is_empty() {
                    t["args"] = Item::Value(toml_edit::Value::Array(arr_v));
                }
            }

            if let Some(cwd) = spec.get("cwd").and_then(|v| v.as_str()) {
                if !cwd.trim().is_empty() {
                    t["cwd"] = toml_edit::value(cwd);
                }
            }

            if let Some(env) = spec.get("env").and_then(|v| v.as_object()) {
                let mut env_tbl = Table::new();
                for (k, v) in env.iter() {
                    if let Some(s) = v.as_str() {
                        env_tbl[&k[..]] = toml_edit::value(s);
                    }
                }
                if !env_tbl.is_empty() {
                    t["env"] = Item::Table(env_tbl);
                }
            }
        }
        "http" | "sse" => {
            let url = spec.get("url").and_then(|v| v.as_str()).unwrap_or("");
            t["url"] = toml_edit::value(url);

            if let Some(headers) = spec.get("headers").and_then(|v| v.as_object()) {
                let mut h_tbl = Table::new();
                for (k, v) in headers.iter() {
                    if let Some(s) = v.as_str() {
                        h_tbl[&k[..]] = toml_edit::value(s);
                    }
                }
                if !h_tbl.is_empty() {
                    t["http_headers"] = Item::Table(h_tbl);
                }
            }
        }
        _ => {}
    }

    // 处理扩展和自定义字段
    if let Some(obj) = spec.as_object() {
        for (key, value) in obj {
            if core_fields.contains(&key.as_str()) {
                continue;
            }
            if let Some(toml_item) = json_value_to_toml_item(value, key) {
                t[&key[..]] = toml_item;
                if extended_fields.contains(&key.as_str()) {
                    log::debug!("已转换扩展字段 '{key}' = {value:?}");
                } else {
                    log::info!("已转换自定义字段 '{key}' = {value:?}");
                }
            }
        }
    }

    Ok(t)
}

// ============================================================================
// 单元测试
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    /// TC-EXPORT-012: TOML 格式转换 - stdio 类型
    #[test]
    fn test_tc_export_012_toml_stdio() {
        let spec = serde_json::json!({
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
            "env": {
                "NODE_ENV": "production"
            }
        });

        let table = json_server_to_toml_table(&spec).expect("TOML 转换应该成功");
        let toml_str = table.to_string();

        assert!(toml_str.contains("type = \"stdio\""), "应包含 type 字段");
        assert!(
            toml_str.contains("command = \"npx\""),
            "应包含 command 字段"
        );
        assert!(toml_str.contains("args"), "应包含 args 字段");
    }

    /// TC-EXPORT-012: TOML 格式转换 - http 类型
    #[test]
    fn test_tc_export_012_toml_http() {
        let spec = serde_json::json!({
            "type": "http",
            "url": "http://localhost:3000",
            "headers": {
                "Authorization": "Bearer token123"
            }
        });

        let table = json_server_to_toml_table(&spec).expect("TOML 转换应该成功");
        let toml_str = table.to_string();

        assert!(toml_str.contains("type = \"http\""), "应包含 type=http");
        assert!(
            toml_str.contains("url = \"http://localhost:3000\""),
            "应包含 url 字段"
        );
    }

    /// TC-EXPORT-001: Claude Code 格式转换
    #[test]
    fn test_tc_export_001_claude_format() {
        let transformer = Transformer::new();
        let mcp = HashMap::new();
        let skills = vec![];

        let output = transformer
            .to_claude_format(
                "sk-ant-xxx",
                Some("https://api.anthropic.com"),
                &mcp,
                &skills,
            )
            .expect("Claude 转换应该成功");

        if let ExportOutput::Claude { settings, mcp: _ } = output {
            assert_eq!(settings["api"]["apiKey"], "sk-ant-xxx");
            assert_eq!(settings["api"]["baseUrl"], "https://api.anthropic.com");
        } else {
            panic!("应该返回 Claude 格式");
        }
    }

    /// TC-EXPORT-002: Codex 格式转换
    #[test]
    fn test_tc_export_002_codex_format() {
        let transformer = Transformer::new();
        let mcp = HashMap::new();
        let skills = vec![];

        let output = transformer
            .to_codex_format("sk-ant-xxx", None, &mcp, &skills)
            .expect("Codex 转换应该成功");

        if let ExportOutput::Codex {
            auth,
            config_toml: _,
        } = output
        {
            // auth.json 应该是扁平结构
            assert_eq!(auth["OPENAI_API_KEY"], "sk-ant-xxx");
            // 不应该有嵌套的 auth 字段
            assert!(auth.get("auth").is_none(), "auth.json 不应有嵌套 auth 字段");
        } else {
            panic!("应该返回 Codex 格式");
        }
    }

    /// TC-EXPORT-008: OpenClaw 不支持 MCP
    #[test]
    fn test_tc_export_008_openclaw_no_mcp() {
        let transformer = Transformer::new();

        let output = transformer
            .to_openclaw_format("sk-ant-xxx", None)
            .expect("OpenClaw 转换应该成功");

        if let ExportOutput::SingleJson { content } = output {
            assert_eq!(content["apiKey"], "sk-ant-xxx");
            assert!(
                content.get("mcpServers").is_none(),
                "OpenClaw 不应包含 mcpServers"
            );
        } else {
            panic!("应该返回 SingleJson 格式");
        }
    }

    /// TC-EXPORT-005: 不支持的工具
    #[test]
    fn test_tc_export_005_unsupported_tool() {
        let transformer = Transformer::new();
        let mcp = HashMap::new();
        let skills = vec![];

        let result = transformer.transform(
            "invalid-tool",
            "test-provider",
            "key",
            None,
            None,
            &mcp,
            &skills,
        );
        assert!(result.is_err(), "不支持的工具应返回错误");
        let err = result.unwrap_err();
        assert!(
            err.to_string().contains("invalid-tool"),
            "错误信息应包含工具名"
        );
    }

    /// Codex 格式含 MCP 服务器的转换
    #[test]
    fn test_codex_format_with_mcp() {
        let transformer = Transformer::new();
        let mut mcp = HashMap::new();
        mcp.insert(
            "filesystem".to_string(),
            serde_json::json!({
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
            }),
        );
        let skills = vec![];

        let output = transformer
            .transform(
                "codex",
                "test-provider",
                "sk-xxx",
                None,
                None,
                &mcp,
                &skills,
            )
            .expect("Codex 转换应该成功");

        if let ExportOutput::Codex {
            auth: _,
            config_toml,
        } = output
        {
            assert!(
                config_toml.contains("[mcp_servers.filesystem]"),
                "TOML 应包含 MCP 服务器节: {}",
                config_toml
            );
            assert!(
                config_toml.contains("command = \"npx\""),
                "TOML 应包含 command 字段"
            );
        } else {
            panic!("应该返回 Codex 格式");
        }
    }
}
