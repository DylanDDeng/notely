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
        VStack(spacing: 16) {
            Image(systemName: "note.text.badge.plus")
                .font(.system(size: 50, weight: .ultraLight))
                .foregroundColor(.secondaryText.opacity(0.4))

            Text("Select a note or create a new one")
                .font(.system(size: 14))
                .foregroundColor(.secondaryText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.editorBg)
    }
}
