# Common 通用组件

## 📋 概述

本文档描述 MobausStudio 项目中的通用 UI 组件，这些组件可在多个模块中复用。

| 属性 | 值 |
|------|------|
| 组件路径 | `src/components/common` |
| 创建日期 | 2026-01-19 |
| 最后更新 | 2026-01-30 |

---

## 📂 组件列表

| 组件 | 描述 | 使用模块 |
|------|------|---------|
| `ContextMenu` | 右键上下文菜单 | Chat, MessageBubble |
| `Modal` | 模态对话框（毛玻璃背景） | Chat, Settings, Models |
| `Button` | 按钮组件 | 全局 |
| `SearchInput` | 搜索输入框 | Chat |
| `Select` | 自定义下拉选择器（v3.6.5 重构） | Models, Providers |
| `Toast` | 右上角临时通知 | Models (v2.5.3) |
| `ExpandableSearch` | 可展开搜索框（带动画） | Models, Skills, Agent, MCP, Providers (v3.5.0) |
| `CompactStats` | 紧凑型统计卡片（内联显示） | Models, MCP, Providers (v3.5.0) |
| `PageHeader` | 统一页面头部组件 | Models, Skills, Agent, MCP, Providers (v3.5.0) |

---

## 🎨 Select 自定义下拉选择器 (v3.6.5)

### 组件概述

`Select` 是一个完全自定义的下拉选择器组件，替代原生 `<select>` 元素，提供更美观的 UI 和更丰富的功能。

### 文件结构

```text
src/components/common/Input/
└── index.tsx     # 包含 Select 组件实现
```

### 接口定义

```typescript
interface SelectOption {
  value: string;       // 选项值
  label: string;       // 显示文本
  disabled?: boolean;  // 是否禁用
  connected?: boolean; // 是否显示已连接标识
}

interface SelectProps {
  value: string;                    // 当前选中值
  onChange: (value: string) => void; // 值变化回调
  options: SelectOption[];          // 选项列表
  className?: string;               // 自定义样式
  disabled?: boolean;               // 是否禁用
  placeholder?: string;             // 占位符文本
}
```

### 使用示例

```tsx
import { Select } from '../../common';

const MyComponent = () => {
  const [provider, setProvider] = useState('openai');

  const options = [
    { value: 'openai', label: 'OpenAI ● 已连接' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'google', label: 'Google ● 已连接' },
  ];

  return (
    <Select
      value={provider}
      onChange={setProvider}
      options={options}
      placeholder="选择提供商..."
    />
  );
};
```

### 功能特性

| 特性 | 说明 |
|------|------|
| **自定义样式** | 完全自定义的下拉框，不使用原生 select |
| **已连接标识** | 自动解析 `● 已连接` 后缀，显示绿色徽章 |
| **键盘导航** | 支持 ↑↓ 箭头、Enter、Escape 键操作 |
| **点击外部关闭** | 点击下拉框外部自动关闭 |
| **禁用选项** | 支持禁用特定选项（灰色样式） |
| **选中状态** | 选中项显示紫色背景和 ✓ 图标 |
| **动画效果** | 展开/收起带平滑动画 |
| **暗色模式** | 完整支持 dark mode |

### 样式规范

| 属性 | 值 |
|------|------|
| 圆角 | rounded-xl (12px) |
| 边框 | 默认 gray-300，聚焦 purple-500 |
| 下拉面板 | 最大高度 240px，超出滚动 |
| 选项高度 | 40px (py-2.5) |
| z-index | 50 |

### 已连接标识解析

组件会自动解析标签中的 `● 已连接` 后缀，并转换为绿色徽章显示：

```
输入: "OpenAI ● 已连接"
显示: [OpenAI] [🟢 已连接]
```

### 测试用例

| ID | 测试场景 | 输入 | 预期结果 |
|----|---------|------|---------|
| SEL-01 | 渲染选项列表 | options 数组 | 点击后显示所有选项 |
| SEL-02 | 选择选项 | 点击选项 | 触发 onChange，关闭下拉框 |
| SEL-03 | 已连接标识 | label 包含 `● 已连接` | 显示绿色徽章 |
| SEL-04 | 禁用选项 | disabled: true | 选项灰色，不可点击 |
| SEL-05 | 键盘导航 | 按 ↓ 键 | 选中下一个选项 |
| SEL-06 | ESC 关闭 | 按 ESC 键 | 关闭下拉框 |
| SEL-07 | 点击外部关闭 | 点击下拉框外部 | 关闭下拉框 |
| SEL-08 | 选中状态 | 当前选中的选项 | 显示紫色背景和 ✓ 图标 |

---

## 🪟 Modal 模态对话框 (v3.6.4 更新)

### 组件概述

`Modal` 提供模态对话框功能，v3.6.4 版本添加了毛玻璃背景效果。

### 文件结构

```text
src/components/common/Modal/
└── index.tsx     # Modal 组件实现
```

### 接口定义

```typescript
interface ModalProps {
  isOpen: boolean;           // 是否打开
  onClose: () => void;       // 关闭回调
  title: string;             // 标题
  children: React.ReactNode; // 内容
  size?: 'sm' | 'md' | 'lg' | 'xl'; // 尺寸
}
```

### 功能特性 (v3.6.4)

| 特性 | 说明 |
|------|------|
| **毛玻璃背景** | 使用 `backdrop-blur-sm` 实现半透明模糊效果 |
| **ESC 关闭** | 按 ESC 键关闭弹窗 |
| **点击遮罩关闭** | 点击背景遮罩关闭弹窗 |
| **滚动锁定** | 打开时禁止页面滚动 |
| **动画效果** | 淡入 + 缩放动画 |

### 样式规范

| 属性 | 值 |
|------|------|
| 背景遮罩 | bg-black/50 backdrop-blur-sm |
| 圆角 | rounded-2xl (16px) |
| 阴影 | shadow-2xl |
| 最大高度 | 90vh |
| z-index | 50 |

---

## 🔍 ExpandableSearch 可展开搜索框 (v3.5.0)

### 组件概述

`ExpandableSearch` 提供可折叠的搜索输入框，默认显示搜索图标，点击后展开输入框，带平滑动画效果。用于节省页面头部空间。

### 文件结构

```text
src/components/common/ExpandableSearch/
└── index.tsx     # 组件实现
```

### 接口定义

```typescript
interface ExpandableSearchProps {
  value: string;                    // 搜索值
  onChange: (value: string) => void; // 值变化回调
  placeholder?: string;             // 占位文本
  className?: string;               // 自定义样式
  expandedWidth?: string;           // 展开后宽度，默认 '280px'
  autoCollapse?: boolean;           // 失焦且无内容时自动收起，默认 true
}
```

### 使用示例

```tsx
import { ExpandableSearch } from '../../common';

const MyPage = () => {
  const [search, setSearch] = useState('');

  return (
    <ExpandableSearch
      value={search}
      onChange={setSearch}
      placeholder="搜索模型..."
      expandedWidth="300px"
    />
  );
};
```

### 功能特性

| 特性 | 说明 |
|------|------|
| **折叠状态** | 仅显示搜索图标按钮（40px 宽） |
| **展开动画** | 点击后平滑展开到指定宽度（300ms ease-out） |
| **自动聚焦** | 展开后自动聚焦输入框 |
| **自动收起** | 失焦且无内容时自动收起（可配置） |
| **清除按钮** | 有内容时显示清除按钮 |
| **暗色模式** | 完整支持 dark mode |

### 样式规范

| 属性 | 折叠状态 | 展开状态 |
|------|---------|---------|
| 宽度 | 40px | 280px（可配置） |
| 高度 | 36px | 36px |
| 圆角 | 18px (rounded-full) | 8px (rounded-lg) |
| 过渡 | transition-all 300ms ease-out | - |

### 测试用例

| ID | 测试场景 | 输入 | 预期结果 |
|----|---------|------|---------|
| EXPS-01 | 初始折叠状态 | 渲染组件 | 仅显示搜索图标按钮 |
| EXPS-02 | 点击展开 | 点击搜索图标 | 展开输入框，自动聚焦 |
| EXPS-03 | 输入搜索 | 输入文字 | 触发 onChange，显示清除按钮 |
| EXPS-04 | 清除内容 | 点击清除按钮 | 清空输入，保持展开 |
| EXPS-05 | 自动收起 | 失焦且无内容 | 自动收起到图标状态 |
| EXPS-06 | 有内容不收起 | 失焦但有内容 | 保持展开状态 |
| EXPS-07 | ESC 键收起 | 按 ESC 键 | 清空内容并收起 |

---

## 📊 CompactStats 紧凑型统计卡片 (v3.5.0)

### 组件概述

`CompactStats` 提供紧凑的统计数据展示，采用内联横向布局，适合放在页面标题行右侧，节省垂直空间。

### 文件结构

```text
src/components/common/CompactStats/
└── index.tsx     # 组件实现
```

### 接口定义

```typescript
interface StatItem {
  label: string;           // 标签
  value: number | string;  // 数值
  icon?: React.ReactNode;  // 图标
  color?: 'default' | 'success' | 'warning' | 'error' | 'info';
}

interface CompactStatsProps {
  items: StatItem[];       // 统计项列表
  className?: string;      // 自定义样式
}
```

### 使用示例

```tsx
import { CompactStats } from '../../common';
import { CheckCircle, XCircle } from 'lucide-react';

const stats = [
  { label: '总数', value: 17, color: 'default' },
  { label: '在线', value: 14, icon: <CheckCircle />, color: 'success' },
  { label: '离线', value: 0, icon: <XCircle />, color: 'error' },
];

<CompactStats items={stats} />
```

### 功能特性

| 特性 | 说明 |
|------|------|
| **内联布局** | 横向排列，使用 flex gap-4 |
| **紧凑尺寸** | 每项约 80-100px 宽 |
| **颜色主题** | 支持 5 种颜色主题 |
| **响应式** | 小屏幕时可隐藏标签只显示数值 |

### 样式规范

| 属性 | 值 |
|------|------|
| 布局 | flex items-center gap-4 |
| 单项高度 | 32px |
| 数值字号 | text-lg font-bold |
| 标签字号 | text-xs text-gray-500 |
| 分隔符 | 竖线或间距 |

### 颜色映射

| color | 数值颜色 | 图标颜色 |
|-------|---------|---------|
| default | text-gray-800 | text-gray-500 |
| success | text-green-600 | text-green-500 |
| warning | text-yellow-600 | text-yellow-500 |
| error | text-red-600 | text-red-500 |
| info | text-blue-600 | text-blue-500 |

### 测试用例

| ID | 测试场景 | 输入 | 预期结果 |
|----|---------|------|---------|
| CSTAT-01 | 渲染统计项 | items 数组 | 横向显示所有统计项 |
| CSTAT-02 | 颜色主题 | color='success' | 显示绿色数值和图标 |
| CSTAT-03 | 带图标 | 传入 icon | 图标显示在数值左侧 |
| CSTAT-04 | 大数值格式化 | value=12500 | 显示 "12.5K" |

---

## 📄 PageHeader 页面头部组件 (v3.5.0)

### 组件概述

`PageHeader` 是统一的页面头部组件，整合标题、统计、搜索、筛选和操作按钮，采用紧凑布局节省垂直空间。

### 设计目标

| 优化项 | 优化前 | 优化后 | 节省 |
|--------|-------|-------|------|
| 头部总高度 | ~220px | ~100px | **120px** |
| 统计卡片 | 独立行 80px | 内联 32px | 48px |
| 搜索框 | 始终展开 50px | 可折叠 36px | 14px |
| 内边距 | p-6 (24px×2) | p-4 (16px×2) | 16px |
| 标题字号 | text-2xl | text-xl | - |

### 文件结构

```text
src/components/common/PageHeader/
└── index.tsx     # 组件实现
```

### 接口定义

```typescript
interface PageHeaderProps {
  // 标题区域
  icon: React.ReactNode;           // 页面图标
  title: string;                   // 页面标题
  subtitle?: string;               // 副标题

  // 统计区域（可选）
  stats?: StatItem[];              // 统计数据

  // 搜索区域（可选）
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;

  // 筛选器（可选）
  filters?: React.ReactNode;       // 自定义筛选器

  // 操作按钮
  actions?: React.ReactNode;       // 右侧操作按钮
}
```

### 使用示例

```tsx
import { PageHeader, CompactStats, ExpandableSearch } from '../../common';
import { Cpu, Plus } from 'lucide-react';

<PageHeader
  icon={<Cpu className="w-6 h-6 text-purple-600" />}
  title="模型配置"
  subtitle="管理AI模型API密钥和连接配置"
  stats={[
    { label: '总数', value: 17 },
    { label: '在线', value: 14, color: 'success' },
  ]}
  searchValue={search}
  onSearchChange={setSearch}
  searchPlaceholder="搜索模型..."
  filters={
    <select value={filter} onChange={e => setFilter(e.target.value)}>
      <option value="all">全部提供商</option>
    </select>
  }
  actions={
    <Button icon={<Plus />}>添加模型</Button>
  }
/>
```

### 布局结构

```
┌─────────────────────────────────────────────────────────────────┐
│ [Icon] Title                    [Stats] [Search] [Filter] [Btn] │
│        Subtitle                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 功能特性

| 特性 | 说明 |
|------|------|
| **单行布局** | 标题、统计、搜索、按钮在同一行 |
| **响应式** | 小屏幕时统计折叠、搜索图标化 |
| **可选区域** | stats、search、filters 均为可选 |
| **暗色模式** | 完整支持 dark mode |

### 样式规范

| 属性 | 值 |
|------|------|
| 背景 | bg-white dark:bg-gray-900 |
| 边框 | border-b border-gray-200 |
| 内边距 | p-4 |
| 标题字号 | text-xl font-bold |
| 副标题字号 | text-xs text-gray-500 |

### 测试用例

| ID | 测试场景 | 输入 | 预期结果 |
|----|---------|------|---------|
| PH-01 | 基础渲染 | title, icon | 显示图标和标题 |
| PH-02 | 带统计 | stats 数组 | 标题右侧显示统计 |
| PH-03 | 带搜索 | searchValue, onSearchChange | 显示可展开搜索框 |
| PH-04 | 带筛选器 | filters ReactNode | 显示筛选下拉框 |
| PH-05 | 带操作按钮 | actions ReactNode | 右侧显示按钮 |
| PH-06 | 暗色模式 | dark mode | 正确应用暗色样式 |

---

## 🖱️ ContextMenu 右键菜单

### 组件概述

`ContextMenu` 提供原生风格的右键上下文菜单功能，支持声明式和编程式两种使用方式。

### 文件结构

```
src/components/common/ContextMenu/
└── index.tsx     # 组件实现 + useContextMenu Hook
```

### 接口定义

#### ContextMenuItem

```typescript
interface ContextMenuItem {
  id: string;              // 唯一标识
  label: string;           // 显示文本
  icon?: React.ReactNode;  // 图标 (lucide-react)
  shortcut?: string;       // 快捷键提示 (如 "⌘C")
  disabled?: boolean;      // 禁用状态
  danger?: boolean;        // 危险操作 (红色高亮)
  divider?: boolean;       // 分隔线 (设为 true 时其他属性忽略)
  onClick?: () => void;    // 点击回调
}
```

#### ContextMenuProps

```typescript
interface ContextMenuProps {
  items: ContextMenuItem[];         // 菜单项列表
  children: React.ReactNode;        // 触发区域
  onOpenChange?: (open: boolean) => void;  // 打开/关闭回调
}
```

### 声明式使用 (推荐)

```tsx
import { ContextMenu, type ContextMenuItem } from '../../common';

const MyComponent = () => {
  const menuItems: ContextMenuItem[] = [
    {
      id: 'copy',
      label: '复制',
      icon: <Copy size={14} />,
      shortcut: '⌘C',
      onClick: () => navigator.clipboard.writeText(text),
    },
    { id: 'divider', label: '', divider: true },
    {
      id: 'delete',
      label: '删除',
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: handleDelete,
    },
  ];

  return (
    <ContextMenu items={menuItems}>
      <div>右键点击此区域</div>
    </ContextMenu>
  );
};
```

### 编程式使用 (Hook)

```tsx
import { useContextMenu, ContextMenuItem } from '../../common';

const MyComponent = () => {
  const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu();

  const handleContextMenu = (e: React.MouseEvent) => {
    showContextMenu(e, [
      { id: 'action1', label: '操作1', onClick: () => {} },
    ]);
  };

  return (
    <div onContextMenu={handleContextMenu}>
      右键点击
      {/* 需要自行渲染菜单 */}
    </div>
  );
};
```

### 功能特性

| 特性 | 说明 |
|------|------|
| **视口边界检测** | 菜单自动调整位置，避免超出屏幕边界 |
| **Portal 渲染** | 使用 `createPortal` 渲染到 body，避免 z-index 层叠问题 |
| **键盘支持** | ESC 键关闭菜单 |
| **点击关闭** | 点击菜单外部自动关闭 |
| **滚动关闭** | 页面滚动时自动关闭菜单 |
| **暗色模式** | 完整支持 dark mode |
| **动画效果** | 使用 `animate-in` 实现淡入缩放动画 |

### 样式规范

| 属性 | 值 |
|------|------|
| 最小宽度 | 180px |
| 项高度 | 36px (预估) |
| 圆角 | 8px (rounded-lg) |
| 阴影 | shadow-lg |
| z-index | 9999 |

### 菜单项样式

| 状态 | 样式 |
|------|------|
| 默认 | `text-gray-700 dark:text-gray-200` |
| 悬停 | `hover:bg-gray-100 dark:hover:bg-gray-700` |
| 禁用 | `text-gray-400 cursor-not-allowed` |
| 危险 | `text-red-600 hover:bg-red-50` |
| 分隔线 | `h-px bg-gray-200 my-1` |

---

## 🧪 测试用例

### ContextMenu 测试

| ID | 测试场景 | 输入 | 预期结果 |
|----|---------|------|---------|
| CTX-01 | 右键触发菜单 | 右键点击触发区域 | 显示菜单，位置在鼠标附近 |
| CTX-02 | 菜单项点击 | 点击菜单项 | 执行 onClick，菜单关闭 |
| CTX-03 | 禁用项点击 | 点击 disabled 菜单项 | 不执行 onClick，菜单保持 |
| CTX-04 | ESC 关闭 | 菜单打开时按 ESC | 菜单关闭 |
| CTX-05 | 外部点击关闭 | 点击菜单外部 | 菜单关闭 |
| CTX-06 | 边界检测 - 右边界 | 在屏幕右侧右键 | 菜单向左偏移，不超出视口 |
| CTX-07 | 边界检测 - 下边界 | 在屏幕底部右键 | 菜单向上偏移，不超出视口 |
| CTX-08 | 滚动关闭 | 菜单打开时滚动页面 | 菜单关闭 |
| CTX-09 | 分隔线渲染 | items 包含 divider 项 | 渲染水平分隔线 |
| CTX-10 | 危险项样式 | items 包含 danger 项 | 显示红色文字和悬停背景 |

### 测试文件

- `src/test/components/common/ContextMenu.test.tsx` (待创建)

---

## 📝 修改历史

| 日期 | 版本 | 修改内容 |
|------|------|---------|
| 2026-01-19 | 1.0.0 | 初始版本 - ContextMenu 组件 |
| 2026-01-23 | 2.5.3 | 新增 Toast 组件 |
| 2026-01-27 | 3.5.0 | 新增 ExpandableSearch、CompactStats、PageHeader 组件，优化页面头部布局 |
| 2026-01-30 | 3.6.4 | Modal 组件添加毛玻璃背景效果（backdrop-blur） |
| 2026-01-30 | 3.6.5 | Select 组件重构为全自定义下拉组件，支持已连接标识徽章、键盘导航 |

---

## 🔧 实现细节

### 视口边界检测算法

```typescript
const handleContextMenu = (e: React.MouseEvent) => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const menuWidth = 200;  // 预估菜单宽度
  const menuHeight = items.length * 36 + 16;  // 预估菜单高度

  let x = e.clientX;
  let y = e.clientY;

  // 防止菜单超出右边界
  if (x + menuWidth > viewportWidth) {
    x = viewportWidth - menuWidth - 8;
  }

  // 防止菜单超出下边界
  if (y + menuHeight > viewportHeight) {
    y = viewportHeight - menuHeight - 8;
  }

  setPosition({ x, y });
};
```

### Portal 渲染

使用 `createPortal` 将菜单渲染到 `document.body`，避免父组件 `overflow: hidden` 或 `z-index` 影响菜单显示：

```tsx
{menu && createPortal(menu, document.body)}
```

### 事件清理

组件卸载或菜单关闭时，正确清理所有事件监听器：

```typescript
useEffect(() => {
  if (!isOpen) return;

  document.addEventListener('mousedown', handleClickOutside);
  document.addEventListener('keydown', handleEscape);
  document.addEventListener('scroll', handleScroll, true);

  return () => {
    document.removeEventListener('mousedown', handleClickOutside);
    document.removeEventListener('keydown', handleEscape);
    document.removeEventListener('scroll', handleScroll, true);
  };
}, [isOpen, handleClose]);
```

---

## 🔔 Toast 通知组件 (v2.5.3)

### 组件概述

`Toast` 提供右上角临时通知功能，支持成功/错误/警告/信息四种类型，可展开查看详情。

### 文件结构

```text
src/components/common/Toast/
└── index.tsx     # Toast 组件实现
```

### 接口定义

#### ToastItem

```typescript
interface ToastItem {
  id: string;              // 唯一标识
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;           // 标题
  message: string;         // 消息内容
  details?: string;        // 可展开的详情
  statusCode?: number;     // HTTP 状态码（可选）
  duration?: number;       // 自动关闭时间（毫秒），0 表示不自动关闭
}
```

#### ToastProps

```typescript
interface ToastProps {
  toasts: ToastItem[];              // 通知列表
  onDismiss: (id: string) => void;  // 关闭回调
}
```

### 使用示例

```tsx
import { Toast, type ToastItem } from './components/common';

const App = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (toast: Omit<ToastItem, 'id'>) => {
    setToasts(prev => [...prev, { ...toast, id: Date.now().toString() }]);
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // 添加成功通知
  addToast({
    type: 'success',
    title: '操作成功',
    message: '模型测试通过',
    duration: 5000,
  });

  // 添加带详情的错误通知
  addToast({
    type: 'error',
    title: '测试失败',
    message: 'API 连接失败',
    statusCode: 401,
    details: '认证失败，请检查 API Key',
    duration: 10000,
  });

  return <Toast toasts={toasts} onDismiss={dismissToast} />;
};
```

### 功能特性

| 特性 | 说明 |
|------|------|
| **多类型支持** | success(绿)/error(红)/warning(黄)/info(蓝) |
| **可展开详情** | 点击"查看详情"展开 statusCode 和 details |
| **自动关闭** | 默认 5 秒后自动消失，可配置 duration |
| **手动关闭** | 点击 X 按钮立即关闭 |
| **堆叠显示** | 多个通知垂直堆叠 |
| **滑入动画** | 从右侧滑入的动画效果 |
| **暗色模式** | 完整支持 dark mode |

### 样式规范

| 属性 | 值 |
|------|------|
| 位置 | 右上角 (top-4 right-4) |
| 宽度 | 320px - 400px |
| z-index | 100 |
| 圆角 | 8px (rounded-lg) |
| 阴影 | shadow-lg |

### 测试用例

| ID | 测试场景 | 输入 | 预期结果 |
|----|---------|------|---------|
| TOAST-01 | 显示成功通知 | type='success' | 显示绿色图标和背景 |
| TOAST-02 | 显示错误通知 | type='error' | 显示红色图标和背景 |
| TOAST-03 | 自动关闭 | duration=3000 | 3秒后自动消失 |
| TOAST-04 | 手动关闭 | 点击 X 按钮 | 立即消失 |
| TOAST-05 | 展开详情 | 点击"查看详情" | 显示 statusCode 和 details |
| TOAST-06 | 收起详情 | 点击"收起详情" | 隐藏详情区域 |
| TOAST-07 | 多通知堆叠 | 添加多个 toast | 垂直堆叠显示 |
| TOAST-08 | 滑入动画 | 添加 toast | 从右侧滑入 |

### 测试文件

- `src/test/components/common/Toast.test.tsx`

---

## 📝 Markdown 共享组件模块 (v3.5.0)

### 模块概述

`markdown` 子模块提供统一的 Markdown 渲染组件，用于 Chat 和圆桌会议等场景，确保渲染体验一致。

### 文件结构

```text
src/components/common/markdown/
├── index.ts                  # 模块导出
├── fileUtils.ts              # 文件类型检测工具
├── CodeBlock.tsx             # 代码块组件（语法高亮、复制、懒加载）
├── ImageRenderer.tsx         # 图片组件（懒加载、点击放大、错误处理）
├── LinkRenderer.tsx          # 链接组件（文件下载检测、外部链接图标）
├── ThinkingBlock.tsx         # 思考过程折叠组件
└── markdownComponents.tsx    # 共享 Markdown 配置工厂
```

---

### 🧠 ThinkingBlock 思考过程折叠组件

#### 组件概述

`ThinkingBlock` 用于展示 AI 的思考过程（reasoning content），支持折叠/展开、复制等功能。

#### 接口定义

```typescript
interface ThinkingBlockProps {
  /** 思考内容（直接传入） */
  content?: string;
  /** 原始消息内容（用于解析 <think> 标签） */
  rawContent?: string;
  /** 是否默认展开（默认 true） */
  defaultExpanded?: boolean;
  /** 最大高度（像素，默认 120） */
  maxHeight?: number;
  /** 自定义类名 */
  className?: string;
  /** 复制成功回调 */
  onCopy?: (text: string) => void;
}
```

#### 使用示例

```tsx
import { ThinkingBlock } from '../../common/markdown';

// 方式1：直接传入思考内容
<ThinkingBlock content={message.reasoningContent} />

// 方式2：从原始内容解析 <think> 标签
<ThinkingBlock rawContent={message.content} />
```

#### 功能特性

| 特性 | 说明 |
|------|------|
| **双数据源** | 支持 `content` 直接传入或从 `rawContent` 解析 `<think>` 标签 |
| **折叠/展开** | 点击标题栏切换，展开显示"收起"，折叠显示预览文本 |
| **预览文本** | 折叠时显示前 50 字符的预览 |
| **复制功能** | 点击复制按钮复制思考内容 |
| **自动滚动** | 流式输出时自动滚动到底部 |
| **高度限制** | 默认 120px 最大高度，超出可滚动 |
| **amber 色系** | 使用 amber 色系区分普通内容 |

#### 工具函数

```typescript
// 从内容中解析 <think> 标签
parseThinkingContent(content: string): string | null

// 从内容中移除 <think> 标签
removeThinkingTags(content: string): string
```

#### 测试用例

| ID | 测试场景 | 输入 | 预期结果 |
|----|---------|------|---------|
| TB-01 | 渲染思考内容 | content='思考过程' | 显示思考过程区域 |
| TB-02 | 无内容不渲染 | content=undefined | 不渲染任何内容 |
| TB-03 | 解析 think 标签 | rawContent='<think>xxx</think>' | 正确提取思考内容 |
| TB-04 | 默认展开 | defaultExpanded=true | 内容可见，显示"收起" |
| TB-05 | 默认折叠 | defaultExpanded=false | 内容隐藏，显示预览 |
| TB-06 | 切换折叠状态 | 点击标题栏 | 展开/折叠切换 |
| TB-07 | 复制功能 | 点击复制按钮 | 调用 onCopy 回调 |
| TB-08 | 高度限制 | 长内容 | maxHeight 生效，可滚动 |
| TB-09 | 预览文本截断 | 长思考内容 | 折叠时显示前 50 字符 + ... |

---

### 💻 CodeBlock 代码块组件

#### 组件概述

`CodeBlock` 提供代码语法高亮、复制按钮、懒加载等功能。

#### 接口定义

```typescript
interface CodeBlockProps {
  /** 代码语言 */
  language: string;
  /** 代码内容 */
  value: string;
  /** 是否启用语法高亮（默认 true） */
  enableHighlight?: boolean;
  /** 是否启用复制按钮（默认 true） */
  enableCopy?: boolean;
  /** 是否启用懒加载（默认 true） */
  enableLazyLoad?: boolean;
}
```

#### 功能特性

| 特性 | 说明 |
|------|------|
| **语法高亮** | 使用 react-syntax-highlighter (Prism, vscDarkPlus 主题) |
| **懒加载** | IntersectionObserver 检测，进入视口才高亮 |
| **复制按钮** | 悬停显示，点击复制代码内容 |
| **语言标签** | 左上角显示代码语言 |
| **横向滚动** | 长代码行支持横向滚动 |

#### 测试用例

| ID | 测试场景 | 输入 | 预期结果 |
|----|---------|------|---------|
| CB-01 | 渲染代码块 | language='js', value='code' | 显示代码块 |
| CB-02 | 语法高亮 | enableHighlight=true | 代码有颜色高亮 |
| CB-03 | 禁用高亮 | enableHighlight=false | 显示纯文本 |
| CB-04 | 复制功能 | 点击复制按钮 | 代码复制到剪贴板 |
| CB-05 | 懒加载 | 代码块在视口外 | 不进行语法高亮 |
| CB-06 | 进入视口 | 滚动到代码块 | 触发语法高亮 |
| CB-07 | 语言标签 | language='python' | 显示 "python" 标签 |

---

### 🖼️ ImageRenderer 图片渲染组件

#### 组件概述

`ImageRenderer` 提供图片懒加载、点击放大、加载失败处理等功能。

#### 接口定义

```typescript
interface ImageRendererProps {
  /** 图片 URL */
  src?: string;
  /** 替代文本 */
  alt?: string;
  /** 是否启用点击放大（默认 true） */
  enableZoom?: boolean;
  /** 是否启用懒加载（默认 true） */
  enableLazyLoad?: boolean;
  /** 最大高度（像素，默认 400） */
  maxHeight?: number;
}
```

#### 功能特性

| 特性 | 说明 |
|------|------|
| **懒加载** | 使用 loading="lazy" 属性，进入视口才加载 |
| **点击放大** | 点击图片在应用内模态框中预览原图（v4.2.4） |
| **右键下载** | 右键菜单提供下载选项 |
| **加载状态** | 显示加载中占位符 |
| **错误处理** | 加载失败显示错误提示 |
| **高度限制** | 默认最大高度 400px |
| **Alt 文字** | 图片下方显示描述文字 |

#### 测试用例

| ID | 测试场景 | 输入 | 预期结果 |
|----|---------|------|---------|
| IR-01 | 渲染图片 | src='url', alt='desc' | 显示图片 |
| IR-02 | 懒加载 | 图片在视口外 | 不立即加载图片 |
| IR-03 | 加载中状态 | 图片加载中 | 显示加载中占位符 |
| IR-04 | 加载失败 | 无效 URL | 显示错误提示 |
| IR-05 | 点击放大 (v4.2.4) | 点击图片 | 打开图片预览模态框 |
| IR-06 | 右键下载 | 右键点击图片 | 显示下载选项 |
| IR-07 | 下载图片 | 点击下载选项 | 下载图片到本地 |
| IR-08 | 高度限制 | 高图片 | maxHeight 生效 |
| IR-09 | Alt 文字显示 | alt='描述' | 图片下方显示描述 |

---

### 🔗 LinkRenderer 链接渲染组件

#### 组件概述

`LinkRenderer` 提供链接渲染，支持文件下载检测和外部链接图标。

#### 接口定义

```typescript
interface LinkRendererProps {
  /** 链接地址 */
  href?: string;
  /** 链接内容 */
  children?: React.ReactNode;
  /** 是否启用文件下载检测（默认 true） */
  enableFileDownload?: boolean;
  /** 是否显示外部链接图标（默认 true） */
  showExternalIcon?: boolean;
}
```

#### 功能特性

| 特性 | 说明 |
|------|------|
| **文件下载检测** | 根据 URL 扩展名检测文件类型 |
| **下载按钮** | 文件链接显示下载按钮 |
| **外部链接图标** | 外部链接显示 ↗ 图标 |
| **新窗口打开** | 外部链接在新窗口打开 |

#### 文件类型检测

```typescript
// 支持的文件类型
type FileCategory = 'document' | 'archive' | 'code' | 'data' | 'media' | 'other';

// 检测函数
getFileCategory(filename: string): FileCategory
```

#### 测试用例

| ID | 测试场景 | 输入 | 预期结果 |
|----|---------|------|---------|
| LR-01 | 渲染普通链接 | href='https://...' | 显示链接文本 |
| LR-02 | 外部链接图标 | showExternalIcon=true | 显示 ↗ 图标 |
| LR-03 | 文件链接检测 | href='file.pdf' | 识别为文档类型 |
| LR-04 | 下载按钮 | 文件链接 | 显示下载按钮 |
| LR-05 | 新窗口打开 | 点击外部链接 | target='_blank' |

---

### ⚙️ markdownComponents 配置工厂

#### 函数概述

`createMarkdownComponents` 创建 react-markdown 的 components 配置，整合所有共享组件。

#### 接口定义

```typescript
interface MarkdownOptions {
  enableCodeHighlight?: boolean;    // 代码语法高亮（默认 true）
  enableCodeCopy?: boolean;         // 代码复制按钮（默认 true）
  enableCodeLazyLoad?: boolean;     // 代码块懒加载（默认 true）
  enableImageZoom?: boolean;        // 图片点击放大（默认 true）
  enableImageLazyLoad?: boolean;    // 图片懒加载（默认 true）
  maxImageHeight?: number;          // 图片最大高度（默认 400）
  enableFileDownload?: boolean;     // 文件下载检测（默认 true）
  showExternalLinkIcon?: boolean;   // 外部链接图标（默认 true）
  isUserMessage?: boolean;          // 是否为用户消息
}

function createMarkdownComponents(options?: MarkdownOptions): Components
```

#### 使用示例

```tsx
import { createMarkdownComponents } from '../../common/markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// 使用默认配置
const components = createMarkdownComponents();

// 自定义配置
const simpleComponents = createMarkdownComponents({
  enableCodeHighlight: false,
  enableImageZoom: false,
});

<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  components={components}
>
  {content}
</ReactMarkdown>
```

#### 预创建配置

```typescript
// 默认配置（全功能）
export const defaultMarkdownComponents = createMarkdownComponents();

// 简化配置（禁用高级功能，性能优先）
export const simpleMarkdownComponents = createMarkdownComponents({
  enableCodeHighlight: false,
  enableCodeLazyLoad: false,
  enableImageZoom: false,
  enableFileDownload: false,
  showExternalLinkIcon: false,
});
```

---

### 测试文件

- `src/test/components/common/markdown/ThinkingBlock.test.tsx`
- `src/test/components/common/markdown/CodeBlock.test.tsx`
- `src/test/components/common/markdown/ImageRenderer.test.tsx`
- `src/test/components/common/markdown/LinkRenderer.test.tsx`
