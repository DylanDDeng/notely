import Foundation
import Observation

enum SidebarSelection: Hashable {
    case allNotes
    case today
    case untagged
    case tag(String)

    var title: String {
        switch self {
        case .allNotes: return "All Notes"
        case .today: return "Today"
        case .untagged: return "Untagged"
        case .tag(let name): return "#\(name)"
        }
    }
}

@Observable
final class AppModel {
    var sidebarSelection: SidebarSelection = .allNotes
    var selectedNoteId: String? = nil
    var searchText: String = ""
    var sortMode: SortMode = SortMode(rawValue: AppSettings.sortMode) ?? .updatedDesc
    var showSettings: Bool = false

    func setSortMode(_ mode: SortMode) {
        sortMode = mode
        AppSettings.sortMode = mode.rawValue
    }
}
