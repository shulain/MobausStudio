/**
 * @file modelState.test.ts
 * @description modelState 纯函数单元测试
 *
 * 测试用例：
 * - TC-MODEL-STATE-001: addModel - 创建模型
 * - TC-MODEL-STATE-002: updateModel - 更新模型
 * - TC-MODEL-STATE-003: updateModel - API Key 保留
 * - TC-MODEL-STATE-004: deleteModel - 删除模型
 * - TC-MODEL-STATE-005: updateModelStatus - 更新状态
 * - TC-MODEL-STATE-006: findModel - 查找存在
 * - TC-MODEL-STATE-007: findModel - 查找不存在
 * - TC-MODEL-STATE-008: updateModel - id 不存在
 *
 * @version 1.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  addModel,
  updateModel,
  deleteModel,
  updateModelStatus,
  findModel,
} from '../../../services/models/modelState';
import type { AIModelConfig, ModelCreateInput } from '../../../types';

// ==================== 测试辅助 ====================

const createMockModel = (id: string): AIModelConfig => ({
  id,
  name: `Model ${id}`,
  provider: 'openai',
  status: 'offline',
  apiKeySet: true,
  apiKey: 'sk-test-key',
  endpoint: 'https://api.openai.com',
  maxTokens: 4096,
  pricing: { input: 0, output: 0 },
  temperature: 0.7,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const createMockInput = (): ModelCreateInput => ({
  name: 'GPT-4',
  modelId: 'gpt-4',
  provider: 'openai',
  apiKey: 'sk-new-key',
  baseUrl: 'https://api.openai.com',
  maxTokens: 8192,
  temperature: 0.5,
});

// ==================== 测试用例 ====================

describe('modelState 纯函数测试', () => {
  // ==================== TC-MODEL-STATE-001 ====================
  it('TC-MODEL-STATE-001: addModel - 创建模型', () => {
    const models: AIModelConfig[] = [createMockModel('model-1')];
    const data = createMockInput();

    const result = addModel(models, data, 'model-2');

    // 列表长度增加
    expect(result).toHaveLength(2);

    // 新模型字段正确
    const newModel = result[1];
    expect(newModel.id).toBe('model-2');
    expect(newModel.name).toBe('GPT-4');
    expect(newModel.modelId).toBe('gpt-4');
    expect(newModel.provider).toBe('openai');
    expect(newModel.status).toBe('offline');
    expect(newModel.apiKeySet).toBe(true);
    expect(newModel.apiKey).toBe('sk-new-key');
    expect(newModel.maxTokens).toBe(8192);
    expect(newModel.temperature).toBe(0.5);
    expect(newModel.createdAt).toBeInstanceOf(Date);

    // 原有模型不受影响
    expect(result[0].id).toBe('model-1');
  });

  // ==================== TC-MODEL-STATE-002 ====================
  it('TC-MODEL-STATE-002: updateModel - 更新模型', () => {
    const models: AIModelConfig[] = [createMockModel('model-1')];
    const data = createMockInput();

    const result = updateModel(models, 'model-1', data);

    expect(result[0].name).toBe('GPT-4');
    expect(result[0].modelId).toBe('gpt-4');
    expect(result[0].provider).toBe('openai');
    expect(result[0].apiKey).toBe('sk-new-key');
    expect(result[0].maxTokens).toBe(8192);
    expect(result[0].temperature).toBe(0.5);
  });

  // ==================== TC-MODEL-STATE-003 ====================
  it('TC-MODEL-STATE-003: updateModel - API Key 保留', () => {
    const models: AIModelConfig[] = [createMockModel('model-1')];
    const data: ModelCreateInput = {
      name: 'Updated',
      provider: 'openai',
      apiKey: '', // 空 API Key
    };

    const result = updateModel(models, 'model-1', data);

    // 保留旧的 API Key
    expect(result[0].apiKey).toBe('sk-test-key');
    expect(result[0].apiKeySet).toBe(true);
  });

  // ==================== TC-MODEL-STATE-004 ====================
  it('TC-MODEL-STATE-004: deleteModel - 删除模型', () => {
    const models: AIModelConfig[] = [
      createMockModel('model-1'),
      createMockModel('model-2'),
    ];

    const result = deleteModel(models, 'model-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('model-2');
  });

  // ==================== TC-MODEL-STATE-005 ====================
  it('TC-MODEL-STATE-005: updateModelStatus - 更新状态', () => {
    const models: AIModelConfig[] = [createMockModel('model-1')];

    const result = updateModelStatus(models, 'model-1', 'online');

    expect(result[0].status).toBe('online');
    expect(result[0].updatedAt).toBeInstanceOf(Date);
  });

  // ==================== TC-MODEL-STATE-006 ====================
  it('TC-MODEL-STATE-006: findModel - 查找存在', () => {
    const models: AIModelConfig[] = [
      createMockModel('model-1'),
      createMockModel('model-2'),
    ];

    const model = findModel(models, 'model-1');

    expect(model).toBeDefined();
    expect(model?.id).toBe('model-1');
  });

  // ==================== TC-MODEL-STATE-007 ====================
  it('TC-MODEL-STATE-007: findModel - 查找不存在', () => {
    const models: AIModelConfig[] = [createMockModel('model-1')];

    const model = findModel(models, 'non-existent');

    expect(model).toBeUndefined();
  });

  // ==================== TC-MODEL-STATE-008 ====================
  it('TC-MODEL-STATE-008: updateModel - id 不存在', () => {
    const models: AIModelConfig[] = [createMockModel('model-1')];
    const data = createMockInput();

    const result = updateModel(models, 'non-existent', data);

    // 列表不变
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Model model-1');
  });
});
