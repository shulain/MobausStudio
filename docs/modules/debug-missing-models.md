# 调试：模型管理页面看不到 Claude 4.6 模型

## 🎯 问题描述

老公在模型管理页面（Models Page）添加模型时，下拉列表中看不到 Claude 4.6 系列模型。

## 🔍 问题定位

### 数据流分析

```
连接 Anthropic 提供商
  ↓
handleProviderConnect() 调用 modelFetcher.fetchModels()
  ↓
从 models.dev 获取模型列表（包含 Claude 4.6）
  ↓
更新 providers 状态：
  providers.find(p => p.id === 'anthropic').models = [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6 ⭐最强', ... },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 ⭐推荐', ... },
      ...
  ]
  ↓
ModelModal 从 providers 中读取模型列表
  ↓
显示在下拉选择器中
```

### 关键代码位置

1. **App.tsx 第 3897-3901 行** - 更新 providers 状态
   ```typescript
   setProviders(prev => prev.map(p =>
       p.id === providerId
           ? { ...p, status: 'connected', models: updatedModels }
           : p
   ));
   ```

2. **ModelModal.tsx 第 242 行** - 读取模型列表
   ```typescript
   const effectiveModels = selectedProvider?.models || [];
   ```

3. **ModelModal.tsx 第 245-264 行** - 生成下拉选项
   ```typescript
   const modelOptions = effectiveModels.map((m) => ({
       value: m.id,
       label: `${m.name} (${m.maxTokens.toLocaleString()} tokens)`,
   }));
   ```

## 🧪 调试步骤

### 步骤 1：验证 models.dev 数据

在终端执行：

```bash
curl -s https://models.dev/api.json | jq '.anthropic.models | keys | .[] | select(contains("4-6"))'
```

**预期输出：**
```
"claude-opus-4-6"
"claude-sonnet-4-6"
```

**结果：** ✅ 已验证，models.dev 包含 Claude 4.6 模型

### 步骤 2：检查 modelFetcher 是否正确获取

在浏览器开发者工具的 Console 中执行：

```javascript
// 检查 modelFetcher 缓存
const cache = JSON.parse(localStorage.getItem('mobaus_model_cache') || '{}');
console.log('Anthropic 缓存:', cache.anthropic);

// 如果有缓存，查看模型列表
if (cache.anthropic) {
    console.log('缓存的模型 IDs:', cache.anthropic.models.map(m => m.id));
    console.log('是否包含 4-6:', cache.anthropic.models.some(m => m.id.includes('4-6')));
}
```

**预期结果：**
- 缓存中应该包含 `claude-opus-4-6` 和 `claude-sonnet-4-6`
- `source` 应该是 `'models.dev'`

### 步骤 3：检查 providers 状态

在 App.tsx 中添加临时日志（第 3901 行之后）：

```typescript
setProviders(prev => prev.map(p =>
    p.id === providerId
        ? { ...p, status: 'connected', models: updatedModels }
        : p
));

// 临时调试日志
if (providerId === 'anthropic') {
    console.log('🔍 Anthropic providers 更新后:', {
        modelCount: updatedModels.length,
        modelIds: updatedModels.map(m => m.id),
        has4_6: updatedModels.some(m => m.id.includes('4-6')),
    });
}
```

**预期结果：**
- `modelCount` 应该 >= 8
- `modelIds` 应该包含 `claude-opus-4-6` 和 `claude-sonnet-4-6`
- `has4_6` 应该是 `true`

### 步骤 4：检查 ModelModal 接收到的数据

在 ModelModal.tsx 中添加临时日志（第 242 行之后）：

```typescript
const effectiveModels = selectedProvider?.models || [];

// 临时调试日志
useEffect(() => {
    if (selectedProvider?.id === 'anthropic') {
        console.log('🔍 ModelModal Anthropic 模型:', {
            providerConnected: selectedProvider.connected,
            modelCount: effectiveModels.length,
            modelIds: effectiveModels.map(m => m.id),
            has4_6: effectiveModels.some(m => m.id.includes('4-6')),
        });
    }
}, [selectedProvider, effectiveModels]);
```

**预期结果：**
- `providerConnected` 应该是 `true`
- `modelCount` 应该 >= 8
- `modelIds` 应该包含 `claude-opus-4-6` 和 `claude-sonnet-4-6`
- `has4_6` 应该是 `true`

### 步骤 5：检查下拉选项生成

在 ModelModal.tsx 中添加临时日志（第 264 行之后）：

```typescript
const modelOptions = effectiveModels.map((m) => {
    // ... 现有代码 ...
});

// 临时调试日志
useEffect(() => {
    if (selectedProvider?.id === 'anthropic') {
        console.log('🔍 ModelModal 下拉选项:', {
            optionCount: modelOptions.length,
            options: modelOptions.map(o => ({ value: o.value, label: o.label })),
            has4_6: modelOptions.some(o => o.value.includes('4-6')),
        });
    }
}, [modelOptions, selectedProvider]);
```

**预期结果：**
- `optionCount` 应该 >= 8
- `options` 应该包含 Claude 4.6 的选项
- `has4_6` 应该是 `true`

## 🐛 可能的问题原因

### 原因 1：缓存问题

**症状：** modelFetcher 使用了旧的缓存数据，没有从 models.dev 重新获取

**验证方法：**
```javascript
// 检查缓存时间
const cache = JSON.parse(localStorage.getItem('mobaus_model_cache') || '{}');
if (cache.anthropic) {
    const cacheAge = Date.now() - cache.anthropic.fetchedAt;
    console.log('缓存年龄（小时）:', (cacheAge / 1000 / 60 / 60).toFixed(2));
    console.log('缓存来源:', cache.anthropic.source);
}
```

**解决方法：**
```javascript
// 清除缓存
localStorage.removeItem('mobaus_model_cache');
// 如果使用 Tauri，还需要清除文件缓存
// 然后重新连接 Anthropic 提供商
```

### 原因 2：providers.ts fallback 数据格式错误

**症状：** modelFetcher 获取失败，使用了 providers.ts 的 fallback 数据，但 ID 格式不对

**验证方法：**
```javascript
// 检查缓存来源
const cache = JSON.parse(localStorage.getItem('mobaus_model_cache') || '{}');
console.log('数据来源:', cache.anthropic?.source);
// 如果是 'builtin'，说明使用了 fallback 数据
```

**解决方法：**
- ✅ 已修正 providers.ts 中的模型 ID 格式（使用连字符）
- 清除缓存后重新连接

### 原因 3：providers 状态没有正确传递到 ModelModal

**症状：** App.tsx 更新了 providers，但 ModelModal 接收到的是旧数据

**验证方法：**
在 ModelModal 中打印 `providers` prop：
```typescript
useEffect(() => {
    console.log('🔍 ModelModal 接收到的 providers:', providers.map(p => ({
        id: p.id,
        connected: p.connected,
        modelCount: p.models.length,
    })));
}, [providers]);
```

**解决方法：**
- 检查 App.tsx 中传递给 ModelPage 的 providers 是否正确
- 检查 ModelPage 是否正确传递给 ModelModal

### 原因 4：React 状态更新时机问题

**症状：** providers 状态更新了，但 ModelModal 还没有重新渲染

**验证方法：**
在 ModelModal 中添加渲染计数：
```typescript
const renderCount = useRef(0);
useEffect(() => {
    renderCount.current++;
    console.log('🔍 ModelModal 渲染次数:', renderCount.current);
});
```

**解决方法：**
- 确保 providers 是 immutable 更新（使用 `map` 创建新数组）
- 检查 useMemo/useCallback 的依赖项

### 原因 5：模型 ID 格式不匹配

**症状：** models.dev 返回的 ID 格式与 providers.ts 不一致

**验证方法：**
```javascript
// 比较两个来源的 ID 格式
const cache = JSON.parse(localStorage.getItem('mobaus_model_cache') || '{}');
console.log('缓存中的 IDs:', cache.anthropic?.models.map(m => m.id));

// 与 providers.ts 中的 ID 对比
// providers.ts: claude-opus-4-6 (连字符)
// models.dev: claude-opus-4-6 (连字符) ✅
```

**解决方法：**
- ✅ 已修正 providers.ts 使用连字符格式
- 确保 modelFetcher 不做 ID 转换

## 🔧 快速修复方案

### 方案 1：清除缓存并重新连接（推荐）

```javascript
// 1. 在浏览器控制台执行
localStorage.removeItem('mobaus_model_cache');
localStorage.removeItem('mobaus_models_dev_cache');

// 2. 刷新页面

// 3. 断开 Anthropic 提供商

// 4. 重新连接 Anthropic 提供商

// 5. 前往模型管理页面，点击"添加模型"，选择 Anthropic
```

### 方案 2：强制刷新 providers 状态

在 App.tsx 中添加一个刷新按钮（临时调试用）：

```typescript
const handleRefreshProviders = async () => {
    const anthropic = providers.find(p => p.id === 'anthropic');
    if (!anthropic || anthropic.status !== 'connected') return;

    const credential = await providerCredentialsStorage.get('anthropic');
    if (!credential) return;

    // 强制清除缓存
    await modelFetcher.clearCache('anthropic', true);

    // 重新获取模型
    const { models, source } = await modelFetcher.fetchModels(
        'anthropic',
        credential.apiKey || credential.accessToken,
        anthropic.defaultEndpoint,
        anthropic.models
    );

    console.log('🔍 刷新后的模型:', {
        source,
        count: models.length,
        ids: models.map(m => m.id),
    });

    // 更新 providers
    setProviders(prev => prev.map(p =>
        p.id === 'anthropic'
            ? { ...p, models }
            : p
    ));
};
```

### 方案 3：添加详细日志

在 modelFetcher.ts 的 `fetchModels` 方法中添加详细日志：

```typescript
async fetchModels(providerId: string, apiKey: string, baseUrl?: string, builtinModels?: ProviderModel[]) {
    console.log('🔍 fetchModels 开始:', { providerId, hasApiKey: !!apiKey });

    // 在每个数据源尝试后添加日志
    if (DYNAMIC_FETCH_PROVIDERS.includes(providerId) && apiKey) {
        try {
            let models = await this.fetchFromApi(providerId, apiKey, baseUrl);
            console.log('🔍 从 API 获取:', { count: models.length, ids: models.map(m => m.id) });
            // ...
        } catch (error) {
            console.log('🔍 API 获取失败:', error);
        }
    }

    try {
        let models = await this.fetchFromModelsDev(providerId);
        console.log('🔍 从 models.dev 获取:', { count: models.length, ids: models.map(m => m.id) });
        // ...
    } catch (error) {
        console.log('🔍 models.dev 获取失败:', error);
    }

    // ...
}
```

## 📊 诊断检查清单

运行以下检查，记录结果：

- [ ] models.dev API 包含 Claude 4.6 模型
- [ ] localStorage 缓存包含 Claude 4.6 模型
- [ ] providers 状态包含 Claude 4.6 模型
- [ ] ModelModal 接收到的 providers 包含 Claude 4.6 模型
- [ ] effectiveModels 包含 Claude 4.6 模型
- [ ] modelOptions 包含 Claude 4.6 选项
- [ ] 下拉列表中显示 Claude 4.6 选项

## 🎯 下一步行动

1. **立即执行：** 清除缓存并重新连接（方案 1）
2. **如果问题仍存在：** 添加调试日志（步骤 3-5）
3. **收集日志：** 将控制台输出发送给我分析
4. **根据日志：** 确定具体问题原因并修复

## 📝 预期结果

修复后，在模型管理页面点击"添加模型"，选择 Anthropic 提供商，应该能在下拉列表中看到：

- Claude Opus 4.6 ⭐最强 (128,000 tokens)
- Claude Sonnet 4.6 ⭐推荐 (64,000 tokens)
- Claude Opus 4.5 (64,000 tokens)
- Claude Sonnet 4.5 (64,000 tokens)
- Claude Haiku 4.5 (64,000 tokens)
- Claude Opus 4.1 (32,000 tokens)
- Claude Opus 4 (32,000 tokens)
- Claude Sonnet 4 (64,000 tokens)
