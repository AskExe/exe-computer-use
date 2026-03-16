# Exe Computer Use

A fully local desktop application that controls your computer using natural language.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![GitHub repo](https://img.shields.io/badge/GitHub-AskExe%2Fexe--computer--use-181717?logo=github)](https://github.com/AskExe/exe-computer-use)

---

## What It Does

Exe Computer Use is a native desktop agent powered by Vision Language Models (UI-TARS). It takes screenshots of your screen, sends them to a VLM for analysis, and executes the predicted actions -- clicks, keystrokes, scrolls, drags -- in an autonomous loop until your task is complete. Tell it what you want in plain English and watch it work.

<!-- TODO: Add screenshot or GIF of the app in action -->

## Features

- **Local AI Models** -- Run UI-TARS models entirely on your machine via llama-server. No cloud required.
- **Remote API Support** -- Connect to OpenAI, Anthropic, or any OpenAI-compatible endpoint.
- **Desktop Automation** -- Control your mouse, keyboard, and desktop applications via nut-js.
- **Browser Automation** -- Automate web browsers through a Puppeteer-based operator.
- **Android Automation** -- Control Android devices via ADB.
- **Reflection Memory Agent (RMA)** -- Detects stuck loops using perceptual hashing and self-corrects with a reflection model.
- **Cross-Platform** -- macOS (Apple Silicon recommended), Windows, and Linux support.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/AskExe/exe-computer-use.git
cd exe-computer-use

# Install dependencies
pnpm install

# Start in development mode
pnpm dev
```

Once the app launches, open **Settings** and configure your model provider:

- **Remote API**: Enter your API base URL, API key, and model name.
- **Local Models**: Enable local model serving, download the llama-server binary and UI-TARS model weights, and the app will manage servers automatically.

For the full setup guide, see [Getting Started](./docs/getting-started.md).

## Architecture Overview

Exe Computer Use is an Electron 34 desktop application built as a monorepo with pnpm workspaces and Turbo.

The core loop works like this:

1. The agent takes a **screenshot** of your screen.
2. The screenshot is sent to a **Vision Language Model** (UI-TARS) for analysis.
3. The model returns a **predicted action** (click, type, scroll, etc.) with coordinates.
4. The **operator** executes the action on your machine.
5. The loop repeats until the task is complete or the agent calls for user input.

For detailed diagrams and component breakdowns, see the [Architecture Guide](./docs/architecture.md).

## Project Structure

```
exe-computer-use/
├── apps/ui-tars/                  # Electron desktop application
│   ├── src/main/                  # Main process (Node.js)
│   │   ├── services/              # Core services (agent, model manager, RMA, settings)
│   │   ├── ipcRoutes/             # IPC route handlers
│   │   ├── store/                 # Zustand state management
│   │   └── window/                # Window management
│   ├── src/renderer/              # Renderer process (React 18)
│   │   └── src/                   # UI components, pages, hooks, store
│   └── src/preload/               # Context bridge (IPC exposure)
├── packages/ui-tars/              # Core SDK and operators
│   ├── sdk/                       # GUIAgent engine
│   ├── shared/                    # Shared types, constants, utilities
│   ├── action-parser/             # VLM output → structured actions
│   ├── electron-ipc/              # Type-safe IPC definitions
│   └── operators/                 # Platform operators
│       ├── nut-js/                # Desktop operator (mouse, keyboard)
│       ├── browser-operator/      # Browser operator (Puppeteer)
│       └── adb/                   # Android operator
├── packages/agent-infra/          # Agent infrastructure
│   ├── browser/                   # Browser control utilities
│   ├── mcp-client/                # MCP client implementation
│   └── mcp-servers/               # MCP server implementations
└── docs/                          # Documentation
```

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](./docs/getting-started.md) | Installation, configuration, and first run |
| [Architecture](./docs/architecture.md) | System design, diagrams, and component details |
| [Configuration](./docs/configuration.md) | All settings and environment variables |
| [Contributing](./CONTRIBUTING.md) | Development setup, workflow, and guidelines |

## Contributing

We welcome contributions. See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, coding standards, and how to submit a pull request.

## License

This project is licensed under the [MIT License](./LICENSE).

Portions of this codebase are derived from [UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop) by Bytedance, originally licensed under the Apache License 2.0.

## Acknowledgments

Exe Computer Use is a fork of [UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop) by Bytedance. We are grateful to the original authors for their foundational work on Vision Language Model-driven GUI automation.

The [UI-TARS](https://github.com/bytedance/UI-TARS) model that powers this application was developed by the Bytedance Seed team.
