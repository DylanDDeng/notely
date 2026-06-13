import SwiftUI
import SwiftData

/// Left column: navigation items (All Notes, Untagged, Trash) and tag tree.
struct SidebarView: View {
    @Environment(AppModel.self) var appModel
    @Environment(DataController.self) var dataController
    @Query(filter: #Predicate<NoteModel> { $0.trashed == false })
    private var activeNotes: [NoteModel]

    private var tagTree: [TagNode] {
        let allTags = activeNotes.flatMap { $0.tags }
        return TagTreeBuilder.build(from: allTags)
    }

    private var untaggedCount: Int {
        activeNotes.filter { $0.tags.isEmpty }.count
    }

    private var trashCount: Int {
        dataController.fetchAllNotes(includeTrashed: true).filter { $0.trashed }.count
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 2) {
                // Navigation items
                SidebarNavItem(
                    icon: "tray.full",
                    title: "All Notes",
                    count: activeNotes.count,
                    isSelected: appModel.sidebarSelection == .allNotes
                ) {
                    appModel.sidebarSelection = .allNotes
                }

                SidebarNavItem(
                    icon: "number",
                    title: "Untagged",
                    count: untaggedCount,
                    isSelected: appModel.sidebarSelection == .untagged
                ) {
                    appModel.sidebarSelection = .untagged
                }

                SidebarNavItem(
                    icon: "trash",
                    title: "Trash",
                    count: trashCount,
                    isSelected: appModel.sidebarSelection == .trash
                ) {
                    appModel.sidebarSelection = .trash
                }

                Divider()
                    .padding(.vertical, 8)

                // Tag tree
                if !tagTree.isEmpty {
                    Text("Tags")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.secondaryText)
                        .textCase(.uppercase)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 4)

                    ForEach(tagTree) { node in
                        TagTreeRow(node: node)
                            .transition(.opacity.combined(with: .move(edge: .leading)))
                    }
                }

                Spacer(minLength: 16)
            }
            .padding(.vertical, 8)
        }
        .background(Color.sidebarBg)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    let note = dataController.createNote()
                    Diag.log("Sidebar + button: created note id=\(note.id)")
                    appModel.selectedNoteId = note.id
                    appModel.sidebarSelection = .allNotes
                    Diag.log("Sidebar + button: set selectedNoteId=\(String(describing: appModel.selectedNoteId))")
                } label: {
                    Image(systemName: "square.and.pencil")
                        .font(.system(size: 14))
                }
                .help("New Note")
                .keyboardShortcut("n", modifiers: .command)
            }
        }
    }
}

/// A single navigation item in the sidebar (All Notes, Untagged, Trash).
struct SidebarNavItem: View {
    let icon: String
    let title: String
    let count: Int
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 13))
                    .frame(width: 18)
                    .foregroundColor(isSelected ? .accent : .secondaryText)

                Text(title)
                    .font(.system(size: 13))
                    .foregroundColor(isSelected ? .accent : .primaryText)

                Spacer()

                if count > 0 {
                    Text("\(count)")
                        .font(.system(size: 11))
                        .foregroundColor(.secondaryText)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(isSelected ? Color.accent.opacity(0.12) : Color.clear)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 8)
    }
}

/// A row in the tag tree, supporting nested children.
struct TagTreeRow: View {
    let node: TagNode
    @Environment(AppModel.self) var appModel
    @State private var isExpanded = true

    private var isSelected: Bool {
        if case .tag(let path) = appModel.sidebarSelection {
            return path == node.id
        }
        return false
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                appModel.sidebarSelection = .tag(node.id)
            } label: {
                HStack(spacing: 4) {
                    if !node.children.isEmpty {
                        Button {
                            withAnimation(.easeInOut(duration: 0.15)) {
                                isExpanded.toggle()
                            }
                        } label: {
                            Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(.secondaryText)
                                .frame(width: 12)
                        }
                        .buttonStyle(.plain)
                    } else {
                        Image(systemName: "number")
                            .font(.system(size: 11))
                            .foregroundColor(.secondaryText)
                            .frame(width: 12)
                    }

                    Text(node.name)
                        .font(.system(size: 13))
                        .foregroundColor(isSelected ? .accent : .primaryText)

                    Spacer()

                    Text("\(node.totalCount)")
                        .font(.system(size: 11))
                        .foregroundColor(.secondaryText)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(isSelected ? Color.accent.opacity(0.12) : Color.clear)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.leading, CGFloat(node.level) * 16)

            if isExpanded && !node.children.isEmpty {
                ForEach(node.children) { child in
                    TagTreeRow(node: child)
                }
            }
        }
        .padding(.horizontal, 8)
    }
}
