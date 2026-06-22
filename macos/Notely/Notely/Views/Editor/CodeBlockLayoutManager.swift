import AppKit

extension NSAttributedString.Key {
    /// Marks a range as belonging to a fenced code block. `CodeBlockLayoutManager`
    /// paints a single rounded rectangle behind each such range. Set instead of
    /// `.backgroundColor`, which TextKit paints per-glyph-run (ragged width, no
    /// padding, no corners) rather than as one uniform box.
    static let codeBlockBackground = NSAttributedString.Key("notely.codeBlockBackground")

    /// Marks the (hidden) marker character of an unordered list item. The value
    /// is the `NSColor` to paint the bullet with. `CodeBlockLayoutManager` draws
    /// a real `•` glyph centered on this character, since the raw `-`/`*`/`+` is
    /// rendered transparent so it doesn't double up with the bullet.
    static let listBullet = NSAttributedString.Key("notely.listBullet")
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
        drawCalloutBoxes(forGlyphRange: glyphsToShow, at: origin)
        // Draw text backgrounds (inline code, selection) on top of the boxes so
        // selection inside a block stays visible.
        super.drawBackground(forGlyphRange: glyphsToShow, at: origin)
    }

    override func drawGlyphs(forGlyphRange glyphsToShow: NSRange, at origin: NSPoint) {
        super.drawGlyphs(forGlyphRange: glyphsToShow, at: origin)
        drawListBullets(forGlyphRange: glyphsToShow, at: origin)
    }

    /// Paints a filled dot over each `.listBullet`-tagged (hidden) marker
    /// character. A drawn oval (rather than a `•` glyph) gives exact control over
    /// size and centering, so the bullet sits at the optical middle of the line's
    /// text instead of riding the baseline — which reads as "too low", especially
    /// next to full-height CJK glyphs.
    private func drawListBullets(forGlyphRange glyphsToShow: NSRange, at origin: NSPoint) {
        guard let storage = textStorage, let container = textContainers.first else { return }
        let charRange = characterRange(forGlyphRange: glyphsToShow, actualGlyphRange: nil)
        storage.enumerateAttribute(.listBullet, in: charRange, options: []) { value, range, _ in
            guard let color = value as? NSColor else { return }
            let gRange = self.glyphRange(forCharacterRange: range, actualCharacterRange: nil)
            guard gRange.length > 0 else { return }

            let font = (storage.attribute(.font, at: range.location, effectiveRange: nil) as? NSFont)
                ?? NSFont.systemFont(ofSize: NSFont.systemFontSize)

            // Horizontal: center on the (hidden) marker glyph's advance.
            let markerRect = self.boundingRect(forGlyphRange: gRange, in: container)
            let centerX = origin.x + markerRect.midX

            // Vertical: half the cap height above the baseline, i.e. the optical
            // center of capital / CJK glyphs on the line. `location(forGlyphAt:)`
            // gives the baseline offset within the line fragment.
            let fragRect = self.lineFragmentRect(forGlyphAt: gRange.location, effectiveRange: nil)
            let baselineY = origin.y + fragRect.minY + self.location(forGlyphAt: gRange.location).y
            let centerY = baselineY - font.capHeight / 2

            let diameter = max(4, (font.pointSize * 0.26).rounded())
            let dot = NSRect(x: centerX - diameter / 2, y: centerY - diameter / 2,
                             width: diameter, height: diameter)
            color.setFill()
            NSBezierPath(ovalIn: dot).fill()
        }
    }

    private func drawCodeBlockBoxes(forGlyphRange glyphsToShow: NSRange, at origin: NSPoint) {
        let color = boxColor ?? NSColor(named: "CodeBlockBackground") ?? .controlBackgroundColor
        enumerateBlockBoxes(.codeBlockBackground, forGlyphRange: glyphsToShow, at: origin) { rect, value in
            guard (value as? Bool) == true else { return }
            color.setFill()
            NSBezierPath(roundedRect: rect, xRadius: self.cornerRadius, yRadius: self.cornerRadius).fill()
        }
    }

    private func drawCalloutBoxes(forGlyphRange glyphsToShow: NSRange, at origin: NSPoint) {
        enumerateBlockBoxes(.calloutType, forGlyphRange: glyphsToShow, at: origin) { rect, value in
            guard let raw = value as? String else { return }
            let color = CalloutKind(raw).color
            // Soft tinted fill.
            color.withAlphaComponent(0.08).setFill()
            NSBezierPath(roundedRect: rect, xRadius: self.cornerRadius, yRadius: self.cornerRadius).fill()
            // Left accent bar, inset slightly and rounded.
            let bar = NSRect(x: rect.minX, y: rect.minY + 2, width: 3, height: rect.height - 4)
            color.withAlphaComponent(0.9).setFill()
            NSBezierPath(roundedRect: bar, xRadius: 1.5, yRadius: 1.5).fill()
        }
    }

    /// Shared geometry for block backgrounds. Enumerates the WHOLE storage (not
    /// just `glyphsToShow`) so a partial redraw still paints each block's box at
    /// its full size; skips boxes outside the dirty region. Calls `draw` with the
    /// box rect (full column width, side margin + vertical padding applied) in
    /// view coordinates and the attribute value.
    private func enumerateBlockBoxes(_ key: NSAttributedString.Key,
                                     forGlyphRange glyphsToShow: NSRange,
                                     at origin: NSPoint,
                                     draw: (NSRect, Any) -> Void) {
        guard let storage = textStorage, let container = textContainers.first else { return }
        let dirtyRect = boundingRect(forGlyphRange: glyphsToShow, in: container)
            .offsetBy(dx: origin.x, dy: origin.y)
        let fullRange = NSRange(location: 0, length: storage.length)

        storage.enumerateAttribute(key, in: fullRange, options: []) { value, range, _ in
            guard let value else { return }
            let blockGlyphRange = glyphRange(forCharacterRange: range, actualCharacterRange: nil)
            var rect = boundingRect(forGlyphRange: blockGlyphRange, in: container)
            rect.origin.x = 0
            rect.size.width = container.size.width
            rect = rect.insetBy(dx: horizontalMargin, dy: -verticalPadding)
            rect.origin.x += origin.x
            rect.origin.y += origin.y
            guard rect.intersects(dirtyRect) else { return }
            draw(rect, value)
        }
    }
}
