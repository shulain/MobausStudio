/**
 * Skill 工具函数模块 (v3.0.21)
 *
 * 提供技能相关的核心工具函数：
 * - buildSystemPrompt: 构建包含 Skill 的系统提示词
 * - matchSkillTriggers: 匹配用户输入的触发词
 * - replaceVariables: 替换模板中的变量
 *
 * v3.0.0 新增：
 * - fetchSkillRegistry: 从 URL 获取技能仓库索引
 * - fetchSkillFromRegistry: 获取单个技能定义
 * - validateSkillPackage: 验证技能包格式
 * - exportSkillsToJson: 导出技能为 JSON
 * - detectDuplicateSkills: 检测重复技能
 * - parseGithubUrl: 解析 GitHub URL 为 raw URL
 *
 * v3.0.14 新增：
 * - fetchSkillDirectoryContents: 递归获取技能目录下所有文件
 * - downloadSkillFiles: 下载技能目录下所有文件内容
 *
 * v3.0.17 新增：
 * - discoverSkillsInRepo: 多路径技能发现（支持根目录、多种子目录、递归搜索）
 * - parseGitHubSkillUrl: 解析 GitHub URL，支持直接技能路径
 * - checkSkillMdExists: 检查指定路径是否存在 SKILL.md
 *
 * v3.0.21 新增：
 * - searchSkillsWithTreeApi: 使用 Git Trees API 高效搜索（1次API调用）
 */

import type {
    DuplicateSkillResult,
    Skill,
    SkillCommandParseResult,
    SkillCreateInput,
    SkillFile,
    SkillPackage,
    SkillPackageMeta,
    SkillPackageValidation,
    SkillRegistry,
    SkillRegistryItem,
    SkillVariable,
} from '../types';
import { logger, LogTags } from './logger';
import { SkillInstallError } from './errors';

/**
 * 获取本地化文本（用于处理多语言字段）
 * @param text - 文本内容（字符串或多语言对象）
 * @param lang - 语言代码，默认 'zh'
 * @returns 对应语言的文本
 */
function getLocalText(text: string | { zh: string; en: string }, lang: 'zh' | 'en' = 'zh'): string {
    if (typeof text === 'string') return text;
    return text[lang] || text.zh || text.en || '';
}

// ==================== v3.0.17: 多路径技能发现常量 ====================

/**
 * 技能搜索路径优先级（按顺序尝试）
 * 参考 npx skills add 的搜索逻辑
 */
const SKILL_SEARCH_PATHS = [
    'skills',                    // 标准 skills 目录
    'skills/.curated',           // 精选技能
    'skills/.experimental',      // 实验性技能
    'skills/.system',            // 系统技能
    '.claude/skills',            // Claude 专用
    '.cursor/skills',            // Cursor 专用
    '.windsurf/skills',          // Windsurf 专用
    '.copilot/skills',           // Copilot 专用
];
const SKILL_DEFINITION_FILES = ['SKILL.md', 'SKILLS.md'] as const;

// v3.0.21: MAX_RECURSIVE_DEPTH 已不再需要，Git Trees API 一次性获取整个仓库文件树

/**
 * 技能位置信息 (v3.0.17)
 */
interface SkillLocation {
    /** 技能路径（相对于仓库根目录） */
    path: string;
    /** 技能名称（目录名或仓库名） */
    name: string;
    /** 是否为根目录技能 */
    isRoot?: boolean;
    /** 命中的技能定义文件名 */
    definitionFile?: typeof SKILL_DEFINITION_FILES[number];
}

/**
 * GitHub URL 解析结果 (v3.0.17)
 */
interface GitHubUrlParseResult {
    /** 仓库所有者 */
    owner: string;
    /** 仓库名称 */
    repo: string;
    /** 分支名 */
    branch: string;
    /** 分支是否由 URL 显式指定（/tree/<branch>） */
    isBranchExplicit: boolean;
    /** 直接技能路径（可选，如 skills/react） */
    skillPath?: string;
}

const githubDefaultBranchCache = new Map<string, string>();

async function resolveGitHubBranch(
    owner: string,
    repo: string,
    preferredBranch: string,
    isBranchExplicit: boolean = false
): Promise<string> {
    if (isBranchExplicit || preferredBranch !== 'main') {
        return preferredBranch;
    }

    const key = `${owner}/${repo}`.toLowerCase();
    const cached = githubDefaultBranchCache.get(key);
    if (cached) {
        return cached;
    }

    try {
        const payload = await fetchUrlContent(`https://api.github.com/repos/${owner}/${repo}`);
        const data = JSON.parse(payload) as { default_branch?: unknown };
        const defaultBranch = typeof data.default_branch === 'string' ? data.default_branch.trim() : '';
        if (defaultBranch) {
            githubDefaultBranchCache.set(key, defaultBranch);
            if (defaultBranch !== preferredBranch) {
                logger.info(LogTags.SKILL, '检测到仓库默认分支', {
                    owner,
                    repo,
                    preferredBranch,
                    resolvedBranch: defaultBranch,
                });
            }
            return defaultBranch;
        }
    } catch (err) {
        if (isGitHubRateLimitError(err)) {
            logger.warn(LogTags.SKILL, '查询默认分支触发限流，回退到候选分支推断');
            return preferredBranch;
        }
        logger.warn(LogTags.SKILL, '获取仓库默认分支失败，继续使用 main', {
            owner,
            repo,
            error: String(err),
        });
    }

    githubDefaultBranchCache.set(key, preferredBranch);
    return preferredBranch;
}

/**
 * 构建包含 Skill 的完整系统提示词
 *
 * @param basePrompt - Agent 的基础系统提示词
 * @param skills - 绑定的 Skill 列表
 * @param variables - 技能变量配置 { [skillId]: { [varName]: value } }
 * @returns 完整的系统提示词
 *
 * @example
 * const prompt = buildSystemPrompt(
 *   '你是一个专业的助手',
 *   [codeReviewSkill, translationSkill],
 *   { 'builtin-translation': { style: '正式' } }
 * );
 */
export function buildSystemPrompt(
    basePrompt: string,
    skills: Skill[],
    variables?: Record<string, Record<string, unknown>>
): string {
    // 1. 基础人设
    let result = basePrompt;

    // 2. 筛选已启用的技能
    const enabledSkills = skills.filter((s) => s.enabled);

    // 3. 如果没有启用的技能，直接返回基础提示词
    if (enabledSkills.length === 0) {
        return result;
    }

    // 4. 注入技能模板
    result += '\n\n---\n\n## 专业能力\n\n';
    result += '你具备以下专业能力，请在合适的场景下使用：\n\n';

    for (const skill of enabledSkills) {
        // 获取该技能的变量配置
        const skillVars = variables?.[skill.id] || {};

        // 替换模板中的变量
        const processedTemplate = replaceVariables(
            skill.promptTemplate,
            skill.variables || [],
            skillVars
        );

        // 追加技能模板
        result += `### ${skill.name}\n\n${processedTemplate}\n\n`;
    }

    return result;
}

/**
 * 替换模板中的变量
 *
 * @param template - 提示词模板
 * @param variables - 变量定义
 * @param values - 变量值
 * @returns 替换后的模板
 *
 * @example
 * const result = replaceVariables(
 *   '翻译风格: {{style}}',
 *   [{ name: 'style', label: '风格', type: 'string', defaultValue: '正式' }],
 *   { style: '口语化' }
 * );
 * // 返回: '翻译风格: 口语化'
 */
export function replaceVariables(
    template: string,
    variables: SkillVariable[],
    values: Record<string, unknown>
): string {
    let result = template;

    for (const variable of variables) {
        // 优先使用传入的值，否则使用默认值
        const value = values[variable.name] ?? variable.defaultValue;

        // 替换 {{变量名}} 格式的占位符
        const pattern = new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g');
        result = result.replace(pattern, String(value));
    }

    return result;
}

/**
 * 检查用户输入是否触发某个 Skill
 *
 * @param input - 用户输入
 * @param skills - 可用技能列表
 * @returns 匹配的技能（按优先级降序排序）
 *
 * @example
 * const matched = matchSkillTriggers('帮我审查这段代码', skills);
 * // 返回: [codeReviewSkill] (如果有匹配的话)
 */
export function matchSkillTriggers(input: string, skills: Skill[]): Skill[] {
    const matches: { skill: Skill; priority: number }[] = [];

    for (const skill of skills) {
        // 跳过禁用的技能或没有触发条件的技能
        if (!skill.enabled || !skill.triggers || skill.triggers.length === 0) {
            continue;
        }

        for (const trigger of skill.triggers) {
            const matched = (() => {
                switch (trigger.type) {
                    case 'keyword':
                        // 关键词匹配（不区分大小写）
                        return input
                            .toLowerCase()
                            .includes(trigger.pattern.toLowerCase());

                    case 'regex':
                        // 正则表达式匹配（不区分大小写）
                        try {
                            const regex = new RegExp(trigger.pattern, 'i');
                            return regex.test(input);
                        } catch {
                            // 正则表达式无效，跳过
                            logger.warn(LogTags.SKILL, `无效的正则表达式: ${trigger.pattern}`);
                            return false;
                        }

                    case 'intent':
                        // 意图匹配（简单实现：关键词匹配）
                        // 后续可扩展为更复杂的 NLU
                        return input
                            .toLowerCase()
                            .includes(trigger.pattern.toLowerCase());

                    default:
                        return false;
                }
            })();

            if (matched) {
                matches.push({ skill, priority: trigger.priority });
                break; // 一个技能只需匹配一次
            }
        }
    }

    // 按优先级降序排序
    return matches
        .sort((a, b) => b.priority - a.priority)
        .map((m) => m.skill);
}

/**
 * 获取技能的变量默认值映射
 *
 * @param skill - 技能对象
 * @returns 变量默认值映射 { [varName]: defaultValue }
 */
export function getSkillDefaultVariables(
    skill: Skill
): Record<string, string | number | boolean> {
    const defaults: Record<string, string | number | boolean> = {};

    if (skill.variables) {
        for (const variable of skill.variables) {
            defaults[variable.name] = variable.defaultValue;
        }
    }

    return defaults;
}

/**
 * 验证技能变量值是否有效
 *
 * @param variable - 变量定义
 * @param value - 变量值
 * @returns 是否有效
 */
export function validateVariableValue(
    variable: SkillVariable,
    value: unknown
): boolean {
    switch (variable.type) {
        case 'string':
            return typeof value === 'string';

        case 'number':
            return typeof value === 'number' && !isNaN(value);

        case 'boolean':
            return typeof value === 'boolean';

        case 'select':
            return (
                typeof value === 'string' &&
                (variable.options?.includes(value) ?? false)
            );

        default:
            return false;
    }
}

/**
 * 预览技能的完整提示词（用于测试功能）
 *
 * @param skill - 技能对象
 * @param variables - 变量值（可选）
 * @returns 预览的提示词
 */
export function previewSkillPrompt(
    skill: Skill,
    variables?: Record<string, unknown>
): string {
    return replaceVariables(
        skill.promptTemplate,
        skill.variables || [],
        variables || {}
    );
}

// ==================== v3.0.0: 技能安装模式工具函数 ====================

/**
 * 解析 GitHub URL 为 raw URL
 *
 * 支持多种 GitHub URL 格式的自动转换：
 * - https://github.com/user/repo/blob/main/file.json -> https://raw.githubusercontent.com/user/repo/main/file.json
 * - https://github.com/user/repo -> https://raw.githubusercontent.com/user/repo/main/skills.json
 *
 * @param url - 原始 URL
 * @returns 转换后的 raw URL 或原始 URL
 *
 * @example
 * parseGithubUrl('https://github.com/user/repo/blob/main/skills.json')
 * // 返回: 'https://raw.githubusercontent.com/user/repo/main/skills.json'
 */
export function parseGithubUrl(url: string): string {
    try {
        const urlObj = new URL(url);

        // 只处理 github.com 的 URL
        if (urlObj.hostname !== 'github.com') {
            return url;
        }

        const pathParts = urlObj.pathname.split('/').filter(Boolean);

        // 格式: /user/repo/blob/branch/path/to/file
        if (pathParts.length >= 4 && pathParts[2] === 'blob') {
            const user = pathParts[0];
            const repo = pathParts[1];
            const branch = pathParts[3];
            const filePath = pathParts.slice(4).join('/');
            return `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${filePath}`;
        }

        // 格式: /user/repo (仓库根目录，默认获取 skills.json)
        if (pathParts.length === 2) {
            const user = pathParts[0];
            const repo = pathParts[1];
            return `https://raw.githubusercontent.com/${user}/${repo}/main/skills.json`;
        }

        return url;
    } catch {
        // URL 解析失败，返回原始 URL
        return url;
    }
}

/**
 * 从 URL 获取技能仓库索引
 *
 * v3.0.3 更新：支持自动检测仓库格式
 * - 如果 URL 以 .json 结尾，直接获取 JSON
 * - 如果是 GitHub 仓库 URL，依次尝试：
 *   1. skills.json
 *   2. registry.json
 *   3. SKILL.md 格式（扫描 skills/ 目录）
 *
 * v3.0.17 更新：支持直接技能路径和多路径搜索
 * - 支持直接技能路径 URL（如 /tree/main/skills/react）
 * - 支持根目录作为技能（仓库本身就是一个技能）
 * - 支持多路径搜索（skills/、.curated/、.claude/skills/ 等）
 *
 * @param url - 仓库 URL（支持 GitHub 自动转换）
 * @param skillIds - 指定获取的技能 ID 列表（仅用于 SKILL.md 格式）
 * @returns 技能仓库索引对象
 * @throws 网络错误或解析错误时抛出异常
 *
 * @example
 * const registry = await fetchSkillRegistry('https://github.com/vercel-labs/agent-skills');
 * const registry = await fetchSkillRegistry('https://github.com/vercel-labs/agent-skills/tree/main/skills/react');
 */
export async function fetchSkillRegistry(url: string, skillIds?: string[]): Promise<SkillRegistry> {
    // 检查是否为 GitHub 仓库 URL（非 JSON 文件）
    const repoInfo = parseGitHubRepoInfo(url);
    const isJsonUrl = url.endsWith('.json');

    // 如果是 GitHub 仓库 URL 且不是 JSON 文件，尝试多种格式
    if (repoInfo && !isJsonUrl) {
        return fetchSkillRegistryFromGitHub(
            repoInfo.owner,
            repoInfo.repo,
            repoInfo.branch,
            skillIds,
            repoInfo.skillPath,  // v3.0.17: 传递直接技能路径
            repoInfo.isBranchExplicit
        );
    }

    // 直接获取 JSON 格式
    return fetchSkillRegistryJson(url);
}

/**
 * 从 GitHub 仓库获取技能，自动检测格式 (v3.0.17 增强)
 *
 * 搜索顺序：
 * 1. 如果指定了 skillPath，直接获取该路径的技能
 * 2. 尝试获取 skills.json / registry.json
 * 3. 检查根目录是否有 SKILL.md（仓库本身是一个技能）
 * 4. 按优先级搜索多个路径（skills/、.curated/、.claude/skills/ 等）
 * 5. 如果都找不到，递归搜索整个仓库
 *
 * @param owner - 仓库所有者
 * @param repo - 仓库名称
 * @param branch - 分支名
 * @param skillIds - 指定获取的技能 ID 列表
 * @param skillPath - 直接技能路径（可选，如 skills/react）
 * @returns 技能仓库索引
 */
async function fetchSkillRegistryFromGitHub(
    owner: string,
    repo: string,
    branch: string,
    skillIds?: string[],
    skillPath?: string,
    isBranchExplicit: boolean = false
): Promise<SkillRegistry> {
    const resolvedBranch = await resolveGitHubBranch(owner, repo, branch, isBranchExplicit);
    logger.info(LogTags.SKILL, `检测 GitHub 仓库格式: ${owner}/${repo}@${resolvedBranch}${skillPath ? ` (路径: ${skillPath})` : ''}`);
    logger.info(LogTags.SKILL, 'GitHub 仓库安装参数', {
        owner,
        repo,
        branch: resolvedBranch,
        hasSkillIds: !!(skillIds && skillIds.length > 0),
        skillIdsCount: skillIds?.length || 0,
    });

    // v3.0.17: 如果指定了直接技能路径，直接获取该技能
    if (skillPath) {
        logger.info(LogTags.SKILL, `使用直接技能路径: ${skillPath}`);
        return fetchSingleSkillFromPath(owner, repo, resolvedBranch, skillPath);
    }

    // 1. 先做 SKILL.md 多层级发现（Tree API 优先，减少多次 raw 探测）
    const skillLocations = await collectSkillLocations(owner, repo, resolvedBranch);
    if (skillLocations.length > 0) {
        logger.info(LogTags.SKILL, `发现 ${skillLocations.length} 个技能位置`);
        logger.debug(LogTags.SKILL, '技能位置详情', {
            locations: skillLocations.map(loc => ({ path: loc.path, name: loc.name, definitionFile: loc.definitionFile })),
        });
        try {
            const skillMdRegistry = await fetchSkillsFromLocations(owner, repo, resolvedBranch, skillLocations, skillIds);
            // 可选叠加 JSON registry（失败不影响技能发现主流程）
            const skillsJsonUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${resolvedBranch}/skills.json`;
            try {
                const jsonRegistry = await fetchSkillRegistryJson(skillsJsonUrl);
                logger.info(LogTags.SKILL, '使用 skills.json 格式并与 SKILL.md 合并');
                return mergeRegistries(owner, repo, jsonRegistry, skillMdRegistry, skillIds);
            } catch {
                // ignore
            }
            const registryJsonUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${resolvedBranch}/registry.json`;
            try {
                const jsonRegistry = await fetchSkillRegistryJson(registryJsonUrl);
                logger.info(LogTags.SKILL, '使用 registry.json 格式并与 SKILL.md 合并');
                return mergeRegistries(owner, repo, jsonRegistry, skillMdRegistry, skillIds);
            } catch {
                // ignore
            }
            return skillMdRegistry;
        } catch (err) {
            logger.warn(LogTags.SKILL, 'SKILL.md 聚合失败，尝试回退 JSON 列表', err);
            const skillsJsonUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${resolvedBranch}/skills.json`;
            try {
                const jsonRegistry = await fetchSkillRegistryJson(skillsJsonUrl);
                logger.info(LogTags.SKILL, 'SKILL.md 失败，回退到 skills.json');
                return filterRegistryBySkillIds(jsonRegistry, skillIds);
            } catch {
                // ignore
            }
            const registryJsonUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${resolvedBranch}/registry.json`;
            try {
                const jsonRegistry = await fetchSkillRegistryJson(registryJsonUrl);
                logger.info(LogTags.SKILL, 'SKILL.md 失败，回退到 registry.json');
                return filterRegistryBySkillIds(jsonRegistry, skillIds);
            } catch {
                // ignore
            }
            if (isGitHubRateLimitError(err)) {
                throw err;
            }
            throw err;
        }
    }

    // 2. 没发现 SKILL.md 时再尝试 JSON
    const skillsJsonUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${resolvedBranch}/skills.json`;
    try {
        const jsonRegistry = await fetchSkillRegistryJson(skillsJsonUrl);
        logger.info(LogTags.SKILL, '使用 skills.json 格式');

        // 即使有 JSON，也尝试检查并合并根目录的 SKILL.md/SKILLS.md
        try {
            const rootDefinitionFile = await detectSkillDefinitionFile(owner, repo, resolvedBranch, '');
            if (rootDefinitionFile) {
                logger.info(LogTags.SKILL, `发现根目录 ${rootDefinitionFile}，尝试与 skills.json 合并`);
                const rootSkillMdRegistry = await fetchSkillsFromLocations(
                    owner,
                    repo,
                    resolvedBranch,
                    [{ path: '', name: repo, isRoot: true, definitionFile: rootDefinitionFile }],
                    skillIds
                );
                return mergeRegistries(owner, repo, jsonRegistry, rootSkillMdRegistry, skillIds);
            }
        } catch (rootErr) {
            logger.debug(LogTags.SKILL, '检查根目录 SKILL.md 失败，仅使用 skills.json', rootErr);
        }

        return filterRegistryBySkillIds(jsonRegistry, skillIds);
    } catch (err) {
        if (isGitHubRateLimitError(err)) {
            throw buildGitHubRateLimitError();
        }
        // ignore other errors, continue to try registry.json
    }

    const registryJsonUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${resolvedBranch}/registry.json`;
    try {
        const jsonRegistry = await fetchSkillRegistryJson(registryJsonUrl);
        logger.info(LogTags.SKILL, '使用 registry.json 格式');

        // 即使有 JSON，也尝试检查并合并根目录的 SKILL.md/SKILLS.md
        try {
            const rootDefinitionFile = await detectSkillDefinitionFile(owner, repo, resolvedBranch, '');
            if (rootDefinitionFile) {
                logger.info(LogTags.SKILL, `发现根目录 ${rootDefinitionFile}，尝试与 registry.json 合并`);
                const rootSkillMdRegistry = await fetchSkillsFromLocations(
                    owner,
                    repo,
                    resolvedBranch,
                    [{ path: '', name: repo, isRoot: true, definitionFile: rootDefinitionFile }],
                    skillIds
                );
                return mergeRegistries(owner, repo, jsonRegistry, rootSkillMdRegistry, skillIds);
            }
        } catch (rootErr) {
            logger.debug(LogTags.SKILL, '检查根目录 SKILL.md 失败，仅使用 registry.json', rootErr);
        }

        return filterRegistryBySkillIds(jsonRegistry, skillIds);
    } catch (err) {
        if (isGitHubRateLimitError(err)) {
            throw buildGitHubRateLimitError();
        }
        // ignore other errors
    }

    // 3. main 未找到且未显式指定分支时，兜底重试 master
    if (!isBranchExplicit && resolvedBranch === 'main') {
        logger.warn(LogTags.SKILL, 'main 分支未发现技能，自动重试 master 分支', { owner, repo });
        return fetchSkillRegistryFromGitHub(owner, repo, 'master', skillIds, skillPath, true);
    }

    // 4. 如果都找不到，抛出错误
    throw new Error(`在仓库 ${owner}/${repo} 中未找到任何技能。请确认仓库包含 SKILL.md/SKILLS.md 文件或 skills.json 配置。`);
}

async function collectSkillLocations(
    owner: string,
    repo: string,
    branch: string
): Promise<SkillLocation[]> {
    const locations: SkillLocation[] = [];
    let usedArchiveFallback = false;
    try {
        const discoveredLocations = await discoverSkillsInRepo(owner, repo, branch);
        for (const location of discoveredLocations) {
            if (!locations.some((item) => item.path === location.path)) {
                locations.push(location);
            }
        }
    } catch (err) {
        if (isGitHubRateLimitError(err)) {
            logger.warn(LogTags.SKILL, '技能发现触发限流，回退到离线包扫描', { owner, repo, branch });
            usedArchiveFallback = true;
            try {
                const archiveLocations = await scanSkillsFromGitHubArchive(owner, repo, branch);
                for (const loc of archiveLocations) {
                    if (!locations.some((item) => item.path === loc.path)) {
                        locations.push({
                            path: loc.path,
                            name: loc.name,
                            isRoot: loc.path === '',
                            definitionFile: loc.definitionFile,
                        });
                    }
                }
                logger.info(LogTags.SKILL, '离线包扫描回退完成', {
                    owner,
                    repo,
                    branch,
                    count: locations.length,
                });
            } catch (archiveErr) {
                logger.error(LogTags.SKILL, '限流后离线包扫描也失败', {
                    owner,
                    repo,
                    branch,
                    error: String(archiveErr),
                });
                // 如果是限流导致的失败，抛出限流错误
                throw buildGitHubRateLimitError();
            }
        } else {
            throw err;
        }
    }

    // Tree/目录搜索未命中时，再单独检查根目录定义文件，避免无谓的 raw 404。
    if (!usedArchiveFallback && !locations.some((loc) => loc.path === '')) {
        try {
            const rootDefinitionFile = await detectSkillDefinitionFile(owner, repo, branch, '');
            if (rootDefinitionFile) {
                locations.push({
                    path: '',
                    name: repo,
                    isRoot: true,
                    definitionFile: rootDefinitionFile,
                });
                logger.info(LogTags.SKILL, `根目录发现 ${rootDefinitionFile}，加入候选技能列表`);
            } else {
                logger.info(LogTags.SKILL, '根目录无 SKILL.md/SKILLS.md');
            }
        } catch {
            logger.info(LogTags.SKILL, '检查根目录 SKILL.md/SKILLS.md 失败');
        }
    }

    logger.info(LogTags.SKILL, '技能位置收集完成', {
        owner,
        repo,
        total: locations.length,
        rootIncluded: locations.some(loc => loc.path === ''),
    });

    return locations;
}

function mergeRegistries(
    owner: string,
    repo: string,
    jsonRegistry: SkillRegistry,
    skillMdRegistry: SkillRegistry,
    skillIds?: string[]
): SkillRegistry {
    const mergedSkills: SkillRegistryItem[] = [];
    const seen = new Set<string>();
    const makeKey = (skill: SkillRegistryItem): string =>
        `${skill.id.toLowerCase()}::${skill.name.toLowerCase()}`;

    for (const skill of skillMdRegistry.skills) {
        const key = makeKey(skill);
        if (!seen.has(key)) {
            seen.add(key);
            mergedSkills.push(skill);
        }
    }
    for (const skill of jsonRegistry.skills) {
        const key = makeKey(skill);
        if (!seen.has(key)) {
            seen.add(key);
            mergedSkills.push(skill);
        }
    }

    return filterRegistryBySkillIds({
        name: `${owner}/${repo}`,
        version: jsonRegistry.version || skillMdRegistry.version || '1.0.0',
        description: jsonRegistry.description || skillMdRegistry.description || `从 GitHub 仓库 ${owner}/${repo} 导入的技能集`,
        skills: mergedSkills,
    }, skillIds);
}

function filterRegistryBySkillIds(registry: SkillRegistry, skillIds?: string[]): SkillRegistry {
    if (!skillIds || skillIds.length === 0) {
        return registry;
    }
    const skillIdsLower = skillIds.map((id) => id.toLowerCase());
    const filtered = registry.skills.filter((skill) => {
        const idLower = skill.id.toLowerCase();
        const nameLower = skill.name.toLowerCase();
        return skillIdsLower.some((query) =>
            idLower === query ||
            nameLower === query ||
            idLower.includes(query) ||
            nameLower.includes(query) ||
            query.includes(idLower) ||
            query.includes(nameLower)
        );
    });

    return {
        ...registry,
        skills: filtered.length > 0 ? filtered : registry.skills,
    };
}

/**
 * 从指定路径获取单个技能 (v3.0.17)
 *
 * @param owner - 仓库所有者
 * @param repo - 仓库名称
 * @param branch - 分支名
 * @param skillPath - 技能路径（空字符串表示根目录）
 * @returns 技能仓库索引（包含单个技能）
 */
async function fetchSingleSkillFromPath(
    owner: string,
    repo: string,
    branch: string,
    skillPath: string
): Promise<SkillRegistry> {
    const isRoot = skillPath === '';
    const skillName = isRoot ? repo : skillPath.split('/').pop() || repo;
    const basePath = isRoot ? '' : skillPath;
    const baseRawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}${basePath ? `/${basePath}` : ''}`;

    logger.info(LogTags.SKILL, `获取单个技能: ${skillName} (路径: ${basePath || '根目录'})`);

    const definitionFile = await detectSkillDefinitionFile(owner, repo, branch, skillPath);
    if (!definitionFile) {
        throw new Error(`未在路径 ${skillPath || '根目录'} 找到 SKILL.md/SKILLS.md`);
    }

    // 获取技能定义文件
    const skillMdUrl = `${baseRawUrl}/${definitionFile}`;
    const skillMdContent = await fetchUrlContent(skillMdUrl);
    const parsed = parseSkillMd(skillMdContent);

    if (!parsed) {
        throw new Error(`无法解析 ${definitionFile}: ${skillPath || '根目录'}`);
    }

    // 尝试获取 AGENTS.md
    let agentsMdContent: string | null = null;
    try {
        const agentsMdUrl = `${baseRawUrl}/AGENTS.md`;
        agentsMdContent = await fetchUrlContent(agentsMdUrl);
        if (!agentsMdContent || agentsMdContent.length === 0) {
            agentsMdContent = null;
        }
    } catch {
        // AGENTS.md 不存在，忽略
    }

    // 构建 files 数组
    const files: SkillFile[] = [];
    files.push({
        path: definitionFile,
        name: definitionFile,
        content: skillMdContent,
        type: 'markdown',
    });

    if (agentsMdContent) {
        files.push({
            path: 'AGENTS.md',
            name: 'AGENTS.md',
            content: agentsMdContent,
            type: 'markdown',
        });
    }

    // 下载完整目录
    try {
        const fileList = await fetchSkillDirectoryContents(owner, repo, basePath || '.', branch);
        const filesToDownload = fileList.filter(
            (f) => f.name !== definitionFile && f.name !== 'AGENTS.md'
        );

        if (filesToDownload.length > 0) {
            const downloadedFiles = await downloadSkillFiles(filesToDownload);
            files.push(...downloadedFiles);
        }
    } catch (err) {
        if (isGitHubRateLimitError(err)) {
            throw err instanceof Error ? err : buildGitHubRateLimitError();
        }
        logger.warn(LogTags.SKILL, `下载完整目录失败 (${skillPath}):`, err);
    }

    // 合并内容到 promptTemplate
    const promptTemplate = mergeSkillFilesToPrompt(
        parsed.promptTemplate,
        agentsMdContent,
        files
    );

    return {
        name: `${owner}/${repo}`,
        version: '1.0.0',
        description: `从 GitHub 仓库 ${owner}/${repo} 导入的技能`,
        skills: [{
            id: skillName.toLowerCase().replace(/\s+/g, '-'),
            name: parsed.name,
            description: parsed.description || '',
            version: '1.0.0',
            tags: ['custom'],
            skill: {
                name: parsed.name,
                description: parsed.description,
                category: 'custom' as const,
                promptTemplate,
                files,
            },
        }],
    };
}

/**
 * 发现仓库中的所有技能位置 (v3.0.21 使用 Git Trees API)
 *
 * 按优先级搜索多个路径，返回所有找到的技能位置
 *
 * v3.0.21: 使用 Git Trees API 替代递归搜索，只需 1 次 API 调用
 *
 * @param owner - 仓库所有者
 * @param repo - 仓库名称
 * @param branch - 分支名
 * @returns 技能位置列表
 */
async function discoverSkillsInRepo(
    owner: string,
    repo: string,
    branch: string
): Promise<SkillLocation[]> {
    const foundSkills: SkillLocation[] = [];
    logger.info(LogTags.SKILL, '开始发现技能位置', {
        owner,
        repo,
        branch,
    });

    // 优先使用 Git Trees API，一次调用拿到全量路径，避免多目录探测导致的大量 404。
    try {
        const treeSkills = await searchSkillsWithTreeApi(owner, repo, branch);
        if (treeSkills.length > 0) {
            logger.info(LogTags.SKILL, `Git Trees API 发现 ${treeSkills.length} 个技能，跳过目录探测`);
            return treeSkills;
        }
        logger.info(LogTags.SKILL, 'Git Trees API 未发现技能，回退到预设目录探测');
    } catch (err) {
        if (isGitHubRateLimitError(err)) {
            logger.error(LogTags.SKILL, '技能发现触发 GitHub 限流', { owner, repo, branch });
            throw err instanceof Error ? err : buildGitHubRateLimitError();
        }
        logger.warn(LogTags.SKILL, 'Git Trees API 搜索失败，回退到预设目录探测', {
            owner,
            repo,
            branch,
            error: String(err),
        });
    }

    logger.info(LogTags.SKILL, '回退预设路径发现技能', {
        owner,
        repo,
        branch,
        searchPaths: SKILL_SEARCH_PATHS,
    });

    // 按优先级搜索各个路径
    for (const searchPath of SKILL_SEARCH_PATHS) {
        try {
            const skills = await searchSkillsInDirectory(owner, repo, branch, searchPath);
            if (skills.length > 0) {
                logger.info(LogTags.SKILL, `在 ${searchPath || '根目录'} 发现 ${skills.length} 个技能`);
                foundSkills.push(...skills);
            } else {
                logger.debug(LogTags.SKILL, `在 ${searchPath} 未发现技能目录`);
            }
        } catch (err) {
            if (isGitHubRateLimitError(err)) {
                logger.error(LogTags.SKILL, `发现阶段触发 GitHub 限流: ${searchPath}`, {
                    owner,
                    repo,
                    branch,
                    error: String(err),
                });
                throw err instanceof Error ? err : buildGitHubRateLimitError();
            }
            // 目录不存在，继续下一个
            logger.info(LogTags.SKILL, `路径 ${searchPath} 不存在或无法访问`);
        }
    }

    return foundSkills;
}

/**
 * 在指定目录中搜索技能 (v3.0.17)
 *
 * @param owner - 仓库所有者
 * @param repo - 仓库名称
 * @param branch - 分支名
 * @param dirPath - 目录路径
 * @returns 技能位置列表
 */
async function searchSkillsInDirectory(
    owner: string,
    repo: string,
    branch: string,
    dirPath: string
): Promise<SkillLocation[]> {
    logger.debug(LogTags.SKILL, '扫描目录技能', { owner, repo, branch, dirPath });
    const contents: GitHubContentItem[] = await (async () => {
        try {
            const contentsJson = await invoke<string>('fetch_github_contents', {
                owner,
                repo,
                path: dirPath,
                branch,
            });
            return JSON.parse(contentsJson) as GitHubContentItem[];
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('404')) return [];
            if (isGitHubRateLimitError(err)) throw buildGitHubRateLimitError();
            throw err instanceof Error ? err : new Error(message);
        }
    })();
    const skills: SkillLocation[] = [];
    logger.debug(LogTags.SKILL, '目录扫描返回条目', { dirPath, entries: contents.length });

    // 检查每个子目录是否包含 SKILL.md/SKILLS.md
    for (const item of contents) {
        if (item.type === 'dir') {
            const skillPath = dirPath ? `${dirPath}/${item.name}` : item.name;
            const definitionFile = await detectSkillDefinitionFile(owner, repo, branch, skillPath);
            if (definitionFile) {
                skills.push({
                    path: skillPath,
                    name: item.name,
                    definitionFile,
                });
            }
        }
    }

    return skills;
}

/**
 * 检查指定路径是否存在技能定义文件 (SKILL.md / SKILLS.md)
 *
 * @param owner - 仓库所有者
 * @param repo - 仓库名称
 * @param branch - 分支名
 * @param skillPath - 技能路径
 * @returns 命中的定义文件名，未命中返回 null
 */
async function detectSkillDefinitionFile(
    owner: string,
    repo: string,
    branch: string,
    skillPath: string
): Promise<typeof SKILL_DEFINITION_FILES[number] | null> {
    for (const definitionFile of SKILL_DEFINITION_FILES) {
        try {
            const basePath = skillPath ? `${skillPath}/` : '';
            const definitionUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${basePath}${definitionFile}`;
            await fetchUrlContent(definitionUrl);
            return definitionFile;
        } catch {
            // ignore
        }
    }
    return null;
}

/**
 * 使用 Git Trees API 高效搜索仓库中的所有技能定义文件 (v3.0.21)
 *
 * 优势：
 * - 只需要 1 次 API 调用即可获取整个仓库的文件树
 * - 不受目录深度限制
 * - 比递归搜索更快、更省 API 配额
 *
 * @param owner - 仓库所有者
 * @param repo - 仓库名称
 * @param branch - 分支名（默认 main）
 * @returns 技能位置列表
 */
async function searchSkillsWithTreeApi(
    owner: string,
    repo: string,
    branch: string = 'main'
): Promise<SkillLocation[]> {
    // Git Trees API: 一次性获取整个仓库的文件树
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;

    logger.info(LogTags.SKILL, `使用 Git Trees API 搜索: ${owner}/${repo}`);
    logger.debug(LogTags.SKILL, 'Git Trees 搜索参数', { owner, repo, branch });

    try {
        const payload = await fetchUrlContent(apiUrl);
        const data = JSON.parse(payload) as { truncated?: boolean; tree?: Array<{ type?: string; path?: string }> };

        // 检查是否被截断（超大仓库可能会被截断）
        if (data.truncated) {
            logger.info(LogTags.SKILL, `警告: 仓库文件树被截断，可能无法找到所有技能`);
        }

        const skillsByPath = new Map<string, SkillLocation>();

        // 遍历所有文件，找出 SKILL.md / SKILLS.md
        for (const item of data.tree || []) {
            const itemPath = item.path;
            if (!itemPath) continue;
            if (
                item.type === 'blob' &&
                (
                    itemPath === 'SKILL.md' ||
                    itemPath === 'SKILLS.md' ||
                    itemPath.endsWith('/SKILL.md') ||
                    itemPath.endsWith('/SKILLS.md')
                )
            ) {
                const definitionFile = itemPath.endsWith('/SKILLS.md') || itemPath === 'SKILLS.md' ? 'SKILLS.md' : 'SKILL.md';
                // 从路径中提取技能目录和名称
                // 例如: plugins/expo-app-design/skills/use-dom/SKILL.md -> use-dom
                const skillDir = itemPath === 'SKILL.md' || itemPath === 'SKILLS.md'
                    ? ''
                    : itemPath.replace(/\/SKILLS?\.md$/, '');
                const skillName = skillDir.split('/').pop() || '';

                if (skillDir === '' || skillName) {
                    const existing = skillsByPath.get(skillDir);
                    if (existing && existing.definitionFile === 'SKILL.md' && definitionFile === 'SKILLS.md') {
                        continue;
                    }
                    skillsByPath.set(skillDir, {
                        path: skillDir,
                        name: skillDir === '' ? repo : skillName,
                        definitionFile,
                    });
                    logger.info(LogTags.SKILL, `发现技能: ${skillDir === '' ? repo : skillName} (${skillDir || '根目录'}, ${definitionFile})`);
                }
            }
        }

        const skills = [...skillsByPath.values()];
        logger.info(LogTags.SKILL, `Git Trees API 找到 ${skills.length} 个技能`);
        return skills;
    } catch (err) {
        if (isGitHubRateLimitError(err)) {
            throw err instanceof Error ? err : buildGitHubRateLimitError();
        }
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('404')) {
            logger.info(LogTags.SKILL, `Git Trees API 请求失败: 404 (${owner}/${repo}@${branch})`);
            return [];
        }
        logger.info(LogTags.SKILL, `Git Trees API 搜索失败: ${err}`);
        return [];
    }
}

// v3.0.21: recursiveSkillSearch 已被 searchSkillsWithTreeApi 替代
// Git Trees API 只需 1 次 API 调用，更高效且不会触发限流

/**
 * 从技能位置列表获取技能 (v3.0.17)
 *
 * @param owner - 仓库所有者
 * @param repo - 仓库名称
 * @param branch - 分支名
 * @param locations - 技能位置列表
 * @param skillIds - 指定获取的技能 ID 列表（可选）
 * @returns 技能仓库索引
 */
async function fetchSkillsFromLocations(
    owner: string,
    repo: string,
    branch: string,
    locations: SkillLocation[],
    skillIds?: string[]
): Promise<SkillRegistry> {
    logger.info(LogTags.SKILL, '开始从位置列表获取技能', {
        owner,
        repo,
        branch,
        locationsCount: locations.length,
        requestedSkillIds: skillIds || [],
    });
    // 如果指定了 skillIds，过滤位置
    let targetLocations = locations;
    if (skillIds && skillIds.length > 0) {
        const skillIdsLower = skillIds.map(id => id.toLowerCase());
        // v3.0.24: 使用更灵活的匹配逻辑
        // 1. 将 location.name 转为 ID 格式（小写 + 空格转连字符）进行匹配
        // 2. 支持部分匹配（includes）
        targetLocations = locations.filter(loc => {
            const locNameLower = loc.name.toLowerCase();
            const locNameAsId = locNameLower.replace(/\s+/g, '-');
            const locPathLower = loc.path.toLowerCase();

            return skillIdsLower.some(skillId =>
                // 精确匹配
                locNameLower === skillId ||
                locNameAsId === skillId ||
                locPathLower === skillId ||
                // 部分匹配
                locNameLower.includes(skillId) ||
                locNameAsId.includes(skillId) ||
                skillId.includes(locNameAsId) ||
                locPathLower.includes(skillId)
            );
        });
        logger.info(LogTags.SKILL, '目录名路径初筛结果', {
            requested: skillIds,
            matchedCount: targetLocations.length,
        });

        if (targetLocations.length === 0) {
            const matchedByDefinitionName: SkillLocation[] = [];
            for (const location of locations) {
                try {
                    const definitionFile = location.definitionFile ?? await detectSkillDefinitionFile(owner, repo, branch, location.path);
                    if (!definitionFile) continue;

                    const baseRawUrl = location.path
                        ? `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${location.path}`
                        : `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;
                    const content = await fetchUrlContent(`${baseRawUrl}/${definitionFile}`);
                    const parsed = parseSkillMd(content);
                    if (!parsed) continue;

                    const parsedNameLower = parsed.name.toLowerCase();
                    const matched = skillIdsLower.some(skillId =>
                        parsedNameLower === skillId ||
                        parsedNameLower.includes(skillId) ||
                        skillId.includes(parsedNameLower)
                    );
                    if (matched) {
                        matchedByDefinitionName.push({
                            ...location,
                            definitionFile,
                            name: parsed.name,
                        });
                    }
                } catch {
                    // ignore and continue
                }
            }

            if (matchedByDefinitionName.length > 0) {
                targetLocations = matchedByDefinitionName;
                logger.info(LogTags.SKILL, '通过定义文件 name 二次匹配命中', {
                    requested: skillIds,
                    matched: matchedByDefinitionName.map(loc => ({ name: loc.name, path: loc.path })),
                });
            }
        }

        if (targetLocations.length === 0) {
            logger.warn(LogTags.SKILL, `指定的技能 (${skillIds.join(', ')}) 未找到，显示所有可用技能`);
            targetLocations = locations;
        }
    }

    // 并发获取所有技能
    const skillPromises = targetLocations.map(async (location) => {
        try {
            const baseRawUrl = location.path
                ? `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${location.path}`
                : `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;

            const definitionFile = location.definitionFile ?? await detectSkillDefinitionFile(owner, repo, branch, location.path);
            if (!definitionFile) {
                logger.warn(LogTags.SKILL, `跳过未找到定义文件的技能目录: ${location.path || '根目录'}`);
                return null;
            }
            logger.debug(LogTags.SKILL, '开始下载技能目录', {
                path: location.path || '.',
                name: location.name,
                definitionFile,
            });

            // 获取技能定义文件
            const skillMdUrl = `${baseRawUrl}/${definitionFile}`;
            const skillMdContent = await fetchUrlContent(skillMdUrl);
            const parsed = parseSkillMd(skillMdContent);

            if (!parsed) {
                logger.warn(LogTags.SKILL, `跳过无效的 ${definitionFile}: ${location.path}`);
                return null;
            }

            // 尝试获取 AGENTS.md
            let agentsMdContent: string | null = null;
            try {
                const agentsMdUrl = `${baseRawUrl}/AGENTS.md`;
                agentsMdContent = await fetchUrlContent(agentsMdUrl);
                if (!agentsMdContent || agentsMdContent.length === 0) {
                    agentsMdContent = null;
                }
            } catch {
                // AGENTS.md 不存在，忽略
            }

            // 构建 files 数组
            const files: SkillFile[] = [];
            files.push({
                path: definitionFile,
                name: definitionFile,
                content: skillMdContent,
                type: 'markdown',
            });

            if (agentsMdContent) {
                files.push({
                    path: 'AGENTS.md',
                    name: 'AGENTS.md',
                    content: agentsMdContent,
                    type: 'markdown',
                });
            }

            // 下载完整目录
            try {
                const fileList = await fetchSkillDirectoryContents(owner, repo, location.path || '.', branch);
                const filesToDownload = fileList.filter(
                    (f) => f.name !== definitionFile && f.name !== 'AGENTS.md'
                );

                if (filesToDownload.length > 0) {
                    const downloadedFiles = await downloadSkillFiles(filesToDownload);
                    files.push(...downloadedFiles);
                }
            } catch (err) {
                if (isGitHubRateLimitError(err)) {
                    throw err instanceof Error ? err : buildGitHubRateLimitError();
                }
                logger.warn(LogTags.SKILL, `下载完整目录失败 (${location.path}):`, err);
            }

            // 合并内容到 promptTemplate
            const promptTemplate = mergeSkillFilesToPrompt(
                parsed.promptTemplate,
                agentsMdContent,
                files
            );

            logger.info(LogTags.SKILL, `技能 ${location.name} 下载完成，共 ${files.length} 个文件`);

            return {
                id: location.name.toLowerCase().replace(/\s+/g, '-'),
                name: parsed.name,
                description: parsed.description || '',
                version: '1.0.0',
                tags: ['custom'],
                skill: {
                    name: parsed.name,
                    description: parsed.description,
                    category: 'custom' as const,
                    promptTemplate,
                    files,
                    // v3.0.22: 添加来源信息，便于后续升级
                    source: {
                        type: 'url' as const,
                        repoUrl: `https://github.com/${owner}/${repo}`,
                        repoOwner: owner,
                        repoName: repo,
                        skillPath: location.path,
                        branch,
                        installCommand: `npx skills add https://github.com/${owner}/${repo} --skill ${location.name}`,
                        installedAt: new Date(),
                    },
                },
            } as SkillRegistryItem;
        } catch (err) {
            if (isGitHubRateLimitError(err)) {
                throw err instanceof Error ? err : buildGitHubRateLimitError();
            }
            logger.warn(LogTags.SKILL, `获取技能失败 (${location.path}):`, err);
            return null;
        }
    });

    const results = await Promise.all(skillPromises);
    const validSkills = results.filter((s): s is SkillRegistryItem => s !== null);

    if (validSkills.length === 0) {
        throw new SkillInstallError('No skills parsed successfully');
    }

    logger.info(LogTags.SKILL, `成功获取 ${validSkills.length} 个技能`);

    return {
        name: `${owner}/${repo}`,
        version: '1.0.0',
        description: `从 GitHub 仓库 ${owner}/${repo} 导入的技能集`,
        skills: validSkills,
    };
}

/**
 * 从 JSON URL 获取技能仓库
 *
 * @param url - JSON 文件 URL
 * @returns 技能仓库索引
 */
async function fetchSkillRegistryJson(url: string): Promise<SkillRegistry> {
    // 解析 GitHub URL（将 blob URL 转换为 raw URL）
    const rawUrl = parseGithubUrl(url);

    logger.info(LogTags.SKILL, `获取 JSON 格式仓库: ${rawUrl}`);
    let data: unknown;
    const isGitHubRaw = rawUrl.includes('raw.githubusercontent.com') || rawUrl.includes('githubusercontent.com');
    if (isGitHubRaw) {
        const text = await fetchUrlContent(rawUrl);
        data = JSON.parse(text);
    } else {
        const response = await fetch(rawUrl, {
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache',
            },
        });

        if (!response.ok) {
            throw new Error(`获取技能仓库失败: ${response.status} ${response.statusText}`);
        }
        data = await response.json();
    }

    // 验证基本结构
    if (!data || typeof data !== 'object') {
        throw new SkillInstallError('Invalid skill registry format: not a valid JSON object');
    }
    const dataObj = data as Record<string, unknown>;
    const dataSkills = Array.isArray(dataObj.skills) ? dataObj.skills : null;
    const dataName = typeof dataObj.name === 'string' ? dataObj.name : '';
    const dataVersion = typeof dataObj.version === 'string' ? dataObj.version : undefined;

    // 如果是技能包格式（直接包含 skills 数组），转换为仓库格式
    if (dataSkills && !dataName) {
        logger.info(LogTags.SKILL, '检测到技能包格式，转换为仓库格式');
        return {
            name: '导入的技能',
            version: dataVersion || '1.0.0',
            skills: dataSkills.map((skill: SkillCreateInput, index: number) => ({
                id: skill.name?.toLowerCase().replace(/\s+/g, '-') || `skill-${index}`,
                name: skill.name || `技能 ${index + 1}`,
                description: skill.description || '',
                version: '1.0.0',
                tags: [skill.category || 'custom'],
                skill: skill,
            })),
        };
    }

    // 验证仓库必需字段
    if (!dataName || !dataSkills) {
        throw new SkillInstallError('Invalid skill registry format: missing required fields name or skills');
    }

    logger.info(LogTags.SKILL, `获取技能仓库成功: ${dataName}, 包含 ${dataSkills.length} 个技能`);

    return data as SkillRegistry;
}

/**
 * 从仓库条目获取完整的技能定义
 *
 * @param item - 仓库中的技能条目
 * @param baseUrl - 仓库基础 URL（用于解析相对路径）
 * @returns 完整的技能创建输入
 *
 * @example
 * const skill = await fetchSkillFromRegistry(registryItem, 'https://raw.githubusercontent.com/user/repo/main');
 */
export async function fetchSkillFromRegistry(
    item: SkillRegistryItem,
    baseUrl?: string
): Promise<SkillCreateInput> {
    // 如果有内联定义，直接返回
    if (item.skill) {
        logger.info(LogTags.SKILL, `使用内联定义: ${item.name}`);
        return item.skill;
    }

    // 如果有外链 URL，则获取
    if (item.url) {
        let skillUrl = item.url;

        // 处理相对路径
        if (!skillUrl.startsWith('http') && baseUrl) {
            skillUrl = new URL(skillUrl, baseUrl).href;
        }

        // 解析 GitHub URL
        skillUrl = parseGithubUrl(skillUrl);

        logger.info(LogTags.SKILL, `从 URL 获取技能定义: ${skillUrl}`);

        const response = await fetch(skillUrl, {
            headers: {
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`获取技能定义失败: ${response.status}`);
        }

        const data = await response.json();

        // 验证并返回
        if (!data || typeof data !== 'object' || !data.name) {
            throw new SkillInstallError('Invalid skill definition format');
        }

        return data as SkillCreateInput;
    }

    throw new SkillInstallError(`Skill entry "${item.name}" is missing skill or url field`);
}

/**
 * 验证技能包格式
 *
 * @param data - 待验证的数据
 * @returns 验证结果，包含是否有效、错误信息和解析后的包
 *
 * @example
 * const result = validateSkillPackage(jsonData);
 * if (result.valid) {
 *   console.log('技能包有效，包含', result.package.skills.length, '个技能');
 * } else {
 *   console.error('验证失败:', result.errors);
 * }
 */
export function validateSkillPackage(data: unknown): SkillPackageValidation {
    const errors: string[] = [];

    // 检查基本类型
    if (!data || typeof data !== 'object') {
        return { valid: false, errors: ['数据不是有效的 JSON 对象'] };
    }

    const pkg = data as Record<string, unknown>;

    // 检查必需字段
    if (!pkg.version || typeof pkg.version !== 'string') {
        errors.push('缺少或无效的 version 字段');
    }

    if (!Array.isArray(pkg.skills)) {
        errors.push('缺少或无效的 skills 字段：必须是数组');
    } else if (pkg.skills.length === 0) {
        errors.push('skills 数组不能为空');
    } else {
        // 验证每个技能
        pkg.skills.forEach((skill: unknown, index: number) => {
            const skillErrors = validateSkillInput(skill, index);
            errors.push(...skillErrors);
        });
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    return {
        valid: true,
        errors: [],
        package: data as SkillPackage,
    };
}

/**
 * 验证单个技能输入
 *
 * @param skill - 技能数据
 * @param index - 数组索引（用于错误信息）
 * @returns 错误信息数组
 */
function validateSkillInput(skill: unknown, index: number): string[] {
    const errors: string[] = [];
    const prefix = `技能 #${index + 1}`;

    if (!skill || typeof skill !== 'object') {
        return [`${prefix}: 不是有效的对象`];
    }

    const s = skill as Record<string, unknown>;

    if (!s.name || typeof s.name !== 'string') {
        errors.push(`${prefix}: 缺少或无效的 name 字段`);
    }

    if (!s.description || typeof s.description !== 'string') {
        errors.push(`${prefix}: 缺少或无效的 description 字段`);
    }

    if (!s.category || typeof s.category !== 'string') {
        errors.push(`${prefix}: 缺少或无效的 category 字段`);
    }

    if (!s.promptTemplate || typeof s.promptTemplate !== 'string') {
        errors.push(`${prefix}: 缺少或无效的 promptTemplate 字段`);
    }

    return errors;
}

/**
 * 导出技能为 JSON 格式
 *
 * @param skills - 要导出的技能列表
 * @param options - 导出选项
 * @returns JSON 字符串
 *
 * @example
 * const json = exportSkillsToJson(mySkills, { author: 'John' });
 * // 下载或保存 json
 */
export function exportSkillsToJson(
    skills: Skill[],
    options?: { author?: string; source?: string }
): string {
    // 转换为 SkillCreateInput 格式（移除运行时字段）
    // v3.0.18: 包含 files 字段，支持导出附带文件
    // v3.0.22: 包含 source 字段，支持导出来源信息
    const skillInputs: SkillCreateInput[] = skills.map((skill) => ({
        name: getLocalText(skill.name),
        description: getLocalText(skill.description),
        category: skill.category,
        icon: skill.icon,
        color: skill.color,
        promptTemplate: skill.promptTemplate,
        outputFormat: skill.outputFormat,
        outputSchema: skill.outputSchema,
        triggers: skill.triggers,
        variables: skill.variables,
        // v3.0.18: 包含附带文件（rules/*.md、scripts/*.sh 等）
        files: skill.files,
        // v3.0.22: 包含来源信息（用于后续升级）
        source: skill.source,
    }));

    const meta: SkillPackageMeta = {
        exportedAt: new Date().toISOString(),
        exportedBy: 'MobausStudio/v3.0.22',
        ...(options?.author && { author: options.author }),
        ...(options?.source && { source: options.source }),
    };

    const pkg: SkillPackage = {
        version: '1.0.0',
        skills: skillInputs,
        meta,
    };

    return JSON.stringify(pkg, null, 2);
}

/**
 * 检测重复技能
 *
 * @param newSkills - 新导入的技能列表
 * @param existingSkills - 现有技能列表
 * @returns 重复的技能和唯一的技能
 *
 * @example
 * const { duplicates, unique } = detectDuplicateSkills(importedSkills, existingSkills);
 * if (duplicates.length > 0) {
 *   console.log('发现重复技能:', duplicates.map(d => d.newSkill.name));
 * }
 */
export function detectDuplicateSkills(
    newSkills: SkillCreateInput[],
    existingSkills: Skill[]
): { duplicates: DuplicateSkillResult[]; unique: SkillCreateInput[] } {
    const duplicates: DuplicateSkillResult[] = [];
    const unique: SkillCreateInput[] = [];

    // 创建现有技能的索引
    const existingById = new Map<string, Skill>();
    const existingByName = new Map<string, Skill>();

    for (const skill of existingSkills) {
        existingById.set(skill.id, skill);
        existingByName.set(getLocalText(skill.name).toLowerCase(), skill);
    }

    for (const newSkill of newSkills) {
        // 检查 ID 重复（如果有自定义 ID）
        const customId = (newSkill as unknown as { id?: string }).id;
        if (customId && existingById.has(customId)) {
            duplicates.push({
                newSkill,
                existingSkill: existingById.get(customId)!,
                matchType: 'id',
            });
            continue;
        }

        // 检查名称重复
        const nameLower = newSkill.name.toLowerCase();
        if (existingByName.has(nameLower)) {
            duplicates.push({
                newSkill,
                existingSkill: existingByName.get(nameLower)!,
                matchType: 'name',
            });
            continue;
        }

        unique.push(newSkill);
    }

    logger.info(LogTags.SKILL, `重复检测完成: ${duplicates.length} 个重复, ${unique.length} 个唯一`);

    return { duplicates, unique };
}

/**
 * 应用重复处理策略
 *
 * @param duplicates - 重复技能列表
 * @param strategy - 处理策略
 * @returns 处理后的技能列表
 */
export function applyDuplicateStrategy(
    duplicates: DuplicateSkillResult[],
    strategy: 'skip' | 'overwrite' | 'rename'
): { toAdd: SkillCreateInput[]; toUpdate: { id: string; data: SkillCreateInput }[] } {
    const toAdd: SkillCreateInput[] = [];
    const toUpdate: { id: string; data: SkillCreateInput }[] = [];

    for (const dup of duplicates) {
        switch (strategy) {
            case 'skip':
                // 跳过，不做任何操作
                logger.info(LogTags.SKILL, `跳过重复技能: ${dup.newSkill.name}`);
                break;

            case 'overwrite':
                // 更新现有技能
                toUpdate.push({
                    id: dup.existingSkill.id,
                    data: dup.newSkill,
                });
                logger.info(LogTags.SKILL, `覆盖技能: ${dup.newSkill.name}`);
                break;

            case 'rename': {
                // 重命名后添加
                const renamedSkill: SkillCreateInput = {
                    ...dup.newSkill,
                    name: `${dup.newSkill.name} (导入)`,
                };
                toAdd.push(renamedSkill);
                logger.info(LogTags.SKILL, `重命名添加: ${renamedSkill.name}`);
                break;
            }
        }
    }

    return { toAdd, toUpdate };
}

// ==================== v3.0.2: 命令格式解析 ====================

/**
 * 解析技能安装命令
 *
 * 支持格式：
 * - npx skills add <url> [--skill <id>]...
 * - 纯 URL (http/https 开头)
 *
 * @param input - 用户输入（命令或URL）
 * @returns 解析结果，无效输入返回 null
 *
 * @example
 * parseSkillCommand('npx skills add https://github.com/user/repo --skill my-skill')
 * // 返回: { url: 'https://github.com/user/repo', skillIds: ['my-skill'], isCommand: true, rawInput: '...' }
 *
 * @example
 * parseSkillCommand('https://github.com/user/repo')
 * // 返回: { url: 'https://github.com/user/repo', isCommand: false, rawInput: '...' }
 */
export function parseSkillCommand(input: string): SkillCommandParseResult | null {
    // 去除首尾空格
    const trimmed = input.trim();

    // 空输入返回 null
    if (!trimmed) {
        return null;
    }

    // 检查是否为命令格式: npx skills add <url> ...
    const commandPattern = /^npx\s+skills\s+add\s+(.+)$/i;
    const commandMatch = trimmed.match(commandPattern);

    if (commandMatch) {
        // 解析命令参数
        const argsString = commandMatch[1];
        return parseCommandArgs(argsString, trimmed);
    }

    // 检查是否为纯 URL
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return {
            url: trimmed,
            rawInput: trimmed,
            isCommand: false,
        };
    }

    // 无法识别的格式
    return null;
}

/**
 * 解析命令参数
 *
 * @param argsString - 命令参数字符串
 * @param rawInput - 原始输入
 * @returns 解析结果
 */
function parseCommandArgs(argsString: string, rawInput: string): SkillCommandParseResult | null {
    // 分割参数（简单实现：按空格分割，支持 --skill 选项）
    const parts = argsString.split(/\s+/);

    let url = '';
    const skillIds: string[] = [];

    let i = 0;
    while (i < parts.length) {
        const part = parts[i];

        if (part === '--skill' || part === '-s') {
            // 获取技能 ID
            if (i + 1 < parts.length) {
                skillIds.push(parts[i + 1]);
                i += 2;
            } else {
                // --skill 后面没有参数，忽略
                i += 1;
            }
        } else if (part.startsWith('http://') || part.startsWith('https://')) {
            // URL
            url = part;
            i += 1;
        } else if (!part.startsWith('-')) {
            // 非选项参数，可能是 URL（没有协议前缀的情况）
            // 尝试作为 GitHub 短链接处理
            if (part.includes('github.com') || part.includes('/')) {
                url = part.startsWith('github.com') ? `https://${part}` : part;
            }
            i += 1;
        } else {
            // 其他选项，跳过
            i += 1;
        }
    }

    // 必须有 URL
    if (!url) {
        return null;
    }

    const result: SkillCommandParseResult = {
        url,
        rawInput,
        isCommand: true,
    };

    // 如果有指定技能 ID，添加到结果
    if (skillIds.length > 0) {
        result.skillIds = skillIds;
    }

    logger.info(LogTags.SKILL, `解析命令: URL=${url}, skillIds=${skillIds.join(', ') || '无'}`);

    return result;
}

// ==================== v3.0.3: SKILL.md 格式支持 ====================

import type { GitHubContentItem, SkillMdParseResult } from '../types';

/**
 * 解析 SKILL.md 文件内容
 *
 * SKILL.md 文件格式：
 * - YAML frontmatter（包含 name 和 description）
 * - Markdown 正文（作为 promptTemplate）
 *
 * @param content - SKILL.md 文件原始内容
 * @returns 解析结果，无效格式返回 null
 *
 * @example
 * const result = parseSkillMd(`---
 * name: React Best Practices
 * description: Follow React official best practices
 * ---
 *
 * When helping with React development...`);
 */
export function parseSkillMd(content: string): SkillMdParseResult | null {
    if (!content || typeof content !== 'string') {
        return null;
    }

    // 匹配 YAML frontmatter 块
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) {
        logger.warn(LogTags.SKILL, 'SKILL.md 缺少 frontmatter');
        return null;
    }

    // 解析 frontmatter
    const frontmatter = parseFrontmatter(frontmatterMatch[1]);
    if (!frontmatter) {
        logger.warn(LogTags.SKILL, 'SKILL.md frontmatter 解析失败');
        return null;
    }

    // 验证必需字段
    const name = frontmatter['name'];
    if (!name || typeof name !== 'string' || !name.trim()) {
        logger.warn(LogTags.SKILL, 'SKILL.md 缺少 name 字段');
        return null;
    }

    // 提取 Markdown 正文（去除 frontmatter 后的内容）
    const promptTemplate = content
        .slice(frontmatterMatch[0].length)
        .trim();

    return {
        name: name.trim(),
        description: (frontmatter['description'] as string)?.trim() || '',
        promptTemplate,
        frontmatter,
    };
}

/**
 * 解析 YAML frontmatter
 *
 * 简单实现，支持基本的 key: value 格式
 *
 * @param yaml - YAML 内容字符串
 * @returns 解析后的键值对，解析失败返回 null
 */
function parseFrontmatter(yaml: string): Record<string, unknown> | null {
    if (!yaml || !yaml.trim()) {
        return null;
    }

    const result: Record<string, unknown> = {};
    const lines = yaml.split(/\r?\n/);

    for (const line of lines) {
        // 跳过空行和注释
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) {
            continue;
        }

        // 查找第一个冒号
        const colonIndex = line.indexOf(':');
        if (colonIndex <= 0) {
            continue;
        }

        const key = line.slice(0, colonIndex).trim();
        let value: string = line.slice(colonIndex + 1).trim();

        // 处理引号包裹的值
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        result[key] = value;
    }

    return Object.keys(result).length > 0 ? result : null;
}

/**
 * 解析 GitHub 仓库 URL，提取 owner、repo、branch 和可选的技能路径 (v3.0.17 增强)
 *
 * 支持格式：
 * - github.com/owner/repo
 * - github.com/owner/repo/tree/branch
 * - github.com/owner/repo/tree/branch/path/to/skill (直接技能路径)
 *
 * @param url - GitHub 仓库 URL
 * @returns 解析结果，无效 URL 返回 null
 *
 * @example
 * parseGitHubRepoInfo('https://github.com/vercel-labs/agent-skills')
 * // 返回: { owner: 'vercel-labs', repo: 'agent-skills', branch: 'main' }
 *
 * parseGitHubRepoInfo('https://github.com/vercel-labs/agent-skills/tree/main/skills/react')
 * // 返回: { owner: 'vercel-labs', repo: 'agent-skills', branch: 'main', skillPath: 'skills/react' }
 */
export function parseGitHubRepoInfo(url: string): GitHubUrlParseResult | null {
    try {
        const urlObj = new URL(url);

        // 仅支持 github.com
        if (urlObj.hostname !== 'github.com') {
            return null;
        }

        // 解析路径: /owner/repo[/tree/branch[/path/to/skill]]
        const pathParts = urlObj.pathname.split('/').filter(Boolean);

        if (pathParts.length < 2) {
            return null;
        }

        const owner = pathParts[0];
        const repo = pathParts[1];
        let branch = 'main'; // 默认分支
        let isBranchExplicit = false;
        let skillPath: string | undefined;

        // 检查是否指定了分支：/owner/repo/tree/branch[/path]
        if (pathParts.length >= 4 && pathParts[2] === 'tree') {
            branch = pathParts[3];
            isBranchExplicit = true;

            // v3.0.17: 检查是否有额外的路径（直接技能路径）
            if (pathParts.length > 4) {
                skillPath = pathParts.slice(4).join('/');
            }
        }

        return { owner, repo, branch, isBranchExplicit, skillPath };
    } catch {
        return null;
    }
}

/**
 * 从 GitHub 仓库获取 skills 目录列表
 *
 * 使用 GitHub Contents API 获取 skills/ 目录下的所有子目录
 *
 * @param owner - 仓库所有者
 * @param repo - 仓库名称
 * @param branch - 分支名（默认 main）
 * @returns 技能目录名称列表
 */
export async function fetchGitHubSkillsDirectory(
    owner: string,
    repo: string,
    branch: string = 'main'
): Promise<string[]> {
    // GitHub Contents API URL
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/skills?ref=${branch}`;

    logger.info(LogTags.SKILL, `获取 GitHub skills 目录: ${apiUrl}`);

    const response = await fetch(apiUrl, {
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'MobausStudio',
        },
    });

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error(`仓库 ${owner}/${repo} 中未找到 skills 目录`);
        }
        throw new Error(`GitHub API 请求失败: ${response.status} ${response.statusText}`);
    }

    const contents: GitHubContentItem[] = await response.json();

    // 过滤出目录类型
    const skillDirs = contents
        .filter((item) => item.type === 'dir')
        .map((item) => item.name);

    logger.info(LogTags.SKILL, `发现 ${skillDirs.length} 个技能目录: ${skillDirs.join(', ')}`);

    return skillDirs;
}

/**
 * 从 GitHub 仓库获取 SKILL.md 格式的技能注册表
 *
 * 扫描 skills/ 目录，解析每个子目录中的 SKILL.md 文件
 *
 * @param owner - 仓库所有者
 * @param repo - 仓库名称
 * @param branch - 分支名（默认 main）
 * @param skillIds - 指定获取的技能 ID 列表（可选，不指定则获取全部）
 * @returns 技能注册表
 */
export async function fetchSkillMdRegistry(
    owner: string,
    repo: string,
    branch: string = 'main',
    skillIds?: string[]
): Promise<SkillRegistry> {
    logger.info(LogTags.SKILL, `开始获取 SKILL.md 格式仓库: ${owner}/${repo}@${branch}`);

    // 1. 获取 skills 目录列表
    const allSkillDirs = await fetchGitHubSkillsDirectory(owner, repo, branch);

    if (allSkillDirs.length === 0) {
        throw new SkillInstallError('Skills directory is empty, no skills found');
    }

    // 2. 如果指定了技能 ID，先尝试直接匹配目录名
    let targetDirs: string[];

    if (skillIds && skillIds.length > 0) {
        // v3.0.12: 先尝试直接匹配目录名
        const directMatches = allSkillDirs.filter((dir) => skillIds.includes(dir));

        if (directMatches.length > 0) {
            targetDirs = directMatches;
            logger.info(LogTags.SKILL, `通过目录名匹配到 ${directMatches.length} 个技能`);
        } else {
            // 目录名没匹配到，需要获取所有 SKILL.md 来匹配 name 字段
            logger.info(LogTags.SKILL, `目录名未匹配，尝试通过 SKILL.md name 字段匹配...`);
            targetDirs = allSkillDirs; // 先获取所有，后面再过滤
        }
    } else {
        targetDirs = allSkillDirs;
    }

    // 3. 并发获取所有 SKILL.md 文件（v3.0.15: 同时下载完整目录）
    const skillPromises = targetDirs.map(async (skillId) => {
        try {
            const skillPath = `skills/${skillId}`;
            const baseRawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${skillPath}`;

            // 获取 SKILL.md
            const skillMdUrl = `${baseRawUrl}/SKILL.md`;
            const skillMdContent = await fetchUrlContent(skillMdUrl);
            const parsed = parseSkillMd(skillMdContent);

            if (!parsed) {
                logger.warn(LogTags.SKILL, `跳过无效的 SKILL.md: ${skillId}`);
                return null;
            }

            // v3.0.15: 尝试获取 AGENTS.md
            let agentsMdContent: string | null = null;
            try {
                const agentsMdUrl = `${baseRawUrl}/AGENTS.md`;
                agentsMdContent = await fetchUrlContent(agentsMdUrl);
                if (!agentsMdContent || agentsMdContent.length === 0) {
                    agentsMdContent = null;
                }
            } catch {
                // AGENTS.md 不存在，忽略
            }

            // v3.0.15: 构建 files 数组
            const files: SkillFile[] = [];

            // 添加 SKILL.md
            files.push({
                path: 'SKILL.md',
                name: 'SKILL.md',
                content: skillMdContent,
                type: 'markdown',
            });

            // 添加 AGENTS.md（如果存在）
            if (agentsMdContent) {
                files.push({
                    path: 'AGENTS.md',
                    name: 'AGENTS.md',
                    content: agentsMdContent,
                    type: 'markdown',
                });
            }

            // v3.0.15: 下载完整目录
            try {
                const fileList = await fetchSkillDirectoryContents(owner, repo, skillPath, branch);
                const filesToDownload = fileList.filter(
                    (f) => f.name !== 'SKILL.md' && f.name !== 'AGENTS.md'
                );

                if (filesToDownload.length > 0) {
                    const downloadedFiles = await downloadSkillFiles(filesToDownload);
                    files.push(...downloadedFiles);
                }
            } catch (err) {
                if (isGitHubRateLimitError(err)) {
                    throw err instanceof Error ? err : buildGitHubRateLimitError();
                }
                logger.warn(LogTags.SKILL, `下载完整目录失败 (${skillId}):`, err);
                // 继续使用基础内容
            }

            logger.info(LogTags.SKILL, `技能 ${skillId} 下载完成，共 ${files.length} 个文件`);

            // 合并内容到 promptTemplate
            const promptTemplate = mergeSkillFilesToPrompt(
                parsed.promptTemplate,
                agentsMdContent,
                files
            );

            // 转换为 SkillRegistryItem 格式
            return {
                id: skillId,
                name: parsed.name,
                description: parsed.description,
                version: '1.0.0',
                tags: ['skill.md'],
                skill: {
                    name: parsed.name,
                    description: parsed.description,
                    category: 'custom' as const,
                    promptTemplate,
                    files,  // v3.0.15: 包含完整文件列表
                },
            };
        } catch (err) {
            if (isGitHubRateLimitError(err)) {
                throw err instanceof Error ? err : buildGitHubRateLimitError();
            }
            logger.warn(LogTags.SKILL, `获取 SKILL.md 失败 (${skillId}):`, err);
            return null;
        }
    });

    const results = await Promise.all(skillPromises);
    let validSkills: SkillRegistryItem[] = results.filter(
        (s): s is NonNullable<typeof s> => s !== null
    );

    // v3.0.12: 如果指定了 skillIds 且之前没有直接匹配到目录名，现在按 name 字段过滤
    if (skillIds && skillIds.length > 0 && !allSkillDirs.some((dir) => skillIds.includes(dir))) {
        const skillIdsLower = skillIds.map(id => id.toLowerCase());
        const filteredByName = validSkills.filter((skill) =>
            skillIdsLower.includes(skill.name.toLowerCase()) ||
            skillIdsLower.includes(skill.id.toLowerCase())
        );

        if (filteredByName.length > 0) {
            logger.info(LogTags.SKILL, `通过 SKILL.md name 字段匹配到 ${filteredByName.length} 个技能`);
            validSkills = filteredByName;
        } else {
            // 都没匹配到，返回所有并提示
            logger.warn(LogTags.SKILL, `指定的技能 (${skillIds.join(', ')}) 未找到，显示所有可用技能`);
        }
    }

    if (validSkills.length === 0) {
        throw new SkillInstallError('No skills parsed successfully');
    }

    logger.info(LogTags.SKILL, `成功获取 ${validSkills.length} 个技能（共 ${targetDirs.length} 个目录）`);

    // 4. 构建 SkillRegistry
    return {
        name: `${owner}/${repo}`,
        version: '1.0.0',
        description: `从 GitHub 仓库 ${owner}/${repo} 导入的技能集`,
        skills: validSkills,
    };
}

/**
 * 检测 GitHub 仓库是否使用 SKILL.md 格式
 *
 * @param owner - 仓库所有者
 * @param repo - 仓库名称
 * @param branch - 分支名
 * @returns 是否为 SKILL.md 格式仓库
 */
export async function isSkillMdRepository(
    owner: string,
    repo: string,
    branch: string = 'main'
): Promise<boolean> {
    try {
        const skillDirs = await fetchGitHubSkillsDirectory(owner, repo, branch);
        return skillDirs.length > 0;
    } catch {
        return false;
    }
}

// ==================== v3.0.5/v3.0.6: skills.sh 完整集成 ====================

import { invoke } from '@tauri-apps/api/core';
import type { SkillsShFetchParams, SkillsShItem, SkillsShResponse } from '../types';

interface ArchiveSkillLocation {
    path: string;
    name: string;
    definitionFile: 'SKILL.md' | 'SKILLS.md';
    definitionContent: string;
}

/**
 * 从 skills.sh 获取技能列表（通过 Rust 代理）(v3.0.6)
 *
 * 由于 skills.sh API 不支持 CORS，前端无法直接调用。
 * 通过 Tauri invoke 调用 Rust 后端代理请求。
 *
 * @param params - 分页和搜索参数
 * @returns skills.sh 响应
 * @throws 网络错误时抛出异常
 *
 * @example
 * // 获取前20条
 * const response = await fetchSkillsShList();
 *
 * // 分页获取
 * const page2 = await fetchSkillsShList({ offset: 20, limit: 20 });
 *
 * // 搜索
 * const searchResult = await fetchSkillsShList({ search: 'react' });
 */
export async function fetchSkillsShList(params?: SkillsShFetchParams): Promise<SkillsShResponse> {
    logger.info(LogTags.SKILL, `通过 Rust 代理获取 skills.sh 列表`, params);

    try {
        // 调用 Rust 后端代理（绕过 CORS 限制）
        // v3.0.12: 修复 hasMore 字段名（Rust 用 serde rename 返回 hasMore）
        const response = await invoke<{
            skills: SkillsShItem[];
            hasMore: boolean;
        }>('fetch_skills_sh', {
            params: {
                limit: params?.limit || 20,
                offset: params?.offset || 0,
                search: params?.search || null,
            },
        });

        logger.info(LogTags.SKILL, `skills.sh 返回 ${response.skills.length} 个技能，hasMore: ${response.hasMore}`);

        return {
            skills: response.skills,
            hasMore: response.hasMore,
        };
    } catch (listError) {
        logger.error(LogTags.SKILL, '获取 skills.sh 列表失败:', listError);
        throw new Error('获取 skills.sh 列表失败', { cause: listError });
    }
}

/**
 * 通过 Rust 代理获取 URL 内容（绕过 CORS）(v3.0.7)
 *
 * @param url - 要获取的 URL
 * @returns 文件内容字符串
 * @throws 获取失败时抛出异常
 */
async function fetchUrlContent(url: string): Promise<string> {
    return invoke<string>('fetch_url_content', { url });
}

async function scanSkillsFromGitHubArchive(
    owner: string,
    repo: string,
    branch: string
): Promise<ArchiveSkillLocation[]> {
    const payload = await invoke<string>('scan_github_skills_archive', {
        owner,
        repo,
        branch,
    });
    const parsed = JSON.parse(payload) as ArchiveSkillLocation[];
    return Array.isArray(parsed) ? parsed : [];
}

/**
 * 技能获取选项 (v3.0.7, v3.0.14 扩展)
 */
export interface FetchSkillOptions {
    /** 是否获取完整内容（包括 AGENTS.md），默认 true */
    fetchFullContent?: boolean;
    /** v3.0.14: 是否下载完整目录（包括 rules/ 等子目录），默认 true */
    downloadFullDirectory?: boolean;
}

/**
 * 从 skills.sh 技能项获取完整技能定义 (v3.0.21 Git Trees API)
 *
 * 自动检测并获取多个文件：
 * 1. 从 SKILL.md 提取元数据（name, description）
 * 2. 优先获取 AGENTS.md 作为主要提示词
 * 3. v3.0.14: 递归下载整个技能目录（rules/、scripts/ 等）
 * 4. 智能合并所有 markdown 文件到 promptTemplate
 * 5. 保存原始文件到 files 字段供后续使用
 *
 * v3.0.19 修复：
 * - 使用多路径搜索，与 URL 安装保持一致
 * - 支持 skills/、skills/.curated/、skills/.experimental/ 等子目录
 * - 解决官方仓库安装 404 问题
 *
 * v3.0.21 修复：
 * - 使用 Git Trees API 替代递归搜索（只需 1 次 API 调用）
 * - 解决 GitHub API 限流问题（60次/小时）
 * - 支持任意深度的技能目录结构（如 plugins/xxx/skills/yyy）
 * - 与 npx skills add 命令行为完全一致
 *
 * @param item - skills.sh 技能项
 * @param options - 获取选项
 * @returns 技能创建输入（包含合并后的 promptTemplate 和原始 files）
 * @throws 获取失败时抛出异常
 *
 * @example
 * const item = { id: 'vercel-labs/agent-skills/react', skillId: 'react', name: 'React Best Practices', installs: 45594, source: 'vercel-labs/agent-skills' };
 * const skill = await fetchSkillFromSkillsSh(item);
 * // skill.promptTemplate 包含 AGENTS.md + rules/*.md 合并后的完整内容
 * // skill.files 包含所有下载的原始文件
 */
export async function fetchSkillFromSkillsSh(
    item: SkillsShItem,
    options?: FetchSkillOptions
): Promise<SkillCreateInput> {
    const { fetchFullContent = true, downloadFullDirectory = true } = options || {};

    // v3.0.23: 使用 skillId 作为技能标识，source 作为仓库来源
    const skillId = item.skillId || item.name;  // 兼容旧数据
    logger.info(LogTags.SKILL, `从 skills.sh 获取技能: ${skillId} (来源: ${item.source})`);
    logger.debug(LogTags.SKILL, 'skills.sh 安装入参', {
        id: item.id,
        skillId: item.skillId,
        name: item.name,
        source: item.source,
        fetchFullContent,
        downloadFullDirectory,
    });

    // 解析 source 获取 owner 和 repo
    const parts = item.source.split('/');
    if (parts.length !== 2) {
        throw new Error(`无效的仓库格式: ${item.source}`);
    }

    const [owner, repo] = parts;
    const branch = await resolveGitHubBranch(owner, repo, 'main');
    const SKILL_DEFINITION_FILES = ['SKILL.md', 'SKILLS.md'] as const;
    const buildRawBaseUrl = (path: string): string =>
        path
            ? `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
            : `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;

    const matchSkillName = (candidate: string, target: string): boolean => {
        const candidateLower = candidate.toLowerCase();
        const targetLower = target.toLowerCase();
        return (
            candidateLower === targetLower ||
            candidateLower.includes(targetLower) ||
            targetLower.includes(candidateLower)
        );
    };

    const findSkillDefinitionByContent = async (
        locations: SkillLocation[],
        targetSkillId: string
    ): Promise<{ location: SkillLocation; fileName: typeof SKILL_DEFINITION_FILES[number] } | null> => {
        for (const location of locations) {
            const base = buildRawBaseUrl(location.path);
            const candidateFiles = location.definitionFile ? [location.definitionFile] : [...SKILL_DEFINITION_FILES];
            for (const fileName of candidateFiles) {
                try {
                    const content = await fetchUrlContent(`${base}/${fileName}`);
                    const parsed = parseSkillMd(content);
                    if (!parsed) continue;
                    if (matchSkillName(parsed.name, targetSkillId)) {
                        return { location, fileName };
                    }
                } catch {
                    // ignore and continue
                }
            }
        }
        return null;
    };

    const addRootSkillIfExists = async (locations: SkillLocation[]): Promise<SkillLocation[]> => {
        const rootDefinitionFile = await detectSkillDefinitionFile(owner, repo, branch, '');
        if (rootDefinitionFile && !locations.some(loc => loc.path === '')) {
            locations.push({
                path: '',
                name: repo,
                isRoot: true,
                definitionFile: rootDefinitionFile,
            });
        }
        return locations;
    };

    const skillIdLower = skillId.toLowerCase();

    let skillPath: string | null = null;
    let baseRawUrl: string | null = null;
    let skillDefinitionFile: typeof SKILL_DEFINITION_FILES[number] = 'SKILL.md';
    let discoveredSkillLocations: SkillLocation[] = [];
    let archiveDefinitionContent: string | null = null;
    let treeApiRateLimited = false;

    // 第一阶段：优先使用 Git Trees API（单次获取）
    logger.info(LogTags.SKILL, `第一阶段：优先使用 Git Trees API 搜索整个仓库...`, { owner, repo });
    try {
        const allSkillLocations = await addRootSkillIfExists(
            await searchSkillsWithTreeApi(owner, repo, branch)
        );
        discoveredSkillLocations = allSkillLocations;
        logger.info(LogTags.SKILL, `Git Trees API 返回 ${allSkillLocations.length} 个技能位置`, {
            locations: allSkillLocations.map(loc => ({ name: loc.name, path: loc.path }))
        });

        const skillIdLower = skillId.toLowerCase();
        const matchedLocation = allSkillLocations.find(loc => {
            const locNameLower = loc.name.toLowerCase();
            if (locNameLower === skillIdLower) return true;
            if (locNameLower.includes(skillIdLower) || skillIdLower.includes(locNameLower)) return true;
            const prefixes = ['vercel-', 'anthropic-', 'expo-', 'supabase-', 'remotion-'];
            for (const prefix of prefixes) {
                if (skillIdLower.startsWith(prefix)) {
                    const withoutPrefix = skillIdLower.slice(prefix.length);
                    if (locNameLower === withoutPrefix || locNameLower.includes(withoutPrefix)) return true;
                }
            }
            return false;
        });

        if (matchedLocation) {
            skillPath = matchedLocation.path;
            baseRawUrl = buildRawBaseUrl(skillPath);
            logger.info(LogTags.SKILL, `✓ Git Trees API 找到技能路径: ${skillPath}`);
        } else {
            const matchedByContent = await findSkillDefinitionByContent(allSkillLocations, skillId);
            if (matchedByContent) {
                skillPath = matchedByContent.location.path;
                baseRawUrl = buildRawBaseUrl(skillPath);
                skillDefinitionFile = matchedByContent.fileName;
                logger.info(LogTags.SKILL, `✓ 通过技能文件内容匹配到技能路径: ${skillPath} (${skillDefinitionFile})`);
            }
        }

        if (skillPath === null || !baseRawUrl) {
            logger.warn(LogTags.SKILL, `Git Trees API 未找到匹配的技能`, {
                skillId,
                skillIdLower,
                availableSkills: allSkillLocations.map(loc => loc.name)
            });
        } else {
            logger.info(LogTags.SKILL, 'Git Trees 阶段匹配成功', {
                skillId,
                skillPath,
                skillDefinitionFile,
            });
        }
    } catch (err) {
        if (isGitHubRateLimitError(err)) {
            treeApiRateLimited = true;
            logger.warn(LogTags.SKILL, 'Git Trees API 限流，准备回退到离线包扫描');
        } else {
            logger.error(LogTags.SKILL, `Git Trees API 搜索失败`, { error: String(err), owner, repo });
        }
    }

    // 第二阶段：Git Trees 未命中或限流时，使用离线包扫描（下载一次 codeload tar.gz）
    if (skillPath === null || !baseRawUrl) {
        logger.info(LogTags.SKILL, '第二阶段：回退到离线包扫描', {
            owner,
            repo,
            treeApiRateLimited,
        });
        try {
            const archiveLocations = await scanSkillsFromGitHubArchive(owner, repo, branch);
            logger.info(LogTags.SKILL, '离线包扫描完成', { count: archiveLocations.length });

            discoveredSkillLocations = archiveLocations.map((loc) => ({
                path: loc.path,
                name: loc.name,
                definitionFile: loc.definitionFile,
                isRoot: loc.path === '',
            }));

            const matchedByPath = archiveLocations.find((loc) => {
                const locNameLower = loc.name.toLowerCase();
                return (
                    locNameLower === skillIdLower ||
                    locNameLower.includes(skillIdLower) ||
                    skillIdLower.includes(locNameLower)
                );
            });

            if (matchedByPath) {
                skillPath = matchedByPath.path;
                baseRawUrl = buildRawBaseUrl(skillPath);
                skillDefinitionFile = matchedByPath.definitionFile;
                archiveDefinitionContent = matchedByPath.definitionContent;
                logger.info(LogTags.SKILL, '离线包通过路径/目录名匹配命中', {
                    skillPath,
                    skillDefinitionFile,
                });
            } else {
                for (const loc of archiveLocations) {
                    const parsed = parseSkillMd(loc.definitionContent);
                    if (!parsed) continue;
                    if (matchSkillName(parsed.name, skillId)) {
                        skillPath = loc.path;
                        baseRawUrl = buildRawBaseUrl(skillPath);
                        skillDefinitionFile = loc.definitionFile;
                        archiveDefinitionContent = loc.definitionContent;
                        logger.info(LogTags.SKILL, '离线包通过定义内容 name 匹配命中', {
                            skillPath,
                            skillDefinitionFile,
                            parsedName: parsed.name,
                        });
                        break;
                    }
                }
            }
        } catch (err) {
            logger.error(LogTags.SKILL, '离线包扫描失败', { error: String(err), owner, repo });
        }
    }

    logger.info(LogTags.SKILL, '路径决策结束', {
        found: skillPath !== null && !!baseRawUrl,
        matchedPath: skillPath,
        matchedDefinitionFile: skillDefinitionFile,
        treeApiRateLimited,
        archiveMatched: archiveDefinitionContent !== null,
    });

    // v3.0.26: 如果所有方法都找不到，基于 Git Trees 结果做回退匹配
    // 避免调用 fetchSkillRegistry 触发全量技能下载，且避免 root SKILL.md 抢占匹配
    if (skillPath === null || !baseRawUrl) {
        logger.warn(LogTags.SKILL, `未找到指定技能 ${skillId}，回退到 Git Trees 结果匹配`, {
            skillId,
            source: item.source,
            owner,
            repo,
            triedPaths: 0,
            treeApiRateLimited,
        });

        if (treeApiRateLimited && discoveredSkillLocations.length === 0) {
            throw buildGitHubRateLimitError();
        }

        // 如果第二阶段失败或未返回任何位置，补一次 Git Trees 搜索
        if (discoveredSkillLocations.length === 0) {
            try {
                discoveredSkillLocations = await addRootSkillIfExists(
                    await searchSkillsWithTreeApi(owner, repo, branch)
                );
            } catch (err) {
                if (isGitHubRateLimitError(err)) {
                    throw err instanceof Error ? err : buildGitHubRateLimitError();
                }
                logger.error(LogTags.SKILL, `回退阶段 Git Trees 搜索失败`, { error: String(err), owner, repo });
            }
        }

        logger.info(
            LogTags.SKILL,
            `回退阶段发现 ${discoveredSkillLocations.length} 个可用技能`,
            { skills: discoveredSkillLocations.map(loc => loc.name) }
        );

        // 如果只有一个技能，直接使用
        if (discoveredSkillLocations.length === 1) {
            const singleLocation = discoveredSkillLocations[0];
            skillPath = singleLocation.path;
            baseRawUrl = buildRawBaseUrl(skillPath);
            logger.info(LogTags.SKILL, `仓库仅发现 1 个技能，自动使用: ${singleLocation.name} (${skillPath})`);
        } else if (discoveredSkillLocations.length > 1) {
            // 多技能时按名称/路径匹配
            const skillIdLower = skillId.toLowerCase();
            const matchedLocation = discoveredSkillLocations.find(loc => {
                const nameLower = loc.name.toLowerCase();
                const pathLower = loc.path.toLowerCase();
                return (
                    nameLower === skillIdLower ||
                    pathLower === skillIdLower ||
                    nameLower.includes(skillIdLower) ||
                    pathLower.includes(skillIdLower) ||
                    skillIdLower.includes(nameLower)
                );
            });

            if (matchedLocation) {
                skillPath = matchedLocation.path;
                baseRawUrl = buildRawBaseUrl(skillPath);
                logger.info(LogTags.SKILL, `回退阶段匹配到技能: ${matchedLocation.name} (${skillPath})`);
            } else {
                const matchedByContent = await findSkillDefinitionByContent(discoveredSkillLocations, skillId);
                if (matchedByContent) {
                    skillPath = matchedByContent.location.path;
                    baseRawUrl = buildRawBaseUrl(skillPath);
                    skillDefinitionFile = matchedByContent.fileName;
                    logger.info(LogTags.SKILL, `回退阶段通过技能文件内容匹配到技能: ${matchedByContent.location.name} (${skillPath})`);
                }
            }

            if (skillPath === null || !baseRawUrl) {
                const availableSkills = discoveredSkillLocations.map(loc => loc.name).join(', ');
                throw new Error(
                    `在仓库 ${item.source} 中未找到技能 "${skillId}"。\n` +
                    `该仓库包含以下 ${discoveredSkillLocations.length} 个技能：${availableSkills}\n` +
                    `请使用正确的技能名称重新安装。`
                );
            }
        } else {
            throw new Error(
                `在仓库 ${item.source} 中未找到技能 ${skillId}。\n` +
                `请确认：1) 仓库存在且可访问；2) 技能目录包含 SKILL.md/SKILLS.md 文件；3) 技能名称正确。`
            );
        }
    }

    // 1. 获取技能定义文件（SKILL.md 或 SKILLS.md）
    const skillMdUrl = `${baseRawUrl}/${skillDefinitionFile}`;
    logger.info(LogTags.SKILL, `获取技能定义文件: ${skillMdUrl}`);

    let skillMdContent: string;
    if (archiveDefinitionContent !== null) {
        skillMdContent = archiveDefinitionContent;
        logger.info(LogTags.SKILL, '使用离线包中的技能定义内容');
    } else {
        try {
            skillMdContent = await fetchUrlContent(skillMdUrl);
        } catch (fetchError) {
            throw new Error('获取技能定义文件失败', { cause: fetchError });
        }
    }

    const parsed = parseSkillMd(skillMdContent);
    if (!parsed) {
        throw new Error(`解析技能定义文件失败: ${skillId}`);
    }

    // 2. 尝试获取 AGENTS.md（可选，作为主要提示词）
    let agentsMdContent: string | null = null;

    if (fetchFullContent) {
        const agentsMdUrl = `${baseRawUrl}/AGENTS.md`;
        logger.info(LogTags.SKILL, `尝试获取 AGENTS.md: ${agentsMdUrl}`);

        try {
            agentsMdContent = await fetchUrlContent(agentsMdUrl);
            if (agentsMdContent && agentsMdContent.length > 0) {
                logger.info(LogTags.SKILL, `获取到 AGENTS.md (${agentsMdContent.length} 字符)`);
            } else {
                agentsMdContent = null;
            }
        } catch (err) {
            // AGENTS.md 不存在
            logger.info(LogTags.SKILL, `AGENTS.md 不存在`);
            agentsMdContent = null;
        }
    }

    // 3. v3.0.14/v3.0.15: 下载完整目录并保存所有文件
    const files: SkillFile[] = [];

    // v3.0.15: 首先添加已获取的技能定义文件
    files.push({
        path: skillDefinitionFile,
        name: skillDefinitionFile,
        content: skillMdContent,
        type: 'markdown',
    });
    logger.info(LogTags.SKILL, `添加 ${skillDefinitionFile} 到 files (${skillMdContent.length} 字符)`);

    // v3.0.15: 如果有 AGENTS.md，也添加到 files
    if (agentsMdContent) {
        files.push({
            path: 'AGENTS.md',
            name: 'AGENTS.md',
            content: agentsMdContent,
            type: 'markdown',
        });
        logger.info(LogTags.SKILL, `添加 AGENTS.md 到 files (${agentsMdContent.length} 字符)`);
    }

    if (downloadFullDirectory) {
        logger.info(LogTags.SKILL, `开始下载完整技能目录: ${skillPath}`);

        try {
            // 获取目录结构
            // v3.0.28: 根目录技能使用空字符串而不是 '.'，避免 GitHub API 路径问题
            // v3.0.29: 使用解析出的 branch 而不是硬编码 'main'，修复 master 分支仓库无法下载完整目录的问题
            const fileList = await fetchSkillDirectoryContents(owner, repo, skillPath || '', branch);
            logger.info(LogTags.SKILL, `fetchSkillDirectoryContents 返回 ${fileList.length} 个文件:`,
                fileList.map(f => f.path));

            // 过滤掉已经单独获取的 SKILL.md 和 AGENTS.md
            const filesToDownload = fileList.filter(
                (f) => f.name !== skillDefinitionFile && f.name !== 'AGENTS.md'
            );
            logger.info(LogTags.SKILL, `过滤后需要下载 ${filesToDownload.length} 个文件:`,
                filesToDownload.map(f => f.path));

            if (filesToDownload.length > 0) {
                // 下载所有文件
                const downloadedFiles = await downloadSkillFiles(filesToDownload);
                files.push(...downloadedFiles);
                logger.info(LogTags.SKILL, `完整目录下载完成，总计 ${files.length} 个文件`);
            }
        } catch (err) {
            if (isGitHubRateLimitError(err)) {
                throw err instanceof Error ? err : buildGitHubRateLimitError();
            }
            logger.warn(LogTags.SKILL, `下载完整目录失败，使用基础内容:`, err);
            // 下载失败不影响基础功能，继续使用 SKILL.md/AGENTS.md
        }
    }

    logger.info(LogTags.SKILL, `最终 files 数组:`, files.map(f => ({ path: f.path, type: f.type, contentLength: f.content?.length })));

    // 4. 合并所有内容到 promptTemplate
    const promptTemplate = mergeSkillFilesToPrompt(
        parsed.promptTemplate,
        agentsMdContent,
        files
    );

    logger.info(LogTags.SKILL, `最终 promptTemplate 长度: ${promptTemplate.length} 字符`);

    // 5. 转换为 SkillCreateInput
    // v3.0.15: files 数组现在至少包含 SKILL.md，所以直接返回
    // v3.0.22: 添加来源信息，便于后续升级
    return {
        name: parsed.name,
        description: parsed.description || item.name,
        category: 'custom',
        promptTemplate,
        files,  // v3.0.15: 始终包含 SKILL.md，可能还有 AGENTS.md 和其他文件
        source: {
            type: 'skills.sh' as const,
            repoUrl: `https://github.com/${owner}/${repo}`,
            repoOwner: owner,
            repoName: repo,
            skillPath: skillPath,
            branch: 'main',
            installCommand: `npx skills add https://github.com/${owner}/${repo} --skill ${item.id}`,
            installedAt: new Date(),
        },
    };
}

/**
 * 将 Markdown 内容中的相对链接转换为绝对 GitHub URL (v3.0.13)
 *
 * 技能内容可能包含对其他文件的引用（如 rules/3d.md、scripts/setup.sh 等），
 * 这些相对链接在应用中无法直接访问。此函数将它们转换为 GitHub 上的绝对 URL，
 * 用户可以点击链接在 GitHub 上查看原始文件。
 *
 * 支持的链接格式：
 * - [text](rules/file.md) -> [text](https://github.com/.../rules/file.md)
 * - [text](./scripts/setup.sh) -> [text](https://github.com/.../scripts/setup.sh)
 * - [text](../other/file.md) -> [text](https://github.com/.../other/file.md)
 *
 * 不转换的链接：
 * - 绝对 URL (http://, https://)
 * - 邮件链接 (mailto:)
 * - 锚点链接 (#section)
 *
 * @param content - Markdown 内容
 * @param baseUrl - GitHub blob URL 基础路径（如 https://github.com/owner/repo/blob/main/skills/skillId）
 * @returns 转换后的内容
 *
 * @example
 * const content = 'See [3D rules](rules/3d.md) for details.';
 * const baseUrl = 'https://github.com/vercel-labs/agent-skills/blob/main/skills/react';
 * const result = convertRelativeLinksToAbsolute(content, baseUrl);
 * // 返回: 'See [3D rules](https://github.com/vercel-labs/agent-skills/blob/main/skills/react/rules/3d.md) for details.'
 */
export function convertRelativeLinksToAbsolute(content: string, baseUrl: string): string {
    if (!content || !baseUrl) {
        return content;
    }

    // 匹配 Markdown 链接: [text](url)
    // 排除: http://, https://, mailto:, # (锚点)
    const linkPattern = /\[([^\]]*)\]\((?!https?:\/\/|mailto:|#)([^)]+)\)/g;

    return content.replace(linkPattern, (_match, text, relativePath) => {
        // 清理相对路径（移除开头的 ./）
        let cleanPath = relativePath.replace(/^\.\//, '');

        // 处理 ../ 路径（向上一级目录）
        // 注意：简单处理，假设 baseUrl 指向 skills/skillId 目录
        if (cleanPath.startsWith('../')) {
            // 从 baseUrl 移除最后一个路径段，然后拼接
            const baseUrlParts = baseUrl.split('/');
            while (cleanPath.startsWith('../')) {
                cleanPath = cleanPath.slice(3); // 移除 ../
                baseUrlParts.pop(); // 移除 baseUrl 最后一段
            }
            const newBaseUrl = baseUrlParts.join('/');
            const absoluteUrl = `${newBaseUrl}/${cleanPath}`;
            logger.info(LogTags.SKILL, `转换相对链接: ${relativePath} -> ${absoluteUrl}`);
            return `[${text}](${absoluteUrl})`;
        }

        // 普通相对路径，直接拼接
        const absoluteUrl = `${baseUrl}/${cleanPath}`;
        logger.info(LogTags.SKILL, `转换相对链接: ${relativePath} -> ${absoluteUrl}`);
        return `[${text}](${absoluteUrl})`;
    });
}

/**
 * 格式化安装次数为简短形式
 *
 * @param installs - 安装次数
 * @returns 格式化后的字符串
 *
 * @example
 * formatInstallCount(45594) // "45.6k"
 * formatInstallCount(1234567) // "1.2M"
 * formatInstallCount(999) // "999"
 */
export function formatInstallCount(installs: number): string {
    if (installs >= 1000000) {
        return `${(installs / 1000000).toFixed(1)}M`;
    }
    if (installs >= 1000) {
        return `${(installs / 1000).toFixed(1)}k`;
    }
    return String(installs);
}

// ==================== v3.0.14: 完整技能目录下载 ====================

/**
 * GitHub Contents API 返回的文件/目录项 (v3.0.14)
 */
interface GitHubContentEntry {
    name: string;
    path: string;
    type: 'file' | 'dir';
    download_url: string | null;
    size: number;
}

/**
 * 排除的文件列表（参考 npx skills add 的实现）
 */
const EXCLUDE_FILES = new Set(['README.md', 'metadata.json', 'LICENSE', '.gitignore']);
const GITHUB_RATE_LIMIT_ERROR_MESSAGE = 'GitHub API 请求限流，请稍后重试。';

/**
 * 判断错误是否为 GitHub API 限流
 */
export function isGitHubRateLimitError(error: unknown): boolean {
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
    return (
        message.includes('api rate limit exceeded') ||
        message.includes('rate limit exceeded') ||
        message.includes('请求限流') ||
        (message.includes('403') && message.includes('github'))
    );
}

function buildGitHubRateLimitError(): Error {
    logger.warn(LogTags.SKILL, '构造 GitHub 限流错误');
    return new Error(GITHUB_RATE_LIMIT_ERROR_MESSAGE);
}

/**
 * 判断文件是否应该被排除
 *
 * @param name - 文件名
 * @returns 是否排除
 */
function isExcludedFile(name: string): boolean {
    if (EXCLUDE_FILES.has(name)) return true;
    if (name.startsWith('_')) return true;  // 排除以下划线开头的文件
    if (name.startsWith('.')) return true;  // 排除隐藏文件
    return false;
}

/**
 * 根据文件扩展名判断文件类型
 *
 * @param filename - 文件名
 * @returns 文件类型
 */
function getFileType(filename: string): SkillFile['type'] {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'md':
        case 'markdown':
            return 'markdown';
        case 'json':
            return 'json';
        case 'txt':
        case 'sh':
        case 'bash':
        case 'zsh':
        case 'ts':
        case 'js':
        case 'py':
            return 'text';
        default:
            return 'other';
    }
}

/**
 * 递归获取 GitHub 目录下的所有文件列表 (v3.0.14, v3.0.26 优化路径处理)
 *
 * 使用 GitHub Contents API 递归遍历目录，获取所有文件的路径和下载 URL
 *
 * v3.0.26 路径处理逻辑：
 * - 如果是技能根目录（isSkillRoot = true），保留完整路径（如 rules/auth.md）
 * - 如果不是技能根目录，递归调用时去掉路径前缀
 *
 * @param owner - 仓库所有者
 * @param repo - 仓库名称
 * @param path - 目录路径（如 skills/react-best-practices，或 '.' 表示根目录）
 * @param branch - 分支名（默认 main）
 * @param isSkillRoot - 是否是技能根目录（默认 true，递归调用时为 false）
 * @returns 文件列表（包含路径和下载 URL）
 */
export async function fetchSkillDirectoryContents(
    owner: string,
    repo: string,
    path: string,
    branch: string = 'main',
    isSkillRoot: boolean = true
): Promise<Array<{ path: string; downloadUrl: string; name: string }>> {
    logger.info(LogTags.SKILL, `获取目录内容: ${owner}/${repo}/${path} (isSkillRoot: ${isSkillRoot})`);

    // v3.0.26: 使用 Tauri 后端代理 GitHub API，避免 CORS 问题
    let contents: GitHubContentEntry[];
    try {
        const contentsJson = await invoke<string>('fetch_github_contents', {
            owner,
            repo,
            path,
            branch,
        });
        contents = JSON.parse(contentsJson);
    } catch (err) {
        // v3.0.26: 改进 404 错误判断，支持 Error 对象和字符串
        const errorMessage = err instanceof Error ? err.message : String(err);
        if (errorMessage.includes('404')) {
            logger.warn(LogTags.SKILL, `目录不存在: ${path}`);
            return [];
        }
        if (isGitHubRateLimitError(err)) {
            logger.error(LogTags.SKILL, `GitHub API 限流: ${owner}/${repo}/${path}`);
            throw buildGitHubRateLimitError();
        }
        throw err;
    }

    const files: Array<{ path: string; downloadUrl: string; name: string }> = [];

    for (const entry of contents) {
        logger.debug(LogTags.SKILL, `处理条目: ${entry.name}, 类型: ${entry.type}, 路径: ${entry.path}`);

        // 跳过排除的文件
        if (isExcludedFile(entry.name)) {
            logger.info(LogTags.SKILL, `跳过排除文件: ${entry.name}`);
            continue;
        }

        if (entry.type === 'file' && entry.download_url) {
            // v3.0.26: 根据是否为技能根目录决定路径处理方式
            let relativePath: string;
            if (isSkillRoot) {
                // 技能根目录：保留完整路径（相对于技能根目录）
                relativePath = entry.path.replace(`${path}/`, '');
            } else {
                // 递归调用：计算相对路径
                relativePath = entry.path.replace(`${path}/`, '');
            }
            logger.debug(LogTags.SKILL, `添加文件: ${relativePath}`);
            files.push({
                path: relativePath,
                downloadUrl: entry.download_url,
                name: entry.name,
            });
        } else if (entry.type === 'dir') {
            // 递归获取子目录（递归调用时 isSkillRoot = false）
            logger.info(LogTags.SKILL, `递归获取子目录: ${entry.path}`);
            const subFiles = await fetchSkillDirectoryContents(owner, repo, entry.path, branch, false);
            logger.info(LogTags.SKILL, `子目录 ${entry.path} 返回 ${subFiles.length} 个文件`);
            // 拼接目录名和子文件路径
            for (const subFile of subFiles) {
                const relativePath = `${entry.name}/${subFile.path}`;
                logger.debug(LogTags.SKILL, `拼接路径: ${entry.name} + ${subFile.path} = ${relativePath}`);
                files.push({
                    path: relativePath,
                    downloadUrl: subFile.downloadUrl,
                    name: subFile.name,
                });
            }
        }
    }

    logger.info(LogTags.SKILL, `目录 ${path} 包含 ${files.length} 个文件`);
    return files;
}

/**
 * 下载技能目录下的所有文件 (v3.0.14)
 *
 * 并行下载所有文件内容，返回 SkillFile 数组
 *
 * @param files - 文件列表（来自 fetchSkillDirectoryContents）
 * @returns SkillFile 数组
 */
export async function downloadSkillFiles(
    files: Array<{ path: string; downloadUrl: string; name: string }>
): Promise<SkillFile[]> {
    logger.info(LogTags.SKILL, `开始下载 ${files.length} 个文件`);

    const downloadPromises = files.map(async (file) => {
        try {
            logger.info(LogTags.SKILL, `下载文件: ${file.path}`);
            const content = await fetchUrlContent(file.downloadUrl);

            return {
                path: file.path,
                name: file.name,
                content,
                type: getFileType(file.name),
            } as SkillFile;
        } catch (err) {
            logger.warn(LogTags.SKILL, `下载文件失败 (${file.path}):`, err);
            return null;
        }
    });

    const results = await Promise.all(downloadPromises);
    const validFiles = results.filter((f): f is SkillFile => f !== null);

    logger.info(LogTags.SKILL, `成功下载 ${validFiles.length}/${files.length} 个文件`);
    return validFiles;
}

/**
 * 合并技能文件内容到 promptTemplate (v3.0.14)
 *
 * 将 SKILL.md、AGENTS.md 和 rules/*.md 等文件内容智能合并
 *
 * 合并顺序：
 * 1. AGENTS.md（如果存在）作为主要内容
 * 2. 否则使用 SKILL.md 正文
 * 3. 追加 rules/ 目录下的所有 .md 文件
 *
 * @param skillMdContent - SKILL.md 正文内容
 * @param agentsMdContent - AGENTS.md 内容（可选）
 * @param files - 其他文件列表
 * @returns 合并后的 promptTemplate
 */
export function mergeSkillFilesToPrompt(
    skillMdContent: string,
    agentsMdContent: string | null,
    files: SkillFile[]
): string {
    // 1. 主要内容：优先使用 AGENTS.md
    let promptTemplate = agentsMdContent || skillMdContent;

    // 2. 收集 rules/ 目录下的 markdown 文件
    const ruleFiles = files.filter(
        (f) => f.path.startsWith('rules/') && f.type === 'markdown'
    );

    if (ruleFiles.length > 0) {
        logger.info(LogTags.SKILL, `合并 ${ruleFiles.length} 个规则文件`);

        // 按文件名排序
        ruleFiles.sort((a, b) => a.name.localeCompare(b.name));

        // 追加规则内容
        promptTemplate += '\n\n---\n\n## 📋 附加规则\n\n';

        for (const ruleFile of ruleFiles) {
            const ruleName = ruleFile.name.replace(/\.md$/i, '');
            promptTemplate += `### ${ruleName}\n\n${ruleFile.content}\n\n`;
        }
    }

    return promptTemplate;
}
