import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GeneralSettings } from '../../../components/features/Settings/GeneralSettings';
import { renderWithI18n } from '../../testUtils';

describe('GeneralSettings', () => {
    it('renders all sections and options', () => {
        renderWithI18n(
            <GeneralSettings
                theme="system"
                language="zh"
                onThemeChange={() => { }}
                onLanguageChange={() => { }}
            />
        );

        // Check for section titles (in Chinese by default)
        expect(screen.getByText('外观设置')).toBeInTheDocument();
        expect(screen.getByText('浅色模式')).toBeInTheDocument();
        expect(screen.getByText('深色模式')).toBeInTheDocument();
        expect(screen.getByText('跟随系统')).toBeInTheDocument();
        expect(screen.getByText('语言区域')).toBeInTheDocument();
    });

    it('calls onThemeChange when theme buttons are clicked', () => {
        const onThemeChange = vi.fn();
        renderWithI18n(
            <GeneralSettings
                theme="system"
                language="zh"
                onThemeChange={onThemeChange}
                onLanguageChange={() => { }}
            />
        );

        fireEvent.click(screen.getByText('浅色模式'));
        expect(onThemeChange).toHaveBeenCalledWith('light');

        fireEvent.click(screen.getByText('深色模式'));
        expect(onThemeChange).toHaveBeenCalledWith('dark');
    });

    it('calls onLanguageChange when language options are clicked', () => {
        const onLanguageChange = vi.fn();
        renderWithI18n(
            <GeneralSettings
                theme="system"
                language="zh"
                onThemeChange={() => { }}
                onLanguageChange={onLanguageChange}
            />
        );

        // Find by radio button
        const englishRadio = screen.getByRole('radio', { name: /English/i });
        fireEvent.click(englishRadio);
        expect(onLanguageChange).toHaveBeenCalledWith('en');
    });
});
