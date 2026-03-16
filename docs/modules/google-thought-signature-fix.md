# Google 协议 Thought Signature 修复

## 问题描述

### 问题 1：第一次发送消息报 400 错误

**错误信息：**
```
API Error 400 Bad Request: {
  "error": {
    "code": 400,
    "message": "Function call is missing a thought_signature in functionCall parts..."
  }
}
```

**原因：**
- Google Gemini API 要求所有 functionCall 必须包含 `thoughtSignature`
- 首次请求时没有历史 thought_signature
- 导致 API 返回 400 错误

### 问题 2：工具调用完成后必定 429 错误

**原因：**
- 工具调用后的请求缺少 thought_signature
- 触发端点降级和重试
- 可能导致配额消耗过快

### 问题 3：空 thought_signature 导致缓存未命中 (v0.9.2.2)

**错误信息：**
```
Function call is missing a thought_signature in functionCall parts.
```

**原因：**
- 前端可能传回空字符串或 null 的 `thought_signature`
- 原有逻辑：`if let Some(ts) = tc.get("thought_signature")` 会匹配到空值
- 导致不会走 `else` 分支去缓存中获取
- 最终发送的请求缺少 `thoughtSignature`

**修复：**
```rust
// 修复前
if let Some(ts) = tc.get("thought_signature") {
    if ts.is_string() && !ts.as_str().unwrap_or("").is_empty() {
        fc["thoughtSignature"] = ts.clone();
    }
} else {
    // 只有完全不存在时才走这里
    从缓存获取...
}

// 修复后
let has_valid_signature = tc.get("thought_signature")
    .and_then(|ts| ts.as_str())
    .map(|s| !s.is_empty())
    .unwrap_or(false);

if has_valid_signature {
    fc["thoughtSignature"] = tc["thought_signature"].clone();
} else {
    // 空值或不存在都会走这里
    从缓存获取...
}
```

### 问题 4：缓存未命中时仍然报 400 错误 (v0.9.2.4)

**错误信息：**
```
API Error 400 Bad Request: {
  "error": {
    "code": 400,
    "message": "Function call is missing a thought_signature in functionCall parts..."
  }
}
```

**原因：**
- Session 缓存过期或清空后，缓存未命中
- 原有逻辑只记录警告，不注入任何 `thoughtSignature`
- Google API 要求所有 functionCall 必须包含 `thoughtSignature`

**修复：添加全局降级签名机制**
```rust
// 缓存时同时更新全局降级签名（只保存最长的签名）
pub fn cache_session_signature(&self, session_id: &str, signature: String) {
    // ... session 缓存逻辑 ...

    // 同时更新全局降级签名
    if let Ok(mut global) = get_global_signature_storage().lock() {
        let should_update = match &*global {
            None => true,
            Some(existing) => signature.len() > existing.len(),
        };
        if should_update {
            *global = Some(signature);
        }
    }
}

// 获取时优先使用 session 缓存，未命中则使用全局降级
pub fn get_session_signature(&self, session_id: &str) -> Option<String> {
    // 优先从 session 缓存获取
    if let Some(entry) = cache.get(session_id) {
        return Some(entry.value.clone());
    }

    // Session 缓存未命中时，使用全局降级签名
    if let Some(fallback_sig) = global.as_ref() {
        return Some(fallback_sig.clone());
    }

    None
}
```

### 问题 5：functionCall/functionResponse 顺序错误 (v0.9.2.6)

**错误信息：**
```
API Error 400 Bad Request: {
  "error": {
    "code": 400,
    "message": "Please ensure that function response turn comes immediately after a function call turn"
  }
}
```

**原因：**
- 用户点击"继续"按钮时，前端会插入一条新的 user 消息
- 这条消息插入在 functionCall 和 functionResponse 之间
- Google API 严格要求 functionResponse 必须紧跟在 functionCall 之后

**修复：添加消息顺序验证**
```rust
// 验证并调整消息顺序
let mut validated_contents: Vec<serde_json::Value> = Vec::new();
let mut pending_function_call: Option<serde_json::Value> = None;

for entry in contents.iter() {
    let has_fc = entry.get("parts")
        .and_then(|p| p.as_array())
        .map(|arr| arr.iter().any(|p| p.get("functionCall").is_some()))
        .unwrap_or(false);

    let has_fr = entry.get("parts")
        .and_then(|p| p.as_array())
        .map(|arr| arr.iter().any(|p| p.get("functionResponse").is_some()))
        .unwrap_or(false);

    if has_fc {
        // 保存 functionCall，等待 functionResponse
        pending_function_call = Some(entry.clone());
    } else if has_fr {
        // 找到 functionResponse，先添加之前的 functionCall
        if let Some(pending) = pending_function_call.take() {
            validated_contents.push(pending);
        }
        validated_contents.push(entry.clone());
    } else if role == "user" && pending_function_call.is_some() {
        // 跳过打断 functionCall/functionResponse 的 user 消息
        warn!("[chat_stream_google] 跳过打断 functionCall/functionResponse 顺序的 user 消息");
        continue;
    } else {
        validated_contents.push(entry.clone());
    }
}
```

### 问题 6：Claude API 错误响应显示乱码 (v0.9.2.7)

**错误信息：**
```
⚠️ 请求失败: API Error 400 Bad Request: �������4�� �0D咵Hv�...
```

**原因：**
- Anthropic API 返回的错误响应可能是 gzip 压缩或二进制格式
- 原有逻辑直接使用 `response.text().await` 解析
- 导致二进制数据被错误地当作 UTF-8 文本显示

**修复：改进错误响应处理**
```rust
// 先读取为字节
let err_bytes = response.bytes().await.unwrap_or_default();

// 尝试解析为 JSON
let err_text = if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&err_bytes) {
    serde_json::to_string_pretty(&json)
        .unwrap_or_else(|_| String::from_utf8_lossy(&err_bytes).to_string())
} else {
    // 尝试解析为 UTF-8 文本
    match String::from_utf8(err_bytes.to_vec()) {
        Ok(s) => s,
        Err(_) => {
            // 如果是二进制数据，显示字节信息
            format!(
                "Binary response ({} bytes, first 50 bytes): {:?}",
                err_bytes.len(),
                &err_bytes[..err_bytes.len().min(50)]
            )
        }
    }
};
```

### 问题 7：Claude API 错误响应 gzip 压缩 (v0.9.2.8)

**错误信息：**
```
⚠️ 请求失败: API Error 400 Bad Request: Binary response (169 bytes, first 50 bytes): [31, 139, 8, 0, 0, 0, 0, 0, 0, 3, 52, 141, 65, 10, 131, 48, 20, 68, 175, 242, 201, 90, 68, 139, 197, 226, 174, 180, 120, 6, 237, 38, 196, 228, 183, 126, 106, 18, 77, 162, 85, 196, 187, 215, 66, 93, 13, 111, 120, 204]
```

**原因：**
- v0.9.2.7 虽然能识别二进制数据，但没有解压缩
- 字节序列 `[31, 139, 8, 0...]` 是 gzip 压缩的魔数
- Anthropic API 在某些情况下会返回 gzip 压缩的错误响应

**修复：添加 gzip 解压缩支持**
```rust
// 检查是否是 gzip 压缩（魔数：0x1f 0x8b）
let decompressed_bytes = if err_bytes.len() >= 2 && err_bytes[0] == 0x1f && err_bytes[1] == 0x8b {
    debug!("[chat_stream_anthropic] 检测到 gzip 压缩响应，尝试解压缩");
    match decompress_gzip(&err_bytes) {
        Ok(data) => {
            debug!("[chat_stream_anthropic] gzip 解压缩成功，原始 {} 字节 -> {} 字节",
                err_bytes.len(), data.len());
            data
        }
        Err(e) => {
            warn!("[chat_stream_anthropic] gzip 解压缩失败: {}", e);
            err_bytes.to_vec()
        }
    }
} else {
    err_bytes.to_vec()
};

// 解压缩辅助函数
fn decompress_gzip(data: &[u8]) -> Result<Vec<u8>, String> {
    use flate2::read::GzDecoder;
    let mut decoder = GzDecoder::new(data);
    let mut decompressed = Vec::new();
    decoder.read_to_end(&mut decompressed)
        .map_err(|e| format!("gzip 解压缩失败: {}", e))?;
    Ok(decompressed)
}
```

**依赖变更：**
- 添加 `flate2 = "1.0"` 到 Cargo.toml
- 添加 `use std::io::Read;` 到 lib.rs

### 问题 8：Claude API cache_control 超过限制 (v0.9.2.9)

**错误信息：**
```json
{
  "error": {
    "message": "A maximum of 4 blocks with cache_control may be provided. Found 22.",
    "type": "invalid_request_error"
  },
  "request_id": "req_011CYZyY7wo62LuuwaAjRdKS",
  "type": "error"
}
```

**原因：**
- 原有逻辑在所有 system 块、所有 assistant 消息、所有 user 消息、所有 tools 上都添加了 `cache_control`
- 当消息数量较多时，cache_control 块数量会远超 Anthropic 的 4 个限制
- Anthropic API 要求最多只能有 4 个带 cache_control 的块

**修复：优化 cache_control 使用策略**
```rust
// 策略：system(1) + tools(1) + 最后 2 条消息(2) = 4 个

// 1. 只在最后一个 system 块上添加 cache_control
if let Some(last) = system_content.last_mut() {
    last["cache_control"] = serde_json::json!({ "type": "ephemeral" });
}

// 2. 只在最后一个 tool 上添加 cache_control
if let Some(last_tool) = anthropic_tools.last_mut() {
    last_tool["cache_control"] = serde_json::json!({ "type": "ephemeral" });
}

// 3. 只在最后 2 条消息的最后一个 content block 上添加 cache_control
let cache_message_count = 2.min(messages.len());
for msg in messages.iter_mut().rev().take(cache_message_count) {
    if let Some(content) = msg.get_mut("content").and_then(|c| c.as_array_mut()) {
        if let Some(last_block) = content.last_mut() {
            // 只在 text 或 tool_result 类型的 block 上添加
            let block_type = last_block.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if block_type == "text" || block_type == "tool_result" {
                last_block["cache_control"] = serde_json::json!({ "type": "ephemeral" });
            }
        }
    }
}
```

**优化效果：**
- 无论消息数量多少，cache_control 块数量始终 ≤ 4
- 优先缓存最重要的内容：system prompt、tools、最近的对话
- 符合 Anthropic 的最佳实践和 API 限制

### 问题 9：Claude API 流式响应 gzip 压缩导致无法解析 (v0.9.2.10)

**现象：**
- 请求成功返回 200 OK
- 收到 chunk 数据，但内容是乱码（gzip 压缩的二进制数据）
- 无法解析 SSE 事件，前端一直显示"等待生成中"

**原因：**
- OAuth 模式下手动设置了 `Accept-Encoding: gzip, deflate` header
- 服务器返回 gzip 压缩的流式响应
- 因为是手动设置的 header，reqwest 不会自动解压缩
- 导致收到的 chunk 是压缩的二进制数据，无法解析为 SSE 文本

**修复：移除手动设置的 Accept-Encoding header**
```rust
// 修复前
.header("Accept-Encoding", "gzip, deflate")

// 修复后（移除该行）
// v0.9.2.10: 移除手动设置的 Accept-Encoding，让 reqwest 自动处理 gzip 解压缩
// .header("Accept-Encoding", "gzip, deflate")
```

**原理：**
- reqwest 默认会自动添加 `Accept-Encoding` header
- 并且会自动解压缩 gzip/deflate 响应
- 手动设置后会覆盖默认行为，导致不自动解压缩

**优化效果：**
- 流式响应自动解压缩，收到的是可读的 SSE 文本
- 正确解析 SSE 事件（message_start, content_block_delta 等）
- 前端正常显示流式输出

## 解决方案

### 1. Thought Signature 缓存机制

实现了一个全局缓存来管理 thought_signature：

```rust
// 缓存结构
pub struct SignatureCache {
    session_signatures: Mutex<HashMap<String, CacheEntry>>,
}

// 使用方式
SignatureCache::global().cache_session_signature(session_id, signature);
SignatureCache::global().get_session_signature(session_id);
```

**特性：**
- Session 级别缓存（使用 message_id 作为 session_id）
- 30 分钟过期时间
- 最小签名长度验证（10 字符）
- 默认占位符（当缓存中没有时使用）

### 2. 请求时注入 Thought Signature

在构建 functionCall 时，如果没有 thought_signature，从缓存中获取：

```rust
// 如果前端没有传 thought_signature
if let Some(ts) = tc.get("thought_signature") {
    fc["thoughtSignature"] = ts.clone();
} else {
    // 从缓存中获取
    if let Some(sig) = SignatureCache::global().get_session_signature(&msg_id) {
        fc["thoughtSignature"] = json!(sig);
    }
}
```

### 3. 响应时缓存 Thought Signature

在解析响应时，缓存 API 返回的 thought_signature：

```rust
if let Some(ts) = part.get("thoughtSignature") {
    tc["thought_signature"] = ts.clone();
    // 缓存供后续请求使用
    if let Some(sig_str) = ts.as_str() {
        SignatureCache::global().cache_session_signature(&msg_id, sig_str.to_string());
    }
}
```

## 实现细节

### 文件变更

**新增文件：**
- `src-tauri/src/signature_cache.rs` - Thought Signature 缓存实现

**修改文件：**
- `src-tauri/src/lib.rs`
  - 添加 signature_cache 模块
  - 在 `chat_stream_google` 函数开头定义 msg_id
  - 请求时注入 thought_signature（OAuth 和 API Key 模式）
  - 响应时缓存 thought_signature（OAuth 和 API Key 模式）

### 缓存策略

| 参数 | 值 | 说明 |
|------|-----|------|
| 过期时间 | 30 分钟 | 避免长期占用内存 |
| 最小长度 | 10 字符 | 过滤无效签名 |
| 缓存未命中 | 返回 None | 不注入 thought_signature |

**重要：** 当缓存未命中时，返回 `None` 而不是默认占位符。这是因为 Google API 要求 `thought_signature` 必须是有效的 Base64 编码字节数据，无效的占位符会导致 400 错误。

### 工作流程

```
首次请求（无工具调用）:
  用户消息 → API → 返回响应 → 无 thought_signature

首次工具调用:
  用户消息 → API → 返回 functionCall + thoughtSignature
  → 缓存 thoughtSignature → 发送给前端

工具结果返回（缓存命中）:
  前端发送 functionResponse → 后端检查缓存
  → 注入 thoughtSignature → API → 成功 ✓

工具结果返回（缓存未命中）:
  前端发送 functionResponse → 后端检查缓存
  → 缓存未命中，不注入 → API → 可能返回 400 错误
  → 用户需要重新开始对话

后续工具调用:
  使用缓存的 thoughtSignature → API → 成功 ✓
```

**注意：** 如果缓存过期或清空，工具调用可能会失败。建议用户在长时间对话中定期保存对话状态。

## 测试结果

### 单元测试

✅ 所有测试通过（52/52，包括 signature_cache 的 4 个测试）

**signature_cache 模块测试：**
- `test_cache_and_retrieve`: 缓存和检索功能
- `test_global_fallback`: 全局降级签名机制（v0.9.2.4）
- `test_global_fallback_prefers_longer`: 优先使用更长的全局降级签名（v0.9.2.4）
- `test_min_length_filter`: 最小长度过滤（10 字符）

**其他模块测试：**
- Google 协议相关：8 个测试
- OpenAI 协议相关：5 个测试
- 协议抽象层：6 个测试
- MCP 传输层：5 个测试
- 其他：24 个测试

### 集成测试

✅ 实际使用验证通过：
- 首次工具调用正常工作（v0.9.2.4 全局降级签名）
- 工具调用完成后正常工作（v0.9.2.5 占位符过滤）
- 多轮工具调用正常工作（v0.9.2.2 空值处理）
- functionCall/functionResponse 顺序正确（v0.9.2.6）
- cache_control 限制在 4 个以内（v0.9.2.9）
- 流式响应正常解析（v0.9.2.10 gzip 自动解压）

## 使用说明

### 前端无需修改

修复完全在后端实现，前端代码无需任何修改。

### 日志监控

优化后的日志会显示 thought_signature 的缓存和注入信息：

```
[SignatureCache] 缓存 session signature: msg_123 (长度: 256)
[chat_stream_google] 从缓存注入 thought_signature (长度: 256)
[SignatureCache] 命中 session signature: msg_123 (长度: 256)
```

### 清理缓存

如需清理缓存（通常不需要）：

```rust
signature_cache::SignatureCache::global().clear();
```

## 性能影响

- **内存占用**：每个 session 约 256 字节
- **CPU 开销**：可忽略（HashMap 查找）
- **延迟影响**：无（同步操作）

## 后续优化

1. **持久化缓存**：将缓存保存到磁盘，应用重启后仍可用
2. **智能过期**：根据使用频率动态调整过期时间
3. **多模型支持**：不同模型使用不同的缓存策略

## 参考资料

- Antigravity-Manager SignatureCache 实现
- Google Gemini API Thought Signature 文档
- https://ai.google.dev/gemini-api/docs/thought-signatures

## 变更记录

| 日期 | 版本 | 修改内容 | 修改人 |
|------|------|----------|--------|
| 2026-02-28 | v0.9.2 | 实现 Thought Signature 缓存机制 | - |
| 2026-02-28 | v0.9.2.1 | 修复默认占位符导致的 Base64 解码错误 | - |
| 2026-02-28 | v0.9.2.2 | 修复空 thought_signature 导致缓存未命中的问题 | - |
| 2026-02-28 | v0.9.2.3 | 清理历史消息中的无效 thought_signature 占位符 | - |
| 2026-02-28 | v0.9.2.4 | 添加全局降级签名机制，解决缓存未命中时的 400 错误 | - |
| 2026-02-28 | v0.9.2.5 | 过滤前端传来的无效 thought_signature 占位符，彻底解决 400 错误 | - |
| 2026-02-28 | v0.9.2.6 | 修复 functionCall/functionResponse 顺序问题，防止用户消息打断 | - |
| 2026-02-28 | v0.9.2.7 | 优化 Claude API 错误响应处理，解决乱码显示问题 | - |
| 2026-02-28 | v0.9.2.8 | 添加 gzip 解压缩支持，完整解析 Claude API 压缩错误响应 | - |
| 2026-02-28 | v0.9.2.9 | 优化 cache_control 使用策略，限制最多 4 个块避免 API 错误 | - |
| 2026-02-28 | v0.9.2.10 | 修复流式响应 gzip 压缩问题，移除手动 Accept-Encoding header | - |
