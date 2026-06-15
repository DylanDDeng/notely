import AppKit
import SwiftUI

/// Simple file-based diagnostics.
enum Diag {
    private static let enabled = false

    private static let path: String = {
        let home = NSHomeDirectory()
        return "\(home)/notely_debug.log"
    }()

    static func log(_ message: String) {
        guard enabled else { return }
        let timestamp = DateFormatter.localizedString(from: Date(), dateStyle: .none, timeStyle: .medium)
        let line = "[\(timestamp)] \(message)\n"
        // Also print to stderr for immediate feedback
        FileHandle.standardError.write(line.data(using: .utf8) ?? Data())
        if let data = line.data(using: .utf8) {
            if FileManager.default.fileExists(atPath: path) {
                if let handle = FileHandle(forWritingAtPath: path) {
                    handle.seekToEndOfFile()
                    handle.write(data)
                    handle.closeFile()
                }
            } else {
                FileManager.default.createFile(atPath: path, contents: data)
            }
        }
    }
}

extension Notification.Name {
    static let imageDidLoad = Notification.Name("notely.imageDidLoad")
    static let animatedImageFrameDidChange = Notification.Name("notely.animatedImageFrameDidChange")
    /// Posted by the outline rail; userInfo["index"] = ordinal of the heading to
    /// scroll to (0-based, in document order).
    static let scrollToHeading = Notification.Name("notely.scrollToHeading")
}

/// Custom scroll view that ensures mouse clicks properly activate the text
/// view as first responder, even inside SwiftUI's NavigationSplitView.
final class EditorScrollView: NSScrollView {
    override var acceptsFirstResponder: Bool { false }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        return true
    }

    override func mouseDown(with event: NSEvent) {
        if let textView = documentView as? NSTextView, textView.window?.firstResponder != textView {
            textView.window?.makeFirstResponder(textView)
        }
        super.mouseDown(with: event)
    }
}

/// SwiftUI wrapper for the WYSIWYG text editor.
///
/// IMPORTANT: This wrapper does NOT use a @Binding for the text content.
/// Instead, the parent passes the initial text and observes changes via a
/// closure. This breaks the feedback loop where every keystroke would
/// trigger a SwiftUI re-render that resets the NSTextView.
struct WysiwygEditor: NSViewRepresentable {
    let initialText: String
    let fontSize: CGFloat
    let lineHeight: CGFloat
    let onTextChange: (String) -> Void

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = EditorScrollView()
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.drawsBackground = false
        scrollView.backgroundColor = .clear
        scrollView.focusRingType = .none
        scrollView.borderType = .noBorder

        let textStorage = NSTextStorage()
        let layoutManager = NSLayoutManager()
        let textContainer = NSTextContainer(containerSize: NSSize(width: 1, height: CGFloat.greatestFiniteMagnitude))
        textContainer.widthTracksTextView = true
        textContainer.lineFragmentPadding = 0
        layoutManager.addTextContainer(textContainer)
        textStorage.addLayoutManager(layoutManager)

        let textView = WysiwygTextView(
            frame: NSRect(origin: .zero, size: NSSize(width: 1, height: scrollView.contentSize.height)),
            textContainer: textContainer
        )
        textView.fontSize = fontSize
        textView.lineHeight = lineHeight
        textView.delegate = context.coordinator
        textView.onTextChange = { newText in
            context.coordinator.lastKnownText = newText
            context.coordinator.onTextChange(newText)
        }
        textView.string = initialText
        // Build the engine at the correct font/line-height up front so the first
        // `updateNSView` does not have to rebuild it.
        textView.rebuildEngineAndRestyle()

        scrollView.documentView = textView
        context.coordinator.textView = textView
        context.coordinator.lastKnownText = initialText
        Diag.log("makeNSView: textView frame=\(textView.frame) isEditable=\(textView.isEditable)")
        return scrollView
    }

    func updateNSView(_ nsView: NSScrollView, context: Context) {
        guard let textView = nsView.documentView as? WysiwygTextView else { return }

        // Only sync text when switching notes (external content change),
        // never during typing. We detect this by comparing initialText against
        // the coordinator's lastKnownText. If they match, the change came from
        // user typing (which already updated the text view). If they differ,
        // it's an external change (note switch) that needs to be pushed in.
        if initialText != context.coordinator.lastKnownText {
            context.coordinator.lastKnownText = initialText
            let selectedRange = textView.selectedRange()
            textView.string = initialText
            textView.restyle()
            let clampedLocation = min(selectedRange.location, (initialText as NSString).length)
            textView.setSelectedRange(NSRange(location: clampedLocation, length: 0))
            Diag.log("updateNSView: text synced for note switch, len=\(initialText.count)")
        }

        // The scroll view fills the full width of the pane, so its vertical
        // scroller sits flush against the right edge. The readable text column is
        // centered and capped via textContainerInset rather than by shrinking the
        // scroll view (which is what pushed the scroller inward before).
        let available = max(nsView.contentSize.width, 1)
        let sideInset = WysiwygTextView.sideInset(forAvailableWidth: available)
        let widthChanged = abs(textView.frame.width - available) > 0.5
        let insetChanged = abs(textView.textContainerInset.width - sideInset) > 0.5
        if widthChanged || insetChanged {
            textView.setFrameSize(NSSize(width: available, height: max(textView.frame.height, nsView.contentSize.height)))
            textView.textContainerInset = NSSize(width: sideInset, height: textView.textContainerInset.height)
            textView.textContainer?.containerSize = NSSize(width: max(1, available - sideInset * 2), height: CGFloat.greatestFiniteMagnitude)
        }

        textView.fontSize = fontSize
        textView.lineHeight = lineHeight
        textView.rebuildEngineAndRestyleIfNeeded()
        textView.fitFrameToContent()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onTextChange: onTextChange)
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        let onTextChange: (String) -> Void
        weak var textView: NSTextView?
        var lastKnownText: String = ""

        init(onTextChange: @escaping (String) -> Void) {
            self.onTextChange = onTextChange
        }
    }
}

/// The WYSIWYG-capable NSTextView subclass.
final class WysiwygTextView: NSTextView {
    var fontSize: CGFloat = 17
    var lineHeight: CGFloat = 1.7
    var onTextChange: ((String) -> Void)?
    private var engine: WysiwygEngine?
    private var isRestyling = false

    /// Font/line-height the cached `engine` was built for. The engine compiles
    /// ~9 regular expressions, so we rebuild it only when these actually change
    /// instead of on every SwiftUI `updateNSView` pass.
    private var engineFontSize: CGFloat = .nan
    private var engineLineHeight: CGFloat = .nan

    /// Set when a coalesced restyle is already queued for this runloop turn, so
    /// a burst of async triggers (e.g. many remote images finishing) collapses
    /// into a single full restyle instead of one per event.
    private var restyleScheduled = false

    /// Test instrumentation: number of full restyles and engine rebuilds.
    private(set) var restyleCount = 0
    private(set) var engineBuildCount = 0

    // MARK: - Layout

    /// Maximum readable text column width in points.
    static let maxColumnWidth: CGFloat = 720
    /// Minimum horizontal inset on each side of the text column.
    static let minSideInset: CGFloat = 90

    /// Horizontal text inset that centers a `maxColumnWidth`-capped column in a
    /// text view of the given available width. The scroll view itself spans the
    /// full width (so its scroller hugs the right edge); this inset reproduces
    /// the centered column purely inside the text view.
    static func sideInset(forAvailableWidth width: CGFloat) -> CGFloat {
        max(minSideInset, (width - maxColumnWidth) / 2)
    }

    override init(frame frameRect: NSRect, textContainer container: NSTextContainer?) {
        super.init(frame: frameRect, textContainer: container)
        setupEditor()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupEditor() {
        isEditable = true
        isSelectable = true
        isRichText = true
        allowsUndo = true
        usesAdaptiveColorMappingForDarkAppearance = true
        font = NSFont.systemFont(ofSize: fontSize)
        textColor = NSColor(named: "PrimaryText")
        backgroundColor = .clear
        insertionPointColor = NSColor(named: "AccentColor") ?? .controlAccentColor
        autoresizingMask = [.width]
        textContainerInset = NSSize(width: 0, height: 8)
        textContainer?.widthTracksTextView = true
        textContainer?.containerSize = NSSize(width: max(bounds.width, 1), height: CGFloat.greatestFiniteMagnitude)
        textContainer?.lineFragmentPadding = 0
        isHorizontallyResizable = false
        isVerticallyResizable = true
        minSize = NSSize(width: 0, height: 0)
        maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)

        rebuildEngine()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleImageDidLoad),
            name: .imageDidLoad,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAnimatedImageFrameDidChange(_:)),
            name: .animatedImageFrameDidChange,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleScrollToHeading(_:)),
            name: .scrollToHeading,
            object: nil
        )
    }

    // MARK: - Heading navigation

    /// Ensures the text view's frame is tall enough to contain all laid-out
    /// content. Without this, `NSClipView.scroll(to:)` is clamped to the
    /// document view's bounds — if the frame only matches the visible height,
    /// no scrolling is possible and every heading jump lands at the top.
    func fitFrameToContent() {
        guard let layoutManager, let textContainer else { return }
        layoutManager.ensureLayout(for: textContainer)
        let usedRect = layoutManager.usedRect(for: textContainer)
        let requiredHeight = usedRect.height + textContainerInset.height * 2
        let minHeight = enclosingScrollView?.contentSize.height ?? bounds.height
        let targetHeight = max(requiredHeight, minHeight)
        if abs(frame.height - targetHeight) > 0.5 {
            setFrameSize(NSSize(width: frame.width, height: targetHeight))
        }
    }

    /// Character ranges of every Markdown heading line (`#`…`######`), in
    /// document order, skipping fenced code blocks. The N-th element is the
    /// scroll target for outline row N. Static + pure so it can be unit-tested.
    static func headingLineRanges(in string: NSString) -> [NSRange] {
        var ranges: [NSRange] = []
        var inCodeBlock = false
        string.enumerateSubstrings(in: NSRange(location: 0, length: string.length), options: [.byLines]) { sub, range, _, _ in
            let trimmed = (sub ?? "").trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("```") || trimmed.hasPrefix("~~~") {
                inCodeBlock.toggle()
                return
            }
            if inCodeBlock { return }
            if trimmed.range(of: #"^#{1,6}\s+\S"#, options: .regularExpression) != nil {
                ranges.append(range)
            }
        }
        return ranges
    }

    @objc private func handleScrollToHeading(_ notification: Notification) {
        guard let index = notification.userInfo?["index"] as? Int,
              let storage = textStorage,
              let layoutManager = layoutManager,
              let textContainer = textContainer else { return }

        let ranges = Self.headingLineRanges(in: storage.string as NSString)
        guard index >= 0, index < ranges.count else { return }
        let target = ranges[index]

        // Grow the text view to fit all content, then force layout so the
        // heading's rect is valid before we measure it.
        fitFrameToContent()
        layoutManager.ensureLayout(for: textContainer)

        // Heading rect in the text view's coordinate space.
        let glyphRange = layoutManager.glyphRange(forCharacterRange: target, actualCharacterRange: nil)
        var rect = layoutManager.boundingRect(forGlyphRange: glyphRange, in: textContainer)
        rect.origin.x += textContainerOrigin.x
        rect.origin.y += textContainerOrigin.y

        // Bias the heading toward the TOP of the viewport: reveal a viewport-tall
        // region starting just above it. scrollToVisible top-aligns an oversized
        // rect and clamps at the document edges on its own, so this works
        // regardless of clip-view flippedness (the manual clip math did not).
        let viewportHeight = enclosingScrollView?.contentView.bounds.height ?? rect.height
        let topMargin: CGFloat = 12
        let revealRect = NSRect(x: rect.minX,
                                y: max(0, rect.minY - topMargin),
                                width: max(1, rect.width),
                                height: max(rect.height, viewportHeight))
        scrollToVisible(revealRect)
    }

    // MARK: - First responder

    override var acceptsFirstResponder: Bool { true }

    override func becomeFirstResponder() -> Bool {
        let result = super.becomeFirstResponder()
        if result { restyle() }
        return result
    }

    /// Check if this text view is currently the window's first responder.
    func isFirstResponder() -> Bool {
        return window?.firstResponder == self
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        Diag.log("viewDidMoveToWindow window=\(window != nil) frame=\(frame) isEditable=\(isEditable)")
        if window != nil { restyle() }
    }

    private func rebuildEngine() {
        let style = WysiwygEngine.makeStyle(fontSize: fontSize, lineHeight: lineHeight)
        engine = WysiwygEngine(style: style)
        engineFontSize = fontSize
        engineLineHeight = lineHeight
        engineBuildCount += 1
        typingAttributes = style.baseParagraph
    }

    func rebuildEngineAndRestyle() {
        rebuildEngine()
        restyle()
    }

    /// Rebuild the styling engine + restyle only when the font size or line
    /// height actually changed. Called from `updateNSView`, which SwiftUI may
    /// invoke many times for reasons unrelated to editor styling.
    func rebuildEngineAndRestyleIfNeeded() {
        if engine == nil || engineFontSize != fontSize || engineLineHeight != lineHeight {
            rebuildEngineAndRestyle()
        }
    }

    // MARK: - Text changes

    override func didChangeText() {
        super.didChangeText()
        if isRestyling { return }
        Diag.log("didChangeText string='\(string.prefix(30))'")
        restyle()
        onTextChange?(markdownString())
    }

    /// Request a restyle that is coalesced to at most once per runloop turn.
    /// Used by asynchronous triggers (remote image loads) that can fire in
    /// rapid bursts while the user is scrolling. Without coalescing, each event
    /// would run a full O(document) restyle on the main thread → beachball.
    func setNeedsRestyle() {
        if restyleScheduled { return }
        restyleScheduled = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.restyleScheduled = false
            self.restyle()
        }
    }

    func restyle() {
        if isRestyling { return }
        guard let storage = textStorage else { return }
        isRestyling = true
        restyleCount += 1
        defer { isRestyling = false }

        let selected = selectedRange()
        let rawMarkdown = markdownString()
        if rawMarkdown != storage.string {
            // Replace storage with raw markdown. Do NOT restore the cursor
            // here — the character offsets have changed (image attachments ↔
            // markdown syntax), so selected.location is in the wrong
            // coordinate system. We restore it AFTER applyStyle, when the
            // storage is back to the same state (text + attachments).
            storage.setAttributedString(NSAttributedString(string: rawMarkdown))
        }

        engine?.applyStyle(to: storage, cursorLocation: selected.location)

        // Restore the cursor. After applyStyle the storage has the same
        // character count as before (images are back as 1-char attachments),
        // so the original offset is valid again.
        setSelectedRange(NSRange(location: min(selected.location, storage.length), length: 0))
    }

    @objc private func handleImageDidLoad() {
        setNeedsRestyle()
    }

    @objc private func handleAnimatedImageFrameDidChange(_ notification: Notification) {
        guard let animatedAttachment = notification.object as? ImageTextAttachment,
              let storage = textStorage,
              let layoutManager = layoutManager,
              let textContainer = textContainer else {
            return
        }
        // Redraw only the rect occupied by the animated attachment, and only if
        // it is currently on-screen. Avoids invalidating the entire text view /
        // scroll content on every GIF frame, which would compete with scrolling.
        storage.enumerateAttribute(.attachment, in: NSRange(location: 0, length: storage.length)) { value, range, stop in
            guard let attachment = value as? ImageTextAttachment, attachment === animatedAttachment else { return }
            let glyphRange = layoutManager.glyphRange(forCharacterRange: range, actualCharacterRange: nil)
            var rect = layoutManager.boundingRect(forGlyphRange: glyphRange, in: textContainer)
            rect.origin.x += textContainerInset.width
            rect.origin.y += textContainerInset.height
            if rect.intersects(visibleRect) {
                setNeedsDisplay(rect)
            }
            stop.pointee = true
        }
    }

    private func markdownString() -> String {
        guard let storage = textStorage else { return string }
        let result = NSMutableString(string: storage.string)
        var replacements: [(range: NSRange, markdown: String)] = []

        storage.enumerateAttribute(.attachment, in: NSRange(location: 0, length: storage.length)) { value, range, _ in
            guard let attachment = value as? ImageTextAttachment else { return }
            replacements.append((range, attachment.markdownSource))
        }

        for replacement in replacements.reversed() {
            result.replaceCharacters(in: replacement.range, with: replacement.markdown)
        }

        return result as String
    }

    // MARK: - Mouse / cursor tracking

    override func mouseDown(with event: NSEvent) {
        Diag.log("mouseDown isEditable=\(isEditable) frame=\(frame) bounds=\(bounds)")
        if let window = window, window.firstResponder != self {
            let made = window.makeFirstResponder(self)
            Diag.log("makeFirstResponder result: \(made)")
        }
        super.mouseDown(with: event)
        Diag.log("after super.mouseDown selectedRange=\(selectedRange())")
        // Do NOT call restyle() here — it replaces the entire text storage
        // (converting image attachments ↔ markdown), which changes character
        // counts and corrupts the cursor position that super.mouseDown just
        // set. Marker visibility updates on the next keystroke instead.
    }

    // MARK: - Formatting commands

    @objc func toggleBold(_ sender: Any?) {
        wrapSelection(prefix: "**", suffix: "**")
    }

    @objc func toggleItalic(_ sender: Any?) {
        wrapSelection(prefix: "*", suffix: "*")
    }

    @objc func wrapSelection(prefix: String, suffix: String) {
        guard let storage = textStorage else { return }
        let range = selectedRange()
        if range.length == 0 {
            storage.insert(NSAttributedString(string: "\(prefix)\(suffix)"), at: range.location)
            setSelectedRange(NSRange(location: range.location + prefix.count, length: 0))
        } else {
            let selectedText = (storage.string as NSString).substring(with: range)
            let replacement = NSAttributedString(string: "\(prefix)\(selectedText)\(suffix)")
            storage.replaceCharacters(in: range, with: replacement)
            setSelectedRange(NSRange(location: range.location, length: replacement.length))
        }
        didChangeText()
    }

    @objc func insertLink() {
        wrapSelection(prefix: "[", suffix: "](url)")
    }

    @objc func toggleTodoOnCurrentLine() {
        guard let storage = textStorage else { return }
        let cursor = selectedRange().location
        let lineRange = (storage.string as NSString).lineRange(for: NSRange(location: cursor, length: 0))
        let line = (storage.string as NSString).substring(with: lineRange)

        guard let regex = try? NSRegularExpression(pattern: #"\[([ xX])\]"#) else { return }
        let nsLine = line as NSString
        guard let match = regex.firstMatch(in: line, range: NSRange(location: 0, length: nsLine.length)) else { return }

        let checkboxChar = nsLine.substring(with: match.range(at: 1))
        let newChar = (checkboxChar == " ") ? "x" : " "
        let absRange = NSRange(location: lineRange.location + match.range(at: 1).location, length: 1)
        storage.replaceCharacters(in: absRange, with: newChar)
        didChangeText()
    }
}
