import { initIpc } from '@ui-tars/electron-ipc/main';
import { ModelManager } from '@main/services/modelManager';
import { ModelType } from '@main/types/model';
import { logger } from '@main/logger';

const t = initIpc.create();

export const modelRoute = t.router({
  getStatus: t.procedure.handle(async () => {
    const manager = ModelManager.getInstance();
    await manager.checkExistingFiles();
    return manager.getState();
  }),

  downloadBinary: t.procedure.handle(async () => {
    const manager = ModelManager.getInstance();
    try {
      await manager.downloadBinary();
      return { success: true };
    } catch (error) {
      logger.error('[modelRoute] downloadBinary error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }),

  downloadModel: t.procedure
    .input<{ type: ModelType }>()
    .handle(async ({ input }) => {
      const manager = ModelManager.getInstance();
      try {
        await manager.downloadModel(input.type);
        return { success: true };
      } catch (error) {
        logger.error('[modelRoute] downloadModel error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }),

  downloadMmproj: t.procedure.handle(async () => {
    const manager = ModelManager.getInstance();
    try {
      await manager.downloadMmproj();
      return { success: true };
    } catch (error) {
      logger.error('[modelRoute] downloadMmproj error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }),

  downloadAll: t.procedure.handle(async () => {
    const manager = ModelManager.getInstance();
    try {
      await manager.downloadAll();
      return { success: true };
    } catch (error) {
      logger.error('[modelRoute] downloadAll error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }),

  startServer: t.procedure
    .input<{ type: ModelType }>()
    .handle(async ({ input }) => {
      const manager = ModelManager.getInstance();
      try {
        await manager.startServer(input.type);
        return { success: true };
      } catch (error) {
        logger.error('[modelRoute] startServer error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }),

  stopServer: t.procedure
    .input<{ type: ModelType }>()
    .handle(async ({ input }) => {
      const manager = ModelManager.getInstance();
      try {
        await manager.stopServer(input.type);
        return { success: true };
      } catch (error) {
        logger.error('[modelRoute] stopServer error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }),

  startAllServers: t.procedure.handle(async () => {
    const manager = ModelManager.getInstance();
    try {
      await manager.startAllServers();
      return { success: true };
    } catch (error) {
      logger.error('[modelRoute] startAllServers error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }),

  stopAllServers: t.procedure.handle(async () => {
    const manager = ModelManager.getInstance();
    try {
      await manager.stopAllServers();
      return { success: true };
    } catch (error) {
      logger.error('[modelRoute] stopAllServers error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }),

  healthCheck: t.procedure
    .input<{ type: ModelType }>()
    .handle(async ({ input }) => {
      const manager = ModelManager.getInstance();
      return manager.healthCheck(input.type);
    }),

  getServerUrl: t.procedure
    .input<{ type: ModelType }>()
    .handle(async ({ input }) => {
      const manager = ModelManager.getInstance();
      return manager.getServerUrl(input.type);
    }),
});
