/**
 * Agent 模板服务
 *
 * 提供一键安装 Agent 配置模板的功能，类似 skills.sh 的体验。
 * 用户可以从模板市场选择预设模板，一键安装所有依赖组件（MCP 服务器、技能、Agent 配置）。
 *
 * @module services/templateService
 */

import { invoke } from '@tauri-apps/api/core';
import type {
    AgentTemplatePackage,
    MCPServerTemplate,
    SkillTemplate,
    AgentTemplate,
    TemplateInstallOptions,
    TemplateInstallResult,
    TemplateVariable,
    MCPServerCreateInput,
    SkillCreateInput,
    AgentCreateInput,
    MCPServer,
    Skill,
    Agent,
} from '../types';
import { TemplateParseError } from '../types';
import { logger, LogTags } from '../utils/logger';

// ==================== 常量定义 ====================

/**
 * 模板变量占位符正则表达式
 * 匹配 ${VAR_NAME} 格式的变量
 */
const VARIABLE_PATTERN = /\$\{([A-Z_][A-Z0-9_]*)\}/g;

/**
 * 默认模板文件名
 * 当用户输入 GitHub 仓库地址时，自动查找此文件
 */
const DEFAULT_TEMPLATE_FILENAME = 'mobaus-template.json';

/**
 * GitHub URL 正则表达式
 * 匹配各种 GitHub 地址格式
 */
const GITHUB_PATTERNS = {
    // https://github.com/user/repo
    repo: /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/,
    // https://github.com/user/repo/blob/main/path/to/file.json
    blob: /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/,
    // https://github.com/user/repo/tree/main/path/to/dir
    tree: /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/,
    // https://raw.githubusercontent.com/user/repo/branch/path
    raw: /^https?:\/\/raw\.githubusercontent\.com\//,
};

/**
 * GitHub API 基础 URL
 */
const GITHUB_API_BASE = 'https://api.github.com';

/**
 * 发现的模板信息
 */
export interface DiscoveredTemplate {
    /** 模板名称 */
    name: string;
    /** 模板描述 */
    description: string;
    /** 模板版本 */
    version: string;
    /** 文件路径 */
    path: string;
    /** raw URL */
    rawUrl: string;
    /** GitHub 页面 URL */
    htmlUrl: string;
    /** 模板图标 */
    icon?: string;
    /** 作者 */
    author?: string;
    /** 组件数量统计 */
    stats: {
        mcpServers: number;
        skills: number;
        agents: number;
    };
}

/**
 * 预定义的系统变量
 */
const SYSTEM_VARIABLES: Record<string, () => string> = {
    HOME: () => {
        // 在 Tauri 环境中获取用户主目录
        if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
            // 异步获取，这里返回占位符，实际使用时需要替换
            return '${HOME}';
        }
        return '';
    },
};

// ==================== 日志工具 ====================

/**
 * 模板服务日志标签
 */
const LOG_TAG = LogTags.SKILL; // 复用 SKILL 标签，因为模板与技能相关

function logDebug(message: string, ...args: unknown[]): void {
    logger.debug(LOG_TAG, `[Template] ${message}`, ...args);
}

function logInfo(message: string, ...args: unknown[]): void {
    logger.info(LOG_TAG, `[Template] ${message}`, ...args);
}

function logError(message: string, ...args: unknown[]): void {
    logger.error(LOG_TAG, `[Template] ${message}`, ...args);
}

// ==================== URL 转换函数 ====================

/**
 * 将 GitHub URL 转换为 raw 文件 URL
 *
 * 支持的格式：
 * - https://github.com/user/repo → 自动查找 mobaus-template.json
 * - https://github.com/user/repo/blob/main/path/file.json → raw URL
 * - https://github.com/user/repo/tree/main/templates → 目录下的 mobaus-template.json
 *
 * @param url - 原始 URL
 * @returns 转换后的 raw URL
 */
function convertGitHubUrl(url: string): string {
    // 已经是 raw URL，直接返回
    if (GITHUB_PATTERNS.raw.test(url)) {
        return url;
    }

    // 匹配 blob URL: github.com/user/repo/blob/branch/path/file.json
    const blobMatch = url.match(GITHUB_PATTERNS.blob);
    if (blobMatch) {
        const [, user, repo, branch, path] = blobMatch;
        return `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${path}`;
    }

    // 匹配 tree URL: github.com/user/repo/tree/branch/path
    const treeMatch = url.match(GITHUB_PATTERNS.tree);
    if (treeMatch) {
        const [, user, repo, branch, path] = treeMatch;
        return `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${path}/${DEFAULT_TEMPLATE_FILENAME}`;
    }

    // 匹配仓库根目录: github.com/user/repo
    const repoMatch = url.match(GITHUB_PATTERNS.repo);
    if (repoMatch) {
        const [, user, repo] = repoMatch;
        // 默认使用 main 分支，查找根目录的模板文件
        return `https://raw.githubusercontent.com/${user}/${repo}/main/${DEFAULT_TEMPLATE_FILENAME}`;
    }

    // 不是 GitHub URL，原样返回
    return url;
}

/**
 * 获取 URL 内容
 * 优先使用 Tauri 命令（绕过 CORS），失败时回退到 fetch
 *
 * @param url - 要获取的 URL
 * @returns 响应内容
 */
async function fetchUrlContent(url: string): Promise<string> {
    // 先尝试使用 Tauri 命令
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        try {
            const content = await invoke<string>('fetch_url_content', { url });
            return content;
        } catch (tauriError) {
            logDebug('Tauri fetch 失败，回退到浏览器 fetch', { error: tauriError });
            // Tauri 命令不存在或失败，继续尝试 fetch
        }
    }

    // 使用浏览器 fetch
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.text();
}

// ==================== GitHub 仓库扫描 ====================

/**
 * GitHub API 文件树节点
 */
interface GitHubTreeNode {
    path: string;
    mode: string;
    type: 'blob' | 'tree';
    sha: string;
    size?: number;
    url: string;
}

/**
 * GitHub API 文件树响应
 */
interface GitHubTreeResponse {
    sha: string;
    url: string;
    tree: GitHubTreeNode[];
    truncated: boolean;
}

/**
 * 验证 JSON 内容是否为有效的模板格式
 *
 * @param content - JSON 内容
 * @returns 解析后的模板（如果有效）或 null
 */
function validateTemplateContent(content: string): AgentTemplatePackage | null {
    try {
        const json = JSON.parse(content);

        // 检查必需字段
        if (
            typeof json.id === 'string' &&
            typeof json.name === 'string' &&
            typeof json.version === 'string' &&
            typeof json.description === 'string' &&
            json.components &&
            typeof json.components === 'object'
        ) {
            // 检查 components 中至少有一个有效数组
            const hasValidComponents =
                (Array.isArray(json.components.mcpServers) && json.components.mcpServers.length > 0) ||
                (Array.isArray(json.components.skills) && json.components.skills.length > 0) ||
                (Array.isArray(json.components.agents) && json.components.agents.length > 0);

            if (hasValidComponents) {
                return json as AgentTemplatePackage;
            }
        }
    } catch {
        // JSON 解析失败，不是有效模板
    }
    return null;
}

/**
 * 从 GitHub 仓库发现所有模板文件
 *
 * 通过 GitHub API 遍历仓库中的所有 JSON 文件，
 * 检查每个文件是否符合模板格式，返回所有有效模板的列表。
 *
 * @param repoUrl - GitHub 仓库 URL (https://github.com/user/repo)
 * @returns 发现的模板列表
 *
 * @example
 * const templates = await discoverTemplatesFromRepo('https://github.com/user/templates');
 * // 返回仓库中所有有效的模板文件
 */
export async function discoverTemplatesFromRepo(repoUrl: string): Promise<DiscoveredTemplate[]> {
    // 解析仓库信息
    const repoMatch = repoUrl.match(GITHUB_PATTERNS.repo);
    if (!repoMatch) {
        throw new TemplateParseError('无效的 GitHub 仓库地址', [
            `URL: ${repoUrl}`,
            '请使用格式: https://github.com/用户名/仓库名',
        ]);
    }

    const [, owner, repo] = repoMatch;
    logInfo('开始扫描 GitHub 仓库', { owner, repo });

    const discoveredTemplates: DiscoveredTemplate[] = [];

    // 尝试获取仓库的默认分支
    let defaultBranch = 'main';
    try {
        const repoInfoUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}`;
        const repoInfoResponse = await fetch(repoInfoUrl);
        if (repoInfoResponse.ok) {
            const repoInfo = await repoInfoResponse.json();
            defaultBranch = repoInfo.default_branch || 'main';
        }
    } catch {
        logDebug('无法获取仓库信息，使用默认分支 main');
    }

    // 获取仓库文件树
    const treeUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`;
    logDebug('获取文件树', { url: treeUrl });

    let treeResponse: Response;
    try {
        treeResponse = await fetch(treeUrl);
        if (!treeResponse.ok) {
            throw new Error(`HTTP ${treeResponse.status}`);
        }
    } catch (error) {
        throw new TemplateParseError('无法获取仓库文件列表', [
            `仓库: ${owner}/${repo}`,
            `错误: ${error instanceof Error ? error.message : String(error)}`,
            '',
            '可能的原因:',
            '  - 仓库不存在或为私有仓库',
            '  - GitHub API 访问限制',
        ]);
    }

    const treeData: GitHubTreeResponse = await treeResponse.json();

    // 筛选所有 JSON 文件
    const jsonFiles = treeData.tree.filter(
        (node) => node.type === 'blob' && node.path.endsWith('.json')
    );

    logInfo('找到 JSON 文件', { count: jsonFiles.length });

    // 并行检查每个 JSON 文件（限制并发数）
    const CONCURRENCY_LIMIT = 5;
    const chunks: GitHubTreeNode[][] = [];
    for (let i = 0; i < jsonFiles.length; i += CONCURRENCY_LIMIT) {
        chunks.push(jsonFiles.slice(i, i + CONCURRENCY_LIMIT));
    }

    for (const chunk of chunks) {
        const results = await Promise.allSettled(
            chunk.map(async (file) => {
                const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${file.path}`;
                const htmlUrl = `https://github.com/${owner}/${repo}/blob/${defaultBranch}/${file.path}`;

                try {
                    const content = await fetchUrlContent(rawUrl);
                    const template = validateTemplateContent(content);

                    if (template) {
                        logDebug('发现有效模板', { path: file.path, name: template.name });

                        return {
                            name: template.name,
                            description: template.description,
                            version: template.version,
                            path: file.path,
                            rawUrl,
                            htmlUrl,
                            icon: template.icon,
                            author: template.author,
                            stats: {
                                mcpServers: template.components.mcpServers?.length || 0,
                                skills: template.components.skills?.length || 0,
                                agents: template.components.agents?.length || 0,
                            },
                        } as DiscoveredTemplate;
                    }
                } catch {
                    // 文件获取失败，跳过
                }
                return null;
            })
        );

        // 收集成功的结果
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                discoveredTemplates.push(result.value);
            }
        }
    }

    logInfo('仓库扫描完成', {
        totalJsonFiles: jsonFiles.length,
        validTemplates: discoveredTemplates.length,
    });

    return discoveredTemplates;
}

/**
 * 判断 URL 是否为 GitHub 仓库地址（非具体文件）
 */
export function isGitHubRepoUrl(url: string): boolean {
    return GITHUB_PATTERNS.repo.test(url);
}

// ==================== 解析函数 ====================

/**
 * 解析模板文件
 *
 * 支持多种输入格式：
 * - JSON 字符串：直接解析
 * - 普通 URL：直接获取
 * - GitHub 仓库地址：自动转换为 raw URL
 * - GitHub blob/tree 地址：自动转换为 raw URL
 *
 * @param source - URL 字符串或 JSON 字符串
 * @returns 解析后的模板包
 * @throws TemplateParseError - 解析失败时抛出
 *
 * @example
 * // 从 GitHub 仓库安装
 * parseTemplate('https://github.com/user/templates')
 *
 * @example
 * // 从具体文件安装
 * parseTemplate('https://github.com/user/repo/blob/main/coding-assistant.json')
 */
export async function parseTemplate(source: string): Promise<AgentTemplatePackage> {
    logInfo('开始解析模板', { sourceLength: source.length });

    let jsonContent: string;

    // 判断是 URL 还是 JSON 字符串
    if (source.startsWith('http://') || source.startsWith('https://')) {
        // 转换 GitHub URL
        const rawUrl = convertGitHubUrl(source);
        logDebug('从 URL 获取模板', { originalUrl: source, rawUrl });

        try {
            jsonContent = await fetchUrlContent(rawUrl);
        } catch (error) {
            // 如果是 GitHub 仓库地址且默认文件不存在，尝试其他常见文件名
            if (source !== rawUrl && GITHUB_PATTERNS.repo.test(source)) {
                const repoMatch = source.match(GITHUB_PATTERNS.repo);
                if (repoMatch) {
                    const [, user, repo] = repoMatch;
                    const alternativeUrls = [
                        `https://raw.githubusercontent.com/${user}/${repo}/main/template.json`,
                        `https://raw.githubusercontent.com/${user}/${repo}/master/${DEFAULT_TEMPLATE_FILENAME}`,
                        `https://raw.githubusercontent.com/${user}/${repo}/master/template.json`,
                    ];

                    for (const altUrl of alternativeUrls) {
                        try {
                            logDebug('尝试备选 URL', { url: altUrl });
                            jsonContent = await fetchUrlContent(altUrl);
                            break;
                        } catch {
                            // 继续尝试下一个
                        }
                    }
                }
            }

            // 如果还是没有获取到内容，抛出错误
            if (!jsonContent!) {
                throw new TemplateParseError(
                    '无法获取模板文件',
                    [
                        `URL: ${source}`,
                        `尝试的 raw URL: ${rawUrl}`,
                        `错误: ${error instanceof Error ? error.message : String(error)}`,
                        '',
                        '提示: 请确保 URL 指向有效的模板 JSON 文件',
                        '支持的格式:',
                        '  - https://github.com/user/repo (自动查找 mobaus-template.json)',
                        '  - https://github.com/user/repo/blob/main/path/template.json',
                        '  - https://raw.githubusercontent.com/user/repo/main/template.json',
                    ]
                );
            }
        }
    } else {
        // 直接作为 JSON 字符串处理
        jsonContent = source;
    }

    // 解析 JSON
    let template: AgentTemplatePackage;
    try {
        template = JSON.parse(jsonContent);
    } catch (error) {
        throw new TemplateParseError(
            '模板 JSON 格式错误',
            [`解析错误: ${error instanceof Error ? error.message : String(error)}`]
        );
    }

    // 验证模板格式
    const validationErrors = validateTemplate(template);
    if (validationErrors.length > 0) {
        throw new TemplateParseError('模板格式验证失败', validationErrors);
    }

    logInfo('模板解析成功', {
        id: template.id,
        name: template.name,
        mcpServers: template.components.mcpServers?.length || 0,
        skills: template.components.skills?.length || 0,
        agents: template.components.agents?.length || 0,
    });

    return template;
}

/**
 * 验证模板格式
 *
 * @param template - 待验证的模板
 * @returns 错误信息数组，空数组表示验证通过
 */
function validateTemplate(template: unknown): string[] {
    const errors: string[] = [];

    if (!template || typeof template !== 'object') {
        errors.push('模板必须是一个对象');
        return errors;
    }

    const t = template as Record<string, unknown>;

    // 必填字段验证
    if (!t.id || typeof t.id !== 'string') {
        errors.push('缺少必填字段: id');
    }
    if (!t.name || typeof t.name !== 'string') {
        errors.push('缺少必填字段: name');
    }
    if (!t.version || typeof t.version !== 'string') {
        errors.push('缺少必填字段: version');
    }
    if (!t.description || typeof t.description !== 'string') {
        errors.push('缺少必填字段: description');
    }

    // components 验证
    if (!t.components || typeof t.components !== 'object') {
        errors.push('缺少必填字段: components');
        return errors;
    }

    const components = t.components as Record<string, unknown>;

    // 验证 MCP 服务器
    if (components.mcpServers) {
        if (!Array.isArray(components.mcpServers)) {
            errors.push('components.mcpServers 必须是数组');
        } else {
            components.mcpServers.forEach((server, index) => {
                const serverErrors = validateMCPServerTemplate(server, index);
                errors.push(...serverErrors);
            });
        }
    }

    // 验证技能
    if (components.skills) {
        if (!Array.isArray(components.skills)) {
            errors.push('components.skills 必须是数组');
        } else {
            components.skills.forEach((skill, index) => {
                const skillErrors = validateSkillTemplate(skill, index);
                errors.push(...skillErrors);
            });
        }
    }

    // 验证 Agent
    if (components.agents) {
        if (!Array.isArray(components.agents)) {
            errors.push('components.agents 必须是数组');
        } else {
            components.agents.forEach((agent, index) => {
                const agentErrors = validateAgentTemplate(agent, index);
                errors.push(...agentErrors);
            });
        }
    }

    return errors;
}

/**
 * 验证 MCP 服务器模板
 */
function validateMCPServerTemplate(server: unknown, index: number): string[] {
    const errors: string[] = [];
    const prefix = `mcpServers[${index}]`;

    if (!server || typeof server !== 'object') {
        errors.push(`${prefix}: 必须是对象`);
        return errors;
    }

    const s = server as Record<string, unknown>;

    if (!s.id || typeof s.id !== 'string') {
        errors.push(`${prefix}: 缺少 id 字段`);
    }
    if (!s.name || typeof s.name !== 'string') {
        errors.push(`${prefix}: 缺少 name 字段`);
    }
    if (!s.command || typeof s.command !== 'string') {
        errors.push(`${prefix}: 缺少 command 字段`);
    }

    return errors;
}

/**
 * 验证技能模板
 */
function validateSkillTemplate(skill: unknown, index: number): string[] {
    const errors: string[] = [];
    const prefix = `skills[${index}]`;

    if (!skill || typeof skill !== 'object') {
        errors.push(`${prefix}: 必须是对象`);
        return errors;
    }

    const s = skill as Record<string, unknown>;

    // 必须有 url 或 inline 其中之一
    if (!s.url && !s.inline) {
        errors.push(`${prefix}: 必须提供 url 或 inline 其中之一`);
    }

    // 如果有 inline，验证其格式
    if (s.inline) {
        if (typeof s.inline !== 'object') {
            errors.push(`${prefix}.inline: 必须是对象`);
        } else {
            const inline = s.inline as Record<string, unknown>;
            if (!inline.id || typeof inline.id !== 'string') {
                errors.push(`${prefix}.inline: 缺少 id 字段`);
            }
            if (!inline.name || typeof inline.name !== 'string') {
                errors.push(`${prefix}.inline: 缺少 name 字段`);
            }
            if (!inline.content || typeof inline.content !== 'string') {
                errors.push(`${prefix}.inline: 缺少 content 字段`);
            }
        }
    }

    return errors;
}

/**
 * 验证 Agent 模板
 */
function validateAgentTemplate(agent: unknown, index: number): string[] {
    const errors: string[] = [];
    const prefix = `agents[${index}]`;

    if (!agent || typeof agent !== 'object') {
        errors.push(`${prefix}: 必须是对象`);
        return errors;
    }

    const a = agent as Record<string, unknown>;

    if (!a.id || typeof a.id !== 'string') {
        errors.push(`${prefix}: 缺少 id 字段`);
    }
    if (!a.name || typeof a.name !== 'string') {
        errors.push(`${prefix}: 缺少 name 字段`);
    }
    if (!a.systemPrompt || typeof a.systemPrompt !== 'string') {
        errors.push(`${prefix}: 缺少 systemPrompt 字段`);
    }

    return errors;
}

// ==================== 变量处理 ====================

/**
 * 获取模板需要的变量列表
 *
 * @param template - 模板包
 * @returns 变量定义数组
 */
export function getRequiredVariables(template: AgentTemplatePackage): TemplateVariable[] {
    const variableNames = new Set<string>();

    // 扫描 MCP 服务器配置中的变量
    template.components.mcpServers?.forEach((server) => {
        // 扫描 args
        server.args?.forEach((arg) => {
            extractVariables(arg).forEach((v) => variableNames.add(v));
        });
        // 扫描 env
        if (server.env) {
            Object.values(server.env).forEach((value) => {
                extractVariables(value).forEach((v) => variableNames.add(v));
            });
        }
    });

    // 扫描 Agent 配置中的变量
    template.components.agents?.forEach((agent) => {
        extractVariables(agent.systemPrompt).forEach((v) => variableNames.add(v));
    });

    // 转换为 TemplateVariable 数组
    const variables: TemplateVariable[] = [];
    variableNames.forEach((name) => {
        // 跳过系统变量
        if (name in SYSTEM_VARIABLES) {
            return;
        }

        variables.push({
            name,
            label: formatVariableLabel(name),
            description: getVariableDescription(name),
            required: true,
            type: inferVariableType(name),
        });
    });

    logDebug('提取到的变量列表', { count: variables.length, variables: variables.map((v) => v.name) });

    return variables;
}

/**
 * 从字符串中提取变量名
 */
function extractVariables(str: string): string[] {
    const variables: string[] = [];
    let match;
    while ((match = VARIABLE_PATTERN.exec(str)) !== null) {
        variables.push(match[1]);
    }
    // 重置正则表达式的 lastIndex
    VARIABLE_PATTERN.lastIndex = 0;
    return variables;
}

/**
 * 格式化变量标签
 */
function formatVariableLabel(name: string): string {
    // 将 GITHUB_TOKEN 转换为 "GitHub Token"
    return name
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/**
 * 获取变量描述
 */
function getVariableDescription(name: string): string {
    const descriptions: Record<string, string> = {
        GITHUB_TOKEN: 'GitHub 个人访问令牌，用于访问 GitHub API',
        WORKSPACE_PATH: '工作目录路径',
        API_KEY: 'API 密钥',
    };
    return descriptions[name] || '';
}

/**
 * 推断变量类型
 */
function inferVariableType(name: string): 'string' | 'path' | 'secret' {
    if (name.includes('PATH') || name.includes('DIR')) {
        return 'path';
    }
    if (name.includes('TOKEN') || name.includes('KEY') || name.includes('SECRET') || name.includes('PASSWORD')) {
        return 'secret';
    }
    return 'string';
}

/**
 * 替换字符串中的变量
 */
function replaceVariables(str: string, variables: Record<string, string>): string {
    return str.replace(VARIABLE_PATTERN, (match, varName) => {
        if (varName in variables) {
            return variables[varName];
        }
        // 检查系统变量
        if (varName in SYSTEM_VARIABLES) {
            return SYSTEM_VARIABLES[varName]();
        }
        // 未找到变量，保留原样
        return match;
    });
}

// ==================== 安装函数 ====================

/**
 * 安装模板
 *
 * v1.2.0: 修复 ID 映射问题
 * - 安装 MCP/Skill 后记录模板 ID 到实际 ID 的映射
 * - Agent 创建时使用映射后的实际 ID 关联组件
 *
 * @param template - 模板包
 * @param options - 安装选项
 * @param handlers - 安装处理函数
 * @returns 安装结果
 */
export async function installTemplate(
    template: AgentTemplatePackage,
    options: TemplateInstallOptions = {},
    handlers: {
        /** 获取现有 MCP 服务器列表 */
        getMCPServers: () => MCPServer[];
        /** 获取现有技能列表 */
        getSkills: () => Skill[];
        /** 获取现有 Agent 列表 */
        getAgents: () => Agent[];
        /** 创建 MCP 服务器 */
        createMCPServer: (input: MCPServerCreateInput) => Promise<void> | void;
        /** 创建技能 */
        createSkill: (input: SkillCreateInput) => Promise<void> | void;
        /** 创建 Agent */
        createAgent: (input: AgentCreateInput) => Promise<void> | void;
    }
): Promise<TemplateInstallResult> {
    logInfo('开始安装模板', {
        id: template.id,
        name: template.name,
        dryRun: options.dryRun,
        skipExisting: options.skipExisting,
    });

    const result: TemplateInstallResult = {
        success: true,
        installed: { mcpServers: [], skills: [], agents: [] },
        skipped: { mcpServers: [], skills: [], agents: [] },
        errors: [],
    };

    const variables = options.variables || {};

    // v1.2.0: ID 映射表（模板 ID -> 实际 ID）
    const mcpIdMap = new Map<string, string>();
    const skillIdMap = new Map<string, string>();

    // 1. 安装 MCP 服务器
    if (template.components.mcpServers) {
        const existingServers = handlers.getMCPServers();
        const existingNames = new Map(existingServers.map((s) => [s.name, s.id]));

        for (const serverTemplate of template.components.mcpServers) {
            try {
                // 检查是否已存在（按名称匹配）
                const existingId = existingNames.get(serverTemplate.name);
                if (existingId) {
                    if (options.skipExisting) {
                        result.skipped.mcpServers.push(serverTemplate.id);
                        // 记录映射：模板 ID -> 已存在的实际 ID
                        mcpIdMap.set(serverTemplate.id, existingId);
                        logDebug('跳过已存在的 MCP 服务器，使用现有 ID', {
                            templateId: serverTemplate.id,
                            actualId: existingId
                        });
                        continue;
                    }
                }

                if (!options.dryRun) {
                    const input = convertMCPServerTemplate(serverTemplate, variables);

                    // 获取安装前的服务器列表
                    const beforeServers = handlers.getMCPServers();
                    const beforeIds = new Set(beforeServers.map(s => s.id));

                    await handlers.createMCPServer(input);

                    // 获取安装后的服务器列表，找出新增的 ID
                    const afterServers = handlers.getMCPServers();
                    const newServer = afterServers.find(s => !beforeIds.has(s.id));

                    if (newServer) {
                        // 记录映射：模板 ID -> 新创建的实际 ID
                        mcpIdMap.set(serverTemplate.id, newServer.id);
                        logDebug('MCP 服务器 ID 映射', {
                            templateId: serverTemplate.id,
                            actualId: newServer.id
                        });
                    }
                }
                result.installed.mcpServers.push(serverTemplate.id);
                logInfo('已安装 MCP 服务器', { id: serverTemplate.id, name: serverTemplate.name });
            } catch (error) {
                result.success = false;
                result.errors.push({
                    component: 'mcpServer',
                    id: serverTemplate.id,
                    error: error instanceof Error ? error.message : String(error),
                });
                logError('安装 MCP 服务器失败', { id: serverTemplate.id, error });
            }
        }
    }

    // 2. 安装技能
    if (template.components.skills) {
        const existingSkills = handlers.getSkills();
        const existingNames = new Map(existingSkills.map((s) => [s.name, s.id]));

        for (const skillTemplate of template.components.skills) {
            try {
                const skillName = skillTemplate.inline?.name || '';
                const templateSkillId = skillTemplate.inline?.id || '';

                // 检查是否已存在（按名称匹配）
                const existingId = existingNames.get(skillName);
                if (existingId) {
                    if (options.skipExisting) {
                        result.skipped.skills.push(templateSkillId);
                        // 记录映射：模板 ID -> 已存在的实际 ID
                        skillIdMap.set(templateSkillId, existingId);
                        logDebug('跳过已存在的技能，使用现有 ID', {
                            templateId: templateSkillId,
                            actualId: existingId
                        });
                        continue;
                    }
                }

                if (!options.dryRun) {
                    const input = await convertSkillTemplate(skillTemplate, variables);
                    if (input) {
                        // 获取安装前的技能列表
                        const beforeSkills = handlers.getSkills();
                        const beforeIds = new Set(beforeSkills.map(s => s.id));

                        await handlers.createSkill(input);

                        // 获取安装后的技能列表，找出新增的 ID
                        const afterSkills = handlers.getSkills();
                        const newSkill = afterSkills.find(s => !beforeIds.has(s.id));

                        if (newSkill) {
                            // 记录映射：模板 ID -> 新创建的实际 ID
                            skillIdMap.set(templateSkillId, newSkill.id);
                            logDebug('技能 ID 映射', {
                                templateId: templateSkillId,
                                actualId: newSkill.id
                            });
                        }

                        result.installed.skills.push(input.name);
                        logInfo('已安装技能', { name: input.name });
                    }
                } else {
                    result.installed.skills.push(templateSkillId || 'unknown');
                }
            } catch (error) {
                result.success = false;
                const skillId = skillTemplate.inline?.id || skillTemplate.url || 'unknown';
                result.errors.push({
                    component: 'skill',
                    id: skillId,
                    error: error instanceof Error ? error.message : String(error),
                });
                logError('安装技能失败', { id: skillId, error });
            }
        }
    }

    // 3. 安装 Agent（使用映射后的 ID）
    if (template.components.agents) {
        const existingAgents = handlers.getAgents();
        const existingNames = new Map(existingAgents.map((a) => [a.name, a.id]));

        for (const agentTemplate of template.components.agents) {
            try {
                // 检查是否已存在（按名称匹配）
                const existingId = existingNames.get(agentTemplate.name);
                if (existingId) {
                    if (options.skipExisting) {
                        result.skipped.agents.push(agentTemplate.id);
                        logDebug('跳过已存在的 Agent', { id: agentTemplate.id });
                        continue;
                    }
                }

                if (!options.dryRun) {
                    // v1.2.0: 使用映射后的实际 ID
                    const input = convertAgentTemplate(agentTemplate, variables, mcpIdMap, skillIdMap);
                    await handlers.createAgent(input);
                }
                result.installed.agents.push(agentTemplate.id);
                logInfo('已安装 Agent', { id: agentTemplate.id, name: agentTemplate.name });
            } catch (error) {
                result.success = false;
                result.errors.push({
                    component: 'agent',
                    id: agentTemplate.id,
                    error: error instanceof Error ? error.message : String(error),
                });
                logError('安装 Agent 失败', { id: agentTemplate.id, error });
            }
        }
    }

    logInfo('模板安装完成', {
        success: result.success,
        installed: {
            mcpServers: result.installed.mcpServers.length,
            skills: result.installed.skills.length,
            agents: result.installed.agents.length,
        },
        skipped: {
            mcpServers: result.skipped.mcpServers.length,
            skills: result.skipped.skills.length,
            agents: result.skipped.agents.length,
        },
        errors: result.errors.length,
    });

    return result;
}

// ==================== 转换函数 ====================

/**
 * 将 MCP 服务器模板转换为创建输入
 */
function convertMCPServerTemplate(
    template: MCPServerTemplate,
    variables: Record<string, string>
): MCPServerCreateInput {
    return {
        name: template.name,
        description: template.description || '',
        transportType: 'stdio',
        command: template.command,
        args: template.args?.map((arg) => replaceVariables(arg, variables)),
        env: template.env
            ? Object.fromEntries(
                  Object.entries(template.env).map(([key, value]) => [key, replaceVariables(value, variables)])
              )
            : undefined,
        authType: 'none',
        enabled: true,
        autoStart: false,
    };
}

/**
 * 将技能模板转换为创建输入
 */
async function convertSkillTemplate(
    template: SkillTemplate,
    _variables: Record<string, string>
): Promise<SkillCreateInput | null> {
    if (template.inline) {
        // 内联定义
        return {
            name: template.inline.name,
            description: template.inline.description || '',
            category: 'custom',
            promptTemplate: template.inline.content,
        };
    }

    if (template.url) {
        // 从 URL 安装
        // 这里简化处理，实际应该调用 skillUtils 中的函数
        logDebug('从 URL 安装技能', { url: template.url });
        // NOTE: URL 安装功能暂未实现，计划在 v1.2.0 版本集成 skillUtils.fetchSkillFromUrl
        // 当前版本仅支持 inline 模式的技能安装
        return null;
    }

    return null;
}

/**
 * 将 Agent 模板转换为创建输入
 *
 * v1.2.0: 支持 ID 映射，将模板中的 ID 转换为实际安装后的 ID
 *
 * @param template - Agent 模板
 * @param variables - 变量值
 * @param mcpIdMap - MCP 服务器 ID 映射（模板 ID -> 实际 ID）
 * @param skillIdMap - 技能 ID 映射（模板 ID -> 实际 ID）
 */
function convertAgentTemplate(
    template: AgentTemplate,
    variables: Record<string, string>,
    mcpIdMap: Map<string, string> = new Map(),
    skillIdMap: Map<string, string> = new Map()
): AgentCreateInput {
    // 映射技能 ID
    const mappedSkillIds = (template.skillIds || []).map(id => skillIdMap.get(id) || id);

    // 映射 MCP 服务器 ID
    const mappedMcpServers = template.mcpServerIds?.map((id) => {
        const actualId = mcpIdMap.get(id) || id;
        return {
            serverId: actualId,
            serverName: id, // 保留原始名称作为显示名
        };
    });

    logDebug('Agent 组件映射', {
        originalSkillIds: template.skillIds,
        mappedSkillIds,
        originalMcpIds: template.mcpServerIds,
        mappedMcpIds: mappedMcpServers?.map(s => s.serverId),
    });

    return {
        name: template.name,
        description: template.description || '',
        model: template.model || 'claude-3-5-sonnet',
        skills: mappedSkillIds,
        systemPrompt: replaceVariables(template.systemPrompt, variables),
        temperature: template.temperature ?? 0.7,
        maxTokens: template.maxTokens ?? 4096,
        mcpServers: mappedMcpServers,
        enableToolUse: (template.mcpServerIds?.length || 0) > 0,
    };
}

// ==================== 导出 ====================

export const templateService = {
    parseTemplate,
    getRequiredVariables,
    installTemplate,
    discoverTemplatesFromRepo,
    isGitHubRepoUrl,
};

export default templateService;
