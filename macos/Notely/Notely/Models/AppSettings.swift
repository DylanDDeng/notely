import Foundation
import SwiftUI

/// Centralized user defaults for app preferences.
enum AppSettings {
    static let themeKey = "notely.theme"
    static let fontSizeKey = "notely.editorFontSize"
    static let lineHeightKey = "notely.editorLineHeight"
    static let sortModeKey = "notely.sortMode"
    static let sidebarWidthKey = "notely.sidebarWidth"
    static let noteListWidthKey = "notely.noteListWidth"

    static var theme: String {
        get { UserDefaults.standard.string(forKey: themeKey) ?? "system" }
        set { UserDefaults.standard.set(newValue, forKey: themeKey) }
    }

    static var editorFontSize: Double {
        get { UserDefaults.standard.object(forKey: fontSizeKey) as? Double ?? 17 }
        set { UserDefaults.standard.set(newValue, forKey: fontSizeKey) }
    }

    static var editorLineHeight: Double {
        get { UserDefaults.standard.object(forKey: lineHeightKey) as? Double ?? 1.7 }
        set { UserDefaults.standard.set(newValue, forKey: lineHeightKey) }
    }

    static var sortMode: String {
        get { UserDefaults.standard.string(forKey: sortModeKey) ?? "updated-desc" }
        set { UserDefaults.standard.set(newValue, forKey: sortModeKey) }
    }

    static var sidebarWidth: Double {
        get { UserDefaults.standard.object(forKey: sidebarWidthKey) as? Double ?? 220 }
        set { UserDefaults.standard.set(newValue, forKey: sidebarWidthKey) }
    }

    static var noteListWidth: Double {
        get { UserDefaults.standard.object(forKey: noteListWidthKey) as? Double ?? 300 }
        set { UserDefaults.standard.set(newValue, forKey: noteListWidthKey) }
    }
}

/// Sort modes for the note list.
enum SortMode: String, CaseIterable {
    case updatedDesc = "updated-desc"
    case createdDesc = "created-desc"
    case titleAsc = "title-asc"

    var label: String {
        switch self {
        case .updatedDesc: return "Date Modified"
        case .createdDesc: return "Date Created"
        case .titleAsc: return "Title"
        }
    }
}

/// Theme preferences.
enum ThemePreference: String, CaseIterable {
    case light = "light"
    case dark = "dark"
    case system = "system"

    var label: String {
        switch self {
        case .light: return "Light"
        case .dark: return "Dark"
        case .system: return "System"
        }
    }
}
