import ElectronStore from 'electron-store';

const MAX_FACTS_PER_RUN = 10;
const MAX_STORED_FACTS = 100;

export interface StructuredFact {
  text: string;
  domain: string | null;
  type?: 'element' | 'structure' | 'workflow';
  element?: string;
  addedAt: number;
  useCount: number;
}

interface KBStore {
  facts: StructuredFact[];
}

export class KnowledgeBase {
  private store: ElectronStore<KBStore>;

  constructor() {
    this.store = new ElectronStore<KBStore>({
      name: 'exe_computer_use.knowledge',
      defaults: { facts: [] },
    });
  }

  addStructuredFact(fact: Omit<StructuredFact, 'addedAt' | 'useCount'>): void {
    const facts = this.store.get('facts');
    const existing = facts.find((f) => f.text === fact.text);
    if (existing) {
      existing.useCount++;
      this.store.set('facts', facts);
      return;
    }
    const newFact: StructuredFact = {
      ...fact,
      addedAt: Date.now(),
      useCount: 1,
    };
    facts.push(newFact);
    if (facts.length > MAX_STORED_FACTS) facts.shift();
    this.store.set('facts', facts);
  }

  getRelevantFacts(instruction: string): StructuredFact[] {
    const facts = this.store.get('facts');
    const instructionLower = instruction.toLowerCase();

    const relevant = facts.filter((f) => {
      if (!f.domain) return true;
      return instructionLower.includes(f.domain.toLowerCase());
    });

    relevant.sort((a, b) => b.useCount - a.useCount || b.addedAt - a.addedAt);

    return relevant.slice(0, MAX_FACTS_PER_RUN);
  }

  formatForPrompt(instruction: string): string {
    const facts = this.getRelevantFacts(instruction);
    if (facts.length === 0) return '';

    const byDomain = new Map<string, StructuredFact[]>();
    const global: StructuredFact[] = [];

    for (const fact of facts) {
      if (fact.domain) {
        const existing = byDomain.get(fact.domain) || [];
        existing.push(fact);
        byDomain.set(fact.domain, existing);
      } else {
        global.push(fact);
      }
    }

    let output = '\n\n## Page Structure & Elements (learned from past runs):\n';

    if (global.length > 0) {
      output += '\n### Global:\n';
      for (const f of global) {
        output += `- ${f.text}\n`;
      }
    }

    for (const [domain, domainFacts] of byDomain) {
      output += `\n### ${domain}:\n`;
      for (const f of domainFacts) {
        output += `- ${f.text}\n`;
      }
    }

    return output;
  }

  clear(): void {
    this.store.set('facts', []);
  }
}
