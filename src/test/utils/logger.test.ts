/**
 * Logger 日志工具模块单元测试
 *
 * 测试用例对应文档：docs/modules/skills.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, LogLevel, LogTags } from '../../utils/logger';

describe('logger', () => {
    // 保存原始 console 方法
    const originalConsole = {
        debug: console.debug,
        info: console.info,
        warn: console.warn,
        error: console.error,
    };

    beforeEach(() => {
        // Mock console 方法
        console.debug = vi.fn();
        console.info = vi.fn();
        console.warn = vi.fn();
        console.error = vi.fn();
        // 重置 logger 配置
        logger.reset();
    });

    afterEach(() => {
        // 恢复原始 console 方法
        console.debug = originalConsole.debug;
        console.info = originalConsole.info;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
    });

    describe('基础日志功能', () => {
        it('debug 方法输出调试日志', () => {
            logger.debug('[Test]', '调试消息');
            expect(console.debug).toHaveBeenCalledWith('[DEBUG]', '[Test]', '调试消息');
        });

        it('info 方法输出信息日志', () => {
            logger.info('[Test]', '信息消息');
            expect(console.info).toHaveBeenCalledWith('[INFO]', '[Test]', '信息消息');
        });

        it('warn 方法输出警告日志', () => {
            logger.warn('[Test]', '警告消息');
            expect(console.warn).toHaveBeenCalledWith('[WARN]', '[Test]', '警告消息');
        });

        it('error 方法输出错误日志', () => {
            logger.error('[Test]', '错误消息');
            expect(console.error).toHaveBeenCalledWith('[ERROR]', '[Test]', '错误消息');
        });
    });

    describe('带附加数据的日志', () => {
        it('debug 方法支持附加数据', () => {
            const data = { count: 10 };
            logger.debug('[Test]', '调试消息', data);
            expect(console.debug).toHaveBeenCalledWith('[DEBUG]', '[Test]', '调试消息', data);
        });

        it('info 方法支持附加数据', () => {
            const data = { name: 'test' };
            logger.info('[Test]', '信息消息', data);
            expect(console.info).toHaveBeenCalledWith('[INFO]', '[Test]', '信息消息', data);
        });

        it('warn 方法支持附加数据', () => {
            const data = { warning: true };
            logger.warn('[Test]', '警告消息', data);
            expect(console.warn).toHaveBeenCalledWith('[WARN]', '[Test]', '警告消息', data);
        });

        it('error 方法支持错误对象', () => {
            const error = new Error('测试错误');
            logger.error('[Test]', '错误消息', error);
            expect(console.error).toHaveBeenCalledWith('[ERROR]', '[Test]', '错误消息', error);
        });
    });

    describe('日志级别控制', () => {
        it('设置 INFO 级别后 debug 日志不输出', () => {
            logger.setLevel(LogLevel.INFO);
            logger.debug('[Test]', '调试消息');
            expect(console.debug).not.toHaveBeenCalled();
        });

        it('设置 INFO 级别后 info 日志正常输出', () => {
            logger.setLevel(LogLevel.INFO);
            logger.info('[Test]', '信息消息');
            expect(console.info).toHaveBeenCalled();
        });

        it('设置 WARN 级别后 info 日志不输出', () => {
            logger.setLevel(LogLevel.WARN);
            logger.info('[Test]', '信息消息');
            expect(console.info).not.toHaveBeenCalled();
        });

        it('设置 ERROR 级别后只有 error 日志输出', () => {
            logger.setLevel(LogLevel.ERROR);
            logger.debug('[Test]', '调试消息');
            logger.info('[Test]', '信息消息');
            logger.warn('[Test]', '警告消息');
            logger.error('[Test]', '错误消息');

            expect(console.debug).not.toHaveBeenCalled();
            expect(console.info).not.toHaveBeenCalled();
            expect(console.warn).not.toHaveBeenCalled();
            expect(console.error).toHaveBeenCalled();
        });

        it('设置 OFF 级别后所有日志都不输出', () => {
            logger.setLevel(LogLevel.OFF);
            logger.debug('[Test]', '调试消息');
            logger.info('[Test]', '信息消息');
            logger.warn('[Test]', '警告消息');
            logger.error('[Test]', '错误消息');

            expect(console.debug).not.toHaveBeenCalled();
            expect(console.info).not.toHaveBeenCalled();
            expect(console.warn).not.toHaveBeenCalled();
            expect(console.error).not.toHaveBeenCalled();
        });

        it('getLevel 返回当前日志级别', () => {
            expect(logger.getLevel()).toBe(LogLevel.DEBUG);
            logger.setLevel(LogLevel.WARN);
            expect(logger.getLevel()).toBe(LogLevel.WARN);
        });
    });

    describe('配置功能', () => {
        it('configure 方法更新配置', () => {
            logger.configure({ showTimestamp: true });
            logger.info('[Test]', '信息消息');

            // 检查是否包含时间戳格式
            const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(call[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T/);
        });

        it('reset 方法重置为默认配置', () => {
            logger.setLevel(LogLevel.ERROR);
            logger.configure({ showTimestamp: true });
            logger.reset();

            expect(logger.getLevel()).toBe(LogLevel.DEBUG);
            logger.info('[Test]', '信息消息');
            const call = (console.info as ReturnType<typeof vi.fn>).mock.calls[0];
            expect(call[0]).toBe('[INFO]');
        });
    });

    describe('LogTags 常量', () => {
        it('包含预定义的模块标签', () => {
            expect(LogTags.SKILL).toBe('[Skill]');
            expect(LogTags.MCP).toBe('[MCP]');
            expect(LogTags.CHAT).toBe('[Chat]');
            expect(LogTags.AGENT).toBe('[Agent]');
            expect(LogTags.STORAGE).toBe('[Storage]');
            expect(LogTags.API).toBe('[API]');
        });

        it('可以与 logger 方法配合使用', () => {
            logger.info(LogTags.SKILL, '技能加载成功');
            expect(console.info).toHaveBeenCalledWith('[INFO]', '[Skill]', '技能加载成功');
        });
    });
});
