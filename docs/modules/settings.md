# Settings 设置模块

## 📋 模块概述

Settings模块提供系统配置、通知管理和导入导出功能。

| 属性 | 值 |
|------|------|
| 模块路径 | `src/components/features/Settings` |
| 主题管理 | `src/theme/index.tsx` (v2.6.0) |
| 国际化 | `src/i18n/index.tsx` (v2.6.0) |
| Rust命令 | `src-tauri/src/lib.rs` |
| 创建日期 | 2026-01-18 |
| 最后更新 | 2026-01-24 |

---

## 🎯 功能列表

### 通用设置 (General)
- [x] 主题切换 (Light/Dark/System)
- [x] **主题持久化** (v2.6.0) - Tauri 文件系统持久化，解决 Dev/Build 数据不一致
- [x] **系统主题监听** (v2.3.0) - System 模式下自动响应系统主题变化
- [x] **macOS 窗口标题栏适配** (v2.6.0) - 透明标题栏跟随主题
- [x] 语言设置 (中文/English)
- [x] **语言持久化** (v2.6.0) - Tauri 文件系统持久化，解决 Dev/Build 数据不一致
- [ ] 字体大小调整

### 数据管理 (Data)
- [x] 导出配置 (调用 ExportModal)
- [x] **导出弹窗深色模式** (v2.6.0) - 选中项紫色背景适配深色主题
- [x] 导入配置 (调用 ImportModal)
- [x] 清除所有数据 (v2.3.0)
- [x] 存储空间使用统计 (v2.3.0) - 动态计算真实占用率
- [x] **Skills 持久化** (v2.6.0) - Tauri 后端 save_skills/load_skills 命令

### 关于 (About)
- [x] 版本信息
- [ ] 检查更新 - 对接 GitHub Releases API (待实现)
- [x] 开发者信息
- [ ] 许可证信息

### 通知系统
- [x] 通知列表展示
- [x] 未读标记管理

---

## 🏗️ 组件结构

```
Settings/
├── index.tsx              # 模块入口 (SettingsPage)
├── GeneralSettings.tsx    # 通用设置 (Theme, Language)
├── DataSettings.tsx       # 数据管理 (Export/Import)
├── AboutSettings.tsx      # 关于信息
├── Notifications/         # 通知组件
│   └── NotificationPanel.tsx
├── Export/                # 导出组件
│   └── ExportModal.tsx
├── Import/                # 导入组件
│   └── ImportModal.tsx
└── types.ts               # 类型定义

theme/
└── index.tsx              # ThemeProvider (v2.3.0)
```

---

## 📐 数据结构

### Theme (v2.3.0)

```typescript
// src/theme/index.tsx
type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;                    // 用户选择的主题
  setTheme: (theme: Theme) => void;
  effectiveTheme: 'light' | 'dark'; // 实际应用的主题
}
```

### Notification

```typescript
interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  createdAt: Date;
  read: boolean;
}
```

### ExportConfig (v2.6.5)

```typescript
interface ExportConfig {
  models: boolean;           // v2.6.1: AI 模型配置导出
  agents: boolean;
  skills: boolean;
  mcp: boolean;
  chats: boolean;
  roundtableChats: boolean;  // v2.6.5: 圆桌对话导出
  settings: boolean;         // v2.6.5: 应用设置导出
}

interface ImportOptions {
  merge: boolean;          // true=合并，false=覆盖
  backup: boolean;         // 导入前备份
}
```

---

## 📐 API 接口

### 数据管理
目前主要通过 `src/services/storage.ts` 和前端逻辑实现。

- **LocalStorage**: 用于存储配置、聊天记录、Agents、Skills 等。
- **Export**: 生成 JSON 文件供用户下载。
- **Import**: 读取用户上传的 JSON 文件并合并/覆盖本地存储。

### localStorage 键名

| 键名 | 说明 |
|------|------|
| `mobaus_theme` | 主题设置 (light/dark/system) |
| `mobaus_language` | 语言设置 (zh/en) |
| `mobaus_chats` | 对话历史 |
| `mobaus_agents` | Agent 配置 |
| `mobaus_skills` | 自定义技能 |
| `mobaus_mcp_servers` | MCP 服务器配置 (v2.6.1: 修正键名) |
| `mobaus_models` | AI 模型配置 (v2.6.1: 新增导出支持) |
| `mobaus_settings` | 应用设置 |

### Tauri 命令 (v2.6.0)

Settings 持久化已迁移到 Rust 后端，解决 Dev/Build 环境数据不一致问题。

| 命令 | 说明 |
|------|------|
| `save_settings` | 保存应用设置到文件系统 |
| `load_settings` | 从文件系统加载应用设置 |
| `save_skills` | 保存自定义技能 |
| `load_skills` | 加载自定义技能 |

**存储路径：** `~/Library/Application Support/com.mobaus.studio/settings.json`

---

## 🧪 测试用例

### 主题持久化测试 (v2.6.0)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| SET-01 | 主题切换-深色 | 选择 Dark | 主题切换为深色，持久化保存 | [x] |
| SET-02 | 主题切换-浅色 | 选择 Light | 主题切换为浅色，持久化保存 | [x] |
| SET-03 | 主题切换-跟随系统 | 选择 System | 根据系统设置自动切换 | [x] |
| SET-06 | **主题重启恢复** | 重启应用 | 自动恢复保存的主题设置 | [x] |
| SET-07 | **系统主题监听** | System 模式下切换系统主题 | 自动响应并更新界面 | [x] |
| SET-30 | **Dev/Build 一致性** | Dev 设置主题后 Build 启动 | 主题设置一致 | [x] |

### 语言持久化测试 (v2.6.0)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| SET-04 | 语言切换-中文 | 选择中文 | 界面切换为中文 | [x] |
| SET-05 | 语言切换-英文 | 选择 English | 界面切换为英文 | [x] |
| SET-08 | **语言重启恢复** | 重启应用 | 自动恢复保存的语言设置 | [x] |
| SET-31 | **Dev/Build 一致性** | Dev 设置语言后 Build 启动 | 语言设置一致 | [x] |

### settingsStorage 测试 (v2.6.0)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| SET-40 | 同步加载默认值 | localStorage 为空 | 返回 {theme:'system', language:'zh'} | [x] |
| SET-41 | 同步保存设置 | 调用 saveSync | localStorage 更新 | [x] |
| SET-42 | 异步保存设置 | Tauri 环境调用 save | 调用 save_settings 命令 | [x] |
| SET-43 | 异步加载设置 | Tauri 环境调用 loadAsync | 调用 load_settings 命令 | [x] |
| SET-44 | Tauri 失败回退 | Tauri 命令失败 | 回退到 localStorage | [x] |

### 数据管理测试

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| SET-10 | 存储统计显示 | 页面加载 | 显示当前存储大小(KB/MB) | [x] |
| SET-11 | 存储进度条 | 页面加载 | 进度条显示真实占用百分比 | [x] |
| SET-12 | 打开导出弹窗 | 点击导出按钮 | 显示导出选项弹窗 | [x] |
| SET-13 | 执行导出 | 选择后点击导出 | 下载 JSON 文件 | [x] |
| SET-14 | 打开导入弹窗 | 点击导入按钮 | 显示导入选项弹窗 | [x] |
| SET-15 | 执行导入 | 选择文件后导入 | 配置更新，页面刷新 | [x] |
| SET-16 | 清除数据确认 | 点击清除按钮 | 显示确认对话框 | [x] |
| SET-17 | 确认清除 | 点击确认 | 清除数据，页面刷新 | [x] |
| SET-18 | 取消清除 | 点击取消 | 数据保留 | [x] |

### 导出功能完整性测试 (v2.6.1)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| SET-50 | 导出 Models 配置 | 勾选 Models 导出 | JSON 包含 models 字段 | [x] |
| SET-51 | 导出 Agents 配置 | 勾选 Agents 导出 | JSON 包含 agents 字段 | [x] |
| SET-52 | 导出 Skills 配置 | 勾选 Skills 导出 | JSON 包含 skills 字段 | [x] |
| SET-53 | 导出 MCP 配置 | 勾选 MCP 导出 | JSON 包含 mcp 字段（使用正确键名 mobaus_mcp_servers） | [x] |
| SET-54 | 导出对话历史 | 勾选 Chats 导出 | JSON 包含 chats 字段 | [x] |
| SET-55 | 全选导出 | 勾选所有选项 | JSON 包含所有字段且数据完整 | [x] |
| SET-56 | 导入包含 Models | 导入含 models 的 JSON | Models 数据正确恢复 | [x] |
| SET-57 | 导入包含 MCP | 导入含 mcp 的 JSON | MCP 服务器配置正确恢复 | [x] |

### 导出功能增强测试 (v2.6.2)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| SET-60 | 对话导出完整性 | 勾选 Chats 导出 | JSON 包含完整对话数据（从 storage 服务加载） | [x] |
| SET-61 | 导出成功提示 | 点击导出 | 显示"导出成功"提示 | [x] |
| SET-62 | Tauri 保存对话框 | Tauri 环境导出 | 弹出文件保存对话框选择位置 | [x] |
| SET-63 | 浏览器环境回退 | 浏览器环境导出 | 自动下载到默认位置 | [x] |
| SET-64 | Tauri 导入提示 | Tauri 环境导入成功 | 使用原生 message dialog，可正常关闭 | [x] |
| SET-65 | 浏览器导入提示 | 浏览器环境导入成功 | 使用浏览器 alert，可正常关闭 | [x] |

### 清理数据功能测试 (v2.6.5)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| SET-70 | Tauri 环境清理 | Tauri 环境点击清除 | 调用 storage services 清理文件系统数据 | [x] |
| SET-71 | 浏览器环境清理 | 浏览器环境点击清除 | 清理 localStorage 数据 | [x] |
| SET-72 | 清理后数据验证 | 清理后重启应用 | 所有数据为空，无残留 | [x] |

### 导出功能完善测试 (v2.6.5)

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| SET-75 | 导出 Roundtable Chats | 勾选 Roundtable 导出 | JSON 包含 roundtableChats 字段 | [x] |
| SET-76 | 导出 Settings | 勾选 Settings 导出 | JSON 包含 settings 字段（主题、语言等） | [x] |
| SET-77 | 导入 Roundtable Chats | 导入含 roundtableChats 的 JSON | 圆桌对话数据正确恢复 | [x] |
| SET-78 | 导入 Settings | 导入含 settings 的 JSON | 应用设置正确恢复 | [x] |

### 关于信息测试

| ID | 测试场景 | 输入 | 期望输出 | 状态 |
|----|---------|------|---------|------|
| SET-20 | 显示版本号 | 页面加载 | 显示当前版本号 | [x] |
| SET-21 | 检查更新-已是最新 | 点击检查更新 | 提示已是最新版本 | [ ] |
| SET-22 | 检查更新-有更新 | 有新版本时 | 显示新版本信息和下载链接 | [ ] |
| SET-23 | 检查更新-网络错误 | 无网络连接 | 显示错误提示 | [ ] |

### 测试文件

- `src/test/components/Settings/GeneralSettings.test.tsx`
- `src/test/components/Settings/DataSettings.test.tsx`
- `src/test/components/Settings/SettingsPage.test.tsx`
- `src/test/components/Settings/ExportModal.test.tsx`
- `src/test/components/Settings/ImportModal.test.tsx`
- `src/test/theme/ThemeProvider.test.tsx` (v2.3.0)

---

## 📝 修改历史

| 日期 | 版本 | 修改人 | 修改内容 |
|------|------|--------|---------|
| 2026-01-18 | 1.0.0 | - | 初始版本 |
| 2026-01-23 | 2.3.0 | - | ThemeProvider 重构，主题/语言持久化修复，存储进度条动态计算 |
| 2026-01-24 | 2.6.0 | - | Settings Tauri 持久化，解决 Dev/Build 数据不一致问题 |
| 2026-01-24 | 2.6.1 | - | 修复导出功能不完全：1) MCP 键名修正为 mobaus_mcp_servers；2) 新增 Models 导出支持 |
| 2026-01-24 | 2.6.2 | - | 导出功能增强：1) 修复对话导出使用 storage 服务；2) 添加导出成功提示；3) Tauri 环境使用文件对话框选择保存位置；4) 导入提示改用 Tauri message dialog 解决 alert 无法关闭问题 |
| 2026-01-24 | 2.6.3 | - | 导入功能修复：使用 storage services 保存数据，确保 Tauri 环境正确持久化到文件系统 |
| 2026-01-24 | 2.6.4 | - | 导入合并去重：根据 ID 去重，相同 ID 的记录用导入数据覆盖，避免重复导入 |
| 2026-01-25 | 2.6.5 | - | 1) 清理数据功能完善：Tauri 环境使用 storage services 清理文件系统数据；2) 导出功能增强：新增 Roundtable Chats 和 Settings 导出支持 |
| 2026-01-25 | 2.6.6 | - | 清理数据弹窗修复：Tauri 环境使用 message dialog 替代 alert，解决重复弹窗问题 |
| 2026-01-28 | 3.0.25 | - | 导入增强：Agent 导入时自动创建缺失的 Skills 和 MCP 依赖资源，对于缺失的 Model 记录警告日志 |

---

## 🔧 实现细节

### ThemeProvider (v2.6.0)

主题管理使用 settingsStorage 实现 Tauri 文件系统持久化，解决了 Dev/Build 环境数据不一致的问题。

```tsx
// src/theme/index.tsx
import { settingsStorage } from '../services/storage';

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // 同步加载确保 UI 立即可用
    const [theme, setThemeState] = useState<Theme>(() => {
        const settings = settingsStorage.load();
        return settings.theme;
    });

    // 应用启动时从 Tauri 异步加载
    useEffect(() => {
        const loadFromTauri = async () => {
            const settings = await settingsStorage.loadAsync();
            if (settings.theme !== theme) {
                setThemeState(settings.theme);
            }
        };
        loadFromTauri();
    }, []);

    // 设置主题并异步持久化
    const setTheme = useCallback((newTheme: Theme) => {
        setThemeState(newTheme);
        const currentSettings = settingsStorage.load();
        settingsStorage.save({ ...currentSettings, theme: newTheme });
    }, []);
    // ...
};
```

### settingsStorage (v2.6.0)

统一的设置存储服务，支持 Tauri 和浏览器双环境。

```typescript
// src/services/storage.ts
export const settingsStorage = {
    // 异步保存：Tauri 环境调用 save_settings 命令
    async save(settings: AppSettings): Promise<void>,

    // 同步保存：回退到 localStorage
    saveSync(settings: AppSettings): void,

    // 异步加载：Tauri 环境调用 load_settings 命令
    async loadAsync(): Promise<AppSettings>,

    // 同步加载：从 localStorage 读取
    load(): AppSettings,
};
```

**关键特性：**
- Tauri 环境：使用文件系统持久化到 `settings.json`
- 浏览器环境：回退到 localStorage
- 同步方法确保 UI 初始化时立即可用
- 异步方法在应用启动后从 Tauri 加载最新设置
- 通过 `useTheme()` / `useI18n()` hook 在任意组件中访问和修改设置

### usePersistedState (v4.1.48)

统一持久化状态管理 Hook，替代 App.tsx 中分散的 useState + useEffect + save 模式。

**文件路径：** `src/hooks/usePersistedState.ts`

**解决问题：**
- 持久化策略不一致（部分防抖、部分立即保存）
- 多个 setState + save 分散在多个 useEffect 中
- `STORAGE_DEBOUNCE_DELAY` 常量定义但从未使用
- 高频 IO 和不必要的重渲染

```typescript
/** 存储适配器接口 - 与现有 storage 服务兼容 */
interface StorageAdapter<T> {
  load: () => Promise<T[]>;
  save: (items: T[]) => Promise<void>;
}

/** Hook 配置选项 */
interface UsePersistedStateOptions<T> {
  storage: StorageAdapter<T>;      // 存储适配器
  initialValue: T[];                // 初始值
  immediate?: boolean;              // 是否立即保存（不防抖），默认 false
  debounceDelay?: number;           // 自定义防抖延迟（毫秒），默认 STORAGE_DEBOUNCE_DELAY
  transform?: (raw: T[]) => T[];   // 加载后数据变换（如重置 MCP 状态）
}

/** Hook 返回值 */
interface UsePersistedStateReturn<T> {
  data: T[];
  setData: Dispatch<SetStateAction<T[]>>;
  loading: boolean;
  loaded: boolean;
  flush: () => Promise<void>;       // 手动立即保存
}
```

**使用示例：**

```typescript
// 高频更新数据（防抖 1000ms）
const { data: chats, setData: setChats, loaded } = usePersistedState({
  storage: chatsStorage,
  initialValue: [],
});

// 关键配置（立即保存）
const { data: models, setData: setModels } = usePersistedState({
  storage: modelsStorage,
  initialValue: [],
  immediate: true,
});

// 加载后变换数据（如重置 MCP 连接状态）
const { data: mcpServers, setData: setMcpServers } = usePersistedState({
  storage: mcpServersStorage,
  initialValue: [],
  immediate: true,
  transform: (servers) => servers.map(s => ({
    ...s,
    status: 'disconnected',
  })),
});
```

**持久化策略：**

| 数据类型 | 模式 | 原因 |
|---------|------|------|
| chats, roundtableChats | 防抖 1000ms | 流式输出期间高频更新 |
| models, agents, skills, mcpServers | 立即保存 | 用户配置操作，低频更新 |

### usePersistedState 测试用例

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-PERSIST-001 | 初始加载成功 | storage.load 返回数据 | data 为加载数据，loaded=true |
| TC-PERSIST-002 | 初始加载为空 | storage.load 返回空数组 | data 为 initialValue |
| TC-PERSIST-003 | 初始加载失败 | storage.load 抛异常 | data 为 initialValue，loaded=true |
| TC-PERSIST-004 | 立即保存模式 | immediate=true, setData | 立即调用 storage.save |
| TC-PERSIST-005 | 防抖保存模式 | setData 后 500ms | 不触发 save |
| TC-PERSIST-006 | 防抖保存触发 | setData 后等待 1000ms | 触发 storage.save |
| TC-PERSIST-007 | 防抖合并 | 1000ms 内 setData 三次 | 只触发一次 save，保存最终值 |
| TC-PERSIST-008 | 加载前不触发保存 | loaded=false 时 setData | 不调用 storage.save |
| TC-PERSIST-009 | flush 手动保存 | 调用 flush | 立即保存，取消防抖定时器 |
| TC-PERSIST-010 | 卸载时保存 | 有待保存数据时卸载 | 触发保存 |
| TC-PERSIST-011 | transform 数据变换 | 提供 transform 函数 | 加载后数据经过变换 |
| TC-PERSIST-012 | 并发保存防护 | 快速连续触发保存 | 不会并发调用 storage.save |

### useAppBootstrap (v4.1.48)

应用启动引导 Hook，从 App.tsx 提取的初始化逻辑。负责数据加载、MCP 自动连接、凭证刷新、统计服务初始化。

**文件路径：** `src/hooks/useAppBootstrap.ts`

**解决问题：**
- App.tsx 文件过大（5400+ 行），初始化逻辑与 UI 逻辑混杂
- 初始化 useEffect 超过 370 行，难以测试和维护
- Token 刷新回调 useEffect、Skills 保存 useEffect 等与初始化紧密相关的逻辑分散

**职责范围：**
1. 使用 `usePersistedState` 管理 models、chats、agents、mcpServers、roundtableChats
2. Skills 加载（内置 + 自定义合并）和保存
3. Providers 状态管理（内置 + 自定义提供商合并）
4. MCP 服务器自动连接（autoStart）
5. Provider 凭证加载和过期 OAuth Token 刷新
6. 模型缓存服务初始化
7. OAuth Token 自动续期服务
8. token_expired 事件监听
9. Mixpanel 运营统计初始化

```typescript
/** Hook 配置选项 */
interface UseAppBootstrapOptions {
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
}

/** Hook 返回值 */
interface UseAppBootstrapReturn {
  // 持久化数据
  models: AIModelConfig[];
  setModels: Dispatch<SetStateAction<AIModelConfig[]>>;
  chats: Chat[];
  setChats: Dispatch<SetStateAction<Chat[]>>;
  agents: Agent[];
  setAgents: Dispatch<SetStateAction<Agent[]>>;
  skills: Skill[];
  setSkills: Dispatch<SetStateAction<Skill[]>>;
  mcpServers: MCPServer[];
  setMcpServers: Dispatch<SetStateAction<MCPServer[]>>;
  roundtableChats: RoundtableChat[];
  setRoundtableChats: (updater: ...) => void;
  providers: AIProvider[];
  setProviders: Dispatch<SetStateAction<AIProvider[]>>;
  // 加载状态
  isDataLoaded: boolean;
  // Refs
  timeoutIdsRef: MutableRefObject<Set<ReturnType<typeof setTimeout>>>;
  roundtableChatsRef: MutableRefObject<RoundtableChat[]>;
  // 清理
  cleanup: () => void;
}
```

**初始化流程：**
1. `usePersistedState` 并行加载 5 个核心数据集
2. 所有 `loaded` 标志均为 true 后 (`coreDataLoaded`)
3. 执行 `initApp`：技能合并 → MCP 自动连接 → 自定义提供商 → 凭证刷新 → 模型缓存 → OAuth 服务 → 统计服务
4. `setInitDone(true)` → `isDataLoaded = coreDataLoaded && initDone`

### useAppBootstrap 测试用例

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-BOOT-001 | 核心数据加载完成 | 所有 storage.load 成功 | isDataLoaded=true |
| TC-BOOT-002 | Skills 合并 | 内置3个 + 自定义2个 | skills 长度 5，内置在前 |
| TC-BOOT-003 | MCP 自动连接 | autoStart=true 的服务器 | 调用 mcp_connect + mcp_list_tools |
| TC-BOOT-004 | 自定义提供商加载 | customProviderStorage 返回数据 | providers 包含自定义提供商 |
| TC-BOOT-005 | 过期 Token 自动刷新 | 有过期 OAuth 凭证 | 调用 tokenRefresher.refreshToken |
| TC-BOOT-006 | Token 刷新失败回调 | refreshToken 失败 | provider 状态变为 disconnected，显示 toast |
| TC-BOOT-007 | Token 刷新成功回调 | refreshToken 成功 | provider 状态变为 connected |
| TC-BOOT-008 | 卸载时清理 | unmount | 清理定时器、停止 tokenRefresher、取消事件监听 |
| TC-BOOT-009 | Skills 保存 | setSkills 更新 | skillsStorage.save 被调用 |
| TC-BOOT-010 | 初始化失败不阻塞 | initApp 抛异常 | isDataLoaded 仍为 true |

### useChatStream (v4.1.48)

聊天流式输出 Hook，从 App.tsx 提取的流式消息处理逻辑。负责事件监听、RAF 批量更新、内容累积。

**文件路径：** `src/hooks/useChatStream.ts`

**解决问题：**
- 流式输出逻辑与 UI 逻辑混杂在 handleSendMessage 中（~1000 行）
- RAF 批量更新、事件监听、清理逻辑分散
- pendingContentRef、rafIdRef、unlistenMapRef 管理复杂

**职责范围：**
1. 注册 `listen('chat-event')` 事件监听器
2. 处理 `chunk`/`reasoning_chunk` 事件，累积内容到 pendingContentRef
3. RAF 批量更新：scheduleUpdate + flushPendingUpdates
4. 处理 `done`/`error` 事件，触发回调
5. 管理 unlistenMapRef，支持停止生成
6. 组件卸载时清理所有监听器和 RAF

**不包含：**
- 工具调用循环（保留在 handleSendMessage，业务逻辑复杂）
- Token 验证、消息构建（属于业务逻辑）
- 圆桌会议流式输出（独立场景，暂不提取）

```typescript
/** Hook 配置选项 */
interface UseChatStreamOptions {
  chatId: string;
  onChunk: (data: { messageId: string; content: string; reasoning: string }) => void;
  onDone: (data: { messageId: string; usage?: TokenUsage }) => void;
  onError: (error: string) => void;
  onToolCalls?: (toolCalls: ToolCall[]) => Promise<void>;
}

/** Hook 返回值 */
interface UseChatStreamReturn {
  startListening: () => Promise<UnlistenFn>;
  stopListening: () => void;
  flushPending: () => void;
}
```

**使用示例：**

```typescript
const { startListening, stopListening, flushPending } = useChatStream({
  chatId: 'chat-123',
  onChunk: ({ messageId, content, reasoning }) => {
    // 更新消息内容
    setChats(prev => prev.map(c =>
      c.id === chatId ? {
        ...c,
        messages: c.messages.map(m =>
          m.id === messageId ? { ...m, content, reasoning } : m
        )
      } : c
    ));
  },
  onDone: ({ messageId, usage }) => {
    // 更新 token 使用量，设置生成完成
    setGenerating(chatId, false);
  },
  onError: (error) => {
    // 显示错误消息
    addErrorMessage(chatId, error);
  },
});

// 开始监听
const unlisten = await startListening();

// 停止生成
stopListening();
```

### useChatStream 测试用例

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-STREAM-001 | 注册事件监听 | startListening | listen('chat-event') 被调用 |
| TC-STREAM-002 | chunk 事件累积 | 收到 chunk 事件 | 内容累积到 pendingContentRef |
| TC-STREAM-003 | RAF 批量更新 | 多个 chunk 快速到达 | 只触发一次 onChunk（RAF 合并） |
| TC-STREAM-004 | done 事件触发 | 收到 done 事件 | 调用 flushPending + onDone |
| TC-STREAM-005 | error 事件触发 | 收到 error 事件 | 调用 flushPending + onError |
| TC-STREAM-006 | 停止监听 | stopListening | 取消事件监听、RAF、清理 refs |
| TC-STREAM-007 | 卸载时清理 | unmount | 清理所有监听器和 RAF |
| TC-STREAM-008 | 手动 flush | flushPending | 立即触发 onChunk |

