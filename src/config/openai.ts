import { createRequire } from 'node:module';
import type OpenAI from 'openai';

import { env } from '@/config/env';

type OpenAIConstructor = new (config: { apiKey: string }) => OpenAI;

const requireOpenAI = createRequire(__filename);
const openAIModule = requireOpenAI('openai') as
  | OpenAIConstructor
  | {
      OpenAI?: OpenAIConstructor;
      default?: OpenAIConstructor;
    };

function resolveOpenAIConstructor() {
  if (typeof openAIModule === 'function') {
    return openAIModule;
  }

  const constructor = openAIModule.default ?? openAIModule.OpenAI;

  if (!constructor) {
    throw new Error('OpenAI SDK constructor is unavailable.');
  }

  return constructor;
}

export function createOpenAIClient() {
  if (!env.openaiApiKey) {
    return null;
  }

  const OpenAIClient = resolveOpenAIConstructor();

  return new OpenAIClient({
    apiKey: env.openaiApiKey,
  });
}
