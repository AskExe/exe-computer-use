import { computeDHash } from './dHash';
import { LoopDetector } from './loopDetector';
import { KnowledgeBase, StructuredFact } from './knowledgeBase';
import { ReflectionService, ElementFact } from './reflectionService';
import { logger } from '@main/logger';

export { KnowledgeBase } from './knowledgeBase';

function convertToStructuredFact(fact: ElementFact): StructuredFact {
  const loc = fact.location ? ` at ${fact.location}` : '';
  const sel = fact.selector ? ` [${fact.selector}]` : '';
  const text = `${fact.element || fact.type}: ${fact.description}${loc}${sel}`;
  return {
    text,
    domain: fact.domain,
    type: fact.type,
    element: fact.element,
  };
}

export class RMAOrchestrator {
  private loopDetector = new LoopDetector();
  private kb: KnowledgeBase;
  private reflection: ReflectionService;
  private instruction: string = '';
  public loopWarning: string | null = null;

  constructor(kb: KnowledgeBase, reflection: ReflectionService) {
    this.kb = kb;
    this.reflection = reflection;
  }

  setInstruction(instruction: string): void {
    this.instruction = instruction;
    this.loopDetector.reset();
    this.loopWarning = null;
  }

  async processStep(
    screenshotBase64: string,
    lastAction: string,
  ): Promise<{ isLoop: boolean; loopCount: number }> {
    const hash = await computeDHash(screenshotBase64);
    const { isLoop, isSignificantChange, loopCount } =
      this.loopDetector.check(hash);

    if (isLoop) {
      this.loopWarning = `Warning: you have repeated the same screen state ${loopCount} times. Your current approach is not working. Try a completely different strategy.`;
      logger.warn('[RMA] Loop detected:', loopCount);
      return { isLoop: true, loopCount };
    }

    if (isSignificantChange && lastAction) {
      try {
        const result = await this.reflection.reflect(
          screenshotBase64,
          lastAction,
          this.instruction,
        );
        if (result.facts.length > 0) {
          for (const fact of result.facts) {
            const structured = convertToStructuredFact(fact);
            this.kb.addStructuredFact(structured);
            logger.info('[RMA] New fact stored:', structured.text);
          }
        }
      } catch (e) {
        logger.error('[RMA] Reflection failed:', e);
      }
    }

    return { isLoop: false, loopCount };
  }

  getSystemPromptAddition(): string {
    const kbSection = this.kb.formatForPrompt(this.instruction);
    const loopSection = this.loopWarning
      ? `\n\n## IMPORTANT:\n${this.loopWarning}`
      : '';
    return kbSection + loopSection;
  }
}
