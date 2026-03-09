/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { initIpc } from '@ui-tars/electron-ipc/main';
import { getScreenSize, getAllDisplays } from '@main/utils/screen';

const t = initIpc.create();

export const screenRoute = t.router({
  getScreenSize: t.procedure.input<void>().handle(async () => {
    const targetDisplay = getScreenSize();

    return {
      screenWidth: targetDisplay.physicalSize.width,
      screenHeight: targetDisplay.physicalSize.height,
      scaleFactor: targetDisplay.scaleFactor,
      displayId: targetDisplay.id,
      displayLabel: targetDisplay.label,
    };
  }),

  getAllDisplays: t.procedure.input<void>().handle(async () => {
    return getAllDisplays();
  }),
});
