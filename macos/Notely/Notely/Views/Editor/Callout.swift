import AppKit

extension NSAttributedString.Key {
    /// Marks a range as a `:::` callout block. The value is the raw type string
    /// (e.g. "note"). `CodeBlockLayoutManager` draws a tinted box + left accent
    /// bar behind such ranges, colored by `CalloutKind`.
    static let calloutType = NSAttributedString.Key("notely.calloutType")
}

/// The kind of `:::` callout (admonition), which determines its accent color.
/// Unknown / missing types fall back to `.note`.
enum CalloutKind {
    case note, tip, info, warning, danger

    init(_ raw: String) {
        switch raw.lowercased() {
        case "tip", "hint", "success": self = .tip
        case "info": self = .info
        case "warning", "caution", "attention": self = .warning
        case "danger", "error", "important", "bug": self = .danger
        default: self = .note
        }
    }

    /// Solid accent color used for the left bar and the title text.
    var color: NSColor {
        switch self {
        case .note:    return NSColor(srgbRed: 0.231, green: 0.510, blue: 0.965, alpha: 1) // blue
        case .tip:     return NSColor(srgbRed: 0.063, green: 0.725, blue: 0.506, alpha: 1) // green
        case .info:    return NSColor(srgbRed: 0.024, green: 0.659, blue: 0.741, alpha: 1) // cyan
        case .warning: return NSColor(srgbRed: 0.961, green: 0.620, blue: 0.067, alpha: 1) // amber
        case .danger:  return NSColor(srgbRed: 0.937, green: 0.267, blue: 0.267, alpha: 1) // red
        }
    }
}
