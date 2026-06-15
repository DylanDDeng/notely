import Foundation

/// Extracts a display title from note content.
///
/// Rules:
/// 1. If the first non-empty line starts with "# ", use the heading text
/// 2. Otherwise use the first non-empty line, stripped of Markdown markers
/// 3. If content is empty, return "Untitled"
/// 4. Truncate to 80 characters
enum TitleExtractor {
    private static let sanitizeRules: [(NSRegularExpression, String)] = [
        (#"^#+\s*"#, ""),
        (#"^\*\s+"#, ""),
        (#"^-\s+"#, ""),
        (#"^\d+\.\s+"#, ""),
        (#"^>\s*"#, ""),
        (#"^[-*_]{3,}$"#, ""),
        (#"\*\*(.+?)\*\*"#, "$1"),
        (#"\*(.+?)\*"#, "$1"),
        (#"~~(.+?)~~"#, "$1"),
        (#"`([^`]+)`"#, "$1"),
        (#"\[([^\]]+)\]\([^)]+\)"#, "$1"),
        (#"#\S+"#, ""),
    ].compactMap { pattern, replacement in
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        return (regex, replacement)
    }

    static func extract(from content: String) -> String {
        for line in content.split(separator: "\n", omittingEmptySubsequences: false) {
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

        for (regex, replacement) in sanitizeRules {
            let range = NSRange(location: 0, length: (result as NSString).length)
            result = regex.stringByReplacingMatches(in: result, range: range, withTemplate: replacement)
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
