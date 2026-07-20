import OpenAI from 'openai';

import { env } from '@/config/env';

export function createOpenAIClient() {
  if (!env.openaiApiKey) {
    return null;
  }

  return new OpenAI({
    apiKey: env.openaiApiKey,
  });
}

