/**
 * Dedicated image cache for screenshot data delivered via IPC 'screenshots' channel.
 *
 * Images are stripped from the Zustand state broadcast (to avoid serializing
 * multi-MB base64 strings on every tick) and instead sent once through a
 * separate channel. This module caches them so that the renderer can merge
 * them back into messages for display and IndexedDB persistence.
 */
import { useCallback, useSyncExternalStore } from 'react';

type ImageEntry = { screenshot?: string; marked?: string };
type ImageCache = Map<number, ImageEntry>;

// ---------------------------------------------------------------------------
// Singleton image cache shared across all components
// ---------------------------------------------------------------------------
let imageCache: ImageCache = new Map();
let version = 0;
const listeners = new Set<() => void>();

function notifyListeners() {
  version++;
  listeners.forEach((l) => l());
}

// Subscribe to the screenshot bridge exposed by preload
if (
  typeof window !== 'undefined' &&
  (window as any).screenshotBridge
) {
  (window as any).screenshotBridge.subscribe(
    (images: Record<number, ImageEntry>) => {
      for (const [idx, entry] of Object.entries(images)) {
        imageCache.set(Number(idx), entry);
      }
      notifyListeners();
    },
  );
}

/** Clear the entire image cache (call on agent run reset / session switch). */
export function clearImageCache() {
  imageCache = new Map();
  notifyListeners();
}

/** Get cached image data for a specific message index. */
export function getImageForMessage(index: number): ImageEntry | undefined {
  return imageCache.get(index);
}

/** Get the full image cache map. */
export function getAllImages(): ImageCache {
  return imageCache;
}

/**
 * React hook that re-renders the component whenever new images arrive.
 * Returns helpers to read from the cache.
 */
export function useScreenshots() {
  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => {
      listeners.delete(onStoreChange);
    };
  }, []);

  const getSnapshot = useCallback(() => version, []);

  useSyncExternalStore(subscribe, getSnapshot);

  return { getImage: getImageForMessage, images: imageCache };
}
