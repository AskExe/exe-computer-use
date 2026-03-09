/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

export const COMPUTER_OPERATOR = 'Computer Operator';
export const BROWSER_OPERATOR = 'Browser Operator';

export const LOCAL_PROVIDER_DEFAULTS = {
  ollama: { baseUrl: 'http://localhost:11434/v1', apiKey: 'ollama' },
  lmstudio: { baseUrl: 'http://localhost:1234/v1', apiKey: 'lm-studio' },
  vllm: { baseUrl: 'http://localhost:8000/v1', apiKey: 'token-abc123' },
  custom: { baseUrl: '', apiKey: '' },
};
