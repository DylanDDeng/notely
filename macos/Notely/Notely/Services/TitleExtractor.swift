import Foundation

/// Extracts a display title from note content.
///
/// Rules:
/// 1. If the first non-empty line starts with "# ", use the heading text
/// 2. Otherwise use the first non-empty line, stripped of Markdown markers
/// 3. If content is empty, return "Untitled"
/// 4. Truncate to 80 characters
enum TitleExtractor {
    static func extract(from content: String) -> String {
        for line in content.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty { continue }

            // H1 heading
            if trimmed.hasPrefix("# ") {
                let title = String(trimmed.dropFirst(2)).trimmingCharacters(in: .whitespaces)
                return sanitize(title)
            }

            // Skip frontmatter delimiter
            if trimmed == "---" { continue }

            return sanitize(trimmed)
        }
        return ""
    }

    static var untitled: String { "Untitled" }

    private static func sanitize(_ text: String) -> String {
        var result = text

        // Remove common Markdown markers for a clean title
        let patterns: [(String, String)] = [
            (#"^#+\s*"#, ""),              // Headings
            (#"^\*\s+"#, ""),               // Unordered list
            (#"^-\s+"#, ""),                // Unordered list
            (#"^\d+\.\s+"#, ""),            // Ordered list
            (#"^>\s*"#, ""),                // Blockquote
            (#"^[-*_]{3,}$"#, ""),          // HR
            (#"\*\*(.+?)\*\*"#, "$1"),      // Bold
            (#"\*(.+?)\*"#, "$1"),          // Italic
            (#"~~(.+?)~~"#, "$1"),          // Strikethrough
            (#"`([^`]+)`"#, "$1"),          // Inline code
            (#"\[([^\]]+)\]\([^)]+\)"#, "$1"), // Links
            (#"#\S+"#, ""),                 // Hashtags
        ]

        for (pattern, replacement) in patterns {
            result = result.replacingOccurrences(
                of: pattern,
                with: replacement,
                options: .regularExpression
            )
        }

        result = result.trimmingCharacters(in: .whitespaces)

        // Truncate to 80 characters
        if result.count > 80 {
            let endIndex = result.index(result.startIndex, offsetBy: 80)
            result = String(result[..<endIndex]) + "..."
        }

        return result.isEmpty ? untitled : result
    }
}
