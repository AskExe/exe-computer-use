# Virtual Cursor - Targeted Input Implementation

## Goal

Replace global `CGEventPost` with targeted `CGEventPostToPid` so the bot can click/type inside target apps without moving the real cursor or conflicting with manual input.

## Current Problem

```
CGEventPost(kCGSessionEventTap, event)  ← global, moves your real cursor
```

## Solution

```
CGEventPostToPid(targetAppPid, event)  ← goes straight to the target app, cursor stays put
```

## How It Works (Auto-Resolve)

```
1. Screenshot captured
2. VLM decides: "click at (450, 320)"
3. Code looks up which window contains point (450, 320):
   → CGWindowListCopyWindowInfo → finds "Chrome - LinkedIn" window
   → Gets PID: 12345
4. CGEventPostToPid(12345, click_event)
5. Chrome receives click, cursor never moves
```

**Zero user interaction needed** - fully automatic.

## Architecture

```
NutJSOperator.execute()
    │
    ▼
action: click at (450, 320)
    │
    ▼
TargetedInputService.resolveWindow(x, y)
    └── CGWindowListCopyWindowInfo → window at (450, 320)
        └── Returns: { pid: 12345, bounds: {...}, name, bundleId }
    │
    ▼
TargetedInputService.postMouseEvent(pid, x, y)
    └── CGEventPostToPid(12345, event)
    │
    ▼
Target app receives click (cursor stays put)
```

## Review Issues (Fixed)

Before starting, I need to flag the 3 issues from the review:

| # | Issue | Severity | Fix during execution |
|---|-------|----------|---------------------|
| 1 | Shell injection in postTextInput — text passed via shell string, should use stdin | Critical | Yes — pass via stdin |
| 2 | Coordinate flip in findWindowAtPoint is wrong — CGWindowList already uses top-left origin, just use frame.contains(point) | Critical | Yes — remove flip logic |
| 3 | asarUnpack path uses @computer-use/nut-js but workspace package is @ui-tars/operator-nut-js | Moderate | Yes — fix to correct path |

## Files to Create/Modify

### 1. New: `packages/ui-tars/operators/nut-js/native/TargetedInput.swift`

Swift binary that handles:
- `find-window <x> <y>` - Find window at coordinates
- `click <pid> <x> <y> <button>` - Send mouse click
- `type <pid> <text>` - Send text input

### 2. New: `packages/ui-tars/operators/nut-js/src/targetedInput.ts`

TypeScript wrapper that:
- Calls Swift binary via `child_process.execSync`
- Handles platform check (darwin only)
- Provides typed API

### 3. Modify: `packages/ui-tars/operators/nut-js/src/index.ts`

Add targeted input path in `execute()` with fallback.

### 4. Modify: `apps/ui-tars/electron-builder.yml`

Add Swift binary to `asarUnpack`:

```yaml
asarUnpack:
  - resources/**
  - "node_modules/node-llama-cpp/**"
  - "node_modules/@node-llama-cpp/**"
  - "node_modules/@ui-tars/operator-nut-js/native/**"  # NEW
```

## Implementation Details

### Swift Binary: TargetedInput.swift

```swift
import Foundation
import CoreGraphics
import AppKit

// Custom Bounds struct instead of CGRect (CGRect Codable is unreliable pre-Swift 5.9)
struct Bounds: Codable {
    let x: CGFloat
    let y: CGFloat
    let width: CGFloat
    let height: CGFloat
    
    init(from rect: CGRect) {
        self.x = rect.origin.x
        self.y = rect.origin.y
        self.width = rect.size.width
        self.height = rect.size.height
    }
}

struct WindowInfo: Codable {
    let pid: Int32
    let name: String
    let bounds: Bounds
    let bundleId: String?
}

enum Command {
    case findWindow(x: Int, y: Int)
    case click(pid: Int32, x: Int, y: Int, button: String)
    case type(pid: Int32, text: String)
}

func parseArgs() -> Command? {
    let args = CommandLine.arguments
    guard args.count >= 2 else { return nil }
    
    switch args[1] {
    case "find-window":
        guard args.count == 4,
              let x = Int(args[2]),
              let y = Int(args[3]) else { return nil }
        return .findWindow(x: x, y: y)
        
    case "click":
        guard args.count == 6,
              let pid = Int32(args[2]),
              let x = Int(args[3]),
              let y = Int(args[4]) else { return nil }
        return .click(pid: pid, x: x, y: y, button: args[5])
        
    case "type":
        // Read text from stdin to avoid shell injection
        guard args.count == 3,
              let pid = Int32(args[2]) else { return nil }
        let text = readLine() ?? ""
        return .type(pid: pid, text: text)
        
    default:
        return nil
    }
}

// CGWindowListCopyWindowInfo returns windows front-to-back
// First match = topmost window (correct for click target)
// Note: CGWindowListCopyWindowInfo uses Quartz coordinates (top-left origin, y down)
// This matches NutJS click coordinates - no coordinate flip needed
func findWindowAtPoint(x: Int, y: Int) -> WindowInfo? {
    let point = CGPoint(x: CGFloat(x), y: CGFloat(y))
    
    guard let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] else {
        return nil
    }
    
    for window in windows {
        guard let boundsDict = window[kCGWindowBounds as String] as? [String: CGFloat],
              let frame = CGRect(dictionaryRepresentation: boundsDict as CFDictionary) else {
            continue
        }
        
        // CGWindowList uses top-left origin (same as NutJS), no flip needed
        if frame.contains(point) {
            let pid = window[kCGWindowOwnerPID as String] as? Int32 ?? 0
            let name = window[kCGWindowOwnerName as String] as? String ?? ""
            
            // Get bundle ID from PID
            var bundleId: String? = nil
            if let app = NSRunningApplication(processIdentifier: pid) {
                bundleId = app.bundleIdentifier
            }
            
            return WindowInfo(pid: pid, name: name, bounds: Bounds(from: frame), bundleId: bundleId)
        }
    }
    
    return nil
}

func postMouseClick(pid: pid_t, x: Int, y: Int, button: String) {
    let isLeft = button == "left"
    let downType: CGEventType = isLeft ? .leftMouseDown : .rightMouseDown
    let upType: CGEventType = isLeft ? .leftMouseUp : .rightMouseUp
    let mouseButton: CGMouseButton = isLeft ? .left : .right
    
    let point = CGPoint(x: CGFloat(x), y: CGFloat(y))
    
    // Mouse down
    if let downEvent = CGEvent(mouseEventSource: nil,
                                mouseType: downType,
                                mouseCursorPosition: point,
                                mouseButton: mouseButton) {
        downEvent.postToPid(pid)
    }
    
    // Mouse up
    if let upEvent = CGEvent(mouseEventSource: nil,
                              mouseType: upType,
                              mouseCursorPosition: point,
                              mouseButton: mouseButton) {
        upEvent.postToPid(pid)
    }
}

// Text input via CGEvent requires Unicode key events
func postTextInput(pid: pid_t, text: String) {
    let source = CGEventSource(stateID: .hidSystemState)
    
    for scalar in text.unicodeScalars {
        guard let event = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true) else {
            continue
        }
        
        var unicode = Array(String(scalar).utf16)
        event.keyboardSetUnicodeString(stringLength: unicode.count, unicodeString: &unicode)
        event.postToPid(pid)
        
        // Key up
        if let upEvent = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false) {
            upEvent.postToPid(pid)
        }
    }
}

// Main entry point
func main() {
    guard let command = parseArgs() else {
        fputs("Usage: TargetedInput <find-window|click|type> ...\n", stderr)
        exit(1)
    }
    
    switch command {
    case .findWindow(let x, let y):
        if let info = findWindowAtPoint(x: x, y: y) {
            let encoder = JSONEncoder()
            if let data = try? encoder.encode(info),
               let json = String(data: data, encoding: .utf8) {
                print(json)
            }
        }
        
    case .click(let pid, let x, let y, let button):
        postMouseClick(pid: pid, x: x, y: y, button: button)
        
    case .type(let pid, let text):
        postTextInput(pid: pid, text: text)
    }
}

main()
```

### Build Script

Add to `packages/ui-tars/operators/nut-js/package.json`:

```json
{
  "scripts": {
    "build:native": "swiftc -o native/TargetedInput native/TargetedInput.swift"
  }
}
```

Run: `pnpm build:native`

### TypeScript Wrapper

```typescript
// packages/ui-tars/operators/nut-js/src/targetedInput.ts
import { execSync } from 'child_process';
import { join } from 'path';

const isMac = process.platform === 'darwin';

// Resolve binary path - works in both dev and packaged app
function getBinaryPath(): string {
  // In development: ./native/TargetedInput
  // In package: ../../node_modules/@ui-tars/operator-nut-js/native/TargetedInput
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
    // Pass text via stdin to avoid shell injection
    execSync(`"${binPath}" type ${pid}`, { 
      input: text,
      timeout: 5000 
    });
  } catch (e) {
    console.error('[TargetedInput] type error:', e);
  }
}
```

### Integration in NutJSOperator

```typescript
// packages/ui-tars/operators/nut-js/src/index.ts

import { 
  findWindowAtPoint, 
  postMouseClick, 
  postTextInput 
} from './targetedInput';

// In execute():
case 'click':
case 'left_click':
case 'left_single': {
  const windowInfo = findWindowAtPoint(startX, startY);
  if (windowInfo) {
    // Targeted input - cursor stays put
    postMouseClick(windowInfo.pid, startX, startY, 'left');
  } else {
    // Fallback to global nut-js
    await moveStraightTo(startX, startY);
    await mouse.click(Button.LEFT);
  }
  break;
}

case 'type': {
  const content = action_inputs.content?.trim();
  if (content) {
    // Try targeted input first
    const windowInfo = findWindowAtPoint(startX ?? 0, startY ?? 0);
    if (windowInfo) {
      postTextInput(windowInfo.pid, content);
    } else {
      // Fallback to nut-js keyboard
      await keyboard.type(stripContent);
    }
  }
  break;
}
```

## Edge Cases

| Case | Solution |
|------|----------|
| No window at point | Fallback to global input (nut-js) |
| Window moved during action | Re-resolve window before each click |
| Multiple displays | CGWindowList includes all displays |
| Fullscreen app | Works - window still in list |
| App sandboxed | May need accessibility permission |
| Swift binary not found | Fallback to nut-js global input |
| Non-ASCII text input | Unicode key events handle all characters |

## Permission Requirements

Same as current:
- **Accessibility permission** required (for CGEventPostToPid)
- No additional permissions needed

## Packaging (Critical)

Update `electron-builder.yml`:

```yaml
asarUnpack:
  - resources/**
  - "node_modules/node-llama-cpp/**"
  - "node_modules/@node-llama-cpp/**"
  - "node_modules/@ui-tars/operator-nut-js/native/**"
```

The native binary must be in `asarUnpack` because:
- ASAR archives are read-only
- Native binaries must be extracted to filesystem to execute

## Test Scenarios

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Click Chrome while using other app | Chrome receives click, cursor stays |
| 2 | Click on empty space | Falls back to global input, cursor moves |
| 3 | Type in text field | Text appears in target app, no cursor movement |
| 4 | Run on Linux | Uses global nut-js (platform gate) |
| 5 | Window moves between screenshot and click | Re-resolves window, clicks correct location |
| 6 | Multiple displays | Finds window on correct display |

**Manual test:**
```bash
# 1. Open Chrome, position window
# 2. Run Exe Computer Use, give task: "Click the Chrome menu"
# 3. Verify cursor stays still, Chrome receives click
# 4. Check activity - should show TargetedInput running
```

## Effort Estimate

| Step | Task | Hours |
|------|------|-------|
| 1 | Write Swift binary (find-window, click, type) | 2 |
| 2 | Add build script, compile binary | 0.5 |
| 3 | Create TypeScript wrapper with platform gate | 1 |
| 4 | Integrate into NutJSOperator.execute() | 1 |
| 5 | Add fallback to global input | 0.5 |
| 6 | Update electron-builder.yml asarUnpack | 0.5 |
| 7 | Manual testing (all 6 scenarios) | 2 |

**Total: ~7.5 hours**

## References

- [CGEventPostToPid - Apple Docs](https://developer.apple.com/documentation/coregraphics/cgevent/posttopid(_:)?language=objc)
- [CGWindowListCopyWindowInfo - Apple Docs](https://developer.apple.com/documentation/coregraphics/cgwindowlistcopywindowinfo)
- [CGEvent keyboardSetUnicodeString - Apple Docs](https://developer.apple.com/documentation/coregraphics/cgevent/1456558-keyboardsetunicodestring)
- [nut.js](https://nutjs.com/) - Current input library
