import SwiftUI
import AppKit
import Observation

// MARK: - Theme model

/// A complete set of surface/text colors for one named theme.
struct Palette {
    let appBg: Color
    let sidebarBg: Color
    let noteListBg: Color
    let editorBg: Color
    let primaryText: Color
    let secondaryText: Color
    let tertiaryText: Color
    let border: Color
    let codeBlockBg: Color
    /// Elevated surface for cards, popovers, selected segments.
    let surface: Color
}

/// Named visual themes. Palettes are derived from the Paper design comps.
enum AppTheme: String, CaseIterable, Identifiable {
    case paper, mineral, bookish, inky

    var id: String { rawValue }
    var displayName: String { rawValue.capitalized }
    var isDark: Bool { self == .bookish || self == .inky }

    var defaultAccentHex: String {
        switch self {
        case .paper:   return "#D97706"
        case .mineral: return "#2D7D7D"
        case .bookish: return "#F59E0B"
        case .inky:    return "#98FB98"
        }
    }

    var palette: Palette {
        switch self {
        case .paper:
            return Palette(
                appBg: hex("#F7F4EF"), sidebarBg: hex("#EFEAE3"),
                noteListBg: hex("#F5F1EA"), editorBg: hex("#FBF8F3"),
                primaryText: hex("#2B2B2B"), secondaryText: hex("#6F685D"),
                tertiaryText: hex("#9B9286"),
                border: Color.black.opacity(0.06), codeBlockBg: hex("#F0EDE7"),
                surface: hex("#FFFFFF"))
        case .mineral:
            return Palette(
                appBg: hex("#FFFFFF"), sidebarBg: hex("#F5F5F5"),
                noteListBg: hex("#FAFAFA"), editorBg: hex("#FFFFFF"),
                primaryText: hex("#111111"), secondaryText: hex("#555555"),
                tertiaryText: hex("#999999"),
                border: Color.black.opacity(0.08), codeBlockBg: hex("#F5F5F5"),
                surface: hex("#FFFFFF"))
        case .bookish:
            return Palette(
                appBg: hex("#1C1B19"), sidebarBg: hex("#211F1C"),
                noteListBg: hex("#1E1D1A"), editorBg: hex("#1C1B19"),
                primaryText: hex("#F5EFE6"), secondaryText: hex("#B7AD9F"),
                tertiaryText: hex("#8A8175"),
                border: Color.white.opacity(0.10), codeBlockBg: hex("#272320"),
                surface: hex("#2A2622"))
        case .inky:
            // Exact palette from the "Theme B — Inky (Pure Black + Phosphor)" comp.
            return Palette(
                appBg: hex("#000000"), sidebarBg: hex("#0A0A0A"),
                noteListBg: hex("#050505"), editorBg: hex("#000000"),
                primaryText: hex("#FFFFFF"), secondaryText: hex("#CCCCCC"),
                tertiaryText: hex("#777777"),
                border: Color.white.opacity(0.08), codeBlockBg: hex("#080808"),
                surface: hex("#141414"))
        }
    }

    private func hex(_ s: String) -> Color { Color.fromHex(s) }
}

/// Holds the active theme + accent and applies the matching system appearance.
/// Color tokens read from `ThemeManager.shared`, so changing the theme reskins
/// the whole app (the root view rebuilds via `.id` on theme/accent change).
@Observable
final class ThemeManager {
    static let shared = ThemeManager()

    var theme: AppTheme
    var accentHex: String

    private init() {
        theme = AppTheme(rawValue: AppSettings.appTheme) ?? .paper
        accentHex = AppSettings.accentColorHex
    }

    var palette: Palette { theme.palette }
    var accentColor: Color { Color.fromHex(accentHex) }

    /// A stable key that changes whenever the visible palette changes.
    var renderKey: String { "\(theme.rawValue)|\(accentHex)" }

    func select(_ theme: AppTheme) {
        self.theme = theme
        AppSettings.appTheme = theme.rawValue
        accentHex = theme.defaultAccentHex
        AppSettings.accentColorHex = accentHex
        applyAppearance()
    }

    func setAccent(_ hex: String) {
        accentHex = hex
        AppSettings.accentColorHex = hex
    }

    func applyAppearance() {
        NSApp?.appearance = NSAppearance(named: theme.isDark ? .darkAqua : .aqua)
    }
}

// MARK: - Color tokens (theme-driven)

extension Color {
    static var appBg: Color { ThemeManager.shared.palette.appBg }
    static var sidebarBg: Color { ThemeManager.shared.palette.sidebarBg }
    static var noteListBg: Color { ThemeManager.shared.palette.noteListBg }
    static var editorBg: Color { ThemeManager.shared.palette.editorBg }
    static var primaryText: Color { ThemeManager.shared.palette.primaryText }
    static var secondaryText: Color { ThemeManager.shared.palette.secondaryText }
    static var tertiaryText: Color { ThemeManager.shared.palette.tertiaryText }
    static var accent: Color { ThemeManager.shared.accentColor }
    static var borderColor: Color { ThemeManager.shared.palette.border }
    static var codeBlockBg: Color { ThemeManager.shared.palette.codeBlockBg }
    /// Elevated surface for cards, popovers, selected segments.
    static var surface: Color { ThemeManager.shared.palette.surface }

    static var accentHover: Color { Color.accent.opacity(0.10) }
    static var accentSelected: Color { Color.accent.opacity(0.06) }
    static var cardHover: Color { Color.primaryText.opacity(0.03) }
    static var searchFieldBg: Color { Color.primaryText.opacity(0.03) }
    static var quietSurface: Color { Color.primaryText.opacity(0.025) }
}

extension Font {
    static func notely(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .default)
    }

    static func notelyMono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}
