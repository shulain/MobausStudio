# Settings Module / Settings 设置模块

> [English](#english) | [中文](#中文)

<a id="english"></a>

## Module Overview

The Settings module provides system configuration, notification management, and import/export functionality.

| Property | Value |
|----------|-------|
| Module Path | `src/components/features/Settings` |
| Theme Management | `src/theme/index.tsx` (v2.6.0) |
| Internationalization | `src/i18n/index.tsx` (v2.6.0) |
| Rust Commands | `src-tauri/src/lib.rs` |
| Created Date | 2026-01-18 |
| Last Updated | 2026-01-24 |

---

## Feature List

### General Settings
- [x] Theme switching (Light/Dark/System)
- [x] **Theme persistence** (v2.6.0) - Tauri filesystem persistence, resolves Dev/Build data inconsistency
- [x] **System theme listener** (v2.3.0) - Automatically responds to system theme changes in System mode
- [x] **macOS window title bar adaptation** (v2.6.0) - Transparent title bar follows theme
- [x] Language settings (Chinese/English)
- [x] **Language persistence** (v2.6.0) - Tauri filesystem persistence, resolves Dev/Build data inconsistency
- [ ] Font size adjustment

### Data Management
- [x] Export configuration (calls ExportModal)
- [x] **Export modal dark mode** (v2.6.0) - Selected item purple background adapts to dark theme
- [x] Import configuration (calls ImportModal)
- [x] Clear all data (v2.3.0)
- [x] Storage space usage statistics (v2.3.0) - Dynamic calculation of actual usage
- [x] **Skills persistence** (v2.6.0) - Tauri backend save_skills/load_skills commands

### About
- [x] Version information
- [ ] Check for updates - Connect to GitHub Releases API (to be implemented)
- [x] Developer information
- [ ] License information

### Notification System
- [x] Notification list display
- [x] Unread badge management

---

## Component Structure

```
Settings/
├── index.tsx              # Module entry (SettingsPage)
├── GeneralSettings.tsx    # General settings (Theme, Language)
├── DataSettings.tsx       # Data management (Export/Import)
├── AboutSettings.tsx      # About information
├── Notifications/         # Notification components
│   └── NotificationPanel.tsx
├── Export/                # Export components
│   └── ExportModal.tsx
├── Import/                # Import components
│   └── ImportModal.tsx
└── types.ts               # Type definitions

theme/
└── index.tsx              # ThemeProvider (v2.3.0)
```

---

## Data Structures

### Theme (v2.3.0)

```typescript
// src/theme/index.tsx
type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;                    // User-selected theme
  setTheme: (theme: Theme) => void;
  effectiveTheme: 'light' | 'dark'; // Actually applied theme
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
  models: boolean;           // v2.6.1: AI model config export
  agents: boolean;
  skills: boolean;
  mcp: boolean;
  chats: boolean;
  roundtableChats: boolean;  // v2.6.5: Roundtable chat export
  settings: boolean;         // v2.6.5: App settings export
}

interface ImportOptions {
  merge: boolean;          // true=merge, false=overwrite
  backup: boolean;         // Backup before import
}
```

---

## API Interface

### Data Management
Currently implemented mainly through `src/services/storage.ts` and frontend logic.

- **LocalStorage**: Used to store configurations, chat history, Agents, Skills, etc.
- **Export**: Generates JSON files for user download.
- **Import**: Reads user-uploaded JSON files and merges/overwrites local storage.

### localStorage Key Names

| Key | Description |
|-----|-------------|
| `mobaus_theme` | Theme setting (light/dark/system) |
| `mobaus_language` | Language setting (zh/en) |
| `mobaus_chats` | Chat history |
| `mobaus_agents` | Agent configurations |
| `mobaus_skills` | Custom skills |
| `mobaus_mcp_servers` | MCP server configurations (v2.6.1: corrected key name) |
| `mobaus_models` | AI model configurations (v2.6.1: added export support) |
| `mobaus_settings` | App settings |

### Tauri Commands (v2.6.0)

Settings persistence has been migrated to the Rust backend, resolving Dev/Build environment data inconsistency issues.

| Command | Description |
|---------|-------------|
| `save_settings` | Save app settings to filesystem |
| `load_settings` | Load app settings from filesystem |
| `save_skills` | Save custom skills |
| `load_skills` | Load custom skills |

**Storage Path:** `~/Library/Application Support/com.mobaus.studio/settings.json`

---

## Test Cases

### Theme Persistence Tests (v2.6.0)

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| SET-01 | Theme switch - Dark | Select Dark | Theme switches to dark, persisted | [x] |
| SET-02 | Theme switch - Light | Select Light | Theme switches to light, persisted | [x] |
| SET-03 | Theme switch - Follow system | Select System | Automatically switches based on system settings | [x] |
| SET-06 | **Theme restore on restart** | Restart app | Automatically restores saved theme settings | [x] |
| SET-07 | **System theme listener** | Switch system theme in System mode | Automatically responds and updates UI | [x] |
| SET-30 | **Dev/Build consistency** | Set theme in Dev then start Build | Theme settings are consistent | [x] |

### Language Persistence Tests (v2.6.0)

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| SET-04 | Language switch - Chinese | Select Chinese | UI switches to Chinese | [x] |
| SET-05 | Language switch - English | Select English | UI switches to English | [x] |
| SET-08 | **Language restore on restart** | Restart app | Automatically restores saved language settings | [x] |
| SET-31 | **Dev/Build consistency** | Set language in Dev then start Build | Language settings are consistent | [x] |

### settingsStorage Tests (v2.6.0)

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| SET-40 | Sync load defaults | localStorage is empty | Returns {theme:'system', language:'zh'} | [x] |
| SET-41 | Sync save settings | Call saveSync | localStorage updated | [x] |
| SET-42 | Async save settings | Call save in Tauri environment | Calls save_settings command | [x] |
| SET-43 | Async load settings | Call loadAsync in Tauri environment | Calls load_settings command | [x] |
| SET-44 | Tauri fallback | Tauri command fails | Falls back to localStorage | [x] |

### Data Management Tests

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| SET-10 | Storage stats display | Page load | Shows current storage size (KB/MB) | [x] |
| SET-11 | Storage progress bar | Page load | Progress bar shows actual usage percentage | [x] |
| SET-12 | Open export modal | Click export button | Shows export options modal | [x] |
| SET-13 | Execute export | Select then click export | Downloads JSON file | [x] |
| SET-14 | Open import modal | Click import button | Shows import options modal | [x] |
| SET-15 | Execute import | Select file then import | Config updated, page refreshes | [x] |
| SET-16 | Clear data confirmation | Click clear button | Shows confirmation dialog | [x] |
| SET-17 | Confirm clear | Click confirm | Data cleared, page refreshes | [x] |
| SET-18 | Cancel clear | Click cancel | Data preserved | [x] |

### Export Completeness Tests (v2.6.1)

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| SET-50 | Export Models config | Check Models for export | JSON contains models field | [x] |
| SET-51 | Export Agents config | Check Agents for export | JSON contains agents field | [x] |
| SET-52 | Export Skills config | Check Skills for export | JSON contains skills field | [x] |
| SET-53 | Export MCP config | Check MCP for export | JSON contains mcp field (using correct key mobaus_mcp_servers) | [x] |
| SET-54 | Export chat history | Check Chats for export | JSON contains chats field | [x] |
| SET-55 | Export all | Check all options | JSON contains all fields with complete data | [x] |
| SET-56 | Import with Models | Import JSON containing models | Models data correctly restored | [x] |
| SET-57 | Import with MCP | Import JSON containing mcp | MCP server config correctly restored | [x] |

### Export Enhancement Tests (v2.6.2)

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| SET-60 | Chat export completeness | Check Chats for export | JSON contains complete chat data (loaded from storage service) | [x] |
| SET-61 | Export success notification | Click export | Shows "Export successful" notification | [x] |
| SET-62 | Tauri save dialog | Export in Tauri environment | File save dialog appears to choose location | [x] |
| SET-63 | Browser environment fallback | Export in browser environment | Auto-downloads to default location | [x] |
| SET-64 | Tauri import notification | Import success in Tauri environment | Uses native message dialog, can be closed normally | [x] |
| SET-65 | Browser import notification | Import success in browser environment | Uses browser alert, can be closed normally | [x] |

### Clear Data Tests (v2.6.5)

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| SET-70 | Tauri environment clear | Click clear in Tauri environment | Calls storage services to clear filesystem data | [x] |
| SET-71 | Browser environment clear | Click clear in browser environment | Clears localStorage data | [x] |
| SET-72 | Post-clear data verification | Restart app after clearing | All data is empty, no residuals | [x] |

### Export Enhancement Tests (v2.6.5)

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| SET-75 | Export Roundtable Chats | Check Roundtable for export | JSON contains roundtableChats field | [x] |
| SET-76 | Export Settings | Check Settings for export | JSON contains settings field (theme, language, etc.) | [x] |
| SET-77 | Import Roundtable Chats | Import JSON containing roundtableChats | Roundtable chat data correctly restored | [x] |
| SET-78 | Import Settings | Import JSON containing settings | App settings correctly restored | [x] |

### About Information Tests

| ID | Test Scenario | Input | Expected Output | Status |
|----|---------------|-------|-----------------|--------|
| SET-20 | Display version number | Page load | Shows current version number | [x] |
| SET-21 | Check update - already latest | Click check for updates | Shows already latest version | [ ] |
| SET-22 | Check update - update available | New version exists | Shows new version info and download link | [ ] |
| SET-23 | Check update - network error | No network connection | Shows error notification | [ ] |

### Test Files

- `src/test/components/Settings/GeneralSettings.test.tsx`
- `src/test/components/Settings/DataSettings.test.tsx`
- `src/test/components/Settings/SettingsPage.test.tsx`
- `src/test/components/Settings/ExportModal.test.tsx`
- `src/test/components/Settings/ImportModal.test.tsx`
- `src/test/theme/ThemeProvider.test.tsx` (v2.3.0)

---

## Change History

| Date | Version | Change Description |
|------|---------|-------------------|
| 2026-01-18 | 1.0.0 | Initial version |
| 2026-01-23 | 2.3.0 | ThemeProvider refactoring, theme/language persistence fix, storage progress bar dynamic calculation |
| 2026-01-24 | 2.6.0 | Settings Tauri persistence, resolving Dev/Build data inconsistency |
| 2026-01-24 | 2.6.1 | Fix incomplete export: 1) MCP key name corrected to mobaus_mcp_servers; 2) Added Models export support |
| 2026-01-24 | 2.6.2 | Export enhancement: 1) Fix chat export to use storage service; 2) Add export success notification; 3) Tauri environment uses file dialog for save location; 4) Import notification changed to Tauri message dialog to fix alert not closing issue |
| 2026-01-24 | 2.6.3 | Import fix: Use storage services to save data, ensuring correct persistence to filesystem in Tauri environment |
| 2026-01-24 | 2.6.4 | Import merge deduplication: Deduplicate by ID, records with same ID are overwritten by import data, avoiding duplicate imports |
| 2026-01-25 | 2.6.5 | 1) Clear data improvement: Tauri environment uses storage services to clear filesystem data; 2) Export enhancement: Added Roundtable Chats and Settings export support |
| 2026-01-25 | 2.6.6 | Clear data dialog fix: Tauri environment uses message dialog instead of alert, resolving duplicate dialog issue |
| 2026-01-28 | 3.0.25 | Import enhancement: Auto-create missing Skills and MCP dependency resources when importing Agents, log warnings for missing Models |

---

## Implementation Details

### ThemeProvider (v2.6.0)

Theme management uses settingsStorage to implement Tauri filesystem persistence, resolving the Dev/Build environment data inconsistency issue.

```tsx
// src/theme/index.tsx
import { settingsStorage } from '../services/storage';

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Sync load ensures UI is immediately available
    const [theme, setThemeState] = useState<Theme>(() => {
        const settings = settingsStorage.load();
        return settings.theme;
    });

    // Async load from Tauri on app startup
    useEffect(() => {
        const loadFromTauri = async () => {
            const settings = await settingsStorage.loadAsync();
            if (settings.theme !== theme) {
                setThemeState(settings.theme);
            }
        };
        loadFromTauri();
    }, []);

    // Set theme and async persist
    const setTheme = useCallback((newTheme: Theme) => {
        setThemeState(newTheme);
        const currentSettings = settingsStorage.load();
        settingsStorage.save({ ...currentSettings, theme: newTheme });
    }, []);
    // ...
};
```

### settingsStorage (v2.6.0)

Unified settings storage service supporting both Tauri and browser environments.

```typescript
// src/services/storage.ts
export const settingsStorage = {
    // Async save: calls save_settings command in Tauri environment
    async save(settings: AppSettings): Promise<void>,

    // Sync save: falls back to localStorage
    saveSync(settings: AppSettings): void,

    // Async load: calls load_settings command in Tauri environment
    async loadAsync(): Promise<AppSettings>,

    // Sync load: reads from localStorage
    load(): AppSettings,
};
```

**Key Features:**
- Tauri environment: Persists to `settings.json` via filesystem
- Browser environment: Falls back to localStorage
- Sync methods ensure immediate availability during UI initialization
- Async methods load latest settings from Tauri after app startup
- Access and modify settings from any component via `useTheme()` / `useI18n()` hooks

### usePersistedState (v4.1.48)

Unified persisted state management Hook, replacing the scattered useState + useEffect + save pattern in App.tsx.

**File Path:** `src/hooks/usePersistedState.ts`

**Problems Solved:**
- Inconsistent persistence strategies (some debounced, some immediate save)
- Multiple setState + save scattered across multiple useEffects
- `STORAGE_DEBOUNCE_DELAY` constant defined but never used
- High-frequency IO and unnecessary re-renders

```typescript
/** Storage adapter interface - compatible with existing storage services */
interface StorageAdapter<T> {
  load: () => Promise<T[]>;
  save: (items: T[]) => Promise<void>;
}

/** Hook configuration options */
interface UsePersistedStateOptions<T> {
  storage: StorageAdapter<T>;      // Storage adapter
  initialValue: T[];                // Initial value
  immediate?: boolean;              // Whether to save immediately (no debounce), default false
  debounceDelay?: number;           // Custom debounce delay (ms), default STORAGE_DEBOUNCE_DELAY
  transform?: (raw: T[]) => T[];   // Post-load data transform (e.g., reset MCP status)
}

/** Hook return value */
interface UsePersistedStateReturn<T> {
  data: T[];
  setData: Dispatch<SetStateAction<T[]>>;
  loading: boolean;
  loaded: boolean;
  flush: () => Promise<void>;       // Manual immediate save
}
```

**Usage Example:**

```typescript
// High-frequency update data (debounce 1000ms)
const { data: chats, setData: setChats, loaded } = usePersistedState({
  storage: chatsStorage,
  initialValue: [],
});

// Critical config (immediate save)
const { data: models, setData: setModels } = usePersistedState({
  storage: modelsStorage,
  initialValue: [],
  immediate: true,
});

// Post-load data transform (e.g., reset MCP connection status)
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

**Persistence Strategy:**

| Data Type | Mode | Reason |
|-----------|------|--------|
| chats, roundtableChats | Debounce 1000ms | High-frequency updates during streaming output |
| models, agents, skills, mcpServers | Immediate save | User config operations, low-frequency updates |

### usePersistedState Test Cases

| Case ID | Scenario | Input | Expected Result |
|---------|----------|-------|-----------------|
| TC-PERSIST-001 | Initial load success | storage.load returns data | data is loaded data, loaded=true |
| TC-PERSIST-002 | Initial load empty | storage.load returns empty array | data is initialValue |
| TC-PERSIST-003 | Initial load failure | storage.load throws exception | data is initialValue, loaded=true |
| TC-PERSIST-004 | Immediate save mode | immediate=true, setData | Immediately calls storage.save |
| TC-PERSIST-005 | Debounce save mode | 500ms after setData | Does not trigger save |
| TC-PERSIST-006 | Debounce save trigger | Wait 1000ms after setData | Triggers storage.save |
| TC-PERSIST-007 | Debounce merge | setData three times within 1000ms | Only triggers save once, saves final value |
| TC-PERSIST-008 | No save before load | setData when loaded=false | Does not call storage.save |
| TC-PERSIST-009 | flush manual save | Call flush | Saves immediately, cancels debounce timer |
| TC-PERSIST-010 | Save on unmount | Unmount with pending save data | Triggers save |
| TC-PERSIST-011 | transform data | Provide transform function | Loaded data is transformed |
| TC-PERSIST-012 | Concurrent save protection | Rapidly trigger saves | Does not concurrently call storage.save |

### useAppBootstrap (v4.1.48)

App startup bootstrap Hook, initialization logic extracted from App.tsx. Responsible for data loading, MCP auto-connect, credential refresh, and analytics service initialization.

**File Path:** `src/hooks/useAppBootstrap.ts`

**Problems Solved:**
- App.tsx file too large (5400+ lines), initialization logic mixed with UI logic
- Initialization useEffect exceeds 370 lines, difficult to test and maintain
- Token refresh callback useEffect, Skills save useEffect, and other closely related initialization logic scattered

**Responsibilities:**
1. Use `usePersistedState` to manage models, chats, agents, mcpServers, roundtableChats
2. Skills loading (built-in + custom merge) and saving
3. Providers state management (built-in + custom provider merge)
4. MCP server auto-connect (autoStart)
5. Provider credential loading and expired OAuth Token refresh
6. Model cache service initialization
7. OAuth Token auto-renewal service
8. token_expired event listener
9. Mixpanel operational analytics initialization

```typescript
/** Hook configuration options */
interface UseAppBootstrapOptions {
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
}

/** Hook return value */
interface UseAppBootstrapReturn {
  // Persisted data
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
  // Loading state
  isDataLoaded: boolean;
  // Refs
  timeoutIdsRef: MutableRefObject<Set<ReturnType<typeof setTimeout>>>;
  roundtableChatsRef: MutableRefObject<RoundtableChat[]>;
  // Cleanup
  cleanup: () => void;
}
```

**Initialization Flow:**
1. `usePersistedState` loads 5 core datasets in parallel
2. After all `loaded` flags are true (`coreDataLoaded`)
3. Execute `initApp`: Skills merge -> MCP auto-connect -> Custom providers -> Credential refresh -> Model cache -> OAuth service -> Analytics service
4. `setInitDone(true)` -> `isDataLoaded = coreDataLoaded && initDone`

### useAppBootstrap Test Cases

| Case ID | Scenario | Input | Expected Result |
|---------|----------|-------|-----------------|
| TC-BOOT-001 | Core data load complete | All storage.load succeed | isDataLoaded=true |
| TC-BOOT-002 | Skills merge | 3 built-in + 2 custom | skills length 5, built-in first |
| TC-BOOT-003 | MCP auto-connect | Server with autoStart=true | Calls mcp_connect + mcp_list_tools |
| TC-BOOT-004 | Custom provider load | customProviderStorage returns data | providers include custom providers |
| TC-BOOT-005 | Expired Token auto-refresh | Has expired OAuth credential | Calls tokenRefresher.refreshToken |
| TC-BOOT-006 | Token refresh failure callback | refreshToken fails | Provider status becomes disconnected, shows toast |
| TC-BOOT-007 | Token refresh success callback | refreshToken succeeds | Provider status becomes connected |
| TC-BOOT-008 | Cleanup on unmount | Unmount | Clears timers, stops tokenRefresher, cancels event listeners |
| TC-BOOT-009 | Skills save | setSkills update | skillsStorage.save is called |
| TC-BOOT-010 | Init failure non-blocking | initApp throws exception | isDataLoaded still true |

### useChatStream (v4.1.48)

Chat streaming output Hook, streaming message processing logic extracted from App.tsx. Responsible for event listening, RAF batch updates, and content accumulation.

**File Path:** `src/hooks/useChatStream.ts`

**Problems Solved:**
- Streaming output logic mixed with UI logic in handleSendMessage (~1000 lines)
- RAF batch updates, event listeners, cleanup logic scattered
- Complex management of pendingContentRef, rafIdRef, unlistenMapRef

**Responsibilities:**
1. Register `listen('chat-event')` event listener
2. Handle `chunk`/`reasoning_chunk` events, accumulate content to pendingContentRef
3. RAF batch updates: scheduleUpdate + flushPendingUpdates
4. Handle `done`/`error` events, trigger callbacks
5. Manage unlistenMapRef, support stop generation
6. Clean up all listeners and RAF on component unmount

**Not Included:**
- Tool call loop (kept in handleSendMessage, complex business logic)
- Token validation, message building (business logic)
- Roundtable streaming output (independent scenario, not extracted for now)

```typescript
/** Hook configuration options */
interface UseChatStreamOptions {
  chatId: string;
  onChunk: (data: { messageId: string; content: string; reasoning: string }) => void;
  onDone: (data: { messageId: string; usage?: TokenUsage }) => void;
  onError: (error: string) => void;
  onToolCalls?: (toolCalls: ToolCall[]) => Promise<void>;
}

/** Hook return value */
interface UseChatStreamReturn {
  startListening: () => Promise<UnlistenFn>;
  stopListening: () => void;
  flushPending: () => void;
}
```

**Usage Example:**

```typescript
const { startListening, stopListening, flushPending } = useChatStream({
  chatId: 'chat-123',
  onChunk: ({ messageId, content, reasoning }) => {
    // Update message content
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
    // Update token usage, set generation complete
    setGenerating(chatId, false);
  },
  onError: (error) => {
    // Show error message
    addErrorMessage(chatId, error);
  },
});

// Start listening
const unlisten = await startListening();

// Stop generation
stopListening();
```

### useChatStream Test Cases

| Case ID | Scenario | Input | Expected Result |
|---------|----------|-------|-----------------|
| TC-STREAM-001 | Register event listener | startListening | listen('chat-event') is called |
| TC-STREAM-002 | chunk event accumulation | Receive chunk event | Content accumulated to pendingContentRef |
| TC-STREAM-003 | RAF batch update | Multiple chunks arrive rapidly | Only triggers onChunk once (RAF merge) |
| TC-STREAM-004 | done event trigger | Receive done event | Calls flushPending + onDone |
| TC-STREAM-005 | error event trigger | Receive error event | Calls flushPending + onError |
| TC-STREAM-006 | Stop listening | stopListening | Cancels event listener, RAF, cleans refs |
| TC-STREAM-007 | Cleanup on unmount | Unmount | Cleans all listeners and RAF |
| TC-STREAM-008 | Manual flush | flushPending | Immediately triggers onChunk |

---

<a id="中文"></a>

## 模块概述

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

## 功能列表

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

## 组件结构

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

## 数据结构

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

## API 接口

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

## 测试用例

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

## 修改历史

| 日期 | 版本 | 修改内容 |
|------|------|---------|
| 2026-01-18 | 1.0.0 | 初始版本 |
| 2026-01-23 | 2.3.0 | ThemeProvider 重构，主题/语言持久化修复，存储进度条动态计算 |
| 2026-01-24 | 2.6.0 | Settings Tauri 持久化，解决 Dev/Build 数据不一致问题 |
| 2026-01-24 | 2.6.1 | 修复导出功能不完全：1) MCP 键名修正为 mobaus_mcp_servers；2) 新增 Models 导出支持 |
| 2026-01-24 | 2.6.2 | 导出功能增强：1) 修复对话导出使用 storage 服务；2) 添加导出成功提示；3) Tauri 环境使用文件对话框选择保存位置；4) 导入提示改用 Tauri message dialog 解决 alert 无法关闭问题 |
| 2026-01-24 | 2.6.3 | 导入功能修复：使用 storage services 保存数据，确保 Tauri 环境正确持久化到文件系统 |
| 2026-01-24 | 2.6.4 | 导入合并去重：根据 ID 去重，相同 ID 的记录用导入数据覆盖，避免重复导入 |
| 2026-01-25 | 2.6.5 | 1) 清理数据功能完善：Tauri 环境使用 storage services 清理文件系统数据；2) 导出功能增强：新增 Roundtable Chats 和 Settings 导出支持 |
| 2026-01-25 | 2.6.6 | 清理数据弹窗修复：Tauri 环境使用 message dialog 替代 alert，解决重复弹窗问题 |
| 2026-01-28 | 3.0.25 | 导入增强：Agent 导入时自动创建缺失的 Skills 和 MCP 依赖资源，对于缺失的 Model 记录警告日志 |

---

## 实现细节

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
