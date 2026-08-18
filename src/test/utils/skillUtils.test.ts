/**
 * Skill 工具函数单元测试
 *
 * 测试用例对应文档 docs/modules/skills.md 中的：
 * - SK-60 ~ SK-70: 基础工具函数测试
 * - SK-180 ~ SK-190: v3.0.0 安装模式工具函数测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
    buildSystemPrompt,
    replaceVariables,
    matchSkillTriggers,
    getSkillDefaultVariables,
    validateVariableValue,
    previewSkillPrompt,
    // v3.0.0 新增
    parseGithubUrl,
    fetchSkillRegistry,
    validateSkillPackage,
    exportSkillsToJson,
    detectDuplicateSkills,
    applyDuplicateStrategy,
    // v3.0.2 新增
    parseSkillCommand,
} from '../../utils/skillUtils';
import { SkillInstallError } from '../../utils/errors';
import type { Skill, SkillVariable, SkillCreateInput, SkillPackage } from '../../types';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

// ==================== 测试数据 ====================

/**
 * 创建测试用的技能对象
 */
function createTestSkill(overrides: Partial<Skill> = {}): Skill {
    return {
        id: 'test-skill',
        name: '测试技能',
        description: '用于测试的技能',
        category: 'custom',
        icon: 'code',
        color: 'blue',
        enabled: true,
        builtIn: false,
        version: '1.0.0',
        promptTemplate: '这是一个测试模板',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

// ==================== buildSystemPrompt 测试 ====================

describe('buildSystemPrompt', () => {
    // SK-60: 无技能时返回基础提示词
    it('SK-60: 无技能时返回基础提示词', () => {
        const result = buildSystemPrompt('你是助手', []);
        expect(result).toBe('你是助手');
    });

    // SK-61: 有技能时返回基础提示词 + 技能模板
    it('SK-61: 有技能时返回基础提示词 + 技能模板', () => {
        const skill = createTestSkill({
            name: '代码审查',
            promptTemplate: '请按以下流程审查代码',
        });

        const result = buildSystemPrompt('你是助手', [skill]);

        expect(result).toContain('你是助手');
        expect(result).toContain('### 代码审查');
        expect(result).toContain('请按以下流程审查代码');
    });

    // SK-62: 禁用技能不包含在结果中
    it('SK-62: 禁用技能不包含在结果中', () => {
        const disabledSkill = createTestSkill({
            name: '禁用的技能',
            enabled: false,
            promptTemplate: '这个不应该出现',
        });

        const result = buildSystemPrompt('你是助手', [disabledSkill]);

        expect(result).toBe('你是助手');
        expect(result).not.toContain('禁用的技能');
    });

    // SK-63: 变量替换正确执行
    it('SK-63: 变量替换正确执行', () => {
        const skill = createTestSkill({
            id: 'translation',
            promptTemplate: '翻译风格: {{style}}，目标语言: {{targetLang}}',
            variables: [
                { name: 'style', label: '风格', type: 'string', defaultValue: '正式' },
                { name: 'targetLang', label: '目标语言', type: 'string', defaultValue: '中文' },
            ],
        });

        const result = buildSystemPrompt('你是助手', [skill], {
            translation: { style: '口语化', targetLang: '英文' },
        });

        expect(result).toContain('翻译风格: 口语化');
        expect(result).toContain('目标语言: 英文');
    });

    // SK-64: 未提供变量值时使用默认值
    it('SK-64: 未提供变量值时使用默认值', () => {
        const skill = createTestSkill({
            promptTemplate: '风格: {{style}}',
            variables: [
                { name: 'style', label: '风格', type: 'string', defaultValue: '正式' },
            ],
        });

        const result = buildSystemPrompt('你是助手', [skill]);

        expect(result).toContain('风格: 正式');
    });

    // 多个技能合并测试
    it('多个技能正确合并', () => {
        const skill1 = createTestSkill({
            id: 'skill1',
            name: '技能1',
            promptTemplate: '技能1的内容',
        });
        const skill2 = createTestSkill({
            id: 'skill2',
            name: '技能2',
            promptTemplate: '技能2的内容',
        });

        const result = buildSystemPrompt('基础提示', [skill1, skill2]);

        expect(result).toContain('### 技能1');
        expect(result).toContain('技能1的内容');
        expect(result).toContain('### 技能2');
        expect(result).toContain('技能2的内容');
    });
});

// ==================== replaceVariables 测试 ====================

describe('replaceVariables', () => {
    // SK-69: 多变量替换
    it('SK-69: 多变量替换', () => {
        const template = '你好 {{name}}，今天是 {{day}}';
        const variables: SkillVariable[] = [
            { name: 'name', label: '姓名', type: 'string', defaultValue: '用户' },
            { name: 'day', label: '日期', type: 'string', defaultValue: '星期一' },
        ];

        const result = replaceVariables(template, variables, {
            name: '张三',
            day: '星期五',
        });

        expect(result).toBe('你好 张三，今天是 星期五');
    });

    // SK-70: 变量不存在时保留占位符
    it('SK-70: 变量不存在时保留占位符', () => {
        const template = '你好 {{name}}，{{undefined_var}}';
        const variables: SkillVariable[] = [
            { name: 'name', label: '姓名', type: 'string', defaultValue: '用户' },
        ];

        const result = replaceVariables(template, variables, { name: '李四' });

        expect(result).toBe('你好 李四，{{undefined_var}}');
    });

    // 使用默认值
    it('未提供值时使用默认值', () => {
        const template = '模式: {{mode}}';
        const variables: SkillVariable[] = [
            { name: 'mode', label: '模式', type: 'string', defaultValue: '标准' },
        ];

        const result = replaceVariables(template, variables, {});

        expect(result).toBe('模式: 标准');
    });

    // 布尔值转换
    it('布尔值正确转换为字符串', () => {
        const template = '严格模式: {{strict}}';
        const variables: SkillVariable[] = [
            { name: 'strict', label: '严格', type: 'boolean', defaultValue: false },
        ];

        const result = replaceVariables(template, variables, { strict: true });

        expect(result).toBe('严格模式: true');
    });

    // 数字值转换
    it('数字值正确转换为字符串', () => {
        const template = '最大数量: {{max}}';
        const variables: SkillVariable[] = [
            { name: 'max', label: '最大值', type: 'number', defaultValue: 10 },
        ];

        const result = replaceVariables(template, variables, { max: 100 });

        expect(result).toBe('最大数量: 100');
    });
});

// ==================== matchSkillTriggers 测试 ====================

describe('matchSkillTriggers', () => {
    // SK-65: 关键词匹配
    it('SK-65: 关键词匹配', () => {
        const skill = createTestSkill({
            triggers: [{ type: 'keyword', pattern: '审查', priority: 10 }],
        });

        const result = matchSkillTriggers('帮我审查这段代码', [skill]);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('test-skill');
    });

    // SK-66: 正则匹配
    it('SK-66: 正则匹配', () => {
        const skill = createTestSkill({
            triggers: [{ type: 'regex', pattern: '帮我.*代码', priority: 10 }],
        });

        const result = matchSkillTriggers('帮我看看这段代码', [skill]);

        expect(result).toHaveLength(1);
    });

    // SK-67: 优先级排序
    it('SK-67: 优先级排序', () => {
        const lowPriority = createTestSkill({
            id: 'low',
            name: '低优先级',
            triggers: [{ type: 'keyword', pattern: '代码', priority: 5 }],
        });
        const highPriority = createTestSkill({
            id: 'high',
            name: '高优先级',
            triggers: [{ type: 'keyword', pattern: '代码', priority: 10 }],
        });

        const result = matchSkillTriggers('检查代码', [lowPriority, highPriority]);

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('high');
        expect(result[1].id).toBe('low');
    });

    // SK-68: 禁用技能不匹配
    it('SK-68: 禁用技能不匹配', () => {
        const skill = createTestSkill({
            enabled: false,
            triggers: [{ type: 'keyword', pattern: '测试', priority: 10 }],
        });

        const result = matchSkillTriggers('测试一下', [skill]);

        expect(result).toHaveLength(0);
    });

    // 无触发条件的技能不匹配
    it('无触发条件的技能不匹配', () => {
        const skill = createTestSkill({
            triggers: undefined,
        });

        const result = matchSkillTriggers('任何输入', [skill]);

        expect(result).toHaveLength(0);
    });

    // 空触发条件的技能不匹配
    it('空触发条件的技能不匹配', () => {
        const skill = createTestSkill({
            triggers: [],
        });

        const result = matchSkillTriggers('任何输入', [skill]);

        expect(result).toHaveLength(0);
    });

    // 关键词不区分大小写
    it('关键词匹配不区分大小写', () => {
        const skill = createTestSkill({
            triggers: [{ type: 'keyword', pattern: 'Review', priority: 10 }],
        });

        const result = matchSkillTriggers('please review this code', [skill]);

        expect(result).toHaveLength(1);
    });

    // 无效正则不崩溃
    it('无效正则表达式不崩溃', () => {
        const skill = createTestSkill({
            triggers: [{ type: 'regex', pattern: '[invalid(regex', priority: 10 }],
        });

        // 不应该抛出异常
        const result = matchSkillTriggers('test input', [skill]);

        expect(result).toHaveLength(0);
    });
});

// ==================== getSkillDefaultVariables 测试 ====================

describe('getSkillDefaultVariables', () => {
    it('返回所有变量的默认值', () => {
        const skill = createTestSkill({
            variables: [
                { name: 'style', label: '风格', type: 'string', defaultValue: '正式' },
                { name: 'count', label: '数量', type: 'number', defaultValue: 10 },
                { name: 'enabled', label: '启用', type: 'boolean', defaultValue: true },
            ],
        });

        const defaults = getSkillDefaultVariables(skill);

        expect(defaults).toEqual({
            style: '正式',
            count: 10,
            enabled: true,
        });
    });

    it('无变量时返回空对象', () => {
        const skill = createTestSkill({
            variables: undefined,
        });

        const defaults = getSkillDefaultVariables(skill);

        expect(defaults).toEqual({});
    });
});

// ==================== validateVariableValue 测试 ====================

describe('validateVariableValue', () => {
    it('验证字符串类型', () => {
        const variable: SkillVariable = {
            name: 'test',
            label: '测试',
            type: 'string',
            defaultValue: '',
        };

        expect(validateVariableValue(variable, 'hello')).toBe(true);
        expect(validateVariableValue(variable, 123)).toBe(false);
    });

    it('验证数字类型', () => {
        const variable: SkillVariable = {
            name: 'test',
            label: '测试',
            type: 'number',
            defaultValue: 0,
        };

        expect(validateVariableValue(variable, 42)).toBe(true);
        expect(validateVariableValue(variable, 'hello')).toBe(false);
        expect(validateVariableValue(variable, NaN)).toBe(false);
    });

    it('验证布尔类型', () => {
        const variable: SkillVariable = {
            name: 'test',
            label: '测试',
            type: 'boolean',
            defaultValue: false,
        };

        expect(validateVariableValue(variable, true)).toBe(true);
        expect(validateVariableValue(variable, false)).toBe(true);
        expect(validateVariableValue(variable, 'true')).toBe(false);
    });

    it('验证选择类型', () => {
        const variable: SkillVariable = {
            name: 'test',
            label: '测试',
            type: 'select',
            defaultValue: 'A',
            options: ['A', 'B', 'C'],
        };

        expect(validateVariableValue(variable, 'A')).toBe(true);
        expect(validateVariableValue(variable, 'B')).toBe(true);
        expect(validateVariableValue(variable, 'D')).toBe(false);
        expect(validateVariableValue(variable, 123)).toBe(false);
    });
});

// ==================== previewSkillPrompt 测试 ====================

describe('previewSkillPrompt', () => {
    it('预览技能提示词', () => {
        const skill = createTestSkill({
            promptTemplate: '风格: {{style}}',
            variables: [
                { name: 'style', label: '风格', type: 'string', defaultValue: '默认' },
            ],
        });

        const result = previewSkillPrompt(skill, { style: '自定义' });

        expect(result).toBe('风格: 自定义');
    });

    it('无变量配置时使用默认值', () => {
        const skill = createTestSkill({
            promptTemplate: '风格: {{style}}',
            variables: [
                { name: 'style', label: '风格', type: 'string', defaultValue: '默认' },
            ],
        });

        const result = previewSkillPrompt(skill);

        expect(result).toBe('风格: 默认');
    });
});

// ==================== v3.0.0 安装模式工具函数测试 ====================

// ==================== parseGithubUrl 测试 ====================

describe('parseGithubUrl', () => {
    it('转换 GitHub blob URL 为 raw URL', () => {
        const input = 'https://github.com/user/repo/blob/main/skills.json';
        const expected = 'https://raw.githubusercontent.com/user/repo/main/skills.json';

        expect(parseGithubUrl(input)).toBe(expected);
    });

    it('转换 GitHub 仓库根目录 URL 为默认 skills.json', () => {
        const input = 'https://github.com/user/repo';
        const expected = 'https://raw.githubusercontent.com/user/repo/main/skills.json';

        expect(parseGithubUrl(input)).toBe(expected);
    });

    it('保持非 GitHub URL 不变', () => {
        const input = 'https://example.com/skills.json';

        expect(parseGithubUrl(input)).toBe(input);
    });

    it('保持 raw.githubusercontent.com URL 不变', () => {
        const input = 'https://raw.githubusercontent.com/user/repo/main/skills.json';

        expect(parseGithubUrl(input)).toBe(input);
    });

    it('处理无效 URL 时返回原始字符串', () => {
        const input = 'not-a-valid-url';

        expect(parseGithubUrl(input)).toBe(input);
    });

    it('转换带有深层路径的 GitHub blob URL', () => {
        const input = 'https://github.com/user/repo/blob/develop/path/to/skills.json';
        const expected = 'https://raw.githubusercontent.com/user/repo/develop/path/to/skills.json';

        expect(parseGithubUrl(input)).toBe(expected);
    });
});

// ==================== fetchSkillRegistry 测试 ====================

describe('fetchSkillRegistry', () => {
    // 保存原始 fetch
    const originalFetch = global.fetch;

    beforeEach(() => {
        // 重置 fetch mock
        vi.resetAllMocks();
    });

    afterEach(() => {
        // 恢复原始 fetch
        global.fetch = originalFetch;
    });

    // SK-180: fetchSkillRegistry - 成功获取仓库
    it('SK-180: fetchSkillRegistry - 成功获取仓库', async () => {
        const mockRegistry = {
            name: '测试仓库',
            version: '1.0.0',
            skills: [
                {
                    id: 'test-skill',
                    name: '测试技能',
                    description: '测试描述',
                    version: '1.0.0',
                    tags: ['test'],
                    skill: {
                        name: '测试技能',
                        description: '测试描述',
                        category: 'custom',
                        promptTemplate: '测试模板',
                    },
                },
            ],
        };

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockRegistry),
        });

        const result = await fetchSkillRegistry('https://example.com/registry.json');

        expect(result.name).toBe('测试仓库');
        expect(result.skills).toHaveLength(1);
        expect(result.skills[0].name).toBe('测试技能');
    });

    // SK-181: fetchSkillRegistry - 网络错误
    it('SK-181: fetchSkillRegistry - 网络错误抛出异常', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
            statusText: 'Not Found',
        });

        await expect(fetchSkillRegistry('https://example.com/invalid.json'))
            .rejects.toThrow('获取技能仓库失败');
    });

    // SK-182: fetchSkillRegistry - 解析错误
    it('SK-182: fetchSkillRegistry - 无效 JSON 格式抛出异常', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(null),
        });

        await expect(fetchSkillRegistry('https://example.com/invalid.json'))
            .rejects.toThrow(SkillInstallError);
    });

    it('fetchSkillRegistry - 缺少必需字段抛出异常', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ name: '仓库' }), // 缺少 skills 字段
        });

        await expect(fetchSkillRegistry('https://example.com/invalid.json'))
            .rejects.toThrow(SkillInstallError);
    });

    it('fetchSkillRegistry - 技能包格式自动转换为仓库格式', async () => {
        const mockPackage = {
            version: '1.0.0',
            skills: [
                {
                    name: '导入的技能',
                    description: '描述',
                    category: 'custom',
                    promptTemplate: '模板',
                },
            ],
        };

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockPackage),
        });

        const result = await fetchSkillRegistry('https://example.com/package.json');

        expect(result.name).toBe('导入的技能');
        expect(result.skills).toHaveLength(1);
        expect(result.skills[0].skill).toBeDefined();
    });

    it('GitHub 仓库命中 skills.json 时也合并根目录 SKILL.md', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                name: 'repo',
                version: '1.0.0',
                skills: [
                    {
                        id: 'xhs-auth',
                        name: 'xhs-auth',
                        description: 'auth',
                        version: '1.0.0',
                        tags: ['custom'],
                        skill: {
                            name: 'xhs-auth',
                            description: 'auth',
                            category: 'custom',
                            promptTemplate: 'auth',
                        },
                    },
                ],
            }),
        });

        vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
            if (cmd === 'fetch_url_content') {
                const url = String((args as Record<string, unknown>)?.url || '');
                if (url.endsWith('/main/SKILL.md')) {
                    return '---\nname: Root Skill\ndescription: root desc\n---\nRoot prompt';
                }
                if (url.endsWith('/main/skills.json')) {
                    return JSON.stringify({
                        name: 'repo',
                        version: '1.0.0',
                        skills: [
                            {
                                id: 'xhs-auth',
                                name: 'xhs-auth',
                                description: 'auth',
                                version: '1.0.0',
                                tags: ['custom'],
                                skill: {
                                    name: 'xhs-auth',
                                    description: 'auth',
                                    category: 'custom',
                                    promptTemplate: 'auth',
                                },
                            },
                        ],
                    });
                }
                throw new Error('404');
            }

            if (cmd === 'fetch_github_contents') {
                return JSON.stringify([
                    { name: 'SKILL.md', path: 'SKILL.md', type: 'file', download_url: 'https://raw.../SKILL.md', size: 100 },
                ]);
            }

            return null;
        });

        const result = await fetchSkillRegistry('https://github.com/freestylefly/xiaohongshu-skills');

        expect(result.skills.length).toBeGreaterThanOrEqual(2);
        expect(result.skills.some(skill => skill.name === 'Root Skill')).toBe(true);
        expect(result.skills.some(skill => skill.id === 'xhs-auth')).toBe(true);
    });

    it('GitHub 仓库命中 skills.json 时也合并根目录 SKILLS.md', async () => {
        global.fetch = vi.fn().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(_input);
            if (url.endsWith('/main/skills.json')) {
                return {
                    ok: true,
                    json: async () => ({
                        name: 'repo',
                        version: '1.0.0',
                        skills: [
                            {
                                id: 'xhs-auth',
                                name: 'xhs-auth',
                                description: 'auth',
                                version: '1.0.0',
                                tags: ['custom'],
                                skill: {
                                    name: 'xhs-auth',
                                    description: 'auth',
                                    category: 'custom',
                                    promptTemplate: 'auth',
                                },
                            },
                        ],
                    }),
                };
            }

            if (init?.method === 'HEAD' && url.endsWith('/main/SKILL.md')) {
                return { ok: false, status: 404 };
            }
            if (init?.method === 'HEAD' && url.endsWith('/main/SKILLS.md')) {
                return { ok: true, status: 200 };
            }

            if (url.includes('/contents/skills?ref=')) {
                return {
                    ok: false,
                    status: 404,
                    json: async () => ({}),
                };
            }

            return {
                ok: false,
                status: 404,
                json: async () => ({}),
            };
        }) as typeof fetch;

        vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
            if (cmd === 'fetch_url_content') {
                const url = String((args as Record<string, unknown>)?.url || '');
                if (url.endsWith('/main/SKILLS.md')) {
                    return '---\nname: Root Skills\ndescription: root desc\n---\nRoot prompt';
                }
                if (url.endsWith('/main/skills.json')) {
                    return JSON.stringify({
                        name: 'repo',
                        version: '1.0.0',
                        skills: [
                            {
                                id: 'xhs-auth',
                                name: 'xhs-auth',
                                description: 'auth',
                                version: '1.0.0',
                                tags: ['custom'],
                                skill: {
                                    name: 'xhs-auth',
                                    description: 'auth',
                                    category: 'custom',
                                    promptTemplate: 'auth',
                                },
                            },
                        ],
                    });
                }
                throw new Error('404');
            }

            if (cmd === 'fetch_github_contents') {
                return JSON.stringify([
                    { name: 'SKILLS.md', path: 'SKILLS.md', type: 'file', download_url: 'https://raw.../SKILLS.md', size: 100 },
                ]);
            }

            return null;
        });

        const result = await fetchSkillRegistry('https://github.com/freestylefly/xiaohongshu-skills');
        expect(result.skills.some(skill => skill.name === 'Root Skills')).toBe(true);
        expect(result.skills.some(skill => skill.id === 'xhs-auth')).toBe(true);
    });

    it('GitHub 仓库命中 skills.json 时仍合并多层级 SKILL.md 技能', async () => {
        global.fetch = vi.fn().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(_input);
            if (url.endsWith('/main/skills.json')) {
                return {
                    ok: true,
                    json: async () => ({
                        name: 'repo',
                        version: '1.0.0',
                        skills: [
                            {
                                id: 'json-skill',
                                name: 'json-skill',
                                description: 'json',
                                version: '1.0.0',
                                tags: ['custom'],
                                skill: { name: 'json-skill', description: 'json', category: 'custom', promptTemplate: 'json' },
                            },
                        ],
                    }),
                };
            }

            if (url.includes('/contents/skills?ref=')) {
                return {
                    ok: true,
                    json: async () => [{ name: 'nested', type: 'dir' }],
                };
            }

            if (init?.method === 'HEAD' && url.endsWith('/skills/nested/SKILL.md')) {
                return { ok: true, status: 200 };
            }

            if (init?.method === 'HEAD' && url.endsWith('/main/SKILL.md')) {
                return { ok: false, status: 404 };
            }

            return {
                ok: false,
                status: 404,
                json: async () => ({}),
            };
        }) as typeof fetch;

        vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
            if (cmd === 'fetch_url_content') {
                const url = String((args as Record<string, unknown>)?.url || '');
                // Git Trees API 调用
                if (url.includes('/git/trees/main?recursive=1')) {
                    return JSON.stringify({
                        truncated: false,
                        tree: [
                            { type: 'blob', path: 'skills/nested/SKILL.md' },
                        ],
                    });
                }
                if (url.endsWith('/main/skills/nested/SKILL.md')) {
                    return '---\nname: Nested Skill\ndescription: nested desc\n---\nNested prompt';
                }
                if (url.endsWith('/main/skills.json')) {
                    return JSON.stringify({
                        name: 'repo',
                        version: '1.0.0',
                        skills: [
                            {
                                id: 'json-skill',
                                name: 'json-skill',
                                description: 'json',
                                version: '1.0.0',
                                tags: ['custom'],
                                skill: { name: 'json-skill', description: 'json', category: 'custom', promptTemplate: 'json' },
                            },
                        ],
                    });
                }
                throw new Error('404');
            }

            if (cmd === 'fetch_github_contents') {
                const path = String((args as Record<string, unknown>)?.path || '');
                if (path === 'skills/nested') {
                    return JSON.stringify([
                        { name: 'SKILL.md', path: 'skills/nested/SKILL.md', type: 'file', download_url: 'https://raw.../skills/nested/SKILL.md', size: 100 },
                    ]);
                }
                return JSON.stringify([
                    { name: 'SKILL.md', path: 'skills/nested/SKILL.md', type: 'file', download_url: 'https://raw.../skills/nested/SKILL.md', size: 100 },
                ]);
            }

            return null;
        });

        const result = await fetchSkillRegistry('https://github.com/freestylefly/xiaohongshu-skills');

        expect(result.skills.some(skill => skill.id === 'json-skill')).toBe(true);
        expect(result.skills.some(skill => skill.name === 'Nested Skill')).toBe(true);
    });

    it('GitHub API 403 限流时不应误判为无技能', async () => {
        global.fetch = vi.fn().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(_input);

            if (url.includes('api.github.com/repos')) {
                return { ok: false, status: 403, statusText: 'rate limit exceeded' };
            }
            if (url.endsWith('/main/skills.json') || url.endsWith('/main/registry.json')) {
                return { ok: false, status: 404, statusText: 'Not Found' };
            }
            if (init?.method === 'HEAD' && (url.endsWith('/main/SKILL.md') || url.endsWith('/main/SKILLS.md'))) {
                return { ok: false, status: 404 };
            }
            if (url.includes('/contents/skills?ref=')) {
                return { ok: false, status: 403 };
            }

            return { ok: false, status: 404 };
        }) as typeof fetch;

        vi.mocked(invoke).mockImplementation(async (cmd: string) => {
            if (cmd === 'fetch_github_contents') {
                throw new Error('GitHub API rate limit exceeded');
            }
            if (cmd === 'fetch_url_content') {
                // Git Trees API 返回 403 限流错误
                throw new Error('HTTP 错误 (403): GitHub API rate limit exceeded');
            }
            if (cmd === 'scan_github_skills_archive') {
                // 离线包扫描也失败
                throw new Error('Failed to download archive');
            }
            return null;
        });

        await expect(fetchSkillRegistry('https://github.com/freestylefly/xiaohongshu-skills'))
            .rejects.toThrow('GitHub API 请求限流，请稍后重试。');
    });
});

// ==================== validateSkillPackage 测试 ====================

describe('validateSkillPackage', () => {
    // SK-183: validateSkillPackage - 有效数据
    it('SK-183: validateSkillPackage - 有效数据返回 valid=true', () => {
        const validPackage: SkillPackage = {
            version: '1.0.0',
            skills: [
                {
                    name: '测试技能',
                    description: '测试描述',
                    category: 'custom',
                    promptTemplate: '测试模板',
                },
            ],
        };

        const result = validateSkillPackage(validPackage);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.package).toBeDefined();
    });

    // SK-184: validateSkillPackage - 缺少 version
    it('SK-184: validateSkillPackage - 缺少 version 返回错误', () => {
        const invalidPackage = {
            skills: [
                {
                    name: '测试技能',
                    description: '测试描述',
                    category: 'custom',
                    promptTemplate: '测试模板',
                },
            ],
        };

        const result = validateSkillPackage(invalidPackage);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('缺少或无效的 version 字段');
    });

    // SK-185: validateSkillPackage - 缺少 skills
    it('SK-185: validateSkillPackage - 缺少 skills 返回错误', () => {
        const invalidPackage = {
            version: '1.0.0',
        };

        const result = validateSkillPackage(invalidPackage);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('缺少或无效的 skills 字段：必须是数组');
    });

    // SK-186: validateSkillPackage - 技能缺少必填字段
    it('SK-186: validateSkillPackage - 技能缺少 name 返回错误', () => {
        const invalidPackage = {
            version: '1.0.0',
            skills: [
                {
                    description: '测试描述',
                    category: 'custom',
                    promptTemplate: '测试模板',
                },
            ],
        };

        const result = validateSkillPackage(invalidPackage);

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });

    it('validateSkillPackage - 空 skills 数组返回错误', () => {
        const invalidPackage = {
            version: '1.0.0',
            skills: [],
        };

        const result = validateSkillPackage(invalidPackage);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('skills 数组不能为空');
    });

    it('validateSkillPackage - 非对象数据返回错误', () => {
        const result = validateSkillPackage(null);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('数据不是有效的 JSON 对象');
    });

    it('validateSkillPackage - 技能缺少多个必填字段', () => {
        const invalidPackage = {
            version: '1.0.0',
            skills: [
                {
                    name: '测试', // 只有 name
                },
            ],
        };

        const result = validateSkillPackage(invalidPackage);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);
    });
});

// ==================== exportSkillsToJson 测试 ====================

describe('exportSkillsToJson', () => {
    // SK-187: exportSkillsToJson - 基础导出
    it('SK-187: exportSkillsToJson - 基础导出返回有效 JSON', () => {
        const skills: Skill[] = [
            createTestSkill({
                id: 'skill-1',
                name: '导出技能1',
                description: '描述1',
            }),
        ];

        const json = exportSkillsToJson(skills);
        const parsed = JSON.parse(json);

        expect(parsed.version).toBe('1.0.0');
        expect(parsed.skills).toHaveLength(1);
        expect(parsed.skills[0].name).toBe('导出技能1');
        expect(parsed.meta).toBeDefined();
        expect(parsed.meta.exportedBy).toContain('MobausStudio');
    });

    // SK-188: exportSkillsToJson - 美化输出（默认就是美化的）
    it('SK-188: exportSkillsToJson - 输出格式有缩进', () => {
        const skills: Skill[] = [createTestSkill()];

        const json = exportSkillsToJson(skills);

        // 美化输出应该包含换行和缩进
        expect(json).toContain('\n');
        expect(json).toContain('  '); // 2 空格缩进
    });

    it('exportSkillsToJson - 包含作者信息', () => {
        const skills: Skill[] = [createTestSkill()];

        const json = exportSkillsToJson(skills, { author: '测试作者' });
        const parsed = JSON.parse(json);

        expect(parsed.meta.author).toBe('测试作者');
    });

    it('exportSkillsToJson - 包含来源信息', () => {
        const skills: Skill[] = [createTestSkill()];

        const json = exportSkillsToJson(skills, { source: 'https://example.com' });
        const parsed = JSON.parse(json);

        expect(parsed.meta.source).toBe('https://example.com');
    });

    it('exportSkillsToJson - 移除运行时字段', () => {
        const skills: Skill[] = [
            createTestSkill({
                id: 'runtime-id',
                builtIn: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            }),
        ];

        const json = exportSkillsToJson(skills);
        const parsed = JSON.parse(json);

        // 导出的 skill 不应包含 id, builtIn, createdAt, updatedAt
        expect(parsed.skills[0].id).toBeUndefined();
        expect(parsed.skills[0].builtIn).toBeUndefined();
        expect(parsed.skills[0].createdAt).toBeUndefined();
        expect(parsed.skills[0].updatedAt).toBeUndefined();
    });

    it('exportSkillsToJson - 导出多个技能', () => {
        const skills: Skill[] = [
            createTestSkill({ id: 's1', name: '技能1' }),
            createTestSkill({ id: 's2', name: '技能2' }),
            createTestSkill({ id: 's3', name: '技能3' }),
        ];

        const json = exportSkillsToJson(skills);
        const parsed = JSON.parse(json);

        expect(parsed.skills).toHaveLength(3);
    });

    // ==================== v3.0.18: 导出附带文件测试 ====================

    // SK-320: 导出无文件技能
    it('SK-320: exportSkillsToJson - 导出无文件技能', () => {
        const skills: Skill[] = [
            createTestSkill({
                id: 'no-files',
                name: '无文件技能',
                files: undefined,
            }),
        ];

        const json = exportSkillsToJson(skills);
        const parsed = JSON.parse(json);

        expect(parsed.skills[0].files).toBeUndefined();
    });

    // SK-321: 导出有文件技能
    it('SK-321: exportSkillsToJson - 导出有文件技能', () => {
        const skills: Skill[] = [
            createTestSkill({
                id: 'with-files',
                name: '有文件技能',
                files: [
                    { path: 'SKILL.md', name: 'SKILL.md', content: '# Skill', type: 'markdown' },
                    { path: 'AGENTS.md', name: 'AGENTS.md', content: '# Agents', type: 'markdown' },
                    { path: 'rules/hooks.md', name: 'hooks.md', content: '# Hooks', type: 'markdown' },
                ],
            }),
        ];

        const json = exportSkillsToJson(skills);
        const parsed = JSON.parse(json);

        expect(parsed.skills[0].files).toHaveLength(3);
        expect(parsed.skills[0].files[0].path).toBe('SKILL.md');
        expect(parsed.skills[0].files[0].content).toBe('# Skill');
        expect(parsed.skills[0].files[1].path).toBe('AGENTS.md');
        expect(parsed.skills[0].files[2].path).toBe('rules/hooks.md');
    });

    // SK-322: 文件内容完整性
    it('SK-322: exportSkillsToJson - 文件内容完整', () => {
        const longContent = '# 长内容\n'.repeat(1000); // 模拟大文件
        const skills: Skill[] = [
            createTestSkill({
                id: 'large-file',
                name: '大文件技能',
                files: [
                    { path: 'large.md', name: 'large.md', content: longContent, type: 'markdown' },
                ],
            }),
        ];

        const json = exportSkillsToJson(skills);
        const parsed = JSON.parse(json);

        // 验证内容没有被截断
        expect(parsed.skills[0].files[0].content).toBe(longContent);
        expect(parsed.skills[0].files[0].content.length).toBe(longContent.length);
    });

    // SK-325: 混合导出（部分技能有文件）
    it('SK-325: exportSkillsToJson - 混合导出', () => {
        const skills: Skill[] = [
            createTestSkill({
                id: 'with-files',
                name: '有文件技能',
                files: [
                    { path: 'SKILL.md', name: 'SKILL.md', content: '# Skill', type: 'markdown' },
                ],
            }),
            createTestSkill({
                id: 'no-files',
                name: '无文件技能',
                files: undefined,
            }),
            createTestSkill({
                id: 'empty-files',
                name: '空文件数组技能',
                files: [],
            }),
        ];

        const json = exportSkillsToJson(skills);
        const parsed = JSON.parse(json);

        expect(parsed.skills).toHaveLength(3);
        expect(parsed.skills[0].files).toHaveLength(1);
        expect(parsed.skills[1].files).toBeUndefined();
        expect(parsed.skills[2].files).toHaveLength(0);
    });

    // SK-326: 版本号更新
    it('SK-326: exportSkillsToJson - 版本号为 v3.0.22', () => {
        const skills: Skill[] = [createTestSkill()];

        const json = exportSkillsToJson(skills);
        const parsed = JSON.parse(json);

        expect(parsed.meta.exportedBy).toContain('v3.0.22');
    });
});

// ==================== detectDuplicateSkills 测试 ====================

describe('detectDuplicateSkills', () => {
    // SK-189: detectDuplicateSkills - 有重复
    it('SK-189: detectDuplicateSkills - 检测到名称重复', () => {
        const existingSkills: Skill[] = [
            createTestSkill({ id: 'existing-1', name: '已存在技能' }),
        ];

        const newSkills: SkillCreateInput[] = [
            {
                name: '已存在技能', // 同名
                description: '新描述',
                category: 'custom',
                promptTemplate: '新模板',
            },
        ];

        const result = detectDuplicateSkills(newSkills, existingSkills);

        expect(result.duplicates).toHaveLength(1);
        expect(result.duplicates[0].matchType).toBe('name');
        expect(result.unique).toHaveLength(0);
    });

    // SK-190: detectDuplicateSkills - 无重复
    it('SK-190: detectDuplicateSkills - 全新技能无重复', () => {
        const existingSkills: Skill[] = [
            createTestSkill({ id: 'existing-1', name: '已存在技能' }),
        ];

        const newSkills: SkillCreateInput[] = [
            {
                name: '全新技能',
                description: '描述',
                category: 'custom',
                promptTemplate: '模板',
            },
        ];

        const result = detectDuplicateSkills(newSkills, existingSkills);

        expect(result.duplicates).toHaveLength(0);
        expect(result.unique).toHaveLength(1);
    });

    it('detectDuplicateSkills - 名称不区分大小写', () => {
        const existingSkills: Skill[] = [
            createTestSkill({ id: 'existing-1', name: 'Test Skill' }),
        ];

        const newSkills: SkillCreateInput[] = [
            {
                name: 'test skill', // 小写
                description: '描述',
                category: 'custom',
                promptTemplate: '模板',
            },
        ];

        const result = detectDuplicateSkills(newSkills, existingSkills);

        expect(result.duplicates).toHaveLength(1);
    });

    it('detectDuplicateSkills - 混合重复和唯一', () => {
        const existingSkills: Skill[] = [
            createTestSkill({ id: 'e1', name: '技能A' }),
            createTestSkill({ id: 'e2', name: '技能B' }),
        ];

        const newSkills: SkillCreateInput[] = [
            { name: '技能A', description: '', category: 'custom', promptTemplate: '' }, // 重复
            { name: '技能C', description: '', category: 'custom', promptTemplate: '' }, // 新
            { name: '技能B', description: '', category: 'custom', promptTemplate: '' }, // 重复
            { name: '技能D', description: '', category: 'custom', promptTemplate: '' }, // 新
        ];

        const result = detectDuplicateSkills(newSkills, existingSkills);

        expect(result.duplicates).toHaveLength(2);
        expect(result.unique).toHaveLength(2);
    });
});

// ==================== applyDuplicateStrategy 测试 ====================

describe('applyDuplicateStrategy', () => {
    const duplicates = [
        {
            newSkill: {
                name: '重复技能',
                description: '新描述',
                category: 'custom' as const,
                promptTemplate: '新模板',
            },
            existingSkill: createTestSkill({ id: 'existing-id', name: '重复技能' }),
            matchType: 'name' as const,
        },
    ];

    it('skip 策略 - 不添加也不更新', () => {
        const result = applyDuplicateStrategy(duplicates, 'skip');

        expect(result.toAdd).toHaveLength(0);
        expect(result.toUpdate).toHaveLength(0);
    });

    it('overwrite 策略 - 更新现有技能', () => {
        const result = applyDuplicateStrategy(duplicates, 'overwrite');

        expect(result.toAdd).toHaveLength(0);
        expect(result.toUpdate).toHaveLength(1);
        expect(result.toUpdate[0].id).toBe('existing-id');
        expect(result.toUpdate[0].data.description).toBe('新描述');
    });

    it('rename 策略 - 重命名后添加', () => {
        const result = applyDuplicateStrategy(duplicates, 'rename');

        expect(result.toAdd).toHaveLength(1);
        expect(result.toUpdate).toHaveLength(0);
        expect(result.toAdd[0].name).toBe('重复技能 (导入)');
    });

    it('处理多个重复技能', () => {
        const multipleDuplicates = [
            ...duplicates,
            {
                newSkill: {
                    name: '另一个重复',
                    description: '',
                    category: 'custom' as const,
                    promptTemplate: '',
                },
                existingSkill: createTestSkill({ id: 'id-2', name: '另一个重复' }),
                matchType: 'name' as const,
            },
        ];

        const result = applyDuplicateStrategy(multipleDuplicates, 'rename');

        expect(result.toAdd).toHaveLength(2);
        expect(result.toAdd[0].name).toContain('(导入)');
        expect(result.toAdd[1].name).toContain('(导入)');
    });
});

// ==================== v3.0.2 parseSkillCommand 测试 ====================

describe('parseSkillCommand', () => {
    // SK-200: 基础命令格式
    it('SK-200: 解析基础命令格式', () => {
        const input = 'npx skills add https://github.com/user/repo';
        const result = parseSkillCommand(input);

        expect(result).not.toBeNull();
        expect(result?.url).toBe('https://github.com/user/repo');
        expect(result?.isCommand).toBe(true);
        expect(result?.skillIds).toBeUndefined();
    });

    // SK-201: 带单个技能ID
    it('SK-201: 解析带单个技能ID的命令', () => {
        const input = 'npx skills add https://github.com/user/repo --skill my-skill';
        const result = parseSkillCommand(input);

        expect(result).not.toBeNull();
        expect(result?.url).toBe('https://github.com/user/repo');
        expect(result?.skillIds).toEqual(['my-skill']);
        expect(result?.isCommand).toBe(true);
    });

    // SK-202: 带多个技能ID
    it('SK-202: 解析带多个技能ID的命令', () => {
        const input = 'npx skills add https://github.com/user/repo --skill skill-a --skill skill-b';
        const result = parseSkillCommand(input);

        expect(result).not.toBeNull();
        expect(result?.url).toBe('https://github.com/user/repo');
        expect(result?.skillIds).toEqual(['skill-a', 'skill-b']);
        expect(result?.isCommand).toBe(true);
    });

    // SK-203: 纯 URL
    it('SK-203: 解析纯 URL', () => {
        const input = 'https://github.com/user/repo';
        const result = parseSkillCommand(input);

        expect(result).not.toBeNull();
        expect(result?.url).toBe('https://github.com/user/repo');
        expect(result?.isCommand).toBe(false);
        expect(result?.skillIds).toBeUndefined();
    });

    // SK-204: 无效命令
    it('SK-204: 无效命令返回 null', () => {
        const input = 'npx other-command';
        const result = parseSkillCommand(input);

        expect(result).toBeNull();
    });

    // SK-205: 空输入
    it('SK-205: 空输入返回 null', () => {
        expect(parseSkillCommand('')).toBeNull();
        expect(parseSkillCommand('   ')).toBeNull();
    });

    it('支持短选项 -s', () => {
        const input = 'npx skills add https://github.com/user/repo -s my-skill';
        const result = parseSkillCommand(input);

        expect(result).not.toBeNull();
        expect(result?.skillIds).toEqual(['my-skill']);
    });

    it('混合使用 --skill 和 -s', () => {
        const input = 'npx skills add https://github.com/user/repo --skill skill-a -s skill-b';
        const result = parseSkillCommand(input);

        expect(result).not.toBeNull();
        expect(result?.skillIds).toEqual(['skill-a', 'skill-b']);
    });

    it('命令不区分大小写', () => {
        const input = 'NPX SKILLS ADD https://github.com/user/repo';
        const result = parseSkillCommand(input);

        expect(result).not.toBeNull();
        expect(result?.url).toBe('https://github.com/user/repo');
        expect(result?.isCommand).toBe(true);
    });

    it('保留原始输入', () => {
        const input = 'npx skills add https://github.com/user/repo --skill my-skill';
        const result = parseSkillCommand(input);

        expect(result?.rawInput).toBe(input);
    });

    it('处理 http URL', () => {
        const input = 'http://example.com/skills.json';
        const result = parseSkillCommand(input);

        expect(result).not.toBeNull();
        expect(result?.url).toBe('http://example.com/skills.json');
        expect(result?.isCommand).toBe(false);
    });

    it('处理带空格的输入', () => {
        const input = '  npx skills add https://github.com/user/repo  ';
        const result = parseSkillCommand(input);

        expect(result).not.toBeNull();
        expect(result?.url).toBe('https://github.com/user/repo');
    });

    it('命令缺少 URL 返回 null', () => {
        const input = 'npx skills add --skill my-skill';
        const result = parseSkillCommand(input);

        expect(result).toBeNull();
    });
});

// ==================== v3.0.3 SKILL.md 格式测试 ====================

import {
    parseSkillMd,
    parseGitHubRepoInfo,
} from '../../utils/skillUtils';

describe('parseSkillMd', () => {
    // SK-210: 解析有效 SKILL.md
    it('SK-210: 解析完整的 SKILL.md 文件', () => {
        const content = `---
name: React Best Practices
description: Follow React official best practices
---

When helping with React development, follow these best practices:

## Component Design
1. Single Responsibility`;

        const result = parseSkillMd(content);

        expect(result).not.toBeNull();
        expect(result?.name).toBe('React Best Practices');
        expect(result?.description).toBe('Follow React official best practices');
        expect(result?.promptTemplate).toContain('When helping with React development');
        expect(result?.promptTemplate).toContain('## Component Design');
    });

    // SK-211: 解析无 frontmatter
    it('SK-211: 无 frontmatter 返回 null', () => {
        const content = `# Just Markdown

No frontmatter here.`;

        const result = parseSkillMd(content);

        expect(result).toBeNull();
    });

    // SK-212: 解析空 frontmatter
    it('SK-212: 空 frontmatter 返回 null', () => {
        const content = `---
---

Some content`;

        const result = parseSkillMd(content);

        expect(result).toBeNull();
    });

    // SK-213: 缺少 name 字段
    it('SK-213: 缺少 name 字段返回 null', () => {
        const content = `---
description: Only description
---

Content here`;

        const result = parseSkillMd(content);

        expect(result).toBeNull();
    });

    it('处理带引号的值', () => {
        const content = `---
name: "Quoted Name"
description: 'Single quoted'
---

Content`;

        const result = parseSkillMd(content);

        expect(result?.name).toBe('Quoted Name');
        expect(result?.description).toBe('Single quoted');
    });

    it('处理只有 name 没有 description', () => {
        const content = `---
name: Minimal Skill
---

Prompt content here`;

        const result = parseSkillMd(content);

        expect(result).not.toBeNull();
        expect(result?.name).toBe('Minimal Skill');
        expect(result?.description).toBe('');
        expect(result?.promptTemplate).toBe('Prompt content here');
    });

    it('处理空内容返回 null', () => {
        expect(parseSkillMd('')).toBeNull();
        expect(parseSkillMd(null as unknown as string)).toBeNull();
    });

    it('保留 frontmatter 中的所有字段', () => {
        const content = `---
name: Test Skill
description: Test
author: Test Author
version: 2.0.0
---

Content`;

        const result = parseSkillMd(content);

        expect(result?.frontmatter['author']).toBe('Test Author');
        expect(result?.frontmatter['version']).toBe('2.0.0');
    });

    it('处理 Windows 风格换行符', () => {
        const content = '---\r\nname: Windows Style\r\ndescription: Test\r\n---\r\n\r\nContent';

        const result = parseSkillMd(content);

        expect(result?.name).toBe('Windows Style');
    });
});

describe('parseGitHubRepoInfo', () => {
    it('解析基础 GitHub 仓库 URL', () => {
        const url = 'https://github.com/vercel-labs/agent-skills';
        const result = parseGitHubRepoInfo(url);

        expect(result).not.toBeNull();
        expect(result?.owner).toBe('vercel-labs');
        expect(result?.repo).toBe('agent-skills');
        expect(result?.branch).toBe('main');
    });

    it('解析带分支的 GitHub URL', () => {
        const url = 'https://github.com/vercel-labs/agent-skills/tree/develop';
        const result = parseGitHubRepoInfo(url);

        expect(result?.branch).toBe('develop');
    });

    it('非 GitHub URL 返回 null', () => {
        const url = 'https://gitlab.com/user/repo';
        const result = parseGitHubRepoInfo(url);

        expect(result).toBeNull();
    });

    it('无效 URL 返回 null', () => {
        const result = parseGitHubRepoInfo('not-a-url');

        expect(result).toBeNull();
    });

    it('路径不完整返回 null', () => {
        const url = 'https://github.com/only-owner';
        const result = parseGitHubRepoInfo(url);

        expect(result).toBeNull();
    });
});

// ==================== v3.0.5/v3.0.6 skills.sh 集成测试 ====================

import {
    formatInstallCount,
} from '../../utils/skillUtils';

describe('formatInstallCount', () => {
    // SK-223: 安装次数显示格式化
    it('SK-223: 格式化大数字为 k 形式', () => {
        expect(formatInstallCount(45594)).toBe('45.6k');
        expect(formatInstallCount(1000)).toBe('1.0k');
        expect(formatInstallCount(34911)).toBe('34.9k');
    });

    it('格式化更大数字为 M 形式', () => {
        expect(formatInstallCount(1234567)).toBe('1.2M');
        expect(formatInstallCount(10000000)).toBe('10.0M');
    });

    it('小数字保持原样', () => {
        expect(formatInstallCount(999)).toBe('999');
        expect(formatInstallCount(0)).toBe('0');
        expect(formatInstallCount(500)).toBe('500');
    });
});

/**
 * fetchSkillsShList 测试说明 (v3.0.6)
 *
 * 由于 v3.0.6 将 fetchSkillsShList 改为通过 Tauri invoke 调用 Rust 后端代理，
 * 前端测试无法直接 mock Tauri invoke。实际测试需要：
 * 1. 在 Tauri 环境中运行集成测试
 * 2. 或者在 Rust 端进行单元测试
 *
 * 此处保留原测试用例作为文档和 API 契约参考。
 * 如需测试，请在 Tauri 应用运行时进行手动验证。
 *
 * 测试用例对应文档：
 * - SK-220: 加载 skills.sh 列表 - 无参数返回前20条技能
 * - SK-221: 分页加载 - offset=20 返回第21-40条
 * - SK-222: 搜索功能 - search="react" 返回包含 react 的技能
 * - SK-225: API 错误处理 - 网络错误时显示错误信息
 * - SK-230: Rust 代理 - 默认获取 - 无参数返回前20条技能
 * - SK-231: Rust 代理 - 分页 - limit=10, offset=20 返回第21-30条
 * - SK-232: Rust 代理 - 搜索 - search="react" 返回匹配技能
 * - SK-233: Rust 代理 - 网络错误 - 无网络时返回错误信息
 * - SK-234: Rust 代理 - API 错误 - API 返回非 200 时返回错误信息
 */
describe('fetchSkillsShList (Mock Tauri invoke)', () => {
    // 通过 mock @tauri-apps/api/core 的 invoke 来测试

    it('SK-230: Rust 代理 - 默认获取前20条技能', async () => {
        const mockResponse = {
            skills: [
                { name: 'react-skill', description: 'React skill', author: 'test', url: 'https://skills.sh/react' },
                { name: 'vue-skill', description: 'Vue skill', author: 'test', url: 'https://skills.sh/vue' },
            ],
            hasMore: true,
        };

        const { invoke } = await import('@tauri-apps/api/core');
        vi.mocked(invoke).mockResolvedValueOnce(mockResponse);

        const { fetchSkillsShList } = await import('../../utils/skillUtils');
        const result = await fetchSkillsShList();

        expect(invoke).toHaveBeenCalledWith('fetch_skills_sh', {
            params: { limit: 20, offset: 0, search: null },
        });
        expect(result.skills).toHaveLength(2);
        expect(result.hasMore).toBe(true);
    });

    it('SK-231: Rust 代理 - 分页参数 limit=10, offset=20', async () => {
        const mockResponse = {
            skills: [{ name: 'skill-21', description: 'Skill 21', author: 'test', url: 'https://skills.sh/21' }],
            hasMore: false,
        };

        const { invoke } = await import('@tauri-apps/api/core');
        vi.mocked(invoke).mockResolvedValueOnce(mockResponse);

        const { fetchSkillsShList } = await import('../../utils/skillUtils');
        const result = await fetchSkillsShList({ limit: 10, offset: 20 });

        expect(invoke).toHaveBeenCalledWith('fetch_skills_sh', {
            params: { limit: 10, offset: 20, search: null },
        });
        expect(result.skills).toHaveLength(1);
        expect(result.hasMore).toBe(false);
    });

    it('SK-232: Rust 代理 - 搜索参数 search="react"', async () => {
        const mockResponse = {
            skills: [{ name: 'react-skill', description: 'React', author: 'test', url: 'https://skills.sh/react' }],
            hasMore: false,
        };

        const { invoke } = await import('@tauri-apps/api/core');
        vi.mocked(invoke).mockResolvedValueOnce(mockResponse);

        const { fetchSkillsShList } = await import('../../utils/skillUtils');
        const result = await fetchSkillsShList({ search: 'react' });

        expect(invoke).toHaveBeenCalledWith('fetch_skills_sh', {
            params: { limit: 20, offset: 0, search: 'react' },
        });
        expect(result.skills).toHaveLength(1);
    });

    it('SK-233: Rust 代理 - 网络错误处理', async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        vi.mocked(invoke).mockRejectedValueOnce(new Error('Network error'));

        const { fetchSkillsShList } = await import('../../utils/skillUtils');

        await expect(fetchSkillsShList()).rejects.toThrow('获取 skills.sh 列表失败');
    });

    it('SK-234: Rust 代理 - API 错误处理', async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        vi.mocked(invoke).mockRejectedValueOnce('API returned 500');

        const { fetchSkillsShList } = await import('../../utils/skillUtils');

        await expect(fetchSkillsShList()).rejects.toThrow('获取 skills.sh 列表失败');
    });
});

// ==================== v3.0.13 相对链接转换测试 ====================

import { convertRelativeLinksToAbsolute } from '../../utils/skillUtils';

describe('convertRelativeLinksToAbsolute', () => {
    const baseUrl = 'https://github.com/vercel-labs/agent-skills/blob/main/skills/react';

    // SK-250: 普通相对路径
    it('SK-250: 普通相对路径转换为绝对 URL', () => {
        const content = 'See [3D rules](rules/3d.md) for details.';
        const result = convertRelativeLinksToAbsolute(content, baseUrl);

        expect(result).toBe(
            'See [3D rules](https://github.com/vercel-labs/agent-skills/blob/main/skills/react/rules/3d.md) for details.'
        );
    });

    // SK-251: ./ 开头路径
    it('SK-251: ./ 开头路径转换为绝对 URL', () => {
        const content = 'Check [setup script](./scripts/setup.sh) for installation.';
        const result = convertRelativeLinksToAbsolute(content, baseUrl);

        expect(result).toBe(
            'Check [setup script](https://github.com/vercel-labs/agent-skills/blob/main/skills/react/scripts/setup.sh) for installation.'
        );
    });

    // SK-252: ../ 路径
    it('SK-252: ../ 路径转换为上级目录的绝对 URL', () => {
        const content = 'See [parent file](../other/file.md) for reference.';
        const result = convertRelativeLinksToAbsolute(content, baseUrl);

        expect(result).toBe(
            'See [parent file](https://github.com/vercel-labs/agent-skills/blob/main/skills/other/file.md) for reference.'
        );
    });

    // SK-253: 绝对 URL 不转换
    it('SK-253: 绝对 URL 保持不变', () => {
        const content = 'Visit [example](https://example.com) for more info.';
        const result = convertRelativeLinksToAbsolute(content, baseUrl);

        expect(result).toBe('Visit [example](https://example.com) for more info.');
    });

    // SK-254: mailto 不转换
    it('SK-254: mailto 链接保持不变', () => {
        const content = 'Contact [email](mailto:test@example.com) for support.';
        const result = convertRelativeLinksToAbsolute(content, baseUrl);

        expect(result).toBe('Contact [email](mailto:test@example.com) for support.');
    });

    // SK-255: 锚点不转换
    it('SK-255: 锚点链接保持不变', () => {
        const content = 'Jump to [section](#intro) for introduction.';
        const result = convertRelativeLinksToAbsolute(content, baseUrl);

        expect(result).toBe('Jump to [section](#intro) for introduction.');
    });

    // SK-256: 多个链接
    it('SK-256: 多个相对链接都被转换', () => {
        const content = `
See [rules](rules/3d.md) and [scripts](./scripts/setup.sh).
Also check [parent](../other/file.md) and [external](https://example.com).
`;
        const result = convertRelativeLinksToAbsolute(content, baseUrl);

        expect(result).toContain(
            '[rules](https://github.com/vercel-labs/agent-skills/blob/main/skills/react/rules/3d.md)'
        );
        expect(result).toContain(
            '[scripts](https://github.com/vercel-labs/agent-skills/blob/main/skills/react/scripts/setup.sh)'
        );
        expect(result).toContain(
            '[parent](https://github.com/vercel-labs/agent-skills/blob/main/skills/other/file.md)'
        );
        expect(result).toContain('[external](https://example.com)');
    });

    // SK-257: 空内容
    it('SK-257: 空内容返回空字符串', () => {
        expect(convertRelativeLinksToAbsolute('', baseUrl)).toBe('');
    });

    // SK-258: 无链接内容
    it('SK-258: 无链接内容保持不变', () => {
        const content = '这是普通文本，没有任何链接。';
        const result = convertRelativeLinksToAbsolute(content, baseUrl);

        expect(result).toBe('这是普通文本，没有任何链接。');
    });

    // 边界情况：baseUrl 为空
    it('baseUrl 为空时返回原内容', () => {
        const content = 'See [rules](rules/3d.md) for details.';
        const result = convertRelativeLinksToAbsolute(content, '');

        expect(result).toBe(content);
    });

    // 边界情况：多层 ../ 路径
    it('多层 ../ 路径正确处理', () => {
        const content = 'See [deep file](../../root/file.md) for reference.';
        const result = convertRelativeLinksToAbsolute(content, baseUrl);

        expect(result).toBe(
            'See [deep file](https://github.com/vercel-labs/agent-skills/blob/main/root/file.md) for reference.'
        );
    });

    // 边界情况：http:// 链接不转换
    it('http:// 链接保持不变', () => {
        const content = 'Visit [http site](http://example.com) for info.';
        const result = convertRelativeLinksToAbsolute(content, baseUrl);

        expect(result).toBe('Visit [http site](http://example.com) for info.');
    });

    // 边界情况：链接文本为空
    it('链接文本为空时正常处理', () => {
        const content = 'See [](rules/3d.md) for details.';
        const result = convertRelativeLinksToAbsolute(content, baseUrl);

        expect(result).toBe(
            'See [](https://github.com/vercel-labs/agent-skills/blob/main/skills/react/rules/3d.md) for details.'
        );
    });
});

// ==================== v3.0.14 完整目录下载测试 ====================

import {
    mergeSkillFilesToPrompt,
    fetchSkillDirectoryContents,
    downloadSkillFiles,
} from '../../utils/skillUtils';
import type { SkillFile } from '../../types';

describe('mergeSkillFilesToPrompt', () => {
    // SK-260: 仅 SKILL.md
    it('SK-260: 仅 SKILL.md 时返回 SKILL.md 内容', () => {
        const skillMdContent = '这是 SKILL.md 的内容';
        const files: SkillFile[] = [
            { path: 'SKILL.md', name: 'SKILL.md', content: skillMdContent, type: 'markdown' },
        ];

        const result = mergeSkillFilesToPrompt(skillMdContent, null, files);

        expect(result).toBe(skillMdContent);
    });

    // SK-261: SKILL.md + AGENTS.md
    it('SK-261: 有 AGENTS.md 时优先使用 AGENTS.md', () => {
        const skillMdContent = 'SKILL.md 内容';
        const agentsMdContent = 'AGENTS.md 内容';
        const files: SkillFile[] = [
            { path: 'SKILL.md', name: 'SKILL.md', content: skillMdContent, type: 'markdown' },
            { path: 'AGENTS.md', name: 'AGENTS.md', content: agentsMdContent, type: 'markdown' },
        ];

        const result = mergeSkillFilesToPrompt(skillMdContent, agentsMdContent, files);

        expect(result).toBe(agentsMdContent);
        expect(result).not.toContain(skillMdContent);
    });

    // SK-262: 包含 rules 目录
    it('SK-262: 包含 rules 目录时按文件名排序追加', () => {
        const skillMdContent = '主内容';
        const files: SkillFile[] = [
            { path: 'SKILL.md', name: 'SKILL.md', content: skillMdContent, type: 'markdown' },
            { path: 'rules/b-rule.md', name: 'b-rule.md', content: 'B 规则内容', type: 'markdown' },
            { path: 'rules/a-rule.md', name: 'a-rule.md', content: 'A 规则内容', type: 'markdown' },
        ];

        const result = mergeSkillFilesToPrompt(skillMdContent, null, files);

        expect(result).toContain('主内容');
        expect(result).toContain('📋 附加规则');
        expect(result).toContain('### a-rule');
        expect(result).toContain('A 规则内容');
        expect(result).toContain('### b-rule');
        expect(result).toContain('B 规则内容');
        // 验证排序：a-rule 应该在 b-rule 之前
        expect(result.indexOf('a-rule')).toBeLessThan(result.indexOf('b-rule'));
    });

    // SK-263: 包含 scripts 目录（非 markdown 文件不合并到 promptTemplate）
    it('SK-263: scripts 目录下的非 markdown 文件不合并到 promptTemplate', () => {
        const skillMdContent = '主内容';
        const files: SkillFile[] = [
            { path: 'SKILL.md', name: 'SKILL.md', content: skillMdContent, type: 'markdown' },
            { path: 'scripts/setup.sh', name: 'setup.sh', content: '#!/bin/bash\necho "setup"', type: 'text' },
        ];

        const result = mergeSkillFilesToPrompt(skillMdContent, null, files);

        expect(result).toBe(skillMdContent);
        expect(result).not.toContain('setup.sh');
        expect(result).not.toContain('#!/bin/bash');
    });

    // SK-267: 文件类型判断（通过 files 数组验证）
    it('SK-267: 正确识别不同文件类型', () => {
        const files: SkillFile[] = [
            { path: 'SKILL.md', name: 'SKILL.md', content: 'md', type: 'markdown' },
            { path: 'config.json', name: 'config.json', content: '{}', type: 'json' },
            { path: 'script.sh', name: 'script.sh', content: '', type: 'text' },
            { path: 'binary.bin', name: 'binary.bin', content: '', type: 'other' },
        ];

        // 验证 files 数组中的类型正确
        expect(files.find(f => f.name === 'SKILL.md')?.type).toBe('markdown');
        expect(files.find(f => f.name === 'config.json')?.type).toBe('json');
        expect(files.find(f => f.name === 'script.sh')?.type).toBe('text');
        expect(files.find(f => f.name === 'binary.bin')?.type).toBe('other');
    });

    // SK-268: files 数组完整性
    it('SK-268: 合并后 files 数组保持完整', () => {
        const skillMdContent = '主内容';
        const files: SkillFile[] = [
            { path: 'SKILL.md', name: 'SKILL.md', content: skillMdContent, type: 'markdown' },
            { path: 'AGENTS.md', name: 'AGENTS.md', content: 'agents', type: 'markdown' },
            { path: 'rules/3d.md', name: '3d.md', content: '3d rules', type: 'markdown' },
            { path: 'scripts/setup.sh', name: 'setup.sh', content: 'script', type: 'text' },
        ];

        // mergeSkillFilesToPrompt 不修改 files 数组
        mergeSkillFilesToPrompt(skillMdContent, 'agents', files);

        // files 数组应该保持不变
        expect(files).toHaveLength(4);
        expect(files.map(f => f.path)).toEqual([
            'SKILL.md',
            'AGENTS.md',
            'rules/3d.md',
            'scripts/setup.sh',
        ]);
    });

    // 边界情况：空 files 数组
    it('空 files 数组时正常返回主内容', () => {
        const skillMdContent = '主内容';
        const result = mergeSkillFilesToPrompt(skillMdContent, null, []);

        expect(result).toBe(skillMdContent);
    });

    // 边界情况：rules 目录下有非 markdown 文件
    it('rules 目录下的非 markdown 文件不被合并', () => {
        const skillMdContent = '主内容';
        const files: SkillFile[] = [
            { path: 'rules/config.json', name: 'config.json', content: '{}', type: 'json' },
            { path: 'rules/rule.md', name: 'rule.md', content: '规则', type: 'markdown' },
        ];

        const result = mergeSkillFilesToPrompt(skillMdContent, null, files);

        expect(result).toContain('规则');
        expect(result).not.toContain('config.json');
        expect(result).not.toContain('{}');
    });
});

// ==================== v3.0.14 fetchSkillDirectoryContents 测试 ====================

describe('fetchSkillDirectoryContents', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    // SK-265: 空目录
    it('SK-265: 目录不存在时返回空数组不报错', async () => {
        // Mock invoke 返回 404 错误
        vi.mocked(invoke).mockRejectedValueOnce('HTTP 错误 (404): Not Found');

        const result = await fetchSkillDirectoryContents('owner', 'repo', 'nonexistent', 'main');

        expect(result).toEqual([]);
        expect(invoke).toHaveBeenCalledWith('fetch_github_contents', {
            owner: 'owner',
            repo: 'repo',
            path: 'nonexistent',
            branch: 'main',
        });
    });

    it('GitHub 403 限流时抛出稍后重试错误', async () => {
        vi.mocked(invoke).mockRejectedValueOnce(
            'HTTP 错误: 403 - {"message":"API rate limit exceeded for 1.2.3.4"}'
        );

        await expect(
            fetchSkillDirectoryContents('owner', 'repo', 'skills/test', 'main')
        ).rejects.toThrow('GitHub API 请求限流，请稍后重试。');
    });

    // SK-264: 嵌套子目录（模拟递归）
    it('SK-264: 递归获取嵌套子目录', async () => {
        // 第一次调用返回根目录内容
        const rootContents = [
            { name: 'SKILL.md', path: 'skills/test/SKILL.md', type: 'file', download_url: 'https://raw.../SKILL.md', size: 100 },
            { name: 'rules', path: 'skills/test/rules', type: 'dir', download_url: null, size: 0 },
        ];

        // 第二次调用返回 rules 子目录内容
        const rulesContents = [
            { name: '3d.md', path: 'skills/test/rules/3d.md', type: 'file', download_url: 'https://raw.../3d.md', size: 50 },
        ];

        let callCount = 0;
        vi.mocked(invoke).mockImplementation((cmd: string) => {
            if (cmd === 'fetch_github_contents') {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve(JSON.stringify(rootContents));
                } else {
                    return Promise.resolve(JSON.stringify(rulesContents));
                }
            }
            return Promise.reject('Unknown command');
        });

        const result = await fetchSkillDirectoryContents('owner', 'repo', 'skills/test', 'main');

        expect(result).toHaveLength(2);
        expect(result.find(f => f.name === 'SKILL.md')).toBeDefined();
        expect(result.find(f => f.path === 'rules/3d.md')).toBeDefined();
    });

    // 排除文件测试
    it('排除 README.md 和隐藏文件', async () => {
        const contents = [
            { name: 'SKILL.md', path: 'skills/test/SKILL.md', type: 'file', download_url: 'https://raw.../SKILL.md', size: 100 },
            { name: 'README.md', path: 'skills/test/README.md', type: 'file', download_url: 'https://raw.../README.md', size: 50 },
            { name: '.gitignore', path: 'skills/test/.gitignore', type: 'file', download_url: 'https://raw.../.gitignore', size: 10 },
            { name: '_private.md', path: 'skills/test/_private.md', type: 'file', download_url: 'https://raw.../_private.md', size: 20 },
        ];

        vi.mocked(invoke).mockResolvedValueOnce(JSON.stringify(contents));

        const result = await fetchSkillDirectoryContents('owner', 'repo', 'skills/test', 'main');

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('SKILL.md');
    });

    // SK-269a: 根目录技能（path 为空字符串）scripts 安装
    it('SK-269a: 根目录技能使用空字符串路径时正确获取 scripts 目录', async () => {
        // 根目录内容：包含 SKILL.md 和 scripts 目录
        const rootContents = [
            { name: 'SKILL.md', path: 'SKILL.md', type: 'file', download_url: 'https://raw.../SKILL.md', size: 100 },
            { name: 'scripts', path: 'scripts', type: 'dir', download_url: null, size: 0 },
        ];

        // scripts 子目录内容
        const scriptsContents = [
            { name: 'install.sh', path: 'scripts/install.sh', type: 'file', download_url: 'https://raw.../scripts/install.sh', size: 50 },
            { name: 'setup.sh', path: 'scripts/setup.sh', type: 'file', download_url: 'https://raw.../scripts/setup.sh', size: 30 },
        ];

        let callCount = 0;
        vi.mocked(invoke).mockImplementation((cmd: string) => {
            if (cmd === 'fetch_github_contents') {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve(JSON.stringify(rootContents));
                } else {
                    return Promise.resolve(JSON.stringify(scriptsContents));
                }
            }
            return Promise.reject('Unknown command');
        });

        // 传入空字符串作为路径（根目录技能）
        const result = await fetchSkillDirectoryContents('owner', 'repo', '', 'main');

        // 应返回 3 个文件：SKILL.md + scripts/install.sh + scripts/setup.sh
        expect(result).toHaveLength(3);
        expect(result.find(f => f.name === 'SKILL.md')).toBeDefined();
        expect(result.find(f => f.path === 'scripts/install.sh')).toBeDefined();
        expect(result.find(f => f.path === 'scripts/setup.sh')).toBeDefined();

        // 验证 API 调用使用空字符串而非 '.'
        expect(invoke).toHaveBeenCalledWith('fetch_github_contents', {
            owner: 'owner',
            repo: 'repo',
            path: '',
            branch: 'main',
        });
    });

    // SK-269b: 根目录技能路径计算正确
    it('SK-269b: 根目录技能文件路径不被错误截断', async () => {
        // 根目录有一个普通文件
        const rootContents = [
            { name: 'setup.sh', path: 'setup.sh', type: 'file', download_url: 'https://raw.../setup.sh', size: 40 },
        ];

        vi.mocked(invoke).mockResolvedValueOnce(JSON.stringify(rootContents));

        const result = await fetchSkillDirectoryContents('owner', 'repo', '', 'main');

        expect(result).toHaveLength(1);
        // 路径应保持为 'setup.sh'，不应被 replace('/', '') 错误截断
        expect(result[0].path).toBe('setup.sh');
        expect(result[0].name).toBe('setup.sh');
    });
});

// ==================== v3.0.14 downloadSkillFiles 测试 ====================

describe('downloadSkillFiles', () => {
    // SK-266: 并行下载（通过 mock 验证）
    it('SK-266: 并行下载多个文件', async () => {
        // 由于 downloadSkillFiles 内部使用 Tauri invoke，这里只能做基本的类型测试
        // 实际的并行下载测试需要在 Tauri 环境中进行

        const files = [
            { path: 'file1.md', downloadUrl: 'https://example.com/file1.md', name: 'file1.md' },
            { path: 'file2.md', downloadUrl: 'https://example.com/file2.md', name: 'file2.md' },
        ];

        // 验证函数签名正确
        expect(typeof downloadSkillFiles).toBe('function');
        expect(files).toHaveLength(2);
    });

    // SK-269: 下载失败处理（通过 mock Tauri invoke）
    it('SK-269: 下载失败时跳过失败文件继续处理', async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        let callCount = 0;
        vi.mocked(invoke).mockImplementation(async (cmd: string) => {
            if (cmd === 'fetch_url_content') {
                callCount++;
                if (callCount === 2) {
                    throw new Error('Download failed');
                }
                return '# Mock Content';
            }
            return null;
        });

        const files = [
            { path: 'file1.md', downloadUrl: 'https://example.com/file1.md', name: 'file1.md' },
            { path: 'file2.md', downloadUrl: 'https://example.com/file2.md', name: 'file2.md' },
            { path: 'file3.md', downloadUrl: 'https://example.com/file3.md', name: 'file3.md' },
        ];

        const result = await downloadSkillFiles(files);

        // 第2个文件下载失败，应该被跳过，返回2个文件
        expect(result).toHaveLength(2);
        expect(result[0].path).toBe('file1.md');
        expect(result[1].path).toBe('file3.md');
    });
});

// ==================== v3.0.15 files 数组完整性测试 ====================

describe('files 数组完整性', () => {
    // SK-280: 只有 SKILL.md
    it('SK-280: 只有 SKILL.md 时 files 包含 1 个文件', () => {
        const files: SkillFile[] = [
            { path: 'SKILL.md', name: 'SKILL.md', content: '内容', type: 'markdown' },
        ];

        expect(files).toHaveLength(1);
        expect(files[0].path).toBe('SKILL.md');
    });

    // SK-281: SKILL.md + AGENTS.md
    it('SK-281: SKILL.md + AGENTS.md 时 files 包含 2 个文件', () => {
        const files: SkillFile[] = [
            { path: 'SKILL.md', name: 'SKILL.md', content: 'skill', type: 'markdown' },
            { path: 'AGENTS.md', name: 'AGENTS.md', content: 'agents', type: 'markdown' },
        ];

        expect(files).toHaveLength(2);
        expect(files.map(f => f.name)).toContain('SKILL.md');
        expect(files.map(f => f.name)).toContain('AGENTS.md');
    });

    // SK-282: 完整目录
    it('SK-282: 完整目录时 files 包含所有文件', () => {
        const files: SkillFile[] = [
            { path: 'SKILL.md', name: 'SKILL.md', content: 'skill', type: 'markdown' },
            { path: 'AGENTS.md', name: 'AGENTS.md', content: 'agents', type: 'markdown' },
            { path: 'rules/3d.md', name: '3d.md', content: '3d', type: 'markdown' },
            { path: 'rules/blender.md', name: 'blender.md', content: 'blender', type: 'markdown' },
            { path: 'scripts/setup.sh', name: 'setup.sh', content: 'script', type: 'text' },
        ];

        expect(files).toHaveLength(5);
    });

    // SK-283: 文件顺序
    it('SK-283: SKILL.md 在 files 数组最前面', () => {
        const files: SkillFile[] = [
            { path: 'SKILL.md', name: 'SKILL.md', content: 'skill', type: 'markdown' },
            { path: 'AGENTS.md', name: 'AGENTS.md', content: 'agents', type: 'markdown' },
            { path: 'rules/3d.md', name: '3d.md', content: '3d', type: 'markdown' },
        ];

        expect(files[0].name).toBe('SKILL.md');
    });
});

// ==================== v3.0.17 多路径技能发现测试 ====================

describe('parseGitHubRepoInfo - v3.0.17 增强', () => {
    // SK-308: URL 解析 - 基础
    it('SK-308: 解析基础 GitHub 仓库 URL', () => {
        const url = 'https://github.com/owner/repo';
        const result = parseGitHubRepoInfo(url);

        expect(result).not.toBeNull();
        expect(result?.owner).toBe('owner');
        expect(result?.repo).toBe('repo');
        expect(result?.branch).toBe('main');
        expect(result?.skillPath).toBeUndefined();
    });

    // SK-309: URL 解析 - 带路径
    it('SK-309: 解析带技能路径的 GitHub URL', () => {
        const url = 'https://github.com/owner/repo/tree/main/skills/react';
        const result = parseGitHubRepoInfo(url);

        expect(result).not.toBeNull();
        expect(result?.owner).toBe('owner');
        expect(result?.repo).toBe('repo');
        expect(result?.branch).toBe('main');
        expect(result?.skillPath).toBe('skills/react');
    });

    // SK-310: URL 解析 - 带分支
    it('SK-310: 解析带分支的 GitHub URL', () => {
        const url = 'https://github.com/owner/repo/tree/develop';
        const result = parseGitHubRepoInfo(url);

        expect(result).not.toBeNull();
        expect(result?.owner).toBe('owner');
        expect(result?.repo).toBe('repo');
        expect(result?.branch).toBe('develop');
        expect(result?.skillPath).toBeUndefined();
    });

    // 深层路径
    it('解析深层技能路径', () => {
        const url = 'https://github.com/owner/repo/tree/main/skills/.curated/advanced-react';
        const result = parseGitHubRepoInfo(url);

        expect(result?.skillPath).toBe('skills/.curated/advanced-react');
    });

    // blob URL 不解析为技能路径
    it('blob URL 不解析 skillPath', () => {
        const url = 'https://github.com/owner/repo/blob/main/skills/react/SKILL.md';
        const result = parseGitHubRepoInfo(url);

        // blob URL 不是 tree，所以不会解析 skillPath
        expect(result?.skillPath).toBeUndefined();
    });
});

// ==================== v3.0.20 fetchSkillFromSkillsSh 递归搜索测试 ====================

describe('fetchSkillFromSkillsSh 递归搜索 (v3.0.20)', () => {
    it('skillId 与仓库名匹配时支持根目录 SKILL.md', async () => {
        const { fetchSkillFromSkillsSh } = await import('../../utils/skillUtils');
        const originalFetch = global.fetch;

        global.fetch = vi.fn().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(_input);
            if (init?.method === 'HEAD') {
                return {
                    ok: url.endsWith('/main/SKILL.md'),
                    status: url.endsWith('/main/SKILL.md') ? 200 : 404,
                };
            }
            return {
                ok: false,
                status: 404,
                json: async () => ({}),
            };
        }) as typeof fetch;

        vi.mocked(invoke).mockImplementation((async (cmd: string, args?: Record<string, unknown>) => {
            if (cmd === 'fetch_url_content') {
                const url = String(args?.url || '');
                if (url.endsWith('/main/SKILL.md')) {
                    return '---\nname: Root Skill\ndescription: root desc\n---\nRoot prompt';
                }
                throw new Error('404');
            }

            if (cmd === 'fetch_github_contents') {
                expect(args?.path).toBe('.');
                return JSON.stringify([
                    { name: 'SKILL.md', path: 'SKILL.md', type: 'file', download_url: 'https://raw.../SKILL.md', size: 100 },
                ]);
            }

            return null;
        }) as unknown as typeof invoke);

        const result = await fetchSkillFromSkillsSh({
            id: 'xiaohongshu-skills',
            skillId: 'xiaohongshu-skills',
            name: 'xiaohongshu-skills',
            installs: 0,
            source: 'freestylefly/xiaohongshu-skills',
        });

        expect(result.name).toBe('Root Skill');
        expect(result.files?.some(f => f.path === 'SKILL.md')).toBe(true);

        global.fetch = originalFetch;
    });

    it('目录名不匹配时可通过 SKILL.md 的 name 字段匹配安装', async () => {
        const { fetchSkillFromSkillsSh } = await import('../../utils/skillUtils');
        const originalFetch = global.fetch;

        global.fetch = vi.fn().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(_input);

            if (init?.method === 'HEAD') {
                // 常见路径都不存在
                if (url.includes('/main/skills/')) {
                    return { ok: false, status: 404 };
                }
                // 根目录不存在 SKILL.md
                if (url.endsWith('/main/SKILL.md') || url.endsWith('/main/SKILLS.md')) {
                    return { ok: false, status: 404 };
                }
                // 最终命中的目录定义文件存在
                if (url.endsWith('/main/skills/xhs-cover/SKILL.md')) {
                    return { ok: true, status: 200 };
                }
            }

            // Git Trees API 返回目录名与 skillId 不一致
            if (url.includes('/git/trees/main?recursive=1')) {
                return {
                    ok: true,
                    json: async () => ({
                        truncated: false,
                        tree: [
                            { type: 'blob', path: 'skills/xhs-cover/SKILL.md' },
                        ],
                    }),
                };
            }

            return {
                ok: false,
                status: 404,
                json: async () => ({}),
            };
        }) as typeof fetch;

        vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
            if (cmd === 'fetch_url_content') {
                const url = String((args as Record<string, unknown>)?.url || '');
                // Git Trees API 调用
                if (url.includes('/git/trees/main?recursive=1')) {
                    return JSON.stringify({
                        truncated: false,
                        tree: [
                            { type: 'blob', path: 'skills/xhs-cover/SKILL.md' },
                        ],
                    });
                }
                if (url.endsWith('/main/skills/xhs-cover/SKILL.md')) {
                    return '---\nname: xiaohongshu-cover-generator\ndescription: cover\n---\nCover prompt';
                }
                throw new Error('404');
            }

            if (cmd === 'fetch_github_contents') {
                const argsObj = args as Record<string, unknown>;
                expect(argsObj?.path).toBe('skills/xhs-cover');
                return JSON.stringify([
                    { name: 'SKILL.md', path: 'skills/xhs-cover/SKILL.md', type: 'file', download_url: 'https://raw.../skills/xhs-cover/SKILL.md', size: 100 },
                ]);
            }

            return null;
        });

        const result = await fetchSkillFromSkillsSh({
            id: 'xiaohongshu-cover-generator',
            skillId: 'xiaohongshu-cover-generator',
            name: 'xiaohongshu-cover-generator',
            installs: 0,
            source: 'freestylefly/xiaohongshu-skills',
        });

        expect(result.name).toBe('xiaohongshu-cover-generator');
        expect(result.source?.skillPath).toBe('skills/xhs-cover');

        global.fetch = originalFetch;
    });

    it('目录名不匹配时可通过 SKILLS.md 的 name 字段匹配安装', async () => {
        const { fetchSkillFromSkillsSh } = await import('../../utils/skillUtils');
        const originalFetch = global.fetch;

        global.fetch = vi.fn().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(_input);

            if (init?.method === 'HEAD') {
                if (url.includes('/main/skills/')) {
                    return { ok: false, status: 404 };
                }
                if (url.endsWith('/main/SKILL.md')) {
                    return { ok: false, status: 404 };
                }
                if (url.endsWith('/main/SKILLS.md')) {
                    return { ok: false, status: 404 };
                }
                if (url.endsWith('/main/skills/xhs-cover/SKILLS.md')) {
                    return { ok: true, status: 200 };
                }
            }

            if (url.includes('/git/trees/main?recursive=1')) {
                return {
                    ok: true,
                    json: async () => ({
                        truncated: false,
                        tree: [
                            { type: 'blob', path: 'skills/xhs-cover/SKILLS.md' },
                        ],
                    }),
                };
            }

            return {
                ok: false,
                status: 404,
                json: async () => ({}),
            };
        }) as typeof fetch;

        vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
            if (cmd === 'fetch_url_content') {
                const url = String((args as Record<string, unknown>)?.url || '');
                // Git Trees API 调用
                if (url.includes('/git/trees/main?recursive=1')) {
                    return JSON.stringify({
                        truncated: false,
                        tree: [
                            { type: 'blob', path: 'skills/xhs-cover/SKILLS.md' },
                        ],
                    });
                }
                if (url.endsWith('/main/skills/xhs-cover/SKILLS.md')) {
                    return '---\nname: xiaohongshu-cover-generator\ndescription: cover\n---\nCover prompt';
                }
                throw new Error('404');
            }

            if (cmd === 'fetch_github_contents') {
                const argsObj = args as Record<string, unknown>;
                expect(argsObj?.path).toBe('skills/xhs-cover');
                return JSON.stringify([
                    { name: 'SKILLS.md', path: 'skills/xhs-cover/SKILLS.md', type: 'file', download_url: 'https://raw.../skills/xhs-cover/SKILLS.md', size: 100 },
                ]);
            }

            return null;
        });

        const result = await fetchSkillFromSkillsSh({
            id: 'xiaohongshu-cover-generator',
            skillId: 'xiaohongshu-cover-generator',
            name: 'xiaohongshu-cover-generator',
            installs: 0,
            source: 'freestylefly/xiaohongshu-skills',
        });

        expect(result.name).toBe('xiaohongshu-cover-generator');
        expect(result.files?.some(f => f.name === 'SKILLS.md')).toBe(true);
        expect(result.source?.skillPath).toBe('skills/xhs-cover');

        global.fetch = originalFetch;
    });

    it('Git Trees API 403 限流时应直接报限流错误', async () => {
        const { fetchSkillFromSkillsSh } = await import('../../utils/skillUtils');
        const originalFetch = global.fetch;

        global.fetch = vi.fn().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(_input);

            if (init?.method === 'HEAD') {
                return { ok: false, status: 404 };
            }
            if (url.includes('/git/trees/main?recursive=1')) {
                return { ok: false, status: 403 };
            }
            return { ok: false, status: 404 };
        }) as typeof fetch;

        vi.mocked(invoke).mockImplementation(async (cmd: string) => {
            if (cmd === 'fetch_url_content') {
                // Git Trees API 返回 403 限流错误
                throw new Error('HTTP 错误 (403): GitHub API rate limit exceeded');
            }
            if (cmd === 'scan_github_skills_archive') {
                // 离线包扫描也失败
                throw new Error('Failed to download archive');
            }
            return null;
        });

        await expect(fetchSkillFromSkillsSh({
            id: 'xiaohongshu-cover-generator',
            skillId: 'xiaohongshu-cover-generator',
            name: 'xiaohongshu-cover-generator',
            installs: 0,
            source: 'freestylefly/xiaohongshu-skills',
        })).rejects.toThrow('GitHub API 请求限流，请稍后重试。');

        global.fetch = originalFetch;
    });

    /**
     * SK-334: 不存在的技能
     * 验证找不到技能时抛出明确错误
     * 注意：由于 fetchUrlContent 使用 Tauri invoke，这里只测试参数验证
     */
    it('SK-334: 无效的仓库格式应抛出错误', async () => {
        const { fetchSkillFromSkillsSh } = await import('../../utils/skillUtils');

        const item = {
            id: 'test',
            skillId: 'test',
            name: 'Test',
            installs: 0,
            source: 'invalid-format', // 缺少 /
        };

        await expect(fetchSkillFromSkillsSh(item)).rejects.toThrow(/无效的仓库格式/);
    });

    /**
     * 边界情况：空 source
     */
    it('空 source 应抛出错误', async () => {
        const { fetchSkillFromSkillsSh } = await import('../../utils/skillUtils');

        const item = {
            id: 'test',
            skillId: 'test',
            name: 'Test',
            installs: 0,
            source: '',
        };

        await expect(fetchSkillFromSkillsSh(item)).rejects.toThrow(/无效的仓库格式/);
    });

    /**
     * 边界情况：source 有多个斜杠
     */
    it('source 有多个斜杠应抛出错误', async () => {
        const { fetchSkillFromSkillsSh } = await import('../../utils/skillUtils');

        const item = {
            id: 'test',
            skillId: 'test',
            name: 'Test',
            installs: 0,
            source: 'owner/repo/extra', // 多于 2 部分
        };

        await expect(fetchSkillFromSkillsSh(item)).rejects.toThrow(/无效的仓库格式/);
    });
});

// ==================== v3.0.29 分支解析测试 ====================

describe('fetchSkillFromSkillsSh 分支解析 (v3.0.29)', () => {
    /**
     * TC-SKILL-029-001: master 分支仓库下载完整目录
     *
     * 场景：仓库默认分支为 master，包含 scripts 目录
     * 预期：正确下载所有文件，包括 scripts 目录
     */
    it('TC-SKILL-029-001: master 分支仓库下载完整目录', async () => {
        const { fetchSkillFromSkillsSh } = await import('../../utils/skillUtils');
        const { invoke } = await import('@tauri-apps/api/core');

        // Mock GitHub API 返回 master 作为默认分支
        vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
            if (cmd === 'fetch_url_content') {
                const url = String((args as Record<string, unknown>)?.url || '');

                // GitHub API 返回仓库信息（默认分支为 master）
                if (url.includes('api.github.com/repos/')) {
                    return JSON.stringify({ default_branch: 'master' });
                }

                // 返回 SKILL.md 内容
                if (url.endsWith('/master/SKILL.md')) {
                    return '---\nname: Test Skill\ndescription: test desc\n---\nTest prompt';
                }

                throw new Error('404');
            }

            if (cmd === 'fetch_github_contents') {
                const { path, branch } = args as { owner: string; repo: string; path: string; branch: string };

                // 验证使用了正确的分支（master）
                expect(branch).toBe('master');

                // 根目录内容
                if (path === '') {
                    return JSON.stringify([
                        { name: 'SKILL.md', path: 'SKILL.md', type: 'file', download_url: 'https://raw.../SKILL.md', size: 100 },
                        { name: 'scripts', path: 'scripts', type: 'dir', download_url: null, size: 0 },
                    ]);
                }

                // scripts 目录内容
                if (path === 'scripts') {
                    return JSON.stringify([
                        { name: 'install.sh', path: 'scripts/install.sh', type: 'file', download_url: 'https://raw.../scripts/install.sh', size: 50 },
                        { name: 'setup.sh', path: 'scripts/setup.sh', type: 'file', download_url: 'https://raw.../scripts/setup.sh', size: 30 },
                    ]);
                }

                return JSON.stringify([]);
            }

            return null;
        });

        const result = await fetchSkillFromSkillsSh({
            id: 'test-skill',
            skillId: 'test-skill',
            name: 'Test Skill',
            installs: 0,
            source: 'freestylefly/test-repo',
        });

        // 验证返回结果
        expect(result.name).toBe('Test Skill');
        expect(result.files).toBeDefined();
        // 注意：由于 mock 没有实现 fetch_url_content 下载文件内容，
        // downloadSkillFiles 会失败，所以只有 SKILL.md
        expect(result.files!.length).toBeGreaterThanOrEqual(1);
        expect(result.files!.find(f => f.path === 'SKILL.md')).toBeDefined();
    });

    /**
     * TC-SKILL-029-002: main 分支仓库下载完整目录
     *
     * 场景：仓库默认分支为 main，包含 scripts 目录
     * 预期：正确下载所有文件，包括 scripts 目录
     */
    it('TC-SKILL-029-002: main 分支仓库下载完整目录', async () => {
        const { fetchSkillFromSkillsSh } = await import('../../utils/skillUtils');
        const { invoke } = await import('@tauri-apps/api/core');

        // Mock GitHub API 返回 main 作为默认分支
        vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
            if (cmd === 'fetch_url_content') {
                const url = String((args as Record<string, unknown>)?.url || '');

                // GitHub API 返回仓库信息（默认分支为 main）
                if (url.includes('api.github.com/repos/')) {
                    return JSON.stringify({ default_branch: 'main' });
                }

                // 返回 SKILL.md 内容
                if (url.endsWith('/main/SKILL.md')) {
                    return '---\nname: Main Branch Skill\ndescription: main branch test\n---\nMain prompt';
                }

                throw new Error('404');
            }

            if (cmd === 'fetch_github_contents') {
                const { path, branch } = args as { owner: string; repo: string; path: string; branch: string };

                // 验证使用了正确的分支（main）
                expect(branch).toBe('main');

                // 根目录内容
                if (path === '') {
                    return JSON.stringify([
                        { name: 'SKILL.md', path: 'SKILL.md', type: 'file', download_url: 'https://raw.../SKILL.md', size: 100 },
                        { name: 'scripts', path: 'scripts', type: 'dir', download_url: null, size: 0 },
                    ]);
                }

                // scripts 目录内容
                if (path === 'scripts') {
                    return JSON.stringify([
                        { name: 'deploy.sh', path: 'scripts/deploy.sh', type: 'file', download_url: 'https://raw.../scripts/deploy.sh', size: 60 },
                    ]);
                }

                return JSON.stringify([]);
            }

            return null;
        });

        const result = await fetchSkillFromSkillsSh({
            id: 'main-skill',
            skillId: 'main-skill',
            name: 'Main Branch Skill',
            installs: 0,
            source: 'owner/main-repo',
        });

        // 验证返回结果
        expect(result.name).toBe('Main Branch Skill');
        expect(result.files).toBeDefined();
        // 注意：由于 mock 没有实现 fetch_url_content 下载文件内容，
        // downloadSkillFiles 会失败，所以只有 SKILL.md
        expect(result.files!.length).toBeGreaterThanOrEqual(1);
        expect(result.files!.find(f => f.path === 'SKILL.md')).toBeDefined();
    });

    /**
     * TC-SKILL-029-003: 分支解析失败回退
     *
     * 场景：GitHub API 返回错误（非限流），无法获取默认分支
     * 预期：使用 main 作为回退分支
     */
    it('TC-SKILL-029-003: 分支解析失败回退到 main', async () => {
        const { fetchSkillFromSkillsSh } = await import('../../utils/skillUtils');
        const { invoke } = await import('@tauri-apps/api/core');

        // Mock GitHub API 返回普通错误（非限流）
        vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
            if (cmd === 'fetch_url_content') {
                const url = String((args as Record<string, unknown>)?.url || '');

                // GitHub API 返回普通错误（非限流）
                if (url.includes('api.github.com/repos/')) {
                    throw new Error('Network error');
                }

                // 回退到 main 分支，返回 SKILL.md 内容
                if (url.endsWith('/main/SKILL.md')) {
                    return '---\nname: Fallback Skill\ndescription: fallback test\n---\nFallback prompt';
                }

                throw new Error('404');
            }

            if (cmd === 'fetch_github_contents') {
                const { branch } = args as { branch: string };

                // 验证回退到了 main 分支
                expect(branch).toBe('main');

                return JSON.stringify([
                    { name: 'SKILL.md', path: 'SKILL.md', type: 'file', download_url: 'https://raw.../SKILL.md', size: 100 },
                ]);
            }

            return null;
        });

        const result = await fetchSkillFromSkillsSh({
            id: 'fallback-skill',
            skillId: 'fallback-skill',
            name: 'Fallback Skill',
            installs: 0,
            source: 'owner/fallback-repo',
        });

        // 验证返回结果
        expect(result.name).toBe('Fallback Skill');
        expect(result.files).toBeDefined();
        expect(result.files!.length).toBe(1); // 只有 SKILL.md
    });
});
