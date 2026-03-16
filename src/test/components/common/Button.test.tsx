import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../../../components/common/Button';

describe('Button', () => {
    it('should render children', () => {
        render(<Button>Click me</Button>);
        expect(screen.getByText('Click me')).toBeDefined();
    });

    it('should handle click events', () => {
        const handleClick = vi.fn();
        render(<Button onClick={handleClick}>Click me</Button>);
        fireEvent.click(screen.getByText('Click me'));
        expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should render with primary variant by default', () => {
        const { container } = render(<Button>Primary</Button>);
        expect(container.firstChild).toHaveClass('from-[#A688F6]');
    });

    it('should render with secondary variant', () => {
        const { container } = render(<Button variant="secondary">Secondary</Button>);
        expect(container.firstChild).toHaveClass('bg-gray-100');
    });

    it('should render with danger variant', () => {
        const { container } = render(<Button variant="danger">Danger</Button>);
        expect(container.firstChild).toHaveClass('bg-red-500');
    });

    it('should be disabled when disabled prop is true', () => {
        render(<Button disabled>Disabled</Button>);
        expect(screen.getByText('Disabled')).toBeDisabled();
    });

    it('should render with icon', () => {
        const icon = <span data-testid="icon">🔥</span>;
        render(<Button icon={icon}>With Icon</Button>);
        expect(screen.getByTestId('icon')).toBeDefined();
    });

    it('should apply different sizes', () => {
        const { container } = render(<Button size="lg">Large</Button>);
        expect(container.firstChild).toHaveClass('px-6');
    });
});
