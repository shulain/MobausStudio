/**
 * @file useKiroModels.test.ts
 * @description useKiroModels Hook 单元测试
 *
 * 测试用例对应文档: docs/modules/providers.md
 * - TC-KIRO-001: Kiro模型配额获取
 * - TC-KIRO-002: Kiro模型配额显示
 * - TC-KIRO-003: Kiro配额耗尽提示
 * - TC-KIRO-004: Kiro配额重置时间
 * - TC-KIRO-005: Kiro模型加载状态
 * - TC-KIRO-006: Kiro模型加载失败
 * - TC-KIRO-007: 无 Access Token 时不发起请求
 * - TC-KIRO-008: 手动刷新功能
 * - TC-KIRO-009: 缓存机制
 * - TC-KIRO-010: 无 profileArn 时仍可获取（Builder ID 用户）
 *
 * @version 0.8.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useKiroModels, clearKiroModelsCache } from '../../hooks/useKiroModels';

// 模拟 kiro-models 服务
vi.mock('../../services/kiro-models', () => ({
    fetchKiroAvailableModels: vi.fn(),
    fetchKiroQuota: vi.fn(),
    formatKiroQuotaInfo: vi.fn((quota) => {
        if (!quota) return '';
        if (quota.is_exhausted) return '配额已耗尽';
        const percent = quota.total_limit > 0
            ? Math.round((quota.remaining_quota / quota.total_limit) * 100)
            : 0;
        return `剩余 ${percent}% (${Math.round(quota.remaining_quota)}/${Math.round(quota.total_limit)})`;
    }),
    isKiroQuotaAvailable: vi.fn((quota) => {
        if (!quota) return true;
        return !quota.is_exhausted && quota.remaining_quota > 0;
    }),
}));

// 模拟 logger
vi.mock('../../utils/logger', () => ({
    logger: {
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
    LogTags: {
        APP: 'APP',
    },
}));

// 获取模拟函数
import { fetchKiroAvailableModels, fetchKiroQuota } from '../../services/kiro-models';
const mockFetchKiroAvailableModels = fetchKiroAvailableModels as ReturnType<typeof vi.fn>;
const mockFetchKiroQuota = fetchKiroQuota as ReturnType<typeof vi.fn>;

describe('useKiroModels Hook 测试', () => {
    // 每个测试前清除缓存和模拟
    beforeEach(() => {
        vi.clearAllMocks();
        clearKiroModelsCache();
        console.log('\n[测试] 开始执行 useKiroModels 测试用例...');
    });

    afterEach(() => {
        clearKiroModelsCache();
    });

    /**
     * TC-KIRO-001: Kiro模型配额获取
     * 测试场景: Kiro提供商已连接时，调用API获取可用模型列表和配额
     */
    it('TC-KIRO-001: 应正确获取 Kiro 可用模型列表和配额', async () => {
        console.log('[步骤 1] 设置模拟返回数据');
        const mockModels = [
            { id: 'claude-sonnet-4', displayName: 'Claude Sonnet 4', isExhausted: false, maxInputTokens: 200000 },
            { id: 'claude-3.5-sonnet', displayName: 'Claude 3.5 Sonnet', isExhausted: false, maxInputTokens: 200000 },
        ];
        const mockQuota = {
            total_limit: 500,
            current_usage: 100,
            remaining_quota: 400,
            is_exhausted: false,
            subscription_title: 'Pro',
        };
        mockFetchKiroAvailableModels.mockResolvedValue(mockModels);
        mockFetchKiroQuota.mockResolvedValue(mockQuota);

        console.log('[步骤 2] 渲染 Hook');
        const { result } = renderHook(() => useKiroModels({
            accessToken: 'test-token',
            profileArn: 'test-profile-arn',
        }));

        console.log('[步骤 3] 等待加载完成');
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        console.log('[步骤 4] 验证模型列表');
        expect(result.current.models).toHaveLength(2);
        expect(result.current.models[0].id).toBe('claude-sonnet-4');
        expect(result.current.models[1].id).toBe('claude-3.5-sonnet');
        expect(mockFetchKiroAvailableModels).toHaveBeenCalledWith('test-token', 'test-profile-arn', undefined, undefined);

        console.log('[步骤 5] 验证配额信息');
        expect(result.current.quota).not.toBeNull();
        expect(result.current.quota?.remaining_quota).toBe(400);
        expect(result.current.quota?.total_limit).toBe(500);
    });

    /**
     * TC-KIRO-002: Kiro模型配额显示
     * 测试场景: 格式化配额信息显示
     */
    it('TC-KIRO-002: 应正确格式化配额信息', async () => {
        console.log('[步骤 1] 设置模拟返回数据');
        const mockModels = [
            { id: 'claude-sonnet-4', displayName: 'Claude Sonnet 4', isExhausted: false },
        ];
        const mockQuota = {
            total_limit: 500,
            current_usage: 125,
            remaining_quota: 375,
            is_exhausted: false,
        };
        mockFetchKiroAvailableModels.mockResolvedValue(mockModels);
        mockFetchKiroQuota.mockResolvedValue(mockQuota);

        console.log('[步骤 2] 渲染 Hook');
        const { result } = renderHook(() => useKiroModels({
            accessToken: 'test-token',
        }));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        console.log('[步骤 3] 验证配额格式化');
        const quotaText = result.current.formatQuota();
        expect(quotaText).toBe('剩余 75% (375/500)');
    });

    /**
     * TC-KIRO-003: Kiro配额耗尽提示
     * 测试场景: 配额为0时显示警告标识
     */
    it('TC-KIRO-003: 配额耗尽时应标记为不可用', async () => {
        console.log('[步骤 1] 设置配额耗尽的数据');
        const mockModels = [
            { id: 'claude-sonnet-4', displayName: 'Claude Sonnet 4', isExhausted: true },
        ];
        const mockQuota = {
            total_limit: 500,
            current_usage: 500,
            remaining_quota: 0,
            is_exhausted: true,
        };
        mockFetchKiroAvailableModels.mockResolvedValue(mockModels);
        mockFetchKiroQuota.mockResolvedValue(mockQuota);

        console.log('[步骤 2] 渲染 Hook');
        const { result } = renderHook(() => useKiroModels({
            accessToken: 'test-token',
        }));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        console.log('[步骤 3] 验证配额耗尽状态');
        expect(result.current.isQuotaAvailable()).toBe(false);

        console.log('[步骤 4] 验证配额耗尽提示文本');
        expect(result.current.formatQuota()).toBe('配额已耗尽');
    });

    /**
     * TC-KIRO-004: Kiro配额重置时间
     * 测试场景: 显示配额重置的预计时间
     */
    it('TC-KIRO-004: 应包含配额重置时间信息', async () => {
        console.log('[步骤 1] 设置包含重置时间的数据');
        const nextReset = Date.now() + 3600000; // 1小时后
        const mockModels = [
            { id: 'claude-sonnet-4', displayName: 'Claude Sonnet 4', isExhausted: false },
        ];
        const mockQuota = {
            total_limit: 500,
            current_usage: 350,
            remaining_quota: 150,
            is_exhausted: false,
            next_reset: nextReset,
        };
        mockFetchKiroAvailableModels.mockResolvedValue(mockModels);
        mockFetchKiroQuota.mockResolvedValue(mockQuota);

        console.log('[步骤 2] 渲染 Hook');
        const { result } = renderHook(() => useKiroModels({
            accessToken: 'test-token',
        }));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        console.log('[步骤 3] 验证配额包含重置时间');
        expect(result.current.quota?.next_reset).toBe(nextReset);
    });

    /**
     * TC-KIRO-005: Kiro模型加载状态
     * 测试场景: 正在获取模型列表时显示加载指示器
     */
    it('TC-KIRO-005: 加载过程中应显示 loading 状态', async () => {
        console.log('[步骤 1] 设置延迟返回的模拟');
        let resolveModels: (value: any) => void;
        let resolveQuota: (value: any) => void;
        const delayedModelsPromise = new Promise((resolve) => {
            resolveModels = resolve;
        });
        const delayedQuotaPromise = new Promise((resolve) => {
            resolveQuota = resolve;
        });
        mockFetchKiroAvailableModels.mockReturnValue(delayedModelsPromise);
        mockFetchKiroQuota.mockReturnValue(delayedQuotaPromise);

        console.log('[步骤 2] 渲染 Hook');
        const { result } = renderHook(() => useKiroModels({
            accessToken: 'test-token',
        }));

        console.log('[步骤 3] 验证初始 loading 状态');
        expect(result.current.loading).toBe(true);
        expect(result.current.models).toHaveLength(0);

        console.log('[步骤 4] 解析 Promise');
        await act(async () => {
            resolveModels!([{ id: 'claude-sonnet-4', displayName: 'Claude Sonnet 4', isExhausted: false }]);
            resolveQuota!({ total_limit: 500, current_usage: 100, remaining_quota: 400, is_exhausted: false });
        });

        console.log('[步骤 5] 验证加载完成');
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.models).toHaveLength(1);
        });
    });

    /**
     * TC-KIRO-006: Kiro模型加载失败
     * 测试场景: API返回错误时显示错误提示
     */
    it('TC-KIRO-006: 加载失败时应设置错误状态', async () => {
        console.log('[步骤 1] 设置模拟返回错误');
        mockFetchKiroAvailableModels.mockRejectedValue(new Error('Network error'));
        mockFetchKiroQuota.mockRejectedValue(new Error('Network error'));

        console.log('[步骤 2] 渲染 Hook');
        const { result } = renderHook(() => useKiroModels({
            accessToken: 'test-token',
        }));

        console.log('[步骤 3] 等待加载完成');
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        console.log('[步骤 4] 验证错误状态');
        expect(result.current.error).toBe('Network error');
        expect(result.current.models).toHaveLength(0);
    });

    /**
     * TC-KIRO-007: 无 Access Token 时不发起请求
     * 测试场景: 未提供 Token 时不调用 API
     */
    it('TC-KIRO-007: 无 Access Token 时不应发起请求', async () => {
        console.log('[步骤 1] 渲染 Hook（无 Token）');
        const { result } = renderHook(() => useKiroModels({
            accessToken: undefined,
        }));

        console.log('[步骤 2] 验证未发起请求');
        expect(mockFetchKiroAvailableModels).not.toHaveBeenCalled();
        expect(mockFetchKiroQuota).not.toHaveBeenCalled();
        expect(result.current.loading).toBe(false);
        expect(result.current.models).toHaveLength(0);
    });

    /**
     * TC-KIRO-008: 手动刷新功能
     * 测试场景: 调用 refresh 强制重新获取
     */
    it('TC-KIRO-008: refresh 应强制重新获取模型列表和配额', async () => {
        console.log('[步骤 1] 设置模拟返回数据');
        mockFetchKiroAvailableModels.mockResolvedValue([
            { id: 'claude-sonnet-4', displayName: 'Claude Sonnet 4', isExhausted: false },
        ]);
        mockFetchKiroQuota.mockResolvedValue({
            total_limit: 500,
            current_usage: 100,
            remaining_quota: 400,
            is_exhausted: false,
        });

        console.log('[步骤 2] 渲染 Hook');
        const { result } = renderHook(() => useKiroModels({
            accessToken: 'test-token',
        }));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        console.log('[步骤 3] 验证首次调用');
        expect(mockFetchKiroAvailableModels).toHaveBeenCalledTimes(1);
        expect(mockFetchKiroQuota).toHaveBeenCalledTimes(1);

        console.log('[步骤 4] 调用 refresh');
        await act(async () => {
            await result.current.refresh();
        });

        console.log('[步骤 5] 验证再次调用');
        expect(mockFetchKiroAvailableModels).toHaveBeenCalledTimes(2);
        expect(mockFetchKiroQuota).toHaveBeenCalledTimes(2);
    });

    /**
     * TC-KIRO-009: 缓存机制
     * 测试场景: 相同 Token 使用缓存
     */
    it('TC-KIRO-009: 相同 Token 应使用缓存，不重复请求', async () => {
        console.log('[步骤 1] 设置模拟返回数据');
        mockFetchKiroAvailableModels.mockResolvedValue([
            { id: 'claude-sonnet-4', displayName: 'Claude Sonnet 4', isExhausted: false },
        ]);
        mockFetchKiroQuota.mockResolvedValue({
            total_limit: 500,
            current_usage: 100,
            remaining_quota: 400,
            is_exhausted: false,
        });

        console.log('[步骤 2] 首次渲染 Hook');
        const { result: result1, unmount } = renderHook(() => useKiroModels({
            accessToken: 'test-token',
            profileArn: 'test-profile',
        }));

        await waitFor(() => {
            expect(result1.current.loading).toBe(false);
        });

        console.log('[步骤 3] 验证首次调用');
        expect(mockFetchKiroAvailableModels).toHaveBeenCalledTimes(1);

        console.log('[步骤 4] 卸载并重新渲染（相同 Token）');
        unmount();
        const { result: result2 } = renderHook(() => useKiroModels({
            accessToken: 'test-token',
            profileArn: 'test-profile',
        }));

        await waitFor(() => {
            expect(result2.current.loading).toBe(false);
        });

        console.log('[步骤 5] 验证使用缓存，未重复请求');
        expect(mockFetchKiroAvailableModels).toHaveBeenCalledTimes(1);
        expect(result2.current.models).toHaveLength(1);
    });

    /**
     * TC-KIRO-010: 无 profileArn 时仍可获取（Builder ID 用户）
     * 测试场景: AWS Builder ID 用户没有 profileArn，但仍应能获取模型列表
     */
    it('TC-KIRO-010: 无 profileArn 时仍应能获取模型列表（Builder ID 用户）', async () => {
        console.log('[步骤 1] 设置模拟返回数据');
        const mockModels = [
            { id: 'claude-sonnet-4', displayName: 'Claude Sonnet 4', isExhausted: false },
        ];
        const mockQuota = {
            total_limit: 50,
            current_usage: 10,
            remaining_quota: 40,
            is_exhausted: false,
            subscription_title: 'Free',
        };
        mockFetchKiroAvailableModels.mockResolvedValue(mockModels);
        mockFetchKiroQuota.mockResolvedValue(mockQuota);

        console.log('[步骤 2] 渲染 Hook（只有 accessToken，无 profileArn）');
        const { result } = renderHook(() => useKiroModels({
            accessToken: 'builder-id-token',
            // 注意：没有 profileArn
        }));

        console.log('[步骤 3] 等待加载完成');
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        console.log('[步骤 4] 验证成功获取模型列表');
        expect(result.current.models).toHaveLength(1);
        expect(result.current.models[0].id).toBe('claude-sonnet-4');

        console.log('[步骤 5] 验证 API 调用参数');
        // v0.9.0: fetchKiroQuota 新增第三个参数 authMethod，无 profileArn 时 authMethod 也为 undefined
        expect(mockFetchKiroAvailableModels).toHaveBeenCalledWith('builder-id-token', undefined, undefined, undefined);
        expect(mockFetchKiroQuota).toHaveBeenCalledWith('builder-id-token', undefined, undefined, undefined);

        console.log('[步骤 6] 验证配额信息');
        expect(result.current.quota?.subscription_title).toBe('Free');
    });

    /**
     * 测试场景: 模型转换为 ProviderModelInfo 格式
     */
    it('应将模型转换为 ProviderModelInfo 格式', async () => {
        console.log('[步骤 1] 设置模拟返回数据');
        const mockModels = [
            { id: 'claude-sonnet-4', displayName: 'Claude Sonnet 4', isExhausted: false, maxInputTokens: 200000 },
        ];
        const mockQuota = {
            total_limit: 500,
            current_usage: 100,
            remaining_quota: 400,
            is_exhausted: false,
        };
        mockFetchKiroAvailableModels.mockResolvedValue(mockModels);
        mockFetchKiroQuota.mockResolvedValue(mockQuota);

        console.log('[步骤 2] 渲染 Hook');
        const { result } = renderHook(() => useKiroModels({
            accessToken: 'test-token',
        }));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        console.log('[步骤 3] 验证模型格式');
        const model = result.current.models[0];
        expect(model.id).toBe('claude-sonnet-4');
        expect(model.name).toBe('Claude Sonnet 4');
        expect(model.maxTokens).toBe(200000);
        // 配额比例应为 400/500 = 0.8
        expect(model.quota?.remainingFraction).toBe(0.8);
        expect(model.quota?.isExhausted).toBe(false);
    });

    /**
     * 测试场景: lastUpdated 时间戳
     */
    it('应记录最后更新时间', async () => {
        console.log('[步骤 1] 设置模拟返回数据');
        mockFetchKiroAvailableModels.mockResolvedValue([]);
        mockFetchKiroQuota.mockResolvedValue(null);

        console.log('[步骤 2] 渲染 Hook');
        const beforeFetch = new Date();
        const { result } = renderHook(() => useKiroModels({
            accessToken: 'test-token',
        }));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        console.log('[步骤 3] 验证 lastUpdated');
        expect(result.current.lastUpdated).not.toBeNull();
        expect(result.current.lastUpdated!.getTime()).toBeGreaterThanOrEqual(beforeFetch.getTime());
    });
});
