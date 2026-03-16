# Protocol Priority Implementation Record (v0.9.5) / 协议优先级实现记录 (v0.9.5)

> [English](#english) | [中文](#中文)

<a id="english"></a>

## Implementation Date
2026-03-09

## Background

Users requested that the config-switcher should obtain provider information from protocol configuration instead of model configuration when synchronizing provider logic.

## Protocol Priority Rules

Based on the `getEffectiveProtocol()` function in `src/data/protocols.ts`, the protocol priority is:

1. **Model-specified protocol** (`model.protocol`) - Highest priority
2. **Provider default protocol** (`PROVIDER_DEFAULT_PROTOCOL[providerId]`) - Medium priority
3. **Inferred protocol** (`getDefaultProtocol(providerId)`) - Lowest priority (fallback)

## Implementation Plan

### 1. Frontend Changes

**File**: `src/components/features/ConfigSwitcher/index.tsx`

**Changes**:
1. Import protocol-related functions:
   ```typescript
   import { getDefaultProtocol, getEffectiveProtocol } from '../../../data/protocols';
   ```

2. Use protocol priority logic in the `handleEnable` function:
   ```typescript
   // Get the provider's default protocol
   const providerDefaultProtocol = getDefaultProtocol(providerId);

   // When preparing the model list, use protocol priority logic
   const models = providerModels.reduce((acc, model) => {
     const effectiveProtocol = getEffectiveProtocol(
       model.protocol,           // Model protocol (highest priority)
       providerDefaultProtocol,  // Provider default protocol
       providerId                // For inference (fallback)
     );

     // Use modelId as key (the model's real identifier), fall back to id if not available
     const modelKey = model.modelId || model.id;
     acc[modelKey] = {
       name: model.name,
       endpoint: model.endpoint,
       protocol: effectiveProtocol,
     };
     return acc;
   }, {});
   ```

**Important Fix (v0.9.5.2)**:
- **Corrected OpenCode configuration format** (compliant with official specification):
  1. Removed `endpoint` and `protocol` fields from the models object
  2. Models object now only contains empty configuration: `{ "model-id": {} }`
  3. `endpoint` is configured at the provider level in `options.baseURL`
  4. `protocol` is used for selecting npm packages (`@ai-sdk/anthropic`, `@ai-sdk/openai-compatible`, etc.)
- **Corrected model ID usage**:
  1. Prefer `model.modelId` (the model's real identifier, e.g., `claude-opus-4-6`)
  2. If `modelId` doesn't exist, normalize `model.name` to ID format (lowercase, spaces replaced with hyphens)
  3. No longer use `model.id` (internal UUID or timestamp) as fallback
- Example: `"Claude Opus 4.6"` -> key: `"claude-opus-4.6"`, value: `{}`

### 2. Backend Unchanged

The backend's `export_provider_with_name` function already supports extracting protocol from model data, no changes needed.

### 3. Documentation Update

**File**: `docs/modules/config-switcher.md`

**Changes**:
1. Updated configuration flow diagram, added protocol priority decision step
2. Added change record: v4.2.0 - Protocol priority implementation

## Test Verification

### Protocol Configuration Tests
```bash
npm test -- src/test/data/protocols.test.ts --run
```
Result: 35 tests all passed

### ConfigSwitcher Component Tests
```bash
npm test -- src/test/components/ConfigSwitcher --run
```
Result: 25 tests all passed

### Full Test Suite
```bash
npm test -- --run
```
Result: 1474 tests all passed

## Protocol Mapping Examples

Based on the `PROVIDER_DEFAULT_PROTOCOL` definition:

| Provider ID | Default Protocol | Description |
|-------------|-----------------|-------------|
| openai | openai | OpenAI Chat Completions API |
| deepseek | openai | DeepSeek uses OpenAI-compatible protocol |
| groq | openai | Groq uses OpenAI-compatible protocol |
| anthropic | anthropic | Anthropic Messages API |
| google | google | Google Gemini API |
| kiro | aws | Kiro uses AWS Bedrock protocol |
| bedrock | aws | AWS Bedrock API |
| custom | openai | Custom providers default to OpenAI protocol |

## Runtime Example

From the test logs, the protocol priority logic works correctly:

```
[ConfigSwitcher] All models: [
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    endpoint: 'https://api.anthropic.com',
    protocol: 'anthropic'
  }
]
[ConfigSwitcher] Provider default protocol: anthropic
[ConfigSwitcher] Formatted models with protocols: {
  'claude-opus-4-6': {
    name: 'Claude Opus 4.6',
    endpoint: 'https://api.anthropic.com',
    protocol: 'anthropic'
  }
}
```

## Advantages

1. **Unified Management**: Protocol configuration is centralized in `src/data/protocols.ts` for easy maintenance
2. **Flexibility**: Supports model-level protocol overrides
3. **Fallback Mechanism**: Even if neither model nor provider specifies a protocol, it can be inferred via `getDefaultProtocol`
4. **Type Safety**: Uses TypeScript's `ProtocolType` type to ensure protocol value correctness

## Related Files

- `src/data/protocols.ts` - Protocol configuration and utility functions
- `src/components/features/ConfigSwitcher/index.tsx` - ConfigSwitcher main page
- `src/types/index.ts` - Type definitions (ProtocolType, AIProvider, AIModelConfig)
- `docs/modules/config-switcher.md` - ConfigSwitcher module documentation
- `src/test/data/protocols.test.ts` - Protocol configuration tests

## Future Optimization Suggestions

1. Consider displaying the currently used protocol in the UI (for debugging)
2. Support users manually selecting protocols in the model configuration interface
3. Add protocol compatibility checks (e.g., some models may not support certain protocols)

---

<a id="中文"></a>

## 实现日期
2026-03-09

## 需求背景
用户要求在 config-switcher 同步供应商逻辑时，从协议配置中获取提供商信息，而不是从模型配置中获取。

## 协议优先级规则

根据 `src/data/protocols.ts` 中的 `getEffectiveProtocol()` 函数，协议优先级为：

1. **模型指定的协议** (`model.protocol`) - 最高优先级
2. **提供商默认协议** (`PROVIDER_DEFAULT_PROTOCOL[providerId]`) - 中等优先级
3. **推断协议** (`getDefaultProtocol(providerId)`) - 最低优先级（兜底）

## 实现方案

### 1. 前端修改

**文件**: `src/components/features/ConfigSwitcher/index.tsx`

**修改内容**:
1. 导入协议相关函数：
   ```typescript
   import { getDefaultProtocol, getEffectiveProtocol } from '../../../data/protocols';
   ```

2. 在 `handleEnable` 函数中使用协议优先级逻辑：
   ```typescript
   // 获取提供商的默认协议
   const providerDefaultProtocol = getDefaultProtocol(providerId);

   // 准备模型列表时，使用协议优先级逻辑
   const models = providerModels.reduce((acc, model) => {
     const effectiveProtocol = getEffectiveProtocol(
       model.protocol,           // 模型协议（最高优先级）
       providerDefaultProtocol,  // 提供商默认协议
       providerId                // 用于推断（兜底）
     );

     // 使用 modelId 作为 key（模型的真实标识符），如果不存在则使用 id
     const modelKey = model.modelId || model.id;
     acc[modelKey] = {
       name: model.name,
       endpoint: model.endpoint,
       protocol: effectiveProtocol,
     };
     return acc;
   }, {});
   ```

**重要修复 (v0.9.5.2)**:
- **修正 OpenCode 配置格式**（符合官方规范）：
  1. 移除 models 对象中的 `endpoint` 和 `protocol` 字段
  2. models 对象现在只包含空的配置：`{ "model-id": {} }`
  3. `endpoint` 在 provider 级别的 `options.baseURL` 中配置
  4. `protocol` 用于选择 npm 包（`@ai-sdk/anthropic`、`@ai-sdk/openai-compatible` 等）
- **修正模型 ID 的使用**：
  1. 优先使用 `model.modelId`（模型的真实标识符，如 `claude-opus-4-6`）
  2. 如果 `modelId` 不存在，将 `model.name` 规范化为 ID 格式（转小写、空格替换为连字符）
  3. 不再使用 `model.id`（内部 UUID 或时间戳）作为回退
- 示例：`"Claude Opus 4.6"` → key: `"claude-opus-4.6"`, value: `{}`

### 2. 后端保持不变

后端的 `export_provider_with_name` 函数已经支持从模型数据中提取 protocol，无需修改。

### 3. 文档更新

**文件**: `docs/modules/config-switcher.md`

**修改内容**:
1. 更新配置流向图，添加协议优先级判断步骤
2. 添加变更记录：v4.2.0 - 协议优先级实现

## 测试验证

### 协议配置测试
```bash
npm test -- src/test/data/protocols.test.ts --run
```
结果：✅ 35 个测试全部通过

### ConfigSwitcher 组件测试
```bash
npm test -- src/test/components/ConfigSwitcher --run
```
结果：✅ 25 个测试全部通过

### 全量测试
```bash
npm test -- --run
```
结果：✅ 1474 个测试全部通过

## 协议映射示例

根据 `PROVIDER_DEFAULT_PROTOCOL` 的定义：

| 提供商 ID | 默认协议 | 说明 |
|-----------|---------|------|
| openai | openai | OpenAI Chat Completions API |
| deepseek | openai | DeepSeek 使用 OpenAI 兼容协议 |
| groq | openai | Groq 使用 OpenAI 兼容协议 |
| anthropic | anthropic | Anthropic Messages API |
| google | google | Google Gemini API |
| kiro | aws | Kiro 使用 AWS Bedrock 协议 |
| bedrock | aws | AWS Bedrock API |
| custom | openai | 自定义提供商默认使用 OpenAI 协议 |

## 实际运行示例

从测试日志中可以看到协议优先级逻辑正常工作：

```
[ConfigSwitcher] All models: [
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    endpoint: 'https://api.anthropic.com',
    protocol: 'anthropic'
  }
]
[ConfigSwitcher] Provider default protocol: anthropic
[ConfigSwitcher] Formatted models with protocols: {
  'claude-opus-4-6': {
    name: 'Claude Opus 4.6',
    endpoint: 'https://api.anthropic.com',
    protocol: 'anthropic'
  }
}
```

## 优势

1. **统一管理**: 协议配置集中在 `src/data/protocols.ts` 中，便于维护
2. **灵活性**: 支持模型级别的协议覆盖
3. **兜底机制**: 即使模型和提供商都没有指定协议，也能通过 `getDefaultProtocol` 推断
4. **类型安全**: 使用 TypeScript 的 `ProtocolType` 类型确保协议值的正确性

## 相关文件

- `src/data/protocols.ts` - 协议配置和工具函数
- `src/components/features/ConfigSwitcher/index.tsx` - ConfigSwitcher 主页面
- `src/types/index.ts` - 类型定义（ProtocolType, AIProvider, AIModelConfig）
- `docs/modules/config-switcher.md` - ConfigSwitcher 模块文档
- `src/test/data/protocols.test.ts` - 协议配置测试

## 后续优化建议

1. 考虑在 UI 中显示当前使用的协议（用于调试）
2. 支持用户在模型配置界面手动选择协议
3. 添加协议兼容性检查（例如，某些模型可能不支持某些协议）
