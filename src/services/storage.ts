/**
 * 数据存储服务
 * 
 * 支持双环境：
 * - Tauri 环境：使用 Tauri 命令保存到本地文件系统
 * - 浏览器环境：使用 localStorage
 * 
 * @module services/storage
 */

import { invoke } from '@tauri-apps/api/core';
import type { AIModelConfig, Agent, Skill, MCPServer, Chat, ProviderCredential, RoundtableChat } from '../types';
import { logger, LogTags } from '../utils/logger';

// ==================== 环境检测 ====================

/**
 * 检测是否在 Tauri 环境中运行
 * 通过检查 window.__TAURI_INTERNALS__ 来判断
 */
function isTauriEnvironment(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ==================== 常量定义 ====================

const STORAGE_KEYS = {
    MODELS: 'mobaus_models',
    AGENTS: 'mobaus_agents',
    SKILLS: 'mobaus_skills',
    MCP_SERVERS: 'mobaus_mcp_servers',
    CHATS: 'mobaus_chats',
    SETTINGS: 'mobaus_settings',
    API_KEYS: 'mobaus_api_keys',
    PROVIDER_CREDENTIALS: 'mobaus_provider_credentials',
} as const;

// ==================== 日志工具 ====================

/**
 * 开发环境日志输出
 * 使用统一的 logger 模块
 */
function logDebug(message: string, ...args: unknown[]): void {
    logger.debug(LogTags.STORAGE, message, ...args);
}

/**
 * 错误日志输出
 */
function logError(message: string, ...args: unknown[]): void {
    logger.error(LogTags.STORAGE, message, ...args);
}

/**
 * 警告日志输出
 */
function logWarn(message: string, ...args: unknown[]): void {
    logger.warn(LogTags.STORAGE, message, ...args);
}

// ==================== 辅助函数 ====================

/**
 * 日期序列化/反序列化辅助函数
 * 将 ISO 格式日期字符串转换为 Date 对象
 */
function reviveDate(_key: string, value: unknown): unknown {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        return new Date(value);
    }
    return value;
}

/**
 * 通用 localStorage 保存函数
 */
function saveToLocalStorage<T>(key: string, data: T): void {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        logDebug(`已保存到 localStorage: ${key}`);
    } catch (error) {
        logError(`保存失败 (${key}):`, error);
    }
}

/**
 * 通用 localStorage 加载函数
 */
function loadFromLocalStorage<T>(key: string, defaultValue: T): T {
    try {
        const stored = localStorage.getItem(key);
        if (stored) {
            return JSON.parse(stored, reviveDate) as T;
        }
    } catch (error) {
        logError(`加载失败 (${key}):`, error);
    }
    return defaultValue;
}

// ==================== Models 存储 ====================

/**
 * 模型配置存储服务
 * 
 * 在 Tauri 环境中使用文件系统存储，浏览器环境回退到 localStorage
 */
export const modelsStorage = {
    /**
     * 保存模型配置列表
     * - Tauri 环境：调用 save_models 命令
     * - 浏览器环境：保存到 localStorage
     * v2.5.2: API Key 直接保存在模型配置中，不再单独存储
     */
    async save(models: AIModelConfig[]): Promise<void> {
        const isTauri = isTauriEnvironment();
        logDebug('保存模型配置，数量:', models.length, 'Tauri 环境:', isTauri);

        // v2.5.2: 调试日志 - 检查保存时 API Key 状态
        if (import.meta.env.DEV && models.length > 0) {
            logDebug(' 保存模型 API Key 状态:', models.map(m => ({
                name: m.name,
                hasApiKey: !!m.apiKey,
                apiKeyLength: m.apiKey?.length || 0
            })));
        }

        // 序列化模型配置（包含 API Key）
        const serializedModels = models.map(model => ({
            ...model,
            // 确保日期是字符串格式
            createdAt: model.createdAt instanceof Date
                ? model.createdAt.toISOString()
                : model.createdAt,
            updatedAt: model.updatedAt instanceof Date
                ? model.updatedAt.toISOString()
                : model.updatedAt,
        }));

        if (isTauri) {
            try {
                await invoke('save_models', { models: serializedModels });
                logDebug('已通过 Tauri 保存模型配置');
            } catch (error) {
                logError(' Tauri save_models 失败:', error);
                // 回退到 localStorage
                saveToLocalStorage(STORAGE_KEYS.MODELS, serializedModels);
            }
        } else {
            logDebug('非 Tauri 环境，保存到 localStorage');
            saveToLocalStorage(STORAGE_KEYS.MODELS, serializedModels);
        }
    },

    /**
     * 加载模型配置列表
     * - Tauri 环境：调用 load_models 命令
     * - 浏览器环境：从 localStorage 读取
     */
    async load(): Promise<AIModelConfig[]> {
        const isTauri = isTauriEnvironment();
        logDebug('加载模型配置, Tauri 环境:', isTauri);

        if (isTauri) {
            try {
                const models = await invoke<AIModelConfig[]>('load_models');
                logDebug('已通过 Tauri 加载模型配置，数量:', models.length);
                // v2.5.2: 调试日志 - 检查 API Key 是否正确加载
                if (import.meta.env.DEV && models.length > 0) {
                    logDebug(' 模型 API Key 状态:', models.map(m => ({
                        name: m.name,
                        hasApiKey: !!m.apiKey,
                        apiKeyLength: m.apiKey?.length || 0
                    })));
                }
                // 转换日期字符串为 Date 对象
                return models.map(model => ({
                    ...model,
                    createdAt: new Date(model.createdAt as unknown as string),
                    updatedAt: new Date(model.updatedAt as unknown as string),
                }));
            } catch (error) {
                logError(' Tauri load_models 失败:', error);
                // 回退到 localStorage
                return loadFromLocalStorage<AIModelConfig[]>(STORAGE_KEYS.MODELS, []);
            }
        } else {
            logDebug('非 Tauri 环境，从 localStorage 加载');
            return loadFromLocalStorage<AIModelConfig[]>(STORAGE_KEYS.MODELS, []);
        }
    },

    /**
     * 同步版本的 load，用于兼容现有代码
     * 优先尝试从 localStorage 读取
     */
    loadSync(): AIModelConfig[] {
        return loadFromLocalStorage<AIModelConfig[]>(STORAGE_KEYS.MODELS, []);
    },

    /**
     * 同步版本的 save，用于兼容现有代码
     * v2.5.2: API Key 直接保存，不再替换
     */
    saveSync(models: AIModelConfig[]): void {
        saveToLocalStorage(STORAGE_KEYS.MODELS, models);
    },

    /**
     * 添加单个模型
     */
    async add(model: AIModelConfig): Promise<AIModelConfig[]> {
        const models = await this.load();
        models.push(model);
        await this.save(models);
        return models;
    },

    /**
     * 更新模型配置
     */
    async update(id: string, updates: Partial<AIModelConfig>): Promise<AIModelConfig[]> {
        const models = await this.load();
        const updated = models.map(model =>
            model.id === id ? { ...model, ...updates, updatedAt: new Date() } : model
        );
        await this.save(updated);
        return updated;
    },

    /**
     * 删除模型
     */
    async delete(id: string): Promise<AIModelConfig[]> {
        const models = await this.load();
        const filtered = models.filter(model => model.id !== id);
        await this.save(filtered);
        return filtered;
    },
};

// ==================== Chats 存储 ====================

/**
 * 对话存储服务
 */
export const chatsStorage = {
    /**
     * 保存对话列表
     */
    async save(chats: Chat[]): Promise<void> {
        logDebug('保存对话，数量:', chats.length);

        // 转换日期为字符串
        const serializedChats = chats.map(chat => ({
            ...chat,
            createdAt: chat.createdAt instanceof Date
                ? chat.createdAt.toISOString()
                : chat.createdAt,
            updatedAt: chat.updatedAt instanceof Date
                ? chat.updatedAt.toISOString()
                : chat.updatedAt,
            messages: chat.messages.map(msg => ({
                ...msg,
                createdAt: msg.createdAt instanceof Date
                    ? msg.createdAt.toISOString()
                    : msg.createdAt,
            })),
        }));

        if (isTauriEnvironment()) {
            try {
                await invoke('save_chats', { chats: serializedChats });
                logDebug('已通过 Tauri 保存对话');
            } catch (error) {
                logError(' Tauri save_chats 失败:', error);
                saveToLocalStorage(STORAGE_KEYS.CHATS, serializedChats);
            }
        } else {
            saveToLocalStorage(STORAGE_KEYS.CHATS, serializedChats);
        }
    },

    /**
     * 加载对话列表
     */
    async load(): Promise<Chat[]> {
        logDebug('加载对话');

        if (isTauriEnvironment()) {
            try {
                const chats = await invoke<Chat[]>('load_chats');
                logDebug('已通过 Tauri 加载对话，数量:', chats.length);
                // 转换日期
                return chats.map(chat => ({
                    ...chat,
                    createdAt: new Date(chat.createdAt as unknown as string),
                    updatedAt: new Date(chat.updatedAt as unknown as string),
                    messages: chat.messages.map(msg => ({
                        ...msg,
                        createdAt: new Date(msg.createdAt as unknown as string),
                    })),
                }));
            } catch (error) {
                logError(' Tauri load_chats 失败:', error);
                return loadFromLocalStorage<Chat[]>(STORAGE_KEYS.CHATS, []);
            }
        } else {
            return loadFromLocalStorage<Chat[]>(STORAGE_KEYS.CHATS, []);
        }
    },

    /**
     * 同步加载（兼容现有代码）
     */
    loadSync(): Chat[] {
        return loadFromLocalStorage<Chat[]>(STORAGE_KEYS.CHATS, []);
    },

    /**
     * 同步保存（兼容现有代码）
     */
    saveSync(chats: Chat[]): void {
        saveToLocalStorage(STORAGE_KEYS.CHATS, chats);
    },

    /**
     * 添加对话
     */
    async add(chat: Chat): Promise<Chat[]> {
        const chats = await this.load();
        chats.push(chat);
        await this.save(chats);
        return chats;
    },

    /**
     * 更新对话
     */
    async update(id: string, updates: Partial<Chat>): Promise<Chat[]> {
        const chats = await this.load();
        const updated = chats.map(chat =>
            chat.id === id ? { ...chat, ...updates, updatedAt: new Date() } : chat
        );
        await this.save(updated);
        return updated;
    },

    /**
     * 删除对话
     */
    async delete(id: string): Promise<Chat[]> {
        const chats = await this.load();
        const filtered = chats.filter(chat => chat.id !== id);
        await this.save(filtered);
        return filtered;
    },
};

// ==================== Agents 存储 ====================

/**
 * Agent 存储服务 (v2.2.0)
 *
 * 支持 Tauri 文件系统和 localStorage 双环境
 *
 * v2.2.0: 升级为异步接口，支持 Tauri 持久化
 */
export const agentsStorage = {
    /**
     * 保存 Agent 列表
     * - Tauri 环境：调用 save_agents 命令
     * - 浏览器环境：保存到 localStorage
     */
    async save(agents: Agent[]): Promise<void> {
        logDebug('保存 Agent，数量:', agents.length);

        // 序列化日期字段
        const serialized = agents.map(agent => ({
            ...agent,
            // 确保日期是字符串格式
            createdAt: agent.createdAt instanceof Date
                ? agent.createdAt.toISOString()
                : agent.createdAt,
            updatedAt: agent.updatedAt instanceof Date
                ? agent.updatedAt.toISOString()
                : agent.updatedAt,
            lastUsedAt: agent.lastUsedAt instanceof Date
                ? agent.lastUsedAt.toISOString()
                : agent.lastUsedAt,
        }));

        if (isTauriEnvironment()) {
            try {
                await invoke('save_agents', { agents: serialized });
                logDebug('已通过 Tauri 保存 Agent 配置');
            } catch (error) {
                logError(' Tauri save_agents 失败:', error);
                // 回退到 localStorage
                saveToLocalStorage(STORAGE_KEYS.AGENTS, serialized);
            }
        } else {
            saveToLocalStorage(STORAGE_KEYS.AGENTS, serialized);
        }
    },

    /**
     * 加载 Agent 列表
     * - Tauri 环境：调用 load_agents 命令
     * - 浏览器环境：从 localStorage 读取
     */
    async load(): Promise<Agent[]> {
        logDebug('加载 Agent 配置');

        if (isTauriEnvironment()) {
            try {
                const agents = await invoke<Agent[]>('load_agents');
                logDebug('已通过 Tauri 加载 Agent，数量:', agents.length);
                // 转换日期字符串为 Date 对象
                return agents.map(agent => ({
                    ...agent,
                    createdAt: new Date(agent.createdAt as unknown as string),
                    updatedAt: new Date(agent.updatedAt as unknown as string),
                    lastUsedAt: agent.lastUsedAt
                        ? new Date(agent.lastUsedAt as unknown as string)
                        : undefined,
                }));
            } catch (error) {
                logError(' Tauri load_agents 失败:', error);
                // 回退到 localStorage
                return this.loadSync();
            }
        } else {
            return this.loadSync();
        }
    },

    /**
     * 同步加载（兼容现有代码和 localStorage 回退）
     */
    loadSync(): Agent[] {
        const agents = loadFromLocalStorage<Agent[]>(STORAGE_KEYS.AGENTS, []);
        // 确保日期类型正确
        return agents.map(agent => ({
            ...agent,
            createdAt: agent.createdAt instanceof Date
                ? agent.createdAt
                : new Date(agent.createdAt as unknown as string),
            updatedAt: agent.updatedAt instanceof Date
                ? agent.updatedAt
                : new Date(agent.updatedAt as unknown as string),
            lastUsedAt: agent.lastUsedAt
                ? (agent.lastUsedAt instanceof Date
                    ? agent.lastUsedAt
                    : new Date(agent.lastUsedAt as unknown as string))
                : undefined,
        }));
    },

    /**
     * 同步保存（兼容现有代码）
     */
    saveSync(agents: Agent[]): void {
        const serialized = agents.map(agent => ({
            ...agent,
            createdAt: agent.createdAt instanceof Date
                ? agent.createdAt.toISOString()
                : agent.createdAt,
            updatedAt: agent.updatedAt instanceof Date
                ? agent.updatedAt.toISOString()
                : agent.updatedAt,
            lastUsedAt: agent.lastUsedAt instanceof Date
                ? agent.lastUsedAt.toISOString()
                : agent.lastUsedAt,
        }));
        saveToLocalStorage(STORAGE_KEYS.AGENTS, serialized);
    },

    /**
     * 添加单个 Agent
     */
    async add(agent: Agent): Promise<Agent[]> {
        const agents = await this.load();
        agents.push(agent);
        await this.save(agents);
        return agents;
    },

    /**
     * 更新 Agent 配置
     */
    async update(id: string, updates: Partial<Agent>): Promise<Agent[]> {
        const agents = await this.load();
        const updated = agents.map(agent =>
            agent.id === id ? { ...agent, ...updates, updatedAt: new Date() } : agent
        );
        await this.save(updated);
        return updated;
    },

    /**
     * 删除 Agent
     */
    async delete(id: string): Promise<Agent[]> {
        const agents = await this.load();
        const filtered = agents.filter(agent => agent.id !== id);
        await this.save(filtered);
        return filtered;
    },
};

// ==================== Skills 存储 (v2.0.0 - 提示词模板) ====================

/**
 * Skills 存储服务
 *
 * v2.0.0: 重新定义 Skill 为提示词模板
 *
 * 注意：
 * - 只持久化自定义技能（builtIn=false）
 * - 内置技能从 src/data/builtinSkills.ts 加载
 */
export const skillsStorage = {
    /**
     * 保存技能列表（仅保存自定义技能）
     * v3.0.15: 添加 files 字段调试日志
     */
    async save(skills: Skill[]): Promise<void> {
        logDebug('保存 Skills，数量:', skills.length);

        // 只保存自定义技能，内置技能从代码加载
        const customSkills = skills.filter(skill => !skill.builtIn);

        // v3.0.15: 调试日志 - 检查 files 字段
        customSkills.forEach(skill => {
            if (skill.files && skill.files.length > 0) {
                logDebug(`技能 "${skill.name}" 包含 ${skill.files.length} 个文件:`, skill.files.map(f => f.path));
            }
        });

        // 序列化日期字段
        const serialized = customSkills.map(skill => ({
            ...skill,
            createdAt: skill.createdAt instanceof Date
                ? skill.createdAt.toISOString()
                : skill.createdAt,
            updatedAt: skill.updatedAt instanceof Date
                ? skill.updatedAt.toISOString()
                : skill.updatedAt,
        }));

        // v3.0.15: 调试日志 - 检查序列化后的数据
        logDebug('序列化后的技能数据:', serialized.map(s => ({
            name: s.name,
            hasFiles: !!s.files,
            filesCount: s.files?.length ?? 0,
        })));

        if (isTauriEnvironment()) {
            try {
                await invoke('save_skills', { skills: serialized });
                logDebug('已通过 Tauri 保存 Skills 配置');
            } catch (error) {
                logError(' Tauri save_skills 失败:', error);
                // 回退到 localStorage
                saveToLocalStorage(STORAGE_KEYS.SKILLS, serialized);
            }
        } else {
            saveToLocalStorage(STORAGE_KEYS.SKILLS, serialized);
        }
    },

    /**
     * 加载技能列表（仅加载自定义技能，内置技能需要单独合并）
     * v3.0.15: 添加 files 字段调试日志
     */
    async load(): Promise<Skill[]> {
        logDebug('加载 Skills 配置');

        if (isTauriEnvironment()) {
            try {
                const skills = await invoke<Skill[]>('load_skills');
                logDebug('已通过 Tauri 加载 Skills，数量:', skills.length);

                // v3.0.15: 调试日志 - 检查加载的原始数据
                skills.forEach(skill => {
                    logDebug(`加载技能 "${skill.name}":`, {
                        hasFiles: !!skill.files,
                        filesCount: skill.files?.length ?? 0,
                        filesPaths: skill.files?.map(f => f.path),
                    });
                });

                // 转换日期
                return skills.map(skill => ({
                    ...skill,
                    createdAt: new Date(skill.createdAt as unknown as string),
                    updatedAt: new Date(skill.updatedAt as unknown as string),
                }));
            } catch (error) {
                logError(' Tauri load_skills 失败:', error);
                return this.loadSync();
            }
        } else {
            return this.loadSync();
        }
    },

    /**
     * 同步加载（兼容现有代码和 localStorage 回退）
     * v3.0.15: 添加 files 字段调试日志
     */
    loadSync(): Skill[] {
        const skills = loadFromLocalStorage<Skill[]>(STORAGE_KEYS.SKILLS, []);

        // v3.0.15: 调试日志 - 检查从 localStorage 加载的数据
        logDebug('从 localStorage 加载 Skills:', skills.map(s => ({
            name: s.name,
            hasFiles: !!s.files,
            filesCount: s.files?.length ?? 0,
        })));

        // 确保日期类型正确
        return skills.map(skill => ({
            ...skill,
            createdAt: skill.createdAt instanceof Date
                ? skill.createdAt
                : new Date(skill.createdAt as unknown as string),
            updatedAt: skill.updatedAt instanceof Date
                ? skill.updatedAt
                : new Date(skill.updatedAt as unknown as string),
        }));
    },

    /**
     * 同步保存（兼容现有代码）
     */
    saveSync(skills: Skill[]): void {
        // 只保存自定义技能
        const customSkills = skills.filter(skill => !skill.builtIn);
        const serialized = customSkills.map(skill => ({
            ...skill,
            createdAt: skill.createdAt instanceof Date
                ? skill.createdAt.toISOString()
                : skill.createdAt,
            updatedAt: skill.updatedAt instanceof Date
                ? skill.updatedAt.toISOString()
                : skill.updatedAt,
        }));
        saveToLocalStorage(STORAGE_KEYS.SKILLS, serialized);
    },

    /**
     * 添加技能（仅支持自定义技能）
     */
    async add(skill: Skill): Promise<Skill[]> {
        if (skill.builtIn) {
            logWarn(' 不能添加内置技能');
            return this.load();
        }
        const skills = await this.load();
        skills.push(skill);
        await this.save(skills);
        return skills;
    },

    /**
     * 更新技能（仅支持自定义技能）
     */
    async update(id: string, updates: Partial<Skill>): Promise<Skill[]> {
        const skills = await this.load();
        const updated = skills.map(skill => {
            if (skill.id === id) {
                if (skill.builtIn) {
                    logWarn(' 不能修改内置技能');
                    return skill;
                }
                return { ...skill, ...updates, updatedAt: new Date() };
            }
            return skill;
        });
        await this.save(updated);
        return updated;
    },

    /**
     * 删除技能（仅支持自定义技能）
     */
    async delete(id: string): Promise<Skill[]> {
        const skills = await this.load();
        const toDelete = skills.find(skill => skill.id === id);
        if (toDelete?.builtIn) {
            logWarn(' 不能删除内置技能');
            return skills;
        }
        const filtered = skills.filter(skill => skill.id !== id);
        await this.save(filtered);
        return filtered;
    },

    /**
     * 切换技能启用状态（内置技能也可切换）
     */
    async toggleEnabled(id: string, enabled: boolean): Promise<Skill[]> {
        const skills = await this.load();
        const updated = skills.map(skill =>
            skill.id === id ? { ...skill, enabled, updatedAt: new Date() } : skill
        );
        await this.save(updated);
        return updated;
    },
};

// ==================== MCP Servers 存储 ====================

/**
 * MCP Server 存储服务 (v2.2.0)
 *
 * 支持 Tauri 文件系统和 localStorage 双环境
 *
 * v2.0.1 修复：完整的字段映射，排除运行时字段
 * v2.2.0 新增：enabled/autoStart 字段支持
 */
export const mcpServersStorage = {
    /**
     * 保存 MCP 服务器列表
     * - Tauri 环境：调用 save_mcp_servers 命令
     * - 浏览器环境：保存到 localStorage
     *
     * 注意：只保存持久化字段，排除运行时字段（tools, serverInfo 等）
     */
    async save(servers: MCPServer[]): Promise<void> {
        logDebug('保存 MCP 服务器，数量:', servers.length);

        // 完整映射所有持久化字段（排除运行时字段）
        // 前端 camelCase -> 后端 snake_case
        const serialized = servers.map(server => ({
            // 基础标识
            id: server.id,
            name: server.name,
            description: server.description,

            // 启用与自启动配置 (v2.2.0)
            enabled: server.enabled ?? true,
            auto_start: server.autoStart ?? false,

            // 传输配置（v2.0.0）- 关键修复：添加 transport_type 映射
            transport_type: server.transportType,
            command: server.command,
            args: server.args,
            env: server.env,
            endpoint: server.endpoint,

            // 认证配置
            auth_type: server.authType,
            auth_value: server.authValue,

            // 状态：保存时重置为断开，避免保存中间状态
            status: 'disconnected',

            // 统计信息
            last_active_at: server.lastActiveAt instanceof Date
                ? server.lastActiveAt.toISOString()
                : server.lastActiveAt,
            request_count: server.requestCount ?? 0,

            // 元数据
            created_at: server.createdAt instanceof Date
                ? server.createdAt.toISOString()
                : server.createdAt,
            updated_at: server.updatedAt instanceof Date
                ? server.updatedAt.toISOString()
                : server.updatedAt,

            // 不保存运行时字段: tools, resources, serverInfo, capabilities, errorMessage
        }));

        if (isTauriEnvironment()) {
            try {
                await invoke('save_mcp_servers', { servers: serialized });
                logDebug('已通过 Tauri 保存 MCP 服务器配置');
            } catch (error) {
                logError(' Tauri save_mcp_servers 失败:', error);
                // v4.2.6: 不回退到 localStorage。
                // MCP stdio 配置会启动本地子进程，后端保存阶段承担安全校验。
                // 如果这里静默回退，导入/模板/本地配置就能绕过后端校验并造成状态不一致。
                throw error;
            }
        } else {
            saveToLocalStorage(STORAGE_KEYS.MCP_SERVERS, serialized);
        }
    },

    /**
     * 加载 MCP 服务器列表
     * - Tauri 环境：调用 load_mcp_servers 命令
     * - 浏览器环境：从 localStorage 读取
     */
    async load(): Promise<MCPServer[]> {
        logDebug('加载 MCP 服务器配置');

        if (isTauriEnvironment()) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const servers = await invoke<any[]>('load_mcp_servers');
                logDebug('已通过 Tauri 加载 MCP 服务器，数量:', servers.length);

                // 转换 Rust snake_case 为前端 camelCase (v2.0.0)
                return servers.map(server => ({
                    id: server.id,
                    name: server.name,
                    description: server.description,

                    // 启用与自启动配置 (v2.2.0)
                    enabled: server.enabled ?? true,
                    autoStart: server.auto_start ?? false,

                    transportType: server.transport_type || 'http',  // v2.0.0: 默认 http 兼容旧数据
                    command: server.command,
                    args: server.args,
                    env: server.env,
                    endpoint: server.endpoint,
                    status: server.status,
                    capabilities: server.capabilities || {},
                    authType: server.auth_type,
                    authValue: server.auth_value,
                    lastActiveAt: server.last_active_at ? new Date(server.last_active_at) : undefined,
                    requestCount: server.request_count,
                    errorMessage: server.error_message,
                    createdAt: new Date(server.created_at),
                    updatedAt: new Date(server.updated_at),
                }));
            } catch (error) {
                logError(' Tauri load_mcp_servers 失败:', error);
                // v4.2.6: 不回退到 localStorage，避免在 Tauri 原生存储不可用时加载陈旧或未校验的 MCP 配置。
                throw error;
            }
        } else {
            return this.loadSync();
        }
    },

    /**
     * 同步加载（兼容现有代码和 localStorage 回退）
     *
     * 注意：需要将 snake_case 转换回 camelCase
     */
    loadSync(): MCPServer[] {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stored = loadFromLocalStorage<any[]>(STORAGE_KEYS.MCP_SERVERS, []);

        // 转换 snake_case 为 camelCase（与 load() 保持一致）
        return stored.map(server => ({
            // 基础标识
            id: server.id,
            name: server.name,
            description: server.description,

            // 启用与自启动配置 (v2.2.0)
            enabled: server.enabled ?? true,
            autoStart: server.auto_start ?? server.autoStart ?? false,

            // 传输配置 - snake_case -> camelCase
            transportType: server.transport_type || server.transportType || 'http',
            command: server.command,
            args: server.args,
            env: server.env,
            endpoint: server.endpoint,

            // 认证配置 - snake_case -> camelCase
            authType: server.auth_type || server.authType,
            authValue: server.auth_value || server.authValue,

            // 状态
            status: server.status || 'disconnected',

            // 统计信息 - snake_case -> camelCase
            lastActiveAt: server.last_active_at
                ? new Date(server.last_active_at)
                : server.lastActiveAt
                    ? new Date(server.lastActiveAt)
                    : undefined,
            requestCount: server.request_count ?? server.requestCount ?? 0,

            // 元数据 - snake_case -> camelCase
            createdAt: new Date(server.created_at || server.createdAt),
            updatedAt: new Date(server.updated_at || server.updatedAt),
        }));
    },

    /**
     * 同步保存（兼容现有代码）
     *
     * 注意：与 save() 使用相同的字段映射逻辑
     */
    saveSync(servers: MCPServer[]): void {
        // 完整映射所有持久化字段（排除运行时字段）
        // 前端 camelCase -> 后端 snake_case
        const serialized = servers.map(server => ({
            // 基础标识
            id: server.id,
            name: server.name,
            description: server.description,

            // 启用与自启动配置 (v2.2.0)
            enabled: server.enabled ?? true,
            auto_start: server.autoStart ?? false,

            // 传输配置（v2.0.0）- 关键修复：添加 transport_type 映射
            transport_type: server.transportType,
            command: server.command,
            args: server.args,
            env: server.env,
            endpoint: server.endpoint,

            // 认证配置
            auth_type: server.authType,
            auth_value: server.authValue,

            // 状态：保存时重置为断开
            status: 'disconnected',

            // 统计信息
            last_active_at: server.lastActiveAt instanceof Date
                ? server.lastActiveAt.toISOString()
                : server.lastActiveAt,
            request_count: server.requestCount ?? 0,

            // 元数据
            created_at: server.createdAt instanceof Date
                ? server.createdAt.toISOString()
                : server.createdAt,
            updated_at: server.updatedAt instanceof Date
                ? server.updatedAt.toISOString()
                : server.updatedAt,

            // 不保存运行时字段: tools, resources, serverInfo, capabilities, errorMessage
        }));
        saveToLocalStorage(STORAGE_KEYS.MCP_SERVERS, serialized);
    },

    /**
     * 添加服务器
     */
    async add(server: MCPServer): Promise<MCPServer[]> {
        const servers = await this.load();
        servers.push(server);
        await this.save(servers);
        return servers;
    },

    /**
     * 更新服务器
     */
    async update(id: string, updates: Partial<MCPServer>): Promise<MCPServer[]> {
        const servers = await this.load();
        const updated = servers.map(server =>
            server.id === id ? { ...server, ...updates, updatedAt: new Date() } : server
        );
        await this.save(updated);
        return updated;
    },

    /**
     * 删除服务器
     */
    async delete(id: string): Promise<MCPServer[]> {
        const servers = await this.load();
        const filtered = servers.filter(server => server.id !== id);
        await this.save(filtered);
        return filtered;
    },
};

// ==================== Settings 存储 ====================

/**
 * 应用设置接口
 * v4.1.7: 添加 sidebarCollapsed 字段
 */
export interface AppSettings {
    theme: 'light' | 'dark' | 'system';
    language: 'zh' | 'en' | 'auto';
    /** v4.1.7: 侧边栏折叠状态 */
    sidebarCollapsed?: boolean;
}

/**
 * 检测系统语言，返回应用支持的语言代码
 *
 * 根据浏览器/系统语言自动选择：
 * - 中文系统（zh-CN, zh-TW, zh-HK, zh-Hans, zh-Hant 等）→ 返回 'zh'
 * - 其他语言 → 返回 'en'
 *
 * @returns 'zh' | 'en' - 应用支持的语言代码
 */
function detectSystemLanguage(): 'zh' | 'en' {
    // 获取浏览器/系统语言
    const systemLang = navigator.language || navigator.languages?.[0] || 'en';

    logDebug('检测系统语言:', systemLang);

    // 中文语言代码：zh, zh-CN, zh-TW, zh-HK, zh-Hans, zh-Hant 等
    if (systemLang.toLowerCase().startsWith('zh')) {
        logDebug('系统语言为中文，使用 zh');
        return 'zh';
    }

    // 其他语言默认使用英文
    logDebug('系统语言非中文，使用 en');
    return 'en';
}

/**
 * 设置存储服务 (v2.6.0)
 *
 * 支持 Tauri 文件系统和 localStorage 双环境
 * - Tauri 环境：调用 save_settings/load_settings 命令
 * - 浏览器环境：回退到 localStorage
 *
 * v4.1.7: 添加侧边栏折叠状态持久化
 */
export const settingsStorage = {
    /**
     * 保存应用设置
     * - Tauri 环境：调用 save_settings 命令保存到文件
     * - 浏览器环境：保存到 localStorage
     *
     * v4.1.7: 转换 camelCase 为 snake_case
     */
    async save(settings: AppSettings): Promise<void> {
        logDebug('保存应用设置:', settings);

        // 转换为 Tauri 后端期望的 snake_case 格式
        const serialized = {
            theme: settings.theme,
            language: settings.language,
            sidebar_collapsed: settings.sidebarCollapsed ?? false,
        };

        if (isTauriEnvironment()) {
            try {
                await invoke('save_settings', { settings: serialized });
                logDebug('已通过 Tauri 保存应用设置');
            } catch (error) {
                logError(' Tauri save_settings 失败:', error);
                // 回退到 localStorage
                saveToLocalStorage(STORAGE_KEYS.SETTINGS, settings);
            }
        } else {
            saveToLocalStorage(STORAGE_KEYS.SETTINGS, settings);
        }
    },

    /**
     * 同步保存（兼容现有代码）
     */
    saveSync(settings: AppSettings): void {
        saveToLocalStorage(STORAGE_KEYS.SETTINGS, settings);
    },

    /**
     * 加载应用设置
     * - Tauri 环境：调用 load_settings 命令从文件加载
     * - 浏览器环境：从 localStorage 读取
     *
     * v4.1.7: 转换 snake_case 为 camelCase
     * v4.2.0: 支持 auto 语言设置，自动检测系统语言
     */
    async loadAsync(): Promise<AppSettings> {
        logDebug('加载应用设置');

        if (isTauriEnvironment()) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const settings = await invoke<any>('load_settings');
                logDebug('已通过 Tauri 加载应用设置:', settings);
                // 转换 snake_case 为 camelCase
                const result: AppSettings = {
                    theme: settings.theme,
                    language: settings.language,
                    sidebarCollapsed: settings.sidebar_collapsed ?? false,
                };

                // 如果语言设置为 auto，则检测系统语言
                if (result.language === 'auto') {
                    result.language = detectSystemLanguage();
                }

                return result;
            } catch (error) {
                logError(' Tauri load_settings 失败:', error);
                // 回退到 localStorage
                return this.load();
            }
        } else {
            return this.load();
        }
    },

    /**
     * 同步加载（兼容现有代码和 localStorage 回退）
     *
     * 当语言设置为 'auto' 或未设置时，自动检测系统语言
     */
    load(): AppSettings {
        const settings = loadFromLocalStorage<AppSettings>(STORAGE_KEYS.SETTINGS, {
            theme: 'system',
            language: 'auto',
            sidebarCollapsed: false,
        });

        // 如果语言设置为 auto，则检测系统语言
        if (settings.language === 'auto') {
            return {
                ...settings,
                language: detectSystemLanguage(),
            };
        }

        return settings;
    },

    /**
     * v4.1.7: 更新单个设置项
     * 便于只更新侧边栏状态而不影响其他设置
     */
    async updateSidebarCollapsed(collapsed: boolean): Promise<void> {
        const settings = await this.loadAsync();
        settings.sidebarCollapsed = collapsed;
        await this.save(settings);
    },
};

// ==================== Provider Credentials 存储 (v3.1.0) ====================

/**
 * Provider 凭证存储服务 (v3.1.0)
 *
 * 存储 AI 提供商的认证凭证（API Key、OAuth Token 等）
 * 支持 Tauri 文件系统和 localStorage 双环境
 *
 * 安全注意事项：
 * - API Key 等敏感信息会被持久化存储
 * - Tauri 环境下存储在用户数据目录
 * - 浏览器环境下存储在 localStorage（仅用于开发）
 */
export const providerCredentialsStorage = {
    /**
     * 保存所有凭证
     *
     * @param credentials - 凭证列表
     */
    async save(credentials: ProviderCredential[]): Promise<void> {
        logDebug('保存 Provider 凭证，数量:', credentials.length);

        // 序列化凭证（日期转字符串）
        // v3.3.5: 添加 account_id 字段支持
        // v3.4.5: 添加 project_id 字段支持
        // v0.9.0: 添加 profile_arn, auth_method 字段支持（修复 Kiro 持久化问题）
        // v0.9.1: 添加 kiro_client_id, kiro_client_secret, kiro_sso_region, kiro_start_url 字段（修复重启后登录状态丢失）
        const serialized = credentials.map(cred => ({
            provider_id: cred.providerId,
            type: cred.type,
            api_key: cred.apiKey,
            access_token: cred.accessToken,
            refresh_token: cred.refreshToken,
            expires_at: cred.expiresAt,
            account_id: cred.accountId,  // v3.3.5: ChatGPT 账户 ID
            project_id: cred.projectId,  // v3.4.5: Google Cloud 项目 ID
            profile_arn: cred.profileArn,  // v0.9.0: Kiro Profile ARN
            auth_method: cred.authMethod,  // v0.9.0: Kiro 认证方式 ("idc" | "aws")
            kiro_client_id: cred.kiroClientId,  // v0.9.1: Kiro 客户端 ID
            kiro_client_secret: cred.kiroClientSecret,  // v0.9.1: Kiro 客户端密钥
            kiro_sso_region: cred.kiroSsoRegion,  // v0.9.1: Kiro SSO 区域
            kiro_start_url: cred.kiroStartUrl,  // v0.9.1: Kiro IDC Start URL
            created_at: cred.createdAt instanceof Date
                ? cred.createdAt.toISOString()
                : cred.createdAt,
            updated_at: cred.updatedAt instanceof Date
                ? cred.updatedAt.toISOString()
                : cred.updatedAt,
        }));

        if (isTauriEnvironment()) {
            try {
                await invoke('save_provider_credentials', { credentials: serialized });
                logDebug('已通过 Tauri 保存 Provider 凭证');
            } catch (error) {
                logError(' Tauri save_provider_credentials 失败:', error);
                // v4.2.5: 不回退到 localStorage，直接抛出错误，避免安全边界退化
                throw new Error(
                    '凭证存储失败：无法写入安全存储。请检查应用权限和磁盘空间。',
                    { cause: error }
                );
            }
        } else {
            // 浏览器环境才使用 localStorage
            saveToLocalStorage(STORAGE_KEYS.PROVIDER_CREDENTIALS, serialized);
        }
    },

    /**
     * 加载所有凭证
     *
     * @returns 凭证列表
     */
    async load(): Promise<ProviderCredential[]> {
        logDebug('加载 Provider 凭证');

        if (isTauriEnvironment()) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const credentials = await invoke<any[]>('load_provider_credentials');
                logDebug('已通过 Tauri 加载 Provider 凭证，数量:', credentials.length);

                // 转换 snake_case 为 camelCase
                // v3.3.5: 添加 accountId 字段
                // v3.4.5: 添加 projectId 字段
                // v0.9.0: 添加 profileArn, authMethod 字段（修复 Kiro 持久化问题）
                // v0.9.1: 添加 kiroClientId, kiroClientSecret, kiroSsoRegion, kiroStartUrl 字段（修复重启后登录状态丢失）
                return credentials.map(cred => ({
                    providerId: cred.provider_id,
                    type: cred.type,
                    apiKey: cred.api_key,
                    accessToken: cred.access_token,
                    refreshToken: cred.refresh_token,
                    expiresAt: cred.expires_at,
                    accountId: cred.account_id,  // v3.3.5: ChatGPT 账户 ID
                    projectId: cred.project_id,  // v3.4.5: Google Cloud 项目 ID
                    profileArn: cred.profile_arn,  // v0.9.0: Kiro Profile ARN
                    authMethod: cred.auth_method,  // v0.9.0: Kiro 认证方式 ("idc" | "aws")
                    kiroClientId: cred.kiro_client_id,  // v0.9.1: Kiro 客户端 ID
                    kiroClientSecret: cred.kiro_client_secret,  // v0.9.1: Kiro 客户端密钥
                    kiroSsoRegion: cred.kiro_sso_region,  // v0.9.1: Kiro SSO 区域
                    kiroStartUrl: cred.kiro_start_url,  // v0.9.1: Kiro IDC Start URL
                    createdAt: new Date(cred.created_at),
                    updatedAt: new Date(cred.updated_at),
                }));
            } catch (error) {
                logError(' Tauri load_provider_credentials 失败:', error);
                // v4.2.5: 不回退到 localStorage，直接抛出错误，避免安全边界退化
                throw new Error(
                    '凭证加载失败：无法读取安全存储。请检查应用权限。',
                    { cause: error }
                );
            }
        } else {
            // 浏览器环境才使用 localStorage
            return this.loadSync();
        }
    },

    /**
     * 同步加载（兼容现有代码和 localStorage 回退）
     * v3.3.5: 添加 accountId 字段
     * v3.4.5: 添加 projectId 字段
     * v0.9.0: 添加 profileArn, authMethod 字段（修复 Kiro 持久化问题）
     * v0.9.1: 添加 kiroClientId, kiroClientSecret, kiroSsoRegion, kiroStartUrl 字段（修复重启后登录状态丢失）
     */
    loadSync(): ProviderCredential[] {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stored = loadFromLocalStorage<any[]>(STORAGE_KEYS.PROVIDER_CREDENTIALS, []);

        // 转换 snake_case 为 camelCase
        return stored.map(cred => ({
            providerId: cred.provider_id || cred.providerId,
            type: cred.type,
            apiKey: cred.api_key || cred.apiKey,
            accessToken: cred.access_token || cred.accessToken,
            refreshToken: cred.refresh_token || cred.refreshToken,
            expiresAt: cred.expires_at || cred.expiresAt,
            accountId: cred.account_id || cred.accountId,  // v3.3.5: ChatGPT 账户 ID
            projectId: cred.project_id || cred.projectId,  // v3.4.5: Google Cloud 项目 ID
            profileArn: cred.profile_arn || cred.profileArn,  // v0.9.0: Kiro Profile ARN
            authMethod: cred.auth_method || cred.authMethod,  // v0.9.0: Kiro 认证方式 ("idc" | "aws")
            kiroClientId: cred.kiro_client_id || cred.kiroClientId,  // v0.9.1: Kiro 客户端 ID
            kiroClientSecret: cred.kiro_client_secret || cred.kiroClientSecret,  // v0.9.1: Kiro 客户端密钥
            kiroSsoRegion: cred.kiro_sso_region || cred.kiroSsoRegion,  // v0.9.1: Kiro SSO 区域
            kiroStartUrl: cred.kiro_start_url || cred.kiroStartUrl,  // v0.9.1: Kiro IDC Start URL
            createdAt: new Date(cred.created_at || cred.createdAt),
            updatedAt: new Date(cred.updated_at || cred.updatedAt),
        }));
    },

    /**
     * 添加或更新单个凭证
     * 如果已存在相同 providerId 的凭证，则更新
     *
     * @param credential - 凭证对象
     */
    async add(credential: ProviderCredential): Promise<void> {
        const credentials = await this.load();
        const existingIndex = credentials.findIndex(c => c.providerId === credential.providerId);

        if (existingIndex >= 0) {
            // 更新现有凭证
            credentials[existingIndex] = {
                ...credential,
                updatedAt: new Date(),
            };
            logDebug('更新 Provider 凭证:', credential.providerId);
        } else {
            // 添加新凭证
            credentials.push({
                ...credential,
                createdAt: credential.createdAt || new Date(),
                updatedAt: new Date(),
            });
            logDebug('添加 Provider 凭证:', credential.providerId);
        }

        await this.save(credentials);
    },

    /**
     * 删除指定提供商的凭证
     *
     * @param providerId - 提供商 ID
     */
    async remove(providerId: string): Promise<void> {
        const credentials = await this.load();
        const filtered = credentials.filter(c => c.providerId !== providerId);

        if (filtered.length < credentials.length) {
            await this.save(filtered);
            logDebug('删除 Provider 凭证:', providerId);
        } else {
            logWarn('未找到要删除的 Provider 凭证:', providerId);
        }
    },

    /**
     * 获取指定提供商的凭证
     *
     * v3.6.4: 使用大小写不敏感匹配，避免 providerId 大小写不一致导致查找失败
     *
     * @param providerId - 提供商 ID
     * @returns 凭证对象或 null
     */
    async get(providerId: string): Promise<ProviderCredential | null> {
        const credentials = await this.load();
        return credentials.find(c => c.providerId.toLowerCase() === providerId.toLowerCase()) || null;
    },

    /**
     * 同步获取指定提供商的凭证
     *
     * v3.6.4: 使用大小写不敏感匹配，避免 providerId 大小写不一致导致查找失败
     *
     * @param providerId - 提供商 ID
     * @returns 凭证对象或 null
     */
    getSync(providerId: string): ProviderCredential | null {
        const credentials = this.loadSync();
        return credentials.find(c => c.providerId.toLowerCase() === providerId.toLowerCase()) || null;
    },

    /**
     * 检查指定提供商是否已连接（有有效凭证）
     *
     * @param providerId - 提供商 ID
     * @returns 是否已连接
     */
    async isConnected(providerId: string): Promise<boolean> {
        const credential = await this.get(providerId);
        if (!credential) return false;

        // 检查 OAuth token 是否过期
        if (credential.type === 'oauth' && credential.expiresAt) {
            return credential.expiresAt > Date.now();
        }

        // API Key 认证只要有值就算连接
        if (credential.type === 'api' && credential.apiKey) {
            return true;
        }

        return false;
    },

    /**
     * 清除所有凭证
     */
    async clear(): Promise<void> {
        await this.save([]);
        logDebug('已清除所有 Provider 凭证');
    },
};

// ==================== 数据导出/导入 ====================

/**
 * 数据导出/导入服务
 */
export const dataExport = {
    /**
     * 导出所有数据为 JSON 字符串
     */
    exportAll(): string {
        const data = {
            models: modelsStorage.loadSync(),
            agents: agentsStorage.loadSync(),
            skills: skillsStorage.loadSync(),
            mcpServers: mcpServersStorage.loadSync(),
            chats: chatsStorage.loadSync(),
            settings: settingsStorage.load(),
            exportedAt: new Date().toISOString(),
        };
        return JSON.stringify(data, null, 2);
    },

    /**
     * 从 JSON 字符串导入数据
     */
    importAll(jsonData: string): boolean {
        try {
            const data = JSON.parse(jsonData) as {
                models?: AIModelConfig[];
                agents?: Agent[];
                skills?: Skill[];
                mcpServers?: MCPServer[];
                chats?: Chat[];
                settings?: AppSettings;
            };

            if (data.models) modelsStorage.saveSync(data.models);
            if (data.agents) agentsStorage.save(data.agents);
            if (data.skills) skillsStorage.save(data.skills);
            if (data.mcpServers) mcpServersStorage.save(data.mcpServers);
            if (data.chats) chatsStorage.saveSync(data.chats);
            if (data.settings) settingsStorage.save(data.settings);

            logDebug('数据导入成功');
            return true;
        } catch (error) {
            logError(' 数据导入失败:', error);
            return false;
        }
    },

    /**
     * 清除所有数据
     */
    clearAll(): void {
        Object.values(STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
        logDebug('所有数据已清除');
    },
};

// ==================== Roundtable Chats 存储 (v4.0.0) ====================

/**
 * 圆桌对话存储 Key
 */
const ROUNDTABLE_CHATS_KEY = 'mobaus_roundtable_chats';

/**
 * 圆桌对话存储服务 (v4.0.0)
 *
 * 专门用于存储圆桌会议模式的对话数据
 * 与普通对话分开存储，便于管理和查询
 *
 * 支持 Tauri 文件系统和 localStorage 双环境
 */
export const roundtableChatsStorage = {
    /**
     * 保存圆桌对话列表
     *
     * @param chats - 圆桌对话列表
     */
    async save(chats: RoundtableChat[]): Promise<void> {
        logDebug('保存圆桌对话，数量:', chats.length);

        // 序列化日期字段和嵌套对象
        const serialized = chats.map(chat => ({
            ...chat,
            createdAt: chat.createdAt instanceof Date
                ? chat.createdAt.toISOString()
                : chat.createdAt,
            updatedAt: chat.updatedAt instanceof Date
                ? chat.updatedAt.toISOString()
                : chat.updatedAt,
            // 序列化消息
            messages: chat.messages.map(msg => ({
                ...msg,
                createdAt: msg.createdAt instanceof Date
                    ? msg.createdAt.toISOString()
                    : msg.createdAt,
            })),
            // 序列化圆桌配置中的参与者
            roundtableConfig: {
                ...chat.roundtableConfig,
                participants: chat.roundtableConfig.participants.map(p => ({
                    ...p,
                    lastSpokeAt: p.lastSpokeAt instanceof Date
                        ? p.lastSpokeAt.toISOString()
                        : p.lastSpokeAt,
                })),
            },
        }));

        if (isTauriEnvironment()) {
            try {
                // 尝试使用 Tauri 命令保存（如果后端支持）
                await invoke('save_roundtable_chats', { chats: serialized });
                logDebug('已通过 Tauri 保存圆桌对话');
            } catch (error) {
                // 如果 Tauri 命令不存在，回退到 localStorage
                logWarn('Tauri save_roundtable_chats 不可用，回退到 localStorage:', error);
                saveToLocalStorage(ROUNDTABLE_CHATS_KEY, serialized);
            }
        } else {
            saveToLocalStorage(ROUNDTABLE_CHATS_KEY, serialized);
        }
    },

    /**
     * 加载圆桌对话列表
     *
     * @returns 圆桌对话列表
     */
    async load(): Promise<RoundtableChat[]> {
        logDebug('加载圆桌对话');

        if (isTauriEnvironment()) {
            try {
                // 尝试使用 Tauri 命令加载
                const chats = await invoke<RoundtableChat[]>('load_roundtable_chats');
                logDebug('已通过 Tauri 加载圆桌对话，数量:', chats.length);
                return this.deserializeChats(chats);
            } catch (error) {
                // 如果 Tauri 命令不存在，回退到 localStorage
                logWarn('Tauri load_roundtable_chats 不可用，回退到 localStorage:', error);
                return this.loadSync();
            }
        } else {
            return this.loadSync();
        }
    },

    /**
     * 同步加载（兼容现有代码和 localStorage 回退）
     */
    loadSync(): RoundtableChat[] {
        const stored = loadFromLocalStorage<RoundtableChat[]>(ROUNDTABLE_CHATS_KEY, []);
        return this.deserializeChats(stored);
    },

    /**
     * 反序列化圆桌对话（转换日期字符串为 Date 对象）
     */
    deserializeChats(chats: RoundtableChat[]): RoundtableChat[] {
        return chats.map(chat => ({
            ...chat,
            createdAt: new Date(chat.createdAt as unknown as string),
            updatedAt: new Date(chat.updatedAt as unknown as string),
            messages: chat.messages.map(msg => ({
                ...msg,
                createdAt: new Date(msg.createdAt as unknown as string),
            })),
            roundtableConfig: {
                ...chat.roundtableConfig,
                participants: chat.roundtableConfig.participants.map(p => ({
                    ...p,
                    lastSpokeAt: p.lastSpokeAt
                        ? new Date(p.lastSpokeAt as unknown as string)
                        : undefined,
                })),
            },
        }));
    },

    /**
     * 同步保存（兼容现有代码）
     */
    saveSync(chats: RoundtableChat[]): void {
        const serialized = chats.map(chat => ({
            ...chat,
            createdAt: chat.createdAt instanceof Date
                ? chat.createdAt.toISOString()
                : chat.createdAt,
            updatedAt: chat.updatedAt instanceof Date
                ? chat.updatedAt.toISOString()
                : chat.updatedAt,
            messages: chat.messages.map(msg => ({
                ...msg,
                createdAt: msg.createdAt instanceof Date
                    ? msg.createdAt.toISOString()
                    : msg.createdAt,
            })),
            roundtableConfig: {
                ...chat.roundtableConfig,
                participants: chat.roundtableConfig.participants.map(p => ({
                    ...p,
                    lastSpokeAt: p.lastSpokeAt instanceof Date
                        ? p.lastSpokeAt.toISOString()
                        : p.lastSpokeAt,
                })),
            },
        }));
        saveToLocalStorage(ROUNDTABLE_CHATS_KEY, serialized);
    },

    /**
     * 添加圆桌对话
     *
     * @param chat - 圆桌对话
     * @returns 更新后的对话列表
     */
    async add(chat: RoundtableChat): Promise<RoundtableChat[]> {
        const chats = await this.load();
        chats.push(chat);
        await this.save(chats);
        logDebug('添加圆桌对话:', chat.id);
        return chats;
    },

    /**
     * 更新圆桌对话
     *
     * @param id - 对话 ID
     * @param updates - 更新内容
     * @returns 更新后的对话列表
     */
    async update(id: string, updates: Partial<RoundtableChat>): Promise<RoundtableChat[]> {
        const chats = await this.load();
        const updated = chats.map(chat =>
            chat.id === id
                ? { ...chat, ...updates, updatedAt: new Date() }
                : chat
        );
        await this.save(updated);
        logDebug('更新圆桌对话:', id);
        return updated;
    },

    /**
     * 删除圆桌对话
     *
     * @param id - 对话 ID
     * @returns 更新后的对话列表
     */
    async delete(id: string): Promise<RoundtableChat[]> {
        const chats = await this.load();
        const filtered = chats.filter(chat => chat.id !== id);
        await this.save(filtered);
        logDebug('删除圆桌对话:', id);
        return filtered;
    },

    /**
     * 获取单个圆桌对话
     *
     * @param id - 对话 ID
     * @returns 圆桌对话或 null
     */
    async get(id: string): Promise<RoundtableChat | null> {
        const chats = await this.load();
        return chats.find(chat => chat.id === id) || null;
    },

    /**
     * 添加消息到圆桌对话
     *
     * @param chatId - 对话 ID
     * @param message - 消息对象
     * @returns 更新后的对话
     */
    async addMessage(chatId: string, message: RoundtableChat['messages'][0]): Promise<RoundtableChat | null> {
        const chats = await this.load();
        const chatIndex = chats.findIndex(c => c.id === chatId);

        if (chatIndex === -1) {
            logWarn('圆桌对话不存在:', chatId);
            return null;
        }

        const chat = chats[chatIndex];
        chat.messages.push(message);
        chat.updatedAt = new Date();

        // 更新参与者发言统计
        const participant = chat.roundtableConfig.participants.find(
            p => p.id === message.participantId
        );
        if (participant) {
            participant.messageCount += 1;
            participant.lastSpokeAt = new Date();
        }

        await this.save(chats);
        logDebug('添加消息到圆桌对话:', chatId);
        return chat;
    },

    /**
     * 更新圆桌配置
     *
     * @param chatId - 对话 ID
     * @param configUpdates - 配置更新
     * @returns 更新后的对话
     */
    async updateConfig(
        chatId: string,
        configUpdates: Partial<RoundtableChat['roundtableConfig']>
    ): Promise<RoundtableChat | null> {
        const chats = await this.load();
        const chatIndex = chats.findIndex(c => c.id === chatId);

        if (chatIndex === -1) {
            logWarn('圆桌对话不存在:', chatId);
            return null;
        }

        const chat = chats[chatIndex];
        chat.roundtableConfig = {
            ...chat.roundtableConfig,
            ...configUpdates,
        };
        chat.updatedAt = new Date();

        await this.save(chats);
        logDebug('更新圆桌配置:', chatId);
        return chat;
    },

    /**
     * 进入下一轮讨论
     *
     * @param chatId - 对话 ID
     * @returns 更新后的对话，如果已达到最大轮数则返回 null
     */
    async nextRound(chatId: string): Promise<RoundtableChat | null> {
        const chat = await this.get(chatId);
        if (!chat) {
            logWarn('圆桌对话不存在:', chatId);
            return null;
        }

        const { currentRound, rules } = chat.roundtableConfig;

        if (currentRound >= rules.maxRounds) {
            logWarn('已达到最大讨论轮数:', chatId);
            return null;
        }

        return this.updateConfig(chatId, {
            currentRound: currentRound + 1,
        });
    },

    /**
     * 完成讨论
     *
     * @param chatId - 对话 ID
     * @returns 更新后的对话
     */
    async complete(chatId: string): Promise<RoundtableChat | null> {
        return this.updateConfig(chatId, {
            status: 'completed',
        });
    },
};
