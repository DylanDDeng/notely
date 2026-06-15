import SwiftUI

struct NoteCardView: View {
    let note: FileNote
    let isSelected: Bool
    var searchText: String = ""
    let onSelect: () -> Void
    @Environment(FileNoteStore.self) var store
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
                HStack(spacing: 5) {
                    Text(highlighted(note.title.isEmpty ? note.filename : note.title))
                        .font(.system(size: 14, weight: isSelected ? .semibold : .medium))
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
                .padding(.bottom, 1)

                Text(highlighted(summary))
                    .font(.system(size: 13))
                    .foregroundColor(isSelected ? .secondaryText : .tertiaryText)
                    .lineLimit(2)
                    .lineSpacing(2)
                    .truncationMode(.tail)
                    .padding(.bottom, 2)

                HStack(spacing: 6) {
                    Text(note.updatedAt.formatted(.relative(presentation: .named)))
                        .font(.system(size: 11))
                        .foregroundColor(.tertiaryText)

                    ForEach(note.tags.prefix(2), id: \.self) { tag in
                        Text("#\(tag)")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(isSelected ? .accent : .secondaryText)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 1)
                            .background(
                                Capsule()
                                    .fill(isSelected ? Color.accent.opacity(0.10) : Color.primaryText.opacity(0.04))
                            )
                    }

                    if note.tags.count > 2 {
                        Text("+\(note.tags.count - 2)")
                            .font(.system(size: 11))
                            .foregroundColor(.tertiaryText)
                    }

                    Spacer(minLength: 0)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            isSelected
                ? Color.accentSelected
                : (isHovered ? Color.cardHover : Color.clear)
        )
        .contentShape(Rectangle())
        .onTapGesture {
            onSelect()
        }
        .onHover { hovering in
            isHovered = hovering
        }
        .contextMenu {
            Button(note.pinned ? "Unpin" : "Pin") {
                store.togglePin(note.id)
            }
            Divider()
            Button("Delete", role: .destructive) {
                store.deleteNote(note.id)
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
