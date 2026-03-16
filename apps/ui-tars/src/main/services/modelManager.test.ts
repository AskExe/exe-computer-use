import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/test-user-data'),
  },
}));

// Mock logger
vi.mock('@main/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock node:fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  statSync: vi.fn().mockReturnValue({ size: 0 }),
  createWriteStream: vi.fn(),
  unlinkSync: vi.fn(),
  renameSync: vi.fn(),
}));

// Mock node:stream/promises
vi.mock('node:stream/promises', () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
}));

// Mock node:child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
  execSync: vi.fn(),
}));

import { existsSync, statSync } from 'node:fs';
import { ModelManager } from './modelManager';
import { MODEL_CONFIGS } from '@main/types/model';

// Reset the singleton between tests
function resetSingleton(): void {
  // Access the private static field to reset it
  (ModelManager as any).instance = null;
}

describe('ModelManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSingleton();
    // Default: files don't exist
    (existsSync as any).mockReturnValue(false);
  });

  describe('Singleton pattern', () => {
    it('getInstance() returns the same instance', () => {
      const a = ModelManager.getInstance();
      const b = ModelManager.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('getServerUrl', () => {
    it('returns correct URL using state port for main', () => {
      const manager = ModelManager.getInstance();
      const url = manager.getServerUrl('main');
      expect(url).toBe(
        `http://127.0.0.1:${MODEL_CONFIGS.main.port}/v1`,
      );
    });

    it('returns correct URL using state port for reflection', () => {
      const manager = ModelManager.getInstance();
      const url = manager.getServerUrl('reflection');
      expect(url).toBe(
        `http://127.0.0.1:${MODEL_CONFIGS.reflection.port}/v1`,
      );
    });

    it('reflects updated port in state after startServer sets it', () => {
      const manager = ModelManager.getInstance();
      // Directly mutate state to simulate startServer setting a custom port
      const state = manager.getState();
      state.servers.main.port = 9999;
      expect(manager.getServerUrl('main')).toBe(
        'http://127.0.0.1:9999/v1',
      );
    });
  });

  describe('checkExistingFiles', () => {
    it('sets downloaded to true when files exist', async () => {
      (existsSync as any).mockReturnValue(true);
      (statSync as any).mockReturnValue({ size: MODEL_CONFIGS.main.size });

      const manager = ModelManager.getInstance();
      await manager.checkExistingFiles();
      const state = manager.getState();

      expect(state.binaryDownloaded).toBe(true);
      expect(state.models.main.downloaded).toBe(true);
      expect(state.models.reflection.downloaded).toBe(true);
      expect(state.models.mmproj.downloaded).toBe(true);
    });

    it('sets downloaded to false when files do not exist', async () => {
      (existsSync as any).mockReturnValue(false);

      const manager = ModelManager.getInstance();
      await manager.checkExistingFiles();
      const state = manager.getState();

      expect(state.binaryDownloaded).toBe(false);
      expect(state.models.main.downloaded).toBe(false);
      expect(state.models.reflection.downloaded).toBe(false);
      expect(state.models.mmproj.downloaded).toBe(false);
    });

    it('calculates download progress from file size', async () => {
      (existsSync as any).mockReturnValue(true);
      // Half-downloaded main model
      (statSync as any).mockReturnValue({
        size: MODEL_CONFIGS.main.size / 2,
      });

      const manager = ModelManager.getInstance();
      await manager.checkExistingFiles();
      const state = manager.getState();

      expect(state.models.main.downloadProgress).toBeCloseTo(50, 0);
    });
  });

  describe('startServer preconditions', () => {
    it('throws when binary not downloaded', async () => {
      const manager = ModelManager.getInstance();
      // binary not downloaded (default state)
      await expect(manager.startServer('main')).rejects.toThrow(
        'Binary not downloaded',
      );
    });

    it('throws when model not downloaded', async () => {
      const manager = ModelManager.getInstance();
      // Mark binary as downloaded but model not
      const state = manager.getState();
      state.binaryDownloaded = true;
      state.models.mmproj.downloaded = true;
      // main model still not downloaded

      await expect(manager.startServer('main')).rejects.toThrow(
        'main model not downloaded',
      );
    });
  });

  describe('isServerRunning', () => {
    it('returns false when server not started', () => {
      const manager = ModelManager.getInstance();
      expect(manager.isServerRunning('main')).toBe(false);
      expect(manager.isServerRunning('reflection')).toBe(false);
    });

    it('returns true when server status is running', () => {
      const manager = ModelManager.getInstance();
      const state = manager.getState();
      state.servers.main.status = 'running';
      expect(manager.isServerRunning('main')).toBe(true);
    });
  });

  describe('downloadBinary guard', () => {
    it('prevents concurrent downloads', async () => {
      const manager = ModelManager.getInstance();
      const state = manager.getState();
      state.binaryDownloading = true;

      // Should return immediately without throwing
      await manager.downloadBinary();

      // Still marked as downloading (no actual download happened)
      expect(state.binaryDownloading).toBe(true);
    });
  });

  describe('State initialization', () => {
    it('default state has correct structure', () => {
      const manager = ModelManager.getInstance();
      const state = manager.getState();

      // Top-level properties
      expect(state.binaryDownloaded).toBe(false);
      expect(state.binaryDownloading).toBe(false);
      expect(state.binaryProgress).toBe(0);

      // Models
      expect(state.models.main).toBeDefined();
      expect(state.models.main.type).toBe('main');
      expect(state.models.main.filename).toBe(MODEL_CONFIGS.main.filename);
      expect(state.models.main.downloaded).toBe(false);
      expect(state.models.main.downloadProgress).toBe(0);

      expect(state.models.reflection).toBeDefined();
      expect(state.models.reflection.type).toBe('reflection');
      expect(state.models.reflection.filename).toBe(
        MODEL_CONFIGS.reflection.filename,
      );

      expect(state.models.mmproj).toBeDefined();
      expect(state.models.mmproj.filename).toBe(MODEL_CONFIGS.mmproj.filename);

      // Servers
      expect(state.servers.main.status).toBe('stopped');
      expect(state.servers.main.port).toBe(MODEL_CONFIGS.main.port);
      expect(state.servers.reflection.status).toBe('stopped');
      expect(state.servers.reflection.port).toBe(MODEL_CONFIGS.reflection.port);
    });
  });

  describe('setWebContents', () => {
    it('forwards progress events to webContents', async () => {
      const manager = ModelManager.getInstance();
      const mockSend = vi.fn();
      const mockWebContents = { send: mockSend } as unknown as Electron.WebContents;
      manager.setWebContents(mockWebContents);

      // Trigger emitStatus via checkExistingFiles
      (existsSync as any).mockReturnValue(false);
      await manager.checkExistingFiles();

      expect(mockSend).toHaveBeenCalledWith('model:status', expect.any(Object));
    });
  });
});
