# Chat 对话模块

## 📋 模块概述

Chat模块是MobausStudio的核心功能，提供与多种AI模型的对话交互能力。

| 属性 | 值 |
|------|------|
| 模块路径 | `src/components/features/Chat` |
| 存储服务 | `src/services/storage.ts` |
| Rust命令 | `src-tauri/src/lib.rs` |
| 创建日期 | 2025-01-18 |
| 最后更新 | 2026-03-06 |

---

## 📝 版本记录

| 版本 | 日期 | 修改内容 |
|------|------|---------|
| v4.2.8 | 2026-03-13 | 修复圆桌流式 `new Promise(async ...)` 反模式，避免 listen/前置异步抛错时 Promise 永不 reject 导致调用方挂死 |
| v4.2.4 | 2026-03-06 | 图片点击放大改为应用内模态框预览（修复 Tauri 环境 window.open 问题） |
| v4.2.3 | 2026-03-06 | 修复 ContextMenu 导致的 HTML 嵌套错误（div 不能在 p 中） |
| v4.2.2 | 2026-01-27 | 工具结果支持图片渲染（base64 图片） |

---

## 🎯 功能列表

### 核心功能

- [x] 对话列表展示与管理
- [x] 新建/删除对话
- [x] 对话搜索与过滤
- [x] 收藏对话功能
- [x] 多模型选择与切换
- [x] **Agent 选择与切换** (v2.1.0)
  - 选择 Agent 时自动使用 Agent 配置的模型
  - 未选择 Agent 时显示模型选择器
- [x] **真实 AI 消息发送与接收**
- [x] 流式响应显示 (打字机效果)
- [x] 消息历史持久化
- [x] **独立会话生成状态** (每个对话独立的 isGenerating)
- [x] **对话列表右键菜单** (删除、重命名、收藏、复制对话)

### 扩展功能

- [x] **对话持久化**
  - [x] 自动保存对话记录到 JSON (debounced)
  - [x] 启动时加载历史对话
  - [x] **默认选择最近对话** (v1.5.0)
  - [x] **对话选中状态持久化** (v2.7.0) - 窗口切换/重启后保持选中状态
- [x] **用户体验优化**
  - [x] 智能滚动 (Smart Scroll) - 仅在底部时自动跟随
  - [x] 计时器显示优化 (移至消息气泡下方)
  - [x] 多模态错误自动恢复 (清理不支持的附件)
  - [x] **新建对话自动切换** (v1.5.0)
  - [x] **输出流畅度优化** (RAF 批量更新) (v1.5.0)
  - [x] **思考过程默认展开 + 5行限高 + 自动滚动** (v1.5.0)
- [x] 消息复制 (右键菜单)
- [x] **对话管理右键菜单** (重命名、删除、收藏) (v1.5.0)
- [ ] 消息重发
- [ ] 消息编辑
- [x] 附件上传 (拖拽 + 粘贴)
- [ ] 语音输入

---

## 🏗️ 组件结构

```
Chat/
├── index.tsx              # 模块入口 (ChatPage)
├── ChatWindow.tsx         # 聊天窗口 (含消息和输入)
├── MessageBubble.tsx      # 消息气泡 (Markdown渲染 + 右键菜单)
├── AttachmentUpload.tsx   # 附件上传组件
├── ToolCallDisplay.tsx    # MCP 工具调用显示组件 (v2.3.0)
└── types.ts               # 类型定义 (引用全局 types)
```

**依赖组件**:
- `src/components/common/ContextMenu.tsx` - 右键菜单组件
- `src/components/common/markdown/` - 共享 Markdown 渲染组件 (v3.5.0)

---

## 📐 数据结构

### Chat 对话

```typescript
interface Chat {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  starred: boolean;
  model: string;           // 使用的模型 ID
  messages: Message[];
  // v2.3.0: Agent 选择持久化
  agentId?: string | null; // 关联的 Agent ID，null 表示直接对话
}
```

### Message 消息

```typescript
interface Message {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  tokens?: number;

  // 思考模式：AI 的推理过程
  reasoningContent?: string;

  // 多模态：附件列表
  attachments?: Attachment[];

  // v2.3.0: MCP 工具调用
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

// 附件类型
interface Attachment {
  id: string;
  type: 'image' | 'video' | 'file';
  name: string;
  url: string;           // data:base64 或文件路径
  mimeType: string;
  size: number;          // 字节数
}

// v2.3.0: 工具调用类型
interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  serverId: string;
  serverName: string;
}

// v2.3.0: 工具结果类型
interface ToolResult {
  callId: string;
  content: string;
  isError: boolean;
  duration?: number;
}
```

### ChatRequest 请求

```typescript
interface ChatRequest {
  model_id: string;        // 模型配置 ID
  messages: Array<{
    role: string;
    content: string;
  }>;
}
```

### ChatResponse 响应

```typescript
interface ChatResponse {
  success: boolean;
  content: string;         // AI 回复内容
  tokens_used?: number;
  error?: string;
}
```

---

## 📐 API 接口

### Tauri 命令

#### `chat_send_message`
发送消息到 AI 模型并获取响应

```rust
#[tauri::command]
async fn chat_send_message(
    model_id: String,
    messages: Vec<ChatMessage>,
    api_key: String,
    endpoint: Option<String>,
) -> Result<ChatResponse, String>
```

**实现逻辑**：
1. 根据 model_id 确定提供商类型
2. **获取 API 模型名称**：优先使用 `modelId`（接入点 ID），其次使用 `name`
3. 构建对应的 API 请求 (OpenAI/Anthropic/Custom)
4. 发送 HTTP 请求并解析响应
5. 返回 AI 回复内容

> **注意**：自定义提供商（如火山引擎）可配置独立的 `modelId` 字段，API 调用时将使用该值而非显示名称。

#### `save_chats`
保存对话列表到本地

```rust
#[tauri::command]
async fn save_chats(chats: Vec<Chat>) -> Result<(), String>
```

#### `load_chats`
加载对话列表

```rust
#[tauri::command]
async fn load_chats() -> Result<Vec<Chat>, String>
```

#### `chat_stream_message` (New)
流式发送消息，通过 Tauri 事件返回结果 (Server-Sent Events 风格)

```rust
#[tauri::command]
async fn chat_stream_message(window: Window, request: ChatSendRequest) -> Result<(), String>
```

**事件协议 (`chat-event`)**:
后端通过 `window.emit("chat-event", payload)` 发送事件。

Payload 结构:
```typescript
interface ChatStreamEvent {
  id: string; // 消息 ID
  event: 'chunk' | 'reasoning_chunk' | 'done' | 'error';
  content?: string; // 文本内容片段 / 思考内容片段
  error?: string;
  usage?: { total_tokens: number };
}
```

---

## 🧪 测试用例

| 测试场景 | 输入 | 期望输出 | 状态 |
|---------|------|---------|------|
| 渲染对话列表 | 模拟数据 | 正确显示列表 | [x] |
| 新建对话 | 点击新建按钮 | 创建新对话 | [x] |
| 切换对话 | 点击对话项 | 显示对应消息 | [x] |
| 搜索对话 | 输入关键词 | 过滤对话列表 | [x] |
| 空模型处理 | 无模型 | 显示提示文案 | [x] |
| 模型自动选择 | 有模型 | 自动选中第一个 | [x] |
| **发送消息 (流式)** | 输入并发送 | 收到 chunk 事件，UI 实时打字机效果 | [x] |
| **思考内容流式** | 发送需推理消息 | 收到 reasoning_chunk，思考区域实时更新 | [x] |
| **计时器** | 点击发送 | 计时器开始，Done 事件后停止 | [x] |
| **粘贴上传** | 粘贴图片到输入框 | 识别剪贴板内容并创建附件预览 | [x] |
| **拖拽上传** | 拖拽文件到窗口 | 识别文件并创建附件预览 | [x] |
| **AI 响应显示** | API 返回 | 消息列表显示回复 | [x] |
| **API 错误处理** | 无效 key | 显示错误通知 | [x] |
| **对话持久化** | 添加消息 | 重启后数据保留 | [x] |
| **右键复制** (新) | 右键点击消息气泡 | 弹出菜单，支持复制内容/思考过程/全部 | [x] |

### 🔧 圆桌流式 Promise 修复测试用例 (v4.2.8)

| 用例ID | 测试场景 | 输入 | 预期结果 | 状态 |
|--------|---------|------|---------|------|
| TC-RT-PROMISE-001 | listen 抛错时 Promise 正确 reject | listen() 调用失败 | 外层 Promise reject，不会挂死 | [ ] |
| TC-RT-PROMISE-002 | 正常流式完成 | 正常 done 事件 | Promise resolve，unlisten 清理 | [ ] |
| TC-RT-PROMISE-003 | 错误事件处理 | error 事件 | Promise reject，unlisten 清理 | [ ] |

### 🤔 思考模式测试用例

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| TH-01 | **思考内容渲染** | 包含 `reasoningContent` 的消息 | 显示"思考过程"折叠区域，点击可展开 | [x] |
| TH-02 | **普通内容渲染** | 不含 `reasoningContent` 的消息 | 不显示"思考过程"折叠区域 | [x] |
| TH-03 | **思考过程折叠** | 点击折叠按钮 | 切换思考内容的显示/隐藏状态 | [x] |
| TH-04 | **思考内容 API 解析** | API 返回 `reasoning_content` | 后端正确提取并存入 Message 对象 | [x] |
| TH-05 | **流式思考更新** | 接收 `reasoning_chunk` 事件 | 思考内容实时追加，不影响主回复 | [x] |

### 🎯 用户体验优化测试用例 (v4.2.2)

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| UX-10 | **启动时默认选择** | 打开应用 | 自动选中最新更新的对话 | [x] |
| UX-11 | **智能滚动跟随** | AI 生成消息时用户在底部 | 自动滚动到最新消息 | [x] |
| UX-12 | **智能滚动不跟随** | AI 生成消息时用户上翻查看历史 | 不自动滚动，保持当前位置 | [x] |
| UX-13 | **打字机效果流畅度** | AI 流式生成长文本 | 文字流畅显示，无卡顿感 | [x] |
| UX-14 | **滚动灵敏度** | 用户滚动到距底部 5px | 识别为在底部，开启自动跟随 | [x] |

### 🖼️ 多模态测试用例 (Updated)

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MM-01 | **图片上传** | 选择/拖拽小于 10MB 图片 | 显示图片预览，Base64 转换成功 | [x] |
| MM-02 | **视频上传** | 选择/拖拽小于 10MB 视频 | 显示视频预览 (带播放图标) | [x] |
| MM-03 | **文件超限** | 选择 > 10MB 文件 | 控制台警告，不添加附件 | [x] |
| MM-04 | **附件删除** | 点击预览图删除按钮 | 附件从列表移除 | [x] |
| MM-05 | **多模态消息渲染** | 包含附件的消息 | 消息气泡内显示图片/视频缩略图 | [x] |
| MM-06 | **API 消息构建** | 发送带图片消息 | `ChatWindow` 传递 `attachments`，`App` 构建 `content` 数组 (`text` + `image_url`) | [x] |
| MM-07 | **粘贴图片** | 在输入框粘贴截图 |自动识别并添加到附件列表 | [x] |
| MM-08 | **拖拽文件** | 拖拽文件到聊天区域 | 自动识别并添加到附件列表 | [x] |
| MM-09 | **图片点击放大** | 点击消息中的图片 | 在新窗口打开原图 | [x] |
| MM-10 | **图片右键下载** | 右键点击消息中的图片 | 显示下载选项，点击后下载图片到本地 | [ ] |
| MM-11 | **OpenAI 多模态** | 发送图片到 OpenAI 模型 | 直接透传 `image_url` 格式，正常工作 | [x] |
| MM-12 | **Anthropic 多模态 (data URL)** | 发送 data URL 图片到 Anthropic | 转换为 Anthropic `image` 格式（base64 source） | [x] |
| MM-12b | **Anthropic 多模态 (HTTP URL)** | 发送 HTTP(S) URL 图片到 Anthropic | 转换为 Anthropic `image` 格式（url source） | [x] |
| MM-13 | **Google 多模态 (data URL)** | 发送 data URL 图片到 Google | 转换为 Gemini `inlineData` 格式 | [x] |
| MM-13b | **Google 多模态 (HTTP URL)** | 发送 HTTP(S) URL 图片到 Google | 添加占位符文本 `[图片: url]`，防止消息被吞掉 | [x] |
| MM-14 | **不支持模型提示** | 发送图片到不支持多模态的模型 | 显示友好提示，自动移除附件 | [ ] |
| UX-01 | **独立输入框** | 切换对话 | 输入框内容自动清空，不串场 | [x] |
| UX-02 | **停止生成** | 生成过程中点击停止按钮 | 立即停止流式接收，UI 状态恢复为发送 | [x] |
| UX-03 | **右键复制** | 右键点击消息气泡 | 弹出菜单支持复制内容/思考过程/全部 | [x] |
| UX-04 | **布局适配** |发送长代码或长文本 | 消息气泡自动换行，仅代码块内部可横向滚动，窗口无全局横向滚动 | [x] |
| PERF-01 | **打字性能** | 输入长文本 | 输入流畅，无卡顿 (优化重渲染和持久化频率) | [x] |
| TH-06 | **思考过程默认展开** | 收到 reasoning_content | 思考过程区域默认展开，内容自动滚动到底部 | [x] |
| TH-07 | **思考过程高度限制** | 长思考内容 | 思考过程区域限高 120px，超出后可滚动 | [x] |
| TH-08 | **思考过程样式** | 渲染思考过程 | 使用 amber 色系背景 + 斜体字体区分 | [x] |

### 🗂️ 对话管理测试用例 (v1.5.0)

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| CM-01 | **默认选择对话** | 启动应用/刷新页面 | 自动选中最近更新的对话 | [x] |
| CM-02 | **新建对话切换** | 点击新建按钮 | 创建新对话并自动切换到该对话 | [x] |
| CM-03 | **对话右键菜单** | 右键点击对话列表项 | 弹出菜单(重命名/收藏/复制/删除) | [x] |
| CM-04 | **重命名对话** | 右键→重命名→输入新标题→保存 | 对话标题更新，updatedAt 更新 | [x] |
| CM-05 | **删除对话确认** | 右键→删除 | 弹出确认对话框，确认后删除 | [x] |
| CM-06 | **删除后自动选择** | 删除当前选中的对话 | 自动选择其他对话(最近更新) | [x] |
| CM-07 | **收藏/取消收藏** | 右键→收藏 | 对话 starred 状态切换，图标变化 | [x] |
| CM-08 | **复制对话内容** | 右键→复制对话 | 全部消息复制到剪贴板 | [x] |
| CM-09 | **空对话复制禁用** | 右键空对话→复制 | 复制选项显示禁用状态 | [x] |
| CM-10 | **对话选中状态持久化** | 选中对话后切换窗口再切回 | 保持之前选中的对话，不跳转到最新对话 | [x] |
| CM-11 | **对话选中状态重启持久化** | 选中对话后重启应用 | 恢复之前选中的对话 | [x] |
| CM-12 | **选中对话被删除后回退** | 删除 localStorage 中记录的对话 | 自动选择最近更新的对话 | [x] |

### ⚡ 性能优化测试用例 (v1.5.0)

| ID | 测试场景 | 输入 | 预期结果 |
|----|---------|------|---------|
| PERF-02 | **RAF 批量更新** | 接收大量流式 chunk | 使用 requestAnimationFrame 批量更新，帧率稳定 |
| PERF-03 | **RAF 清理** | 停止生成/切换对话 | cancelAnimationFrame 正确清理，无内存泄漏 |
| PERF-04 | **独立监听器管理** | 多对话同时生成 | 每个对话独立 unlisten，互不干扰 |
| PERF-05 | **页面切换性能** | 从其他页面切换到 Chat | 切换流畅无卡顿（useMemo + React.memo 优化） |
| PERF-06 | **工具数量计算缓存** | 选中带 MCP 的 Agent | toolCount 使用 useMemo 缓存，避免重复计算 |
| PERF-07 | **映射表查找优化** | 渲染对话列表 | 使用 Map 预计算 Agent/Model 映射，O(1) 查找 |
| PERF-08 | **消息懒加载** | 切换到消息多的对话 | 初始只渲染最新 20 条，无闪烁 |
| PERF-09 | **滚动加载更多** | 滚动到顶部 | 自动加载更多历史消息，保持滚动位置 |
| PERF-10 | **Markdown 静态配置** | 渲染含 Markdown 的消息 | 使用静态 components/remarkPlugins，避免重复解析 |
| PERF-11 | **代码块懒加载高亮** | 切换到含代码的对话 | 视口外代码块显示纯文本，进入视口后才高亮 |

### 🤖 Agent/模型选择测试用例 (v2.1.0)

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| AM-01 | **无 Agent 时显示模型选择器** | agents=[] 或未选择 Agent | 显示模型下拉框，隐藏 Agent 选择器 | [ ] |
| AM-02 | **有 Agent 时显示 Agent 选择器** | agents 列表非空 | 显示 Agent 下拉框 | [ ] |
| AM-03 | **选择 Agent 后隐藏模型选择器** | 选中某个 Agent | 模型选择器隐藏或禁用，显示 Agent 的模型名称 | [ ] |
| AM-04 | **选择"无 Agent"后显示模型选择器** | 选择"直接对话"选项 | 模型选择器重新显示 | [ ] |
| AM-05 | **Agent 携带模型信息** | 选中 Agent | 发送消息时使用 Agent.model | [ ] |
| AM-06 | **无 Agent 时使用选中模型** | 未选择 Agent | 发送消息时使用 selectedModel | [ ] |
| AM-07 | **Agent 工具数量显示** | 选中启用工具的 Agent | 显示可用工具数量徽章 | [ ] |
| AM-08 | **Agent 切换保留对话** | 切换 Agent | 对话内容保留，不清空 | [ ] |
| AM-09 | **Agent 选择持久化** | 选择 Agent 后切换模块再返回 | Agent 选择保留不变 | [x] |
| AM-10 | **Agent 选择重启持久化** | 选择 Agent 后重启应用 | Agent 选择从 chats.json 恢复 | [x] |
| AM-11 | **侧边栏显示 Agent 名称** | 对话关联了 Agent | 侧边栏显示 🤖 Agent 名称标签 | [x] |
| AM-12 | **侧边栏显示真实模型名称** | 对话无 Agent | 侧边栏显示模型真实名称（非 ID） | [x] |
| AM-13 | **新建对话使用默认模型** | 点击新建对话 | 使用第一个可用模型 ID，非硬编码 | [x] |
| AM-14 | **模型选择持久化** | 选择模型后切换模块再返回 | 模型选择保留不变 | [x] |
| AM-15 | **模型选择重启持久化** | 选择模型后重启应用 | 模型选择从 localStorage 恢复 | [x] |
| AM-16 | **选中模型被删除后回退** | 删除 localStorage 中记录的模型 | 自动选择第一个可用模型 | [x] |

### 🔍 可用模型筛选测试用例 (v3.6.0)

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| MF-01 | **模型选择器仅显示可用模型** | models 包含 online/offline/error 状态 | 仅显示 status='online' 的模型 | [ ] |
| MF-02 | **无可用模型提示** | 所有模型 status!='online' | 显示"请先配置可用模型"提示 | [ ] |
| MF-03 | **可用模型为空时禁用发送** | 无可用模型 | 发送按钮禁用 | [ ] |
| MF-04 | **选中模型变为不可用** | 当前选中模型 status 变为 error | 自动切换到第一个可用模型 | [ ] |
| MF-05 | **新建对话使用可用模型** | 点击新建对话 | 使用第一个可用模型，而非第一个模型 | [ ] |

### 测试文件

- `src/test/components/Chat/Chat.test.tsx`
- `src-tauri/src/lib.rs` (Rust 内置测试)

---

## 📝 修改历史

| 日期 | 版本 | 修改人 | 修改内容 |
|------|------|--------|---------|
| 2025-01-18 | 1.0.0 | - | 初始版本 |
| 2025-01-18 | 1.1.0 | - | 修复模型列表空状态显示 |
| 2025-01-18 | 1.2.0 | - | 添加真实 AI 调用接口定义 |
| 2025-01-19 | 1.3.0 | - | 性能优化(Memoization)与流式状态修复 |
| 2025-01-19 | 1.3.1 | - | 修复消息气泡布局溢出问题(UX-04) |
| 2025-01-19 | 1.4.0 | - | 独立会话生成状态 + 右键菜单复制 + 思考过程 UI 优化 |
| 2025-01-19 | 1.5.0 | - | 输出流畅度优化(RAF) + 默认对话选择 + 新建切换 + 对话列表右键菜单 |
| 2025-01-20 | 2.1.0 | - | Agent/模型选择器互斥逻辑 + MCP 工具调用集成 |
| 2025-01-20 | 2.3.0 | - | Agent 工具调用功能：后端 tools 参数支持 + 工具执行循环 |
| 2025-01-27 | 2.4.0 | - | 性能优化：useMemo 缓存计算、预计算映射表、React.memo 包装组件 |
| 2025-01-27 | 2.5.0 | - | 消息懒加载：初始只渲染最新消息，滚动到顶部时加载更多历史 |
| 2025-01-27 | 2.6.0 | - | Markdown/代码渲染优化：静态配置提取、代码块懒加载语法高亮 |
| 2025-01-27 | 2.7.0 | - | 对话选中状态持久化：使用 localStorage 保存 selectedChatId |
| 2025-01-27 | 2.8.0 | - | 模型选择状态持久化：使用 localStorage 保存 selectedModel，修复切换模块后模型选择丢失问题 |
| 2025-01-27 | 3.6.0 | - | 可用模型筛选：模型选择器仅显示 status='online' 的模型，确保用户只能选择已验证可用的模型 |
| 2026-02-27 | 4.1.24 | - | MCP 工具调用循环：工具执行结果自动回传模型继续对话，支持多轮工具调用；工具执行等待状态提示 |
| 2026-02-27 | 4.1.25 | - | 修复 MCP 工具循环调用竞态条件：将 done 事件中的 setTimeout 回传改为 invoke 后同步循环，解决 finally 提前清理 listener 导致后续轮次无法接收事件的问题；使用 Promise 同步机制解决 tool_calls 异步处理与 done 事件的时序问题 |
| 2026-02-27 | 4.1.26 | - | 修复 Google Gemini 工具续传消息格式：Rust 后端 contents 转换增加 tool/tool_calls 消息处理，转为 Gemini 原生 functionCall/functionResponse 格式，解决续传时 400 Bad Request 错误 |
| 2026-02-27 | 4.1.27 | - | 修复多工具调用失败：1) 工具续传不再添加多余的 user 消息，避免 Gemini 连续 user 角色冲突；2) Rust 后端合并连续 user 消息防止 Gemini API 400 错误；3) 前端 tool_calls 处理器支持同一响应中的多个并行工具调用 |
| 2026-02-27 | 4.1.28 | - | 修复 Anthropic 工具续传消息格式：Rust 后端 chat_stream_anthropic 消息转换增加 tool_calls/tool 消息处理，assistant 带 tool_calls 转为 Anthropic tool_use content block，tool 角色消息转为 user 角色 tool_result content block，解决续传时 `tool_use.id: Field required` 400 错误 |
| 2026-02-27 | 4.1.29 | - | 修复 Cloud Code API Claude 模型工具续传：在 chat_stream_google 的 functionCall/functionResponse 转换中保留 tool call id 字段，Cloud Code API 代理 Claude 时需要 id 映射 Anthropic tool_use.id，标准 Gemini 忽略多余字段不受影响 |
| 2026-02-27 | 4.1.30 | - | 修复 Kiro IDC 认证用户测试连接 403 错误：IDC 用户的 GetUsageLimits API 权限受限返回 403，但实际聊天 API 可正常使用，现 IDC + 403 视为连接成功 |
| 2026-02-27 | 4.1.31 | - | 修复 Kiro 对话 403 错误：1) IDC 用户不传递 profileArn 到 generateAssistantResponse（避免权限冲突）；2) 403 + profileArn 时自动移除 profileArn 重试；3) IDC 用户根据 ssoRegion 动态选择 q.{region}.amazonaws.com 端点区域（根本原因：API 端点硬编码 us-east-1，但 IDC 用户可能在其他区域）；注意 CodeWhisperer 端点（GetUsageLimits/ListAvailableModels）始终使用 us-east-1，仅 generateAssistantResponse 按区域部署；前端 api_key 格式升级为 4 字段：`accessToken\|profileArn\|authMethod\|ssoRegion` |
| 2026-02-27 | 4.1.32 | - | ~~确认 IDC + 403 workaround~~（已在 v4.1.33 修正） |
| 2026-02-27 | 4.1.33 | - | 修复 IDC 用户 CodeWhisperer 端点：codewhisperer.{region} 域名只在 us-east-1 存在，IDC 用户改用 q.{ssoRegion}.amazonaws.com 端点（与 chat_stream_kiro 一致）；影响 test_kiro/kiro_list_models/kiro_get_quota 三个函数；移除 IDC + 403 workaround |
| 2026-02-27 | 4.1.34 | - | 修复 Kiro 多轮工具调用续传 400 错误：1) 历史中的 tool 角色消息包装成 userInputMessage + toolResults 格式；2) 清理 history 确保 userInputMessage/assistantResponseMessage 严格交替，连续 assistant 消息间插入占位 user 消息，连续 user 消息合并内容 |
| 2026-02-27 | 4.1.35 | - | 修复 Cloud Code API 两个问题：1) tool_use 没有对应 tool_result 导致 400 错误（工具调用被中断时自动补充占位 tool_result/functionResponse）；2) prompt 超过 200k token 限制（添加消息截断，粗略估算 token 数从头部截断旧消息，保留最近对话）；3) Gemini functionCall 必须紧跟 user/functionResponse（合并连续同角色消息，截断后确保以 user 消息开头） |
| 2026-02-27 | 4.1.36 | - | Gemini 2.5 thinking 模型 thought_signature 全链路支持 + Kiro 消息截断：1) 后端捕获 Gemini 响应中的 thoughtSignature 并通过 tool_calls 事件传递到前端；2) 前端 ToolCall 类型新增 thoughtSignature 字段，tool_calls 处理器保存该字段；3) buildApiMessages 将 thoughtSignature 回传后端；4) 后端 Google 消息转换重建 functionCall 时恢复 thoughtSignature；5) Kiro API build_kiro_request_body 添加消息截断防止 "Input is too long" 错误 |
| 2026-02-28 | 4.1.38 | - | Token 消耗优化（v2）：滑动窗口从 100 条调整为 50 条，更激进的成本节省；添加可选参数支持自定义窗口大小；确保工具调用完整性；预期效果：50 轮内无影响，100 轮后节省 50% token，500 轮对话从 12.5M tokens 降到 252.5k tokens（相比 v1 再省 50%） |
| 2026-03-04 | 4.2.0 | - | MCP 工具调用限制增强：多维度精准限制（maxToolsPerCall/maxTotalToolCalls/toolCallTimeout/maxExecutionTime），达到限制时显示用户提示，Promise.race 超时控制 |
| 2026-03-06 | 4.2.1 | - | 图片点击放大和下载功能：ImageRenderer 支持点击在新窗口打开原图，右键菜单提供下载选项，支持 data URL 和普通 URL 下载 |
| 2026-03-06 | 4.2.2 | - | 用户体验优化：1) 优化智能滚动，提高跟随灵敏度（阈值从50px降至10px）；2) 优化打字机效果流畅度，使用 setTimeout 替代 RAF，固定 16ms 间隔更新，消除卡顿感；3) 保持对话选中状态持久化，窗口切换或重启后恢复上次选中的对话 |
| 2026-03-06 | 4.2.3 | - | 修复图片点击放大功能：在 ImageRenderer 中添加 stopPropagation 阻止事件冒泡，确保点击事件不被 ContextMenu 拦截，MCP 工具框和消息气泡中的图片均可正常点击放大 |
| 2026-03-10 | 4.2.5 | - | 多模态格式转换修复：1) Anthropic streaming 路径支持多模态，转换 OpenAI `image_url` 为 Anthropic `image` 格式（base64 source 或 url source）；2) Google streaming 路径支持多模态，转换为 Gemini `inlineData` 格式（仅 base64），HTTP(S) URL 添加占位符文本 `[图片: url]` 防止消息被吞掉；3) Chat Completions API 路径自动过滤多模态内容，将图片转换为文本占位符，避免不支持多模态的模型报 400 错误；4) 添加 `extract_base64_image` 辅助函数提取 data URL 中的 MIME type 和 base64 数据；5) 添加 `is_http_url` 辅助函数检测 HTTP(S) URL；6) 前端添加多模态支持检测，发送前提示用户模型不支持多模态；7) AIModel 类型新增 `supportsMultimodal` 字段，自动判断模型是否支持多模态（OpenAI gpt-4o/gpt-4-turbo、Anthropic claude-3+、Google gemini 系列）；修复所有模型上传图片/附件 400 错误问题 |

---

### 🔧 独立会话生成状态架构 (v1.4.0)

#### 问题背景
*   **原有设计**: 全局单一 `isGenerating` 状态，导致多对话场景下状态冲突。
*   **新架构**: 使用 `generatingChatIds: Set<string>` 管理每个对话的独立生成状态。

#### 核心实现
```typescript
// App.tsx
const [generatingChatIds, setGeneratingChatIds] = useState<Set<string>>(new Set());
const isGenerating = useCallback((chatId: string) => generatingChatIds.has(chatId), [generatingChatIds]);
const setGenerating = useCallback((chatId: string, value: boolean) => { ... }, []);

// 监听器也按 chatId 独立管理
const unlistenMapRef = useRef<Map<string, UnlistenFn>>(new Map());
```

#### 接口变更
| 组件 | 旧接口 | 新接口 |
|------|---------|--------|
| `ChatPage` | `isGenerating?: boolean` | `isGenerating: (chatId: string) => boolean` |
| `ChatPage` | `onStopGenerating: () => void` | `onStopGenerating: (chatId: string) => void` |

---

### 🔧 右键菜单复制功能 (v1.4.0)

#### 实现方案
*   集成 `ContextMenu` 通用组件 (`src/components/common/ContextMenu.tsx`)
*   `MessageBubble` 中为消息内容和思考过程分别配置右键菜单

#### 菜单选项
| ID | 标签 | 图标 | 说明 |
|----|------|------|------|
| `copy-content` | 复制内容 | `Clipboard` | 复制 Markdown 原文 |
| `copy-thinking` | 复制思考过程 | `Brain` | 仅有 reasoningContent 时显示 |
| `copy-all` | 复制全部 | `MessageSquare` | 复制思考+回复 |

#### 复制反馈
*   复制成功后显示固定在屏幕顶部的 Toast 提示，1.5秒后自动消失

### 🔧 布局溢出修复 (v1.3.1)

#### 问题描述 (UX-04)
*   **现象**: 长文本、长代码块或表格内容超出消息气泡边界，导致无法完整查看后续内容。
*   **根因**: Flex 布局下，子元素未设置 `min-width: 0` 导致内容撑破容器；内容区域缺少 `overflow` 控制。

#### 修复方案
1. **外层容器**: 添加 `min-w-0 overflow-hidden` 防止 flex 子项撑破
2. **消息气泡**: 添加 `overflow-hidden` 确保内容不超出圆角边界
3. **思考过程区域**: 添加 `overflow-hidden` 防止内容溢出
4. **代码块**: 确保 `overflow-x-auto` 和 `max-w-full` 正确应用

### 🔧 性能优化与缺陷修复 (v1.3.0)

#### 1. 消息渲染性能 (PERF-01)
*   **问题**: 流式生成时频繁触发 `setChats`，导致整个 `ChatWindow` 和所有 `MessageBubble` 重绘，产生严重卡顿。
*   **方案**: 对 `MessageBubble` 组件使用 `React.memo`，仅当 `message` 对象内容变更时才重渲染。

#### 2. 生成状态复位 (UX-02)
*   **问题**: 对话生成完成后，或发生错误时，`isGenerating` 状态未正确置为 `false`，导致发送按钮保持为停止状态。
*   **方案**: 在 `App.tsx` 的 `invoke` 调用结束后（finally 块或 done 事件处理中），显式调用 `setIsGenerating(false)`。

---

### 🔧 输出流畅度优化 - RAF 批量更新 (v1.5.0)

#### 问题背景
*   **现象**: 流式生成时逐字符更新 state，导致 UI 严重卡顿（每个 chunk 触发一次 React 重渲染）。
*   **根因**: 高频率 `setChats` 调用导致 React 虚拟 DOM diff 和真实 DOM 操作过于频繁。

#### 解决方案
使用 `requestAnimationFrame` (RAF) + 累积缓冲区模式，将高频 chunk 事件批量合并后统一更新：

```typescript
// App.tsx - 核心实现
const pendingContentRef = useRef<Map<string, {
  messageId: string;
  content: string;
  reasoning: string;
}>>(new Map());
const rafIdRef = useRef<Map<string, number>>(new Map());

// chunk 事件处理：累积到 ref，不直接更新 state
const handleChunk = (chatId: string, messageId: string, content: string) => {
  const pending = pendingContentRef.current.get(chatId) || { messageId, content: '', reasoning: '' };
  pending.content += content;
  pendingContentRef.current.set(chatId, pending);
  scheduleFlush(chatId);
};

// RAF 调度：每帧最多更新一次
const scheduleFlush = (chatId: string) => {
  if (rafIdRef.current.has(chatId)) return; // 已有调度，跳过
  rafIdRef.current.set(chatId, requestAnimationFrame(() => {
    flushPendingUpdates(chatId);
    rafIdRef.current.delete(chatId);
  }));
};

// 批量刷新：将累积内容一次性写入 state
const flushPendingUpdates = (chatId: string) => {
  const pending = pendingContentRef.current.get(chatId);
  if (!pending) return;
  setChats(prev => /* 更新对应消息 */);
  pendingContentRef.current.delete(chatId);
};
```

#### 清理机制
*   `done`/`error` 事件：立即 `cancelAnimationFrame` 并刷新剩余内容
*   组件卸载：清理所有 RAF ID 防止内存泄漏

---

### 🔧 默认对话选择 (v1.5.0)

#### 需求
启动应用或刷新页面时，自动选中最近更新的对话，而非显示空白窗口。

#### 实现
```typescript
// ChatPage/index.tsx
const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

React.useEffect(() => {
  // 如果当前选中的对话仍然存在，不做任何操作
  if (selectedChatId && chats.find(c => c.id === selectedChatId)) return;

  // 自动选择最近更新的对话
  if (chats.length > 0) {
    const sorted = [...chats].sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    setSelectedChatId(sorted[0].id);
  }
}, [chats, selectedChatId]);
```

#### 触发场景
1. **启动应用**: `selectedChatId` 为 null，自动选择最近对话
2. **删除当前对话**: 对话被删除后，自动切换到其他对话
3. **刷新页面**: 同启动应用

---

### 🔧 新建对话自动切换 (v1.5.0)

#### 需求
点击"新建对话"按钮后，直接切换到新创建的对话，而非保持在当前对话。

#### 实现
```typescript
// App.tsx - handleCreateChat 返回新对话 ID
const handleCreateChat = useCallback((): string => {
  const newChat: Chat = {
    id: Date.now().toString(),
    title: `新对话 ${chats.length + 1}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    starred: false,
    model: models[0]?.id || '',
    messages: [],
  };
  setChats(prev => [newChat, ...prev]);
  return newChat.id;  // 返回新对话 ID
}, [chats.length, models]);

// ChatPage/index.tsx - 新建按钮点击后自动切换
<Button onClick={() => {
  const newId = onCreateChat();
  setSelectedChatId(newId);  // 立即切换到新对话
}} icon={<Plus />}>
  {t.chat.newChat}
</Button>
```

---

### 🔧 对话列表右键菜单 (v1.5.0)

#### 功能
为对话列表项提供右键菜单，支持快速管理操作。

#### 菜单选项
| ID | 标签 (中/英) | 图标 | 操作 |
|----|-------------|------|------|
| `rename` | 重命名 / Rename | `Edit3` | 打开重命名对话框 |
| `star` | 收藏 / Add Star | `Star` / `StarOff` | 切换收藏状态 |
| `copy` | 复制对话 / Copy Chat | `Copy` | 复制全部消息到剪贴板 |
| `divider` | — | — | 分隔线 |
| `delete` | 删除 / Delete | `Trash2` | 打开删除确认对话框 |

#### 实现架构
```typescript
// ChatPage/index.tsx - ChatListItem 组件
const ChatListItem: React.FC<{
  chat: Chat;
  onDelete: () => void;
  onRename: () => void;
  onToggleStar: () => void;
  // ...
}> = ({ chat, onDelete, onRename, onToggleStar, ... }) => {
  const contextMenuItems: ContextMenuItem[] = [
    { id: 'rename', label: '重命名', icon: <Edit3 />, onClick: onRename },
    { id: 'star', label: chat.starred ? '取消收藏' : '收藏', icon: chat.starred ? <StarOff /> : <Star />, onClick: onToggleStar },
    { id: 'copy', label: '复制对话', icon: <Copy />, onClick: handleCopyChat, disabled: chat.messages.length === 0 },
    { id: 'divider', label: '', divider: true },
    { id: 'delete', label: '删除', icon: <Trash2 />, danger: true, onClick: onDelete },
  ];

  return (
    <ContextMenu items={contextMenuItems}>
      <div>{/* 对话列表项内容 */}</div>
    </ContextMenu>
  );
};
```

#### 删除确认对话框
为防止误删，删除操作需二次确认：
```tsx
<Modal isOpen={!!deleteConfirmChat} onClose={() => setDeleteConfirmChat(null)} title="删除对话">
  <p>确定要删除对话「{deleteConfirmChat?.title}」吗？此操作不可撤销。</p>
  <Button variant="secondary" onClick={() => setDeleteConfirmChat(null)}>取消</Button>
  <Button variant="danger" onClick={() => { onDeleteChat(deleteConfirmChat.id); setDeleteConfirmChat(null); }}>删除</Button>
</Modal>
```

#### 重命名对话框
```tsx
<Modal isOpen={!!renameChat} onClose={() => setRenameChat(null)} title="重命名对话">
  <input value={renameValue} onChange={e => setRenameValue(e.target.value)}
         onKeyDown={e => { if (e.key === 'Enter' && renameValue.trim()) { onRenameChat(renameChat.id, renameValue.trim()); setRenameChat(null); } }} />
  <Button variant="secondary" onClick={() => setRenameChat(null)}>取消</Button>
  <Button onClick={() => { onRenameChat(renameChat.id, renameValue.trim()); setRenameChat(null); }} disabled={!renameValue.trim()}>保存</Button>
</Modal>
```

---

### 🔧 思考过程 UI 优化 (v1.5.0)

#### 改进内容
1. **默认展开**: `useState(true)` 让思考过程默认可见
2. **高度限制**: `maxHeight: 7.5rem` (约5行) 防止过长内容占用过多空间
3. **自动滚动**: 流式生成时自动滚动到底部显示最新内容
4. **视觉区分**: 使用 amber 色系 + 斜体字体与普通回复区分

#### 样式实现
```tsx
// MessageBubble.tsx
<div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700/50">
  <button className="text-amber-700 dark:text-amber-400">
    {isReasoningExpanded ? <ChevronDown /> : <ChevronRight />}
    <span className="font-medium">思考过程</span>
  </button>

  {isReasoningExpanded && (
    <div
      ref={reasoningContentRef}
      className="text-amber-700 dark:text-amber-300 font-mono italic"
      style={{ maxHeight: '7.5rem', lineHeight: '1.5rem', overflowY: 'auto' }}
    >
      {message.reasoningContent}
    </div>
  )}
</div>
```

#### 自动滚动实现
```typescript
useEffect(() => {
  if (isReasoningExpanded && reasoningContentRef.current) {
    reasoningContentRef.current.scrollTop = reasoningContentRef.current.scrollHeight;
  }
}, [message.reasoningContent, isReasoningExpanded]);

---

### 🤖 Agent/模型选择器互斥逻辑 (v2.1.0)

#### 设计原则

**Agent 已包含模型配置**，因此选择 Agent 时不应再单独选择模型，避免冲突和混淆。

#### 选择器显示逻辑

| 状态 | 模型选择器 | Agent 选择器 | 说明 |
|------|-----------|-------------|------|
| 无可用 Agent | ✅ 显示 | ❌ 隐藏 | 直接对话模式 |
| 有 Agent 但未选择 | ✅ 显示 | ✅ 显示（选中"直接对话"） | 用户可选择是否使用 Agent |
| 已选择 Agent | ❌ 隐藏 | ✅ 显示 | 使用 Agent 配置的模型 |

#### 实现方案

```tsx
// ChatWindow.tsx
const ChatWindow: React.FC<Props> = ({
  models,
  agents,
  selectedModel,
  selectedAgentId,
  onModelChange,
  onAgentChange,
}) => {
  // 获取当前选中的 Agent
  const selectedAgent = selectedAgentId
    ? agents.find(a => a.id === selectedAgentId)
    : undefined;

  return (
    <div>
      {/* Agent 选择器 - 有 Agent 时显示 */}
      {agents.length > 0 && (
        <Select
          value={selectedAgentId || ''}
          onChange={(value) => onAgentChange(value || null)}
          options={[
            { value: '', label: '直接对话' },
            ...agents.map(a => ({ value: a.id, label: a.name }))
          ]}
        />
      )}

      {/* 模型选择器 - 仅在未选择 Agent 时显示 */}
      {!selectedAgent && (
        <Select
          value={selectedModel}
          onChange={onModelChange}
          options={models.map(m => ({ value: m.id, label: m.name }))}
        />
      )}

      {/* 选中 Agent 时显示模型信息（只读） */}
      {selectedAgent && (
        <div className="text-sm text-gray-500">
          模型: {selectedAgent.model}
        </div>
      )}
    </div>
  );
};
```

#### 发送消息时的模型选择

```tsx
// ChatPage.tsx - handleSendMessage
const handleSendMessage = (content: string, attachments: Attachment[] = []) => {
  if (selectedChatId) {
    // 优先使用 Agent 的模型，否则使用用户选择的模型
    const modelToUse = selectedAgent?.model || selectedModel;
    onSendMessage(selectedChatId, content, modelToUse, attachments, selectedAgent);
  }
};
```

---

### 🚀 页面切换性能优化 (v2.4.0)

#### 问题背景

从其他页面（如 Agent、MCP）切换到 Chat 页面时出现明显卡顿，原因：

1. **重复计算**: `ChatWindow` 中的 `toolCount` 每次渲染都重新计算
2. **数组遍历查找**: `ChatListItem` 中每个对话都遍历 `agents` 和 `models` 数组查找
3. **不必要的重渲染**: 子组件未使用 `React.memo`，父组件任何状态变化都触发全部重渲染

#### 优化方案

##### 方案 1: useMemo 缓存工具数量计算

```tsx
// ChatWindow.tsx - 优化前
const toolCount = (selectedAgent?.enableToolUse && selectedAgent?.mcpServers)
    ? selectedAgent.mcpServers.reduce((sum, config) => {
        const server = mcpServers.find(s => s.id === config.serverId);
        return sum + (server?.tools?.length || 0);
    }, 0)
    : 0;

// ChatWindow.tsx - 优化后
const toolCount = React.useMemo(() => {
    if (!selectedAgent?.enableToolUse || !selectedAgent?.mcpServers) return 0;
    return selectedAgent.mcpServers.reduce((sum, config) => {
        const server = mcpServers.find(s => s.id === config.serverId);
        return sum + (server?.tools?.length || 0);
    }, 0);
}, [selectedAgent?.id, selectedAgent?.enableToolUse, selectedAgent?.mcpServers, mcpServers]);
```

##### 方案 2: 预计算 Agent/Model 映射表

```tsx
// ChatPage/index.tsx
// 预计算映射表，避免每个 ChatListItem 都遍历数组
const agentMap = React.useMemo(() =>
    new Map(agents.map(a => [a.id, a])),
    [agents]
);

const modelMap = React.useMemo(() =>
    new Map(models.map(m => [m.id, m])),
    [models]
);

// ChatListItem 中使用 O(1) 查找
const agent = chat.agentId ? agentMap.get(chat.agentId) : null;
const model = modelMap.get(modelId);
```

##### 方案 3: React.memo 包装子组件

```tsx
// ChatWindow.tsx
export const ChatWindow = React.memo<ChatWindowProps>(({ ... }) => {
    // 组件实现
});

// ChatPage/index.tsx - ChatListItem
const ChatListItem = React.memo<ChatListItemProps>(({ ... }) => {
    // 组件实现
});
```

#### 性能提升效果

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 页面切换耗时 | ~300-500ms | <50ms |
| ChatListItem 渲染次数 | 每次父组件更新都重渲染 | 仅 props 变化时重渲染 |
| Agent/Model 查找复杂度 | O(n) 每个对话 | O(1) 映射表查找 |

---

### 🚀 消息懒加载优化 (v2.5.0)

#### 问题背景

切换到消息较多的对话时出现卡顿和内容闪烁：

1. **渲染压力大**: 一次性渲染所有消息（可能上百条）
2. **视觉闪烁**: 先渲染全部内容，再滚动到底部，用户看到内容"闪过"
3. **不必要渲染**: 用户看不到的历史消息也被渲染了

#### 解决方案

采用**反向懒加载**策略：初始只渲染最新消息，滚动到顶部时加载更多历史。

##### 核心实现

```tsx
// ChatWindow.tsx
const INITIAL_MESSAGE_COUNT = 20;  // 初始显示条数
const LOAD_MORE_COUNT = 20;        // 每次加载更多的条数
const LOAD_MORE_THRESHOLD = 100;   // 触发加载的滚动阈值（px）

// 可见消息数量状态（每个对话独立）
const [visibleCount, setVisibleCount] = useState(INITIAL_MESSAGE_COUNT);

// 切换对话时重置可见数量
useEffect(() => {
    setVisibleCount(INITIAL_MESSAGE_COUNT);
}, [chat?.id]);

// 计算可见消息（只取最后 N 条）
const visibleMessages = useMemo(() => {
    if (!chat?.messages) return [];
    const total = chat.messages.length;
    if (total <= visibleCount) return chat.messages;
    return chat.messages.slice(total - visibleCount);
}, [chat?.messages, visibleCount]);

// 是否还有更多历史消息
const hasMoreMessages = (chat?.messages.length || 0) > visibleCount;

// 滚动处理：接近顶部时加载更多
const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;

    // 接近顶部时加载更多历史消息
    if (scrollTop < LOAD_MORE_THRESHOLD && hasMoreMessages) {
        // 记录当前滚动高度，用于加载后恢复位置
        const prevScrollHeight = scrollHeight;
        setVisibleCount(prev => Math.min(
            prev + LOAD_MORE_COUNT,
            chat?.messages.length || prev
        ));
        // 加载后恢复滚动位置（保持视觉连续）
        requestAnimationFrame(() => {
            const newScrollHeight = scrollContainerRef.current?.scrollHeight || 0;
            const scrollDiff = newScrollHeight - prevScrollHeight;
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = scrollTop + scrollDiff;
            }
        });
    }

    // 底部检测（用于自动跟随）
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setShouldAutoScroll(isAtBottom);
};
```

##### 加载更多提示

```tsx
{/* 顶部加载更多提示 */}
{hasMoreMessages && (
    <div className="text-center py-2 text-sm text-gray-400">
        ↑ 向上滚动加载更多历史消息
    </div>
)}

{/* 渲染可见消息 */}
{visibleMessages.map((message) => (
    <MessageBubble key={message.id} message={message} />
))}
```

#### 性能提升效果

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 100条消息对话切换 | ~500ms + 闪烁 | <50ms，无闪烁 |
| 初始渲染消息数 | 全部 | 最多 20 条 |
| 内存占用 | 全部消息 DOM | 按需加载 DOM |

---

### 🚀 Markdown/代码渲染优化 (v2.6.0)

#### 问题背景

对话中包含代码块或 Markdown 内容时，切换对话仍有卡顿：

1. **ReactMarkdown 重复解析**: 每次渲染都创建新的 `components` 和 `remarkPlugins` 对象，导致 ReactMarkdown 重新解析
2. **代码高亮开销大**: `react-syntax-highlighter` (Prism) 的词法分析非常耗时
3. **不可见代码块也高亮**: 视口外的代码块也进行了语法高亮，浪费计算资源

#### 解决方案

##### 方案 1: 静态配置提取

将 ReactMarkdown 的配置提取为模块级静态常量，避免每次渲染创建新对象：

```tsx
// MessageBubble.tsx - 模块顶层定义

// 静态 remarkPlugins 数组
const remarkPlugins = [remarkGfm];

// 静态 components 配置
const markdownComponents = {
    code({ node, inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || '');
        const codeContent = String(children).replace(/\n$/, '');
        return !inline && match ? (
            <CodeBlock language={match[1]} value={codeContent} {...props} />
        ) : (
            <code className="bg-gray-100 dark:bg-gray-700 rounded px-1 py-0.5 text-xs font-mono" {...props}>
                {children}
            </code>
        );
    },
    a: ({ node, ...props }) => <a className="text-blue-500 hover:underline" {...props} />,
    // ... 其他元素配置
};

// 使用静态配置
<ReactMarkdown
    remarkPlugins={remarkPlugins}
    components={markdownComponents}
>
    {message.content}
</ReactMarkdown>
```

##### 方案 2: 代码块懒加载语法高亮

使用 IntersectionObserver 实现代码块懒加载，只有进入视口时才进行语法高亮：

```tsx
const CodeBlock: React.FC<{ language: string; value: string }> = ({ language, value }) => {
    const [isVisible, setIsVisible] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // 使用 IntersectionObserver 检测代码块是否进入视口
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect(); // 高亮后断开观察
                }
            },
            { rootMargin: '100px' } // 提前 100px 开始加载
        );

        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={containerRef}>
            {/* 未进入视口时显示纯文本，进入后才进行语法高亮 */}
            {isVisible ? (
                <SyntaxHighlighter language={language} style={vscDarkPlus}>
                    {value}
                </SyntaxHighlighter>
            ) : (
                <pre className="p-4 text-gray-300 font-mono text-sm">
                    {value}
                </pre>
            )}
        </div>
    );
};
```

#### 性能提升效果

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 含代码对话切换 | ~200-400ms | <50ms |
| ReactMarkdown 解析次数 | 每次渲染都解析 | 仅内容变化时解析 |
| 代码高亮时机 | 立即全部高亮 | 进入视口时按需高亮 |
| 初始渲染代码块数 | 全部 | 仅可见区域 |

---

### 🔧 对话选中状态持久化 (v2.7.0)

#### 问题背景

切换到其他窗口再切回来时，对话选中状态丢失，总是跳转到最新更新的对话：

1. **状态丢失**: `selectedChatId` 使用 `useState` 管理，仅存在于内存中
2. **用户体验差**: 用户正在查看某个历史对话，切换窗口后回来发现跳到了别的对话

#### 解决方案

使用 `localStorage` 持久化 `selectedChatId`，实现窗口切换和应用重启后保持选中状态。

##### 核心实现

```tsx
// ChatPage/index.tsx

// 存储键名常量
const SELECTED_CHAT_STORAGE_KEY = 'chat_selected_id';

// 初始化时从 localStorage 读取
const [selectedChatId, setSelectedChatId] = useState<string | null>(
    () => localStorage.getItem(SELECTED_CHAT_STORAGE_KEY)
);

// 选中变化时保存到 localStorage
useEffect(() => {
    if (selectedChatId) {
        localStorage.setItem(SELECTED_CHAT_STORAGE_KEY, selectedChatId);
    }
}, [selectedChatId]);

// 自动选择逻辑保持不变（处理对话被删除的情况）
useEffect(() => {
    // 如果当前选中的对话仍然存在，不做任何操作
    if (selectedChatId && chats.find(c => c.id === selectedChatId)) return;
    // 自动选择最近更新的对话
    if (chats.length > 0) {
        const sorted = [...chats].sort((a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        setSelectedChatId(sorted[0].id);
    }
}, [chats, selectedChatId]);
```

#### 行为说明

| 场景 | 行为 |
|------|------|
| 窗口切换后返回 | 保持之前选中的对话 |
| 应用重启 | 恢复上次选中的对话 |
| 选中的对话被删除 | 自动选择最近更新的对话 |
| localStorage 中的对话 ID 不存在 | 自动选择最近更新的对话 |
| 首次使用（无 localStorage 记录） | 自动选择最近更新的对话 |

---

### 🔧 模型选择状态持久化 (v2.8.0)

#### 问题背景

直接对话时选择的模型，在切换到其他模块（如 Agent、MCP）再切回来时会丢失，总是回到第一个模型：

1. **状态丢失**: `selectedModel` 使用 `useState` 管理，仅存在于内存中
2. **用户体验差**: 用户选择了特定模型后，切换模块再回来发现模型被重置了

#### 解决方案

将模型选择持久化到 `Chat.model` 字段中（与 Agent 选择 `Chat.agentId` 方案一致），通过 Tauri 的 `chatsStorage` 持久化到 `chats.json` 文件。

##### 核心实现

```tsx
// App.tsx - 添加 handleUpdateChatModel 回调
const handleUpdateChatModel = useCallback((chatId: string, modelId: string) => {
    setChats((prev) =>
        prev.map((c) =>
            c.id === chatId ? { ...c, model: modelId, updatedAt: new Date() } : c
        )
    );
}, []);

// ChatPage/index.tsx - 从 Chat 对象读取模型
const selectedModel = useMemo(() => {
    if (selectedChat?.model && models.find(m => m.id === selectedChat.model)) {
        return selectedChat.model;
    }
    return models[0]?.id || '';
}, [selectedChat?.model, models]);

// 模型变更时更新 Chat.model 字段
const handleModelChange = useCallback((modelId: string) => {
    if (selectedChatId && onUpdateChatModel) {
        onUpdateChatModel(selectedChatId, modelId);
    }
}, [selectedChatId, onUpdateChatModel]);
```

#### 行为说明

| 场景 | 行为 |
|------|------|
| 模块切换后返回 | 保持之前选中的模型（从 Chat.model 读取） |
| 应用重启 | 恢复上次选中的模型（从 chats.json 恢复） |
| 选中的模型被删除 | 自动选择第一个可用模型 |
| 切换对话 | 显示该对话关联的模型 |
| 新建对话 | 使用第一个可用模型 |

---

### 🔧 共享 Markdown 渲染组件 (v3.5.0)

#### 背景

为统一 Chat 和圆桌会议的消息渲染体验，将 Markdown 渲染相关组件提取为共享模块。

#### 共享组件

| 组件 | 功能 | 使用场景 |
|------|------|---------|
| `ThinkingBlock` | 思考过程折叠/展开 | MessageBubble, RoundtableMessageBubble |
| `CodeBlock` | 代码语法高亮、复制、懒加载 | Markdown 代码块渲染 |
| `ImageRenderer` | 图片懒加载、点击放大、错误处理 | Markdown 图片渲染 |
| `LinkRenderer` | 链接渲染、文件下载检测 | Markdown 链接渲染 |
| `createMarkdownComponents` | 统一 Markdown 配置工厂 | ReactMarkdown components |

#### 使用方式

```tsx
import {
  ThinkingBlock,
  createMarkdownComponents,
  parseThinkingContent,
  removeThinkingTags,
} from '../../common/markdown';

// 创建 Markdown 组件配置
const markdownComponents = createMarkdownComponents();

// 在 MessageBubble 中使用
<ThinkingBlock content={message.reasoningContent} />
<ReactMarkdown components={markdownComponents}>
  {message.content}
</ReactMarkdown>
```

#### Data URL 支持 (v4.2.1)

`react-markdown` v10 默认 `urlTransform` 只允许 `http(s)|ircs|mailto|xmpp` 协议，会过滤 `data:` URL。
MCP 工具返回的 base64 图片使用 `data:image/...;base64,...` 格式，需要自定义 `urlTransform` 放行。

```tsx
// 自定义 URL 转换：允许 data: URL（MCP 工具返回的 base64 图片）
import { defaultUrlTransform } from 'react-markdown';

const urlTransform = (url: string) => {
    if (url.startsWith('data:')) return url;
    return defaultUrlTransform(url);
};

<ReactMarkdown urlTransform={urlTransform} ...>
```

#### 详细文档

参见 `docs/components/common.md` 中的 "Markdown 共享组件模块" 章节。

---

### 🔧 MCP 工具调用显示 (v2.3.0)

#### 功能说明

当 Agent 启用 MCP 工具时，消息中会显示工具调用的详细信息。

#### 组件结构

```
ToolCallDisplay.tsx
├── ToolCallList        # 工具调用列表容器
├── ToolCallItem        # 单个工具调用项
└── ToolResultDisplay   # 工具执行结果显示
```

#### 显示内容

| 字段 | 说明 |
|------|------|
| 工具名称 | MCP 工具的名称 |
| 服务器名称 | MCP 服务器名称 |
| 参数 | JSON 格式的调用参数 |
| 执行结果 | 工具返回的内容 |
| 执行时间 | 工具执行耗时（毫秒） |
| 错误状态 | 是否执行失败 |

#### 测试用例

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
|----|---------|------|---------|------|
| TC-01 | 显示工具调用列表 | toolCalls 数组 | 显示所有工具调用 | [x] |
| TC-02 | 显示工具结果 | toolResults 数组 | 显示执行结果 | [x] |
| TC-03 | 显示错误状态 | isError=true | 红色错误样式 | [x] |
| TC-04 | 显示执行时间 | duration=123 | 显示 "123ms" | [x] |
| TC-05 | 折叠/展开参数 | 点击参数区域 | 切换显示状态 | [x] |

---

### 🔧 MCP 工具调用限制 (v0.9.0)

#### 概述

为防止工具调用失控（无限循环、资源耗尽等），对话执行循环中实现了多维度的精准限制机制。

#### 限制类型

| 限制项 | 字段 | 默认值 | 说明 |
| ------ | ---- | ------ | ---- |
| 工具调用轮数 | `maxToolCalls` | 50 轮 | 限制工具调用的轮数，一轮可能包含多个工具调用 |
| 单次调用数量 | `maxToolsPerCall` | 5 个 | 限制单次调用最多执行多少个工具，超限自动截断 |
| 总调用次数 | `maxTotalToolCalls` | 200 次 | 限制累计调用的工具总数（所有轮次的所有工具） |
| 单个工具超时 | `toolCallTimeout` | 60 秒 | 单个工具调用的最大执行时间，超时抛出错误 |
| 总执行时间 | `maxExecutionTime` | 600 秒 | 整个对话的最大执行时间，超过后停止所有工具调用 |

#### 限制检查顺序

系统按以下优先级检查：

1. **总执行时间** - 最高优先级，超限立即停止
2. **总调用次数** - 第二优先级，超限立即停止
3. **单次调用数量** - 最低优先级，只截断不停止

#### 用户提示

达到限制时向用户显示清晰的提示消息：

| 限制类型 | 提示消息 |
| -------- | -------- |
| 总执行时间超限 | `⚠️ 工具调用已停止：总执行时间超过限制（600秒）` |
| 总调用次数超限 | `⚠️ 工具调用已停止：累计调用次数超过限制（200次）` |
| 单个工具超时 | `工具调用超时（60秒）` |

#### 配置方式

在 Agent 配置中设置 `limits` 字段：

```typescript
const agent: Agent = {
  id: 'agent-1',
  name: '我的 Agent',
  limits: {
    maxToolCalls: 50,           // 最多 50 轮
    maxToolsPerCall: 5,         // 单次最多 5 个工具
    maxTotalToolCalls: 200,     // 累计最多 200 次
    toolCallTimeout: 60,        // 单个工具超时 60 秒
    maxExecutionTime: 600,      // 总执行时间 10 分钟
  }
}
```

不设置 `limits` 时使用默认值。

#### 技术实现

```typescript
// 1. 检查总执行时间
if (currentExecutionTime > maxExecutionTime) {
  // 停止并显示错误
}

// 2. 检查总调用次数
if (totalToolCallCount + requestedCount > maxTotalToolCalls) {
  // 停止并显示错误
}

// 3. 检查单次调用数量
if (requestedCount > maxToolsPerCall) {
  // 截断到 maxToolsPerCall
  toolCalls = toolCalls.slice(0, maxToolsPerCall);
}

// 4. 超时控制（Promise.race）
const result = await Promise.race([
  toolCallPromise,
  new Promise((_, reject) => setTimeout(
    () => reject(new Error(`工具调用超时（${timeout / 1000}秒）`)),
    timeout
  ))
]);
```

#### 推荐配置场景

| 场景 | maxToolCalls | maxTotalToolCalls | maxExecutionTime |
| ---- | ------------ | ----------------- | ---------------- |
| 简单查询 | 20 | 50 | 默认 |
| 复杂分析 | 100 | 500 | 1800 (30分钟) |
| 自动化任务 | 200 | 1000 | 3600 (1小时) |

#### 工具调用限制测试用例

| ID | 测试场景 | 输入 | 预期结果 | 状态 |
| -- | -------- | ---- | -------- | ---- |
| TL-01 | 默认限制值生效 | 不设置 limits | 使用默认值，允许正常调用 | [x] |
| TL-02 | 默认 maxTotalToolCalls (200) | 累计 201 次 | 拒绝执行 | [x] |
| TL-03 | 默认 maxExecutionTime (600s) | 执行 601 秒 | 拒绝执行 | [x] |
| TL-04 | 默认 maxToolsPerCall (5) | 单次请求 10 个 | 截断到 5 个 | [x] |
| TL-05 | 自定义 maxTotalToolCalls | 设置 50，调用 51 次 | 拒绝执行 | [x] |
| TL-06 | 自定义 maxExecutionTime | 设置 60s，执行 61s | 拒绝执行 | [x] |
| TL-07 | 自定义 maxToolsPerCall | 设置 3，请求 5 个 | 截断到 3 个 | [x] |
| TL-08 | 恰好在限制边界 | 95 + 5 = 100 | 允许执行 | [x] |
| TL-09 | 超过限制 1 次 | 95 + 6 = 101 > 100 | 拒绝执行 | [x] |
| TL-10 | 零请求数 | 请求 0 个工具 | 允许执行 | [x] |
| TL-11 | 大数值边界 | maxTotalToolCalls=1000000 | 正常工作 | [x] |
| TL-12 | 执行时间优先级最高 | 同时超时间和次数 | 报告时间超限 | [x] |
| TL-13 | 总次数优先于单次限制 | 同时超总次数和单次 | 报告总次数超限 | [x] |
| TL-14 | 仅单次限制超限 | 只超 maxToolsPerCall | 截断但继续执行 | [x] |
| TL-15 | 模拟多轮典型调用 | 多轮混合调用 | 各轮正确判断 | [x] |
| TL-16 | 防止无限循环 | 最多 50 次，每轮 5 个 | 第 10 轮停止 | [x] |
| TL-17 | 长时间任务 | 每 30s 调用一次，300s 上限 | 第 11 次后停止 | [x] |
| TL-18 | 执行时间超限消息 | maxExecutionTime=120 | 消息包含 "120秒" | [x] |
| TL-19 | 总次数超限消息 | maxTotalToolCalls=100 | 消息包含 "100次" | [x] |
| TL-20 | 单次超限消息 | maxToolsPerCall=3 | 消息包含 "3" | [x] |
| TL-21 | 包含当前计数 | 已调用 95 次 | currentCount=95 | [x] |

#### 工具调用限制测试文件

- `src/test/utils/mcpToolLimits.test.ts`

---

## 🖼️ 多模态格式转换架构 (v4.2.5)

### 架构背景

不同 AI Provider 对多模态内容的格式要求不同：

| Provider | 格式要求 | 示例 |
|----------|---------|------|
| **OpenAI** | `image_url` 格式 | `{ type: "image_url", image_url: { url: "data:..." } }` |
| **Anthropic** | `image` 格式（base64 source） | `{ type: "image", source: { type: "base64", media_type: "image/png", data: "..." } }` |
| **Google Gemini** | `inlineData` 格式 | `{ inlineData: { mimeType: "image/png", data: "..." } }` |
| **第三方模型** | 部分不支持或格式不兼容 | 需要检测并提示 |

前端统一使用 OpenAI 格式构建消息，后端需要根据 Provider 转换为对应格式。

### 转换策略

#### 1. OpenAI (Chat Completions API)

- **策略**: 直接透传 `image_url` 格式
- **适用**: OpenAI 官方模型、完全兼容 OpenAI API 的第三方服务
- **代码位置**: `lib.rs:11814-11816`

#### 2. OpenAI (Responses API)

- **策略**: 显式转换 `image_url` → `input_image`
- **实现**: `convert_messages_to_responses_input()` 函数
- **代码位置**: `lib.rs:7740-7769`

#### 3. Anthropic

- **策略**: 转换 `image_url` → Anthropic `image` 格式
- **实现**:
  - 检测 `content` 是否为数组
  - 提取 `image_url.url` 中的 base64 数据
  - 构建 `{ type: "image", source: { type: "base64", media_type, data } }`
- **代码位置**: `protocol/anthropic.rs:148-178`

#### 4. Google Gemini

- **策略**: 转换 `image_url` → Gemini `inlineData` 格式
- **实现**:
  - 检测 `content` 是否为数组
  - 提取 `image_url.url` 中的 base64 数据和 MIME type
  - 构建 `{ inlineData: { mimeType, data } }`
  - **HTTP(S) URL 处理**: Gemini 不支持远程 URL，添加占位符文本 `[图片: url]` 防止消息被吞掉
- **代码位置**: `lib.rs:8924-8946`

#### 5. 不支持多模态的模型

- **策略**: 前端检测并提示用户，自动移除附件
- **实现**: 发送前检查模型能力，显示友好提示
- **代码位置**: `App.tsx` (待实现)

### 数据流程图

```text
用户上传图片
    ↓
FileReader.readAsDataURL() → data:image/png;base64,iVBORw0KG...
    ↓
前端 buildApiMessages() → { type: "image_url", image_url: { url: "data:..." } }
    ↓
Tauri invoke('chat_stream_message') → ChatRequestMessage.content: Value
    ↓
后端路由 (chat_stream_message)
    ├─ OpenAI → 直接透传
    ├─ Anthropic → 转换为 image source
    ├─ Google → 转换为 inlineData
    └─ 其他 → 透传（可能 400）
```

### Base64 数据提取工具

从 `data:image/png;base64,iVBORw0KG...` 提取：

- **MIME type**: `image/png`
- **Base64 data**: `iVBORw0KG...` (去掉前缀)

```rust
// 示例代码
fn extract_base64_image(data_url: &str) -> Option<(String, String)> {
    if !data_url.starts_with("data:") {
        return None;
    }
    let parts: Vec<&str> = data_url.splitn(2, ',').collect();
    if parts.len() != 2 {
        return None;
    }
    let header = parts[0]; // "data:image/png;base64"
    let data = parts[1];   // "iVBORw0KG..."

    let mime_type = header
        .strip_prefix("data:")?
        .split(';')
        .next()?
        .to_string();

    Some((mime_type, data.to_string()))
}
```

### 多模态转换测试用例

参见上方 "多模态测试用例" 章节的 MM-11 到 MM-14。

---
