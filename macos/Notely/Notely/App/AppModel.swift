import Foundation
import Observation
import SwiftData

/// Represents the current selection in the sidebar.
enum SidebarSelection: Hashable {
    case allNotes
    case untagged
    case trash
    case tag(String)
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
