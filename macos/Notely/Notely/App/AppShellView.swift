import SwiftUI

/// Root three-column layout: Sidebar | Note List | Editor.
struct AppShellView: View {
    var body: some View {
        NavigationSplitView {
            SidebarView()
                .navigationSplitViewColumnWidth(min: 180, ideal: 220, max: 280)
        } content: {
            NoteListView()
                .navigationSplitViewColumnWidth(min: 260, ideal: 320, max: 420)
        } detail: {
            EditorContainerView()
                .navigationSplitViewColumnWidth(min: 420, ideal: 700)
        }
        .navigationSplitViewStyle(.balanced)
        .frame(minWidth: 900, minHeight: 600)
    }
}
