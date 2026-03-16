/**
 * Provider 连接处理业务逻辑
 *
 * 职责：
 * - 处理不同认证方式的连接逻辑
 * - 动态获取模型列表
 * - 保存凭证
 *
 * 特点：
 * - 封装业务逻辑
 * - 统一错误处理
 * - 支持扩展
 *
 * @module services/providers/providerConnection
 * @version 1.0.0
 */

import type { AIProvider, ProviderModel, OAuthResult } from '../../types';
import { providerCredentialsStorage } from '../storage';
import { modelFetcher } from '../modelFetcher';
import { logger, LogTags } from '../../utils/logger';
import type { ProviderConnectResult } from './providerState';

// ==================== 类型定义 ====================

/**
 * API Key 连接参数
 */
export interface ApiKeyConnectParams {
  providerId: string;
  apiKey: string;
  provider: AIProvider;
}

/**
 * OAuth 连接参数
 */
export interface OAuthConnectParams {
  providerId: string;
  oauthResult: OAuthResult;
  provider: AIProvider;
}

/**
 * 环境变量连接参数
 */
export interface EnvConnectParams {
  providerId: string;
}

/**
 * 无认证连接参数
 */
export interface NoneConnectParams {
  providerId: string;
}

// ==================== 核心函数 ====================

/**
 * 尝试动态获取模型列表
 *
 * @param providerId - Provider ID
 * @param credential - 凭证（API Key 或 Access Token）
 * @param endpoint - API 端点
 * @param fallbackModels - 回退模型列表
 * @returns 模型列表
 */
async function fetchModelsIfSupported(
  providerId: string,
  credential: string,
  endpoint: string,
  fallbackModels: ProviderModel[]
): Promise<ProviderModel[]> {
  if (!modelFetcher.supportsDynamicFetch(providerId)) {
    return fallbackModels;
  }

  try {
    const { models, source } = await modelFetcher.fetchModels(
      providerId,
      credential,
      endpoint,
      fallbackModels
    );

    if (models.length > 0) {
      logger.info(LogTags.APP, `动态获取模型列表成功 (${source})`, {
        providerId,
        count: models.length,
      });
      return models;
    }

    return fallbackModels;
  } catch (error) {
    logger.warn(LogTags.APP, '动态获取模型列表失败，使用内置数据', {
      providerId,
      error,
    });
    return fallbackModels;
  }
}

/**
 * 处理 API Key 连接
 *
 * @param params - 连接参数
 * @returns 连接结果
 */
export async function handleApiKeyConnect(
  params: ApiKeyConnectParams
): Promise<ProviderConnectResult> {
  const { providerId, apiKey, provider } = params;

  try {
    // 保存凭证
    await providerCredentialsStorage.add({
      providerId,
      type: 'api',
      apiKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 尝试动态获取模型列表
    const models = await fetchModelsIfSupported(
      providerId,
      apiKey,
      provider.defaultEndpoint,
      provider.models
    );

    if (import.meta.env.DEV) {
      logger.debug(LogTags.APP, 'Provider 连接成功 (API Key)', {
        name: provider.name,
        modelCount: models.length,
      });
    }

    return {
      status: 'connected',
      source: 'api',
      models,
    };
  } catch (error) {
    logger.error(LogTags.APP, 'API Key 连接失败', {
      providerId,
      error,
    });
    return {
      status: 'error',
      errorMessage: String(error),
    };
  }
}

/**
 * 处理 OAuth 连接
 *
 * @param params - 连接参数
 * @returns 连接结果
 */
export async function handleOAuthConnect(
  params: OAuthConnectParams
): Promise<ProviderConnectResult> {
  const { providerId, oauthResult, provider } = params;

  try {
    if (!oauthResult || !oauthResult.accessToken) {
      throw new Error('OAuth 认证需要 oauthResult');
    }

    // 保存完整的 OAuth 凭证
    await providerCredentialsStorage.add({
      providerId,
      type: 'oauth',
      accessToken: oauthResult.accessToken,
      refreshToken: oauthResult.refreshToken,
      expiresAt: oauthResult.expiresAt,
      accountId: oauthResult.accountId,
      projectId: oauthResult.projectId,
      profileArn: oauthResult.profileArn,
      authMethod: oauthResult.authMethod,
      kiroClientId: oauthResult.kiroClientId,
      kiroClientSecret: oauthResult.kiroClientSecret,
      kiroSsoRegion: oauthResult.kiroSsoRegion,
      kiroStartUrl: oauthResult.kiroStartUrl,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 尝试动态获取模型列表
    const models = await fetchModelsIfSupported(
      providerId,
      oauthResult.accessToken,
      provider.defaultEndpoint,
      provider.models
    );

    if (import.meta.env.DEV) {
      logger.debug(LogTags.APP, 'Provider 连接成功 (OAuth)', {
        name: provider.name,
        hasRefreshToken: !!oauthResult.refreshToken,
        hasExpiresAt: !!oauthResult.expiresAt,
        expiresIn: oauthResult.expiresAt
          ? Math.round((oauthResult.expiresAt - Date.now()) / 1000) + 's'
          : 'N/A',
        modelCount: models.length,
      });
    }

    return {
      status: 'connected',
      source: 'oauth',
      models,
    };
  } catch (error) {
    logger.error(LogTags.APP, 'OAuth 连接失败', {
      providerId,
      error,
    });
    return {
      status: 'error',
      errorMessage: String(error),
    };
  }
}

/**
 * 处理环境变量连接
 *
 * @param params - 连接参数
 * @returns 连接结果
 */
export async function handleEnvConnect(
  params: EnvConnectParams
): Promise<ProviderConnectResult> {
  const { providerId } = params;

  try {
    await providerCredentialsStorage.add({
      providerId,
      type: 'env',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      status: 'connected',
      source: 'env',
    };
  } catch (error) {
    logger.error(LogTags.APP, '环境变量连接失败', {
      providerId,
      error,
    });
    return {
      status: 'error',
      errorMessage: String(error),
    };
  }
}

/**
 * 处理无认证连接
 *
 * @param params - 连接参数
 * @returns 连接结果
 */
export async function handleNoneConnect(
  params: NoneConnectParams
): Promise<ProviderConnectResult> {
  const { providerId } = params;

  try {
    await providerCredentialsStorage.add({
      providerId,
      type: 'none',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      status: 'connected',
      source: 'config',
    };
  } catch (error) {
    logger.error(LogTags.APP, '无认证连接失败', {
      providerId,
      error,
    });
    return {
      status: 'error',
      errorMessage: String(error),
    };
  }
}
