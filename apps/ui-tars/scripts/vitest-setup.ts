import { vi } from 'vitest';

vi.mock('electron-log', () => ({
  default: {
    scope: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
    initialize: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    transports: {
      file: { level: 'info' },
      console: { level: 'info' },
    },
  },
}));

vi.mock('electron-store', () => ({
  default: class MockStore {
    private data: Record<string, unknown>;
    constructor(opts?: { defaults?: Record<string, unknown> }) {
      this.data = { ...(opts?.defaults ?? {}) };
    }
    get(key: string, def?: unknown) { return this.data[key] ?? def; }
    set(key: string, val: unknown) { this.data[key] = val; }
    delete(key: string) { delete this.data[key]; }
    clear() { this.data = {}; }
    static initRenderer = vi.fn();
  },
}));

vi.mock('electron-updater', () => ({
  autoUpdater: {
    on: vi.fn(),
    checkForUpdatesAndNotify: vi.fn(),
    setFeedURL: vi.fn(),
  },
}));

// Global electron mock — individual tests can override specific methods
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-app'),
    on: vi.fn(),
    off: vi.fn(),
    quit: vi.fn(),
    exit: vi.fn(),
    relaunch: vi.fn(),
    isAccessibilitySupportEnabled: vi.fn(() => false),
    setAccessibilitySupportEnabled: vi.fn(),
  },
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      id: 1,
      size: { width: 1920, height: 1080 },
      scaleFactor: 1,
    })),
    getAllDisplays: vi.fn(() => []),
  },
  desktopCapturer: {
    getSources: vi.fn(() => Promise.resolve([])),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
    getFocusedWindow: vi.fn(() => null),
  },
  shell: {
    openExternal: vi.fn(),
  },
  clipboard: {
    readText: vi.fn(() => ''),
    writeText: vi.fn(),
  },
}));

