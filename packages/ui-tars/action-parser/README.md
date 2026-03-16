# @ui-tars/action-parser

Parses raw text predictions from Vision Language Models (UI-TARS) into structured, executable action objects.

## Installation

```bash
pnpm add @ui-tars/action-parser
```

## Overview

When a Vision Language Model analyzes a screenshot, it returns a text prediction describing the action to take. This package converts that raw text into a structured format that operators can execute.

### Input (VLM text prediction)

```
Thought: I need to click the search button in the top right
Action: click(start_box="(890, 45, 920, 65)")
```

### Output (parsed action)

```typescript
{
  action_type: 'click',
  action_inputs: {
    start_box: '(890, 45, 920, 65)',
    start_coords: [905, 55]
  },
  thought: 'I need to click the search button in the top right',
  reflection: null
}
```

## Usage

```typescript
import { actionParser } from '@ui-tars/action-parser';

const result = actionParser({
  prediction: 'Thought: Click the submit button\nAction: click(start_box="(500, 300, 550, 330)")',
  factor: [1920, 1080],  // Screen dimensions for coordinate scaling
  screenContext: { width: 1920, height: 1080 },
  scaleFactor: 2,         // Display scale factor (e.g., Retina = 2)
});

console.log(result.parsed);
// [{
//   action_type: 'click',
//   action_inputs: { start_box: '(500, 300, 550, 330)', start_coords: [525, 315] },
//   thought: 'Click the submit button',
//   reflection: null
// }]
```

## API

### `actionParser(params)`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prediction` | `string` | Yes | Raw text prediction from the VLM |
| `factor` | `number \| [number, number]` | Yes | Scale factor(s) for coordinate conversion. Single number or `[widthFactor, heightFactor]` |
| `screenContext` | `{ width: number; height: number }` | No | Screen dimensions for UI-TARS 1.5+ coordinate processing |
| `scaleFactor` | `number` | No | Display scale factor (DPR). Physical pixels = logical pixels * scaleFactor |
| `mode` | `'bc' \| 'o1'` | No | Parsing mode |
| `modelVer` | `UITarsModelVersion` | No | Model version for version-specific parsing behavior |

### Return Value

```typescript
{ parsed: PredictionParsed[] }
```

Each `PredictionParsed` object contains:

| Field | Type | Description |
|-------|------|-------------|
| `action_type` | `string` | The action to perform (see supported types below) |
| `action_inputs` | `ActionInputs` | Parsed parameters for the action |
| `thought` | `string` | The model's reasoning about why this action was chosen |
| `reflection` | `string \| null` | The model's self-reflection on the action (if present) |

## Supported Action Types

| Action Type | Description | Key Inputs |
|-------------|-------------|------------|
| `click` | Click at a screen position | `start_box`, `start_coords` |
| `type` | Type text content | `content` |
| `scroll` | Scroll in a direction | `start_box`, `direction` |
| `drag` | Drag from one position to another | `start_box`, `end_box` |
| `hotkey` | Press a keyboard shortcut | `hotkey` (e.g., `"ctrl+c"`) |
| `wait` | Wait before next action | -- |
| `finished` | Task is complete | -- |
| `call_user` | Request user input | `content` (question for user) |

## Related Packages

| Package | Description |
|---------|-------------|
| `@ui-tars/sdk` | GUIAgent engine that uses this parser in the agent loop |
| `@ui-tars/shared` | Shared types including `PredictionParsed` and `ActionInputs` |

For the full system architecture, see [docs/architecture.md](../../../docs/architecture.md).
