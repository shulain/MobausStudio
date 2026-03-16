# 模型加载、显示和选择完整流程

## 📋 概述

本文档完整梳理 MobausStudio 中模型从加载到显示再到选择的整个流程，帮助定位为什么 Claude 4.6 模型没有显示的问题。

## 🔄 完整流程图

```
启动应用
  ↓
App.tsx 初始化
  ↓
加载提供商凭证 (providerCredentialsStorage)
  ↓
检测已连接的提供商
  ↓
┌─────────────────────────────────────────┐
│ 对于每个已连接的提供商                    │
│                                         │
│ 1. 检查是否支持动态获取                  │
│    - DYNAMIC_FETCH_PROVIDERS            │
│    - MODELS_DEV_PROVIDERS               │
│                                         │
│ 2. 调用 modelFetcher.fetchModels()     │
│    ├─ 优先级 1: 提供商 API              │
│    ├─ 优先级 2: models.dev API         │
│    ├─ 优先级 3: 本地缓存                │
│    └─ 优先级 4: providers.ts 内置数据   │
│                                         │
│ 3. 更新 providers 状态                  │
│    - 合并动态获取的模型                  │
│    - 保留定价信息                        │
│                                         │
└─────────────────────────────────────────┘
  ↓
providers 状态更新
  ↓
传递给 ChatPage
  ↓
转换为 AIModel[] (models prop)
  ↓
传递给 ChatWindow
  ↓
ModelSelector 组件显示
  ↓
用户选择模型
```

## 📂 关键文件和代码位置

### 1. 模型数据源定义

**文件：** `src/data/providers.ts`

```typescript
// 第 78-127 行：Anthropic 提供商配置
{
    id: 'anthropic',
    models: [
        // 这些是 fallback 数据，仅在无法从 models.dev 获取时使用
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6 ⭐最强', ... },
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 ⭐推荐', ... },
        // ...
    ]
}
```

**重要：** 这里的模型 ID 必须与 models.dev 的格式完全一致（使用连字符，如 `claude-opus-4-6`）

### 2. 模型获取服务

**文件：** `src/services/modelFetcher.ts`

#### 2.1 支持的提供商列表

```typescript
// 第 118 行：支持从提供商 API 动态获取的提供商
const DYNAMIC_FETCH_PROVIDERS = ['openai', 'openrouter', 'google', 'groq', 'together'];

// 第 124-129 行：支持从 models.dev 获取的提供商
const MODELS_DEV_PROVIDERS = [
    'openai', 'anthropic', 'google', 'deepseek', 'openrouter',
    'groq', 'mistral', 'cohere', 'together', 'fireworks',
    'perplexity', 'cerebras', 'xai', 'bedrock', 'azure',
    'github-copilot', 'vertex', 'ollama', 'lmstudio'
];
```

**关键发现：** Anthropic 在 `MODELS_DEV_PROVIDERS` 中，但不在 `DYNAMIC_FETCH_PROVIDERS` 中，说明：
- ✅ Anthropic 会从 models.dev 获取模型
- ❌ Anthropic 不会从官方 API 获取模型（因为没有公开的模型列表端点）

#### 2.2 fetchModels 方法

```typescript
// 第 733-810 行：模型获取主方法
async fetchModels(
    providerId: string,
    apiKey: string,
    baseUrl?: string,
    builtinModels?: ProviderModel[]
): Promise<{ models: ProviderModel[]; source: string }> {
    // 1. 优先从提供商 API 获取（Anthropic 不支持，会跳过）
    if (DYNAMIC_FETCH_PROVIDERS.includes(providerId) && apiKey) {
        // ...
    }

    // 2. 从 models.dev 获取（Anthropic 走这里）
    try {
        let models = await this.fetchFromModelsDev(providerId);
        if (models.length > 0) {
            // 更新缓存
            cache[providerId] = {
                providerId,
                models,
                fetchedAt: Date.now(),
                source: 'models.dev',
            };
            await saveCacheAsync(cache);
            return { models, source: 'models.dev' };
        }
    } catch (error) {
        // ...
    }

    // 3. 使用缓存（即使过期）
    if (cachedData && cachedData.models.length > 0) {
        return { models: cachedData.models, source: 'cache' };
    }

    // 4. 使用内置数据（providers.ts）
    if (builtinModels && builtinModels.length > 0) {
        return { models: builtinModels, source: 'builtin' };
    }
}
```

#### 2.3 fetchFromModelsDev 方法

```typescript
// 第 580-664 行：从 models.dev 获取模型
async fetchFromModelsDev(providerId: string): Promise<ProviderModel[]> {
    // 1. 加载 models.dev 数据
    const data = await this.loadModelsDevData();

    // 2. 获取提供商 ID（处理 ID 映射）
    const modelsDevProviderId = getModelsDevProviderId(providerId);

    // 3. 获取提供商数据
    const providerData = data[modelsDevProviderId];
    if (!providerData || !providerData.models) {
        return [];
    }

    // 4. 转换模型格式
    const models = convertModelsDevToProviderModels(providerData.models);

    return models;
}
```

**关键：** `convertModelsDevToProviderModels` 函数直接使用 `model.id`，不做任何转换：

```typescript
// 第 580-664 行
function convertModelsDevToProviderModels(
    modelsDevModels: Record<string, ModelsDevModel>
): ProviderModel[] {
    const models: ProviderModel[] = [];
    for (const [, model] of Object.entries(modelsDevModels)) {
        models.push({
            id: model.id,  // 直接使用 models.dev 的 ID
            name: displayName,
            maxTokens: model.limit?.output || 4096,
            contextWindow: model.limit?.context || 4096,
            // ...
        });
    }
    return models;
}
```

### 3. App.tsx 中的模型加载

**文件：** `src/App.tsx`

#### 3.1 连接提供商时加载模型

```typescript
// 第 3876-3890 行：API Key 连接时
const handleProviderConnect = async (providerId: string, apiKey: string) => {
    // ...

    // 尝试动态获取模型列表
    let updatedModels = provider.models;
    if (modelFetcher.supportsDynamicFetch(providerId)) {
        try {
            const { models, source } = await modelFetcher.fetchModels(
                providerId,
                apiKey,
                provider.defaultEndpoint,
                provider.models  // 传入 fallback 数据
            );

            if (models.length > 0) {
                updatedModels = models;
                logger.info(LogTags.APP, `从 ${source} 获取到 ${models.length} 个模型`);
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
};
```

#### 3.2 supportsDynamicFetch 检查

```typescript
// modelFetcher.ts 中
supportsDynamicFetch(providerId: string): boolean {
    return DYNAMIC_FETCH_PROVIDERS.includes(providerId) ||
           MODELS_DEV_PROVIDERS.includes(providerId);
}
```

**关键：** Anthropic 在 `MODELS_DEV_PROVIDERS` 中，所以 `supportsDynamicFetch('anthropic')` 返回 `true`

### 4. 模型显示流程

#### 4.1 providers → models 转换

**文件：** `src/App.tsx`

```typescript
// 从 providers 中提取所有已连接提供商的模型
const connectedProviders = providers.filter(p => p.status === 'connected');
const allModels = connectedProviders.flatMap(provider =>
    provider.models.map(model => ({
        id: model.id,
        name: model.name,
        providerId: provider.id,
        // ...
    }))
);
```

#### 4.2 传递给 ChatPage

```typescript
<ChatPage
    models={allModels}
    // ...
/>
```

#### 4.3 ChatWindow 中的 ModelSelector

**文件：** `src/components/features/Chat/ChatWindow.tsx`

```typescript
<ModelSelector
    models={models}  // 从 ChatPage 传入
    selectedModelId={selectedModel?.id}
    onSelectModel={handleModelSelect}
/>
```

## 🐛 问题诊断

### 问题：Claude 4.6 模型没有显示

#### 可能原因 1：models.dev 数据未正确获取

**检查点：**
1. models.dev API 是否返回了 Claude 4.6 模型？
2. 模型 ID 格式是否正确？

**验证方法：**
```bash
curl https://models.dev/api.json | jq '.anthropic.models | keys'
```

**预期结果：**
```json
[
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-opus-4-5",
  ...
]
```

#### 可能原因 2：缓存问题

**检查点：**
1. 本地缓存是否包含旧的模型数据？
2. 缓存是否过期但仍在使用？

**缓存位置：**
- Tauri: `{APP_DATA_DIR}/model_cache.json`
- 浏览器: `localStorage['mobaus_model_cache']`

**解决方法：**
```typescript
// 清除缓存
await modelFetcher.clearCache('anthropic', true);
```

#### 可能原因 3：providers.ts fallback 数据格式错误

**检查点：**
1. providers.ts 中的模型 ID 是否与 models.dev 一致？
2. 是否使用了错误的 ID 格式（点号 vs 连字符）？

**当前状态：**
- ✅ 已修正为连字符格式（`claude-opus-4-6`）
- ✅ 与 models.dev 格式一致

#### 可能原因 4：提供商未连接

**检查点：**
1. Anthropic 提供商是否已连接？
2. API Key 是否有效？

**验证方法：**
```typescript
// 检查提供商状态
const anthropicProvider = providers.find(p => p.id === 'anthropic');
console.log('Status:', anthropicProvider?.status);
console.log('Models:', anthropicProvider?.models);
```

#### 可能原因 5：模型过滤逻辑问题

**检查点：**
1. 是否有代码过滤掉了 Claude 4.6 模型？
2. 模型名称或 ID 是否触发了某些过滤条件？

**需要检查的文件：**
- `src/components/features/Chat/ChatWindow.tsx`
- `src/components/common/ModelSelector.tsx`

## 🔍 调试步骤

### 步骤 1：验证 models.dev 数据

```bash
# 检查 models.dev 是否包含 Claude 4.6
curl -s https://models.dev/api.json | jq '.anthropic.models | to_entries | .[] | select(.key | contains("4-6"))'
```

### 步骤 2：检查应用缓存

```typescript
// 在浏览器控制台执行
const cache = JSON.parse(localStorage.getItem('mobaus_model_cache') || '{}');
console.log('Anthropic cache:', cache.anthropic);
```

### 步骤 3：检查提供商状态

```typescript
// 在 App.tsx 中添加日志
useEffect(() => {
    const anthropic = providers.find(p => p.id === 'anthropic');
    console.log('Anthropic provider:', {
        status: anthropic?.status,
        modelCount: anthropic?.models.length,
        models: anthropic?.models.map(m => m.id)
    });
}, [providers]);
```

### 步骤 4：强制刷新模型

```typescript
// 在连接 Anthropic 后强制清除缓存并重新获取
await modelFetcher.clearCache('anthropic', true);
const { models, source } = await modelFetcher.fetchModels(
    'anthropic',
    apiKey,
    'https://api.anthropic.com/v1',
    builtinProviders.find(p => p.id === 'anthropic')?.models
);
console.log('Fetched models:', { source, count: models.length, models });
```

## ✅ 解决方案

### 方案 1：清除缓存（推荐）

如果缓存中包含旧的模型数据，清除缓存可以强制重新从 models.dev 获取：

```typescript
// 在 App.tsx 或开发者工具中执行
await modelFetcher.clearCache('anthropic', true);
// 然后重新连接 Anthropic 提供商
```

### 方案 2：添加缓存刷新按钮

在 ProviderPage 中添加"刷新模型列表"按钮：

```typescript
const handleRefreshModels = async (providerId: string) => {
    await modelFetcher.clearCache(providerId, true);
    // 重新获取模型
    const provider = providers.find(p => p.id === providerId);
    if (provider && provider.status === 'connected') {
        const credential = await providerCredentialsStorage.get(providerId);
        if (credential) {
            const { models } = await modelFetcher.fetchModels(
                providerId,
                credential.apiKey || credential.accessToken,
                provider.defaultEndpoint,
                provider.models
            );
            // 更新 providers 状态
            setProviders(prev => prev.map(p =>
                p.id === providerId ? { ...p, models } : p
            ));
        }
    }
};
```

### 方案 3：检查 models.dev 数据

如果 models.dev 本身没有 Claude 4.6 数据，需要：
1. 等待 models.dev 社区更新
2. 或者临时使用 providers.ts 的 fallback 数据

### 方案 4：添加日志追踪

在关键位置添加日志，追踪模型加载流程：

```typescript
// modelFetcher.ts - fetchModels 方法中
logger.info(LogTags.MODEL, '开始获取模型', { providerId, source: 'start' });

// 在每个数据源尝试后
logger.info(LogTags.MODEL, '数据源结果', {
    providerId,
    source: 'models.dev',
    success: models.length > 0,
    modelIds: models.map(m => m.id)
});
```

## 📊 当前状态总结

### 已完成的修复

1. ✅ 修正 providers.ts 中的模型 ID 格式
   - 从 `claude-opus-4.6` 改为 `claude-opus-4-6`
   - 与 models.dev 格式一致

2. ✅ 更新模型参数
   - maxTokens: 正确设置为 128K (Opus 4.6) 和 64K (Sonnet 4.6)
   - contextWindow: 设置为 200K（基础上下文）

3. ✅ 添加注释说明
   - 说明 models.dev 使用连字符 ID
   - 说明 Anthropic API 使用日期 ID
   - 说明 1M 上下文需要特殊 header

### 待验证的问题

1. ❓ models.dev 是否包含 Claude 4.6 模型？
2. ❓ 本地缓存是否包含旧数据？
3. ❓ 提供商是否已正确连接？
4. ❓ 模型是否被某些过滤逻辑排除？

### 下一步行动

1. 验证 models.dev API 响应
2. 检查应用缓存内容
3. 添加调试日志
4. 如果需要，清除缓存并重新连接

## 🔗 相关文档

- [anthropic-models.md](./anthropic-models.md) - Anthropic 模型管理方案
- [anthropic-model-updates.md](./anthropic-model-updates.md) - Anthropic 模型更新记录
- [custom-providers.md](./custom-providers.md) - 自定义提供商模块
