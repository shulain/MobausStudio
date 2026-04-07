/**
 * Model 状态管理纯函数
 *
 * 职责：
 * - 模型 CRUD 状态更新
 * - 模型状态变更（online/offline/error）
 * - 模型查找
 *
 * 特点：
 * - 纯函数，无副作用
 * - 易于测试
 * - 可复用
 *
 * @module services/models/modelState
 * @version 1.0.0
 */

import type { AIModelConfig, ModelCreateInput } from '../../types';

// ==================== 辅助函数 ====================

/**
 * v4.3.0: 判断模型是否支持多模态
 *
 * v4.2.5: 初始版本
 * v4.3.0: 添加 o3/o4-mini/gpt-4.1/gpt-5/chatgpt-4o 系列支持
 *
 * @param modelName - 模型名称
 * @param provider - 提供商 ID
 * @returns 是否支持多模态
 */
function supportsMultimodal(modelName: string, provider: string): boolean {
  const lowerName = modelName.toLowerCase();

  // OpenAI 支持多模态的模型
  if (provider === 'openai' || provider === 'chatgpt') {
    // o1 系列不支持多模态
    if (lowerName.includes('o1')) {
      return false;
    }
    // o3/o4-mini 系列支持多模态
    if (lowerName.includes('o3') || lowerName.includes('o4-mini')) {
      return true;
    }
    return lowerName.includes('gpt-4o') ||
           lowerName.includes('gpt-4-turbo') ||
           lowerName.includes('gpt-4-vision') ||
           lowerName.includes('gpt-4.1') ||
           lowerName.includes('gpt-5') ||
           lowerName.includes('vision') ||
           lowerName.includes('chatgpt-4o');
  }

  // Anthropic Claude 3+ 系列都支持
  if (provider === 'anthropic') {
    return lowerName.includes('claude-3') ||
           lowerName.includes('claude-4');
  }

  // Google Gemini 系列都支持
  if (provider === 'google') {
    return lowerName.includes('gemini');
  }

  // 其他提供商默认不支持（包括自定义提供商）
  return false;
}

// ==================== 纯函数 ====================

/**
 * 添加模型
 *
 * @param models - 模型列表
 * @param data - 模型创建输入
 * @param id - 模型 ID（外部生成）
 * @returns 更新后的模型列表
 *
 * @example
 * ```ts
 * const updated = addModel(models, data, Date.now().toString());
 * ```
 */
export function addModel(
  models: AIModelConfig[],
  data: ModelCreateInput,
  id: string
): AIModelConfig[] {
  const newModel: AIModelConfig = {
    id,
    name: data.name,
    modelId: data.modelId,
    provider: data.provider,
    status: 'offline',
    apiKeySet: !!data.apiKey,
    apiKey: data.apiKey,
    endpoint: data.baseUrl || '',
    maxTokens: data.maxTokens || 4096,
    pricing: { input: 0, output: 0 },
    temperature: data.temperature || 0.7,
    accountId: data.accountId,
    projectId: data.projectId,
    useProviderCredential: data.useProviderCredential,
    protocol: data.protocol,
    supportsMultimodal: supportsMultimodal(data.name, data.provider),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return [...models, newModel];
}

/**
 * 更新模型
 *
 * @param models - 模型列表
 * @param id - 模型 ID
 * @param data - 更新数据
 * @returns 更新后的模型列表
 *
 * @example
 * ```ts
 * const updated = updateModel(models, 'model-1', data);
 * ```
 */
export function updateModel(
  models: AIModelConfig[],
  id: string,
  data: ModelCreateInput
): AIModelConfig[] {
  return models.map(model =>
    model.id === id
      ? {
          ...model,
          name: data.name,
          modelId: data.modelId,
          provider: data.provider,
          // 如果提供了新的 API Key 则更新，否则保留原有的
          apiKey: data.apiKey || model.apiKey,
          apiKeySet: !!(data.apiKey || model.apiKey),
          endpoint: data.baseUrl || model.endpoint,
          maxTokens: data.maxTokens || model.maxTokens,
          temperature: data.temperature ?? model.temperature,
          accountId: data.accountId || model.accountId,
          projectId: data.projectId || model.projectId,
          useProviderCredential: data.useProviderCredential,
          protocol: data.protocol || model.protocol,
          supportsMultimodal: supportsMultimodal(data.name, data.provider),
          updatedAt: new Date(),
        }
      : model
  );
}

/**
 * 删除模型
 *
 * @param models - 模型列表
 * @param id - 模型 ID
 * @returns 更新后的模型列表
 *
 * @example
 * ```ts
 * const updated = deleteModel(models, 'model-1');
 * ```
 */
export function deleteModel(
  models: AIModelConfig[],
  id: string
): AIModelConfig[] {
  return models.filter(m => m.id !== id);
}

/**
 * 更新模型状态
 *
 * @param models - 模型列表
 * @param id - 模型 ID
 * @param status - 新状态
 * @returns 更新后的模型列表
 *
 * @example
 * ```ts
 * const updated = updateModelStatus(models, 'model-1', 'online');
 * ```
 */
export function updateModelStatus(
  models: AIModelConfig[],
  id: string,
  status: 'online' | 'offline' | 'error'
): AIModelConfig[] {
  return models.map(m =>
    m.id === id
      ? { ...m, status, updatedAt: new Date() }
      : m
  );
}

/**
 * 查找模型
 *
 * @param models - 模型列表
 * @param id - 模型 ID
 * @returns 模型或 undefined
 *
 * @example
 * ```ts
 * const model = findModel(models, 'model-1');
 * ```
 */
export function findModel(
  models: AIModelConfig[],
  id: string
): AIModelConfig | undefined {
  return models.find(m => m.id === id);
}
