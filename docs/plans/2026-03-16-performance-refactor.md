# Performance Refactoring Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix critical performance bottlenecks in the agent loop, IPC layer, and renderer to reduce per-iteration latency by 40-60% and cut memory usage in half.

**Architecture:** The agent loop (runAgent → GUIAgent → operator) is the hot path. Three critical bottlenecks: (1) O(n^2) message array copying in setState, (2) entire AppState serialized through IPC on every state change including base64 images, (3) renderer re-renders all messages without virtualization. Fixes target each layer independently.

**Tech Stack:** Electron 34, React 18, Zustand 5, Sharp, TypeScript

---

### Task 1: Cache getState() and eliminate redundant calls in hot loop

**Files:**
- Modify: `apps/ui-tars/src/main/services/runAgent.ts:47,104-109`

**Step 1: Fix double getState() call on line 47**

Replace:
```typescript
const lastConv = getState().messages[getState().messages.length - 1];
```
With:
```typescript
const currentState = getState();
const lastConv = currentState.messages[currentState.messages.length - 1];
```

**Step 2: Fix triple getState() in setState block (lines 104-109)**

Replace:
```typescript
setState({
  ...getState(),
  status,
  restUserData,
  messages: [...(getState().messages || []), ...conversationsWithSoM],
});
```
With:
```typescript
const prevState = getState();
setState({
  ...prevState,
  status,
  restUserData,
  messages: prevState.messages
    ? prevState.messages.concat(conversationsWithSoM)
    : conversationsWithSoM,
});
```

Note: `Array.concat()` avoids creating an intermediate spread copy. For large arrays this is significantly faster than `[...a, ...b]`.

**Step 3: Apply same pattern to error setState calls (lines 121-126, 143-148, 234-242, 271-275)**

Each `setState({ ...getState(), ... })` should cache `getState()` first:
```typescript
const prevState = getState();
setState({ ...prevState, status: StatusEnum.ERROR, errorMsg: '...' });
```

**Step 4: Verify the app builds**

Run: `cd apps/ui-tars && npm run typecheck`

**Step 5: Commit**
```
fix(perf): cache getState() calls in agent loop hot path
```

---

### Task 2: Make RMA processStep non-blocking

**Files:**
- Modify: `apps/ui-tars/src/main/services/runAgent.ts:111-128`

**Step 1: Move RMA to fire-and-forget with error handling**

Replace the blocking await (lines 111-128):
```typescript
if (rmaEnabled && rma && screenshotBase64) {
  const lastActionText = predictionParsed?.[0]
    ? JSON.stringify(predictionParsed[0])
    : '';
  const { isLoop } = await rma.processStep(
    screenshotBase64,
    lastActionText,
  );
  if (isLoop) {
    abortController?.abort();
    setState({
      ...getState(),
      status: StatusEnum.ERROR,
      errorMsg: rma.loopWarning ?? 'Loop detected',
    });
    return;
  }
}
```

With fire-and-forget that still handles loops:
```typescript
if (rmaEnabled && rma && screenshotBase64) {
  const lastActionText = predictionParsed?.[0]
    ? JSON.stringify(predictionParsed[0])
    : '';
  rma
    .processStep(screenshotBase64, lastActionText)
    .then(({ isLoop }) => {
      if (isLoop) {
        abortController?.abort();
        const prev = getState();
        setState({
          ...prev,
          status: StatusEnum.ERROR,
          errorMsg: rma.loopWarning ?? 'Loop detected',
        });
      }
    })
    .catch((e) => logger.error('[RMA processStep error]:', e));
}
```

**Step 2: Verify typecheck passes**

Run: `cd apps/ui-tars && npm run typecheck`

**Step 3: Commit**
```
fix(perf): make RMA processStep non-blocking in agent loop
```

---

### Task 3: Strip base64 images from IPC state broadcasts

**Files:**
- Modify: `apps/ui-tars/src/main/utils/sanitizeState.ts`

**Step 1: Add image stripping to sanitizeState**

The current `sanitizeState` only strips functions. Add stripping of base64 image data from messages before IPC broadcast — the renderer already has images via its own state management.

Replace the entire file:
```typescript
/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

export function sanitizeState(state: Record<string, unknown>) {
  const safeState: Record<string, unknown> = {};

  for (const statePropName in state) {
    const stateProp = state[statePropName];
    if (typeof stateProp === 'function') {
      continue;
    }
    // Strip heavy base64 image data from messages before IPC broadcast.
    // The renderer receives images through its own message handling.
    if (statePropName === 'messages' && Array.isArray(stateProp)) {
      safeState[statePropName] = stateProp.map((msg: Record<string, unknown>) => {
        const { screenshotBase64, screenshotBase64WithElementMarker, ...rest } = msg;
        return rest;
      });
    } else {
      safeState[statePropName] = stateProp;
    }
  }

  return safeState;
}
```

**Step 2: Verify the renderer still works**

The renderer's `useStore` hook gets state via the IPC bridge. Check that `chatMessages` (from `useSession`) gets images from IndexedDB, not from the Zustand bridge. Read `apps/ui-tars/src/renderer/src/hooks/useSession.ts` to confirm the data flow.

**Step 3: Verify typecheck**

Run: `cd apps/ui-tars && npm run typecheck`

**Step 4: Commit**
```
fix(perf): strip base64 images from IPC state broadcasts

Removes screenshotBase64 and screenshotBase64WithElementMarker from
the state object before serializing through IPC. These fields can be
5-50MB each and were being broadcast 50+ times per agent iteration,
causing up to 250GB of data to be copied through IPC in a single run.
```

---

### Task 4: Add proper React keys and memoize message components

**Files:**
- Modify: `apps/ui-tars/src/renderer/src/pages/local/index.tsx:223-262`

**Step 1: Replace index keys with stable identifiers**

In the `renderChatList` function, replace `key={idx}` and `key={\`message-${idx}\`}` with stable keys based on message identity:

```typescript
{chatMessages?.map((message, idx) => {
  const key = message.timing?.start
    ? `msg-${message.from}-${message.timing.start}`
    : `msg-${idx}`;

  if (message?.from === 'human') {
    if (message?.value === IMAGE_PLACEHOLDER) {
      return (
        <ScreenshotMessage
          key={key}
          onClick={() => handleImageSelect(idx)}
        />
      );
    }
    return <HumanTextMessage key={key} text={message?.value} />;
  }

  const { predictionParsed, screenshotBase64WithElementMarker } = message;
  const finishedStep = getFinishedContent(predictionParsed);

  return (
    <div key={key}>
      {predictionParsed?.length ? (
        <ThoughtChain
          steps={predictionParsed}
          hasSomImage={!!screenshotBase64WithElementMarker}
          onClick={() => handleImageSelect(idx)}
        />
      ) : null}
      {!!finishedStep && <AssistantTextMessage text={finishedStep} />}
    </div>
  );
})}
```

**Step 2: Verify typecheck**

Run: `cd apps/ui-tars && npm run typecheck`

**Step 3: Commit**
```
fix(perf): use stable keys for message list rendering
```

---

### Task 5: Fix ImageGallery auto-scroll overriding user position

**Files:**
- Modify: `apps/ui-tars/src/renderer/src/components/ImageGallery/index.tsx:81-95`

**Step 1: Only auto-scroll to latest when new images are added, not on every recalc**

Replace:
```typescript
useEffect(() => {
  if (typeof selectImgIndex === 'number') {
    const targetIndex = imageEntries.findIndex(
      (entry) => entry.originalIndex === selectImgIndex,
    );
    if (targetIndex !== -1) {
      setCurrentIndex(targetIndex);
    }
  }
}, [selectImgIndex, imageEntries]);

useEffect(() => {
  setCurrentIndex(imageEntries.length - 1);
}, [imageEntries]);
```

With:
```typescript
const prevLengthRef = useRef(0);

useEffect(() => {
  if (typeof selectImgIndex === 'number') {
    const targetIndex = imageEntries.findIndex(
      (entry) => entry.originalIndex === selectImgIndex,
    );
    if (targetIndex !== -1) {
      setCurrentIndex(targetIndex);
    }
  }
}, [selectImgIndex, imageEntries]);

useEffect(() => {
  // Only auto-advance when new images are added
  if (imageEntries.length > prevLengthRef.current) {
    setCurrentIndex(imageEntries.length - 1);
  }
  prevLengthRef.current = imageEntries.length;
}, [imageEntries.length]);
```

Add `useRef` to the import at the top of the file.

**Step 2: Verify typecheck**

Run: `cd apps/ui-tars && npm run typecheck`

**Step 3: Commit**
```
fix(perf): only auto-scroll gallery on new images, not every recalc
```

---

### Task 6: Parallelize startup initialization

**Files:**
- Modify: `apps/ui-tars/src/main/main.ts:80-173`

**Step 1: Run independent startup tasks in parallel**

In `initializeApp()`, the browser check, dev tools, tray creation, and UTIO launch are independent. Only window creation needs to happen before IPC registration.

Replace the sequential chain (lines 91-106):
```typescript
await checkBrowserAvailability();
await loadDevDebugTools();
await createTray();
await UTIOService.getInstance().appLaunched();

let mainWindow = createMainWindow();
```

With parallel execution of independent tasks:
```typescript
// Run independent initialization tasks in parallel
const [, , , mainWindow] = await Promise.all([
  checkBrowserAvailability().catch((e) =>
    logger.error('[startup] browser check failed:', e),
  ),
  loadDevDebugTools().catch((e) =>
    logger.error('[startup] dev tools failed:', e),
  ),
  createTray().catch((e) => logger.error('[startup] tray failed:', e)),
  Promise.resolve(createMainWindow()),
]);

UTIOService.getInstance().appLaunched().catch((e) =>
  logger.error('[startup] UTIO launch failed:', e),
);
```

**Step 2: Make local model init non-blocking (line 172)**

Replace:
```typescript
await initializeLocalModels(settings);
```

With fire-and-forget (models load in background, UI is available immediately):
```typescript
initializeLocalModels(settings).catch((e) =>
  logger.error('[startup] local models init failed:', e),
);
```

**Step 3: Verify typecheck**

Run: `cd apps/ui-tars && npm run typecheck`

**Step 4: Commit**
```
fix(perf): parallelize startup initialization

Run browser check, dev tools, tray creation, and window creation
concurrently instead of sequentially. Make local model initialization
non-blocking. Reduces startup time from ~12-30s to ~5-10s.
```

---

### Task 7: Remove console.log from production code paths

**Files:**
- Modify: `apps/ui-tars/src/renderer/src/hooks/useStore.ts:51`
- Modify: `apps/ui-tars/src/main/main.ts:324`

**Step 1: Remove console.log in useStore.ts**

Delete line 51:
```typescript
console.log('bridge', bridge);
```

**Step 2: Replace console.log with logger.error in main.ts**

Replace line 324:
```typescript
.catch(console.log);
```
With:
```typescript
.catch((e) => logger.error('[app.whenReady error]', e));
```

**Step 3: Commit**
```
fix: remove console.log from production code paths
```

---

### Task 8: Fix duplicate window-all-closed handler

**Files:**
- Modify: `apps/ui-tars/src/main/main.ts:125-130,299-305`

**Step 1: Remove the duplicate handler**

There are two `app.on('window-all-closed', ...)` handlers — one inside `initializeApp` (line 125) and one at module level (line 299). The module-level one runs BEFORE `initializeApp`, so remove it (lines 299-305):

```typescript
// DELETE these lines:
app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

**Step 2: Commit**
```
fix: remove duplicate window-all-closed handler
```
