import { ipcMain } from 'electron';
import { ModelManager } from '../services/modelManager';

export function registerModelRoutes() {
  const mm = ModelManager.getInstance();

  ipcMain.handle('model:status', () => mm.getStatus());
  ipcMain.handle(
    'model:download',
    (_, type: 'action' | 'reflection') => mm.downloadModel(type),
  );
  ipcMain.handle('model:startServers', () => mm.startServers());
}
