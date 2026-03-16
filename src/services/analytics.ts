/**
 * 运营统计服务
 *
 * 使用 Mixpanel 作为第三方统计服务，收集运营数据
 * - 用户识别（匿名设备 ID）
 * - 用户行为追踪
 * - 模型/功能使用统计
 *
 * 注意：
 * - 不收集任何个人身份信息（PII）
 * - 统计失败不影响应用正常功能
 * - 支持通过 Cloudflare Worker 代理解决国内网络问题
 *
 * @module services/analytics
 * @version 2.0.0
 */

import { logger, LogTags } from '../utils/logger';

// ==================== 类型定义 ====================

/**
 * 统计服务配置
 */
export interface AnalyticsConfig {
    /** Mixpanel Project Token */
    projectToken: string;
    /** API 端点（默认：https://api.mixpanel.com）
     * 国内用户建议使用 Cloudflare Worker 代理
     */
    endpoint?: string;
    /** 是否启用统计（默认：true） */
    enabled?: boolean;
    /** 调试模式（默认：false） */
    debug?: boolean;
}

/**
 * 用户属性
 */
export interface UserProperties {
    /** 应用版本 */
    appVersion?: string;
    /** 操作系统 */
    os?: string;
    /** 操作系统版本 */
    osVersion?: string;
    /** 语言设置 */
    language?: string;
    /** 主题设置 */
    theme?: string;
    /** 首次启动时间 */
    firstLaunchAt?: string;
    /** 索引签名，允许任意字符串键 */
    [key: string]: string | undefined;
}

/**
 * Mixpanel 事件格式
 */
interface MixpanelEvent {
    event: string;
    properties: {
        token: string;
        distinct_id: string;
        time: number;
        $insert_id: string;
        // 设备信息
        $os?: string;
        $os_version?: string;
        $app_version?: string;
        $device?: string;
        // 自定义属性
        [key: string]: unknown;
    };
}

// ==================== 常量定义 ====================

/** 设备 ID 存储键 */
const DEVICE_ID_KEY = 'mobaus_device_id';

/** 首次启动时间存储键 */
const FIRST_LAUNCH_KEY = 'mobaus_first_launch';

/**
 * 默认 API 端点
 * 注意：api.mixpanel.com 在国内可能被墙
 * 推荐使用 Cloudflare Worker 代理
 */
const DEFAULT_ENDPOINT = 'https://api.mixpanel.com';

/** 请求超时时间（毫秒） */
const REQUEST_TIMEOUT = 10000;

// ==================== 内部状态 ====================

/** 服务配置 */
let config: Required<AnalyticsConfig> = {
    projectToken: '',
    endpoint: DEFAULT_ENDPOINT,
    enabled: false,
    debug: false,
};

/** 设备 ID（缓存） */
let deviceId: string | null = null;

/** 用户属性（缓存） */
let cachedUserProperties: UserProperties = {};

/** 是否已初始化 */
let initialized = false;

// ==================== 工具函数 ====================

/**
 * 获取或生成设备 ID
 * 使用 UUID v4 生成唯一设备 ID，存储在本地
 *
 * @returns 设备 ID
 */
function getDeviceId(): string {
    if (deviceId) {
        return deviceId;
    }

    try {
        deviceId = localStorage.getItem(DEVICE_ID_KEY);

        if (!deviceId) {
            // 生成新的设备 ID
            deviceId = crypto.randomUUID();
            localStorage.setItem(DEVICE_ID_KEY, deviceId);
            logDebug('生成新设备 ID:', deviceId);
        } else {
            logDebug('使用已有设备 ID:', deviceId);
        }
    } catch (error) {
        // localStorage 不可用时，生成临时 ID
        deviceId = crypto.randomUUID();
        logDebug('localStorage 不可用，使用临时设备 ID:', deviceId);
    }

    return deviceId;
}

/**
 * 获取首次启动时间
 *
 * @returns ISO 格式时间字符串
 */
function getFirstLaunchTime(): string {
    try {
        let firstLaunch = localStorage.getItem(FIRST_LAUNCH_KEY);

        if (!firstLaunch) {
            firstLaunch = new Date().toISOString();
            localStorage.setItem(FIRST_LAUNCH_KEY, firstLaunch);
        }

        return firstLaunch;
    } catch {
        return new Date().toISOString();
    }
}

/**
 * 获取操作系统信息
 *
 * @returns 操作系统名称和版本
 */
function getOSInfo(): { name: string; version: string } {
    const userAgent = navigator.userAgent;

    if (userAgent.includes('Mac OS X')) {
        const match = userAgent.match(/Mac OS X (\d+[._]\d+[._]?\d*)/);
        return {
            name: 'macOS',
            version: match ? match[1].replace(/_/g, '.') : 'unknown',
        };
    }

    if (userAgent.includes('Windows')) {
        const match = userAgent.match(/Windows NT (\d+\.\d+)/);
        return {
            name: 'Windows',
            version: match ? match[1] : 'unknown',
        };
    }

    if (userAgent.includes('Linux')) {
        return {
            name: 'Linux',
            version: 'unknown',
        };
    }

    return {
        name: 'unknown',
        version: 'unknown',
    };
}

/**
 * 调试日志输出
 */
function logDebug(message: string, ...args: unknown[]): void {
    if (config.debug) {
        logger.debug(LogTags.ANALYTICS, message, ...args);
    }
}

/**
 * 生成唯一的 insert_id（用于去重）
 */
function generateInsertId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 发送事件到 Mixpanel
 *
 * @param events - 事件列表
 */
async function sendEvents(events: MixpanelEvent[]): Promise<void> {
    if (!config.enabled || !config.projectToken) {
        logDebug('统计服务未启用或未配置 Project Token，跳过发送');
        return;
    }

    logDebug('发送事件:', events.map(e => e.event));

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        // Mixpanel Track API
        const response = await fetch(`${config.endpoint}/track`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/plain',
            },
            body: JSON.stringify(events),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.text();
        if (result !== '1') {
            throw new Error(`Mixpanel 返回错误: ${result}`);
        }

        logDebug('事件发送成功');
    } catch (error) {
        // 静默失败，仅在调试模式下输出日志
        if (config.debug) {
            if (error instanceof Error && error.name === 'AbortError') {
                logger.warn(LogTags.ANALYTICS, '事件发送超时');
            } else {
                logger.warn(LogTags.ANALYTICS, '事件发送失败:', error);
            }
        }
    }
}

/**
 * 发送用户属性更新到 Mixpanel
 *
 * @param properties - 用户属性
 */
async function sendUserProfile(properties: Record<string, unknown>): Promise<void> {
    if (!config.enabled || !config.projectToken) {
        logDebug('统计服务未启用或未配置 Project Token，跳过发送');
        return;
    }

    logDebug('更新用户属性:', properties);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        const payload = [{
            $token: config.projectToken,
            $distinct_id: getDeviceId(),
            $set: properties,
        }];

        // Mixpanel Engage API
        const response = await fetch(`${config.endpoint}/engage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/plain',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        logDebug('用户属性更新成功');
    } catch (error) {
        if (config.debug) {
            if (error instanceof Error && error.name === 'AbortError') {
                logger.warn(LogTags.ANALYTICS, '用户属性更新超时');
            } else {
                logger.warn(LogTags.ANALYTICS, '用户属性更新失败:', error);
            }
        }
    }
}

/**
 * 构建 Mixpanel 事件对象
 *
 * @param eventName - 事件名称
 * @param eventProperties - 事件属性
 * @returns Mixpanel 事件对象
 */
function buildEvent(
    eventName: string,
    eventProperties?: Record<string, unknown>
): MixpanelEvent {
    const osInfo = getOSInfo();

    return {
        event: eventName,
        properties: {
            token: config.projectToken,
            distinct_id: getDeviceId(),
            time: Math.floor(Date.now() / 1000),
            $insert_id: generateInsertId(),
            $os: osInfo.name,
            $os_version: osInfo.version,
            $app_version: cachedUserProperties.appVersion,
            $device: 'Desktop',
            ...eventProperties,
        },
    };
}

// ==================== 公开 API ====================

/**
 * 运营统计服务
 *
 * @example
 * ```typescript
 * import { analytics } from '@/services/analytics';
 *
 * // 初始化
 * analytics.init({
 *     projectToken: 'YOUR_MIXPANEL_PROJECT_TOKEN',
 *     endpoint: 'https://your-proxy.workers.dev', // 可选：Cloudflare Worker 代理
 *     enabled: true,
 * });
 *
 * // 追踪事件
 * analytics.track('message_sent', { modelId: 'gpt-4' });
 * ```
 */
export const analytics = {
    /**
     * 初始化统计服务
     *
     * @param userConfig - 配置对象
     */
    init(userConfig: AnalyticsConfig): void {
        config = {
            projectToken: userConfig.projectToken,
            endpoint: userConfig.endpoint || DEFAULT_ENDPOINT,
            enabled: userConfig.enabled ?? true,
            debug: userConfig.debug ?? false,
        };

        initialized = true;

        logDebug('统计服务初始化完成:', {
            endpoint: config.endpoint,
            enabled: config.enabled,
            debug: config.debug,
        });

        // 自动设置首次启动时间
        cachedUserProperties.firstLaunchAt = getFirstLaunchTime();
    },

    /**
     * 识别用户并设置用户属性
     *
     * @param userProperties - 用户属性
     */
    identify(userProperties?: UserProperties): void {
        if (!initialized) {
            logDebug('统计服务未初始化，跳过 identify');
            return;
        }

        // 合并用户属性
        if (userProperties) {
            cachedUserProperties = {
                ...cachedUserProperties,
                ...userProperties,
            };
        }

        logDebug('用户识别:', {
            deviceId: getDeviceId(),
            properties: cachedUserProperties,
        });

        // 发送用户属性到 Mixpanel
        sendUserProfile(cachedUserProperties);
    },

    /**
     * 追踪事件
     *
     * @param eventName - 事件名称
     * @param properties - 事件属性（可选）
     */
    track(eventName: string, properties?: Record<string, unknown>): void {
        if (!initialized) {
            logDebug('统计服务未初始化，跳过 track:', eventName);
            return;
        }

        if (!config.enabled) {
            logDebug('统计服务已禁用，跳过 track:', eventName);
            return;
        }

        const event = buildEvent(eventName, properties);
        sendEvents([event]);
    },

    /**
     * 更新用户属性
     *
     * @param properties - 要更新的属性
     */
    setUserProperties(properties: Partial<UserProperties>): void {
        if (!initialized) {
            logDebug('统计服务未初始化，跳过 setUserProperties');
            return;
        }

        cachedUserProperties = {
            ...cachedUserProperties,
            ...properties,
        };

        logDebug('更新用户属性:', properties);

        // 发送用户属性更新
        sendUserProfile(properties);
    },

    /**
     * 获取设备 ID
     *
     * @returns 设备 ID
     */
    getDeviceId(): string {
        return getDeviceId();
    },

    /**
     * 检查服务是否已初始化
     *
     * @returns 是否已初始化
     */
    isInitialized(): boolean {
        return initialized;
    },

    /**
     * 检查服务是否已启用
     *
     * @returns 是否已启用
     */
    isEnabled(): boolean {
        return initialized && config.enabled;
    },

    /**
     * 重置服务（主要用于测试）
     */
    reset(): void {
        config = {
            projectToken: '',
            endpoint: DEFAULT_ENDPOINT,
            enabled: false,
            debug: false,
        };
        deviceId = null;
        cachedUserProperties = {};
        initialized = false;
        logDebug('统计服务已重置');
    },
};

// ==================== 预定义事件追踪函数 ====================

/**
 * 预定义的事件追踪函数
 * 提供类型安全的事件追踪方法
 */
export const trackEvents = {
    // ========== 应用生命周期 ==========

    /**
     * 应用启动
     */
    appLaunched(properties: { version: string; os: string; language: string }): void {
        analytics.track('app_launched', properties);
    },

    /**
     * 应用关闭
     */
    appClosed(properties: { sessionDuration: number }): void {
        analytics.track('app_closed', properties);
    },

    /**
     * 应用更新
     */
    appUpdated(properties: { fromVersion: string; toVersion: string }): void {
        analytics.track('app_updated', properties);
    },

    // ========== 对话相关 ==========

    /**
     * 创建对话
     */
    chatCreated(properties: { modelId: string }): void {
        analytics.track('chat_created', properties);
    },

    /**
     * 删除对话
     */
    chatDeleted(properties: { messageCount: number }): void {
        analytics.track('chat_deleted', properties);
    },

    /**
     * 发送消息
     */
    messageSent(properties: {
        modelId: string;
        messageLength: number;
        hasAttachment: boolean;
    }): void {
        analytics.track('message_sent', properties);
    },

    /**
     * 收到回复
     */
    messageReceived(properties: {
        modelId: string;
        tokens?: number;
        responseTime?: number;
    }): void {
        analytics.track('message_received', properties);
    },

    // ========== 模型相关 ==========

    /**
     * 添加模型
     */
    modelAdded(properties: { providerId: string; modelName: string }): void {
        analytics.track('model_added', properties);
    },

    /**
     * 删除模型
     */
    modelDeleted(properties: { providerId: string; modelName: string }): void {
        analytics.track('model_deleted', properties);
    },

    /**
     * 切换模型
     */
    modelSwitched(properties: { fromModel: string; toModel: string }): void {
        analytics.track('model_switched', properties);
    },

    // ========== Agent 相关 ==========

    /**
     * 创建 Agent
     */
    agentCreated(properties: { agentName: string }): void {
        analytics.track('agent_created', properties);
    },

    /**
     * 删除 Agent
     */
    agentDeleted(properties: { agentName: string }): void {
        analytics.track('agent_deleted', properties);
    },

    /**
     * 使用 Agent
     */
    agentUsed(properties: { agentId: string; agentName: string }): void {
        analytics.track('agent_used', properties);
    },

    // ========== Skill 相关 ==========

    /**
     * 创建技能
     */
    skillCreated(properties: { skillName: string; isBuiltIn: boolean }): void {
        analytics.track('skill_created', properties);
    },

    /**
     * 删除技能
     */
    skillDeleted(properties: { skillName: string }): void {
        analytics.track('skill_deleted', properties);
    },

    /**
     * 使用技能
     */
    skillUsed(properties: { skillId: string; skillName: string }): void {
        analytics.track('skill_used', properties);
    },

    /**
     * 安装技能
     */
    skillInstalled(properties: { skillName: string; source: string }): void {
        analytics.track('skill_installed', properties);
    },

    // ========== MCP 相关 ==========

    /**
     * 添加 MCP 服务器
     */
    mcpServerAdded(properties: { serverName: string; transportType: string }): void {
        analytics.track('mcp_server_added', properties);
    },

    /**
     * 删除 MCP 服务器
     */
    mcpServerDeleted(properties: { serverName: string }): void {
        analytics.track('mcp_server_deleted', properties);
    },

    /**
     * 连接 MCP 服务器
     */
    mcpServerConnected(properties: { serverName: string; toolCount: number }): void {
        analytics.track('mcp_server_connected', properties);
    },

    /**
     * 使用 MCP 工具
     */
    mcpToolUsed(properties: { serverName: string; toolName: string }): void {
        analytics.track('mcp_tool_used', properties);
    },

    // ========== Provider 相关 ==========

    /**
     * 连接提供商
     */
    providerConnected(properties: { providerId: string; authType: string }): void {
        analytics.track('provider_connected', properties);
    },

    /**
     * 断开提供商
     */
    providerDisconnected(properties: { providerId: string }): void {
        analytics.track('provider_disconnected', properties);
    },

    // ========== 设置相关 ==========

    /**
     * 修改设置
     */
    settingsChanged(properties: { settingKey: string; newValue: string }): void {
        analytics.track('settings_changed', properties);
    },

    /**
     * 切换主题
     */
    themeChanged(properties: { theme: string }): void {
        analytics.track('theme_changed', properties);
    },

    /**
     * 切换语言
     */
    languageChanged(properties: { language: string }): void {
        analytics.track('language_changed', properties);
    },

    // ========== 圆桌会议 ==========

    /**
     * 创建圆桌会议
     */
    roundtableCreated(properties: { participantCount: number; topic: string }): void {
        analytics.track('roundtable_created', properties);
    },

    /**
     * 完成圆桌会议
     */
    roundtableCompleted(properties: {
        roundCount: number;
        messageCount: number;
        duration: number;
    }): void {
        analytics.track('roundtable_completed', properties);
    },
};

export default analytics;
