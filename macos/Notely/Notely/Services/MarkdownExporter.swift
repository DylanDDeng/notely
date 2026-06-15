import AppKit
import Foundation

/// Exports notes as Markdown files.
enum MarkdownExporter {
    static func export(note: FileNote, store: FileNoteStore) {
        let panel = NSSavePanel()
        panel.title = "Export as Markdown"
        panel.nameFieldStringValue = filename(for: note)
        panel.allowedContentTypes = [.plainText]

        guard panel.runModal() == .OK, let url = panel.url else { return }

        do {
            try note.content.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            print("Export failed: \(error)")
        }
    }

    private static func filename(for note: FileNote) -> String {
        let title = note.title.isEmpty ? note.filename : note.title
        let sanitized = title
            .components(separatedBy: CharacterSet(charactersIn: "/\\:*?\"<>|"))
            .joined(separator: "-")
            .trimmingCharacters(in: .whitespaces)
        return (sanitized.isEmpty ? "Untitled" : sanitized) + ".md"
    }
}
