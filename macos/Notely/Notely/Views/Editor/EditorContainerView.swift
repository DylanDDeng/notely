import SwiftUI
import SwiftData

/// Right column: wraps the editor or shows empty state.
struct EditorContainerView: View {
    @Environment(AppModel.self) var appModel
    @Environment(DataController.self) var dataController

    var body: some View {
        Group {
            if let noteId = appModel.selectedNoteId,
               let note = dataController.fetchNote(byId: noteId) {
                EditorView(note: note)
            } else {
                EmptyEditorView()
            }
        }
        .background(Color.editorBg)
        .onAppear {
            Diag.log("EditorContainer onAppear: selectedNoteId=\(String(describing: appModel.selectedNoteId))")
        }
        .onChange(of: appModel.selectedNoteId) { _, newId in
            Diag.log("EditorContainer onChange selectedNoteId=\(String(describing: newId))")
        }
    }
}

/// Shown when no note is selected.
struct EmptyEditorView: View {
    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(Color.accent.opacity(0.08))
                    .frame(width: 84, height: 84)
                Image(systemName: "note.text.badge.plus")
                    .font(.system(size: 34, weight: .light))
                    .foregroundColor(.accent)
            }

            VStack(spacing: 6) {
                Text("Select a note or create a new one")
                    .font(.notely(17, weight: .semibold))
                    .foregroundColor(.primaryText)
                Text("Your calm writing space will appear here.")
                    .font(.notely(13))
                    .foregroundColor(.tertiaryText)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.editorBg)
    }
}
