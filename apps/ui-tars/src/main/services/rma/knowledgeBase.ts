import ElectronStore from 'electron-store';

const MAX_FACTS_PER_RUN = 10;
const MAX_STORED_FACTS = 100;

interface Fact {
  text: string;
  domain: string | null;
  addedAt: number;
  useCount: number;
}

interface KBStore {
  facts: Fact[];
}

export class KnowledgeBase {
  private store: ElectronStore<KBStore>;

  constructor() {
    this.store = new ElectronStore<KBStore>({
      name: 'exe_computer_use.knowledge',
      defaults: { facts: [] },
    });
  }

  addFact(text: string, domain: string | null = null): void {
    const facts = this.store.get('facts');
    if (facts.some((f) => f.text === text)) return;
    facts.push({ text, domain, addedAt: Date.now(), useCount: 0 });
    if (facts.length > MAX_STORED_FACTS) facts.shift();
    this.store.set('facts', facts);
  }

  getRelevantFacts(instruction: string): string[] {
    const facts = this.store.get('facts');
    const instructionLower = instruction.toLowerCase();

    const relevant = facts.filter((f) => {
      if (!f.domain) return true;
      return instructionLower.includes(f.domain.toLowerCase());
    });

    relevant.sort((a, b) => b.useCount - a.useCount || b.addedAt - a.addedAt);

    return relevant.slice(0, MAX_FACTS_PER_RUN).map((f) => f.text);
  }

  formatForPrompt(instruction: string): string {
    const facts = this.getRelevantFacts(instruction);
    if (facts.length === 0) return '';
    return `\n\n## Past experience (apply this knowledge):\n${facts.map((f) => `- ${f}`).join('\n')}`;
  }

  clear(): void {
    this.store.set('facts', []);
  }
}
