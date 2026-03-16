/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

export function sanitizeState(state: Record<string, unknown>) {
  const safeState: Record<string, unknown> = {};

  for (const statePropName in state) {
    const stateProp = state[statePropName];
    if (typeof stateProp === 'function') {
      continue;
    }
    if (statePropName === 'messages' && Array.isArray(stateProp)) {
      safeState[statePropName] = stateProp.map(
        (msg: Record<string, unknown>) => {
          const result = { ...msg };
          // Replace heavy base64 with lightweight reference flags
          if (result.screenshotBase64) {
            result._hasScreenshot = true;
            delete result.screenshotBase64;
          }
          if (result.screenshotBase64WithElementMarker) {
            result._hasMarkedScreenshot = true;
            delete result.screenshotBase64WithElementMarker;
          }
          return result;
        },
      );
    } else {
      safeState[statePropName] = stateProp;
    }
  }

  return safeState;
}
