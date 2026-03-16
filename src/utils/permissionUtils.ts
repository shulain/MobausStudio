/**
 * 权限检查工具模块 (v2.4.0)
 *
 * 提供 Agent 权限控制的核心检查函数：
 * - glob 模式匹配（路径权限）
 * - 工具规则匹配（工具权限）
 * - 路径权限检查
 * - 工具权限检查
 * - 自动批准判断
 *
 * @module utils/permissionUtils
 */

import { logger, LogTags } from './logger';
import {
    READ_TOOL_NAMES,
    WRITE_TOOL_NAMES,
    BASH_TOOL_NAMES,
    DANGEROUS_COMMAND_PATTERNS,
} from '../config/constants';
import type { AgentPermissions, AgentAutoApprove } from '../types';

// ==================== 类型定义 ====================

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
    /** 是否允许 */
    allowed: boolean;
    /** 拒绝原因（allowed=false 时） */
    reason?: string;
    /** 匹配的规则（用于调试） */
    matchedRule?: string;
}

/**
 * 工具调用上下文
 * 用于权限检查时提取工具参数信息
 */
export interface ToolCallContext {
    /** 工具名称 */
    toolName: string;
    /** 工具参数 */
    args: Record<string, unknown>;
    /** MCP 服务器 ID */
    serverId: string;
}

/**
 * 解析后的工具规则
 */
export interface ParsedToolRule {
    /** 工具名称（如 "Bash", "Read", "*"） */
    toolName: string;
    /** 参数条件（如 "npm run *", "domain:github.com"） */
    condition?: string;
    /** 条件类型 */
    conditionType?: 'command' | 'domain' | 'path' | 'raw';
}

// ==================== 正则缓存 ====================

/**
 * 正则表达式缓存
 * 避免重复编译相同的 glob 模式
 */
const regexCache = new Map<string, RegExp>();

/**
 * 清除正则缓存（用于测试）
 */
export function clearRegexCache(): void {
    regexCache.clear();
}

// ==================== Glob 模式匹配 ====================

/**
 * 将 glob 模式转换为正则表达式
 *
 * 支持的通配符：
 * - `*` 匹配任意字符（不含路径分隔符）
 * - `**` 匹配任意字符（含路径分隔符）
 * - `?` 匹配单个字符
 *
 * @param pattern - glob 模式
 * @returns 正则表达式
 *
 * @example
 * globToRegex('/Users/xxx/**') // 匹配 /Users/xxx/ 下所有文件
 * globToRegex('*.md')          // 匹配所有 .md 文件
 */
export function globToRegex(pattern: string): RegExp {
    // 检查缓存
    const cached = regexCache.get(pattern);
    if (cached) {
        return cached;
    }

    // 转换 glob 模式为正则表达式
    const regexStr = pattern
        // 转义正则特殊字符（除了 * 和 ?）
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        // ** 必须先处理，否则会被 * 的规则干扰
        // 使用占位符避免被后续替换影响
        .replace(/\*\*/g, '{{GLOBSTAR}}')
        // * 匹配非路径分隔符的任意字符
        .replace(/\*/g, '[^/]*')
        // 还原 ** 为匹配任意字符（含路径分隔符）
        .replace(/\{\{GLOBSTAR\}\}/g, '.*')
        // ? 匹配单个字符
        .replace(/\?/g, '.');

    // 添加锚点确保完整匹配
    const regex = new RegExp(`^${regexStr}$`);

    // 缓存编译后的正则
    regexCache.set(pattern, regex);

    return regex;
}

/**
 * 检查路径是否匹配 glob 模式
 *
 * @param pattern - glob 模式
 * @param path - 待检查的路径
 * @returns 是否匹配
 *
 * @example
 * matchGlob('/Users/xxx/**', '/Users/xxx/project/file.ts') // true
 * matchGlob('*.md', 'README.md')                            // true
 * matchGlob('/tmp/*', '/tmp/sub/file.txt')                  // false（* 不匹配 /）
 */
export function matchGlob(pattern: string, path: string): boolean {
    try {
        const regex = globToRegex(pattern);
        return regex.test(path);
    } catch (error) {
        // 正则编译失败时记录警告并返回 false
        logger.warn(LogTags.PERMISSION, 'Glob 模式匹配失败', {
            pattern,
            path,
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
}

// ==================== 工具规则解析与匹配 ====================

/**
 * 解析工具规则字符串
 *
 * 规则格式：
 * - "ToolName" - 匹配工具名
 * - "ToolName(condition)" - 匹配工具名 + 条件
 * - "*" - 匹配所有工具
 *
 * 条件类型：
 * - "domain:xxx" → conditionType: 'domain'
 * - "path:xxx" → conditionType: 'path'
 * - 其他 → conditionType: 'command'（默认为命令匹配）
 *
 * @param rule - 规则字符串
 * @returns 解析后的规则对象
 *
 * @example
 * parseToolRule('Read')                        // { toolName: 'Read' }
 * parseToolRule('Bash(npm run *)')             // { toolName: 'Bash', condition: 'npm run *', conditionType: 'command' }
 * parseToolRule('WebFetch(domain:github.com)') // { toolName: 'WebFetch', condition: 'github.com', conditionType: 'domain' }
 */
export function parseToolRule(rule: string): ParsedToolRule {
    // 匹配 "ToolName(condition)" 格式
    // 工具名可以是字母数字下划线，或者 * 通配符
    const match = rule.match(/^([\w*]+)\((.+)\)$/);

    if (!match) {
        // 简单工具名或通配符
        return { toolName: rule };
    }

    const [, toolName, condition] = match;

    // 判断条件类型
    let conditionType: ParsedToolRule['conditionType'] = 'command';
    let actualCondition = condition;

    if (condition.startsWith('domain:')) {
        conditionType = 'domain';
        actualCondition = condition.slice(7); // 移除 "domain:" 前缀
    } else if (condition.startsWith('path:')) {
        conditionType = 'path';
        actualCondition = condition.slice(5); // 移除 "path:" 前缀
    }

    return {
        toolName,
        condition: actualCondition,
        conditionType,
    };
}

/**
 * 检查工具调用是否匹配规则
 *
 * @param rule - 工具规则字符串
 * @param toolName - 工具名称
 * @param args - 工具参数
 * @returns 是否匹配
 *
 * @example
 * matchToolRule('Bash(npm run *)', 'Bash', { command: 'npm run build' }) // true
 * matchToolRule('Bash(npm run *)', 'Bash', { command: 'rm -rf /' })      // false
 * matchToolRule('Read', 'Read', { path: '/any/path' })                   // true
 * matchToolRule('*', 'AnyTool', {})                                      // true
 */
export function matchToolRule(
    rule: string,
    toolName: string,
    args: Record<string, unknown>
): boolean {
    const parsed = parseToolRule(rule);

    // 1. 检查工具名
    if (parsed.toolName !== '*' && parsed.toolName !== toolName) {
        return false;
    }

    // 2. 如果没有条件，工具名匹配即可
    if (!parsed.condition) {
        return true;
    }

    // 3. 根据条件类型匹配
    switch (parsed.conditionType) {
        case 'command': {
            const command = extractCommandFromArgs(args);
            if (!command) {
                return false;
            }
            return matchGlob(parsed.condition, command);
        }
        case 'domain': {
            const url = extractUrlFromArgs(args);
            if (!url) {
                return false;
            }
            const domain = extractDomainFromUrl(url);
            if (!domain) {
                return false;
            }
            // 域名匹配支持通配符
            return matchGlob(parsed.condition, domain);
        }
        case 'path': {
            const path = extractPathFromArgs(args);
            if (!path) {
                return false;
            }
            return matchGlob(parsed.condition, path);
        }
        default:
            return false;
    }
}

// ==================== 路径权限检查 ====================

/**
 * 检查路径访问权限
 *
 * 检查逻辑（优先级从高到低）：
 * 1. 如果路径匹配 deniedPaths 中任一模式 → 拒绝
 * 2. 如果 allowedPaths 为空或未定义 → 允许（默认允许）
 * 3. 如果路径匹配 allowedPaths 中任一模式 → 允许
 * 4. 否则 → 拒绝
 *
 * @param path - 待检查的路径
 * @param permissions - 权限配置
 * @returns 权限检查结果
 *
 * @example
 * checkPathPermission('/Users/xxx/project/file.ts', {
 *     allowedPaths: ['/Users/xxx/project/**'],
 *     deniedPaths: ['/Users/xxx/project/secrets/**']
 * })
 */
export function checkPathPermission(
    path: string,
    permissions: AgentPermissions
): PermissionCheckResult {
    const { allowedPaths, deniedPaths } = permissions;

    // 1. 检查 deniedPaths（优先级最高）
    if (deniedPaths && deniedPaths.length > 0) {
        for (const pattern of deniedPaths) {
            if (matchGlob(pattern, path)) {
                return {
                    allowed: false,
                    reason: `路径被禁止规则拒绝: ${pattern}`,
                    matchedRule: pattern,
                };
            }
        }
    }

    // 2. 如果没有 allowedPaths 规则，默认允许
    if (!allowedPaths || allowedPaths.length === 0) {
        return { allowed: true };
    }

    // 3. 检查 allowedPaths
    for (const pattern of allowedPaths) {
        if (matchGlob(pattern, path)) {
            return {
                allowed: true,
                matchedRule: pattern,
            };
        }
    }

    // 4. 都不匹配，拒绝
    return {
        allowed: false,
        reason: `路径未匹配任何允许规则`,
    };
}

// ==================== 工具权限检查 ====================

/**
 * 检查工具调用权限
 *
 * 检查逻辑（优先级从高到低）：
 * 1. 如果工具调用匹配 deny 中任一规则 → 拒绝
 * 2. 如果 allow 为空或未定义 → 允许（默认允许）
 * 3. 如果工具调用匹配 allow 中任一规则 → 允许
 * 4. 否则 → 拒绝
 *
 * @param toolName - 工具名称
 * @param args - 工具参数
 * @param permissions - 权限配置
 * @returns 权限检查结果
 *
 * @example
 * checkToolPermission('Bash', { command: 'npm run build' }, {
 *     allow: ['Bash(npm run *)', 'Read'],
 *     deny: ['Bash(rm -rf *)']
 * })
 */
export function checkToolPermission(
    toolName: string,
    args: Record<string, unknown>,
    permissions: AgentPermissions
): PermissionCheckResult {
    const { allow, deny } = permissions;

    // 1. 检查 deny 规则（优先级最高）
    if (deny && deny.length > 0) {
        for (const rule of deny) {
            if (matchToolRule(rule, toolName, args)) {
                return {
                    allowed: false,
                    reason: `工具调用被禁止规则拒绝`,
                    matchedRule: rule,
                };
            }
        }
    }

    // 2. 如果没有 allow 规则，默认允许
    if (!allow || allow.length === 0) {
        return { allowed: true };
    }

    // 3. 检查 allow 规则
    for (const rule of allow) {
        if (matchToolRule(rule, toolName, args)) {
            return {
                allowed: true,
                matchedRule: rule,
            };
        }
    }

    // 4. 都不匹配，拒绝
    return {
        allowed: false,
        reason: `工具调用未匹配任何允许规则`,
    };
}

// ==================== 沙箱模式检查 ====================

/**
 * 检查命令是否为危险命令（沙箱模式）
 *
 * @param command - 待检查的命令
 * @returns 是否为危险命令
 */
export function isDangerousCommand(command: string): boolean {
    for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
        if (matchGlob(pattern, command)) {
            return true;
        }
    }
    return false;
}

/**
 * 沙箱模式权限检查
 *
 * @param toolName - 工具名称
 * @param args - 工具参数
 * @returns 权限检查结果
 */
export function checkSandboxPermission(
    toolName: string,
    args: Record<string, unknown>
): PermissionCheckResult {
    // 检查是否为 Bash 类工具
    if (BASH_TOOL_NAMES.includes(toolName)) {
        const command = extractCommandFromArgs(args);
        if (command && isDangerousCommand(command)) {
            return {
                allowed: false,
                reason: `沙箱模式下禁止执行危险命令: ${command}`,
                matchedRule: 'sandboxMode',
            };
        }
    }

    return { allowed: true };
}

// ==================== 自动批准检查 ====================

/**
 * 检查工具调用是否应自动批准
 *
 * @param toolName - 工具名称
 * @param args - 工具参数
 * @param serverId - MCP 服务器 ID
 * @param autoApprove - 自动批准配置
 * @returns 是否自动批准
 *
 * @example
 * shouldAutoApprove('Read', { path: '/tmp/file.txt' }, 'fs-server', {
 *     readFiles: true,
 *     bashCommands: ['npm run *']
 * }) // true
 */
export function shouldAutoApprove(
    toolName: string,
    args: Record<string, unknown>,
    serverId: string,
    autoApprove?: AgentAutoApprove
): boolean {
    // 如果没有配置自动批准，返回 false
    if (!autoApprove) {
        return false;
    }

    // 1. 检查 readFiles - 自动批准读取文件
    if (autoApprove.readFiles && READ_TOOL_NAMES.includes(toolName)) {
        return true;
    }

    // 2. 检查 writeFiles - 自动批准写入文件
    if (autoApprove.writeFiles && WRITE_TOOL_NAMES.includes(toolName)) {
        return true;
    }

    // 3. 检查 bashCommands - 自动批准匹配的 Bash 命令
    if (autoApprove.bashCommands && autoApprove.bashCommands.length > 0) {
        if (BASH_TOOL_NAMES.includes(toolName)) {
            const command = extractCommandFromArgs(args);
            if (command) {
                for (const pattern of autoApprove.bashCommands) {
                    if (matchGlob(pattern, command)) {
                        return true;
                    }
                }
            }
        }
    }

    // 4. 检查 mcpTools - 自动批准匹配的 MCP 工具
    if (autoApprove.mcpTools && autoApprove.mcpTools.length > 0) {
        for (const mcpToolPattern of autoApprove.mcpTools) {
            // 格式: "serverId:toolName" 或 "*:toolName" 或 "serverId:*"
            const [patternServerId, patternToolName] = mcpToolPattern.split(':');

            const serverMatch = patternServerId === '*' || patternServerId === serverId;
            const toolMatch = patternToolName === '*' || patternToolName === toolName;

            if (serverMatch && toolMatch) {
                return true;
            }
        }
    }

    return false;
}

// ==================== 辅助函数 ====================

/**
 * 从工具参数中提取文件路径
 *
 * 支持多种参数格式：
 * - { path: '/xxx' }
 * - { file_path: '/xxx' }
 * - { filePath: '/xxx' }
 * - { file: '/xxx' }
 *
 * @param args - 工具参数
 * @returns 文件路径或 undefined
 */
export function extractPathFromArgs(args: Record<string, unknown>): string | undefined {
    const pathKeys = ['path', 'file_path', 'filePath', 'file', 'filename', 'filepath'];

    for (const key of pathKeys) {
        const value = args[key];
        if (typeof value === 'string' && value.length > 0) {
            return value;
        }
    }

    return undefined;
}

/**
 * 从工具参数中提取命令
 *
 * 支持多种参数格式：
 * - { command: 'xxx' }
 * - { cmd: 'xxx' }
 * - { script: 'xxx' }
 *
 * @param args - 工具参数
 * @returns 命令字符串或 undefined
 */
export function extractCommandFromArgs(args: Record<string, unknown>): string | undefined {
    const commandKeys = ['command', 'cmd', 'script', 'shell', 'exec'];

    for (const key of commandKeys) {
        const value = args[key];
        if (typeof value === 'string' && value.length > 0) {
            return value;
        }
    }

    return undefined;
}

/**
 * 从工具参数中提取 URL
 *
 * @param args - 工具参数
 * @returns URL 字符串或 undefined
 */
export function extractUrlFromArgs(args: Record<string, unknown>): string | undefined {
    const urlKeys = ['url', 'uri', 'href', 'link', 'endpoint'];

    for (const key of urlKeys) {
        const value = args[key];
        if (typeof value === 'string' && value.length > 0) {
            return value;
        }
    }

    return undefined;
}

/**
 * 从 URL 中提取域名
 *
 * @param url - URL 字符串
 * @returns 域名或 undefined
 */
export function extractDomainFromUrl(url: string): string | undefined {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch {
        // URL 解析失败，尝试简单提取
        const match = url.match(/^(?:https?:\/\/)?([^/:]+)/);
        return match ? match[1] : undefined;
    }
}

// ==================== 综合权限检查 ====================

/**
 * 综合权限检查结果
 */
export interface ComprehensivePermissionResult extends PermissionCheckResult {
    /** 是否需要用户确认 */
    requiresApproval: boolean;
    /** 是否超出调用次数限制 */
    exceedsCallLimit: boolean;
    /** 当前调用次数 */
    currentCallCount: number;
    /** 最大调用次数 */
    maxCallCount: number;
}

/**
 * 综合权限检查选项
 */
export interface ComprehensiveCheckOptions {
    /** 工具调用上下文 */
    context: ToolCallContext;
    /** 权限配置 */
    permissions?: AgentPermissions;
    /** 是否启用沙箱模式 */
    sandboxMode?: boolean;
    /** 当前调用次数 */
    currentCallCount: number;
    /** 最大调用次数 */
    maxCallCount?: number;
}

/**
 * 执行综合权限检查
 *
 * 检查顺序：
 * 1. 调用次数限制
 * 2. 沙箱模式（危险命令）
 * 3. 工具权限规则
 * 4. 路径权限（如果工具涉及文件操作）
 * 5. 自动批准判断
 *
 * @param options - 检查选项
 * @returns 综合权限检查结果
 */
export function checkComprehensivePermission(
    options: ComprehensiveCheckOptions
): ComprehensivePermissionResult {
    const {
        context,
        permissions,
        sandboxMode,
        currentCallCount,
        maxCallCount,
    } = options;

    const { toolName, args, serverId } = context;

    // 基础结果
    const baseResult: ComprehensivePermissionResult = {
        allowed: true,
        requiresApproval: true,
        exceedsCallLimit: false,
        currentCallCount,
        maxCallCount: maxCallCount ?? 0,
    };

    // 1. 检查调用次数限制
    if (maxCallCount !== undefined && currentCallCount >= maxCallCount) {
        return {
            ...baseResult,
            allowed: false,
            reason: `工具调用次数已达上限 (${maxCallCount})`,
            exceedsCallLimit: true,
        };
    }

    // 2. 沙箱模式检查
    if (sandboxMode) {
        const sandboxResult = checkSandboxPermission(toolName, args);
        if (!sandboxResult.allowed) {
            return {
                ...baseResult,
                ...sandboxResult,
            };
        }
    }

    // 如果没有权限配置，默认允许
    if (!permissions) {
        // 检查自动批准
        const autoApproved = shouldAutoApprove(
            toolName,
            args,
            serverId,
            undefined
        );
        return {
            ...baseResult,
            requiresApproval: !autoApproved,
        };
    }

    // 3. 工具权限规则检查
    const toolResult = checkToolPermission(toolName, args, permissions);
    if (!toolResult.allowed) {
        return {
            ...baseResult,
            ...toolResult,
        };
    }

    // 4. 路径权限检查（如果工具涉及文件操作）
    const path = extractPathFromArgs(args);
    if (path && (permissions.allowedPaths || permissions.deniedPaths)) {
        const pathResult = checkPathPermission(path, permissions);
        if (!pathResult.allowed) {
            return {
                ...baseResult,
                ...pathResult,
            };
        }
    }

    // 5. 自动批准判断
    const autoApproved = shouldAutoApprove(
        toolName,
        args,
        serverId,
        permissions.autoApprove
    );

    return {
        ...baseResult,
        allowed: true,
        matchedRule: toolResult.matchedRule,
        requiresApproval: !autoApproved,
    };
}
