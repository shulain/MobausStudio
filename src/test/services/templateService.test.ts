/**
 * Agent 模板服务单元测试
 *
 * 测试用例对应文档 docs/modules/templates.md 中的：
 * - TC-TPL-001 ~ TC-TPL-014: 模板解析和安装测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    parseTemplate,
    getRequiredVariables,
    installTemplate,
} from '../../services/templateService';
import {
    fetchSkillFromRegistry,
    fetchSkillRegistry,
    parseSkillMd,
} from '../../utils/skillUtils';
import type {
    AgentTemplatePackage,
    MCPServer,
    Skill,
    SkillTemplate,
    Agent,
} from '../../types';
import { TemplateParseError } from '../../types';

vi.mock('../../utils/skillUtils', async () => {
    const actual = await vi.importActual<typeof import('../../utils/skillUtils')>('../../utils/skillUtils');
    return {
        ...actual,
        fetchSkillRegistry: vi.fn(),
        fetchSkillFromRegistry: vi.fn(),
        parseSkillMd: vi.fn(),
    };
});

// ==================== 测试数据 ====================

/**
 * 创建有效的测试模板
 */
function createValidTemplate(overrides: Partial<AgentTemplatePackage> = {}): AgentTemplatePackage {
    return {
        id: 'test-template',
        name: '测试模板',
        version: '1.0.0',
        description: '用于测试的模板',
        components: {
            mcpServers: [
                {
                    id: 'test-mcp',
                    name: '测试 MCP',
                    command: 'npx',
                    args: ['-y', '@test/mcp-server'],
                    description: '测试用 MCP 服务器',
                },
            ],
            skills: [
                {
                    inline: {
                        id: 'test-skill',
                        name: '测试技能',
                        content: '这是测试技能的内容',
                        description: '测试用技能',
                    },
                },
            ],
            agents: [
                {
                    id: 'test-agent',
                    name: '测试 Agent',
                    description: '测试用 Agent',
                    systemPrompt: '你是一个测试助手',
                    model: 'claude-3-5-sonnet',
                    mcpServerIds: ['test-mcp'],
                    skillIds: ['test-skill'],
                },
            ],
        },
        ...overrides,
    };
}

/**
 * 创建带变量的测试模板
 */
function createTemplateWithVariables(): AgentTemplatePackage {
    return {
        id: 'var-template',
        name: '带变量的模板',
        version: '1.0.0',
        description: '包含变量的测试模板',
        components: {
            mcpServers: [
                {
                    id: 'github-mcp',
                    name: 'GitHub MCP',
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-github'],
                    env: {
                        GITHUB_TOKEN: '${GITHUB_TOKEN}',
                    },
                },
                {
                    id: 'fs-mcp',
                    name: '文件系统 MCP',
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-filesystem', '${WORKSPACE_PATH}'],
                },
            ],
            agents: [
                {
                    id: 'dev-agent',
                    name: '开发助手',
                    systemPrompt: '你是一个开发助手，工作目录是 ${WORKSPACE_PATH}',
                },
            ],
        },
    };
}

function createTemplateWithRemoteSkill(skillTemplate: Partial<SkillTemplate> = {}): AgentTemplatePackage {
    return {
        id: 'remote-template',
        name: '远程技能模板',
        version: '1.0.0',
        description: '包含远程技能 URL 的模板',
        components: {
            skills: [
                {
                    url: 'https://example.com/skills/remote-skill.json',
                    ...skillTemplate,
                },
            ],
        },
    };
}

const mockFetch = vi.fn();

// ==================== parseTemplate 测试 ====================

describe('parseTemplate', () => {
    // TC-TPL-001: 解析有效模板
    it('TC-TPL-001: 解析有效模板返回 AgentTemplatePackage 对象', async () => {
        const template = createValidTemplate();
        const jsonString = JSON.stringify(template);

        const result = await parseTemplate(jsonString);

        expect(result).toBeDefined();
        expect(result.id).toBe('test-template');
        expect(result.name).toBe('测试模板');
        expect(result.version).toBe('1.0.0');
        expect(result.components.mcpServers).toHaveLength(1);
        expect(result.components.skills).toHaveLength(1);
        expect(result.components.agents).toHaveLength(1);
    });

    // TC-TPL-002: 解析无效 JSON
    it('TC-TPL-002: 解析无效 JSON 抛出 TemplateParseError', async () => {
        const invalidJson = '{ invalid json }';

        await expect(parseTemplate(invalidJson)).rejects.toThrow(TemplateParseError);
    });

    // TC-TPL-003: 缺少必填字段
    it('TC-TPL-003: 缺少 id 字段抛出验证错误', async () => {
        const template = createValidTemplate();
        // @ts-expect-error 故意删除 id 字段
        delete template.id;
        const jsonString = JSON.stringify(template);

        await expect(parseTemplate(jsonString)).rejects.toThrow(TemplateParseError);
        try {
            await parseTemplate(jsonString);
        } catch (error) {
            expect(error).toBeInstanceOf(TemplateParseError);
            expect((error as TemplateParseError).details).toContain('缺少必填字段: id');
        }
    });

    // TC-TPL-012: 空模板安装
    it('TC-TPL-012: 空 components 的模板可以解析', async () => {
        const template: AgentTemplatePackage = {
            id: 'empty-template',
            name: '空模板',
            version: '1.0.0',
            description: '没有组件的模板',
            components: {},
        };
        const jsonString = JSON.stringify(template);

        const result = await parseTemplate(jsonString);

        expect(result).toBeDefined();
        expect(result.components.mcpServers).toBeUndefined();
        expect(result.components.skills).toBeUndefined();
        expect(result.components.agents).toBeUndefined();
    });
});

// ==================== getRequiredVariables 测试 ====================

describe('getRequiredVariables', () => {
    // TC-TPL-011: 获取变量列表
    it('TC-TPL-011: 返回去重的变量名列表', () => {
        const template = createTemplateWithVariables();

        const variables = getRequiredVariables(template);

        expect(variables).toHaveLength(2);
        expect(variables.map((v) => v.name)).toContain('GITHUB_TOKEN');
        expect(variables.map((v) => v.name)).toContain('WORKSPACE_PATH');
    });

    it('变量类型推断正确', () => {
        const template = createTemplateWithVariables();

        const variables = getRequiredVariables(template);

        const tokenVar = variables.find((v) => v.name === 'GITHUB_TOKEN');
        const pathVar = variables.find((v) => v.name === 'WORKSPACE_PATH');

        expect(tokenVar?.type).toBe('secret');
        expect(pathVar?.type).toBe('path');
    });

    it('无变量的模板返回空数组', () => {
        const template: AgentTemplatePackage = {
            id: 'no-var-template',
            name: '无变量模板',
            version: '1.0.0',
            description: '没有变量的模板',
            components: {
                agents: [
                    {
                        id: 'simple-agent',
                        name: '简单 Agent',
                        systemPrompt: '你是一个助手',
                    },
                ],
            },
        };

        const variables = getRequiredVariables(template);

        expect(variables).toHaveLength(0);
    });
});

// ==================== installTemplate 测试 ====================

describe('installTemplate', () => {
    // Mock handlers
    const mockHandlers = {
        getMCPServers: vi.fn(() => [] as MCPServer[]),
        getSkills: vi.fn(() => [] as Skill[]),
        getAgents: vi.fn(() => [] as Agent[]),
        createMCPServer: vi.fn(),
        createSkill: vi.fn(),
        createAgent: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockHandlers.getMCPServers.mockReturnValue([]);
        mockHandlers.getSkills.mockReturnValue([]);
        mockHandlers.getAgents.mockReturnValue([]);

        (globalThis as { fetch: typeof fetch }).fetch = mockFetch as typeof fetch;
        mockFetch.mockReset();

        // 重置 skillUtils mock
        vi.mocked(fetchSkillRegistry).mockReset();
        vi.mocked(fetchSkillFromRegistry).mockReset();
        vi.mocked(parseSkillMd).mockReset();
    });

    afterEach(() => {
        // 测试结束后清空 fetch mock
        mockFetch.mockReset();
    });

    // TC-TPL-URL-001: registry 成功时使用第一项技能安装
    it('TC-TPL-URL-001: registry 成功时使用注册表技能', async () => {
        const template = createTemplateWithRemoteSkill();

        vi.mocked(fetchSkillRegistry).mockResolvedValue({
            name: 'remote-repo',
            version: '1.0.0',
            skills: [
                {
                    id: 'remote-skill',
                    name: 'Remote Skill',
                    description: 'Remote Skill Desc',
                    version: '1.0.0',
                    tags: ['coding'],
                    skill: {
                        name: '远程技能',
                        description: '来自 registry 的技能',
                        category: 'coding',
                        promptTemplate: '这是远程技能的提示词',
                    },
                },
            ],
        });

        vi.mocked(fetchSkillFromRegistry).mockResolvedValue({
            name: '远程技能',
            description: '来自 registry 的技能',
            category: 'coding',
            promptTemplate: '这是远程技能的提示词',
        });

        await installTemplate(template, {}, mockHandlers);

        expect(mockHandlers.createSkill).toHaveBeenCalledWith(
            expect.objectContaining({
                name: '远程技能',
                promptTemplate: '这是远程技能的提示词',
                source: expect.objectContaining({
                    type: 'url',
                    repoUrl: template.components.skills?.[0].url,
                }),
            })
        );
    });

    // TC-TPL-URL-002: fallback 到直接 JSON 时安装成功
    it('TC-TPL-URL-002: 远程技能 JSON 解析 fallback', async () => {
        const template = createTemplateWithRemoteSkill();

        vi.mocked(fetchSkillRegistry).mockRejectedValue(new Error('registry parse failed'));

        mockFetch.mockResolvedValue({
            text: async () =>
                JSON.stringify({
                    name: 'JSON 技能',
                    description: '从 JSON 安装',
                    category: 'analysis',
                    promptTemplate: '这是 JSON 技能内容',
                }),
            ok: true,
            json: async () => ({}),
        } as Response);

        await installTemplate(template, {}, mockHandlers);

        expect(mockHandlers.createSkill).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'JSON 技能',
                description: '从 JSON 安装',
                category: 'analysis',
                promptTemplate: '这是 JSON 技能内容',
                source: expect.objectContaining({
                    type: 'url',
                    repoUrl: template.components.skills?.[0].url,
                }),
            })
        );
    });

    // TC-TPL-URL-003: SKILL.md fallback 解析成功
    it('TC-TPL-URL-003: 远程技能 SKILL.md fallback', async () => {
        const template = createTemplateWithRemoteSkill();

        vi.mocked(fetchSkillRegistry).mockRejectedValue(new Error('registry not found'));
        vi.mocked(fetchSkillFromRegistry).mockRejectedValue(new Error('skip item fetch'));

        mockFetch.mockResolvedValue({
            text: async () => '# fallback skill',
            ok: true,
            json: async () => ({}),
        } as Response);

        vi.mocked(parseSkillMd).mockReturnValue({
            name: 'SkillMd 技能',
            description: '来自 SKILL.md',
            promptTemplate: '这是 Markdown 技能内容',
            frontmatter: {},
        });

        await installTemplate(template, {}, mockHandlers);

        expect(parseSkillMd).toHaveBeenCalled();
        expect(mockHandlers.createSkill).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'SkillMd 技能',
                description: '来自 SKILL.md',
                promptTemplate: '这是 Markdown 技能内容',
                category: 'custom',
                source: expect.objectContaining({
                    type: 'url',
                    repoUrl: template.components.skills?.[0].url,
                }),
            })
        );
    });

    // TC-TPL-004: 安装 MCP 服务器
    it('TC-TPL-004: MCP 服务器添加到 mcpServersStorage', async () => {
        const template = createValidTemplate();

        const result = await installTemplate(template, {}, mockHandlers);

        expect(mockHandlers.createMCPServer).toHaveBeenCalledTimes(1);
        expect(result.installed.mcpServers).toContain('test-mcp');
    });

    // TC-TPL-006: 安装技能(内联)
    it('TC-TPL-006: 内联技能直接安装', async () => {
        const template = createValidTemplate();

        const result = await installTemplate(template, {}, mockHandlers);

        expect(mockHandlers.createSkill).toHaveBeenCalledTimes(1);
        expect(mockHandlers.createSkill).toHaveBeenCalledWith(
            expect.objectContaining({
                name: '测试技能',
                promptTemplate: '这是测试技能的内容',
            })
        );
        expect(result.installed.skills).toContain('测试技能');
    });

    // TC-TPL-007: 安装 Agent
    it('TC-TPL-007: Agent 添加到 agentsStorage', async () => {
        const template = createValidTemplate();

        const result = await installTemplate(template, {}, mockHandlers);

        expect(mockHandlers.createAgent).toHaveBeenCalledTimes(1);
        expect(mockHandlers.createAgent).toHaveBeenCalledWith(
            expect.objectContaining({
                name: '测试 Agent',
                systemPrompt: '你是一个测试助手',
            })
        );
        expect(result.installed.agents).toContain('test-agent');
    });

    // TC-TPL-008: 变量替换
    it('TC-TPL-008: 正确替换变量值', async () => {
        const template = createTemplateWithVariables();

        await installTemplate(
            template,
            {
                variables: {
                    GITHUB_TOKEN: 'my-token-123',
                    WORKSPACE_PATH: '/home/user/project',
                },
            },
            mockHandlers
        );

        // 检查 MCP 服务器的环境变量被替换
        expect(mockHandlers.createMCPServer).toHaveBeenCalledWith(
            expect.objectContaining({
                env: { GITHUB_TOKEN: 'my-token-123' },
            })
        );

        // 检查 Agent 的系统提示词被替换
        expect(mockHandlers.createAgent).toHaveBeenCalledWith(
            expect.objectContaining({
                systemPrompt: expect.stringContaining('/home/user/project'),
            })
        );
    });

    // TC-TPL-009: ID 冲突-覆盖
    it('TC-TPL-009: 默认情况下覆盖现有组件', async () => {
        const template = createValidTemplate();

        // 模拟已存在同 ID 的 MCP 服务器
        mockHandlers.getMCPServers.mockReturnValue([
            { id: 'test-mcp', name: '已存在的 MCP' } as MCPServer,
        ]);

        const result = await installTemplate(template, { skipExisting: false }, mockHandlers);

        expect(mockHandlers.createMCPServer).toHaveBeenCalledTimes(1);
        expect(result.installed.mcpServers).toContain('test-mcp');
        expect(result.skipped.mcpServers).toHaveLength(0);
    });

    // TC-TPL-010: ID 冲突-跳过
    it('TC-TPL-010: skipExisting=true 时跳过已存在组件', async () => {
        const template = createValidTemplate();

        // 模拟已存在同名的 MCP 服务器（代码按 name 匹配，不是按 id）
        mockHandlers.getMCPServers.mockReturnValue([
            { id: 'existing-mcp-id', name: '测试 MCP' } as MCPServer,
        ]);

        const result = await installTemplate(template, { skipExisting: true }, mockHandlers);

        expect(mockHandlers.createMCPServer).not.toHaveBeenCalled();
        expect(result.skipped.mcpServers).toContain('test-mcp');
        expect(result.installed.mcpServers).toHaveLength(0);
    });

    // TC-TPL-013: 部分安装失败
    it('TC-TPL-013: 返回部分成功结果和错误信息', async () => {
        const template = createValidTemplate();

        // 模拟 MCP 创建失败
        mockHandlers.createMCPServer.mockRejectedValue(new Error('MCP 创建失败'));

        const result = await installTemplate(template, {}, mockHandlers);

        expect(result.success).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toEqual({
            component: 'mcpServer',
            id: 'test-mcp',
            error: 'MCP 创建失败',
        });
        // 其他组件应该继续安装
        expect(mockHandlers.createSkill).toHaveBeenCalled();
        expect(mockHandlers.createAgent).toHaveBeenCalled();
    });

    // TC-TPL-014: 预览模式
    it('TC-TPL-014: dryRun=true 时不实际安装，返回预览结果', async () => {
        const template = createValidTemplate();

        const result = await installTemplate(template, { dryRun: true }, mockHandlers);

        expect(mockHandlers.createMCPServer).not.toHaveBeenCalled();
        expect(mockHandlers.createSkill).not.toHaveBeenCalled();
        expect(mockHandlers.createAgent).not.toHaveBeenCalled();

        // 但应该返回将要安装的组件列表
        expect(result.installed.mcpServers).toContain('test-mcp');
        expect(result.installed.agents).toContain('test-agent');
    });

    // TC-TPL-012: 空模板安装
    it('TC-TPL-012: 空 components 安装成功但无内容', async () => {
        const template: AgentTemplatePackage = {
            id: 'empty-template',
            name: '空模板',
            version: '1.0.0',
            description: '没有组件的模板',
            components: {},
        };

        const result = await installTemplate(template, {}, mockHandlers);

        expect(result.success).toBe(true);
        expect(result.installed.mcpServers).toHaveLength(0);
        expect(result.installed.skills).toHaveLength(0);
        expect(result.installed.agents).toHaveLength(0);
    });
});

// ==================== 模板验证测试 ====================

describe('模板验证', () => {
    it('MCP 服务器模板缺少 command 字段时报错', async () => {
        const template = createValidTemplate();
        // @ts-expect-error 故意删除 command 字段
        delete template.components.mcpServers![0].command;
        const jsonString = JSON.stringify(template);

        await expect(parseTemplate(jsonString)).rejects.toThrow(TemplateParseError);
    });

    it('技能模板必须有 url 或 inline 其中之一', async () => {
        const template = createValidTemplate();
        template.components.skills = [{}]; // 空的技能模板
        const jsonString = JSON.stringify(template);

        await expect(parseTemplate(jsonString)).rejects.toThrow(TemplateParseError);
    });

    it('Agent 模板缺少 systemPrompt 字段时报错', async () => {
        const template = createValidTemplate();
        // @ts-expect-error 故意删除 systemPrompt 字段
        delete template.components.agents![0].systemPrompt;
        const jsonString = JSON.stringify(template);

        await expect(parseTemplate(jsonString)).rejects.toThrow(TemplateParseError);
    });
});
