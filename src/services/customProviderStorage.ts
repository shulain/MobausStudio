/**
 * 自定义提供商存储服务 (v0.9.3)
 *
 * 管理用户添加的自定义 AI 提供商配置
 * 支持 Tauri 文件系统和浏览器 localStorage 双重存储
 *
 * @module services/customProviderStorage
 * @version 0.9.3
 */

import { invoke } from '@tauri-apps/api/core';
import { logger, LogTags } from '../utils/logger';
import type { CustomProvider } from '../types';

const STORAGE_KEY = 'mobaus_custom_providers';

/**
 * 检查是否在 Tauri 环境中运行
 */
function isTauri(): boolean {
    return typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
}

/**
 * 自定义提供商存储服务
 */
class CustomProviderStorage {
    /**
     * 保存所有自定义提供商
     *
     * @param providers 自定义提供商列表
     */
    async save(providers: CustomProvider[]): Promise<void> {
        const providersStr = JSON.stringify(providers, null, 2);

        // Tauri 环境：优先使用文件系统存储
        if (isTauri()) {
            try {
                await invoke('save_custom_providers', { providers: providersStr });
            } catch (error) {
                logger.error(LogTags.STORAGE, 'Tauri custom provider save failed', error);
                throw error;
            }
        } else {
            // 浏览器环境：使用 localStorage
            localStorage.setItem(STORAGE_KEY, providersStr);
        }
    }

    /**
     * 加载所有自定义提供商
     *
     * @returns 自定义提供商列表
     */
    async load(): Promise<CustomProvider[]> {
        try {
            let providersStr: string | null = null;

            // Tauri 环境：优先从文件系统加载
            if (isTauri()) {
                try {
                    providersStr = await invoke<string>('load_custom_providers');
                } catch (error) {
                    logger.error(LogTags.STORAGE, 'Tauri custom provider load failed', error);
                    throw error;
                }
            } else {
                // 浏览器环境：从 localStorage 加载
                providersStr = localStorage.getItem(STORAGE_KEY);
            }

            if (!providersStr) {
                return [];
            }

            const providers = JSON.parse(providersStr) as CustomProvider[];

            // 转换日期字符串为 Date 对象
            return providers.map(p => ({
                ...p,
                createdAt: new Date(p.createdAt),
                updatedAt: new Date(p.updatedAt),
            }));
        } catch (error) {
            logger.error(LogTags.STORAGE, 'Failed to load custom providers', error);
            return [];
        }
    }

    /**
     * 添加单个自定义提供商
     *
     * @param provider 自定义提供商对象
     */
    async add(provider: CustomProvider): Promise<void> {
        const providers = await this.load();
        providers.push(provider);
        await this.save(providers);
    }

    /**
     * 更新自定义提供商
     *
     * @param id 提供商 ID
     * @param updates 更新字段
     */
    async update(id: string, updates: Partial<CustomProvider>): Promise<void> {
        const providers = await this.load();
        const index = providers.findIndex(p => p.id === id);

        if (index === -1) {
            throw new Error(`自定义提供商不存在: ${id}`);
        }

        providers[index] = {
            ...providers[index],
            ...updates,
            updatedAt: new Date(),
        };

        await this.save(providers);
    }

    /**
     * 删除自定义提供商
     *
     * @param id 提供商 ID
     */
    async remove(id: string): Promise<void> {
        const providers = await this.load();
        const filtered = providers.filter(p => p.id !== id);

        if (filtered.length === providers.length) {
            throw new Error(`自定义提供商不存在: ${id}`);
        }

        await this.save(filtered);
    }

    /**
     * 获取指定自定义提供商
     *
     * @param id 提供商 ID
     * @returns 自定义提供商对象或 null
     */
    async get(id: string): Promise<CustomProvider | null> {
        const providers = await this.load();
        return providers.find(p => p.id === id) || null;
    }

    /**
     * 清除所有自定义提供商
     */
    async clear(): Promise<void> {
        await this.save([]);
    }

    /**
     * 生成唯一 ID
     *
     * @returns 格式为 custom-{timestamp} 的 ID
     */
    generateId(): string {
        return `custom-${Date.now()}`;
    }
}

// 导出单例
export const customProviderStorage = new CustomProviderStorage();
