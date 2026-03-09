import OpenAI from 'openai';
import { logger } from '@main/logger';

export interface ReflectionResult {
  summary: string;
  newFact: string | null;
  domain: string | null;
}

const REFLECTION_PROMPT = `You are a memory agent observing a GUI automation task.
Given the screenshot and the last action taken, respond with JSON only:
{
  "summary": "one sentence: what changed on screen and why",
  "new_fact": "a reusable lesson learned, or null if nothing generalizable",
  "domain": "domain name like 'github.com' if fact is site-specific, or null if global"
}

Rules:
- summary must be concise (under 20 words)
- new_fact should only capture surprising, non-obvious lessons (e.g. "clicking Save does nothing, use Ctrl+S")
- If nothing noteworthy happened, set new_fact to null
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
        max_tokens: 200,
        temperature: 0.1,
      });

      const text = response.choices[0]?.message?.content ?? '{}';
      const data = JSON.parse(text);
      return {
        summary: data.summary ?? 'Step completed',
        newFact: data.new_fact ?? null,
        domain: data.domain ?? null,
      };
    } catch (e) {
      logger.error('[ReflectionService] error:', e);
      return { summary: 'Step completed', newFact: null, domain: null };
    }
  }
}
