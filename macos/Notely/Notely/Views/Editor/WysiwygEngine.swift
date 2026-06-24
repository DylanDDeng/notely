import AppKit
import Foundation

/// Represents a Markdown inline rule for the WYSIWYG engine.
struct WysiwygInlineRule {
    let pattern: NSRegularExpression
    /// Returns the marker ranges (to be hidden/faded) and content ranges (to be styled).
    let analyze: (NSTextCheckingResult, NSString) -> (markers: [NSRange], content: [NSRange])
    let contentAttributes: [NSAttributedString.Key: Any]
}

/// Style definitions for Markdown rendering.
struct MarkdownStyle {
    let bold: [NSAttributedString.Key: Any]
    let italic: [NSAttributedString.Key: Any]
    let strikethrough: [NSAttributedString.Key: Any]
    let inlineCode: [NSAttributedString.Key: Any]
    let link: [NSAttributedString.Key: Any]
    let heading1: [NSAttributedString.Key: Any]
    let heading2: [NSAttributedString.Key: Any]
    let heading3: [NSAttributedString.Key: Any]
    let heading4: [NSAttributedString.Key: Any]
    let heading5: [NSAttributedString.Key: Any]
    let heading6: [NSAttributedString.Key: Any]
    let blockquote: [NSAttributedString.Key: Any]
    let codeBlock: [NSAttributedString.Key: Any]
    let listItem: [NSAttributedString.Key: Any]
    let taskList: [NSAttributedString.Key: Any]
    let hr: [NSAttributedString.Key: Any]
    let hashtag: [NSAttributedString.Key: Any]
    let baseParagraph: [NSAttributedString.Key: Any]
    let calloutPara: NSParagraphStyle
}

/// The WYSIWYG engine that applies Markdown styling and marker hiding.
///
/// Key principle: the underlying text storage always contains the raw Markdown.
/// Styling is applied via temporary attributes. Marker characters are hidden
/// (zero alpha) when the cursor is outside their paragraph, and shown with
/// faded color when the cursor is inside.
final class WysiwygEngine {
    private let style: MarkdownStyle
    private let inlineRules: [WysiwygInlineRule]
    /// Rendered table grids cached by "width|source" so re-collapsing tables on
    /// every keystroke does not re-render their images.
    private var tableCache: [String: TableAttachment] = [:]
    /// Rendered math cached by "display|width|source" for the same reason.
    private var mathCache: [String: MathAttachment] = [:]

    init(style: MarkdownStyle) {
        self.style = style
        self.inlineRules = WysiwygEngine.buildInlineRules(style: style)
    }

    // MARK: - Style factory

    /// Resolve a font for the editor body in the user's chosen family, at the
    /// given size and weight. "System" and "SF Mono" use the system font APIs
    /// (which honor weight directly); named families match via font descriptor,
    /// falling back to the system font if the family is unavailable.
    static func resolveFont(name: String, size: CGFloat, weight: NSFont.Weight = .regular) -> NSFont {
        switch name {
        case "System", "":
            return NSFont.systemFont(ofSize: size, weight: weight)
        case "SF Mono":
            return NSFont.monospacedSystemFont(ofSize: size, weight: weight)
        case "New York":
            // New York is the system serif font; it is not exposed as a regular
            // font family by NSFontManager, so resolve it through the system
            // font descriptor's serif design. Falls back to the default system
            // font if the serif design is unavailable.
            let descriptor = NSFont.systemFont(ofSize: size, weight: weight)
                .fontDescriptor.withDesign(.serif)
            return descriptor.flatMap { NSFont(descriptor: $0, size: size) }
                ?? NSFont.systemFont(ofSize: size, weight: weight)
        default:
            let descriptor = NSFontDescriptor(fontAttributes: [
                .family: name,
                .traits: [NSFontDescriptor.TraitKey.weight: weight.rawValue]
            ])
            return NSFont(descriptor: descriptor, size: size) ?? NSFont.systemFont(ofSize: size, weight: weight)
        }
    }

    static func makeStyle(fontSize: CGFloat = 17, lineHeight: CGFloat = 1.7, fontName: String = "System") -> MarkdownStyle {
        let baseColor = NSColor(named: "PrimaryText") ?? .textColor
        let secondaryColor = NSColor(named: "SecondaryText") ?? .secondaryLabelColor
        let accentColor = NSColor(named: "AccentColor") ?? .controlAccentColor
        let codeBgColor = NSColor(named: "CodeBlockBackground") ?? NSColor.controlBackgroundColor
        let blockquoteBg = (NSColor(named: "AccentColor") ?? NSColor.systemOrange).withAlphaComponent(0.04)

        // Body typeface follows the user's Editor Font choice. Bold/italic are
        // derived from the same family via NSFontManager so they stay consistent.
        let baseFont = Self.resolveFont(name: fontName, size: fontSize)
        let boldFont = NSFontManager.shared.convert(baseFont, toHaveTrait: .boldFontMask)
        let italicFont = NSFontManager.shared.convert(baseFont, toHaveTrait: .italicFontMask)

        let para = NSMutableParagraphStyle()
        para.lineSpacing = (fontSize * (lineHeight - 1.0))

        let baseParagraph: [NSAttributedString.Key: Any] = [
            .font: baseFont,
            .foregroundColor: baseColor,
            .paragraphStyle: para,
        ]

        func headingAttrs(level: Int) -> [NSAttributedString.Key: Any] {
            let sizes: [CGFloat] = [28, 22, 20, 18, 17, 16]
            let weights: [NSFont.Weight] = [.bold, .semibold, .semibold, .semibold, .semibold, .semibold]
            let idx = max(0, min(5, level - 1))
            let hp = NSMutableParagraphStyle()
            hp.lineSpacing = 3
            hp.paragraphSpacingBefore = level == 1 ? 10 : 16
            hp.paragraphSpacing = 6
            return [
                .font: Self.resolveFont(name: fontName, size: sizes[idx], weight: weights[idx]),
                .foregroundColor: baseColor,
                .paragraphStyle: hp,
            ]
        }

        let bp = NSMutableParagraphStyle()
        bp.headIndent = 20
        bp.firstLineHeadIndent = 20
        bp.lineSpacing = 2

        let cbPara = NSMutableParagraphStyle()
        cbPara.headIndent = 16
        cbPara.firstLineHeadIndent = 16
        // Negative tail indent insets the text from the trailing edge so code
        // lines wrap inside the box drawn by CodeBlockLayoutManager.
        cbPara.tailIndent = -16
        cbPara.lineSpacing = 4
        cbPara.paragraphSpacing = 0
        cbPara.paragraphSpacingBefore = 0

        // Callout body: indented past the left accent bar, with right padding so
        // text wraps inside the box drawn by CodeBlockLayoutManager.
        let calloutPara = NSMutableParagraphStyle()
        calloutPara.headIndent = 20
        calloutPara.firstLineHeadIndent = 20
        calloutPara.tailIndent = -14
        calloutPara.lineSpacing = 3
        calloutPara.paragraphSpacing = 0
        calloutPara.paragraphSpacingBefore = 0

        return MarkdownStyle(
            bold: [
                .font: boldFont,
                .foregroundColor: baseColor,
            ],
            italic: [
                .font: italicFont,
                .foregroundColor: secondaryColor,
            ],
            strikethrough: [
                .font: baseFont,
                .foregroundColor: NSColor(named: "TertiaryText") ?? .tertiaryLabelColor,
                .strikethroughStyle: NSUnderlineStyle.single.rawValue,
                .strikethroughColor: NSColor(named: "TertiaryText") ?? .tertiaryLabelColor,
            ],
            inlineCode: [
                .font: NSFont.monospacedSystemFont(ofSize: fontSize - 2, weight: .regular),
                .foregroundColor: NSColor(named: "SecondaryText") ?? secondaryColor,
                .backgroundColor: codeBgColor,
            ],
            link: [
                .font: baseFont,
                .foregroundColor: accentColor,
                .underlineStyle: NSUnderlineStyle.single.rawValue,
            ],
            heading1: headingAttrs(level: 1),
            heading2: headingAttrs(level: 2),
            heading3: headingAttrs(level: 3),
            heading4: headingAttrs(level: 4),
            heading5: headingAttrs(level: 5),
            heading6: headingAttrs(level: 6),
            blockquote: [
                .font: italicFont,
                .foregroundColor: secondaryColor,
                .paragraphStyle: bp,
                .backgroundColor: blockquoteBg,
            ],
            codeBlock: [
                .font: NSFont.monospacedSystemFont(ofSize: fontSize - 3, weight: .regular),
                .foregroundColor: NSColor(named: "SecondaryText") ?? secondaryColor,
                // The block background is drawn as one rounded box by
                // CodeBlockLayoutManager (see the .codeBlockBackground marker
                // applied in applyStyle), not via .backgroundColor which paints
                // a ragged per-line fill.
                .paragraphStyle: cbPara,
            ],
            listItem: [
                .font: baseFont,
                .foregroundColor: baseColor,
            ],
            taskList: [
                .font: NSFont.monospacedSystemFont(ofSize: fontSize - 2, weight: .medium),
                .foregroundColor: accentColor,
            ],
            hr: [
                .font: baseFont,
                .foregroundColor: NSColor(named: "BorderColor") ?? .separatorColor,
                .strikethroughStyle: NSUnderlineStyle.single.rawValue,
                .strikethroughColor: NSColor(named: "BorderColor") ?? .separatorColor,
            ],
            hashtag: [
                .font: Self.resolveFont(name: fontName, size: fontSize - 1, weight: .medium),
                .foregroundColor: accentColor,
            ],
            baseParagraph: baseParagraph,
            calloutPara: calloutPara
        )
    }

    // MARK: - Inline rules

    private static func buildInlineRules(style: MarkdownStyle) -> [WysiwygInlineRule] {
        [
            // Images: ![alt](url)
            WysiwygInlineRule(
                pattern: try! NSRegularExpression(pattern: #"!\[([^\]]*)\]\(([^)]+)\)"#),
                analyze: { match, str in
                    let full = match.range
                    let altRange = match.range(at: 1)
                    var markers: [NSRange] = []
                    if altRange.location != NSNotFound && altRange.length > 0 {
                        markers.append(NSRange(location: full.location, length: altRange.location - full.location))
                        markers.append(NSRange(location: altRange.location + altRange.length, length: full.location + full.length - (altRange.location + altRange.length)))
                    } else {
                        markers.append(full)
                    }
                    return (markers, altRange.length > 0 ? [altRange] : [])
                },
                contentAttributes: style.link
            ),

            // Links: [text](url)
            WysiwygInlineRule(
                pattern: try! NSRegularExpression(pattern: #"\[([^\]]+)\]\(([^)]+)\)"#),
                analyze: { match, str in
                    let full = match.range
                    let textRange = match.range(at: 1)
                    var markers: [NSRange] = []
                    markers.append(NSRange(location: full.location, length: textRange.location - full.location))
                    markers.append(NSRange(location: textRange.location + textRange.length, length: full.location + full.length - (textRange.location + textRange.length)))
                    return (markers, [textRange])
                },
                contentAttributes: style.link
            ),

            // Bold+italic: ***text***
            WysiwygInlineRule(
                pattern: try! NSRegularExpression(pattern: #"\*{3}(.+?)\*{3}"#),
                analyze: { match, str in
                    let full = match.range
                    let content = match.range(at: 1)
                    var markers: [NSRange] = []
                    markers.append(NSRange(location: full.location, length: 3))
                    markers.append(NSRange(location: content.location + content.length, length: 3))
                    return (markers, [content])
                },
                contentAttributes: [
                    .font: NSFontManager.shared.convert(
                        (style.bold[.font] as? NSFont) ?? NSFont.systemFont(ofSize: 17),
                        toHaveTrait: .italicFontMask
                    ),
                ]
            ),

            // Bold: **text**
            WysiwygInlineRule(
                pattern: try! NSRegularExpression(pattern: #"\*{2}(.+?)\*{2}"#),
                analyze: { match, str in
                    let full = match.range
                    let content = match.range(at: 1)
                    var markers: [NSRange] = []
                    markers.append(NSRange(location: full.location, length: 2))
                    markers.append(NSRange(location: content.location + content.length, length: 2))
                    return (markers, [content])
                },
                contentAttributes: style.bold
            ),

            // Italic: *text*
            WysiwygInlineRule(
                pattern: try! NSRegularExpression(pattern: #"(?<!\*)\*(?!\s)([^*]+?)(?<!\s)\*(?!\*)"#),
                analyze: { match, str in
                    let full = match.range
                    let content = match.range(at: 1)
                    var markers: [NSRange] = []
                    markers.append(NSRange(location: full.location, length: 1))
                    markers.append(NSRange(location: content.location + content.length, length: 1))
                    return (markers, [content])
                },
                contentAttributes: style.italic
            ),

            // Strikethrough: ~~text~~
            WysiwygInlineRule(
                pattern: try! NSRegularExpression(pattern: #"~~(.+?)~~"#),
                analyze: { match, str in
                    let full = match.range
                    let content = match.range(at: 1)
                    var markers: [NSRange] = []
                    markers.append(NSRange(location: full.location, length: 2))
                    markers.append(NSRange(location: content.location + content.length, length: 2))
                    return (markers, [content])
                },
                contentAttributes: style.strikethrough
            ),

            // Inline code: `code`
            WysiwygInlineRule(
                pattern: try! NSRegularExpression(pattern: #"`([^`]+)`"#),
                analyze: { match, str in
                    let full = match.range
                    let content = match.range(at: 1)
                    var markers: [NSRange] = []
                    markers.append(NSRange(location: full.location, length: 1))
                    markers.append(NSRange(location: content.location + content.length, length: 1))
                    return (markers, [content])
                },
                contentAttributes: style.inlineCode
            ),

            // Hashtags: #word/path
            WysiwygInlineRule(
                pattern: try! NSRegularExpression(pattern: #"(?m)(?<=^|[\s(\[])#[A-Za-z][\w/-]*"#),
                analyze: { match, str in
                    ([], [match.range])
                },
                contentAttributes: style.hashtag
            ),
        ]
    }

    // MARK: - Apply styling

    /// Applies WYSIWYG styling to the text storage.
    /// - Parameters:
    ///   - storage: The text storage to style.
    ///   - cursorLocation: The current cursor position (for marker hiding).
    func applyStyle(to storage: NSTextStorage, cursorLocation: Int,
                    activeTableIndex: Int = -1, maxTableWidth: CGFloat = 640,
                    activeMathIndex: Int = -1, maxMathWidth: CGFloat = 640) {
        let fullRange = NSRange(location: 0, length: storage.length)
        let nsString = storage.string as NSString

        storage.beginEditing()

        // Clear temporary attributes
        storage.removeAttribute(.foregroundColor, range: fullRange)
        storage.removeAttribute(.backgroundColor, range: fullRange)
        storage.removeAttribute(.font, range: fullRange)
        storage.removeAttribute(.underlineStyle, range: fullRange)
        storage.removeAttribute(.strikethroughStyle, range: fullRange)
        storage.removeAttribute(.paragraphStyle, range: fullRange)
        storage.removeAttribute(.attachment, range: fullRange)
        storage.removeAttribute(.codeBlockBackground, range: fullRange)
        storage.removeAttribute(.calloutType, range: fullRange)
        storage.removeAttribute(.listBullet, range: fullRange)

        // Apply base paragraph style to everything
        storage.addAttributes(style.baseParagraph, range: fullRange)

        // Process line by line for block-level elements
        var lineRanges: [(NSRange, String)] = []
        nsString.enumerateSubstrings(in: fullRange, options: [.byLines]) { substring, range, _, _ in
            lineRanges.append((range, substring ?? ""))
        }

        var inCodeBlock = false
        var codeBlockStart = 0
        var codeBlockRanges: [NSRange] = []

        // Line-start offsets of fences that belong to a *closed* code block.
        // A stray or not-yet-closed fence is absent here, so it is processed as
        // an ordinary line instead of turning the rest of the document into code.
        let realFenceLocations = scanCodeBlocks(in: nsString).fenceLocations

        var inCallout = false
        var calloutStart = 0
        var calloutType = "note"

        for (lineRange, line) in lineRanges {
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            // Code fence detection (only fences that pair into a closed block).
            if realFenceLocations.contains(lineRange.location) {
                if !inCodeBlock {
                    inCodeBlock = true
                    codeBlockStart = lineRange.location
                } else {
                    inCodeBlock = false
                    let blockRange = NSRange(location: codeBlockStart, length: (lineRange.location + lineRange.length) - codeBlockStart)
                    codeBlockRanges.append(blockRange)
                    storage.addAttributes(style.codeBlock, range: blockRange)
                    // Marker for CodeBlockLayoutManager to draw the unified box.
                    storage.addAttribute(.codeBlockBackground, value: true, range: blockRange)
                    // Add spacing before the first line of the code block
                    if codeBlockStart > 0 {
                        let prevLineEnd = codeBlockStart - 1
                        if prevLineEnd >= 0 && prevLineEnd < storage.length {
                            var prevAttrs = storage.attributes(at: prevLineEnd, effectiveRange: nil)
                            if let prevPara = prevAttrs[.paragraphStyle] as? NSParagraphStyle {
                                let modified = prevPara.mutableCopy() as! NSMutableParagraphStyle
                                modified.paragraphSpacing = 12
                                prevAttrs[.paragraphStyle] = modified
                                storage.addAttribute(.paragraphStyle, value: modified, range: NSRange(location: prevLineEnd, length: 1))
                            }
                        }
                    }
                    // Add spacing after the last line of the code block
                    let blockEnd = blockRange.location + blockRange.length
                    if blockEnd < storage.length {
                        var endAttrs = storage.attributes(at: blockEnd, effectiveRange: nil)
                        if let endPara = endAttrs[.paragraphStyle] as? NSParagraphStyle {
                            let modified = endPara.mutableCopy() as! NSMutableParagraphStyle
                            modified.paragraphSpacingBefore = 12
                            endAttrs[.paragraphStyle] = modified
                            storage.addAttribute(.paragraphStyle, value: modified, range: NSRange(location: blockEnd, length: 1))
                        }
                    }
                    // Apply faded color to fence delimiters
                    applyMarkerStyle(storage, range: lineRange)
                }
                continue
            }

            if inCodeBlock { continue }

            // Callout fence: ::: [type] [title] … :::
            if trimmed.hasPrefix(":::") {
                if !inCallout {
                    inCallout = true
                    calloutStart = lineRange.location
                    // Parse the type from the opening line ("note 类比" -> "note").
                    let after = trimmed.dropFirst(3).trimmingCharacters(in: .whitespaces)
                    calloutType = after.split(whereSeparator: { $0 == " " }).first.map(String.init) ?? "note"
                    styleCalloutOpeningLine(storage, line: line, lineRange: lineRange, type: calloutType, cursorLocation: cursorLocation)
                } else {
                    inCallout = false
                    let blockRange = NSRange(location: calloutStart, length: (lineRange.location + lineRange.length) - calloutStart)
                    // Marker for CodeBlockLayoutManager to draw the tinted box + bar.
                    storage.addAttribute(.calloutType, value: calloutType, range: blockRange)
                    // Closing ::: line: indent + hidden (shown faded only when
                    // the cursor is on the line, so it stays editable).
                    storage.addAttribute(.paragraphStyle, value: style.calloutPara, range: lineRange)
                    if NSLocationInRange(cursorLocation, lineRange) {
                        applyMarkerStyle(storage, range: lineRange)
                    } else {
                        hideRange(storage, range: lineRange)
                    }
                    addBlockSpacing(storage, blockStart: calloutStart, blockRange: blockRange)
                }
                continue
            }

            if inCallout {
                // Body line: indent past the bar; keep base color. Inline rules
                // (bold/italic/links) still run afterwards over this range.
                storage.addAttribute(.paragraphStyle, value: style.calloutPara, range: lineRange)
                continue
            }

            // Headings
            if let headingInfo = parseHeading(line: trimmed) {
                let headingStyle = headingStyleFor(level: headingInfo.level)
                storage.addAttributes(headingStyle, range: lineRange)
                // Hide the # markers for non-active lines
                applyMarkerHiding(storage: storage, markerRange: headingInfo.markerRange, lineRange: lineRange, cursorLocation: cursorLocation)
                continue
            }

            // Blockquote
            if trimmed.hasPrefix(">") {
                storage.addAttributes(style.blockquote, range: lineRange)
                // Find > markers and hide them
                hideBlockquoteMarkers(storage: storage, line: line, lineRange: lineRange, cursorLocation: cursorLocation)
                continue
            }

            // Horizontal rule
            if isHorizontalRule(trimmed) {
                storage.addAttributes(style.hr, range: lineRange)
                continue
            }

            // Task list item: - [ ] or - [x]
            if isTaskListItem(trimmed) {
                storage.addAttributes(style.listItem, range: lineRange)
                // Style checkbox
                if let checkboxRange = findCheckboxRange(line: line, lineRange: lineRange) {
                    storage.addAttributes(style.taskList, range: checkboxRange)
                }
                applyListHangingIndent(storage: storage, line: line, lineRange: lineRange)
                // Hide the list marker
                hideListMarker(storage: storage, line: line, lineRange: lineRange, cursorLocation: cursorLocation)
                continue
            }

            // List items
            if isListItem(trimmed) {
                storage.addAttributes(style.listItem, range: lineRange)
                applyListHangingIndent(storage: storage, line: line, lineRange: lineRange)
                hideListMarker(storage: storage, line: line, lineRange: lineRange, cursorLocation: cursorLocation)
                continue
            }
        }

        // Render loadable images as real NSTextAttachment replacement characters.
        if let imageRule = inlineRules.first {
            var renderableImages: [(range: NSRange, markdown: String, content: LoadedMarkdownImage)] = []

            imageRule.pattern.enumerateMatches(in: storage.string, range: fullRange) { match, _, _ in
                guard let match = match else { return }
                if codeBlockRanges.contains(where: { NSLocationInRange(match.range.location, $0) }) { return }

                let urlString = nsString.substring(with: match.range(at: 2))
                let markdown = nsString.substring(with: match.range)

                if let content = ImageLoader.shared.loadSync(urlString: urlString) {
                    renderableImages.append((match.range, markdown, content))
                } else if isRemoteImageURL(urlString) {
                    ImageLoader.shared.loadAsync(urlString: urlString) { image in
                        if image != nil {
                            NotificationCenter.default.post(name: .imageDidLoad, object: nil)
                        }
                    }
                }
            }

            for item in renderableImages.reversed() {
                let attachment = ImageTextAttachment(content: item.content, markdownSource: item.markdown, maxWidth: 500)
                let paragraph = NSMutableParagraphStyle()
                paragraph.lineSpacing = 4
                paragraph.paragraphSpacing = 8
                paragraph.paragraphSpacingBefore = 8
                paragraph.alignment = .left

                let replacement = NSMutableAttributedString(attachment: attachment)
                replacement.addAttributes(style.baseParagraph, range: NSRange(location: 0, length: replacement.length))
                replacement.addAttribute(.paragraphStyle, value: paragraph, range: NSRange(location: 0, length: replacement.length))
                storage.replaceCharacters(in: item.range, with: replacement)
            }
        }

        let styledFullRange = NSRange(location: 0, length: storage.length)
        let styledString = storage.string as NSString
        let styledCodeBlockRanges = findCodeBlockRanges(in: styledString)

        // Collect unresolved image ranges so normal link styling does not split ![alt](url).
        var imageRanges: [NSRange] = []
        if let imageRule = inlineRules.first {
            imageRule.pattern.enumerateMatches(in: storage.string, range: styledFullRange) { match, _, _ in
                guard let match = match else { return }
                imageRanges.append(match.range)
                let (markers, contentRanges) = imageRule.analyze(match, styledString)
                for contentRange in contentRanges {
                    storage.addAttributes(imageRule.contentAttributes, range: contentRange)
                }
                for markerRange in markers {
                    storage.addAttribute(.foregroundColor, value: getMarkerColor(), range: markerRange)
                }
            }
        }

        for (ruleIndex, rule) in inlineRules.enumerated() {
            if ruleIndex == 0 { continue }

            rule.pattern.enumerateMatches(in: storage.string, range: styledFullRange) { match, _, _ in
                guard let match = match else { return }

                // Skip if inside code block
                for blockRange in styledCodeBlockRanges {
                    if NSLocationInRange(match.range.location, blockRange) { return }
                }

                // Skip if inside an image range (to avoid double-processing)
                for imgRange in imageRanges {
                    if NSLocationInRange(match.range.location, imgRange) { return }
                }

                let (markers, contentRanges) = rule.analyze(match, styledString)
                for contentRange in contentRanges {
                    storage.addAttributes(rule.contentAttributes, range: contentRange)
                }

                // Hide/fade markers
                let isActive = NSLocationInRange(cursorLocation, match.range)
                for markerRange in markers {
                    if isActive {
                        // Show markers at normal size when cursor is inside
                        storage.addAttribute(.foregroundColor, value: getMarkerColor(), range: markerRange)
                    } else {
                        // Collapse markers to near-zero width: transparent color
                        // + tiny font size so they occupy almost no horizontal
                        // space. This eliminates the visible gap / "indentation"
                        // around bold, italic, code, etc.
                        storage.addAttributes([
                            .foregroundColor: NSColor.clear,
                            .font: NSFont.systemFont(ofSize: 0.1),
                        ], range: markerRange)
                    }
                }
            }
        }

        // Math first, then tables: collapse every span except the one being
        // edited into a rendered attachment. Done after inline styling, in
        // reverse order so earlier ranges stay valid as we mutate the storage.
        applyMath(to: storage, activeIndex: activeMathIndex, maxWidth: maxMathWidth)
        applyTables(to: storage, activeIndex: activeTableIndex, maxWidth: maxTableWidth)

        storage.endEditing()
    }

    // MARK: - Math

    private func applyMath(to storage: NSTextStorage, activeIndex: Int, maxWidth: CGFloat) {
        let nsString = storage.string as NSString
        let tableRanges = MarkdownTableParser.tables(in: nsString).map { $0.range }
        let spans = LatexMath.mathSpans(in: nsString, excludingTableRanges: tableRanges)
        guard !spans.isEmpty else { return }

        let bodyFont = (style.baseParagraph[.font] as? NSFont) ?? NSFont.systemFont(ofSize: 17)
        let color = (style.baseParagraph[.foregroundColor] as? NSColor) ?? NSColor(named: "PrimaryText") ?? .textColor
        let mono = NSFont.monospacedSystemFont(ofSize: max(11, bodyFont.pointSize - 1), weight: .regular)

        for (index, span) in spans.enumerated().reversed() {
            guard NSMaxRange(span.range) <= storage.length else { continue }
            if index == activeIndex {
                storage.addAttribute(.font, value: mono, range: span.range)
                continue
            }
            let source = nsString.substring(with: span.range)
            let attachment = mathAttachment(latex: span.latex, display: span.display, source: source,
                                            font: bodyFont, color: color, maxWidth: maxWidth)
            let replacement = NSMutableAttributedString(attachment: attachment)
            if span.display {
                let paragraph = NSMutableParagraphStyle()
                paragraph.alignment = .center
                paragraph.paragraphSpacingBefore = 6
                paragraph.paragraphSpacing = 6
                replacement.addAttribute(.paragraphStyle, value: paragraph,
                                         range: NSRange(location: 0, length: replacement.length))
            }
            storage.replaceCharacters(in: span.range, with: replacement)
        }
    }

    private func mathAttachment(latex: String, display: Bool, source: String, font: NSFont, color: NSColor, maxWidth: CGFloat) -> MathAttachment {
        let key = "\(display ? "D" : "I")|\(Int(maxWidth))|\(source)"
        if let cached = mathCache[key] { return cached }
        let attachment = MathAttachment(latex: latex, display: display, markdownSource: source,
                                        font: font, color: color, maxWidth: maxWidth)
        mathCache[key] = attachment
        return attachment
    }

    // MARK: - Tables

    private func applyTables(to storage: NSTextStorage, activeIndex: Int, maxWidth: CGFloat) {
        let nsString = storage.string as NSString
        let tables = MarkdownTableParser.tables(in: nsString)
        guard !tables.isEmpty else { return }

        let bodyFont = (style.baseParagraph[.font] as? NSFont) ?? NSFont.systemFont(ofSize: 17)
        let mono = NSFont.monospacedSystemFont(ofSize: max(11, bodyFont.pointSize - 1), weight: .regular)

        for (index, item) in tables.enumerated().reversed() {
            guard NSMaxRange(item.range) <= storage.length else { continue }
            if index == activeIndex {
                // Being edited: show the raw source, monospaced so the pipes line
                // up while typing.
                storage.addAttribute(.font, value: mono, range: item.range)
                continue
            }
            let source = nsString.substring(with: item.range)
            let attachment = tableAttachment(for: item.table, source: source, font: bodyFont, maxWidth: maxWidth)
            let paragraph = NSMutableParagraphStyle()
            paragraph.paragraphSpacingBefore = 8
            paragraph.paragraphSpacing = 10
            let replacement = NSMutableAttributedString(attachment: attachment)
            replacement.addAttribute(.paragraphStyle, value: paragraph,
                                     range: NSRange(location: 0, length: replacement.length))
            storage.replaceCharacters(in: item.range, with: replacement)
        }
    }

    private func tableAttachment(for table: MarkdownTable, source: String, font: NSFont, maxWidth: CGFloat) -> TableAttachment {
        let key = "\(Int(maxWidth))|\(source)"
        if let cached = tableCache[key] { return cached }
        let attachment = TableAttachment(table: table, markdownSource: source, font: font, maxWidth: maxWidth)
        tableCache[key] = attachment
        return attachment
    }

    // MARK: - Helper types

    private struct HeadingInfo {
        let level: Int
        let markerRange: NSRange  // range of "# " relative to the trimmed line
    }

    private struct LineMarkerInfo {
        let markerRange: NSRange  // absolute range of the marker in the line
    }

    // MARK: - Parsing helpers

    private func parseHeading(line: String) -> HeadingInfo? {
        let pattern = #"^(#{1,6})\s+"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let nsLine = line as NSString
        guard let match = regex.firstMatch(in: line, range: NSRange(location: 0, length: nsLine.length)) else { return nil }
        let hashes = nsLine.substring(with: match.range(at: 1))
        return HeadingInfo(level: hashes.count, markerRange: match.range)
    }

    private func headingStyleFor(level: Int) -> [NSAttributedString.Key: Any] {
        switch level {
        case 1: return style.heading1
        case 2: return style.heading2
        case 3: return style.heading3
        case 4: return style.heading4
        case 5: return style.heading5
        default: return style.heading6
        }
    }

    private func isHorizontalRule(_ line: String) -> Bool {
        let trimmed = line.replacingOccurrences(of: " ", with: "")
        return (trimmed == "---" || trimmed == "***" || trimmed == "___")
    }

    private func isTaskListItem(_ line: String) -> Bool {
        return line.range(of: #"^\s*[-*+]\s+\[[ xX]\]"#, options: .regularExpression) != nil
    }

    private func isListItem(_ line: String) -> Bool {
        return line.range(of: #"^\s*[-*+]\s+"#, options: .regularExpression) != nil ||
               line.range(of: #"^\s*\d+[.)]\s+"#, options: .regularExpression) != nil
    }

    private func findCheckboxRange(line: String, lineRange: NSRange) -> NSRange? {
        guard let regex = try? NSRegularExpression(pattern: #"\[[ xX]\]"#) else { return nil }
        let nsLine = line as NSString
        guard let match = regex.firstMatch(in: line, range: NSRange(location: 0, length: nsLine.length)) else { return nil }
        return NSRange(location: lineRange.location + match.range.location, length: match.range.length)
    }

    private func isRemoteImageURL(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") ||
               trimmed.hasPrefix("<http://") || trimmed.hasPrefix("<https://")
    }

    private func findCodeBlockRanges(in string: NSString) -> [NSRange] {
        scanCodeBlocks(in: string).blocks
    }

    /// A line that looks like a code fence: an optionally indented run of three
    /// or more backticks or tildes.
    private struct ScannedFence {
        let lineRange: NSRange
        let marker: Character   // "`" or "~"
        let length: Int         // number of fence characters
        let hasInfo: Bool       // a trailing info string (e.g. ```swift)
    }

    private func scanFences(in string: NSString) -> [ScannedFence] {
        var fences: [ScannedFence] = []
        let fullRange = NSRange(location: 0, length: string.length)
        string.enumerateSubstrings(in: fullRange, options: [.byLines]) { substring, range, _, _ in
            guard let line = substring else { return }
            var body = Substring(line)
            while let f = body.first, f == " " || f == "\t" { body = body.dropFirst() }
            guard let marker = body.first, marker == "`" || marker == "~" else { return }
            var length = 0
            for ch in body { if ch == marker { length += 1 } else { break } }
            guard length >= 3 else { return }
            let info = String(body.dropFirst(length)).trimmingCharacters(in: .whitespaces)
            fences.append(ScannedFence(lineRange: range, marker: marker, length: length, hasInfo: !info.isEmpty))
        }
        return fences
    }

    /// Pairs fences into closed code blocks, CommonMark-style:
    ///  - the closing fence uses the same character, is at least as long as the
    ///    opener, and carries no info string;
    ///  - an opening fence with no matching closer is left unpaired, so a stray
    ///    or half-typed fence cannot turn the rest of the document into code.
    /// Returns each block's character range plus the line-start offsets of the
    /// fences that bound a closed block.
    private func scanCodeBlocks(in string: NSString) -> (blocks: [NSRange], fenceLocations: Set<Int>) {
        let fences = scanFences(in: string)
        var blocks: [NSRange] = []
        var fenceLocations = Set<Int>()
        var i = 0
        while i < fences.count {
            let open = fences[i]
            var closeIndex: Int? = nil
            var j = i + 1
            while j < fences.count {
                let f = fences[j]
                if f.marker == open.marker, f.length >= open.length, !f.hasInfo { closeIndex = j; break }
                j += 1
            }
            guard let close = closeIndex else { i += 1; continue }
            let openRange = open.lineRange
            let closeRange = fences[close].lineRange
            blocks.append(NSRange(location: openRange.location,
                                  length: (closeRange.location + closeRange.length) - openRange.location))
            fenceLocations.insert(openRange.location)
            fenceLocations.insert(closeRange.location)
            i = close + 1
        }
        return (blocks, fenceLocations)
    }

    // MARK: - Marker hiding

    private func applyMarkerHiding(storage: NSTextStorage, markerRange: NSRange, lineRange: NSRange, cursorLocation: Int) {
        let absoluteMarkerRange = NSRange(location: lineRange.location + markerRange.location, length: markerRange.length)
        let isActive = NSLocationInRange(cursorLocation, lineRange)

        if isActive {
            storage.addAttribute(.foregroundColor, value: getMarkerColor(), range: absoluteMarkerRange)
        } else {
            // For headings, use faded color instead of transparent so the
            // text doesn't shift position. Transparent text still occupies
            // horizontal space, causing apparent indentation misalignment.
            storage.addAttribute(.foregroundColor, value: getMarkerColor().withAlphaComponent(0.35), range: absoluteMarkerRange)
        }
    }

    private func hideBlockquoteMarkers(storage: NSTextStorage, line: String, lineRange: NSRange, cursorLocation: Int) {
        let nsLine = line as NSString
        let pattern = try! NSRegularExpression(pattern: #">+"#)
        let isActive = NSLocationInRange(cursorLocation, lineRange)

        pattern.enumerateMatches(in: line, range: NSRange(location: 0, length: nsLine.length)) { match, _, _ in
            guard let match = match else { return }
            let absRange = NSRange(location: lineRange.location + match.range.location, length: match.range.length)
            if isActive {
                storage.addAttribute(.foregroundColor, value: getMarkerColor(), range: absRange)
            } else {
                hideRange(storage, range: absRange)
            }
        }
    }

    /// Gives a list item a hanging indent so wrapped lines align under the text
    /// rather than running back to the margin under the bullet. `headIndent` is
    /// set to the rendered width of the "<leading whitespace><marker><space>"
    /// prefix; the first line keeps its natural indent.
    private func applyListHangingIndent(storage: NSTextStorage, line: String, lineRange: NSRange) {
        let nsLine = line as NSString
        let pattern = try! NSRegularExpression(pattern: #"^\s*([-*+]|\d+[.)])\s+"#)
        guard let match = pattern.firstMatch(in: line, range: NSRange(location: 0, length: nsLine.length)) else { return }

        let prefix = nsLine.substring(with: match.range) as NSString
        let font = (style.listItem[.font] as? NSFont) ?? NSFont.systemFont(ofSize: NSFont.systemFontSize)
        let indent = prefix.size(withAttributes: [.font: font]).width

        let base = (style.baseParagraph[.paragraphStyle] as? NSParagraphStyle) ?? NSParagraphStyle.default
        let p = (base.mutableCopy() as! NSMutableParagraphStyle)
        p.headIndent = indent
        p.firstLineHeadIndent = 0
        storage.addAttribute(.paragraphStyle, value: p, range: lineRange)
    }

    private func hideListMarker(storage: NSTextStorage, line: String, lineRange: NSRange, cursorLocation: Int) {
        let nsLine = line as NSString
        let pattern = try! NSRegularExpression(pattern: #"^\s*([-*+]|\d+[.)])\s+"#)
        let isActive = NSLocationInRange(cursorLocation, lineRange)

        guard let match = pattern.firstMatch(in: line, range: NSRange(location: 0, length: nsLine.length)) else { return }
        let tokenRange = match.range(at: 1) // the "-"/"*"/"+" or "1."/"1)" token
        let token = nsLine.substring(with: tokenRange)
        let isUnordered = token.count == 1
        let absFull = NSRange(location: lineRange.location + match.range.location, length: match.range.length)
        let absToken = NSRange(location: lineRange.location + tokenRange.location, length: tokenRange.length)

        if isActive {
            // Reveal the raw marker (faded) while editing this line.
            storage.addAttribute(.foregroundColor, value: getMarkerColor(), range: absFull)
        } else if isUnordered {
            // Hide the raw "-" and draw a real bullet glyph in its place.
            hideRange(storage, range: absFull)
            let bulletColor = (style.baseParagraph[.foregroundColor] as? NSColor)
                ?? NSColor(named: "PrimaryText") ?? .textColor
            storage.addAttribute(.listBullet, value: bulletColor, range: absToken)
        } else {
            // Ordered list: keep the "1." number readable instead of hiding it.
            let numberColor = (style.baseParagraph[.foregroundColor] as? NSColor)
                ?? NSColor(named: "PrimaryText") ?? .textColor
            storage.addAttribute(.foregroundColor, value: numberColor, range: absFull)
        }
    }

    private func applyMarkerStyle(_ storage: NSTextStorage, range: NSRange) {
        storage.addAttribute(.foregroundColor, value: getMarkerColor(), range: range)
    }

    private func hideRange(_ storage: NSTextStorage, range: NSRange) {
        // Hide by making the text transparent (zero alpha)
        // The text remains in the storage so it can be shown again.
        let transparentColor = (NSColor(named: "PrimaryText") ?? .black).withAlphaComponent(0.0)
        storage.addAttribute(.foregroundColor, value: transparentColor, range: range)
    }

    private func getMarkerColor() -> NSColor {
        (NSColor(named: "SecondaryText") ?? .tertiaryLabelColor).withAlphaComponent(0.5)
    }

    // MARK: - Callouts

    /// Styles a callout's opening line (`::: note 类比`) as the colored title:
    /// the `:::` marker is hidden, the rest is shown in the type color, semibold.
    private func styleCalloutOpeningLine(_ storage: NSTextStorage, line: String, lineRange: NSRange, type: String, cursorLocation: Int) {
        storage.addAttribute(.paragraphStyle, value: style.calloutPara, range: lineRange)
        let color = CalloutKind(type).color
        storage.addAttribute(.foregroundColor, value: color, range: lineRange)
        storage.addAttribute(.font, value: NSFont.systemFont(ofSize: 14, weight: .semibold), range: lineRange)
        // Hide the leading ::: so the title reads as the label. Show it faded
        // only when the cursor is on the line, so it stays editable.
        let nsLine = line as NSString
        if let m = try? NSRegularExpression(pattern: #"^\s*:::\s*"#),
           let match = m.firstMatch(in: line, range: NSRange(location: 0, length: nsLine.length)) {
            let absRange = NSRange(location: lineRange.location + match.range.location, length: match.range.length)
            if NSLocationInRange(cursorLocation, lineRange) {
                storage.addAttribute(.foregroundColor, value: color.withAlphaComponent(0.35), range: absRange)
            } else {
                hideRange(storage, range: absRange)
            }
        }
    }

    /// Adds breathing room above and below a block (code block / callout) by
    /// bumping paragraph spacing on the adjacent lines.
    private func addBlockSpacing(_ storage: NSTextStorage, blockStart: Int, blockRange: NSRange) {
        if blockStart > 0 {
            let prevLineEnd = blockStart - 1
            if prevLineEnd >= 0, prevLineEnd < storage.length,
               let prevPara = storage.attributes(at: prevLineEnd, effectiveRange: nil)[.paragraphStyle] as? NSParagraphStyle {
                let modified = prevPara.mutableCopy() as! NSMutableParagraphStyle
                modified.paragraphSpacing = 12
                storage.addAttribute(.paragraphStyle, value: modified, range: NSRange(location: prevLineEnd, length: 1))
            }
        }
        let blockEnd = blockRange.location + blockRange.length
        if blockEnd < storage.length,
           let endPara = storage.attributes(at: blockEnd, effectiveRange: nil)[.paragraphStyle] as? NSParagraphStyle {
            let modified = endPara.mutableCopy() as! NSMutableParagraphStyle
            modified.paragraphSpacingBefore = 12
            storage.addAttribute(.paragraphStyle, value: modified, range: NSRange(location: blockEnd, length: 1))
        }
    }
}
