import SwiftUI

struct AppShellView: View {
    @Environment(AppModel.self) var appModel
    @Environment(FileNoteStore.self) var store
    @AppStorage("notely.editorWidth") private var editorWidth: String = "medium"

    /// Minimum width for the editor detail column: the capped text column plus
    /// its side insets. Enforced as the detail column's min and folded into the
    /// window min width so the text column never reflows when the sidebar
    /// collapses/expands — the pane stays at or above the cap engagement point.
    private var detailMinWidth: CGFloat {
        WysiwygTextView.columnWidth(for: editorWidth) + WysiwygTextView.minSideInset * 2
    }

    var body: some View {
        if !store.isOpen {
            FolderOpenView()
        } else {
            NavigationSplitView {
                SidebarView()
                    .navigationSplitViewColumnWidth(min: 220, ideal: 220, max: 220)
            } content: {
                if appModel.showSettings {
                    SettingsTabBar()
                } else {
                    NoteListView()
                }
            } detail: {
                if appModel.showSettings {
                    SettingsContent()
                } else {
                    EditorContainerView()
                        .navigationSplitViewColumnWidth(min: detailMinWidth, ideal: detailMinWidth, max: .infinity)
                }
            }
            .navigationSplitViewStyle(.balanced)
            .frame(minWidth: CGFloat(220) + 300 + detailMinWidth, minHeight: 700)
            .background(Color.appBg)
        }
    }
}
