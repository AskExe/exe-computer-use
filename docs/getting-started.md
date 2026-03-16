# Getting Started

This guide walks you through installing, configuring, and running Exe Computer Use for the first time.

## Table of Contents

- [System Requirements](#system-requirements)
- [Installation](#installation)
- [Development Mode](#development-mode)
- [Model Configuration](#model-configuration)
  - [Option A: Remote API](#option-a-remote-api)
  - [Option B: Local Models (llama-server)](#option-b-local-models-llama-server)
- [macOS Permissions](#macos-permissions)
- [Running Your First Task](#running-your-first-task)
- [Building for Production](#building-for-production)
- [Troubleshooting](#troubleshooting)

---

## System Requirements

| Requirement | Details |
|-------------|---------|
| **Node.js** | >= 20 |
| **pnpm** | >= 9.10 |
| **Operating System** | macOS (Apple Silicon recommended), Windows, or Linux |
| **RAM** | 16 GB minimum |
| **RAM (local models)** | 32 GB recommended for running UI-TARS models locally |
| **Disk Space** | ~5 GB for model weights (local models only) |

## Installation

```bash
# Clone the repository
git clone https://github.com/AskExe/exe-computer-use.git
cd exe-computer-use

# Install dependencies
pnpm install
```

This installs all workspace packages across the monorepo, including the Electron app, SDK, operators, and infrastructure packages.

## Development Mode

Start the application in development mode with hot reload:

```bash
pnpm dev
```

This runs `turbo` which builds all dependent packages and launches the Electron app with `electron-vite dev`.

The app window will open automatically. You can also use the debug mode for Chrome DevTools access:

```bash
cd apps/ui-tars
npm run debug
```

## Model Configuration

Exe Computer Use requires a Vision Language Model to analyze screenshots and predict actions. You have two options.

### Option A: Remote API

Use any OpenAI-compatible API provider (OpenAI, Anthropic, or self-hosted endpoints).

1. Launch the app and open **Settings** (gear icon).
2. Under **VLM Provider**, configure:
   - **API Base URL**: Your provider's API endpoint (e.g., `https://api.openai.com/v1`).
   - **API Key**: Your authentication key.
   - **Model Name**: The model identifier (e.g., `ui-tars`).
3. Save settings. The app will use this endpoint for all agent invocations.

### Option B: Local Models (llama-server)

Run UI-TARS models entirely on your machine using llama-server. No internet connection needed after setup.

1. Launch the app and open **Settings**.
2. Enable **Local Model Serving**.
3. The app will guide you through downloading:
   - **llama-server binary** -- The inference server.
   - **UI-TARS-2B** -- The primary action model (smaller, faster).
   - **UI-TARS-7B-DPO** -- The reflection model (used by the Reflection Memory Agent for self-correction).
4. Model weights are downloaded from HuggingFace and stored locally.
5. Enable **Auto-Start** to have the servers launch automatically with the app.

Default ports:
- Main model server: `11435`
- Reflection model server: `11436`

See the [Configuration Reference](./configuration.md) for all local model settings.

## macOS Permissions

On macOS, Exe Computer Use needs two system permissions to control your computer:

### Screen Recording

Required to capture screenshots of your screen.

1. The app will prompt you on first launch.
2. If denied, go to **System Settings > Privacy & Security > Screen Recording** and enable Exe Computer Use.
3. Restart the app after granting permission.

### Accessibility

Required to control your mouse, keyboard, and interact with UI elements.

1. The app will prompt you on first launch.
2. If denied, go to **System Settings > Privacy & Security > Accessibility** and enable Exe Computer Use.
3. Restart the app after granting permission.

> **Note:** Both permissions require the app to be restarted after being granted for the first time.

## Running Your First Task

1. Make sure you have configured a model provider (remote or local).
2. Ensure macOS permissions are granted (if applicable).
3. In the app's main window, type a natural language instruction. For example:

   ```
   Open System Preferences and turn on Dark Mode
   ```

4. Click **Run** (or press Enter). The agent will begin its loop:

   - **Screenshot**: Captures your current screen.
   - **Model Inference**: Sends the screenshot to the VLM with your instruction.
   - **Action Execution**: The model returns an action (e.g., "click at coordinates (512, 340)") and the operator executes it.
   - **Repeat**: The loop continues until the model signals the task is complete (`finished`) or requests your input (`call_user`).

5. You can **pause** or **stop** the agent at any time using the controls in the UI.

## Building for Production

To build a distributable application:

```bash
cd apps/ui-tars

# Full build: typecheck, bundle, and package
npm run build
```

This produces platform-specific distributables in the `out/` directory.

For individual build steps:

```bash
# Build only the distributable (skip packaging)
npm run build:dist

# Package without rebuilding
npm run package

# Create installer (after package)
npm run make
```

## Troubleshooting

### "Screen Recording permission not granted"

- Go to **System Settings > Privacy & Security > Screen Recording**.
- Ensure Exe Computer Use is listed and enabled.
- Restart the app completely (quit from the dock, not just close the window).

### Model not responding

- **Remote API**: Verify your API base URL, API key, and model name in Settings. Test the endpoint with `curl` to confirm it is reachable.
- **Local models**: Check that the llama-server process is running. Open the app logs to see server health check results. Ensure you have enough RAM for the model.

### Port conflicts (local models)

If ports `11435` or `11436` are already in use:

1. Open **Settings > Local Model**.
2. Change the port numbers to available ports.
3. Restart the local model servers.

You can check for port conflicts with:

```bash
lsof -i :11435
lsof -i :11436
```

### App fails to start in development

- Ensure Node.js >= 20 and pnpm >= 9.10 are installed.
- Delete `node_modules` and reinstall: `rm -rf node_modules && pnpm install`.
- Check that all workspace packages build successfully: `pnpm prepare`.

### Agent gets stuck in a loop

The Reflection Memory Agent (RMA) is designed to detect and break out of stuck loops automatically. If it is not working:

1. Ensure RMA is enabled in Settings (`rmaEnabled: true`).
2. If using local models, ensure the reflection model (UI-TARS-7B-DPO) is configured and running on the reflection port.
3. You can manually stop the agent at any time using the stop button.
