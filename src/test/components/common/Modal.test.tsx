import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../../../components/common/Modal';

describe('Modal', () => {
    it('should not render when closed', () => {
        render(
            <Modal isOpen={false} onClose={() => { }} title="Test Modal">
                <div>Content</div>
            </Modal>
        );
        expect(screen.queryByText('Test Modal')).toBeNull();
    });

    it('should render when open', () => {
        render(
            <Modal isOpen={true} onClose={() => { }} title="Test Modal">
                <div>Content</div>
            </Modal>
        );
        expect(screen.getByText('Test Modal')).toBeDefined();
        expect(screen.getByText('Content')).toBeDefined();
    });

    it('should call onClose when close button is clicked', () => {
        const handleClose = vi.fn();
        render(
            <Modal isOpen={true} onClose={handleClose} title="Test Modal">
                <div>Content</div>
            </Modal>
        );
        const closeButton = screen.getByRole('button');
        fireEvent.click(closeButton);
        expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('should render with different sizes', () => {
        const { container } = render(
            <Modal isOpen={true} onClose={() => { }} title="Large Modal" size="lg">
                <div>Content</div>
            </Modal>
        );
        expect(container.innerHTML).toContain('max-w-2xl');
    });
});
