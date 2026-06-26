import SwiftUI

struct SidebarView: View {
    @Environment(AppModel.self) var appModel
    @Environment(FileNoteStore.self) var store
    @State private var libraryExpanded = true
    @State private var tagsExpanded = true
    @State private var tagSearch = ""

    private var tagTree: [TagNode] {
        let allTags = store.notes.flatMap { $0.tags }
        return TagTreeBuilder.build(from: allTags)
    }

    /// Tags whose full path matches the search query, as a flat sorted list.
    private var filteredTags: [TagNode] {
        TagSearch.matches(in: tagTree, query: tagSearch)
    }

    private var isSearchingTags: Bool {
        !tagSearch.trimmingCharacters(in: .whitespaces).isEmpty
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
                    SidebarSectionHeader(title: "Library", systemImage: "books.vertical", isExpanded: $libraryExpanded) {
                        EmptyView()
                    }
                    .padding(.horizontal, 8)
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
                        .padding(.leading, 22)
                        .padding(.trailing, 8)
                        .padding(.bottom, 10)
                    }

                    // ── Tags section ──
                    SidebarSectionHeader(title: "Tags", systemImage: "tag", isExpanded: $tagsExpanded) {
                        EmptyView()
                    }
                    .padding(.horizontal, 8)
                    .padding(.bottom, tagsExpanded ? 0 : 10)

                    if tagsExpanded {
                        if !tagTree.isEmpty {
                            TagSearchField(text: $tagSearch)
                                .padding(.horizontal, 14)
                                .padding(.bottom, 6)
                        }

                        VStack(spacing: 1) {
                            if tagTree.isEmpty {
                                Text("No tags yet")
                                    .font(.notely(13))
                                    .foregroundColor(.tertiaryText)
                                    .padding(.horizontal, 18)
                                    .padding(.vertical, 8)
                            } else if isSearchingTags {
                                if filteredTags.isEmpty {
                                    Text("No matching tags")
                                        .font(.notely(13))
                                        .foregroundColor(.tertiaryText)
                                        .padding(.horizontal, 18)
                                        .padding(.vertical, 8)
                                } else {
                                    ForEach(filteredTags) { node in
                                        TagFlatRow(node: node)
                                    }
                                }
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
    }
}

extension ToolbarContent {
    /// Hides the glass/background chrome that macOS draws around toolbar items
    /// (visible when the sidebar collapses and the toggle moves into the window
    /// toolbar). `.buttonStyle(.plain)` alone doesn't remove it because it's
    /// toolbar-level chrome, not button-style chrome. macOS 26+ only; no-op below.
    @ToolbarContentBuilder
    func hideSharedBackgroundIfAvailable() -> some ToolbarContent {
        if #available(macOS 26.0, *) {
            self.sharedBackgroundVisibility(.hidden)
        } else {
            self
        }
    }
}

/// Clickable section header with chevron, hover highlight, and optional
/// trailing view (e.g. the "+" button in Library). The entire row toggles
/// expansion — not just the chevron.
struct SidebarSectionHeader<Trailing: View>: View {
    let title: String
    var systemImage: String? = nil
    @Binding var isExpanded: Bool
    @ViewBuilder var trailing: () -> Trailing
    @State private var isHovering = false

    var body: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                isExpanded.toggle()
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.tertiaryText)
                    .frame(width: 14, height: 14)
                    .rotationEffect(.degrees(isExpanded ? 90 : 0))

                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.tertiaryText)
                }

                Text(title)
                    .font(.notely(13, weight: .semibold))
                    .foregroundColor(.tertiaryText)

                Spacer()

                trailing()
            }
            .padding(.horizontal, 8)
            .frame(height: 30)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(isHovering ? Color.cardHover : Color.clear)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { isHovering = $0 }
    }
}

/// A single navigation item in the sidebar.
struct SidebarNavItem: View {
    let icon: String
    let title: String
    let count: Int
    let isSelected: Bool
    let action: () -> Void
    @State private var isHovering = false

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
                    .fill(isSelected ? Color.accentHover : (isHovering ? Color.cardHover : Color.clear))
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { isHovering = $0 }
    }
}

/// Compact search field for filtering the tag list.
struct TagSearchField: View {
    @Binding var text: String

    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 12))
                .foregroundColor(.tertiaryText)
            TextField("Search tags", text: $text)
                .textFieldStyle(.plain)
                .font(.notely(13))
                .foregroundColor(.primaryText)
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 12))
                        .foregroundColor(.tertiaryText)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(Color.primaryText.opacity(0.03))
        )
    }
}

/// A flat tag row used for search results: shows the full tag path (e.g.
/// `AI/编程`) rather than the nested tree, so a match is identifiable at a glance.
struct TagFlatRow: View {
    let node: TagNode
    @Environment(AppModel.self) var appModel
    @State private var isHovering = false

    private var isSelected: Bool {
        if case .tag(let path) = appModel.sidebarSelection {
            return path == node.id
        }
        return false
    }

    private var rowBg: Color {
        if isSelected && !appModel.showSettings { return .accentHover }
        if isHovering { return .cardHover }
        return .clear
    }

    var body: some View {
        Button {
            appModel.showSettings = false
            appModel.sidebarSelection = .tag(node.id)
        } label: {
            HStack(spacing: 7) {
                Text("#")
                    .font(.notely(14, weight: .medium))
                    .foregroundColor(isSelected ? .accent : .tertiaryText)
                    .frame(width: 12)

                Text(node.id)
                    .font(.notely(14, weight: isSelected ? .medium : .regular))
                    .foregroundColor(isSelected ? .accent : .primaryText)
                    .lineLimit(1)
                    .truncationMode(.middle)

                Spacer()

                Text("\(node.totalCount)")
                    .font(.notely(12))
                    .foregroundColor(isSelected ? .accent : .tertiaryText)
            }
            .padding(.horizontal, 10)
            .frame(height: 28)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(rowBg)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { isHovering = $0 }
    }
}

/// A row in the tag tree, supporting nested children.
struct TagTreeRow: View {
    let node: TagNode
    @Environment(AppModel.self) var appModel
    @State private var isExpanded = true
    @State private var isHovering = false

    private var isSelected: Bool {
        if case .tag(let path) = appModel.sidebarSelection {
            return path == node.id
        }
        return false
    }

    private var rowBg: Color {
        if isSelected && !appModel.showSettings { return .accentHover }
        if isHovering { return .cardHover }
        return .clear
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
                        .fill(rowBg)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .onHover { isHovering = $0 }

            if isExpanded && !node.children.isEmpty {
                ForEach(node.children) { child in
                    TagTreeRow(node: child)
                        .padding(.leading, 14)
                }
            }
        }
    }
}
