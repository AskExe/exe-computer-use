# Documentation Overhaul Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the documentation from an outdated upstream fork into a polished, comprehensive open-source project that developers can immediately understand, fork, and use.

**Architecture:** Complete rewrite of root README focused on Exe Computer Use identity, new Getting Started guide, Architecture doc with diagrams, Contributing guide, and Configuration reference.

**Tech Stack:** Markdown, Mermaid diagrams

---

### Task 1: Rewrite root README.md

**Files:**
- Rewrite: `README.md`

**Step 1: Write the new README**

The README should cover:

1. **Hero section** — Project name, one-line description, badges (license, build, version)
2. **What it does** — 2-3 sentence explanation with a screenshot or GIF placeholder
3. **Features** — Bullet list: local AI models, desktop automation, browser automation, reflection memory agent, cross-platform
4. **Quick Start** — Clone, install, configure model, run (link to full guide)
5. **Architecture Overview** — Brief description with link to ARCHITECTURE.md
6. **Project Structure** — Monorepo layout tree
7. **Documentation** — Links to all docs
8. **Contributing** — Link to CONTRIBUTING.md
9. **License** — MIT with Apache 2.0 attribution to original UI-TARS-desktop
10. **Acknowledgments** — Credit to Bytedance UI-TARS-desktop

Key rules:
- "Exe Computer Use" is the product name throughout
- "UI-TARS" only appears when referring to the actual VLM model
- No references to Agent TARS (separate project, not in this fork)
- No links to bytedance repos except in acknowledgments
- All links must point to files that exist in this repo

**Step 2: Commit**
```
docs: rewrite README for Exe Computer Use identity
```

---

### Task 2: Create Getting Started guide

**Files:**
- Create: `docs/getting-started.md`

**Step 1: Write the guide covering:**

1. **System Requirements**
   - Node.js >= 20
   - pnpm 9.10+
   - macOS (Apple Silicon recommended), Windows, or Linux
   - 16GB RAM minimum (32GB for local models)

2. **Installation**
   ```bash
   git clone https://github.com/AskExe/exe-computer-use.git
   cd exe-computer-use
   pnpm install
   ```

3. **Development Mode**
   ```bash
   pnpm dev
   ```

4. **Model Configuration**
   - **Option A: Remote API** (OpenAI, Anthropic, etc.)
     - Open Settings, enter API base URL and key
   - **Option B: Local Models** (llama-server)
     - Enable local models in Settings
     - Download binary + models (UI-TARS-2B for actions, UI-TARS-7B-DPO for reflection)
     - Auto-start on app launch

5. **First Task**
   - Walk through running a simple automation task
   - Explain the agent loop: screenshot → model → action → repeat

6. **macOS Permissions**
   - Screen Recording permission
   - Accessibility permission

7. **Building for Production**
   ```bash
   cd apps/ui-tars
   npm run build
   ```

8. **Troubleshooting**
   - Common permission issues
   - Model not responding
   - Port conflicts

**Step 2: Commit**
```
docs: add comprehensive Getting Started guide
```

---

### Task 3: Create Architecture document

**Files:**
- Create: `docs/architecture.md`

**Step 1: Write architecture overview covering:**

1. **System Overview**
   - Mermaid diagram showing: User → Renderer → IPC → Main Process → Operator → Screen/Browser
   - Mermaid diagram showing: Agent Loop: Screenshot → VLM Model → Action Parser → Operator Execute → Loop

2. **Monorepo Structure**
   ```
   exe-computer-use/
   ├── apps/ui-tars/          # Electron desktop app
   │   ├── src/main/          # Main process (Node.js)
   │   ├── src/renderer/      # Renderer process (React)
   │   └── src/preload/       # Context bridge
   ├── packages/ui-tars/      # Core SDK & operators
   │   ├── sdk/               # GUIAgent engine
   │   ├── shared/            # Types & constants
   │   ├── action-parser/     # VLM output parser
   │   ├── electron-ipc/      # Type-safe IPC
   │   └── operators/         # Platform operators
   └── packages/agent-infra/  # Infrastructure
       ├── browser/           # Browser control
       ├── mcp-client/        # MCP client
       └── mcp-servers/       # MCP server implementations
   ```

3. **Main Process Architecture**
   - Services: runAgent, modelManager, windowManager, settings
   - IPC Routes: agent, model, screen, window, permission, setting, browser
   - Store: Zustand with sanitized IPC bridge to renderer

4. **Renderer Architecture**
   - React 18 with HashRouter
   - Zustand bridge from main process
   - IndexedDB for session/chat persistence
   - Tailwind CSS + shadcn/ui components

5. **Operator System**
   - Abstract Operator interface: `screenshot()`, `execute()`, `getActionSpaces()`
   - NutJS operator (desktop: keyboard, mouse, hotkeys)
   - Browser operator (Puppeteer-based web automation)
   - ADB operator (Android)

6. **Agent Loop Detail**
   - GUIAgent class lifecycle
   - Model invocation (OpenAI-compatible API)
   - Action parsing and execution
   - Retry strategy (model: 5, screenshot: 5, execute: 1)

7. **Reflection Memory Agent (RMA)**
   - dHash-based loop detection
   - Knowledge base accumulation
   - Reflection model for step summarization

8. **Local Model Serving**
   - llama-server binary management
   - Model download from HuggingFace
   - Server lifecycle (start/stop/health check)
   - Port configuration (main: 11435, reflection: 11436)

**Step 2: Commit**
```
docs: add architecture overview with diagrams
```

---

### Task 4: Create Contributing guide

**Files:**
- Create: `CONTRIBUTING.md`

**Step 1: Write contributing guide covering:**

1. **Development Setup**
   ```bash
   git clone https://github.com/AskExe/exe-computer-use.git
   cd exe-computer-use
   pnpm install
   pnpm dev
   ```

2. **Project Structure** — Brief reference to architecture.md

3. **Development Workflow**
   - Create a feature branch
   - Make changes with tests
   - Run checks: `pnpm lint && pnpm test && cd apps/ui-tars && npm run typecheck`
   - Commit with conventional commits (feat:, fix:, docs:, etc.)
   - Open a PR

4. **Code Style**
   - TypeScript strict mode
   - ESLint + Prettier (configured in @common/configs)
   - Use `logger.*` not `console.*`
   - Prefer explicit error handling over silent catches

5. **Testing**
   - Vitest for unit tests
   - Playwright for E2E tests
   - Run: `pnpm test` (root) or `cd apps/ui-tars && npm test`

6. **Adding a New Operator**
   - Implement the Operator interface from `@ui-tars/sdk/core`
   - Required methods: `screenshot()`, `execute()`, `getActionSpaces()`
   - Register in `runAgent.ts` switch statement
   - Add to operator enum in store types

7. **Package Development**
   - Each package builds independently via `rslib`
   - Workspace dependencies use `workspace:*`
   - Run `pnpm prepare` to build all packages

8. **Commit Message Convention**
   - `feat:` new feature
   - `fix:` bug fix
   - `docs:` documentation
   - `chore:` maintenance
   - `perf:` performance improvement
   - `test:` test changes

**Step 2: Commit**
```
docs: add CONTRIBUTING.md guide
```

---

### Task 5: Create Configuration reference

**Files:**
- Create: `docs/configuration.md`

**Step 1: Write config reference covering:**

1. **Settings Overview** — All configurable options accessible via the Settings UI

2. **VLM Provider Settings**
   | Setting | Description | Default |
   |---------|-------------|---------|
   | `vlmProvider` | Model provider type | - |
   | `vlmBaseUrl` | API base URL | - |
   | `vlmApiKey` | API key | - |
   | `vlmModelName` | Model name | `ui-tars` |
   | `useResponsesApi` | Use OpenAI responses API | `false` |

3. **Local Model Settings**
   | Setting | Description | Default |
   |---------|-------------|---------|
   | `localModelEnabled` | Enable local model serving | `false` |
   | `localModelAutoStart` | Auto-start servers on launch | `true` |
   | `localModelMainPort` | Main VLM server port | `11435` |
   | `localModelReflectionPort` | Reflection server port | `11436` |

4. **Agent Settings**
   | Setting | Description | Default |
   |---------|-------------|---------|
   | `maxLoopCount` | Max agent loop iterations | `100` |
   | `loopIntervalInMs` | Delay between iterations | - |
   | `rmaEnabled` | Enable Reflection Memory Agent | `true` |
   | `operator` | Operator type (LocalComputer/LocalBrowser) | `LocalComputer` |

5. **Reflection Settings**
   | Setting | Description | Default |
   |---------|-------------|---------|
   | `reflectionBaseUrl` | Reflection model API URL | - |
   | `reflectionModelName` | Reflection model name | `ui-tars-7b-dpo` |

6. **Environment Variables**
   | Variable | Description |
   |----------|-------------|
   | `EXE_APP_PRIVATE_KEY_BASE64` | App signing private key (build-time) |

**Step 2: Commit**
```
docs: add configuration reference
```

---

### Task 6: Update package READMEs

**Files:**
- Modify: `packages/ui-tars/sdk/README.md` (if exists, or create)
- Modify: `packages/ui-tars/action-parser/README.md`
- Modify: `packages/ui-tars/shared/README.md` (create if needed)

**Step 1: Write SDK README**

Cover:
- What it is (GUIAgent engine for GUI automation)
- Installation: `pnpm add @ui-tars/sdk`
- Quick example:
  ```typescript
  import { GUIAgent } from '@ui-tars/sdk';

  const agent = new GUIAgent({
    model: { baseURL: '...', apiKey: '...', model: '...' },
    operator: myOperator,
    onData: ({ data }) => console.log(data.status),
  });

  await agent.run('Open the calculator app');
  ```
- API: GUIAgent constructor options, run(), lifecycle hooks
- Link to architecture.md for full details

**Step 2: Update action-parser README**

Cover:
- What it does (parses VLM text predictions into structured actions)
- Supported action types: click, type, scroll, drag, hotkey, wait, finished, call_user
- Usage example
- Link to SDK docs

**Step 3: Commit**
```
docs: update SDK and action-parser package READMEs
```

---

### Task 7: Clean up outdated docs

**Files:**
- Delete or update: `docs/sdk.md` (currently empty stub)
- Review: `docs/plans/` — keep as historical reference

**Step 1: Remove empty sdk.md stub**

Delete `docs/sdk.md` — the SDK documentation now lives in the package README.

**Step 2: Commit**
```
docs: remove empty sdk.md stub, documentation moved to package README
```
