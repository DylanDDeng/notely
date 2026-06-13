import SwiftUI
import SwiftData

/// The editor column: Markdown body + status bar.
/// Uses the WYSIWYG text view with marker hiding.
struct EditorView: View {
    let note: NoteModel
    @Environment(DataController.self) var dataController
    @State private var displayedText: String = ""
    @State private var liveWordCount: Int = 0
    @State private var liveCharCount: Int = 0
    @State private var saveTask: Task<Void, Never>? = nil

    private var fontSize: CGFloat { CGFloat(AppSettings.editorFontSize) }
    private var lineHeight: CGFloat { CGFloat(AppSettings.editorLineHeight) }

    var body: some View {
        VStack(spacing: 0) {
            // The editor. Using .id(note.id) ensures a fresh NSTextView is
            // created when switching notes, but NOT on every keystroke.
            WysiwygEditor(
                initialText: displayedText,
                fontSize: fontSize,
                lineHeight: lineHeight,
                onTextChange: handleTextChange
            )
            .id(note.id)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.horizontal, 48)
            .padding(.top, 48)
            .background(Color.editorBg)

            Divider()

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
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        liveWordCount = trimmed.isEmpty ? 0 : trimmed.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.count
        liveCharCount = text.count
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
            Text("\(wordCount) words")
                .font(.system(size: 11))
                .foregroundColor(.secondaryText)

            Text("\(charCount) characters")
                .font(.system(size: 11))
                .foregroundColor(.secondaryText)

            Spacer()

            if !note.tags.isEmpty {
                HStack(spacing: 4) {
                    ForEach(note.tags.prefix(3), id: \.self) { tag in
                        Text("#\(tag)")
                            .font(.system(size: 10))
                            .foregroundColor(.accent)
                    }
                }
            }

            Text("Edited \(note.updatedAt.formatted(.relative(presentation: .named)))")
                .font(.system(size: 11))
                .foregroundColor(.secondaryText)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color.sidebarBg.opacity(0.3))
    }
}
