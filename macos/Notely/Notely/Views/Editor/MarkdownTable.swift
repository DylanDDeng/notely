import AppKit

/// An attachment whose visual representation stands in for a span of raw
/// Markdown. `markdownSource` is the exact text it replaces, so the document's
/// raw Markdown can always be reconstructed (see `WysiwygTextView.markdownString`).
protocol MarkdownBackedAttachment: AnyObject {
    var markdownSource: String { get }
}

/// Parsed structure of a GFM-style Markdown table.
struct MarkdownTable: Equatable {
    enum Alignment: Equatable { case left, center, right }
    var headers: [String]
    var alignments: [Alignment]
    var rows: [[String]]
    var columnCount: Int { headers.count }
}

/// One table found in a document: its raw character range plus the parsed table.
struct ParsedMarkdownTable {
    let range: NSRange
    let table: MarkdownTable
}

/// Detects GFM pipe tables in raw Markdown. A table is a row containing `|`
/// immediately followed by a delimiter row (`| --- | :--: |`), then zero or more
/// rows. Tables inside fenced code blocks are ignored.
enum MarkdownTableParser {

    static func tables(in text: NSString) -> [ParsedMarkdownTable] {
        var lines: [(range: NSRange, text: String)] = []
        text.enumerateSubstrings(in: NSRange(location: 0, length: text.length), options: [.byLines]) { sub, range, _, _ in
            lines.append((range, sub ?? ""))
        }

        // Mark which line indices are inside a fenced code block.
        var inFence = [Bool](repeating: false, count: lines.count)
        var fenced = false
        for (i, line) in lines.enumerated() {
            let t = line.text.trimmingCharacters(in: .whitespaces)
            if t.hasPrefix("```") || t.hasPrefix("~~~") {
                inFence[i] = true   // the fence line itself is "in" a block
                fenced.toggle()
                continue
            }
            inFence[i] = fenced
        }

        var results: [ParsedMarkdownTable] = []
        var i = 0
        while i < lines.count {
            guard !inFence[i] else { i += 1; continue }
            let header = lines[i].text
            if isTableRow(header), i + 1 < lines.count, !inFence[i + 1],
               isDelimiterRow(lines[i + 1].text),
               lines[i + 1].text.contains("|") || splitCells(header).count == 1 {
                var j = i + 2
                while j < lines.count, !inFence[j], isTableRow(lines[j].text) { j += 1 }
                let start = lines[i].range.location
                let lastLine = lines[j - 1].range
                let blockRange = NSRange(location: start, length: (lastLine.location + lastLine.length) - start)
                if let table = parse(header: header,
                                     delimiter: lines[i + 1].text,
                                     body: (i + 2..<j).map { lines[$0].text }) {
                    results.append(ParsedMarkdownTable(range: blockRange, table: table))
                }
                i = j
            } else {
                i += 1
            }
        }
        return results
    }

    static func isTableRow(_ line: String) -> Bool {
        let t = line.trimmingCharacters(in: .whitespaces)
        guard t.contains("|") else { return false }
        if t.hasPrefix("```") || t.hasPrefix("~~~") { return false }
        return true
    }

    static func isDelimiterRow(_ line: String) -> Bool {
        let t = line.trimmingCharacters(in: .whitespaces)
        guard t.contains("-") else { return false }
        return t.range(of: #"^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?$"#, options: .regularExpression) != nil
    }

    static func splitCells(_ line: String) -> [String] {
        var t = line.trimmingCharacters(in: .whitespaces)
        if t.hasPrefix("|") { t.removeFirst() }
        if t.hasSuffix("|") { t.removeLast() }
        return t.components(separatedBy: "|").map { $0.trimmingCharacters(in: .whitespaces) }
    }

    static func parse(header: String, delimiter: String, body: [String]) -> MarkdownTable? {
        let headers = splitCells(header)
        guard !headers.isEmpty else { return nil }
        var alignments = splitCells(delimiter).map { cell -> MarkdownTable.Alignment in
            let left = cell.hasPrefix(":"), right = cell.hasSuffix(":")
            if left && right { return .center }
            if right { return .right }
            return .left
        }
        while alignments.count < headers.count { alignments.append(.left) }
        if alignments.count > headers.count { alignments = Array(alignments.prefix(headers.count)) }

        let rows = body.map { line -> [String] in
            var cells = splitCells(line)
            while cells.count < headers.count { cells.append("") }
            if cells.count > headers.count { cells = Array(cells.prefix(headers.count)) }
            return cells
        }
        return MarkdownTable(headers: headers, alignments: alignments, rows: rows)
    }
}

/// A non-editable text attachment that draws a Markdown table as a bordered
/// grid. Double-clicking it (see `WysiwygTextView`) reveals the raw Markdown for
/// editing; `markdownSource` lets the raw document be reconstructed.
final class TableAttachment: NSTextAttachment, MarkdownBackedAttachment {
    let markdownSource: String

    init(table: MarkdownTable, markdownSource: String, font: NSFont, maxWidth: CGFloat) {
        self.markdownSource = markdownSource
        super.init(data: nil, ofType: nil)
        let rendered = TableAttachment.render(table: table, font: font, maxWidth: maxWidth)
        image = rendered
        bounds = NSRect(origin: .zero, size: rendered.size)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    static func render(table: MarkdownTable, font baseFont: NSFont, maxWidth: CGFloat) -> NSImage {
        let cols = max(1, table.columnCount)
        let headerFont = NSFontManager.shared.convert(baseFont, toHaveTrait: .boldFontMask)
        let border: CGFloat = 1
        let padH: CGFloat = 10
        let padV: CGFloat = 6

        let primary = NSColor(named: "PrimaryText") ?? .textColor
        let secondary = NSColor(named: "SecondaryText") ?? .secondaryLabelColor
        let borderColor = NSColor(named: "BorderColor") ?? .separatorColor
        let headerBg = (NSColor(named: "AccentColor") ?? .systemOrange).withAlphaComponent(0.06)

        let allRows: [[String]] = [table.headers] + table.rows
        func font(forRow r: Int) -> NSFont { r == 0 ? headerFont : baseFont }
        func color(forRow r: Int) -> NSColor { r == 0 ? primary : secondary }
        func cell(_ r: Int, _ c: Int) -> String { c < allRows[r].count ? allRows[r][c] : "" }
        func textWidth(_ s: String, _ f: NSFont) -> CGFloat { (s as NSString).size(withAttributes: [.font: f]).width }

        var natural = [CGFloat](repeating: 8, count: cols)
        for r in 0..<allRows.count {
            let f = font(forRow: r)
            for c in 0..<cols { natural[c] = max(natural[c], textWidth(cell(r, c), f)) }
        }
        let chrome = border * CGFloat(cols + 1) + padH * 2 * CGFloat(cols)
        let availText = max(CGFloat(cols) * 30, maxWidth - chrome)
        let totalNatural = max(1, natural.reduce(0, +))
        var colW = natural
        if totalNatural > availText {
            let scale = availText / totalNatural
            colW = natural.map { max(30, floor($0 * scale)) }
        }
        let totalWidth = ceil(colW.reduce(0, +) + chrome)

        func cellHeight(_ s: String, _ width: CGFloat, _ f: NSFont) -> CGFloat {
            let attr = NSAttributedString(string: s.isEmpty ? " " : s, attributes: [.font: f])
            let r = attr.boundingRect(with: NSSize(width: width, height: 1_000_000),
                                      options: [.usesLineFragmentOrigin, .usesFontLeading])
            return ceil(r.height)
        }
        var rowH = [CGFloat]()
        for r in 0..<allRows.count {
            let f = font(forRow: r)
            var h: CGFloat = 0
            for c in 0..<cols { h = max(h, cellHeight(cell(r, c), colW[c] - padH * 2, f)) }
            rowH.append(h + padV * 2)
        }
        let totalHeight = ceil(rowH.reduce(0, +) + border * CGFloat(allRows.count + 1))
        let size = NSSize(width: max(totalWidth, 1), height: max(totalHeight, 1))

        return NSImage(size: size, flipped: true) { _ in
            // Header background.
            headerBg.setFill()
            NSRect(x: 0, y: 0, width: size.width, height: rowH[0] + border).fill()

            // Grid lines.
            borderColor.setStroke()
            let path = NSBezierPath()
            path.lineWidth = border
            var yc: CGFloat = border / 2
            path.move(to: NSPoint(x: 0, y: yc)); path.line(to: NSPoint(x: size.width, y: yc))
            yc = 0
            for r in 0..<allRows.count {
                yc += rowH[r] + border
                path.move(to: NSPoint(x: 0, y: yc - border / 2)); path.line(to: NSPoint(x: size.width, y: yc - border / 2))
            }
            var xc: CGFloat = border / 2
            path.move(to: NSPoint(x: xc, y: 0)); path.line(to: NSPoint(x: xc, y: size.height))
            xc = 0
            for c in 0..<cols {
                xc += colW[c] + border
                path.move(to: NSPoint(x: xc - border / 2, y: 0)); path.line(to: NSPoint(x: xc - border / 2, y: size.height))
            }
            path.stroke()

            // Cell text.
            var rowY: CGFloat = border
            for r in 0..<allRows.count {
                var colX: CGFloat = border
                let f = font(forRow: r)
                for c in 0..<cols {
                    let para = NSMutableParagraphStyle()
                    switch (table.alignments.indices.contains(c) ? table.alignments[c] : .left) {
                    case .left: para.alignment = .left
                    case .center: para.alignment = .center
                    case .right: para.alignment = .right
                    }
                    para.lineBreakMode = .byWordWrapping
                    let attrs: [NSAttributedString.Key: Any] = [
                        .font: f, .foregroundColor: color(forRow: r), .paragraphStyle: para,
                    ]
                    let rect = NSRect(x: colX + padH, y: rowY + padV,
                                      width: max(1, colW[c] - padH * 2), height: rowH[r] - padV * 2)
                    (cell(r, c) as NSString).draw(in: rect, withAttributes: attrs)
                    colX += colW[c] + border
                }
                rowY += rowH[r] + border
            }
            return true
        }
    }
}
