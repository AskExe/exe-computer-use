# llama-server: Vision Model Serving for UI-TARS

## Decision

Use the `llama-server` binary from llama.cpp to serve UI-TARS-2B and UI-TARS-7B-DPO locally. This is the only viable path for local model serving because:

- **node-llama-cpp v3.17.1 has zero vision support** — no image processing, no multimodal API
- **`LlamaServer` class does not exist** in any version of node-llama-cpp (confirmed via maintainer statement and source inspection)
- Both UI-TARS models are vision-language models (qwen2vl architecture) — they require screenshot inputs via `image_url`

---

## Evidence: llama-server Supports Vision

### From the official llama.cpp server README

> "If model supports multimodal, you can input the media file via `image_url` content part. We support both base64 and remote URL as input."

The `/v1/chat/completions` endpoint accepts the OpenAI vision format natively:

```json
{
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "Describe this screenshot" },
      { "type": "image_url", "image_url": { "url": "data:image/png;base64,<base64>" } }
    ]
  }]
}
```

This is **identical** to the format already used in `ReflectionService` — no changes to the VLM client needed.

### Vision flags (from server README)

| Flag | Description |
|------|-------------|
| `--mmproj FILE` | Path to multimodal projector file |
| `--mmproj-url URL` | URL to multimodal projector file |
| `--mmproj-auto` | Auto-detect and load projector (default: enabled) |
| `--mmproj-offload` | GPU offload the projector |
| `--image-min-tokens N` | Minimum token budget per image |
| `--image-max-tokens N` | Maximum token budget per image |

### Supported architectures (from `docs/multimodal.md`)

Officially listed: Gemma 3, SmolVLM, Pixtral 12B, **Qwen2 VL**, **Qwen2.5 VL**, Mistral Small 3.1, InternVL 2.5/3, Llama 4 Scout, Moondream2.

**UI-TARS is built on qwen2vl — explicitly on the supported list.**

### Merged in PR #12898

"server: vision support via libmtmd" — the underlying multimodal library powering all vision inference in llama-server.

Sources:
- [llama.cpp server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- [llama.cpp multimodal.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)
- [PR #12898](https://github.com/ggml-org/llama.cpp/pull/12898)
- [Simon Willison: Trying out llama.cpp's new vision support](https://simonwillison.net/2025/May/10/llama-cpp-vision/)

---

## UI-TARS GGUF Files

### lmstudio-community/UI-TARS-7B-DPO-GGUF (recommended, public)

URL: `https://huggingface.co/lmstudio-community/UI-TARS-7B-DPO-GGUF`

| File | Size | Use |
|------|------|-----|
| `UI-TARS-7B-DPO-Q4_K_M.gguf` | 4.68 GB | Model (recommended quant) |
| `UI-TARS-7B-DPO-Q3_K_L.gguf` | 4.09 GB | Model (smaller) |
| `UI-TARS-7B-DPO-Q6_K.gguf` | 6.25 GB | Model (higher quality) |
| `UI-TARS-7B-DPO-Q8_0.gguf` | 8.10 GB | Model (near-lossless) |
| `mmproj-model-f16.gguf` | 1.35 GB | **Vision projector (required)** |

Download command:
```bash
huggingface-cli download lmstudio-community/UI-TARS-7B-DPO-GGUF \
  --include "UI-TARS-7B-DPO-Q4_K_M.gguf" "mmproj-model-f16.gguf" \
  --local-dir ./models/
```

### Mungert/UI-TARS-1.5-7B-GGUF (newer model version)

URL: `https://huggingface.co/Mungert/UI-TARS-1.5-7B-GGUF`

- Architecture: `qwen2vl` (confirmed)
- Has per-quant mmproj files (e.g. `UI-TARS-1.5-7B-q8_0.mmproj`)
- Explicit `--mmproj` usage instructions in the README

---

## Pre-built Binaries

Latest release: **b8255** (March 2026). Available at:
`https://github.com/ggerganov/llama.cpp/releases`

| Platform | Asset |
|----------|-------|
| macOS Apple Silicon | `llama-b8255-bin-macos-arm64.tar.gz` |
| macOS Intel | `llama-b8255-bin-macos-x64.tar.gz` |
| Windows CPU x64 | `llama-b8255-bin-win-cpu-x64.zip` |
| Windows CPU arm64 | `llama-b8255-bin-win-cpu-arm64.zip` |
| Windows CUDA 12.4 | `llama-b8255-bin-win-cuda-12.4-x64.zip` |
| Windows CUDA 13.1 | `llama-b8255-bin-win-cuda-13.1-x64.zip` |
| Windows Vulkan | `llama-b8255-bin-win-vulkan-x64.zip` |
| Linux x64 | `llama-b8255-bin-ubuntu-x64.tar.gz` |
| Linux Vulkan | `llama-b8255-bin-ubuntu-vulkan-x64.tar.gz` |
| Linux ROCm | `llama-b8255-bin-ubuntu-rocm-7.2-x64.tar.gz` |

The `llama-server` binary is included in all packages.

---

## Serving UI-TARS with llama-server

### Ports

| Model | Port | Setting |
|-------|------|---------|
| UI-TARS-2B (action/main VLM) | 11435 | `vlmBaseUrl` |
| UI-TARS-7B-DPO (reflection/RMA) | 11436 | `reflectionBaseUrl` |

### Startup command

```sh
# Reflection model (RMA)
llama-server \
  -m ~/.exe-computer-use/models/UI-TARS-7B-DPO-Q4_K_M.gguf \
  --mmproj ~/.exe-computer-use/models/mmproj-model-f16.gguf \
  --host 127.0.0.1 \
  --port 11436 \
  --ctx-size 4096 \
  -ngl 99
```

`-ngl 99` offloads all layers to GPU (Metal on macOS, CUDA on Windows/Linux).

### API call (matches existing ReflectionService exactly)

```sh
curl http://127.0.0.1:11436/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ui-tars-7b-dpo",
    "messages": [{
      "role": "user",
      "content": [
        { "type": "text", "text": "What changed on screen?" },
        { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
      ]
    }],
    "max_tokens": 500
  }'
```

---

## Implementation Plan

### What to build

1. **`src/main/services/modelManager.ts`** — orchestrates binary + model downloads, starts/stops servers
2. **`src/main/ipcRoutes/model.ts`** — IPC handlers: `model:status`, `model:download`, `model:startServers`
3. **`src/main/main.ts`** — call `ModelManager.getInstance().startServers()` on app ready
4. **`scripts/download-llama-server.js`** — postinstall script to fetch the correct binary for the current platform
5. **`electron-builder.yml`** — add `resources/bin/` to `asarUnpack` so the binary is executable at runtime

### Binary packaging

Bundle one `llama-server` binary per platform in `resources/bin/llama-server` (or `.exe` on Windows). Selected at build time based on `process.platform` + `process.arch`. The binary is ~10–20 MB per platform.

### Model storage

Models download to `app.getPath('userData')/models/` — persists across updates, not bundled in the app.
