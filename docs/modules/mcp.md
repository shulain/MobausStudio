# MCP 服务器模块

## 📋 模块概述

MCP (Model Context Protocol) 模块实现 Anthropic 官方 [Model Context Protocol](https://modelcontextprotocol.io/) 规范，提供与外部 MCP 服务器的真实连接和交互能力。

| 属性 | 值 |
|------|------|
| 模块路径 | `src/components/features/MCP` |
| 存储服务 | `src/services/storage.ts` |
| Rust 命令 | `src-tauri/src/mcp/` |
| 协议版本 | 2025-03-26 |
| 创建日期 | 2026-01-18 |
| 最后更新 | 2026-03-06 |

---

## 🎯 功能列表

### v2.6.0 - 删除确认增强 (新增)

- [x] **删除二次确认** - 删除 MCP 服务器前显示确认对话框
- [x] **防误删保护** - 避免用户误操作导致配置丢失
- [x] **国际化支持** - 确认对话框支持中英文

### v2.5.0 - HTTP 传输与 UI 增强

- [x] **HTTP/HTTPS 传输** - 远程 MCP 服务器连接支持
- [x] **认证支持** - API Key 和 Bearer Token 认证
- [x] **会话 ID 管理** - 服务器分配的 Mcp-Session-Id 处理
- [x] **ToolCall.serverName** - 工具调用显示服务器名称而非 ID
- [x] **新错误类型** - HttpError, ConnectionFailed, AuthError, ParseError

### v2.4.0 - ToolCallDisplay 增强

- [x] **执行完成后默认展开** - 自动展开显示结果
- [x] **显示执行耗时** - duration 字段支持

### v2.1.0 - Chat/Agent 集成 (新增)

- [x] **Agent-MCP 绑定** - Agent 可配置关联的 MCP 服务器
- [x] **Chat 工具调用** - 对话中 AI 可请求调用 MCP 工具
- [x] **工具执行循环** - 支持多轮工具调用直到 AI 完成任务
- [x] **工具调用 UI** - 清晰展示工具调用过程和结果
- [x] **useMCPTools Hook** - 统一的工具调用接口
- [x] **ToolCallDisplay 组件** - 工具调用状态展示组件

### v2.0.0 - 真实 MCP 协议支持

- [x] **stdio 传输** - 本地 MCP 服务器子进程通信
- [x] **Streamable HTTP 传输** - 远程 MCP 服务器 HTTP 连接 (v2.5.0)
- [x] **JSON-RPC 2.0 消息** - 标准协议消息格式
- [x] **服务器初始化** - initialize 握手流程
- [x] **工具发现** - tools/list 获取可用工具
- [x] **资源发现** - resources/list 获取可用资源
- [x] **工具调用** - tools/call 执行工具
- [x] **会话管理** - 连接状态和生命周期管理

### v1.x - 基础功能 (已完成)

- [x] MCP 服务器列表展示
- [x] 服务器连接状态监控
- [x] 添加/编辑/删除服务器
- [x] 连接测试 (HTTP HEAD)
- [x] 数据持久化
- [x] 输入验证

---

## 🏗️ 架构设计

### MCP 协议架构

```
┌─────────────────────────────────────────────────────────────┐
│                    MobausStudio (Host)                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  MCP Client (Rust)                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │   Session   │  │  JSON-RPC   │  │  Transport  │  │   │
│  │  │   Manager   │  │   Handler   │  │   Layer     │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └──────────────────────────┬──────────────────────────┘   │
│                             │                               │
└─────────────────────────────┼───────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
    ┌───────────┐       ┌───────────┐       ┌───────────┐
    │  stdio    │       │ Streamable│       │   SSE     │
    │ Transport │       │   HTTP    │       │ (Legacy)  │
    └─────┬─────┘       └─────┬─────┘       └─────┬─────┘
          │                   │                   │
          ▼                   ▼                   ▼
    ┌───────────┐       ┌───────────┐       ┌───────────┐
    │  Local    │       │  Remote   │       │  Remote   │
    │  Server   │       │  Server   │       │  Server   │
    │ (Process) │       │  (HTTP)   │       │  (HTTP)   │
    └───────────┘       └───────────┘       └───────────┘
```

### 文件结构

```
src-tauri/src/
├── lib.rs                 # Tauri 命令入口
└── mcp/
    ├── mod.rs             # MCP 模块入口
    ├── client.rs          # MCP 客户端实现
    ├── transport/
    │   ├── mod.rs         # 传输层抽象
    │   ├── stdio.rs       # stdio 传输实现
    │   └── http.rs        # Streamable HTTP 传输
    ├── protocol.rs        # JSON-RPC 消息定义
    └── session.rs         # 会话管理

src/components/features/MCP/
├── index.tsx              # MCPPage 页面组件
├── MCPCard.tsx            # 服务器卡片 (显示能力)
├── MCPModal.tsx           # 添加/编辑服务器
└── MCPToolsPanel.tsx      # 工具列表和调用面板

src/components/features/Chat/
└── ToolCallDisplay.tsx    # 工具调用状态展示组件 (v2.1.0)

src/hooks/
└── useMCPTools.ts         # MCP 工具调用 Hook (v2.1.0)

src/services/
└── storage.ts             # mcpServersStorage 持久化
```

---

## 📐 数据结构

### MCPServer (v2.2.0)

```typescript
interface MCPServer {
  id: string;                                    // 唯一标识
  name: string;                                  // 服务器名称
  description: string;                           // 描述

  // ===== 启用与自启动配置 (v2.2.0) =====
  enabled: boolean;                              // 是否启用（false = 完全禁用，不参与任何操作）
  autoStart: boolean;                            // 是否自动启动（应用启动时自动连接）

  // 传输配置
  transportType: 'stdio' | 'http';               // 传输类型

  // stdio 传输配置
  command?: string;                              // 启动命令 (如 "npx")
  args?: string[];                               // 命令参数 (如 ["-y", "@modelcontextprotocol/server-filesystem"])
  env?: Record<string, string>;                  // 环境变量

  // HTTP 传输配置
  endpoint?: string;                             // HTTP 端点 URL

  // 认证配置
  authType: 'none' | 'apikey' | 'token';        // 认证方式
  authValue?: string;                            // 认证值 (敏感数据)

  // 连接状态
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  errorMessage?: string;                         // 错误信息

  // 服务器能力 (连接后获取)
  serverInfo?: {
    name: string;
    version: string;
  };
  capabilities?: {
    tools?: boolean;                             // 支持工具
    resources?: boolean;                         // 支持资源
    prompts?: boolean;                           // 支持提示模板
  };

  // 已发现的工具列表
  tools?: MCPTool[];

  // 统计信息
  lastActiveAt?: Date;
  requestCount: number;

  // 元数据
  createdAt: Date;
  updatedAt: Date;
}
```

### MCPTool

```typescript
interface MCPTool {
  name: string;                                  // 工具名称
  description?: string;                          // 工具描述
  inputSchema: {                                 // JSON Schema 输入定义
    type: 'object';
    properties?: Record<string, JSONSchema>;
    required?: string[];
  };
}
```

### MCPResource

```typescript
interface MCPResource {
  uri: string;                                   // 资源 URI
  name: string;                                  // 资源名称
  description?: string;                          // 资源描述
  mimeType?: string;                             // MIME 类型
}
```

### MCPServerCreateInput (v2.0.0)

```typescript
interface MCPServerCreateInput {
  name: string;
  description: string;
  transportType: 'stdio' | 'http';

  // stdio 配置
  command?: string;
  args?: string[];
  env?: Record<string, string>;

  // HTTP 配置
  endpoint?: string;

  // 认证配置
  authType: 'none' | 'apikey' | 'token';
  authValue?: string;
}
```

---

## 💾 持久化规范 (v2.0.1)

### 字段映射规则

前端使用 **camelCase**，后端 Rust 使用 **snake_case**。保存时需要正确转换：

| 前端字段 (camelCase) | 后端字段 (snake_case) | 说明 |
|---------------------|----------------------|------|
| `enabled` | `enabled` | 是否启用 (v2.2.0) |
| `autoStart` | `auto_start` | 是否自动启动 (v2.2.0) |
| `transportType` | `transport_type` | 传输类型 (stdio/http) |
| `authType` | `auth_type` | 认证类型 |
| `authValue` | `auth_value` | 认证值 |
| `lastActiveAt` | `last_active_at` | 最后活跃时间 |
| `requestCount` | `request_count` | 请求计数 |
| `errorMessage` | `error_message` | 错误信息 |
| `createdAt` | `created_at` | 创建时间 |
| `updatedAt` | `updated_at` | 更新时间 |

### 持久化字段 vs 运行时字段

**需要持久化的字段**：
- 基础标识：`id`, `name`, `description`
- 启用配置：`enabled`, `auto_start` (v2.2.0)
- 传输配置：`transport_type`, `command`, `args`, `env`, `endpoint`
- 认证配置：`auth_type`, `auth_value`
- 统计信息：`last_active_at`, `request_count`
- 元数据：`created_at`, `updated_at`

**不需要持久化的运行时字段**：
- `status` - 保存时重置为 `'disconnected'`
- `errorMessage` - 运行时错误信息
- `serverInfo` - 连接后获取的服务器信息
- `capabilities` - 连接后获取的服务器能力
- `tools` - 连接后获取的工具列表
- `resources` - 连接后获取的资源列表

### 持久化测试用例

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-P01 | stdio 服务器持久化 | transportType='stdio', command='npx' | 重启后配置完整保留 | [ ] |
| MCP-P02 | http 服务器持久化 | transportType='http', endpoint='...' | 重启后配置完整保留 | [ ] |
| MCP-P03 | 认证信息持久化 | authType='apikey', authValue='xxx' | 重启后认证信息正确恢复 | [ ] |
| MCP-P04 | 运行时字段不持久化 | 连接后有 tools/serverInfo | 重启后 tools/serverInfo 为空 | [ ] |
| MCP-P05 | 编辑服务器后持久化 | 修改现有服务器配置 | 重启后保留编辑后的配置 | [ ] |
| MCP-P06 | transport_type 字段映射 | 前端 transportType='stdio' | 后端保存为 transport_type='stdio' | [ ] |
| MCP-P07 | enabled 字段持久化 | enabled=false | 重启后 enabled=false 保持 | [ ] |
| MCP-P08 | autoStart 字段持久化 | autoStart=true | 重启后 autoStart=true 保持 | [ ] |
| MCP-P09 | 新建服务器默认值 | 不指定 enabled/autoStart | enabled=true, autoStart=false | [ ] |

### v2.2.0 启用与自启动测试

#### enabled/autoStart 行为测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-E01 | 禁用的服务器不显示在可用列表 | enabled=false | 不出现在 Agent 可选 MCP 列表中 | [ ] |
| MCP-E02 | 禁用的服务器不参与工具调用 | enabled=false | useMCPTools 不返回该服务器的工具 | [ ] |
| MCP-E03 | 自动启动的服务器在应用启动时连接 | autoStart=true, enabled=true | 应用启动后自动调用 mcp_connect | [ ] |
| MCP-E04 | 非自动启动的服务器需手动连接 | autoStart=false, enabled=true | 应用启动后状态为 disconnected | [ ] |
| MCP-E05 | 禁用的服务器不自动启动 | autoStart=true, enabled=false | 即使 autoStart=true 也不连接 | [ ] |
| MCP-E06 | 切换启用状态 | enabled: true → false | 如果已连接则断开，状态变为 disconnected | [ ] |
| MCP-E07 | 启用后手动连接 | enabled: false → true | 状态为 disconnected，可手动点击连接 | [ ] |
| MCP-E08 | UI 显示禁用状态 | enabled=false | 卡片显示禁用样式（灰色/半透明） | [ ] |
| MCP-E09 | UI 显示自启动标识 | autoStart=true | 卡片显示自启动图标/徽章 | [x] |

### v2.2.0 重连与请求计数测试

#### 重连功能测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-R01 | 已连接服务器显示重连按钮 | status='connected' | 卡片显示"重连"按钮 | [x] |
| MCP-R02 | 点击重连按钮执行重连 | 点击重连按钮 | 先断开再重新连接，状态变为 connected | [x] |
| MCP-R03 | 重连过程中按钮禁用 | 重连进行中 | 按钮显示加载状态，不可点击 | [x] |
| MCP-R04 | 重连失败显示错误状态 | 重连时服务器不可用 | status='error'，显示错误信息 | [ ] |
| MCP-R05 | 重连成功刷新工具列表 | 重连成功 | 重新获取 tools 列表 | [ ] |

#### 配置修改自动断开重连测试 (v2.3.0)

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-U01 | 修改已连接服务器配置 | status='connected'，修改 endpoint | 先断开后端连接，保存配置，状态变为 disconnected | [ ] |
| MCP-U02 | 修改未连接服务器配置 | status='disconnected'，修改 endpoint | 直接保存配置，不触发断开操作 | [ ] |
| MCP-U03 | 修改已连接服务器并启用 autoStart | status='connected'，修改配置并设置 autoStart=true | 断开 → 保存 → 自动重连 | [ ] |
| MCP-U04 | 禁用已连接服务器 | status='connected'，enabled: true → false | 先断开连接，再保存配置 | [ ] |
| MCP-U05 | 启用已断开服务器 | status='disconnected'，enabled: false → true | 保存配置，状态保持 disconnected（需手动连接） | [ ] |
| MCP-U06 | 切换 enabled 状态时 UI 同步 | 切换 enabled | UI 状态与后端同步，无不一致 | [ ] |

#### 工具展开显示测试 (v2.3.0)

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-T01 | 工具列表默认折叠 | 工具数量 > 5 | 只显示前 5 个工具 + 展开按钮 | [x] |
| MCP-T02 | 点击展开按钮 | 点击"展开全部" | 显示所有工具，按钮变为"收起" | [x] |
| MCP-T03 | 点击收起按钮 | 点击"收起" | 恢复只显示前 5 个工具 | [x] |
| MCP-T04 | 工具显示描述 | 工具有 description | 工具标签下方显示描述文本 | [x] |
| MCP-T05 | 工具无描述 | 工具 description 为空 | 不显示描述区域 | [x] |
| MCP-T06 | 少量工具不显示展开 | 工具数量 <= 5 | 不显示展开按钮 | [x] |

#### 请求计数测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-C01 | 工具调用成功后计数增加 | 成功调用 MCP 工具 | requestCount += 1 | [ ] |
| MCP-C02 | 工具调用失败不影响计数 | 工具调用返回错误 | requestCount 保持不变 | [ ] |
| MCP-C03 | 计数在重启后保持 | requestCount=10，重启应用 | 重启后 requestCount=10 | [x] |
| MCP-C04 | 多次调用正确累加 | 连续调用 3 次工具 | requestCount += 3 | [ ] |
| MCP-C05 | lastActiveAt 更新 | 成功调用工具 | lastActiveAt 更新为当前时间 | [x] |

#### v2.6.0 删除确认功能测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-D01 | 点击删除按钮显示确认对话框 | 点击删除按钮 | 显示确认对话框，包含服务器名称 | [x] |
| MCP-D02 | 确认删除执行删除操作 | 点击确认对话框的"删除"按钮 | 调用 onDeleteServer，服务器从列表移除 | [x] |
| MCP-D03 | 取消删除保留服务器 | 点击确认对话框的"取消"按钮 | 对话框关闭，服务器保留 | [x] |
| MCP-D04 | 删除确认对话框显示正确信息 | 查看确认对话框 | 显示"删除 MCP 服务器"标题和警告信息 | [x] |
| MCP-D05 | 连接中的服务器删除按钮禁用 | status='connecting' | 删除按钮禁用，无法点击 | [x] |
| MCP-D06 | 删除确认支持国际化 | 切换语言为英文 | 确认对话框显示英文内容 | [ ] |

---

## 📐 API 接口

### Tauri 命令

#### `mcp_connect`
连接到 MCP 服务器，执行初始化握手

```rust
#[tauri::command]
pub async fn mcp_connect(
    server_id: String,
    config: MCPServerConfig
) -> Result<MCPConnectionResult, String>
```

**输入参数**:
```typescript
{
  server_id: "uuid",
  config: {
    transport_type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
    env: {}
  }
}
```

**返回结果**:
```typescript
{
  success: true,
  server_info: { name: "filesystem", version: "1.0.0" },
  capabilities: { tools: true, resources: true },
  protocol_version: "2025-03-26"
}
```

#### `mcp_disconnect`
断开 MCP 服务器连接

```rust
#[tauri::command]
pub async fn mcp_disconnect(server_id: String) -> Result<(), String>
```

#### `mcp_list_tools`
获取服务器支持的工具列表

```rust
#[tauri::command]
pub async fn mcp_list_tools(server_id: String) -> Result<Vec<MCPTool>, String>
```

**返回示例**:
```typescript
[
  {
    name: "read_file",
    description: "Read contents of a file",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" }
      },
      required: ["path"]
    }
  }
]
```

#### `mcp_call_tool`
调用 MCP 工具

```rust
#[tauri::command]
pub async fn mcp_call_tool(
    server_id: String,
    tool_name: String,
    arguments: serde_json::Value
) -> Result<MCPToolResult, String>
```

**输入参数**:
```typescript
{
  server_id: "uuid",
  tool_name: "read_file",
  arguments: { path: "/tmp/test.txt" }
}
```

**返回结果**:
```typescript
{
  content: [
    { type: "text", text: "File contents here..." }
  ],
  isError: false
}
```

#### `mcp_list_resources`
获取服务器可用资源列表

```rust
#[tauri::command]
pub async fn mcp_list_resources(server_id: String) -> Result<Vec<MCPResource>, String>
```

#### `mcp_get_server_status`
获取服务器连接状态

```rust
#[tauri::command]
pub fn mcp_get_server_status(server_id: String) -> Result<MCPServerStatus, String>
```

---

## 🔄 协议流程

### 初始化握手

```
Client                                Server
  │                                      │
  │  ──── initialize ──────────────────► │
  │  {                                   │
  │    protocolVersion: "2025-03-26",   │
  │    capabilities: {},                 │
  │    clientInfo: {                     │
  │      name: "MobausStudio",          │
  │      version: "0.1.0"               │
  │    }                                 │
  │  }                                   │
  │                                      │
  │  ◄──── initialize result ────────── │
  │  {                                   │
  │    protocolVersion: "2025-03-26",   │
  │    capabilities: {                   │
  │      tools: {},                      │
  │      resources: {}                   │
  │    },                                │
  │    serverInfo: {                     │
  │      name: "filesystem",            │
  │      version: "1.0.0"               │
  │    }                                 │
  │  }                                   │
  │                                      │
  │  ──── initialized ─────────────────► │
  │  (notification)                      │
  │                                      │
```

### 工具调用流程

```
Client                                Server
  │                                      │
  │  ──── tools/list ──────────────────► │
  │                                      │
  │  ◄──── tools list result ────────── │
  │  [{ name: "read_file", ... }]        │
  │                                      │
  │  ──── tools/call ──────────────────► │
  │  {                                   │
  │    name: "read_file",               │
  │    arguments: { path: "/tmp/x" }    │
  │  }                                   │
  │                                      │
  │  ◄──── tool result ─────────────── │
  │  {                                   │
  │    content: [{ type: "text", ... }] │
  │  }                                   │
  │                                      │
```

### stdio 传输消息格式

```
# 请求 (每行一个 JSON-RPC 消息，换行分隔)
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}\n

# 响应
{"jsonrpc":"2.0","id":1,"result":{...}}\n

# 通知 (无 id)
{"jsonrpc":"2.0","method":"notifications/initialized"}\n
```

---

## 🧪 测试用例

### v2.0.0 MCP 协议测试

#### 连接管理测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-40 | stdio 连接成功 | 有效 stdio 配置 | status='connected', 获取 serverInfo | [ ] |
| MCP-41 | stdio 连接失败 - 命令不存在 | command='invalid_cmd' | status='error', errorMessage 包含错误 | [ ] |
| MCP-42 | stdio 连接失败 - 初始化超时 | 无响应服务器 | status='error', errorMessage='初始化超时' | [ ] |
| MCP-43 | HTTP 连接成功 | 有效 HTTP 端点 | status='connected' | [ ] |
| MCP-44 | HTTP 连接失败 - 端点不可达 | 无效端点 | status='error' | [ ] |
| MCP-45 | 断开连接 | 已连接服务器 | status='disconnected', 子进程终止 | [ ] |
| MCP-46 | 重复连接 | 已连接的服务器 | 忽略或返回当前状态 | [ ] |

#### 工具发现测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-47 | 列出工具 | 已连接服务器 | 返回工具列表数组 | [ ] |
| MCP-48 | 列出工具 - 未连接 | 未连接服务器 | 返回错误 "服务器未连接" | [ ] |
| MCP-49 | 工具包含 inputSchema | 工具列表 | 每个工具有 inputSchema 定义 | [ ] |

#### 工具调用测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-50 | 调用工具成功 | 有效参数 | 返回工具执行结果 | [ ] |
| MCP-51 | 调用工具 - 参数无效 | 缺少必填参数 | 返回 isError=true | [ ] |
| MCP-52 | 调用工具 - 工具不存在 | 无效工具名 | 返回错误 | [ ] |
| MCP-53 | 调用工具 - 服务器未连接 | 未连接状态 | 返回错误 "服务器未连接" | [ ] |

#### JSON-RPC 协议测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-54 | 请求消息格式 | initialize 请求 | 包含 jsonrpc, id, method, params | [ ] |
| MCP-55 | 响应消息解析 | 服务器响应 | 正确解析 result 或 error | [ ] |
| MCP-56 | 通知消息格式 | initialized 通知 | 包含 jsonrpc, method, 无 id | [ ] |
| MCP-57 | 错误响应处理 | error 响应 | 正确提取 error.code 和 message | [ ] |

### v1.x 兼容性测试 (保留)

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-01 ~ MCP-39 | 参见 v1.x 测试用例 | - | - | [x] |

### v2.1.0 Chat/Agent 集成测试 (新增)

#### useMCPTools Hook 测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-60 | 无连接服务器返回空工具列表 | disconnected 服务器 | availableTools=[], hasTools=false | [x] |
| MCP-61 | 返回已连接服务器的工具 | connected 服务器 | 返回工具列表，包含 serverId | [x] |
| MCP-62 | 根据 Agent 配置筛选服务器 | Agent.mcpServers 配置 | 只返回配置的服务器工具 | [x] |
| MCP-63 | Agent 未启用工具调用返回空 | enableToolUse=false | availableTools=[], hasTools=false | [x] |
| MCP-64 | 根据工具白名单筛选工具 | enabledTools 配置 | 只返回白名单中的工具 | [x] |
| MCP-65 | 正确格式化 OpenAI tools | 工具列表 | 格式化为 function 类型 | [x] |
| MCP-66 | parseAPIToolCalls 正确解析 | API 返回的 tool_calls | 解析出 serverId 和 toolName | [x] |
| MCP-67 | 处理工具名包含双下划线 | tool__name 格式 | 正确分离 serverId 和 toolName | [x] |

#### ToolCallDisplay 组件测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-70 | 显示执行中状态 | isExecuting=true | 蓝色边框 + "执行中..." 文本 | [x] |
| MCP-71 | 显示成功状态 | result.isError=false | 绿色边框 + "执行成功" 文本 | [x] |
| MCP-72 | 显示错误状态 | result.isError=true | 红色边框 + "执行失败" 文本 | [x] |
| MCP-73 | 可折叠/展开详情 | 点击标题栏 | 切换参数和结果显示 | [x] |
| MCP-74 | 正确显示工具参数 | JSON 参数 | 格式化显示参数内容 | [x] |
| MCP-75 | 错误状态显示错误标签 | isError=true | 显示 "错误:" 而非 "结果:" | [x] |
| MCP-76 | ToolCallList 渲染多个工具 | 多个 toolCalls | 正确渲染所有工具调用 | [x] |
| MCP-77 | ToolCallList 显示部分完成 | 部分有 result | 正确显示各自状态 | [x] |
| MCP-78 | ToolCallList 空列表 | toolCalls=[] | 不渲染任何内容 | [x] |

#### ToolCallDisplay 图片渲染测试 (v4.2.2)

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-IMG-01 | 工具结果包含 base64 图片 | content 含 `![](data:image/png;base64,...)` | 渲染为 `<img>` 标签而非纯文本 | [x] |
| MCP-IMG-02 | 工具结果包含文本和图片混合 | content 含文本 + base64 图片 markdown | 文本和图片都正确渲染 | [x] |
| MCP-IMG-03 | 工具结果不含图片 | 纯文本/JSON 内容 | 保持原有 `<pre>` 渲染方式 | [x] |
| MCP-IMG-04 | 多张图片渲染 | content 含多个 `![](data:...)` | 所有图片都渲染为 `<img>` 标签 | [x] |
| MCP-IMG-05 | 错误结果不渲染图片 | isError=true + 含图片 markdown | 保持 `<pre>` 渲染（错误信息不解析 markdown） | [x] |

#### ToolCallDisplay 增强展示测试 (v2.4.0)

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-79 | 执行完成后默认展开 | result 存在 | 自动展开显示结果内容 | [ ] |
| MCP-79a | 执行中默认收起 | isExecuting=true | 默认收起状态 | [ ] |
| MCP-79b | 显示执行耗时 | duration=1234 | 显示 "耗时: 1.23s" | [ ] |
| MCP-79c | 耗时未知不显示 | duration=undefined | 不显示耗时 | [ ] |
| MCP-79d | 成功结果高亮显示 | isError=false | 结果区域绿色背景 | [ ] |
| MCP-79e | 失败结果高亮显示 | isError=true | 结果区域红色背景 | [ ] |

#### v2.5.0 HTTP 传输与 serverName 测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-80a | HTTP 传输创建成功 | 有效 HTTPS 端点 | 创建 HttpTransport 成功 | [x] |
| MCP-80b | HTTP 传输创建失败 - 空端点 | endpoint="" | 返回 InvalidTransportConfig 错误 | [x] |
| MCP-80c | HTTP 传输创建失败 - 无效协议 | endpoint="ftp://..." | 返回 InvalidTransportConfig 错误 | [x] |
| MCP-80d | API Key 认证头构建 | authType="apikey" | Authorization: Bearer xxx | [x] |
| MCP-80e | Bearer Token 认证头构建 | authType="token" | Authorization: Bearer xxx | [x] |
| MCP-80f | 无认证 | authType="none" | 不添加 Authorization 头 | [x] |
| MCP-80g | 请求 ID 递增 | 连续发送请求 | ID 从 1 开始递增 | [x] |
| MCP-81a | ToolCall 显示 serverName | serverName 存在 | 显示服务器名称而非 ID | [x] |
| MCP-81b | ToolCall 回退显示 serverId | serverName 为空 | 显示 serverId | [x] |
| MCP-81c | ToolCall serverName 持久化 | 保存并重新加载 | serverName 正确恢复 | [x] |

#### 协议去重测试 (v4.2.2)

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-DEDUP-01 | Anthropic tool_result 去重 | 同一 tool_use_id 的多个 tool_result | 只保留第一个，后续重复跳过 | [x] |
| MCP-DEDUP-02 | Google functionResponse 合并去重 | 连续 user 消息含重复 functionResponse.id | 合并时去重，只保留第一个 | [x] |
| MCP-DEDUP-03 | Google 二次合并去重 | 连续 user 消息二次合并含重复 id | 去重后合并 | [x] |
| MCP-DEDUP-04 | Kiro toolResults 去重（最后一条） | 当前消息含重复 toolUseId | 只保留第一个 | [x] |
| MCP-DEDUP-05 | Kiro toolResults 去重（历史） | 历史消息含重复 toolUseId | 打包时去重 | [x] |
| MCP-DEDUP-06 | tool_calls 事件去重 | finish_reason 先 tool_calls 后 stop | 只发送一次 tool_calls 事件 | [x] |

#### ChatWindow Agent 选择器测试 (v2.1.0)

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-80 | 显示所有 Agent | agents 列表 | 下拉框显示所有 Agent | [ ] |
| MCP-81 | 无 Agent 时隐藏选择器 | agents=[] | 不显示 Agent 选择器 | [ ] |
| MCP-82 | 选择 Agent 触发回调 | 选择某个 Agent | 调用 onAgentChange(agentId) | [ ] |
| MCP-83 | 选择"无 Agent"触发回调 | 选择空选项 | 调用 onAgentChange(null) | [ ] |
| MCP-84 | 显示工具数量徽章 | 选中启用工具的 Agent | 显示绿色徽章 "X 工具" | [ ] |
| MCP-85 | 无工具时不显示徽章 | Agent 无关联服务器 | 不显示工具数量徽章 | [ ] |

#### ChatPage MCP 集成测试 (v2.1.0)

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-90 | 传递 agents 到 ChatWindow | agents 列表 | ChatWindow 收到 agents | [ ] |
| MCP-91 | 传递 mcpServers 到 ChatWindow | mcpServers 列表 | ChatWindow 收到 mcpServers | [ ] |
| MCP-92 | 发送消息时传递 Agent | 选中 Agent 后发送 | onSendMessage 包含 agent 参数 | [ ] |
| MCP-93 | 无 Agent 时发送消息 | 未选择 Agent | onSendMessage agent 为 undefined | [ ] |

---

## 🔧 实现方案

### Rust 后端实现

#### 依赖配置

```toml
# src-tauri/Cargo.toml
[dependencies]
tokio = { version = "1", features = ["process", "io-util", "sync", "time"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.11", features = ["json", "stream"] }
uuid = { version = "1", features = ["v4"] }
log = "0.4"
thiserror = "1.0"
async-trait = "0.1"
```

#### MCP 客户端核心

```rust
// src-tauri/src/mcp/client.rs

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// MCP 客户端管理器
/// 管理所有 MCP 服务器连接的生命周期
pub struct MCPClientManager {
    /// 活跃的 MCP 会话映射 (server_id -> Session)
    sessions: Arc<RwLock<HashMap<String, MCPSession>>>,
}

impl MCPClientManager {
    /// 创建新的客户端管理器
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 连接到 MCP 服务器
    pub async fn connect(
        &self,
        server_id: &str,
        config: MCPServerConfig,
    ) -> Result<MCPConnectionResult, MCPError> {
        // 1. 根据传输类型创建传输层
        let transport: Box<dyn MCPTransport> = match config.transport_type {
            TransportType::Stdio => {
                Box::new(StdioTransport::new(
                    &config.command.unwrap(),
                    &config.args.unwrap_or_default(),
                    &config.env.unwrap_or_default(),
                ).await?)
            }
            TransportType::Http => {
                Box::new(HttpTransport::new(&config.endpoint.unwrap())?)
            }
        };

        // 2. 创建会话并执行初始化握手
        let session = MCPSession::new(transport);
        let result = session.initialize().await?;

        // 3. 存储会话
        let mut sessions = self.sessions.write().await;
        sessions.insert(server_id.to_string(), session);

        Ok(result)
    }

    /// 断开服务器连接
    pub async fn disconnect(&self, server_id: &str) -> Result<(), MCPError> {
        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.remove(server_id) {
            session.shutdown().await?;
        }
        Ok(())
    }

    /// 列出工具
    pub async fn list_tools(&self, server_id: &str) -> Result<Vec<MCPTool>, MCPError> {
        let sessions = self.sessions.read().await;
        let session = sessions.get(server_id)
            .ok_or(MCPError::NotConnected)?;
        session.list_tools().await
    }

    /// 调用工具
    pub async fn call_tool(
        &self,
        server_id: &str,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> Result<MCPToolResult, MCPError> {
        let sessions = self.sessions.read().await;
        let session = sessions.get(server_id)
            .ok_or(MCPError::NotConnected)?;
        session.call_tool(tool_name, arguments).await
    }
}
```

#### stdio 传输实现

```rust
// src-tauri/src/mcp/transport/stdio.rs

use std::process::Stdio;
use tokio::process::{Child, Command};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

/// stdio 传输层
/// 通过子进程的 stdin/stdout 与 MCP 服务器通信
pub struct StdioTransport {
    /// 子进程句柄
    child: Child,
    /// stdin 写入器
    stdin: tokio::process::ChildStdin,
    /// stdout 读取器
    stdout: BufReader<tokio::process::ChildStdout>,
    /// 请求 ID 计数器
    request_id: std::sync::atomic::AtomicU64,
}

impl StdioTransport {
    /// 创建 stdio 传输并启动子进程
    pub async fn new(
        command: &str,
        args: &[String],
        env: &HashMap<String, String>,
    ) -> Result<Self, MCPError> {
        log::info!("[MCP stdio] 启动服务器: {} {:?}", command, args);

        let mut cmd = Command::new(command);
        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        // 设置环境变量
        for (key, value) in env {
            cmd.env(key, value);
        }

        let mut child = cmd.spawn()
            .map_err(|e| MCPError::SpawnFailed(e.to_string()))?;

        let stdin = child.stdin.take()
            .ok_or(MCPError::StdinNotAvailable)?;
        let stdout = child.stdout.take()
            .ok_or(MCPError::StdoutNotAvailable)?;

        Ok(Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            request_id: std::sync::atomic::AtomicU64::new(1),
        })
    }

    /// 发送 JSON-RPC 请求并等待响应
    pub async fn send_request(
        &mut self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, MCPError> {
        let id = self.request_id.fetch_add(1, std::sync::atomic::Ordering::SeqCst);

        // 构建 JSON-RPC 请求
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params
        });

        // 发送请求 (换行分隔)
        let request_str = serde_json::to_string(&request)? + "\n";
        log::debug!("[MCP stdio] 发送: {}", request_str.trim());
        self.stdin.write_all(request_str.as_bytes()).await?;
        self.stdin.flush().await?;

        // 读取响应
        let mut response_line = String::new();
        tokio::time::timeout(
            std::time::Duration::from_secs(30),
            self.stdout.read_line(&mut response_line)
        ).await
            .map_err(|_| MCPError::Timeout)?
            .map_err(|e| MCPError::ReadFailed(e.to_string()))?;

        log::debug!("[MCP stdio] 收到: {}", response_line.trim());

        // 解析响应
        let response: serde_json::Value = serde_json::from_str(&response_line)?;

        // 检查错误
        if let Some(error) = response.get("error") {
            return Err(MCPError::ServerError {
                code: error["code"].as_i64().unwrap_or(-1),
                message: error["message"].as_str().unwrap_or("Unknown error").to_string(),
            });
        }

        Ok(response["result"].clone())
    }

    /// 发送通知 (无响应)
    pub async fn send_notification(
        &mut self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<(), MCPError> {
        let notification = serde_json::json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        });

        let notification_str = serde_json::to_string(&notification)? + "\n";
        log::debug!("[MCP stdio] 发送通知: {}", notification_str.trim());
        self.stdin.write_all(notification_str.as_bytes()).await?;
        self.stdin.flush().await?;

        Ok(())
    }

    /// 关闭传输
    pub async fn shutdown(&mut self) -> Result<(), MCPError> {
        log::info!("[MCP stdio] 关闭服务器");
        self.child.kill().await
            .map_err(|e| MCPError::ShutdownFailed(e.to_string()))?;
        Ok(())
    }
}
```

### 前端组件更新

#### MCPModal (v2.0.0)

```tsx
// src/components/features/MCP/MCPModal.tsx

interface MCPModalProps {
    isOpen: boolean;
    onClose: () => void;
    server: MCPServer | null;
    onSave: (data: MCPServerCreateInput) => void;
}

export const MCPModal: React.FC<MCPModalProps> = ({ ... }) => {
    const [transportType, setTransportType] = useState<'stdio' | 'http'>('stdio');
    const [command, setCommand] = useState('');
    const [args, setArgs] = useState('');
    const [endpoint, setEndpoint] = useState('');
    // ...

    return (
        <Modal ...>
            {/* 传输类型选择 */}
            <Select
                value={transportType}
                onChange={setTransportType}
                options={[
                    { value: 'stdio', label: '本地 (stdio)' },
                    { value: 'http', label: '远程 (HTTP)' },
                ]}
            />

            {/* stdio 配置 */}
            {transportType === 'stdio' && (
                <>
                    <Input
                        label="启动命令"
                        value={command}
                        onChange={setCommand}
                        placeholder="npx"
                    />
                    <Input
                        label="命令参数"
                        value={args}
                        onChange={setArgs}
                        placeholder="-y @modelcontextprotocol/server-filesystem /path"
                    />
                </>
            )}

            {/* HTTP 配置 */}
            {transportType === 'http' && (
                <Input
                    label="HTTP 端点"
                    value={endpoint}
                    onChange={setEndpoint}
                    placeholder="https://mcp.example.com/api"
                />
            )}
        </Modal>
    );
};
```

---

## 🔄 进程生命周期管理 (v2.7.0)

### 概述

MCP stdio 传输通过子进程与本地 MCP 服务器通信。为确保资源正确释放，需要完善的进程生命周期管理：

1. **优雅停止 (Graceful Shutdown)**: 先发送信号让进程自行清理，超时后再强制终止
2. **应用退出清理**: 应用退出/重启前同步断开所有 MCP 连接
3. **残留进程处理**: 应用启动时检测并清理可能的残留进程

### 进程停止流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    优雅停止流程 (Graceful Shutdown)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 发送 MCP shutdown 通知 (可选，如果协议支持)                   │
│     ↓                                                           │
│  2. 关闭 stdin (通知子进程输入结束)                               │
│     ↓                                                           │
│  3. 发送 SIGTERM 信号 (Unix) / TerminateProcess (Windows)        │
│     ↓                                                           │
│  4. 等待进程退出 (超时: 5 秒)                                     │
│     ↓                                                           │
│  5. 如果超时，发送 SIGKILL 强制终止                               │
│     ↓                                                           │
│  6. 等待进程完全退出                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 应用退出清理流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    应用退出/重启清理流程                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  应用收到退出/重启信号                                           │
│     ↓                                                           │
│  调用 MCP_MANAGER.disconnect_all()                              │
│     ↓                                                           │
│  对每个已连接的服务器执行优雅停止                                  │
│     ↓                                                           │
│  等待所有进程退出 (总超时: 10 秒)                                 │
│     ↓                                                           │
│  继续应用退出/重启流程                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 启动时残留进程处理

当应用异常退出（崩溃、强制终止）时，MCP 子进程可能成为孤儿进程。应用启动时需要：

1. **检测残留进程**: 通过进程名或 PID 文件检测
2. **尝试清理**: 发送 SIGTERM/SIGKILL 终止残留进程
3. **记录日志**: 记录清理操作供调试

### API 接口

#### `mcp_disconnect` (增强)

断开 MCP 服务器连接，使用优雅停止流程

```rust
#[tauri::command]
async fn mcp_disconnect(server_id: String) -> Result<bool, String>
```

**行为变更 (v2.7.0)**:
- 先发送 SIGTERM，等待 5 秒
- 超时后发送 SIGKILL 强制终止
- 确保进程完全退出后返回

#### `mcp_disconnect_all` (增强)

断开所有 MCP 服务器连接

```rust
#[tauri::command]
async fn mcp_disconnect_all() -> Result<bool, String>
```

**行为变更 (v2.7.0)**:
- 并行断开所有服务器（提高效率）
- 总超时 10 秒
- 用于应用退出前的清理

### 测试用例

#### v2.7.0 进程生命周期管理测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-L01 | 优雅停止 - 进程正常响应 | 断开正常运行的 MCP 服务器 | 进程收到 SIGTERM 后自行退出，无需 SIGKILL | [ ] |
| MCP-L02 | 优雅停止 - 进程无响应 | 断开无响应的 MCP 服务器 | SIGTERM 超时后发送 SIGKILL 强制终止 | [ ] |
| MCP-L03 | 优雅停止 - 超时配置 | 设置不同超时时间 | 按配置的超时时间等待 | [ ] |
| MCP-L04 | 应用退出清理 | 关闭应用窗口 | 所有 MCP 进程在应用退出前被清理 | [ ] |
| MCP-L05 | 应用重启清理 | 触发应用自动更新重启 | 重启前所有 MCP 进程被清理，重启后无残留 | [ ] |
| MCP-L06 | 残留进程检测 | 应用崩溃后重新启动 | 检测到残留进程并记录日志 | [ ] |
| MCP-L07 | disconnect_all 并行执行 | 同时连接多个 MCP 服务器后断开全部 | 并行断开，总时间接近单个断开时间 | [ ] |
| MCP-L08 | disconnect_all 部分失败 | 部分服务器断开失败 | 继续断开其他服务器，返回部分成功 | [ ] |
| MCP-L09 | 重复断开 | 对已断开的服务器再次调用断开 | 返回 NotConnected 错误，不崩溃 | [ ] |
| MCP-L10 | stdin 关闭通知 | 断开时关闭 stdin | 子进程收到 EOF，可以开始清理 | [ ] |

#### 错误恢复测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MCP-L11 | 连接后立即断开 | 连接成功后立即调用断开 | 正常断开，无资源泄漏 | [ ] |
| MCP-L12 | 断开过程中重连 | 断开进行中调用连接 | 等待断开完成或返回错误 | [ ] |
| MCP-L13 | 进程已退出时断开 | MCP 进程已自行退出 | 正常返回，清理内部状态 | [ ] |
| MCP-L14 | 启动失败后清理 | MCP 进程启动后初始化失败 | 进程被正确终止，无残留 | [ ] |

---

## 📝 修改历史

| 日期 | 版本 | 修改人 | 修改内容 |
|------|------|--------|---------|
| 2026-01-18 | 1.0.0 | - | 初始版本 |
| 2026-01-19 | 1.1.0 | - | 连接测试 + 数据持久化 + 输入验证 |
| 2026-01-19 | 2.0.0 | - | 真实 MCP 协议支持 (stdio/HTTP 传输) |
| 2026-01-20 | 2.1.0 | - | Chat/Agent 集成 (useMCPTools Hook + ToolCallDisplay 组件) |
| 2026-01-21 | 2.2.0 | - | 添加 enabled/autoStart 字段，支持禁用和自动启动功能 |
| 2026-01-21 | 2.2.1 | - | 添加重连功能、请求计数追踪 |
| 2026-01-21 | 2.3.0 | - | 修复：配置修改时自动断开后端连接，禁用服务器时自动断开 |
| 2026-01-22 | 2.4.0 | - | 增强：ToolCallDisplay 默认展开结果 + 显示执行耗时 |
| 2026-01-23 | 2.5.0 | - | HTTP/HTTPS 传输实现 + ToolCall.serverName 字段 + 新错误类型 |
| 2026-01-25 | 2.6.0 | - | 删除 MCP 服务器二次确认功能，防止误删 |
| 2026-01-26 | 2.7.0 | - | 进程生命周期管理：优雅停止 + 应用退出清理 + 残留进程处理 |
| 2026-02-27 | 2.8.0 | - | 修复重启后 MCP 连接状态异常：1) 加载存储数据时重置所有服务器 status 为 disconnected，避免前后端状态不一致；2) handleConnectMCP 连接前先尝试断开旧 session，避免 AlreadyConnected 错误 |
| 2026-03-05 | 4.2.2 | - | 修复：ToolCallDisplay 工具结果中 base64 图片不渲染问题，对含图片 markdown 的结果使用 ReactMarkdown 渲染 |
| 2026-03-06 | 4.2.3 | - | **日志增强**：1) 连接/断开操作添加详细日志，包含服务器名称和 ID；2) 工具列表获取添加调试日志；3) 旧 session 断开添加日志追踪；4) 所有日志使用统一的 logger 模块，便于调试和问题排查 |

---

## 🔗 与其他模块集成 (v2.1.0)

### Agent 集成

Agent 可以配置关联的 MCP 服务器，对话时自动获取可用工具。

```typescript
// Agent 中的 MCP 配置
interface AgentMCPConfig {
    serverId: string;       // MCP 服务器 ID
    serverName: string;     // 显示名称
    enabledTools?: string[]; // 启用的工具，undefined 表示全部
}

// Agent 接口扩展
interface Agent {
    // ... 现有字段
    mcpServers?: AgentMCPConfig[];  // 关联的 MCP 服务器
    enableToolUse?: boolean;         // 是否启用工具调用
}
```

### Chat 集成

Chat 模块处理工具调用循环：

1. **发送消息时附带可用工具列表**: 根据 Agent 配置获取已连接 MCP 服务器的工具
2. **AI 返回 tool_calls 时执行对应工具**: 调用 `mcp_call_tool` 命令
3. **将结果返回给 AI 继续对话**: 循环直到 AI 返回最终回复

```
用户消息 → Chat → Agent(可选) → AI API (带 tools 参数)
                                    ↓
                              AI 返回 tool_calls
                                    ↓
                        MCP Client → 执行工具 → 返回结果
                                    ↓
                              继续发送给 AI (带 tool 结果)
                                    ↓
                           AI 返回最终回复 或 继续调用工具
```

### useMCPTools Hook

提供工具调用的统一接口：

```typescript
interface UseMCPToolsReturn {
    /** 获取可用工具（已连接服务器的工具） */
    availableTools: MCPTool[];

    /** 执行工具调用 */
    callTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<ToolResult>;

    /** 批量执行工具调用 */
    callTools: (calls: ToolCall[]) => Promise<ToolResult[]>;

    /** 格式化为 OpenAI tools 格式 */
    formatToolsForAPI: () => APITool[];

    /** 是否有可用工具 */
    hasTools: boolean;
}
```

### ToolCallDisplay 组件

在消息中展示工具调用状态：

- **执行中**: 蓝色边框 + Loader2 旋转图标
- **成功**: 绿色边框 + CheckCircle 图标
- **失败**: 红色边框 + XCircle 图标
- 可折叠显示参数和结果详情
- **v4.2.2**: 工具结果中的 Markdown 图片（如 MCP 工具返回的 base64 图片）使用 ReactMarkdown 渲染而非 `<pre>` 纯文本

---

## 📚 参考资料

- [MCP 官方规范](https://modelcontextprotocol.io/specification/2025-03-26)
- [MCP 传输层规范](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [rust-mcp-sdk](https://crates.io/crates/rust-mcp-sdk)
