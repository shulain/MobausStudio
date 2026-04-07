# ChatGPT Web 订阅代理模块 (chatgpt_web)

## 模块职责

将标准 OpenAI Chat Completions API 请求通过浏览器 TLS 指纹伪装，转发到 ChatGPT 内部 Codex Responses API 端点 (`https://chatgpt.com/backend-api/codex/responses`)，并将响应流转换回标准格式。

### 核心能力

- **浏览器 TLS 指纹伪装**：使用 rquest + rquest-util 模拟 Chrome 136 的 TLS Client Hello / HTTP/2 帧特征，绕过 Cloudflare Bot 检测
- **协议双向转换**：Chat Completions API <-> Codex Responses API 请求/响应格式转换
- **SSE 流式处理**：解析上游 Responses SSE 事件流，实时转换为标准 Chat Completions chunk
- **OAuth 认证**：支持 OpenAI OAuth 2.0 + PKCE 流程，自动 Token 刷新
- **Codex 模型映射**：将用户输入的模型名规范化为 Codex 端点支持的模型 ID

## 架构

```
services/chatgpt_web/
├── mod.rs        # 模块入口
├── types.rs      # 数据结构定义（请求/响应/SSE 事件/OAuth/模型映射）
├── transform.rs  # 协议转换（Chat Completions <-> Responses API）
├── client.rs     # 具有浏览器指纹的 HTTP 客户端
├── oauth.rs      # OpenAI OAuth 认证（PKCE 流程）
└── stream.rs     # SSE 流解析与转换
```

## 接口定义

### Tauri 命令

#### chatgpt_web_set_credentials(access_token, refresh_token, expires_at, client_id?, id_token?, account_id?)

设置 OAuth 凭证

**参数：**
- access_token (String): OAuth access_token
- refresh_token (String): OAuth refresh_token
- expires_at (u64): Token 过期时间（Unix 时间戳，秒）
- client_id (String, 可选): OAuth Client ID，默认使用内置 ID
- id_token (String, 可选): JWT ID Token，用于解析 chatgpt_account_id
- account_id (String, 可选): ChatGPT 账户 ID，直接传入优先于 JWT 解析

**返回：**
- 成功: `Ok(())`
- 失败: `Err("错误信息")`

#### chatgpt_web_generate_pkce()

生成 PKCE code_verifier 和 code_challenge

**返回：**
- 成功: `{ "verifier": "...", "challenge": "..." }`

#### chatgpt_web_build_authorize_url(code_challenge, state)

构建 OAuth 授权 URL

**参数：**
- code_challenge (String): PKCE code_challenge
- state (String): CSRF 防护随机值

**返回：**
- 成功: 完整的授权 URL 字符串

#### chatgpt_web_exchange_code(code, code_verifier)

使用授权码交换 Token

**参数：**
- code (String): 授权码
- code_verifier (String): PKCE code_verifier

**返回：**
- 成功: `{ "access_token": "...", "refresh_token": "...", "id_token": "...", "expires_in": 3600, "token_type": "Bearer" }`

#### chatgpt_web_test_connection()

测试订阅代理连接是否正常

**返回：**
- 成功: `{ "connected": true/false }`

#### chatgpt_web_stream_message(window, request)

流式发送消息（通过订阅代理）

**参数：**
- window: Tauri Window 引用
- request: ChatSendRequest（标准格式）

**事件（通过 Tauri 事件系统发送）：**
| 事件 | 字段 | 说明 |
|------|------|------|
| chunk | content | 文本内容增量 |
| reasoning_chunk | content | 推理内容增量 |
| tool_calls | tool_calls | 累积后的完整工具调用数组（finish_reason 触发时一次性发送） |
| done | usage（可选） | 流结束，附带 usage 使用量信息 |
| error | error | 错误信息 |

### 内部模块

#### types::normalize_codex_model(model)

将模型名规范化为 Codex 端点支持的 ID

**映射规则：**
| 输入 | 输出 |
|------|------|
| gpt-5.4 / gpt-5.4-* | gpt-5.4 |
| gpt-5.4-mini | gpt-5.4-mini |
| gpt-5.4-nano | gpt-5.4-nano |
| gpt-5.3 / gpt-5.3-* | gpt-5.3-codex |
| gpt-5.2 / gpt-5.2-* | gpt-5.2 |
| gpt-5.2-codex / gpt-5.2-codex-* | gpt-5.2-codex |
| gpt-5.1 / gpt-5.1-* | gpt-5.1 |
| gpt-5.1-codex / gpt-5.1-codex-* | gpt-5.1-codex |
| gpt-5.1-codex-max / gpt-5.1-codex-max-* | gpt-5.1-codex-max |
| gpt-5.1-codex-mini / gpt-5.1-codex-mini-* | gpt-5.1-codex-mini |
| gpt-5 / gpt-5-mini / gpt-5-nano | gpt-5.1 |
| 默认 | gpt-5.1 |

#### transform::chat_completions_to_responses(req, model)

将 Chat Completions 请求转换为 Responses API 格式

**转换规则：**
1. system 消息 -> instructions 字段
2. user 消息 -> input_text/input_image parts
3. assistant + tool_calls -> function_call items（call_id 前缀 call_ -> fc）
4. tool 消息 -> function_call_output items
5. 强制 store=false, stream=true
6. OAuth 模式删除 temperature/top_p/max_output_tokens
7. tools 格式转换：Chat Completions 嵌套格式 `{ type, function: { name, description, parameters } }` -> Responses API 扁平格式 `{ type, name, description, parameters }`
8. tools parameters schema 修补：Codex Responses API 要求 `object` 类型的 schema 必须包含 `properties` 字段，若缺失则补 `"properties": {}`。递归处理以下位置的子 schema：
   - `properties` 中的每个字段
   - `items`（单个对象或数组形式）
   - `anyOf` / `oneOf` / `allOf` 中的每个分支
   - `additionalProperties`（当为对象 schema 时）
   - `$defs` / `definitions` 中的每个定义

#### transform::responses_event_to_chunks(event, ctx)

将 Responses SSE 事件转换为 Chat Completions chunks

**事件映射：**
| Responses 事件 | Chat Completions 转换 |
|---|---|
| response.created | role: "assistant" 声明 |
| response.output_text.delta | content delta |
| response.output_item.added (function_call) | tool_calls 开始 |
| response.function_call_arguments.delta | tool_calls 参数增量 |
| response.reasoning_summary_text.delta | reasoning_content |
| response.completed | finish_reason + usage |
| response.incomplete | finish_reason: "length" |
| response.failed | 触发 StreamEvent::Error，透传错误信息 |

## 测试用例

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-CGWEB-001 | PKCE 对生成 | 调用 generate_pkce_pair | verifier 128字符，challenge 为合法 base64url |
| TC-CGWEB-002 | 授权 URL 构建 | challenge="abc", state="xyz" | URL 包含所有必要参数 |
| TC-CGWEB-003 | 模型规范化 - 精确匹配 | "gpt-5.4" | "gpt-5.4" |
| TC-CGWEB-004 | 模型规范化 - 带后缀 | "gpt-5.3-high" | "gpt-5.3-codex" |
| TC-CGWEB-005 | 模型规范化 - 通用别名 | "gpt-5" | "gpt-5.1" |
| TC-CGWEB-006 | 模型规范化 - 默认 | "unknown-model" | "gpt-5.1" |
| TC-CGWEB-007 | 请求转换 - 系统消息提取 | messages 含 system | instructions 字段非空 |
| TC-CGWEB-008 | 请求转换 - 工具调用 | assistant 含 tool_calls | input 含 function_call items |
| TC-CGWEB-009 | 请求转换 - call_id 规范化 | call_id="call_abc" | 转换为 "fcabc" |
| TC-CGWEB-010 | 响应转换 - 文本增量 | output_text.delta 事件 | content delta chunk |
| TC-CGWEB-011 | 响应转换 - 完成事件 | response.completed | finish_reason chunk |
| TC-CGWEB-012 | 响应转换 - 工具调用 | output_item.added function_call | tool_calls chunk |
| TC-CGWEB-013 | JWT 解析 account_id | 有效 ID Token | 正确提取 chatgpt_account_id |
| TC-CGWEB-014 | JWT 解析无效 | 无效 JWT | 返回 None |
| TC-CGWEB-015 | SSE 读取网络错误 | response.chunk() 返回 Err | 返回错误，触发 StreamEvent::Error（依赖 rquest，仅集成测试覆盖） |
| TC-CGWEB-016a | response.failed 错误提取 - 有详情 | response.failed 事件含 error.message | 正确提取 error_type 和 message |
| TC-CGWEB-016b | response.failed 错误提取 - 无详情 | response.failed 事件无 error 字段 | 返回默认错误信息 |
| TC-CGWEB-016c | response.failed 不生成 chunk | response.failed 事件传给 responses_event_to_chunks | 返回空 chunks，不误发 Done |
| TC-CGWEB-017 | 请求转换 - tools 格式转换 | Chat Completions 嵌套 tools | 转为 Responses API 扁平格式（name/description/parameters 提升到顶层） |
| TC-CGWEB-018 | 请求转换 - 无 tools | tools 为 None | 转换后 tools 仍为 None |
| TC-CGWEB-019 | 请求转换 - parameters schema 修补 | parameters 为 `{"type":"object"}` 无 properties | 自动补充 `"properties": {}` |
| TC-CGWEB-020 | 请求转换 - schema 修补覆盖组合/定义类 | anyOf/oneOf/allOf/$defs/additionalProperties/tuple items 中的 object 子 schema | 递归修补所有位置 |
| TC-CGWEB-021 | 前端防御 - 无参数 MCP 工具 formatToolsForAPI | inputSchema 只有 type:"object"，无 properties/required | properties 回退 {}，required 回退 [] |
| TC-CGWEB-022 | 前端防御 - 有参数 MCP 工具 formatToolsForAPI | inputSchema 含完整 properties 和 required | 原样保留，不被回退值覆盖 |
| TC-CGWEB-023 | 响应转换 - 多工具调用交错 argument delta | 两个 function_call 先后 added，argument delta 交错到达 | 每个 delta 通过 output_index→tool_call_index 映射路由到正确的工具调用 |

## 关键依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| rquest | 5.1 | HTTP 客户端（BoringSSL TLS） |
| rquest-util | 2.2 | 浏览器指纹预设（Chrome/Firefox/Safari） |
| sha2 | 0.10 | PKCE code_challenge SHA256 哈希 |
| base64 | 0.22 | JWT 解码、PKCE base64url 编码 |
| getrandom | 0.2 | PKCE code_verifier 安全随机数 |

## 变更记录

| 日期       | 修改内容                                                                     | 修改人 |
|------------|------------------------------------------------------------------------------|--------|
| 2026-04-07 | 初始版本：完整订阅代理实现                                                   | Kinzhi |
| 2026-04-07 | 前后端集成：chat_stream_message 路由切换到 rquest、OAuth 凭证同步、启动恢复  | Kinzhi |
| 2026-04-07 | 修复路由：account_id 为 None 时也能走订阅代理，增加 JWT 兜底解析             | Kinzhi |
| 2026-04-07 | 修复路由：修复 provider 匹配大小写问题，确保 OAuth 请求正确路由至订阅代理    | Kinzhi |
| 2026-04-07 | 修复流结束：上游未发 [DONE] 时兜底发送 Done 事件，防止前端无限等待           | Kinzhi |
| 2026-04-07 | 修复 tools 格式：Chat Completions 嵌套格式转为 Responses API 扁平格式        | Kinzhi |
| 2026-04-07 | 修复 tools parameters：object 类型缺少 properties 时自动补空对象             | Kinzhi |
| 2026-04-07 | 完善 schema 修补：递归覆盖 anyOf/oneOf/allOf/$defs/additionalProperties      | Kinzhi |
| 2026-04-07 | 前端防御：getAgentTools 中 MCP 工具无参数时 properties/required 回退空值     | Kinzhi |
| 2026-04-07 | 前端防御：formatToolsForAPI 中同步添加 properties/required 回退空值           | Kinzhi |
| 2026-04-07 | 前端测试：新增 TC-CGWEB-021/022 覆盖无参数 MCP 工具格式化输出                | Kinzhi |
| 2026-04-07 | 回归测试：新增 TC-CGWEB-016a/016b/016c 覆盖 response.failed 错误提取与空 chunk | Kinzhi |
| 2026-04-08 | 文档修正：事件表 reasoning→reasoning_chunk、tool_calls_delta→tool_calls、usage 并入 done | Kinzhi |
| 2026-04-08 | 回归测试：新增 TC-CGWEB-023 覆盖多工具调用交错 argument delta 路由                       | Kinzhi |
