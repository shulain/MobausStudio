import { describe, expect, it } from 'vitest';
import {
  getAvailableChatModels,
  getChatModelDisplayName,
  getChatModelRequestName,
  getDefaultChatModelId,
  normalizeChatModelId,
} from '../../services/models/chatModelCompatibility';
import type { AIModelConfig } from '../../types';

const model = (overrides: Partial<AIModelConfig> = {}): AIModelConfig => ({
  id: 'model',
  name: 'Model',
  provider: 'openai',
  status: 'online',
  apiKeySet: true,
  endpoint: 'https://api.openai.com/v1',
  maxTokens: 128000,
  pricing: { input: 0, output: 0 },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

describe('chatModelCompatibility', () => {
  it('normalizes ChatGPT Web internal config ids to the verified canonical model config when present', () => {
    const models = [
      model({ id: '1775562595035', name: 'gpt-5.4', useProviderCredential: true, accountId: 'acct' }),
      model({ id: '1775563000000', name: 'gpt-5.4-mini', useProviderCredential: true, accountId: 'acct' }),
    ];

    expect(normalizeChatModelId('1775562595035', models)).toBe('1775563000000');
    expect(normalizeChatModelId('gpt-5.3-codex', models)).toBe('1775563000000');
    expect(getAvailableChatModels(models).map(m => m.id)).toEqual(['1775563000000']);
  });

  it('preserves existing ChatGPT Web config ids while displaying and requesting the canonical verified model', () => {
    const legacyConfig = model({
      id: '1775562595035',
      name: 'gpt-5.4',
      useProviderCredential: true,
      accountId: 'acct',
    });

    expect(normalizeChatModelId('1775562595035', [legacyConfig])).toBe('1775562595035');
    expect(getAvailableChatModels([legacyConfig]).map(m => m.id)).toEqual(['1775562595035']);
    expect(getChatModelDisplayName(legacyConfig)).toBe('gpt-5.4-mini');
    expect(getChatModelRequestName(legacyConfig)).toBe('gpt-5.4-mini');
  });

  it('does not rewrite standalone API key OpenAI models', () => {
    const models = [
      model({ id: '1775562595035', name: 'gpt-5.4', useProviderCredential: false }),
      model({ id: '1775563000000', name: 'gpt-5.4-mini', useProviderCredential: false }),
    ];

    expect(normalizeChatModelId('1775562595035', models)).toBe('1775562595035');
    expect(getChatModelDisplayName(models[0])).toBe('gpt-5.4');
    expect(getChatModelRequestName(models[0])).toBe('gpt-5.4');
    expect(getAvailableChatModels(models).map(m => m.id)).toEqual(['1775562595035', '1775563000000']);
  });

  it('uses the first online compatible model as the default chat model', () => {
    const models = [
      model({ id: 'offline-model', status: 'offline' }),
      model({ id: '1775562595035', name: 'gpt-5.4', useProviderCredential: true, accountId: 'acct' }),
      model({ id: '1775563000000', name: 'gpt-5.4-mini', useProviderCredential: true, accountId: 'acct' }),
    ];

    expect(getDefaultChatModelId(models)).toBe('1775563000000');
  });
});
