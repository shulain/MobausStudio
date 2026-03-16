/**
 * @file CompactStats.test.tsx
 * @description CompactStats 紧凑型统计卡片组件单元测试
 *
 * 对应文档 docs/modules/test-report-v0.9.2.md 中的测试用例
 * TC-STATS-001 ~ TC-STATS-003
 *
 * @module test/components/common/CompactStats
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompactStats } from '../../../components/common/CompactStats';
import type { StatItem } from '../../../components/common/CompactStats';

describe('CompactStats 紧凑型统计卡片', () => {
    /**
     * TC-STATS-001: 渲染统计项
     * 测试场景: 传入多个统计项时应全部渲染
     */
    it('TC-STATS-001: 应渲染所有统计项的标签和数值', () => {
        const items: StatItem[] = [
            { label: '总数', value: 10 },
            { label: '已连接', value: 5, color: 'success' },
            { label: '错误', value: 2, color: 'error' },
        ];

        render(<CompactStats items={items} />);

        expect(screen.getByText('总数')).toBeDefined();
        expect(screen.getByText('10')).toBeDefined();
        expect(screen.getByText('已连接')).toBeDefined();
        expect(screen.getByText('5')).toBeDefined();
        expect(screen.getByText('错误')).toBeDefined();
        expect(screen.getByText('2')).toBeDefined();
    });

    /**
     * TC-STATS-002: 大数值格式化
     * 测试场景: 大于 1000 的数值应格式化为 K 格式
     */
    it('TC-STATS-002: 大数值应格式化为 K 格式', () => {
        const items: StatItem[] = [
            { label: 'tokens', value: 12500 },
        ];

        render(<CompactStats items={items} />);

        expect(screen.getByText('12.5K')).toBeDefined();
        expect(screen.getByText('tokens')).toBeDefined();
    });

    /**
     * TC-STATS-003: 字符串值
     * 测试场景: 字符串类型的值应原样显示
     */
    it('TC-STATS-003: 字符串值应原样显示', () => {
        const items: StatItem[] = [
            { label: '状态', value: 'N/A' },
        ];

        render(<CompactStats items={items} />);

        expect(screen.getByText('N/A')).toBeDefined();
        expect(screen.getByText('状态')).toBeDefined();
    });
});
