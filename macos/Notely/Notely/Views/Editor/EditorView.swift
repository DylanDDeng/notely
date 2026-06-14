import SwiftUI

struct EditorView: View {
    let note: FileNote
    @Environment(FileNoteStore.self) var store
    @State private var displayedText: String
    @State private var liveWordCount: Int
    @State private var liveCharCount: Int
    @State private var saveTask: Task<Void, Never>? = nil
    @State private var showsInspector = false

    private var fontSize: CGFloat { CGFloat(AppSettings.editorFontSize) }
    private var lineHeight: CGFloat { CGFloat(AppSettings.editorLineHeight) }

    /// Outline derived from the live text. Uses the exact same heading detection
    /// as `WysiwygTextView.headingLineRanges`, so a row's `index` always maps to
    /// the correct heading when the rail posts `.scrollToHeading`.
    private var outlineHeadings: [OutlineHeading] {
        let ns = displayedText as NSString
        return WysiwygTextView.headingLineRanges(in: ns).enumerated().map { i, range in
            let line = ns.substring(with: range).trimmingCharacters(in: .whitespaces)
            let level = line.prefix(while: { $0 == "#" }).count
            let text = line.dropFirst(level).trimmingCharacters(in: .whitespaces)
            return OutlineHeading(index: i, level: level, text: String(text))
        }
    }

    init(note: FileNote) {
        self.note = note
        let initialText = note.content
        _displayedText = State(initialValue: initialText)
        _liveWordCount = State(initialValue: Self.wordCount(in: initialText))
        _liveCharCount = State(initialValue: initialText.count)
    }

    var body: some View {
        VStack(spacing: 0) {
            EditorToolbar(note: note, wordCount: liveWordCount, charCount: liveCharCount, showsInspector: $showsInspector)

            ZStack(alignment: .trailing) {
                WysiwygEditor(
                    initialText: displayedText,
                    fontSize: fontSize,
                    lineHeight: lineHeight,
                    onTextChange: handleTextChange
                )
                .frame(maxWidth: .infinity)
                .padding(.top, 40)
                .padding(.bottom, 24)
                .background(Color.editorBg)

                // Navigation lives at the right edge: a thin tick rail that
                // expands to a clickable outline on hover. It never covers the
                // centered text and is independent of the info popover.
                OutlineRail(headings: outlineHeadings)
            }

            Rectangle()
                .fill(Color.borderColor)
                .frame(height: 1)

            StatusBarView(note: note, wordCount: liveWordCount, charCount: liveCharCount)
        }
        .background(Color.editorBg)
        .onAppear {
            loadNote()
        }
        .onChange(of: note.id) { _, _ in
            loadNote()
        }
        .onReceive(NotificationCenter.default.publisher(for: .formatBold)) { _ in
            notifyEditor(#selector(WysiwygTextView.toggleBold(_:)))
        }
        .onReceive(NotificationCenter.default.publisher(for: .formatItalic)) { _ in
            notifyEditor(#selector(WysiwygTextView.toggleItalic(_:)))
        }
        .onReceive(NotificationCenter.default.publisher(for: .formatLink)) { _ in
            notifyEditor(#selector(WysiwygTextView.insertLink))
        }
        .onReceive(NotificationCenter.default.publisher(for: .toggleTodo)) { _ in
            notifyEditor(#selector(WysiwygTextView.toggleTodoOnCurrentLine))
        }
    }

    private func loadNote() {
        saveTask?.cancel()
        ImageLoader.shared.setBaseURL(note.url.deletingLastPathComponent())
        displayedText = note.content
        updateCounts(from: note.content)
    }

    private func handleTextChange(_ newText: String) {
        displayedText = newText
        updateCounts(from: newText)
        scheduleSave(newText)
    }

    private func updateCounts(from text: String) {
        liveWordCount = Self.wordCount(in: text)
        liveCharCount = text.count
    }

    private static func wordCount(in text: String) -> Int {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? 0 : trimmed.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.count
    }

    private func scheduleSave(_ content: String) {
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }
            store.saveContent(content, to: note.id)
        }
    }

    private func notifyEditor(_ selector: Selector) {
        NSApp.sendAction(selector, to: nil, from: nil)
    }
}

/// Bottom status bar: word count, character count, last updated time, tags.
struct StatusBarView: View {
    let note: FileNote
    let wordCount: Int
    let charCount: Int

    var body: some View {
        HStack(spacing: 16) {
            Text("\(wordCount) words · \(charCount) characters")
                .font(.notely(11))
                .foregroundColor(.tertiaryText)

            Spacer()

            if !note.tags.isEmpty {
                HStack(spacing: 6) {
                    ForEach(note.tags.prefix(3), id: \.self) { tag in
                        Text("#\(tag)")
                            .font(.notely(11, weight: .medium))
                            .foregroundColor(.accent)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.accent.opacity(0.08)))
                    }
                }
            }

            Text("Edited \(note.updatedAt.formatted(.relative(presentation: .named)))")
                .font(.notely(11))
                .foregroundColor(.tertiaryText)
        }
        .frame(height: 28)
        .padding(.horizontal, 20)
        .background(Color.editorBg)
    }
}

/// Top toolbar for the editor: sidebar toggle on left, actions on right.
struct EditorToolbar: View {
    let note: FileNote
    let wordCount: Int
    let charCount: Int
    @Binding var showsInspector: Bool
    @Environment(FileNoteStore.self) var store

    var body: some View {
        HStack {
            Spacer()

            HStack(spacing: 2) {
                ToolbarIconButton(systemName: "info.circle", isSelected: showsInspector) {
                    showsInspector.toggle()
                }
                .popover(isPresented: $showsInspector, arrowEdge: .bottom) {
                    DocumentInfoPopover(note: note, wordCount: wordCount, charCount: charCount)
                }

                ToolbarIconButton(systemName: "square.and.arrow.down") {
                    MarkdownExporter.export(note: note, store: store)
                }

                ToolbarIconButton(systemName: "ellipsis") {
                    // More options
                }
            }
        }
        .padding(.horizontal, 20)
        .frame(height: 40)
        .background(Color.editorBg)
    }
}

struct ToolbarIconButton: View {
    let systemName: String
    var isSelected = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(isSelected ? .accent : .secondaryText)
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(isSelected ? Color.accentHover : Color.clear)
                )
        }
        .buttonStyle(.plain)
    }
}

/// A heading in the document outline. `index` is the heading's ordinal in
/// document order, which is the payload used to scroll the editor.
struct OutlineHeading: Identifiable {
    let index: Int
    let level: Int
    let text: String
    var id: Int { index }
}

/// Lightweight, glanceable document info shown in a popover anchored to the
/// toolbar info button — stats and tags only (navigation lives in the rail).
struct DocumentInfoPopover: View {
    let note: FileNote
    let wordCount: Int
    let charCount: Int

    private var readingTime: String {
        let minutes = max(1, wordCount / 200)
        return "\(minutes) min"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(spacing: 8) {
                InspectorStatRow(label: "Words", value: "\(wordCount)")
                InspectorStatRow(label: "Characters", value: "\(charCount)")
                InspectorStatRow(label: "Reading time", value: readingTime)
                InspectorStatRow(label: "Created", value: note.createdAt.formatted(.dateTime.month().day().year()))
                InspectorStatRow(label: "Updated", value: note.updatedAt.formatted(.relative(presentation: .named)))
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 14)

            if !note.tags.isEmpty {
                InspectorDivider().padding(.horizontal, 0)
                VStack(alignment: .leading, spacing: 8) {
                    Text("Tags")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.tertiaryText)
                        .tracking(0.4)
                        .textCase(.uppercase)
                    FlowLayout(spacing: 6) {
                        ForEach(note.tags, id: \.self) { tag in
                            Text("#\(tag)")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.accent)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Capsule().fill(Color.accent.opacity(0.08)))
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
        }
        .frame(width: 240)
    }
}

/// Right-edge navigation: a thin column of tick marks (one per heading) that
/// expands on hover into a clickable outline. Clicking a row scrolls the editor
/// to that heading via the `.scrollToHeading` notification.
struct OutlineRail: View {
    let headings: [OutlineHeading]
    @State private var hovering = false

    var body: some View {
        if headings.isEmpty {
            Color.clear.frame(width: 0)
        } else {
            content
                .onHover { hovering = $0 }
                .animation(.easeInOut(duration: 0.15), value: hovering)
                .padding(.trailing, 18)
                .padding(.vertical, 16)
        }
    }

    @ViewBuilder private var content: some View {
        if hovering {
            expandedList
        } else {
            ticks
        }
    }

    private var ticks: some View {
        VStack(alignment: .trailing, spacing: 7) {
            ForEach(headings) { h in
                Capsule()
                    .fill(Color.tertiaryText.opacity(0.45))
                    .frame(width: tickWidth(h.level), height: 2)
            }
        }
        .padding(.horizontal, 6)
        .contentShape(Rectangle())
    }

    private func tickWidth(_ level: Int) -> CGFloat {
        switch level {
        case 1: return 18
        case 2: return 13
        default: return 9
        }
    }

    private var expandedList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 2) {
                Text("Outline")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.tertiaryText)
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .padding(.bottom, 4)

                ForEach(headings) { h in
                    Button {
                        NotificationCenter.default.post(
                            name: .scrollToHeading, object: nil, userInfo: ["index": h.index]
                        )
                    } label: {
                        Text(h.text)
                            .font(.system(size: 12.5, weight: h.level == 1 ? .medium : .regular))
                            .foregroundColor(h.level == 1 ? .primaryText : .secondaryText)
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 3)
                            .padding(.leading, CGFloat(max(0, h.level - 1)) * 12)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(14)
        }
        .frame(width: 230)
        .frame(maxHeight: 420)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.borderColor, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.10), radius: 12, x: -3, y: 2)
    }
}

struct InspectorStatRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 13))
                .foregroundColor(.secondaryText)
            Spacer()
            Text(value)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.primaryText)
                .lineLimit(1)
        }
    }
}

struct InspectorDivider: View {
    var body: some View {
        Rectangle()
            .fill(Color.primaryText.opacity(0.06))
            .frame(height: 1)
            .padding(.horizontal, 20)
    }
}

/// Simple flow layout for wrapping tag pills.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var totalHeight: CGFloat = 0
        var totalWidth: CGFloat = 0
        var lineWidth: CGFloat = 0
        var lineHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if lineWidth + size.width > maxWidth && lineWidth > 0 {
                totalWidth = max(totalWidth, lineWidth)
                totalHeight += lineHeight + spacing
                lineWidth = size.width + spacing
                lineHeight = size.height
            } else {
                lineWidth += size.width + spacing
                lineHeight = max(lineHeight, size.height)
            }
        }
        totalWidth = max(totalWidth, lineWidth)
        totalHeight += lineHeight
        return CGSize(width: totalWidth, height: totalHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x: CGFloat = bounds.minX
        var y: CGFloat = bounds.minY
        var lineHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX && x > bounds.minX {
                x = bounds.minX
                y += lineHeight + spacing
                lineHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: .init(size))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}
