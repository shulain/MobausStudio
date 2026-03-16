import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ImportModal from '../../../components/features/Settings/ImportModal';
import { renderWithI18n } from '../../testUtils';

describe('ImportModal', () => {
    it('renders correctly when open', () => {
        renderWithI18n(
            <ImportModal isOpen={true} onClose={() => { }} onImport={() => { }} />
        );
        expect(screen.getByText('导入配置')).toBeInTheDocument();
        expect(screen.getByText('拖放文件到此处')).toBeInTheDocument();
        expect(screen.getByText('合并现有配置')).toBeInTheDocument();
        expect(screen.getByText('导入前备份')).toBeInTheDocument();
    });

    it('does not render when closed', () => {
        renderWithI18n(
            <ImportModal isOpen={false} onClose={() => { }} onImport={() => { }} />
        );
        expect(screen.queryByText('导入配置')).not.toBeInTheDocument();
    });

    it('handles file selection via input', () => {
        renderWithI18n(
            <ImportModal isOpen={true} onClose={() => { }} onImport={() => { }} />
        );

        const file = new File(['{}'], 'config.json', { type: 'application/json' });
        const input = screen.getByLabelText(/选择文件/i) as HTMLInputElement; // Or locate by hidden input

        // Since input is hidden, we might need to find it differently or rely on label usage which implicitly triggers input
        // The accessible name "选择文件" is on the label containing the input.
        fireEvent.change(input, { target: { files: [file] } });

        expect(screen.getByText('config.json')).toBeInTheDocument();
        expect(screen.getByText(/0.00 KB/)).toBeInTheDocument();
        expect(screen.getByText('移除文件')).toBeInTheDocument();
    });

    it('handles file drop', () => {
        renderWithI18n(
            <ImportModal isOpen={true} onClose={() => { }} onImport={() => { }} />
        );

        const file = new File(['{}'], 'config.json', { type: 'application/json' });
        const dropZone = screen.getByText('拖放文件到此处').closest('div');

        // Mock drag events
        fireEvent.dragOver(dropZone!);
        fireEvent.drop(dropZone!, { dataTransfer: { files: [file] } });

        expect(screen.getByText('config.json')).toBeInTheDocument();
    });

    it('updates options when checkboxes are clicked', () => {
        renderWithI18n(
            <ImportModal isOpen={true} onClose={() => { }} onImport={() => { }} />
        );

        const mergeCheckbox = screen.getByLabelText(/合并现有配置/i) as HTMLInputElement; // The label wraps the checkbox input and text, or adjacent? 
        // In component: label wraps input and div. So label text is accessible.

        // Initial state
        expect(mergeCheckbox.checked).toBe(true);

        fireEvent.click(mergeCheckbox);
        expect(mergeCheckbox.checked).toBe(false);

        const backupCheckbox = screen.getByLabelText(/导入前备份/i) as HTMLInputElement;
        expect(backupCheckbox.checked).toBe(true);
        fireEvent.click(backupCheckbox);
        expect(backupCheckbox.checked).toBe(false);
    });

    it('calls onImport with file and options', () => {
        const onImport = vi.fn();
        const onClose = vi.fn();
        renderWithI18n(
            <ImportModal isOpen={true} onClose={onClose} onImport={onImport} />
        );

        // Select file
        const file = new File(['{}'], 'config.json', { type: 'application/json' });
        const input = screen.getByLabelText(/选择文件/i);
        fireEvent.change(input, { target: { files: [file] } });

        // Change options
        const mergeCheckbox = screen.getByLabelText(/合并现有配置/i);
        fireEvent.click(mergeCheckbox); // set to false

        // Click import
        fireEvent.click(screen.getByText('开始导入'));

        expect(onImport).toHaveBeenCalledWith(file, {
            merge: false,
            backup: true
        });
        expect(onClose).toHaveBeenCalled();
    });

    it('can remove selected file', () => {
        renderWithI18n(
            <ImportModal isOpen={true} onClose={() => { }} onImport={() => { }} />
        );

        const file = new File(['{}'], 'config.json', { type: 'application/json' });
        const input = screen.getByLabelText(/选择文件/i);
        fireEvent.change(input, { target: { files: [file] } });

        expect(screen.getByText('config.json')).toBeInTheDocument();

        fireEvent.click(screen.getByText('移除文件'));

        expect(screen.queryByText('config.json')).not.toBeInTheDocument();
        expect(screen.getByText('拖放文件到此处')).toBeInTheDocument();
    });
});
