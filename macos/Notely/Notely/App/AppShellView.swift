import SwiftUI

struct AppShellView: View {
    @Environment(AppModel.self) var appModel
    @Environment(FileNoteStore.self) var store

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
                }
            }
            .navigationSplitViewStyle(.balanced)
            .frame(minWidth: 1040, minHeight: 700)
            .background(Color.appBg)
        }
    }
}
