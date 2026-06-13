import Foundation

/// Extracts hashtag tags from Markdown content.
///
/// Matches patterns like #work, #work/project, #life/reading.
/// Tags must be preceded by start-of-line, whitespace, or certain
/// punctuation to avoid false positives (e.g., C# code, URLs).
enum TagExtractor {
    /// Regular expression for matching hashtags.
    /// - Must start with # followed by word characters and optional / paths
    /// - Must be preceded by line start, space, or certain punctuation
    static let pattern = #"(?<=^|[\s(])#([\w/-]+)"#

    private static let regex: NSRegularExpression = {
        // [^\w#] or start-of-line, then #word/path
        try! NSRegularExpression(
            pattern: #"(?m)(?<=^|[\s(\[])(#[A-Za-z][\w/-]*)"#,
            options: []
        )
    }()

    /// Extract raw tag strings (including #) from content.
    static func extractRaw(from content: String) -> [String] {
        let nsContent = content as NSString
        let range = NSRange(location: 0, length: nsContent.length)
        var tags: [String] = []

        regex.enumerateMatches(in: content, range: range) { match, _, _ in
            guard let match = match else { return }
            let tag = nsContent.substring(with: match.range(at: 1))
            if !tag.isEmpty {
                tags.append(tag)
            }
        }

        // Deduplicate while preserving order
        var seen = Set<String>()
        return tags.filter { seen.insert($0).inserted }
    }

    /// Extract tag paths (without # prefix) from content.
    static func extract(from content: String) -> [String] {
        extractRaw(from: content).map { String($0.dropFirst()) }
    }
}

/// Represents a node in the tag tree.
struct TagNode: Identifiable, Hashable {
    let id: String          // full path, e.g. "work/project"
    let name: String        // display name, e.g. "project"
    let level: Int          // depth in the tree
    var noteCount: Int      // direct note count for this exact tag
    var totalCount: Int     // cumulative count including children
    var children: [TagNode]
}

/// Builds a hierarchical tag tree from a flat list of tag paths.
enum TagTreeBuilder {
    /// Build tree from tag paths. Each path may contain "/" for nesting.
    static func build(from tagPaths: [String]) -> [TagNode] {
        var rootChildren: [String: TagNode] = [:]

        for path in tagPaths {
            let parts = path.split(separator: "/").map(String.init)
            buildNode(at: parts, into: &rootChildren)
        }

        return rootChildren.values.sorted { $0.name < $1.name }
    }

    private static func buildNode(at parts: [String], into siblings: inout [String: TagNode], parentPath: String = "") {
        guard let firstPart = parts.first else { return }

        let currentPath = parentPath.isEmpty ? firstPart : "\(parentPath)/\(firstPart)"
        let fullPath = parentPath.isEmpty ? firstPart : "\(parentPath)/\(firstPart)"

        var node = siblings[firstPart] ?? TagNode(
            id: fullPath,
            name: firstPart,
            level: parentPath.split(separator: "/").count,
            noteCount: 0,
            totalCount: 0,
            children: []
        )

        if parts.count == 1 {
            node.noteCount += 1
        }

        if parts.count > 1 {
            var childDict = Dictionary(uniqueKeysWithValues: node.children.map { ($0.name, $0) })
            buildNode(at: Array(parts.dropFirst()), into: &childDict, parentPath: currentPath)
            node.children = childDict.values.sorted { $0.name < $1.name }
        }

        node.totalCount += 1
        siblings[firstPart] = node
    }
}
