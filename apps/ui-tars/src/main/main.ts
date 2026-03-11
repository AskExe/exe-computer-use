/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { electronApp, optimizer } from '@electron-toolkit/utils';
import {
  app,
  BrowserView,
  BrowserWindow,
  crashReporter,
  desktopCapturer,
  ipcMain,
  session,
  WebContentsView,
} from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import ElectronStore from 'electron-store';

import * as env from '@main/env';
import { logger } from '@main/logger';
import { createMainWindow } from '@main/window/index';
import { registerIpcMain } from '@ui-tars/electron-ipc/main';
import { ipcRoutes } from './ipcRoutes';
import { getTargetDisplay } from './utils/screen';

import { UTIOService } from './services/utio';
import { store } from './store/create';
import { SettingStore } from './store/setting';
import { LocalStore } from './store/validate';
import { createTray } from './tray';
import { registerSettingsHandlers } from './services/settings';
import { sanitizeState } from './utils/sanitizeState';
import { windowManager } from './services/windowManager';
import { checkBrowserAvailability } from './services/browserCheck';
import { ModelManager } from './services/modelManager';

const { isProd } = env;

// 在应用初始化之前启用辅助功能支持
app.commandLine.appendSwitch('force-renderer-accessibility');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (squirrelStartup) {
  app.quit();
}

// Start crash reporter — writes minidumps to app.getPath('crashDumps')
crashReporter.start({ uploadToServer: false });

logger.debug('[env]', env);

ElectronStore.initRenderer();

if (isProd) {
  import('source-map-support').then(({ default: sourceMapSupport }) => {
    sourceMapSupport.install();
  });
}

const loadDevDebugTools = async () => {
  import('electron-debug').then(({ default: electronDebug }) => {
    electronDebug({ showDevTools: false });
  });

  import('electron-devtools-installer')
    .then(({ default: installExtensionDefault, REACT_DEVELOPER_TOOLS }) => {
      // @ts-ignore
      const installExtension = installExtensionDefault?.default;
      const extensions = [installExtension(REACT_DEVELOPER_TOOLS)];

      return Promise.all(extensions)
        .then((names) => logger.info('Added Extensions:', names.join(', ')))
        .catch((err) =>
          logger.error('An error occurred adding extension:', err),
        );
    })
    .catch(logger.error);
};

const initializeApp = async () => {
  const isAccessibilityEnabled = app.isAccessibilitySupportEnabled();
  logger.info('isAccessibilityEnabled', isAccessibilityEnabled);
  if (env.isMacOS) {
    app.setAccessibilitySupportEnabled(true);
    const { ensurePermissions } = await import('@main/utils/systemPermissions');

    const ensureScreenCapturePermission = ensurePermissions();
    logger.info('ensureScreenCapturePermission', ensureScreenCapturePermission);
  }

  await checkBrowserAvailability();

  // if (env.isDev) {
  await loadDevDebugTools();
  // }

  logger.info('createTray');
  // Tray
  await createTray();

  // Send app launched event
  await UTIOService.getInstance().appLaunched();

  logger.info('createMainWindow');
  let mainWindow = createMainWindow();

  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
        const targetDisplay = getTargetDisplay();
        const targetSource = sources.find(
          (source) => source.display_id === targetDisplay.id.toString(),
        );

        callback({ video: targetSource!, audio: 'loopback' });
      });
    },
    { useSystemPicker: false },
  );

  logger.info('mainZustandBridge');

  const { unsubscribe } = registerIPCHandlers([mainWindow]);

  app.on('window-all-closed', () => {
    logger.info('window-all-closed');
    if (!env.isMacOS) {
      app.quit();
    }
  });

  app.on('before-quit', async () => {
    logger.info('before-quit');
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((window) => window.destroy());
    await ModelManager.getInstance().cleanup();
  });

  app.on('quit', () => {
    logger.info('app quit');
    unsubscribe();
  });

  app.on('activate', () => {
    logger.info('app activate');
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow();
    } else {
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
    }
  });

  logger.info('initializeApp end');

  // Check and update remote presets
  const settings = SettingStore.getStore();
  if (
    settings.presetSource?.type === 'remote' &&
    settings.presetSource.autoUpdate
  ) {
    try {
      await SettingStore.importPresetFromUrl(settings.presetSource.url!, true);
    } catch (error) {
      logger.error('Failed to update preset:', error);
    }
  }

  // Initialize local model manager if enabled
  await initializeLocalModels(settings);
};

const initializeLocalModels = async (settings: LocalStore) => {
  if (!settings.localModelEnabled) {
    logger.info('[LocalModels] Local models disabled');
    return;
  }

  logger.info('[LocalModels] Initializing local model manager...');
  const modelManager = ModelManager.getInstance();

  try {
    await modelManager.checkExistingFiles();
    const state = modelManager.getState();

    logger.info('[LocalModels] State:', {
      binaryDownloaded: state.binaryDownloaded,
      mainModel: state.models.main.downloaded,
      reflectionModel: state.models.reflection.downloaded,
      mmprojDownloaded: state.models.mmproj.downloaded,
    });

    if (!state.binaryDownloaded) {
      logger.warn(
        '[LocalModels] Binary not downloaded. User needs to download first.',
      );
      return;
    }

    if (!state.models.mmproj.downloaded) {
      logger.warn(
        '[LocalModels] mmproj not downloaded. User needs to download first.',
      );
      return;
    }

    const mainDownloaded = state.models.main.downloaded;
    const reflectionDownloaded = state.models.reflection.downloaded;

    if (mainDownloaded && reflectionDownloaded) {
      logger.info('[LocalModels] Both models already downloaded');
    } else {
      logger.info(
        '[LocalModels] Models status - main:',
        mainDownloaded,
        ', reflection:',
        reflectionDownloaded,
      );
    }

    if (settings.localModelAutoStart) {
      logger.info('[LocalModels] Auto-start enabled, starting servers...');

      try {
        if (mainDownloaded) {
          await modelManager.startServer('main');
          logger.info(
            '[LocalModels] Main server started on port',
            settings.localModelMainPort || 11435,
          );
        }

        if (reflectionDownloaded) {
          await modelManager.startServer('reflection');
          logger.info(
            '[LocalModels] Reflection server started on port',
            settings.localModelReflectionPort || 11436,
          );
        }
      } catch (error) {
        logger.error('[LocalModels] Failed to start servers:', error);
      }
    } else {
      logger.info(
        '[LocalModels] Auto-start disabled, servers not started automatically',
      );
    }
  } catch (error) {
    logger.error('[LocalModels] Failed to initialize local models:', error);
  }
};

/**
 * Register IPC handlers
 */
const registerIPCHandlers = (
  wrappers: (BrowserWindow | WebContentsView | BrowserView)[],
) => {
  ipcMain.handle('getState', () => {
    const state = store.getState();
    return sanitizeState(state);
  });

  // 初始化时注册已有窗口
  wrappers.forEach((wrapper) => {
    if (wrapper instanceof BrowserWindow) {
      windowManager.registerWindow(wrapper);
    }
  });

  // only send state to the wrappers that are not destroyed
  ipcMain.on('subscribe', (state: unknown) => {
    const sanitizedState = sanitizeState(state as Record<string, unknown>);
    windowManager.broadcast('subscribe', sanitizedState);
  });

  const unsubscribe = store.subscribe((state: unknown) =>
    ipcMain.emit('subscribe', state),
  );

  // TODO: move to ipc routes
  ipcMain.handle('utio:shareReport', async (_, params) => {
    await UTIOService.getInstance().shareReport(params);
  });

  registerSettingsHandlers();
  // register ipc services routes
  registerIpcMain(ipcRoutes);

  return { unsubscribe };
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(async () => {
    electronApp.setAppUserModelId('com.electron');

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    await initializeApp();

    logger.info('app.whenReady end');
  })

  .catch(console.log);
