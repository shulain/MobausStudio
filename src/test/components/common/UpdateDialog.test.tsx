/**
 * UpdateDialog 组件测试
 *
 * 覆盖发布后更新提示弹窗的关键闭环:
 * - 展示版本和 release notes
 * - 下载中禁用操作并显示进度
 * - 下载成功显示重启提示
 * - 下载失败显示错误并允许重试
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateDialog } from '../../../components/common/UpdateDialog';
import { renderWithI18n } from '../../testUtils';

const { mockDownloadAndInstall } = vi.hoisted(() => ({
    mockDownloadAndInstall: vi.fn(),
}));

vi.mock('../../../services/updater', () => ({
    downloadAndInstall: mockDownloadAndInstall,
}));

vi.mock('../../../utils/logger', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
    LogTags: {
        UI: 'UI',
    },
}));

const updateInfo = {
    available: true,
    currentVersion: '1.0.0',
    latestVersion: '1.1.0',
    releaseNotes: '修复更新安装闭环',
    releaseDate: '2026-06-10',
};

describe('UpdateDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('展示更新版本信息并支持稍后提醒关闭', () => {
        const onClose = vi.fn();

        renderWithI18n(<UpdateDialog updateInfo={updateInfo} onClose={onClose} />);

        expect(screen.getByText('发现新版本')).toBeInTheDocument();
        expect(screen.getByText('1.0.0')).toBeInTheDocument();
        expect(screen.getByText('1.1.0')).toBeInTheDocument();
        expect(screen.getByText('修复更新安装闭环')).toBeInTheDocument();

        fireEvent.click(screen.getByText('稍后提醒'));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('下载过程中显示进度并禁用关闭和更新操作，完成后显示重启提示', async () => {
        let resolveInstall: (() => void) | undefined;

        mockDownloadAndInstall.mockImplementation((onProgress?: (downloaded: number, total: number) => void) => {
            onProgress?.(25, 100);

            return new Promise<void>((resolve) => {
                resolveInstall = resolve;
            });
        });

        renderWithI18n(<UpdateDialog updateInfo={updateInfo} onClose={vi.fn()} />);

        fireEvent.click(screen.getByText('立即更新'));

        await waitFor(() => {
            expect(screen.getByText('正在下载更新... 25%')).toBeInTheDocument();
        });

        expect(screen.getByText('稍后提醒').closest('button')).toBeDisabled();
        expect(screen.getByText('立即更新').closest('button')).toBeDisabled();

        resolveInstall?.();

        await waitFor(() => {
            expect(screen.getByText('更新下载完成，应用即将重启...')).toBeInTheDocument();
        });

        expect(screen.getByText('立即更新').closest('button')).toBeDisabled();
    });

    it('下载失败时显示错误并允许用户重试', async () => {
        mockDownloadAndInstall.mockRejectedValue(new Error('download failed'));

        renderWithI18n(<UpdateDialog updateInfo={updateInfo} onClose={vi.fn()} />);

        fireEvent.click(screen.getByText('立即更新'));

        await waitFor(() => {
            expect(screen.getByText('download failed')).toBeInTheDocument();
        });

        expect(screen.getByText('重试')).toBeInTheDocument();
        expect(screen.getByText('重试').closest('button')).not.toBeDisabled();
    });
});
