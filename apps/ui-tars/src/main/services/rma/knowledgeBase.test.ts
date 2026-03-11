import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KnowledgeBase } from './knowledgeBase';

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private data: Record<string, unknown>;
      constructor(opts?: { defaults?: Record<string, unknown> }) {
        this.data = { ...(opts?.defaults ?? {}) };
      }
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
    kb.addStructuredFact({
      text: 'use Ctrl+S to save on github.com',
      domain: 'github.com',
    });
    const facts = kb.getRelevantFacts('open github.com and save a file');
    expect(facts.map((f) => f.text)).toContain(
      'use Ctrl+S to save on github.com',
    );
  });

  it('returns global facts for any instruction', () => {
    kb.addStructuredFact({
      text: 'always wait 2 seconds after clicking submit',
      domain: null,
    });
    const facts = kb.getRelevantFacts('do anything');
    expect(facts.map((f) => f.text)).toContain(
      'always wait 2 seconds after clicking submit',
    );
  });

  it('does not return unrelated domain facts', () => {
    kb.addStructuredFact({ text: 'login with SSO', domain: 'notion.so' });
    const facts = kb.getRelevantFacts('open github.com');
    expect(facts.map((f) => f.text)).not.toContain('login with SSO');
  });

  it('limits facts to MAX_FACTS_PER_RUN', () => {
    for (let i = 0; i < 20; i++)
      kb.addStructuredFact({ text: `fact ${i}`, domain: null });
    const facts = kb.getRelevantFacts('anything');
    expect(facts.length).toBeLessThanOrEqual(10);
  });

  it('formats facts as system prompt injection string', () => {
    kb.addStructuredFact({
      text: 'click Accept cookies first',
      domain: 'example.com',
    });
    const prompt = kb.formatForPrompt('go to example.com');
    expect(prompt).toContain('Page Structure');
    expect(prompt).toContain('click Accept cookies first');
  });

  it('returns empty string when no relevant facts', () => {
    const prompt = kb.formatForPrompt('do something');
    expect(prompt).toBe('');
  });
});
