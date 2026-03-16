import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadProviderCredentialsSafe } from '../../../services/auth/providerCredentialAccess';
import { providerCredentialsStorage } from '../../../services/storage';
import { logger } from '../../../utils/logger';
import type { ProviderCredential } from '../../../types';

vi.mock('../../../services/storage', () => ({
  providerCredentialsStorage: {
    load: vi.fn(),
  },
}));

vi.mock('../../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
  LogTags: {
    AUTH: '[Auth]',
  },
}));

describe('providerCredentialAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-CRED-ACCESS-001: should return credentials when storage load succeeds', async () => {
    const mockCredentials: ProviderCredential[] = [
      {
        providerId: 'openai',
        type: 'api',
        apiKey: 'sk-test',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    vi.mocked(providerCredentialsStorage.load).mockResolvedValue(mockCredentials);

    const result = await loadProviderCredentialsSafe({
      context: '测试上下文',
    });

    expect(result).toEqual(mockCredentials);
  });

  it('TC-CRED-ACCESS-002: should return fallback and call onError when storage load fails', async () => {
    const fallback: ProviderCredential[] = [
      {
        providerId: 'fallback',
        type: 'none',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const onError = vi.fn();
    vi.mocked(providerCredentialsStorage.load).mockRejectedValue(new Error('load failed'));

    const result = await loadProviderCredentialsSafe({
      context: '读取凭证失败',
      fallback,
      onError,
    });

    expect(result).toEqual(fallback);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('load failed', expect.any(Error));
  });

  it('TC-CRED-ACCESS-003: should use empty array fallback by default', async () => {
    vi.mocked(providerCredentialsStorage.load).mockRejectedValue(new Error('boom'));

    const result = await loadProviderCredentialsSafe({
      context: '默认 fallback',
    });

    expect(result).toEqual([]);
  });

  it('TC-CRED-ACCESS-004: should log error with context on failure', async () => {
    vi.mocked(providerCredentialsStorage.load).mockRejectedValue(new Error('secure storage unavailable'));

    await loadProviderCredentialsSafe({
      context: 'Provider 页面加载凭证失败',
    });

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      '[Auth]',
      'Provider 页面加载凭证失败: secure storage unavailable',
      expect.any(Error)
    );
  });
});

