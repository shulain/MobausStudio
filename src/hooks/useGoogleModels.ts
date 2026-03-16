/**
 * useGoogleModels Hook (v3.6.2)
 *
 * 获取和缓存 Google Cloud Code 可用模型列表及配额信息
 *
 * @description
 * - 调用 google_fetch_available_models Tauri 命令获取模型列表
 * - 自动缓存结果，避免频繁请求
 * - 提供配额状态格式化工具函数
 * - 支持手动刷新
 * - v3.6.2: 修复竞态条件，快速切换账号/项目时丢弃过期请求结果
 *
 * @module hooks/useGoogleModels
 * @version 3.6.2
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { logger, LogTags } from '../utils/logger';
import {
    fetchGoogleAvailableModels,
    formatQuotaInfo,
    isModelAvailable,
    type AvailableModel,
} from '../services/google-models';
import type { ProviderModelInfo } from '../types';

/** 缓存有效期（毫秒）- 5 分钟 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Hook 配置选项 */
export interface UseGoogleModelsOptions {
    /** OAuth Access Token */
    accessToken?: string;
    /** GCP 项目 ID（可选） */
    projectId?: string;
    /** 是否自动获取（默认 true） */
    autoFetch?: boolean;
}

/** Hook 返回值 */
export interface UseGoogleModelsReturn {
    /** 可用模型列表（已转换为 ProviderModelInfo 格式） */
    models: ProviderModelInfo[];
    /** 原始模型数据（包含完整配额信息） */
    rawModels: AvailableModel[];
    /** 是否正在加载 */
    loading: boolean;
    /** 错误信息 */
    error: string | null;
    /** 手动刷新模型列表 */
    refresh: () => Promise<void>;
    /** 格式化配额信息 */
    formatQuota: (modelId: string) => string;
    /** 检查模型是否可用（配额未耗尽） */
    isAvailable: (modelId: string) => boolean;
    /** 上次更新时间 */
    lastUpdated: Date | null;
}

/** 缓存数据结构 */
interface CacheData {
    models: AvailableModel[];
    timestamp: number;
    accessToken: string;
    projectId?: string;
}

/** 全局缓存（避免重复请求） */
let globalCache: CacheData | null = null;

/**
 * 检查缓存是否有效
 *
 * @param cache - 缓存数据
 * @param accessToken - 当前 Access Token
 * @param projectId - 当前项目 ID
 * @returns 缓存是否有效
 */
function isCacheValid(
    cache: CacheData | null,
    accessToken: string,
    projectId?: string
): boolean {
    if (!cache) return false;

    // 检查 Token 是否匹配
    if (cache.accessToken !== accessToken) return false;

    // 检查项目 ID 是否匹配
    if (cache.projectId !== projectId) return false;

    // 检查是否过期
    const now = Date.now();
    if (now - cache.timestamp > CACHE_TTL_MS) return false;

    return true;
}

/**
 * 将 AvailableModel 转换为 ProviderModelInfo 格式
 *
 * @param model - 原始模型数据
 * @returns ProviderModelInfo 格式
 */
function toProviderModelInfo(model: AvailableModel): ProviderModelInfo {
    return {
        id: model.id,
        name: model.displayName || model.id,
        // Google Cloud Code 模型默认 maxTokens
        maxTokens: 65536,
        quota: model.remainingFraction !== undefined ? {
            remainingFraction: model.remainingFraction,
            resetTime: model.resetTime,
            isExhausted: model.isExhausted,
        } : undefined,
    };
}

/**
 * Google 模型列表 Hook
 *
 * @example
 * ```tsx
 * const { models, loading, error, refresh, formatQuota, isAvailable } = useGoogleModels({
 *     accessToken: credential.accessToken,
 *     projectId: credential.projectId,
 * });
 *
 * // 在模型选择器中使用
 * {models.map(model => (
 *     <option
 *         key={model.id}
 *         value={model.id}
 *         disabled={!isAvailable(model.id)}
 *     >
 *         {model.name} {formatQuota(model.id)}
 *     </option>
 * ))}
 * ```
 */
export function useGoogleModels(options: UseGoogleModelsOptions): UseGoogleModelsReturn {
    const { accessToken, projectId, autoFetch = true } = options;

    const [rawModels, setRawModels] = useState<AvailableModel[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // v3.6.2: 请求版本号，用于检测竞态条件（快速切换账号/项目时丢弃过期结果）
    const requestIdRef = useRef(0);

    /**
     * 获取模型列表
     */
    const fetchModels = useCallback(async () => {
        if (!accessToken) {
            logger.debug(LogTags.APP, 'useGoogleModels: 无 Access Token，跳过获取');
            return;
        }

        // 检查缓存
        if (isCacheValid(globalCache, accessToken, projectId)) {
            logger.debug(LogTags.APP, 'useGoogleModels: 使用缓存数据');
            setRawModels(globalCache!.models);
            setLastUpdated(new Date(globalCache!.timestamp));
            return;
        }

        // v3.6.2: 递增请求版本号，使旧请求的回调自动失效
        const currentRequestId = ++requestIdRef.current;
        setLoading(true);
        setError(null);

        try {
            logger.info(LogTags.APP, '开始获取 Google 可用模型列表');

            const models = await fetchGoogleAvailableModels(accessToken, projectId);

            // v3.6.2: 检查请求是否已过期（切换了账号/项目）
            if (currentRequestId !== requestIdRef.current) {
                logger.debug(LogTags.APP, 'useGoogleModels: 请求已过期，丢弃结果', {
                    requestId: currentRequestId,
                    currentId: requestIdRef.current,
                });
                return;
            }

            // 更新缓存
            globalCache = {
                models,
                timestamp: Date.now(),
                accessToken,
                projectId,
            };

            setRawModels(models);
            setLastUpdated(new Date());

            logger.info(LogTags.APP, `获取到 ${models.length} 个 Google 模型`);
        } catch (err) {
            // v3.6.2: 过期请求的错误也丢弃
            if (currentRequestId !== requestIdRef.current) return;

            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.error(LogTags.APP, '获取 Google 模型列表失败', err);
            setError(errorMessage);
        } finally {
            // v3.6.2: 只有当前请求才更新 loading 状态
            if (currentRequestId === requestIdRef.current) {
                setLoading(false);
            }
        }
    }, [accessToken, projectId]);

    /**
     * 手动刷新（强制清除缓存）
     */
    const refresh = useCallback(async () => {
        // 清除缓存
        globalCache = null;
        await fetchModels();
    }, [fetchModels]);

    /**
     * 格式化指定模型的配额信息
     */
    const formatQuota = useCallback((modelId: string): string => {
        const model = rawModels.find(m => m.id === modelId);
        if (!model) return '';
        return formatQuotaInfo(model);
    }, [rawModels]);

    /**
     * 检查指定模型是否可用
     */
    const isAvailable = useCallback((modelId: string): boolean => {
        const model = rawModels.find(m => m.id === modelId);
        if (!model) return true; // 未知模型默认可用
        return isModelAvailable(model);
    }, [rawModels]);

    // 自动获取
    useEffect(() => {
        if (autoFetch && accessToken) {
            fetchModels();
        }
    }, [autoFetch, accessToken, fetchModels]);

    // v0.9.0: 当 accessToken 为空时（断开连接），清空模型列表
    // v3.6.5: 同时递增 requestIdRef，使进行中的旧请求返回后自动失效，
    // 避免断开连接后旧请求回写模型数据到已清空的界面
    useEffect(() => {
        if (!accessToken) {
            requestIdRef.current++;
            setRawModels([]);
            setLoading(false);
            setLastUpdated(null);
            setError(null);
        }
    }, [accessToken]);

    // 转换为 ProviderModelInfo 格式
    const models = rawModels.map(toProviderModelInfo);

    return {
        models,
        rawModels,
        loading,
        error,
        refresh,
        formatQuota,
        isAvailable,
        lastUpdated,
    };
}

/**
 * 清除全局缓存
 * 用于登出或切换账号时调用
 */
export function clearGoogleModelsCache(): void {
    globalCache = null;
    logger.debug(LogTags.APP, 'Google 模型缓存已清除');
}

export default useGoogleModels;
