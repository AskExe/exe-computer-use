import { hammingDistance } from './dHash';

const SIGNIFICANT_CHANGE_THRESHOLD = 10;
const LOOP_SIMILARITY_THRESHOLD = 5;
const LOOP_COUNT = 3;
const HISTORY_WINDOW = 12;

export interface LoopCheckResult {
  isLoop: boolean;
  isSignificantChange: boolean;
  loopCount: number;
}

export class LoopDetector {
  private history: bigint[] = [];

  check(hash: bigint): LoopCheckResult {
    if (this.history.length === 0) {
      this.history.push(hash);
      return { isLoop: false, isSignificantChange: true, loopCount: 1 };
    }

    const prev = this.history[this.history.length - 1];
    const distFromPrev = hammingDistance(hash, prev);
    const isSignificantChange = distFromPrev > SIGNIFICANT_CHANGE_THRESHOLD;

    const window = this.history.slice(-HISTORY_WINDOW);
    const loopCount =
      window.filter((h) => hammingDistance(h, hash) < LOOP_SIMILARITY_THRESHOLD)
        .length + 1;

    this.history.push(hash);
    if (this.history.length > HISTORY_WINDOW) {
      this.history.shift();
    }

    return {
      isLoop: loopCount >= LOOP_COUNT,
      isSignificantChange,
      loopCount,
    };
  }

  reset(): void {
    this.history = [];
  }
}
