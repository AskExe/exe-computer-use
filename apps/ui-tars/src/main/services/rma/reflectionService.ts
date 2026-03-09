import OpenAI from 'openai';
import { logger } from '@main/logger';

export interface ReflectionResult {
  summary: string;
  facts: ElementFact[];
}

export interface ElementFact {
  type: 'element' | 'structure' | 'workflow';
  element?: string;
  location?: string;
  selector?: string;
  description: string;
  domain: string;
}

const REFLECTION_PROMPT = `You are a memory agent observing a GUI automation task.
Given the screenshot and the last action taken, respond with JSON only:
{
  "summary": "one sentence: what changed on screen and why",
  "facts": [
    {
      "type": "element|structure|workflow",
      "element": "name of element (e.g., 'comment button', 'search input')",
      "location": "where it is on page (e.g., 'bottom right of post', 'top nav bar')",
      "selector": "css selector or xpath if visible",
      "description": "what it does",
      "domain": "domain name like 'linkedin.com'"
    }
  ]
}

Rules:
- summary must be under 20 words
- For elements: record button/input locations, selectors, and what they do
- For structure: record page layout patterns (e.g., "sidebar on left", "feed in center")
- For workflow: record multi-step patterns (e.g., "must click post first before commenting")
- ONLY record facts that are non-obvious and will help future automation
- If nothing useful found, return empty facts array
- Respond ONLY with valid JSON, no other text`;

export class ReflectionService {
  private client: OpenAI;
  private model: string;

  constructor(baseUrl: string, apiKey: string, model: string) {
    this.client = new OpenAI({ baseURL: baseUrl, apiKey });
    this.model = model;
  }

  async reflect(
    screenshotBase64: string,
    lastAction: string,
    instruction: string,
  ): Promise<ReflectionResult> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: REFLECTION_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Task: "${instruction}"\nLast action taken: ${lastAction}`,
              },
              {
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${screenshotBase64}` },
              },
            ],
          },
        ],
        max_tokens: 500,
        temperature: 0.1,
      });

      const text = response.choices[0]?.message?.content ?? '{}';
      const data = JSON.parse(text);
      return {
        summary: data.summary ?? 'Step completed',
        facts: Array.isArray(data.facts) ? data.facts : [],
      };
    } catch (e) {
      logger.error('[ReflectionService] error:', e);
      return { summary: 'Step completed', facts: [] };
    }
  }
}
