# Exe Computer Use

The only fully local, detection-resistant computer agent that actually works.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub repo](https://img.shields.io/badge/GitHub-AskExe%2Fexe--computer--use-181717?logo=github)](https://github.com/AskExe/exe-computer-use)

> **Part of [Exe OS](https://github.com/AskExe/exe-os)** -- the AI Employee Operating System. Exe Computer Use is the first production module: a specialist agent that sees, understands, and operates any GUI on your machine. It validates the core Exe OS primitives -- memory segregation, model abstraction, operator routing, and self-correction -- in a single-domain implementation before they generalize into the full multi-agent OS.

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

## Part of Exe OS

Exe Computer Use is the first module of **Exe OS** -- an AI Employee Operating System that orchestrates hierarchical multi-agent systems the way Linux orchestrates processes.

```
Exe OS (the kernel)
├── State persistence & recovery      ← agent execution checkpointing
├── Memory segregation                ← vector DB per agent, scoped context
├── Model routing & compute limits    ← abstracts LLMs, manages token budgets
├── Sandboxing & security             ← isolated execution environments
└── Observability & audit logs        ← full reasoning chain logging

Exe Computer Use (first module)
├── Operator abstraction              ← Desktop, Browser, Android (pluggable)
├── Model-agnostic agent loop         ← works with any VLM, local or cloud
├── Reflection Memory Agent           ← self-correcting loop detection + KB
├── IPC memory architecture           ← efficient state/image separation
└── Native kernel input               ← detection-resistant execution
```

What this module proves for Exe OS:
- **Memory segregation works** -- RMA knowledge base is separate from operational state, persists across runs
- **Model abstraction works** -- same agent loop runs on local llama-server or remote OpenAI with zero code changes
- **Operator routing works** -- 4 pluggable operators, same GUIAgent core, new platforms = new subclass
- **Self-correction works** -- dHash loop detection + reflection model = agents that learn from mistakes

The patterns validated here -- operator interfaces, model abstraction, memory layering, self-correction -- become the foundation for every specialist agent in the full Exe OS.

---

## Contributing

We welcome contributions. See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup and guidelines.

## License

[MIT License](./LICENSE). Portions derived from [UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop) by Bytedance (Apache 2.0).

## Acknowledgments

Built on the foundational work of [UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop) by Bytedance and the [UI-TARS](https://github.com/bytedance/UI-TARS) vision-language model by the Bytedance Seed team.
