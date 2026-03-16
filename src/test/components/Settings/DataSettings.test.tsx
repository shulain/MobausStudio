import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DataSettings } from '../../../components/features/Settings/DataSettings';
import { renderWithI18n } from '../../testUtils';

describe('DataSettings', () => {
    it('renders correctly', () => {
        renderWithI18n(
            <DataSettings
                onExport={() => { }}
                onImport={() => { }}
                onClearData={() => { }}
            />
        );

        expect(screen.getByText('数据管理')).toBeInTheDocument();
        expect(screen.getByText('备份与恢复')).toBeInTheDocument();
        expect(screen.getByText('存储空间')).toBeInTheDocument();
        expect(screen.getByText('本地存储使用量')).toBeInTheDocument();
    });

    it('calls handler functions on button clicks', () => {
        const onExport = vi.fn();
        const onImport = vi.fn();
        const onClearData = vi.fn();

        renderWithI18n(
            <DataSettings
                onExport={onExport}
                onImport={onImport}
                onClearData={onClearData}
            />
        );

        fireEvent.click(screen.getByText('导出配置'));
        expect(onExport).toHaveBeenCalled();

        fireEvent.click(screen.getByText('导入配置'));
        expect(onImport).toHaveBeenCalled();

        fireEvent.click(screen.getByText('清除所有数据'));
        expect(onClearData).toHaveBeenCalled();
    });
});
