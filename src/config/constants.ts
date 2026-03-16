/**
 * 应用配置常量
 *
 * 集中管理可配置的常量值，便于统一调整和维护
 *
 * @module config/constants
 * @version 1.0.0
 */

// ==================== MCP 配置 ====================

/** MCP 工具调用超时时间（毫秒） */
export const MCP_TOOL_CALL_TIMEOUT = 30000;

// ==================== 聊天消息配置 ====================

/** 聊天消息懒加载配置 */
export const CHAT_MESSAGE_CONFIG = {
    /** 初始显示条数 */
    INITIAL_COUNT: 20,
    /** 每次加载更多的条数 */
    LOAD_MORE_COUNT: 20,
    /** 触发加载的滚动阈值（px） */
    LOAD_MORE_THRESHOLD: 100,
};

// ==================== 存储配置 ====================

/** 数据持久化防抖延迟（毫秒） */
export const STORAGE_DEBOUNCE_DELAY = 1000;

// ==================== 更新检查配置 ====================

/** 启动时检查更新的延迟（毫秒） */
export const UPDATE_CHECK_DELAY = 3000;

// ==================== OAuth 配置 ====================

/** OAuth 回调超时时间（秒） */
export const OAUTH_CALLBACK_TIMEOUT = 300;

// ==================== 模型缓存配置 ====================

/** 模型缓存有效期（毫秒），默认 24 小时 */
export const MODEL_CACHE_TTL = 24 * 60 * 60 * 1000;

// ==================== 权限控制配置 (v2.4.0) ====================

/** 默认最大工具调用次数 */
export const DEFAULT_MAX_TOOL_CALLS = 50;

/** 默认工具调用超时时间（秒） */
export const DEFAULT_TOOL_CALL_TIMEOUT_SECONDS = 30;

/** 默认最大文件大小（字节，10MB） */
export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** 默认最大输出长度（字符） */
export const DEFAULT_MAX_OUTPUT_LENGTH = 100000;

/**
 * 内置的危险命令模式（沙箱模式下禁止）
 * 这些命令可能导致系统损坏或数据丢失
 * 注意：使用 glob 模式匹配
 * - * 匹配任意字符（不含 /）
 * - ** 匹配任意字符（含 /）
 */
export const DANGEROUS_COMMAND_PATTERNS = [
    'rm -rf **',        // 匹配 rm -rf /any/path
    'rm -r **',         // 匹配 rm -r /any/path
    'sudo **',          // 匹配 sudo 任意命令
    'chmod 777 **',     // 匹配 chmod 777 任意路径
    'chmod -R 777 **',  // 匹配 chmod -R 777 任意路径
    'mkfs**',           // 匹配 mkfs.ext4 等
    'dd if=**',         // 匹配 dd if=任意
    'dd of=/dev/**',    // 匹配 dd of=/dev/任意
    '> /dev/**',        // 匹配重定向到设备
    'shutdown **',      // 匹配 shutdown 命令
    'shutdown',         // 匹配单独的 shutdown
    'reboot **',        // 匹配 reboot 命令
    'reboot',           // 匹配单独的 reboot
    ':(){:|:&};:',      // Fork bomb
    'format **',        // 匹配 format 命令
];

/**
 * 内置的读取工具名称列表
 * 用于自动批准 readFiles 配置
 */
export const READ_TOOL_NAMES = [
    'Read',
    'read_file',
    'ReadFile',
    'cat',
    'Glob',
    'Grep',
    'head',
    'tail',
    'less',
];

/**
 * 内置的写入工具名称列表
 * 用于自动批准 writeFiles 配置
 */
export const WRITE_TOOL_NAMES = [
    'Write',
    'write_file',
    'WriteFile',
    'Edit',
    'edit_file',
    'append_file',
    'create_file',
];

/**
 * 内置的 Bash 工具名称列表
 * 用于识别命令执行工具
 */
export const BASH_TOOL_NAMES = [
    'Bash',
    'bash',
    'shell',
    'exec',
    'execute',
    'run_command',
    'terminal',
];
