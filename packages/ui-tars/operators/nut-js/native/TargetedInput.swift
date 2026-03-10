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
    case key(pid: Int32, keyCode: Int)
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
        guard args.count == 3,
              let pid = Int32(args[2]) else { return nil }
        // Read text from stdin to avoid shell injection (FIX #1)
        let text = readLine() ?? ""
        return .type(pid: pid, text: text)
        
    case "key":
        guard args.count == 4,
              let pid = Int32(args[2]),
              let keyCode = Int(args[3]) else { return nil }
        return .key(pid: pid, keyCode: keyCode)
        
    default:
        return nil
    }
}

// CGWindowListCopyWindowInfo returns windows front-to-back
// First match = topmost window (correct for click target)
// Note: CGWindowListCopyWindowInfo uses Quartz coordinates (top-left origin, y down)
// This matches NutJS click coordinates - no coordinate flip needed (FIX #2)
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

// Key press via CGEvent
func postKeyPress(pid: pid_t, keyCode: Int) {
    let source = CGEventSource(stateID: .hidSystemState)
    let virtualKey = CGKeyCode(keyCode)
    
    // Key down
    if let downEvent = CGEvent(keyboardEventSource: source, virtualKey: virtualKey, keyDown: true) {
        downEvent.postToPid(pid)
    }
    
    // Key up
    if let upEvent = CGEvent(keyboardEventSource: source, virtualKey: virtualKey, keyDown: false) {
        upEvent.postToPid(pid)
    }
}

// Main entry point
func main() {
    guard let command = parseArgs() else {
        fputs("Usage: TargetedInput <find-window|click|type|key> ...\n", stderr)
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
        
    case .key(let pid, let keyCode):
        postKeyPress(pid: pid, keyCode: keyCode)
    }
}

main()
