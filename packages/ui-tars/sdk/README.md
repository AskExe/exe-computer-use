# @ui-tars/sdk

The GUIAgent engine for building Vision Language Model-driven GUI automation agents. This is the core SDK used by Exe Computer Use to orchestrate the screenshot-reason-act loop.

## Installation

```bash
pnpm add @ui-tars/sdk
```

## Overview

The SDK provides the `GUIAgent` class, which implements a closed-loop automation cycle:

1. Takes a screenshot via the provided operator.
2. Sends the screenshot to a VLM (Vision Language Model) for analysis.
3. Parses the model's predicted action.
4. Executes the action via the operator.
5. Repeats until the task is complete or an exit condition is met.

## Quick Example

```typescript
import { GUIAgent } from '@ui-tars/sdk';

const agent = new GUIAgent({
  model: {
    baseURL: 'http://localhost:11435/v1',
    apiKey: 'your-api-key',
    model: 'ui-tars',
  },
  operator: myOperator,
  onData: ({ data }) => {
    console.log('Status:', data.status);
  },
  onError: ({ error }) => {
    console.error('Agent error:', error.message);
  },
});

await agent.run('Open the calculator app and compute 42 * 17');
```

## API

### `GUIAgent` Constructor

```typescript
new GUIAgent<T extends Operator>(config: GUIAgentConfig<T>)
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `operator` | `Operator` | Yes | Platform operator implementing `screenshot()` and `execute()` |
| `model` | `UITarsModel` or config object | Yes | VLM model instance or configuration (`baseURL`, `apiKey`, `model`) |
| `onData` | `(params: { data: GUIAgentData }) => void` | No | Callback invoked on each loop iteration with current agent state |
| `onError` | `(params: { data: GUIAgentData; error: GUIAgentError }) => void` | No | Callback invoked on errors |
| `systemPrompt` | `string` | No | Custom system prompt (defaults to auto-generated from operator action spaces) |
| `signal` | `AbortSignal` | No | Abort signal for cancelling the agent run |
| `logger` | `Logger` | No | Custom logger (defaults to `console`) |
| `maxLoopCount` | `number` | No | Maximum iterations before stopping (default: `100`) |
| `retry` | `{ model?: RetryConfig; screenshot?: RetryConfig; execute?: RetryConfig }` | No | Retry configuration per phase |
| `uiTarsVersion` | `UITarsModelVersion` | No | UI-TARS model version for parser compatibility |

### `agent.run(instruction, historyMessages?, remoteModelHdrs?)`

Starts the agent loop with the given natural language instruction.

- `instruction` (string) -- The task to perform.
- `historyMessages` (Message[], optional) -- Previous conversation messages for context continuity.
- `remoteModelHdrs` (Record<string, string>, optional) -- Additional headers for remote model API calls.

### Agent Lifecycle States

| Status | Description |
|--------|-------------|
| `init` | Agent created, not yet running |
| `running` | Actively executing the loop |
| `pause` | Paused by user, can be resumed |
| `end` | Task completed successfully (model returned `finished`) |
| `call_user` | Model is requesting user input |
| `user_stopped` | User manually stopped the agent |
| `error` | Unrecoverable error occurred |

### `Operator` Abstract Class

Implement this to add support for a new platform:

```typescript
import { Operator } from '@ui-tars/sdk';

class MyOperator extends Operator {
  static MANUAL = {
    ACTION_SPACES: [
      'click(start_box="(x1, y1, x2, y2)")',
      'type(content="text")',
    ],
  };

  async screenshot() {
    // Return { base64: string, scaleFactor: number }
  }

  async execute(params) {
    // Execute the parsed action
  }
}
```

## Related Packages

| Package | Description |
|---------|-------------|
| `@ui-tars/action-parser` | Parses VLM text predictions into structured actions |
| `@ui-tars/shared` | Shared types, constants, and utilities |
| `@ui-tars/electron-ipc` | Type-safe Electron IPC definitions |

For the full system architecture, see [docs/architecture.md](../../../docs/architecture.md).
