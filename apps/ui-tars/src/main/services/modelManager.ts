import { app } from 'electron';
import { spawn, exec, ChildProcess, execSync } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
  unlinkSync,
  renameSync,
} from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { logger } from '@main/logger';
import {
  ModelManagerState,
  ModelType,
  DownloadProgress,
  MODEL_CONFIGS,
  BINARY_CONFIGS,
} from '@main/types/model';

const execAsync = promisify(exec);

type ProgressCallback = (progress: DownloadProgress) => void;
type StatusCallback = (state: ModelManagerState) => void;

export class ModelManager {
  private static instance: ModelManager | null = null;
  private modelsDir: string;
  private binaryPath: string;
  private state: ModelManagerState;
  private processes: Map<ModelType, ChildProcess> = new Map();
  private progressCallbacks: Set<ProgressCallback> = new Set();
  private statusCallbacks: Set<StatusCallback> = new Set();
  private webContents: Electron.WebContents | null = null;

  private constructor() {
    this.modelsDir = join(app.getPath('userData'), 'models');
    this.binaryPath = join(this.modelsDir, 'llama-server');

    if (process.platform === 'win32') {
      this.binaryPath = join(this.modelsDir, 'llama-server.exe');
    }

    this.state = this.getInitialState();
    this.ensureModelsDir();
  }

  public static getInstance(): ModelManager {
    if (!ModelManager.instance) {
      ModelManager.instance = new ModelManager();
    }
    return ModelManager.instance;
  }

  private getInitialState(): ModelManagerState {
    return {
      binaryDownloaded: false,
      binaryDownloading: false,
      binaryProgress: 0,
      models: {
        main: {
          name: MODEL_CONFIGS.main.name,
          type: 'main',
          filename: MODEL_CONFIGS.main.filename,
          url: MODEL_CONFIGS.main.url,
          size: MODEL_CONFIGS.main.size,
          downloaded: false,
          downloadProgress: 0,
        },
        reflection: {
          name: MODEL_CONFIGS.reflection.name,
          type: 'reflection',
          filename: MODEL_CONFIGS.reflection.filename,
          url: MODEL_CONFIGS.reflection.url,
          size: MODEL_CONFIGS.reflection.size,
          downloaded: false,
          downloadProgress: 0,
        },
        mmproj: {
          filename: MODEL_CONFIGS.mmproj.filename,
          url: MODEL_CONFIGS.mmproj.url,
          size: MODEL_CONFIGS.mmproj.size,
          downloaded: false,
          downloadProgress: 0,
        },
      },
      servers: {
        main: {
          type: 'main',
          status: 'stopped',
          port: MODEL_CONFIGS.main.port,
        },
        reflection: {
          type: 'reflection',
          status: 'stopped',
          port: MODEL_CONFIGS.reflection.port,
        },
      },
    };
  }

  private ensureModelsDir(): void {
    if (!existsSync(this.modelsDir)) {
      mkdirSync(this.modelsDir, { recursive: true });
    }
  }

  public onProgress(callback: ProgressCallback): () => void {
    this.progressCallbacks.add(callback);
    return () => this.progressCallbacks.delete(callback);
  }

  public onStatusChange(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    return () => this.statusCallbacks.delete(callback);
  }

  public setWebContents(wc: Electron.WebContents): void {
    this.webContents = wc;
  }

  private emitProgress(progress: DownloadProgress): void {
    this.progressCallbacks.forEach((cb) => cb(progress));
    this.webContents?.send('model:progress', progress);
  }

  private emitStatus(): void {
    this.statusCallbacks.forEach((cb) => cb(this.state));
    this.webContents?.send('model:status', this.state);
  }

  public getState(): ModelManagerState {
    return this.state;
  }

  public async checkExistingFiles(): Promise<void> {
    this.state.binaryDownloaded = existsSync(this.binaryPath);

    const mainModelPath = join(this.modelsDir, MODEL_CONFIGS.main.filename);
    const reflectionModelPath = join(
      this.modelsDir,
      MODEL_CONFIGS.reflection.filename,
    );
    const mmprojPath = join(this.modelsDir, MODEL_CONFIGS.mmproj.filename);

    this.state.models.main.downloaded = existsSync(mainModelPath);
    this.state.models.reflection.downloaded = existsSync(reflectionModelPath);
    this.state.models.mmproj.downloaded = existsSync(mmprojPath);

    if (this.state.models.main.downloaded) {
      const stats = statSync(mainModelPath);
      this.state.models.main.downloadProgress = Math.min(
        100,
        (stats.size / MODEL_CONFIGS.main.size) * 100,
      );
    }

    if (this.state.models.reflection.downloaded) {
      const stats = statSync(reflectionModelPath);
      this.state.models.reflection.downloadProgress = Math.min(
        100,
        (stats.size / MODEL_CONFIGS.reflection.size) * 100,
      );
    }

    if (this.state.models.mmproj.downloaded) {
      const stats = statSync(mmprojPath);
      this.state.models.mmproj.downloadProgress = Math.min(
        100,
        (stats.size / MODEL_CONFIGS.mmproj.size) * 100,
      );
    }

    this.emitStatus();
  }

  public async downloadBinary(): Promise<void> {
    const platform = `${process.platform}-${process.arch}`;
    const config = BINARY_CONFIGS[platform];

    if (!config) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    if (this.state.binaryDownloading) {
      logger.warn('[ModelManager] Binary download already in progress');
      return;
    }

    this.state.binaryDownloading = true;
    this.state.binaryProgress = 0;
    this.emitStatus();

    const archiveExt = config.url.endsWith('.zip') ? 'zip' : 'tar.gz';
    const archivePath = join(this.modelsDir, `llama-server.${archiveExt}`);

    try {
      logger.info(
        '[ModelManager] Downloading llama-server binary from:',
        config.url,
      );

      const response = await fetch(config.url);
      if (!response.ok) {
        throw new Error(`Failed to download binary: ${response.status}`);
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;

      const fileStream = createWriteStream(archivePath);

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = Readable.fromWeb(response.body as any);

      reader.on('data', (chunk: Buffer) => {
        loaded += chunk.length;
        const percent = total > 0 ? (loaded / total) * 100 : 0;
        this.state.binaryProgress = percent;
        this.emitProgress({
          type: 'binary',
          loaded,
          total,
          percent,
        });
      });

      await pipeline(reader, fileStream);

      logger.info('[ModelManager] Extracting binary...');

      try {
        if (archiveExt === 'tar.gz') {
          await this.extractTarGz(archivePath);
        } else {
          await this.extractZip(archivePath);
        }
      } finally {
        if (existsSync(archivePath)) {
          unlinkSync(archivePath);
        }
      }

      this.state.binaryDownloaded = true;
      this.state.binaryDownloading = false;
      this.state.binaryProgress = 100;
      this.emitStatus();

      logger.info('[ModelManager] Binary download complete');
    } catch (error) {
      this.state.binaryDownloading = false;
      this.state.binaryProgress = 0;
      this.emitStatus();
      logger.error('[ModelManager] Binary download failed:', error);
      throw error;
    }
  }

  private async extractTarGz(tarPath: string): Promise<void> {
    const { stdout } = await execAsync(
      `tar -tzf "${tarPath}" | grep llama-server`,
    );
    const binaryName = stdout.trim().split('\n')[0];

    await execAsync(
      `tar -xzf "${tarPath}" -C "${this.modelsDir}" --strip-components=1 "${binaryName}"`,
    );

    if (process.platform !== 'win32') {
      await execAsync(`chmod +x "${this.binaryPath}"`);
    }
  }

  private async extractZip(zipPath: string): Promise<void> {
    if (process.platform === 'win32') {
      const tempDir = join(this.modelsDir, 'temp-extract');
      mkdirSync(tempDir, { recursive: true });

      await execAsync(
        `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tempDir}' -Force"`,
      );

      const findBinary = (dir: string): string | null => {
        const items = execSync(`dir /b "${dir}"`, { encoding: 'utf8' })
          .toString()
          .split('\n');
        for (const item of items) {
          const fullPath = join(dir, item.trim());
          if (
            item.trim() === 'llama-server.exe' ||
            item.trim() === 'llama-server'
          ) {
            return fullPath;
          }
          if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
            const found = findBinary(fullPath);
            if (found) return found;
          }
        }
        return null;
      };

      const binarySource = findBinary(tempDir);
      if (binarySource) {
        renameSync(binarySource, this.binaryPath);
      }

      await execAsync(`rmdir /s /q "${tempDir}"`);
    } else {
      await execAsync(`unzip -o "${zipPath}" -d "${this.modelsDir}"`);
      await execAsync(`chmod +x "${this.binaryPath}"`);
    }
  }

  public async downloadModel(type: ModelType): Promise<void> {
    const config =
      type === 'main' ? MODEL_CONFIGS.main : MODEL_CONFIGS.reflection;
    const modelPath = join(this.modelsDir, config.filename);

    if (
      this.state.models[type].downloadProgress > 0 &&
      this.state.models[type].downloadProgress < 100
    ) {
      logger.warn(`[ModelManager] ${type} model download already in progress`);
      return;
    }

    this.state.models[type].downloadProgress = 0;
    this.emitStatus();

    try {
      logger.info(`[ModelManager] Downloading ${type} model from:`, config.url);

      const response = await fetch(config.url);
      if (!response.ok) {
        throw new Error(`Failed to download model: ${response.status}`);
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : config.size;
      let loaded = 0;

      const fileStream = createWriteStream(modelPath);

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = Readable.fromWeb(response.body as any);

      reader.on('data', (chunk: Buffer) => {
        loaded += chunk.length;
        const percent = total > 0 ? (loaded / total) * 100 : 0;
        this.state.models[type].downloadProgress = percent;
        this.emitProgress({
          type: 'model',
          modelType: type,
          loaded,
          total,
          percent,
        });
      });

      await pipeline(reader, fileStream);

      this.state.models[type].downloaded = true;
      this.state.models[type].downloadProgress = 100;
      this.emitStatus();

      logger.info(`[ModelManager] ${type} model download complete`);
    } catch (error) {
      this.state.models[type].downloadProgress = 0;
      this.emitStatus();
      logger.error(`[ModelManager] ${type} model download failed:`, error);
      throw error;
    }
  }

  public async downloadMmproj(): Promise<void> {
    const mmprojPath = join(this.modelsDir, MODEL_CONFIGS.mmproj.filename);

    if (
      this.state.models.mmproj.downloadProgress > 0 &&
      this.state.models.mmproj.downloadProgress < 100
    ) {
      logger.warn('[ModelManager] mmproj download already in progress');
      return;
    }

    this.state.models.mmproj.downloadProgress = 0;
    this.emitStatus();

    try {
      logger.info(
        '[ModelManager] Downloading mmproj from:',
        MODEL_CONFIGS.mmproj.url,
      );

      const response = await fetch(MODEL_CONFIGS.mmproj.url);
      if (!response.ok) {
        throw new Error(`Failed to download mmproj: ${response.status}`);
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength
        ? parseInt(contentLength, 10)
        : MODEL_CONFIGS.mmproj.size;
      let loaded = 0;

      const fileStream = createWriteStream(mmprojPath);

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = Readable.fromWeb(response.body as any);

      reader.on('data', (chunk: Buffer) => {
        loaded += chunk.length;
        const percent = total > 0 ? (loaded / total) * 100 : 0;
        this.state.models.mmproj.downloadProgress = percent;
        this.emitProgress({
          type: 'mmproj',
          loaded,
          total,
          percent,
        });
      });

      await pipeline(reader, fileStream);

      this.state.models.mmproj.downloaded = true;
      this.state.models.mmproj.downloadProgress = 100;
      this.emitStatus();

      logger.info('[ModelManager] mmproj download complete');
    } catch (error) {
      this.state.models.mmproj.downloadProgress = 0;
      this.emitStatus();
      logger.error('[ModelManager] mmproj download failed:', error);
      throw error;
    }
  }

  public async downloadAll(): Promise<void> {
    if (!this.state.binaryDownloaded) {
      await this.downloadBinary();
    }

    // Download models in parallel — they are independent files from different URLs
    const parallelDownloads: Promise<void>[] = [];

    if (!this.state.models.mmproj.downloaded) {
      parallelDownloads.push(this.downloadMmproj());
    }

    if (!this.state.models.main.downloaded) {
      parallelDownloads.push(this.downloadModel('main'));
    }

    if (!this.state.models.reflection.downloaded) {
      parallelDownloads.push(this.downloadModel('reflection'));
    }

    await Promise.all(parallelDownloads);
  }

  public async startServer(type: ModelType, port?: number): Promise<void> {
    const config =
      type === 'main' ? MODEL_CONFIGS.main : MODEL_CONFIGS.reflection;
    const serverPort = port ?? config.port;
    const modelPath = join(this.modelsDir, config.filename);
    const mmprojPath = join(this.modelsDir, MODEL_CONFIGS.mmproj.filename);

    if (!this.state.binaryDownloaded) {
      throw new Error('Binary not downloaded');
    }

    if (!this.state.models[type].downloaded) {
      throw new Error(`${type} model not downloaded`);
    }

    if (!this.state.models.mmproj.downloaded) {
      throw new Error('mmproj not downloaded');
    }

    if (this.processes.has(type)) {
      logger.warn(`[ModelManager] ${type} server already running`);
      return;
    }

    this.state.servers[type].status = 'starting';
    this.state.servers[type].port = serverPort;
    this.emitStatus();

    try {
      const args = [
        '-m',
        modelPath,
        '--mmproj',
        mmprojPath,
        '--host',
        '127.0.0.1',
        '--port',
        serverPort.toString(),
        '--ctx-size',
        '4096',
        '-ngl',
        '99',
      ];

      logger.info(
        `[ModelManager] Starting ${type} server:`,
        this.binaryPath,
        args,
      );

      const proc = spawn(this.binaryPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.processes.set(type, proc);
      this.state.servers[type].pid = proc.pid;

      proc.stdout?.on('data', (data: Buffer) => {
        logger.debug(`[llama-server ${type}]`, data.toString());
      });

      proc.stderr?.on('data', (data: Buffer) => {
        logger.debug(`[llama-server ${type} stderr]`, data.toString());
      });

      proc.on('exit', (code) => {
        logger.info(`[ModelManager] ${type} server exited with code:`, code);
        this.processes.delete(type);
        this.state.servers[type].status = 'stopped';
        this.state.servers[type].pid = undefined;
        this.emitStatus();
      });

      proc.on('error', (error) => {
        logger.error(`[ModelManager] ${type} server error:`, error);
        this.processes.delete(type);
        this.state.servers[type].status = 'error';
        this.state.servers[type].error = error.message;
        this.emitStatus();
      });

      await this.waitForServer(config.port);

      this.state.servers[type].status = 'running';
      this.emitStatus();

      logger.info(
        `[ModelManager] ${type} server started on port ${config.port}`,
      );
    } catch (error) {
      this.state.servers[type].status = 'error';
      this.state.servers[type].error =
        error instanceof Error ? error.message : 'Unknown error';
      this.emitStatus();
      throw error;
    }
  }

  private async waitForServer(port: number, timeout = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`, {
          method: 'GET',
        });
        if (response.ok) {
          return;
        }
      } catch {
        // Server not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(`Server did not start within ${timeout}ms`);
  }

  public async stopServer(type: ModelType): Promise<void> {
    const proc = this.processes.get(type);

    if (!proc) {
      logger.warn(`[ModelManager] ${type} server not running`);
      return;
    }

    logger.info(`[ModelManager] Stopping ${type} server`);

    proc.kill('SIGTERM');

    await new Promise<void>((resolve) => {
      proc.on('exit', () => resolve());
      setTimeout(() => {
        proc.kill('SIGKILL');
        resolve();
      }, 5000);
    });

    this.processes.delete(type);
    this.state.servers[type].status = 'stopped';
    this.state.servers[type].pid = undefined;
    this.emitStatus();
  }

  public async stopAllServers(): Promise<void> {
    await Promise.all([this.stopServer('main'), this.stopServer('reflection')]);
  }

  public async startAllServers(): Promise<void> {
    await Promise.all([
      this.startServer('main'),
      this.startServer('reflection'),
    ]);
  }

  public getServerUrl(type: ModelType): string {
    return `http://127.0.0.1:${this.state.servers[type].port}/v1`;
  }

  public isServerRunning(type: ModelType): boolean {
    return this.state.servers[type].status === 'running';
  }

  public async healthCheck(type: ModelType): Promise<boolean> {
    const config =
      type === 'main' ? MODEL_CONFIGS.main : MODEL_CONFIGS.reflection;

    try {
      const response = await fetch(`http://127.0.0.1:${config.port}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  public async cleanup(): Promise<void> {
    await this.stopAllServers();
    this.progressCallbacks.clear();
    this.statusCallbacks.clear();
  }
}
