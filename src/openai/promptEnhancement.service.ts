import { notImplemented } from '@/utils/httpError';

export class PromptEnhancementService {
  enhancePrompt() {
    return notImplemented('OpenAI prompt enhancement');
  }
}

export const promptEnhancementService = new PromptEnhancementService();

