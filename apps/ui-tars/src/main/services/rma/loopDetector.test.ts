import { describe, it, expect, beforeEach } from 'vitest';
import { LoopDetector } from './loopDetector';

describe('LoopDetector', () => {
  let detector: LoopDetector;

  beforeEach(() => {
    detector = new LoopDetector();
  });

  it('detects no loop on first step', () => {
    const result = detector.check(100n);
    expect(result.isLoop).toBe(false);
    expect(result.isSignificantChange).toBe(true);
  });

  it('detects significant change when screens differ', () => {
    detector.check(0n);
    const result = detector.check(0xffffffffffffffffn);
    expect(result.isSignificantChange).toBe(true);
    expect(result.isLoop).toBe(false);
  });

  it('detects no significant change when screens are similar', () => {
    detector.check(0b1010101010101010n);
    const result = detector.check(0b1010101010101011n);
    expect(result.isSignificantChange).toBe(false);
  });

  it('detects loop when same screen appears 3 times', () => {
    const sameHash = 12345n;
    detector.check(sameHash);
    detector.check(sameHash);
    const result = detector.check(sameHash);
    expect(result.isLoop).toBe(true);
    expect(result.loopCount).toBe(3);
  });

  it('resets history on reset()', () => {
    const hash = 99n;
    detector.check(hash);
    detector.check(hash);
    detector.reset();
    detector.check(hash);
    detector.check(hash);
    const result = detector.check(hash);
    expect(result.isLoop).toBe(true);
  });

  it('maintains rolling window of HISTORY_WINDOW steps', () => {
    for (let i = 0; i < 12; i++) detector.check(BigInt(i * 1000));
    const oldHash = 0n;
    const result = detector.check(oldHash);
    expect(result.isLoop).toBe(false);
  });
});
