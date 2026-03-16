# 协议配置模块 (protocol-configuration)

## 模块职责

v4.1.46: 实现模型级别的协议配置，支持自定义提供商选择不同的通信协议

管理 AI 模型的通信协议配置，包括：
- 在模型创建时选择协议类型
- 根据协议类型路由到正确的 API 实现
- 支持 OpenAI、Anthropic、Google、AWS 四种协议
- 自定义提供商协议选择器显示逻辑

## 设计背景

### 问题

v4.1.45 及之前版本存在以下问题：
- 自定义提供商只能使用 OpenAI 协议
- 无法为自定义提供商配置 Anthropic、Google 等协议
- 协议配置在提供商和模型两个层级，容易混淆
- 后端没有 `protocol` 字段，导致协议路由失败

### 解决方案 (v4.1.46 - v0.9.4)

采用**双层协议配置**方案：

- **提供商级别**：设置默认协议（`AIProvider.protocol`）
- **模型级别**：可选择覆盖协议（`AIModelConfig.protocol`）
- **优先级规则**：模型协议 > 提供商默认协议
- 后端添加 `protocol` 字段支持
- 前端传递 `protocol` 到所有 API 调用（测试、对话）

**设计理念：**

- 提供商的默认协议作为基准，简化模型创建流程
- 模型可以根据实际需要覆盖协议，提供灵活性
- 如果模型没有指定协议，自动使用提供商的默认协议

## 协议类型

### ProtocolType

```typescript
type ProtocolType = 'openai' | 'anthropic' | 'google' | 'aws';
```

### 协议信息

| 协议 ID | 名称 | 适用服务 |
|---------|------|----------|
| openai | OpenAI 兼容 | OpenAI, DeepSeek, Groq, Together, Ollama 等 |
| anthropic | Anthropic 兼容 | Claude API 兼容服务 |
| google | Google Gemini | Gemini API 兼容服务 |
| aws | AWS Bedrock | AWS Bedrock, Kiro 等服务 |

## 接口定义

### 前端接口

#### AIProvider (v0.9.4 更新)

```typescript
interface AIProvider {
    // ... 其他字段
    /** 默认通信协议类型 (v0.9.0, v0.9.4: 作为默认值) */
    protocol?: ProtocolType;
}
```

#### AIModelConfig

```typescript
interface AIModelConfig {
    // ... 其他字段
    /** 通信协议类型 (v4.1.46, v0.9.4: 可覆盖提供商默认协议) */
    protocol?: ProtocolType;
}
```

#### getEffectiveProtocol(model: AIModelConfig, provider: AIProvider): ProtocolType (v0.9.4 新增)

获取模型的有效协议（考虑优先级）

**参数：**

- model (AIModelConfig): 模型配置
- provider (AIProvider): 提供商配置

**返回：**

- ProtocolType: 有效的协议类型

**逻辑：**

1. 如果模型指定了协议，使用模型协议
2. 否则，如果提供商指定了默认协议，使用提供商协议
3. 否则，使用 `getDefaultProtocol(provider.id)` 推断

**示例：**

```typescript
// 场景 1: 模型指定了协议
const model1 = { protocol: 'anthropic', provider: 'custom-xxx' };
const provider1 = { id: 'custom-xxx', protocol: 'openai' };
getEffectiveProtocol(model1, provider1); // 'anthropic' (模型优先)

// 场景 2: 模型未指定，使用提供商默认
const model2 = { provider: 'custom-xxx' };
const provider2 = { id: 'custom-xxx', protocol: 'google' };
getEffectiveProtocol(model2, provider2); // 'google' (提供商默认)

// 场景 3: 都未指定，使用推断
const model3 = { provider: 'custom-xxx' };
const provider3 = { id: 'custom-xxx' };
getEffectiveProtocol(model3, provider3); // 'openai' (推断默认)
```

#### shouldShowProtocolSelector(providerId: string): boolean

判断是否需要显示协议选择器

**参数：**

- providerId (string): 提供商 ID

**返回：**

- boolean: 是否显示协议选择器

**逻辑 (v0.9.4 更新)：**

- **提供商创建/编辑**：自定义提供商显示，用于设置默认协议
- **模型创建/编辑**：所有提供商都显示，允许覆盖默认协议

**示例：**

```typescript
// 提供商创建时
shouldShowProtocolSelector('custom-1706000000000')  // true (自定义提供商)
shouldShowProtocolSelector('openai')                 // false (内置提供商)

// 模型创建时
// 所有提供商都显示协议选择器，允许用户覆盖
```

#### getDefaultProtocol(providerId: string): ProtocolType

获取提供商的默认协议

**参数：**
- providerId (string): 提供商 ID

**返回：**
- ProtocolType: 默认协议类型

**映射规则：**
```typescript
{
    'openai': 'openai',
    'deepseek': 'openai',
    'groq': 'openai',
    'anthropic': 'anthropic',
    'google': 'google',
    'kiro': 'aws',
    'bedrock': 'aws',
    'custom': 'openai',  // 自定义提供商默认 OpenAI
}
```

### 后端接口

#### TestModelRequest

```rust
pub struct TestModelRequest {
    pub provider: String,
    pub api_key: String,
    pub endpoint: Option<String>,
    pub model_name: Option<String>,
    /// v4.1.46: 协议类型（用于自定义供应商）
    pub protocol: Option<String>,
}
```

#### ChatStreamRequest

```rust
pub struct ChatStreamRequest {
    // ... 其他字段
    /// v4.1.46: 协议类型
    pub protocol: Option<String>,
}
```

## 协议路由逻辑 (v0.9.4 更新)

### 协议解析优先级

```rust
// 1. 优先使用模型的 protocol 字段
// 2. 其次使用提供商的 protocol 字段
// 3. 最后根据 provider ID 推断

let protocol = request.protocol.as_ref()
    .map(|p| p.to_lowercase())
    .or_else(|| provider_protocol.as_ref().map(|p| p.to_lowercase()))
    .unwrap_or_else(|| provider_lower.clone());
```

### 模型测试路由

```rust
// 1. 解析有效协议（考虑优先级）
let protocol = get_effective_protocol(&request);

// 2. 根据协议路由
match protocol.as_str() {
    "anthropic" => test_anthropic(&client, &request).await,
    "google" => test_google(&client, &request).await,
    "aws" => test_kiro(&client, &request).await,
    _ => test_openai_compatible(&client, &request).await,
}
```

### 对话流式路由

```rust
// 1. 解析有效协议（考虑优先级）
let protocol = get_effective_protocol(&request);

// 2. Anthropic 协议检查
if protocol == "anthropic" {
    return chat_stream_anthropic(window, &request, &client).await;
}

// 3. Google 协议检查
if protocol == "google" {
    return chat_stream_google(window, &request, &client).await;
}

// 4. AWS 协议检查
if protocol == "aws" {
    return chat_stream_kiro(window, &request, &client).await;
}

// 5. 默认使用 OpenAI 协议
chat_stream_openai(window, &request, &client).await
```

## 测试用例

### 协议优先级测试 (v0.9.4 新增)

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-PROTO-PRIORITY-001 | 模型指定协议 | model.protocol='anthropic', provider.protocol='openai' | 使用 'anthropic' |
| TC-PROTO-PRIORITY-002 | 模型未指定，使用提供商 | model.protocol=null, provider.protocol='google' | 使用 'google' |
| TC-PROTO-PRIORITY-003 | 都未指定，使用推断 | model.protocol=null, provider.protocol=null, provider.id='openai' | 使用 'openai' |
| TC-PROTO-PRIORITY-004 | 自定义提供商推断 | model.protocol=null, provider.protocol=null, provider.id='custom-xxx' | 使用 'openai' |

### 协议选择器显示逻辑 (v0.9.4 更新)

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-PROTO-001 | 提供商创建：自定义 | providerId='custom', context='provider' | 显示协议选择器 |
| TC-PROTO-002 | 提供商创建：内置 | providerId='openai', context='provider' | 不显示协议选择器 |
| TC-PROTO-003 | 模型创建：任意提供商 | providerId='openai', context='model' | 显示协议选择器（允许覆盖） |
| TC-PROTO-004 | 模型创建：自定义提供商 | providerId='custom-xxx', context='model' | 显示协议选择器 |
| TC-PROTO-005 | 模型编辑：显示当前值 | model.protocol='anthropic' | 选择器默认选中 'anthropic' |

### 默认协议获取

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-PROTO-011 | OpenAI 提供商 | providerId='openai' | 返回 'openai' |
| TC-PROTO-012 | DeepSeek 提供商 | providerId='deepseek' | 返回 'openai' |
| TC-PROTO-013 | Anthropic 提供商 | providerId='anthropic' | 返回 'anthropic' |
| TC-PROTO-014 | Google 提供商 | providerId='google' | 返回 'google' |
| TC-PROTO-015 | Kiro 提供商 | providerId='kiro' | 返回 'aws' |
| TC-PROTO-016 | 自定义提供商 | providerId='custom' | 返回 'openai' |
| TC-PROTO-017 | 未知提供商 | providerId='unknown' | 返回 'openai' |

### 模型测试协议路由

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-PROTO-TEST-001 | OpenAI 协议测试 | protocol='openai' | 使用 OpenAI API 测试 |
| TC-PROTO-TEST-002 | Anthropic 协议测试 | protocol='anthropic' | 使用 Anthropic API 测试 |
| TC-PROTO-TEST-003 | Google 协议测试 | protocol='google' | 使用 Google API 测试 |
| TC-PROTO-TEST-004 | AWS 协议测试 | protocol='aws' | 使用 AWS API 测试 |
| TC-PROTO-TEST-005 | 无 protocol 字段 | protocol=null, provider='openai' | 使用 provider 推断协议 |
| TC-PROTO-TEST-006 | 自定义提供商 OpenAI | protocol='openai', provider='custom-xxx' | 使用 OpenAI API 测试 |
| TC-PROTO-TEST-007 | 自定义提供商 Anthropic | protocol='anthropic', provider='custom-xxx' | 使用 Anthropic API 测试 |

### 对话流式协议路由

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-PROTO-CHAT-001 | OpenAI 协议对话 | protocol='openai' | 使用 Chat Completions API |
| TC-PROTO-CHAT-002 | Anthropic 协议对话 | protocol='anthropic' | 使用 Anthropic Messages API |
| TC-PROTO-CHAT-003 | Google 协议对话 | protocol='google' | 使用 Google Gemini API |
| TC-PROTO-CHAT-004 | 无 protocol 字段 | protocol=null, provider='anthropic' | 使用 Anthropic API |
| TC-PROTO-CHAT-005 | 自定义提供商 Anthropic | protocol='anthropic', provider='custom-xxx' | 使用 Anthropic API |
| TC-PROTO-CHAT-006 | 协议优先级 | protocol='openai', provider='anthropic' | 使用 OpenAI API（protocol 优先） |

### 模型配置保存 (v0.9.4 更新)

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-PROTO-SAVE-001 | 创建模型时指定协议 | protocol='anthropic' | model.protocol='anthropic' |
| TC-PROTO-SAVE-002 | 创建模型时不指定协议 | protocol=undefined | model.protocol=undefined（使用提供商默认） |
| TC-PROTO-SAVE-003 | 更新模型时修改协议 | 修改 protocol='google' | model.protocol='google' |
| TC-PROTO-SAVE-004 | 更新模型时清空协议 | protocol=undefined | model.protocol=undefined（回退到提供商默认） |
| TC-PROTO-SAVE-005 | 提供商设置默认协议 | provider.protocol='anthropic' | 新模型默认使用 'anthropic' |

### 集成测试 (v0.9.4 更新)

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-PROTO-INT-001 | 完整流程：创建自定义提供商 | 设置 provider.protocol='anthropic' | 新模型默认使用 Anthropic API |
| TC-PROTO-INT-002 | 完整流程：模型覆盖协议 | provider.protocol='openai', model.protocol='anthropic' | 对话使用 Anthropic API |
| TC-PROTO-INT-003 | 完整流程：多个模型不同协议 | 同一提供商下 3 个不同协议的模型 | 每个模型使用正确的协议 |
| TC-PROTO-INT-004 | 完整流程：应用重启 | 重启应用 | 提供商和模型的协议配置都保留 |
| TC-PROTO-INT-005 | 完整流程：修改提供商协议 | 修改 provider.protocol | 未指定协议的模型自动使用新协议 |

## UI 交互 (v0.9.4 更新)

### 自定义提供商创建/编辑对话框

**协议选择器显示：** 显示

**协议选择器 UI：**

```tsx
<FormControl fullWidth>
    <InputLabel>默认通信协议</InputLabel>
    <Select value={protocol} onChange={handleProtocolChange}>
        <MenuItem value="openai">OpenAI 兼容</MenuItem>
        <MenuItem value="anthropic">Anthropic 兼容</MenuItem>
        <MenuItem value="google">Google Gemini</MenuItem>
        <MenuItem value="aws">AWS Bedrock</MenuItem>
    </Select>
    <FormHelperText>
        此协议将作为该提供商下新建模型的默认协议
    </FormHelperText>
</FormControl>
```

### 模型创建/编辑对话框

**协议选择器显示：** 始终显示（允许覆盖提供商默认）

**协议选择器 UI：**

```tsx
<FormControl fullWidth>
    <InputLabel>通信协议</InputLabel>
    <Select
        value={protocol || provider.protocol || getDefaultProtocol(provider.id)}
        onChange={handleProtocolChange}
    >
        <MenuItem value="openai">OpenAI 兼容</MenuItem>
        <MenuItem value="anthropic">Anthropic 兼容</MenuItem>
        <MenuItem value="google">Google Gemini</MenuItem>
        <MenuItem value="aws">AWS Bedrock</MenuItem>
    </Select>
    <FormHelperText>
        {protocol
            ? "使用自定义协议"
            : `使用提供商默认协议 (${provider.protocol || getDefaultProtocol(provider.id)})`
        }
    </FormHelperText>
</FormControl>
```

**提示文案：**

- 如果模型未指定协议：显示"使用提供商默认协议 (openai)"
- 如果模型指定了协议：显示"使用自定义协议"

## 错误处理

### 协议不匹配

**场景：** 选择的协议与 API 端点不兼容

**错误信息：**
```
协议不匹配：API 返回了意外的响应格式
请检查：
1. API 端点是否正确
2. 选择的协议是否与服务兼容
3. API Key 是否有效
```

### 协议字段缺失

**场景：** 旧版本模型没有 protocol 字段

**处理方式：**
- 后端使用 `provider` 字段推断协议
- 前端提示用户重新编辑模型以保存协议

## 迁移指南

### 从 v4.1.45 升级到 v4.1.46

**自定义提供商：**
1. 旧版本在提供商级别配置的协议将被忽略
2. 需要重新编辑每个模型，选择正确的协议
3. 保存后协议配置生效

**内置提供商：**
- 无需任何操作，自动使用默认协议

**数据兼容性：**
- 旧版本模型没有 `protocol` 字段，后端会使用 `provider` 推断
- 建议重新编辑模型以显式保存协议

## 实现文件

### 前端

| 文件 | 职责 |
|------|------|
| src/data/protocols.ts | 协议配置数据和工具函数 |
| src/types/index.ts | 类型定义 |
| src/App.tsx | 模型管理和 API 调用 |
| src/hooks/useAppBootstrap.ts | 应用启动时加载自定义提供商 |
| src/components/features/Providers/CustomProviderModal.tsx | 自定义提供商 UI |

### 后端

| 文件 | 职责 |
|------|------|
| src-tauri/src/lib.rs | 协议路由逻辑 |

## 已知问题与修复

### [已修复] v0.9.5: 自定义提供商协议未持久化

**问题描述：**

在 v0.9.4 中，虽然 CustomProvider 接口有 `protocol` 字段，且 CustomProviderModal 正确保存了该字段，但在 useAppBootstrap.ts 加载自定义提供商时，硬编码了 `protocol: 'openai'`，导致用户设置的协议配置丢失。

**影响范围：**

- 用户在自定义提供商中设置的协议（如 anthropic、google、aws）在应用重启后会被重置为 openai
- 导致使用错误的协议调用 API，可能导致请求失败

**根本原因：**

[useAppBootstrap.ts:314](useAppBootstrap.ts#L314) 中硬编码了协议：

```typescript
// ❌ 错误代码
const customAIProviders: AIProvider[] = customProviders.map(cp => ({
    // ...
    protocol: 'openai',  // 硬编码，忽略了 cp.protocol
    // ...
}));
```

**修复方案：**

使用 CustomProvider 中保存的 protocol 字段：

```typescript
// ✅ 修复后
const customAIProviders: AIProvider[] = customProviders.map(cp => ({
    // ...
    protocol: cp.protocol,  // v0.9.5: 使用保存的协议配置
    // ...
}));
```

**测试验证：**

**存储层测试** ([customProviderStorage.test.ts](../../src/test/services/customProviderStorage.test.ts))

| 用例ID | 场景 | 预期结果 | 状态 |
|--------|------|----------|------|
| TC-PROTO-PERSIST-001 | 创建自定义提供商并设置 protocol='anthropic' | 重启后 protocol 仍为 'anthropic' | 通过 |
| TC-PROTO-PERSIST-002 | 编辑自定义提供商修改 protocol='google' | 重启后 protocol 为 'google' | 通过 |
| TC-PROTO-PERSIST-003 | 自定义提供商未设置 protocol | 使用 getDefaultProtocol 推断 | 通过 |
| TC-PROTO-PERSIST-004 | 保存和加载 AWS 协议配置 | protocol 正确持久化为 'aws' | 通过 |
| TC-PROTO-PERSIST-005 | 多个提供商不同协议 | 所有协议都能正确持久化 | 通过 |

**映射层测试** ([useAppBootstrap.protocol.test.ts](../../src/test/hooks/useAppBootstrap.protocol.test.ts))

| 用例ID | 场景 | 预期结果 | 状态 |
|--------|------|----------|------|
| TC-PROTO-MAPPING-001 | 加载时保留 Anthropic 协议配置 | 映射后 protocol 仍为 'anthropic' | 通过 |
| TC-PROTO-MAPPING-002 | 加载时保留 Google 协议配置 | 映射后 protocol 仍为 'google' | 通过 |
| TC-PROTO-MAPPING-003 | 加载时保留 AWS 协议配置 | 映射后 protocol 仍为 'aws' | 通过 |
| TC-PROTO-MAPPING-004 | 加载时保留 undefined 协议 | 映射后 protocol 为 undefined | 通过 |
| TC-PROTO-MAPPING-005 | 加载多个提供商时保留各自协议 | 所有协议都正确映射 | 通过 |
| TC-PROTO-MAPPING-006 | 不会硬编码协议为 openai（回归测试） | 验证修复前后的差异 | 通过 |

**修复版本：** v0.9.5

**相关文件：**

- [useAppBootstrap.ts:314](useAppBootstrap.ts#L314) - 修复协议加载逻辑
- [docs/modules/protocol-configuration.md](docs/modules/protocol-configuration.md) - 更新文档

## 变更记录

| 日期 | 版本 | 修改内容 | 修改人 |
|------|------|----------|--------|
| 2026-03-09 | v0.9.5 | 修复 useAppBootstrap 中自定义提供商协议未持久化问题 | Claude |
| 2024-03-09 | v0.9.4 | 实现双层协议配置：提供商默认协议 + 模型覆盖协议 | Claude |
| 2024-03-09 | v0.9.4 | 添加 getEffectiveProtocol 函数实现协议优先级逻辑 | Claude |
| 2024-03-09 | v0.9.4 | 更新测试用例，新增协议优先级测试 | Claude |
| 2024-03-03 | v4.1.46 | 初始版本：实现模型级别协议配置 | Claude |
