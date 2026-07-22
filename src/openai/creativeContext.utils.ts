import type { CreativeContext, ImageAnalysis, JsonObject } from '@/models/prompt.model';

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return strings.length ? strings : undefined;
}

export function parseJsonObject(value: string): JsonObject | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function mergeCreativeContext(base: CreativeContext, patch: CreativeContext): CreativeContext {
  const next: CreativeContext = { ...base };

  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      const existing = Array.isArray(next[key]) ? (next[key] as unknown[]) : [];
      const merged = [...existing, ...value].filter((item, index, all) => {
        if (typeof item !== 'string') {
          return true;
        }

        return all.findIndex((candidate) => candidate === item) === index;
      });
      next[key] = merged;
      return;
    }

    if (isRecord(value) && isRecord(next[key])) {
      next[key] = mergeCreativeContext(next[key] as CreativeContext, value as CreativeContext);
      return;
    }

    next[key] = value;
  });

  return next;
}

export function imageAnalysisToContext(analysis: ImageAnalysis): CreativeContext {
  return {
    industry: analysis.industry,
    campaignType: analysis.campaignType,
    marketingGoal: analysis.marketingGoal,
    subject: analysis.subject,
    objects: analysis.objects,
    background: analysis.background,
    composition: analysis.composition,
    visualHierarchy: analysis.visualHierarchy,
    typography: analysis.typography,
    fontStyle: analysis.fontStyle,
    colors: analysis.colors,
    brandStyle: analysis.brandStyle,
    mood: analysis.mood,
    lighting: analysis.lighting,
    cameraAngle: analysis.cameraAngle,
    cta: analysis.cta,
    whiteSpace: analysis.whiteSpace,
    logoPlacement: analysis.logoPlacement,
    designStyle: analysis.designStyle,
    platform: analysis.platform,
    aspectRatio: analysis.aspectRatio,
    imageQuality: analysis.imageQuality,
    designTechniques: analysis.designTechniques,
    effectiveness: analysis.whyThisCreativeWorks?.join(' '),
    ...(analysis.creativeContext ?? {}),
  };
}

export function fallbackContextFromText(text: string): CreativeContext {
  const source = text.toLowerCase();
  const context: CreativeContext = {
    userRequests: text.trim() ? [text.trim()] : [],
  };
  const isRealEstateBrief = [
    'real estate',
    'property',
    'apartment',
    'residence',
    'residences',
    'residential',
    'bhk',
    'duplex',
    'rera',
    'developer',
    'tower',
    'homes',
    'flat',
  ].some((term) => source.includes(term));
  const isHealthcareBrief = /\b(clinic|healthcare|hospital|doctor|medical|patient|patients)\b/i.test(text);
  const projectNameMatch = text.match(/\bSubham\s+Kishori\s+Heights\b/i);

  if (isRealEstateBrief) {
    context.industry = 'Real Estate';
    context.campaignType = source.includes('luxury') ? 'Luxury property campaign' : 'Residential property campaign';
    context.audience = source.includes('luxury') ? 'Luxury buyers' : 'Home buyers';
    context.marketingGoal = 'Generate qualified property enquiries';
    context.subject = projectNameMatch
      ? `${projectNameMatch[0]} active lifestyle residences`
      : 'Residential property project';
    context.designStyle = source.includes('minimal') ? 'Premium minimal' : 'Modern property showcase';
    context.colors = source.includes('gold') ? ['Gold', 'Black', 'White'] : ['Deep Blue', 'White', 'Warm Neutral'];
  } else if (isHealthcareBrief) {
    context.industry = 'Healthcare';
    context.campaignType = 'Trust-led healthcare campaign';
    context.audience = 'Patients and families';
    context.designStyle = 'Clean healthcare editorial';
    context.colors = ['Teal', 'White', 'Soft Gray'];
  } else if (source.includes('restaurant') || source.includes('food') || source.includes('cafe')) {
    context.industry = 'Food and Beverage';
    context.campaignType = 'Food promotion';
    context.audience = 'Local diners';
    context.designStyle = 'Appetizing social ad';
    context.colors = ['Warm Red', 'Cream', 'Charcoal'];
  }

  if (source.includes('instagram')) {
    context.platform = 'Instagram';
    context.aspectRatio = source.includes('story') ? '9:16' : '1:1';
  } else if (source.includes('linkedin')) {
    context.platform = 'LinkedIn';
    context.aspectRatio = '1.91:1';
  } else if (source.includes('facebook')) {
    context.platform = 'Facebook';
    context.aspectRatio = '4:5';
  }

  if (source.includes('remove cta') || source.includes('no cta') || source.includes('without cta')) {
    context.cta = null;
  } else if (source.includes('book')) {
    context.cta = 'Book now';
  }

  if (source.includes('premium') || source.includes('luxury')) {
    context.mood = 'Premium, refined, aspirational';
    context.typography = 'Elegant high-contrast typography';
    context.whiteSpace = 'Generous whitespace';
  }

  if (source.includes('keep layout')) {
    context.composition = 'Keep the reference layout structure';
  }

  if (source.includes('change color') || source.includes('change colours') || source.includes('change colors')) {
    context.constraints = ['Change the color palette while preserving the core layout'];
  }

  return context;
}
