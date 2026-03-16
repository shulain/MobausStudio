# Config Switcher Module / 配置导出器模块

> [English](#english) | [中文](#中文)

<a id="english"></a>


## Module Responsibilities

**纯配置文件导出模块**：将 MobausStudio 内部配置导出到外部 AI CLI 工具的配置文件中。

**核心原则**：
- ✅ 单向导出：MobausStudio → 外部 CLI 工具配置文件
- ✅ 轻量状态管理：通过现有存储接口读取配置，仅持久化工具启用状态（tool_enabled_state.json）
- ✅ 格式转换：自动转换为各工具所需格式（TOML/JSON/ENV）
- ✅ 原子写入：保证配置文件完整性
- ✅ 跨平台路径：根据操作系统自动选择正确的配置目录
- ✅ 跨平台命令：Windows 平台自动包装 Node.js 工具链命令（npx/npm/node 等）
- ❌ 不管理内部配置：不创建/修改 MobausStudio 内部的 providers/mcp/skills 数据
- ❌ 不从外部读取：不导入外部 CLI 工具的配置到 MobausStudio

## Configuration Flow

```
MobausStudio 内部数据源（JSON 文件存储）
  ├─ provider_credentials.json (API Key, OAuth Token)
  ├─ custom_providers.json (自定义提供商配置)
  ├─ mcp_servers.json (MCP 服务器配置)
  └─ skills.json (Skills 配置)
         ↓
   Config-Switcher 通过现有存储接口读取
   (复用 get_data_dir() + fs::read_to_string)
         ↓
   协议优先级判断 (v0.9.5)
   1. 模型指定的协议 (model.protocol)
   2. 提供商默认协议 (PROVIDER_DEFAULT_PROTOCOL)
   3. 自定义提供商协议 (custom_providers.protocol)
         ↓
   格式转换 + 跨平台路径处理 + 原子写入
         ↓
   外部 CLI 工具配置文件（跨平台路径）
   ├─ Claude Code:
   │   • macOS/Linux: ~/.claude/settings.json + ~/.claude.json (MCP)
   │   • Windows: %USERPROFILE%\.claude\settings.json + %USERPROFILE%\.claude.json (MCP)
   ├─ Codex:
   │   • macOS/Linux: ~/.codex/auth.json + ~/.codex/config.toml
   │   • Windows: %USERPROFILE%\.codex\auth.json + %USERPROFILE%\.codex\config.toml
   ├─ Gemini CLI:
   │   • macOS/Linux: ~/.gemini/.env + ~/.gemini/settings.json
   │   • Windows: %USERPROFILE%\.gemini\.env + %USERPROFILE%\.gemini\settings.json
   ├─ OpenCode:
   │   • macOS/Linux: ~/.opencode/config.json
   │   • Windows: %USERPROFILE%\.opencode\config.json
   └─ OpenClaw:
       • macOS/Linux: ~/.openclaw/config.json
       • Windows: %USERPROFILE%\.openclaw\config.json
```

## 功能范围

### Core Features

1. **配置导出**：将指定 Provider 的配置导出到指定外部工具
2. **格式转换**：自动转换为各外部工具的格式（TOML/JSON/ENV）
3. **合并写入**：保留用户手动配置的其他字段，仅覆盖导出的字段（单文件：temp+rename，多文件：backup+restore）
4. **MCP/Skills 同步**：同时导出关联的 MCP 服务器和 Skills 配置

### 非功能（明确排除）

- ❌ 供应商 CRUD（由 providers 模块负责）
- ❌ MCP 服务器 CRUD（由 mcp 模块负责）
- ❌ Prompts/Skills CRUD（由 skills 模块负责）
- ❌ 从外部配置文件导入到 MobausStudio
- ❌ 导出映射持久化（无需数据库表）

## Architecture Design

### 目录结构

```
MobausStudio/
├── src-tauri/src/
│   ├── lib.rs                       # Tauri 命令层（包含 export_provider_to_tool 等命令）
│   └── services/
│       └── config_exporter/         # 配置导出服务
│           ├── mod.rs               # 模块导出
│           ├── export_service.rs    # 导出服务（核心逻辑）
│           ├── transformer.rs       # 格式转换器
│           ├── writer.rs            # 配置文件写入器
│           ├── enabled_state.rs     # 工具启用状态管理
│           ├── error.rs             # 错误类型定义
│           ├── windows_cmd_wrapper.rs  # Windows 命令包装工具
│           └── integration_tests.rs # 集成测试
├── src-tauri/data/
│   └── tool_enabled_state.json      # 工具启用状态持久化文件
└── docs/modules/
    └── config-switcher.md           # 本文档
```

**注意**：无需 `database/` 层，通过现有 `get_data_dir()` 函数读取 JSON 文件。

### 代码复用策略

从 cc-switch 项目复用以下逻辑：

| 功能模块 | cc-switch 源文件 | 复用方式 | 复用内容 |
|---------|-----------------|---------|---------|
| 路径获取 | `config.rs` | 直接复用 | `get_claude_config_dir()`, `get_claude_settings_path()`, `get_claude_mcp_path()` |
| 路径获取 | `codex_config.rs` | 直接复用 | `get_codex_config_dir()`, `get_codex_auth_path()`, `get_codex_config_path()` |
| 原子写入 | `codex_config.rs` | 直接复用 | `write_codex_live_atomic()` - 多文件事务写入 + 回滚 |
| TOML 转换 | `mcp/codex.rs` | 直接复用 | `json_server_to_toml_table()`, `json_value_to_toml_item()` - JSON → TOML 转换 |
| MCP 写入 | `claude_mcp.rs` | 直接复用 | `set_mcp_servers_map()` - 写入 ~/.claude.json |
| MCP 同步 | `mcp/codex.rs` | 参考复用（需适配） | `sync_enabled_to_codex()` 的过滤和转换逻辑（依赖 MultiAppConfig，需适配） |
| MCP 同步 | `mcp/claude.rs` | 参考复用（需适配） | `collect_enabled_servers()`, `extract_server_spec()` 逻辑（需适配数据结构） |
| 应用类型 | `app_config.rs` | 直接复用 | `AppType` 枚举 - 统一的应用标识 |

## 外部工具配置格式

### 1. Claude Code

**配置文件**：
- macOS/Linux:
  - `~/.claude/settings.json` (Provider 配置，优先)
  - `~/.claude/claude.json` (Provider 配置，兼容旧版)
  - `~/.claude.json` (MCP 服务器配置)
- Windows:
  - `%USERPROFILE%\.claude\settings.json` (Provider 配置，优先)
  - `%USERPROFILE%\.claude\claude.json` (Provider 配置，兼容旧版)
  - `%USERPROFILE%\.claude.json` (MCP 服务器配置)

**格式**：JSON

**settings.json 示例**：
```json
{
  "api": {
    "apiKey": "sk-ant-xxx",
    "baseUrl": "https://api.anthropic.com"
  },
  "model": {
    "default": "claude-opus-4-6"
  }
}
```

**~/.claude.json (MCP) 示例**：
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
    }
  }
}
```

**复用逻辑**：

- **直接复用** `config.rs` 的路径函数：
  - `get_claude_config_dir()` - 获取 ~/.claude 目录
  - `get_claude_settings_path()` - 自动选择 settings.json 或 claude.json
  - `get_claude_mcp_path()` - 获取 ~/.claude.json 路径
- **参考复用** `mcp/claude.rs` 的同步逻辑（需适配层）：
  - `sync_enabled_to_claude()` 依赖 `MultiAppConfig`，需要适配为 MobausStudio 的数据结构
  - 可复用其内部的 `collect_enabled_servers()` 和 `extract_server_spec()` 逻辑
  - 直接复用 `claude_mcp::set_mcp_servers_map()` 写入函数

---

### 2. Codex

**配置文件**：
- macOS/Linux:
  - `~/.codex/auth.json`（认证信息）
  - `~/.codex/config.toml`（配置信息）
- Windows:
  - `%USERPROFILE%\.codex\auth.json`
  - `%USERPROFILE%\.codex\config.toml`

**格式**：JSON + TOML

**auth.json 示例**：
```json
{
  "OPENAI_API_KEY": "sk-ant-xxx"
}
```

**注意**：
- auth.json 是扁平结构，直接包含 `OPENAI_API_KEY` 字段（Codex 标准）
- 在 cc-switch 的 Provider 内部存储时使用 `{ "auth": { "OPENAI_API_KEY": "..." }, "config": "..." }` 结构
- 但写入 auth.json 文件时，只写入 `auth` 字段的内容（扁平化）

**config.toml 示例**：
```toml
model = "claude-opus-4-6"

[mcp_servers.filesystem]
type = "stdio"
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
```

**复用逻辑**：

- **直接复用** `codex_config.rs` 的所有函数：
  - `get_codex_config_dir()`
  - `get_codex_auth_path()`
  - `get_codex_config_path()`
  - `write_codex_live_atomic()` - 多文件原子写入 + 回滚
- **直接复用** `mcp/codex.rs` 的转换函数：
  - `json_server_to_toml_table()`
  - `json_value_to_toml_item()`
- **参考复用** `mcp/codex.rs` 的同步逻辑（需适配层）：
  - `sync_enabled_to_codex()` 依赖 `MultiAppConfig`，需要适配为 MobausStudio 的数据结构
  - 可复用其内部的 MCP 过滤和转换逻辑

---

### 3. Gemini CLI

**配置文件**：
- macOS/Linux:
  - `~/.gemini/.env`（环境变量）
  - `~/.gemini/settings.json`（配置信息）
- Windows:
  - `%USERPROFILE%\.gemini\.env`
  - `%USERPROFILE%\.gemini\settings.json`

**格式**：ENV + JSON

**.env 示例**：
```env
GOOGLE_API_KEY=AIzaSyXXX
GOOGLE_GEMINI_BASE_URL=https://generativelanguage.googleapis.com
```

**settings.json 示例**：
```json
{
  "model": "gemini-2.0-flash-exp",
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
    }
  }
}
```

**复用逻辑**：
- 路径获取：参考 `get_codex_config_dir()` 模式
- 原子写入：参考 `write_codex_live_atomic()` 的多文件事务逻辑

---

### 4. OpenCode

**配置文件**：
- macOS/Linux: `~/.config/opencode/opencode.json`
- Windows: `%USERPROFILE%\.config\opencode\opencode.json`

**格式**：JSON（基于 AI SDK 的 Provider 配置）

**示例**：
```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "custom-provider-id": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "apiKey": "sk-ant-xxx",
        "baseURL": "https://api.anthropic.com"
      },
      "models": {
        "claude-opus-4-6": {
          "name": "Claude Opus 4.6"
        }
      }
    }
  },
  "mcp": {
    "filesystem": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/path"],
      "enabled": true
    }
  }
}
```

**关键字段**：
- `provider.{id}.npm`: AI SDK 包名（如 `@ai-sdk/openai-compatible`, `@ai-sdk/anthropic`）
- `provider.{id}.options.apiKey`: API 密钥
- `provider.{id}.options.baseURL`: API 基础 URL
- `provider.{id}.models`: 模型定义映射
- `mcp.{id}.type`: MCP 类型（`local` 对应 stdio，`remote` 对应 http/sse）
- `mcp.{id}.command`: 命令数组（合并 command + args）

**复用逻辑**：
- 路径获取：复用 cc-switch 的 `get_opencode_dir()` 和 `get_opencode_config_path()`
- Provider 格式：参考 cc-switch 的 `OpenCodeProviderConfig` 结构
- MCP 格式：参考 cc-switch 的 `convert_to_opencode_format()` 转换逻辑

---

### 5. OpenClaw

**配置文件**：
- macOS/Linux: `~/.openclaw/config.json`
- Windows: `%USERPROFILE%\.openclaw\config.json`

**格式**：JSON

**示例**：
```json
{
  "apiKey": "sk-ant-xxx",
  "baseUrl": "https://api.anthropic.com",
  "model": "claude-opus-4-6"
}
```

**注意**：OpenClaw 当前版本暂不支持 MCP 配置。

**复用逻辑**：
- 路径获取：参考 `get_codex_config_dir()` 模式
- JSON 格式：直接使用 `serde_json`

---

## API Definitions

### Tauri 命令

#### 1. 导出配置到外部工具

```rust
#[tauri::command]
pub async fn export_provider_to_tool(
    provider_id: String,
    tool_name: String,  // "claude-code" | "codex" | "gemini-cli" | "opencode" | "openclaw"
) -> Result<(), String>
```

**功能**：将指定 Provider 的配置导出到指定外部工具。

**流程**：
1. 读取 `provider_credentials.json` 获取 Provider 凭证
2. 检查认证类型（仅支持 API Key）
3. 读取 `mcp_servers.json` 获取 MCP 服务器配置
4. 读取 `skills.json` 获取 Skills 配置
5. 转换为目标工具格式
6. 原子写入配置文件

**错误处理**：
- Provider 不存在 → 返回错误
- 认证类型不支持（OAuth） → 返回错误提示需要代理服务器
- 配置文件写入失败 → 返回错误并回滚

---

#### 2. 批量导出配置

```rust
#[tauri::command]
pub async fn batch_export_providers(
    exports: Vec<ExportRequest>,  // [{ provider_id, tool_name }]
) -> Result<BatchExportResult, String>
```

**功能**：批量导出多个 Provider 到多个外部工具。

**返回值**：
```rust
struct BatchExportResult {
    success_count: usize,
    failed_exports: Vec<FailedExport>,
}

struct FailedExport {
    provider_id: String,
    tool_name: String,
    error: String,
}
```

---

#### 3. 获取支持的外部工具列表

```rust
#[tauri::command]
pub fn get_supported_tools() -> Vec<ExternalTool>
```

**返回值**：
```rust
struct ExternalTool {
    id: String,           // "claude-code"
    name: String,         // "Claude Code"
    config_files: Vec<String>,  // ["~/.claude/settings.json", "~/.claude.json"]
    supports_mcp: bool,
    supports_skills: bool,
}
```

---

## 核心服务实现

### 1. ExportService（导出服务）

**职责**：协调整个导出流程。

**核心方法**：

```rust
impl ExportService {
    /// 导出 Provider 到指定工具
    pub async fn export_provider(
        &self,
        app_handle: &tauri::AppHandle,
        provider_id: &str,
        tool_name: &str,
    ) -> Result<(), ConfigExportError> {
        // 1. 获取数据目录（直接使用 Tauri API）
        let data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| ConfigExportError::PathError(format!("无法获取应用数据目录: {}", e)))?;

        // 2. 读取 provider_credentials.json
        let credentials_path = data_dir.join("provider_credentials.json");
        let credentials_content = fs::read_to_string(&credentials_path)
            .map_err(|e| ConfigExportError::IoError(e))?;
        let credentials: Vec<ProviderCredential> = serde_json::from_str(&credentials_content)
            .map_err(|e| ConfigExportError::JsonError(e))?;

        // 3. 查找指定 Provider
        let provider = credentials
            .iter()
            .find(|c| c.provider_id == provider_id)
            .ok_or_else(|| ConfigExportError::ProviderNotFound(provider_id.to_string()))?;

        // 4. 检查认证类型
        if provider.auth_type != "api" {
            return Err(ConfigExportError::UnsupportedAuthType(
                "仅支持 API Key 认证类型，OAuth 需要使用代理服务器".to_string()
            ));
        }

        // 5. 读取 mcp_servers.json
        let mcp_path = data_dir.join("mcp_servers.json");
        let mcp_servers = if mcp_path.exists() {
            let content = fs::read_to_string(&mcp_path)?;
            let all_servers: Vec<MCPServerConfig> = serde_json::from_str(&content)?;
            // 过滤出启用的 MCP 服务器
            all_servers.into_iter().filter(|s| s.enabled).collect()
        } else {
            Vec::new()
        };

        // 6. 读取 skills.json
        let skills_path = data_dir.join("skills.json");
        let skills = if skills_path.exists() {
            let content = fs::read_to_string(&skills_path)?;
            serde_json::from_str(&content)?
        } else {
            Vec::new()
        };

        // 7. 转换为目标格式
        let config = self.transformer.transform(
            provider,
            &mcp_servers,
            &skills,
            tool_name,
        )?;

        // 8. 写入配置文件
        self.writer.write_config(tool_name, &config).await?;

        Ok(())
    }
}
```

**注意**：
- 使用现有的 `get_data_dir()` 函数获取数据目录（跨平台）
- 错误类型使用 `JsonError` 而非 `ParseError`

---

### 2. Transformer（格式转换器）

**职责**：将 MobausStudio 内部格式转换为外部工具格式。

**核心方法**：

```rust
impl Transformer {
    /// 转换为 Claude Code 格式
    fn to_claude_code_format(
        &self,
        provider: &Provider,
        mcp_servers: &[McpServer],
        skills: &[Skill],
    ) -> Result<(Value, Value), ConfigExportError> {
        // 返回 (settings.json 内容, ~/.claude.json MCP 内容)
        // 复用 cc-switch 的 mcp/claude.rs 同步逻辑
        // ...
    }

    /// 转换为 Codex 格式
    fn to_codex_format(
        &self,
        provider: &Provider,
        mcp_servers: &[McpServer],
        skills: &[Skill],
    ) -> Result<(Value, String), ConfigExportError> {
        // 返回 (auth.json 内容, config.toml 内容)
        // 复用 cc-switch 的 json_server_to_toml_table()
        // ...
    }

    /// 转换为 Gemini CLI 格式
    fn to_gemini_format(
        &self,
        provider: &Provider,
        mcp_servers: &[McpServer],
        skills: &[Skill],
    ) -> Result<(String, Value), ConfigExportError> {
        // 返回 (.env 内容, settings.json 内容)
        // ...
    }

    /// 转换为 OpenCode 格式
    fn to_opencode_format(
        &self,
        provider: &Provider,
        mcp_servers: &[McpServer],
        skills: &[Skill],
    ) -> Result<Value, ConfigExportError> {
        // ...
    }

    /// 转换为 OpenClaw 格式
    fn to_openclaw_format(
        &self,
        provider: &Provider,
    ) -> Result<Value, ConfigExportError> {
        // OpenClaw 不支持 MCP 和 Skills
        // ...
    }
}
```

---

### 3. Writer（配置文件写入器）

**职责**：原子写入配置文件。

**核心方法**：

```rust
impl Writer {
    /// 写入配置到指定工具
    pub async fn write_config(
        &self,
        tool_name: &str,
        config: &ToolConfig,
    ) -> Result<(), ConfigExportError> {
        match tool_name {
            "claude-code" => self.write_claude_code(config).await,
            "codex" => self.write_codex(config).await,
            "gemini-cli" => self.write_gemini(config).await,
            "opencode" => self.write_opencode(config).await,
            "openclaw" => self.write_openclaw(config).await,
            _ => Err(ConfigExportError::UnsupportedTool(tool_name.to_string())),
        }
    }

    /// 写入 Codex 配置（多文件原子写入）
    async fn write_codex(&self, config: &ToolConfig) -> Result<(), ConfigExportError> {
        // 直接复用 cc-switch 的 write_codex_live_atomic()
        let (auth_json, config_toml) = config.as_codex_format()?;
        crate::codex_config::write_codex_live_atomic(&auth_json, Some(&config_toml))?;
        Ok(())
    }

    /// 单文件原子写入（temp + rename）
    async fn atomic_write_single(
        &self,
        path: &str,
        content: &str,
    ) -> Result<(), ConfigExportError> {
        let path = self.expand_path(path)?;
        let temp_path = format!("{}.tmp", path);

        // 写入临时文件
        tokio::fs::write(&temp_path, content).await?;

        // 原子重命名
        tokio::fs::rename(&temp_path, &path).await?;

        Ok(())
    }

    /// 路径展开（跨平台）
    /// - Unix: ~ → $HOME
    /// - Windows: %APPDATA% / %USERPROFILE% → 实际路径
    fn expand_path(&self, path: &str) -> Result<String, ConfigExportError> {
        // 处理 Unix 风格的 ~
        if path.starts_with("~/") {
            let home = dirs::home_dir()
                .ok_or_else(|| ConfigExportError::PathError("无法获取 home 目录".to_string()))?;
            return Ok(path.replacen("~", &home.display().to_string(), 1));
        }

        // 处理 Windows 环境变量
        #[cfg(target_os = "windows")]
        {
            if path.contains("%APPDATA%") {
                if let Some(appdata) = std::env::var_os("APPDATA") {
                    return Ok(path.replace("%APPDATA%", &appdata.to_string_lossy()));
                }
            }
            if path.contains("%USERPROFILE%") {
                if let Some(userprofile) = std::env::var_os("USERPROFILE") {
                    return Ok(path.replace("%USERPROFILE%", &userprofile.to_string_lossy()));
                }
            }
        }

        Ok(path.to_string())
    }
}
```

---

## 错误处理

### Type Definitions 错误

```rust
#[derive(Debug, thiserror::Error)]
pub enum ConfigExportError {
    #[error("Provider 不存在: {0}")]
    ProviderNotFound(String),

    #[error("不支持的认证类型: {0}")]
    UnsupportedAuthType(String),

    #[error("不支持的外部工具: {0}")]
    UnsupportedTool(String),

    #[error("配置转换失败: {0}")]
    TransformError(String),

    #[error("配置文件写入失败: {0}")]
    WriteError(String),

    #[error("路径错误: {0}")]
    PathError(String),

    #[error("JSON 解析错误: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),
}
```

---

## Test Cases

### Test Cases 表格

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-EXPORT-001 | 导出 API Key Provider 到 Claude Code | provider_id="p1", tool="claude-code" | 成功写入 ~/.claude/settings.json + ~/.claude.json |
| TC-EXPORT-002 | 导出 API Key Provider 到 Codex | provider_id="p1", tool="codex" | 成功写入 auth.json + config.toml |
| TC-EXPORT-003 | 导出 OAuth Provider | provider_id="p2" (OAuth), tool="claude-code" | 返回错误：不支持 OAuth |
| TC-EXPORT-004 | Provider 不存在 | provider_id="invalid", tool="claude-code" | 返回错误：Provider 不存在 |
| TC-EXPORT-005 | 不支持的工具 | provider_id="p1", tool="invalid-tool" | 返回错误：不支持的工具 |
| TC-EXPORT-006 | 导出包含 MCP 服务器 | provider_id="p1" (含 MCP), tool="claude-code" | MCP 配置正确写入 |
| TC-EXPORT-007 | 导出包含 Skills | provider_id="p1" (含 Skills), tool="claude-code" | Skills 配置正确写入到 permissions.allow |
| TC-EXPORT-008 | 导出到 OpenClaw（不支持 MCP） | provider_id="p1" (含 MCP), tool="openclaw" | 仅写入 API Key，忽略 MCP |
| TC-EXPORT-009 | 多文件写入失败回滚 | Codex 写入 config.toml 失败 | auth.json 回滚到原始状态 |
| TC-EXPORT-010 | 路径展开 | 配置路径包含 ~ | 正确展开为实际 home 目录 |
| TC-EXPORT-011 | 批量导出部分失败 | 3个导出请求，1个失败 | 返回成功2个，失败1个的详细信息 |
| TC-EXPORT-012 | TOML 格式转换 | JSON MCP 配置 | 正确转换为 TOML 格式 |
| TC-EXPORT-013 | 测试隔离 - 不污染真实配置 | 运行测试 | 测试使用临时目录，不写入 ~/.claude 等真实路径 |
| TC-EXPORT-014 | base_url 导出 | provider 有 custom base_url | 正确写入到目标工具配置 |
| TC-EXPORT-015 | 取消配置（禁用 Provider） | tool="claude-code" 已启用 provider="p1"，调用 disable | 清除启用状态，tool_enabled_state.json 中移除该工具的记录 |
| TC-EXPORT-016 | 取消不存在的配置 | tool="claude-code" 未启用任何 Provider，调用 disable | 成功返回，状态文件不变 |

### Test Cases 配置残留/误删修复 (v5.10.0)

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-WRITER-014 | JSON 导出清除旧 mcpServers | 现有文件有 mcpServers，新导出无 MCP | mcpServers 字段被删除 |
| TC-WRITER-015 | JSON 导出清除旧 permissions | 现有文件有 permissions，新导出无 skills | permissions 字段被删除 |
| TC-WRITER-016 | JSON 导出保留无关字段 | 现有文件有 user_field，新导出无此字段 | user_field 保留不变 |
| TC-WRITER-017 | Codex TOML 保留用户 permissions | 现有 TOML 有手写 permissions，新导出无 skills | permissions 保留不变 |
| TC-WRITER-018 | Codex TOML 有 skills 时覆盖 permissions | 现有 TOML 有手写 permissions，新导出有 skills | permissions.allow 被覆盖 |
| TC-WRITER-019 | Claude 去掉 baseUrl 后不残留 | 旧 settings 有 api.baseUrl，新导出无 baseUrl | api 对象中无 baseUrl |
| TC-WRITER-020 | OpenCode 去掉 baseURL 后不残留 | 旧配置有 provider.{id}.options.baseURL，新导出无 baseURL | options 中无 baseURL |
| TC-WRITER-021 | OpenClaw 去掉 baseUrl 后不残留 | 旧配置有 baseUrl，新导出无 baseUrl | 配置中无 baseUrl |
| TC-WRITER-022 | 删除自定义 endpoint 后配置不残留 | 旧配置有 custom endpoint，新导出切换回默认 endpoint | 配置文件中 baseUrl/baseURL 等字段被完全删除，不残留旧值 |
| TC-WRITER-023 | 断开连接时旧请求结果被丢弃并清理配置 | 用户断开连接，但旧的异步请求仍在进行 | 旧请求返回时被识别并丢弃，不更新 UI 状态，并调用 disable 清理已写入的配置文件 |

### Test Cases Windows 命令包装

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-WRAPPER-001 | 判断 Node.js 工具链命令需要包装 | "npx", "npm", "node", "yarn", "pnpm", "bun", "deno" | 返回 true |
| TC-WRAPPER-002 | 判断非 Node.js 命令不需要包装 | "python", "uvx", "docker", "custom-binary" | 返回 false |
| TC-WRAPPER-003 | 包装命令和参数 | command="npx", args=["-y", "@modelcontextprotocol/server-filesystem", "/path"] | cmd="cmd", args=["/c", "npx", "-y", "@modelcontextprotocol/server-filesystem", "/path"] |
| TC-WRAPPER-004 | 包装无参数命令 | command="node", args=[] | cmd="cmd", args=["/c", "node"] |
| TC-WRAPPER-005 | 包装 yarn 命令 | command="yarn", args=["dlx", "some-package"] | cmd="cmd", args=["/c", "yarn", "dlx", "some-package"] |
| TC-WRAPPER-006 | 大小写不敏感匹配 | "NPX", "Npm", "NODE" | 返回 true（需要包装） |
| TC-WRAPPER-007 | 处理 .cmd 后缀 | "npx.cmd", "npm.cmd" | 返回 true（需要包装） |
| TC-WRAPPER-008 | 处理带路径的命令 | "C:\\Program Files\\nodejs\\npx.cmd" | 返回 true（需要包装） |
| TC-WRAPPER-009 | Unix 路径中的命令 | "/usr/local/bin/npx" | 返回 true（需要包装） |

---

## 实现计划

### Phase 1：基础框架（1-2天）

1. 创建目录结构
2. 定义错误类型
3. 实现路径获取和展开
4. 实现单文件原子写入

### Phase 2：格式转换器（2-3天）

1. 从 cc-switch 复用 TOML 转换逻辑
2. 实现 Claude Code 格式转换
3. 实现 Codex 格式转换
4. 实现 Gemini CLI 格式转换
5. 实现 OpenCode/OpenClaw 格式转换

### Phase 3：导出服务（1-2天）

1. 实现 ExportService 核心逻辑
2. 集成 Transformer 和 Writer
3. 实现批量导出

### Phase 4：Tauri 命令层（1天）

1. 实现 Tauri 命令
2. 错误处理和日志记录

### Phase 5：测试（2-3天）

1. 编写单元测试（覆盖所有测试用例）
2. 集成测试
3. 手动测试各外部工具

---

## 前端 UI 设计

### 页面结构

Config-Switcher 作为一级核心模块，在主导航中显示为独立入口。

```
主导航
├── Providers（供应商管理）
├── MCP Servers（MCP 服务器管理）
├── Skills（技能管理）
└── Config Switcher（配置导出）← 新增
```

### 设计思路

**复用 cc-switch 的核心组件**：
- `AppSwitcher` 组件：用于选择目标 CLI 工具（Claude Code / Codex / Gemini CLI / OpenCode / OpenClaw）
- 保持 MobausStudio 的页面布局风格
- 融合两者的优点：MobausStudio 的整体设计 + cc-switch 的工具切换逻辑

### 页面布局

#### 主页面：ConfigSwitcherPage

**布局**：单页面，顶部工具切换 + 中间配置区域

```
┌─────────────────────────────────────────────────────────┐
│ Config Switcher                                    [?]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Select Target CLI Tool                          │  │
│  │                                                 │  │
│  │  [Claude Code] [Codex] [Gemini] [OpenCode] [OpenClaw] │
│  │   (复用 cc-switch 的 AppSwitcher 组件)          │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Export Configuration                            │  │
│  │                                                 │  │
│  │  Provider:                                      │  │
│  │  ┌─────────────────────────────────────────┐   │  │
│  │  │ [v] Anthropic (API Key)                 │   │  │
│  │  │ [ ] OpenAI (API Key)                    │   │  │
│  │  │ [ ] Google (OAuth - 不支持)             │   │  │
│  │  └─────────────────────────────────────────┘   │  │
│  │                                                 │  │
│  │  Export Content:                                │  │
│  │  • API Key / Credentials                        │  │
│  │  • MCP Servers (3 enabled) - 自动包含          │  │
│  │  • Skills (0 available) - 自动包含             │  │
│  │                                                 │  │
│  │  Target Path:                                   │  │
│  │  ~/.claude/settings.json                        │  │
│  │  ~/.claude.json (MCP)                           │  │
│  │                                                 │  │
│  │                          [Export to Claude Code] │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 组件设计

#### 1. ProviderCard（Provider 选择卡片）

**功能**：显示可导出的 Provider 列表。

**状态**：
- 选中/未选中
- 禁用（OAuth 类型）

**显示信息**：
- Provider 名称
- 认证类型（API Key / OAuth）
- 禁用原因（OAuth 不支持）

**交互**：
- 单选（一次只能导出一个 Provider）
- OAuth Provider 显示禁用状态 + Tooltip 提示

#### 2. ExportTargetCard（导出目标卡片）

**功能**：显示外部工具列表。

**状态**：
- 可选中/未选中
- 多选（可同时导出到多个工具）

**显示信息**：
- 工具名称
- 配置文件路径（跨平台显示）
- 支持的功能（MCP / Skills）

**交互**：
- 多选 Checkbox
- 点击卡片展开详细信息

#### 3. ExportInfoPanel（导出信息面板）

**功能**：显示将要导出的内容。

**显示信息**：
- API Key / Credentials
- MCP Servers（显示启用数量）
- Skills（显示可用数量）
- 目标配置文件路径

**交互**：
- 只读显示，无需用户交互
- 实时更新统计信息

#### 4. ExportButton（导出按钮）

**功能**：执行导出操作。

**状态**：
- 禁用（未选择 Provider 或 Target）
- 加载中（导出进行中）
- 正常

**交互**：
- 点击触发导出
- 显示进度 Toast
- 成功/失败通知

### 交互流程

#### 流程 1：单工具启用（主流程）

```
1. 用户切换工具 tab（Claude Code / Codex / Gemini CLI / OpenCode / OpenClaw）
   - 切换时有淡入动画效果
   - 自动加载该工具的配置路径
2. 查看已连接的 Provider 列表（仅显示已连接且支持 API Key 的 Provider）
3. 点击某个 Provider 右侧的 [Enable for {Tool}] 按钮
4. 显示加载状态（按钮变为 "Enabling..."）
5. 导出完成后显示结果通知
   - 成功：✅ "已为 Claude Code 启用 Anthropic（包含 3 个 MCP 服务器）"
   - 失败：❌ "启用失败：Provider 不存在"
6. 切换到其他工具 tab，重复步骤 2-5
```

**关键特性**：

- ✅ 启用按钮在每个 Provider 卡片右侧
- ✅ 非连接 Provider 不显示
- ✅ 切换工具时有平滑动画
- ✅ 无需选择 Provider，直接点击启用按钮

#### 流程 2：OAuth Provider 提示

```
1. 用户尝试选择 OAuth Provider
2. 显示 Tooltip：
   "OAuth 认证类型暂不支持直接导出。
    请使用代理服务器或手动配置。"
3. Provider 卡片保持禁用状态
```

### 状态管理

#### ConfigSwitcherState

```typescript
interface ConfigSwitcherState {
  // 当前选中的工具（单选）
  activeToolId: ToolId;  // "claude-code" | "codex" | "gemini-cli" | "opencode" | "openclaw"

  // Provider 列表
  providers: Provider[];
  selectedProviderId: string | null;

  // MCP/Skills 统计（只读显示）
  enabledMcpCount: number;
  availableSkillsCount: number;

  // 导出状态
  isExporting: boolean;
}

interface Provider {
  id: string;
  name: string;
  authType: 'api' | 'oauth';
  isSupported: boolean;  // OAuth = false
}

type ToolId = 'claude-code' | 'codex' | 'gemini-cli' | 'opencode' | 'openclaw';
```

### API 调用

#### 1. 获取 Providers

```typescript
// 使用后端实际的命令名
const credentials = await invoke<ProviderCredential[]>('load_provider_credentials');

// 过滤出支持的 Provider（仅 API Key）
const supportedProviders = credentials
  .filter(c => c.type === 'api')
  .map(c => ({
    id: c.provider_id,
    name: c.provider_id, // 或从 providers 配置中获取显示名称
    authType: c.type,
    isSupported: true
  }));
```

#### 2. 获取 Export Targets

```typescript
const targets = await invoke<ExternalTool[]>('get_supported_tools');
```

#### 3. 获取 MCP/Skills 统计（用于显示）

```typescript
const mcpServers = await invoke<MCPServerConfig[]>('load_mcp_servers');
const enabledMcpCount = mcpServers.filter(s => s.enabled).length;

const skills = await invoke<Skill[]>('load_skills');
const availableSkillsCount = skills.length;
```

#### 3. 执行启用（导出）

```typescript
// 为当前工具启用选中的 Provider
await invoke('export_provider_to_tool', {
  providerId: selectedProviderId,
  toolName: activeToolId
});
```

**注意**：

- MCP 服务器和 Skills 会自动包含在导出中（如果存在且已启用）
- 前端只需显示统计信息，无需提供开关选项
- 每次只操作一个工具，不支持批量导出

### 错误处理

#### 错误类型

| 错误类型 | 显示方式 | 用户操作 |
|---------|---------|---------|
| Provider 不存在 | Toast 错误通知 | 刷新页面 |
| OAuth 不支持 | Tooltip + 禁用状态 | 无需操作 |
| 配置文件写入失败 | Modal 错误详情 | 查看日志 / 重试 |

#### 错误提示文案

```typescript
const ERROR_MESSAGES = {
  PROVIDER_NOT_FOUND: '找不到指定的 Provider，请刷新页面后重试',
  OAUTH_NOT_SUPPORTED: 'OAuth 认证类型暂不支持直接导出，请使用代理服务器',
  WRITE_FAILED: '配置文件写入失败，请检查文件权限',
  UNKNOWN_ERROR: '导出失败，请查看日志获取详细信息'
};
```

### 国际化

#### 中文（zh）

```json
{
  "configSwitcher": {
    "title": "配置导出",
    "providers": "供应商",
    "exportTargets": "导出目标",
    "exportInfo": "导出内容",
    "exportButton": "导出选中项",
    "exporting": "正在导出...",
    "exportSuccess": "导出成功",
    "exportFailed": "导出失败",
    "oauthNotSupported": "OAuth 认证类型暂不支持",
    "mcpServers": "MCP 服务器",
    "skills": "Skills",
    "autoIncluded": "自动包含"
  }
}
```

#### 英文（en）

```json
{
  "configSwitcher": {
    "title": "Config Switcher",
    "providers": "Providers",
    "exportTargets": "Export Targets",
    "exportInfo": "Export Content",
    "exportButton": "Export Selected",
    "exporting": "Exporting...",
    "exportSuccess": "Export Successful",
    "exportFailed": "Export Failed",
    "oauthNotSupported": "OAuth authentication not supported",
    "mcpServers": "MCP Servers",
    "skills": "Skills",
    "autoIncluded": "Auto-included"
  }
}
```

### Test Cases 前端

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|----------|
| TC-UI-001 | 页面加载 | 打开 Config Switcher 页面 | 显示 Providers 和 Export Targets 列表 |
| TC-UI-002 | 选择 API Key Provider | 点击 Anthropic Provider | Provider 卡片高亮，Export 按钮可用 |
| TC-UI-003 | 尝试选择 OAuth Provider | 点击 Google OAuth Provider | 显示 Tooltip 提示，卡片保持禁用 |
| TC-UI-004 | 选择单个 Export Target | 勾选 Claude Code | Target 卡片选中状态 |
| TC-UI-005 | 选择多个 Export Target | 勾选 Claude Code + Codex | 两个 Target 卡片选中 |
| TC-UI-006 | 单个导出成功 | 选择 Provider + Target，点击 Export | 显示成功 Toast |
| TC-UI-007 | 批量导出成功 | 选择 Provider + 3个 Targets，点击 Export | 显示进度，最终显示成功通知 |
| TC-UI-008 | 批量导出部分失败 | 3个导出，1个失败 | 显示 "成功 2 个，失败 1 个" + 失败详情 |
| TC-UI-009 | 导出失败 | Provider 不存在或认证失败 | 显示错误 Toast，包含错误信息 |
| TC-UI-010 | MCP 统计显示 | 有 3 个启用的 MCP 服务器 | 显示 "MCP Servers (3 enabled) - 自动包含" |
| TC-UI-011 | 未选择 Provider | 不选择 Provider，点击 Export | Export 按钮禁用 |
| TC-UI-012 | 未选择 Target | 选择 Provider，不选择 Target | Export 按钮禁用 |
| TC-UI-013 | 跨平台路径显示 | macOS 系统 | 显示 ~/.claude/settings.json |
| TC-UI-014 | 跨平台路径显示 | Windows 系统 | 显示 %USERPROFILE%\.claude\settings.json |

### 组件文件结构

```
src/pages/
└── ConfigSwitcher/
    ├── index.tsx                    # 主页面
    ├── components/
    │   ├── ProviderCard.tsx         # Provider 选择卡片
    │   ├── ExportTargetCard.tsx     # Export Target 卡片
    │   ├── ExportInfoPanel.tsx      # 导出信息面板（显示 MCP/Skills 统计）
    │   └── ExportButton.tsx         # 导出按钮
    ├── hooks/
    │   ├── useConfigSwitcher.ts     # 状态管理 Hook
    │   └── useExport.ts             # 导出逻辑 Hook
    └── types.ts                     # TypeScript 类型定义
```

---

## 待实现功能（参考 cc-switch）

基于 [cc-switch](https://github.com/SaladDay/cc-switch-cli) 项目的功能分析，以下是待实现的功能列表，按优先级排序。

### 🔥 高优先级（必须有）

#### 1. 配置备份与恢复

**功能描述**：

- 导出前自动备份现有配置文件
- 手动创建备份（支持自定义名称）
- 交互式恢复（选择特定备份）
- 自动轮转（保留最近 10 个备份）

**实现要点**：

- 备份存储路径：`~/.mobaus/backups/{tool_name}/{timestamp}/`
- 备份文件命名：`{tool_name}_{timestamp}.tar.gz`
- 恢复时显示备份列表（时间、大小、备注）
- 支持从备份文件恢复到指定工具

**测试用例**：

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-BACKUP-001 | 导出前自动备份 | 导出配置到 Claude Code | 自动创建备份到 ~/.mobaus/backups/claude-code/ |
| TC-BACKUP-002 | 手动创建备份 | 点击"创建备份"按钮 | 创建带自定义名称的备份 |
| TC-BACKUP-003 | 恢复配置 | 选择备份并恢复 | 配置文件恢复到备份时的状态 |
| TC-BACKUP-004 | 备份轮转 | 创建第 11 个备份 | 自动删除最旧的备份 |

---

#### 2. 配置验证

**功能描述**：

- 导出前验证 API Key 格式
- 检查 MCP 命令是否在 PATH 中
- 验证配置文件 JSON/TOML 格式
- 检查必填字段完整性

**实现要点**：

- API Key 格式验证（正则表达式）
- MCP 命令存在性检查（`which` / `where` 命令）
- JSON/TOML 格式校验（serde 反序列化）
- 验证失败时显示详细错误信息

**测试用例**：

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-VALIDATE-001 | API Key 格式错误 | api_key="invalid" | 返回错误：API Key 格式不正确 |
| TC-VALIDATE-002 | MCP 命令不存在 | command="non-existent-cmd" | 返回警告：命令未找到 |
| TC-VALIDATE-003 | JSON 格式错误 | 手动修改配置文件 | 返回错误：JSON 格式不正确 |
| TC-VALIDATE-004 | 必填字段缺失 | 缺少 api_key 字段 | 返回错误：缺少必填字段 |

---

#### 3. 延迟测试

**功能描述**：

- 测试 Provider API 响应速度
- 对比多个 Provider 的延迟
- 显示延迟结果（毫秒）
- 标记最快的 Provider

**实现要点**：

- 发送测试请求到 Provider API（`/v1/models` 或类似端点）
- 计算往返时间（RTT）
- 支持批量测试多个 Provider
- 超时处理（默认 5 秒）

**测试用例**：

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-LATENCY-001 | 测试单个 Provider | 点击"测试延迟"按钮 | 显示延迟结果（如 120ms） |
| TC-LATENCY-002 | 批量测试 | 测试所有 Provider | 显示延迟列表，标记最快的 |
| TC-LATENCY-003 | 超时处理 | Provider 无响应 | 显示"超时"状态 |
| TC-LATENCY-004 | 网络错误 | 网络断开 | 显示"网络错误"状态 |

---

### 🌟 中优先级（很有用）

#### 4. 配置预览

**功能描述**：

- 导出前预览将要写入的配置内容
- 差异对比（当前配置 vs 新配置）
- 支持 JSON/TOML/ENV 格式高亮显示

**实现要点**：

- 读取现有配置文件
- 生成新配置内容（不写入）
- 使用 diff 算法对比差异
- 前端使用代码编辑器组件（Monaco Editor）

---

#### 5. 配置导入

**功能描述**：

- 从外部工具导入配置到 MobausStudio
- 从备份文件恢复
- 从其他 cc-switch 实例导入

**实现要点**：

- 读取外部工具配置文件
- 解析并转换为 MobausStudio 内部格式
- 写入到 `provider_credentials.json` / `mcp_servers.json` / `skills.json`
- 支持选择性导入（仅导入 Provider / MCP / Skills）

**注意**：文档中明确排除了此功能，但实际使用中可能很有用。

---

#### 6. 环境冲突检查

**功能描述**：

- 检测环境变量冲突（如 `ANTHROPIC_API_KEY`）
- 检测配置文件冲突（多个工具使用同一配置文件）
- 提供冲突解决建议

**实现要点**：

- 读取系统环境变量
- 检查是否存在与 Provider 相关的环境变量
- 检查配置文件是否被多个工具使用
- 显示冲突警告和解决方案

---

### 💡 低优先级（锦上添花）

#### 7. 本地 API 代理

**功能描述**：

- 请求拦截和转发
- 自动故障转移到备份 Provider
- 请求日志记录
- Token 使用量追踪和成本监控
- 熔断器（自动故障隔离）

**实现要点**：

- 启动本地 HTTP 代理服务器（如 `http://localhost:8080`）
- 拦截 AI CLI 工具的 API 请求
- 根据配置转发到不同 Provider
- 记录请求日志和 Token 使用量
- 实现熔断器模式（连续失败后自动切换）

**注意**：这是高级功能，适合企业用户或高级用户。

---

#### 8. 云同步支持

**功能描述**：

- 支持 Dropbox / OneDrive / iCloud Drive 同步
- 多设备配置共享
- 自动同步配置变更

**实现要点**：

- 将配置文件存储到云盘目录
- 监听文件变更并自动同步
- 冲突解决（最后修改时间优先）

---

#### 9. Skills 自动发现

**功能描述**：

- 从 GitHub 仓库自动发现 Skills
- 扫描并导入未管理的 Skills
- Skills 仓库管理

**实现要点**：

- 从 GitHub API 获取 Skills 列表
- 扫描 `~/.claude/skills/` 目录
- 识别未管理的 Skills 并提示导入
- 支持添加自定义 Skills 仓库

---

#### 10. Common Snippet

**功能描述**：

- 跨 Provider 共享的通用配置片段
- 避免重复配置
- 支持模板变量替换

**实现要点**：

- 定义通用配置片段（如 `timeout`, `max_tokens`）
- 在导出时自动合并到 Provider 配置中
- 支持变量替换（如 `{{provider_name}}`）

---

## 实现优先级建议

根据用户需求和实用性，建议按以下顺序实现：

1. **Phase 6：配置备份与恢复**（1-2天）
   - 实现自动备份逻辑
   - 实现恢复界面
   - 实现备份轮转

2. **Phase 7：配置验证**（1天）
   - 实现 API Key 格式验证
   - 实现 MCP 命令检查
   - 实现配置文件格式校验

3. **Phase 8：延迟测试**（1天）
   - 实现延迟测试逻辑
   - 实现批量测试
   - 实现结果显示

4. **Phase 9：配置预览**（1-2天）
   - 实现配置预览界面
   - 实现差异对比
   - 集成代码编辑器

5. **Phase 10+：其他功能**（按需实现）
   - 配置导入
   - 环境冲突检查
   - 本地 API 代理
   - 云同步支持
   - Skills 自动发现
   - Common Snippet

---

## 当前版本 (v5.7.0)

### 已实现功能

#### Core Features
- ✅ **配置导出**：将 MobausStudio 内部配置导出到外部 AI CLI 工具
- ✅ **格式转换**：自动转换为各工具所需格式（TOML/JSON/ENV）
- ✅ **原子写入**：保证配置文件完整性（temp+rename 或 backup+restore）
- ✅ **跨平台路径**：根据操作系统自动选择正确的配置目录
- ✅ **MCP/Skills 同步**：同时导出关联的 MCP 服务器和 Skills 配置
- ✅ **启用状态持久化**：记录每个工具当前启用的 Provider，刷新页面后保持状态

#### 支持的外部工具
- ✅ Claude Code（~/.claude/settings.json + ~/.claude.json）
- ✅ Codex（~/.codex/auth.json + ~/.codex/config.toml）
- ✅ Gemini CLI（~/.gemini/.env + ~/.gemini/settings.json）
- ✅ OpenCode（~/.opencode/config.json）
- ✅ OpenClaw（~/.openclaw/config.json）

#### 配置保留逻辑
- ✅ **Codex config.toml 保留**：使用 `toml_edit` 只更新 `base_url` 和 `mcp_servers`，保留用户其他字段和注释
- ✅ **Claude permissions 深度合并**：递归合并 `permissions` 对象，保留用户的 `deny` 规则
- ✅ **Windows MCP 命令包装**：自动为 `npx`/`npm`/`node`/`yarn`/`pnpm`/`bun`/`deno` 添加 `cmd /c` 前缀

#### 数据一致性
- ✅ **Codex 迁移逻辑**：自动迁移错误格式 `mcp.servers` → `mcp_servers`，并清理旧值
- ✅ **Codex 清理逻辑**：当 MCP 服务器或 Skills 无启用项时，清理 config.toml 中的旧值
- ✅ **base_url 字段对齐**：从 `custom_providers.json` 读取 `endpoint` 字段（与前端数据模型对齐）

### 已知限制

#### 认证类型
- ❌ **OAuth 不支持**：仅支持 API Key 认证类型，OAuth 需要使用代理服务器
- ✅ **API Key 支持**：支持所有使用 API Key 认证的 Provider

#### 配置导入
- ❌ **不支持导入**：当前版本不支持从外部工具导入配置到 MobausStudio
- ✅ **单向导出**：仅支持 MobausStudio → 外部工具的单向导出

#### 配置备份
- ❌ **无自动备份**：导出前不会自动备份现有配置文件
- ⚠️ **手动备份建议**：建议用户在首次导出前手动备份配置文件

#### 配置验证
- ❌ **无 API Key 验证**：不验证 API Key 格式或有效性
- ❌ **无 MCP 命令检查**：不检查 MCP 命令是否在 PATH 中

#### 延迟测试
- ❌ **无延迟测试**：不支持测试 Provider API 响应速度

#### 配置预览
- ❌ **无配置预览**：导出前不支持预览将要写入的配置内容
- ❌ **无差异对比**：不支持对比当前配置 vs 新配置

### 测试覆盖率

#### 后端测试
- ✅ **135/135 测试通过**
- ✅ **无编译警告**
- ✅ **测试隔离**：使用临时目录，不污染真实配置

#### 前端测试
- ✅ **25/25 测试通过**
- ✅ **无 React 警告**
- ✅ **异步状态测试**：所有测试使用 `waitFor` 等待异步状态更新

### 待实现功能

参考 [cc-switch](https://github.com/SaladDay/cc-switch-cli) 项目，以下功能按优先级排序：

#### 🔥 高优先级
1. **配置备份与恢复**：导出前自动备份，支持恢复到指定备份
2. **配置验证**：验证 API Key 格式、MCP 命令存在性、配置文件格式
3. **延迟测试**：测试 Provider API 响应速度，对比多个 Provider

#### 🌟 中优先级
4. **配置预览**：导出前预览配置内容，差异对比
5. **配置导入**：从外部工具导入配置到 MobausStudio
6. **环境冲突检查**：检测环境变量冲突、配置文件冲突

#### 💡 低优先级
7. **本地 API 代理**：请求拦截和转发、自动故障转移、Token 使用量追踪
8. **云同步支持**：Dropbox / OneDrive / iCloud Drive 同步
9. **Skills 自动发现**：从 GitHub 仓库自动发现 Skills
10. **Common Snippet**：跨 Provider 共享的通用配置片段

---

## OAuth Proxy 设计（待实现）

### 背景

当前版本仅支持 API Key 认证类型，OAuth 认证的 Provider（如 Google、GitHub 等）无法直接导出。参考 [CCS](https://github.com/kaitranntt/ccs) 和 [cc-switch](https://github.com/SaladDay/cc-switch-cli) 的实现，需要通过本地 Proxy 服务来支持 OAuth 认证。

### Architecture Design

#### 整体架构

```
MobausStudio (Tauri App)
    ↓
OAuth Proxy Server (http://localhost:8080)
    ↓ (处理 OAuth 认证 + Token 管理)
    ↓
External AI CLI Tools (Claude Code, Codex, Gemini CLI)
    ↓
AI Provider APIs (Google, GitHub, etc.)
```

#### 核心模块

```
src-tauri/src/services/
└── oauth_proxy/
    ├── mod.rs                  # 模块入口
    ├── server.rs               # HTTP 服务器（axum）
    ├── oauth_flow.rs           # OAuth 认证流程
    ├── token_manager.rs        # Token 管理（存储、刷新）
    ├── proxy_handler.rs        # 请求代理和转发
    └── providers/              # OAuth Provider 实现
        ├── google.rs           # Google OAuth
        ├── github.rs           # GitHub OAuth
        └── mod.rs
```

### OAuth 认证流程

#### 1. 首次认证

```rust
// 伪代码
async fn oauth_login(provider: &str) -> Result<Token> {
    // 1. 生成 OAuth URL（带 state 和 PKCE）
    let (auth_url, state, verifier) = generate_oauth_url(provider)?;

    // 2. 打开浏览器进行认证
    open_browser(&auth_url)?;

    // 3. 启动本地回调服务器（监听 http://localhost:3000/callback）
    let code = wait_for_callback(state).await?;

    // 4. 交换 access_token
    let token = exchange_token(provider, code, verifier).await?;

    // 5. 加密存储 token
    save_token_encrypted(provider, &token)?;

    Ok(token)
}
```

#### 2. Token 刷新

```rust
async fn refresh_token_if_needed(provider: &str) -> Result<Token> {
    let token = load_token(provider)?;

    if token.is_expired() {
        // 使用 refresh_token 获取新的 access_token
        let new_token = refresh_access_token(provider, &token.refresh_token).await?;
        save_token_encrypted(provider, &new_token)?;
        Ok(new_token)
    } else {
        Ok(token)
    }
}
```

### Proxy 服务实现

#### 1. HTTP 服务器

```rust
use axum::{Router, routing::any};

async fn start_proxy_server() -> Result<()> {
    let app = Router::new()
        .route("/claude/*path", any(proxy_claude))
        .route("/gemini/*path", any(proxy_gemini))
        .route("/github/*path", any(proxy_github))
        .route("/health", get(health_check));

    let listener = tokio::net::TcpListener::bind("127.0.0.1:8080").await?;
    axum::serve(listener, app).await?;

    Ok(())
}
```

#### 2. 请求代理

```rust
async fn proxy_request(
    provider: &str,
    path: &str,
    req: Request<Body>
) -> Result<Response<Body>> {
    // 1. 获取或刷新 token
    let token = refresh_token_if_needed(provider).await?;

    // 2. 构建目标 URL
    let target_url = format!("{}/{}", get_provider_base_url(provider), path);

    // 3. 添加 Authorization header
    let mut headers = req.headers().clone();
    headers.insert(
        "Authorization",
        format!("Bearer {}", token.access_token).parse()?
    );

    // 4. 转发请求
    let client = reqwest::Client::new();
    let resp = client
        .request(req.method().clone(), &target_url)
        .headers(headers)
        .body(req.into_body())
        .send()
        .await?;

    // 5. 返回响应
    Ok(resp.into())
}
```

### Token 存储

#### 存储格式

```json
// ~/.mobaus/oauth_tokens.json (加密存储)
{
  "google": {
    "access_token": "ya29.xxx",
    "refresh_token": "1//xxx",
    "expires_at": "2026-03-08T12:00:00Z",
    "scope": "https://www.googleapis.com/auth/generative-language"
  },
  "github": {
    "access_token": "gho_xxx",
    "refresh_token": "ghr_xxx",
    "expires_at": "2026-03-08T12:00:00Z",
    "scope": "read:user"
  }
}
```

#### 加密方案

使用 `aes-gcm` 加密 token 文件：

```rust
use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::aead::{Aead, KeyInit};

fn encrypt_token_file(data: &str, key: &[u8]) -> Result<Vec<u8>> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(b"unique nonce"); // 实际使用随机 nonce

    let ciphertext = cipher.encrypt(nonce, data.as_bytes())?;
    Ok(ciphertext)
}
```

### 配置导出集成

#### OAuth Provider 导出逻辑

```rust
// export_service.rs
pub async fn export_provider(
    &self,
    provider_id: &str,
    tool_name: &str,
) -> Result<(), ConfigExportError> {
    let provider = self.load_provider(provider_id)?;

    match provider.auth_type.as_str() {
        "api" => {
            // 现有逻辑：直接导出 API Key
            self.export_api_key_provider(provider, tool_name)?;
        }
        "oauth" => {
            // 新逻辑：配置指向 Proxy
            self.export_oauth_provider(provider, tool_name)?;
        }
        _ => return Err(ConfigExportError::UnsupportedAuthType),
    }

    Ok(())
}

fn export_oauth_provider(
    &self,
    provider: &Provider,
    tool_name: &str,
) -> Result<()> {
    // 1. 确保 Proxy 服务已启动
    ensure_proxy_running()?;

    // 2. 生成配置指向 Proxy
    let config = match tool_name {
        "claude-code" => json!({
            "api": {
                "baseUrl": "http://localhost:8080/claude",
                "apiKey": "proxy-managed"  // 占位符
            }
        }),
        "codex" => json!({
            "base_url": "http://localhost:8080/codex"
        }),
        _ => return Err(ConfigExportError::UnsupportedTool),
    };

    // 3. 写入配置文件
    self.writer.write_config(tool_name, &config)?;

    Ok(())
}
```

### UI 设计

#### 1. OAuth 认证界面

```
┌─────────────────────────────────────────────────────────┐
│ OAuth Authentication                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Provider: Google Gemini                                │
│                                                         │
│  Status: ⏳ Waiting for browser authentication...      │
│                                                         │
│  Steps:                                                 │
│  1. ✅ Browser opened                                   │
│  2. ⏳ Waiting for authorization...                     │
│  3. ⏸️  Exchange token                                  │
│                                                         │
│  [Cancel]                                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 2. Token 管理界面

```
┌─────────────────────────────────────────────────────────┐
│ OAuth Tokens                                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Google Gemini                                          │
│  Status: ✅ Active                                      │
│  Expires: 2026-03-08 12:00:00                          │
│  [Refresh] [Revoke]                                     │
│                                                         │
│  GitHub Copilot                                         │
│  Status: ⚠️  Expired                                    │
│  Expires: 2026-03-07 10:00:00                          │
│  [Re-authenticate]                                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 安全考虑

#### 1. Token 加密

- 使用 AES-256-GCM 加密存储
- 密钥派生自系统密钥链（macOS Keychain / Windows Credential Manager）
- 每次启动时解密到内存

#### 2. Proxy 安全

- 仅监听 localhost，不暴露到外网
- 使用随机端口（如果 8080 被占用）
- 添加请求签名验证（防止本地恶意程序滥用）

#### 3. Token 刷新

- 后台定时检查 token 过期时间
- 提前 5 分钟自动刷新
- 刷新失败时通知用户重新认证

### 实现计划

#### Phase 1：基础框架（2-3天）

1. 创建 `oauth_proxy` 模块结构
2. 实现 HTTP 服务器（axum）
3. 实现 Token 存储和加密
4. 添加健康检查端点

#### Phase 2：OAuth 认证流程（3-4天）

1. 实现 Google OAuth 流程
2. 实现 GitHub OAuth 流程
3. 实现浏览器回调处理
4. 实现 Token 刷新逻辑

#### Phase 3：Proxy 转发（2-3天）

1. 实现请求代理逻辑
2. 添加 Authorization header
3. 处理错误和重试
4. 添加请求日志

#### Phase 4：集成到导出服务（1-2天）

1. 修改 `export_service.rs` 支持 OAuth
2. 配置文件指向 Proxy
3. 确保 Proxy 服务自动启动

#### Phase 5：UI 实现（2-3天）

1. OAuth 认证界面
2. Token 管理界面
3. 状态显示和错误提示

#### Phase 6：测试（2-3天）

1. 单元测试（OAuth 流程、Token 管理）
2. 集成测试（端到端认证流程）
3. 手动测试（各 OAuth Provider）

**总计**：约 12-18 天

### 依赖库

```toml
[dependencies]
# OAuth Proxy
axum = "0.7"                    # HTTP 服务器
tower = "0.4"                   # 中间件
tower-http = "0.5"              # HTTP 中间件
oauth2 = "4"                    # OAuth 2.0 客户端
aes-gcm = "0.10"                # AES-GCM 加密
keyring = "2"                   # 系统密钥链访问
```

### References

- [CCS (Claude Code Switch)](https://github.com/kaitranntt/ccs) - OAuth Proxy 实现参考
- [cc-switch-cli](https://github.com/SaladDay/cc-switch-cli) - 配置管理参考
- [oauth2-proxy](https://github.com/oauth2-proxy/oauth2-proxy) - OAuth 代理参考
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [GitHub OAuth Apps](https://docs.github.com/en/apps/oauth-apps)

---

## Change History

| 日期 | 版本 | 修改人 | 修改内容 |
|------|------|--------|---------|
| 2026-03-07 | 1.0.0 | MobausStudio | 初始版本 - 纯导出模块设计 |
| 2026-03-07 | 2.0.0 | MobausStudio | 重大重构：移除数据库表，改为无状态设计；明确从 cc-switch 复用逻辑 |
| 2026-03-07 | 2.1.0 | MobausStudio | 修正关键问题：Claude 路径改为 ~/.claude/settings.json；Codex auth.json 改为扁平结构；get_data_dir() 使用 app_handle.path().app_data_dir() |
| 2026-03-07 | 2.2.0 | MobausStudio | 修复5个关键问题：(1) 测试隔离 - Writer 支持路径注入；(2) Skills 导出 - Claude Code 写入 permissions.allow；(3) 文档修正 - "只写不读"改为"合并写入"；(4) base_url 支持 - 从 custom_providers.json 提取；(5) 结构体复用 - 使用 lib.rs 的 pub 类型 |
| 2026-03-07 | 3.0.0 | MobausStudio | 新增前端 UI 设计：页面布局、组件设计、交互流程、状态管理、测试用例 |
| 2026-03-07 | 3.1.0 | MobausStudio | 修正文档与实现不一致：(1) API 命名 - 使用实际的 load_provider_credentials/load_mcp_servers/load_skills；(2) 简化 UI - 移除 includeMcp/includeSkills 选项，MCP/Skills 自动包含；(3) 代码结构 - 命令在 lib.rs 而非独立 commands 文件；(4) 测试用例 - 移除不可测场景 |
| 2026-03-07 | 3.2.0 | MobausStudio | 前端实现完成并修复关键问题：(1) 移除假开关 - MCP/Skills 自动包含；(2) Provider 可选条件修正 - 仅显示已连接的 Provider；(3) 分类显示 - 已连接/未连接/不支持；(4) 自动选择首个已连接 Provider；(5) 后端测试全部通过（20/20） |
| 2026-03-08 | 3.3.0 | MobausStudio | 实现批量导出功能：(1) AppSwitcher 支持多选模式；(2) 批量导出进度显示；(3) 批量导出结果汇总；(4) 复用后端 batch_export_providers 命令 |
| 2026-03-08 | 3.4.0 | MobausStudio | 实现路径 API：(1) 后端 get_tool_config_paths 命令；(2) 复用 cc-switch 路径获取逻辑；(3) 前端移除硬编码路径；(4) 跨平台路径展开 |
| 2026-03-08 | 3.5.0 | MobausStudio | 完整国际化：(1) 补全所有 UI 文案的中英文翻译；(2) 使用 useI18n Hook；(3) 支持动态语言切换 |
| 2026-03-08 | 4.0.0 | MobausStudio | 重大重构 - 改为单工具启用模式：(1) 移除多选逻辑，改为单选工具 tab；(2) 交互流程：切换工具 → 选择 Provider → 点击启用；(3) 更新文案：导出 → 启用；(4) 简化状态管理；(5) 参考 cc-switch 的启用逻辑 |
| 2026-03-08 | 4.1.0 | MobausStudio | 优化交互体验（参考 cc-switch）：(1) 启用按钮移到 Provider 卡片右侧；(2) 非连接 Provider 不显示；(3) 添加切换动画（fadeIn）；(4) 移除底部统一启用按钮；(5) 无需选择 Provider，直接点击启用 |
| 2026-03-09 | 4.2.0 | MobausStudio | 协议优先级实现（v0.9.5）：(1) 前端使用 getDefaultProtocol() 获取提供商默认协议；(2) 协议优先级：模型协议 > 提供商默认协议 > 自定义提供商协议；(3) 更新配置流向图，添加协议判断步骤 |
| 2026-03-08 | 4.2.0 | MobausStudio | 完善启用状态和动画：(1) 移除 MCP/Skills 配置显示（应在各自页面配置）；(2) 优化切换动画避免闪烁（0.25s + forwards）；(3) 添加启用状态持久化（已启用显示绿色边框和"已启用"按钮）；(4) 已启用的 Provider 按钮变为绿色且禁用 |
| 2026-03-08 | 4.3.0 | MobausStudio | 完善用户体验：(1) 启用状态持久化到 localStorage（刷新页面保持状态）；(2) 配置路径添加复制按钮（hover 显示）；(3) 优化错误提示（成功/错误/信息三种状态，带图标和颜色）；(4) 错误消息显示时间延长到 5 秒 |
| 2026-03-08 | 4.3.1 | MobausStudio | 修复持久化问题：(1) 移除 localStorage 持久化（会话级别状态）；(2) 启用状态仅在当前会话有效；(3) 刷新页面后重置状态；(4) 配置文件已导出到磁盘，用户可随时重新启用覆盖 |
| 2026-03-08 | 5.0.0 | MobausStudio | 实现后端状态持久化（参考 cc-switch）：(1) 新增 enabled_state.rs 模块管理启用状态；(2) 状态存储在 tool_enabled_state.json；(3) 导出成功后自动更新状态；(4) 前端从后端读取启用状态（get_enabled_providers 命令）；(5) 刷新页面后保持启用状态；(6) 所有测试通过（132/132） |
| 2026-03-08 | 5.1.0 | MobausStudio | UI 优化（参考 cc-switch）：(1) Provider 卡片添加背景渐变和阴影效果；(2) 启用按钮添加 hover 缩放动画；(3) 卡片边框优化（启用状态绿色，hover 紫色）；(4) 所有卡片添加 border 提升层次感；(5) 图标容器添加 hover 缩放效果 |
| 2026-03-08 | 5.2.0 | MobausStudio | 修复 base_url 字段不对齐：(1) export_service.rs:340 改为读取 endpoint 字段；(2) 与前端数据模型对齐；(3) 修复自定义 Provider base URL 导出问题 |
| 2026-03-08 | 5.3.0 | MobausStudio | 修复所有已知问题（参考 cc-switch）：(1) Codex config.toml 保留现有内容（使用 toml_edit）；(2) permissions 深度合并（保留用户 deny 规则）；(3) Windows MCP 命令包装（npx/npm/node 添加 cmd /c）；(4) 所有测试通过（133/133） |
| 2026-03-08 | 5.4.0 | MobausStudio | 修复三个关键缺陷：(1) Codex base_url 字段统一为 base_url（transformer 和 writer 对齐）；(2) Windows 命令包装改为 command="cmd" + args=["/c", "npx", ...]（与 cc-switch 一致）；(3) Codex Skills 配置写入 permissions 表（修复丢失问题）；(4) 所有测试通过（133/133） |
| 2026-03-08 | 5.5.0 | MobausStudio | 实现 ConfigSwitcher 前端测试：(1) 创建 ConfigSwitcher.test.tsx（11个测试用例）；(2) 创建 AppSwitcher.test.tsx（7个测试用例）；(3) 创建 ProviderSelector.test.tsx（7个测试用例）；(4) 所有测试通过（25/25 前端 + 133/133 后端） |
| 2026-03-08 | 5.6.0 | MobausStudio | 修复代码质量问题：(1) P1-3: Codex 清理逻辑完整化 - mcp_servers 和 permissions 无启用项时清理旧值；(2) P2-1: EnabledState 持久化改为原子写入（复用 atomic_write）；(3) P3: 清理未使用的导入和重复代码；(4) 所有测试通过（24/24），无编译警告 |
| 2026-03-08 | 5.7.0 | MobausStudio | 修复 cc-switch 对齐问题：(1) P1: Codex 迁移错误格式 mcp.servers → mcp_servers（添加迁移逻辑和清理）；(2) P2: Windows 命令包装扩展到 yarn/pnpm/bun/deno；(3) P3: 清理 EnabledState 未使用方法（get_enabled_provider, get_all_enabled_providers）；(4) P3: 修复前端 React act(...) 警告（所有测试添加 waitFor 等待异步状态更新）；(5) 新增测试用例 TC-WRITER-012/013；(6) 所有测试通过（后端 135/135，前端 25/25），无编译警告，无 React 警告 |
| 2026-03-08 | 6.0.0 | MobausStudio | 重大改进 - 完善一致性和可维护性：(1) Windows 命令包装提取为公共函数（windows_cmd_wrapper.rs + 5个单元测试）；(2) Provider 断开时自动清理启用状态（save_provider_credentials 中实现）；(3) 新增 3 个集成测试（TC-INTEGRATION-001/002/003：导出更新状态、断开清理状态、Codex 迁移全流程）；(4) 所有单元测试通过（145/145），集成测试需串行运行（使用 TEST_HOME_DIR 环境变量）；(5) 无编译警告 |
| 2026-03-08 | 5.8.0 | MobausStudio | 实现状态一致性闭环：(1) 新增 EnabledState.cleanup_deleted_providers() 方法；(2) save_provider_credentials 命令自动清理已删除 Provider 的启用状态；(3) 新增测试用例 TC-ENABLED-STATE-005/006/007；(4) 文档添加"当前版本"章节（记录已实现功能、已知限制、测试覆盖率、待实现功能）；(5) 所有测试通过（后端 146/146，前端 25/25） |
| 2026-03-08 | 5.8.1 | MobausStudio | 修复集成测试并发问题：(1) 添加 serial_test 依赖；(2) 所有集成测试添加 #[serial] 标记，避免环境变量竞争；(3) 测试稳定性提升，无偶发失败；(4) 所有测试通过（后端 146/146，前端 25/25） |
| 2026-03-09 | 5.9.0 | MobausStudio | 实现禁用功能：(1) 后端新增 disable_provider_for_tool 命令；(2) 前端已启用的 Provider 显示红色"禁用"按钮（可点击禁用）；(3) 禁用后清理工具配置文件和启用状态；(4) 更新测试用例适配新交互逻辑 |
| 2026-03-09 | 5.9.1 | MobausStudio | 修复前端测试失败：(1) TC-UI-005: 修复 export_provider_to_tool 调用参数检查（使用 expect.objectContaining）；(2) TC-UI-006: 修复成功消息匹配正则；(3) TC-UI-007: 补充 load_models mock 返回值；(4) TC-UI-010 和 ProviderSelector: 更新测试期望为"禁用"按钮；(5) 所有测试通过（后端 146/146，前端 1466/1466） |
| 2026-03-13 | 5.10.0 | - | 修复配置导出残留/误删问题：(1) JSON 导出（Claude/Gemini/OpenCode/OpenClaw）在 MCP/permissions 为空时主动删除目标文件中的旧字段；(2) Codex TOML 导出不再误删用户手写的 permissions，仅在有 skills 时覆盖 permissions.allow |
| 2026-03-13 | 5.10.1 | - | 修复嵌套字段残留：将 api、provider、baseUrl 等导出器完全管理的对象加入 managed_keys，merge 前先删除再写入，避免去掉自定义端点后旧 baseUrl/baseURL 残留 |
| 2026-03-13 | 5.11.0 | - | UI 美化优化：(1) AppSwitcher 工具选择器改为卡片网格布局，添加品牌色图标和已配置状态标记；(2) ProviderSelector 提供商卡片增加图标渐变色和更精致的布局；(3) 主页面布局优化，目标路径区域和状态消息样式统一；(4) 整体视觉风格与项目其他页面（Agent/Skills/MCP）保持一致 |
| 2026-03-13 | 5.11.1 | - | (1) 模块重命名：「配置导出」→「配置切换」，更新 i18n 中英文翻译和侧边栏导航标签；(2) AppSwitcher 紧凑化：从卡片网格改为单行水平胶囊按钮布局，大幅减少垂直空间占用；(3) 更新前端测试适配新布局 |


---

<a id="中文"></a>

# 配置导出器模块


## 模块职责

**纯配置文件导出模块**：将 MobausStudio 内部配置导出到外部 AI CLI 工具的配置文件中。

**核心原则**：
- ✅ 单向导出：MobausStudio → 外部 CLI 工具配置文件
- ✅ 轻量状态管理：通过现有存储接口读取配置，仅持久化工具启用状态（tool_enabled_state.json）
- ✅ 格式转换：自动转换为各工具所需格式（TOML/JSON/ENV）
- ✅ 原子写入：保证配置文件完整性
- ✅ 跨平台路径：根据操作系统自动选择正确的配置目录
- ✅ 跨平台命令：Windows 平台自动包装 Node.js 工具链命令（npx/npm/node 等）
- ❌ 不管理内部配置：不创建/修改 MobausStudio 内部的 providers/mcp/skills 数据
- ❌ 不从外部读取：不导入外部 CLI 工具的配置到 MobausStudio

## 配置流向

```
MobausStudio 内部数据源（JSON 文件存储）
  ├─ provider_credentials.json (API Key, OAuth Token)
  ├─ custom_providers.json (自定义提供商配置)
  ├─ mcp_servers.json (MCP 服务器配置)
  └─ skills.json (Skills 配置)
         ↓
   Config-Switcher 通过现有存储接口读取
   (复用 get_data_dir() + fs::read_to_string)
         ↓
   协议优先级判断 (v0.9.5)
   1. 模型指定的协议 (model.protocol)
   2. 提供商默认协议 (PROVIDER_DEFAULT_PROTOCOL)
   3. 自定义提供商协议 (custom_providers.protocol)
         ↓
   格式转换 + 跨平台路径处理 + 原子写入
         ↓
   外部 CLI 工具配置文件（跨平台路径）
   ├─ Claude Code:
   │   • macOS/Linux: ~/.claude/settings.json + ~/.claude.json (MCP)
   │   • Windows: %USERPROFILE%\.claude\settings.json + %USERPROFILE%\.claude.json (MCP)
   ├─ Codex:
   │   • macOS/Linux: ~/.codex/auth.json + ~/.codex/config.toml
   │   • Windows: %USERPROFILE%\.codex\auth.json + %USERPROFILE%\.codex\config.toml
   ├─ Gemini CLI:
   │   • macOS/Linux: ~/.gemini/.env + ~/.gemini/settings.json
   │   • Windows: %USERPROFILE%\.gemini\.env + %USERPROFILE%\.gemini\settings.json
   ├─ OpenCode:
   │   • macOS/Linux: ~/.opencode/config.json
   │   • Windows: %USERPROFILE%\.opencode\config.json
   └─ OpenClaw:
       • macOS/Linux: ~/.openclaw/config.json
       • Windows: %USERPROFILE%\.openclaw\config.json
```

## 功能范围

### 核心功能

1. **配置导出**：将指定 Provider 的配置导出到指定外部工具
2. **格式转换**：自动转换为各外部工具的格式（TOML/JSON/ENV）
3. **合并写入**：保留用户手动配置的其他字段，仅覆盖导出的字段（单文件：temp+rename，多文件：backup+restore）
4. **MCP/Skills 同步**：同时导出关联的 MCP 服务器和 Skills 配置

### 非功能（明确排除）

- ❌ 供应商 CRUD（由 providers 模块负责）
- ❌ MCP 服务器 CRUD（由 mcp 模块负责）
- ❌ Prompts/Skills CRUD（由 skills 模块负责）
- ❌ 从外部配置文件导入到 MobausStudio
- ❌ 导出映射持久化（无需数据库表）

## 架构设计

### 目录结构

```
MobausStudio/
├── src-tauri/src/
│   ├── lib.rs                       # Tauri 命令层（包含 export_provider_to_tool 等命令）
│   └── services/
│       └── config_exporter/         # 配置导出服务
│           ├── mod.rs               # 模块导出
│           ├── export_service.rs    # 导出服务（核心逻辑）
│           ├── transformer.rs       # 格式转换器
│           ├── writer.rs            # 配置文件写入器
│           ├── enabled_state.rs     # 工具启用状态管理
│           ├── error.rs             # 错误类型定义
│           ├── windows_cmd_wrapper.rs  # Windows 命令包装工具
│           └── integration_tests.rs # 集成测试
├── src-tauri/data/
│   └── tool_enabled_state.json      # 工具启用状态持久化文件
└── docs/modules/
    └── config-switcher.md           # 本文档
```

**注意**：无需 `database/` 层，通过现有 `get_data_dir()` 函数读取 JSON 文件。

### 代码复用策略

从 cc-switch 项目复用以下逻辑：

| 功能模块 | cc-switch 源文件 | 复用方式 | 复用内容 |
|---------|-----------------|---------|---------|
| 路径获取 | `config.rs` | 直接复用 | `get_claude_config_dir()`, `get_claude_settings_path()`, `get_claude_mcp_path()` |
| 路径获取 | `codex_config.rs` | 直接复用 | `get_codex_config_dir()`, `get_codex_auth_path()`, `get_codex_config_path()` |
| 原子写入 | `codex_config.rs` | 直接复用 | `write_codex_live_atomic()` - 多文件事务写入 + 回滚 |
| TOML 转换 | `mcp/codex.rs` | 直接复用 | `json_server_to_toml_table()`, `json_value_to_toml_item()` - JSON → TOML 转换 |
| MCP 写入 | `claude_mcp.rs` | 直接复用 | `set_mcp_servers_map()` - 写入 ~/.claude.json |
| MCP 同步 | `mcp/codex.rs` | 参考复用（需适配） | `sync_enabled_to_codex()` 的过滤和转换逻辑（依赖 MultiAppConfig，需适配） |
| MCP 同步 | `mcp/claude.rs` | 参考复用（需适配） | `collect_enabled_servers()`, `extract_server_spec()` 逻辑（需适配数据结构） |
| 应用类型 | `app_config.rs` | 直接复用 | `AppType` 枚举 - 统一的应用标识 |

## 外部工具配置格式

### 1. Claude Code

**配置文件**：
- macOS/Linux:
  - `~/.claude/settings.json` (Provider 配置，优先)
  - `~/.claude/claude.json` (Provider 配置，兼容旧版)
  - `~/.claude.json` (MCP 服务器配置)
- Windows:
  - `%USERPROFILE%\.claude\settings.json` (Provider 配置，优先)
  - `%USERPROFILE%\.claude\claude.json` (Provider 配置，兼容旧版)
  - `%USERPROFILE%\.claude.json` (MCP 服务器配置)

**格式**：JSON

**settings.json 示例**：
```json
{
  "api": {
    "apiKey": "sk-ant-xxx",
    "baseUrl": "https://api.anthropic.com"
  },
  "model": {
    "default": "claude-opus-4-6"
  }
}
```

**~/.claude.json (MCP) 示例**：
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
    }
  }
}
```

**复用逻辑**：

- **直接复用** `config.rs` 的路径函数：
  - `get_claude_config_dir()` - 获取 ~/.claude 目录
  - `get_claude_settings_path()` - 自动选择 settings.json 或 claude.json
  - `get_claude_mcp_path()` - 获取 ~/.claude.json 路径
- **参考复用** `mcp/claude.rs` 的同步逻辑（需适配层）：
  - `sync_enabled_to_claude()` 依赖 `MultiAppConfig`，需要适配为 MobausStudio 的数据结构
  - 可复用其内部的 `collect_enabled_servers()` 和 `extract_server_spec()` 逻辑
  - 直接复用 `claude_mcp::set_mcp_servers_map()` 写入函数

---

### 2. Codex

**配置文件**：
- macOS/Linux:
  - `~/.codex/auth.json`（认证信息）
  - `~/.codex/config.toml`（配置信息）
- Windows:
  - `%USERPROFILE%\.codex\auth.json`
  - `%USERPROFILE%\.codex\config.toml`

**格式**：JSON + TOML

**auth.json 示例**：
```json
{
  "OPENAI_API_KEY": "sk-ant-xxx"
}
```

**注意**：
- auth.json 是扁平结构，直接包含 `OPENAI_API_KEY` 字段（Codex 标准）
- 在 cc-switch 的 Provider 内部存储时使用 `{ "auth": { "OPENAI_API_KEY": "..." }, "config": "..." }` 结构
- 但写入 auth.json 文件时，只写入 `auth` 字段的内容（扁平化）

**config.toml 示例**：
```toml
model = "claude-opus-4-6"

[mcp_servers.filesystem]
type = "stdio"
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
```

**复用逻辑**：

- **直接复用** `codex_config.rs` 的所有函数：
  - `get_codex_config_dir()`
  - `get_codex_auth_path()`
  - `get_codex_config_path()`
  - `write_codex_live_atomic()` - 多文件原子写入 + 回滚
- **直接复用** `mcp/codex.rs` 的转换函数：
  - `json_server_to_toml_table()`
  - `json_value_to_toml_item()`
- **参考复用** `mcp/codex.rs` 的同步逻辑（需适配层）：
  - `sync_enabled_to_codex()` 依赖 `MultiAppConfig`，需要适配为 MobausStudio 的数据结构
  - 可复用其内部的 MCP 过滤和转换逻辑

---

### 3. Gemini CLI

**配置文件**：
- macOS/Linux:
  - `~/.gemini/.env`（环境变量）
  - `~/.gemini/settings.json`（配置信息）
- Windows:
  - `%USERPROFILE%\.gemini\.env`
  - `%USERPROFILE%\.gemini\settings.json`

**格式**：ENV + JSON

**.env 示例**：
```env
GOOGLE_API_KEY=AIzaSyXXX
GOOGLE_GEMINI_BASE_URL=https://generativelanguage.googleapis.com
```

**settings.json 示例**：
```json
{
  "model": "gemini-2.0-flash-exp",
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
    }
  }
}
```

**复用逻辑**：
- 路径获取：参考 `get_codex_config_dir()` 模式
- 原子写入：参考 `write_codex_live_atomic()` 的多文件事务逻辑

---

### 4. OpenCode

**配置文件**：
- macOS/Linux: `~/.config/opencode/opencode.json`
- Windows: `%USERPROFILE%\.config\opencode\opencode.json`

**格式**：JSON（基于 AI SDK 的 Provider 配置）

**示例**：
```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "custom-provider-id": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "apiKey": "sk-ant-xxx",
        "baseURL": "https://api.anthropic.com"
      },
      "models": {
        "claude-opus-4-6": {
          "name": "Claude Opus 4.6"
        }
      }
    }
  },
  "mcp": {
    "filesystem": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/path"],
      "enabled": true
    }
  }
}
```

**关键字段**：
- `provider.{id}.npm`: AI SDK 包名（如 `@ai-sdk/openai-compatible`, `@ai-sdk/anthropic`）
- `provider.{id}.options.apiKey`: API 密钥
- `provider.{id}.options.baseURL`: API 基础 URL
- `provider.{id}.models`: 模型定义映射
- `mcp.{id}.type`: MCP 类型（`local` 对应 stdio，`remote` 对应 http/sse）
- `mcp.{id}.command`: 命令数组（合并 command + args）

**复用逻辑**：
- 路径获取：复用 cc-switch 的 `get_opencode_dir()` 和 `get_opencode_config_path()`
- Provider 格式：参考 cc-switch 的 `OpenCodeProviderConfig` 结构
- MCP 格式：参考 cc-switch 的 `convert_to_opencode_format()` 转换逻辑

---

### 5. OpenClaw

**配置文件**：
- macOS/Linux: `~/.openclaw/config.json`
- Windows: `%USERPROFILE%\.openclaw\config.json`

**格式**：JSON

**示例**：
```json
{
  "apiKey": "sk-ant-xxx",
  "baseUrl": "https://api.anthropic.com",
  "model": "claude-opus-4-6"
}
```

**注意**：OpenClaw 当前版本暂不支持 MCP 配置。

**复用逻辑**：
- 路径获取：参考 `get_codex_config_dir()` 模式
- JSON 格式：直接使用 `serde_json`

---

## 接口定义

### Tauri 命令

#### 1. 导出配置到外部工具

```rust
#[tauri::command]
pub async fn export_provider_to_tool(
    provider_id: String,
    tool_name: String,  // "claude-code" | "codex" | "gemini-cli" | "opencode" | "openclaw"
) -> Result<(), String>
```

**功能**：将指定 Provider 的配置导出到指定外部工具。

**流程**：
1. 读取 `provider_credentials.json` 获取 Provider 凭证
2. 检查认证类型（仅支持 API Key）
3. 读取 `mcp_servers.json` 获取 MCP 服务器配置
4. 读取 `skills.json` 获取 Skills 配置
5. 转换为目标工具格式
6. 原子写入配置文件

**错误处理**：
- Provider 不存在 → 返回错误
- 认证类型不支持（OAuth） → 返回错误提示需要代理服务器
- 配置文件写入失败 → 返回错误并回滚

---

#### 2. 批量导出配置

```rust
#[tauri::command]
pub async fn batch_export_providers(
    exports: Vec<ExportRequest>,  // [{ provider_id, tool_name }]
) -> Result<BatchExportResult, String>
```

**功能**：批量导出多个 Provider 到多个外部工具。

**返回值**：
```rust
struct BatchExportResult {
    success_count: usize,
    failed_exports: Vec<FailedExport>,
}

struct FailedExport {
    provider_id: String,
    tool_name: String,
    error: String,
}
```

---

#### 3. 获取支持的外部工具列表

```rust
#[tauri::command]
pub fn get_supported_tools() -> Vec<ExternalTool>
```

**返回值**：
```rust
struct ExternalTool {
    id: String,           // "claude-code"
    name: String,         // "Claude Code"
    config_files: Vec<String>,  // ["~/.claude/settings.json", "~/.claude.json"]
    supports_mcp: bool,
    supports_skills: bool,
}
```

---

## 核心服务实现

### 1. ExportService（导出服务）

**职责**：协调整个导出流程。

**核心方法**：

```rust
impl ExportService {
    /// 导出 Provider 到指定工具
    pub async fn export_provider(
        &self,
        app_handle: &tauri::AppHandle,
        provider_id: &str,
        tool_name: &str,
    ) -> Result<(), ConfigExportError> {
        // 1. 获取数据目录（直接使用 Tauri API）
        let data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| ConfigExportError::PathError(format!("无法获取应用数据目录: {}", e)))?;

        // 2. 读取 provider_credentials.json
        let credentials_path = data_dir.join("provider_credentials.json");
        let credentials_content = fs::read_to_string(&credentials_path)
            .map_err(|e| ConfigExportError::IoError(e))?;
        let credentials: Vec<ProviderCredential> = serde_json::from_str(&credentials_content)
            .map_err(|e| ConfigExportError::JsonError(e))?;

        // 3. 查找指定 Provider
        let provider = credentials
            .iter()
            .find(|c| c.provider_id == provider_id)
            .ok_or_else(|| ConfigExportError::ProviderNotFound(provider_id.to_string()))?;

        // 4. 检查认证类型
        if provider.auth_type != "api" {
            return Err(ConfigExportError::UnsupportedAuthType(
                "仅支持 API Key 认证类型，OAuth 需要使用代理服务器".to_string()
            ));
        }

        // 5. 读取 mcp_servers.json
        let mcp_path = data_dir.join("mcp_servers.json");
        let mcp_servers = if mcp_path.exists() {
            let content = fs::read_to_string(&mcp_path)?;
            let all_servers: Vec<MCPServerConfig> = serde_json::from_str(&content)?;
            // 过滤出启用的 MCP 服务器
            all_servers.into_iter().filter(|s| s.enabled).collect()
        } else {
            Vec::new()
        };

        // 6. 读取 skills.json
        let skills_path = data_dir.join("skills.json");
        let skills = if skills_path.exists() {
            let content = fs::read_to_string(&skills_path)?;
            serde_json::from_str(&content)?
        } else {
            Vec::new()
        };

        // 7. 转换为目标格式
        let config = self.transformer.transform(
            provider,
            &mcp_servers,
            &skills,
            tool_name,
        )?;

        // 8. 写入配置文件
        self.writer.write_config(tool_name, &config).await?;

        Ok(())
    }
}
```

**注意**：
- 使用现有的 `get_data_dir()` 函数获取数据目录（跨平台）
- 错误类型使用 `JsonError` 而非 `ParseError`

---

### 2. Transformer（格式转换器）

**职责**：将 MobausStudio 内部格式转换为外部工具格式。

**核心方法**：

```rust
impl Transformer {
    /// 转换为 Claude Code 格式
    fn to_claude_code_format(
        &self,
        provider: &Provider,
        mcp_servers: &[McpServer],
        skills: &[Skill],
    ) -> Result<(Value, Value), ConfigExportError> {
        // 返回 (settings.json 内容, ~/.claude.json MCP 内容)
        // 复用 cc-switch 的 mcp/claude.rs 同步逻辑
        // ...
    }

    /// 转换为 Codex 格式
    fn to_codex_format(
        &self,
        provider: &Provider,
        mcp_servers: &[McpServer],
        skills: &[Skill],
    ) -> Result<(Value, String), ConfigExportError> {
        // 返回 (auth.json 内容, config.toml 内容)
        // 复用 cc-switch 的 json_server_to_toml_table()
        // ...
    }

    /// 转换为 Gemini CLI 格式
    fn to_gemini_format(
        &self,
        provider: &Provider,
        mcp_servers: &[McpServer],
        skills: &[Skill],
    ) -> Result<(String, Value), ConfigExportError> {
        // 返回 (.env 内容, settings.json 内容)
        // ...
    }

    /// 转换为 OpenCode 格式
    fn to_opencode_format(
        &self,
        provider: &Provider,
        mcp_servers: &[McpServer],
        skills: &[Skill],
    ) -> Result<Value, ConfigExportError> {
        // ...
    }

    /// 转换为 OpenClaw 格式
    fn to_openclaw_format(
        &self,
        provider: &Provider,
    ) -> Result<Value, ConfigExportError> {
        // OpenClaw 不支持 MCP 和 Skills
        // ...
    }
}
```

---

### 3. Writer（配置文件写入器）

**职责**：原子写入配置文件。

**核心方法**：

```rust
impl Writer {
    /// 写入配置到指定工具
    pub async fn write_config(
        &self,
        tool_name: &str,
        config: &ToolConfig,
    ) -> Result<(), ConfigExportError> {
        match tool_name {
            "claude-code" => self.write_claude_code(config).await,
            "codex" => self.write_codex(config).await,
            "gemini-cli" => self.write_gemini(config).await,
            "opencode" => self.write_opencode(config).await,
            "openclaw" => self.write_openclaw(config).await,
            _ => Err(ConfigExportError::UnsupportedTool(tool_name.to_string())),
        }
    }

    /// 写入 Codex 配置（多文件原子写入）
    async fn write_codex(&self, config: &ToolConfig) -> Result<(), ConfigExportError> {
        // 直接复用 cc-switch 的 write_codex_live_atomic()
        let (auth_json, config_toml) = config.as_codex_format()?;
        crate::codex_config::write_codex_live_atomic(&auth_json, Some(&config_toml))?;
        Ok(())
    }

    /// 单文件原子写入（temp + rename）
    async fn atomic_write_single(
        &self,
        path: &str,
        content: &str,
    ) -> Result<(), ConfigExportError> {
        let path = self.expand_path(path)?;
        let temp_path = format!("{}.tmp", path);

        // 写入临时文件
        tokio::fs::write(&temp_path, content).await?;

        // 原子重命名
        tokio::fs::rename(&temp_path, &path).await?;

        Ok(())
    }

    /// 路径展开（跨平台）
    /// - Unix: ~ → $HOME
    /// - Windows: %APPDATA% / %USERPROFILE% → 实际路径
    fn expand_path(&self, path: &str) -> Result<String, ConfigExportError> {
        // 处理 Unix 风格的 ~
        if path.starts_with("~/") {
            let home = dirs::home_dir()
                .ok_or_else(|| ConfigExportError::PathError("无法获取 home 目录".to_string()))?;
            return Ok(path.replacen("~", &home.display().to_string(), 1));
        }

        // 处理 Windows 环境变量
        #[cfg(target_os = "windows")]
        {
            if path.contains("%APPDATA%") {
                if let Some(appdata) = std::env::var_os("APPDATA") {
                    return Ok(path.replace("%APPDATA%", &appdata.to_string_lossy()));
                }
            }
            if path.contains("%USERPROFILE%") {
                if let Some(userprofile) = std::env::var_os("USERPROFILE") {
                    return Ok(path.replace("%USERPROFILE%", &userprofile.to_string_lossy()));
                }
            }
        }

        Ok(path.to_string())
    }
}
```

---

## 错误处理

### 错误类型定义

```rust
#[derive(Debug, thiserror::Error)]
pub enum ConfigExportError {
    #[error("Provider 不存在: {0}")]
    ProviderNotFound(String),

    #[error("不支持的认证类型: {0}")]
    UnsupportedAuthType(String),

    #[error("不支持的外部工具: {0}")]
    UnsupportedTool(String),

    #[error("配置转换失败: {0}")]
    TransformError(String),

    #[error("配置文件写入失败: {0}")]
    WriteError(String),

    #[error("路径错误: {0}")]
    PathError(String),

    #[error("JSON 解析错误: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),
}
```

---

## 测试用例

### 测试用例表格

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-EXPORT-001 | 导出 API Key Provider 到 Claude Code | provider_id="p1", tool="claude-code" | 成功写入 ~/.claude/settings.json + ~/.claude.json |
| TC-EXPORT-002 | 导出 API Key Provider 到 Codex | provider_id="p1", tool="codex" | 成功写入 auth.json + config.toml |
| TC-EXPORT-003 | 导出 OAuth Provider | provider_id="p2" (OAuth), tool="claude-code" | 返回错误：不支持 OAuth |
| TC-EXPORT-004 | Provider 不存在 | provider_id="invalid", tool="claude-code" | 返回错误：Provider 不存在 |
| TC-EXPORT-005 | 不支持的工具 | provider_id="p1", tool="invalid-tool" | 返回错误：不支持的工具 |
| TC-EXPORT-006 | 导出包含 MCP 服务器 | provider_id="p1" (含 MCP), tool="claude-code" | MCP 配置正确写入 |
| TC-EXPORT-007 | 导出包含 Skills | provider_id="p1" (含 Skills), tool="claude-code" | Skills 配置正确写入到 permissions.allow |
| TC-EXPORT-008 | 导出到 OpenClaw（不支持 MCP） | provider_id="p1" (含 MCP), tool="openclaw" | 仅写入 API Key，忽略 MCP |
| TC-EXPORT-009 | 多文件写入失败回滚 | Codex 写入 config.toml 失败 | auth.json 回滚到原始状态 |
| TC-EXPORT-010 | 路径展开 | 配置路径包含 ~ | 正确展开为实际 home 目录 |
| TC-EXPORT-011 | 批量导出部分失败 | 3个导出请求，1个失败 | 返回成功2个，失败1个的详细信息 |
| TC-EXPORT-012 | TOML 格式转换 | JSON MCP 配置 | 正确转换为 TOML 格式 |
| TC-EXPORT-013 | 测试隔离 - 不污染真实配置 | 运行测试 | 测试使用临时目录，不写入 ~/.claude 等真实路径 |
| TC-EXPORT-014 | base_url 导出 | provider 有 custom base_url | 正确写入到目标工具配置 |
| TC-EXPORT-015 | 取消配置（禁用 Provider） | tool="claude-code" 已启用 provider="p1"，调用 disable | 清除启用状态，tool_enabled_state.json 中移除该工具的记录 |
| TC-EXPORT-016 | 取消不存在的配置 | tool="claude-code" 未启用任何 Provider，调用 disable | 成功返回，状态文件不变 |

### 配置残留/误删修复测试用例 (v5.10.0)

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-WRITER-014 | JSON 导出清除旧 mcpServers | 现有文件有 mcpServers，新导出无 MCP | mcpServers 字段被删除 |
| TC-WRITER-015 | JSON 导出清除旧 permissions | 现有文件有 permissions，新导出无 skills | permissions 字段被删除 |
| TC-WRITER-016 | JSON 导出保留无关字段 | 现有文件有 user_field，新导出无此字段 | user_field 保留不变 |
| TC-WRITER-017 | Codex TOML 保留用户 permissions | 现有 TOML 有手写 permissions，新导出无 skills | permissions 保留不变 |
| TC-WRITER-018 | Codex TOML 有 skills 时覆盖 permissions | 现有 TOML 有手写 permissions，新导出有 skills | permissions.allow 被覆盖 |
| TC-WRITER-019 | Claude 去掉 baseUrl 后不残留 | 旧 settings 有 api.baseUrl，新导出无 baseUrl | api 对象中无 baseUrl |
| TC-WRITER-020 | OpenCode 去掉 baseURL 后不残留 | 旧配置有 provider.{id}.options.baseURL，新导出无 baseURL | options 中无 baseURL |
| TC-WRITER-021 | OpenClaw 去掉 baseUrl 后不残留 | 旧配置有 baseUrl，新导出无 baseUrl | 配置中无 baseUrl |
| TC-WRITER-022 | 删除自定义 endpoint 后配置不残留 | 旧配置有 custom endpoint，新导出切换回默认 endpoint | 配置文件中 baseUrl/baseURL 等字段被完全删除，不残留旧值 |
| TC-WRITER-023 | 断开连接时旧请求结果被丢弃并清理配置 | 用户断开连接，但旧的异步请求仍在进行 | 旧请求返回时被识别并丢弃，不更新 UI 状态，并调用 disable 清理已写入的配置文件 |

### Windows 命令包装测试用例

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-WRAPPER-001 | 判断 Node.js 工具链命令需要包装 | "npx", "npm", "node", "yarn", "pnpm", "bun", "deno" | 返回 true |
| TC-WRAPPER-002 | 判断非 Node.js 命令不需要包装 | "python", "uvx", "docker", "custom-binary" | 返回 false |
| TC-WRAPPER-003 | 包装命令和参数 | command="npx", args=["-y", "@modelcontextprotocol/server-filesystem", "/path"] | cmd="cmd", args=["/c", "npx", "-y", "@modelcontextprotocol/server-filesystem", "/path"] |
| TC-WRAPPER-004 | 包装无参数命令 | command="node", args=[] | cmd="cmd", args=["/c", "node"] |
| TC-WRAPPER-005 | 包装 yarn 命令 | command="yarn", args=["dlx", "some-package"] | cmd="cmd", args=["/c", "yarn", "dlx", "some-package"] |
| TC-WRAPPER-006 | 大小写不敏感匹配 | "NPX", "Npm", "NODE" | 返回 true（需要包装） |
| TC-WRAPPER-007 | 处理 .cmd 后缀 | "npx.cmd", "npm.cmd" | 返回 true（需要包装） |
| TC-WRAPPER-008 | 处理带路径的命令 | "C:\\Program Files\\nodejs\\npx.cmd" | 返回 true（需要包装） |
| TC-WRAPPER-009 | Unix 路径中的命令 | "/usr/local/bin/npx" | 返回 true（需要包装） |

---

## 实现计划

### Phase 1：基础框架（1-2天）

1. 创建目录结构
2. 定义错误类型
3. 实现路径获取和展开
4. 实现单文件原子写入

### Phase 2：格式转换器（2-3天）

1. 从 cc-switch 复用 TOML 转换逻辑
2. 实现 Claude Code 格式转换
3. 实现 Codex 格式转换
4. 实现 Gemini CLI 格式转换
5. 实现 OpenCode/OpenClaw 格式转换

### Phase 3：导出服务（1-2天）

1. 实现 ExportService 核心逻辑
2. 集成 Transformer 和 Writer
3. 实现批量导出

### Phase 4：Tauri 命令层（1天）

1. 实现 Tauri 命令
2. 错误处理和日志记录

### Phase 5：测试（2-3天）

1. 编写单元测试（覆盖所有测试用例）
2. 集成测试
3. 手动测试各外部工具

---

## 前端 UI 设计

### 页面结构

Config-Switcher 作为一级核心模块，在主导航中显示为独立入口。

```
主导航
├── Providers（供应商管理）
├── MCP Servers（MCP 服务器管理）
├── Skills（技能管理）
└── Config Switcher（配置导出）← 新增
```

### 设计思路

**复用 cc-switch 的核心组件**：
- `AppSwitcher` 组件：用于选择目标 CLI 工具（Claude Code / Codex / Gemini CLI / OpenCode / OpenClaw）
- 保持 MobausStudio 的页面布局风格
- 融合两者的优点：MobausStudio 的整体设计 + cc-switch 的工具切换逻辑

### 页面布局

#### 主页面：ConfigSwitcherPage

**布局**：单页面，顶部工具切换 + 中间配置区域

```
┌─────────────────────────────────────────────────────────┐
│ Config Switcher                                    [?]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Select Target CLI Tool                          │  │
│  │                                                 │  │
│  │  [Claude Code] [Codex] [Gemini] [OpenCode] [OpenClaw] │
│  │   (复用 cc-switch 的 AppSwitcher 组件)          │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Export Configuration                            │  │
│  │                                                 │  │
│  │  Provider:                                      │  │
│  │  ┌─────────────────────────────────────────┐   │  │
│  │  │ [v] Anthropic (API Key)                 │   │  │
│  │  │ [ ] OpenAI (API Key)                    │   │  │
│  │  │ [ ] Google (OAuth - 不支持)             │   │  │
│  │  └─────────────────────────────────────────┘   │  │
│  │                                                 │  │
│  │  Export Content:                                │  │
│  │  • API Key / Credentials                        │  │
│  │  • MCP Servers (3 enabled) - 自动包含          │  │
│  │  • Skills (0 available) - 自动包含             │  │
│  │                                                 │  │
│  │  Target Path:                                   │  │
│  │  ~/.claude/settings.json                        │  │
│  │  ~/.claude.json (MCP)                           │  │
│  │                                                 │  │
│  │                          [Export to Claude Code] │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 组件设计

#### 1. ProviderCard（Provider 选择卡片）

**功能**：显示可导出的 Provider 列表。

**状态**：
- 选中/未选中
- 禁用（OAuth 类型）

**显示信息**：
- Provider 名称
- 认证类型（API Key / OAuth）
- 禁用原因（OAuth 不支持）

**交互**：
- 单选（一次只能导出一个 Provider）
- OAuth Provider 显示禁用状态 + Tooltip 提示

#### 2. ExportTargetCard（导出目标卡片）

**功能**：显示外部工具列表。

**状态**：
- 可选中/未选中
- 多选（可同时导出到多个工具）

**显示信息**：
- 工具名称
- 配置文件路径（跨平台显示）
- 支持的功能（MCP / Skills）

**交互**：
- 多选 Checkbox
- 点击卡片展开详细信息

#### 3. ExportInfoPanel（导出信息面板）

**功能**：显示将要导出的内容。

**显示信息**：
- API Key / Credentials
- MCP Servers（显示启用数量）
- Skills（显示可用数量）
- 目标配置文件路径

**交互**：
- 只读显示，无需用户交互
- 实时更新统计信息

#### 4. ExportButton（导出按钮）

**功能**：执行导出操作。

**状态**：
- 禁用（未选择 Provider 或 Target）
- 加载中（导出进行中）
- 正常

**交互**：
- 点击触发导出
- 显示进度 Toast
- 成功/失败通知

### 交互流程

#### 流程 1：单工具启用（主流程）

```
1. 用户切换工具 tab（Claude Code / Codex / Gemini CLI / OpenCode / OpenClaw）
   - 切换时有淡入动画效果
   - 自动加载该工具的配置路径
2. 查看已连接的 Provider 列表（仅显示已连接且支持 API Key 的 Provider）
3. 点击某个 Provider 右侧的 [Enable for {Tool}] 按钮
4. 显示加载状态（按钮变为 "Enabling..."）
5. 导出完成后显示结果通知
   - 成功：✅ "已为 Claude Code 启用 Anthropic（包含 3 个 MCP 服务器）"
   - 失败：❌ "启用失败：Provider 不存在"
6. 切换到其他工具 tab，重复步骤 2-5
```

**关键特性**：

- ✅ 启用按钮在每个 Provider 卡片右侧
- ✅ 非连接 Provider 不显示
- ✅ 切换工具时有平滑动画
- ✅ 无需选择 Provider，直接点击启用按钮

#### 流程 2：OAuth Provider 提示

```
1. 用户尝试选择 OAuth Provider
2. 显示 Tooltip：
   "OAuth 认证类型暂不支持直接导出。
    请使用代理服务器或手动配置。"
3. Provider 卡片保持禁用状态
```

### 状态管理

#### ConfigSwitcherState

```typescript
interface ConfigSwitcherState {
  // 当前选中的工具（单选）
  activeToolId: ToolId;  // "claude-code" | "codex" | "gemini-cli" | "opencode" | "openclaw"

  // Provider 列表
  providers: Provider[];
  selectedProviderId: string | null;

  // MCP/Skills 统计（只读显示）
  enabledMcpCount: number;
  availableSkillsCount: number;

  // 导出状态
  isExporting: boolean;
}

interface Provider {
  id: string;
  name: string;
  authType: 'api' | 'oauth';
  isSupported: boolean;  // OAuth = false
}

type ToolId = 'claude-code' | 'codex' | 'gemini-cli' | 'opencode' | 'openclaw';
```

### API 调用

#### 1. 获取 Providers

```typescript
// 使用后端实际的命令名
const credentials = await invoke<ProviderCredential[]>('load_provider_credentials');

// 过滤出支持的 Provider（仅 API Key）
const supportedProviders = credentials
  .filter(c => c.type === 'api')
  .map(c => ({
    id: c.provider_id,
    name: c.provider_id, // 或从 providers 配置中获取显示名称
    authType: c.type,
    isSupported: true
  }));
```

#### 2. 获取 Export Targets

```typescript
const targets = await invoke<ExternalTool[]>('get_supported_tools');
```

#### 3. 获取 MCP/Skills 统计（用于显示）

```typescript
const mcpServers = await invoke<MCPServerConfig[]>('load_mcp_servers');
const enabledMcpCount = mcpServers.filter(s => s.enabled).length;

const skills = await invoke<Skill[]>('load_skills');
const availableSkillsCount = skills.length;
```

#### 3. 执行启用（导出）

```typescript
// 为当前工具启用选中的 Provider
await invoke('export_provider_to_tool', {
  providerId: selectedProviderId,
  toolName: activeToolId
});
```

**注意**：

- MCP 服务器和 Skills 会自动包含在导出中（如果存在且已启用）
- 前端只需显示统计信息，无需提供开关选项
- 每次只操作一个工具，不支持批量导出

### 错误处理

#### 错误类型

| 错误类型 | 显示方式 | 用户操作 |
|---------|---------|---------|
| Provider 不存在 | Toast 错误通知 | 刷新页面 |
| OAuth 不支持 | Tooltip + 禁用状态 | 无需操作 |
| 配置文件写入失败 | Modal 错误详情 | 查看日志 / 重试 |

#### 错误提示文案

```typescript
const ERROR_MESSAGES = {
  PROVIDER_NOT_FOUND: '找不到指定的 Provider，请刷新页面后重试',
  OAUTH_NOT_SUPPORTED: 'OAuth 认证类型暂不支持直接导出，请使用代理服务器',
  WRITE_FAILED: '配置文件写入失败，请检查文件权限',
  UNKNOWN_ERROR: '导出失败，请查看日志获取详细信息'
};
```

### 国际化

#### 中文（zh）

```json
{
  "configSwitcher": {
    "title": "配置导出",
    "providers": "供应商",
    "exportTargets": "导出目标",
    "exportInfo": "导出内容",
    "exportButton": "导出选中项",
    "exporting": "正在导出...",
    "exportSuccess": "导出成功",
    "exportFailed": "导出失败",
    "oauthNotSupported": "OAuth 认证类型暂不支持",
    "mcpServers": "MCP 服务器",
    "skills": "Skills",
    "autoIncluded": "自动包含"
  }
}
```

#### 英文（en）

```json
{
  "configSwitcher": {
    "title": "Config Switcher",
    "providers": "Providers",
    "exportTargets": "Export Targets",
    "exportInfo": "Export Content",
    "exportButton": "Export Selected",
    "exporting": "Exporting...",
    "exportSuccess": "Export Successful",
    "exportFailed": "Export Failed",
    "oauthNotSupported": "OAuth authentication not supported",
    "mcpServers": "MCP Servers",
    "skills": "Skills",
    "autoIncluded": "Auto-included"
  }
}
```

### 前端测试用例

| 用例ID | 场景 | 操作 | 预期结果 |
|--------|------|------|----------|
| TC-UI-001 | 页面加载 | 打开 Config Switcher 页面 | 显示 Providers 和 Export Targets 列表 |
| TC-UI-002 | 选择 API Key Provider | 点击 Anthropic Provider | Provider 卡片高亮，Export 按钮可用 |
| TC-UI-003 | 尝试选择 OAuth Provider | 点击 Google OAuth Provider | 显示 Tooltip 提示，卡片保持禁用 |
| TC-UI-004 | 选择单个 Export Target | 勾选 Claude Code | Target 卡片选中状态 |
| TC-UI-005 | 选择多个 Export Target | 勾选 Claude Code + Codex | 两个 Target 卡片选中 |
| TC-UI-006 | 单个导出成功 | 选择 Provider + Target，点击 Export | 显示成功 Toast |
| TC-UI-007 | 批量导出成功 | 选择 Provider + 3个 Targets，点击 Export | 显示进度，最终显示成功通知 |
| TC-UI-008 | 批量导出部分失败 | 3个导出，1个失败 | 显示 "成功 2 个，失败 1 个" + 失败详情 |
| TC-UI-009 | 导出失败 | Provider 不存在或认证失败 | 显示错误 Toast，包含错误信息 |
| TC-UI-010 | MCP 统计显示 | 有 3 个启用的 MCP 服务器 | 显示 "MCP Servers (3 enabled) - 自动包含" |
| TC-UI-011 | 未选择 Provider | 不选择 Provider，点击 Export | Export 按钮禁用 |
| TC-UI-012 | 未选择 Target | 选择 Provider，不选择 Target | Export 按钮禁用 |
| TC-UI-013 | 跨平台路径显示 | macOS 系统 | 显示 ~/.claude/settings.json |
| TC-UI-014 | 跨平台路径显示 | Windows 系统 | 显示 %USERPROFILE%\.claude\settings.json |

### 组件文件结构

```
src/pages/
└── ConfigSwitcher/
    ├── index.tsx                    # 主页面
    ├── components/
    │   ├── ProviderCard.tsx         # Provider 选择卡片
    │   ├── ExportTargetCard.tsx     # Export Target 卡片
    │   ├── ExportInfoPanel.tsx      # 导出信息面板（显示 MCP/Skills 统计）
    │   └── ExportButton.tsx         # 导出按钮
    ├── hooks/
    │   ├── useConfigSwitcher.ts     # 状态管理 Hook
    │   └── useExport.ts             # 导出逻辑 Hook
    └── types.ts                     # TypeScript 类型定义
```

---

## 待实现功能（参考 cc-switch）

基于 [cc-switch](https://github.com/SaladDay/cc-switch-cli) 项目的功能分析，以下是待实现的功能列表，按优先级排序。

### 🔥 高优先级（必须有）

#### 1. 配置备份与恢复

**功能描述**：

- 导出前自动备份现有配置文件
- 手动创建备份（支持自定义名称）
- 交互式恢复（选择特定备份）
- 自动轮转（保留最近 10 个备份）

**实现要点**：

- 备份存储路径：`~/.mobaus/backups/{tool_name}/{timestamp}/`
- 备份文件命名：`{tool_name}_{timestamp}.tar.gz`
- 恢复时显示备份列表（时间、大小、备注）
- 支持从备份文件恢复到指定工具

**测试用例**：

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-BACKUP-001 | 导出前自动备份 | 导出配置到 Claude Code | 自动创建备份到 ~/.mobaus/backups/claude-code/ |
| TC-BACKUP-002 | 手动创建备份 | 点击"创建备份"按钮 | 创建带自定义名称的备份 |
| TC-BACKUP-003 | 恢复配置 | 选择备份并恢复 | 配置文件恢复到备份时的状态 |
| TC-BACKUP-004 | 备份轮转 | 创建第 11 个备份 | 自动删除最旧的备份 |

---

#### 2. 配置验证

**功能描述**：

- 导出前验证 API Key 格式
- 检查 MCP 命令是否在 PATH 中
- 验证配置文件 JSON/TOML 格式
- 检查必填字段完整性

**实现要点**：

- API Key 格式验证（正则表达式）
- MCP 命令存在性检查（`which` / `where` 命令）
- JSON/TOML 格式校验（serde 反序列化）
- 验证失败时显示详细错误信息

**测试用例**：

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-VALIDATE-001 | API Key 格式错误 | api_key="invalid" | 返回错误：API Key 格式不正确 |
| TC-VALIDATE-002 | MCP 命令不存在 | command="non-existent-cmd" | 返回警告：命令未找到 |
| TC-VALIDATE-003 | JSON 格式错误 | 手动修改配置文件 | 返回错误：JSON 格式不正确 |
| TC-VALIDATE-004 | 必填字段缺失 | 缺少 api_key 字段 | 返回错误：缺少必填字段 |

---

#### 3. 延迟测试

**功能描述**：

- 测试 Provider API 响应速度
- 对比多个 Provider 的延迟
- 显示延迟结果（毫秒）
- 标记最快的 Provider

**实现要点**：

- 发送测试请求到 Provider API（`/v1/models` 或类似端点）
- 计算往返时间（RTT）
- 支持批量测试多个 Provider
- 超时处理（默认 5 秒）

**测试用例**：

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-LATENCY-001 | 测试单个 Provider | 点击"测试延迟"按钮 | 显示延迟结果（如 120ms） |
| TC-LATENCY-002 | 批量测试 | 测试所有 Provider | 显示延迟列表，标记最快的 |
| TC-LATENCY-003 | 超时处理 | Provider 无响应 | 显示"超时"状态 |
| TC-LATENCY-004 | 网络错误 | 网络断开 | 显示"网络错误"状态 |

---

### 🌟 中优先级（很有用）

#### 4. 配置预览

**功能描述**：

- 导出前预览将要写入的配置内容
- 差异对比（当前配置 vs 新配置）
- 支持 JSON/TOML/ENV 格式高亮显示

**实现要点**：

- 读取现有配置文件
- 生成新配置内容（不写入）
- 使用 diff 算法对比差异
- 前端使用代码编辑器组件（Monaco Editor）

---

#### 5. 配置导入

**功能描述**：

- 从外部工具导入配置到 MobausStudio
- 从备份文件恢复
- 从其他 cc-switch 实例导入

**实现要点**：

- 读取外部工具配置文件
- 解析并转换为 MobausStudio 内部格式
- 写入到 `provider_credentials.json` / `mcp_servers.json` / `skills.json`
- 支持选择性导入（仅导入 Provider / MCP / Skills）

**注意**：文档中明确排除了此功能，但实际使用中可能很有用。

---

#### 6. 环境冲突检查

**功能描述**：

- 检测环境变量冲突（如 `ANTHROPIC_API_KEY`）
- 检测配置文件冲突（多个工具使用同一配置文件）
- 提供冲突解决建议

**实现要点**：

- 读取系统环境变量
- 检查是否存在与 Provider 相关的环境变量
- 检查配置文件是否被多个工具使用
- 显示冲突警告和解决方案

---

### 💡 低优先级（锦上添花）

#### 7. 本地 API 代理

**功能描述**：

- 请求拦截和转发
- 自动故障转移到备份 Provider
- 请求日志记录
- Token 使用量追踪和成本监控
- 熔断器（自动故障隔离）

**实现要点**：

- 启动本地 HTTP 代理服务器（如 `http://localhost:8080`）
- 拦截 AI CLI 工具的 API 请求
- 根据配置转发到不同 Provider
- 记录请求日志和 Token 使用量
- 实现熔断器模式（连续失败后自动切换）

**注意**：这是高级功能，适合企业用户或高级用户。

---

#### 8. 云同步支持

**功能描述**：

- 支持 Dropbox / OneDrive / iCloud Drive 同步
- 多设备配置共享
- 自动同步配置变更

**实现要点**：

- 将配置文件存储到云盘目录
- 监听文件变更并自动同步
- 冲突解决（最后修改时间优先）

---

#### 9. Skills 自动发现

**功能描述**：

- 从 GitHub 仓库自动发现 Skills
- 扫描并导入未管理的 Skills
- Skills 仓库管理

**实现要点**：

- 从 GitHub API 获取 Skills 列表
- 扫描 `~/.claude/skills/` 目录
- 识别未管理的 Skills 并提示导入
- 支持添加自定义 Skills 仓库

---

#### 10. Common Snippet

**功能描述**：

- 跨 Provider 共享的通用配置片段
- 避免重复配置
- 支持模板变量替换

**实现要点**：

- 定义通用配置片段（如 `timeout`, `max_tokens`）
- 在导出时自动合并到 Provider 配置中
- 支持变量替换（如 `{{provider_name}}`）

---

## 实现优先级建议

根据用户需求和实用性，建议按以下顺序实现：

1. **Phase 6：配置备份与恢复**（1-2天）
   - 实现自动备份逻辑
   - 实现恢复界面
   - 实现备份轮转

2. **Phase 7：配置验证**（1天）
   - 实现 API Key 格式验证
   - 实现 MCP 命令检查
   - 实现配置文件格式校验

3. **Phase 8：延迟测试**（1天）
   - 实现延迟测试逻辑
   - 实现批量测试
   - 实现结果显示

4. **Phase 9：配置预览**（1-2天）
   - 实现配置预览界面
   - 实现差异对比
   - 集成代码编辑器

5. **Phase 10+：其他功能**（按需实现）
   - 配置导入
   - 环境冲突检查
   - 本地 API 代理
   - 云同步支持
   - Skills 自动发现
   - Common Snippet

---

## 当前版本 (v5.7.0)

### 已实现功能

#### 核心功能
- ✅ **配置导出**：将 MobausStudio 内部配置导出到外部 AI CLI 工具
- ✅ **格式转换**：自动转换为各工具所需格式（TOML/JSON/ENV）
- ✅ **原子写入**：保证配置文件完整性（temp+rename 或 backup+restore）
- ✅ **跨平台路径**：根据操作系统自动选择正确的配置目录
- ✅ **MCP/Skills 同步**：同时导出关联的 MCP 服务器和 Skills 配置
- ✅ **启用状态持久化**：记录每个工具当前启用的 Provider，刷新页面后保持状态

#### 支持的外部工具
- ✅ Claude Code（~/.claude/settings.json + ~/.claude.json）
- ✅ Codex（~/.codex/auth.json + ~/.codex/config.toml）
- ✅ Gemini CLI（~/.gemini/.env + ~/.gemini/settings.json）
- ✅ OpenCode（~/.opencode/config.json）
- ✅ OpenClaw（~/.openclaw/config.json）

#### 配置保留逻辑
- ✅ **Codex config.toml 保留**：使用 `toml_edit` 只更新 `base_url` 和 `mcp_servers`，保留用户其他字段和注释
- ✅ **Claude permissions 深度合并**：递归合并 `permissions` 对象，保留用户的 `deny` 规则
- ✅ **Windows MCP 命令包装**：自动为 `npx`/`npm`/`node`/`yarn`/`pnpm`/`bun`/`deno` 添加 `cmd /c` 前缀

#### 数据一致性
- ✅ **Codex 迁移逻辑**：自动迁移错误格式 `mcp.servers` → `mcp_servers`，并清理旧值
- ✅ **Codex 清理逻辑**：当 MCP 服务器或 Skills 无启用项时，清理 config.toml 中的旧值
- ✅ **base_url 字段对齐**：从 `custom_providers.json` 读取 `endpoint` 字段（与前端数据模型对齐）

### 已知限制

#### 认证类型
- ❌ **OAuth 不支持**：仅支持 API Key 认证类型，OAuth 需要使用代理服务器
- ✅ **API Key 支持**：支持所有使用 API Key 认证的 Provider

#### 配置导入
- ❌ **不支持导入**：当前版本不支持从外部工具导入配置到 MobausStudio
- ✅ **单向导出**：仅支持 MobausStudio → 外部工具的单向导出

#### 配置备份
- ❌ **无自动备份**：导出前不会自动备份现有配置文件
- ⚠️ **手动备份建议**：建议用户在首次导出前手动备份配置文件

#### 配置验证
- ❌ **无 API Key 验证**：不验证 API Key 格式或有效性
- ❌ **无 MCP 命令检查**：不检查 MCP 命令是否在 PATH 中

#### 延迟测试
- ❌ **无延迟测试**：不支持测试 Provider API 响应速度

#### 配置预览
- ❌ **无配置预览**：导出前不支持预览将要写入的配置内容
- ❌ **无差异对比**：不支持对比当前配置 vs 新配置

### 测试覆盖率

#### 后端测试
- ✅ **135/135 测试通过**
- ✅ **无编译警告**
- ✅ **测试隔离**：使用临时目录，不污染真实配置

#### 前端测试
- ✅ **25/25 测试通过**
- ✅ **无 React 警告**
- ✅ **异步状态测试**：所有测试使用 `waitFor` 等待异步状态更新

### 待实现功能

参考 [cc-switch](https://github.com/SaladDay/cc-switch-cli) 项目，以下功能按优先级排序：

#### 🔥 高优先级
1. **配置备份与恢复**：导出前自动备份，支持恢复到指定备份
2. **配置验证**：验证 API Key 格式、MCP 命令存在性、配置文件格式
3. **延迟测试**：测试 Provider API 响应速度，对比多个 Provider

#### 🌟 中优先级
4. **配置预览**：导出前预览配置内容，差异对比
5. **配置导入**：从外部工具导入配置到 MobausStudio
6. **环境冲突检查**：检测环境变量冲突、配置文件冲突

#### 💡 低优先级
7. **本地 API 代理**：请求拦截和转发、自动故障转移、Token 使用量追踪
8. **云同步支持**：Dropbox / OneDrive / iCloud Drive 同步
9. **Skills 自动发现**：从 GitHub 仓库自动发现 Skills
10. **Common Snippet**：跨 Provider 共享的通用配置片段

---

## OAuth Proxy 设计（待实现）

### 背景

当前版本仅支持 API Key 认证类型，OAuth 认证的 Provider（如 Google、GitHub 等）无法直接导出。参考 [CCS](https://github.com/kaitranntt/ccs) 和 [cc-switch](https://github.com/SaladDay/cc-switch-cli) 的实现，需要通过本地 Proxy 服务来支持 OAuth 认证。

### 架构设计

#### 整体架构

```
MobausStudio (Tauri App)
    ↓
OAuth Proxy Server (http://localhost:8080)
    ↓ (处理 OAuth 认证 + Token 管理)
    ↓
External AI CLI Tools (Claude Code, Codex, Gemini CLI)
    ↓
AI Provider APIs (Google, GitHub, etc.)
```

#### 核心模块

```
src-tauri/src/services/
└── oauth_proxy/
    ├── mod.rs                  # 模块入口
    ├── server.rs               # HTTP 服务器（axum）
    ├── oauth_flow.rs           # OAuth 认证流程
    ├── token_manager.rs        # Token 管理（存储、刷新）
    ├── proxy_handler.rs        # 请求代理和转发
    └── providers/              # OAuth Provider 实现
        ├── google.rs           # Google OAuth
        ├── github.rs           # GitHub OAuth
        └── mod.rs
```

### OAuth 认证流程

#### 1. 首次认证

```rust
// 伪代码
async fn oauth_login(provider: &str) -> Result<Token> {
    // 1. 生成 OAuth URL（带 state 和 PKCE）
    let (auth_url, state, verifier) = generate_oauth_url(provider)?;

    // 2. 打开浏览器进行认证
    open_browser(&auth_url)?;

    // 3. 启动本地回调服务器（监听 http://localhost:3000/callback）
    let code = wait_for_callback(state).await?;

    // 4. 交换 access_token
    let token = exchange_token(provider, code, verifier).await?;

    // 5. 加密存储 token
    save_token_encrypted(provider, &token)?;

    Ok(token)
}
```

#### 2. Token 刷新

```rust
async fn refresh_token_if_needed(provider: &str) -> Result<Token> {
    let token = load_token(provider)?;

    if token.is_expired() {
        // 使用 refresh_token 获取新的 access_token
        let new_token = refresh_access_token(provider, &token.refresh_token).await?;
        save_token_encrypted(provider, &new_token)?;
        Ok(new_token)
    } else {
        Ok(token)
    }
}
```

### Proxy 服务实现

#### 1. HTTP 服务器

```rust
use axum::{Router, routing::any};

async fn start_proxy_server() -> Result<()> {
    let app = Router::new()
        .route("/claude/*path", any(proxy_claude))
        .route("/gemini/*path", any(proxy_gemini))
        .route("/github/*path", any(proxy_github))
        .route("/health", get(health_check));

    let listener = tokio::net::TcpListener::bind("127.0.0.1:8080").await?;
    axum::serve(listener, app).await?;

    Ok(())
}
```

#### 2. 请求代理

```rust
async fn proxy_request(
    provider: &str,
    path: &str,
    req: Request<Body>
) -> Result<Response<Body>> {
    // 1. 获取或刷新 token
    let token = refresh_token_if_needed(provider).await?;

    // 2. 构建目标 URL
    let target_url = format!("{}/{}", get_provider_base_url(provider), path);

    // 3. 添加 Authorization header
    let mut headers = req.headers().clone();
    headers.insert(
        "Authorization",
        format!("Bearer {}", token.access_token).parse()?
    );

    // 4. 转发请求
    let client = reqwest::Client::new();
    let resp = client
        .request(req.method().clone(), &target_url)
        .headers(headers)
        .body(req.into_body())
        .send()
        .await?;

    // 5. 返回响应
    Ok(resp.into())
}
```

### Token 存储

#### 存储格式

```json
// ~/.mobaus/oauth_tokens.json (加密存储)
{
  "google": {
    "access_token": "ya29.xxx",
    "refresh_token": "1//xxx",
    "expires_at": "2026-03-08T12:00:00Z",
    "scope": "https://www.googleapis.com/auth/generative-language"
  },
  "github": {
    "access_token": "gho_xxx",
    "refresh_token": "ghr_xxx",
    "expires_at": "2026-03-08T12:00:00Z",
    "scope": "read:user"
  }
}
```

#### 加密方案

使用 `aes-gcm` 加密 token 文件：

```rust
use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::aead::{Aead, KeyInit};

fn encrypt_token_file(data: &str, key: &[u8]) -> Result<Vec<u8>> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(b"unique nonce"); // 实际使用随机 nonce

    let ciphertext = cipher.encrypt(nonce, data.as_bytes())?;
    Ok(ciphertext)
}
```

### 配置导出集成

#### OAuth Provider 导出逻辑

```rust
// export_service.rs
pub async fn export_provider(
    &self,
    provider_id: &str,
    tool_name: &str,
) -> Result<(), ConfigExportError> {
    let provider = self.load_provider(provider_id)?;

    match provider.auth_type.as_str() {
        "api" => {
            // 现有逻辑：直接导出 API Key
            self.export_api_key_provider(provider, tool_name)?;
        }
        "oauth" => {
            // 新逻辑：配置指向 Proxy
            self.export_oauth_provider(provider, tool_name)?;
        }
        _ => return Err(ConfigExportError::UnsupportedAuthType),
    }

    Ok(())
}

fn export_oauth_provider(
    &self,
    provider: &Provider,
    tool_name: &str,
) -> Result<()> {
    // 1. 确保 Proxy 服务已启动
    ensure_proxy_running()?;

    // 2. 生成配置指向 Proxy
    let config = match tool_name {
        "claude-code" => json!({
            "api": {
                "baseUrl": "http://localhost:8080/claude",
                "apiKey": "proxy-managed"  // 占位符
            }
        }),
        "codex" => json!({
            "base_url": "http://localhost:8080/codex"
        }),
        _ => return Err(ConfigExportError::UnsupportedTool),
    };

    // 3. 写入配置文件
    self.writer.write_config(tool_name, &config)?;

    Ok(())
}
```

### UI 设计

#### 1. OAuth 认证界面

```
┌─────────────────────────────────────────────────────────┐
│ OAuth Authentication                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Provider: Google Gemini                                │
│                                                         │
│  Status: ⏳ Waiting for browser authentication...      │
│                                                         │
│  Steps:                                                 │
│  1. ✅ Browser opened                                   │
│  2. ⏳ Waiting for authorization...                     │
│  3. ⏸️  Exchange token                                  │
│                                                         │
│  [Cancel]                                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### 2. Token 管理界面

```
┌─────────────────────────────────────────────────────────┐
│ OAuth Tokens                                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Google Gemini                                          │
│  Status: ✅ Active                                      │
│  Expires: 2026-03-08 12:00:00                          │
│  [Refresh] [Revoke]                                     │
│                                                         │
│  GitHub Copilot                                         │
│  Status: ⚠️  Expired                                    │
│  Expires: 2026-03-07 10:00:00                          │
│  [Re-authenticate]                                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 安全考虑

#### 1. Token 加密

- 使用 AES-256-GCM 加密存储
- 密钥派生自系统密钥链（macOS Keychain / Windows Credential Manager）
- 每次启动时解密到内存

#### 2. Proxy 安全

- 仅监听 localhost，不暴露到外网
- 使用随机端口（如果 8080 被占用）
- 添加请求签名验证（防止本地恶意程序滥用）

#### 3. Token 刷新

- 后台定时检查 token 过期时间
- 提前 5 分钟自动刷新
- 刷新失败时通知用户重新认证

### 实现计划

#### Phase 1：基础框架（2-3天）

1. 创建 `oauth_proxy` 模块结构
2. 实现 HTTP 服务器（axum）
3. 实现 Token 存储和加密
4. 添加健康检查端点

#### Phase 2：OAuth 认证流程（3-4天）

1. 实现 Google OAuth 流程
2. 实现 GitHub OAuth 流程
3. 实现浏览器回调处理
4. 实现 Token 刷新逻辑

#### Phase 3：Proxy 转发（2-3天）

1. 实现请求代理逻辑
2. 添加 Authorization header
3. 处理错误和重试
4. 添加请求日志

#### Phase 4：集成到导出服务（1-2天）

1. 修改 `export_service.rs` 支持 OAuth
2. 配置文件指向 Proxy
3. 确保 Proxy 服务自动启动

#### Phase 5：UI 实现（2-3天）

1. OAuth 认证界面
2. Token 管理界面
3. 状态显示和错误提示

#### Phase 6：测试（2-3天）

1. 单元测试（OAuth 流程、Token 管理）
2. 集成测试（端到端认证流程）
3. 手动测试（各 OAuth Provider）

**总计**：约 12-18 天

### 依赖库

```toml
[dependencies]
# OAuth Proxy
axum = "0.7"                    # HTTP 服务器
tower = "0.4"                   # 中间件
tower-http = "0.5"              # HTTP 中间件
oauth2 = "4"                    # OAuth 2.0 客户端
aes-gcm = "0.10"                # AES-GCM 加密
keyring = "2"                   # 系统密钥链访问
```

### 参考资料

- [CCS (Claude Code Switch)](https://github.com/kaitranntt/ccs) - OAuth Proxy 实现参考
- [cc-switch-cli](https://github.com/SaladDay/cc-switch-cli) - 配置管理参考
- [oauth2-proxy](https://github.com/oauth2-proxy/oauth2-proxy) - OAuth 代理参考
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [GitHub OAuth Apps](https://docs.github.com/en/apps/oauth-apps)

---

## 变更记录

| 日期 | 版本 | 修改人 | 修改内容 |
|------|------|--------|---------|
| 2026-03-07 | 1.0.0 | MobausStudio | 初始版本 - 纯导出模块设计 |
| 2026-03-07 | 2.0.0 | MobausStudio | 重大重构：移除数据库表，改为无状态设计；明确从 cc-switch 复用逻辑 |
| 2026-03-07 | 2.1.0 | MobausStudio | 修正关键问题：Claude 路径改为 ~/.claude/settings.json；Codex auth.json 改为扁平结构；get_data_dir() 使用 app_handle.path().app_data_dir() |
| 2026-03-07 | 2.2.0 | MobausStudio | 修复5个关键问题：(1) 测试隔离 - Writer 支持路径注入；(2) Skills 导出 - Claude Code 写入 permissions.allow；(3) 文档修正 - "只写不读"改为"合并写入"；(4) base_url 支持 - 从 custom_providers.json 提取；(5) 结构体复用 - 使用 lib.rs 的 pub 类型 |
| 2026-03-07 | 3.0.0 | MobausStudio | 新增前端 UI 设计：页面布局、组件设计、交互流程、状态管理、测试用例 |
| 2026-03-07 | 3.1.0 | MobausStudio | 修正文档与实现不一致：(1) API 命名 - 使用实际的 load_provider_credentials/load_mcp_servers/load_skills；(2) 简化 UI - 移除 includeMcp/includeSkills 选项，MCP/Skills 自动包含；(3) 代码结构 - 命令在 lib.rs 而非独立 commands 文件；(4) 测试用例 - 移除不可测场景 |
| 2026-03-07 | 3.2.0 | MobausStudio | 前端实现完成并修复关键问题：(1) 移除假开关 - MCP/Skills 自动包含；(2) Provider 可选条件修正 - 仅显示已连接的 Provider；(3) 分类显示 - 已连接/未连接/不支持；(4) 自动选择首个已连接 Provider；(5) 后端测试全部通过（20/20） |
| 2026-03-08 | 3.3.0 | MobausStudio | 实现批量导出功能：(1) AppSwitcher 支持多选模式；(2) 批量导出进度显示；(3) 批量导出结果汇总；(4) 复用后端 batch_export_providers 命令 |
| 2026-03-08 | 3.4.0 | MobausStudio | 实现路径 API：(1) 后端 get_tool_config_paths 命令；(2) 复用 cc-switch 路径获取逻辑；(3) 前端移除硬编码路径；(4) 跨平台路径展开 |
| 2026-03-08 | 3.5.0 | MobausStudio | 完整国际化：(1) 补全所有 UI 文案的中英文翻译；(2) 使用 useI18n Hook；(3) 支持动态语言切换 |
| 2026-03-08 | 4.0.0 | MobausStudio | 重大重构 - 改为单工具启用模式：(1) 移除多选逻辑，改为单选工具 tab；(2) 交互流程：切换工具 → 选择 Provider → 点击启用；(3) 更新文案：导出 → 启用；(4) 简化状态管理；(5) 参考 cc-switch 的启用逻辑 |
| 2026-03-08 | 4.1.0 | MobausStudio | 优化交互体验（参考 cc-switch）：(1) 启用按钮移到 Provider 卡片右侧；(2) 非连接 Provider 不显示；(3) 添加切换动画（fadeIn）；(4) 移除底部统一启用按钮；(5) 无需选择 Provider，直接点击启用 |
| 2026-03-09 | 4.2.0 | MobausStudio | 协议优先级实现（v0.9.5）：(1) 前端使用 getDefaultProtocol() 获取提供商默认协议；(2) 协议优先级：模型协议 > 提供商默认协议 > 自定义提供商协议；(3) 更新配置流向图，添加协议判断步骤 |
| 2026-03-08 | 4.2.0 | MobausStudio | 完善启用状态和动画：(1) 移除 MCP/Skills 配置显示（应在各自页面配置）；(2) 优化切换动画避免闪烁（0.25s + forwards）；(3) 添加启用状态持久化（已启用显示绿色边框和"已启用"按钮）；(4) 已启用的 Provider 按钮变为绿色且禁用 |
| 2026-03-08 | 4.3.0 | MobausStudio | 完善用户体验：(1) 启用状态持久化到 localStorage（刷新页面保持状态）；(2) 配置路径添加复制按钮（hover 显示）；(3) 优化错误提示（成功/错误/信息三种状态，带图标和颜色）；(4) 错误消息显示时间延长到 5 秒 |
| 2026-03-08 | 4.3.1 | MobausStudio | 修复持久化问题：(1) 移除 localStorage 持久化（会话级别状态）；(2) 启用状态仅在当前会话有效；(3) 刷新页面后重置状态；(4) 配置文件已导出到磁盘，用户可随时重新启用覆盖 |
| 2026-03-08 | 5.0.0 | MobausStudio | 实现后端状态持久化（参考 cc-switch）：(1) 新增 enabled_state.rs 模块管理启用状态；(2) 状态存储在 tool_enabled_state.json；(3) 导出成功后自动更新状态；(4) 前端从后端读取启用状态（get_enabled_providers 命令）；(5) 刷新页面后保持启用状态；(6) 所有测试通过（132/132） |
| 2026-03-08 | 5.1.0 | MobausStudio | UI 优化（参考 cc-switch）：(1) Provider 卡片添加背景渐变和阴影效果；(2) 启用按钮添加 hover 缩放动画；(3) 卡片边框优化（启用状态绿色，hover 紫色）；(4) 所有卡片添加 border 提升层次感；(5) 图标容器添加 hover 缩放效果 |
| 2026-03-08 | 5.2.0 | MobausStudio | 修复 base_url 字段不对齐：(1) export_service.rs:340 改为读取 endpoint 字段；(2) 与前端数据模型对齐；(3) 修复自定义 Provider base URL 导出问题 |
| 2026-03-08 | 5.3.0 | MobausStudio | 修复所有已知问题（参考 cc-switch）：(1) Codex config.toml 保留现有内容（使用 toml_edit）；(2) permissions 深度合并（保留用户 deny 规则）；(3) Windows MCP 命令包装（npx/npm/node 添加 cmd /c）；(4) 所有测试通过（133/133） |
| 2026-03-08 | 5.4.0 | MobausStudio | 修复三个关键缺陷：(1) Codex base_url 字段统一为 base_url（transformer 和 writer 对齐）；(2) Windows 命令包装改为 command="cmd" + args=["/c", "npx", ...]（与 cc-switch 一致）；(3) Codex Skills 配置写入 permissions 表（修复丢失问题）；(4) 所有测试通过（133/133） |
| 2026-03-08 | 5.5.0 | MobausStudio | 实现 ConfigSwitcher 前端测试：(1) 创建 ConfigSwitcher.test.tsx（11个测试用例）；(2) 创建 AppSwitcher.test.tsx（7个测试用例）；(3) 创建 ProviderSelector.test.tsx（7个测试用例）；(4) 所有测试通过（25/25 前端 + 133/133 后端） |
| 2026-03-08 | 5.6.0 | MobausStudio | 修复代码质量问题：(1) P1-3: Codex 清理逻辑完整化 - mcp_servers 和 permissions 无启用项时清理旧值；(2) P2-1: EnabledState 持久化改为原子写入（复用 atomic_write）；(3) P3: 清理未使用的导入和重复代码；(4) 所有测试通过（24/24），无编译警告 |
| 2026-03-08 | 5.7.0 | MobausStudio | 修复 cc-switch 对齐问题：(1) P1: Codex 迁移错误格式 mcp.servers → mcp_servers（添加迁移逻辑和清理）；(2) P2: Windows 命令包装扩展到 yarn/pnpm/bun/deno；(3) P3: 清理 EnabledState 未使用方法（get_enabled_provider, get_all_enabled_providers）；(4) P3: 修复前端 React act(...) 警告（所有测试添加 waitFor 等待异步状态更新）；(5) 新增测试用例 TC-WRITER-012/013；(6) 所有测试通过（后端 135/135，前端 25/25），无编译警告，无 React 警告 |
| 2026-03-08 | 6.0.0 | MobausStudio | 重大改进 - 完善一致性和可维护性：(1) Windows 命令包装提取为公共函数（windows_cmd_wrapper.rs + 5个单元测试）；(2) Provider 断开时自动清理启用状态（save_provider_credentials 中实现）；(3) 新增 3 个集成测试（TC-INTEGRATION-001/002/003：导出更新状态、断开清理状态、Codex 迁移全流程）；(4) 所有单元测试通过（145/145），集成测试需串行运行（使用 TEST_HOME_DIR 环境变量）；(5) 无编译警告 |
| 2026-03-08 | 5.8.0 | MobausStudio | 实现状态一致性闭环：(1) 新增 EnabledState.cleanup_deleted_providers() 方法；(2) save_provider_credentials 命令自动清理已删除 Provider 的启用状态；(3) 新增测试用例 TC-ENABLED-STATE-005/006/007；(4) 文档添加"当前版本"章节（记录已实现功能、已知限制、测试覆盖率、待实现功能）；(5) 所有测试通过（后端 146/146，前端 25/25） |
| 2026-03-08 | 5.8.1 | MobausStudio | 修复集成测试并发问题：(1) 添加 serial_test 依赖；(2) 所有集成测试添加 #[serial] 标记，避免环境变量竞争；(3) 测试稳定性提升，无偶发失败；(4) 所有测试通过（后端 146/146，前端 25/25） |
| 2026-03-09 | 5.9.0 | MobausStudio | 实现禁用功能：(1) 后端新增 disable_provider_for_tool 命令；(2) 前端已启用的 Provider 显示红色"禁用"按钮（可点击禁用）；(3) 禁用后清理工具配置文件和启用状态；(4) 更新测试用例适配新交互逻辑 |
| 2026-03-09 | 5.9.1 | MobausStudio | 修复前端测试失败：(1) TC-UI-005: 修复 export_provider_to_tool 调用参数检查（使用 expect.objectContaining）；(2) TC-UI-006: 修复成功消息匹配正则；(3) TC-UI-007: 补充 load_models mock 返回值；(4) TC-UI-010 和 ProviderSelector: 更新测试期望为"禁用"按钮；(5) 所有测试通过（后端 146/146，前端 1466/1466） |
| 2026-03-13 | 5.10.0 | - | 修复配置导出残留/误删问题：(1) JSON 导出（Claude/Gemini/OpenCode/OpenClaw）在 MCP/permissions 为空时主动删除目标文件中的旧字段；(2) Codex TOML 导出不再误删用户手写的 permissions，仅在有 skills 时覆盖 permissions.allow |
| 2026-03-13 | 5.10.1 | - | 修复嵌套字段残留：将 api、provider、baseUrl 等导出器完全管理的对象加入 managed_keys，merge 前先删除再写入，避免去掉自定义端点后旧 baseUrl/baseURL 残留 |
| 2026-03-13 | 5.11.0 | - | UI 美化优化：(1) AppSwitcher 工具选择器改为卡片网格布局，添加品牌色图标和已配置状态标记；(2) ProviderSelector 提供商卡片增加图标渐变色和更精致的布局；(3) 主页面布局优化，目标路径区域和状态消息样式统一；(4) 整体视觉风格与项目其他页面（Agent/Skills/MCP）保持一致 |
| 2026-03-13 | 5.11.1 | - | (1) 模块重命名：「配置导出」→「配置切换」，更新 i18n 中英文翻译和侧边栏导航标签；(2) AppSwitcher 紧凑化：从卡片网格改为单行水平胶囊按钮布局，大幅减少垂直空间占用；(3) 更新前端测试适配新布局 |
