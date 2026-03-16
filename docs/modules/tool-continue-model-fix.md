# Tool Call Continuation Model Error Fix / 工具调用续传模型错误修复

> [English](#english) | [中文](#中文)

---

<a id="english"></a>

## English

### Problem Description

The user selected a Gemini model, but the tool call continuation still used the previous Claude model, resulting in a 429 quota error.

### Root Cause

#### Code Analysis

In `App.tsx`'s tool call continuation logic (line 2888):

```typescript
const continueModel = models.find(m => m.id === latestChat.model);
```

Here `latestChat.model` is used, which is the **model ID saved when the conversation was created**.

#### Problem Scenario

1. **When creating conversation**: Selected `claude-opus-4-5-thinking` model
2. **During conversation**: User switched to `gemini-2.5-flash` model
3. **During tool call continuation**: Code still uses `claude-opus-4-5-thinking` from when the conversation was created

#### Why Does This Happen?

- `handleUpdateChatModel` only updates the `chat.model` field
- But during tool call continuation, code reads directly from `latestChat.model`
- This value may be stale and not reflect the user's latest selection

### Solution

#### Before Fix

```typescript
// Get model configuration
const continueModel = models.find(m => m.id === latestChat.model);
if (!continueModel) {
  logger.warn(LogTags.APP, 'Tool continuation: model config not found', { model: latestChat.model });
  break;
}
```

#### After Fix

```typescript
// Get model configuration
// v0.9.2: Prefer the currently selected model over the model saved in chat history
// This ensures tool call continuation uses the new model after user switches
const continueModel = models.find(m => m.id === modelId) || models.find(m => m.id === latestChat.model);
if (!continueModel) {
  logger.warn(LogTags.APP, 'Tool continuation: model config not found', {
    currentModelId: modelId,
    chatModelId: latestChat.model
  });
  break;
}

// Log the model being used
if (import.meta.env.DEV) {
  logger.debug(LogTags.APP, 'Tool continuation using model', {
    modelId: continueModel.id,
    modelName: continueModel.name,
    isCurrentModel: continueModel.id === modelId,
  });
}
```

#### Priority Logic

1. **Prefer the currently selected model** (`modelId`)
2. **Fall back to the model in chat history** (`latestChat.model`)

This ensures:
- After user switches model, tool call continuation uses the new model
- If the current model doesn't exist, falls back to the historical model (backward compatible)

### Impact Scope

#### Modified Files

- `src/App.tsx` (lines 2888-2892)

#### Affected Features

- Tool call continuation
- Multi-turn conversation
- Model switching

### Test Scenarios

#### Scenario 1: Normal Tool Call

1. Create conversation, select Gemini model
2. Send message triggering tool call
3. Tool call continuation should use Gemini model

#### Scenario 2: Tool Call After Switching Model

1. Create conversation, select Claude model
2. Send message triggering tool call
3. Switch to Gemini model
4. Tool call continuation should use Gemini model

#### Scenario 3: Fallback When Model Doesn't Exist

1. Create conversation, select model A
2. Delete model A
3. Tool call continuation should fall back to the model in chat history

### Log Output

After the fix, detailed model info is output in development mode:

```
[APP] Tool continuation using model {
  modelId: "gemini-2.5-flash-xxx",
  modelName: "Gemini 2.5 Flash",
  isCurrentModel: true
}
```

This makes it easy to debug and confirm whether the correct model is being used.

### Related Questions

#### Q: Why not just use `modelId` directly?

A: For backward compatibility. If the model corresponding to `modelId` is deleted, falling back to the historical model prevents tool call failure.

#### Q: Will historical messages be updated after user switches model?

A: No. Model information in historical messages remains unchanged; only new tool call continuations will use the new model.

#### Q: Does this fix affect roundtable meetings?

A: No. Roundtable meetings use the model configured in Agent settings and are not affected by this fix.

### Future Optimization Suggestions

1. **UI Hint**: When user switches model, show "Subsequent conversations will use the new model"
2. **Model Lock**: Add a "Lock Model" option to prevent accidental switching
3. **History Sync**: Provide an "Apply to Historical Messages" option to update model info in historical messages

### Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-02-28 | v0.9.2 | Fixed tool call continuation using wrong model | - |

---

<a id="中文"></a>

## 中文

### 问题描述

用户选择了 Gemini 模型，但在工具调用续传时仍然使用了之前的 Claude 模型，导致 429 配额错误。

### 问题根源

#### 代码分析

在 `App.tsx` 的工具调用续传逻辑中（第 2888 行）：

```typescript
const continueModel = models.find(m => m.id === latestChat.model);
```

这里使用的是 `latestChat.model`，也就是**对话创建时保存的模型 ID**。

#### 问题场景

1. **创建对话时**：选择了 `claude-opus-4-5-thinking` 模型
2. **对话过程中**：用户切换到了 `gemini-2.5-flash` 模型
3. **工具调用续传时**：代码仍然使用对话创建时的 `claude-opus-4-5-thinking`

#### 为什么会这样？

- `handleUpdateChatModel` 只更新了 `chat.model` 字段
- 但在工具调用续传时，代码直接从 `latestChat.model` 读取
- 这个值可能是旧的，没有反映用户的最新选择

### 解决方案

#### 修改前

```typescript
// 获取模型配置
const continueModel = models.find(m => m.id === latestChat.model);
if (!continueModel) {
  logger.warn(LogTags.APP, '工具续传：找不到模型配置', { model: latestChat.model });
  break;
}
```

#### 修改后

```typescript
// 获取模型配置
// v0.9.2: 优先使用当前选中的模型，而不是对话历史中保存的模型
// 这样可以确保用户切换模型后，工具调用续传也使用新模型
const continueModel = models.find(m => m.id === modelId) || models.find(m => m.id === latestChat.model);
if (!continueModel) {
  logger.warn(LogTags.APP, '工具续传：找不到模型配置', {
    currentModelId: modelId,
    chatModelId: latestChat.model
  });
  break;
}

// 记录使用的模型
if (import.meta.env.DEV) {
  logger.debug(LogTags.APP, '工具续传使用模型', {
    modelId: continueModel.id,
    modelName: continueModel.name,
    isCurrentModel: continueModel.id === modelId,
  });
}
```

#### 优先级逻辑

1. **优先使用当前选中的模型**（`modelId`）
2. **降级使用对话历史中的模型**（`latestChat.model`）

这样可以确保：
- 用户切换模型后，工具调用续传使用新模型
- 如果当前模型不存在，降级使用历史模型（向后兼容）

### 影响范围

#### 修改文件

- `src/App.tsx`（第 2888-2892 行）

#### 影响功能

- 工具调用续传
- 多轮对话
- 模型切换

### 测试场景

#### 场景 1：正常工具调用

1. 创建对话，选择 Gemini 模型
2. 发送消息触发工具调用
3. 工具调用续传应该使用 Gemini 模型 ✓

#### 场景 2：切换模型后工具调用

1. 创建对话，选择 Claude 模型
2. 发送消息触发工具调用
3. 切换到 Gemini 模型
4. 工具调用续传应该使用 Gemini 模型 ✓

#### 场景 3：模型不存在时降级

1. 创建对话，选择模型 A
2. 删除模型 A
3. 工具调用续传应该降级使用对话历史中的模型 ✓

### 日志输出

修复后，开发模式下会输出详细的模型信息：

```
[APP] 工具续传使用模型 {
  modelId: "gemini-2.5-flash-xxx",
  modelName: "Gemini 2.5 Flash",
  isCurrentModel: true
}
```

这样可以方便调试和确认使用的模型是否正确。

### 相关问题

#### Q: 为什么不直接使用 `modelId`？

A: 为了向后兼容。如果 `modelId` 对应的模型被删除了，降级使用历史模型可以避免工具调用失败。

#### Q: 用户切换模型后，历史消息会更新吗？

A: 不会。历史消息中的模型信息保持不变，只有新的工具调用续传会使用新模型。

#### Q: 这个修复会影响圆桌会议吗？

A: 不会。圆桌会议使用的是 Agent 配置的模型，不受此修复影响。

### 后续优化建议

1. **UI 提示**：当用户切换模型时，提示"后续对话将使用新模型"
2. **模型锁定**：添加"锁定模型"选项，防止意外切换
3. **历史同步**：提供"应用到历史消息"选项，更新历史消息的模型信息

### 变更记录

| 日期 | 版本 | 修改内容 | 修改人 |
|------|------|----------|--------|
| 2026-02-28 | v0.9.2 | 修复工具调用续传使用错误模型的问题 | - |
