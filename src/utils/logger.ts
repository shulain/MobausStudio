/**
 * 统一日志工具模块 (v3.0.17)
 *
 * 提供统一的日志接口，便于：
 * - 日志级别控制
 * - 统一的日志格式
 * - 后续扩展（如远程上报、持久化等）
 *
 * 使用方式：
 * ```typescript
 * import { logger } from './logger';
 *
 * logger.info('[Skill]', '获取技能成功', { count: 10 });
 * logger.error('[MCP]', '连接失败', error);
 * logger.debug('[Chat]', '发送消息', message);
 * ```
 */

/**
 * 日志级别枚举
 */
export enum LogLevel {
    /** 调试信息，仅开发环境显示 */
    DEBUG = 0,
    /** 一般信息 */
    INFO = 1,
    /** 警告信息 */
    WARN = 2,
    /** 错误信息 */
    ERROR = 3,
    /** 关闭所有日志 */
    OFF = 4,
}

/**
 * 日志配置接口
 */
interface LoggerConfig {
    /** 当前日志级别，低于此级别的日志不会输出 */
    level: LogLevel;
    /** 是否显示时间戳 */
    showTimestamp: boolean;
    /** 是否在生产环境禁用 debug 日志 */
    disableDebugInProduction: boolean;
}

/**
 * 默认配置
 */
const defaultConfig: LoggerConfig = {
    level: LogLevel.DEBUG,
    showTimestamp: false,
    disableDebugInProduction: true,
};

/**
 * 当前配置
 */
let config: LoggerConfig = { ...defaultConfig };

/**
 * 判断是否为生产环境
 */
const isProduction = (): boolean => {
    return import.meta.env?.PROD === true;
};

/**
 * 格式化时间戳
 */
const formatTimestamp = (): string => {
    const now = new Date();
    return `[${now.toISOString()}]`;
};

/**
 * 检查是否应该输出日志
 */
const shouldLog = (level: LogLevel): boolean => {
    // 生产环境禁用 debug 日志
    if (level === LogLevel.DEBUG && config.disableDebugInProduction && isProduction()) {
        return false;
    }
    return level >= config.level;
};

/**
 * 构建日志前缀
 */
const buildPrefix = (level: string): string[] => {
    const parts: string[] = [];
    if (config.showTimestamp) {
        parts.push(formatTimestamp());
    }
    parts.push(level);
    return parts;
};

/**
 * 统一日志工具
 *
 * 提供 debug、info、warn、error 四个级别的日志方法
 */
export const logger = {
    /**
     * 调试日志（仅开发环境）
     *
     * @param tag - 模块标签，如 '[Skill]'、'[MCP]'
     * @param message - 日志消息
     * @param data - 附加数据（可选）
     */
    debug: (tag: string, message: string, data?: unknown): void => {
        if (shouldLog(LogLevel.DEBUG)) {
            const prefix = buildPrefix('[DEBUG]');
            if (data !== undefined) {
                console.debug(...prefix, tag, message, data);
            } else {
                console.debug(...prefix, tag, message);
            }
        }
    },

    /**
     * 信息日志
     *
     * @param tag - 模块标签，如 '[Skill]'、'[MCP]'
     * @param message - 日志消息
     * @param data - 附加数据（可选）
     */
    info: (tag: string, message: string, data?: unknown): void => {
        if (shouldLog(LogLevel.INFO)) {
            const prefix = buildPrefix('[INFO]');
            if (data !== undefined) {
                console.info(...prefix, tag, message, data);
            } else {
                console.info(...prefix, tag, message);
            }
        }
    },

    /**
     * 警告日志
     *
     * @param tag - 模块标签，如 '[Skill]'、'[MCP]'
     * @param message - 日志消息
     * @param data - 附加数据（可选）
     */
    warn: (tag: string, message: string, data?: unknown): void => {
        if (shouldLog(LogLevel.WARN)) {
            const prefix = buildPrefix('[WARN]');
            if (data !== undefined) {
                console.warn(...prefix, tag, message, data);
            } else {
                console.warn(...prefix, tag, message);
            }
        }
    },

    /**
     * 错误日志
     *
     * @param tag - 模块标签，如 '[Skill]'、'[MCP]'
     * @param message - 日志消息
     * @param error - 错误对象或附加数据（可选）
     */
    error: (tag: string, message: string, error?: unknown): void => {
        if (shouldLog(LogLevel.ERROR)) {
            const prefix = buildPrefix('[ERROR]');
            if (error !== undefined) {
                console.error(...prefix, tag, message, error);
            } else {
                console.error(...prefix, tag, message);
            }
        }
    },

    /**
     * 设置日志级别
     *
     * @param level - 新的日志级别
     */
    setLevel: (level: LogLevel): void => {
        config.level = level;
    },

    /**
     * 获取当前日志级别
     */
    getLevel: (): LogLevel => {
        return config.level;
    },

    /**
     * 更新日志配置
     *
     * @param newConfig - 部分配置更新
     */
    configure: (newConfig: Partial<LoggerConfig>): void => {
        config = { ...config, ...newConfig };
    },

    /**
     * 重置为默认配置
     */
    reset: (): void => {
        config = { ...defaultConfig };
    },
};

/**
 * 模块标签常量，便于统一管理
 */
export const LogTags = {
    /** 技能模块 */
    SKILL: '[Skill]',
    /** MCP 服务模块 */
    MCP: '[MCP]',
    /** 聊天模块 */
    CHAT: '[Chat]',
    /** Agent 模块 */
    AGENT: '[Agent]',
    /** 存储模块 */
    STORAGE: '[Storage]',
    /** API 模块 */
    API: '[API]',
    /** 应用主模块 */
    APP: '[App]',
    /** 模型模块 */
    MODEL: '[Model]',
    /** 设置模块 */
    SETTINGS: '[Settings]',
    /** UI 组件模块 */
    UI: '[UI]',
    /** 文件系统模块 */
    FS: '[FS]',
    /** 认证模块 (v3.4.5) */
    AUTH: '[Auth]',
    /** 统计模块 (v1.0.0) */
    ANALYTICS: '[Analytics]',
    /** 权限检查模块 (v2.4.0) */
    PERMISSION: '[Permission]',
    /** 提供商模块 */
    PROVIDER: '[Provider]',
} as const;

export default logger;
