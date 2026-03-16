/**
 * PKCE (Proof Key for Code Exchange) 工具模块
 *
 * 提供 OAuth 2.0 PKCE 扩展所需的工具函数
 * 用于生成 code_verifier 和 code_challenge
 *
 * 参考规范: RFC 7636 - Proof Key for Code Exchange by OAuth Public Clients
 * https://datatracker.ietf.org/doc/html/rfc7636
 *
 * @module utils/pkce
 * @version 3.4.5
 */

import { logger, LogTags } from './logger';

// ==================== 类型定义 ====================

/**
 * PKCE 参数接口
 *
 * @property verifier - code_verifier，用于 token 交换
 * @property challenge - code_challenge，用于授权请求
 */
export interface PKCEParams {
    /** code_verifier: 43-128 字符的随机字符串 */
    verifier: string;
    /** code_challenge: verifier 的 SHA-256 哈希值（Base64URL 编码） */
    challenge: string;
}

// ==================== 工具函数 ====================

/**
 * 生成指定长度的随机字符串
 *
 * 使用 Web Crypto API 生成密码学安全的随机数
 * 字符集: A-Z, a-z, 0-9, -, _, ~, . (RFC 7636 允许的字符)
 *
 * @param length - 字符串长度，默认 64
 * @returns 随机字符串
 *
 * @example
 * ```typescript
 * const randomStr = generateRandomString(32);
 * // 输出类似: "aB3x_Y7z-Kp2mN9qR4sT6uV8wX0yZ1cD"
 * ```
 */
export function generateRandomString(length: number = 64): string {
    // RFC 7636 允许的字符集: unreserved characters
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const randomValues = new Uint8Array(length);

    // 使用 Web Crypto API 生成密码学安全的随机数
    crypto.getRandomValues(randomValues);

    let result = '';
    for (let i = 0; i < length; i++) {
        result += charset[randomValues[i] % charset.length];
    }

    return result;
}

/**
 * 生成 PKCE 参数（code_verifier 和 code_challenge）
 *
 * 根据 RFC 7636 规范:
 * - code_verifier: 43-128 字符的随机字符串
 * - code_challenge: code_verifier 的 SHA-256 哈希值，Base64URL 编码
 * - code_challenge_method: 固定为 "S256"
 *
 * @returns Promise<PKCEParams> - 包含 verifier 和 challenge 的对象
 *
 * @example
 * ```typescript
 * const pkce = await generatePKCE();
 * console.log(pkce.verifier);   // 用于 token 交换
 * console.log(pkce.challenge);  // 用于授权请求
 * ```
 */
export async function generatePKCE(): Promise<PKCEParams> {
    // 生成 code_verifier (64 字符，符合 43-128 的要求)
    const verifier = generateRandomString(64);

    // 计算 code_challenge = BASE64URL(SHA256(code_verifier))
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // 转换为 Base64URL 编码（不带填充）
    const hashArray = new Uint8Array(hashBuffer);
    const base64 = btoa(String.fromCharCode(...hashArray));
    const challenge = base64
        .replace(/\+/g, '-')  // + -> -
        .replace(/\//g, '_')  // / -> _
        .replace(/=+$/, '');  // 移除尾部填充

    logger.debug(LogTags.AUTH, '生成 PKCE 参数', {
        verifierLength: verifier.length,
        challengeLength: challenge.length,
    });

    return { verifier, challenge };
}

/**
 * 生成 OAuth state 参数
 *
 * state 参数用于防止 CSRF 攻击
 * 应在授权请求前生成，并在回调时验证
 *
 * @param length - state 长度，默认 32
 * @returns 随机 state 字符串
 *
 * @example
 * ```typescript
 * const state = generateState();
 * // 保存 state 用于后续验证
 * sessionStorage.setItem('oauth_state', state);
 * ```
 */
export function generateState(length: number = 32): string {
    return generateRandomString(length);
}

/**
 * 验证 state 参数
 *
 * 比较回调中的 state 与之前保存的 state 是否一致
 * 用于防止 CSRF 攻击
 *
 * @param expected - 预期的 state（之前保存的）
 * @param actual - 实际收到的 state（回调中的）
 * @returns 是否匹配
 *
 * @example
 * ```typescript
 * const savedState = sessionStorage.getItem('oauth_state');
 * const callbackState = new URLSearchParams(location.search).get('state');
 * if (!validateState(savedState, callbackState)) {
 *     throw new Error('State mismatch - possible CSRF attack');
 * }
 * ```
 */
export function validateState(expected: string | null, actual: string | null): boolean {
    if (!expected || !actual) {
        logger.warn(LogTags.AUTH, 'State 验证失败: 缺少参数', { expected: !!expected, actual: !!actual });
        return false;
    }

    const isValid = expected === actual;
    if (!isValid) {
        logger.warn(LogTags.AUTH, 'State 验证失败: 不匹配');
    }

    return isValid;
}

// ==================== 导出 ====================

export default {
    generateRandomString,
    generatePKCE,
    generateState,
    validateState,
};
