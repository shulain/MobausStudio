# Agent 模板系统 (templates)

## 模块职责

提供一键安装 Agent 配置模板的功能，类似 skills.sh 的体验。用户可以从模板市场选择预设模板，一键安装所有依赖组件（MCP 服务器、技能、Agent 配置）。

## 核心概念

### Agent 模板包 (AgentTemplatePackage)

模板包是一个 JSON 文件，包含完整的 Agent 配置及其依赖：

```typescript
interface AgentTemplatePackage {
  // 元信息
  id: string;                    // 唯一标识符，如 "developer-template"
  name: string;                  // 显示名称，如 "开发者模板"
  version: string;               // 版本号，如 "1.0.0"
  description: string;           // 模板描述
  author?: string;               // 作者
  tags?: string[];               // 标签，用于搜索
  icon?: string;                 // 图标 URL 或 emoji

  // 组件定义
  components: {
    mcpServers?: MCPServerTemplate[];  // MCP 服务器配置
    skills?: SkillTemplate[];          // 技能配置
    agents?: AgentTemplate[];          // Agent 配置（含系统提示词）
  };
}
```

### MCP 服务器模板

```typescript
interface MCPServerTemplate {
  id: string;                    // 服务器 ID
  name: string;                  // 显示名称
  command: string;               // 启动命令
  args?: string[];               // 命令参数
  env?: Record<string, string>;  // 环境变量（敏感值用占位符）
  description?: string;          // 描述
}
```

### 技能模板

```typescript
interface SkillTemplate {
  // 支持两种方式
  url?: string;                  // 从 URL 安装（如 skills.sh）
  inline?: {                     // 内联定义
    id: string;
    name: string;
    content: string;             // 技能内容
    description?: string;
  };
}
```

### Agent 模板

```typescript
interface AgentTemplate {
  id: string;                    // Agent ID
  name: string;                  // 显示名称
  description?: string;          // 描述
  systemPrompt: string;          // 系统提示词（嵌入在 Agent 中）
  model?: string;                // 推荐模型
  mcpServerIds?: string[];       // 关联的 MCP 服务器 ID
  skillIds?: string[];           // 关联的技能 ID
}
```

## 模板示例

### 开发者模板

```json
{
  "id": "developer-template",
  "name": "开发者模板",
  "version": "1.0.0",
  "description": "适合软件开发的 Agent 配置，包含文件系统、Git、代码搜索等工具",
  "author": "MobausStudio",
  "tags": ["开发", "编程", "Git"],
  "icon": "👨‍💻",

  "components": {
    "mcpServers": [
      {
        "id": "filesystem",
        "name": "文件系统",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "${WORKSPACE_PATH}"],
        "description": "访问本地文件系统"
      },
      {
        "id": "github",
        "name": "GitHub",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-github"],
        "env": {
          "GITHUB_TOKEN": "${GITHUB_TOKEN}"
        },
        "description": "GitHub 仓库操作"
      }
    ],

    "skills": [
      {
        "url": "https://skills.sh/code-review"
      },
      {
        "inline": {
          "id": "git-commit",
          "name": "Git 提交助手",
          "content": "帮助用户编写规范的 Git 提交信息...",
          "description": "生成符合 Conventional Commits 规范的提交信息"
        }
      }
    ],

    "agents": [
      {
        "id": "code-assistant",
        "name": "代码助手",
        "description": "专业的编程助手",
        "systemPrompt": "你是一个专业的软件开发助手。你擅长：\n- 代码审查和优化\n- Bug 修复\n- 功能实现\n- 代码重构\n\n请遵循最佳实践，编写清晰、可维护的代码。",
        "model": "claude-3-5-sonnet",
        "mcpServerIds": ["filesystem", "github"],
        "skillIds": ["git-commit"]
      }
    ]
  }
}
```

## 安装流程

### 1. 模板解析

```
用户选择模板 → 下载/解析 JSON → 验证格式 → 显示安装预览
```

### 2. 组件安装顺序

```
1. MCP 服务器 → mcpServersStorage
2. 技能 → skillsStorage
3. Agent → agentsStorage
```

### 3. 变量替换

模板中的占位符在安装时替换：

| 占位符 | 说明 | 来源 |
|--------|------|------|
| `${WORKSPACE_PATH}` | 工作目录路径 | 用户选择 |
| `${GITHUB_TOKEN}` | GitHub Token | 用户输入 |
| `${HOME}` | 用户主目录 | 系统环境 |

### 4. 冲突处理

- **ID 冲突**：提示用户选择覆盖或跳过
- **版本冲突**：显示版本对比，用户决定

## 接口定义

### TemplateService

#### parseTemplate(source: string | File): Promise<AgentTemplatePackage>

解析模板文件

**参数：**
- source: URL 字符串或本地文件

**返回：**
- 成功: AgentTemplatePackage 对象
- 失败: 抛出 TemplateParseError

#### installTemplate(template: AgentTemplatePackage, options?: InstallOptions): Promise<InstallResult>

安装模板

**参数：**
- template: 解析后的模板对象
- options: 安装选项
  - variables: 变量值映射
  - skipExisting: 是否跳过已存在的组件
  - dryRun: 仅预览不实际安装

**返回：**
```typescript
interface InstallResult {
  success: boolean;
  installed: {
    mcpServers: string[];  // 已安装的 MCP 服务器 ID
    skills: string[];      // 已安装的技能 ID
    agents: string[];      // 已安装的 Agent ID
  };
  skipped: {
    mcpServers: string[];
    skills: string[];
    agents: string[];
  };
  errors: Array<{
    component: string;
    id: string;
    error: string;
  }>;
}
```

#### getRequiredVariables(template: AgentTemplatePackage): string[]

获取模板需要的变量列表

**返回：**
- 变量名数组，如 `["GITHUB_TOKEN", "WORKSPACE_PATH"]`

## UI 设计

### 模板安装弹窗 (TemplateInstallModal)

```
┌─────────────────────────────────────────────┐
│  安装模板: 开发者模板                    [X] │
├─────────────────────────────────────────────┤
│                                             │
│  📦 将安装以下组件:                          │
│                                             │
│  MCP 服务器 (2)                             │
│  ├─ ✓ 文件系统                              │
│  └─ ✓ GitHub                                │
│                                             │
│  技能 (2)                                   │
│  ├─ ✓ Code Review (from skills.sh)         │
│  └─ ✓ Git 提交助手                          │
│                                             │
│  Agent (1)                                  │
│  └─ ✓ 代码助手                              │
│                                             │
├─────────────────────────────────────────────┤
│  ⚙️ 配置变量:                                │
│                                             │
│  GITHUB_TOKEN: [________________] 🔑        │
│  WORKSPACE_PATH: [/Users/xxx/pro] 📁       │
│                                             │
├─────────────────────────────────────────────┤
│              [取消]  [安装]                  │
└─────────────────────────────────────────────┘
```

### 模板市场页面

```
┌─────────────────────────────────────────────┐
│  模板市场                      🔍 搜索...    │
├─────────────────────────────────────────────┤
│                                             │
│  推荐模板                                    │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ 👨‍💻      │ │ 📝      │ │ 🎨      │       │
│  │ 开发者   │ │ 写作助手 │ │ 设计师   │       │
│  │ v1.0.0  │ │ v1.2.0  │ │ v1.0.0  │       │
│  │ [安装]  │ │ [安装]  │ │ [安装]  │       │
│  └─────────┘ └─────────┘ └─────────┘       │
│                                             │
│  从文件导入                                  │
│  [选择 JSON 文件...]                        │
│                                             │
│  从 URL 导入                                 │
│  [输入模板 URL...        ] [导入]           │
│                                             │
└─────────────────────────────────────────────┘
```

## 测试用例

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-TPL-001 | 解析有效模板 | 完整的模板 JSON | 返回 AgentTemplatePackage 对象 |
| TC-TPL-002 | 解析无效 JSON | 格式错误的 JSON | 抛出 TemplateParseError |
| TC-TPL-003 | 缺少必填字段 | 缺少 id 的模板 | 抛出验证错误 |
| TC-TPL-004 | 安装 MCP 服务器 | 包含 MCP 的模板 | MCP 服务器添加到 mcpServersStorage |
| TC-TPL-005 | 安装技能(URL) | 包含 URL 技能的模板 | 从 URL 下载并安装技能 |
| TC-TPL-006 | 安装技能(内联) | 包含内联技能的模板 | 直接安装技能内容 |
| TC-TPL-007 | 安装 Agent | 包含 Agent 的模板 | Agent 添加到 agentsStorage |
| TC-TPL-008 | 变量替换 | 包含 ${VAR} 的模板 | 正确替换变量值 |
| TC-TPL-009 | ID 冲突-覆盖 | 已存在同 ID 组件 | 覆盖现有组件 |
| TC-TPL-010 | ID 冲突-跳过 | skipExisting=true | 跳过已存在组件 |
| TC-TPL-011 | 获取变量列表 | 包含多个变量的模板 | 返回去重的变量名列表 |
| TC-TPL-012 | 空模板安装 | components 为空 | 成功但无安装内容 |
| TC-TPL-013 | 部分安装失败 | 某个组件安装失败 | 返回部分成功结果和错误信息 |
| TC-TPL-014 | 预览模式 | dryRun=true | 不实际安装，返回预览结果 |

## 存储设计

模板本身不需要持久化存储，安装后的组件存储在各自模块：

- MCP 服务器 → `mcpServersStorage` (现有)
- 技能 → `skillsStorage` (现有)
- Agent → `agentsStorage` (现有)

可选：记录已安装模板的元信息用于管理

```typescript
interface InstalledTemplateRecord {
  templateId: string;
  templateName: string;
  version: string;
  installedAt: string;
  installedComponents: {
    mcpServerIds: string[];
    skillIds: string[];
    agentIds: string[];
  };
}
```

## 变更记录

| 日期 | 修改内容 | 修改人 |
|------|----------|--------|
| 2026-02-04 | 初始版本 - 模块设计 | - |
