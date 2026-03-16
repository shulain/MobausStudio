import React from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { I18nProvider } from '../i18n';

// Mock navigator.language 为中文
Object.defineProperty(navigator, 'language', {
    value: 'zh-CN',
    configurable: true,
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
        removeItem: vi.fn((key: string) => { delete store[key]; }),
        clear: vi.fn(() => { store = {}; }),
    };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

export const renderWithI18n = (component: React.ReactElement) => {
    return render(<I18nProvider>{component}</I18nProvider>);
};

export const resetMocks = () => {
    localStorageMock.clear();
    vi.clearAllMocks();
};
