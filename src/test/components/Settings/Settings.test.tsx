import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { NotificationPanel } from '../../../components/features/Settings/NotificationPanel';
import { ExportModal } from '../../../components/features/Settings/ExportModal';
import { ImportModal } from '../../../components/features/Settings/ImportModal';
import { renderWithI18n } from '../../testUtils';
import type { AppNotification } from '../../../types';

const mockNotifications: AppNotification[] = [
    { id: '1', type: 'success', title: 'Agent 创建成功', message: '代码助手已成功创建', createdAt: new Date(), read: false },
    { id: '2', type: 'error', title: '连接失败', message: 'github 服务器连接失败', createdAt: new Date(), read: true },
    { id: '3', type: 'warning', title: '警告信息', message: '资源使用量高', createdAt: new Date(), read: false },
    { id: '4', type: 'info', title: '一般信息', message: '系统更新可用', createdAt: new Date(), read: true },
];

describe('NotificationPanel', () => {
    it('should not render when closed', () => {
        renderWithI18n(
            <NotificationPanel
                isOpen={false}
                onClose={() => { }}
                notifications={[]}
                onMarkRead={() => { }}
                onMarkAllRead={() => { }}
            />
        );
        expect(screen.queryByText('通知')).toBeNull();
    });

    it('should render when open', () => {
        renderWithI18n(
            <NotificationPanel
                isOpen={true}
                onClose={() => { }}
                notifications={mockNotifications}
                onMarkRead={() => { }}
                onMarkAllRead={() => { }}
            />
        );
        expect(screen.getByText('通知')).toBeDefined();
    });

    it('should render notifications', () => {
        renderWithI18n(
            <NotificationPanel
                isOpen={true}
                onClose={() => { }}
                notifications={mockNotifications}
                onMarkRead={() => { }}
                onMarkAllRead={() => { }}
            />
        );
        expect(screen.getByText('Agent 创建成功')).toBeDefined();
        expect(screen.getByText('连接失败')).toBeDefined();
    });

    it('should show unread count', () => {
        renderWithI18n(
            <NotificationPanel
                isOpen={true}
                onClose={() => { }}
                notifications={mockNotifications}
                onMarkRead={() => { }}
                onMarkAllRead={() => { }}
            />
        );
        expect(screen.getByText('2')).toBeDefined(); // 2 unread
    });

    it('should call onMarkRead when notification is clicked', () => {
        const handleMarkRead = vi.fn();
        renderWithI18n(
            <NotificationPanel
                isOpen={true}
                onClose={() => { }}
                notifications={mockNotifications}
                onMarkRead={handleMarkRead}
                onMarkAllRead={() => { }}
            />
        );
        fireEvent.click(screen.getByText('Agent 创建成功'));
        expect(handleMarkRead).toHaveBeenCalledWith('1');
    });

    it('should call onMarkAllRead when mark all button is clicked', () => {
        const handleMarkAllRead = vi.fn();
        renderWithI18n(
            <NotificationPanel
                isOpen={true}
                onClose={() => { }}
                notifications={mockNotifications}
                onMarkRead={() => { }}
                onMarkAllRead={handleMarkAllRead}
            />
        );
        fireEvent.click(screen.getByText('全部已读'));
        expect(handleMarkAllRead).toHaveBeenCalled();
    });
});

describe('ExportModal', () => {
    it('should not render when closed', () => {
        renderWithI18n(
            <ExportModal isOpen={false} onClose={() => { }} onExport={() => { }} />
        );
        expect(screen.queryByText('导出配置')).toBeNull();
    });

    it('should render when open', () => {
        renderWithI18n(
            <ExportModal isOpen={true} onClose={() => { }} onExport={() => { }} />
        );
        // 标题和按钮都有"导出配置"，使用getAllByText
        expect(screen.getAllByText('导出配置').length).toBeGreaterThan(0);
    });

    it('should render export options', () => {
        renderWithI18n(
            <ExportModal isOpen={true} onClose={() => { }} onExport={() => { }} />
        );
        expect(screen.getByText('Agents 配置')).toBeDefined();
        expect(screen.getByText('Skills 配置')).toBeDefined();
        expect(screen.getByText('MCP 服务器')).toBeDefined();
        expect(screen.getByText('对话历史')).toBeDefined();
    });

    /**
     * v2.6.5: ExportConfig 新增 roundtableChats 和 settings 字段
     */
    it('should call onExport with selected options', () => {
        const handleExport = vi.fn();
        renderWithI18n(
            <ExportModal isOpen={true} onClose={() => { }} onExport={handleExport} />
        );
        fireEvent.click(screen.getByRole('button', { name: /导出配置/i }));
        expect(handleExport).toHaveBeenCalledWith({
            models: true,  // v2.6.1: 新增
            agents: true,
            skills: true,
            mcp: true,
            chats: false,
            roundtableChats: false,  // v2.6.5: 新增
            settings: true,          // v2.6.5: 新增
        });
    });
});

describe('ImportModal', () => {
    it('should not render when closed', () => {
        renderWithI18n(
            <ImportModal isOpen={false} onClose={() => { }} onImport={() => { }} />
        );
        expect(screen.queryByText('导入配置')).toBeNull();
    });

    it('should render when open', () => {
        renderWithI18n(
            <ImportModal isOpen={true} onClose={() => { }} onImport={() => { }} />
        );
        expect(screen.getByText('导入配置')).toBeDefined();
    });

    it('should render drop zone', () => {
        renderWithI18n(
            <ImportModal isOpen={true} onClose={() => { }} onImport={() => { }} />
        );
        expect(screen.getByText('拖放文件到此处')).toBeDefined();
    });

    it('should render import options', () => {
        renderWithI18n(
            <ImportModal isOpen={true} onClose={() => { }} onImport={() => { }} />
        );
        expect(screen.getByText('合并现有配置')).toBeDefined();
        expect(screen.getByText('导入前备份')).toBeDefined();
    });

    it('should disable import button when no file selected', () => {
        renderWithI18n(
            <ImportModal isOpen={true} onClose={() => { }} onImport={() => { }} />
        );
        const button = screen.getByText('开始导入');
        expect(button).toBeDisabled();
    });
});
