import { execSync } from 'child_process';
import { join } from 'path';

const isMac = process.platform === 'darwin';

function getBinaryPath(): string {
  const devPath = join(__dirname, '../../native/TargetedInput');
  try {
    require('fs').accessSync(devPath);
    return devPath;
  } catch {
    return join(__dirname, '../../../native/TargetedInput');
  }
}

export interface WindowInfo {
  pid: number;
  name: string;
  bounds: { x: number; y: number; width: number; height: number };
  bundleId: string | null;
}

export function findWindowAtPoint(x: number, y: number): WindowInfo | null {
  if (!isMac) return null;
  
  try {
    const binPath = getBinaryPath();
    const result = execSync(`"${binPath}" find-window ${x} ${y}`, { 
      encoding: 'utf8',
      timeout: 1000 
    });
    return result.trim() ? JSON.parse(result) : null;
  } catch (e) {
    console.error('[TargetedInput] find-window error:', e);
    return null;
  }
}

export function postMouseClick(pid: number, x: number, y: number, button: string = 'left'): void {
  if (!isMac) return;
  
  try {
    const binPath = getBinaryPath();
    execSync(`"${binPath}" click ${pid} ${x} ${y} ${button}`, { 
      timeout: 1000 
    });
  } catch (e) {
    console.error('[TargetedInput] click error:', e);
  }
}

export function postTextInput(pid: number, text: string): void {
  if (!isMac) return;
  
  try {
    const binPath = getBinaryPath();
    // Pass text via stdin to avoid shell injection (FIX #1)
    execSync(`"${binPath}" type ${pid}`, { 
      input: text,
      timeout: 5000 
    });
  } catch (e) {
    console.error('[TargetedInput] type error:', e);
  }
}
