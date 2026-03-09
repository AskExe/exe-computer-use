import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeBase } from './knowledgeBase';

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private data: Record<string, unknown> = {};
      get(key: string, def?: unknown) {
        return this.data[key] ?? def;
      }
      set(key: string, val: unknown) {
        this.data[key] = val;
      }
    },
  };
});

describe('KnowledgeBase', () => {
  let kb: KnowledgeBase;
  beforeEach(() => {
    kb = new KnowledgeBase();
  });

  it('stores and retrieves a fact', () => {
    kb.addFact('use Ctrl+S to save on github.com', 'github.com');
    const facts = kb.getRelevantFacts('open github.com and save a file');
    expect(facts).toContain('use Ctrl+S to save on github.com');
  });

  it('returns global facts for any instruction', () => {
    kb.addFact('always wait 2 seconds after clicking submit');
    const facts = kb.getRelevantFacts('do anything');
    expect(facts).toContain('always wait 2 seconds after clicking submit');
  });

  it('does not return unrelated domain facts', () => {
    kb.addFact('login with SSO', 'notion.so');
    const facts = kb.getRelevantFacts('open github.com');
    expect(facts).not.toContain('login with SSO');
  });

  it('limits facts to MAX_FACTS_PER_RUN', () => {
    for (let i = 0; i < 20; i++) kb.addFact(`fact ${i}`);
    const facts = kb.getRelevantFacts('anything');
    expect(facts.length).toBeLessThanOrEqual(10);
  });

  it('formats facts as system prompt injection string', () => {
    kb.addFact('click Accept cookies first', 'example.com');
    const prompt = kb.formatForPrompt('go to example.com');
    expect(prompt).toContain('Past experience');
    expect(prompt).toContain('click Accept cookies first');
  });

  it('returns empty string when no relevant facts', () => {
    const prompt = kb.formatForPrompt('do something');
    expect(prompt).toBe('');
  });
});
