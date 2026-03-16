import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
    id: string;
    label: string;
    icon?: React.ReactNode;
    shortcut?: string;
    disabled?: boolean;
    danger?: boolean;
    divider?: boolean;
    onClick?: () => void;
}

interface ContextMenuProps {
    items: ContextMenuItem[];
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
}

interface MenuPosition {
    x: number;
    y: number;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
    items,
    children,
    onOpenChange,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [position, setPosition] = useState<MenuPosition>({ x: 0, y: 0 });
    const menuRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLSpanElement>(null);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // 计算菜单位置，确保不超出视口
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const menuWidth = 200; // 预估菜单宽度
        const menuHeight = items.length * 36 + 16; // 预估菜单高度

        let x = e.clientX;
        let y = e.clientY;

        // 防止菜单超出右边界
        if (x + menuWidth > viewportWidth) {
            x = viewportWidth - menuWidth - 8;
        }

        // 防止菜单超出下边界
        if (y + menuHeight > viewportHeight) {
            y = viewportHeight - menuHeight - 8;
        }

        setPosition({ x, y });
        setIsOpen(true);
        onOpenChange?.(true);
    }, [items.length, onOpenChange]);

    const handleClose = useCallback(() => {
        setIsOpen(false);
        onOpenChange?.(false);
    }, [onOpenChange]);

    const handleItemClick = useCallback((item: ContextMenuItem) => {
        if (item.disabled) return;
        item.onClick?.();
        handleClose();
    }, [handleClose]);

    // 点击外部关闭
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                handleClose();
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleClose();
            }
        };

        const handleScroll = () => {
            handleClose();
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        document.addEventListener('scroll', handleScroll, true);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
            document.removeEventListener('scroll', handleScroll, true);
        };
    }, [isOpen, handleClose]);

    const menu = isOpen ? (
        <div
            ref={menuRef}
            className="fixed z-[9999] min-w-[180px] py-1.5 bg-white dark:bg-gray-800 rounded-[10px] shadow-lg border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-100"
            style={{
                left: position.x,
                top: position.y,
            }}
        >
            {items.map((item, index) => {
                if (item.divider) {
                    return (
                        <div
                            key={`divider-${index}`}
                            className="my-1 h-px bg-gray-200 dark:bg-gray-700"
                        />
                    );
                }

                return (
                    <button
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        disabled={item.disabled}
                        className={`
                            w-full flex items-center gap-3 px-3 py-2 text-sm text-left
                            transition-colors duration-75
                            ${item.disabled
                                ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                : item.danger
                                    ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }
                        `}
                    >
                        {item.icon && (
                            <span className="w-4 h-4 flex items-center justify-center opacity-70">
                                {item.icon}
                            </span>
                        )}
                        <span className="flex-1">{item.label}</span>
                        {item.shortcut && (
                            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                                {item.shortcut}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    ) : null;

    return (
        <>
            <span
                ref={triggerRef}
                onContextMenu={handleContextMenu}
                className="contents"
            >
                {children}
            </span>
            {menu && createPortal(menu, document.body)}
        </>
    );
};

// Hook for programmatic context menu
export const useContextMenu = () => {
    const [contextMenu, setContextMenu] = useState<{
        isOpen: boolean;
        position: MenuPosition;
        items: ContextMenuItem[];
    }>({
        isOpen: false,
        position: { x: 0, y: 0 },
        items: [],
    });

    const showContextMenu = useCallback((
        e: React.MouseEvent,
        items: ContextMenuItem[]
    ) => {
        e.preventDefault();
        e.stopPropagation();

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const menuWidth = 200;
        const menuHeight = items.length * 36 + 16;

        let x = e.clientX;
        let y = e.clientY;

        if (x + menuWidth > viewportWidth) {
            x = viewportWidth - menuWidth - 8;
        }
        if (y + menuHeight > viewportHeight) {
            y = viewportHeight - menuHeight - 8;
        }

        setContextMenu({
            isOpen: true,
            position: { x, y },
            items,
        });
    }, []);

    const hideContextMenu = useCallback(() => {
        setContextMenu(prev => ({ ...prev, isOpen: false }));
    }, []);

    return {
        contextMenu,
        showContextMenu,
        hideContextMenu,
    };
};

export default ContextMenu;
