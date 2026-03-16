# Layout Components / 布局组件

> **English**: Application layout components at `src/components/layout/`.
> Includes Header (top bar with brand logo, window drag support, overlay title bar) and Sidebar (navigation).
> Detailed design specs and implementation notes are in Chinese below.

## 📋 概述

本文档描述 MobausStudio 项目中的布局组件，负责应用整体框架结构。

| 属性 | 值 |
|------|------|
| 组件路径 | `src/components/layout` |
| 创建日期 | 2026-03-01 |
| 最后更新 | 2026-03-01 |

---

## 🎨 Header 应用顶栏组件

### 组件概述

`Header` 是应用顶部标题栏，支持 Tauri 窗口拖动，展示品牌 Logo 和应用名称。

### 文件结构

```text
src/components/layout/Header/
└── index.tsx     # Header 组件实现
```

### 设计方案（v9.0 - Mobaus 渐变圆形品牌风格）

#### 布局结构

```
┌──────────────────────────────────────────────────────────────────┐
│  ◉ Mobaus Studio  [PRO]                                          │
│  (渐变圆形Logo)  (渐变大字)   (版本标签)    (右侧按钮已隐藏)      │
└──────────────────────────────────────────────────────────────────┘
```

#### 设计要素

| 要素 | 说明 |
|------|------|
| Logo 图标 | Mobaus 品牌渐变圆形 SVG：圆形轮廓 + 中心波纹图案，使用 linearGradient 渐变填充，单一 path 元素绘制 |
| 渐变效果 | 五色线性渐变：金色(#F6C433) → 红色(#E90E55) → 橙色(#E44F32) → 紫色(#A188E3) → 蓝色(#0DB4EA) |
| 光晕效果 | 外层 absolute 定位的模糊光圈（violet→cyan），使用 animate-pulse 动画，深色模式下透明度降低 |
| 标题文字 | "Mobaus Studio" 使用渐变色（紫→蓝→青），text-xl 加粗，深色模式下使用更亮的渐变色 |
| 版本标签 | 小型渐变 badge 显示 "PRO"，圆角胶囊形状，深色模式下使用更深的渐变色 |
| 右侧按钮 | 暂时隐藏（通知、帮助、导出、用户菜单） |
| 窗口拖动 | 保持 data-tauri-drag-region 支持 |
| 深色模式 | 背景、边框、文字渐变色均适配深色主题 (v9.1.1) |

#### 配色方案

**浅色模式：**

| 元素 | 颜色 |
|------|------|
| 背景 | bg-white/80 (半透明白色) |
| 边框 | border-gray-200/60 |
| Logo 背景 | 无背景，纯 SVG 图形 |
| Logo 光晕 | from-violet-400 to-cyan-400 (opacity-25, blur-lg) |
| Logo 渐变 | #F6C433 → #E90E55 → #E44F32 → #A188E3 → #0DB4EA（线性渐变） |
| 标题文字 | from-violet-600 via-blue-600 to-cyan-500 |
| PRO 标签 | from-violet-500 to-blue-500 |

**深色模式：**

| 元素 | 颜色 |
|------|------|
| 背景 | bg-gray-900/80 (半透明深灰) |
| 边框 | border-gray-700/60 |
| Logo 光晕 | from-violet-400 to-cyan-400 (opacity-20, blur-lg) |
| 标题文字 | from-violet-400 via-blue-400 to-cyan-400 |
| PRO 标签 | from-violet-600 to-blue-600 |

### 接口定义（v2）

```typescript
interface HeaderProps {
    onNotifications: () => void;
    onExport: () => void;
    onImport: () => void;
    showUserMenu: boolean;
    setShowUserMenu: (show: boolean) => void;
    notificationCount?: number;
}
```

> 注意：Props 接口暂不修改，保持向后兼容。右侧按钮通过 CSS 隐藏。

### 测试用例

| 用例ID | 场景 | 输入 | 预期结果 |
|--------|------|------|----------|
| TC-HEADER-001 | 渲染 Mobaus 渐变圆形 Logo | 默认渲染 | SVG 包含 linearGradient（渐变定义）、path（圆形波纹图案），带光晕动画 |
| TC-HEADER-002 | 渲染渐变标题 | 默认渲染 | "Mobaus Studio" 显示渐变色 |
| TC-HEADER-003 | 渲染版本标签 | 默认渲染 | 显示 "PRO" 渐变标签 |
| TC-HEADER-004 | 右侧按钮隐藏 | 默认渲染 | 右侧功能按钮不可见 |
| TC-HEADER-005 | 窗口拖动支持 | 拖动顶栏 | data-tauri-drag-region 属性存在 |

---

## 📝 修改历史

| 日期 | 版本 | 修改内容 |
|------|------|---------|
| 2026-03-01 | 1.0.0 | 初始版本 - Header 组件文档 |
| 2026-03-01 | 2.0.0 | Header 重设计：动感光效品牌风格，隐藏右侧按钮 |
| 2026-03-01 | 2.1.0 | Logo 升级为 AI 神经元网络 SVG，替换 Sparkles 图标 |
| 2026-03-01 | 3.0.0 | Logo 改为无限流光风格（∞ 符号变体 + 渐变描边 + 交叉发光点） |
| 2026-03-01 | 4.0.0 | Logo 改为利爪能量核 OpenClaw 风格（3 条爪痕 + 中心能量球） |
| 2026-03-01 | 5.0.0 | Logo 改为几何狐狸风格（双色拼接脸 + 菱形眼 + 三角鼻） |
| 2026-03-01 | 6.0.0 | Logo 改为智慧猫头鹰风格（双色拼接 + V型眉 + 琥珀大圆眼 + 尖嘴） |
| 2026-03-01 | 7.0.0 | Logo 改为 AI 圆满机器猫风格（圆脸 + 尖耳 + 大圆眼 + 粉鼻 + ω嘴 + 胡须，左右双色拼接） |
| 2026-03-01 | 8.0.0 | Logo 改为圆滚滚熊猫宝宝可爱风格（超大圆脸 + 黑色大眼圈 + 小耳朵 + "3"型嘴 + 绿色竹叶） |
| 2026-03-01 | 8.1.0 | Logo 升级为立体版：添加径向渐变球体感、高光阴影层次、底部投影、粉色腮红 |
| 2026-03-11 | 9.0.0 | Logo 改为 Mobaus 品牌渐变圆形设计：五色线性渐变 + 圆形波纹图案 |
| 2026-03-13 | 9.1.0 | Logo 实现方式改为外部 SVG 文件引用（Mobaus1.svg），替换内联 SVG |
| 2026-03-13 | 9.1.1 | 添加深色模式支持：背景、边框、文字渐变色均适配深色主题 |
