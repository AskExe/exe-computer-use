# Reflection Memory Agent (RMA) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Reflection Memory Agent that uses dHash-based loop detection and a UI-TARS-7B reflection model to give the agent persistent memory and self-correction.

**Architecture:** dHash runs on every screenshot to detect loops and significant screen changes. When a significant change is detected, UI-TARS-7B is called to summarize the step and update a persistent knowledge base. The knowledge base is injected into the action model's system prompt at the start of each run. Loop detection aborts stuck runs early and restarts with a warning.

**Tech Stack:** TypeScript, `node-llama-cpp` (embedded llama.cpp with Metal support) for local model inference, `sharp` (already installed) for image resizing, `electron-store` (already installed) for persistent knowledge base, OpenAI SDK (already installed) for model calls via embedded LlamaServer.

---

## Task 0a: Install node-llama-cpp and configure packaging

**Files:**
- Modify: `apps/ui-tars/package.json`
- Modify: `apps/ui-tars/electron-builder.yml`

**What:** Install `node-llama-cpp` v3+. Configure electron-builder to include native `.node` bindings and unpack them from asar (native modules must not be asar-packed).

**Step 1: Install**
```bash
cd apps/ui-tars
pnpm add node-llama-cpp
```

**Step 2: Update electron-builder.yml**

Add to `asarUnpack`:
```yaml
asarUnpack:
  - "node_modules/node-llama-cpp/**"
  - "node_modules/@node-llama-cpp/**"
```

**Step 3: Verify install**
```bash
node -e "const {getLlama} = require('node-llama-cpp'); console.log('ok')"
```
Expected: `ok`

**Step 4: Commit**
```bash
git add apps/ui-tars/package.json apps/ui-tars/electron-builder.yml pnpm-lock.yaml
git commit -m "feat(models): install node-llama-cpp for embedded local inference"
```

---

## Task 0b: ModelManager Service

**Files:**
- Create: `apps/ui-tars/src/main/services/modelManager.ts`
- Create: `apps/ui-tars/src/main/ipcRoutes/model.ts`

**What:** Service that:
1. Manages GGUF model files in `~/Library/Application Support/exe-computer-use/models/`
2. Downloads models from HuggingFace with progress events
3. Starts two embedded LlamaServer instances (action model port 11435, reflection model port 11436)
4. Exposes IPC routes for renderer to check download status and trigger downloads

Models to download:
- Action: `https://huggingface.co/mradermacher/UI-TARS-2B-SFT-GGUF/resolve/main/UI-TARS-2B-SFT.Q4_K_M.gguf`
- Reflection: `https://huggingface.co/mradermacher/UI-TARS-7B-DPO-GGUF/resolve/main/UI-TARS-7B-DPO.Q4_K_M.gguf`

**Step 1: Implement ModelManager**

```ts
// apps/ui-tars/src/main/services/modelManager.ts
import { app, BrowserWindow } from 'electron';
import { getLlama, LlamaServer } from 'node-llama-cpp';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { logger } from '@main/logger';

const ACTION_MODEL_URL = 'https://huggingface.co/mradermacher/UI-TARS-2B-SFT-GGUF/resolve/main/UI-TARS-2B-SFT.Q4_K_M.gguf';
const REFLECTION_MODEL_URL = 'https://huggingface.co/mradermacher/UI-TARS-7B-DPO-GGUF/resolve/main/UI-TARS-7B-DPO.Q4_K_M.gguf';
const ACTION_MODEL_PORT = 11435;
const REFLECTION_MODEL_PORT = 11436;

export class ModelManager {
  private static instance: ModelManager;
  private modelsDir: string;
  private actionServer: LlamaServer | null = null;
  private reflectionServer: LlamaServer | null = null;
  private downloadProgress: Record<string, number> = {};

  private constructor() {
    this.modelsDir = join(app.getPath('userData'), 'models');
    mkdirSync(this.modelsDir, { recursive: true });
  }

  static getInstance(): ModelManager {
    if (!this.instance) this.instance = new ModelManager();
    return this.instance;
  }

  getModelPath(type: 'action' | 'reflection'): string {
    const name = type === 'action'
      ? 'UI-TARS-2B-SFT.Q4_K_M.gguf'
      : 'UI-TARS-7B-DPO.Q4_K_M.gguf';
    return join(this.modelsDir, name);
  }

  isModelDownloaded(type: 'action' | 'reflection'): boolean {
    return existsSync(this.getModelPath(type));
  }

  async downloadModel(type: 'action' | 'reflection'): Promise<void> {
    const url = type === 'action' ? ACTION_MODEL_URL : REFLECTION_MODEL_URL;
    const dest = this.getModelPath(type);
    logger.info(`[ModelManager] Downloading ${type} model from ${url}`);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);

    const total = Number(response.headers.get('content-length') ?? 0);
    let received = 0;

    const fileStream = createWriteStream(dest);
    const reader = response.body!.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(value);
      received += value.length;
      const progress = total ? Math.round((received / total) * 100) : 0;
      this.downloadProgress[type] = progress;
      // Notify renderer
      BrowserWindow.getAllWindows().forEach((w) =>
        w.webContents.send('model-download-progress', { type, progress, received, total })
      );
    }
    fileStream.end();
    this.downloadProgress[type] = 100;
    logger.info(`[ModelManager] ${type} model downloaded`);
  }

  async startServers(): Promise<void> {
    const llama = await getLlama();

    if (this.isModelDownloaded('action') && !this.actionServer) {
      logger.info('[ModelManager] Starting action model server...');
      const model = await llama.loadModel({ modelPath: this.getModelPath('action') });
      this.actionServer = new LlamaServer({ model, port: ACTION_MODEL_PORT });
      await this.actionServer.start();
      logger.info(`[ModelManager] Action model server running on port ${ACTION_MODEL_PORT}`);
    }

    if (this.isModelDownloaded('reflection') && !this.reflectionServer) {
      logger.info('[ModelManager] Starting reflection model server...');
      const model = await llama.loadModel({ modelPath: this.getModelPath('reflection') });
      this.reflectionServer = new LlamaServer({ model, port: REFLECTION_MODEL_PORT });
      await this.reflectionServer.start();
      logger.info(`[ModelManager] Reflection model server running on port ${REFLECTION_MODEL_PORT}`);
    }
  }

  getStatus() {
    return {
      action: {
        downloaded: this.isModelDownloaded('action'),
        running: !!this.actionServer,
        progress: this.downloadProgress['action'] ?? 0,
        port: ACTION_MODEL_PORT,
      },
      reflection: {
        downloaded: this.isModelDownloaded('reflection'),
        running: !!this.reflectionServer,
        progress: this.downloadProgress['reflection'] ?? 0,
        port: REFLECTION_MODEL_PORT,
      },
    };
  }

  async stopServers(): Promise<void> {
    this.actionServer?.stop();
    this.reflectionServer?.stop();
    this.actionServer = null;
    this.reflectionServer = null;
  }
}
```

**Step 2: Add IPC routes**

```ts
// apps/ui-tars/src/main/ipcRoutes/model.ts
import { ipcMain } from 'electron';
import { ModelManager } from '../services/modelManager';

export function registerModelRoutes() {
  const mm = ModelManager.getInstance();

  ipcMain.handle('model:status', () => mm.getStatus());
  ipcMain.handle('model:download', (_, type: 'action' | 'reflection') =>
    mm.downloadModel(type)
  );
  ipcMain.handle('model:startServers', () => mm.startServers());
}
```

**Step 3: Register in main.ts**

In `apps/ui-tars/src/main/main.ts`, import and call `registerModelRoutes()` and `ModelManager.getInstance().startServers()` after app is ready.

**Step 4: Update default settings** in `setting.ts` to point to embedded servers:
```ts
vlmBaseUrl: 'http://localhost:11435/v1',
reflectionBaseUrl: 'http://localhost:11436/v1',
vlmApiKey: 'local',
vlmModelName: 'UI-TARS-2B-SFT.Q4_K_M',
reflectionModelName: 'UI-TARS-7B-DPO.Q4_K_M',
```

**Step 5: Commit**
```bash
git add apps/ui-tars/src/main/services/modelManager.ts apps/ui-tars/src/main/ipcRoutes/model.ts apps/ui-tars/src/main/main.ts apps/ui-tars/src/main/store/setting.ts
git commit -m "feat(models): add ModelManager with embedded LlamaServer and HuggingFace download"
```

---

## Task 0c: First-Run Model Download UI

**Files:**
- Create: `apps/ui-tars/src/renderer/src/pages/setup/ModelSetup.tsx`
- Modify: `apps/ui-tars/src/renderer/src/App.tsx` (or router) to show ModelSetup if models not downloaded

**What:** A setup screen shown on first launch if either model is missing. Shows two download progress bars (action model ~1.5GB, reflection model ~4.5GB) with a "Download" button per model. Once both are downloaded, shows "Launch" button which starts the servers and enters the main app.

```tsx
// apps/ui-tars/src/renderer/src/pages/setup/ModelSetup.tsx
import { useState, useEffect } from 'react';

interface ModelStatus {
  downloaded: boolean;
  running: boolean;
  progress: number;
}

export function ModelSetup({ onComplete }: { onComplete: () => void }) {
  const [status, setStatus] = useState<{
    action: ModelStatus;
    reflection: ModelStatus;
  } | null>(null);

  useEffect(() => {
    window.electron.ipcRenderer.invoke('model:status').then(setStatus);
    const unsub = window.electron.ipcRenderer.on(
      'model-download-progress',
      (_, { type, progress }) => {
        setStatus((prev) =>
          prev ? { ...prev, [type]: { ...prev[type], progress } } : prev
        );
      }
    );
    return unsub;
  }, []);

  const download = (type: 'action' | 'reflection') =>
    window.electron.ipcRenderer.invoke('model:download', type);

  const launch = async () => {
    await window.electron.ipcRenderer.invoke('model:startServers');
    onComplete();
  };

  const bothReady =
    status?.action.downloaded && status?.reflection.downloaded;

  return (
    <div className="flex flex-col items-center justify-center h-screen gap-6 p-8">
      <h1 className="text-2xl font-bold">Exe Computer Use — First Time Setup</h1>
      <p className="text-muted-foreground text-center max-w-md">
        Download the AI models to get started. Models are stored locally and
        never leave your machine.
      </p>

      {['action', 'reflection'].map((type) => {
        const s = status?.[type as 'action' | 'reflection'];
        const label = type === 'action' ? 'UI-TARS-2B (Action Model, ~1.5GB)' : 'UI-TARS-7B (Reflection Model, ~4.5GB)';
        return (
          <div key={type} className="w-full max-w-md border rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-medium">{label}</span>
              {s?.downloaded
                ? <span className="text-green-500 text-sm">✓ Ready</span>
                : <button onClick={() => download(type as any)} className="text-sm px-3 py-1 bg-primary text-primary-foreground rounded">Download</button>
              }
            </div>
            {!s?.downloaded && s?.progress > 0 && (
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${s.progress}%` }} />
              </div>
            )}
          </div>
        );
      })}

      <button
        disabled={!bothReady}
        onClick={launch}
        className="px-6 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
      >
        Launch
      </button>
    </div>
  );
}
```

**Step 2: Gate main app behind model check**

In the app's root component, check `model:status` on mount. If either model is missing, show `<ModelSetup>` instead of the main app.

**Step 3: Commit**
```bash
git add apps/ui-tars/src/renderer/src/pages/setup/
git commit -m "feat(models): add first-run ModelSetup screen with download progress"
```

---

## Task 1: dHash Utility

**Files:**
- Create: `apps/ui-tars/src/main/services/rma/dHash.ts`
- Create: `apps/ui-tars/src/main/services/rma/dHash.test.ts`

**What:** Implement perceptual difference hash (dHash) on base64 PNG screenshots using `sharp`. dHash resizes image to 9×8 grayscale, compares adjacent pixels per row, produces a 64-bit hash as a BigInt. Hamming distance between two hashes = number of differing bits.

**Step 1: Write the failing test**

```ts
// apps/ui-tars/src/main/services/rma/dHash.test.ts
import { describe, it, expect } from 'vitest';
import { computeDHash, hammingDistance } from './dHash';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('dHash', () => {
  it('returns same hash for identical images', async () => {
    // create a simple 100x100 white PNG buffer
    const sharp = (await import('sharp')).default;
    const buf = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
    const base64 = buf.toString('base64');
    const h1 = await computeDHash(base64);
    const h2 = await computeDHash(base64);
    expect(h1).toBe(h2);
  });

  it('returns zero hamming distance for identical hashes', async () => {
    expect(hammingDistance(0b1010n, 0b1010n)).toBe(0);
  });

  it('returns correct hamming distance', async () => {
    expect(hammingDistance(0b1010n, 0b1001n)).toBe(2);
  });

  it('returns low distance for similar images', async () => {
    const sharp = (await import('sharp')).default;
    const buf1 = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
    const buf2 = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 250, g: 250, b: 250 } } }).png().toBuffer();
    const h1 = await computeDHash(buf1.toString('base64'));
    const h2 = await computeDHash(buf2.toString('base64'));
    expect(hammingDistance(h1, h2)).toBeLessThan(10);
  });

  it('returns high distance for very different images', async () => {
    const sharp = (await import('sharp')).default;
    const buf1 = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
    const buf2 = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const h1 = await computeDHash(buf1.toString('base64'));
    const h2 = await computeDHash(buf2.toString('base64'));
    expect(hammingDistance(h1, h2)).toBeGreaterThan(20);
  });
});
```

**Step 2: Run test to verify it fails**
```bash
cd ~/Projects/exe-computer-use
pnpm --filter ui-tars-desktop test -- dHash
```
Expected: FAIL with "Cannot find module './dHash'"

**Step 3: Implement**

```ts
// apps/ui-tars/src/main/services/rma/dHash.ts
import sharp from 'sharp';

/**
 * Compute a 64-bit difference hash (dHash) from a base64 PNG screenshot.
 * Resizes to 9x8 grayscale, compares adjacent pixels per row.
 */
export async function computeDHash(base64: string): Promise<bigint> {
  const buf = Buffer.from(base64, 'base64');
  const { data } = await sharp(buf)
    .resize(9, 8, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = 0n;
  let bit = 0n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = data[row * 9 + col];
      const right = data[row * 9 + col + 1];
      if (left > right) hash |= (1n << bit);
      bit++;
    }
  }
  return hash;
}

/**
 * Hamming distance between two dHash values (number of differing bits).
 * Distance < 10 = similar, > 20 = very different.
 */
export function hammingDistance(a: bigint, b: bigint): number {
  let diff = a ^ b;
  let count = 0;
  while (diff) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}
```

**Step 4: Run test to verify it passes**
```bash
pnpm --filter ui-tars-desktop test -- dHash
```
Expected: PASS (5 tests)

**Step 5: Commit**
```bash
cd ~/Projects/exe-computer-use
git add apps/ui-tars/src/main/services/rma/
git commit -m "feat(rma): add dHash utility for screenshot perceptual hashing"
```

---

## Task 2: Loop Detector

**Files:**
- Create: `apps/ui-tars/src/main/services/rma/loopDetector.ts`
- Create: `apps/ui-tars/src/main/services/rma/loopDetector.test.ts`

**What:** Maintains a rolling history of dHash values. On each step: (1) checks if current screen is a significant change vs previous (for triggering 7B), (2) checks if current hash appears 3+ times in recent history (loop detected).

Thresholds:
- `SIGNIFICANT_CHANGE_THRESHOLD = 10` — distance > 10 = significant change
- `LOOP_SIMILARITY_THRESHOLD = 5` — distance < 5 = same screen
- `LOOP_COUNT = 3` — seen same screen 3 times = loop
- `HISTORY_WINDOW = 12` — rolling window of last 12 steps

**Step 1: Write the failing test**

```ts
// apps/ui-tars/src/main/services/rma/loopDetector.test.ts
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
    expect(result.isSignificantChange).toBe(true); // first step always significant
  });

  it('detects significant change when screens differ', () => {
    detector.check(0n);
    const result = detector.check(0xFFFFFFFFFFFFFFFFn);
    expect(result.isSignificantChange).toBe(true);
    expect(result.isLoop).toBe(false);
  });

  it('detects no significant change when screens are similar', () => {
    detector.check(0b1010101010101010n);
    const result = detector.check(0b1010101010101011n); // 1 bit diff
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
    expect(result.isLoop).toBe(true); // 3 after reset
  });

  it('maintains rolling window of HISTORY_WINDOW steps', () => {
    // fill with unique hashes
    for (let i = 0; i < 12; i++) detector.check(BigInt(i * 1000));
    // old hash from before window should not contribute to loop count
    const oldHash = 0n;
    const result = detector.check(oldHash);
    expect(result.isLoop).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**
```bash
pnpm --filter ui-tars-desktop test -- loopDetector
```
Expected: FAIL with "Cannot find module './loopDetector'"

**Step 3: Implement**

```ts
// apps/ui-tars/src/main/services/rma/loopDetector.ts
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

    // Count how many times this hash appears in history window
    const window = this.history.slice(-HISTORY_WINDOW);
    const loopCount = window.filter(
      (h) => hammingDistance(h, hash) < LOOP_SIMILARITY_THRESHOLD,
    ).length + 1; // +1 for current

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
```

**Step 4: Run test to verify it passes**
```bash
pnpm --filter ui-tars-desktop test -- loopDetector
```
Expected: PASS (6 tests)

**Step 5: Commit**
```bash
git add apps/ui-tars/src/main/services/rma/
git commit -m "feat(rma): add LoopDetector with rolling window and oscillation detection"
```

---

## Task 3: Knowledge Base (Persistent Storage)

**Files:**
- Create: `apps/ui-tars/src/main/services/rma/knowledgeBase.ts`
- Create: `apps/ui-tars/src/main/services/rma/knowledgeBase.test.ts`

**What:** Stores learned facts from completed tasks persistently using `electron-store`. Facts are stored per-domain (e.g. "github.com") and globally. At run start, relevant facts are retrieved and injected into the system prompt.

**Step 1: Write the failing test**

```ts
// apps/ui-tars/src/main/services/rma/knowledgeBase.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeBase } from './knowledgeBase';

// Mock electron-store for tests
vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private data: Record<string, any> = {};
      get(key: string, def?: any) { return this.data[key] ?? def; }
      set(key: string, val: any) { this.data[key] = val; }
    }
  };
});

describe('KnowledgeBase', () => {
  let kb: KnowledgeBase;
  beforeEach(() => { kb = new KnowledgeBase(); });

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
```

**Step 2: Run test to verify it fails**
```bash
pnpm --filter ui-tars-desktop test -- knowledgeBase
```

**Step 3: Implement**

```ts
// apps/ui-tars/src/main/services/rma/knowledgeBase.ts
import ElectronStore from 'electron-store';

const MAX_FACTS_PER_RUN = 10;
const MAX_STORED_FACTS = 100;

interface Fact {
  text: string;
  domain: string | null; // null = global
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
    // Avoid duplicates
    if (facts.some((f) => f.text === text)) return;
    facts.push({ text, domain, addedAt: Date.now(), useCount: 0 });
    // Keep only most recent MAX_STORED_FACTS
    if (facts.length > MAX_STORED_FACTS) facts.shift();
    this.store.set('facts', facts);
  }

  getRelevantFacts(instruction: string): string[] {
    const facts = this.store.get('facts');
    const instructionLower = instruction.toLowerCase();

    const relevant = facts.filter((f) => {
      if (!f.domain) return true; // global facts always included
      return instructionLower.includes(f.domain.toLowerCase());
    });

    // Sort by useCount desc, then recency
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
```

**Step 4: Run test to verify it passes**
```bash
pnpm --filter ui-tars-desktop test -- knowledgeBase
```
Expected: PASS (6 tests)

**Step 5: Commit**
```bash
git add apps/ui-tars/src/main/services/rma/
git commit -m "feat(rma): add persistent KnowledgeBase with domain-aware fact retrieval"
```

---

## Task 4: Reflection Service (7B Model Calls)

**Files:**
- Create: `apps/ui-tars/src/main/services/rma/reflectionService.ts`

**What:** Calls UI-TARS-7B (via LM Studio at `localhost:1234/v1`) with a screenshot + action summary to extract: (1) a step summary, (2) whether a new fact should be stored, (3) the fact text if so. Called only when `LoopDetector.isSignificantChange` is true.

**Step 1: No test for this** — it calls an external model. Integration tested in Task 6.

**Step 2: Implement**

```ts
// apps/ui-tars/src/main/services/rma/reflectionService.ts
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
```

**Step 3: Commit**
```bash
git add apps/ui-tars/src/main/services/rma/
git commit -m "feat(rma): add ReflectionService for 7B model step summarization"
```

---

## Task 5: Add RMA Settings to Store

**Files:**
- Modify: `apps/ui-tars/src/main/store/validate.ts`
- Modify: `apps/ui-tars/src/main/store/setting.ts`

**What:** Add three new optional settings fields: `reflectionBaseUrl`, `reflectionModelName`, `rmaEnabled`. These let users configure the 7B model separately from the action model.

**Step 1: Update validate.ts**

Add to `PresetSchema`:
```ts
// RMA Settings
rmaEnabled: z.boolean().optional(),
reflectionBaseUrl: z.string().optional(),
reflectionModelName: z.string().optional(),
```

**Step 2: Update setting.ts DEFAULT_SETTING**

```ts
rmaEnabled: true,
reflectionBaseUrl: 'http://localhost:1234/v1',  // LM Studio
reflectionModelName: 'ui-tars-7b-dpo',
```

**Step 3: Commit**
```bash
git add apps/ui-tars/src/main/store/
git commit -m "feat(rma): add rmaEnabled, reflectionBaseUrl, reflectionModelName settings"
```

---

## Task 6: Wire RMA into runAgent.ts

**Files:**
- Modify: `apps/ui-tars/src/main/services/runAgent.ts`
- Create: `apps/ui-tars/src/main/services/rma/index.ts`

**What:** Create an `RMAOrchestrator` that ties together `LoopDetector`, `KnowledgeBase`, and `ReflectionService`. Wire it into `runAgent.ts`:
1. Before run: inject knowledge base into system prompt
2. In `onData`: compute dHash, check loop/change, call 7B if significant change, store new facts
3. On loop detected: abort run, add loop warning to next run's system prompt

**Step 1: Create RMA index / orchestrator**

```ts
// apps/ui-tars/src/main/services/rma/index.ts
import { computeDHash } from './dHash';
import { LoopDetector } from './loopDetector';
import { KnowledgeBase } from './knowledgeBase';
import { ReflectionService } from './reflectionService';
import { logger } from '@main/logger';

export { KnowledgeBase } from './knowledgeBase';

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
        if (result.newFact) {
          this.kb.addFact(result.newFact, result.domain);
          logger.info('[RMA] New fact stored:', result.newFact);
        }
      } catch (e) {
        logger.error('[RMA] Reflection failed:', e);
      }
    }

    return { isLoop: false, loopCount };
  }

  getSystemPromptAddition(): string {
    const kbSection = this.kb.formatForPrompt(this.instruction);
    const loopSection = this.loopWarning ? `\n\n## IMPORTANT:\n${this.loopWarning}` : '';
    return kbSection + loopSection;
  }
}
```

**Step 2: Update runAgent.ts**

At the top, add imports:
```ts
import { RMAOrchestrator, KnowledgeBase } from './rma';
import { ReflectionService } from './rma/reflectionService';
```

Before `const guiAgent = new GUIAgent(...)`, add:
```ts
// Initialize RMA if enabled
const rmaEnabled = settings.rmaEnabled !== false;
const kb = new KnowledgeBase();
const reflectionSvc = new ReflectionService(
  settings.reflectionBaseUrl || 'http://localhost:1234/v1',
  settings.vlmApiKey || 'lm-studio',
  settings.reflectionModelName || 'ui-tars-7b-dpo',
);
const rma = new RMAOrchestrator(kb, reflectionSvc);
rma.setInstruction(instructions);

// Inject knowledge base into system prompt
const rmaContext = rmaEnabled ? rma.getSystemPromptAddition() : '';
const finalSystemPrompt = systemPrompt + rmaContext;
```

Change `systemPrompt` to `finalSystemPrompt` in `new GUIAgent(...)`.

In `handleData`, after extracting `screenshotBase64`, add:
```ts
if (rmaEnabled && screenshotBase64) {
  const lastActionText = predictionParsed?.[0]
    ? JSON.stringify(predictionParsed[0])
    : '';
  const { isLoop } = await rma.processStep(screenshotBase64, lastActionText);
  if (isLoop) {
    abortController?.abort();
    setState({ ...getState(), status: StatusEnum.ERROR, errorMsg: rma.loopWarning ?? 'Loop detected' });
    return;
  }
}
```

**Step 3: Commit**
```bash
git add apps/ui-tars/src/main/services/rma/ apps/ui-tars/src/main/services/runAgent.ts
git commit -m "feat(rma): wire RMAOrchestrator into runAgent — loop detection + knowledge injection"
```

---

## Task 7: Settings UI for RMA

**Files:**
- Modify: `apps/ui-tars/src/renderer/src/components/Settings/category/vlm.tsx`

**What:** Add a collapsible "Reflection Memory (RMA)" section to the settings UI with:
- Toggle: Enable RMA (on/off)
- Text field: Reflection model base URL (default: `http://localhost:1234/v1`)
- Text field: Reflection model name (default: `ui-tars-7b-dpo`)

Find the existing VLM settings form in `vlm.tsx` and append the RMA section after the existing fields, following the same form field patterns already used.

**Step 1: Read the file first**
```bash
cat apps/ui-tars/src/renderer/src/components/Settings/category/vlm.tsx | head -60
```

**Step 2: Add RMA section** following the same pattern as existing fields (Switch for toggle, Input for URLs, using the existing form/settings state management).

**Step 3: Commit**
```bash
git add apps/ui-tars/src/renderer/src/components/Settings/category/vlm.tsx
git commit -m "feat(rma): add RMA settings UI — enable toggle, reflection model config"
```

---

## Setup Instructions for User

After implementation, the user needs:

1. **Install LM Studio** from lmstudio.ai
2. **Download models** in LM Studio:
   - Search: `UI-TARS-2B-SFT` (for actions)
   - Search: `UI-TARS-7B-DPO` (for reflection)
3. **Start Local Server** in LM Studio (default port 1234)
4. **Load UI-TARS-2B** as the active model
5. In app Settings:
   - Provider: `LM Studio`
   - Base URL: `http://localhost:1234/v1`
   - Model: `ui-tars-2b-sft`
   - Reflection Model: `ui-tars-7b-dpo`
   - Enable RMA: ✅

> **Note:** LM Studio currently serves one model at a time. The reflection calls to 7B will cause brief model switching. This is acceptable for v1. v2 could use two separate LM Studio instances on different ports.
