import SwiftUI

extension Color {
    static let appBg = Color("AppBackground")
    static let sidebarBg = Color("SidebarBackground")
    static let noteListBg = Color("NoteListBackground")
    static let editorBg = Color("EditorBackground")
    static let primaryText = Color("PrimaryText")
    static let secondaryText = Color("SecondaryText")
    static let tertiaryText = Color("TertiaryText")
    static let accent = Color("AccentColor")
    static let borderColor = Color("BorderColor")
    static let codeBlockBg = Color("CodeBlockBackground")

    static let accentHover = Color.accent.opacity(0.10)
    static let accentSelected = Color.accent.opacity(0.06)
    static let cardHover = Color.primaryText.opacity(0.03)
    static let searchFieldBg = Color.primaryText.opacity(0.03)
    static let quietSurface = Color.primaryText.opacity(0.025)
}

extension Font {
    static func notely(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .default)
    }

    static func notelyMono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}
