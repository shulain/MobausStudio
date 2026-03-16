/**
 * 内置技能数据
 *
 * 内置技能特点：
 * - builtIn: true（不可编辑/删除）
 * - 从代码加载，不持久化到存储
 */

import type { Skill } from '../types';

/**
 * 代码审查技能
 */
export const codeReviewSkill: Skill = {
    id: 'builtin-code-review',
    name: { zh: '代码审查', en: 'Code Review' },
    description: { zh: '专业的代码审查能力，检查代码质量、安全性和最佳实践', en: 'Professional code review capability, checking code quality, security and best practices' },
    category: 'coding',
    icon: 'code',
    color: 'purple',
    enabled: true,
    builtIn: true,
    version: '1.0.0',
    author: 'MobausStudio',

    promptTemplate: `当用户请求代码审查时，请按以下流程进行：

## 审查维度

### 🔴 P0 - 必须修复
- 安全漏洞（SQL注入、XSS、敏感信息泄露）
- 数据丢失风险
- 逻辑错误导致功能失效

### 🟠 P1 - 应该修复
- 性能问题（N+1查询、内存泄漏）
- 错误处理不完整
- 边界条件未处理

### 🟡 P2 - 建议修复
- 代码重复
- 命名不清晰
- 缺少注释

## 重点关注: {{focusArea}}

## 输出格式

请按以下格式输出审查结果：

## 代码审查报告

### 📋 概要
- 审查结论: ✅ 可合并 / ⚠️ 需修改 / ❌ 需重构

### 🔍 发现的问题
（按优先级列出问题）

### 💡 改进建议
（可选的优化建议）

### ✅ 亮点
（代码中做得好的地方）`,

    outputFormat: 'markdown',

    triggers: [
        { type: 'keyword', pattern: '审查', priority: 10 },
        { type: 'keyword', pattern: 'review', priority: 10 },
        { type: 'keyword', pattern: '代码检查', priority: 8 },
        { type: 'regex', pattern: '帮我.*(看看|检查).*(代码|code)', priority: 5 },
    ],

    variables: [
        {
            name: 'focusArea',
            label: '重点关注',
            type: 'select',
            defaultValue: '全部',
            options: ['全部', '安全性', '性能', '可维护性'],
            description: '审查时重点关注的方面',
        },
        {
            name: 'strictMode',
            label: '严格模式',
            type: 'boolean',
            defaultValue: false,
            description: '启用后会检查更多细节问题',
        },
    ],

    createdAt: new Date('2026-01-18'),
    updatedAt: new Date('2026-01-21'),
};

/**
 * 翻译专家技能
 */
export const translationSkill: Skill = {
    id: 'builtin-translation',
    name: { zh: '翻译专家', en: 'Translation Expert' },
    description: { zh: '专业的多语言翻译能力，支持信达雅三原则', en: 'Professional multilingual translation capability, following faithfulness, expressiveness and elegance principles' },
    category: 'translation',
    icon: 'languages',
    color: 'blue',
    enabled: true,
    builtIn: true,
    version: '1.0.0',
    author: 'MobausStudio',

    promptTemplate: `当用户请求翻译时，请遵循以下原则：

## 翻译原则（信达雅）

1. **信（准确）**: 忠实原文含义，不增不减
2. **达（通顺）**: 符合目标语言表达习惯
3. **雅（优美）**: 用词考究，文笔流畅

## 翻译风格: {{style}}
## 目标语言: {{targetLang}}

## 输出格式

【原文】
{原文内容}

【译文】
{翻译结果}

【注释】（如有必要）
- 专有名词说明
- 文化背景解释

## 注意事项

- 保留原文格式（代码、列表等）
- 专业术语需要准确
- 如有多义词，优先选择上下文最合适的含义`,

    outputFormat: 'markdown',

    triggers: [
        { type: 'keyword', pattern: '翻译', priority: 10 },
        { type: 'keyword', pattern: 'translate', priority: 10 },
        { type: 'regex', pattern: '(译成|翻成|转成).*(中文|英文|日文)', priority: 8 },
    ],

    variables: [
        {
            name: 'style',
            label: '翻译风格',
            type: 'select',
            defaultValue: '正式',
            options: ['正式', '口语化', '文学性', '技术文档'],
            description: '翻译的语言风格',
        },
        {
            name: 'targetLang',
            label: '目标语言',
            type: 'select',
            defaultValue: '中文',
            options: ['中文', '英文', '日文', '韩文'],
            description: '翻译的目标语言',
        },
    ],

    createdAt: new Date('2026-01-18'),
    updatedAt: new Date('2026-01-21'),
};

/**
 * 写作助手技能
 */
export const writingSkill: Skill = {
    id: 'builtin-writing',
    name: { zh: '写作助手', en: 'Writing Assistant' },
    description: { zh: '专业的写作辅助能力，支持文章润色、扩写、改写', en: 'Professional writing assistance, supporting article polishing, expansion and rewriting' },
    category: 'writing',
    icon: 'pen-line',
    color: 'green',
    enabled: true,
    builtIn: true,
    version: '1.0.0',
    author: 'MobausStudio',

    promptTemplate: `当用户请求写作帮助时，请按以下方式处理：

## 写作类型: {{writingType}}

## 写作原则

1. **结构清晰**: 开头引入、主体展开、结尾总结
2. **逻辑连贯**: 段落间过渡自然
3. **语言得体**: 符合场景和读者需求

## 润色要求

- 消除冗余表达
- 增强语句表现力
- 保持原意不变
- 适当使用修辞手法

## 输出格式

根据用户需求，提供：
1. 修改后的完整文本
2. 主要修改点说明（如适用）`,

    outputFormat: 'markdown',

    triggers: [
        { type: 'keyword', pattern: '润色', priority: 10 },
        { type: 'keyword', pattern: '改写', priority: 10 },
        { type: 'keyword', pattern: '写作', priority: 8 },
        { type: 'regex', pattern: '帮我.*(写|改).*(文章|文案|邮件)', priority: 5 },
    ],

    variables: [
        {
            name: 'writingType',
            label: '写作类型',
            type: 'select',
            defaultValue: '通用',
            options: ['通用', '商务邮件', '技术文档', '营销文案', '学术论文'],
            description: '写作的类型和场景',
        },
    ],

    createdAt: new Date('2026-01-18'),
    updatedAt: new Date('2026-01-21'),
};

/**
 * 所有内置技能列表
 */
export const builtinSkills: Skill[] = [
    codeReviewSkill,
    translationSkill,
    writingSkill,
];

/**
 * 获取所有内置技能
 */
export function getBuiltinSkills(): Skill[] {
    return builtinSkills.map((skill) => ({
        ...skill,
        // 确保日期是新的实例
        createdAt: new Date(skill.createdAt),
        updatedAt: new Date(skill.updatedAt),
    }));
}

/**
 * 根据 ID 获取内置技能
 */
export function getBuiltinSkillById(id: string): Skill | undefined {
    const skill = builtinSkills.find((s) => s.id === id);
    if (skill) {
        return {
            ...skill,
            createdAt: new Date(skill.createdAt),
            updatedAt: new Date(skill.updatedAt),
        };
    }
    return undefined;
}
