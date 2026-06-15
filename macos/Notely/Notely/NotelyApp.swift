import SwiftUI

@main
struct NotelyApp: App {
    @State private var appModel = AppModel()
    @State private var store = FileNoteStore()

    var body: some Scene {
        WindowGroup {
            AppShellView()
                .environment(appModel)
                .environment(store)
        }
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(after: .newItem) {
                Button("New Note") {
                    let note = store.createNote()
                    appModel.selectedNoteId = note?.id
                    appModel.sidebarSelection = .allNotes
                }
                .keyboardShortcut("n", modifiers: .command)

                Button("Open Folder…") {
                    openFolderPanel()
                }
                .keyboardShortcut("o", modifiers: .command)
            }

            CommandMenu("Format") {
                Button("Bold") {
                    NotificationCenter.default.post(name: .formatBold, object: nil)
                }
                .keyboardShortcut("b", modifiers: .command)

                Button("Italic") {
                    NotificationCenter.default.post(name: .formatItalic, object: nil)
                }
                .keyboardShortcut("i", modifiers: .command)

                Button("Insert Link") {
                    NotificationCenter.default.post(name: .formatLink, object: nil)
                }
                .keyboardShortcut("k", modifiers: .command)

                Button("Toggle Todo") {
                    NotificationCenter.default.post(name: .toggleTodo, object: nil)
                }
                .keyboardShortcut("t", modifiers: [.command, .shift])
            }
        }
    }

    private func openFolderPanel() {
        let panel = NSOpenPanel()
        panel.title = "Open Notes Folder"
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = "Open"

        guard panel.runModal() == .OK, let url = panel.url else { return }
        store.openWorkspace(at: url)
        appModel.selectedNoteId = nil
        appModel.sidebarSelection = .allNotes
    }
}

extension Notification.Name {
    static let newNote = Notification.Name("notely.newNote")
    static let formatBold = Notification.Name("notely.formatBold")
    static let formatItalic = Notification.Name("notely.formatItalic")
    static let formatLink = Notification.Name("notely.formatLink")
    static let toggleTodo = Notification.Name("notely.toggleTodo")
    static let focusNoteSearch = Notification.Name("notely.focusNoteSearch")
}
