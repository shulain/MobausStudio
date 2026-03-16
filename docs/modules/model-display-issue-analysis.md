# Claude 4.6 Model Display Issue Analysis / Claude 4.6 模型不显示问题分析

> [English](#english) | [中文](#中文)

<a id="english"></a>

## Problem Description

User feedback: After connecting the Anthropic provider, Claude 4.6 series models are not visible in the chat interface's model selector.

## Root Cause

After a thorough analysis, two independent data flows were identified:

### Data Flow 1: Providers (Provider Configuration)

```
providers.ts (built-in config)
  |
App.tsx: providers state
  |
Call modelFetcher.fetchModels() when connecting provider
  |
Update providers[].models
  |
Pass to ProviderPage for display
```

**Purpose:** Only used for the provider management page, displaying the list of models supported by the provider

### Data Flow 2: Models (User-configured Models)

```
modelsStorage (persistent storage)
  |
App.tsx: models state (AIModelConfig[])
  |
Pass to ChatPage
  |
ChatWindow filters models with status === 'online'
  |
Display in model selector
```

**Purpose:** Used for the chat interface, displaying models actually configured and tested by the user

## Key Findings

### 1. Two Independent Data Structures

**AIProvider.models (ProviderModel[])**
```typescript
interface ProviderModel {
    id: string;
    name: string;
    maxTokens: number;
    contextWindow: number;
    capabilities?: {
        vision?: boolean;
        functionCalling?: boolean;
        streaming?: boolean;
    };
    pricing?: {
        input: number;
        output: number;
    };
}
```

**AIModelConfig (extends AIModel)**
```typescript
interface AIModel {
    id: string;
    name: string;
    provider: string;
    status: 'online' | 'offline' | 'error';  // Key field
    apiKeySet: boolean;
    endpoint: string;
    maxTokens: number;
    pricing: { input: number; output: number };
}

interface AIModelConfig extends AIModel {
    modelId?: string;
    apiKey?: string;
    baseUrl?: string;
    temperature?: number;
    contextWindow?: number;
    // ...
    createdAt: Date;
    updatedAt: Date;
}
```

### 2. Model Display Filter Condition

**ChatWindow.tsx Lines 229-231:**
```typescript
const availableModels = useMemo(() => {
    return models.filter(m => m.status === 'online');
}, [models]);
```

**Key:** Only models with `status === 'online'` are displayed in the chat interface's model selector!

### 3. When Model Status Is Set

The model's `status` field is only set to `'online'` in the following cases:

1. **User manually tests model successfully** (App.tsx Line 4308)
   ```typescript
   status: response.success ? 'online' as const : 'error' as const
   ```

2. **Batch test models successfully** (App.tsx Line 4409)
   ```typescript
   status: response.success ? 'online' as const : 'error' as const
   ```

**Problem:** When connecting a provider, although `providers[].models` is updated, the `models` state (AIModelConfig[]) is NOT automatically updated!

## Complete Flow Comparison

### Current Flow (Problematic)

```
1. User connects Anthropic provider
   |
2. handleProviderConnect() calls modelFetcher.fetchModels()
   |
3. Fetches Claude 4.6 models from models.dev
   |
4. Updates providers state:
   providers.find(p => p.id === 'anthropic').models = [
       { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', ... },
       { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', ... },
       ...
   ]
   |
5. models state NOT updated!
   |
6. ChatWindow filters models with status === 'online'
   |
7. Cannot find Claude 4.6 models (because they're not in models)
```

### Expected Flow (Should Be)

```
1. User connects Anthropic provider
   |
2. handleProviderConnect() calls modelFetcher.fetchModels()
   |
3. Fetches Claude 4.6 models from models.dev
   |
4. Updates providers state
   |
5. Also updates models state:
   - Create AIModelConfig object for each new model
   - Set status: 'offline' (pending test)
   - Or auto-test and set status: 'online'
   |
6. ChatWindow filters models with status === 'online'
   |
7. Displays Claude 4.6 models
```

## Solutions

### Solution 1: Auto-add Models to models on Provider Connection (Recommended)

In `handleProviderConnect` and `handleProviderOAuthConnect`, after fetching new models, automatically add them to the `models` state:

```typescript
// App.tsx - handleProviderConnect
const handleProviderConnect = async (providerId: string, apiKey: string) => {
    // ... existing code ...

    // Try to dynamically fetch model list
    let updatedModels = provider.models;
    if (modelFetcher.supportsDynamicFetch(providerId)) {
        try {
            const { models: fetchedModels, source } = await modelFetcher.fetchModels(
                providerId,
                apiKey,
                provider.defaultEndpoint,
                provider.models
            );

            if (fetchedModels.length > 0) {
                updatedModels = fetchedModels;
                logger.info(LogTags.APP, `Fetched ${fetchedModels.length} models from ${source}`);

                // NEW: Add fetched models to models state
                const newModelConfigs: AIModelConfig[] = fetchedModels.map(m => ({
                    id: `${providerId}-${m.id}`,  // Generate unique ID
                    name: m.name,
                    provider: providerId,
                    status: 'offline' as const,  // Initial status offline, needs testing
                    apiKeySet: true,
                    endpoint: provider.defaultEndpoint,
                    maxTokens: m.maxTokens,
                    contextWindow: m.contextWindow || m.maxTokens,
                    pricing: m.pricing || { input: 0, output: 0 },
                    modelId: m.id,  // Original model ID
                    useProviderCredential: true,  // Use provider credentials
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }));

                // Filter out existing models, only add new ones
                setModels(prev => {
                    const existingIds = new Set(prev.map(m => m.id));
                    const toAdd = newModelConfigs.filter(m => !existingIds.has(m.id));
                    return [...prev, ...toAdd];
                });

                // Optional: Auto-test newly added models
                // So users can see available models immediately
                // await handleBatchTestModels(newModelConfigs.map(m => m.id));
            }
        } catch (error) {
            logger.warn(LogTags.APP, 'Dynamic model fetch failed, using built-in list', error);
        }
    }

    // Update providers state
    setProviders(prev => prev.map(p =>
        p.id === providerId
            ? { ...p, status: 'connected', models: updatedModels }
            : p
    ));

    // ... existing code ...
};
```

### Solution 2: Provide an "Import Models" Button

Add an "Import Models to Chat" button in ProviderPage, allowing users to manually select models to import:

```typescript
const handleImportModels = async (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider || provider.status !== 'connected') return;

    // Import provider models to models state
    const newModelConfigs: AIModelConfig[] = provider.models.map(m => ({
        id: `${providerId}-${m.id}`,
        name: m.name,
        provider: providerId,
        status: 'offline' as const,
        apiKeySet: true,
        endpoint: provider.defaultEndpoint,
        maxTokens: m.maxTokens,
        contextWindow: m.contextWindow || m.maxTokens,
        pricing: m.pricing || { input: 0, output: 0 },
        modelId: m.id,
        useProviderCredential: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    }));

    setModels(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const toAdd = newModelConfigs.filter(m => !existingIds.has(m.id));
        return [...prev, ...toAdd];
    });

    // Notify user
    addToast({
        type: 'success',
        title: 'Models imported successfully',
        message: `Imported ${newModelConfigs.length} models, please go to Models page to test`,
    });
};
```

### Solution 3: Auto-test and Activate Models

After connecting a provider, automatically test all models, and set successfully tested models to `online`:

```typescript
// At the end of handleProviderConnect
if (fetchedModels.length > 0) {
    // Add models to models state
    // ...

    // Auto-test all new models
    const newModelIds = newModelConfigs.map(m => m.id);
    await handleBatchTestModels(newModelIds);
}
```

## Recommended Implementation Steps

### Step 1: Implement Solution 1 (Auto-add Models)

Modify `handleProviderConnect` and `handleProviderOAuthConnect` to automatically add models to the `models` state after fetching new models.

### Step 2: Add Auto-test (Optional)

If you want models to be immediately usable after connection, you can auto-test newly added models. However this may:
- Increase connection time
- Consume API quota
- Cause poor user experience if tests fail

**Recommendation:** Don't auto-test, instead show a prompt on the Models page: "X new models pending test".

### Step 3: Optimize UI Prompts

In ChatWindow, if there are no `online` models, show a friendlier prompt:

```typescript
{availableModels.length === 0 ? (
    <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5 rounded-lg">
        <AlertCircle size={16} />
        <span>
            {models.length > 0
                ? 'Please go to Models page to test models'
                : 'Please connect a provider and add models first'}
        </span>
    </div>
) : (
    // Model selector
)}
```

## Test Verification

### Test Case 1: Connect New Provider

1. Disconnect Anthropic provider
2. Clear Anthropic models from models state
3. Reconnect Anthropic
4. Verify:
   - providers contains Claude 4.6 models
   - models auto-added Claude 4.6 models
   - Model status is `offline`
   - New models visible on Models page
   - Not visible on Chat page (because status is not online)

### Test Case 2: Models Display After Testing

1. Test Claude 4.6 model on Models page
2. Verify:
   - After successful test, model status changes to `online`
   - Claude 4.6 visible in Chat page model selector

### Test Case 3: Cache Clearing

1. Clear modelFetcher cache
2. Reconnect Anthropic
3. Verify:
   - Re-fetches latest model list from models.dev
   - Contains Claude 4.6 models

## Data Flow Diagram (After Fix)

```
+-------------------------------------------------------------+
| User action: Connect Anthropic provider                      |
+-------------------------------------------------------------+
                          |
+-------------------------------------------------------------+
| handleProviderConnect()                                      |
| - Save credentials to providerCredentialsStorage             |
| - Call modelFetcher.fetchModels()                           |
+-------------------------------------------------------------+
                          |
+-------------------------------------------------------------+
| modelFetcher.fetchModels('anthropic', apiKey)               |
| 1. Try fetching from Anthropic API (not supported, skip)    |
| 2. Fetch from models.dev                                     |
|    - claude-opus-4-6                                         |
|    - claude-sonnet-4-6                                       |
|    - claude-opus-4-5                                         |
|    - ...                                                     |
| 3. Update cache                                              |
+-------------------------------------------------------------+
                          |
+-------------------------------------------------------------+
| Update two states:                                           |
|                                                              |
| 1. providers state                                           |
|    providers.find(p => p.id === 'anthropic').models = [     |
|        { id: 'claude-opus-4-6', name: '...', ... },         |
|        ...                                                   |
|    ]                                                         |
|                                                              |
| 2. models state (new)                                        |
|    setModels(prev => [...prev, ...newModelConfigs])         |
|    newModelConfigs = [                                       |
|        {                                                     |
|            id: 'anthropic-claude-opus-4-6',                 |
|            name: 'Claude Opus 4.6 Strongest',               |
|            provider: 'anthropic',                            |
|            status: 'offline',  // Pending test               |
|            modelId: 'claude-opus-4-6',                      |
|            useProviderCredential: true,                      |
|            ...                                               |
|        },                                                    |
|        ...                                                   |
|    ]                                                         |
+-------------------------------------------------------------+
                          |
+-------------------------------------------------------------+
| User goes to Models page                                     |
| - Sees newly added Claude 4.6 models                        |
| - Status shows "offline" or "pending test"                   |
| - Clicks "Test" button                                       |
+-------------------------------------------------------------+
                          |
+-------------------------------------------------------------+
| handleTestModel()                                            |
| - Calls test_model Tauri command                             |
| - Test successful                                            |
| - Update model status: status = 'online'                     |
+-------------------------------------------------------------+
                          |
+-------------------------------------------------------------+
| User returns to Chat page                                    |
| - ChatWindow filters models with status === 'online'         |
| - Displays Claude 4.6 model in selector                     |
| - User can select and use it                                 |
+-------------------------------------------------------------+
```

## Summary

**Root Cause:** `providers` and `models` are two independent data flows. When connecting a provider, only `providers` was updated, not `models`, causing new models to be invisible in the chat interface.

**Solution:** After connecting a provider and fetching new models, automatically add models to the `models` state with initial status set to `offline`. After user testing, status changes to `online`, making them usable in the chat interface.

**Priority:** High - This is a critical issue affecting user experience and should be fixed as soon as possible.

---

<a id="中文"></a>

## 问题现象

用户反馈：连接 Anthropic 提供商后，在聊天界面的模型选择器中看不到 Claude 4.6 系列模型。

## 根本原因

经过完整梳理，发现了两个独立的数据流：

### 数据流 1：Providers（提供商配置）

```
providers.ts (内置配置)
  ↓
App.tsx: providers 状态
  ↓
连接提供商时调用 modelFetcher.fetchModels()
  ↓
更新 providers[].models
  ↓
传递给 ProviderPage 显示
```

**用途：** 仅用于提供商管理页面，显示提供商支持的模型列表

### 数据流 2：Models（用户配置的模型）

```
modelsStorage (持久化存储)
  ↓
App.tsx: models 状态 (AIModelConfig[])
  ↓
传递给 ChatPage
  ↓
ChatWindow 过滤 status === 'online' 的模型
  ↓
显示在模型选择器中
```

**用途：** 用于聊天界面，显示用户实际配置和测试通过的模型

## 关键发现

### 1. 两个独立的数据结构

**AIProvider.models (ProviderModel[])**
```typescript
interface ProviderModel {
    id: string;
    name: string;
    maxTokens: number;
    contextWindow: number;
    capabilities?: {
        vision?: boolean;
        functionCalling?: boolean;
        streaming?: boolean;
    };
    pricing?: {
        input: number;
        output: number;
    };
}
```

**AIModelConfig (extends AIModel)**
```typescript
interface AIModel {
    id: string;
    name: string;
    provider: string;
    status: 'online' | 'offline' | 'error';  // ⚠️ 关键字段
    apiKeySet: boolean;
    endpoint: string;
    maxTokens: number;
    pricing: { input: number; output: number };
}

interface AIModelConfig extends AIModel {
    modelId?: string;
    apiKey?: string;
    baseUrl?: string;
    temperature?: number;
    contextWindow?: number;
    // ...
    createdAt: Date;
    updatedAt: Date;
}
```

### 2. 模型显示的过滤条件

**ChatWindow.tsx 第 229-231 行：**
```typescript
const availableModels = useMemo(() => {
    return models.filter(m => m.status === 'online');
}, [models]);
```

**关键：** 只有 `status === 'online'` 的模型才会显示在聊天界面的模型选择器中！

### 3. 模型状态的设置时机

模型的 `status` 字段只在以下情况下设置为 `'online'`：

1. **用户手动测试模型成功** (App.tsx 第 4308 行)
   ```typescript
   status: response.success ? 'online' as const : 'error' as const
   ```

2. **批量测试模型成功** (App.tsx 第 4409 行)
   ```typescript
   status: response.success ? 'online' as const : 'error' as const
   ```

**问题：** 连接提供商时，虽然 `providers[].models` 更新了，但 `models` 状态（AIModelConfig[]）并没有自动更新！

## 完整流程对比

### 当前流程（有问题）

```
1. 用户连接 Anthropic 提供商
   ↓
2. handleProviderConnect() 调用 modelFetcher.fetchModels()
   ↓
3. 从 models.dev 获取到 Claude 4.6 模型
   ↓
4. 更新 providers 状态：
   providers.find(p => p.id === 'anthropic').models = [
       { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', ... },
       { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', ... },
       ...
   ]
   ↓
5. ❌ models 状态没有更新！
   ↓
6. ChatWindow 从 models 中过滤 status === 'online' 的模型
   ↓
7. ❌ 找不到 Claude 4.6 模型（因为 models 中没有）
```

### 预期流程（应该是）

```
1. 用户连接 Anthropic 提供商
   ↓
2. handleProviderConnect() 调用 modelFetcher.fetchModels()
   ↓
3. 从 models.dev 获取到 Claude 4.6 模型
   ↓
4. 更新 providers 状态
   ↓
5. ✅ 同时更新 models 状态：
   - 为每个新模型创建 AIModelConfig 对象
   - 设置 status: 'offline'（待测试）
   - 或者自动测试并设置 status: 'online'
   ↓
6. ChatWindow 从 models 中过滤 status === 'online' 的模型
   ↓
7. ✅ 显示 Claude 4.6 模型
```

## 解决方案

### 方案 1：连接提供商时自动添加模型到 models（推荐）

在 `handleProviderConnect` 和 `handleProviderOAuthConnect` 中，获取到新模型后，自动添加到 `models` 状态：

```typescript
// App.tsx - handleProviderConnect
const handleProviderConnect = async (providerId: string, apiKey: string) => {
    // ... 现有代码 ...

    // 尝试动态获取模型列表
    let updatedModels = provider.models;
    if (modelFetcher.supportsDynamicFetch(providerId)) {
        try {
            const { models: fetchedModels, source } = await modelFetcher.fetchModels(
                providerId,
                apiKey,
                provider.defaultEndpoint,
                provider.models
            );

            if (fetchedModels.length > 0) {
                updatedModels = fetchedModels;
                logger.info(LogTags.APP, `从 ${source} 获取到 ${fetchedModels.length} 个模型`);

                // ✅ 新增：将获取到的模型添加到 models 状态
                const newModelConfigs: AIModelConfig[] = fetchedModels.map(m => ({
                    id: `${providerId}-${m.id}`,  // 生成唯一 ID
                    name: m.name,
                    provider: providerId,
                    status: 'offline' as const,  // 初始状态为 offline，需要测试
                    apiKeySet: true,
                    endpoint: provider.defaultEndpoint,
                    maxTokens: m.maxTokens,
                    contextWindow: m.contextWindow || m.maxTokens,
                    pricing: m.pricing || { input: 0, output: 0 },
                    modelId: m.id,  // 原始模型 ID
                    useProviderCredential: true,  // 使用提供商凭证
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }));

                // 过滤掉已存在的模型，只添加新模型
                setModels(prev => {
                    const existingIds = new Set(prev.map(m => m.id));
                    const toAdd = newModelConfigs.filter(m => !existingIds.has(m.id));
                    return [...prev, ...toAdd];
                });

                // ✅ 可选：自动测试新添加的模型
                // 这样用户就能立即看到可用的模型
                // await handleBatchTestModels(newModelConfigs.map(m => m.id));
            }
        } catch (error) {
            logger.warn(LogTags.APP, '动态获取模型失败，使用内置列表', error);
        }
    }

    // 更新 providers 状态
    setProviders(prev => prev.map(p =>
        p.id === providerId
            ? { ...p, status: 'connected', models: updatedModels }
            : p
    ));

    // ... 现有代码 ...
};
```

### 方案 2：提供"导入模型"按钮

在 ProviderPage 中添加"导入模型到聊天"按钮，让用户手动选择要导入的模型：

```typescript
const handleImportModels = async (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider || provider.status !== 'connected') return;

    // 将提供商的模型导入到 models 状态
    const newModelConfigs: AIModelConfig[] = provider.models.map(m => ({
        id: `${providerId}-${m.id}`,
        name: m.name,
        provider: providerId,
        status: 'offline' as const,
        apiKeySet: true,
        endpoint: provider.defaultEndpoint,
        maxTokens: m.maxTokens,
        contextWindow: m.contextWindow || m.maxTokens,
        pricing: m.pricing || { input: 0, output: 0 },
        modelId: m.id,
        useProviderCredential: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    }));

    setModels(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const toAdd = newModelConfigs.filter(m => !existingIds.has(m.id));
        return [...prev, ...toAdd];
    });

    // 提示用户
    addToast({
        type: 'success',
        title: '模型导入成功',
        message: `已导入 ${newModelConfigs.length} 个模型，请前往模型页面测试`,
    });
};
```

### 方案 3：自动测试并激活模型

连接提供商后，自动测试所有模型，测试通过的模型自动设置为 `online`：

```typescript
// 在 handleProviderConnect 的最后
if (fetchedModels.length > 0) {
    // 添加模型到 models 状态
    // ...

    // 自动测试所有新模型
    const newModelIds = newModelConfigs.map(m => m.id);
    await handleBatchTestModels(newModelIds);
}
```

## 推荐实施步骤

### 步骤 1：实施方案 1（自动添加模型）

修改 `handleProviderConnect` 和 `handleProviderOAuthConnect`，在获取到新模型后自动添加到 `models` 状态。

### 步骤 2：添加自动测试（可选）

如果希望用户连接后立即可用，可以自动测试新添加的模型。但这可能会：
- 增加连接时间
- 消耗 API 配额
- 如果测试失败，用户体验不好

**建议：** 不自动测试，而是在 Models 页面提示用户"有 X 个新模型待测试"。

### 步骤 3：优化 UI 提示

在 ChatWindow 中，如果没有 `online` 模型，显示更友好的提示：

```typescript
{availableModels.length === 0 ? (
    <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5 rounded-lg">
        <AlertCircle size={16} />
        <span>
            {models.length > 0
                ? '请前往模型页面测试模型'
                : '请先连接提供商并添加模型'}
        </span>
    </div>
) : (
    // 模型选择器
)}
```

## 测试验证

### 测试用例 1：连接新提供商

1. 断开 Anthropic 提供商
2. 清空 models 状态中的 Anthropic 模型
3. 重新连接 Anthropic
4. 验证：
   - ✅ providers 中包含 Claude 4.6 模型
   - ✅ models 中自动添加了 Claude 4.6 模型
   - ✅ 模型状态为 `offline`
   - ✅ 在 Models 页面可以看到新模型
   - ⚠️ 在 Chat 页面看不到（因为 status 不是 online）

### 测试用例 2：测试模型后显示

1. 在 Models 页面测试 Claude 4.6 模型
2. 验证：
   - ✅ 测试成功后，模型状态变为 `online`
   - ✅ 在 Chat 页面的模型选择器中可以看到 Claude 4.6

### 测试用例 3：缓存清除

1. 清除 modelFetcher 缓存
2. 重新连接 Anthropic
3. 验证：
   - ✅ 从 models.dev 重新获取最新模型列表
   - ✅ 包含 Claude 4.6 模型

## 数据流图（修复后）

```
┌─────────────────────────────────────────────────────────────┐
│ 用户操作：连接 Anthropic 提供商                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ handleProviderConnect()                                     │
│ - 保存凭证到 providerCredentialsStorage                     │
│ - 调用 modelFetcher.fetchModels()                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ modelFetcher.fetchModels('anthropic', apiKey)              │
│ 1. 尝试从 Anthropic API 获取（不支持，跳过）                │
│ 2. 从 models.dev 获取 ✅                                    │
│    - claude-opus-4-6                                        │
│    - claude-sonnet-4-6                                      │
│    - claude-opus-4-5                                        │
│    - ...                                                    │
│ 3. 更新缓存                                                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 更新两个状态：                                               │
│                                                             │
│ 1. providers 状态 ✅                                        │
│    providers.find(p => p.id === 'anthropic').models = [    │
│        { id: 'claude-opus-4-6', name: '...', ... },        │
│        ...                                                  │
│    ]                                                        │
│                                                             │
│ 2. models 状态 ✅ (新增)                                    │
│    setModels(prev => [...prev, ...newModelConfigs])        │
│    newModelConfigs = [                                      │
│        {                                                    │
│            id: 'anthropic-claude-opus-4-6',                │
│            name: 'Claude Opus 4.6 ⭐最强',                  │
│            provider: 'anthropic',                           │
│            status: 'offline',  // 待测试                    │
│            modelId: 'claude-opus-4-6',                     │
│            useProviderCredential: true,                     │
│            ...                                              │
│        },                                                   │
│        ...                                                  │
│    ]                                                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 用户前往 Models 页面                                         │
│ - 看到新添加的 Claude 4.6 模型                               │
│ - 状态显示为 "offline" 或 "待测试"                          │
│ - 点击"测试"按钮                                             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ handleTestModel()                                           │
│ - 调用 test_model Tauri 命令                                │
│ - 测试成功 ✅                                                │
│ - 更新模型状态：status = 'online'                           │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 用户返回 Chat 页面                                           │
│ - ChatWindow 过滤 status === 'online' 的模型                │
│ - ✅ 显示 Claude 4.6 模型在选择器中                          │
│ - 用户可以选择并使用                                         │
└─────────────────────────────────────────────────────────────┘
```

## 总结

**问题根源：** `providers` 和 `models` 是两个独立的数据流，连接提供商时只更新了 `providers`，没有更新 `models`，导致聊天界面看不到新模型。

**解决方案：** 在连接提供商并获取到新模型后，自动将模型添加到 `models` 状态，初始状态设为 `offline`，用户测试通过后变为 `online`，即可在聊天界面使用。

**优先级：** 高 - 这是影响用户体验的关键问题，应该尽快修复。
