/**
 * @file useGoogleModels.test.ts
 * @description useGoogleModels Hook 单元测试
 *
 * 测试用例对应文档: docs/modules/models.md
 * - TC-MODEL-025: Google模型配额获取
 * - TC-MODEL-026: Google模型配额显示
 * - TC-MODEL-027: Google配额耗尽提示
 * - TC-MODEL-028: Google配额重置时间
 * - TC-MODEL-029: Google模型加载状态
 * - TC-MODEL-030: Google模型加载失败
 *
 * @version 3.6.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useGoogleModels, clearGoogleModelsCache } from '../../hooks/useGoogleModels';

// 模拟 google-models 服务
vi.mock('../../services/google-models', () => ({
    fetchGoogleAvailableModels: vi.fn(),
    formatQuotaInfo: vi.fn((model) => {
        if (model.isExhausted) return '配额已耗尽';
        if (model.remainingFraction !== undefined) {
            return `剩余 ${Math.round(model.remainingFraction * 100)}%`;
        }
        return '';
    }),
    isModelAvailable: vi.fn((model) => !model.isExhausted && (model.remainingFraction === undefined || model.remainingFraction > 0)),
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
import { fetchGoogleAvailableModels } from '../../services/google-models';
const mockFetchGoogleAvailableModels = fetchGoogleAvailableModels as ReturnType<typeof vi.fn>;

describe('useGoogleModels Hook 测试', () => {
    // 每个测试前清除缓存和模拟
    beforeEach(() => {
        vi.clearAllMocks();
        clearGoogleModelsCache();
        console.log('\n[测试] 开始执行 useGoogleModels 测试用例...');
    });

    afterEach(() => {
        clearGoogleModelsCache();
    });

    /**
     * TC-MODEL-025: Google模型配额获取
     * 测试场景: Google提供商已连接时，调用API获取可用模型列表
     */
    it('TC-MODEL-025: 应正确获取 Google 可用模型列表', async () => {
        console.log('[步骤 1] 设置模拟返回数据');
        const mockModels = [
            { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', remainingFraction: 0.8, isExhausted: false },
            { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', remainingFraction: 0.5, isExhausted: false },
        ];
        mockFetchGoogleAvailableModels.mockResolvedValue(mockModels);

        console.log('[步骤 2] 渲染 Hook');
        const { result } = renderHook(() => useGoogleModels({
            accessToken: 'test-token',
            projectId: 'test-project',
        }));

        console.log('[步骤 3] 等待加载完成');
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        console.log('[步骤 4] 验证模型列表');
        expect(result.current.models).toHaveLength(2);
        expect(result.current.models[0].id).toBe('gemini-2.5-pro');
        expect(result.current.models[1].id).toBe('gemini-2.0-flash');
        expect(mockFetchGoogleAvailableModels).toHaveBeenCalledWith('test-token', 'test-project');
    });

    /**
     * TC-MODEL-026: Google模型配额显示
     * 测试场景: 模型选择器中显示剩余配额百分比
     */
    it('TC-MODEL-026: 应正确格式化配额信息', async () => {
        console.log('[步骤 1] 设置模拟返回数据');
        const mockModels = [
            { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', remainingFraction: 0.75, isExhausted: false },
        ];
        mockFetchGoogleAvailableModels.mockResolvedValue(mockModels);

        console.log('[步骤 2] 渲染 Hook');
        const { result } = renderHook(() => useGoogleModels({
            accessToken: 'test-token',
        }));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        console.log('[步骤 3] 验证配额格式化');
        const quotaText = result.current.formatQuota('gemini-2.5-pro');
        expect(quotaText).toBe('剩余 75%');
    });

    /**
     * TC-MODEL-027: Google配额耗尽提示
     * 测试场景: 配额为0的模型显示警告标识，不可选择
     */
    it('TC-MODEL-027: 配额耗尽的模型应标记为不可用', async () => {
        console.log('[步骤 1] 设置包含配额耗尽模型的数据');
        const mockModels = [
            { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', remainingFraction: 0, isExhausted: true },
            { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', remainingFraction: 0.5, isExhausted: false },
        ];
        mockFetchGoogleAvailableModels.mockResolvedValue(mockModels);

        console.log('[步骤 2] 渲染 Hook');
        const { result } = renderHook(() => useGoogleModels({
            accessToken: 'test-token',
        }));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        console.log('[步骤 3] 验证配额耗尽模型不可用');
        expect(result.current.isAvailable('gemini-2.5-pro')).toBe(false);
        expect(result.current.isAvailable('gemini-2.0-flash')).toBe(true);

        console.log('[步骤 4] 验证配额耗尽提示文本');
        expect(result.current.formatQuota('gemini-2.5-pro')).toBe('配额已耗尽');
    });

    /**
     * TC-MODEL-028: Google配额重置时间
     * 测试场景: 显示配额重置的预计时间
     */
    it('TC-MODEL-028: 应包含配额重置时间信息', async () => {
        console.log('[步骤 1] 设置包含重置时间的数据');
        const resetTime = new Date(Date.now() + 3600000).toISOString(); // 1小时后
        const mockModels = [
            { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', remainingFraction: 0.3, resetTime, isExhausted: false },
        ];
        mockFetchGoogleAvailableModels.mockResolvedValue(mockModels);

        console.log('[步骤 2] 渲染 Hook');
        const { result } = renderHook(() => useGoogleModels({
            accessToken: 'test-token',
        }));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        console.log('[步骤 3] 验证模型包含重置时间');
        expect(result.current.models[0].quota?.resetTime).toBe(resetTime);
    });

    /**
     * TC-MODEL-029: Google模型加载状态
     * 测试场景: 正在获取模型列表时显示加载指示器
     */
    it('TC-MODEL-029: 加载过程中应显示 loading 状态', async () => {
        console.log('[步骤 1] 设置延迟返回的模拟');
        let resolvePromise: (value: any) => void;
        const delayedPromise = new Promise((resolve) => {
            resolvePromise = resolve;
        });
        mockFetchGoogleAvailableModels.mockReturnValue(delayedPromise);

        console.log('[步骤 2] 渲染 Hook');
        const { result } = renderHook(() => useGoogleModels({
            accessToken: 'test-token',
        }));

        console.log('[步骤 3] 验证初始 loading 状态');
        expect(result.current.loading).toBe(true);
        expect(result.current.models).toHaveLength(0);

        console.log('[步骤 4] 解析 Promise');
        await act(async () => {
            resolvePromise!([{ id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', isExhausted: false }]);
        });

        console.log('[步骤 5] 验证加载完成');
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.models).toHaveLength(1);
        });
    });

    /**
     * TC-MODEL-030: Google模型加载失败
     * 测试场景: API返回错误时显示错误提示，回退到静态列表
     */
    it('TC-MODEL-030: 加载失败时应设置错误状态', async () => {
        console.log('[步骤 1] 设置模拟返回错误');
        mockFetchGoogleAvailableModels.mockRejectedValue(new Error('Network error'));

        console.log('[步骤 2] 渲染 Hook');
        const { result } = renderHook(() => useGoogleModels({
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
     * 测试场景: 无 Access Token 时不发起请求
     */
    it('无 Access Token 时不应发起请求', async () => {
        console.log('[步骤 1] 渲染 Hook（无 Token）');
        const { result } = renderHook(() => useGoogleModels({
            accessToken: undefined,
        }));

        console.log('[步骤 2] 验证未发起请求');
        expect(mockFetchGoogleAvailableModels).not.toHaveBeenCalled();
        expect(result.current.loading).toBe(false);
        expect(result.current.models).toHaveLength(0);
    });

    /**
     * 测试场景: 手动刷新功能
     */
    it('refresh 应强制重新获取模型列表', async () => {
        console.log('[步骤 1] 设置模拟返回数据');
        mockFetchGoogleAvailableModels.mockResolvedValue([
            { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', isExhausted: false },
        ]);

        console.log('[步骤 2] 渲染 Hook');
        const { result } = renderHook(() => useGoogleModels({
            accessToken: 'test-token',
        }));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        console.log('[步骤 3] 验证首次调用');
        expect(mockFetchGoogleAvailableModels).toHaveBeenCalledTimes(1);

        console.log('[步骤 4] 调用 refresh');
        await act(async () => {
            await result.current.refresh();
        });

        console.log('[步骤 5] 验证再次调用');
        expect(mockFetchGoogleAvailableModels).toHaveBeenCalledTimes(2);
    });

    /**
     * 测试场景: 缓存机制
     */
    it('相同 Token 应使用缓存，不重复请求', async () => {
        console.log('[步骤 1] 设置模拟返回数据');
        mockFetchGoogleAvailableModels.mockResolvedValue([
            { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', isExhausted: false },
        ]);

        console.log('[步骤 2] 首次渲染 Hook');
        const { result: result1, unmount } = renderHook(() => useGoogleModels({
            accessToken: 'test-token',
            projectId: 'test-project',
        }));

        await waitFor(() => {
            expect(result1.current.loading).toBe(false);
        });

        console.log('[步骤 3] 验证首次调用');
        expect(mockFetchGoogleAvailableModels).toHaveBeenCalledTimes(1);

        console.log('[步骤 4] 卸载并重新渲染（相同 Token）');
        unmount();
        const { result: result2 } = renderHook(() => useGoogleModels({
            accessToken: 'test-token',
            projectId: 'test-project',
        }));

        await waitFor(() => {
            expect(result2.current.loading).toBe(false);
        });

        console.log('[步骤 5] 验证使用缓存，未重复请求');
        expect(mockFetchGoogleAvailableModels).toHaveBeenCalledTimes(1);
        expect(result2.current.models).toHaveLength(1);
    });
});
