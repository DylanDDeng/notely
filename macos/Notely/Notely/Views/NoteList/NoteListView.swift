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
        case .untagged:
            notes = activeNotes.filter { $0.tags.isEmpty }
        case .trash:
            notes = trashedNotes
        case .tag(let tagPath):
            notes = activeNotes.filter { note in
                note.tags.contains { $0 == tagPath || $0.hasPrefix(tagPath + "/") }
            }
        }

        // Apply search filter
        let searchResults: [NoteModel]
        let search = appModel.searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        if search.isEmpty {
            searchResults = notes
        } else {
            searchResults = notes.filter { note in
                note.title.localizedCaseInsensitiveContains(search) ||
                note.content.localizedCaseInsensitiveContains(search)
            }
        }

        // Sort
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
            // Search bar
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 12))
                    .foregroundColor(.secondaryText)
                TextField("Search notes…", text: Bindable(appModel).searchText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                if !appModel.searchText.isEmpty {
                    Button {
                        appModel.searchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 12))
                            .foregroundColor(.secondaryText)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(8)
            .background(Color.sidebarBg.opacity(0.5))

            // Sort menu
            HStack {
                Text("\(filteredNotes.count) \(filteredNotes.count == 1 ? "note" : "notes")")
                    .font(.system(size: 11))
                    .foregroundColor(.secondaryText)
                Spacer()
                Menu {
                    ForEach(SortMode.allCases, id: \.self) { mode in
                        Button(mode.label) {
                            appModel.setSortMode(mode)
                        }
                    }
                } label: {
                    HStack(spacing: 3) {
                        Image(systemName: "arrow.up.arrow.down")
                            .font(.system(size: 9))
                        Text(appModel.sortMode.label)
                            .font(.system(size: 11))
                    }
                    .foregroundColor(.secondaryText)
                }
                .menuStyle(.borderlessButton)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)

            Divider()

            // Note list
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
        }
        .background(Color.appBg)
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
        case .tag(let tag): return "No notes tagged #\(tag)"
        default: return appModel.searchText.isEmpty ? "No notes yet" : "No results found"
        }
    }

    private var emptySubtitle: String {
        switch appModel.sidebarSelection {
        case .trash: return "Deleted notes will appear here."
        case .untagged: return "All your notes have tags."
        case .tag: return "Try a different tag."
        default: return appModel.searchText.isEmpty ? "Create your first note to get started." : "Try a different search."
        }
    }
}
