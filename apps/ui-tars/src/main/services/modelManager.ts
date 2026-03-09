import { app, BrowserWindow } from 'electron';
import { getLlama, LlamaServer } from 'node-llama-cpp';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { logger } from '@main/logger';

const ACTION_MODEL_URL =
  'https://huggingface.co/mradermacher/UI-TARS-2B-SFT-GGUF/resolve/main/UI-TARS-2B-SFT.Q4_K_M.gguf';
const REFLECTION_MODEL_URL =
  'https://huggingface.co/mradermacher/UI-TARS-7B-DPO-GGUF/resolve/main/UI-TARS-7B-DPO.Q4_K_M.gguf';
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
    const name =
      type === 'action'
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
      BrowserWindow.getAllWindows().forEach((w) =>
        w.webContents.send('model-download-progress', {
          type,
          progress,
          received,
          total,
        }),
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
      const model = await llama.loadModel({
        modelPath: this.getModelPath('action'),
      });
      this.actionServer = new LlamaServer({ model, port: ACTION_MODEL_PORT });
      await this.actionServer.start();
      logger.info(
        `[ModelManager] Action model server running on port ${ACTION_MODEL_PORT}`,
      );
    }

    if (this.isModelDownloaded('reflection') && !this.reflectionServer) {
      logger.info('[ModelManager] Starting reflection model server...');
      const model = await llama.loadModel({
        modelPath: this.getModelPath('reflection'),
      });
      this.reflectionServer = new LlamaServer({
        model,
        port: REFLECTION_MODEL_PORT,
      });
      await this.reflectionServer.start();
      logger.info(
        `[ModelManager] Reflection model server running on port ${REFLECTION_MODEL_PORT}`,
      );
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
