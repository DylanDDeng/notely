import AppKit
import Foundation
import SwiftData

/// Exports notes as Markdown files.
enum MarkdownExporter {
    /// Export a single note to a .md file via save panel.
    static func export(note: NoteModel) {
        let panel = NSSavePanel()
        panel.title = "Export as Markdown"
        panel.nameFieldStringValue = filename(for: note)
        panel.allowedContentTypes = [.plainText]

        guard panel.runModal() == .OK, let url = panel.url else { return }

        let markdown = buildMarkdown(for: note)
        do {
            try markdown.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            print("Export failed: \(error)")
        }
    }

    /// Build the exported Markdown content from a note.
    static func buildMarkdown(for note: NoteModel) -> String {
        return note.content
    }

    /// Generate a safe filename from note title.
    private static func filename(for note: NoteModel) -> String {
        let title = note.title.isEmpty ? "Untitled" : note.title
        let sanitized = title
            .components(separatedBy: CharacterSet(charactersIn: "/\\:*?\"<>|"))
            .joined(separator: "-")
            .trimmingCharacters(in: .whitespaces)
        return (sanitized.isEmpty ? "Untitled" : sanitized) + ".md"
    }
}
