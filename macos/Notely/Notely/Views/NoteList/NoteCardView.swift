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

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 5) {
                    Text(highlighted(note.title.isEmpty ? "Untitled" : note.title))
                        .font(.notely(14, weight: .semibold))
                        .foregroundColor(.primaryText)
                        .lineLimit(1)
                        .truncationMode(.tail)

                    if note.pinned {
                        Image(systemName: "pin.fill")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.accent)
                    }
                    Spacer(minLength: 0)
                }

                Text(highlighted(summary))
                    .font(.notely(13))
                    .foregroundColor(.secondaryText)
                    .lineLimit(2)
                    .lineSpacing(2)
                    .truncationMode(.tail)

                HStack(spacing: 7) {
                    Text(note.updatedAt.formatted(.relative(presentation: .named)))
                        .font(.notely(11))
                        .foregroundColor(.tertiaryText)

                    ForEach(note.tags.prefix(2), id: \.self) { tag in
                        Text("#\(tag)")
                            .font(.notely(11, weight: .medium))
                            .foregroundColor(isSelected ? .accent : .secondaryText)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(
                                Capsule()
                                    .fill(isSelected ? Color.accent.opacity(0.10) : Color.primaryText.opacity(0.04))
                            )
                    }

                    if note.tags.count > 2 {
                        Text("+\(note.tags.count - 2)")
                            .font(.notely(11))
                            .foregroundColor(.tertiaryText)
                    }

                    Spacer(minLength: 0)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .frame(height: 108)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            isSelected
                ? Color.accentSelected
                : (isHovered ? Color.cardHover : Color.clear)
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
