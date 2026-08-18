/**
 * AboutSettings 组件测试
 *
 * 测试关于设置页面的渲染和交互
 * - 显示应用信息和版本号
 * - 检查更新按钮交互
 *
 * v3.0.23: 更新测试以匹配组件实际行为
 * - 组件使用内部 handleCheckUpdate，不再调用 onCheckUpdate prop
 * - 版本号动态获取，测试中显示为 'Web'（非 Tauri 环境）
 */
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AboutSettings } from '../../../components/features/Settings/AboutSettings';
import { renderWithI18n } from '../../testUtils';

// Mock platform 模块，确保 isTauri 返回 false
vi.mock('../../../utils/platform', () => ({
    isTauri: vi.fn(() => false),
    isWeb: vi.fn(() => true),
}));

describe('AboutSettings', () => {
    it('renders version and app info', async () => {
        renderWithI18n(
            <AboutSettings
                version="1.0.0"
                onCheckUpdate={() => { }}
            />
        );

        expect(screen.getByText('Mobaus Studio')).toBeInTheDocument();
        expect(screen.getByText('专业的 AI 智能助手开发平台')).toBeInTheDocument();
        expect(screen.getByText('版本')).toBeInTheDocument();
        // v3.0.23: 版本号动态获取，非 Tauri 环境显示 'Web'
        await waitFor(() => {
            expect(screen.getByText('Web')).toBeInTheDocument();
        });
    });

    /**
     * v3.0.23: 测试检查更新按钮点击后状态变化
     * 组件使用内部 handleCheckUpdate，非 Tauri 环境会直接设置为 upToDate 状态
     */
    it('shows up-to-date status when check update button is clicked in web environment', async () => {
        renderWithI18n(
            <AboutSettings
                version="1.0.0"
                onCheckUpdate={() => { }}
            />
        );

        fireEvent.click(screen.getByText('检查更新'));

        // 非 Tauri 环境，点击后应显示"当前已是最新版本"
        await waitFor(() => {
            expect(screen.getByText('当前已是最新版本')).toBeInTheDocument();
        });
    });
});
