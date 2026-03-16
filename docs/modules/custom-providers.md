# 自定义提供商模块 (custom-providers)

## 模块职责

v4.2.7: 简化自定义提供商配置，模型配置统一在 Models 页面进行

管理自定义 AI 提供商，包括：
- 添加/编辑/删除自定义提供商
- 配置端点、认证方式、默认协议
- 持久化存储自定义提供商配置
- **模型配置在 Models 页面统一管理**（v4.2.7 变更）

## 设计背景

### 问题（v4.2.7 之前）

1. 用户需要在两个地方配置模型：
   - 自定义提供商页面配置模型列表
   - Models 页面再次配置模型实例
   - 造成重复配置，用户体验不佳

2. 职责不清晰：
   - 提供商应该只定义"服务端点"
   - 模型配置应该在 Models 页面统一管理

### 解决方案（v4.2.7）

**职责分离**：
- **自定义提供商页面**：只配置服务端点信息
  - 提供商名称和图标
  - API 端点
  - 认证方式（API Key）
  - 默认协议（可选）

- **Models 页面**：统一管理所有模型配置
  - 选择提供商
  - 配置模型 ID
  - 配置模型参数（temperature、maxTokens 等）
  - 选择通信协议

## 接口定义

### CustomProvider

```typescript
interface CustomProvider {
    /** 唯一 ID（自动生成，格式：custom-{timestamp}） */
    id: string;
    /** 显示名称 */
    name: string;
    /** 图标（emoji 或 URL） */
    icon: string;
    /** 描述 */
    description?: { zh: string; en: string };
    /** API 端点 */
    endpoint: string;
    /** 认证方式（目前只支持 API Key） */
    authMethods: [{ type: 'api'; label: string; description: string }];
    /** 默认通信协议（可选，用于配置导出） */
    protocol?: ProtocolType;
    /** 连接状态 */
    status: ProviderStatus;
    /** 创建时间 */
    createdAt: Date;
    /** 更新时间 */
    updatedAt: Date;
}
```

**重要变更（v4.2.7）：**
- ✅ 移除了 `models` 字段 - 模型配置统一在 Models 页面管理
- ✅ 保留 `protocol` 字段 - 作为默认协议，用于配置导出
- ✅ 简化配置流程 - 避免重复配置

### CustomProviderStorage

自定义提供商存储服务

#### save(providers: CustomProvider[]): Promise<void>

保存所有自定义提供商

**参数：**
- providers (CustomProvider[]): 自定义提供商列表

**返回：**
- Promise<void>

#### load(): Promise<CustomProvider[]>

加载所有自定义提供商

**返回：**
- Promise<CustomProvider[]>: 自定义提供商列表

#### add(provider: CustomProvider): Promise<void>

添加单个自定义提供商

**参数：**
- provider (CustomProvider): 自定义提供商对象

**返回：**
- Promise<void>

#### update(id: string, updates: Partial<CustomProvider>): Promise<void>

更新自定义提供商

**参数：**
- id (string): 提供商 ID
- updates (Partial<CustomProvider>): 更新字段

**返回：**
- Promise<void>

#### remove(id: string): Promise<void>

删除自定义提供商

**参数：**
- id (string): 提供商 ID

**返回：**
- Promise<void>

#### get(id: string): Promise<CustomProvider | null>

获取指定自定义提供商

**参数：**
- id (string): 提供商 ID

**返回：**
- Promise<CustomProvider | null>: 自定义提供商对象或 null

## UI 组件

### CustomProviderModal

添加/编辑自定义提供商的对话框

**Props：**
```typescript
interface CustomProviderModalProps {
    /** 是否显示 */
    open: boolean;
    /** 编辑模式（传入已有提供商） */
    provider?: CustomProvider;
    /** 关闭回调 */
    onClose: () => void;
    /** 保存回调 */
    onSave: (provider: CustomProvider) => Promise<void>;
}
```

**表单字段（v4.2.7 简化）：**
1. **基本信息**
   - 名称（必填）
   - 图标（emoji 选择器或 URL）
   - 描述（可选，中英文）

2. **端点配置**
   - API 端点（必填）
   - 默认协议（可选：OpenAI / Anthropic / Google / AWS）
   - 提示：具体模型配置请前往 Models 页面

### ProviderCard 扩展

在提供商卡片上显示自定义提供商的特殊标识

**新增功能：**
- 显示"自定义"标签
- 添加编辑/删除按钮（仅自定义提供商）

## 测试用例

### 存储测试

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-CUSTOM-001 | 添加自定义提供商 | 有效的 CustomProvider | 保存成功，ID 自动生成 |
| TC-CUSTOM-002 | 加载自定义提供商 | 已保存的提供商 | 返回正确的提供商列表 |
| TC-CUSTOM-003 | 更新自定义提供商 | 修改名称和端点 | 更新成功，updatedAt 更新 |
| TC-CUSTOM-004 | 删除自定义提供商 | 存在的 ID | 删除成功，列表长度-1 |
| TC-CUSTOM-005 | 获取不存在的提供商 | 不存在的 ID | 返回 null |
| TC-CUSTOM-006 | ID 唯一性 | 添加多个提供商 | 每个 ID 唯一 |

### UI 组件测试

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-CUSTOM-UI-001 | 打开添加对话框 | 点击"添加自定义提供商" | 显示空表单 |
| TC-CUSTOM-UI-002 | 打开编辑对话框 | 点击编辑按钮 | 表单填充已有数据 |
| TC-CUSTOM-UI-003 | 表单验证 | 提交空名称 | 显示错误提示 |
| TC-CUSTOM-UI-004 | 保存成功 | 填写完整信息并保存 | 关闭对话框，列表更新 |
| TC-CUSTOM-UI-005 | 删除确认 | 点击删除提供商 | 显示确认对话框 |
| TC-CUSTOM-UI-006 | 协议选择 | 选择默认协议 | 协议正确保存 |

### 集成测试

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-CUSTOM-INT-001 | 连接自定义提供商 | 有效 API Key | status='connected' |
| TC-CUSTOM-INT-002 | 使用自定义模型聊天 | 选择自定义提供商的模型 | 正常发送和接收消息 |
| TC-CUSTOM-INT-003 | 多个自定义提供商 | 添加 3 个不同的提供商 | 都能正常工作 |
| TC-CUSTOM-INT-004 | 重启后恢复 | 应用重启 | 自定义提供商配置保留 |

**注意：** 协议相关测试已移至 [protocol-configuration.md](./protocol-configuration.md)。

## 存储结构

### Tauri 文件存储

**文件路径：** `{APP_DATA_DIR}/custom_providers.json`

**数据格式（v4.2.7）：**
```json
[
    {
        "id": "custom-1706000000000",
        "name": "My Claude API",
        "icon": "🤖",
        "description": {
            "zh": "自建 Claude 兼容服务",
            "en": "Self-hosted Claude compatible service"
        },
        "endpoint": "https://api.example.com/v1",
        "authMethods": [
            {
                "type": "api",
                "label": "API Key",
                "description": "从服务商获取"
            }
        ],
        "protocol": "anthropic",
        "status": "connected",
        "createdAt": "2024-01-23T10:00:00.000Z",
        "updatedAt": "2024-01-23T10:00:00.000Z"
    }
]
```

**重要变更（v4.2.7）：**
- ❌ 移除了 `models` 字段
- ✅ 保留 `protocol` 字段作为默认协议
- 💡 模型配置请在 Models 页面进行

### localStorage 备份

**Key：** `mobaus_custom_providers`

**格式：** 与文件存储相同

## 实现步骤

### 1. 后端实现（Rust）

**文件：** `src-tauri/src/lib.rs`

添加 Tauri 命令：
```rust
#[tauri::command]
async fn save_custom_providers(providers: Vec<CustomProvider>) -> Result<(), String>

#[tauri::command]
async fn load_custom_providers() -> Result<Vec<CustomProvider>, String>
```

### 2. 前端存储服务

**文件：** `src/services/customProviderStorage.ts`

实现 `CustomProviderStorage` 接口

### 3. UI 组件

**文件：** `src/components/features/Providers/CustomProviderModal.tsx`

实现添加/编辑对话框

### 4. 集成到 ProviderPage

**修改：** `src/components/features/Providers/ProviderPage.tsx`

- 添加"添加自定义提供商"按钮
- 合并内置提供商和自定义提供商列表
- 为自定义提供商卡片添加编辑/删除按钮

## 使用示例

### 添加自定义提供商（v4.2.7 简化）

```typescript
// 1. 添加自定义提供商（只配置端点信息）
const customProvider: CustomProvider = {
    id: 'custom-1706000000000',  // 自动生成
    name: 'My Claude API',
    icon: '🤖',
    description: {
        zh: '自建 Claude 兼容服务',
        en: 'Self-hosted Claude compatible service',
    },
    endpoint: 'https://api.example.com/v1',
    authMethods: [
        {
            type: 'api',
            label: 'API Key',
            description: '从服务商获取',
        },
    ],
    protocol: 'anthropic',  // 默认协议
    status: 'disconnected',
    createdAt: new Date(),
    updatedAt: new Date(),
};

await customProviderStorage.add(customProvider);

// 2. 在 Models 页面添加模型配置
// 用户前往 Models 页面，选择 "My Claude API" 提供商
// 配置具体的模型：claude-3-opus、claude-3-sonnet 等
```

### 添加自定义 OpenAI 兼容服务

```typescript
// 1. 添加 Ollama 提供商
const ollamaProvider: CustomProvider = {
    id: 'custom-1706000000001',
    name: 'Local Ollama',
    icon: '🦙',
    endpoint: 'http://localhost:11434/v1',
    authMethods: [
        {
            type: 'api',
            label: 'API Key',
            description: '本地服务无需 API Key',
        },
    ],
    protocol: 'openai',  // OpenAI 兼容协议
    status: 'disconnected',
    createdAt: new Date(),
    updatedAt: new Date(),
};

await customProviderStorage.add(ollamaProvider);

// 2. 在 Models 页面添加模型
// 选择 "Local Ollama" 提供商
// 配置模型：llama3.1:70b、qwen2.5:32b 等
```

## 变更记录

| 日期 | 版本 | 修改内容 | 修改人 |
|------|------|----------|--------|
| 2024-02-28 | v0.9.3 | 初始版本，支持多个自定义提供商和协议选择 | Claude |
| 2024-02-28 | v0.9.3.1 | 优化 API Key 编辑体验：显示配置状态，编辑时留空保持不变 | Claude |
| 2024-02-28 | v0.9.3.2 | 修复断开重连问题：断开连接不删除凭证，重连时自动填充已保存的 API Key | Claude |
| 2024-02-28 | v0.9.3.3 | 智能连接：已有 API Key 时直接连接，无需弹出输入框 | Claude |
| 2024-02-28 | v0.9.3.4 | 修复删除逻辑：同时删除凭证；统一布局：自定义提供商与其他提供商混合显示 | Claude |
| 2024-02-28 | v0.9.3.6 | UI 优化：统一风格的删除确认对话框，徽章换行显示，修复重复显示问题 | Claude |
| 2024-03-03 | v4.1.46 | 移除提供商级别协议配置，协议选择移至模型创建时 | Claude |
| 2026-03-11 | v4.2.7 | **简化配置流程**：移除 models 字段，模型配置统一在 Models 页面管理，避免重复配置 | Claude |

