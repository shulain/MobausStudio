# Skills 技能模块

## 📋 模块概述

Skills 模块提供 **提示词模板 + 输出规范** 的管理功能，为 AI 注入专业领域知识和工作流程指导。

**核心定位**：
- **Skill = 思维层**：定义 AI "如何思考、如何回答"
- **MCP = 动作层**：定义 AI "能执行什么外部操作"

| 属性 | 值 |
|------|------|
| 模块路径 | `src/components/features/Skills` |
| 存储服务 | `src/services/storage.ts` |
| 工具函数 | `src/utils/skillUtils.ts` |
| 创建日期 | 2026-01-18 |
| 最后更新 | 2026-03-07 |
| 当前版本 | 3.0.29 |

---

## 🎯 功能列表

### 核心功能

- [x] 技能列表展示（内置 + 自定义）
- [x] 技能启用/禁用开关
- [x] 创建自定义技能
- [x] 编辑技能（提示词模板、触发条件、变量）
- [x] 删除自定义技能（内置技能不可删除）(v2.1.0)
- [x] 删除二次确认对话框（防止误删）(v2.1.0)
- [x] 技能预览功能（只读查看提示词效果）
- [x] 技能变量配置

### 扩展功能

- [x] 技能分类筛选
- [x] 技能搜索
- [x] 技能导入/导出 (v3.0.0 已实现)
- [ ] 技能市场（社区分享）(规划中)

### v3.0.0 安装模式 (新增)

- [x] **从URL安装技能** - 输入技能仓库URL，获取技能列表并选择性安装
- [x] **官方技能仓库** - 预置官方仓库地址，一键浏览和安装
- [x] **技能导入/导出** - 本地JSON文件备份和迁移
- [x] **安装弹窗UI** - 统一的安装入口和交互界面
- [x] **技能包验证** - 安装前校验数据格式和必填字段
- [x] **重复检测** - 安装时检测已存在的技能，支持覆盖或跳过

---

## 🔄 与其他模块的关系

### 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         对话流程                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Chat ──► Agent ──┬──► System Prompt（基础人设）               │
│                    │                                            │
│                    ├──► Skill（提示词模板注入）  ← 本模块        │
│                    │                                            │
│                    └──► MCP（工具调用能力）                      │
│                                                                 │
│                         │                                       │
│                         ▼                                       │
│                    AI 模型 API                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Skill 与 Agent 的关系

Agent 可以绑定多个 Skill，绑定后：
1. Skill 的 `promptTemplate` 会注入到 Agent 的系统提示词中
2. Skill 的变量可以在 Agent 中单独配置
3. 对话时自动应用所有已启用的 Skill

### Skill 与 MCP 的区别

| 维度 | Skill | MCP |
|------|-------|-----|
| 层次 | 思维层（怎么想） | 动作层（怎么做） |
| 能力 | 提示词注入 | 工具调用 |
| 示例 | 代码审查检查清单、翻译原则 | 执行代码、读取文件、调用 API |
| 触发 | 关键词/意图匹配（可选） | AI 主动请求 |
| 执行 | 纯文本注入，无副作用 | 调用外部服务，有副作用 |

---

## 🏗️ 组件结构

```
Skills/
├── index.tsx              # 模块入口 (SkillsPage)
├── SkillCard.tsx          # 技能卡片组件
├── SkillModal.tsx         # 创建/编辑技能弹窗
├── SkillTestModal.tsx     # 技能测试弹窗
├── SkillVariablesForm.tsx # 变量配置表单
├── SkillInstallModal.tsx  # v3.0.0: 安装技能弹窗
└── SkillExportModal.tsx   # v3.0.0: 导出技能弹窗

hooks/
└── useSkills.ts           # 技能状态管理 Hook

utils/
└── skillUtils.ts          # 技能工具函数
    ├── buildSystemPrompt()   # 构建包含 Skill 的系统提示词
    ├── matchSkillTriggers()  # 匹配用户输入的触发词
    ├── replaceVariables()    # 替换模板中的变量
    ├── fetchSkillRegistry()  # v3.0.0: 从URL获取技能仓库索引
    ├── validateSkillPackage()# v3.0.0: 验证技能包格式
    └── exportSkillsToJson()  # v3.0.0: 导出技能为JSON
```

---

## 📐 数据结构

### Skill

```typescript
/**
 * Skill 技能 - 提示词模板 + 输出规范
 */
interface Skill {
  id: string;
  name: string;                    // 技能名称
  description: string;             // 技能描述
  category: SkillCategory;         // 技能分类
  icon: string;                    // 图标名称 (lucide-react)
  color: SkillColor;               // 主题色
  enabled: boolean;                // 是否启用

  // ===== 核心：提示词模板 =====
  promptTemplate: string;          // 提示词模板（Markdown 格式，支持 {{变量}} 语法）

  // ===== 可选：输出规范 =====
  outputFormat?: SkillOutputFormat;  // 期望输出格式
  outputSchema?: string;             // JSON Schema（outputFormat='json' 时使用）

  // ===== 可选：触发条件 =====
  triggers?: SkillTrigger[];       // 自动触发条件

  // ===== 可选：变量定义 =====
  variables?: SkillVariable[];     // 可配置的变量

  // ===== 元数据 =====
  builtIn: boolean;                // 是否为内置技能（内置技能不可编辑/删除）
  version: string;                 // 版本号
  author?: string;                 // 作者
  createdAt: Date;
  updatedAt: Date;
}
```

### SkillCategory

```typescript
/** 技能分类 */
type SkillCategory =
  | 'writing'      // 写作
  | 'coding'       // 编程
  | 'analysis'     // 分析
  | 'translation'  // 翻译
  | 'creative'     // 创意
  | 'productivity' // 效率
  | 'custom';      // 自定义
```

### SkillColor

```typescript
/** 技能颜色 */
type SkillColor = 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'cyan';
```

### SkillOutputFormat

```typescript
/** 输出格式 */
type SkillOutputFormat =
  | 'markdown'  // Markdown 格式
  | 'json'      // JSON 格式（配合 outputSchema 使用）
  | 'code'      // 代码格式
  | 'table'     // 表格格式
  | 'free';     // 自由格式
```

### SkillTrigger

```typescript
/** 触发条件 */
interface SkillTrigger {
  type: 'keyword' | 'regex' | 'intent';  // 触发类型
  pattern: string;                        // 匹配模式
  priority: number;                       // 优先级（多个匹配时使用，数值越大优先级越高）
}
```

### SkillVariable

```typescript
/** 可配置变量 */
interface SkillVariable {
  name: string;                    // 变量名（用于模板中 {{name}} 替换）
  label: string;                   // 显示标签
  type: 'string' | 'number' | 'boolean' | 'select';
  defaultValue: string | number | boolean;
  options?: string[];              // type='select' 时的选项
  description?: string;            // 变量说明
}
```

### SkillCreateInput

```typescript
/** 技能创建输入 */
interface SkillCreateInput {
  name: string;
  description: string;
  category: SkillCategory;
  icon?: string;
  color?: SkillColor;
  promptTemplate: string;
  outputFormat?: SkillOutputFormat;
  outputSchema?: string;
  triggers?: SkillTrigger[];
  variables?: SkillVariable[];
}
```

### v3.0.0 安装模式数据结构

#### SkillRegistry (技能仓库索引)

```typescript
/**
 * 技能仓库索引
 * 用于描述一个远程技能仓库的元信息和可用技能列表
 *
 * 示例URL: https://github.com/user/skills-repo/skills-registry.json
 */
interface SkillRegistry {
  /** 仓库名称 */
  name: string;                    // "Vercel Agent Skills"
  /** 仓库描述 */
  description?: string;            // "Official Vercel skills for AI agents"
  /** 索引格式版本 */
  version: string;                 // "1.0.0"
  /** 仓库主页 */
  homepage?: string;               // "https://github.com/vercel-labs/agent-skills"
  /** 仓库作者 */
  author?: string;                 // "Vercel"
  /** 可用技能列表 */
  skills: SkillRegistryItem[];
}

/**
 * 仓库中的单个技能条目
 */
interface SkillRegistryItem {
  /** 技能唯一标识（在仓库内唯一） */
  id: string;                      // "vercel-react-best-practices"
  /** 技能名称 */
  name: string;                    // "React 最佳实践"
  /** 技能描述 */
  description: string;             // "Vercel 官方 React 开发最佳实践指南"
  /** 技能版本 */
  version: string;                 // "1.0.0"
  /** 分类标签 */
  tags: string[];                  // ["react", "frontend", "best-practices"]
  /** 作者（可覆盖仓库作者） */
  author?: string;
  /** 技能定义（内联方式） */
  skill?: SkillCreateInput;
  /** 技能定义URL（外链方式，与 skill 二选一） */
  url?: string;                    // "./skills/react-best-practices.json"
}
```

#### SkillPackage (技能包)

```typescript
/**
 * 技能包格式
 * 用于导入/导出和单个技能URL安装
 */
interface SkillPackage {
  /** 包格式版本 */
  version: string;                 // "1.0"
  /** 技能列表 */
  skills: SkillCreateInput[];
  /** 元信息 */
  meta?: {
    /** 作者 */
    author?: string;
    /** 来源URL */
    source?: string;
    /** 导出时间 */
    exportedAt?: string;           // ISO 8601 格式
    /** 导出工具版本 */
    exportedBy?: string;           // "MobausStudio v1.0.0"
  };
}
```

#### InstallSource (安装来源)

```typescript
/**
 * 安装来源类型
 */
type InstallSourceType =
  | 'url'        // 从URL安装（仓库或单个技能）
  | 'file'       // 从本地文件导入
  | 'official';  // 从官方仓库安装

/**
 * 安装来源配置
 */
interface InstallSource {
  type: InstallSourceType;
  /** URL地址（type='url' 时） */
  url?: string;
  /** 文件内容（type='file' 时） */
  fileContent?: string;
  /** 官方仓库ID（type='official' 时） */
  officialRepoId?: string;
}
```

#### OfficialRepository (官方仓库预置)

```typescript
/**
 * 预置的官方技能仓库
 *
 * 注意：当前使用演示模式，仓库 URL 指向不存在的地址。
 * 系统会自动使用内置的演示数据代替远程获取。
 *
 * 如需添加真实的官方仓库，请：
 * 1. 创建 GitHub 仓库并添加 skills.json 文件
 * 2. 更新此处的 URL 为真实地址
 */
const OFFICIAL_REPOSITORIES: Array<{
  id: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  /** 是否为演示仓库（使用内置数据） */
  isDemo?: boolean;
}> = [
  {
    id: 'mobaus-official',
    name: 'MobausStudio 官方技能',
    description: '由 MobausStudio 团队维护的官方技能集',
    url: 'https://raw.githubusercontent.com/mobaus/skills/main/registry.json',
    icon: 'star',
    isDemo: true,  // 演示模式：使用内置数据
  },
  {
    id: 'community-popular',
    name: '社区热门技能',
    description: '社区贡献的高质量技能',
    url: 'https://raw.githubusercontent.com/mobaus/community-skills/main/registry.json',
    icon: 'users',
    isDemo: true,  // 演示模式：使用内置数据
  },
];
```

---

## 📐 核心接口

### 前端 Handlers (App.tsx)

#### `handleCreateSkill`
创建新技能

```typescript
const handleCreateSkill = (data: SkillCreateInput) => void
```

#### `handleUpdateSkill`
更新技能

```typescript
const handleUpdateSkill = (id: string, data: Partial<SkillCreateInput>) => void
```

#### `handleDeleteSkill`
删除技能（仅限自定义技能）

```typescript
const handleDeleteSkill = (id: string) => void
```

#### `handleToggleSkill`
切换技能启用状态

```typescript
const handleToggleSkill = (id: string, enabled: boolean) => void
```

#### v3.0.0 安装模式 Handlers

##### `handleInstallSkills`

批量安装技能（从URL/文件/官方仓库）

```typescript
/**
 * 安装技能
 * @param skills - 要安装的技能列表
 * @param options - 安装选项
 */
const handleInstallSkills = (
  skills: SkillCreateInput[],
  options?: {
    /** 遇到重复技能时的处理方式 */
    onDuplicate?: 'skip' | 'overwrite' | 'rename';
    /** 来源信息（用于记录） */
    source?: string;
  }
) => void
```

##### `handleExportSkills`

导出选中的技能为JSON文件

```typescript
/**
 * 导出技能
 * @param skillIds - 要导出的技能ID列表，空数组表示导出全部自定义技能
 */
const handleExportSkills = (skillIds: string[]) => void
```

### 工具函数 (skillUtils.ts)

#### `buildSystemPrompt`
构建包含 Skill 的完整系统提示词

```typescript
/**
 * 构建包含 Skill 的完整系统提示词
 *
 * @param basePrompt - Agent 的基础系统提示词
 * @param skills - 绑定的 Skill 列表
 * @param variables - 技能变量配置 { [skillId]: { [varName]: value } }
 * @returns 完整的系统提示词
 */
function buildSystemPrompt(
  basePrompt: string,
  skills: Skill[],
  variables?: Record<string, Record<string, unknown>>
): string
```

**构建逻辑**：
1. 以 Agent 的 `systemPrompt` 为基础
2. 遍历已启用的 Skill，将其 `promptTemplate` 追加到提示词中
3. 替换模板中的 `{{变量名}}` 为实际配置值
4. 返回完整的系统提示词

#### `matchSkillTriggers`
检查用户输入是否触发某个 Skill

```typescript
/**
 * 检查用户输入是否触发某个 Skill
 *
 * @param input - 用户输入
 * @param skills - 可用技能列表
 * @returns 匹配的技能（按优先级排序）
 */
function matchSkillTriggers(input: string, skills: Skill[]): Skill[]
```

#### `replaceVariables`

替换模板中的变量

```typescript
/**
 * 替换模板中的变量
 *
 * @param template - 提示词模板
 * @param variables - 变量定义
 * @param values - 变量值
 * @returns 替换后的模板
 */
function replaceVariables(
  template: string,
  variables: SkillVariable[],
  values: Record<string, unknown>
): string
```

#### v3.0.0 安装模式工具函数

##### `fetchSkillRegistry`

从URL获取技能仓库索引

```typescript
/**
 * 从URL获取技能仓库索引
 *
 * @param url - 仓库索引URL（支持 GitHub raw URL、普通HTTPS URL）
 * @returns 仓库索引对象
 * @throws FetchError - 网络请求失败
 * @throws ParseError - JSON解析失败
 * @throws ValidationError - 数据格式不符合 SkillRegistry 规范
 */
async function fetchSkillRegistry(url: string): Promise<SkillRegistry>
```

**URL 解析规则**：

| 输入URL | 处理逻辑 |
| ------- | -------- |
| `https://github.com/user/repo` | 自动转换为 `https://raw.githubusercontent.com/user/repo/main/skills-registry.json` |
| `https://github.com/user/repo/blob/main/registry.json` | 转换为对应的 raw URL |
| `https://raw.githubusercontent.com/...` | 直接使用 |
| `https://example.com/skills.json` | 直接使用 |

##### `fetchSkillFromRegistry`

从仓库获取单个技能的完整定义

```typescript
/**
 * 从仓库获取单个技能的完整定义
 *
 * @param registryItem - 仓库中的技能条目
 * @param baseUrl - 仓库基础URL（用于解析相对路径）
 * @returns 技能创建输入
 */
async function fetchSkillFromRegistry(
  registryItem: SkillRegistryItem,
  baseUrl: string
): Promise<SkillCreateInput>
```

##### `validateSkillPackage`

验证技能包格式

```typescript
/**
 * 验证技能包格式是否符合规范
 *
 * @param data - 待验证的数据
 * @returns 验证结果
 */
function validateSkillPackage(data: unknown): {
  valid: boolean;
  errors: string[];
  package?: SkillPackage;
}
```

**验证规则**：

1. 必须包含 `version` 字段
2. 必须包含 `skills` 数组
3. 每个 skill 必须包含 `name`, `description`, `category`, `promptTemplate`
4. `category` 必须是有效的 SkillCategory 值

##### `exportSkillsToJson`

导出技能为JSON文件

```typescript
/**
 * 导出技能为JSON字符串
 *
 * @param skills - 要导出的技能列表
 * @param options - 导出选项
 * @returns JSON字符串
 */
function exportSkillsToJson(
  skills: Skill[],
  options?: {
    /** 是否美化输出 */
    pretty?: boolean;
    /** 是否包含元信息 */
    includeMeta?: boolean;
  }
): string
```

##### `detectDuplicateSkills`

检测重复技能

```typescript
/**
 * 检测要安装的技能是否与现有技能重复
 *
 * @param newSkills - 要安装的技能
 * @param existingSkills - 现有技能列表
 * @returns 重复检测结果
 */
function detectDuplicateSkills(
  newSkills: SkillCreateInput[],
  existingSkills: Skill[]
): {
  duplicates: Array<{
    newSkill: SkillCreateInput;
    existingSkill: Skill;
    matchType: 'id' | 'name';  // 匹配方式：ID完全相同 或 名称相同
  }>;
  unique: SkillCreateInput[];
}
```

---

## 📦 内置技能

### 代码审查 (builtin-code-review)

| 属性 | 值 |
|------|------|
| 分类 | coding |
| 图标 | code |
| 颜色 | purple |

**提示词模板**：
```markdown
当用户请求代码审查时，请按以下流程进行：

## 审查维度

### 🔴 P0 - 必须修复
- 安全漏洞（SQL注入、XSS、敏感信息泄露）
- 数据丢失风险
- 逻辑错误导致功能失效

### 🟠 P1 - 应该修复
- 性能问题（N+1查询、内存泄漏）
- 错误处理不完整
- 边界条件未处理

### 🟡 P2 - 建议修复
- 代码重复
- 命名不清晰
- 缺少注释

## 输出格式

请按以下格式输出审查结果：

## 代码审查报告

### 📋 概要
- 审查结论: ✅ 可合并 / ⚠️ 需修改 / ❌ 需重构

### 🔍 发现的问题
（按优先级列出问题）

### 💡 改进建议
（可选的优化建议）

### ✅ 亮点
（代码中做得好的地方）
```

**触发条件**：
- keyword: `审查` (priority: 10)
- keyword: `review` (priority: 10)
- keyword: `代码检查` (priority: 8)

**变量**：
| 变量名 | 标签 | 类型 | 默认值 | 选项 |
|--------|------|------|--------|------|
| focusArea | 重点关注 | select | all | all, security, performance, maintainability |
| strictMode | 严格模式 | boolean | false | - |

### 翻译专家 (builtin-translation)

| 属性 | 值 |
|------|------|
| 分类 | translation |
| 图标 | languages |
| 颜色 | blue |

**提示词模板**：
```markdown
当用户请求翻译时，请遵循以下原则：

## 翻译原则（信达雅）

1. **信（准确）**: 忠实原文含义，不增不减
2. **达（通顺）**: 符合目标语言表达习惯
3. **雅（优美）**: 用词考究，文笔流畅

## 翻译风格: {{style}}

## 输出格式

【原文】
{原文内容}

【译文】
{翻译结果}

【注释】（如有必要）
- 专有名词说明
- 文化背景解释

## 注意事项

- 保留原文格式（代码、列表等）
- 专业术语需要准确
- 如有多义词，优先选择上下文最合适的含义
```

**触发条件**：
- keyword: `翻译` (priority: 10)
- keyword: `translate` (priority: 10)

**变量**：
| 变量名 | 标签 | 类型 | 默认值 | 选项 |
|--------|------|------|--------|------|
| style | 翻译风格 | select | 正式 | 正式, 口语化, 文学性, 技术文档 |
| targetLang | 目标语言 | select | 中文 | 中文, 英文, 日文, 韩文 |

### 写作助手 (builtin-writing)

| 属性 | 值 |
|------|------|
| 分类 | writing |
| 图标 | pen-line |
| 颜色 | green |

**提示词模板**：
```markdown
当用户请求写作帮助时，请按以下方式处理：

## 写作类型: {{writingType}}

## 写作原则

1. **结构清晰**: 开头引入、主体展开、结尾总结
2. **逻辑连贯**: 段落间过渡自然
3. **语言得体**: 符合场景和读者需求

## 润色要求

- 消除冗余表达
- 增强语句表现力
- 保持原意不变
- 适当使用修辞手法
```

**变量**：
| 变量名 | 标签 | 类型 | 默认值 | 选项 |
|--------|------|------|--------|------|
| writingType | 写作类型 | select | 通用 | 通用, 商务邮件, 技术文档, 营销文案, 学术论文 |

### 其他内置技能（规划中）

| 技能名称 | ID | 分类 | 描述 |
|---------|-----|------|------|
| SQL 专家 | builtin-sql | coding | SQL 查询生成和优化 |
| API 文档生成 | builtin-api-doc | coding | 自动生成 API 文档 |
| 数据分析师 | builtin-data-analysis | analysis | 数据分析和可视化建议 |
| 会议纪要 | builtin-meeting-notes | productivity | 整理会议记录 |
| 周报生成 | builtin-weekly-report | productivity | 根据工作内容生成周报 |

---

## 🎨 v3.0.0 安装模式 UI 设计

### 页面入口

在 Skills 页面头部添加安装相关按钮：

```text
┌─────────────────────────────────────────────────────────────┐
│  Skills 技能管理                                            │
│                                                             │
│  [添加技能]  [安装技能 ▼]  [导出]                           │
│              ├─ 从URL安装                                   │
│              ├─ 从文件导入                                  │
│              └─ 官方技能库                                  │
└─────────────────────────────────────────────────────────────┘
```

### 安装技能弹窗 (SkillInstallModal)

#### Tab 1: 从URL安装

```text
┌─────────────────────────────────────────────────────────────┐
│  安装技能                                          [×]      │
├─────────────────────────────────────────────────────────────┤
│  [从URL安装]  [从文件导入]  [官方技能库]                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📦 技能仓库地址                                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ https://github.com/vercel-labs/agent-skills           │  │
│  └───────────────────────────────────────────────────────┘  │
│  支持 GitHub 仓库地址或直接 JSON 文件 URL                   │
│                                                             │
│                                         [获取技能列表]      │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📋 可用技能 (3)                          [全选] [取消全选] │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ☑ vercel-react-best-practices          v1.0.0          ││
│  │   React 开发最佳实践指南                                ││
│  │   标签: react, frontend, best-practices                 ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ ☐ vercel-nextjs-patterns               v1.2.0          ││
│  │   Next.js 常用设计模式                                  ││
│  │   标签: nextjs, patterns                                ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ ☑ vercel-edge-functions                v0.9.0          ││
│  │   边缘函数开发指南                                      ││
│  │   标签: edge, serverless                                ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ⚠️ 发现 1 个重复技能：                                     │
│     • vercel-react-best-practices (已存在同名技能)         │
│     处理方式: [跳过 ▼]  覆盖 / 重命名                       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                               [取消]  [安装选中技能 (2)]    │
└─────────────────────────────────────────────────────────────┘
```

#### Tab 2: 从文件导入

```text
┌─────────────────────────────────────────────────────────────┐
│  [从URL安装]  [从文件导入]  [官方技能库]                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📁 选择技能包文件                                          │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                                                         ││
│  │         拖拽 JSON 文件到此处，或点击选择文件            ││
│  │                                                         ││
│  │                    [选择文件]                           ││
│  │                                                         ││
│  └─────────────────────────────────────────────────────────┘│
│  支持 .json 格式的技能包文件                                │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ✅ 已解析技能包: my-skills.json                            │
│     来源: 本地导出                                          │
│     技能数量: 5                                             │
│                                                             │
│  （后续与 Tab 1 相同的技能列表选择界面）                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Tab 3: 官方技能库

```text
┌─────────────────────────────────────────────────────────────┐
│  [从URL安装]  [从文件导入]  [官方技能库]                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🏪 官方技能仓库                                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ⭐ MobausStudio 官方技能                                ││
│  │    由 MobausStudio 团队维护的官方技能集                 ││
│  │                                          [浏览技能]     ││
│  ├─────────────────────────────────────────────────────────┤│
│  │ 👥 社区热门技能                                         ││
│  │    社区贡献的高质量技能                                 ││
│  │                                          [浏览技能]     ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  💡 提示: 点击"浏览技能"查看仓库中的可用技能               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 导出技能弹窗 (SkillExportModal)

```text
┌─────────────────────────────────────────────────────────────┐
│  导出技能                                          [×]      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  选择要导出的技能:                     [全选] [取消全选]    │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ ☑ 我的代码审查                        自定义            ││
│  │ ☑ React 最佳实践                      自定义            ││
│  │ ☐ 翻译专家                            内置 (不可导出)   ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  导出选项:                                                  │
│  ☑ 包含元信息 (来源、导出时间等)                           │
│  ☐ 美化 JSON 输出                                          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                     [取消]  [导出 (2)]      │
└─────────────────────────────────────────────────────────────┘
```

### 交互流程

#### 从URL安装流程

```text
用户点击"安装技能" → 选择"从URL安装"
        ↓
输入仓库URL → 点击"获取技能列表"
        ↓
    ┌───────────────────┐
    │ fetchSkillRegistry │ ← 网络请求
    └─────────┬─────────┘
              ↓
    ┌───────────────────┐
    │ validateSkillPackage │ ← 验证格式
    └─────────┬─────────┘
              ↓
    ┌───────────────────┐
    │ detectDuplicateSkills │ ← 检测重复
    └─────────┬─────────┘
              ↓
显示技能列表 → 用户选择技能 → 选择重复处理方式
        ↓
点击"安装选中技能"
        ↓
    ┌───────────────────┐
    │ handleInstallSkills │ ← 批量安装
    └─────────┬─────────┘
              ↓
显示安装结果 → 关闭弹窗 → 刷新技能列表
```

### 状态管理

```typescript
/** 安装弹窗状态 */
interface InstallModalState {
  /** 当前选中的 Tab */
  activeTab: 'url' | 'file' | 'official';
  /** URL 输入值 */
  urlInput: string;
  /** 加载状态 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 已获取的仓库信息 */
  registry: SkillRegistry | null;
  /** 选中的技能 ID 列表 */
  selectedSkillIds: string[];
  /** 重复检测结果 */
  duplicates: DuplicateCheckResult | null;
  /** 重复处理方式 */
  duplicateAction: 'skip' | 'overwrite' | 'rename';
}
```

---

## 🧪 测试用例

### 基础功能测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| SK-01 | 渲染技能列表 | skills 数组 | 正确显示所有技能卡片 | [ ] |
| SK-02 | 显示内置标签 | builtIn=true 的技能 | 卡片显示"内置"标签 | [ ] |
| SK-03 | 空列表显示 | skills=[] | 显示"创建第一个技能"引导 | [ ] |
| SK-04 | 切换启用状态 | 点击开关 | enabled 状态更新，触发 onToggleSkill | [ ] |
| SK-05 | 分类筛选 | 选择 "coding" 分类 | 只显示 category=coding 的技能 | [ ] |
| SK-06 | 搜索过滤 | 输入 "翻译" | 按名称/描述过滤显示匹配项 | [ ] |
| SK-07 | 状态筛选 - 已启用 | 选择 "已启用" | 只显示 enabled=true 的技能 | [ ] |
| SK-08 | 状态筛选 - 已禁用 | 选择 "已禁用" | 只显示 enabled=false 的技能 | [ ] |

### 创建技能测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| SK-10 | 打开创建弹窗 | 点击"添加技能"按钮 | 显示空白表单弹窗 | [ ] |
| SK-11 | 必填字段验证 | 名称为空提交 | 保存按钮禁用或显示错误提示 | [ ] |
| SK-12 | 创建技能成功 | 填写完整表单并提交 | 新技能添加到列表，builtIn=false | [ ] |
| SK-13 | 提示词模板必填 | promptTemplate 为空 | 保存按钮禁用 | [ ] |
| SK-14 | 分类选择 | 选择分类 | 正确保存 category 字段 | [ ] |
| SK-15 | 图标选择 | 选择图标 | 正确保存 icon 字段 | [ ] |
| SK-16 | 颜色选择 | 选择颜色 | 正确保存 color 字段 | [ ] |

### 编辑技能测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| SK-20 | 打开编辑弹窗 | 点击自定义技能的编辑按钮 | 显示预填充表单弹窗 | [ ] |
| SK-21 | 编辑提示词模板 | 修改模板内容 | 保存成功，updatedAt 更新 | [ ] |
| SK-22 | 内置技能只读 | 点击内置技能的编辑按钮 | 显示只读模式，无法修改 | [ ] |
| SK-23 | 取消编辑 | 修改后点击取消 | 不保存修改，弹窗关闭 | [ ] |
| SK-24 | 预览模式 - 内置技能 | 点击内置技能的"预览"按钮 | 只读模式打开，无保存按钮 | [ ] |
| SK-25 | 预览模式 - 自定义技能 | 点击自定义技能的"预览"按钮 | 只读模式打开，区别于编辑模式 | [ ] |
| SK-26 | 预览与编辑区分 | 自定义技能的配置/预览按钮 | 配置可编辑，预览只读 | [ ] |

### 删除技能测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| SK-30 | 删除自定义技能 | 点击删除并确认 | 技能从列表移除 | [ ] |
| SK-31 | 删除确认对话框 | 点击删除按钮 | 显示确认对话框 | [ ] |
| SK-32 | 取消删除 | 点击取消 | 技能保留 | [ ] |
| SK-33 | 内置技能无删除按钮 | 查看内置技能卡片 | 不显示删除按钮 | [ ] |

### 触发条件测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| SK-40 | 添加关键词触发 | 添加 type=keyword, pattern="审查" | 触发条件保存成功 | [ ] |
| SK-41 | 添加正则触发 | 添加 type=regex, pattern="帮我.*代码" | 触发条件保存成功 | [ ] |
| SK-42 | 触发优先级 | 设置 priority=10 | 优先级保存成功 | [ ] |
| SK-43 | 删除触发条件 | 删除某个触发条件 | 触发条件从列表移除 | [ ] |

### 变量配置测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| SK-50 | 添加字符串变量 | type=string, name="style" | 变量定义保存成功 | [ ] |
| SK-51 | 添加选择变量 | type=select, options=["A","B"] | 变量定义和选项保存成功 | [ ] |
| SK-52 | 添加布尔变量 | type=boolean, defaultValue=false | 变量定义保存成功 | [ ] |
| SK-53 | 变量名唯一性 | 添加重复变量名 | 显示错误提示 | [ ] |
| SK-54 | 删除变量 | 删除某个变量 | 变量从列表移除 | [ ] |

### 工具函数测试 (skillUtils.ts)

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| SK-60 | buildSystemPrompt - 无技能 | basePrompt="你是助手", skills=[] | 返回 "你是助手" | [x] |
| SK-61 | buildSystemPrompt - 有技能 | basePrompt + 1个启用的技能 | 返回 basePrompt + 技能模板 | [x] |
| SK-62 | buildSystemPrompt - 禁用技能 | 技能 enabled=false | 不包含禁用技能的模板 | [x] |
| SK-63 | buildSystemPrompt - 变量替换 | 模板含 {{style}}, values={style:"正式"} | {{style}} 被替换为 "正式" | [x] |
| SK-64 | buildSystemPrompt - 变量默认值 | 模板含 {{style}}, 未提供 values | 使用变量的 defaultValue | [x] |
| SK-65 | matchSkillTriggers - 关键词匹配 | input="帮我审查代码", trigger=keyword:"审查" | 返回匹配的技能 | [x] |
| SK-66 | matchSkillTriggers - 正则匹配 | input="帮我看看代码", trigger=regex:"帮我.*代码" | 返回匹配的技能 | [x] |
| SK-67 | matchSkillTriggers - 优先级排序 | 多个技能匹配，不同 priority | 按 priority 降序返回 | [x] |
| SK-68 | matchSkillTriggers - 禁用技能不匹配 | 技能 enabled=false | 不返回禁用的技能 | [x] |
| SK-69 | replaceVariables - 多变量替换 | 模板含多个变量 | 所有变量正确替换 | [x] |
| SK-70 | replaceVariables - 变量不存在 | 模板含未定义变量 | 变量占位符保留原样 | [x] |

### Agent 集成测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| SK-80 | Agent 绑定 Skill | 在 Agent 编辑中选择 Skill | Agent.skills 数组包含 Skill ID | [ ] |
| SK-81 | Agent 解绑 Skill | 在 Agent 编辑中移除 Skill | Agent.skills 数组不包含该 ID | [ ] |
| SK-82 | Agent 配置 Skill 变量 | 配置 Skill 的变量值 | Agent.skillVariables 保存正确 | [ ] |
| SK-83 | 对话时注入提示词 | Agent 绑定 Skill 后发送消息 | 系统提示词包含 Skill 模板 | [ ] |
| SK-84 | 变量配置生效 | 配置 Skill 变量后发送消息 | 系统提示词中变量已替换 | [ ] |

### 技能测试功能

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| SK-90 | 打开测试弹窗 | 点击技能卡片的"测试"按钮 | 显示测试弹窗 | [ ] |
| SK-91 | 预览完整提示词 | 输入测试消息 | 显示构建后的完整系统提示词 | [ ] |
| SK-92 | 测试变量替换 | 配置变量值 | 预览中变量正确替换 | [ ] |
| SK-93 | 测试触发匹配 | 输入包含触发词的消息 | 高亮显示匹配的触发条件 | [ ] |

### 服务层纯函数测试 (skillState)

> 测试文件: `src/test/services/skills/skillState.test.ts`

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| TC-SKILL-STATE-001 | addSkill - 创建技能 | SkillCreateInput | 列表新增 Skill，builtIn=false | [x] |
| TC-SKILL-STATE-002 | updateSkill - 更新自定义技能 | id + SkillCreateInput | 指定技能字段更新 | [x] |
| TC-SKILL-STATE-003 | updateSkill - 内置技能不可编辑 | builtIn=true 的 id | 返回原列表不变 | [x] |
| TC-SKILL-STATE-004 | deleteSkill - 删除自定义技能 | id | 指定技能从列表移除 | [x] |
| TC-SKILL-STATE-005 | deleteSkill - 内置技能不可删除 | builtIn=true 的 id | 返回原列表不变 | [x] |
| TC-SKILL-STATE-006 | toggleSkill - 切换启用状态 | id + enabled=false | 指定技能 enabled 更新 | [x] |
| TC-SKILL-STATE-007 | installSkills - 批量安装 | SkillCreateInput[] | 列表追加多个 Skill | [x] |
| TC-SKILL-STATE-008 | findSkill - 查找存在 | id | 返回对应 Skill | [x] |
| TC-SKILL-STATE-009 | findSkill - 查找不存在 | 不存在的 id | 返回 undefined | [x] |

### 持久化测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| SK-100 | 保存技能 | 创建新技能 | 数据持久化到存储 | [ ] |
| SK-101 | 加载技能 | 刷新页面 | 技能数据恢复 | [ ] |
| SK-102 | Date 类型恢复 | 加载保存的数据 | createdAt/updatedAt 为 Date 对象 | [ ] |
| SK-103 | 内置技能不持久化 | 刷新页面 | 内置技能从代码加载，非存储 | [ ] |

### v3.0.0 安装模式测试

#### 安装弹窗 UI 测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| SK-110 | 打开安装弹窗 | 点击"安装技能"按钮 | 显示安装弹窗，默认 Tab 为"从URL安装" | [ ] |
| SK-111 | Tab 切换 | 点击不同 Tab | 正确切换显示内容 | [ ] |
| SK-112 | URL 输入验证 | 输入无效 URL | 显示格式错误提示 | [ ] |
| SK-113 | 获取技能列表按钮状态 | URL 为空 | 按钮禁用 | [ ] |
| SK-114 | 关闭弹窗 | 点击关闭按钮或遮罩 | 弹窗关闭，状态重置 | [ ] |

#### 从URL安装测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| SK-120 | GitHub URL 解析 | `https://github.com/user/repo` | 转换为 raw URL 并获取 registry.json | [ ] |
| SK-121 | GitHub blob URL 解析 | `https://github.com/user/repo/blob/main/skills.json` | 正确转换为 raw URL | [ ] |
| SK-122 | 直接 JSON URL | `https://example.com/skills.json` | 直接请求该 URL | [ ] |
| SK-123 | 获取成功 - 显示技能列表 | 有效仓库 URL | 显示可选技能列表，带勾选框 | [ ] |
| SK-124 | 获取失败 - 网络错误 | 无法访问的 URL | 显示"无法连接到服务器"错误 | [ ] |
| SK-125 | 获取失败 - 404 | 不存在的资源 | 显示"未找到技能仓库"错误 | [ ] |
| SK-126 | 获取失败 - 格式错误 | 无效 JSON | 显示"数据格式错误"错误 | [ ] |
| SK-127 | 全选/取消全选 | 点击全选按钮 | 所有技能被选中/取消选中 | [ ] |
| SK-128 | 单个技能选择 | 点击技能勾选框 | 该技能选中状态切换 | [ ] |
| SK-129 | 安装按钮显示数量 | 选中 2 个技能 | 按钮显示"安装选中技能 (2)" | [ ] |

#### 重复检测测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| SK-130 | 检测到重复 - 名称匹配 | 已存在同名技能 | 显示重复警告，列出重复项 | [ ] |
| SK-131 | 无重复 | 所有技能都是新的 | 不显示重复警告 | [ ] |
| SK-132 | 重复处理 - 跳过 | 选择"跳过" | 安装时跳过重复技能 | [ ] |
| SK-133 | 重复处理 - 覆盖 | 选择"覆盖" | 安装时覆盖现有技能 | [ ] |
| SK-134 | 重复处理 - 重命名 | 选择"重命名" | 安装时自动添加后缀 (如 "技能名 (2)") | [ ] |

#### 安装执行测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| SK-140 | 安装成功 | 选中有效技能并安装 | 技能添加到列表，显示成功提示 | [ ] |
| SK-141 | 批量安装 | 选中多个技能 | 所有选中技能正确安装 | [ ] |
| SK-142 | 安装后状态 | 安装完成 | 弹窗关闭，技能列表刷新 | [ ] |
| SK-143 | 安装的技能属性 | 查看已安装技能 | builtIn=false, 有正确的 source 信息 | [ ] |

#### 文件导入测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| SK-150 | 选择有效 JSON 文件 | 选择导出的技能包 | 解析成功，显示技能列表 | [ ] |
| SK-151 | 拖拽文件导入 | 拖拽 JSON 文件到区域 | 正确读取文件内容 | [ ] |
| SK-152 | 无效文件格式 | 选择非 JSON 文件 | 显示"不支持的文件格式"错误 | [ ] |
| SK-153 | JSON 格式错误 | 选择无效 JSON | 显示"文件解析失败"错误 | [ ] |
| SK-154 | 技能包验证失败 | 缺少必填字段 | 显示具体验证错误信息 | [ ] |

#### 官方仓库测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| SK-160 | 显示官方仓库列表 | 切换到官方仓库 Tab | 显示预置的官方仓库 | [ ] |
| SK-161 | 浏览官方仓库技能 | 点击"浏览技能" | 获取该仓库的技能列表 | [ ] |
| SK-162 | 官方仓库不可用 | 仓库 URL 无法访问 | 显示错误提示 | [ ] |

#### 导出功能测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| SK-170 | 打开导出弹窗 | 点击"导出"按钮 | 显示导出弹窗，列出可导出技能 | [ ] |
| SK-171 | 仅显示自定义技能 | 查看技能列表 | 内置技能显示但不可选中 | [ ] |
| SK-172 | 选择导出技能 | 勾选多个技能 | 导出按钮显示数量 | [ ] |
| SK-173 | 执行导出 | 点击导出按钮 | 下载 JSON 文件，文件名含日期 | [ ] |
| SK-174 | 导出包含元信息 | 勾选"包含元信息" | 导出文件包含 meta 字段 | [ ] |
| SK-175 | 导出 JSON 美化 | 勾选"美化输出" | 导出文件格式化缩进 | [ ] |
| SK-176 | 空选择不可导出 | 未选择任何技能 | 导出按钮禁用 | [ ] |

#### 工具函数测试

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| SK-180 | fetchSkillRegistry - 成功 | 有效仓库 URL | 返回 SkillRegistry 对象 | [x] |
| SK-181 | fetchSkillRegistry - 网络错误 | 无效 URL | 抛出 FetchError | [x] |
| SK-182 | fetchSkillRegistry - 解析错误 | 无效 JSON | 抛出 ParseError | [x] |
| SK-183 | validateSkillPackage - 有效数据 | 完整的技能包 | valid=true, errors=[] | [x] |
| SK-184 | validateSkillPackage - 缺少 version | 无 version 字段 | valid=false, errors 包含错误 | [x] |
| SK-185 | validateSkillPackage - 缺少 skills | 无 skills 数组 | valid=false, errors 包含错误 | [x] |
| SK-186 | validateSkillPackage - 技能缺少必填字段 | skill 缺少 name | valid=false, errors 包含错误 | [x] |
| SK-187 | exportSkillsToJson - 基础导出 | 技能列表 | 返回有效 JSON 字符串 | [x] |
| SK-188 | exportSkillsToJson - 美化输出 | pretty=true | JSON 有缩进格式 | [x] |
| SK-189 | detectDuplicateSkills - 有重复 | 存在同名技能 | 返回重复列表和唯一列表 | [x] |
| SK-190 | detectDuplicateSkills - 无重复 | 全新技能 | duplicates=[], unique=全部 | [x] |

---

## 💾 持久化规范

### 存储位置

| 环境 | 存储方式 | 路径 |
|------|---------|------|
| Tauri (生产) | 文件系统 | `{app_data}/skills.json` |
| 浏览器 (开发) | localStorage | `mobaus_skills` |

### 存储服务

```typescript
// src/services/storage.ts
export const skillsStorage = {
  /** 保存技能列表（仅自定义技能） */
  save(skills: Skill[]): Promise<void>;

  /** 加载技能列表 */
  load(): Promise<Skill[]>;

  /** 添加技能 */
  add(skill: Skill): Promise<Skill[]>;

  /** 更新技能 */
  update(id: string, updates: Partial<Skill>): Promise<Skill[]>;

  /** 删除技能 */
  delete(id: string): Promise<Skill[]>;
}
```

### 持久化字段

**需要持久化的字段**（仅自定义技能）：
- 所有 Skill 接口定义的字段

**不需要持久化的**：
- 内置技能（builtIn=true）从代码中加载

---

## 📝 修改历史

| 日期 | 版本 | 修改人 | 修改内容 |
|------|------|--------|---------|
| 2026-01-18 | 1.0.0 | - | 初始版本 |
| 2026-01-21 | 2.0.0 | - | 重新定义为提示词模板模块，与 MCP 职责分离 |
| 2026-01-25 | 2.1.0 | - | 添加删除自定义技能功能，包含二次确认对话框 |
| 2026-01-25 | 3.0.0 | - | 安装模式功能设计：URL安装、文件导入、官方仓库、导出功能 |
| 2026-01-25 | 3.0.1 | - | 官方仓库添加演示模式支持：OfficialRepository 添加 isDemo 字段，内置演示数据作为后备 |
| 2026-01-25 | 3.0.2 | - | URL 输入支持命令格式解析：自动识别 npx skills add 等命令格式 |
| 2026-01-25 | 3.0.3 | - | SKILL.md 格式支持：支持从使用 SKILL.md 格式的 GitHub 仓库安装技能 |
| 2026-01-25 | 3.0.4 | - | 官方仓库更新：接入 skills.sh 生态，添加 Vercel、Anthropic、Expo、Supabase、Remotion 等真实仓库 |
| 2026-01-25 | 3.0.5 | - | skills.sh 完整集成：动态获取技能列表、分页加载、搜索功能 |
| 2026-01-26 | 3.0.6 | - | Rust 后端代理：通过 Tauri 命令绕过 CORS 限制访问 skills.sh API |
| 2026-01-26 | 3.0.7 | - | 多文件技能支持：优先获取 AGENTS.md 完整内容，添加通用 URL 代理 |
| 2026-01-26 | 3.0.8 | - | 修复搜索和分页：使用 useRef 追踪列表长度，解决 useCallback 依赖导致的函数重建问题 |
| 2026-01-26 | 3.0.9 | - | 彻底修复搜索和分页：重构 loadSkillsShList 为无依赖函数，所有参数通过 options 对象传入 |
| 2026-01-26 | 3.0.10 | - | 滚动加载更多：添加滚动到底部自动加载功能，将加载指示器移入滚动区域内 |
| 2026-01-26 | 3.0.11 | - | 调试日志增强：添加详细的滚动事件、状态变化、渲染日志，便于排查问题 |
| 2026-01-26 | 3.0.12 | - | 修复 hasMore 字段名、SKILL.md name 匹配、客户端搜索过滤 |
| 2026-01-26 | 3.0.13 | - | 相对链接转换：将技能内容中的相对链接转换为 GitHub 绝对 URL，支持查看依赖资源 |
| 2026-01-26 | 3.0.14 | - | 完整目录下载：递归下载技能目录所有文件（rules/、scripts/ 等），智能合并 markdown 内容到 promptTemplate |
| 2026-01-27 | 3.0.24 | - | 修复技能ID匹配：1) SkillInstallModal 使用不区分大小写的匹配；2) fetchSkillsFromLocations 支持 ID 格式转换匹配（空格转连字符）和部分匹配 |
| 2026-03-05 | 4.2.0 | - | 抽取 skillState 纯函数：addSkill、updateSkill、deleteSkill、toggleSkill、installSkills、findSkill |
| 2026-03-05 | 3.0.23 | - | **skills.sh 集成重构**：1) 提取独立模块 `src-tauri/src/skills_sh.rs`；2) 搜索使用 `/api/search` API；3) 列表抓取 HTML 解析 `initialSkills`；4) 添加 5 分钟缓存；5) 统一分页处理；6) 添加 6 个单元测试 |
| 2026-03-06 | 3.0.26 | - | **日志增强与错误修复**：1) 技能搜索失败时提供详细错误信息和调试日志；2) 增强 Git Trees API 搜索日志，显示可用技能列表；3) 优化路径检查日志，使用 ✓/✗ 标记；4) 改进错误消息，提供更明确的排查建议 |

---

## 📋 v3.0.23 skills.sh 集成重构

### 问题背景

skills.sh 移除了 REST API（`/api/skills` 和 `/api/search` 返回 404），导致技能市场功能失效。

### 解决方案

**架构调整**：

- 提取 skills.sh 相关代码到独立模块 `src-tauri/src/skills_sh.rs`
- 搜索功能：使用 `/api/search?q=<query>&limit=1000` API
- 列表功能：抓取 HTML 页面解析嵌入的 `initialSkills` 数组
- 缓存机制：全局静态缓存，5 分钟有效期
- 分页处理：搜索和列表统一在后端分页

**技术实现**：

```rust
// 搜索模式
let url = format!(
    "https://skills.sh/api/search?q={}&limit=1000",
    urlencoding::encode(search_term)
);
// 一次性获取所有搜索结果，后端分页

// 列表模式
let url = "https://skills.sh/";
// 抓取 HTML，解析 self.__next_f.push([1,"...{\"initialSkills\":[...]}..."])
// 缓存 5 分钟，后端分页
```

**数据格式**：

```json
{
  "skills": [
    {
      "id": "vercel-labs/skills/find-skills",
      "skillId": "find-skills",
      "name": "find-skills",
      "installs": 414516,
      "source": "vercel-labs/skills"
    }
  ],
  "hasMore": true
}
```

### 测试用例

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-SKILLS-SH-001 | HTML 解析正常 | 包含 initialSkills 的 HTML | 成功解析技能列表 |
| TC-SKILLS-SH-002 | HTML 解析失败 | 不包含 initialSkills | 返回错误 "未找到 initialSkills 数据" |
| TC-SKILLS-SH-003 | 分页第一页 | 5 个技能，limit=2, offset=0 | 返回前 2 个，hasMore=true |
| TC-SKILLS-SH-004 | 分页最后一页 | 3 个技能，limit=2, offset=2 | 返回第 3 个，hasMore=false |
| TC-SKILLS-SH-005 | offset 超出范围 | 2 个技能，offset=10 | 返回空列表，hasMore=false |
| TC-SKILLS-SH-006 | 空列表分页 | 0 个技能 | 返回空列表，hasMore=false |

### 文件结构

```text
src-tauri/src/
├── skills_sh.rs          # skills.sh 集成模块
├── skills_sh_test.rs     # 单元测试（6 个测试用例）
└── lib.rs                # 导入模块和 Tauri command
```

---

## 📋 v3.0.2 命令格式支持

### 功能说明

URL 输入框支持直接粘贴安装命令，系统自动解析并提取 URL 和技能筛选条件。

### 支持的命令格式

| 格式 | 示例 | 解析结果 |
|------|------|----------|
| `npx skills add <url>` | `npx skills add https://github.com/user/repo` | URL: `https://github.com/user/repo` |
| `npx skills add <url> --skill <id>` | `npx skills add https://github.com/user/repo --skill my-skill` | URL + 技能筛选 |
| 多个 --skill | `npx skills add <url> --skill a --skill b` | URL + 多个技能筛选 |
| 纯 URL | `https://github.com/user/repo` | URL（保持原有逻辑） |

### 接口定义

```typescript
/**
 * 解析技能安装命令
 *
 * 支持格式：
 * - npx skills add <url> [--skill <id>]...
 * - 纯 URL
 *
 * @param input - 用户输入（命令或URL）
 * @returns 解析结果
 */
export interface SkillCommandParseResult {
    /** 解析出的 URL */
    url: string;
    /** 指定的技能 ID 列表（可选） */
    skillIds?: string[];
    /** 原始输入 */
    rawInput: string;
    /** 是否为命令格式 */
    isCommand: boolean;
}

export function parseSkillCommand(input: string): SkillCommandParseResult | null;
```

### 测试用例

| 用例ID | 场景 | 输入 | 预期输出 | 状态 |
|--------|------|------|----------|------|
| SK-200 | 基础命令格式 | `npx skills add https://github.com/user/repo` | `{ url: "https://...", isCommand: true }` | [x] |
| SK-201 | 带单个技能ID | `npx skills add https://github.com/user/repo --skill my-skill` | `{ url: "...", skillIds: ["my-skill"], isCommand: true }` | [x] |
| SK-202 | 带多个技能ID | `npx skills add <url> --skill a --skill b` | `{ url: "...", skillIds: ["a", "b"], isCommand: true }` | [x] |
| SK-203 | 纯 URL | `https://github.com/user/repo` | `{ url: "https://...", isCommand: false }` | [x] |
| SK-204 | 技能ID大小写不敏感匹配 | 命令指定 `better-auth-best-practices`，仓库中 ID 为 `Better-Auth-Best-Practices` | 正确匹配并选中 | [x] |
| SK-205 | 技能名称部分匹配 | 命令指定 `auth`，仓库中有 `better-auth-best-practices` | 正确匹配并选中 | [x] |
| SK-204 | 无效命令 | `npx other-command` | `null` | [x] |
| SK-205 | 空输入 | `` | `null` | [x] |

---

## 📋 v3.0.3 SKILL.md 格式支持

### 背景

`npx skills add` (vercel-labs/add-skill) 工具使用 SKILL.md 格式存储技能定义，与 MobausStudio 的 skills.json 格式不同。

**SKILL.md 格式特点：**
- 技能存储在 `skills/<skill-id>/SKILL.md` 路径
- 文件头部使用 YAML frontmatter 定义元数据
- 文件正文为 Markdown 格式的提示词内容

**示例 SKILL.md 文件：**
```markdown
---
name: React Best Practices
description: Follow React official best practices for component development
---

When helping with React development, follow these best practices:

## Component Design
1. Single Responsibility: Each component does one thing
2. Composition over Inheritance
...
```

### 功能说明

系统自动检测 GitHub 仓库格式：
1. 首先尝试获取 `skills.json` 或 `registry.json`
2. 如果失败，使用 GitHub Contents API 扫描 `skills/` 目录
3. 解析每个 `skills/<id>/SKILL.md` 文件
4. 转换为 SkillRegistry 格式供安装使用

### 接口定义

```typescript
/**
 * SKILL.md 文件解析结果 (v3.0.3)
 */
export interface SkillMdParseResult {
    /** 技能名称（从 frontmatter 解析） */
    name: string;
    /** 技能描述（从 frontmatter 解析） */
    description: string;
    /** 提示词内容（Markdown 正文） */
    promptTemplate: string;
    /** 原始 frontmatter 数据 */
    frontmatter: Record<string, unknown>;
}

/**
 * GitHub 目录条目
 */
export interface GitHubContentItem {
    name: string;
    path: string;
    type: 'file' | 'dir';
    download_url: string | null;
}

/**
 * 解析 SKILL.md 文件内容
 *
 * @param content - SKILL.md 文件原始内容
 * @returns 解析结果，无效格式返回 null
 */
export function parseSkillMd(content: string): SkillMdParseResult | null;

/**
 * 从 GitHub 仓库获取 skills 目录列表
 *
 * @param owner - 仓库所有者
 * @param repo - 仓库名称
 * @param branch - 分支名（默认 main）
 * @returns 技能目录列表
 */
export function fetchGitHubSkillsDirectory(
    owner: string,
    repo: string,
    branch?: string
): Promise<string[]>;

/**
 * 从 GitHub 仓库获取 SKILL.md 格式的技能注册表
 *
 * @param owner - 仓库所有者
 * @param repo - 仓库名称
 * @param branch - 分支名（默认 main）
 * @param skillIds - 指定获取的技能 ID 列表（可选，不指定则获取全部）
 * @returns 技能注册表
 */
export function fetchSkillMdRegistry(
    owner: string,
    repo: string,
    branch?: string,
    skillIds?: string[]
): Promise<SkillRegistry>;
```

### 仓库格式检测逻辑

```typescript
/**
 * fetchSkillRegistry 更新逻辑 (v3.0.3)
 *
 * 1. 如果 URL 以 .json 结尾 → 直接获取 JSON
 * 2. 如果是 GitHub 仓库 URL:
 *    a. 尝试获取 skills.json
 *    b. 失败则尝试获取 registry.json
 *    c. 都失败则尝试 SKILL.md 格式（扫描 skills/ 目录）
 * 3. 其他 URL → 直接获取 JSON
 */
```

### 测试用例

| 用例ID | 场景 | 输入 | 预期输出 | 状态 |
|--------|------|------|----------|------|
| SK-210 | 解析有效 SKILL.md | 完整 frontmatter + 正文 | `{ name, description, promptTemplate }` | [x] |
| SK-211 | 解析无 frontmatter | 纯 Markdown | `null` | [x] |
| SK-212 | 解析空 frontmatter | `---\n---\n正文` | `null`（缺少 name） | [x] |
| SK-213 | 解析缺少 name | `---\ndescription: xxx\n---` | `null` | [x] |
| SK-214 | 从 SKILL.md 仓库获取技能 | `https://github.com/vercel-labs/agent-skills` | 返回 SkillRegistry | [ ] |
| SK-215 | 从 SKILL.md 仓库获取指定技能 | URL + skillIds | 只返回指定的技能 | [ ] |
| SK-216 | 空 skills 目录 | 仓库无 skills 目录 | 抛出错误 | [ ] |
| SK-217 | GitHub API 错误 | 无效仓库 | 抛出错误 | [ ] |

### YAML Frontmatter 解析

由于不引入额外依赖，使用简单的正则解析：

```typescript
/**
 * 解析 YAML frontmatter
 *
 * 支持的格式：
 * - name: 值
 * - description: 值
 * - 多行值使用 | 或 >
 */
function parseFrontmatter(content: string): Record<string, string> | null {
    // 匹配 frontmatter 块
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;

    const yaml = match[1];
    const result: Record<string, string> = {};

    // 简单的 key: value 解析
    const lines = yaml.split('\n');
    for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
            const key = line.slice(0, colonIndex).trim();
            const value = line.slice(colonIndex + 1).trim();
            result[key] = value;
        }
    }

    return result;
}
```

---

## 📋 v3.0.5 skills.sh 完整集成

### 背景

skills.sh 是一个官方的技能目录网站，提供了大量社区贡献的技能。v3.0.4 只是硬编码了几个固定的仓库，现在需要完整集成 skills.sh API，支持：
1. 动态获取技能列表
2. 分页加载（每页20条）
3. 搜索功能

### API 接口

**获取技能列表：**
```
GET https://skills.sh/api/skills?limit=20&offset=0&search=关键词
```

**响应格式：**
```json
{
  "skills": [
    {
      "id": "vercel-labs/agent-skills/vercel-react-best-practices",
      "skillId": "vercel-react-best-practices",
      "name": "vercel-react-best-practices",
      "installs": 45594,
      "source": "vercel-labs/agent-skills"
    }
  ],
  "hasMore": true
}
```

### 接口定义

```typescript
/**
 * skills.sh API 返回的技能项 (v3.0.5, v3.0.23 更新字段名)
 */
export interface SkillsShItem {
    /** 技能唯一标识符（完整路径，如 vercel-labs/skills/find-skills） */
    id: string;
    /** 技能 ID（短名称，如 find-skills） */
    skillId: string;
    /** 技能名称 */
    name: string;
    /** 安装次数 */
    installs: number;
    /** 来源仓库（格式：owner/repo）v3.0.23: skills.sh API 将 topSource 改为 source */
    source: string;
}

/**
 * skills.sh API 响应 (v3.0.5)
 */
export interface SkillsShResponse {
    /** 技能列表 */
    skills: SkillsShItem[];
    /** 是否有更多数据 */
    hasMore: boolean;
}

/**
 * skills.sh 获取参数 (v3.0.5)
 */
export interface SkillsShFetchParams {
    /** 每页数量（默认20） */
    limit?: number;
    /** 偏移量（默认0） */
    offset?: number;
    /** 搜索关键词 */
    search?: string;
}

/**
 * 从 skills.sh 获取技能列表
 *
 * @param params - 分页和搜索参数
 * @returns skills.sh 响应
 */
export async function fetchSkillsShList(params?: SkillsShFetchParams): Promise<SkillsShResponse>;

/**
 * 从 skills.sh 技能项获取完整技能定义
 *
 * 解析 source 获取 GitHub 仓库信息，然后使用 SKILL.md 格式获取技能
 * v3.0.23: 使用 skillId 作为技能标识，source 替代 topSource
 *
 * @param item - skills.sh 技能项
 * @returns 技能创建输入
 */
export async function fetchSkillFromSkillsSh(item: SkillsShItem): Promise<SkillCreateInput>;
```

### UI 设计

官方仓库 Tab 改为 skills.sh 集成界面：

```
┌────────────────────────────────────────────────────────┐
│ 🔍 搜索技能...                              [搜索按钮] │
├────────────────────────────────────────────────────────┤
│ 📦 React Best Practices          ▲ vercel-labs  45.6k │
│ 📦 Web Design Guidelines         🤖 anthropics  34.9k │
│ 📦 Remotion Best Practices       🎬 remotion    28.5k │
│ ...                                                    │
├────────────────────────────────────────────────────────┤
│ [加载更多...]                                          │
└────────────────────────────────────────────────────────┘
```

### 交互流程

1. 用户切换到"官方仓库"Tab
2. 自动加载 skills.sh 前20条技能
3. 用户可以搜索或点击"加载更多"
4. 点击技能项后，从对应 GitHub 仓库获取 SKILL.md 并解析
5. 显示技能详情和安装选项

### 测试用例

| 用例ID | 场景 | 输入 | 预期输出 | 状态 |
|--------|------|------|----------|------|
| SK-220 | 加载 skills.sh 列表 | 无参数 | 返回前20条技能 | [x] |
| SK-221 | 分页加载 | offset=20 | 返回第21-40条 | [x] |
| SK-222 | 搜索功能 | search="react" | 返回包含 react 的技能 | [x] |
| SK-223 | 安装次数显示 | 45594 | 显示 "45.6k" | [x] |
| SK-224 | 获取技能详情 | 点击技能项 | 从 GitHub 获取 SKILL.md | [ ] |
| SK-225 | API 错误处理 | 网络错误 | 显示错误信息 | [x] |
| SK-226 | 空搜索结果 | search="不存在的技能" | 显示"未找到相关技能" | [ ] |

---

## 📋 v3.0.6 Rust 后端代理

### 背景

skills.sh API 不支持 CORS（没有 `Access-Control-Allow-Origin` 响应头），浏览器前端无法直接调用。由于本项目是 Tauri 桌面应用，可以利用 Rust 后端发起 HTTP 请求来绕过 CORS 限制。

### 技术方案

```
┌────────────────┐     invoke      ┌────────────────┐     HTTP      ┌────────────────┐
│   前端 React   │ ──────────────► │   Rust 后端    │ ─────────────► │  skills.sh API │
│  (JavaScript)  │ ◄────────────── │   (reqwest)    │ ◄───────────── │                │
└────────────────┘     result      └────────────────┘     JSON       └────────────────┘
```

1. 前端通过 `invoke()` 调用 Tauri command
2. Rust 后端使用 `reqwest` 库发起 HTTP 请求
3. Rust 后端返回 JSON 数据给前端

### Rust Command 定义

```rust
// src-tauri/src/lib.rs

/// skills.sh API 获取参数
#[derive(Debug, Deserialize)]
pub struct SkillsShFetchParams {
    /// 每页数量（默认20）
    pub limit: Option<u32>,
    /// 偏移量（默认0）
    pub offset: Option<u32>,
    /// 搜索关键词
    pub search: Option<String>,
}

/// skills.sh API 响应
#[derive(Debug, Serialize, Deserialize)]
pub struct SkillsShResponse {
    pub skills: Vec<SkillsShItem>,
    #[serde(rename = "hasMore")]
    pub has_more: bool,
}

/// skills.sh 技能项 (v3.0.6, v3.0.23 更新字段名)
#[derive(Debug, Serialize, Deserialize)]
pub struct SkillsShItem {
    /// 技能唯一标识符（完整路径，如 vercel-labs/skills/find-skills）
    pub id: String,
    /// 技能 ID（短名称，如 find-skills）
    #[serde(rename = "skillId")]
    pub skill_id: String,
    pub name: String,
    pub installs: u64,
    /// 来源仓库（格式：owner/repo）v3.0.23: skills.sh API 将 topSource 改为 source
    pub source: String,
}

/// 从 skills.sh 获取技能列表（代理请求）
///
/// 由于 skills.sh API 不支持 CORS，前端无法直接调用。
/// 通过 Rust 后端代理请求绕过 CORS 限制。
///
/// # 参数
/// - `params`: 分页和搜索参数
///
/// # 返回
/// - 成功: SkillsShResponse
/// - 失败: 错误信息
#[tauri::command]
async fn fetch_skills_sh(params: SkillsShFetchParams) -> Result<SkillsShResponse, String>;
```

### 前端调用

```typescript
// src/utils/skillUtils.ts

import { invoke } from '@tauri-apps/api/core';

/**
 * 从 skills.sh 获取技能列表（通过 Rust 代理）
 *
 * @param params - 分页和搜索参数
 * @returns skills.sh 响应
 */
export async function fetchSkillsShList(params?: SkillsShFetchParams): Promise<SkillsShResponse> {
    return invoke<SkillsShResponse>('fetch_skills_sh', { params: params || {} });
}
```

### 测试用例

| 用例ID | 场景 | 输入 | 预期输出 | 状态 |
|--------|------|------|----------|------|
| SK-230 | Rust 代理 - 默认获取 | 无参数 | 返回前20条技能 | [x] |
| SK-231 | Rust 代理 - 分页 | limit=10, offset=20 | 返回第21-30条 | [x] |
| SK-232 | Rust 代理 - 搜索 | search="react" | 返回匹配技能 | [x] |
| SK-233 | Rust 代理 - 网络错误 | 无网络 | 返回错误信息 | [x] |
| SK-234 | Rust 代理 - API 错误 | API 返回非 200 | 返回错误信息 | [x] |

---

## 📋 v3.0.7 多文件技能支持

### 背景

skills.sh 上的技能仓库通常包含复杂的目录结构，不仅仅是单个 SKILL.md 文件：

```
skills/react-best-practices/
├── SKILL.md           # 索引文件（包含技能元数据和概述）
├── AGENTS.md          # 完整的规则内容（主要提示词，可能很大）
├── metadata.json      # 元数据（版本、作者、参考链接等）
├── README.md          # 说明文档
└── rules/             # 规则子目录
    ├── async-parallel.md
    ├── bundle-barrel-imports.md
    └── ...（更多规则文件）
```

v3.0.6 只读取 `SKILL.md` 文件，但实际的完整提示词内容通常在 `AGENTS.md` 中。

### 技术方案

#### 文件优先级策略

获取技能内容时按以下优先级：

1. **AGENTS.md** - 如果存在，作为主要提示词内容（通常包含完整规则）
2. **SKILL.md** - 作为后备，或用于提取元数据（name, description）
3. **metadata.json** - 可选，用于补充元数据

#### 内容合并策略

```typescript
/**
 * 技能内容来源
 */
interface SkillContentSources {
    /** SKILL.md 解析结果 */
    skillMd?: SkillMdParseResult;
    /** AGENTS.md 完整内容 */
    agentsMd?: string;
    /** metadata.json 内容 */
    metadata?: SkillMetadata;
}

/**
 * 合并多个来源的技能内容
 *
 * 优先级：
 * - name: SKILL.md > metadata.json
 * - description: SKILL.md > metadata.json
 * - promptTemplate: AGENTS.md > SKILL.md 正文
 */
function mergeSkillContent(sources: SkillContentSources): SkillCreateInput;
```

### 接口定义

```typescript
/**
 * 技能元数据（metadata.json）(v3.0.7)
 */
export interface SkillMetadata {
    /** 版本号 */
    version?: string;
    /** 组织/作者 */
    organization?: string;
    /** 日期 */
    date?: string;
    /** 摘要 */
    abstract?: string;
    /** 参考链接 */
    references?: string[];
}

/**
 * 技能目录结构 (v3.0.7)
 */
export interface SkillDirectoryStructure {
    /** 技能 ID */
    skillId: string;
    /** 是否存在 SKILL.md */
    hasSkillMd: boolean;
    /** 是否存在 AGENTS.md */
    hasAgentsMd: boolean;
    /** 是否存在 metadata.json */
    hasMetadata: boolean;
    /** 是否存在 rules 子目录 */
    hasRulesDir: boolean;
    /** rules 目录下的文件列表 */
    ruleFiles?: string[];
}

/**
 * 获取技能目录结构
 *
 * @param owner - 仓库所有者
 * @param repo - 仓库名称
 * @param skillId - 技能 ID
 * @param branch - 分支名（默认 main）
 * @returns 目录结构信息
 */
export async function fetchSkillDirectoryStructure(
    owner: string,
    repo: string,
    skillId: string,
    branch?: string
): Promise<SkillDirectoryStructure>;

/**
 * 从 skills.sh 技能项获取完整技能定义（增强版）
 *
 * 自动检测并获取多个文件：
 * 1. 优先获取 AGENTS.md 作为主要提示词
 * 2. 从 SKILL.md 提取元数据
 * 3. 可选获取 metadata.json 补充信息
 *
 * @param item - skills.sh 技能项
 * @param options - 获取选项
 * @returns 技能创建输入
 */
export async function fetchSkillFromSkillsSh(
    item: SkillsShItem,
    options?: {
        /** 是否获取完整内容（包括 AGENTS.md），默认 true */
        fetchFullContent?: boolean;
        /** 是否获取 metadata.json，默认 false */
        fetchMetadata?: boolean;
    }
): Promise<SkillCreateInput>;
```

### Rust 后端代理扩展

由于 GitHub raw 文件也可能有 CORS 限制，添加通用的 URL 获取代理：

```rust
// src-tauri/src/lib.rs

/// 通用 URL 获取代理（绕过 CORS）
///
/// 用于获取 GitHub raw 文件等可能有 CORS 限制的资源
///
/// # 参数
/// - `url`: 要获取的 URL
///
/// # 返回
/// - 成功: 文件内容字符串
/// - 失败: 错误信息
#[tauri::command]
async fn fetch_url_content(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let response = client
        .get(&url)
        .header("User-Agent", "MobausStudio/1.0")
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP 错误: {}", response.status()));
    }

    response
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))
}
```

### 前端调用更新

```typescript
// src/utils/skillUtils.ts

import { invoke } from '@tauri-apps/api/core';

/**
 * 通过 Rust 代理获取 URL 内容（绕过 CORS）
 */
async function fetchUrlContent(url: string): Promise<string> {
    return invoke<string>('fetch_url_content', { url });
}

/**
 * 从 skills.sh 技能项获取完整技能定义（v3.0.7 增强版, v3.0.23 更新字段名）
 */
export async function fetchSkillFromSkillsSh(
    item: SkillsShItem,
    options?: {
        fetchFullContent?: boolean;
        fetchMetadata?: boolean;
    }
): Promise<SkillCreateInput> {
    const { fetchFullContent = true, fetchMetadata = false } = options || {};

    // v3.0.23: 使用 skillId 作为技能标识，source 替代 topSource
    const skillId = item.skillId || item.name;
    // 解析仓库信息
    const [owner, repo] = item.source.split('/');
    const baseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/skills/${skillId}`;

    // 1. 获取 SKILL.md（必需，用于元数据）
    const skillMdUrl = `${baseUrl}/SKILL.md`;
    const skillMdContent = await fetchUrlContent(skillMdUrl);
    const skillMd = parseSkillMd(skillMdContent);

    if (!skillMd) {
        throw new Error(`解析 SKILL.md 失败: ${skillId}`);
    }

    // 2. 尝试获取 AGENTS.md（可选，作为主要提示词）
    let promptTemplate = skillMd.promptTemplate;

    if (fetchFullContent) {
        try {
            const agentsMdUrl = `${baseUrl}/AGENTS.md`;
            const agentsMdContent = await fetchUrlContent(agentsMdUrl);
            if (agentsMdContent && agentsMdContent.length > 0) {
                promptTemplate = agentsMdContent;
                logger.info(LogTags.SKILL, `使用 AGENTS.md 作为提示词 (${agentsMdContent.length} 字符)`);
            }
        } catch (err) {
            // AGENTS.md 不存在，使用 SKILL.md 内容
            logger.info(LogTags.SKILL, 'AGENTS.md 不存在，使用 SKILL.md 内容');
        }
    }

    // 3. 可选获取 metadata.json
    let metadata: SkillMetadata | undefined;
    if (fetchMetadata) {
        try {
            const metadataUrl = `${baseUrl}/metadata.json`;
            const metadataContent = await fetchUrlContent(metadataUrl);
            metadata = JSON.parse(metadataContent);
        } catch (err) {
            // metadata.json 不存在或解析失败
            logger.info(LogTags.SKILL, 'metadata.json 不可用');
        }
    }

    return {
        name: skillMd.name,
        description: skillMd.description || metadata?.abstract || item.name,
        category: 'custom',
        promptTemplate,
    };
}
```

### 测试用例

| 用例ID | 场景 | 输入 | 预期输出 | 状态 |
|--------|------|------|----------|------|
| SK-240 | 获取完整技能 - 有 AGENTS.md | react-best-practices | promptTemplate 来自 AGENTS.md | [ ] |
| SK-241 | 获取完整技能 - 无 AGENTS.md | 只有 SKILL.md 的技能 | promptTemplate 来自 SKILL.md | [ ] |
| SK-242 | 获取元数据 | fetchMetadata=true | 包含 metadata.json 信息 | [ ] |
| SK-243 | 仅获取基础内容 | fetchFullContent=false | promptTemplate 来自 SKILL.md | [ ] |
| SK-244 | SKILL.md 不存在 | 无效技能 ID | 抛出错误 | [ ] |
| SK-245 | Rust 代理获取 URL | 任意 URL | 返回内容字符串 | [ ] |
| SK-246 | Rust 代理 - 404 | 不存在的 URL | 返回 HTTP 错误 | [ ] |
| SK-247 | Rust 代理 - 超时 | 慢速 URL | 30秒后超时错误 | [ ] |

### 性能考虑

1. **并行请求**：同时请求 SKILL.md 和 AGENTS.md，减少等待时间
2. **内容大小限制**：AGENTS.md 可能很大（80KB+），考虑添加大小限制
3. **缓存策略**：考虑缓存已获取的技能内容，避免重复请求

### 未来扩展

1. **rules 目录支持**：可选获取 rules/ 下的所有规则文件并合并
2. **增量更新**：检测技能版本变化，只更新有变化的内容
3. **离线缓存**：将获取的技能内容缓存到本地，支持离线使用

---

## 📋 v3.0.13 相对链接转换

### 背景

skills.sh 上的技能内容（SKILL.md、AGENTS.md）经常包含对其他文件的引用，例如：

```markdown
See [3D rules](rules/3d.md) for detailed guidelines.
Check [setup script](./scripts/setup.sh) for installation.
```

这些相对链接在 MobausStudio 应用中无法直接访问，因为：
1. 技能内容是从 GitHub 获取的纯文本
2. 应用内没有这些依赖文件
3. 用户无法查看完整的技能资源

### 解决方案

将相对链接自动转换为 GitHub 上的绝对 URL，用户可以点击链接在浏览器中查看原始文件。

**转换示例：**

| 原始链接 | 转换后 |
|---------|--------|
| `[3D rules](rules/3d.md)` | `[3D rules](https://github.com/owner/repo/blob/main/skills/skillId/rules/3d.md)` |
| `[setup](./scripts/setup.sh)` | `[setup](https://github.com/owner/repo/blob/main/skills/skillId/scripts/setup.sh)` |
| `[parent](../other/file.md)` | `[parent](https://github.com/owner/repo/blob/main/skills/other/file.md)` |

**不转换的链接：**
- 绝对 URL (`https://...`, `http://...`)
- 邮件链接 (`mailto:...`)
- 锚点链接 (`#section`)

### 接口定义

```typescript
/**
 * 将 Markdown 内容中的相对链接转换为绝对 GitHub URL (v3.0.13)
 *
 * @param content - Markdown 内容
 * @param baseUrl - GitHub blob URL 基础路径
 * @returns 转换后的内容
 *
 * @example
 * const content = 'See [3D rules](rules/3d.md) for details.';
 * const baseUrl = 'https://github.com/vercel-labs/agent-skills/blob/main/skills/react';
 * const result = convertRelativeLinksToAbsolute(content, baseUrl);
 * // 返回: 'See [3D rules](https://github.com/.../rules/3d.md) for details.'
 */
export function convertRelativeLinksToAbsolute(content: string, baseUrl: string): string;
```

### 实现细节

```typescript
function convertRelativeLinksToAbsolute(content: string, baseUrl: string): string {
    if (!content || !baseUrl) {
        return content;
    }

    // 匹配 Markdown 链接: [text](url)
    // 排除: http://, https://, mailto:, # (锚点)
    const linkPattern = /\[([^\]]*)\]\((?!https?:\/\/|mailto:|#)([^)]+)\)/g;

    return content.replace(linkPattern, (_match, text, relativePath) => {
        // 清理相对路径（移除开头的 ./）
        let cleanPath = relativePath.replace(/^\.\//, '');

        // 处理 ../ 路径（向上一级目录）
        if (cleanPath.startsWith('../')) {
            const baseUrlParts = baseUrl.split('/');
            while (cleanPath.startsWith('../')) {
                cleanPath = cleanPath.slice(3);
                baseUrlParts.pop();
            }
            const newBaseUrl = baseUrlParts.join('/');
            return `[${text}](${newBaseUrl}/${cleanPath})`;
        }

        // 普通相对路径，直接拼接
        return `[${text}](${baseUrl}/${cleanPath})`;
    });
}
```

### 使用位置

在 `fetchSkillFromSkillsSh` 函数中，获取技能内容后自动转换：

```typescript
export async function fetchSkillFromSkillsSh(item: SkillsShItem): Promise<SkillCreateInput> {
    // v3.0.23: 使用 skillId 作为技能标识，source 替代 topSource
    const skillId = item.skillId || item.name;
    const [owner, repo] = item.source.split('/');
    // ... 获取 SKILL.md 和 AGENTS.md ...

    // v3.0.13: 将相对链接转换为 GitHub 绝对 URL
    const baseBlobUrl = `https://github.com/${owner}/${repo}/blob/main/skills/${skillId}`;
    promptTemplate = convertRelativeLinksToAbsolute(promptTemplate, baseBlobUrl);

    return { name, description, category: 'custom', promptTemplate };
}
```

### 测试用例

| 用例ID | 场景 | 输入 | 预期输出 | 状态 |
|--------|------|------|----------|------|
| SK-250 | 普通相对路径 | `[text](rules/3d.md)` | `[text](baseUrl/rules/3d.md)` | [x] |
| SK-251 | ./ 开头路径 | `[text](./scripts/setup.sh)` | `[text](baseUrl/scripts/setup.sh)` | [x] |
| SK-252 | ../ 路径 | `[text](../other/file.md)` | `[text](parentUrl/other/file.md)` | [x] |
| SK-253 | 绝对 URL 不转换 | `[text](https://example.com)` | `[text](https://example.com)` | [x] |
| SK-254 | mailto 不转换 | `[email](mailto:test@example.com)` | `[email](mailto:test@example.com)` | [x] |
| SK-255 | 锚点不转换 | `[section](#intro)` | `[section](#intro)` | [x] |
| SK-256 | 多个链接 | 包含多个相对链接 | 所有相对链接都转换 | [x] |
| SK-257 | 空内容 | `""` | `""` | [x] |
| SK-258 | 无链接内容 | `普通文本` | `普通文本` | [x] |

---

## 📋 v3.0.14 完整目录下载

### 背景

v3.0.13 将相对链接转换为 GitHub 绝对 URL，用户可以点击查看依赖资源。但这要求用户在线访问 GitHub。

v3.0.14 实现完整目录下载功能：
- 递归获取技能目录下所有文件（rules/、scripts/ 等）
- 并行下载所有文件内容
- 智能合并 markdown 文件到 promptTemplate
- 保留原始文件结构在 `files` 数组中

### 功能说明

从 skills.sh 安装技能时，系统会：
1. 使用 GitHub Contents API 递归获取技能目录结构
2. 并行下载所有文件（SKILL.md、AGENTS.md、rules/*.md、scripts/*.sh 等）
3. 将 markdown 文件智能合并到 promptTemplate
4. 将所有文件存储在 `files` 数组中，保留原始结构

### 数据结构

```typescript
/**
 * 技能文件 (v3.0.14)
 * 用于存储技能目录下的所有文件
 */
export interface SkillFile {
    /** 相对路径（如 rules/3d.md） */
    path: string;
    /** 文件名（如 3d.md） */
    name: string;
    /** 文件内容 */
    content: string;
    /** 文件类型（根据扩展名判断） */
    type: 'markdown' | 'json' | 'text' | 'other';
}

/**
 * 技能创建输入 (v3.0.14 更新)
 */
export interface SkillCreateInput {
    name: string;
    description: string;
    category: SkillCategory;
    promptTemplate: string;
    // ... 其他字段 ...

    /** v3.0.14: 技能附带的文件列表（rules/、scripts/ 等） */
    files?: SkillFile[];
}
```

### 核心函数

#### fetchSkillDirectoryContents - 递归获取目录结构

```typescript
/**
 * 递归获取技能目录下所有文件 (v3.0.14)
 *
 * @param owner - 仓库所有者
 * @param repo - 仓库名称
 * @param path - 目录路径（如 skills/3d）
 * @param branch - 分支名（默认 main）
 * @returns 文件列表，包含路径和下载 URL
 */
export async function fetchSkillDirectoryContents(
    owner: string,
    repo: string,
    path: string,
    branch: string = 'main'
): Promise<Array<{ path: string; downloadUrl: string; name: string }>>
```

#### downloadSkillFiles - 并行下载文件

```typescript
/**
 * 并行下载技能目录下的所有文件 (v3.0.14)
 *
 * @param files - 文件列表（来自 fetchSkillDirectoryContents）
 * @returns SkillFile 数组
 */
export async function downloadSkillFiles(
    files: Array<{ path: string; downloadUrl: string; name: string }>
): Promise<SkillFile[]>
```

#### mergeSkillFilesToPrompt - 智能合并内容

```typescript
/**
 * 将技能文件合并到 promptTemplate (v3.0.14)
 *
 * 合并顺序：
 * 1. AGENTS.md（如果存在）
 * 2. SKILL.md
 * 3. rules/*.md（按文件名排序）
 *
 * @param skillMdContent - SKILL.md 内容
 * @param agentsMdContent - AGENTS.md 内容（可选）
 * @param files - 所有下载的文件
 * @returns 合并后的 promptTemplate
 */
export function mergeSkillFilesToPrompt(
    skillMdContent: string,
    agentsMdContent: string | null,
    files: SkillFile[]
): string
```

### 实现流程

```
用户选择 skills.sh 技能
        ↓
fetchSkillFromSkillsSh(item)
        ↓
┌───────────────────────────────────────┐
│ 1. 解析仓库信息 (owner/repo)           │
│ 2. 构建技能目录路径 skills/{id}        │
└───────────────────────────────────────┘
        ↓
fetchSkillDirectoryContents(owner, repo, path)
        ↓
┌───────────────────────────────────────┐
│ GitHub Contents API 递归获取目录结构   │
│ - 获取目录下所有文件和子目录           │
│ - 递归处理子目录                       │
│ - 返回所有文件的路径和下载 URL         │
└───────────────────────────────────────┘
        ↓
downloadSkillFiles(fileList)
        ↓
┌───────────────────────────────────────┐
│ Promise.all 并行下载所有文件           │
│ - 使用 fetchUrlContent 获取内容        │
│ - 根据扩展名判断文件类型               │
│ - 返回 SkillFile 数组                  │
└───────────────────────────────────────┘
        ↓
mergeSkillFilesToPrompt(skillMd, agentsMd, files)
        ↓
┌───────────────────────────────────────┐
│ 智能合并 markdown 内容                 │
│ - AGENTS.md 放在最前面                 │
│ - SKILL.md 作为主体                    │
│ - rules/*.md 按文件名排序追加          │
│ - 用分隔线分隔各部分                   │
└───────────────────────────────────────┘
        ↓
返回 SkillCreateInput { ..., files }
```

### 合并示例

假设技能目录结构：
```
skills/3d/
├── AGENTS.md      # Agent 配置说明
├── SKILL.md       # 主技能文件
└── rules/
    ├── 3d.md      # 3D 规则
    └── blender.md # Blender 规则
```

合并后的 promptTemplate：
```markdown
<!-- AGENTS.md 内容 -->
Agent 配置说明...

---

<!-- SKILL.md 内容 -->
主技能内容...

---

## 📁 rules/3d.md

3D 规则内容...

---

## 📁 rules/blender.md

Blender 规则内容...
```

### 测试用例

| 用例ID | 场景 | 输入 | 预期输出 | 状态 |
|--------|------|------|----------|------|
| SK-260 | 仅 SKILL.md | 只有 SKILL.md 的目录 | promptTemplate = SKILL.md 内容 | [x] |
| SK-261 | SKILL.md + AGENTS.md | 两个文件 | AGENTS.md + 分隔线 + SKILL.md | [x] |
| SK-262 | 包含 rules 目录 | rules/ 下有多个 .md | 按文件名排序追加到末尾 | [x] |
| SK-263 | 包含 scripts 目录 | scripts/ 下有 .sh 文件 | 文件存入 files 数组，不合并到 promptTemplate | [x] |
| SK-264 | 嵌套子目录 | rules/sub/file.md | 递归获取，路径保留完整结构 | [x] |
| SK-265 | 空目录 | 目录不存在或为空 | 返回空数组，不报错 | [x] |
| SK-266 | 并行下载 | 10 个文件 | Promise.all 并行下载，性能优化 | [x] |
| SK-267 | 文件类型判断 | .md/.json/.txt/.sh | 正确识别 markdown/json/text/other | [x] |
| SK-268 | files 数组完整性 | 下载完成后 | 所有文件都在 files 数组中 | [x] |
| SK-269 | 下载失败处理 | 某个文件 404 | 跳过失败文件，继续处理其他 | [~] |
| SK-269a | 根目录技能 scripts 安装 | skillPath 为空字符串（根目录技能），目录含 scripts/ | 传入空字符串而非 '.'，scripts/ 正常递归下载 | [x] |
| SK-269b | 根目录技能路径计算 | path='' 时 replace 逻辑 | 根目录文件路径不被错误截断 | [x] |

---

## 📋 v3.0.15 技能文件列表展示

### 背景

v3.0.14 实现了完整目录下载功能，将技能目录下的所有文件存储在 `files` 数组中。但用户无法在客户端查看这些文件。

v3.0.15 在技能详情/预览页面添加文件列表展示功能，让用户可以查看技能包含的所有文件。

### 功能说明

在 SkillModal 组件中添加"附带文件"区域：
1. 显示技能包含的所有文件列表
2. 展示文件路径、名称、类型
3. 支持展开/收起查看文件内容
4. 仅当 `skill.files` 存在且不为空时显示

### UI 设计

```
┌─────────────────────────────────────────────────────────────┐
│ 📁 附带文件 (3)                                              │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📄 rules/3d.md                              [markdown]  │ │
│ │ ▼ 展开内容                                              │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ # 3D 建模规则                                        │ │ │
│ │ │ ...                                                  │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📄 rules/blender.md                         [markdown]  │ │
│ │ ▶ 收起内容                                              │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📜 scripts/setup.sh                         [other]     │ │
│ │ ▶ 收起内容                                              │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 组件修改

#### SkillModal.tsx

新增导入：

```typescript
import { FolderOpen, ChevronDown, ChevronRight } from 'lucide-react';
```

新增状态：

```typescript
// 展开的文件索引集合
const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set());
```

新增渲染区域（在触发条件之后、操作按钮之前）：

```tsx
{/* 附带文件 (v3.0.15) */}
{skill?.files && skill.files.length > 0 && (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2 mb-4">
            <FolderOpen className="w-4 h-4" />
            附带文件 ({skill.files.length})
        </label>
        <div className="space-y-2">
            {skill.files.map((file, index) => (
                <div
                    key={index}
                    className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                    {/* 文件头部 */}
                    <button
                        type="button"
                        onClick={() => toggleFileExpand(index)}
                        className="w-full flex items-center justify-between p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            {expandedFiles.has(index) ? (
                                <ChevronDown className="w-4 h-4 text-gray-500" />
                            ) : (
                                <ChevronRight className="w-4 h-4 text-gray-500" />
                            )}
                            <FileText className="w-4 h-4 text-blue-500" />
                            <span className="text-sm font-mono text-gray-700 dark:text-gray-300">
                                {file.path}
                            </span>
                        </div>
                        <span className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded text-gray-600 dark:text-gray-300">
                            {file.type}
                        </span>
                    </button>
                    {/* 文件内容 */}
                    {expandedFiles.has(index) && (
                        <div className="px-3 pb-3">
                            <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-3 rounded overflow-x-auto max-h-60 overflow-y-auto font-mono text-gray-700 dark:text-gray-300">
                                {file.content}
                            </pre>
                        </div>
                    )}
                </div>
            ))}
        </div>
    </div>
)}
```

新增处理函数：

```typescript
/**
 * 切换文件展开/收起状态
 */
const toggleFileExpand = (index: number) => {
    setExpandedFiles((prev) => {
        const next = new Set(prev);
        if (next.has(index)) {
            next.delete(index);
        } else {
            next.add(index);
        }
        return next;
    });
};
```

### 测试用例

| 用例ID | 场景 | 输入 | 预期输出 | 状态 |
|--------|------|------|----------|------|
| SK-270 | 无文件时不显示 | skill.files 为空或 undefined | 不显示附带文件区域 | [ ] |
| SK-271 | 显示文件数量 | skill.files 有 3 个文件 | 标题显示"附带文件 (3)" | [ ] |
| SK-272 | 显示文件路径 | file.path = "rules/3d.md" | 显示完整路径 | [ ] |
| SK-273 | 显示文件类型 | file.type = "markdown" | 显示类型标签 | [ ] |
| SK-274 | 展开文件内容 | 点击文件行 | 展开显示文件内容 | [ ] |
| SK-275 | 收起文件内容 | 再次点击文件行 | 收起文件内容 | [ ] |
| SK-276 | 多文件独立展开 | 展开多个文件 | 各文件独立控制展开状态 | [ ] |
| SK-277 | 内容滚动 | 文件内容超长 | 显示滚动条，最大高度限制 | [ ] |
| SK-278 | 预览模式可用 | previewMode = true | 文件列表正常显示 | [ ] |
| SK-279 | 只读模式可用 | 内置技能 | 文件列表正常显示 | [ ] |

### v3.0.15 Bug 修复：files 数组不完整

#### 问题描述

用户反馈安装技能后只能看到一个文件，而不是完整的文件列表。

#### 根本原因

在 `fetchSkillFromSkillsSh` 函数中，SKILL.md 和 AGENTS.md 是单独获取的，但没有被添加到 `files` 数组中。只有 `rules/` 等子目录下的文件才会被添加到 `files`。

如果技能目录下只有 SKILL.md 和 AGENTS.md（没有其他子目录），则 `files` 数组为空。

#### 修复方案

修改 `src/utils/skillUtils.ts` 中的 `fetchSkillFromSkillsSh` 函数：

1. 在获取 SKILL.md 后，立即将其添加到 `files` 数组
2. 如果获取到 AGENTS.md，也将其添加到 `files` 数组
3. 然后再下载其他子目录文件并追加到 `files` 数组

```typescript
// v3.0.15: 首先添加已获取的 SKILL.md
files.push({
    path: 'SKILL.md',
    name: 'SKILL.md',
    content: skillMdContent,
    type: 'markdown',
});

// v3.0.15: 如果有 AGENTS.md，也添加到 files
if (agentsMdContent) {
    files.push({
        path: 'AGENTS.md',
        name: 'AGENTS.md',
        content: agentsMdContent,
        type: 'markdown',
    });
}

// 然后下载其他文件...
```

#### 修改文件

- `src/utils/skillUtils.ts` - `fetchSkillFromSkillsSh` 函数

#### 测试用例

| 用例ID | 场景 | 输入 | 预期输出 | 状态 |
|--------|------|------|----------|------|
| SK-280 | 只有 SKILL.md | 技能目录只有 SKILL.md | files 包含 1 个文件 | [x] |
| SK-281 | SKILL.md + AGENTS.md | 技能目录有两个文件 | files 包含 2 个文件 | [x] |
| SK-282 | 完整目录 | 技能目录有 rules/ 子目录 | files 包含所有文件 | [x] |
| SK-283 | 文件顺序 | 安装完成后 | SKILL.md 在最前面 | [x] |

### v3.0.15 增强：URL 安装也支持完整目录下载

#### 问题描述

从 URL 安装 SKILL.md 格式的技能时，只获取了 SKILL.md 内容，没有下载完整目录（AGENTS.md、rules/ 等）。

#### 修复方案

修改 `fetchSkillMdRegistry` 函数，使其与 `fetchSkillFromSkillsSh` 保持一致的行为：

1. 获取 SKILL.md 并解析
2. 尝试获取 AGENTS.md
3. 递归下载完整目录（rules/、scripts/ 等）
4. 将所有文件存储在 `files` 数组中
5. 智能合并 markdown 内容到 promptTemplate

#### 修改文件

- `src/utils/skillUtils.ts` - `fetchSkillMdRegistry` 函数
- 删除未使用的 `fetchSkillMdContent` 函数

#### 测试用例

| 用例ID | 场景 | 输入 | 预期输出 | 状态 |
|--------|------|------|----------|------|
| SK-284 | URL 安装单个技能 | GitHub SKILL.md 格式 URL | files 包含完整文件列表 | [ ] |
| SK-285 | URL 安装多个技能 | 仓库包含多个技能目录 | 每个技能都有完整 files | [ ] |
| SK-286 | URL 安装带 rules | 技能有 rules/ 子目录 | rules/*.md 被下载并合并 | [ ] |

---

## 📋 v3.0.16 修复 skills.sh 搜索接口

### 背景

v3.0.6 实现了 skills.sh 集成，但搜索功能使用了错误的 API 端点。

**错误的 API**：
```
https://skills.sh/api/skills?limit=20&offset=0&search=react
```

**正确的 API**：
```
https://skills.sh/api/search?q=react&limit=50
```

### API 对比

| 功能 | 端点 | 响应格式 |
|------|------|----------|
| 列表（分页） | `/api/skills?limit=20&offset=0` | `{ skills, hasMore }` |
| 搜索 | `/api/search?q=keyword&limit=50` | `{ query, searchType, skills, count, duration_ms }` |

### 修复方案

修改 Rust 后端 `fetch_skills_sh` 函数：

1. 当有搜索关键词时，使用 `/api/search` 端点
2. 当无搜索关键词时，使用 `/api/skills` 端点（分页）
3. 统一响应格式，前端无需修改

### 修改文件

- `src-tauri/src/lib.rs` - `fetch_skills_sh` 函数
- `src/components/features/Skills/SkillInstallModal.tsx` - 前端搜索逻辑

### 前端修改 (v3.0.16)

1. **新增搜索 limit 常量**：`SKILLS_SH_SEARCH_LIMIT = 100`
2. **修改 loadSkillsShList**：搜索模式使用更大的 limit（100），因为搜索 API 不支持分页
3. **滚动加载逻辑**：搜索模式下禁用滚动加载更多（搜索 API 不支持 offset）
4. **搜索无结果提示**：更新提示文案，移除"滚动加载更多"的建议

### 测试用例

| 用例ID | 场景 | 输入 | 预期输出 | 状态 |
|--------|------|------|----------|------|
| SK-290 | 无搜索词分页 | `{ limit: 20, offset: 0 }` | 使用 /api/skills，返回 hasMore | [ ] |
| SK-291 | 有搜索词 | `{ search: "react", limit: 50 }` | 使用 /api/search，返回匹配结果 | [ ] |
| SK-292 | 搜索结果格式 | 搜索 "react" | skills 数组格式与列表一致 | [ ] |
| SK-293 | 搜索无结果 | 搜索 "xyzabc123" | 返回空 skills 数组 | [ ] |
| SK-294 | 搜索 hasMore | 搜索结果 | hasMore 根据 count 和 limit 计算 | [ ] |

---

## 📋 v3.0.17 多路径技能发现

### 背景

当前实现只搜索 `skills/` 目录，但 `npx skills add` 工具支持更多搜索路径：

- 根目录（仓库本身就是一个技能）
- `skills/` 及其子目录（`.curated/`、`.experimental/`、`.system/`）
- Agent 专用目录（`.claude/skills/`、`.cursor/skills/` 等）
- 直接技能路径 URL（`/tree/main/skills/xxx`）

这导致用户经常找不到技能，体验不如 `npx skills add`。

### 改进方案

#### 1. 多路径搜索

```typescript
/**
 * 技能搜索路径优先级（按顺序尝试）
 */
const SKILL_SEARCH_PATHS = [
    '',                          // 根目录（仓库本身就是一个技能）
    'skills',                    // 标准 skills 目录
    'skills/.curated',           // 精选技能
    'skills/.experimental',      // 实验性技能
    'skills/.system',            // 系统技能
    '.claude/skills',            // Claude 专用
    '.cursor/skills',            // Cursor 专用
];
```

#### 2. 支持直接技能路径 URL

```typescript
/**
 * 解析 GitHub URL，支持直接指向技能目录
 *
 * 支持格式：
 * - github.com/owner/repo
 * - github.com/owner/repo/tree/branch/path/to/skill
 */
function parseGitHubSkillUrl(url: string): {
    owner: string;
    repo: string;
    branch: string;
    skillPath?: string;  // 直接指向技能目录
}
```

#### 3. 根目录作为技能

```typescript
/**
 * 检查仓库根目录是否是一个技能
 *
 * 如果根目录有 SKILL.md，则仓库本身就是一个技能
 */
async function checkRootSkill(owner: string, repo: string, branch: string): Promise<boolean>
```

#### 4. 递归搜索

```typescript
/**
 * 递归搜索仓库中的所有 SKILL.md 文件
 *
 * 当标准路径都找不到技能时，递归搜索整个仓库
 */
async function recursiveSkillSearch(
    owner: string,
    repo: string,
    path: string,
    branch: string
): Promise<SkillLocation[]>
```

### 技能发现流程

```
用户输入 URL
    │
    ▼
解析 URL 格式
    │
    ├─ 直接技能路径？ ──────────────────────────────────────┐
    │   (github.com/owner/repo/tree/branch/skills/xxx)     │
    │                                                       ▼
    │                                              直接获取该技能
    │
    ▼
检查根目录 SKILL.md
    │
    ├─ 存在？ ─────────────────────────────────────────────┐
    │                                                       │
    │                                                       ▼
    │                                              仓库本身是一个技能
    │
    ▼
按优先级搜索各路径
    │
    ├─ skills/
    ├─ skills/.curated/
    ├─ skills/.experimental/
    ├─ .claude/skills/
    └─ .cursor/skills/
    │
    ├─ 找到技能？ ─────────────────────────────────────────┐
    │                                                       │
    │                                                       ▼
    │                                              返回找到的技能
    │
    ▼
递归搜索整个仓库
    │
    └─ 返回所有找到的 SKILL.md
```

### 类型定义

```typescript
/**
 * 技能位置信息
 */
interface SkillLocation {
    /** 技能路径（相对于仓库根目录） */
    path: string;
    /** 技能名称（目录名或仓库名） */
    name: string;
    /** 是否为根目录技能 */
    isRoot?: boolean;
}

/**
 * GitHub URL 解析结果
 */
interface GitHubUrlParseResult {
    /** 仓库所有者 */
    owner: string;
    /** 仓库名称 */
    repo: string;
    /** 分支名 */
    branch: string;
    /** 直接技能路径（可选） */
    skillPath?: string;
}
```

### 测试用例

| 用例ID | 场景 | 输入 | 预期输出 | 状态 |
|--------|------|------|----------|------|
| SK-300 | 根目录技能 | 仓库根目录有 SKILL.md | 返回仓库作为单个技能 | [ ] |
| SK-301 | 标准 skills 目录 | skills/ 下有多个技能 | 返回所有技能 | [ ] |
| SK-302 | .curated 子目录 | skills/.curated/ 下有技能 | 返回精选技能 | [ ] |
| SK-303 | .claude/skills 目录 | .claude/skills/ 下有技能 | 返回 Claude 专用技能 | [ ] |
| SK-304 | 直接技能路径 URL | `/tree/main/skills/react` | 直接返回 react 技能 | [ ] |
| SK-305 | 递归搜索 | 技能在非标准路径 | 递归找到并返回 | [ ] |
| SK-306 | 空仓库 | 仓库无任何 SKILL.md | 抛出"未找到技能"错误 | [ ] |
| SK-307 | 混合路径 | 多个路径都有技能 | 合并返回所有技能 | [ ] |
| SK-308 | URL 解析 - 基础 | `github.com/owner/repo` | `{ owner, repo, branch: 'main' }` | [x] |
| SK-309 | URL 解析 - 带路径 | `github.com/owner/repo/tree/main/skills/xxx` | `{ owner, repo, branch, skillPath }` | [x] |
| SK-310 | URL 解析 - 带分支 | `github.com/owner/repo/tree/dev` | `{ owner, repo, branch: 'dev' }` | [x] |

### 性能优化

1. **并行搜索**：同时检查多个路径，减少等待时间
2. **早期返回**：找到技能后立即返回，不继续搜索
3. **缓存目录结构**：避免重复请求 GitHub API
4. **递归深度限制**：防止无限递归，默认最大深度 5 层

---

## 📋 v3.0.18 导出附带文件支持

### 背景

v3.0.14 实现了完整目录下载功能，技能的 `files` 数组包含所有附带文件（rules/*.md、scripts/*.sh 等）。但导出功能 `exportSkillsToJson` 没有包含 `files` 字段，导致导出的 JSON 文件丢失附带文件数据。

### 问题分析

当前 `exportSkillsToJson` 函数：

```typescript
// 问题代码：缺少 files 字段
const skillInputs: SkillCreateInput[] = skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    category: skill.category,
    icon: skill.icon,
    color: skill.color,
    promptTemplate: skill.promptTemplate,
    outputFormat: skill.outputFormat,
    outputSchema: skill.outputSchema,
    triggers: skill.triggers,
    variables: skill.variables,
    // ❌ 缺少 files 字段
}));
```

### 修复方案

#### 1. 修复 exportSkillsToJson 函数

```typescript
/**
 * 导出技能为 JSON 字符串 (v3.0.18 增强)
 *
 * v3.0.18: 支持导出附带文件（files 数组）
 *
 * @param skills - 要导出的技能列表
 * @param options - 导出选项
 * @returns JSON 字符串
 */
export function exportSkillsToJson(
    skills: Skill[],
    options?: { author?: string; source?: string }
): string {
    // 转换为 SkillCreateInput 格式（移除运行时字段）
    const skillInputs: SkillCreateInput[] = skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        category: skill.category,
        icon: skill.icon,
        color: skill.color,
        promptTemplate: skill.promptTemplate,
        outputFormat: skill.outputFormat,
        outputSchema: skill.outputSchema,
        triggers: skill.triggers,
        variables: skill.variables,
        // v3.0.18: 包含附带文件
        files: skill.files,
    }));

    const meta: SkillPackageMeta = {
        exportedAt: new Date().toISOString(),
        exportedBy: 'MobausStudio/v3.0.18',
        ...(options?.author && { author: options.author }),
        ...(options?.source && { source: options.source }),
    };

    const pkg: SkillPackage = {
        version: '1.0.0',
        skills: skillInputs,
        meta,
    };

    return JSON.stringify(pkg, null, 2);
}
```

#### 2. 更新导出预览 UI

在 `SkillExportModal` 中显示附带文件统计：

```typescript
// 计算总文件数
const totalFiles = useMemo(() => {
    return customSkills
        .filter((s) => selectedSkills.has(s.id))
        .reduce((sum, skill) => sum + (skill.files?.length || 0), 0);
}, [customSkills, selectedSkills]);

// 在预览区域显示
<div className="text-xs text-gray-500 dark:text-gray-400">
    <p>• 技能数量: {selectedSkills.size}</p>
    <p>• 附带文件: {totalFiles} 个</p>
    <p>• 文件格式: JSON (MobausStudio 技能包)</p>
    <p>• 版本: 1.0.0</p>
    {author && <p>• 作者: {author}</p>}
    {source && <p>• 来源: {source}</p>}
</div>
```

#### 3. 技能列表显示文件数量

```typescript
{customSkills.map((skill) => (
    <label key={skill.id} className="...">
        {/* ... */}
        <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-800 dark:text-gray-100">
                {skill.name}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                {skill.description}
            </div>
            {/* v3.0.18: 显示附带文件数量 */}
            {skill.files && skill.files.length > 0 && (
                <div className="text-xs text-blue-500 mt-1">
                    📁 {skill.files.length} 个附带文件
                </div>
            )}
        </div>
        {/* ... */}
    </label>
))}
```

### 导出文件格式

导出的 JSON 文件结构（v3.0.18）：

```json
{
  "version": "1.0.0",
  "skills": [
    {
      "name": "React Best Practices",
      "description": "React 开发最佳实践",
      "category": "custom",
      "promptTemplate": "...",
      "files": [
        {
          "path": "SKILL.md",
          "name": "SKILL.md",
          "content": "---\nname: React Best Practices\n---\n...",
          "type": "markdown"
        },
        {
          "path": "AGENTS.md",
          "name": "AGENTS.md",
          "content": "# React Agent Instructions\n...",
          "type": "markdown"
        },
        {
          "path": "rules/hooks.md",
          "name": "hooks.md",
          "content": "# React Hooks 规则\n...",
          "type": "markdown"
        },
        {
          "path": "scripts/setup.sh",
          "name": "setup.sh",
          "content": "#!/bin/bash\n...",
          "type": "other"
        }
      ]
    }
  ],
  "meta": {
    "exportedAt": "2024-01-15T10:30:00.000Z",
    "exportedBy": "MobausStudio/v3.0.18",
    "author": "用户名",
    "source": "https://github.com/user/repo"
  }
}
```

### 测试用例

| 用例ID | 场景 | 输入 | 预期输出 | 状态 |
|--------|------|------|----------|------|
| SK-320 | 导出无文件技能 | skill.files 为空 | JSON 中 files 为 undefined 或空数组 | [ ] |
| SK-321 | 导出有文件技能 | skill.files 有 3 个文件 | JSON 中 files 包含 3 个文件对象 | [ ] |
| SK-322 | 文件内容完整 | 导出后重新导入 | 文件内容与原始一致 | [ ] |
| SK-323 | 预览显示文件数 | 选择有文件的技能 | 预览显示"附带文件: N 个" | [ ] |
| SK-324 | 技能列表显示文件 | 技能有附带文件 | 显示"📁 N 个附带文件" | [ ] |
| SK-325 | 混合导出 | 部分技能有文件 | 各技能 files 字段正确 | [ ] |
| SK-326 | 大文件导出 | 文件内容较大 | 正常导出，无截断 | [ ] |

### 注意事项

1. **文件大小**：附带文件可能较大（如 AGENTS.md 80KB+），导出的 JSON 文件会相应增大
2. **二进制文件**：当前只支持文本文件，二进制文件（图片等）不在 files 数组中
3. **向后兼容**：导入时如果 files 字段不存在，应正常处理（旧版本导出的文件）

---

## 📋 v3.0.20 修复：官方仓库安装递归搜索

### 背景

v3.0.19 修复了官方仓库安装 404 问题，但只支持固定的路径列表（如 `skills/`、`skills/.curated/` 等）。

对于目录结构更复杂的仓库（如 `expo/skills`），技能可能位于任意深度的子目录中：

```
expo/skills/
├── plugins/
│   └── expo-app-design/
│       └── skills/
│           └── use-dom/        ← 技能在这里
│               └── SKILL.md
```

执行 `npx skills add https://github.com/expo/skills --skill use-dom` 时，v3.0.19 无法找到该技能。

### 修复方案

修改 `fetchSkillFromSkillsSh` 函数，采用两阶段搜索策略：

1. **第一阶段（快速查找）**：尝试常见路径列表
   - `skills/{id}`
   - `skills/.curated/{id}`
   - `skills/.experimental/{id}`
   - `.claude/skills/{id}`
   - 等等...

2. **第二阶段（Git Trees API 搜索）**：如果第一阶段未找到，使用 Git Trees API 搜索整个仓库
   - v3.0.21: 使用 `searchSkillsWithTreeApi` 函数（只需 1 次 API 调用）
   - v3.0.23: 按技能名称匹配 `loc.name === skillId`
   - 支持任意深度的目录结构

### 修改文件

- `src/utils/skillUtils.ts` - `fetchSkillFromSkillsSh` 函数

### 代码变更

```typescript
// v3.0.21: 第二阶段：如果常见路径都找不到，使用 Git Trees API 搜索
// v3.0.23: 使用 skillId 替代 item.id
if (!skillPath || !baseRawUrl) {
    logger.info(LogTags.SKILL, `第二阶段：常见路径未找到，使用 Git Trees API 搜索整个仓库...`);

    try {
        // 使用 Git Trees API 一次性获取整个仓库的文件树
        const allSkillLocations = await searchSkillsWithTreeApi(owner, repo, 'main');

        // 查找匹配的技能（按名称匹配）
        const matchedLocation = allSkillLocations.find(
            loc => loc.name.toLowerCase() === skillId.toLowerCase()
        );

        if (matchedLocation) {
            skillPath = matchedLocation.path;
            baseRawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${skillPath}`;
            logger.info(LogTags.SKILL, `递归搜索找到技能路径: ${skillPath}`);
        }
    } catch (err) {
        logger.info(LogTags.SKILL, `递归搜索失败: ${err}`);
    }
}
```

### 测试用例

| 用例ID | 场景 | 输入 | 预期输出 | 状态 |
|--------|------|------|----------|------|
| SK-330 | 标准路径技能 | `skills/react` 结构 | 第一阶段找到 | [ ] |
| SK-331 | 精选技能 | `skills/.curated/xxx` 结构 | 第一阶段找到 | [ ] |
| SK-332 | 深层嵌套技能 | `plugins/xxx/skills/yyy` 结构 | 第二阶段递归找到 | [ ] |
| SK-333 | expo/skills use-dom | `expo/skills --skill use-dom` | 找到 `plugins/expo-app-design/skills/use-dom` | [ ] |
| SK-334 | 不存在的技能 | 仓库中无此技能 | 抛出明确错误信息 | [ ] |
| SK-335 | 大型仓库性能 | 仓库有很多目录 | 递归搜索在合理时间内完成 | [ ] |

### 注意事项

1. **性能考虑**：递归搜索会调用多次 GitHub API，对于大型仓库可能较慢
2. **API 限制**：GitHub API 有速率限制，频繁搜索可能触发限制
3. **搜索深度**：`MAX_RECURSIVE_DEPTH = 5`，防止无限递归

---

## 📋 v3.0.21 修复：使用 Git Trees API 解决 API 限流问题

### 背景

v3.0.20 的递归搜索方案存在严重问题：

1. **API 调用次数过多**：`recursiveSkillSearch` 对每个目录都调用一次 GitHub Contents API
2. **容易触发限流**：GitHub API 未认证限制 60次/小时，expo/skills 这样的仓库很容易超限
3. **搜索失败**：API 限流后返回 403，导致技能搜索失败

实际测试 `expo/skills` 仓库时，由于目录层级深，递归搜索需要多次 API 调用，很快就触发了限流。

### 修复方案

使用 **Git Trees API** 替代递归搜索：

```
GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1
```

**优势**：
- ✅ **只需 1 次 API 调用**：一次性获取整个仓库的文件树
- ✅ **不受目录深度限制**：返回所有层级的文件
- ✅ **更快更省配额**：比递归搜索效率高 N 倍

### 新增函数

```typescript
/**
 * 使用 Git Trees API 高效搜索仓库中的所有 SKILL.md 文件 (v3.0.21)
 */
async function searchSkillsWithTreeApi(
    owner: string,
    repo: string,
    branch: string = 'main'
): Promise<SkillLocation[]> {
    // Git Trees API: 一次性获取整个仓库的文件树
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;

    const response = await fetch(apiUrl, {
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'MobausStudio',
        },
    });

    const data = await response.json();
    const skills: SkillLocation[] = [];

    // 遍历所有文件，找出 SKILL.md
    for (const item of data.tree || []) {
        if (item.type === 'blob' && item.path.endsWith('/SKILL.md')) {
            const skillDir = item.path.replace(/\/SKILL\.md$/, '');
            const skillName = skillDir.split('/').pop() || '';
            if (skillName) {
                skills.push({ path: skillDir, name: skillName });
            }
        }
    }

    return skills;
}
```

### 修改文件

- `src/utils/skillUtils.ts`
  - 新增 `searchSkillsWithTreeApi` 函数
  - 修改 `fetchSkillFromSkillsSh` 第二阶段使用新函数

### 代码变更

```typescript
// v3.0.21: 第二阶段：如果常见路径都找不到，使用 Git Trees API 搜索整个仓库
// 优势：只需要 1 次 API 调用，不会触发限流
// v3.0.23: 使用 skillId 替代 item.id
if (!skillPath || !baseRawUrl) {
    logger.info(LogTags.SKILL, `第二阶段：常见路径未找到，使用 Git Trees API 搜索整个仓库...`);

    try {
        // 使用 Git Trees API 一次性获取整个仓库的文件树
        const allSkillLocations = await searchSkillsWithTreeApi(owner, repo, 'main');

        // 查找匹配的技能（按名称匹配，不区分大小写）
        const matchedLocation = allSkillLocations.find(
            loc => loc.name.toLowerCase() === skillId.toLowerCase()
        );

        if (matchedLocation) {
            skillPath = matchedLocation.path;
            baseRawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${skillPath}`;
            logger.info(LogTags.SKILL, `Git Trees API 找到技能路径: ${skillPath}`);
        }
    } catch (err) {
        logger.info(LogTags.SKILL, `Git Trees API 搜索失败: ${err}`);
    }
}
```

### 测试用例

| 用例ID | 场景 | 输入 | 预期输出 | 状态 |
|--------|------|------|----------|------|
| SK-340 | Git Trees API 搜索 | expo/skills 仓库 | 1 次 API 调用找到所有技能 | [ ] |
| SK-341 | 深层嵌套技能 | use-dom (在 plugins/expo-app-design/skills/) | 正确找到路径 | [ ] |
| SK-342 | API 限流恢复 | 之前限流的情况 | 使用新 API 正常工作 | [ ] |
| SK-343 | 超大仓库截断 | 文件数超过限制 | 显示警告但继续搜索 | [ ] |
| SK-344 | 技能名称匹配 | 大小写不同 | 不区分大小写匹配 | [ ] |

### 注意事项

1. **仓库截断**：Git Trees API 对超大仓库（>100,000 文件）可能截断，会记录警告日志
2. **分支名称**：默认使用 `main` 分支，部分旧仓库可能是 `master`
3. **API 配额**：虽然大幅减少调用次数，但仍受 60次/小时限制

### 对比

| 方案 | API 调用次数 | expo/skills 示例 |
|------|-------------|------------------|
| v3.0.20 递归搜索 | N 次（每个目录一次） | ~20+ 次 |
| v3.0.21 Git Trees | 1 次 | 1 次 |

### 统一两种安装方式

v3.0.21 同时修改了 `discoverSkillsInRepo`（URL 安装）和 `fetchSkillFromSkillsSh`（官方仓库安装），
两种安装方式现在都使用同一套 `searchSkillsWithTreeApi` 函数：

| 安装方式 | 函数 | 第二阶段搜索方法 |
|---------|------|-----------------|
| URL 安装 | `discoverSkillsInRepo` | `searchSkillsWithTreeApi` ✅ |
| 官方仓库安装 | `fetchSkillFromSkillsSh` | `searchSkillsWithTreeApi` ✅ |

---

## 📋 v3.0.22 新增：技能来源信息（支持后续升级）

### 背景

用户安装技能后，无法知道技能来自哪个仓库，也无法方便地升级到新版本。

### 解决方案

在 `Skill` 类型中新增 `source` 字段，记录技能的安装来源信息。

### 新增类型

```typescript
/**
 * 技能来源信息 (v3.0.22)
 * 记录技能的安装来源，便于后续升级
 */
export interface SkillSource {
    type: 'url' | 'skills.sh' | 'local';       // 来源类型
    repoUrl?: string;                          // GitHub 仓库 URL
    repoOwner?: string;                        // 仓库所有者
    repoName?: string;                         // 仓库名称
    skillPath?: string;                        // 技能在仓库中的路径
    branch?: string;                           // 分支名
    installCommand?: string;                   // 安装命令
    installedAt?: Date;                        // 安装时间
    installedVersion?: string;                 // 安装时的版本
}
```

### 修改文件

- `src/types/index.ts` - 新增 `SkillSource` 接口，`Skill` 和 `SkillCreateInput` 添加 `source` 字段
- `src/utils/skillUtils.ts` - `fetchSkillFromSkillsSh` 和 `fetchSkillsFromLocations` 返回时填充 `source`
- `src/utils/skillUtils.ts` - `exportSkillsToJson` 导出时包含 `source` 字段
- `src/components/features/Skills/SkillCard.tsx` - 显示技能来源信息（仓库链接 + skills.sh 标签）
- `src/components/features/Skills/SkillInstallModal.tsx` - 安装列表显示附带文件数量

### 示例数据

安装 `expo/skills` 的 `upgrading-expo` 后，`source` 字段内容：

```json
{
    "type": "skills.sh",
    "repoUrl": "https://github.com/expo/skills",
    "repoOwner": "expo",
    "repoName": "skills",
    "skillPath": "plugins/upgrading-expo/skills/upgrading-expo",
    "branch": "main",
    "installCommand": "npx skills add https://github.com/expo/skills --skill upgrading-expo",
    "installedAt": "2026-01-27T03:24:00.000Z"
}
```

### 后续规划

- [x] 技能卡片显示来源信息（仓库链接）
- [x] 安装时显示附带文件数量
- [x] 导出时包含来源信息

---

## v3.0.29 (2026-03-07) - 修复 master 分支仓库无法下载完整目录的问题

### 问题描述

从 skills.sh 安装技能时，如果仓库的默认分支是 `master` 而不是 `main`，会导致：

- 成功下载 SKILL.md（因为使用了正确的分支）
- 但下载完整目录时失败（因为硬编码使用了 `main` 分支）
- 最终只保存了 SKILL.md，scripts 等子目录没有被下载

**错误日志：**

```text
[fetch_github_contents] HTTP 错误: 404 - {"message":"No commit found for the ref main"...}
下载完整目录失败，使用基础内容
```

### 根本原因

在 `fetchSkillFromSkillsSh` 函数中：

1. 第 2432 行：正确调用 `resolveGitHubBranch` 解析出实际分支（如 `master`）
2. 第 2436 行：使用解析出的 `branch` 构建 raw URL（正确）
3. 第 2781 行：**硬编码使用 `'main'` 调用 `fetchSkillDirectoryContents`**（错误）

导致获取目录内容时使用了错误的分支，GitHub API 返回 404。

### 修复方案

修改 `src/utils/skillUtils.ts` 第 2781 行：

```typescript
// 修复前（错误）
const fileList = await fetchSkillDirectoryContents(owner, repo, skillPath || '', 'main');

// 修复后（正确）
const fileList = await fetchSkillDirectoryContents(owner, repo, skillPath || '', branch);
```

### 测试用例 (v3.0.29)

| 用例ID | 场景 | 输入 | 预期结果 |
| ------ | ---- | ---- | -------- |
| TC-SKILL-029-001 | master 分支仓库下载完整目录 | 仓库默认分支为 master，包含 scripts 目录 | 正确下载所有文件，包括 scripts 目录 |
| TC-SKILL-029-002 | main 分支仓库下载完整目录 | 仓库默认分支为 main，包含 scripts 目录 | 正确下载所有文件，包括 scripts 目录 |
| TC-SKILL-029-003 | 分支解析失败回退 | GitHub API 限流，无法获取默认分支 | 使用 main 作为回退分支 |

### 测试结果

- ✅ SK-269a: 根目录技能使用空字符串路径时正确获取 scripts 目录
- ✅ 所有 fetchSkillDirectoryContents 相关测试通过
- ✅ TC-SKILL-029-001: master 分支仓库下载完整目录
- ✅ TC-SKILL-029-002: main 分支仓库下载完整目录
- ✅ TC-SKILL-029-003: 分支解析失败回退

### 影响范围

- 修复了所有使用 `master` 分支的仓库（如 `freestylefly/xiaohongshu-skills`）
- 不影响使用 `main` 分支的仓库
- 不影响其他安装方式（URL 安装等）

---

## v3.0.26 (2026-03-06) - 技能根目录识别逻辑优化

### 问题描述

**问题1：技能名称不匹配**
当从 skills.sh 安装技能时，如果指定的 `skillId` 在仓库中不存在（例如仓库名为 `xiaohongshu-skills`，但实际技能名为 `xhs-auth`、`xhs-content-ops` 等），系统会直接报错，用户无法知道仓库中有哪些可用技能。

**问题2：技能根目录文件路径处理不当**
当技能在子目录中（如 `skills/xhs-auth/`）时，系统会错误地去掉路径前缀，导致文件路径变成相对路径（如 `SKILL.md`、`rules/auth.md`），而不是保留技能目录内的完整结构。

### 核心原则

**只要某个目录包含 SKILL.md，这个目录就是一个技能的根目录，应该下载该目录下的所有文件，并保留完整的目录结构（相对于这个技能根目录）。**

### 解决方案

**方案1：skills.sh 安装回退逻辑**

在 `fetchSkillFromSkillsSh` 函数中添加回退逻辑：

1. **第一阶段**：尝试常见路径（快速查找）
2. **第二阶段**：使用 Git Trees API 搜索整个仓库
3. **第三阶段（新增）**：如果前两阶段都找不到，回退到 URL 安装逻辑
   - 调用 `fetchSkillRegistry` 发现仓库中的所有技能
   - 如果只有一个技能，直接返回
   - 如果有多个技能，尝试按名称匹配
   - 如果没有匹配，抛出错误并列出所有可用技能

**方案2：技能根目录识别逻辑**

在 `fetchSkillDirectoryContents` 函数中添加 `isSkillRoot` 参数：

- **isSkillRoot = true**（技能根目录）：保留完整目录结构（相对于技能根目录）
  - 例如：`skills/xhs-auth/` 目录下的文件保留为 `SKILL.md`、`rules/auth.md`
- **isSkillRoot = false**（递归调用）：继续递归处理子目录
  - 例如：`rules/` 子目录下的文件拼接为 `rules/auth.md`

**判断依据**：
- 当从 `fetchSingleSkillFromPath` 或 `fetchSkillFromSkillsSh` 调用时，传入 `isSkillRoot = true`
- 递归调用子目录时，传入 `isSkillRoot = false`

### 修改文件

- `src/utils/skillUtils.ts` - `fetchSkillFromSkillsSh` 函数添加回退逻辑（第 2063-2120 行）
- `src/utils/skillUtils.ts` - `fetchSkillDirectoryContents` 函数添加 `isSkillRoot` 参数（第 2405-2483 行）

### 测试用例

| 用例ID | 场景 | 输入 | 预期结果 |
| ------ | ---- | ---- | -------- |
| TC-SKILL-026-001 | 仓库只有一个技能 | skillId 不匹配，但仓库只有一个技能 | 自动返回该技能 |
| TC-SKILL-026-002 | 仓库有多个技能，名称匹配 | skillId 部分匹配某个技能名称 | 返回匹配的技能 |
| TC-SKILL-026-003 | 仓库有多个技能，无匹配 | skillId 完全不匹配 | 抛出错误，列出所有可用技能 |
| TC-SKILL-026-004 | 技能在子目录 | 技能在 skills/xhs-auth/ 目录 | 保留完整结构：SKILL.md, rules/auth.md |
| TC-SKILL-026-005 | 技能有多层子目录 | 技能包含 rules/auth/ 子目录 | 保留完整结构：rules/auth/validation.md |

### 示例

**场景1：技能名称不匹配**

从 skills.sh 安装 `autoclaw-cc/xiaohongshu-skills` 仓库的 `xiaohongshu-skills` 技能

**之前的行为**：

```text
错误：在仓库 autoclaw-cc/xiaohongshu-skills 中未找到技能 xiaohongshu-skills
```

**现在的行为**：

```text
错误：在仓库 autoclaw-cc/xiaohongshu-skills 中未找到技能 "xiaohongshu-skills"。
该仓库包含以下 5 个技能：xhs-auth, xhs-content-ops, xhs-explore, xhs-interact, xhs-publish
请使用正确的技能名称重新安装。
```

**场景2：技能根目录文件结构**

仓库结构：
```
xiaohongshu-skills/
├── skills/
│   ├── xhs-auth/
│   │   ├── SKILL.md
│   │   └── rules/
│   │       └── auth.md
```

安装 `xhs-auth` 后的文件路径：
```
SKILL.md
rules/auth.md
```

所有子目录（`rules/`、`scripts/` 等）都会被正确下载和保留。

### 优势

1. **更好的用户体验**：用户可以立即知道仓库中有哪些可用技能
2. **减少试错成本**：不需要手动去 GitHub 查看仓库结构
3. **与 URL 安装一致**：两种安装方式的行为更加统一
4. **智能匹配**：如果仓库只有一个技能，自动安装，无需精确匹配名称
5. **完整目录结构**：保留技能目录内的所有子目录和文件

- [ ] 一键复制安装命令
- [ ] 检查更新功能（对比仓库最新版本）
- [ ] 一键升级功能
