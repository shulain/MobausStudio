/**
 * useKiroModels Hook (v0.8.0)
 *
 * 获取和缓存 Kiro 可用模型列表及配额信息
 *
 * @description
 * - 调用 kiro_list_models 和 kiro_get_quota Tauri 命令获取模型列表和配额
 * - 自动缓存结果，避免频繁请求
 * - 提供配额状态格式化工具函数
 * - 支持手动刷新
 *
 * @module hooks/useKiroModels
 * @version 0.8.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    fetchKiroAvailableModels,
    fetchKiroQuota,
    formatKiroQuotaInfo,
    isKiroQuotaAvailable,
    type AvailableKiroModel,
    type KiroQuotaInfo,
} from '../services/kiro-models';
import type { ProviderModelInfo } from '../types';
import { logger, LogTags } from '../utils/logger';

/** 缓存有效期（毫秒）- 5 分钟 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Hook 配置选项 */
export interface UseKiroModelsOptions {
    /** OAuth Access Token */
    accessToken?: string;
    /** 用户配置文件 ARN */
    profileArn?: string;
    /** 认证方式 ("idc" | "aws")，用于选择正确的 User-Agent (v0.9.0) */
    authMethod?: string;
    /** v4.1.31: IDC 用户的 SSO 区域，用于确定 API 端点 */
    ssoRegion?: string;
    /** 是否自动获取（默认 true） */
    autoFetch?: boolean;
}

/** Hook 返回值 */
export interface UseKiroModelsReturn {
    /** 可用模型列表（已转换为 ProviderModelInfo 格式） */
    models: ProviderModelInfo[];
    /** 原始模型数据 */
    rawModels: AvailableKiroModel[];
    /** 配额信息 */
    quota: KiroQuotaInfo | null;
    /** 是否正在加载 */
    loading: boolean;
    /** 错误信息 */
    error: string | null;
    /** 手动刷新模型列表和配额 */
    refresh: () => Promise<void>;
    /** 格式化配额信息 */
    formatQuota: () => string;
    /** 检查配额是否可用 */
    isQuotaAvailable: () => boolean;
    /** 上次更新时间 */
    lastUpdated: Date | null;
}

/** 缓存数据结构 */
interface CacheData {
    models: AvailableKiroModel[];
    quota: KiroQuotaInfo | null;
    timestamp: number;
    accessToken: string;
    profileArn: string;
}

/** 全局缓存（避免重复请求） */
let globalCache: CacheData | null = null;

/**
 * 检查缓存是否有效
 *
 * @param cache - 缓存数据
 * @param accessToken - 当前 Access Token
 * @param profileArn - 当前 Profile ARN
 * @returns 缓存是否有效
 */
function isCacheValid(
    cache: CacheData | null,
    accessToken: string,
    profileArn: string
): boolean {
    if (!cache) return false;

    // 检查 Token 是否匹配
    if (cache.accessToken !== accessToken) return false;

    // 检查 Profile ARN 是否匹配
    if (cache.profileArn !== profileArn) return false;

    // 检查是否过期
    const now = Date.now();
    if (now - cache.timestamp > CACHE_TTL_MS) return false;

    return true;
}

/**
 * 将 AvailableKiroModel 转换为 ProviderModelInfo 格式
 *
 * @param model - 原始模型数据
 * @param quota - 配额信息
 * @returns ProviderModelInfo 格式
 */
function toProviderModelInfo(model: AvailableKiroModel, quota: KiroQuotaInfo | null): ProviderModelInfo {
    // 计算剩余配额比例（Kiro 是全局配额，所有模型共享）
    const remainingFraction = quota && quota.total_limit > 0
        ? quota.remaining_quota / quota.total_limit
        : 1; // 默认 100%

    return {
        id: model.id,
        name: model.displayName || model.id,
        maxTokens: model.maxInputTokens || 200000,
        quota: quota ? {
            remainingFraction,
            isExhausted: quota.is_exhausted,
        } : undefined,
    };
}

/**
 * Kiro 模型列表 Hook
 *
 * @example
 * ```tsx
 * const { models, quota, loading, error, refresh, formatQuota, isQuotaAvailable } = useKiroModels({
 *     accessToken: credential.accessToken,
 *     profileArn: credential.profileArn,
 * });
 *
 * // 在模型选择器中使用
 * {models.map(model => (
 *     <option
 *         key={model.id}
 *         value={model.id}
 *         disabled={!isQuotaAvailable()}
 *     >
 *         {model.name}
 *     </option>
 * ))}
 *
 * // 显示配额
 * <span>{formatQuota()}</span>
 * ```
 */
export function useKiroModels(options: UseKiroModelsOptions): UseKiroModelsReturn {
    const { accessToken, profileArn, authMethod, ssoRegion, autoFetch = true } = options;

    const [rawModels, setRawModels] = useState<AvailableKiroModel[]>([]);
    const [quota, setQuota] = useState<KiroQuotaInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // 防止重复请求
    const fetchingRef = useRef(false);

    /**
     * 获取模型列表和配额
     */
    const fetchData = useCallback(async () => {
        // v0.8.0: 只需要 accessToken，profileArn 是可选的（AWS Builder ID 用户没有）
        if (!accessToken) {
            logger.debug(LogTags.APP, 'useKiroModels: 无 Access Token，跳过获取');
            return;
        }

        // 检查缓存（使用空字符串作为默认 profileArn）
        const cacheProfileArn = profileArn || '';
        if (isCacheValid(globalCache, accessToken, cacheProfileArn)) {
            logger.debug(LogTags.APP, 'useKiroModels: 使用缓存数据');
            setRawModels(globalCache!.models);
            setQuota(globalCache!.quota);
            setLastUpdated(new Date(globalCache!.timestamp));
            return;
        }

        // 防止重复请求
        if (fetchingRef.current) {
            logger.debug(LogTags.APP, 'useKiroModels: 正在获取中，跳过');
            return;
        }

        fetchingRef.current = true;
        setLoading(true);
        setError(null);

        try {
            logger.info(LogTags.APP, '开始获取 Kiro 可用模型列表和配额');

            // 并行获取模型列表和配额
            // v0.9.0: 传递 authMethod 用于选择正确的 User-Agent
            // v4.1.31: 传递 ssoRegion 用于 IDC 用户确定 API 端点区域
            const [models, quotaInfo] = await Promise.all([
                fetchKiroAvailableModels(accessToken, profileArn, authMethod, ssoRegion),
                fetchKiroQuota(accessToken, profileArn, authMethod, ssoRegion),
            ]);

            // 更新缓存（使用空字符串作为默认 profileArn）
            globalCache = {
                models,
                quota: quotaInfo,
                timestamp: Date.now(),
                accessToken,
                profileArn: profileArn || '',
            };

            setRawModels(models);
            setQuota(quotaInfo);
            setLastUpdated(new Date());

            logger.info(LogTags.APP, `获取到 ${models.length} 个 Kiro 模型`);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.error(LogTags.APP, '获取 Kiro 模型列表失败', err);
            setError(errorMessage);
        } finally {
            setLoading(false);
            fetchingRef.current = false;
        }
    }, [accessToken, profileArn, authMethod, ssoRegion]);

    /**
     * 手动刷新（强制清除缓存）
     */
    const refresh = useCallback(async () => {
        // 清除缓存
        globalCache = null;
        await fetchData();
    }, [fetchData]);

    /**
     * 格式化配额信息
     */
    const formatQuota = useCallback((): string => {
        return formatKiroQuotaInfo(quota);
    }, [quota]);

    /**
     * 检查配额是否可用
     */
    const isQuotaAvailableFn = useCallback((): boolean => {
        return isKiroQuotaAvailable(quota);
    }, [quota]);

    // 自动获取
    // v0.8.0: 只需要 accessToken，profileArn 是可选的（AWS Builder ID/IDC 用户没有）
    useEffect(() => {
        if (autoFetch && accessToken) {
            fetchData();
        }
    }, [autoFetch, accessToken, profileArn, fetchData]);

    // v0.9.0: 当 accessToken 为空时（断开连接），清空模型列表和配额
    useEffect(() => {
        if (!accessToken) {
            setRawModels([]);
            setQuota(null);
            setLastUpdated(null);
            setError(null);
        }
    }, [accessToken]);

    // 转换为 ProviderModelInfo 格式
    const models = rawModels.map(m => toProviderModelInfo(m, quota));

    return {
        models,
        rawModels,
        quota,
        loading,
        error,
        refresh,
        formatQuota,
        isQuotaAvailable: isQuotaAvailableFn,
        lastUpdated,
    };
}

/**
 * 清除全局缓存
 * 用于登出或切换账号时调用
 */
export function clearKiroModelsCache(): void {
    globalCache = null;
    logger.debug(LogTags.APP, 'Kiro 模型缓存已清除');
}

export default useKiroModels;
