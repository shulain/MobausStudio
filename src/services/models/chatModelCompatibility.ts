import type { AIModel } from '../../types';

export const CHATGPT_WEB_CANONICAL_MODEL_ID = 'gpt-5.4-mini';

type CompatibleModel = Pick<AIModel, 'id' | 'provider' | 'status'> & {
  name?: string;
  modelId?: string;
  accountId?: string;
  useProviderCredential?: boolean;
};

function isChatGptWebModel(model: CompatibleModel | undefined): boolean {
  return Boolean(
    model &&
    model.provider === 'openai' &&
    (model.useProviderCredential || model.accountId)
  );
}

function getUpstreamModelId(model: CompatibleModel | undefined): string {
  return (model?.modelId || model?.name || model?.id || '').trim();
}

function isChatGptWebAlias(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  return (
    normalized === CHATGPT_WEB_CANONICAL_MODEL_ID ||
    normalized === 'gpt-5.4' ||
    normalized.startsWith('gpt-5.4-') ||
    normalized.startsWith('gpt-5.3') ||
    normalized.startsWith('gpt-5.2') ||
    normalized.startsWith('gpt-5.1') ||
    normalized === 'gpt-5' ||
    normalized.startsWith('gpt-5-') ||
    normalized === 'codex' ||
    normalized === 'codex-mini-latest'
  );
}

function getCanonicalChatGptWebModel(models: CompatibleModel[]): CompatibleModel | undefined {
  return models.find(
    model =>
      getUpstreamModelId(model).toLowerCase() === CHATGPT_WEB_CANONICAL_MODEL_ID &&
      isChatGptWebModel(model)
  );
}

export function normalizeChatModelId(modelId: string | null | undefined, models: CompatibleModel[]): string {
  if (!modelId) return '';

  const canonical = getCanonicalChatGptWebModel(models);
  if (!canonical || modelId === canonical.id) {
    return modelId;
  }

  const currentModel = models.find(model => model.id === modelId);
  if (currentModel) {
    return isChatGptWebModel(currentModel) && isChatGptWebAlias(getUpstreamModelId(currentModel))
      ? canonical.id
      : modelId;
  }

  if (isChatGptWebAlias(modelId)) {
    return canonical.id;
  }

  return modelId;
}

export function getChatModelRequestName(model: CompatibleModel | undefined): string {
  const upstreamModelId = getUpstreamModelId(model);
  if (model && isChatGptWebModel(model) && isChatGptWebAlias(upstreamModelId)) {
    return CHATGPT_WEB_CANONICAL_MODEL_ID;
  }
  return upstreamModelId;
}

export function getChatModelDisplayName(model: CompatibleModel | undefined, fallback = ''): string {
  if (!model) return fallback;

  const requestName = getChatModelRequestName(model);
  if (requestName === CHATGPT_WEB_CANONICAL_MODEL_ID && isChatGptWebModel(model)) {
    return CHATGPT_WEB_CANONICAL_MODEL_ID;
  }

  return model.name || model.modelId || model.id || fallback;
}

export function getAvailableChatModels<T extends CompatibleModel>(models: T[]): T[] {
  const canonical = getCanonicalChatGptWebModel(models);

  if (!canonical) {
    return models;
  }

  return models.filter(model => {
    if (model.id === canonical.id) return true;
    return !(isChatGptWebAlias(getUpstreamModelId(model)) && isChatGptWebModel(model));
  });
}

export function getDefaultChatModelId(models: CompatibleModel[]): string {
  const availableModels = getAvailableChatModels(models);
  return (
    availableModels.find(model => model.status === 'online')?.id ||
    availableModels[0]?.id ||
    models[0]?.id ||
    ''
  );
}
