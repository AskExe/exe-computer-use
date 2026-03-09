/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { screen, Display } from 'electron';

import * as env from '@main/env';
import { SettingStore } from '@main/store/setting';

export interface ScreenInfo {
  id: number;
  physicalSize: { width: number; height: number };
  logicalSize: { width: number; height: number };
  scaleFactor: number;
  isPrimary: boolean;
  label: string;
}

const getDisplayById = (id: number): Display | null => {
  const displays = screen.getAllDisplays();
  return displays.find((d) => d.id === id) || null;
};

const getTargetDisplay = (): Display => {
  const targetId = SettingStore.get('targetDisplayId');
  if (targetId) {
    const display = getDisplayById(targetId);
    if (display) return display;
  }
  return screen.getPrimaryDisplay();
};

export const getScreenSize = (): ScreenInfo => {
  const targetDisplay = getTargetDisplay();

  const logicalSize = targetDisplay.size;
  const scaleFactor = env.isMacOS ? 1 : targetDisplay.scaleFactor;

  const physicalSize = {
    width: Math.round(logicalSize.width * scaleFactor),
    height: Math.round(logicalSize.height * scaleFactor),
  };

  return {
    id: targetDisplay.id,
    physicalSize,
    logicalSize,
    scaleFactor,
    isPrimary: targetDisplay.id === screen.getPrimaryDisplay().id,
    label: targetDisplay.label,
  };
};

export const getAllDisplays = (): ScreenInfo[] => {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();

  return displays.map((d) => {
    const logicalSize = d.size;
    const scaleFactor = env.isMacOS ? 1 : d.scaleFactor;

    return {
      id: d.id,
      physicalSize: {
        width: Math.round(logicalSize.width * scaleFactor),
        height: Math.round(logicalSize.height * scaleFactor),
      },
      logicalSize,
      scaleFactor,
      isPrimary: d.id === primary.id,
      label: d.label || (d.id === primary.id ? 'Primary Display' : `Display ${d.id}`),
    };
  });
};
