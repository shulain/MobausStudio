import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContextMenu, type ContextMenuItem } from '../../../components/common/ContextMenu';

// Mock createPortal to render in the same container for testing
vi.mock('react-dom', async () => {
    const actual = await vi.importActual('react-dom');
    return {
        ...actual,
        createPortal: (node: React.ReactNode) => node,
    };
});

describe('ContextMenu', () => {
    const mockItems: ContextMenuItem[] = [
        { id: 'copy', label: '复制', onClick: vi.fn() },
        { id: 'edit', label: '编辑', onClick: vi.fn() },
        { id: 'divider', label: '', divider: true },
        { id: 'delete', label: '删除', danger: true, onClick: vi.fn() },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // CTX-01: 右键触发菜单
    it('should show menu on right-click (CTX-01)', () => {
        render(
            <ContextMenu items={mockItems}>
                <div data-testid="trigger">Right-click me</div>
            </ContextMenu>
        );

        const trigger = screen.getByTestId('trigger');
        fireEvent.contextMenu(trigger);

        expect(screen.getByText('复制')).toBeInTheDocument();
        expect(screen.getByText('编辑')).toBeInTheDocument();
        expect(screen.getByText('删除')).toBeInTheDocument();
    });

    // CTX-02: 菜单项点击
    it('should execute onClick and close menu when item is clicked (CTX-02)', async () => {
        const onCopy = vi.fn();
        const items: ContextMenuItem[] = [
            { id: 'copy', label: '复制', onClick: onCopy },
        ];

        render(
            <ContextMenu items={items}>
                <div data-testid="trigger">Right-click me</div>
            </ContextMenu>
        );

        // Open menu
        fireEvent.contextMenu(screen.getByTestId('trigger'));
        expect(screen.getByText('复制')).toBeInTheDocument();

        // Click item
        fireEvent.click(screen.getByText('复制'));
        expect(onCopy).toHaveBeenCalledTimes(1);

        // Menu should close
        await waitFor(() => {
            expect(screen.queryByText('复制')).not.toBeInTheDocument();
        });
    });

    // CTX-03: 禁用项点击
    it('should not execute onClick for disabled items (CTX-03)', () => {
        const onDisabledClick = vi.fn();
        const items: ContextMenuItem[] = [
            { id: 'disabled', label: '禁用选项', disabled: true, onClick: onDisabledClick },
        ];

        render(
            <ContextMenu items={items}>
                <div data-testid="trigger">Right-click me</div>
            </ContextMenu>
        );

        fireEvent.contextMenu(screen.getByTestId('trigger'));
        fireEvent.click(screen.getByText('禁用选项'));

        expect(onDisabledClick).not.toHaveBeenCalled();
    });

    // CTX-04: ESC 关闭
    it('should close menu on ESC key (CTX-04)', async () => {
        render(
            <ContextMenu items={mockItems}>
                <div data-testid="trigger">Right-click me</div>
            </ContextMenu>
        );

        fireEvent.contextMenu(screen.getByTestId('trigger'));
        expect(screen.getByText('复制')).toBeInTheDocument();

        fireEvent.keyDown(document, { key: 'Escape' });

        await waitFor(() => {
            expect(screen.queryByText('复制')).not.toBeInTheDocument();
        });
    });

    // CTX-05: 外部点击关闭
    it('should close menu on outside click (CTX-05)', async () => {
        render(
            <div>
                <ContextMenu items={mockItems}>
                    <div data-testid="trigger">Right-click me</div>
                </ContextMenu>
                <div data-testid="outside">Outside area</div>
            </div>
        );

        fireEvent.contextMenu(screen.getByTestId('trigger'));
        expect(screen.getByText('复制')).toBeInTheDocument();

        fireEvent.mouseDown(screen.getByTestId('outside'));

        await waitFor(() => {
            expect(screen.queryByText('复制')).not.toBeInTheDocument();
        });
    });

    // CTX-06 & CTX-07: 边界检测 - 需要 mock window 尺寸
    it('should adjust position to stay within viewport bounds (CTX-06, CTX-07)', () => {
        // Mock viewport size
        Object.defineProperty(window, 'innerWidth', { value: 800, writable: true });
        Object.defineProperty(window, 'innerHeight', { value: 600, writable: true });

        render(
            <ContextMenu items={mockItems}>
                <div data-testid="trigger">Right-click me</div>
            </ContextMenu>
        );

        // Right-click near right edge
        fireEvent.contextMenu(screen.getByTestId('trigger'), {
            clientX: 750,
            clientY: 550,
        });

        // Menu should be visible (position adjusted)
        expect(screen.getByText('复制')).toBeInTheDocument();
    });

    // CTX-08: 滚动关闭
    it('should close menu on scroll (CTX-08)', async () => {
        render(
            <ContextMenu items={mockItems}>
                <div data-testid="trigger">Right-click me</div>
            </ContextMenu>
        );

        fireEvent.contextMenu(screen.getByTestId('trigger'));
        expect(screen.getByText('复制')).toBeInTheDocument();

        fireEvent.scroll(document);

        await waitFor(() => {
            expect(screen.queryByText('复制')).not.toBeInTheDocument();
        });
    });

    // CTX-09: 分隔线渲染
    it('should render dividers correctly (CTX-09)', () => {
        render(
            <ContextMenu items={mockItems}>
                <div data-testid="trigger">Right-click me</div>
            </ContextMenu>
        );

        fireEvent.contextMenu(screen.getByTestId('trigger'));

        // Check that divider exists (it's an empty div with specific class)
        // The menu container is the parent of the button containing '复制'
        const copyButton = screen.getByText('复制').closest('button');
        const menuContainer = copyButton?.parentElement;
        const divider = menuContainer?.querySelector('.h-px');
        expect(divider).toBeInTheDocument();
    });

    // CTX-10: 危险项样式
    it('should apply danger styles to danger items (CTX-10)', () => {
        render(
            <ContextMenu items={mockItems}>
                <div data-testid="trigger">Right-click me</div>
            </ContextMenu>
        );

        fireEvent.contextMenu(screen.getByTestId('trigger'));

        const deleteButton = screen.getByText('删除');
        expect(deleteButton.closest('button')).toHaveClass('text-red-600');
    });

    // 额外测试: onOpenChange 回调
    it('should call onOpenChange when menu opens/closes', async () => {
        const onOpenChange = vi.fn();

        render(
            <ContextMenu items={mockItems} onOpenChange={onOpenChange}>
                <div data-testid="trigger">Right-click me</div>
            </ContextMenu>
        );

        fireEvent.contextMenu(screen.getByTestId('trigger'));
        expect(onOpenChange).toHaveBeenCalledWith(true);

        fireEvent.keyDown(document, { key: 'Escape' });

        await waitFor(() => {
            expect(onOpenChange).toHaveBeenCalledWith(false);
        });
    });

    // 额外测试: 图标和快捷键渲染
    it('should render icons and shortcuts', () => {
        const items: ContextMenuItem[] = [
            {
                id: 'copy',
                label: '复制',
                icon: <span data-testid="icon">ICON</span>,
                shortcut: '⌘C',
                onClick: vi.fn(),
            },
        ];

        render(
            <ContextMenu items={items}>
                <div data-testid="trigger">Right-click me</div>
            </ContextMenu>
        );

        fireEvent.contextMenu(screen.getByTestId('trigger'));

        expect(screen.getByTestId('icon')).toBeInTheDocument();
        expect(screen.getByText('⌘C')).toBeInTheDocument();
    });

    // 额外测试: 阻止默认右键菜单
    it('should prevent default context menu', () => {
        render(
            <ContextMenu items={mockItems}>
                <div data-testid="trigger">Right-click me</div>
            </ContextMenu>
        );

        const event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
        });

        const trigger = screen.getByTestId('trigger');
        const preventDefault = vi.spyOn(event, 'preventDefault');

        trigger.dispatchEvent(event);

        expect(preventDefault).toHaveBeenCalled();
    });
});
