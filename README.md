# Exe Computer Use

The only fully local, detection-resistant computer agent that actually works.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub repo](https://img.shields.io/badge/GitHub-AskExe%2Fexe--computer--use-181717?logo=github)](https://github.com/AskExe/exe-computer-use)

> **Part of [Exe OS](https://github.com/AskExe/exe-os)** -- the AI Employee Operating System. Exe Computer Use is a tool that any AI employee in Exe OS can call to operate a GUI. When the CTO agent needs to configure cloud infrastructure, the CMO agent needs to manage design tools, or any specialist agent needs to interact with a screen -- they delegate to Exe Computer Use. It's the hands and eyes of the organization.

---

## Why Exe

Every other computer-use agent sends your screen to the cloud, moves your cursor like a puppet, and crashes the moment it gets stuck in a loop. Exe Computer Use does none of that.

| | **Exe Computer Use** | Claude Computer Use | OpenAI Operator | Open Interpreter |
|---|---|---|---|---|
| **Runs 100% locally** | Yes -- llama-server, zero cloud | No -- Anthropic API only | No -- OpenAI API only | Partial -- needs API key |
| **Native OS input** | CGEventPostToPid (cursor never moves) | PyAutoGUI (moves cursor) | Browser only | PyAutoGUI (moves cursor) |
| **Loop detection** | dHash + Hamming distance + auto-abort | None | None | None |
| **Self-correcting memory** | Reflection model + persistent knowledge base | None | None | None |
| **IPC memory efficiency** | Dedicated image channel (99% reduction) | N/A (Python) | N/A (cloud) | N/A (Python) |
| **Multi-platform operators** | Desktop, Browser, Android, Cloud (4) | Desktop only | Browser only | Desktop only |
| **Detection resistant** | Kernel-level events, no cursor movement | Detectable cursor automation | Detectable browser automation | Detectable cursor automation |
| **Background operation** | System tray, hidden window | Terminal foreground | Browser foreground | Terminal foreground |
| **Production security** | V8 bytecode, ASAR integrity, Electron Fuses | Open Python script | Cloud service | Open Python script |
| **Codebase** | 58K LOC TypeScript, 44 test files | ~2K LOC Python | Closed source | ~15K LOC Python |

---

## How It Works

```
You type: "Book a flight to Tokyo next Thursday"

1. Screenshot captured → sent to Vision Language Model (local or remote)
2. Model returns: click(start_box='[340, 220, 580, 250]')
3. Operator executes click at native OS level (cursor never moves)
4. Loop repeats until task complete or agent calls for help
```

The core loop is model-agnostic and operator-agnostic. Swap the VLM, swap the operator, the loop doesn't change.

---

## What Makes This Different

### Native Kernel Input (No Cursor Movement)

Other tools call `pyautogui.click(x, y)` which physically moves your cursor across the screen. Exe uses **CGEventPostToPid** on macOS -- events are posted directly to the target process's event queue at the kernel level.

```
Traditional:  cursor moves → window detects hover → click fires → cursor visible to user
Exe:          CGEventPostToPid(targetPID, clickEvent) → app receives click → no cursor movement
```

Your cursor stays where you left it. You can keep working. The agent operates invisibly on a different window.

### Reflection Memory Agent (RMA)

Every other agent gets stuck in loops and retries the same failing action forever. Exe detects loops in real-time using perceptual hashing:

1. **dHash** -- Each screenshot compressed to a 64-bit fingerprint (9x8 grayscale differential)
2. **Loop Detection** -- Hamming distance comparison against sliding 12-frame window. Three similar frames = loop detected
3. **Auto-Abort** -- Agent stops, warns: *"Your current approach is not working. Try a different strategy."*
4. **Persistent Knowledge Base** -- A reflection model (UI-TARS-7B) extracts facts from each significant screen change and stores them across runs. The agent learns from its mistakes.

No other open-source computer agent has this.

### IPC Memory Architecture

Electron apps that pass screenshots through IPC serialize 5-50MB per message, 50+ times per loop iteration. That's potentially **2.5GB of serialization per task**.

Exe separates image delivery from state delivery:

```
State channel:  { status, messages: [{_hasScreenshot: true, ...}] }     ~100KB
Image channel:  { 42: { screenshot: "base64..." } }                     sent once
```

Images are sent exactly once through a dedicated channel. The Zustand state broadcast carries only lightweight flags. The renderer caches images and merges them back for display.

**Result:** 99% reduction in IPC serialization overhead.

### Fully Local Model Serving

No API keys. No rate limits. No data leaving your machine.

Exe manages two parallel llama-server instances:
- **UI-TARS-2B** (port 11435) -- Action model, predicts what to click/type
- **UI-TARS-7B-DPO** (port 11436) -- Reflection model, extracts knowledge from screen changes

Downloads happen in parallel. Servers start automatically on launch. The OpenAI-compatible API means zero code changes between local and cloud models -- just change the base URL.

### Background Operation

Exe runs from the system tray. Minimize the window, it keeps working. Pause/resume/stop from the tray icon. No terminal window required, no browser tab to keep open.

---

## Quick Start

```bash
git clone https://github.com/AskExe/exe-computer-use.git
cd exe-computer-use
pnpm install
pnpm dev
```

Open **Settings** and either:
- Enter a remote API endpoint (OpenAI, Anthropic, any OpenAI-compatible provider)
- Enable local models (downloads ~8GB of model weights, then runs fully offline)

Full guide: [Getting Started](./docs/getting-started.md)

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 Electron App                     │
│  ┌──────────┐    IPC     ┌───────────────────┐  │
│  │ Renderer │ ◄────────► │   Main Process    │  │
│  │ React 18 │  state +   │                   │  │
│  │ Tailwind │  images    │  ┌─────────────┐  │  │
│  │ shadcn   │  (split)   │  │  GUIAgent   │  │  │
│  └──────────┘            │  │  Loop       │  │  │
│                          │  └──────┬──────┘  │  │
│                          │         │         │  │
│                 ┌────────┴─────────┴───────┐ │  │
│                 │       Operators           │ │  │
│                 ├──────────┬───────┬────────┤ │  │
│                 │ Desktop  │Browser│Android │ │  │
│                 │ (nut-js) │(Pptr) │ (ADB)  │ │  │
│                 └──────────┴───────┴────────┘ │  │
│                          │                    │  │
│                 ┌────────┴────────┐           │  │
│                 │  Model Serving  │           │  │
│                 │  llama-server   │           │  │
│                 │  (local) or API │           │  │
│                 └─────────────────┘           │  │
└─────────────────────────────────────────────────┘
```

For detailed diagrams: [Architecture Guide](./docs/architecture.md)

---

## Project Structure

```
exe-computer-use/
├── apps/ui-tars/              # Electron desktop app (17K LOC)
│   ├── src/main/              #   Main process: agent, models, IPC, RMA
│   ├── src/renderer/          #   React UI: chat, gallery, settings
│   └── src/preload/           #   Context bridge (security boundary)
├── packages/ui-tars/          # Core SDK + operators (42K LOC)
│   ├── sdk/                   #   GUIAgent engine (model-agnostic loop)
│   ├── operators/             #   Desktop, Browser, Android, Cloud
│   ├── action-parser/         #   VLM text → structured actions
│   └── shared/                #   Types, constants, utilities
├── packages/agent-infra/      # Infrastructure (MCP, browser control)
└── docs/                      # Full documentation
```

**58,676 lines of TypeScript. 44 test files. Zero JavaScript.**

---

## Security

| Layer | Protection |
|-------|------------|
| **Electron Fuses** | ASAR integrity validation, cookie encryption, no Node CLI inspection |
| **Bytecode Compilation** | Sensitive chunks compiled to V8 bytecode (not inspectable) |
| **Context Isolation** | Renderer has zero direct access to Node.js or IPC |
| **Preload Bridge** | Only `zustandBridge` and `screenshotBridge` exposed to renderer |
| **No Hardcoded Secrets** | API keys stored in encrypted Electron Store, private key injected at build time |
| **Crash Reporting** | Local-only minidumps, no data uploaded |

---

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](./docs/getting-started.md) | Installation, model setup, first task |
| [Architecture](./docs/architecture.md) | System design with Mermaid diagrams |
| [Configuration](./docs/configuration.md) | All settings and environment variables |
| [Contributing](./CONTRIBUTING.md) | Dev setup, testing, adding operators |

---

## Architectural Decision Record

Every architectural choice was made to solve a specific failure mode we observed in existing computer-use tools. Here's what we chose, when, and why it's better.

### ADR-001: Native Kernel Input over Cursor Automation
**Date:** 2025-02-15 | **Status:** Implemented

**Problem:** PyAutoGUI and similar tools physically move the cursor. This (1) blocks the user from working during automation, (2) is trivially detectable by any app monitoring cursor position, and (3) breaks when the user accidentally moves the mouse.

**Decision:** Use `CGEventPostToPid` on macOS to post input events directly to the target process's kernel event queue. The cursor never moves. Events arrive as if the user clicked inside the target app.

**Why this is better:** Claude Computer Use, OpenAI Operator, and Open Interpreter all use PyAutoGUI or browser DevTools. Every one of them moves the cursor, is detectable, and locks the user out during execution. Exe doesn't.

**Trade-off:** macOS-only for targeted input. Linux/Windows fall back to global nut-js input. We accept this because macOS is the primary target and the fallback still works -- it's just not invisible.

---

### ADR-002: Dedicated IPC Image Channel
**Date:** 2025-03-16 | **Status:** Implemented

**Problem:** Electron's Zustand state bridge serializes the entire app state on every update. Each message includes a 5-50MB base64 screenshot. With 50+ state updates per agent iteration, a single task serializes up to 2.5GB through IPC.

**Decision:** Strip screenshots from the state broadcast and send them exactly once through a dedicated `'screenshots'` IPC channel. The state carries only lightweight `_hasScreenshot` boolean flags. The renderer caches images and merges them back for display and IndexedDB persistence.

**Why this is better:** No other Electron-based agent addresses this. The naive approach (pass everything through state) works for demos but collapses under real workloads. Our approach reduces per-iteration IPC overhead from ~50MB to <100KB -- a 99% reduction.

**Trade-off:** Added complexity in the renderer (image cache + merge logic). Worth it because the alternative is an unusable app after 20 iterations.

---

### ADR-003: Reflection Memory Agent (RMA) with Perceptual Hashing
**Date:** 2025-03-09 | **Status:** Implemented

**Problem:** Every computer agent gets stuck in loops. It clicks a button, nothing changes, it clicks again, forever. There's no mechanism to detect "I've been here before" or "this approach isn't working."

**Decision:** Three-layer detection: (1) dHash compresses each screenshot to a 64-bit perceptual fingerprint, (2) Hamming distance comparison against a sliding 12-frame window detects repeated screens, (3) a reflection model (UI-TARS-7B) extracts facts from significant screen changes and stores them in a persistent knowledge base that survives across runs.

**Why this is better:** No other open-source computer agent has loop detection. Claude Computer Use, OpenAI Operator, and Open Interpreter all retry indefinitely. Exe detects loops within 3 frames, auto-aborts, and learns from the failure.

**Trade-off:** RMA adds ~500ms latency when a significant screen change triggers reflection. We made reflection non-blocking (fire-and-forget) so it never delays the main agent loop.

---

### ADR-004: Local Model Serving via llama-server
**Date:** 2025-03-14 | **Status:** Implemented

**Problem:** Cloud-only agents require API keys, are subject to rate limits, send sensitive screen data to third parties, and fail offline. For a tool that Exe OS agents call autonomously, cloud dependency is unacceptable.

**Decision:** Bundle llama-server binary management. Two parallel instances serve UI-TARS-2B (action model, port 11435) and UI-TARS-7B-DPO (reflection model, port 11436). Downloads are parallel. Servers auto-start on launch. The OpenAI-compatible API means the same code path works for local and remote -- just change the base URL.

**Why this is better:** Claude Computer Use requires Anthropic API. OpenAI Operator requires OpenAI API. Open Interpreter needs an API key. Exe runs fully offline with zero data leaving the machine. For Exe OS, this means AI employees can operate 24/7 without cloud costs or data exposure.

**Trade-off:** ~8GB of model weights to download. First launch takes time. We accept this because ongoing operation is free, private, and unrestricted.

---

### ADR-005: Pluggable Operator Abstraction
**Date:** 2025-01-20 | **Status:** Implemented

**Problem:** Computer-use tools are hardcoded to one platform. Claude Computer Use only does desktop. OpenAI Operator only does browser. Neither can control mobile devices.

**Decision:** Abstract the `Operator` interface: `screenshot()`, `execute()`, `getActionSpaces()`. The GUIAgent loop is operator-agnostic. Four implementations ship today: Desktop (nut-js), Browser (Puppeteer), Android (ADB), and Cloud (Browserbase). Adding a new platform = implementing one class.

**Why this is better:** One agent, four platforms. The same task instruction works whether the target is a desktop app, a web page, or an Android phone. No other tool does this.

**Trade-off:** Abstraction adds a layer of indirection. We accept this because the alternative -- forking the entire agent for each platform -- is unmaintainable.

---

### ADR-006: Electron over Python
**Date:** 2025-01-10 | **Status:** Implemented

**Problem:** Python-based agents (Claude Computer Use, Open Interpreter) run in terminals, have no persistent UI, can't do background operation, and distribute as scripts that users need to `pip install` and configure.

**Decision:** Build on Electron 34. Native desktop app with system tray, background operation, auto-updates, code signing, and a React UI for real-time agent visualization. TypeScript throughout -- 58K LOC, zero JavaScript.

**Why this is better:** Users download a `.dmg`, double-click, and it works. No terminal, no Python environment, no dependency hell. The system tray means it runs invisibly in the background. Auto-updates mean users always have the latest version.

**Trade-off:** Electron's memory footprint (~150MB baseline). We mitigated this with the IPC image channel (ADR-002) and aggressive state management. For a tool that operates your entire desktop, 150MB is negligible.

---

### ADR-007: V8 Bytecode Compilation for Secrets
**Date:** 2025-01-15 | **Status:** Implemented

**Problem:** Electron apps ship JavaScript source. API keys, signing keys, and sensitive logic are readable by anyone who unpacks the `.asar` archive.

**Decision:** Use `electron-vite`'s bytecode plugin to compile sensitive chunks to V8 bytecode at build time. Enable Electron Fuses: ASAR integrity validation, `OnlyLoadAppFromAsar`, cookie encryption, disable Node CLI inspection. Context isolation ensures the renderer can never access Node.js APIs directly.

**Why this is better:** Open Interpreter is an open Python script. Claude Computer Use runs in a terminal with no protection. Exe's secrets are compiled to bytecode, the ASAR can't be tampered with, and the renderer is sandboxed.

**Trade-off:** Bytecode compilation adds build complexity. JIT entitlement required on macOS. We accept this because the alternative is shipping secrets in plaintext.

---

## Part of Exe OS

**[Exe OS](https://github.com/AskExe/exe-os)** is an AI Employee Operating System -- infrastructure for orchestrating hierarchical multi-agent systems the way Linux orchestrates processes. Exe Computer Use is a **tool in that system**, not the system itself.

```
Exe OS (the operating system)
├── Exe (COO/Orchestrator)           ← parses goals, routes tasks, reviews work
├── Specialist Agents                ← CTO, CMO, etc. with domain expertise
│   ├── Scoped memory & tools        ← each agent has its own context
│   └── SOPs & quality metrics       ← domain-specific workflows
└── Shared Tools                     ← capabilities any agent can invoke
    ├── Exe Computer Use             ← operate any GUI on the machine
    ├── Code execution               ← run scripts in sandboxed environments
    ├── Browser automation           ← web research and interaction
    └── ...                          ← extensible tool registry
```

When any AI employee in Exe OS needs to interact with a desktop application -- clicking through a UI, filling out forms, navigating software that has no API -- it calls Exe Computer Use. The CTO agent uses it to configure infrastructure dashboards. The CMO agent uses it to operate design tools. It's the hands and eyes of the organization.

---

## Contributing

We welcome contributions. See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup and guidelines.

## License

[MIT License](./LICENSE). Portions derived from [UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop) by Bytedance (Apache 2.0).

## Acknowledgments

Built on the foundational work of [UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop) by Bytedance and the [UI-TARS](https://github.com/bytedance/UI-TARS) vision-language model by the Bytedance Seed team.
