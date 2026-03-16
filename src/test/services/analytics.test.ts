/**
 * Analytics 统计服务单元测试
 *
 * 测试用例与 docs/modules/analytics.md 文档对应
 * v2.0.0: 迁移到 Mixpanel
 *
 * @module test/services/analytics
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analytics, trackEvents, type AnalyticsConfig } from '../../services/analytics';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock crypto.randomUUID
const mockUUID = 'test-device-id-12345';
vi.stubGlobal('crypto', {
    randomUUID: () => mockUUID,
});

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
            store[key] = value;
        },
        removeItem: (key: string) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
    };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('Analytics 统计服务 (Mixpanel)', () => {
    const testConfig: AnalyticsConfig = {
        projectToken: 'test-project-token',
        endpoint: 'https://api.mixpanel.com',
        enabled: true,
        debug: false,
    };

    beforeEach(() => {
        // 重置服务状态
        analytics.reset();
        // 清空 localStorage
        localStorageMock.clear();
        // 重置 mock
        mockFetch.mockReset();
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            text: () => Promise.resolve('1'),
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    // ==================== TC-ANALYTICS-001 ====================
    describe('TC-ANALYTICS-001: 初始化服务', () => {
        it('应该成功初始化服务', () => {
            analytics.init(testConfig);

            expect(analytics.isInitialized()).toBe(true);
            expect(analytics.isEnabled()).toBe(true);
        });

        it('应该使用默认端点', () => {
            analytics.init({
                projectToken: 'test-token',
            });

            expect(analytics.isInitialized()).toBe(true);
        });
    });

    // ==================== TC-ANALYTICS-002 ====================
    describe('TC-ANALYTICS-002: 初始化服务（禁用）', () => {
        it('禁用时不应发送任何请求', async () => {
            analytics.init({
                ...testConfig,
                enabled: false,
            });

            analytics.track('test_event', { key: 'value' });

            // 等待异步操作
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('isEnabled 应返回 false', () => {
            analytics.init({
                ...testConfig,
                enabled: false,
            });

            expect(analytics.isEnabled()).toBe(false);
        });
    });

    // ==================== TC-ANALYTICS-003 ====================
    describe('TC-ANALYTICS-003: 追踪事件', () => {
        it('应该成功发送事件到 Mixpanel', async () => {
            analytics.init(testConfig);

            analytics.track('test_event');

            // 等待异步操作
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(mockFetch).toHaveBeenCalledWith(
                `${testConfig.endpoint}/track`,
                expect.objectContaining({
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'text/plain',
                    },
                })
            );

            // 验证请求体
            const callArgs = mockFetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body).toHaveLength(1);
            expect(body[0].event).toBe('test_event');
            expect(body[0].properties.token).toBe(testConfig.projectToken);
            expect(body[0].properties.distinct_id).toBe(mockUUID);
        });
    });

    // ==================== TC-ANALYTICS-004 ====================
    describe('TC-ANALYTICS-004: 追踪事件（带属性）', () => {
        it('应该正确发送事件属性', async () => {
            analytics.init(testConfig);

            const properties = {
                modelId: 'gpt-4',
                messageLength: 100,
                hasAttachment: false,
            };

            analytics.track('message_sent', properties);

            await new Promise(resolve => setTimeout(resolve, 100));

            const callArgs = mockFetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body[0].properties.modelId).toBe('gpt-4');
            expect(body[0].properties.messageLength).toBe(100);
            expect(body[0].properties.hasAttachment).toBe(false);
        });
    });

    // ==================== TC-ANALYTICS-005 ====================
    describe('TC-ANALYTICS-005: 用户识别', () => {
        it('应该生成并存储设备 ID', () => {
            analytics.init(testConfig);

            const deviceId = analytics.getDeviceId();

            expect(deviceId).toBe(mockUUID);
            expect(localStorageMock.getItem('mobaus_device_id')).toBe(mockUUID);
        });

        it('应该复用已存储的设备 ID', () => {
            localStorageMock.setItem('mobaus_device_id', 'existing-device-id');

            analytics.init(testConfig);

            const deviceId = analytics.getDeviceId();

            expect(deviceId).toBe('existing-device-id');
        });
    });

    // ==================== TC-ANALYTICS-006 ====================
    describe('TC-ANALYTICS-006: 设置用户属性', () => {
        it('应该成功更新用户属性到 Mixpanel Engage API', async () => {
            analytics.init(testConfig);

            analytics.setUserProperties({
                appVersion: '1.0.0',
                language: 'zh',
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(mockFetch).toHaveBeenCalled();
            const callArgs = mockFetch.mock.calls[0];
            expect(callArgs[0]).toBe(`${testConfig.endpoint}/engage`);

            const body = JSON.parse(callArgs[1].body);
            expect(body[0].$token).toBe(testConfig.projectToken);
            expect(body[0].$distinct_id).toBe(mockUUID);
            expect(body[0].$set.appVersion).toBe('1.0.0');
            expect(body[0].$set.language).toBe('zh');
        });
    });

    // ==================== TC-ANALYTICS-007 ====================
    describe('TC-ANALYTICS-007: 网络错误处理', () => {
        it('网络错误时应静默失败', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            analytics.init(testConfig);

            // 不应抛出错误
            expect(() => {
                analytics.track('test_event');
            }).not.toThrow();

            await new Promise(resolve => setTimeout(resolve, 100));
        });

        it('HTTP 错误时应静默失败', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
            });

            analytics.init(testConfig);

            expect(() => {
                analytics.track('test_event');
            }).not.toThrow();

            await new Promise(resolve => setTimeout(resolve, 100));
        });

        it('Mixpanel 返回错误时应静默失败', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                text: () => Promise.resolve('0'), // Mixpanel 返回 0 表示失败
            });

            analytics.init(testConfig);

            expect(() => {
                analytics.track('test_event');
            }).not.toThrow();

            await new Promise(resolve => setTimeout(resolve, 100));
        });
    });

    // ==================== TC-ANALYTICS-008 ====================
    describe('TC-ANALYTICS-008: 调试模式', () => {
        it('调试模式应输出日志', () => {
            const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

            analytics.init({
                ...testConfig,
                debug: true,
            });

            analytics.track('test_event');

            // 调试模式下应有日志输出
            expect(consoleSpy).toHaveBeenCalled();

            consoleSpy.mockRestore();
        });
    });

    // ==================== 未初始化状态测试 ====================
    describe('未初始化状态', () => {
        it('未初始化时 track 不应发送请求', async () => {
            // 不调用 init
            analytics.track('test_event');

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('未初始化时 isInitialized 应返回 false', () => {
            expect(analytics.isInitialized()).toBe(false);
        });
    });

    // ==================== 预定义事件测试 ====================
    describe('预定义事件追踪函数', () => {
        beforeEach(() => {
            analytics.init(testConfig);
        });

        it('appLaunched 应发送正确事件', async () => {
            trackEvents.appLaunched({
                version: '1.0.0',
                os: 'macOS',
                language: 'zh',
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            const callArgs = mockFetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body[0].event).toBe('app_launched');
            expect(body[0].properties.version).toBe('1.0.0');
            expect(body[0].properties.os).toBe('macOS');
            expect(body[0].properties.language).toBe('zh');
        });

        it('messageSent 应发送正确事件', async () => {
            trackEvents.messageSent({
                modelId: 'gpt-4',
                messageLength: 100,
                hasAttachment: false,
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            const callArgs = mockFetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body[0].event).toBe('message_sent');
        });

        it('modelSwitched 应发送正确事件', async () => {
            trackEvents.modelSwitched({
                fromModel: 'gpt-3.5',
                toModel: 'gpt-4',
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            const callArgs = mockFetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body[0].event).toBe('model_switched');
        });

        it('agentUsed 应发送正确事件', async () => {
            trackEvents.agentUsed({
                agentId: 'agent-1',
                agentName: 'Test Agent',
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            const callArgs = mockFetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body[0].event).toBe('agent_used');
        });

        it('skillUsed 应发送正确事件', async () => {
            trackEvents.skillUsed({
                skillId: 'skill-1',
                skillName: 'Test Skill',
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            const callArgs = mockFetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body[0].event).toBe('skill_used');
        });

        it('mcpServerConnected 应发送正确事件', async () => {
            trackEvents.mcpServerConnected({
                serverName: 'Test Server',
                toolCount: 5,
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            const callArgs = mockFetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body[0].event).toBe('mcp_server_connected');
        });

        it('themeChanged 应发送正确事件', async () => {
            trackEvents.themeChanged({ theme: 'dark' });

            await new Promise(resolve => setTimeout(resolve, 100));

            const callArgs = mockFetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body[0].event).toBe('theme_changed');
        });

        it('roundtableCreated 应发送正确事件', async () => {
            trackEvents.roundtableCreated({
                participantCount: 3,
                topic: 'Test Topic',
            });

            await new Promise(resolve => setTimeout(resolve, 100));

            const callArgs = mockFetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body[0].event).toBe('roundtable_created');
        });
    });

    // ==================== reset 测试 ====================
    describe('reset 方法', () => {
        it('应该重置所有状态', () => {
            analytics.init(testConfig);
            expect(analytics.isInitialized()).toBe(true);

            analytics.reset();

            expect(analytics.isInitialized()).toBe(false);
            expect(analytics.isEnabled()).toBe(false);
        });
    });

    // ==================== Cloudflare Worker 代理测试 ====================
    describe('Cloudflare Worker 代理', () => {
        it('应该使用自定义代理端点', async () => {
            const proxyEndpoint = 'https://mixpanel-proxy.workers.dev';

            analytics.init({
                ...testConfig,
                endpoint: proxyEndpoint,
            });

            analytics.track('test_event');

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(mockFetch).toHaveBeenCalledWith(
                `${proxyEndpoint}/track`,
                expect.anything()
            );
        });
    });
});
