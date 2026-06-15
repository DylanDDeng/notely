import SwiftUI

/// Middle column: list of notes filtered by sidebar selection and search.
struct NoteListView: View {
    @Environment(AppModel.self) var appModel
    @Environment(FileNoteStore.self) var store

    private var filteredNotes: [FileNote] {
        let notes: [FileNote]
        switch appModel.sidebarSelection {
        case .allNotes:
            notes = store.notes
        case .today:
            let cal = Calendar.current
            notes = store.notes.filter { cal.isDateInToday($0.updatedAt) }
        case .untagged:
            notes = store.notes.filter { $0.tags.isEmpty }
        case .tag(let tagPath):
            notes = store.notes.filter { note in
                note.tags.contains { $0 == tagPath || $0.hasPrefix(tagPath + "/") }
            }
        }

        let search = appModel.searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        let searchResults: [FileNote]
        if search.isEmpty {
            searchResults = notes
        } else {
            searchResults = notes.filter { note in
                note.title.localizedCaseInsensitiveContains(search) ||
                note.content.localizedCaseInsensitiveContains(search)
            }
        }

        return sortNotes(searchResults)
    }

    private func sortNotes(_ notes: [FileNote]) -> [FileNote] {
        switch appModel.sortMode {
        case .updatedDesc:
            return notes.sorted { lhs, rhs in
                if lhs.pinned != rhs.pinned { return lhs.pinned }
                return lhs.updatedAt > rhs.updatedAt
            }
        case .createdDesc:
            return notes.sorted { lhs, rhs in
                if lhs.pinned != rhs.pinned { return lhs.pinned }
                return lhs.createdAt > rhs.createdAt
            }
        case .titleAsc:
            return notes.sorted { lhs, rhs in
                if lhs.pinned != rhs.pinned { return lhs.pinned }
                return lhs.title < rhs.title
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Text(appModel.sidebarSelection.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.primaryText)
                Spacer()

                Button {
                    NotificationCenter.default.post(name: .focusNoteSearch, object: nil)
                } label: {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14))
                        .foregroundColor(.secondaryText)
                        .frame(width: 22, height: 22)
                }
                .buttonStyle(.plain)

                Menu {
                    ForEach(SortMode.allCases, id: \.self) { mode in
                        Button(mode.label) {
                            appModel.setSortMode(mode)
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.system(size: 14))
                        .foregroundColor(.secondaryText)
                        .frame(width: 22, height: 22)
                }
                .menuStyle(.borderlessButton)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 10)

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 13))
                    .foregroundColor(.tertiaryText)
                TextField("Search", text: Bindable(appModel).searchText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .foregroundColor(.primaryText)
                if !appModel.searchText.isEmpty {
                    Button {
                        appModel.searchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 13))
                            .foregroundColor(.tertiaryText)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(Color.primaryText.opacity(0.03))
            )
            .padding(.horizontal, 16)
            .padding(.bottom, 12)

            ScrollView {
                LazyVStack(spacing: 0) {
                    if filteredNotes.isEmpty {
                        EmptyStateView(
                            icon: "note.text",
                            title: emptyTitle,
                            subtitle: emptySubtitle
                        )
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                    } else {
                        ForEach(filteredNotes) { note in
                            NoteCardView(
                                note: note,
                                isSelected: appModel.selectedNoteId == note.id,
                                searchText: appModel.searchText,
                                onSelect: {
                                    withAnimation(.easeInOut(duration: 0.15)) {
                                        appModel.selectedNoteId = note.id
                                    }
                                }
                            )
                            .transition(.opacity.combined(with: .move(edge: .top)))
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
        }
        .background(Color.noteListBg)
    }

    private var emptyTitle: String {
        switch appModel.sidebarSelection {
        case .untagged: return "No untagged notes"
        case .today: return "No notes today"
        case .tag(let tag): return "No notes tagged #\(tag)"
        default: return appModel.searchText.isEmpty ? "No notes yet" : "No results found"
        }
    }

    private var emptySubtitle: String {
        switch appModel.sidebarSelection {
        case .untagged: return "All your notes have tags."
        case .today: return "Notes edited today will show here."
        case .tag: return "Try a different tag."
        default: return appModel.searchText.isEmpty ? "Create your first note to get started." : "Try a different search."
        }
    }
}
