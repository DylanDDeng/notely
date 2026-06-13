import SwiftUI

@main
struct NotelyApp: App {
    @State private var appModel = AppModel()
    @State private var dataController: DataController

    init() {
        do {
            _dataController = State(initialValue: try DataController())
        } catch {
            fatalError("Failed to initialize data controller: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            AppShellView()
                .environment(appModel)
                .environment(dataController)
                .modelContainer(dataController.container)
        }
        .commands {
            CommandGroup(after: .newItem) {
                Button("New Note") {
                    let note = dataController.createNote()
                    appModel.selectedNoteId = note.id
                    appModel.sidebarSelection = .allNotes
                }
                .keyboardShortcut("n", modifiers: .command)
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
}

// MARK: - Notification names

extension Notification.Name {
    static let newNote = Notification.Name("notely.newNote")
    static let formatBold = Notification.Name("notely.formatBold")
    static let formatItalic = Notification.Name("notely.formatItalic")
    static let formatLink = Notification.Name("notely.formatLink")
    static let toggleTodo = Notification.Name("notely.toggleTodo")
}
