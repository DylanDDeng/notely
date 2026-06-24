import SwiftUI

struct AppShellView: View {
    @Environment(AppModel.self) var appModel
    @Environment(FileNoteStore.self) var store
    @AppStorage("notely.editorWidth") private var editorWidth: String = "medium"

    /// Owns sidebar visibility so the toggle is driven by an explicit
    /// `withAnimation` state change instead of the system sidebarToggle's
    /// internal animation state machine — which briefly flashes a stray ">"
    /// button in the top-right corner mid-transition (most visible on expand).
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

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
            NavigationSplitView(columnVisibility: $columnVisibility) {
                SidebarView(columnVisibility: $columnVisibility)
                    .navigationSplitViewColumnWidth(min: 220, ideal: 220, max: 220)
                    .toolbar(removing: .sidebarToggle)
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
