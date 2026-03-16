# Stats 统计模块

## 📋 模块概述

Stats 模块提供应用使用情况的统计分析功能，包括消息数量、Token 使用量、费用估算、模型使用分布和最近活动记录。

| 属性 | 值 |
|------|------|
| 模块路径 | `src/components/features/Stats` |
| 工具函数 | `src/utils/statsUtils.ts` |
| 创建日期 | 2025-01-18 |
| 最后更新 | 2025-01-28 |

---

## 🎯 功能列表

### 核心功能

- [x] 时间范围选择（今日/本周/本月）
- [x] 消息数量统计
- [x] Token 使用统计
- [x] 费用统计
- [x] 模型使用分布
- [x] 最近活动列表
- [x] **真实数据计算** (v3.1.0)

### 扩展功能

- [ ] 导出 CSV 报告
- [ ] 导出 PDF 报告
- [ ] 技能使用统计

---

## 🏗️ 组件结构

```
Stats/
└── index.tsx              # StatsModal 组件

utils/
└── statsUtils.ts          # 统计计算工具函数 (v3.1.0)
```

---

## 📐 数据结构

### UsageStats 使用统计

```typescript
interface UsageStats {
    messages: number;   // 消息数量
    tokens: number;     // Token 使用量
    cost: number;       // 费用（美元）
}
```

### ModelUsage 模型使用分布

```typescript
interface ModelUsage {
    model: string;      // 模型名称
    usage: number;      // 使用占比 (0-100)
    color: string;      // 显示颜色 (Tailwind class)
}
```

### ActivityItem 活动记录

```typescript
interface ActivityItem {
    id: string;
    action: string;     // 操作描述
    details: string;    // 详情
    time: Date;         // 时间
    type: 'chat' | 'agent' | 'skill' | 'mcp';
}
```

### TimeRange 时间范围

```typescript
type TimeRange = 'today' | 'week' | 'month';
```

---

## 📐 API 接口

### 工具函数 (statsUtils.ts) - v3.1.0

#### `getTimeRangeStart(range: TimeRange): Date`
获取时间范围的起始时间点

**参数：**
- range: 时间范围类型

**返回：**
- Date 对象，表示该范围的起始时间

#### `calculateAllStats(chats, models): Record<TimeRange, UsageStats>`
计算所有时间范围的使用统计

**参数：**
- chats: Chat[] - 对话列表
- models: AIModelConfig[] - 模型配置列表

**返回：**
- 包含 today/week/month 三个时间范围统计的对象

#### `calculateModelUsage(chats, models, range): ModelUsage[]`
计算模型使用分布

**参数：**
- chats: Chat[] - 对话列表
- models: AIModelConfig[] - 模型配置列表
- range: TimeRange - 时间范围

**返回：**
- 模型使用分布数组，按使用量降序排列

#### `generateRecentActivity(chats, agents, limit?): ActivityItem[]`
生成最近活动记录

**参数：**
- chats: Chat[] - 对话列表
- agents: Agent[] - Agent 列表
- limit: number - 返回数量限制（默认 10）

**返回：**
- 最近活动记录数组，按时间降序排列

---

## 🧪 测试用例

| 用例ID | 场景 | 输入 | 预期结果 | 状态 |
|--------|------|------|----------|------|
| TC-STATS-001 | 空数据统计 | 无对话 | 显示全 0 | [x] |
| TC-STATS-002 | 今日统计 | 今日有消息 | 正确统计今日数据 | [x] |
| TC-STATS-003 | 本周统计 | 本周有消息 | 正确统计本周数据 | [x] |
| TC-STATS-004 | 本月统计 | 本月有消息 | 正确统计本月数据 | [x] |
| TC-STATS-005 | 模型分布 | 多模型使用 | 正确计算百分比 | [x] |
| TC-STATS-006 | 最近活动 | 有对话和 Agent | 按时间排序显示 | [x] |
| TC-STATS-007 | Token 统计 | 消息有 tokens 字段 | 正确累加 | [x] |
| TC-STATS-008 | 费用计算 | 有 pricing 配置 | 正确计算费用 | [x] |

### 测试文件

- `src/test/components/Stats/Stats.test.tsx`

---

## 📝 修改历史

| 日期 | 版本 | 修改人 | 修改内容 |
|------|------|--------|---------|
| 2025-01-18 | 1.0.0 | - | 初始版本（Mock 数据） |
| 2025-01-28 | 3.1.0 | - | 改为真实数据计算，新增 statsUtils.ts |
| 2025-01-28 | 3.1.1 | - | 修复流式响应 token 统计问题 |

---

## 🔧 实现细节 (v3.1.0)

### 时间范围计算

```typescript
const getTimeRangeStart = (range: TimeRange): Date => {
    const now = new Date();
    switch (range) {
        case 'today':
            // 今天 00:00:00
            return new Date(now.getFullYear(), now.getMonth(), now.getDate());
        case 'week':
            // 7 天前
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - 7);
            return weekStart;
        case 'month':
            // 30 天前
            const monthStart = new Date(now);
            monthStart.setDate(now.getDate() - 30);
            return monthStart;
    }
};
```

### 费用计算公式

```typescript
// 费用 = (输入 tokens × 输入价格 + 输出 tokens × 输出价格) / 1000
// 简化版：假设 user 消息为输入，assistant 消息为输出
const inputCost = inputTokens * (pricing.input / 1000);
const outputCost = outputTokens * (pricing.output / 1000);
const totalCost = inputCost + outputCost;
```

### 模型颜色分配

```typescript
const MODEL_COLORS = [
    'bg-green-500',   // 第一个模型
    'bg-purple-500',  // 第二个模型
    'bg-blue-500',    // 第三个模型
    'bg-orange-500',  // 第四个模型
    'bg-pink-500',    // 第五个模型
    'bg-cyan-500',    // 更多...
];
```

---

## ⚠️ 注意事项

1. **Token 字段可选**: `Message.tokens` 是可选字段，未设置时按 0 计算
2. **Pricing 默认为 0**: 模型的 `pricing` 默认为 `{ input: 0, output: 0 }`，费用可能显示为 0
3. **性能优化**: 使用 `useMemo` 缓存计算结果，避免每次渲染重新计算
4. **日期处理**: 从存储加载的日期可能是字符串，需要转换为 Date 对象
