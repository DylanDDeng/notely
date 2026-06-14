import SwiftUI
import SwiftData

/// The editor column: Markdown body + status bar.
/// Uses the WYSIWYG text view with marker hiding.
struct EditorView: View {
    let note: NoteModel
    @Environment(DataController.self) var dataController
    @State private var displayedText: String
    @State private var liveWordCount: Int
    @State private var liveCharCount: Int
    @State private var saveTask: Task<Void, Never>? = nil
    @State private var showsInspector = false

    private var fontSize: CGFloat { CGFloat(AppSettings.editorFontSize) }
    private var lineHeight: CGFloat { CGFloat(AppSettings.editorLineHeight) }

    init(note: NoteModel) {
        self.note = note
        let initialText = note.content
        _displayedText = State(initialValue: initialText)
        _liveWordCount = State(initialValue: Self.wordCount(in: initialText))
        _liveCharCount = State(initialValue: initialText.count)
    }

    var body: some View {
        VStack(spacing: 0) {
            EditorToolbar(note: note, showsInspector: $showsInspector)

            HStack(spacing: 0) {
                WysiwygEditor(
                    initialText: displayedText,
                    fontSize: fontSize,
                    lineHeight: lineHeight,
                    onTextChange: handleTextChange
                )
                .id(note.id)
                .frame(maxWidth: 720)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 90)
                .padding(.top, 40)
                .padding(.bottom, 24)
                .background(Color.editorBg)

                if showsInspector {
                    InspectorPanel(note: note, wordCount: liveWordCount, charCount: liveCharCount)
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                }
            }
            .animation(.easeInOut(duration: 0.18), value: showsInspector)

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
        displayedText = note.content
        updateCounts(from: note.content)
    }

    /// Called by the text view on every keystroke.
    /// Updates counts locally and schedules a debounced save.
    private func handleTextChange(_ newText: String) {
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
            dataController.updateNote(note, content: content)
        }
    }

    private func notifyEditor(_ selector: Selector) {
        NSApp.sendAction(selector, to: nil, from: nil)
    }
}

/// Bottom status bar: word count, character count, last updated time, tags.
struct StatusBarView: View {
    let note: NoteModel
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
    let note: NoteModel
    @Binding var showsInspector: Bool
    @Environment(DataController.self) var dataController

    var body: some View {
        HStack {
            ToolbarIconButton(systemName: "sidebar.left") {
                NSApp.sendAction(Selector(("toggleSidebar:")), to: nil, from: nil)
            }

            Spacer()

            HStack(spacing: 2) {
                ToolbarIconButton(systemName: "info.circle", isSelected: showsInspector) {
                    showsInspector.toggle()
                }

                ToolbarIconButton(systemName: "square.and.arrow.down") {
                    MarkdownExporter.export(note: note)
                }

                ToolbarIconButton(systemName: "ellipsis") {
                    // More options
                }
            }
        }
        .padding(.horizontal, 20)
        .frame(height: 48)
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

struct InspectorPanel: View {
    let note: NoteModel
    let wordCount: Int
    let charCount: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Inspector")
                .font(.notely(15, weight: .semibold))
                .foregroundColor(.primaryText)

            InspectorSection(title: "Document") {
                InspectorRow(label: "Words", value: "\(wordCount)")
                InspectorRow(label: "Characters", value: "\(charCount)")
                InspectorRow(label: "Updated", value: note.updatedAt.formatted(date: .abbreviated, time: .shortened))
            }

            InspectorSection(title: "Tags") {
                if note.tags.isEmpty {
                    Text("No tags")
                        .font(.notely(12))
                        .foregroundColor(.tertiaryText)
                } else {
                    FlowTags(tags: note.tags)
                }
            }

            Spacer()
        }
        .padding(20)
        .frame(width: 260)
        .frame(maxHeight: .infinity, alignment: .topLeading)
        .background(Color.noteListBg)
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(Color.borderColor)
                .frame(width: 1)
        }
    }
}

struct InspectorSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.notely(12, weight: .semibold))
                .foregroundColor(.tertiaryText)
            content
        }
    }
}

struct InspectorRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .font(.notely(12))
                .foregroundColor(.secondaryText)
            Spacer()
            Text(value)
                .font(.notely(12, weight: .medium))
                .foregroundColor(.primaryText)
                .lineLimit(1)
        }
    }
}

struct FlowTags: View {
    let tags: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(tags, id: \.self) { tag in
                Text("#\(tag)")
                    .font(.notely(11, weight: .medium))
                    .foregroundColor(.accent)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(Color.accent.opacity(0.08)))
            }
        }
    }
}
