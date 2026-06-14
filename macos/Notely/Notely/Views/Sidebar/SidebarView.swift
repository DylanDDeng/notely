import SwiftUI
import SwiftData

/// Left column: Library header, navigation items, tag tree, and settings.
struct SidebarView: View {
    @Environment(AppModel.self) var appModel
    @Environment(DataController.self) var dataController
    @Query(filter: #Predicate<NoteModel> { $0.trashed == false })
    private var activeNotes: [NoteModel]

    private var tagTree: [TagNode] {
        let allTags = activeNotes.flatMap { $0.tags }
        return TagTreeBuilder.build(from: allTags)
    }

    private var todayCount: Int {
        let cal = Calendar.current
        return activeNotes.filter { cal.isDateInToday($0.updatedAt) }.count
    }

    private var untaggedCount: Int {
        activeNotes.filter { $0.tags.isEmpty }.count
    }

    private var trashCount: Int {
        dataController.fetchAllNotes(includeTrashed: true).filter { $0.trashed }.count
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Text("Library")
                            .font(.notely(13, weight: .semibold))
                            .foregroundColor(.tertiaryText)
                        Spacer()
                        Button {
                            let note = dataController.createNote()
                            appModel.selectedNoteId = note.id
                            appModel.sidebarSelection = .allNotes
                        } label: {
                            Image(systemName: "plus")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(.secondaryText)
                                .frame(width: 24, height: 24)
                        }
                        .buttonStyle(.plain)
                        .help("New Note")
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 14)
                    .padding(.bottom, 10)

                    VStack(spacing: 1) {
                        SidebarNavItem(icon: "tray.full", title: "All Notes", count: activeNotes.count, isSelected: appModel.sidebarSelection == .allNotes) {
                            appModel.sidebarSelection = .allNotes
                        }
                        SidebarNavItem(icon: "clock", title: "Today", count: todayCount, isSelected: appModel.sidebarSelection == .today) {
                            appModel.sidebarSelection = .today
                        }
                        SidebarNavItem(icon: "number", title: "Untagged", count: untaggedCount, isSelected: appModel.sidebarSelection == .untagged) {
                            appModel.sidebarSelection = .untagged
                        }
                        SidebarNavItem(icon: "trash", title: "Trash", count: trashCount, isSelected: appModel.sidebarSelection == .trash) {
                            appModel.sidebarSelection = .trash
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.bottom, 10)

                    HStack(spacing: 8) {
                        Image(systemName: "tag")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.tertiaryText)
                        Text("Tags")
                            .font(.notely(13, weight: .semibold))
                            .foregroundColor(.tertiaryText)
                        Spacer()
                    }
                    .frame(height: 40)
                    .padding(.horizontal, 18)

                    VStack(spacing: 1) {
                        if tagTree.isEmpty {
                            Text("No tags yet")
                                .font(.notely(13))
                                .foregroundColor(.tertiaryText)
                                .padding(.horizontal, 18)
                                .padding(.vertical, 8)
                        } else {
                            ForEach(tagTree) { node in
                                TagTreeRow(node: node)
                                    .transition(.opacity.combined(with: .move(edge: .leading)))
                            }
                        }
                    }
                    .padding(.horizontal, 8)

                    Spacer(minLength: 16)
                }
            }
            .scrollContentBackground(.hidden)

            Rectangle()
                .fill(Color.borderColor)
                .frame(height: 1)

            Button {
                NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "gearshape")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.secondaryText)
                        .frame(width: 18)
                    Text("Settings")
                        .font(.notely(14))
                        .foregroundColor(.primaryText)
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .frame(height: 30)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 8)
            .padding(.vertical, 8)
        }
        .background(Color.sidebarBg)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    let note = dataController.createNote()
                    appModel.selectedNoteId = note.id
                    appModel.sidebarSelection = .allNotes
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

/// A single navigation item in the sidebar.
struct SidebarNavItem: View {
    let icon: String
    let title: String
    let count: Int
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .medium))
                    .frame(width: 18)
                    .foregroundColor(isSelected ? .accent : .secondaryText)

                Text(title)
                    .font(.notely(14, weight: isSelected ? .medium : .regular))
                    .foregroundColor(isSelected ? .accent : .primaryText)

                Spacer()

                if count > 0 {
                    Text("\(count)")
                        .font(.notely(12))
                        .foregroundColor(isSelected ? .accent : .tertiaryText)
                }
            }
            .padding(.horizontal, 10)
            .frame(height: 30)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(isSelected ? Color.accentHover : Color.clear)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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
                HStack(spacing: 7) {
                    if !node.children.isEmpty {
                        Button {
                            withAnimation(.easeInOut(duration: 0.15)) {
                                isExpanded.toggle()
                            }
                        } label: {
                            Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(.tertiaryText)
                                .frame(width: 12)
                        }
                        .buttonStyle(.plain)
                    } else {
                        Text("#")
                            .font(.notely(14, weight: .medium))
                            .foregroundColor(isSelected ? .accent : .tertiaryText)
                            .frame(width: 12)
                    }

                    Text(node.name)
                        .font(.notely(14, weight: isSelected ? .medium : .regular))
                        .foregroundColor(isSelected ? .accent : .primaryText)

                    Spacer()

                    Text("\(node.totalCount)")
                        .font(.notely(12))
                        .foregroundColor(isSelected ? .accent : .tertiaryText)
                }
                .padding(.horizontal, 10)
                .frame(height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(isSelected ? Color.accentHover : Color.clear)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded && !node.children.isEmpty {
                ForEach(node.children) { child in
                    TagTreeRow(node: child)
                        .padding(.leading, 14)
                }
            }
        }
    }
}
