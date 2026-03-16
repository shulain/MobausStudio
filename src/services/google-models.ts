/**
 * Google Cloud Code 可用模型服务
 *
 * 调用 Cloud Code API 获取用户可用的模型列表及配额信息
 *
 * v3.6.1: 新增
 *
 * @module services/google-models
 * @version 3.6.1
 */

import { invoke } from '@tauri-apps/api/core';
import { logger, LogTags } from '../utils/logger';

/**
 * 可用模型信息
 */
export interface AvailableModel {
    /** 模型 ID */
    id: string;
    /** 显示名称 */
    displayName?: string;
    /** 剩余配额比例 (0.0 - 1.0) */
    remainingFraction?: number;
    /** 配额重置时间 (ISO 8601) */
    resetTime?: string;
    /** 配额是否已耗尽 */
    isExhausted: boolean;
}

/**
 * fetchAvailableModels 响应
 */
interface FetchAvailableModelsResponse {
    success: boolean;
    models: Array<{
        id: string;
        display_name?: string;
        remaining_fraction?: number;
        reset_time?: string;
        is_exhausted: boolean;
    }>;
    error?: string;
}

/**
 * 获取 Google Cloud Code 可用模型列表
 *
 * @param accessToken - OAuth Access Token
 * @param projectId - GCP 项目 ID（可选）
 * @returns 可用模型列表
 */
export async function fetchGoogleAvailableModels(
    accessToken: string,
    projectId?: string
): Promise<AvailableModel[]> {
    logger.info(LogTags.APP, '获取 Google 可用模型列表');

    try {
        const response = await invoke<FetchAvailableModelsResponse>('google_fetch_available_models', {
            accessToken,
            projectId,
        });

        if (!response.success) {
            logger.warn(LogTags.APP, '获取可用模型失败', { error: response.error });
            return [];
        }

        // 转换为前端格式
        const models: AvailableModel[] = response.models.map(m => ({
            id: m.id,
            displayName: m.display_name,
            remainingFraction: m.remaining_fraction,
            resetTime: m.reset_time,
            isExhausted: m.is_exhausted,
        }));

        logger.info(LogTags.APP, `获取到 ${models.length} 个可用模型`);

        // 按剩余配额排序（配额多的在前）
        models.sort((a, b) => {
            const aFrac = a.remainingFraction ?? 1;
            const bFrac = b.remainingFraction ?? 1;
            return bFrac - aFrac;
        });

        return models;
    } catch (error) {
        logger.error(LogTags.APP, '获取可用模型异常', error);
        return [];
    }
}

/**
 * 格式化配额信息
 *
 * @param model - 模型信息
 * @returns 格式化的配额字符串
 */
export function formatQuotaInfo(model: AvailableModel): string {
    if (model.isExhausted) {
        return '配额已耗尽';
    }

    if (model.remainingFraction !== undefined) {
        const percent = Math.round(model.remainingFraction * 100);
        return `剩余 ${percent}%`;
    }

    return '';
}

/**
 * 检查模型是否可用
 *
 * @param model - 模型信息
 * @returns 是否可用
 */
export function isModelAvailable(model: AvailableModel): boolean {
    return !model.isExhausted && (model.remainingFraction === undefined || model.remainingFraction > 0);
}
