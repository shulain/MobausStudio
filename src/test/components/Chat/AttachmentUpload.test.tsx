import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AttachmentUpload } from '../../../components/features/Chat/AttachmentUpload';
import type { Attachment } from '../../../types';

describe('AttachmentUpload', () => {
    const defaultProps = {
        attachments: [],
        onAttachmentsChange: vi.fn(),
    };

    it('should render upload button', () => {
        render(<AttachmentUpload {...defaultProps} />);
        expect(screen.getByTitle('上传图片/视频')).toBeDefined();
    });

    it('should render preview for attachments', () => {
        const attachments: Attachment[] = [
            { id: '1', type: 'image', name: 'test.png', url: 'url', mimeType: 'image/png', size: 100 }
        ];
        render(<AttachmentUpload {...defaultProps} attachments={attachments} />);
        expect(screen.getByAltText('test.png')).toBeDefined();
    });

    it('should call onAttachmentsChange when removing attachment', () => {
        const handleChange = vi.fn();
        const attachments: Attachment[] = [
            { id: '1', type: 'image', name: 'test.png', url: 'url', mimeType: 'image/png', size: 100 }
        ];
        render(<AttachmentUpload attachments={attachments} onAttachmentsChange={handleChange} />);

        const removeBtn = screen.getAllByRole('button')[0]; // The X button
        fireEvent.click(removeBtn);

        expect(handleChange).toHaveBeenCalledWith([]);
    });
});
