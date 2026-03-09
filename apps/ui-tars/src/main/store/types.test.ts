/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { VLMProviderV2 } from './types';

describe('VLMProviderV2', () => {
  it('should have correct values for each provider', () => {
    const cases = [
      [VLMProviderV2.ollama, 'Ollama'],
      [VLMProviderV2.lmstudio, 'LM Studio'],
      [VLMProviderV2.vllm, 'vLLM'],
      [VLMProviderV2.custom, 'Custom (OpenAI-compatible)'],
    ];

    cases.forEach(([provider, expected]) => {
      expect(provider).toBe(expected);
    });
  });

  it('should contain exactly four providers', () => {
    const providerCount = Object.keys(VLMProviderV2).length;
    expect(providerCount).toBe(4);
  });
});
