import Foundation
import Observation
import SwiftData

/// Represents the current selection in the sidebar.
enum SidebarSelection: Hashable {
    case allNotes
    case today
    case untagged
    case trash
    case tag(String)

    var title: String {
        switch self {
        case .allNotes: return "All Notes"
        case .today: return "Today"
        case .untagged: return "Untagged"
        case .trash: return "Trash"
        case .tag(let name): return "#\(name)"
        }
    }
}

/// Global observable state for the app.
///
/// Holds the current sidebar selection, selected note, search text,
/// and sort mode. These drive the three-column layout.
@Observable
final class AppModel {
    var sidebarSelection: SidebarSelection = .allNotes
    var selectedNoteId: UUID? = nil
    var searchText: String = ""
    var sortMode: SortMode = SortMode(rawValue: AppSettings.sortMode) ?? .updatedDesc

    /// Update sort mode and persist.
    func setSortMode(_ mode: SortMode) {
        sortMode = mode
        AppSettings.sortMode = mode.rawValue
    }
}
