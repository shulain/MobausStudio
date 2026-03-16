/**
 * Kiro 可用模型服务
 *
 * 调用 CodeWhisperer API 获取用户可用的模型列表及配额信息
 *
 * v0.8.0: 新增，参考 google-models.ts 实现
 *
 * @module services/kiro-models
 * @version 0.8.0
 */

import { invoke } from '@tauri-apps/api/core';
import { logger, LogTags } from '../utils/logger';

/**
 * Kiro 模型信息（来自 API）
 */
export interface KiroModel {
    /** 模型 ID */
    model_id: string;
    /** 模型名称 */
    model_name: string;
    /** 模型描述 */
    description?: string;
    /** 速率倍数 */
    rate_multiplier?: number;
    /** 速率单位 */
    rate_unit?: string;
    /** 最大输入 token 数 */
    max_input_tokens?: number;
}

/**
 * Kiro 模型列表响应
 */
interface KiroModelsResponse {
    success: boolean;
    models: KiroModel[];
    error?: string;
}

/**
 * Kiro 配额信息
 */
export interface KiroQuotaInfo {
    /** 总配额 */
    total_limit: number;
    /** 当前使用量 */
    current_usage: number;
    /** 剩余配额 */
    remaining_quota: number;
    /** 是否已耗尽 */
    is_exhausted: boolean;
    /** 资源类型 */
    resource_type?: string;
    /** 下次重置时间（毫秒时间戳） */
    next_reset?: number;
    /** 订阅类型 */
    subscription_title?: string;
}

/**
 * Kiro 配额响应
 */
interface KiroQuotaResponse {
    success: boolean;
    quota?: KiroQuotaInfo;
    error?: string;
}

/**
 * 可用模型信息（统一格式，与 Google 兼容）
 */
export interface AvailableKiroModel {
    /** 模型 ID */
    id: string;
    /** 显示名称 */
    displayName?: string;
    /** 模型描述 */
    description?: string;
    /** 剩余配额比例 (0.0 - 1.0)，Kiro 不按模型区分配额，所以这里不使用 */
    remainingFraction?: number;
    /** 配额是否已耗尽 */
    isExhausted: boolean;
    /** 最大输入 token 数 */
    maxInputTokens?: number;
    /** 速率倍数 */
    rateMultiplier?: number;
}

/**
 * 获取 Kiro 可用模型列表
 *
 * @param accessToken - OAuth Access Token
 * @param profileArn - 用户配置文件 ARN（可选，AWS Builder ID 用户没有）
 * @param authMethod - 认证方式 ("idc" | "aws")（v4.1.31）
 * @param ssoRegion - IDC 用户的 SSO 区域（v4.1.31）
 * @returns 可用模型列表
 */
export async function fetchKiroAvailableModels(
    accessToken: string,
    profileArn?: string,
    authMethod?: string,
    ssoRegion?: string,
): Promise<AvailableKiroModel[]> {
    logger.info(LogTags.APP, '获取 Kiro 可用模型列表');

    try {
        const response = await invoke<KiroModelsResponse>('kiro_list_models', {
            accessToken,
            profileArn: profileArn || null,  // v0.8.0: 传递 null 给 Rust 的 Option<String>
            authMethod: authMethod || null,  // v4.1.31: 传递认证方式
            ssoRegion: ssoRegion || null,  // v4.1.31: 传递 SSO 区域
        });

        if (!response.success) {
            logger.warn(LogTags.APP, '获取 Kiro 可用模型失败', { error: response.error });
            return [];
        }

        // 转换为统一格式
        const models: AvailableKiroModel[] = response.models.map(m => ({
            id: m.model_id,
            displayName: m.model_name || m.model_id,
            description: m.description,
            isExhausted: false, // Kiro 配额是全局的，不按模型区分
            maxInputTokens: m.max_input_tokens,
            rateMultiplier: m.rate_multiplier,
        }));

        logger.info(LogTags.APP, `获取到 ${models.length} 个 Kiro 可用模型`);

        return models;
    } catch (error) {
        logger.error(LogTags.APP, '获取 Kiro 可用模型异常', error);
        return [];
    }
}

/**
 * 获取 Kiro 配额信息
 *
 * @param accessToken - OAuth Access Token
 * @param profileArn - 用户配置文件 ARN（可选，AWS Builder ID 用户没有）
 * @param authMethod - 认证方式 ("idc" | "aws")，用于选择正确的 User-Agent (v0.9.0)
 * @param ssoRegion - IDC 用户的 SSO 区域（v4.1.31）
 * @returns 配额信息
 */
export async function fetchKiroQuota(
    accessToken: string,
    profileArn?: string,
    authMethod?: string,
    ssoRegion?: string,
): Promise<KiroQuotaInfo | null> {
    logger.info(LogTags.APP, '获取 Kiro 配额信息', { authMethod });

    try {
        const response = await invoke<KiroQuotaResponse>('kiro_get_quota', {
            accessToken,
            profileArn: profileArn || null,  // v0.8.0: 传递 null 给 Rust 的 Option<String>
            authMethod: authMethod || null,  // v0.9.0: 传递认证方式
            ssoRegion: ssoRegion || null,  // v4.1.31: 传递 SSO 区域
        });

        if (!response.success || !response.quota) {
            logger.warn(LogTags.APP, '获取 Kiro 配额失败', { error: response.error });
            return null;
        }

        logger.info(LogTags.APP, `Kiro 配额: ${response.quota.current_usage}/${response.quota.total_limit}, 剩余: ${response.quota.remaining_quota}`);

        return response.quota;
    } catch (error) {
        logger.error(LogTags.APP, '获取 Kiro 配额异常', error);
        return null;
    }
}

/**
 * 格式化配额信息
 *
 * @param quota - 配额信息
 * @returns 格式化的配额字符串
 */
export function formatKiroQuotaInfo(quota: KiroQuotaInfo | null): string {
    if (!quota) {
        return '';
    }

    if (quota.is_exhausted) {
        return '配额已耗尽';
    }

    const percent = quota.total_limit > 0
        ? Math.round((quota.remaining_quota / quota.total_limit) * 100)
        : 0;

    return `剩余 ${percent}% (${Math.round(quota.remaining_quota)}/${Math.round(quota.total_limit)})`;
}

/**
 * 检查配额是否可用
 *
 * @param quota - 配额信息
 * @returns 是否可用
 */
export function isKiroQuotaAvailable(quota: KiroQuotaInfo | null): boolean {
    if (!quota) return true; // 未知配额默认可用
    return !quota.is_exhausted && quota.remaining_quota > 0;
}
