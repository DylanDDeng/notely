import SwiftUI

/// Root three-column layout: Sidebar | Note List | Editor.
struct AppShellView: View {
    var body: some View {
        NavigationSplitView {
            SidebarView()
                .navigationSplitViewColumnWidth(min: 220, ideal: 220, max: 220)
        } content: {
            NoteListView()
                .navigationSplitViewColumnWidth(min: 320, ideal: 320, max: 320)
        } detail: {
            EditorContainerView()
                .navigationSplitViewColumnWidth(min: 720, ideal: 900)
        }
        .navigationSplitViewStyle(.balanced)
        .frame(minWidth: 1040, minHeight: 700)
        .background(Color.appBg)
    }
}
