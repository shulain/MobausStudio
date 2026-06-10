/**
 * @file storage.test.ts
 * @description 数据存储服务单元测试
 * 测试 modelsStorage、chatsStorage、settingsStorage 等存储模块
 * 使用同步方法 (loadSync/saveSync) 进行测试，因为浏览器测试环境不支持 Tauri
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
    modelsStorage,
    agentsStorage,
    skillsStorage,
    mcpServersStorage,
    chatsStorage,
    dataExport,
    settingsStorage
} from '../../services/storage';
import type { AIModelConfig, Agent } from '../../types';

describe('Storage Service', () => {
    // 每个测试前清空 localStorage
    beforeEach(() => {
        localStorage.clear();
        delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
        vi.mocked(invoke).mockReset();
        vi.restoreAllMocks();
    });

    describe('modelsStorage', () => {
        // 模拟模型数据
        const mockModel: AIModelConfig = {
            id: 'test-model',
            name: 'Test Model',
            provider: 'OpenAI',
            status: 'offline',
            apiKeySet: false,
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
            apiKey: 'sk-test-key',
            maxTokens: 1000,
            endpoint: 'https://api.openai.com',
            pricing: { input: 0.1, output: 0.2 }
        };

        /**
         * v2.5.2: API Key 现在直接存储在模型配置中，不再隐藏/加密
         * 此测试验证 API Key 正确保存
         */
        it('保存模型时应保留 API Key', () => {
            // 使用同步保存方法
            modelsStorage.saveSync([mockModel]);

            const stored = localStorage.getItem('mobaus_models');
            expect(stored).toBeTruthy();
            const parsed = JSON.parse(stored!);
            // v2.5.2: API Key 直接存储，不再加密
            expect(parsed[0].apiKey).toBe('sk-test-key');
            expect(parsed[0].id).toBe(mockModel.id);
        });

        it('应正确加载模型数据', () => {
            const savedModel = { ...mockModel, apiKey: '***ENCRYPTED***' };
            localStorage.setItem('mobaus_models', JSON.stringify([savedModel]));

            // 使用同步加载方法
            const loaded = modelsStorage.loadSync();
            expect(loaded).toHaveLength(1);
            expect(loaded[0].id).toBe(mockModel.id);
            expect(loaded[0].createdAt).toBeInstanceOf(Date);
        });

        it('应正确添加新模型', async () => {
            await modelsStorage.add(mockModel);
            const loaded = modelsStorage.loadSync();
            expect(loaded).toHaveLength(1);
            expect(loaded[0].id).toBe(mockModel.id);
        });

        it('应正确更新现有模型', async () => {
            modelsStorage.saveSync([mockModel]);
            const updates = { name: 'Updated Name' };
            await modelsStorage.update(mockModel.id, updates);

            const loaded = modelsStorage.loadSync();
            expect(loaded[0].name).toBe('Updated Name');
            expect(loaded[0].updatedAt.getTime()).toBeGreaterThan(mockModel.updatedAt!.getTime());
        });

        it('应正确删除模型', async () => {
            modelsStorage.saveSync([mockModel]);
            await modelsStorage.delete(mockModel.id);
            const loaded = modelsStorage.loadSync();
            expect(loaded).toHaveLength(0);
        });

        // v2.5.2: API Key 现在直接存储在模型配置中，不再需要单独的存储方法
        it('应将 API Key 直接存储在模型配置中', () => {
            const modelWithKey = { ...mockModel, apiKey: 'secret-key' };
            modelsStorage.saveSync([modelWithKey]);
            const loaded = modelsStorage.loadSync();
            expect(loaded[0].apiKey).toBe('secret-key');
        });
    });

    describe('dataExport', () => {
        /**
         * SET-55: 全选导出
         * 验证导出所有数据时，JSON 包含所有字段且数据完整
         */
        it('SET-55: 应正确导出所有数据', () => {
            const mockAgent: Agent = {
                id: 'agent-1',
                name: 'Test Agent',
                description: 'Desc',
                model: 'gpt-4',
                skills: [],
                systemPrompt: '',
                temperature: 0.7,
                maxTokens: 1000,
                status: 'active',
                createdAt: new Date(),
                updatedAt: new Date(),
                usageCount: 0
            };

            agentsStorage.save([mockAgent]);
            settingsStorage.save({ theme: 'dark', language: 'en' });

            const json = dataExport.exportAll();
            const data = JSON.parse(json);

            expect(data.agents).toHaveLength(1);
            expect(data.settings.theme).toBe('dark');
            expect(data.exportedAt).toBeTruthy();
        });

        /**
         * SET-50: 导出 Models 配置
         * 验证勾选 Models 导出时，JSON 包含 models 字段
         */
        it('SET-50: 导出 Models 配置应正确', () => {
            const mockModel: AIModelConfig = {
                id: 'model-1',
                name: 'Test Model',
                provider: 'OpenAI',
                status: 'offline',
                apiKeySet: true,
                apiKey: 'sk-test',
                maxTokens: 4096,
                endpoint: 'https://api.openai.com',
                pricing: { input: 0.01, output: 0.03 },
                createdAt: new Date(),
                updatedAt: new Date()
            };

            modelsStorage.saveSync([mockModel]);

            const json = dataExport.exportAll();
            const data = JSON.parse(json);

            expect(data.models).toBeDefined();
            expect(data.models).toHaveLength(1);
            expect(data.models[0].id).toBe('model-1');
            expect(data.models[0].name).toBe('Test Model');
        });

        /**
         * SET-53: 导出 MCP 配置
         * 验证勾选 MCP 导出时，JSON 包含 mcp 字段（使用正确键名 mobaus_mcp_servers）
         */
        it('SET-53: 导出 MCP 配置应使用正确键名', async () => {
            const mockMcpServer: any = {
                id: 'mcp-1',
                name: 'Test MCP Server',
                description: 'Test server',
                transportType: 'stdio',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-test'],
                authType: 'none',
                status: 'disconnected',
                requestCount: 0,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await mcpServersStorage.save([mockMcpServer]);

            const json = dataExport.exportAll();
            const data = JSON.parse(json);

            expect(data.mcpServers).toBeDefined();
            expect(data.mcpServers).toHaveLength(1);
            expect(data.mcpServers[0].name).toBe('Test MCP Server');
        });

        /**
         * SET-56: 导入包含 Models
         * 验证导入含 models 的 JSON 时，Models 数据正确恢复
         */
        it('SET-56: 导入包含 Models 的数据应正确恢复', () => {
            const importData = {
                settings: { theme: 'light', language: 'zh' },
                models: [{
                    id: 'imported-model',
                    name: 'Imported',
                    provider: 'OpenAI',
                    status: 'offline',
                    apiKeySet: false,
                    maxTokens: 1000,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }]
            };

            const result = dataExport.importAll(JSON.stringify(importData));
            expect(result).toBe(true);

            const settings = settingsStorage.load();
            expect(settings.theme).toBe('light');

            const models = modelsStorage.loadSync();
            expect(models).toHaveLength(1);
            expect(models[0].id).toBe('imported-model');
            expect(models[0].createdAt).toBeInstanceOf(Date);
        });

        /**
         * SET-57: 导入包含 MCP
         * 验证导入含 mcp 的 JSON 时，MCP 服务器配置正确恢复
         */
        it('SET-57: 导入包含 MCP 的数据应正确恢复', async () => {
            const importData = {
                mcpServers: [{
                    id: 'imported-mcp',
                    name: 'Imported MCP Server',
                    description: 'Imported server',
                    transportType: 'stdio',
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-test'],
                    authType: 'none',
                    status: 'disconnected',
                    requestCount: 0,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }]
            };

            const result = dataExport.importAll(JSON.stringify(importData));
            expect(result).toBe(true);

            const servers = await mcpServersStorage.load();
            expect(servers).toHaveLength(1);
            expect(servers[0].id).toBe('imported-mcp');
            expect(servers[0].name).toBe('Imported MCP Server');
        });

        it('应优雅处理无效的导入数据', () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
            const result = dataExport.importAll('invalid json');
            expect(result).toBe(false);
            expect(consoleSpy).toHaveBeenCalled();
        });

        it('应正确清除所有数据', () => {
            localStorage.setItem('mobaus_models', '[]');
            localStorage.setItem('mobaus_api_keys', '{}');

            dataExport.clearAll();

            expect(localStorage.getItem('mobaus_models')).toBeNull();
            expect(localStorage.getItem('mobaus_api_keys')).toBeNull();
        });
    });

    describe('settingsStorage', () => {
        /**
         * SET-40: 同步加载默认值
         * v4.2.0: 默认语言现在根据系统语言自动检测
         * 测试环境中 navigator.language 通常是 'en-US'，所以默认返回 'en'
         */
        it('SET-40: 不存在配置时应返回默认设置', () => {
            const settings = settingsStorage.load();
            expect(settings.theme).toBe('system');
            // 默认语言根据系统语言自动检测，测试环境通常是英文
            expect(['zh', 'en']).toContain(settings.language);
        });

        /**
         * SET-41: 同步保存设置
         */
        it('SET-41: 应正确同步保存和加载设置', () => {
            settingsStorage.saveSync({ theme: 'dark', language: 'en' });
            const settings = settingsStorage.load();
            expect(settings.theme).toBe('dark');
            expect(settings.language).toBe('en');
        });

        /**
         * SET-42: 异步保存设置（浏览器环境回退到 localStorage）
         */
        it('SET-42: 异步保存应回退到 localStorage', async () => {
            await settingsStorage.save({ theme: 'light', language: 'zh' });
            const settings = settingsStorage.load();
            expect(settings.theme).toBe('light');
            expect(settings.language).toBe('zh');
        });

        /**
         * SET-43: 异步加载设置（浏览器环境回退到 localStorage）
         */
        it('SET-43: 异步加载应回退到 localStorage', async () => {
            settingsStorage.saveSync({ theme: 'dark', language: 'en' });
            const settings = await settingsStorage.loadAsync();
            expect(settings.theme).toBe('dark');
            expect(settings.language).toBe('en');
        });

        /**
         * SET-44: 部分设置更新
         * 验证更新单个设置时保留其他设置
         */
        it('SET-44: 更新单个设置时应保留其他设置', async () => {
            // 初始设置
            settingsStorage.saveSync({ theme: 'dark', language: 'en' });

            // 只更新主题
            const current = settingsStorage.load();
            await settingsStorage.save({ ...current, theme: 'light' });

            const settings = settingsStorage.load();
            expect(settings.theme).toBe('light');
            expect(settings.language).toBe('en'); // 语言保持不变
        });
    });

    describe('Other Storage Modules', () => {
        it('agentsStorage: 增删改查', async () => {
            const agent: Agent = {
                id: '1', name: 'Agent', description: '', model: 'gpt-4',
                skills: [], systemPrompt: '', temperature: 0.7, maxTokens: 1000,
                status: 'active', createdAt: new Date(), updatedAt: new Date(), usageCount: 0
            };

            // agentsStorage 所有方法都是异步的 (v2.2.0)
            await agentsStorage.add(agent);
            const loaded = await agentsStorage.load();
            expect(loaded).toHaveLength(1);

            await agentsStorage.update('1', { name: 'Updated' });
            const updated = await agentsStorage.load();
            expect(updated[0].name).toBe('Updated');

            await agentsStorage.delete('1');
            const deleted = await agentsStorage.load();
            expect(deleted).toHaveLength(0);
        });

        it('skillsStorage: 增删改查', async () => {
            const skill: any = { id: '1', name: 'Skill', createdAt: new Date(), updatedAt: new Date() };

            // v2.2.0: skillsStorage 方法都是异步的
            await skillsStorage.add(skill);
            const loaded = await skillsStorage.load();
            expect(loaded).toHaveLength(1);

            await skillsStorage.update('1', { name: 'Updated' });
            const updated = await skillsStorage.load();
            expect(updated[0].name).toBe('Updated');

            await skillsStorage.delete('1');
            const deleted = await skillsStorage.load();
            expect(deleted).toHaveLength(0);
        });

        it('mcpServersStorage: 增删改查', async () => {
            const server: any = {
                id: '1', name: 'Server',
                createdAt: new Date(), updatedAt: new Date()
            };

            // mcpServersStorage 所有方法都是异步的 (v1.1.0)
            await mcpServersStorage.add(server);
            const loaded = await mcpServersStorage.load();
            expect(loaded).toHaveLength(1);

            await mcpServersStorage.update('1', { name: 'Updated' });
            const updated = await mcpServersStorage.load();
            expect(updated[0].name).toBe('Updated');

            await mcpServersStorage.delete('1');
            const deleted = await mcpServersStorage.load();
            expect(deleted).toHaveLength(0);
        });

        it('chatsStorage: 增删改查', async () => {
            const chat: any = {
                id: '1',
                title: 'Chat',
                messages: [],
                starred: false,
                model: 'gpt-4',
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await chatsStorage.add(chat);
            const loaded = chatsStorage.loadSync();
            expect(loaded).toHaveLength(1);

            await chatsStorage.update('1', { title: 'Updated' });
            const updated = chatsStorage.loadSync();
            expect(updated[0].title).toBe('Updated');

            await chatsStorage.delete('1');
            const deleted = chatsStorage.loadSync();
            expect(deleted).toHaveLength(0);
        });
    });

    // ==================== MCP 持久化专项测试 (v2.0.1) ====================

    describe('mcpServersStorage 持久化', () => {
        /**
         * MCP-P01: stdio 服务器持久化
         * 验证 stdio 类型服务器的完整配置在保存后能正确恢复
         */
        it('MCP-P01: stdio 服务器配置应正确持久化', async () => {
            const stdioServer: any = {
                id: 'stdio-server-1',
                name: 'Filesystem Server',
                description: '文件系统访问',
                transportType: 'stdio',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
                env: { NODE_ENV: 'production' },
                authType: 'none',
                status: 'disconnected',
                requestCount: 0,
                createdAt: new Date('2024-01-01'),
                updatedAt: new Date('2024-01-01'),
            };

            // 保存
            await mcpServersStorage.save([stdioServer]);

            // 从 localStorage 读取原始数据验证字段映射
            const stored = localStorage.getItem('mobaus_mcp_servers');
            expect(stored).toBeTruthy();
            const parsed = JSON.parse(stored!);

            // 验证关键字段映射：transportType -> transport_type
            expect(parsed[0].transport_type).toBe('stdio');
            expect(parsed[0].command).toBe('npx');
            expect(parsed[0].args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/tmp']);
            expect(parsed[0].env).toEqual({ NODE_ENV: 'production' });

            // 验证不应存在 camelCase 字段（避免数据污染）
            expect(parsed[0].transportType).toBeUndefined();
            expect(parsed[0].authType).toBeUndefined();

            // 加载并验证
            const loaded = await mcpServersStorage.load();
            expect(loaded).toHaveLength(1);
            expect(loaded[0].transportType).toBe('stdio');
            expect(loaded[0].command).toBe('npx');
            expect(loaded[0].args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/tmp']);
        });

        /**
         * MCP-P02: http 服务器持久化
         * 验证 http 类型服务器的 endpoint 配置正确保存
         */
        it('MCP-P02: http 服务器配置应正确持久化', async () => {
            const httpServer: any = {
                id: 'http-server-1',
                name: 'Remote MCP Server',
                description: '远程 MCP 服务',
                transportType: 'http',
                endpoint: 'https://mcp.example.com/api',
                authType: 'apikey',
                authValue: 'sk-test-key-12345',
                status: 'disconnected',
                requestCount: 5,
                createdAt: new Date('2024-01-01'),
                updatedAt: new Date('2024-01-01'),
            };

            await mcpServersStorage.save([httpServer]);

            const stored = localStorage.getItem('mobaus_mcp_servers');
            const parsed = JSON.parse(stored!);

            // 验证 http 配置
            expect(parsed[0].transport_type).toBe('http');
            expect(parsed[0].endpoint).toBe('https://mcp.example.com/api');
            expect(parsed[0].auth_type).toBe('apikey');
            expect(parsed[0].auth_value).toBe('sk-test-key-12345');

            // 加载验证
            const loaded = await mcpServersStorage.load();
            expect(loaded[0].transportType).toBe('http');
            expect(loaded[0].endpoint).toBe('https://mcp.example.com/api');
            expect(loaded[0].authType).toBe('apikey');
        });

        /**
         * MCP-P03: 认证信息持久化
         * 验证各种认证类型的信息正确保存和恢复
         */
        it('MCP-P03: 认证信息应正确持久化', async () => {
            const serverWithAuth: any = {
                id: 'auth-server',
                name: 'Auth Server',
                description: '',
                transportType: 'http',
                endpoint: 'https://api.example.com',
                authType: 'token',
                authValue: 'Bearer my-secret-token',
                status: 'disconnected',
                requestCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            await mcpServersStorage.save([serverWithAuth]);

            const stored = localStorage.getItem('mobaus_mcp_servers');
            const parsed = JSON.parse(stored!);

            expect(parsed[0].auth_type).toBe('token');
            expect(parsed[0].auth_value).toBe('Bearer my-secret-token');

            const loaded = await mcpServersStorage.load();
            expect(loaded[0].authType).toBe('token');
            expect(loaded[0].authValue).toBe('Bearer my-secret-token');
        });

        /**
         * MCP-P04: 运行时字段不持久化
         * 验证 tools、serverInfo 等运行时字段不会被保存
         */
        it('MCP-P04: 运行时字段不应被持久化', async () => {
            const serverWithRuntimeData: any = {
                id: 'runtime-server',
                name: 'Server with Runtime Data',
                description: '',
                transportType: 'stdio',
                command: 'node',
                args: ['server.js'],
                authType: 'none',
                status: 'connected',  // 运行时状态
                errorMessage: '连接超时',  // 运行时错误
                serverInfo: { name: 'test-server', version: '1.0.0' },  // 运行时信息
                capabilities: { tools: true, resources: false },  // 运行时能力
                tools: [{ name: 'read_file', description: '读取文件' }],  // 运行时工具列表
                requestCount: 10,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            await mcpServersStorage.save([serverWithRuntimeData]);

            const stored = localStorage.getItem('mobaus_mcp_servers');
            const parsed = JSON.parse(stored!);

            // 验证运行时字段未被保存
            expect(parsed[0].status).toBe('disconnected');  // 重置为断开
            expect(parsed[0].errorMessage).toBeUndefined();
            expect(parsed[0].error_message).toBeUndefined();
            expect(parsed[0].serverInfo).toBeUndefined();
            expect(parsed[0].capabilities).toBeUndefined();
            expect(parsed[0].tools).toBeUndefined();

            // 持久化字段应保留
            expect(parsed[0].transport_type).toBe('stdio');
            expect(parsed[0].command).toBe('node');
            expect(parsed[0].request_count).toBe(10);
        });

        /**
         * MCP-P05: 编辑服务器后持久化
         * 验证更新操作后数据正确保存
         */
        it('MCP-P05: 编辑服务器后应正确持久化', async () => {
            const originalServer: any = {
                id: 'edit-test',
                name: 'Original Name',
                description: 'Original Description',
                transportType: 'stdio',
                command: 'npx',
                args: ['-y', 'old-package'],
                authType: 'none',
                status: 'disconnected',
                requestCount: 0,
                createdAt: new Date('2024-01-01'),
                updatedAt: new Date('2024-01-01'),
            };

            await mcpServersStorage.save([originalServer]);

            // 更新服务器
            await mcpServersStorage.update('edit-test', {
                name: 'Updated Name',
                args: ['-y', 'new-package'],
            });

            const loaded = await mcpServersStorage.load();
            expect(loaded[0].name).toBe('Updated Name');
            expect(loaded[0].args).toEqual(['-y', 'new-package']);
            expect(loaded[0].updatedAt.getTime()).toBeGreaterThan(originalServer.updatedAt.getTime());
        });

        /**
         * MCP-P06: transport_type 字段映射验证
         * 确保前端 transportType 正确映射为后端 transport_type
         */
        it('MCP-P06: transport_type 字段映射应正确', async () => {
            const server: any = {
                id: 'mapping-test',
                name: 'Mapping Test',
                description: '',
                transportType: 'stdio',
                command: 'test',
                authType: 'none',
                status: 'disconnected',
                requestCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // 使用同步保存方法也测试
            mcpServersStorage.saveSync([server]);

            const stored = localStorage.getItem('mobaus_mcp_servers');
            const parsed = JSON.parse(stored!);

            // 验证字段名正确转换
            expect(parsed[0]).toHaveProperty('transport_type');
            expect(parsed[0]).toHaveProperty('auth_type');
            expect(parsed[0]).toHaveProperty('created_at');
            expect(parsed[0]).toHaveProperty('updated_at');

            // 验证不存在 camelCase 字段
            expect(parsed[0]).not.toHaveProperty('transportType');
            expect(parsed[0]).not.toHaveProperty('authType');
            expect(parsed[0]).not.toHaveProperty('createdAt');
            expect(parsed[0]).not.toHaveProperty('updatedAt');
        });

        /**
         * 边界情况：空列表保存
         */
        it('保存空列表应正常工作', async () => {
            await mcpServersStorage.save([]);

            const stored = localStorage.getItem('mobaus_mcp_servers');
            expect(stored).toBe('[]');

            const loaded = await mcpServersStorage.load();
            expect(loaded).toEqual([]);
        });

        /**
         * 边界情况：多服务器保存
         */
        it('多服务器应正确保存和加载', async () => {
            const servers: any[] = [
                {
                    id: 'server-1',
                    name: 'Server 1',
                    description: '',
                    transportType: 'stdio',
                    command: 'cmd1',
                    authType: 'none',
                    status: 'disconnected',
                    requestCount: 0,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    id: 'server-2',
                    name: 'Server 2',
                    description: '',
                    transportType: 'http',
                    endpoint: 'http://localhost:8080',
                    authType: 'apikey',
                    authValue: 'key123',
                    status: 'disconnected',
                    requestCount: 0,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ];

            await mcpServersStorage.save(servers);

            const loaded = await mcpServersStorage.load();
            expect(loaded).toHaveLength(2);
            expect(loaded[0].transportType).toBe('stdio');
            expect(loaded[1].transportType).toBe('http');
            expect(loaded[1].authValue).toBe('key123');
        });

        // ==================== v2.2.0 enabled/autoStart 测试 ====================

        /**
         * MCP-P07: enabled 字段持久化
         * 验证 enabled=false 在保存后能正确恢复
         */
        it('MCP-P07: enabled 字段应正确持久化', async () => {
            const disabledServer: any = {
                id: 'disabled-server',
                name: 'Disabled Server',
                description: '已禁用的服务器',
                transportType: 'stdio',
                command: 'npx',
                enabled: false,  // 禁用
                autoStart: false,
                authType: 'none',
                status: 'disconnected',
                requestCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            await mcpServersStorage.save([disabledServer]);

            // 验证保存的原始数据
            const stored = localStorage.getItem('mobaus_mcp_servers');
            const parsed = JSON.parse(stored!);
            expect(parsed[0].enabled).toBe(false);

            // 验证加载后的数据
            const loaded = await mcpServersStorage.load();
            expect(loaded[0].enabled).toBe(false);
        });

        /**
         * MCP-P08: autoStart 字段持久化
         * 验证 autoStart=true 在保存后能正确恢复
         */
        it('MCP-P08: autoStart 字段应正确持久化', async () => {
            const autoStartServer: any = {
                id: 'autostart-server',
                name: 'Auto Start Server',
                description: '自动启动的服务器',
                transportType: 'stdio',
                command: 'npx',
                enabled: true,
                autoStart: true,  // 自动启动
                authType: 'none',
                status: 'disconnected',
                requestCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            await mcpServersStorage.save([autoStartServer]);

            // 验证保存的原始数据 (camelCase -> snake_case)
            const stored = localStorage.getItem('mobaus_mcp_servers');
            const parsed = JSON.parse(stored!);
            expect(parsed[0].auto_start).toBe(true);
            expect(parsed[0].enabled).toBe(true);

            // 验证加载后的数据 (snake_case -> camelCase)
            const loaded = await mcpServersStorage.load();
            expect(loaded[0].autoStart).toBe(true);
            expect(loaded[0].enabled).toBe(true);
        });

        /**
         * MCP-P09: 新建服务器默认值
         * 验证不指定 enabled/autoStart 时使用默认值
         */
        it('MCP-P09: 新建服务器应使用默认 enabled/autoStart 值', async () => {
            const serverWithoutFlags: any = {
                id: 'no-flags-server',
                name: 'Server Without Flags',
                description: '',
                transportType: 'stdio',
                command: 'npx',
                // 不设置 enabled 和 autoStart
                authType: 'none',
                status: 'disconnected',
                requestCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            await mcpServersStorage.save([serverWithoutFlags]);

            // 验证默认值：enabled=true, autoStart=false
            const stored = localStorage.getItem('mobaus_mcp_servers');
            const parsed = JSON.parse(stored!);
            expect(parsed[0].enabled).toBe(true);  // 默认启用
            expect(parsed[0].auto_start).toBe(false);  // 默认不自动启动

            // 加载验证
            const loaded = await mcpServersStorage.load();
            expect(loaded[0].enabled).toBe(true);
            expect(loaded[0].autoStart).toBe(false);
        });

        /**
         * MCP-E06: 切换启用状态后持久化
         * 验证通过 update 方法切换 enabled 状态
         */
        it('MCP-E06: 切换启用状态应正确持久化', async () => {
            const server: any = {
                id: 'toggle-server',
                name: 'Toggle Server',
                description: '',
                transportType: 'stdio',
                command: 'npx',
                enabled: true,
                autoStart: false,
                authType: 'none',
                status: 'disconnected',
                requestCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            await mcpServersStorage.save([server]);

            // 切换为禁用
            await mcpServersStorage.update('toggle-server', { enabled: false });

            const loaded = await mcpServersStorage.load();
            expect(loaded[0].enabled).toBe(false);

            // 再切换回启用
            await mcpServersStorage.update('toggle-server', { enabled: true });

            const reloaded = await mcpServersStorage.load();
            expect(reloaded[0].enabled).toBe(true);
        });

        /**
         * 兼容性测试：旧数据迁移
         * 验证没有 enabled/autoStart 字段的旧数据能正确加载
         */
        it('旧数据应兼容加载（无 enabled/autoStart 字段）', async () => {
            // 模拟旧版本数据（没有 enabled 和 auto_start 字段）
            const oldData = [{
                id: 'old-server',
                name: 'Old Server',
                description: '',
                transport_type: 'stdio',
                command: 'npx',
                auth_type: 'none',
                status: 'disconnected',
                request_count: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                // 没有 enabled 和 auto_start 字段
            }];

            localStorage.setItem('mobaus_mcp_servers', JSON.stringify(oldData));

            // 加载应使用默认值
            const loaded = await mcpServersStorage.load();
            expect(loaded[0].enabled).toBe(true);  // 默认启用
            expect(loaded[0].autoStart).toBe(false);  // 默认不自动启动
        });

        it('MCP-SEC-001: Tauri 保存失败时不应回退到 localStorage', async () => {
            Object.defineProperty(window, '__TAURI_INTERNALS__', {
                value: {},
                configurable: true,
            });
            vi.mocked(invoke).mockRejectedValueOnce(
                new Error("MCP 服务器 'Bad MCP' 的 stdio 配置无效: stdio command must be an executable name or path, not a shell command string")
            );

            const unsafeServer: any = {
                id: 'unsafe-server',
                name: 'Bad MCP',
                description: 'unsafe',
                transportType: 'stdio',
                command: 'npx;rm -rf /',
                authType: 'none',
                status: 'disconnected',
                requestCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            await expect(mcpServersStorage.save([unsafeServer])).rejects.toThrow(/stdio 配置无效/);
            expect(localStorage.getItem('mobaus_mcp_servers')).toBeNull();
        });

        it('MCP-SEC-002: Tauri 加载失败时不应回退到陈旧 localStorage', async () => {
            Object.defineProperty(window, '__TAURI_INTERNALS__', {
                value: {},
                configurable: true,
            });
            localStorage.setItem('mobaus_mcp_servers', JSON.stringify([{
                id: 'stale-unsafe',
                name: 'Stale Unsafe',
                transport_type: 'stdio',
                command: 'bash',
                auth_type: 'none',
                status: 'disconnected',
                request_count: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }]));
            vi.mocked(invoke).mockRejectedValueOnce(new Error('native MCP store unavailable'));

            await expect(mcpServersStorage.load()).rejects.toThrow(/native MCP store unavailable/);
        });
    });

    // ==================== v2.2.1 请求计数持久化测试 ====================

    describe('mcpServersStorage 请求计数', () => {
        /**
         * MCP-C03: 请求计数持久化
         * 验证 requestCount 在保存后能正确恢复
         */
        it('MCP-C03: requestCount 应正确持久化', async () => {
            const serverWithCount: any = {
                id: 'count-server',
                name: 'Count Server',
                description: '',
                transportType: 'stdio',
                command: 'npx',
                enabled: true,
                autoStart: false,
                authType: 'none',
                status: 'disconnected',
                requestCount: 42,  // 已有请求计数
                lastActiveAt: new Date('2024-01-15T10:30:00Z'),
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            await mcpServersStorage.save([serverWithCount]);

            // 验证保存的原始数据
            const stored = localStorage.getItem('mobaus_mcp_servers');
            const parsed = JSON.parse(stored!);
            expect(parsed[0].request_count).toBe(42);

            // 验证加载后的数据
            const loaded = await mcpServersStorage.load();
            expect(loaded[0].requestCount).toBe(42);
        });

        /**
         * MCP-C04: 请求计数累加后持久化
         * 验证更新 requestCount 后正确保存
         */
        it('MCP-C04: 更新 requestCount 应正确持久化', async () => {
            const server: any = {
                id: 'increment-server',
                name: 'Increment Server',
                description: '',
                transportType: 'stdio',
                command: 'npx',
                enabled: true,
                autoStart: false,
                authType: 'none',
                status: 'disconnected',
                requestCount: 10,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            await mcpServersStorage.save([server]);

            // 模拟增加请求计数
            await mcpServersStorage.update('increment-server', { requestCount: 13 });

            const loaded = await mcpServersStorage.load();
            expect(loaded[0].requestCount).toBe(13);
        });

        /**
         * MCP-C05: lastActiveAt 更新持久化
         * 验证 lastActiveAt 在保存后能正确恢复
         */
        it('MCP-C05: lastActiveAt 应正确持久化', async () => {
            const activeTime = new Date('2024-01-20T15:45:00Z');
            const server: any = {
                id: 'active-server',
                name: 'Active Server',
                description: '',
                transportType: 'stdio',
                command: 'npx',
                enabled: true,
                autoStart: false,
                authType: 'none',
                status: 'disconnected',
                requestCount: 5,
                lastActiveAt: activeTime,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            await mcpServersStorage.save([server]);

            // 验证保存的原始数据
            const stored = localStorage.getItem('mobaus_mcp_servers');
            const parsed = JSON.parse(stored!);
            expect(parsed[0].last_active_at).toBe(activeTime.toISOString());

            // 验证加载后的数据
            const loaded = await mcpServersStorage.load();
            expect(loaded[0].lastActiveAt).toBeInstanceOf(Date);
            expect(loaded[0].lastActiveAt!.getTime()).toBe(activeTime.getTime());
        });

        /**
         * 请求计数默认值测试
         * 验证不指定 requestCount 时使用默认值 0
         */
        it('新建服务器 requestCount 默认为 0', async () => {
            const serverWithoutCount: any = {
                id: 'no-count-server',
                name: 'No Count Server',
                description: '',
                transportType: 'stdio',
                command: 'npx',
                enabled: true,
                autoStart: false,
                authType: 'none',
                status: 'disconnected',
                // 不设置 requestCount
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            await mcpServersStorage.save([serverWithoutCount]);

            const loaded = await mcpServersStorage.load();
            expect(loaded[0].requestCount).toBe(0);
        });
    });
});
