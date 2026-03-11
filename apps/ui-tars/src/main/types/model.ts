export type ModelType = 'main' | 'reflection';

export type ServerStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'error'
  | 'downloading';

export interface ModelInfo {
  name: string;
  type: ModelType;
  filename: string;
  url: string;
  size: number;
  downloaded: boolean;
  downloadProgress: number;
}

export interface MmprojInfo {
  filename: string;
  url: string;
  size: number;
  downloaded: boolean;
  downloadProgress: number;
}

export interface ServerState {
  type: ModelType;
  status: ServerStatus;
  port: number;
  pid?: number;
  error?: string;
}

export interface ModelManagerState {
  binaryDownloaded: boolean;
  binaryDownloading: boolean;
  binaryProgress: number;
  models: {
    main: ModelInfo;
    reflection: ModelInfo;
    mmproj: MmprojInfo;
  };
  servers: {
    main: ServerState;
    reflection: ServerState;
  };
}

export interface DownloadProgress {
  type: 'binary' | 'model' | 'mmproj';
  modelType?: ModelType;
  loaded: number;
  total: number;
  percent: number;
}

export const LLAMA_SERVER_VERSION = 'b8255';

export const MODEL_CONFIGS = {
  main: {
    name: 'UI-TARS-2B',
    filename: 'UI-TARS-2B-Q4_K_M.gguf',
    url: 'https://huggingface.co/lmstudio-community/UI-TARS-2B-GGUF/resolve/main/UI-TARS-2B-Q4_K_M.gguf',
    size: 2_500_000_000,
    port: 11435,
  },
  reflection: {
    name: 'UI-TARS-7B-DPO',
    filename: 'UI-TARS-7B-DPO-Q4_K_M.gguf',
    url: 'https://huggingface.co/lmstudio-community/UI-TARS-7B-DPO-GGUF/resolve/main/UI-TARS-7B-DPO-Q4_K_M.gguf',
    size: 4_680_000_000,
    port: 11436,
  },
  mmproj: {
    filename: 'mmproj-model-f16.gguf',
    url: 'https://huggingface.co/lmstudio-community/UI-TARS-7B-DPO-GGUF/resolve/main/mmproj-model-f16.gguf',
    size: 1_350_000_000,
  },
} as const;

export const BINARY_CONFIGS: Record<string, { url: string; filename: string }> =
  {
    'darwin-arm64': {
      url: `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_SERVER_VERSION}/llama-${LLAMA_SERVER_VERSION}-bin-macos-arm64.tar.gz`,
      filename: 'llama-server',
    },
    'darwin-x64': {
      url: `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_SERVER_VERSION}/llama-${LLAMA_SERVER_VERSION}-bin-macos-x64.tar.gz`,
      filename: 'llama-server',
    },
    'win32-x64': {
      url: `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_SERVER_VERSION}/llama-${LLAMA_SERVER_VERSION}-bin-win-cpu-x64.zip`,
      filename: 'llama-server.exe',
    },
    'linux-x64': {
      url: `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_SERVER_VERSION}/llama-${LLAMA_SERVER_VERSION}-bin-ubuntu-x64.tar.gz`,
      filename: 'llama-server',
    },
  };
