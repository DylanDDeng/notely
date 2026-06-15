import SwiftUI

struct SidebarView: View {
    @Environment(AppModel.self) var appModel
    @Environment(FileNoteStore.self) var store
    @State private var libraryExpanded = true
    @State private var tagsExpanded = true

    private var tagTree: [TagNode] {
        let allTags = store.notes.flatMap { $0.tags }
        return TagTreeBuilder.build(from: allTags)
    }

    private var todayCount: Int {
        let cal = Calendar.current
        return store.notes.filter { cal.isDateInToday($0.updatedAt) }.count
    }

    private var untaggedCount: Int {
        store.notes.filter { $0.tags.isEmpty }.count
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // ── Library section ──
                    HStack(spacing: 6) {
                        SidebarChevron(isExpanded: libraryExpanded) {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                libraryExpanded.toggle()
                            }
                        }
                        Text("Library")
                            .font(.notely(13, weight: .semibold))
                            .foregroundColor(.tertiaryText)
                        Spacer()
                        Button {
                            let note = store.createNote()
                            appModel.selectedNoteId = note?.id
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
                    .padding(.horizontal, 12)
                    .padding(.top, 14)
                    .padding(.bottom, libraryExpanded ? 6 : 10)

                    if libraryExpanded {
                        VStack(spacing: 1) {
                            SidebarNavItem(icon: "tray.full", title: "All Notes", count: store.notes.count, isSelected: appModel.sidebarSelection == .allNotes && !appModel.showSettings) {
                                appModel.showSettings = false
                                appModel.sidebarSelection = .allNotes
                            }
                            SidebarNavItem(icon: "clock", title: "Today", count: todayCount, isSelected: appModel.sidebarSelection == .today && !appModel.showSettings) {
                                appModel.showSettings = false
                                appModel.sidebarSelection = .today
                            }
                            SidebarNavItem(icon: "number", title: "Untagged", count: untaggedCount, isSelected: appModel.sidebarSelection == .untagged && !appModel.showSettings) {
                                appModel.showSettings = false
                                appModel.sidebarSelection = .untagged
                            }
                        }
                        .padding(.horizontal, 8)
                        .padding(.bottom, 10)
                    }

                    // ── Tags section ──
                    HStack(spacing: 6) {
                        SidebarChevron(isExpanded: tagsExpanded) {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                tagsExpanded.toggle()
                            }
                        }
                        Image(systemName: "tag")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.tertiaryText)
                        Text("Tags")
                            .font(.notely(13, weight: .semibold))
                            .foregroundColor(.tertiaryText)
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .frame(height: 32)

                    if tagsExpanded {
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
                    }

                    Spacer(minLength: 16)
                }
            }
            .scrollContentBackground(.hidden)

            Rectangle()
                .fill(Color.borderColor)
                .frame(height: 1)

            Button {
                appModel.showSettings.toggle()
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "gearshape")
                        .font(.system(size: 13, weight: .medium))
                        .frame(width: 18)
                        .foregroundColor(appModel.showSettings ? .accent : .secondaryText)
                    Text("Settings")
                        .font(.notely(14, weight: appModel.showSettings ? .medium : .regular))
                        .foregroundColor(appModel.showSettings ? .accent : .primaryText)
                    Spacer()
                }
                .padding(.horizontal, 10)
                .frame(height: 30)
                .background(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(appModel.showSettings ? Color.accentHover : Color.clear)
                )
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
                    let note = store.createNote()
                    appModel.selectedNoteId = note?.id
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

/// Expand/collapse chevron used in sidebar section headers.
struct SidebarChevron: View {
    let isExpanded: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "chevron.right")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.tertiaryText)
                .frame(width: 14, height: 14)
                .rotationEffect(.degrees(isExpanded ? 90 : 0))
        }
        .buttonStyle(.plain)
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
                appModel.showSettings = false
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
                        .fill(isSelected && !appModel.showSettings ? Color.accentHover : Color.clear)
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
