import SwiftUI

// MARK: - Shared settings tab state

@Observable
final class SettingsTabState {
    var selectedTab: SettingsTab = .general
}

// MARK: - Middle column: Settings tab list

struct SettingsTabBar: View {
    @Environment(SettingsTabState.self) var state

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Settings")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(.primaryText)
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 20)

            VStack(spacing: 1) {
                ForEach(SettingsTab.allCases) { tab in
                    SettingsTabItem(
                        tab: tab,
                        isSelected: state.selectedTab == tab
                    ) {
                        state.selectedTab = tab
                    }
                }
            }
            .padding(.horizontal, 10)

            Spacer()
        }
        .background(Color.noteListBg)
        .navigationSplitViewColumnWidth(min: 320, ideal: 320, max: 320)
    }
}

// MARK: - Right column: Settings content

struct SettingsContent: View {
    @Environment(SettingsTabState.self) var state

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                Text(state.selectedTab.title)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(.primaryText)

                Text(state.selectedTab.subtitle)
                    .font(.system(size: 14))
                    .foregroundColor(.tertiaryText)
                    .padding(.top, -24)

                switch state.selectedTab {
                case .general:
                    GeneralSettings()
                case .appearance:
                    AppearanceSettings()
                case .editor:
                    EditorSettings()
                case .shortcuts:
                    ShortcutsSettings()
                case .cloud:
                    CloudSettings()
                case .exportTab:
                    ExportSettings()
                case .about:
                    AboutSettings()
                }
            }
            .padding(.horizontal, 48)
            .padding(.top, 40)
            .padding(.bottom, 60)
            .frame(maxWidth: 520, alignment: .leading)
        }
        .frame(maxWidth: .infinity)
        .background(Color.editorBg)
        .navigationSplitViewColumnWidth(min: 720, ideal: 900)
    }
}

// MARK: - Tab definitions

enum SettingsTab: String, CaseIterable, Identifiable {
    case general, appearance, editor, shortcuts, cloud, exportTab, about

    var id: String { rawValue }

    var title: String {
        switch self {
        case .general: return "General"
        case .appearance: return "Appearance"
        case .editor: return "Editor"
        case .shortcuts: return "Shortcuts"
        case .cloud: return "iCloud Sync"
        case .exportTab: return "Export"
        case .about: return "About"
        }
    }

    var subtitle: String {
        switch self {
        case .general: return "Configure how the app behaves."
        case .appearance: return "Customize the look and feel."
        case .editor: return "Adjust the writing experience."
        case .shortcuts: return "View and customize keyboard shortcuts."
        case .cloud: return "Sync your notes across devices."
        case .exportTab: return "Export your notes in various formats."
        case .about: return "Information about the app."
        }
    }

    var icon: String {
        switch self {
        case .general: return "shippingbox"
        case .appearance: return "sun.max"
        case .editor: return "pencil"
        case .shortcuts: return "keyboard"
        case .cloud: return "icloud"
        case .exportTab: return "square.and.arrow.down"
        case .about: return "info.circle"
        }
    }
}

// MARK: - Tab item

struct SettingsTabItem: View {
    let tab: SettingsTab
    let isSelected: Bool
    let action: () -> Void
    @State private var isHovering = false

    /// Visual state of a tab row. Selection wins over hover. Pure + testable.
    enum Highlight {
        case selected, hover, none
        static func resolve(isSelected: Bool, isHovering: Bool) -> Highlight {
            if isSelected { return .selected }
            if isHovering { return .hover }
            return .none
        }
    }

    private var highlight: Highlight {
        Highlight.resolve(isSelected: isSelected, isHovering: isHovering)
    }

    private var backgroundColor: Color {
        switch highlight {
        case .selected: return Color.accent.opacity(0.10)
        case .hover: return Color.primaryText.opacity(0.06)
        case .none: return .clear
        }
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: tab.icon)
                    .font(.system(size: 13))
                    .frame(width: 18)
                    .foregroundColor(isSelected ? .accent : .secondaryText)
                Text(tab.title)
                    .font(.system(size: 14, weight: isSelected ? .medium : .regular))
                    .foregroundColor(isSelected ? .accent : .primaryText)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            // Fill the column width and make the WHOLE row (incl. the trailing
            // empty space) hittable, not just the icon + label.
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(backgroundColor)
            )
            .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
        .onHover { isHovering = $0 }
        .animation(.easeInOut(duration: 0.12), value: highlight)
    }
}

extension SettingsTabItem.Highlight: Equatable {}

// MARK: - Reusable row components

struct SettingsDivider: View {
    var body: some View {
        Rectangle()
            .fill(Color.primaryText.opacity(0.06))
            .frame(height: 1)
    }
}

struct SettingsRow<Control: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let control: () -> Control

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.primaryText)
                Text(subtitle)
                    .font(.system(size: 13))
                    .foregroundColor(.tertiaryText)
            }
            Spacer()
            control()
        }
    }
}

struct SettingsToggle: View {
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            RoundedRectangle(cornerRadius: 13)
                .fill(isOn ? Color.accent : Color.primaryText.opacity(0.12))
                .frame(width: 44, height: 26)
                .overlay(
                    Circle()
                        .fill(Color.white)
                        .frame(width: 22, height: 22)
                        .offset(x: isOn ? 9 : -9)
                        .animation(.easeInOut(duration: 0.15), value: isOn)
                )
        }
        .buttonStyle(.plain)
    }
}

struct SettingsStepper: View {
    let value: Int
    let onDecrement: () -> Void
    let onIncrement: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            Button(action: onDecrement) {
                Image(systemName: "minus")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.secondaryText)
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)

            Text("\(value)")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.primaryText)
                .frame(width: 44)

            Button(action: onIncrement) {
                Image(systemName: "plus")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.secondaryText)
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)
        }
        .background(
            RoundedRectangle(cornerRadius: 6)
                .strokeBorder(Color.primaryText.opacity(0.08), lineWidth: 1)
        )
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(Color.white.opacity(0.6))
        )
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}

// MARK: - General tab

struct GeneralSettings: View {
    @State private var noteLocation: String = AppSettings.noteLocation
    @State private var defaultTag: String = AppSettings.defaultTag
    @State private var launchAtLogin: Bool = AppSettings.launchAtLogin
    @State private var autoUpdates: Bool = AppSettings.autoUpdates

    var body: some View {
        VStack(spacing: 0) {
            SettingsRow(title: "Default Note Location", subtitle: "Where new notes are saved.") {
                HStack(spacing: 6) {
                    Text(noteLocation)
                        .font(.system(size: 14))
                        .foregroundColor(.primaryText)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10))
                        .foregroundColor(.tertiaryText)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .strokeBorder(Color.primaryText.opacity(0.08), lineWidth: 1)
                )
                .background(RoundedRectangle(cornerRadius: 6).fill(Color.white.opacity(0.6)))
            }
            .padding(.vertical, 12)

            SettingsDivider()

            SettingsRow(title: "Default Tag", subtitle: "Automatically tag new notes.") {
                Text("#\(defaultTag)")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.accent)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        Capsule().fill(Color.accent.opacity(0.08))
                    )
            }
            .padding(.vertical, 12)

            SettingsDivider()

            SettingsRow(title: "Launch at Login", subtitle: "Open the app when you start your Mac.") {
                SettingsToggle(isOn: launchAtLogin) {
                    launchAtLogin.toggle()
                    AppSettings.launchAtLogin = launchAtLogin
                }
            }
            .padding(.vertical, 12)

            SettingsDivider()

            SettingsRow(title: "Automatic Updates", subtitle: "Check for new versions automatically.") {
                SettingsToggle(isOn: autoUpdates) {
                    autoUpdates.toggle()
                    AppSettings.autoUpdates = autoUpdates
                }
            }
            .padding(.vertical, 12)
        }
    }
}

// MARK: - Appearance tab

struct AppearanceSettings: View {
    @State private var theme: String = AppSettings.theme
    @State private var selectedAccent: String = AppSettings.accentColorHex

    private let accentColors: [(name: String, hex: String)] = [
        ("Amber", "#D97706"),
        ("Teal", "#2D7D7D"),
        ("Forest", "#5A7A44"),
        ("Mint", "#98FB98"),
        ("Coral", "#FF385C"),
    ]

    var body: some View {
        VStack(spacing: 0) {
            SettingsRow(title: "Theme", subtitle: "Choose the app appearance.") {
                HStack(spacing: 2) {
                    ForEach([("Light", "light"), ("Dark", "dark"), ("Auto", "system")], id: \.1) { item in
                        Button(item.0) {
                            theme = item.1
                            AppSettings.theme = item.1
                            applyTheme(item.1)
                        }
                        .font(.system(size: 13, weight: theme == item.1 ? .medium : .regular))
                        .foregroundColor(theme == item.1 ? .primaryText : .secondaryText)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 5)
                        .background(
                            RoundedRectangle(cornerRadius: 4)
                                .fill(theme == item.1 ? Color.white : Color.clear)
                        )
                    }
                }
                .padding(2)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color.primaryText.opacity(0.05))
                )
            }
            .padding(.vertical, 12)

            SettingsDivider()

            SettingsRow(title: "Accent Color", subtitle: "Highlight color for selections and links.") {
                HStack(spacing: 8) {
                    ForEach(accentColors, id: \.hex) { color in
                        Circle()
                            .fill(Color.fromHex(color.hex))
                            .frame(width: 24, height: 24)
                            .overlay(
                                Circle()
                                    .strokeBorder(Color.white, lineWidth: selectedAccent == color.hex ? 2 : 0)
                            )
                            .overlay(
                                selectedAccent == color.hex ?
                                Image(systemName: "checkmark")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(.white)
                                : nil
                            )
                            .onTapGesture {
                                selectedAccent = color.hex
                                AppSettings.accentColorHex = color.hex
                            }
                    }
                }
            }
            .padding(.vertical, 12)
        }
    }

    private func applyTheme(_ value: String) {
        switch value {
        case "light":
            NSApp.appearance = NSAppearance(named: .aqua)
        case "dark":
            NSApp.appearance = NSAppearance(named: .darkAqua)
        default:
            NSApp.appearance = nil
        }
    }
}

// MARK: - Editor tab

struct EditorSettings: View {
    @State private var fontSize: Int = Int(AppSettings.editorFontSize)
    @State private var lineHeight: Double = AppSettings.editorLineHeight
    @State private var sortMode: String = AppSettings.sortMode

    var body: some View {
        VStack(spacing: 0) {
            SettingsRow(title: "Editor Font Size", subtitle: "Base font size for the editor body.") {
                SettingsStepper(
                    value: fontSize,
                    onDecrement: {
                        if fontSize > 12 { fontSize -= 1; AppSettings.editorFontSize = Double(fontSize) }
                    },
                    onIncrement: {
                        if fontSize < 28 { fontSize += 1; AppSettings.editorFontSize = Double(fontSize) }
                    }
                )
            }
            .padding(.vertical, 12)

            SettingsDivider()

            SettingsRow(title: "Line Height", subtitle: "Line spacing multiplier for the editor.") {
                HStack(spacing: 6) {
                    ForEach([1.3, 1.5, 1.7, 2.0], id: \.self) { val in
                        Button(String(format: "%.1f", val)) {
                            lineHeight = val
                            AppSettings.editorLineHeight = val
                        }
                        .font(.system(size: 13, weight: lineHeight == val ? .medium : .regular))
                        .foregroundColor(lineHeight == val ? .primaryText : .secondaryText)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(
                            RoundedRectangle(cornerRadius: 4)
                                .fill(lineHeight == val ? Color.white : Color.clear)
                        )
                    }
                }
                .padding(2)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color.primaryText.opacity(0.05))
                )
            }
            .padding(.vertical, 12)

            SettingsDivider()

            SettingsRow(title: "Default Sort", subtitle: "How notes are ordered in the list.") {
                Picker("", selection: Binding(
                    get: { SortMode(rawValue: sortMode) ?? .updatedDesc },
                    set: { sortMode = $0.rawValue; AppSettings.sortMode = $0.rawValue }
                )) {
                    ForEach(SortMode.allCases, id: \.self) { mode in
                        Text(mode.label).tag(mode)
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
            }
            .padding(.vertical, 12)
        }
    }
}

// MARK: - Shortcuts tab

struct ShortcutsSettings: View {
    private let shortcuts: [(String, String)] = [
        ("New Note", "⌘ N"),
        ("Bold", "⌘ B"),
        ("Italic", "⌘ I"),
        ("Insert Link", "⌘ K"),
        ("Toggle Todo", "⌘⇧ T"),
    ]

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(shortcuts.enumerated()), id: \.offset) { _, shortcut in
                HStack {
                    Text(shortcut.0)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(.primaryText)
                    Spacer()
                    Text(shortcut.1)
                        .font(.system(size: 13))
                        .foregroundColor(.tertiaryText)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.primaryText.opacity(0.04))
                        )
                }
                .padding(.vertical, 12)
                if shortcut.0 != shortcuts.last!.0 {
                    SettingsDivider()
                }
            }
        }
    }
}

// MARK: - Cloud tab

struct CloudSettings: View {
    @State private var iCloudEnabled = false

    var body: some View {
        VStack(spacing: 0) {
            SettingsRow(title: "iCloud Sync", subtitle: "Sync notes across your Apple devices.") {
                SettingsToggle(isOn: iCloudEnabled) {
                    iCloudEnabled.toggle()
                }
            }
            .padding(.vertical, 12)

            SettingsDivider()

            VStack(alignment: .leading, spacing: 4) {
                Text("Last Synced")
                    .font(.system(size: 13))
                    .foregroundColor(.tertiaryText)
                Text(iCloudEnabled ? "Just now" : "Not synced yet")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.primaryText)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 12)
        }
    }
}

// MARK: - Export tab

struct ExportSettings: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SettingsRow(title: "Export All as Markdown", subtitle: "Download all notes as .md files.") {
                Button("Export") {}
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.primaryText)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                    .background(
                        RoundedRectangle(cornerRadius: 6)
                            .strokeBorder(Color.primaryText.opacity(0.08), lineWidth: 1)
                    )
            }
            .padding(.vertical, 12)

            SettingsDivider()

            SettingsRow(title: "Export as HTML", subtitle: "Convert notes to web pages.") {
                Button("Export") {}
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.primaryText)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                    .background(
                        RoundedRectangle(cornerRadius: 6)
                            .strokeBorder(Color.primaryText.opacity(0.08), lineWidth: 1)
                    )
            }
            .padding(.vertical, 12)
        }
    }
}

// MARK: - About tab

struct AboutSettings: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 16) {
                Image(nsImage: NSApp.applicationIconImage)
                    .resizable()
                    .frame(width: 64, height: 64)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Notely")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(.primaryText)
                    Text("Version \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")")
                        .font(.system(size: 13))
                        .foregroundColor(.tertiaryText)
                }
            }

            SettingsDivider()

            Text("A calm, local-first Markdown editor for macOS.")
                .font(.system(size: 14))
                .foregroundColor(.secondaryText)

            Text("Copyright \u{00A9} 2025 Dylan Deng")
                .font(.system(size: 13))
                .foregroundColor(.tertiaryText)
        }
    }
}

// MARK: - Color helper

extension Color {
    static func fromHex(_ hex: String) -> Color {
        var cleanHex = hex
        if cleanHex.hasPrefix("#") { cleanHex.removeFirst() }
        guard let value = UInt32(cleanHex, radix: 16) else { return .gray }
        let r = Double((value >> 16) & 0xFF) / 255
        let g = Double((value >> 8) & 0xFF) / 255
        let b = Double(value & 0xFF) / 255
        return Color(red: r, green: g, blue: b)
    }
}
