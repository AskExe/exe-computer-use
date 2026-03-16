# Configuration Reference

All Exe Computer Use settings are accessible through the **Settings** panel in the application UI. This document provides a complete reference of every configurable option.

## Table of Contents

- [VLM Provider Settings](#vlm-provider-settings)
- [Local Model Settings](#local-model-settings)
- [Agent Settings](#agent-settings)
- [Reflection Settings](#reflection-settings)
- [Environment Variables](#environment-variables)

---

## VLM Provider Settings

Configure the Vision Language Model endpoint used for action prediction.

| Setting | Description | Default | Notes |
|---------|-------------|---------|-------|
| `vlmProvider` | Model provider type | -- | Select from available providers in the dropdown |
| `vlmBaseUrl` | API base URL | -- | Must be an OpenAI-compatible endpoint (e.g., `https://api.openai.com/v1`) |
| `vlmApiKey` | API key | -- | Authentication key for the provider. Stored locally, never transmitted except to the configured endpoint |
| `vlmModelName` | Model name | `ui-tars` | The model identifier sent in API requests |
| `useResponsesApi` | Use OpenAI Responses API | `false` | When enabled, uses OpenAI's Responses API instead of Chat Completions. Enables `previousResponseId` for conversation continuity |

### Provider Examples

**OpenAI-compatible endpoint:**
- Base URL: `https://api.openai.com/v1`
- Model name: `ui-tars` (or your deployed model name)

**Local llama-server:**
- Base URL: `http://localhost:11435/v1`
- API key: (leave empty or use any string)
- Model name: `ui-tars`

## Local Model Settings

Configure the built-in llama-server for running UI-TARS models locally on your machine.

| Setting | Description | Default | Notes |
|---------|-------------|---------|-------|
| `localModelEnabled` | Enable local model serving | `false` | When enabled, the app manages llama-server processes |
| `localModelAutoStart` | Auto-start servers on app launch | `true` | Servers start automatically when the app opens |
| `localModelMainPort` | Main VLM server port | `11435` | Port for the primary action-prediction model |
| `localModelReflectionPort` | Reflection server port | `11436` | Port for the reflection model used by RMA |

### Supported Models

| Model | Size | Purpose | Recommended For |
|-------|------|---------|-----------------|
| **UI-TARS-2B** | ~2 GB | Action prediction (screenshot to action) | Machines with 16 GB RAM |
| **UI-TARS-7B-DPO** | ~7 GB | Reflection and self-correction | Machines with 32 GB RAM |

When local model serving is enabled:
1. The app downloads the llama-server binary if not already present.
2. Model weights are downloaded from HuggingFace on first use.
3. Each model runs as a separate llama-server child process.
4. Health checks run periodically to verify server readiness.

## Agent Settings

Control the behavior of the GUIAgent automation loop.

| Setting | Description | Default | Notes |
|---------|-------------|---------|-------|
| `maxLoopCount` | Maximum agent loop iterations | `100` | Safety limit to prevent infinite loops. The agent stops after this many screenshot-action cycles |
| `loopIntervalInMs` | Delay between iterations (ms) | -- | Optional throttle between loop cycles. Useful for slowing down the agent for observation |
| `rmaEnabled` | Enable Reflection Memory Agent | `true` | Enables automatic loop detection and self-correction. See [Architecture: RMA](./architecture.md#reflection-memory-agent-rma) |
| `operator` | Operator type | `LocalComputer` | Which platform operator to use for action execution |

### Operator Types

| Value | Description |
|-------|-------------|
| `LocalComputer` | Controls the local desktop via nut-js (mouse, keyboard, hotkeys) |
| `LocalBrowser` | Controls a web browser via Puppeteer |

## Reflection Settings

Configure the Reflection Memory Agent's model endpoint. These settings are separate from the primary VLM settings, allowing you to run a different model (or the same model on a different port) for reflection.

| Setting | Description | Default | Notes |
|---------|-------------|---------|-------|
| `reflectionBaseUrl` | Reflection model API URL | -- | OpenAI-compatible endpoint for the reflection model. When using local models, this defaults to `http://localhost:11436/v1` |
| `reflectionModelName` | Reflection model name | `ui-tars-7b-dpo` | The model used for self-correction when a loop is detected |

### How Reflection Works

When the Reflection Memory Agent detects the agent is stuck (repeated similar screenshots), it:

1. Gathers recent action history from the knowledge base.
2. Sends a reflection query to the configured reflection model.
3. Receives corrective guidance.
4. Injects the guidance into the agent's next prompt to steer it toward a different approach.

For details, see [Architecture: Reflection Memory Agent](./architecture.md#reflection-memory-agent-rma).

## Environment Variables

These environment variables are used during build and development. They are **not** required for normal usage.

| Variable | Description | Context |
|----------|-------------|---------|
| `EXE_APP_PRIVATE_KEY_BASE64` | Base64-encoded private key for app signing | Build-time only. Used by electron-forge for code signing distributable builds |
| `NODE_ENV` | Node environment | Set to `production` automatically during builds. Controls optimizations and debug behavior |
| `CI` | Continuous integration flag | Set to `e2e` for E2E test builds to adjust packaging behavior |
