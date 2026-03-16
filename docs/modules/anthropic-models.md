# Anthropic 模型管理方案

## 📋 问题分析

### 模型数据来源

**MobausStudio 使用 models.dev API 动态获取模型列表**

应用通过 `modelFetcher` 服务从以下数据源获取模型（按优先级）：

1. **models.dev API** (`https://models.dev/api.json`) - 主要数据源
   - ✅ 包含最新的 Claude 4.6 系列模型
   - ✅ 提供完整的定价信息
   - ✅ 自动更新，无需手动维护
   - ✅ 24小时缓存，避免频繁请求

2. **本地缓存** - 离线 fallback
   - 使用 Tauri 文件系统存储
   - 即使过期也可用作备用数据源

3. **内置数据** (`src/data/providers.ts`) - 最后的 fallback
   - 仅在无法从 models.dev 获取时使用
   - 需要手动维护

### 模型 ID 格式差异

| 数据源 | ID 格式 | 示例 |
|--------|---------|------|
| **models.dev** | 简化格式 | `claude-opus-4.6`, `claude-sonnet-4.6` |
| **Anthropic API** | 带日期格式 | `claude-opus-4-20260205`, `claude-sonnet-4-20260217` |

**重要**：应用使用 models.dev 的简化 ID 格式，与 Anthropic 官方 API 的带日期格式不同。

### 与 Google 的差异

| 特性 | Google AI | Anthropic |
|------|-----------|-----------|
| 模型列表 API | ✅ `/v1beta/models` | ❌ 无公开端点 |
| 配额信息 API | ✅ 支持 | ❌ 不支持 |
| 动态获取 | ✅ 直接从 Google API | ✅ 通过 models.dev |
| 数据来源 | Google 官方 API | models.dev 社区数据库 |

---

## 💡 当前实现

### 模型获取流程

```typescript
// src/services/modelFetcher.ts

// 1. 从 models.dev 获取（主要数据源）
const models = await modelFetcher.fetchFromModelsDev('anthropic');

// 2. 如果失败，使用本地缓存
const cachedModels = await modelFetcher.getCachedModels('anthropic');

// 3. 最后使用内置数据
const builtinModels = builtinProviders.find(p => p.id === 'anthropic').models;
```

### models.dev 中的 Anthropic 模型

**Claude 4.6 系列（最新）：**
- `claude-opus-4.6` - 1M context, $5/$25 per million tokens
- `claude-sonnet-4.6` - 1M context, $3/$15 per million tokens

**Claude 4.5 系列：**
- `claude-opus-4.5` - 200K context, $5/$25
- `claude-sonnet-4.5` - 1M context, $3/$15
- `claude-haiku-4.5` - 200K context, $1/$5

**Claude 4.x 系列：**
- `claude-opus-4.1` - 200K context, $15/$75
- `claude-opus-4` - 200K context, $15/$75
- `claude-sonnet-4` - 1M context, $3/$15

**已废弃模型：**
- `claude-3.7-sonnet` - 已废弃（2026-02-19）
- `claude-3.5-sonnet` - 已废弃（2025-10-28）
- `claude-3.5-haiku` - 已废弃（2026-02-19）

---

## 🔄 维护流程

### 模型更新

**自动更新（推荐）：**
1. models.dev 社区维护最新模型列表
2. 应用每24小时自动刷新缓存
3. 无需手动干预

**手动更新（仅在 models.dev 数据不准确时）：**
1. 更新 `src/data/providers.ts` 中的内置模型列表
2. 使用 models.dev 的简化 ID 格式（如 `claude-opus-4.6`）
3. 清除缓存：`modelFetcher.clearCache('anthropic', true)`

### 新模型发布时

1. **等待 models.dev 更新**（通常几天内）
2. **验证数据**：访问 https://models.dev/api.json 确认新模型已添加
3. **清除缓存**（可选）：强制应用重新获取最新数据

### 定期检查

- 每月检查一次 models.dev 数据准确性
- 验证定价信息是否与官方一致
- 更新已废弃模型的注释

---

## 📝 配置说明

### providers.ts 配置

```typescript
{
    id: 'anthropic',
    name: 'Anthropic',
    models: [
        // 使用 models.dev 的简化 ID 格式
        { id: 'claude-opus-4.6', name: 'Claude Opus 4.6 ⭐最强', ... },
        { id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6 ⭐推荐', ... },
        // ...
    ],
}
```

**注意事项：**
- ✅ 使用简化 ID（`claude-opus-4.6`），不是带日期 ID
- ✅ 这些配置仅作为 fallback，实际使用 models.dev 数据
- ✅ 定价信息会从 models.dev 自动获取

---

## 🧪 测试验证

### 验证模型数据来源

```typescript
// 检查缓存状态
const status = modelFetcher.getCacheStatus();
console.log(status['anthropic']);
// { fetchedAt: 1234567890, source: 'models.dev', count: 8 }

// 手动刷新
await modelFetcher.clearCache('anthropic', true);
const { models, source } = await modelFetcher.fetchModels('anthropic', apiKey);
console.log(source); // 'models.dev'
```

### 验证模型 ID 格式

```typescript
// 正确的 ID 格式（models.dev）
const model = 'claude-opus-4.6'; ✅

// 错误的 ID 格式（Anthropic API）
const model = 'claude-opus-4-20260205'; ❌
```

---

## 📊 总结

| 方面 | Google | Anthropic |
|------|--------|-----------|
| 模型获取方式 | 直接 API | models.dev |
| 配额信息 | ✅ 支持 | ❌ 不支持 |
| 自动更新 | ✅ 实时 | ✅ 24小时缓存 |
| 维护成本 | 低 | 极低（社区维护） |
| 用户体验 | 优秀 | 优秀 |
| 数据准确性 | 官方 | 社区（通常准确） |

**结论**：通过 models.dev API，Anthropic 提供商可以自动获取最新模型列表，无需手动维护。models.dev 社区数据库提供了可靠的模型信息和定价数据。

#### 实现步骤

1. **保留静态模型列表**
   - 继续在 `providers.ts` 中维护 Anthropic 模型列表
   - 定期手动更新（新模型发布时）

2. **添加模型验证功能**
   - 创建 `anthropic_validate_model` Tauri 命令
   - 对每个模型发送测试请求，检查是否可用
   - 标记不可用的模型（如已废弃的模型）

3. **UI 显示优化**
   - 显示模型验证状态（可用/不可用/未验证）
   - 提供"批量验证"按钮
   - 不可用的模型显示警告标识

#### 优势
- ✅ 实现简单，不依赖不存在的 API
- ✅ 可以检测已废弃的模型
- ✅ 用户体验良好
- ✅ 维护成本低

#### 劣势
- ⚠️ 无法自动发现新模型
- ⚠️ 需要手动更新模型列表

---

### 方案 2：模型配置文件 + 自动更新

创建可更新的模型配置文件：

#### 实现步骤

1. **创建模型配置仓库**
   ```
   https://github.com/mobaus/model-configs
   └── anthropic-models.json
   ```

2. **定期更新配置**
   - 手动或脚本爬取 Anthropic 文档
   - 更新 `anthropic-models.json`
   - 应用启动时检查更新

3. **本地缓存 + 远程更新**
   - 本地保留默认配置
   - 定期从远程拉取最新配置
   - 用户可手动刷新

#### 优势
- ✅ 可以及时更新模型列表
- ✅ 不需要修改代码
- ✅ 支持社区贡献

#### 劣势
- ⚠️ 需要维护额外的配置仓库
- ⚠️ 增加网络请求
- ⚠️ 实现复杂度较高

---

## 🎯 推荐实现：方案 1（模型验证）

### 1. 创建 Rust 验证命令

**文件：** `src-tauri/src/lib.rs`

```rust
/// 验证 Anthropic 模型是否可用
#[tauri::command]
async fn anthropic_validate_model(
    api_key: String,
    model_id: String,
) -> Result<ModelValidationResult, String> {
    info!("[anthropic_validate_model] 验证模型: {}", model_id);

    let client = reqwest::Client::new();
    let url = "https://api.anthropic.com/v1/messages";

    // 发送最小测试请求
    let response = client
        .post(url)
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&serde_json::json!({
            "model": model_id,
            "max_tokens": 1,
            "messages": [{
                "role": "user",
                "content": "test"
            }]
        }))
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let status = response.status();

    if status.is_success() {
        Ok(ModelValidationResult {
            available: true,
            message: "模型可用".to_string(),
        })
    } else if status.as_u16() == 404 {
        Ok(ModelValidationResult {
            available: false,
            message: "模型不存在或已废弃".to_string(),
        })
    } else {
        let error_text = response.text().await.unwrap_or_default();
        Ok(ModelValidationResult {
            available: false,
            message: format!("验证失败: {}", error_text),
        })
    }
}

#[derive(serde::Serialize)]
struct ModelValidationResult {
    available: bool,
    message: String,
}
```

### 2. 创建前端服务

**文件：** `src/services/anthropic-models.ts`

```typescript
/**
 * Anthropic 模型验证服务
 *
 * 由于 Anthropic API 不提供模型列表端点，
 * 我们通过发送测试请求来验证模型是否可用
 */

import { invoke } from '@tauri-apps/api/core';
import { logger, LogTags } from '../utils/logger';

export interface ModelValidationResult {
    available: boolean;
    message: string;
}

/**
 * 验证单个 Anthropic 模型是否可用
 *
 * @param apiKey - API Key
 * @param modelId - 模型 ID
 * @returns 验证结果
 */
export async function validateAnthropicModel(
    apiKey: string,
    modelId: string
): Promise<ModelValidationResult> {
    logger.info(LogTags.APP, `验证 Anthropic 模型: ${modelId}`);

    try {
        const result = await invoke<ModelValidationResult>('anthropic_validate_model', {
            apiKey,
            modelId,
        });

        logger.info(LogTags.APP, `模型 ${modelId} 验证结果: ${result.available ? '可用' : '不可用'}`);
        return result;
    } catch (error) {
        logger.error(LogTags.APP, `验证模型失败: ${modelId}`, error);
        return {
            available: false,
            message: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * 批量验证 Anthropic 模型
 *
 * @param apiKey - API Key
 * @param modelIds - 模型 ID 列表
 * @returns 验证结果映射
 */
export async function validateAnthropicModels(
    apiKey: string,
    modelIds: string[]
): Promise<Map<string, ModelValidationResult>> {
    logger.info(LogTags.APP, `批量验证 ${modelIds.length} 个 Anthropic 模型`);

    const results = new Map<string, ModelValidationResult>();

    // 串行验证，避免请求过载
    for (const modelId of modelIds) {
        const result = await validateAnthropicModel(apiKey, modelId);
        results.set(modelId, result);

        // 延迟 500ms，避免触发速率限制
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    return results;
}
```

### 3. 创建 Hook

**文件：** `src/hooks/useAnthropicModels.ts`

```typescript
/**
 * useAnthropicModels Hook
 *
 * 管理 Anthropic 模型验证状态
 */

import { useState, useCallback } from 'react';
import { validateAnthropicModels, type ModelValidationResult } from '../services/anthropic-models';
import { logger, LogTags } from '../utils/logger';

export interface UseAnthropicModelsOptions {
    apiKey?: string;
    modelIds: string[];
}

export interface UseAnthropicModelsReturn {
    validationResults: Map<string, ModelValidationResult>;
    loading: boolean;
    error: string | null;
    validate: () => Promise<void>;
    isModelAvailable: (modelId: string) => boolean;
}

export function useAnthropicModels(options: UseAnthropicModelsOptions): UseAnthropicModelsReturn {
    const { apiKey, modelIds } = options;

    const [validationResults, setValidationResults] = useState<Map<string, ModelValidationResult>>(new Map());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const validate = useCallback(async () => {
        if (!apiKey) {
            logger.warn(LogTags.APP, 'useAnthropicModels: 无 API Key，跳过验证');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const results = await validateAnthropicModels(apiKey, modelIds);
            setValidationResults(results);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.error(LogTags.APP, '验证 Anthropic 模型失败', err);
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    }, [apiKey, modelIds]);

    const isModelAvailable = useCallback((modelId: string): boolean => {
        const result = validationResults.get(modelId);
        return result?.available ?? true; // 未验证的模型默认可用
    }, [validationResults]);

    return {
        validationResults,
        loading,
        error,
        validate,
        isModelAvailable,
    };
}
```

---

## 📐 UI 集成

### 在 Models 页面添加验证按钮

```tsx
// src/components/features/Models/index.tsx

{provider.id === 'anthropic' && (
    <button
        onClick={handleValidateAnthropicModels}
        disabled={validating}
        className="btn-secondary"
    >
        {validating ? '验证中...' : '验证模型可用性'}
    </button>
)}
```

### 在模型选择器中显示验证状态

```tsx
// src/components/features/Models/ModelCard.tsx

{provider.id === 'anthropic' && validationResult && (
    <span className={`validation-badge ${validationResult.available ? 'available' : 'unavailable'}`}>
        {validationResult.available ? '✓ 可用' : '✗ 不可用'}
    </span>
)}
```

---

## 🧪 测试用例

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-ANTH-001 | 验证可用模型 | claude-3-5-sonnet-20241022 | available=true |
| TC-ANTH-002 | 验证已废弃模型 | claude-2.1 | available=false |
| TC-ANTH-003 | 验证不存在模型 | invalid-model-id | available=false |
| TC-ANTH-004 | 批量验证 | 6个模型 | 返回6个验证结果 |
| TC-ANTH-005 | 无 API Key | apiKey=undefined | 跳过验证 |
| TC-ANTH-006 | API Key 错误 | 无效的 API Key | available=false, 显示错误信息 |

---

## 📝 文档更新

### providers.md

添加说明：

```markdown
### Anthropic 模型管理

**注意**：Anthropic API 不提供模型列表端点，因此：
- 模型列表由应用维护（定期手动更新）
- 提供"验证模型可用性"功能检测已废弃的模型
- 新模型发布时需要更新应用版本

**与 Google 的差异**：
- Google: 动态获取模型列表和配额信息
- Anthropic: 静态模型列表 + 可用性验证
```

---

## 🔄 维护流程

### 新模型发布时

1. 访问 Anthropic 官方文档
2. 更新 `src/data/providers.ts` 中的 Anthropic 模型列表
3. 运行验证测试
4. 发布新版本

### 定期检查

- 每月检查一次 Anthropic 文档
- 验证现有模型是否仍然可用
- 移除已废弃的模型

---

## 📊 总结

| 方面 | Google | Anthropic |
|------|--------|-----------|
| 模型获取方式 | 动态 API | 静态配置 |
| 配额信息 | ✅ 支持 | ❌ 不支持 |
| 可用性检测 | API 返回 | 手动验证 |
| 维护成本 | 低 | 中 |
| 用户体验 | 优秀 | 良好 |

**结论**：由于 Anthropic API 的限制，无法实现与 Google 完全相同的动态模型获取功能。推荐使用"静态配置 + 可用性验证"的方案，在保证用户体验的同时降低维护成本。
