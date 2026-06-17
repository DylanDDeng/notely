import AppKit

extension NSAttributedString.Key {
    /// Marks a range as belonging to a fenced code block. `CodeBlockLayoutManager`
    /// paints a single rounded rectangle behind each such range. Set instead of
    /// `.backgroundColor`, which TextKit paints per-glyph-run (ragged width, no
    /// padding, no corners) rather than as one uniform box.
    static let codeBlockBackground = NSAttributedString.Key("notely.codeBlockBackground")
}

/// Layout manager that draws fenced code blocks as one continuous rounded box
/// spanning the full text column, instead of the ragged per-line fill the
/// `.backgroundColor` attribute produces.
final class CodeBlockLayoutManager: NSLayoutManager {
    /// Horizontal margin between the text column edges and the box.
    var horizontalMargin: CGFloat = 8
    /// Extra height added above and below the block's text.
    var verticalPadding: CGFloat = 8
    var cornerRadius: CGFloat = 6
    /// Fill color for the box. When nil, the `CodeBlockBackground` asset color is
    /// used (falling back to the system control background).
    var boxColor: NSColor?

    override func drawBackground(forGlyphRange glyphsToShow: NSRange, at origin: NSPoint) {
        drawCodeBlockBoxes(forGlyphRange: glyphsToShow, at: origin)
        // Draw text backgrounds (inline code, selection) on top of the box so
        // selection inside a code block stays visible.
        super.drawBackground(forGlyphRange: glyphsToShow, at: origin)
    }

    private func drawCodeBlockBoxes(forGlyphRange glyphsToShow: NSRange, at origin: NSPoint) {
        guard let storage = textStorage, let container = textContainers.first else { return }
        let color = boxColor ?? NSColor(named: "CodeBlockBackground") ?? .controlBackgroundColor
        let charRange = characterRange(forGlyphRange: glyphsToShow, actualGlyphRange: nil)

        storage.enumerateAttribute(.codeBlockBackground, in: charRange, options: []) { value, range, _ in
            guard (value as? Bool) == true else { return }

            let blockGlyphRange = glyphRange(forCharacterRange: range, actualCharacterRange: nil)
            var rect = boundingRect(forGlyphRange: blockGlyphRange, in: container)

            // Full text-column width, then inset for a side margin.
            rect.origin.x = 0
            rect.size.width = container.size.width
            rect = rect.insetBy(dx: horizontalMargin, dy: -verticalPadding)

            // Container coordinates → view coordinates.
            rect.origin.x += origin.x
            rect.origin.y += origin.y

            color.setFill()
            NSBezierPath(roundedRect: rect, xRadius: cornerRadius, yRadius: cornerRadius).fill()
        }
    }
}
