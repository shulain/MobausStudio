import React, { useState, useRef, useEffect } from 'react';
import { Search, Check, ChevronDown } from 'lucide-react';

interface InputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    type?: 'text' | 'password' | 'email' | 'number';
    className?: string;
    disabled?: boolean;
    icon?: React.ReactNode;
    /** 键盘事件处理 (v2.4.0) */
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export const Input: React.FC<InputProps> = ({
    value,
    onChange,
    placeholder,
    type = 'text',
    className = '',
    disabled = false,
    icon,
    onKeyDown,
}) => {
    return (
        <div className="relative">
            {icon && (
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
                    {icon}
                </div>
            )}
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                className={`
          w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-[10px]
          bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100
          placeholder-gray-400 dark:placeholder-gray-500
          focus:outline-none focus:border-purple-500 dark:focus:border-purple-400 transition-colors
          disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed
          ${icon ? 'pl-10' : ''}
          ${className}
        `}
            />
        </div>
    );
};

interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
    value,
    onChange,
    placeholder = '搜索...',
    className = '',
}) => {
    return (
        <div className={`relative ${className}`}>
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-[10px] text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-purple-300 dark:focus:border-purple-500 focus:bg-white dark:focus:bg-gray-700 transition-all"
            />
        </div>
    );
};

interface TextareaProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    rows?: number;
    className?: string;
    disabled?: boolean;
}

export const Textarea: React.FC<TextareaProps> = ({
    value,
    onChange,
    placeholder,
    rows = 3,
    className = '',
    disabled = false,
}) => {
    return (
        <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            disabled={disabled}
            className={`
        w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-[10px]
        bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100
        placeholder-gray-400 dark:placeholder-gray-500
        focus:outline-none focus:border-purple-500 dark:focus:border-purple-400 transition-colors
        resize-none disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed
        ${className}
      `}
        />
    );
};

/**
 * v3.6.5: 全新自定义下拉组件
 * 完全替换原生 select，支持更丰富的样式和交互
 */

interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
    /** v3.6.5: 是否显示已连接标识 */
    connected?: boolean;
}

interface SelectProps {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[] | { value: string; label: string }[];
    className?: string;
    disabled?: boolean;
    /** v3.6.4: 占位符文本 */
    placeholder?: string;
}

export const Select: React.FC<SelectProps> = ({
    value,
    onChange,
    options,
    className = '',
    disabled = false,
    placeholder,
}) => {
    // v3.6.5: 下拉框展开状态
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // 获取当前选中项的标签
    const selectedOption = options.find(opt => opt.value === value);
    const displayLabel = selectedOption?.label || placeholder || '请选择...';

    // v3.6.5: 点击外部关闭下拉框
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    // v3.6.5: 键盘导航支持
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (disabled) return;

        switch (e.key) {
            case 'Enter':
            case ' ':
                e.preventDefault();
                setIsOpen(!isOpen);
                break;
            case 'Escape':
                setIsOpen(false);
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (!isOpen) {
                    setIsOpen(true);
                } else {
                    // 选择下一个选项
                    const currentIndex = options.findIndex(opt => opt.value === value);
                    const nextIndex = Math.min(currentIndex + 1, options.length - 1);
                    const nextOption = options[nextIndex];
                    if (nextOption && !(nextOption as SelectOption).disabled) {
                        onChange(nextOption.value);
                    }
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (isOpen) {
                    // 选择上一个选项
                    const currentIndex = options.findIndex(opt => opt.value === value);
                    const prevIndex = Math.max(currentIndex - 1, 0);
                    const prevOption = options[prevIndex];
                    if (prevOption && !(prevOption as SelectOption).disabled) {
                        onChange(prevOption.value);
                    }
                }
                break;
        }
    };

    // v3.6.5: 处理选项点击
    const handleOptionClick = (optionValue: string, isDisabled?: boolean) => {
        if (isDisabled) return;
        onChange(optionValue);
        setIsOpen(false);
    };

    // v3.6.5: 解析标签，分离名称和连接状态
    const parseLabel = (label: string) => {
        // 检查是否包含 "● 已连接" 标识
        if (label.includes(' ● 已连接')) {
            return {
                name: label.replace(' ● 已连接', ''),
                connected: true,
            };
        }
        return { name: label, connected: false };
    };

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            {/* 触发按钮 */}
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                className={`
                    w-full px-4 py-3 border rounded-[10px] text-left
                    flex items-center justify-between gap-2
                    transition-all duration-200
                    ${isOpen
                        ? 'border-purple-500 dark:border-purple-400 ring-2 ring-purple-500/20 dark:ring-purple-400/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                    }
                    ${disabled
                        ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed opacity-60'
                        : 'bg-white dark:bg-gray-800 cursor-pointer'
                    }
                `}
            >
                <span className={`flex-1 truncate ${!selectedOption ? 'text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-100'}`}>
                    {(() => {
                        const { name, connected } = parseLabel(displayLabel);
                        return (
                            <span className="flex items-center gap-2">
                                <span className="truncate">{name}</span>
                                {connected && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full shrink-0">
                                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                        已连接
                                    </span>
                                )}
                            </span>
                        );
                    })()}
                </span>
                <ChevronDown
                    className={`w-5 h-5 text-gray-400 dark:text-gray-500 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>

            {/* 下拉选项列表 */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-[10px] shadow-lg max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150">
                    {options.map((opt) => {
                        const isSelected = opt.value === value;
                        const isDisabled = (opt as SelectOption).disabled;
                        const { name, connected } = parseLabel(opt.label);

                        return (
                            <div
                                key={opt.value}
                                onClick={() => handleOptionClick(opt.value, isDisabled)}
                                className={`
                                    px-4 py-2.5 flex items-center justify-between gap-2
                                    transition-colors duration-100
                                    ${isDisabled
                                        ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed bg-gray-50 dark:bg-gray-700/50'
                                        : isSelected
                                            ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                                            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
                                    }
                                `}
                            >
                                <span className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="truncate">{name}</span>
                                    {connected && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full shrink-0">
                                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                            已连接
                                        </span>
                                    )}
                                </span>
                                {isSelected && !isDisabled && (
                                    <Check className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

interface ToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
}

export const Toggle: React.FC<ToggleProps> = ({
    checked,
    onChange,
    disabled = false,
}) => {
    return (
        <label className="relative inline-flex items-center cursor-pointer">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                disabled={disabled}
                className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500 peer-disabled:opacity-50"></div>
        </label>
    );
};

export default Input;

