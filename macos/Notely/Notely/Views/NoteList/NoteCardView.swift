import SwiftUI
import SwiftData

/// A single note card in the note list.
struct NoteCardView: View {
    let note: NoteModel
    let isSelected: Bool
    let isTrashView: Bool
    var searchText: String = ""
    let onSelect: () -> Void
    @Environment(DataController.self) var dataController
    @State private var isHovered = false

    private var summary: String {
        let lines = note.content.components(separatedBy: "\n")
        var foundTitle = false
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty { continue }
            if !foundTitle {
                foundTitle = true
                continue
            }
            return trimmed
        }
        return "No additional text"
    }

    var body: some View {
        HStack(spacing: 0) {
            Rectangle()
                .fill(isSelected ? Color.accent : Color.clear)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 4) {
                    if note.pinned {
                        Image(systemName: "pin.fill")
                            .font(.system(size: 9))
                            .foregroundColor(.accent)
                    }
                    Text(highlighted(note.title.isEmpty ? "Untitled" : note.title))
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.primaryText)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Spacer()
                }

                Text(highlighted(summary))
                    .font(.system(size: 12))
                    .foregroundColor(.secondaryText)
                    .lineLimit(2)
                    .truncationMode(.tail)

                HStack(spacing: 6) {
                    ForEach(note.tags.prefix(2), id: \.self) { tag in
                        Text("#\(tag)")
                            .font(.system(size: 10))
                            .foregroundColor(.accent)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(
                                Capsule()
                                    .fill(Color.accent.opacity(0.08))
                            )
                    }

                    if note.tags.count > 2 {
                        Text("+\(note.tags.count - 2)")
                            .font(.system(size: 10))
                            .foregroundColor(.secondaryText)
                    }

                    Spacer()

                    Text(note.updatedAt.formatted(.relative(presentation: .named)))
                        .font(.system(size: 10))
                        .foregroundColor(.secondaryText)
                }
                .padding(.top, 2)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 0)
                .fill(isSelected ? Color.accent.opacity(0.06) : (isHovered ? Color.primaryText.opacity(0.03) : Color.clear))
        )
        .contentShape(Rectangle())
        .onTapGesture {
            if !isTrashView {
                onSelect()
            }
        }
        .onHover { hovering in
            isHovered = hovering
        }
        .contextMenu {
            if isTrashView {
                Button("Restore") {
                    dataController.restoreNote(note)
                }
                Divider()
                Button("Delete Permanently", role: .destructive) {
                    dataController.permanentlyDelete(note)
                }
            } else {
                Button(note.pinned ? "Unpin" : "Pin") {
                    dataController.togglePin(note)
                }
                Button("Export as Markdown…") {
                    MarkdownExporter.export(note: note)
                }
                Divider()
                Button("Move to Trash", role: .destructive) {
                    dataController.trashNote(note)
                }
            }
        }
    }

    /// Returns an AttributedString with search keyword highlighted.
    private func highlighted(_ text: String) -> AttributedString {
        let search = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !search.isEmpty else {
            return AttributedString(text)
        }

        var attrString = AttributedString(text)
        let lowerText = text.lowercased()
        let lowerSearch = search.lowercased()

        var searchStart = lowerText.startIndex
        while let range = lowerText.range(of: lowerSearch, range: searchStart..<lowerText.endIndex) {
            if let attrRange = attrString.range(of: String(text[range])) {
                attrString[attrRange].backgroundColor = Color.accent.opacity(0.2)
            }
            searchStart = range.upperBound
        }

        return attrString
    }
}
