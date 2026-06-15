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

    init(style: MarkdownStyle) {
        self.style = style
        self.inlineRules = WysiwygEngine.buildInlineRules(style: style)
    }

    // MARK: - Style factory

    static func makeStyle(fontSize: CGFloat = 17, lineHeight: CGFloat = 1.7) -> MarkdownStyle {
        let baseColor = NSColor(named: "PrimaryText") ?? .textColor
        let secondaryColor = NSColor(named: "SecondaryText") ?? .secondaryLabelColor
        let accentColor = NSColor(named: "AccentColor") ?? .controlAccentColor
        let codeBgColor = NSColor(named: "CodeBlockBackground") ?? NSColor.controlBackgroundColor
        let blockquoteBg = (NSColor(named: "AccentColor") ?? NSColor.systemOrange).withAlphaComponent(0.04)

        let para = NSMutableParagraphStyle()
        para.lineSpacing = (fontSize * (lineHeight - 1.0))

        let baseParagraph: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: fontSize),
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
                .font: NSFont.systemFont(ofSize: sizes[idx], weight: weights[idx]),
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
        cbPara.lineSpacing = 4
        cbPara.paragraphSpacing = 0
        cbPara.paragraphSpacingBefore = 0

        return MarkdownStyle(
            bold: [
                .font: NSFontManager.shared.convert(NSFont.systemFont(ofSize: fontSize), toHaveTrait: .boldFontMask),
                .foregroundColor: baseColor,
            ],
            italic: [
                .font: NSFontManager.shared.convert(NSFont.systemFont(ofSize: fontSize), toHaveTrait: .italicFontMask),
                .foregroundColor: secondaryColor,
            ],
            strikethrough: [
                .font: NSFont.systemFont(ofSize: fontSize),
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
                .font: NSFont.systemFont(ofSize: fontSize),
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
                .font: NSFontManager.shared.convert(NSFont.systemFont(ofSize: fontSize), toHaveTrait: .italicFontMask),
                .foregroundColor: secondaryColor,
                .paragraphStyle: bp,
                .backgroundColor: blockquoteBg,
            ],
            codeBlock: [
                .font: NSFont.monospacedSystemFont(ofSize: fontSize - 3, weight: .regular),
                .foregroundColor: NSColor(named: "SecondaryText") ?? secondaryColor,
                .backgroundColor: codeBgColor,
                .paragraphStyle: cbPara,
            ],
            listItem: [
                .font: NSFont.systemFont(ofSize: fontSize),
                .foregroundColor: baseColor,
            ],
            taskList: [
                .font: NSFont.monospacedSystemFont(ofSize: fontSize - 2, weight: .medium),
                .foregroundColor: accentColor,
            ],
            hr: [
                .font: NSFont.systemFont(ofSize: fontSize),
                .foregroundColor: NSColor(named: "BorderColor") ?? .separatorColor,
                .strikethroughStyle: NSUnderlineStyle.single.rawValue,
                .strikethroughColor: NSColor(named: "BorderColor") ?? .separatorColor,
            ],
            hashtag: [
                .font: NSFont.systemFont(ofSize: fontSize - 1, weight: .medium),
                .foregroundColor: accentColor,
            ],
            baseParagraph: baseParagraph
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
                    .font: NSFontManager.shared.convert(NSFont.systemFont(ofSize: 17), toHaveTrait: [.boldFontMask, .italicFontMask]),
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
    func applyStyle(to storage: NSTextStorage, cursorLocation: Int) {
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

        for (lineRange, line) in lineRanges {
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            // Code fence detection
            if trimmed.hasPrefix("```") || trimmed.hasPrefix("~~~") {
                if !inCodeBlock {
                    inCodeBlock = true
                    codeBlockStart = lineRange.location
                } else {
                    inCodeBlock = false
                    let blockRange = NSRange(location: codeBlockStart, length: (lineRange.location + lineRange.length) - codeBlockStart)
                    codeBlockRanges.append(blockRange)
                    storage.addAttributes(style.codeBlock, range: blockRange)
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
                // Hide the list marker
                hideListMarker(storage: storage, line: line, lineRange: lineRange, cursorLocation: cursorLocation)
                continue
            }

            // List items
            if isListItem(trimmed) {
                storage.addAttributes(style.listItem, range: lineRange)
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
                        // Show faded markers when cursor is near
                        storage.addAttribute(.foregroundColor, value: getMarkerColor(), range: markerRange)
                    } else {
                        // Hide markers completely
                        hideRange(storage, range: markerRange)
                    }
                }
            }
        }

        storage.endEditing()
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
        let fullRange = NSRange(location: 0, length: string.length)
        var ranges: [NSRange] = []
        var inCodeBlock = false
        var codeBlockStart = 0

        string.enumerateSubstrings(in: fullRange, options: [.byLines]) { substring, range, _, _ in
            let line = substring ?? ""
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard trimmed.hasPrefix("```") || trimmed.hasPrefix("~~~") else { return }

            if !inCodeBlock {
                inCodeBlock = true
                codeBlockStart = range.location
            } else {
                inCodeBlock = false
                ranges.append(NSRange(location: codeBlockStart, length: (range.location + range.length) - codeBlockStart))
            }
        }

        return ranges
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

    private func hideListMarker(storage: NSTextStorage, line: String, lineRange: NSRange, cursorLocation: Int) {
        let nsLine = line as NSString
        let pattern = try! NSRegularExpression(pattern: #"^\s*([-*+]|\d+[.)])\s+"#)
        let isActive = NSLocationInRange(cursorLocation, lineRange)

        if let match = pattern.firstMatch(in: line, range: NSRange(location: 0, length: nsLine.length)) {
            let absRange = NSRange(location: lineRange.location + match.range.location, length: match.range.length)
            if isActive {
                storage.addAttribute(.foregroundColor, value: getMarkerColor(), range: absRange)
            } else {
                hideRange(storage, range: absRange)
            }
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
}
