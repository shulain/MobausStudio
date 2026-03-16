import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { StatsModal } from '../../../components/features/Stats';
import { renderWithI18n } from '../../testUtils';
import type { UsageStats, ModelUsage, ActivityItem, TimeRange } from '../../../types';

const mockStats: Record<TimeRange, UsageStats> = {
    today: { messages: 45, tokens: 12500, cost: 0.25 },
    week: { messages: 234, tokens: 89400, cost: 1.78 },
    month: { messages: 1052, tokens: 428600, cost: 8.57 },
};

const mockModelUsage: ModelUsage[] = [
    { model: 'GPT-4', usage: 65, color: 'bg-green-500' },
    { model: 'Claude 3.5', usage: 25, color: 'bg-purple-500' },
];

const mockActivity: ActivityItem[] = [
    { id: '1', action: '创建新对话', details: 'React 开发问题', time: new Date(), type: 'chat' },
];

describe('StatsModal', () => {
    it('should not render when closed', () => {
        renderWithI18n(
            <StatsModal
                isOpen={false}
                onClose={() => { }}
                stats={mockStats}
                modelUsage={mockModelUsage}
                recentActivity={mockActivity}
            />
        );
        expect(screen.queryByText('使用统计')).toBeNull();
    });

    it('should render when open', () => {
        renderWithI18n(
            <StatsModal
                isOpen={true}
                onClose={() => { }}
                stats={mockStats}
                modelUsage={mockModelUsage}
                recentActivity={mockActivity}
            />
        );
        expect(screen.getByText('使用统计')).toBeDefined();
    });

    it('should display week stats by default', () => {
        renderWithI18n(
            <StatsModal
                isOpen={true}
                onClose={() => { }}
                stats={mockStats}
                modelUsage={mockModelUsage}
                recentActivity={mockActivity}
            />
        );
        expect(screen.getByText('234')).toBeDefined(); // week messages
    });

    it('should switch to today stats when today button is clicked', () => {
        renderWithI18n(
            <StatsModal
                isOpen={true}
                onClose={() => { }}
                stats={mockStats}
                modelUsage={mockModelUsage}
                recentActivity={mockActivity}
            />
        );
        fireEvent.click(screen.getByText('今日'));
        expect(screen.getByText('45')).toBeDefined(); // today messages
    });

    it('should display model usage', () => {
        renderWithI18n(
            <StatsModal
                isOpen={true}
                onClose={() => { }}
                stats={mockStats}
                modelUsage={mockModelUsage}
                recentActivity={mockActivity}
            />
        );
        expect(screen.getByText('GPT-4')).toBeDefined();
        expect(screen.getByText('65%')).toBeDefined();
        expect(screen.getByText('Claude 3.5')).toBeDefined();
    });

    it('should display recent activity', () => {
        renderWithI18n(
            <StatsModal
                isOpen={true}
                onClose={() => { }}
                stats={mockStats}
                modelUsage={mockModelUsage}
                recentActivity={mockActivity}
            />
        );
        expect(screen.getByText('创建新对话')).toBeDefined();
        expect(screen.getByText('React 开发问题')).toBeDefined();
    });

    it('should call onClose when close button is clicked', () => {
        const handleClose = vi.fn();
        renderWithI18n(
            <StatsModal
                isOpen={true}
                onClose={handleClose}
                stats={mockStats}
                modelUsage={mockModelUsage}
                recentActivity={mockActivity}
            />
        );
        // 关闭按钮在modal的X按钮或关闭按钮
        fireEvent.click(screen.getByText('关闭'));
        expect(handleClose).toHaveBeenCalled();
    });

    it('should display token count in K format', () => {
        renderWithI18n(
            <StatsModal
                isOpen={true}
                onClose={() => { }}
                stats={mockStats}
                modelUsage={mockModelUsage}
                recentActivity={mockActivity}
            />
        );
        expect(screen.getByText('89.4K')).toBeDefined(); // week tokens
    });

    it('should display cost with dollar sign', () => {
        renderWithI18n(
            <StatsModal
                isOpen={true}
                onClose={() => { }}
                stats={mockStats}
                modelUsage={mockModelUsage}
                recentActivity={mockActivity}
            />
        );
        expect(screen.getByText('$1.78')).toBeDefined(); // week cost
    });
});
