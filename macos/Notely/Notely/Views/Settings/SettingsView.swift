import SwiftUI

/// Settings window: theme, font size, line height, sort mode.
struct SettingsView: View {
    @State private var theme: String = AppSettings.theme
    @State private var fontSize: Double = AppSettings.editorFontSize
    @State private var lineHeight: Double = AppSettings.editorLineHeight
    @State private var sortMode: String = AppSettings.sortMode

    var body: some View {
        Form {
            Section("Appearance") {
                Picker("Theme", selection: $theme) {
                    ForEach(ThemePreference.allCases, id: \.self) { pref in
                        Text(pref.label).tag(pref.rawValue)
                    }
                }
                .onChange(of: theme) { _, newValue in
                    AppSettings.theme = newValue
                    applyTheme(newValue)
                }
            }

            Section("Editor") {
                Slider(value: $fontSize, in: 12...22, step: 1) {
                    Text("Font Size")
                } minimumValueLabel: {
                    Text("12")
                        .font(.caption)
                } maximumValueLabel: {
                    Text("22")
                        .font(.caption)
                }
                .onChange(of: fontSize) { _, newValue in
                    AppSettings.editorFontSize = newValue
                }

                Text("\(Int(fontSize)) pt")
                    .font(.caption)
                    .foregroundColor(.secondary)

                Slider(value: $lineHeight, in: 1.3...2.2, step: 0.1) {
                    Text("Line Height")
                }
                .onChange(of: lineHeight) { _, newValue in
                    AppSettings.editorLineHeight = newValue
                }

                Text(String(format: "%.1f", lineHeight))
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Section("Notes") {
                Picker("Sort By", selection: $sortMode) {
                    ForEach(SortMode.allCases, id: \.self) { mode in
                        Text(mode.label).tag(mode.rawValue)
                    }
                }
                .onChange(of: sortMode) { _, newValue in
                    AppSettings.sortMode = newValue
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Settings")
        .frame(width: 480, height: 400)
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
