/**
 * 错误处理模块
 *
 * 提供统一的错误类系统，支持国际化和参数插值
 */

/**
 * 应用错误基类
 *
 * 所有自定义错误都应继承此类，支持国际化和参数插值
 */
export class AppError extends Error {
  /** i18n 翻译 key */
  readonly i18nKey: string;
  /** 翻译参数 */
  readonly params?: Record<string, string | number>;
  /** 原始错误（如果有） */
  readonly cause?: Error;

  constructor(i18nKey: string, params?: Record<string, string | number>, cause?: Error) {
    super(i18nKey);
    this.name = this.constructor.name;
    this.i18nKey = i18nKey;
    this.params = params;
    this.cause = cause;
  }
}

/**
 * 技能不存在错误
 */
export class SkillNotFoundError extends AppError {
  constructor(skillId: string) {
    super('errors.skill.notFound', { skillId });
  }
}

/**
 * 技能安装失败错误
 */
export class SkillInstallError extends AppError {
  constructor(reason: string, cause?: Error) {
    super('errors.skill.installFailed', { reason }, cause);
  }
}

/**
 * 模型获取失败错误
 */
export class ModelFetchError extends AppError {
  constructor(reason: string, cause?: Error) {
    super('errors.model.fetchFailed', { reason }, cause);
  }
}

/**
 * 提供商连接失败错误
 */
export class ProviderConnectionError extends AppError {
  constructor(provider: string, cause?: Error) {
    super('errors.provider.connectionFailed', { provider }, cause);
  }
}

/**
 * OAuth 认证错误
 */
export class OAuthError extends AppError {
  constructor(i18nKey: string, params?: Record<string, string | number>, cause?: Error) {
    super(i18nKey, params, cause);
  }
}

/**
 * 协议处理错误
 */
export class ProtocolError extends AppError {
  constructor(i18nKey: string, params?: Record<string, string | number>, cause?: Error) {
    super(i18nKey, params, cause);
  }
}
