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

## Files to Create/Modify

### 1. New: `packages/ui-tars/operators/nut-js/src/targetedInput.ts`

Native Swift helper for targeted input.

**Functions:**
- `findWindowAtPoint(x, y)` → `{ pid, bounds, name, bundleId }`
- `postMouseClick(pid, x, y, button)` 
- `postKeyPress(pid, keyCode, flags)`
- `postTextInput(pid, text)`

### 2. Modify: `packages/ui-tars/operators/nut-js/src/index.ts`

Changes in `execute()`:

```typescript
case 'click':
case 'left_click': {
  // Auto-resolve target window
  const windowInfo = await targetedInput.findWindowAtPoint(startX, startY);
  if (windowInfo) {
    // Use targeted input - cursor stays put
    await targetedInput.postMouseClick(windowInfo.pid, startX, startY, 'left');
  } else {
    // Fallback to normal nut-js (global input)
    await mouse.click(Button.LEFT);
  }
}
```

### 3. Optional: Settings toggle

- Add `useTargetedInput: boolean` (default: true)
- Allow users to disable if needed

## Implementation Details

### Finding window at point (Swift)

```swift
func findWindowAtPoint(x: Int, y: Int) -> WindowInfo? {
    let point = CGPoint(x: x, y: y)
    let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]]
    
    for window in windows ?? [] {
        if let boundsDict = window[kCGWindowBounds as String] as? [String: CGFloat],
           let frame = CGRect(dictionaryRepresentation: boundsDict as CFDictionary) {
            if frame.contains(point) {
                let pid = window[kCGWindowOwnerPID as String] as! pid_t
                let name = window[kCGWindowOwnerName as String] as? String
                return WindowInfo(pid: pid, name: name ?? "", bounds: frame)
            }
        }
    }
    return nil
}
```

### Sending click to PID (Swift)

```swift
func postMouseClick(pid: pid_t, x: Int, y: Int, button: String) {
    let eventType: CGEventType = button == "left" ? kCGEventLeftMouseDown : kCGEventRightMouseDown
    let mouseButton: CGMouseButton = button == "left" ? .left : .right
    
    let event = CGEvent(mouseEventSource: nil,
                        mouseType: eventType,
                        mouseCursorPosition: CGPoint(x: x, y: y),
                        mouseButton: mouseButton)
    
    // Post directly to target app - no global event tap
    event?.postToPid(pid)
    
    // Also send mouse up
    let eventUpType: CGEventType = button == "left" ? kCGEventLeftMouseUp : kCGEventRightMouseUp
    let eventUp = CGEvent(mouseEventSource: nil,
                          mouseType: eventUpType,
                          mouseCursorPosition: CGPoint(x: x, y: y),
                          mouseButton: mouseButton)
    eventUp?.postToPid(pid)
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

## Permission Requirements

Same as current:
- **Accessibility permission** required (for CGEventPostToPid)
- No additional permissions needed

## Effort Estimate

| Step | Task | Hours |
|------|------|-------|
| 1 | Create Swift helper with CGWindowListCopyWindowInfo | 2 |
| 2 | Add CGEventPostToPid for mouse/keyboard | 1 |
| 3 | Integrate into NutJSOperator.execute() | 1 |
| 4 | Add fallback to normal nut-js if no window found | 0.5 |
| 5 | Test: verify cursor stays put, clicks register | 2 |

**Total: ~6.5 hours**

## References

- [CGEventPostToPid - Apple Docs](https://developer.apple.com/documentation/coregraphics/cgevent/posttopid(_:)?language=objc)
- [CGWindowListCopyWindowInfo - Apple Docs](https://developer.apple.com/documentation/coregraphics/cgwindowlistcopywindowinfo)
- [nut.js](https://nutjs.com/) - Current input library
