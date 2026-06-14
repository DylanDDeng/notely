import SwiftUI
import SwiftData

/// Middle column: list of notes filtered by sidebar selection and search.
struct NoteListView: View {
    @Environment(AppModel.self) var appModel
    @Environment(DataController.self) var dataController
    @Query(filter: #Predicate<NoteModel> { $0.trashed == false })
    private var activeNotes: [NoteModel]
    @Query(filter: #Predicate<NoteModel> { $0.trashed == true })
    private var trashedNotes: [NoteModel]

    private var filteredNotes: [NoteModel] {
        let notes: [NoteModel]
        switch appModel.sidebarSelection {
        case .allNotes:
            notes = activeNotes
        case .today:
            let cal = Calendar.current
            notes = activeNotes.filter { cal.isDateInToday($0.updatedAt) }
        case .untagged:
            notes = activeNotes.filter { $0.tags.isEmpty }
        case .trash:
            notes = trashedNotes
        case .tag(let tagPath):
            notes = activeNotes.filter { note in
                note.tags.contains { $0 == tagPath || $0.hasPrefix(tagPath + "/") }
            }
        }

        let search = appModel.searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        let searchResults: [NoteModel]
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

    private func sortNotes(_ notes: [NoteModel]) -> [NoteModel] {
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
            HStack(spacing: 10) {
                Text(appModel.sidebarSelection.title)
                    .font(.notely(15, weight: .semibold))
                    .foregroundColor(.primaryText)
                Spacer()

                Button {
                    NotificationCenter.default.post(name: .focusNoteSearch, object: nil)
                } label: {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 13, weight: .medium))
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
                    Image(systemName: "ellipsis")
                        .font(.system(size: 13, weight: .semibold))
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
                    .font(.system(size: 11))
                    .foregroundColor(.tertiaryText)
                TextField("Search", text: Bindable(appModel).searchText)
                    .textFieldStyle(.plain)
                    .font(.notely(13))
                    .foregroundColor(.primaryText)
                if !appModel.searchText.isEmpty {
                    Button {
                        appModel.searchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 11))
                            .foregroundColor(.tertiaryText)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .frame(height: 28)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(Color.searchFieldBg)
            )
            .padding(.horizontal, 16)
            .padding(.bottom, 12)

            ScrollView {
                LazyVStack(spacing: 0) {
                    if filteredNotes.isEmpty {
                        EmptyStateView(
                            icon: appModel.sidebarSelection == .trash ? "trash" : "note.text",
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
                                isTrashView: appModel.sidebarSelection == .trash,
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
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                if appModel.sidebarSelection != .trash {
                    Button {
                        let note = dataController.createNote()
                        appModel.selectedNoteId = note.id
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 16))
                    }
                    .help("New Note")
                }
            }
        }
    }

    private var emptyTitle: String {
        switch appModel.sidebarSelection {
        case .trash: return "Trash is empty"
        case .untagged: return "No untagged notes"
        case .today: return "No notes today"
        case .tag(let tag): return "No notes tagged #\(tag)"
        default: return appModel.searchText.isEmpty ? "No notes yet" : "No results found"
        }
    }

    private var emptySubtitle: String {
        switch appModel.sidebarSelection {
        case .trash: return "Deleted notes will appear here."
        case .untagged: return "All your notes have tags."
        case .today: return "Notes edited today will show here."
        case .tag: return "Try a different tag."
        default: return appModel.searchText.isEmpty ? "Create your first note to get started." : "Try a different search."
        }
    }
}
