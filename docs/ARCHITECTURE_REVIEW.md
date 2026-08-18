# 架构检查报告 / Architecture Review

| 项目 | 内容 |
| ---- | ---- |
| 检查日期 | 2026-08-17 |
| 检查基线 | `4bd3623`（`v0.8.8` 标签指向 `b4c48cc`，`4bd3623` 是其后的 CI 提交，两者无源码差异） |
| 检查范围 | `src/`、`src-tauri/src/`、构建与 CI 配置、`docs/` |
| 检查方式 | 静态扫描 + 结构分析，未执行运行时测试 |
| 状态最后更新 | 2026-08-18（阶段 1 全部、阶段 2 全部；阶段 4 完成 S4、D5、D6） |
| 状态对应版本 | `931953c`。前端/脚本改动已在本机验证（lint、双份 tsc、测试 1547/1547、覆盖率阈值、门禁单测全绿）；Rust 改动因本机无工具链未经编译 |

> 本文是一次性的架构评估记录，用于指导重构排期。
>
> **更新状态时必须同时更新上表的「状态最后更新」与「状态对应版本」**，否则清单中的"已修复"无法对应到任何可复现的代码状态。
>
> 编号（S 安全 / R 健壮性 / E 工程质量 / A 架构结构 / D 重复一致性 / W 文档）仅表示类别，不表示优先级；实际优先级见「整改路线」一节。正文按严重度组织。

---

## 一、总体结论

技术选型与外围模块质量良好。问题集中在两个主干文件、一个未落地的抽象层，以及三项覆盖不完整的质量门禁。

值得注意的是，本文列出的多数问题，**其正确解法都能在本仓库内找到现成实现**：

| 正确范式 | 所在位置 | 主干是否采用 |
| -------- | -------- | ------------ |
| 协议抽象层 | `src-tauri/src/protocol/` | 否（`lib.rs` 中 4 处文本命中，实际调用仅 2 处） |
| 模块化拆分 | `services/config_exporter/`（六文件） | 否（`lib.rs` 13836 行） |
| 敏感文件权限收紧 | `services/secure_file.rs`（原 `writer.rs` 内联逻辑，阶段 1 已提取） | 是（阶段 1 已应用于凭证文件） |
| 熵源失败即返回 `Err` | `services/chatgpt_web/oauth.rs:43` | 是（阶段 1 已对齐 Kiro PKCE） |
| 结构化错误类型 | `mcp/error.rs`、`config_exporter/error.rs` | 否（108 处 `Result<_, String>`） |
| 纯函数 + 独立测试 | `services/*/xxxState.ts` | 部分（另一半逻辑留在 `App.tsx`） |

**在检查基线中，正确做法只应用在外围模块，主干走的是另一套。** 新功能因而倾向于继续堆积在主干上，形成正反馈。修复时应优先复用上表中的既有范式，而非引入新方案 —— 阶段 1 对权限收紧与熵源处理的修复即是按此原则实施的。

| 维度 | 评价 |
| ---- | ---- |
| 技术分层（Tauri / React 职责划分） | 良好 |
| 外围模块组织 | 良好 |
| 主干文件规模 | **失控** |
| 抽象层落地程度 | **未落地** |
| 安全实现 | **存在缺陷** |
| 质量门禁有效性 | **覆盖不完整** |
| CI 覆盖广度 | 优秀 |

---

## 二、问题清单

| 编号 | 问题 | 类别 | 严重度 | 阶段 | 依赖 | 状态 |
| ---- | ---- | ---- | ------ | ---- | ---- | ---- |
| S1 | Kiro PKCE 随机数降级方案可预测 | 安全 | 高 | 1 | — | **已修复（待 CI 验证）** |
| S2 | 凭证文件未复用仓库内已有的权限收紧逻辑 | 安全 | 高 | 1 | — | **Unix 已修复（待 CI 验证）；Windows 与权限设置失败路径仍有剩余风险** |
| R1 | `Mutex::lock().unwrap()` 存在锁中毒风险 | 健壮性 | 高 | 1 | — | **已修复（待 CI 验证）** |
| E1 | 测试代码不参与类型检查与 lint | 工程质量 | 高 | 2 | — | **已修复并验证**（90 个类型错误、391 个 lint 问题清零） |
| D1 | 聊天协议回退逻辑重复 5 处且写法不一致 | 重复一致性 | 高 | 3 | — | 待修复 |
| A3 | `protocol/` 抽象层已建立但未被主干使用 | 架构结构 | 高 | 6 | 阶段 2、R2 | 待重构 |
| A1 | `lib.rs` 单文件 13836 行，承载 85 个命令 | 架构结构 | 高 | 7 | R2、A3 | 待重构 |
| A2 | `App.tsx` 单文件 5159 行，承载全部全局状态 | 架构结构 | 高 | 7 | 阶段 2、**A4** | 待重构 |
| E2 | warning 类技术债不阻断 CI | 工程质量 | 中 | 2 | — | **已修复并验证**（`--max-warnings=0` + 四条规则升 error） |
| E3 | CI 未运行覆盖率任务，且无阈值 | 工程质量 | 中 | 2 | E4 | **已修复并验证**（CI 跑 `test:coverage`，阈值按全绿基线设定并反向验证可拦截） |
| E4 | Node 22+ 内置 Web Storage 致 201 个测试假失败；且无版本约束 | 工程质量 | 高 | 2 | — | **已修复并验证**（关闭内置 Web Storage，测试 1547/1547 全绿；Node 统一至 24 LTS） |
| S3 | 静态预览模式未禁用凭证输入与持久化 | 安全 | 中 | 4 | — | 待修复 |
| S4 | 文件写入能力域为 `$HOME/**`，范围过宽 | 安全 | 中 | 4 | — | **已修复并验证**（门禁测试 20 项全通过，含回退拦截） |
| D2 | 三套 PKCE 实现，缺陷仅存在于其中一套 | 重复一致性 | 中 | 4 | S1 | 待对齐 |
| R2 | 错误类型统一擦除为 `String` | 健壮性 | 中 | 5 | — | 待重构 |
| D4 | `types/index.ts` 单文件 98 个类型 | 重复一致性 | 中 | 7 | — | 待拆分 |
| D3 | 发布版本号与模块内部版本号语义混用 | 重复一致性 | 中 | 8 | — | 待统一 |
| W2 | 18 份文档引用 v0.9.x，版本语义无法判读 | 文档 | 中 | 8 | D3 | 待判定 |
| W1 | `docs/modules/` 混入 13 份一次性排查记录 | 文档 | 中 | 8 | — | 待整理 |
| A4 | 业务逻辑落点规则不统一 | 架构结构 | 中 | 7（先于/同步于 A2） | — | 待重构 |
| D5 | 死依赖 `@types/bech32` | 重复一致性 | 低 | 4 | — | **已清理并验证**（三处清零；连带修复 D6） |
| D6 | `@types/node` 未声明，仅靠死依赖传递供给 | 重复一致性 | 中 | 4 | D5 | **已修复并验证**（提为显式 devDependency） |

---

## 三、高严重度问题

### S1 · Kiro PKCE 随机数降级方案可预测

**位置**：`src-tauri/src/lib.rs:3203`（`generate_pkce`）、`src-tauri/src/lib.rs:3227`（`generate_state`）

```rust
let mut verifier_bytes = [0u8; 32];
getrandom::getrandom(&mut verifier_bytes).unwrap_or_else(|_| {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    verifier_bytes[..16].copy_from_slice(&now.to_le_bytes());
});
```

当 `getrandom` 失败时降级为时间戳填充：

- `code_verifier`：32 字节缓冲区只填充前 16 字节，**后 16 字节恒为 0**，前 16 字节是可推测的纳秒时间戳；
- `state`：16 字节全部来自时间戳，攻击者可枚举。

后果是 PKCE 的授权码拦截防护与 `state` 的 CSRF 防护同时失效。影响范围限于 Kiro 授权流程，另两套 PKCE 实现无此缺陷（见 D2）。

**修复**：熵源失败属于不可恢复错误，应中止授权流程而非降级。对齐 `src-tauri/src/services/chatgpt_web/oauth.rs:43` 的 `generate_pkce_pair()` —— 返回 `Result<(String, String), String>`，不做任何降级。

### S2 · 凭证文件未复用仓库内已有的权限收紧逻辑

**位置**：`src-tauri/src/lib.rs:2009` 附近（`save_provider_credentials`）、`save_api_keys`

OAuth Token 与 API Key 经 `serde_json::to_string_pretty` 后由 `fs::write` 直接写入 `provider_credentials.json` 与 `api_keys.json`，未做任何权限设置。

而 `src-tauri/src/services/config_exporter/writer.rs` 已实现完整的权限处理：`461-465` 行对父目录设置 `0o700`，`476-480` 行对 `.env` 文件设置 `0o600`，`179-182` 行在原子写入时保留原权限位。**这套逻辑没有应用到两个凭证文件上。**

最终文件模式取决于进程 umask 与父目录权限，因此无法断言凭证一定可被同机其他用户读取。但凭证保护不应建立在 umask 假设之上 —— 权限必须显式设置，这也正是 `writer.rs` 已采取的做法。

**修复**（阶段 1 已实施）：权限逻辑提取为 `services/secure_file.rs`，`provider_credentials.json` 与 `api_keys.json` 改用 `write_secure()` —— Unix 下以 `OpenOptions::mode(0o600)` 在创建时即设定权限（消除"先建文件后 chmod"的窗口），写入后再显式 chmod 一次以收紧旧版本遗留的宽松权限文件。

**剩余风险**（未闭环，本项不应视为完全修复）：

1. **权限设置失败仅记录警告**，不中断写入。凭证仍会以宽松权限落盘，用户只能从日志察觉。选择尽力而为而非失败即中止，是因为 exFAT、部分网络挂载等文件系统不支持 Unix 权限位，此时 chmod 必然失败但写入本身正常 —— 失败即中止会让这些环境完全无法保存凭证。代价是这类环境下凭证不受权限保护。
2. **Windows 未主动设置 ACL**，仅依赖用户配置目录自身的继承权限。
3. 两项的共同收敛方向是迁移至系统钥匙串（macOS Keychain / Windows Credential Manager / Linux Secret Service），届时权限问题不再由本项目承担。在此之前，至少应将权限设置失败上报到界面而非仅写日志。

### R1 · `Mutex::lock().unwrap()` 存在锁中毒风险

**位置**：`src-tauri/src/lib.rs` 共 13 处 —— `2935`、`3102`、`3113`、`3323`、`3335`、`3463`、`3550`、`3709`、`3722`、`7155`、`7160`、`7169`、`7179`；另有 `src-tauri/src/services/config_exporter/watcher.rs:94` 1 处。

涉及全局状态 `KIRO_CLIENT_REGISTRATION`、`KIRO_IDC_CLIENT_REGISTRATION`、`KIRO_SOCIAL_AUTH_STATE`。

`std::sync::Mutex` 在持锁线程 panic 后进入中毒状态，此后每次 `lock().unwrap()` 都会 panic。这三个全局状态贯穿 Kiro OAuth 全流程，**一次 panic 会导致 Kiro 登录持续不可用，直到用户重启应用**。

**修复**：统一改为容忍中毒的写法，或替换为 `parking_lot::Mutex`（无中毒语义）。

```rust
let mut registration = KIRO_CLIENT_REGISTRATION
    .lock()
    .unwrap_or_else(|poisoned| poisoned.into_inner());
```

`writer.rs`、`http.rs`、`protocol/*.rs` 中的其余 `unwrap()` 已逐处核对，全部位于 `#[cfg(test)]` 模块内，不属于此问题。

### E1 · 测试代码不参与类型检查与 lint

| 配置 | 内容 |
| ---- | ---- |
| `tsconfig.json:24` | `"exclude": ["src/test", "**/*.test.ts", "**/*.test.tsx"]` |
| `eslint.config.js:22` | `'src/test/**',  // 忽略测试文件，减少噪声` |
| `package.json:19` | `"test": "tsc --noEmit && vitest"` |

`npm test` 中的 `tsc --noEmit` 使用的正是排除了测试目录的根 `tsconfig.json`。

`src/` 下共 223 个 TS/TSX 文件，其中 `src/test/` 下有 98 个（96 个 `*.test.*` 加 2 个测试辅助文件）。即 **98/223 ≈ 44% 的 TS 文件处于零静态检查状态**，其中的类型错误、未使用变量、错误的 Hook 用法均无提示。

**修复**：新建 `tsconfig.test.json` 时，仅 `extends` 根配置并设置 `include` 无效 —— `extends` 会继承基础配置的 `exclude`，而 `exclude` 反过来过滤 `include`，测试文件仍被排除。必须显式覆盖为空数组：

```jsonc
// tsconfig.test.json
{
  "extends": "./tsconfig.json",
  "include": ["src"],
  "exclude": []          // 必须显式清空，否则继承根配置的 exclude 后测试仍不被检查
}
```

随后将 `test` 脚本改为 `tsc --noEmit -p tsconfig.test.json && vitest`，并移除 ESLint 对 `src/test/**` 的忽略（对测试文件单独放宽个别规则，而非整体豁免）。

**实施结果**（已完成并验证）：打开检查后暴露 **90 个类型错误**，全部修复至 0。其中 28 处为 `jsx: react-jsx` 下不再需要的 `import React`，其余 62 处是实打实的类型不匹配 —— 桩数据缺少必填字段（`MCPServer` 缺 `description`/`authType`/`requestCount`、`Chat` 缺 `starred`/`model`、`ProviderCredential` 缺 `createdAt`/`updatedAt`）、类型取值错误（`ProviderAuthMethod` 被当作字符串数组、`type: 'api-key'` 不在 `ProviderAuthType` 中、`authMethod: 'google'` 不在 `'aws' | 'idc'` 中、`ProviderAuthMethod` 的字段是 `label` 而非 `name`）、组件必填 props 缺失（`ProviderSelector` 的 `onDisable` 缺 7 处）。

其中一处值得单独记录：`src/test/hooks/useAppBootstrap.protocol.test.ts` 复制了生产代码的 CustomProvider 映射逻辑用于断言，但写的是 `models: cp.models`，而生产代码（`useAppBootstrap.ts:368`）是 `models: []` 且 `CustomProvider` 类型上根本没有 `models` 字段。**测试复制的逻辑已与生产漂移，且因不做类型检查而长期无人发现** —— 这正是本项要解决的问题的具体实例。

脚本改动同时覆盖 `typecheck`、`test`、`test:run`、`test:coverage` 四处，避免留下仍走旧配置的入口。

### E4 · Node 22+ 内置 Web Storage 致 201 个测试假失败；且无 Node 版本约束

在 Node 26 下运行 `npx vitest run`：

```
Test Files  7 failed | 89 passed (96)
     Tests  201 failed | 1346 passed (1547)
TypeError: Cannot read properties of undefined (reading 'clear')   // localStorage.clear()
```

根因来自 Node 自身的诊断输出：

```
ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
```

Node 22 起引入内置的实验性 Web Storage。在 jsdom 环境下，Node 的 `globalThis.localStorage` 会**遮蔽 jsdom 注入的实现**，且因未提供 `--localstorage-file` 而不可用。实测 `window.localStorage` 与 `globalThis.localStorage` 是同一个对象且均为 `undefined` —— 说明 jsdom 的 Storage 根本没有装上，**无法在测试初始化阶段补救**。

同时，`.github/workflows/ci.yml` 在 4 处固定 `node-version`，而仓库既无 `.nvmrc` 也无 `engines` 字段，本地环境不受约束。任何使用较新 Node 的贡献者一上来就会遇到 201 个失败，且报错信息完全指不向真因。

**修复**（已完成并验证）：

| 变更 | 内容 |
| ---- | ---- |
| `vite.config.ts` | 配置加载期在 `VITEST` 下追加 `NODE_OPTIONS=--no-experimental-webstorage`，交回 jsdom 实现 |
| `.nvmrc` | 新增，内容 `24` |
| `package.json` | 新增 `"engines": { "node": ">=24" }` |
| `.github/workflows/*.yml` | `ci.yml` 4 处、`release.yml` 2 处、`docs.yml` 1 处，`node-version` 统一为 `24` |

验证：`npx vitest run` **1547/1547 全绿**，无需在命令行传任何参数。

两处实现选择的理由：

1. **不降级到 Node 20**。Node 20 已于 2026-04-30 EOL，不再接收安全修复；Node 24 是当前 Active LTS。用降级规避运行时特性变化，等于把安全风险换成兼容性便利。正确做法是升到 24 并显式关闭该实验特性。
2. **不写在 npm 脚本的 `NODE_OPTIONS` 前缀**。Windows 的 cmd 不支持 `VAR=value cmd` 内联语法，写在脚本里会让 Windows 开发者失效。也不能用 Vitest 的 `poolOptions.*.execArgv` —— 实测 Vitest 4 会覆盖 worker 的 `execArgv`（探针显示注入的参数不在 `process.execArgv` 中）。因此改在 `vite.config.ts` 配置加载期设置环境变量，worker 进程继承之，跨平台且不污染 `vite dev` / `vite build`（以 `process.env.VITEST` 为条件）。

### D1 · 聊天协议回退逻辑重复 5 处且写法不一致

`src/App.tsx` 中与聊天请求相关的三级回退（model → provider → default）共 5 处：

| 行号 | 写法 |
| ---- | ---- |
| `1346` | 提取为 `effectiveProtocol` 局部变量 |
| `1770` | 提取为 `effectiveProtocol` 局部变量 |
| `2227` | 直接内联在请求字面量中 |
| `3268` | 直接内联在请求字面量中 |
| `3433` | 直接内联在请求字面量中 |

后三处的注释分别为"补充缺失的 protocol 字段"与"修复自定义提供商协议未传递的 bug"，**注释本身即记录了此处已因漏传字段产生过两次缺陷**。

同时 `invoke('chat_stream_message')` 在 `App.tsx` 中有 5 个独立调用点（`1348`、`1772`、`2220`、`3319`、`3469`），每处各自拼装请求体。字段增减时遗漏是必然结果。

另有 2 处 `getDefaultProtocol` 调用（`4098` 自定义提供商映射、`4511` 批量测模型）属于不同场景，不在本项范围内。

**修复**：抽取单一入口 `buildChatStreamRequest(model, providers, messages, options)`，5 个调用点全部改为调用它。这是投入产出比最高的一项修复。

### A3 · `protocol/` 抽象层已建立但未被主干使用

`src-tauri/src/protocol/` 定义了完整的协议抽象，共 3424 行（`mod.rs` 431 行，加 `google.rs` 1226 / `aws.rs` 692 / `anthropic.rs` 560 / `openai.rs` 515 四个实现共 2993 行）。而 `lib.rs` 中对它的实际调用**只有两处**：

| 行号 | 内容 | 是否为 AI 协议层调用 |
| ---- | ---- | -------------------- |
| `8491` | `protocol::normalize_url(...)` | 是（工具函数） |
| `10280` | `protocol::google::GoogleProtocol::call_with_fallback_and_retry(...)` | 是 |
| `31` | `use mcp::protocol::{...}` | 否 —— MCP 自身的协议模块，与 AI 协议层无关 |
| `10093` | 注释「端点管理已移至 protocol::google……」 | 否 —— 注释 |

即 3424 行的抽象层，在主干中只有一个工具函数和一条 Google 路径真正接入。

协议逻辑因此存在两套并行实现，新增协议特性时没有唯一正确的落点。这是当前最大的结构性隐患，也是 `docs/modules/` 中大量 `google-*-fix` 类修复记录的根源。

**修复**：确立"所有协议实现必须位于 `protocol/`，`lib.rs` 只保留命令入口"的硬约束并写入模块文档，然后逐个迁移 `chat_stream_*` 函数。

### A1 · `lib.rs` 单文件 13836 行，承载 85 个 Tauri 命令

内部超大函数：

| 函数 | 起始行 | 约行数 |
| ---- | ------ | ------ |
| `chat_stream_google` | 9361 | 约 2100 |
| `chat_stream_anthropic` | 8474 | 约 890 |
| `chat_stream_kiro` | 11546 | 约 480 |
| `chat_stream_responses_api` | 12285 | 约 310 |
| `chat_stream_codex_api` | 12023 | 约 260 |

单文件同时承担命令注册、协议实现、OAuth 流程、数据持久化、MCP 桥接五类职责，任何改动的影响范围都无法通过文件边界判断。

**修复**：按域拆分为 `commands/storage.rs`、`commands/oauth.rs`、`commands/mcp.rs`、`commands/chat.rs`，`lib.rs` 仅保留命令注册与应用装配。参照 `services/config_exporter/` 的拆分方式。须在 R2 之后执行，避免签名二次迁移。

### A2 · `App.tsx` 单文件 5159 行，承载全部全局状态

- 全部业务状态与编排逻辑集中在单个组件中；
- `generateAgentResponse` 自 `716` 行起，单个 `useCallback` 逾千行；
- `<ChatPage>` 接收 24 个 props，无 Context / Store，全靠逐层传递；
- 文件后半部分顶层缩进不一致，是长期追加而非结构化设计的痕迹。

**修复**：分三步 —— 先将 `generateAgentResponse` 提取为 `services/chat/agentResponseRunner.ts`（可单测），再将圆桌逻辑统一归入 `services/roundtable/`，最后引入 Context 消除 props 逐层传递。

---

## 四、中严重度问题

### E2 · warning 类技术债不阻断 CI

```json
"lint": "eslint src --ext .ts,.tsx"
```

lint 门禁部分有效：`eslint.config.js` 引入了 `js.configs.recommended` 与 `tseslint.configs.recommended`（含大量 error 级规则），并显式将 `react-hooks/rules-of-hooks` 设为 `'error'`，这些违规会中断 CI。

失效的是另一半：`no-console`、`@typescript-eslint/no-explicit-any`、`no-unused-vars`、`react-hooks/exhaustive-deps` 四条配置为 `'warn'`，而 lint 脚本未设 `--max-warnings`，因此这一类技术债可以无限累积而不触发拦截。

当前累积量（实测，非文本检索推算）：

| 范围 | ESLint 报告 |
| ---- | ---- |
| `src/`（不含测试） | **0 问题** |
| `src/test/`（原被整体忽略） | 391 问题 = 282 `no-console` + 94 `no-explicit-any` + 14 `no-unused-vars` + 1 `ban-ts-comment`(error) |

> **修正**：本报告早期版本称 `src/` 有「28 处 `console.*` 违规、19 处 any/disable」，该结论基于 `grep` 文本检索，不成立。实际以 ESLint 判定：其中 8 处是配置显式允许的 `console.error`，6 处位于 JSDoc 注释示例内（`statsUtils.ts:180`、`pkce.ts:77-78`、`skillUtils.ts:1513/1653`、`mcpConnection.ts:101`），其余为带显式 `eslint-disable` 登记的用例。**生产代码本身是干净的，债全部集中在被忽略的测试代码里。**

**修复**（已实施并验证）：

| 变更 | 内容 |
| ---- | ---- |
| `package.json` | `"lint": "eslint src --ext .ts,.tsx --max-warnings=0"` |
| `eslint.config.js` | `no-console`、`no-explicit-any`、`no-unused-vars`、`exhaustive-deps` 四条由 `warn` 升为 `error` |
| `eslint.config.js` | 移除 `src/test/**` 整体忽略；改为对测试文件定向关闭 `no-console` 与 `no-explicit-any`（断言诊断输出与桩数据构造在测试中属正常手段），保留 `no-unused-vars`、`ban-ts-comment`、`rules-of-hooks` 等 |
| 测试代码 | 修复 15 处 `no-unused-vars` 与 1 处 `@ts-ignore`（改为 `@ts-expect-error` 并补充说明） |

验证：`npm run lint` 通过，退出码 0。

`exhaustive-deps` 升为 error 后，`useAppBootstrap.ts` 中 3 处既有的显式 `eslint-disable-next-line` 仍然生效 —— 它们是有意登记的豁免，不是新增违规。依赖数组不完整会产生陈旧闭包，这 3 处仍建议后续逐个复核。

### E3 · CI 未运行覆盖率任务，且无阈值

两个问题叠加，只解决其一无效：

1. `vite.config.ts:19` 的 coverage 配置仅有 `provider` 与 `reporter`，无 `thresholds`；
2. `.github/workflows/ci.yml:72` 运行的是 `npm test`，而非 `npm run test:coverage`。

即便补上阈值，CI 也不会执行覆盖率任务，阈值不会被触发。

**修复**：CI 中将测试步骤改为 `npm run test:coverage`（或追加一个覆盖率步骤），同时在 `vite.config.ts` 中以当前实际覆盖率为基线设置 `thresholds`，只升不降。

**实施结果**（已完成并验证）：

| 变更 | 内容 |
| ---- | ---- |
| `.github/workflows/ci.yml:72` | `npm test` → `npm run test:coverage` |
| `vite.config.ts` | 新增 `coverage.thresholds` |

阈值取自 E4 修复后的全绿运行（1547/1547）实测基线：

| 指标 | 实测 | 阈值 |
| ---- | ---- | ---- |
| statements | 56.77 | 55 |
| branches | 48.92 | 47 |
| functions | 55.08 | 53 |
| lines | 58.31 | 56 |

下调约 2 个百分点是因为实测同一提交两次运行存在 ±0.05 的浮动，留余量可避免抖动误报。**反向验证**：将 statements 阈值临时改为 99 后，`vitest run --coverage` 以退出码 1 失败，确认阈值确实生效而非摆设。

> 此前无法设定阈值，是因为本机受 E4 影响有 201 个失败，覆盖率被虚假压低。E4 修复后基线才可信 —— 这也是 E3 依赖 E4 的原因。

### S3 · 静态预览模式未禁用凭证输入与持久化

**位置**：`src/services/storage.ts`（17 处 `isTauriEnvironment()` 分支）

项目对 Web/Docker 的定位是明确声明过的静态预览：

| 来源 | 声明 |
| ---- | ---- |
| `Dockerfile:1-3` | "Web 静态预览镜像；不包含 Tauri/Rust 后端；完整 AI 对话、OAuth、MCP 等功能请使用桌面版" |
| `README_ZH.md:83` | "Docker 镜像只提供静态 Web 预览……AI 对话请求、OAuth 魔法登录回调、MCP 执行、文件系统安全存储和自动更新都需要使用桌面应用" |
| `README_ZH.md:106` | "自托管 Web 构建是静态预览" |

因此本项应按预览工具而非生产 Web 应用的标准衡量，`httpOnly` Cookie、服务端会话等生产级方案不适用。

实际问题在输入侧：预览模式虽不支持 OAuth 与 AI 请求，但 `storage.ts` 的浏览器分支仍会把用户填入的 API Key 等凭证写进 `localStorage`。用户在预览界面看到凭证输入框时，无从得知这些值会以明文留在浏览器存储中且不受桌面版的文件保护。

**修复**（输入侧防护，不改造存储架构）：

1. 非 Tauri 环境下禁用凭证类字段的持久化（填写后仅存于内存，刷新即失效）；
2. 在凭证输入界面显示预览模式提示，说明此处不做安全存储、正式使用请用桌面版；
3. 或更彻底：预览构建中直接隐藏凭证输入入口。

### S4 · 文件写入能力域为 `$HOME/**`，范围过宽

**位置**：`src-tauri/capabilities/default.json`

```json
{ "identifier": "fs:allow-write-text-file",
  "allow": [{ "path": "$HOME/**" }, { "path": "$DESKTOP/**" },
            { "path": "$DOWNLOAD/**" }, { "path": "$DOCUMENT/**" }] }
```

`$HOME/**` 将整个家目录的写权限暴露给 WebView，可覆盖 `~/.ssh/`、`~/.zshrc` 等敏感路径。

**该 capability 的实际作用范围**需要厘清，否则容易开错药方：

| 写入行为 | 执行方 | 是否受本 capability 约束 |
| -------- | ------ | ------------------------ |
| 配置备份导出（`writeTextFile`，路径来自保存对话框） | WebView 前端 —— `App.tsx:4625`、`App.tsx:4699`、`SettingsPage.tsx:177`、`SettingsPage.tsx:247` | **是** |
| 写入 `~/.claude/`、`~/.codex/` 等外部工具配置 | Rust 后端 `services/config_exporter/` | **否**（后端直接操作文件系统，不经过 capability） |

因此把 `$HOME/.claude/**`、`$HOME/.codex/**` 加进白名单是无效的 —— 那些路径本就不走这条通道。

**修复**：

1. 删除 `$HOME/**`，保留 `$DESKTOP/**`、`$DOWNLOAD/**`、`$DOCUMENT/**` 三项即可 —— 四个调用点的 `filePath` 全部来自保存对话框（`App.tsx:4620` 与 `SettingsPage.tsx` 同类调用均以 `defaultPath` + `filters` 弹出 `save` 对话框），这三个目录已覆盖其常见落点。不额外添加 `$APPDATA/**`：现有前端 `writeTextFile` 调用没有指向该目录的证据，按最小权限原则不应预留。若后续确有应用数据目录的写入需求，届时凭具体调用点单独申请。
2. **同步加强安全门禁**：原 `verify-tauri-security.mjs` 只拒绝字面量 `**`，`$HOME/**` 可通过校验；其测试更是把 `$HOME/**` 当作**合法**样例。二者需一并更新，否则本项修复可被无声改回。

**实施结果**（已完成并验证）：

| 变更 | 内容 |
| ---- | ---- |
| `src-tauri/capabilities/default.json` | 删除 `$HOME/**`，保留 `$DESKTOP/**`、`$DOWNLOAD/**`、`$DOCUMENT/**` |
| `scripts/verify-tauri-security.mjs` | 新增 `isOverbroadWriteScope()`，拦截覆盖整个文件系统（`**`、`*`、`/**`、`/*`）或整个主目录（`$HOME`、`$HOME/*`、`$HOME/**`、`~` 及等价写法，大小写不敏感）的作用域；主目录下的具体子树仍放行 |
| `scripts/verify-tauri-security.test.mjs` | 合法样例改为收窄后的三目录；新增 9 项过宽作用域拒绝用例、3 项收窄作用域放行用例、1 项空白路径用例 |

验证：门禁单测 20 项全通过；门禁对真实配置返回 `ok: true`；将 `$HOME/**` 注回配置后门禁以退出码 1 拒绝并给出具体路径。

**本次修复引入的行为变化**（需后续处理）：收窄后，用户若在保存对话框中选择三个目录之外的位置（如 `~/projects/`），写入会被拒绝。四个调用点均有 `try/catch`，不会崩溃，但错误提示是通用文案 —— `SettingsPage.tsx` 为「导出失败，请重试。」，`App.tsx` 为同类 toast。用户按提示重试仍会失败。应将权限拒绝与其他导出失败区分，提示可选目录范围。此项属 UX 改动，未在本次安全修复中一并实施。

### D2 · 三套 PKCE 实现，缺陷仅存在于其中一套

仓库内存在三套 PKCE 实现，分别服务不同的授权流程：

| 实现 | 位置 | 服务对象 | 熵源失败处理 |
| ---- | ---- | -------- | ------------ |
| Kiro | `src-tauri/src/lib.rs:3203` | Kiro Builder ID / IDC / 社交登录 | **降级为时间戳（缺陷，见 S1）** |
| ChatGPT Web | `src-tauri/src/services/chatgpt_web/oauth.rs:43` | ChatGPT Web 订阅授权 | 返回 `Result`，无降级（正确） |
| 前端 | `src/utils/pkce.ts:81` | 前端发起的 OAuth 流程 | `crypto.getRandomValues`，无降级路径（正确） |

三者服务于不同流程，前端实现有其独立用途且本身没有缺陷，不应作为重复代码删除。

**修复**：

1. 缺陷修复只针对 Kiro 那一套（S1），以 `chatgpt_web/oauth.rs` 为范式；
2. 中期可将两套 Rust 实现合并为共用工具函数（前端因运行环境不同应保留）。这属于整洁性优化而非安全修复，优先级低于 S1。

### R2 · 错误类型统一擦除为 `String`

**位置**：`src-tauri/src/lib.rs` 中 `Result<..., String>` 共 108 处

错误在跨越 Tauri 边界时被压平成字符串，前端无法按错误类型分支，只能匹配不稳定的错误文本。实际匹配对象包括上游 API 的错误码与 HTTP 状态文本：

| 匹配内容 | 位置 |
| -------- | ---- |
| `invalid_grant` | `services/tokenRefresher.ts:388`、`:414`、`:440` |
| `multi-modal` / `multimodal` | `App.tsx:3493` |
| `404` | `utils/skillUtils.ts:1000`、`:1133`、`:3038` |

这些字符串来自上游服务商的响应正文或状态描述，不受本项目控制 —— 上游调整措辞即导致分支静默失效，且无编译期或测试期提示。

项目内已有 `src-tauri/src/mcp/error.rs`、`src-tauri/src/services/config_exporter/error.rs` 两个规范的错误类型定义，主干未采用。

**修复**：定义带 `code` 字段的统一错误枚举并实现 `Serialize`，前端按 `code` 分支、按 `message` 展示。

**排期约束**：须在 A1（`lib.rs` 拆分）之前或与之同步进行。若先拆分再改错误类型，108 处签名会被迁移到各新文件后再改一遍，等于做两次迁移。

### D4 · `types/index.ts` 单文件 98 个类型

全部模块共用一个类型出口（1575 行），任一模块调整类型都会牵动全局，模块边界在类型层面不存在。

**修复**：按域拆分为 `types/chat.ts`、`types/provider.ts`、`types/mcp.ts` 等，`index.ts` 仅做 re-export。

### D3 · 发布版本号与模块内部版本号语义混用

代码文本中共出现 2119 处 `vX.Y[.Z]` 样式字符串，涉及 161 个不同取值：

| 主版本 | 出现次数 |
| ------ | -------- |
| `v3.x` | 718 |
| `v2.x` | 553 |
| `v4.x` | 466 |
| `v0.x` | 329 |
| `v1.x` | 38 |
| `v5.x` | 13 |
| 其他 | 2 |
| **合计** | **2119** |

「其他」两处需区别对待：`Header/index.tsx:10` 的 `v9.1.1` 是组件版本注释；`lib.rs:8999` 的 `v24.3.0` 是 HTTP 头 `X-Stainless-Runtime-Version` 的取值，属运行时字符串而非版本标注，是本次扫描的假阳性。这也说明按文本样式统计无法区分版本注释与普通字符串。

实际发布版本为 `v0.8.8`。`v0.x` 的 329 处大概率对应真实发布版本，其余约 1790 处属于模块内部版本号，但两者在注释中没有任何形式区分。看到"v5.3.0 修复"时，无法判断它是发布版本、模块版本，还是笔误。

**修复**：确立版本号书写规范并统一存量注释 —— 例如发布版本写作 `v0.8.8`，模块内部版本写作 `ConfigSwitcher v5.3.0`（带模块名前缀）。这是 W2 的前置条件。

### W2 · 18 份文档引用 v0.9.x，版本语义无法判读

`docs/modules/` 中有 18 份文档引用 v0.9.x，而当前发布版本为 v0.8.8。

如 D3 所示，仓库混用发布版本号与模块内部版本号，这 18 份中的 v0.9.x 可能指模块内部版本，也可能指发布版本。**在 D3 解决之前本项无法判定**，当前可确认的只有"读者无法判读版本语义"这一事实。

**修复**：先完成 D3 的版本语义统一，再逐份核对这 18 份文档，确定哪些确实超前于发布、哪些只是模块版本，之后为模块文档增加统一的"适用版本"标记。

### W1 · `docs/modules/` 混入 13 份一次性排查记录

以下文件属于某次问题的排查或修复记录，而非模块设计文档：

`anthropic-check-report.md`、`debug-missing-models.md`、`google-oauth-user-agent-fix.md`、`google-optimization-complete-summary.md`、`google-protocol-optimization-summary.md`、`google-quota-issue.md`、`google-thought-signature-fix.md`、`google-token-refresh-fix.md`、`model-display-issue-analysis.md`、`roundtable-tool-call-fix.md`、`test-quality-improvement.md`、`test-report-v0.9.2.md`、`tool-continue-model-fix.md`

它们与正式模块文档混放（占 40 份中的 13 份），读者难以判断哪份代表当前设计契约，"先文档后代码"的规范因此失去参照物。

**修复**：将其中仍有效的结论合并进对应模块文档的变更记录小节，然后删除原文件。

### A4 · 业务逻辑落点规则不统一

同类业务逻辑存在三种落点：

| 落点 | 示例 | 可测性 |
| ---- | ---- | ------ |
| `services/*/xxxState.ts` | `providerState.ts`、`mcpState.ts` | 纯函数，有独立测试 |
| `components/features/*/utils.ts` | `AgentOrchestration/utils.ts` | 部分可测 |
| `App.tsx` 内闭包 | 圆桌流程的另一半 | 难以测试 |

圆桌会议逻辑被拆散在后两者中。规则不统一时，"写代码前先检查是否可复用现有逻辑"这条开发规范在实践中无法执行。

**修复**：确立落点规范并写入开发指南 —— 纯业务逻辑一律进 `services/`，组件内只保留渲染与事件绑定。

**排期约束**：须在 A2（`App.tsx` 拆分）之前或与之同步确定。A2 要把逾千行的 `generateAgentResponse` 和圆桌逻辑搬出组件，如果此时落点规则尚未定义，搬迁目标只能临时决定，规则确立后很可能需要二次搬迁。规范先行的成本是一次讨论，滞后的成本是重做一次大规模移动。

---

### D6 · `@types/node` 未声明，仅靠死依赖传递供给

清理 D5 后立即暴露：`tsc -p tsconfig.test.json` 报出 60+ 个 `Cannot find name 'global'`、`Cannot find module 'node:fs'`、`Cannot find name 'process'`。

查 lockfile 差异可见，移除 `@types/bech32` 连带删除了 `@types/node` 与 `undici-types` —— **`@types/node` 在依赖树中的唯一来源就是 `@types/bech32`**。

也就是说：测试代码（`src/test/setup.ts:42` 的 `global.IntersectionObserver`、`modelFetcher.test.ts` 等大量 `global.fetch` 桩、`i18nUsageCoverage.test.ts` 的 `node:fs`/`node:path`/`process`）以及 `scripts/*.mjs` 一直依赖 `@types/node`，但项目从未声明它，**只是碰巧被一个死依赖间接带了进来**。这类隐式依赖在任何一次依赖调整后都可能无预警断裂。

由于 E1 之前测试代码不参与类型检查，这个缺失长期不可见 —— 是 E1 与 D5 两项修复叠加后才浮现的问题。

**修复**（已完成并验证）：`npm install --save-dev @types/node@^24`（主版本与 E4 统一的 Node 24 对齐）。验证：`npm run typecheck` 生产与测试两份配置均通过。

## 五、低严重度问题

### D5 · 死依赖 `@types/bech32`

`package.json:49` 将 `@types/bech32` 列入 `dependencies`，但全仓库检索不到任何 `bech32` 使用。类型包本应位于 `devDependencies`，且此包应直接移除。

**修复**（已完成并验证）：清理必须覆盖三处，只删 `package.json` 不算完成 ——

| 位置 | 处理 |
| ---- | ---- |
| `package.json` | 删除条目 |
| `package-lock.json` | `npm install --package-lock-only` 重新生成 |
| `node_modules/` | `npm prune` 移除物理残留（此前 `npm ls @types/bech32 --depth=0` 显示为 `extraneous`） |

验证：三处检索命中数均为 0，`npm ls @types/bech32 --depth=0` 输出 `(empty)`。

---

## 六、应保持的既有优势

重构中不应退化的部分：

| 项目 | 说明 |
| ---- | ---- |
| CI 门禁广度 | `npm audit` + `cargo audit` + `cargo fmt --check` + `clippy -D warnings` + `cargo test` + Docker 镜像烟测 + macOS App Bundle 结构校验 + LaunchServices 启动烟测 + updater manifest 门禁 + Tauri 安全配置门禁，完整度超过多数同类项目 |
| 纯函数抽离 | `services/*/xxxState.ts` 系列为无副作用纯函数并配有独立测试 |
| 组件组织 | `components/` 按 `common` / `features` / `layout` 分层，功能域切分清晰 |
| 国际化 | `i18n/zh.ts` 与 `i18n/en.ts` 键完全对齐，无漂移 |
| 测试规模 | 96 个测试文件对应 125 个非测试源文件 |
| CSP 配置 | `object-src 'none'`、`base-uri 'none'`、`frame-ancestors 'none'` 均已正确设置 |
| Web 预览定位声明 | Dockerfile 与双语 README 均明确声明 Web/Docker 为静态预览、不含后端能力 |

第一节「正确范式」表中的四项（`protocol/` 抽象层、`config_exporter/` 拆分、`writer.rs` 权限处理、`chatgpt_web/oauth.rs` 熵源处理）同属应保持的优势，此处不再重复列出。

---

## 七、整改路线

| 阶段 | 内容 | 理由 |
| ---- | ---- | ---- |
| 1 | S1 Kiro PKCE 降级、R1 锁中毒、S2 凭证文件权限 | 改动量小、风险高；三者均有仓库内现成范式可直接对齐，可合并为一个 PR |
| 2 | E1 测试静态检查、E2 lint 门禁、**E4 Node 版本与 Web Storage** → E3 CI 覆盖率任务 + 阈值 | 机制性止血。不先做这一步，后续清理的技术债会立刻重新累积，且大规模重构无法验证是否引入退化。E4 必须先于 E3：套件未全绿时测出的覆盖率被虚假压低，据此设定的阈值毫无意义 |
| 3 | D1 统一 `chat_stream_message` 请求构造 | 消除最高频的缺陷来源，改动集中，已有两次实际 bug 记录 |
| 4 | S3 预览模式凭证防护、S4 能力域收窄、D2 PKCE 对齐、**D5 死依赖清理 → D6 补声明 `@types/node`** | 低风险清理项，前三项可并行；D6 必须紧随 D5：`@types/node` 的唯一来源正是 D5 要删的死依赖，删完才会暴露缺失 |
| 5 | R2 错误类型结构化 | 必须早于 A1，否则 108 处签名会被迁移两遍 |
| 6 | A3 协议层收口 | 结构性重构，前置条件是阶段 2 门禁已生效、阶段 5 错误类型已定型 |
| 7 | **A4 落点规范先行** → A1 `lib.rs` 拆分、A2 `App.tsx` 拆分、D4 类型拆分 | 大规模重构，需在协议层收口后进行；A4 必须先于 A2，否则搬迁目标未定会导致二次搬迁 |
| 8 | D3 版本语义统一 → W2 文档核对 → W1 文档整理 | 收尾与规范固化 |

硬约束：

1. **阶段 2 先于阶段 6、7** —— 质量门禁覆盖不完整时进行大规模重构，无法保证不引入退化；
2. **R2 先于 A1** —— 先拆分再改错误类型会导致签名二次迁移；
3. **D3 先于 W2** —— 版本语义未统一时，文档版本问题无法判定；
4. **A4 先于 A2** —— 落点规范未定就拆分 `App.tsx`，搬迁目标只能临时决定，规范确立后需二次搬迁；
5. **E4 先于 E3** —— 测试套件未全绿时，覆盖率基线不可信，阈值无从设定；
6. **D5 先于 D6** —— D6 是 D5 的连带产物，删除死依赖前该缺失不可见。
