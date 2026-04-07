# Models Module / Models 模型管理模块

> [English](#english) | [中文](#中文)

<a id="english"></a>

## Module Overview

The Models module is responsible for managing AI model configuration, API keys, and provider settings, supporting multi-model switching and connection testing.

| Property | Value |
|----------|-------|
| Module Path | `src/components/features/Models` |
| Storage Service | `src/services/storage.ts` |
| Rust Commands | `src-tauri/src/lib.rs` |
| Created Date | 2026-01-18 |
| Last Updated | 2026-01-23 |

---

## Feature List

### Core Features

- [x] Model list display and status monitoring
- [x] Add/edit model configuration
- [x] Delete model (with confirmation dialog)
- [x] API Key secure management
- [x] Model connection testing
- [x] Multi-provider support (OpenAI, Anthropic, Google, Custom)
- [x] Local persistent storage (Tauri file system)
- [x] Auto-test after configuration (v2.5.3)
- [x] Toast notification for test results (v2.5.3)
- [x] Batch check model availability (v3.6.0)

### Extended Features

- [x] Google Cloud Code model quota display (v3.6.1)
- [ ] Model usage statistics
- [ ] Auto-discover models
- [ ] Rate configuration

### Google Model Quota Display (v3.6.1)

When a user connects the Google provider, the system automatically fetches Google Cloud Code available model list and quota information:

- **Dynamic model list**: Fetches actually available models from the API, not static configuration
- **Quota status display**: Shows remaining quota percentage in the model selector
- **Quota exhausted warning**: Models with exhausted quota show a warning indicator and cannot be selected
- **Quota reset time**: Shows estimated time for quota reset

### Available Model Filtering (v3.6.0)

Chat and Agent module model selectors only display models with status `online`, ensuring users can only select verified available models for conversations.

---

## Component Structure

```
Models/
├── index.tsx              # Module entry (ModelPage)
├── ModelCard.tsx          # Model card component
├── ModelModal.tsx         # Model configuration modal
└── types.ts               # Type definitions (references global types)
```

---

## Data Structures

### AIModelConfig Model Configuration

```typescript
interface AIModelConfig {
  id: string;
  name: string;            // Display name
  modelId?: string;        // Model ID/endpoint ID (for custom providers)
  provider: string;        // Provider ID
  status: 'online' | 'offline' | 'error';
  apiKeySet: boolean;      // Whether API Key is set
  apiKey?: string;         // API Key (frontend transport only, not persisted in plaintext)
  endpoint?: string;       // Custom API address
  baseUrl?: string;        // Same as endpoint, compatibility field
  maxTokens: number;
  temperature?: number;
  pricing?: {
    input: number;
    output: number;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

### ModelProvider Provider

```typescript
interface ModelProvider {
  id: string;
  name: string;
  icon: string;
  defaultEndpoint: string;
  models: Array<{
    id: string;
    name: string;
    maxTokens: number;
    /** v3.6.1: Quota info (Google provider only) */
    quota?: {
      remainingFraction: number;  // Remaining quota ratio (0.0 - 1.0)
      resetTime?: string;         // Quota reset time (ISO 8601)
      isExhausted: boolean;       // Whether quota is exhausted
    };
  }>;
  /** v3.2.0: Whether connected */
  connected?: boolean;
  /** v3.6.1: Whether dynamic model list is supported (e.g., Google) */
  supportsDynamicModels?: boolean;
  /** v3.6.1: Dynamic model loading state */
  modelsLoading?: boolean;
  /** v3.6.1: Dynamic model loading error */
  modelsError?: string;
}
```

---

## API Interface

### Data Persistence

Uses `src/services/storage.ts` for unified management, supporting dual environments:
- **Tauri environment**: Calls Tauri commands to store to local file system
- **Browser environment**: Falls back to LocalStorage

### Tauri Commands

#### `save_models`
Save model configuration to local file

```rust
#[tauri::command]
async fn save_models(models: Vec<AIModelConfig>) -> Result<(), String>
```

#### `load_models`
Load model configuration from local file

```rust
#[tauri::command]
async fn load_models() -> Result<Vec<AIModelConfig>, String>
```

#### `test_model`
Test model connection (bypasses CORS restrictions)

```rust
#[tauri::command]
async fn test_model(request: TestModelRequest) -> Result<TestModelResponse, String>

struct TestModelRequest {
    provider: String,
    api_key: String,
    endpoint: Option<String>,
    model_name: Option<String>,
}
```

#### `google_fetch_available_models` (v3.6.1)
Fetch Google Cloud Code available model list and quota info

```rust
#[tauri::command]
async fn google_fetch_available_models(
    access_token: String,
    project_id: Option<String>,
) -> Result<FetchAvailableModelsResponse, String>

struct FetchAvailableModelsResponse {
    success: bool,
    models: Vec<AvailableModelInfo>,
    error: Option<String>,
}

struct AvailableModelInfo {
    id: String,
    display_name: Option<String>,
    remaining_fraction: Option<f64>,
    reset_time: Option<String>,
    is_exhausted: bool,
}
```

### Frontend Interface

#### `onBatchTestModels` (v3.6.0)
Batch test all models' availability

**Function signature:**
```typescript
onBatchTestModels: () => Promise<void>
```

**Description:**
- Iterates through all configured models, calling `test_model` command for each
- Concurrency control: Tests at most 3 models simultaneously to avoid request overload
- Shows progress notifications during testing
- Updates each model's `status` field after testing
- Displays batch test result summary via Toast notification

**Return value:**
- No return value, results are communicated through state updates and Toast notifications

#### `getAvailableModels` (v3.6.0)
Get available models list (models with online status)

**Function signature:**
```typescript
getAvailableModels: (models: AIModelConfig[]) => AIModelConfig[]
```

**Description:**
- Filters models with `status === 'online'`
- Used for Chat and Agent module model selectors

---

## Test Cases

| Case ID | Test Scenario | Input | Expected Output | Status |
|---------|--------------|-------|-----------------|--------|
| TC-MODEL-001 | Render model list | Mock data | Correctly display model cards | [x] |
| TC-MODEL-002 | Add model | Click add button, fill form | New model in list, save successful | [x] |
| TC-MODEL-003 | Edit model | Click edit button | Modal shows pre-filled data, updates after save | [x] |
| TC-MODEL-004 | Delete model | Click delete button | Show confirmation dialog | [x] |
| TC-MODEL-005 | Confirm delete | Click delete in confirmation dialog | Model removed from list | [x] |
| TC-MODEL-006 | Cancel delete | Click cancel in confirmation dialog | Dialog closes, model retained | [x] |
| TC-MODEL-007 | Test model | Click test button | Show testing status, then show result | [x] |
| TC-MODEL-008 | Filter models | Enter search keyword | List shows only matching items | [x] |
| TC-MODEL-009 | Standard model auto-select | Open add modal | Auto-select first model ID | [x] |
| TC-MODEL-010 | Switch provider | Switch selection | Auto-update model selection | [x] |
| TC-MODEL-011 | Delete persistence | Delete model and restart | Model config deleted | [x] |
| TC-MODEL-012 | Auto-test after add | Add model | Auto-execute test and show Toast | [x] |
| TC-MODEL-013 | Auto-test after update | Edit model | Auto-execute test and show Toast | [x] |
| TC-MODEL-014 | Toast shows success | Test successful | Green Toast in top-right corner | [x] |
| TC-MODEL-015 | Toast shows failure | Test failed | Red Toast in top-right, expandable details | [x] |
| TC-MODEL-016 | Model status update | Test complete | Status updated to online/error | [x] |

### Google Model Race Condition Tests (v3.6.2)

| Case ID | Test Scenario | Input | Expected Output | Status |
|---------|--------------|-------|-----------------|--------|
| TC-GMODEL-001 | Quick account switch cancels old request | Switch accessToken twice | Old request cancelled, only latest result kept | [ ] |
| TC-GMODEL-002 | Project switch cancels old request | Switch projectId | Old request cancelled, new request completes normally | [ ] |
| TC-GMODEL-003 | Normal single request | Single accessToken set | Normal model list return | [ ] |
| TC-GMODEL-004 | Old request not written back on disconnect | Request in progress, accessToken becomes empty | Old request return doesn't update state, model list stays empty | [ ] |
| TC-MODEL-017 | Batch check button display | Model list page | Show "Batch Check" button | [ ] |
| TC-MODEL-018 | Batch check execution | Click batch check button | Test all models one by one, show progress | [ ] |
| TC-MODEL-019 | Batch check results | Batch check complete | Toast shows success/failure count summary | [ ] |
| TC-MODEL-020 | Batch check status update | Batch check complete | Each model status correctly updated | [ ] |
| TC-MODEL-021 | Batch check concurrency control | Multiple models tested simultaneously | Max 3 concurrent requests | [ ] |
| TC-MODEL-022 | Chat model filtering | Chat page model selector | Only show status=online models | [ ] |
| TC-MODEL-023 | Agent model filtering | Agent edit modal | Only show status=online models | [ ] |
| TC-MODEL-024 | No available models prompt | All models offline/error | Show "Please configure available models first" prompt | [ ] |
| TC-MODEL-025 | Google model quota fetch | Google provider connected | Call API to get available model list | [ ] |
| TC-MODEL-026 | Google model quota display | Model selector | Show remaining quota percentage | [ ] |
| TC-MODEL-027 | Google quota exhausted prompt | Model with 0 quota | Show warning indicator, not selectable | [ ] |
| TC-MODEL-028 | Google quota reset time | Model with resetTime | Show quota reset time | [ ] |
| TC-MODEL-029 | Google model loading state | Fetching model list | Show loading indicator | [ ] |
| TC-MODEL-030 | Google model loading failure | API returns error | Show error prompt, fallback to static list | [ ] |

### Credential Matching Case-insensitive Tests (v3.6.4)

| Case ID | Test Scenario | Input | Expected Output | Status |
|---------|--------------|-------|-----------------|--------|
| TC-CRED-CI-001 | storage.get case-insensitive | providerId='Google', stored as 'google' | Return matching credential | [ ] |
| TC-CRED-CI-002 | storage.getSync case-insensitive | providerId='OPENAI', stored as 'openai' | Return matching credential | [ ] |
| TC-CRED-CI-003 | ModelModal submit credential matching | provider='Google', credential providerId='google' | Correctly get credential | [ ] |

### Service Layer Pure Function Tests (modelState)

> Test file: `src/test/services/models/modelState.test.ts`

| Case ID | Test Scenario | Input | Expected Output | Status |
|---------|--------------|-------|-----------------|--------|
| TC-MODEL-STATE-001 | addModel - create model | ModelCreateInput | New AIModelConfig in list, default status='offline' | [x] |
| TC-MODEL-STATE-002 | updateModel - update model | id + ModelCreateInput | Specified model fields updated, others unchanged | [x] |
| TC-MODEL-STATE-003 | updateModel - API Key preserved | No new apiKey | Preserve old apiKey | [x] |
| TC-MODEL-STATE-004 | deleteModel - delete model | id | Specified model removed from list | [x] |
| TC-MODEL-STATE-005 | updateModelStatus - update status | id + 'online' | Specified model status updated | [x] |
| TC-MODEL-STATE-006 | findModel - find existing | id | Return corresponding model | [x] |
| TC-MODEL-STATE-007 | findModel - find non-existing | Non-existent id | Return undefined | [x] |
| TC-MODEL-STATE-008 | updateModel - id doesn't exist | Non-existent id | List unchanged | [x] |

### Test Files

- `src/test/components/Models/ModelPage.test.tsx`
- `src/test/components/Models/ModelCard.test.tsx`
- `src/test/components/Models/ModelModal.test.tsx`
- `src/test/services/storage.test.ts`
- `src/test/services/models/modelState.test.ts`

---

## Change History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-01-18 | 1.0.0 | - | Initial version, basic CRUD and UI |
| 2026-01-18 | 1.1.0 | - | Add standard model auto-select logic |
| 2026-01-18 | 1.2.0 | - | Add Tauri persistence storage interface definition |
| 2026-01-23 | 2.5.3 | - | Fix delete persistence issue, add delete confirmation dialog |
| 2026-01-23 | 2.5.3 | - | Add auto-test after configuration feature |
| 2026-01-23 | 2.5.3 | - | Switch to Toast notification for test results (top-right temporary popup) |
| 2026-01-23 | 2.5.3 | - | Add error status support |
| 2026-01-27 | 3.6.0 | - | Add batch check model availability feature |
| 2026-01-27 | 3.6.0 | - | Add getAvailableModels interface for Chat/Agent |
| 2026-01-27 | 3.6.0 | - | Fix useProviderCredential field lost in Tauri persistence |
| 2026-01-28 | 3.6.1 | - | Add Google Cloud Code model quota display feature |
| 2026-01-28 | 3.6.1 | - | Add google_fetch_available_models Tauri command |
| 2026-01-28 | 3.6.1 | - | Add src/services/google-models.ts frontend service |
| 2026-01-28 | 3.6.1 | - | Extend ModelProvider type to support dynamic models and quota info |
| 2026-03-05 | 4.2.0 | - | Extract modelState pure functions: addModel, updateModel, deleteModel, updateModelStatus, findModel |
| 2026-03-13 | 3.6.2 | - | Fix useGoogleModels race condition: use AbortController to cancel stale requests, prevent old data overwriting new data on quick account/project switch |
| 2026-03-13 | 3.6.3 | - | Fix ModelModal Google credential dirty value: clear googleAccessToken/googleProjectId when credential cannot be loaded |
| 2026-03-13 | 3.6.4 | - | Fix credential matching case-sensitivity: storage.get/getSync and ModelModal submit use toLowerCase for providerId matching |
| 2026-03-13 | 3.6.5 | - | Fix useGoogleModels disconnect race condition: increment requestIdRef when accessToken becomes empty so in-flight old requests auto-expire |
| 2026-04-06 | 4.3.0 | - | Update OpenAI model list: add o3, o3-pro, o4-mini, chatgpt-4o-latest; update filter logic for o4 prefix; update multimodal detection for o4-mini vision; update guessMaxTokens/guessContextWindow for new models |
| 2026-04-06 | 4.3.1 | - | Fix OAuth Token test connection issue: 1) Use safe model (gpt-4o-mini) for testing 2) Improve 429 error message distinguishing quota limits vs permissions 3) Clean up non-existent built-in models (gpt-5.1 series) |
| 2026-04-06 | 4.3.2 | - | Add GPT-5.x series models support: 1) Add gpt-5.4 series to fallback list 2) Refine context window guess for codex series 3) Fix codex-mini incorrect sorting as mini priority 4) Add GPT-5.x test cases |
| 2026-04-06 | 4.3.3 | - | Fix cached model overwriting new built-in models on startup: change `useAppBootstrap` cache recovery to merge strategy, preserving cached models and appending new ones from built-in list |
| 2026-04-07 | 4.3.4 | - | 1) Fix `gpt-5.1-codex-mini` context window incorrectly guessed as 1M; 2) Upgrade startup cache merge strategy to deep merge, updating cached models with latest metadata from built-in list |

---

<a id="中文"></a>

## 模块概述

Models模块负责管理AI模型配置、API密钥和提供商设置，支持多模型切换和连接测试。

| 属性 | 值 |
|------|------|
| 模块路径 | `src/components/features/Models` |
| 存储服务 | `src/services/storage.ts` |
| Rust命令 | `src-tauri/src/lib.rs` |
| 创建日期 | 2026-01-18 |
| 最后更新 | 2026-01-23 |

---

## 功能列表

### 核心功能

- [x] 模型列表展示与状态监控
- [x] 添加/编辑模型配置
- [x] 删除模型（含二次确认）
- [x] API Key 安全管理
- [x] 模型连接测试
- [x] 多提供商支持 (OpenAI, Anthropic, Google, Custom)
- [x] 本地持久化存储 (Tauri 文件系统)
- [x] 配置后自动测试 (v2.5.3)
- [x] Toast 通知显示测试结果 (v2.5.3)
- [x] 批量检查模型可用性 (v3.6.0)

### 扩展功能

- [x] Google Cloud Code 模型配额显示 (v3.6.1)
- [ ] 模型使用统计
- [ ] 自动发现模型
- [ ] 费率配置

### Google 模型配额显示 (v3.6.1)

当用户连接 Google 提供商后，系统会自动获取 Google Cloud Code 可用模型列表及其配额信息：

- **动态模型列表**：从 API 获取实际可用的模型，而非静态配置
- **配额状态显示**：在模型选择器中显示剩余配额百分比
- **配额耗尽提示**：配额耗尽的模型显示警告标识，不可选择
- **配额重置时间**：显示配额重置的预计时间

### 可用模型筛选 (v3.6.0)

Chat 和 Agent 模块的模型选择器仅显示状态为 `online` 的可用模型，确保用户只能选择已验证可用的模型进行对话。

---

## 组件结构

```
Models/
├── index.tsx              # 模块入口 (ModelPage)
├── ModelCard.tsx          # 模型卡片组件
├── ModelModal.tsx         # 模型配置弹窗
└── types.ts               # 类型定义 (引用自全局 types)
```

---

## 数据结构

### AIModelConfig 模型配置

```typescript
interface AIModelConfig {
  id: string;
  name: string;            // 显示名称
  modelId?: string;        // Model ID/接入点 ID (自定义提供商用)
  provider: string;        // 提供商ID
  status: 'online' | 'offline' | 'error';
  apiKeySet: boolean;      // 是否已设置API Key
  apiKey?: string;         // API Key (仅前端传输用，不持久化明文)
  endpoint?: string;       // 自定义API地址
  baseUrl?: string;        // 同 endpoint，兼容字段
  maxTokens: number;
  temperature?: number;
  pricing?: {
    input: number;
    output: number;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

### ModelProvider 提供商

```typescript
interface ModelProvider {
  id: string;
  name: string;
  icon: string;
  defaultEndpoint: string;
  models: Array<{
    id: string;
    name: string;
    maxTokens: number;
    /** v3.6.1: 配额信息（Google 提供商专用） */
    quota?: {
      remainingFraction: number;  // 剩余配额比例 (0.0 - 1.0)
      resetTime?: string;         // 配额重置时间 (ISO 8601)
      isExhausted: boolean;       // 配额是否已耗尽
    };
  }>;
  /** v3.2.0: 是否已连接 */
  connected?: boolean;
  /** v3.6.1: 是否支持动态模型列表（如 Google） */
  supportsDynamicModels?: boolean;
  /** v3.6.1: 动态模型加载状态 */
  modelsLoading?: boolean;
  /** v3.6.1: 动态模型加载错误 */
  modelsError?: string;
}
```

---

## API 接口

### 数据持久化

使用 `src/services/storage.ts` 统一管理，支持双环境：
- **Tauri 环境**: 调用 Tauri 命令存储到本地文件系统
- **浏览器环境**: 回退到 LocalStorage

### Tauri 命令

#### `save_models`
保存模型配置到本地文件

```rust
#[tauri::command]
async fn save_models(models: Vec<AIModelConfig>) -> Result<(), String>
```

#### `load_models`
从本地文件加载模型配置

```rust
#[tauri::command]
async fn load_models() -> Result<Vec<AIModelConfig>, String>
```

#### `test_model`
测试模型连接 (绕过 CORS 限制)

```rust
#[tauri::command]
async fn test_model(request: TestModelRequest) -> Result<TestModelResponse, String>

struct TestModelRequest {
    provider: String,
    api_key: String,
    endpoint: Option<String>,
    model_name: Option<String>,
}
```

#### `google_fetch_available_models` (v3.6.1)
获取 Google Cloud Code 可用模型列表及配额信息

```rust
#[tauri::command]
async fn google_fetch_available_models(
    access_token: String,
    project_id: Option<String>,
) -> Result<FetchAvailableModelsResponse, String>

struct FetchAvailableModelsResponse {
    success: bool,
    models: Vec<AvailableModelInfo>,
    error: Option<String>,
}

struct AvailableModelInfo {
    id: String,
    display_name: Option<String>,
    remaining_fraction: Option<f64>,
    reset_time: Option<String>,
    is_exhausted: bool,
}
```

### 前端接口

#### `onBatchTestModels` (v3.6.0)
批量测试所有模型的可用性

**函数签名：**
```typescript
onBatchTestModels: () => Promise<void>
```

**功能说明：**
- 遍历所有已配置的模型，逐个调用 `test_model` 命令
- 并发控制：同时最多测试 3 个模型，避免请求过载
- 测试过程中显示进度提示
- 测试完成后更新每个模型的 `status` 字段
- 通过 Toast 通知显示批量测试结果摘要

**返回值：**
- 无返回值，通过状态更新和 Toast 通知反馈结果

#### `getAvailableModels` (v3.6.0)
获取可用模型列表（状态为 online 的模型）

**函数签名：**
```typescript
getAvailableModels: (models: AIModelConfig[]) => AIModelConfig[]
```

**功能说明：**
- 筛选 `status === 'online'` 的模型
- 用于 Chat 和 Agent 模块的模型选择器

---

## 测试用例

| 用例ID | 测试场景 | 输入 | 期望输出 | 状态 |
|--------|---------|------|---------|------|
| TC-MODEL-001 | 渲染模型列表 | 模拟数据 | 正确显示模型卡片 | [x] |
| TC-MODEL-002 | 添加模型 | 点击添加按钮，填写表单 | 列表新增模型，保存成功 | [x] |
| TC-MODEL-003 | 编辑模型 | 点击编辑按钮 | 弹窗回显数据，保存后更新 | [x] |
| TC-MODEL-004 | 删除模型 | 点击删除按钮 | 弹出确认对话框 | [x] |
| TC-MODEL-005 | 确认删除 | 确认对话框点击删除 | 模型从列表中移除 | [x] |
| TC-MODEL-006 | 取消删除 | 确认对话框点击取消 | 对话框关闭，模型保留 | [x] |
| TC-MODEL-007 | 测试模型 | 点击测试按钮 | 显示测试中状态，随后显示结果 | [x] |
| TC-MODEL-008 | 过滤模型 | 输入搜索关键词 | 列表仅显示匹配项 | [x] |
| TC-MODEL-009 | 标准模型默认选中 | 打开添加弹窗 | 自动选中第一个模型ID | [x] |
| TC-MODEL-010 | 切换提供商 | 切换选择 | 自动更新模型选择 | [x] |
| TC-MODEL-011 | 删除后持久化 | 删除模型后重启 | 模型配置已删除 | [x] |
| TC-MODEL-012 | 添加后自动测试 | 添加模型 | 自动执行测试并显示Toast | [x] |
| TC-MODEL-013 | 更新后自动测试 | 编辑模型 | 自动执行测试并显示Toast | [x] |
| TC-MODEL-014 | Toast显示成功 | 测试成功 | 右上角显示绿色Toast | [x] |
| TC-MODEL-015 | Toast显示失败 | 测试失败 | 右上角显示红色Toast，可展开详情 | [x] |
| TC-MODEL-016 | 模型状态更新 | 测试完成 | 状态更新为online/error | [x] |

### Google 模型竞态条件测试 (v3.6.2)

| 用例ID | 测试场景 | 输入 | 期望输出 | 状态 |
|--------|---------|------|---------|------|
| TC-GMODEL-001 | 快速切换账号取消旧请求 | 切换 accessToken 两次 | 旧请求被取消，只保留最新结果 | [ ] |
| TC-GMODEL-002 | 切换项目取消旧请求 | 切换 projectId | 旧请求被取消，新请求正常完成 | [ ] |
| TC-GMODEL-003 | 正常单次请求 | 单次 accessToken 设置 | 正常返回模型列表 | [ ] |
| TC-GMODEL-004 | 断开连接时旧请求不回写 | 请求进行中 accessToken 变空 | 旧请求返回后不更新 state，模型列表保持为空 | [ ] |
| TC-MODEL-017 | 批量检查按钮显示 | 模型列表页面 | 显示"批量检查"按钮 | [ ] |
| TC-MODEL-018 | 批量检查执行 | 点击批量检查按钮 | 逐个测试所有模型，显示进度 | [ ] |
| TC-MODEL-019 | 批量检查结果 | 批量检查完成 | Toast显示成功/失败数量摘要 | [ ] |
| TC-MODEL-020 | 批量检查状态更新 | 批量检查完成 | 每个模型状态正确更新 | [ ] |
| TC-MODEL-021 | 批量检查并发控制 | 多个模型同时测试 | 最多3个并发请求 | [ ] |
| TC-MODEL-022 | Chat模型筛选 | Chat页面模型选择器 | 仅显示status=online的模型 | [ ] |
| TC-MODEL-023 | Agent模型筛选 | Agent编辑弹窗 | 仅显示status=online的模型 | [ ] |
| TC-MODEL-024 | 无可用模型提示 | 所有模型offline/error | 显示"请先配置可用模型"提示 | [ ] |
| TC-MODEL-025 | Google模型配额获取 | Google提供商已连接 | 调用API获取可用模型列表 | [ ] |
| TC-MODEL-026 | Google模型配额显示 | 模型选择器 | 显示剩余配额百分比 | [ ] |
| TC-MODEL-027 | Google配额耗尽提示 | 配额为0的模型 | 显示警告标识，不可选择 | [ ] |
| TC-MODEL-028 | Google配额重置时间 | 有resetTime的模型 | 显示配额重置时间 | [ ] |
| TC-MODEL-029 | Google模型加载状态 | 正在获取模型列表 | 显示加载指示器 | [ ] |
| TC-MODEL-030 | Google模型加载失败 | API返回错误 | 显示错误提示，回退到静态列表 | [ ] |

### 凭证匹配大小写不敏感测试 (v3.6.4)

| 用例ID | 测试场景 | 输入 | 期望输出 | 状态 |
|--------|---------|------|---------|------|
| TC-CRED-CI-001 | storage.get 大小写不敏感 | providerId='Google', 存储为'google' | 返回匹配的凭证 | [ ] |
| TC-CRED-CI-002 | storage.getSync 大小写不敏感 | providerId='OPENAI', 存储为'openai' | 返回匹配的凭证 | [ ] |
| TC-CRED-CI-003 | ModelModal 提交凭证匹配 | provider='Google', 凭证providerId='google' | 正确获取凭证 | [ ] |

### 模型获取与缓存测试 (v4.3.4)

| 用例ID | 测试场景 | 输入 | 期望输出 | 状态 |
|--------|---------|------|---------|------|
| TC-MODEL-FETCH-001 | guessContextWindow - gpt-5.1-codex-mini | 'gpt-5.1-codex-mini' | 返回 400000 | [ ] |
| TC-MODEL-FETCH-002 | 启动缓存合并更新 | 包含旧元数据的模型与内置新元数据模型合并 | 缓存模型的 maxTokens、contextWindow 等更新为内置最新值 | [ ] |

### 服务层纯函数测试 (modelState)

> 测试文件: `src/test/services/models/modelState.test.ts`

| 用例ID | 测试场景 | 输入 | 期望输出 | 状态 |
|--------|---------|------|---------|------|
| TC-MODEL-STATE-001 | addModel - 创建模型 | ModelCreateInput | 列表新增 AIModelConfig，默认 status='offline' | [x] |
| TC-MODEL-STATE-002 | updateModel - 更新模型 | id + ModelCreateInput | 指定模型字段更新，其他不变 | [x] |
| TC-MODEL-STATE-003 | updateModel - API Key 保留 | 无新 apiKey | 保留旧 apiKey | [x] |
| TC-MODEL-STATE-004 | deleteModel - 删除模型 | id | 指定模型从列表移除 | [x] |
| TC-MODEL-STATE-005 | updateModelStatus - 更新状态 | id + 'online' | 指定模型 status 更新 | [x] |
| TC-MODEL-STATE-006 | findModel - 查找存在 | id | 返回对应模型 | [x] |
| TC-MODEL-STATE-007 | findModel - 查找不存在 | 不存在的 id | 返回 undefined | [x] |
| TC-MODEL-STATE-008 | updateModel - id 不存在 | 不存在的 id | 列表不变 | [x] |

### 测试文件

- `src/test/components/Models/ModelPage.test.tsx`
- `src/test/components/Models/ModelCard.test.tsx`
- `src/test/components/Models/ModelModal.test.tsx`
- `src/test/services/storage.test.ts`
- `src/test/services/models/modelState.test.ts`

---

## 修改历史

| 日期 | 版本 | 修改人 | 修改内容 |
|------|------|--------|---------|
| 2026-01-18 | 1.0.0 | - | 初始版本，实现基础CRUD和UI |
| 2026-01-18 | 1.1.0 | - | 添加标准模型自动选中逻辑 |
| 2026-01-18 | 1.2.0 | - | 添加 Tauri 持久化存储接口定义 |
| 2026-01-23 | 2.5.3 | - | 修复删除持久化问题，添加删除确认对话框 |
| 2026-01-23 | 2.5.3 | - | 添加配置后自动测试功能 |
| 2026-01-23 | 2.5.3 | - | 改用 Toast 通知显示测试结果（右上角临时弹框） |
| 2026-01-23 | 2.5.3 | - | 添加 error 状态支持 |
| 2026-01-27 | 3.6.0 | - | 添加批量检查模型可用性功能 |
| 2026-01-27 | 3.6.0 | - | 添加 getAvailableModels 接口供 Chat/Agent 使用 |
| 2026-01-27 | 3.6.0 | - | 修复 useProviderCredential 字段 Tauri 持久化丢失问题 |
| 2026-01-28 | 3.6.1 | - | 添加 Google Cloud Code 模型配额显示功能 |
| 2026-01-28 | 3.6.1 | - | 新增 google_fetch_available_models Tauri 命令 |
| 2026-01-28 | 3.6.1 | - | 新增 src/services/google-models.ts 前端服务 |
| 2026-01-28 | 3.6.1 | - | 扩展 ModelProvider 类型支持动态模型和配额信息 |
| 2026-03-05 | 4.2.0 | - | 抽取 modelState 纯函数：addModel、updateModel、deleteModel、updateModelStatus、findModel |
| 2026-03-13 | 3.6.2 | - | 修复 useGoogleModels 竞态条件：使用 AbortController 取消过期请求，防止快速切换账号/项目时旧数据覆盖新数据 |
| 2026-03-13 | 3.6.3 | - | 修复 ModelModal Google 凭证脏值：加载不到凭证时清空 googleAccessToken/googleProjectId |
| 2026-03-13 | 3.6.4 | - | 修复凭证匹配大小写敏感：storage.get/getSync 和 ModelModal 提交时使用 toLowerCase 匹配 providerId |
| 2026-03-13 | 3.6.5 | - | 修复 useGoogleModels 断开连接竞态：accessToken 变空时递增 requestIdRef 使进行中的旧请求自动失效 |
| 2026-04-06 | 4.3.0 | - | 更新 OpenAI 模型列表：新增 o3、o3-pro、o4-mini、chatgpt-4o-latest；更新过滤逻辑支持 o4 前缀；更新多模态判断支持 o4-mini 视觉能力；更新 guessMaxTokens/guessContextWindow 支持新模型参数 |
| 2026-04-06 | 4.3.1 | - | 修复 OAuth Token 测试模型连接问题：1) OAuth 测试时使用安全模型(gpt-4o-mini)而非用户选择的模型 2) 优化 429 错误提示区分配额不足和模型无权限 3) 清理内置列表中不存在的模型(gpt-5.1系列)，保留已确认可用的模型 |
| 2026-04-06 | 4.3.2 | - | 添加 GPT-5.x 系列模型支持：1) 内置 fallback 列表新增 gpt-5.4/gpt-5.4-mini/gpt-5.3-codex/gpt-5.2-codex/gpt-5.2/gpt-5.1-codex-max/gpt-5.1-codex-mini 2) guessContextWindow 细化 codex 系列上下文窗口 3) 排序逻辑排除 codex-mini 被错误归类为 mini 优先排序 4) 添加 GPT-5.x 过滤和参数推测测试用例 |
| 2026-04-06 | 4.3.3 | - | 修复启动时缓存覆盖导致新内置模型不显示的问题：useAppBootstrap 恢复缓存模型时改为合并策略——缓存中已有的模型保留，内置列表中缓存缺失的新模型自动补充到末尾，确保版本更新后新增的内置模型能立即展示 |
| 2026-04-07 | 4.3.4 | - | 1) 修复 `gpt-5.1-codex-mini` 模型上下文被错误推断为 1M 的问题；2) 升级启动缓存合并策略，使用内置模型的最新元数据更新已有缓存模型，解决新版本模型属性更新无法即时生效的问题 |
