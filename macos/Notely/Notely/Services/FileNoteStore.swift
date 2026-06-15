import Foundation
import Observation

@Observable
final class FileNoteStore {
    var notes: [FileNote] = []
    var workspaceURL: URL?
    var isOpen: Bool { workspaceURL != nil }

    private var fileWatcher: DispatchSourceFileSystemObject?
    private var pinnedFiles: Set<String> = []
    private let reloadQueue = DispatchQueue(label: "notely.fileNoteStore.reload", qos: .userInitiated)
    private var reloadGeneration = 0
    private var reloadDebounceItem: DispatchWorkItem?

    // MARK: - Open / Close workspace

    func openWorkspace(at url: URL) {
        closeWorkspace()
        workspaceURL = url
        ImageLoader.shared.setWorkspaceURL(url)
        AppSettings.workspacePath = url.path
        loadPinnedFiles()
        reloadNotes()
        startWatching()
    }

    func closeWorkspace() {
        fileWatcher?.cancel()
        fileWatcher = nil
        reloadDebounceItem?.cancel()
        reloadDebounceItem = nil
        reloadGeneration += 1
        notes = []
        workspaceURL = nil
        ImageLoader.shared.setWorkspaceURL(nil)
        ImageLoader.shared.setBaseURL(nil)
    }

    // MARK: - Load notes from disk

    func reloadNotes() {
        guard let workspaceURL else { return }
        let pinnedFiles = pinnedFiles
        reloadGeneration += 1
        let generation = reloadGeneration

        reloadQueue.async { [weak self] in
            let result = Self.scanNotes(in: workspaceURL, pinnedFiles: pinnedFiles)

            DispatchQueue.main.async {
                guard let self,
                      self.reloadGeneration == generation,
                      self.workspaceURL == workspaceURL else { return }
                self.notes = result
            }
        }
    }

    // MARK: - File operations

    @discardableResult
    func createNote(title: String? = nil) -> FileNote? {
        guard let workspaceURL else { return nil }
        let name = (title ?? "Untitled").sanitizeForFilename()
        var url = workspaceURL.appendingPathComponent("\(name).md")

        // Avoid overwrite
        var counter = 2
        while FileManager.default.fileExists(atPath: url.path) {
            url = workspaceURL.appendingPathComponent("\(name) \(counter).md")
            counter += 1
        }

        let initialContent = "# \(title ?? "Untitled")\n\n"
        try? initialContent.write(to: url, atomically: true, encoding: .utf8)

        let attrs: [FileAttributeKey: Any] = [
            .creationDate: Date(),
            .modificationDate: Date()
        ]
        try? FileManager.default.setAttributes(attrs, ofItemAtPath: url.path)

        let note = FileNote(
            id: url.path,
            url: url,
            title: TitleExtractor.extract(from: initialContent),
            content: initialContent,
            tags: TagExtractor.frontmatterTags(from: initialContent),
            createdAt: attrs[.creationDate] as? Date ?? Date(),
            updatedAt: attrs[.modificationDate] as? Date ?? Date(),
            pinned: false,
            relativePath: relativePath(of: url)
        )
        notes.insert(note, at: 0)
        scheduleReload()
        return note
    }

    func saveContent(_ content: String, to noteId: String) {
        guard let note = notes.first(where: { $0.id == noteId }) else { return }
        try? content.write(to: note.url, atomically: true, encoding: .utf8)
        // Update in-memory without full reload (avoids cursor jump)
        if let idx = notes.firstIndex(where: { $0.id == noteId }) {
            notes[idx].content = content
            notes[idx].title = TitleExtractor.extract(from: content)
            notes[idx].tags = TagExtractor.frontmatterTags(from: content)
            notes[idx].updatedAt = Date()
        }
    }

    func deleteNote(_ noteId: String) {
        guard let note = notes.first(where: { $0.id == noteId }) else { return }
        try? FileManager.default.removeItem(at: note.url)
        notes.removeAll(where: { $0.id == noteId })
    }

    func togglePin(_ noteId: String) {
        guard let idx = notes.firstIndex(where: { $0.id == noteId }) else { return }
        notes[idx].pinned.toggle()
        let path = notes[idx].url.path
        if notes[idx].pinned {
            pinnedFiles.insert(path)
        } else {
            pinnedFiles.remove(path)
        }
        savePinnedFiles()
        // Re-sort
        notes.sort { lhs, rhs in
            if lhs.pinned != rhs.pinned { return lhs.pinned }
            return lhs.updatedAt > rhs.updatedAt
        }
    }

    func renameNote(_ noteId: String, to newTitle: String) {
        guard let idx = notes.firstIndex(where: { $0.id == noteId }) else { return }
        let oldURL = notes[idx].url
        let newFilename = newTitle.sanitizeForFilename() + ".md"
        let newURL = oldURL.deletingLastPathComponent().appendingPathComponent(newFilename)

        guard newURL != oldURL else { return }
        guard !FileManager.default.fileExists(atPath: newURL.path) else { return }

        do {
            try FileManager.default.moveItem(at: oldURL, to: newURL)
            notes[idx] = FileNote(
                id: newURL.path,
                url: newURL,
                title: newTitle,
                content: notes[idx].content,
                tags: notes[idx].tags,
                createdAt: notes[idx].createdAt,
                updatedAt: Date(),
                pinned: notes[idx].pinned,
                relativePath: relativePath(of: newURL)
            )
        } catch {
            print("Rename failed: \(error)")
        }
    }

    // MARK: - File system watching

    private func startWatching() {
        guard let workspaceURL else { return }
        let fd = open(workspaceURL.path, O_EVTONLY)
        guard fd >= 0 else { return }

        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd,
            eventMask: [.write, .delete, .rename],
            queue: .main
        )

        source.setEventHandler { [weak self] in
            self?.scheduleReload()
        }
        source.setCancelHandler {
            close(fd)
        }
        source.resume()
        fileWatcher = source
    }

    private func scheduleReload() {
        reloadDebounceItem?.cancel()
        let item = DispatchWorkItem { [weak self] in
            self?.reloadNotes()
        }
        reloadDebounceItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: item)
    }

    // MARK: - Pinned files persistence

    private func loadPinnedFiles() {
        let raw = UserDefaults.standard.stringArray(forKey: "notely.pinnedFiles") ?? []
        pinnedFiles = Set(raw)
    }

    private func savePinnedFiles() {
        UserDefaults.standard.set(Array(pinnedFiles), forKey: "notely.pinnedFiles")
    }

    // MARK: - Helpers

    private func relativePath(of url: URL) -> String {
        guard let workspaceURL else { return url.lastPathComponent }
        return Self.relativePath(of: url, in: workspaceURL)
    }

    private static func scanNotes(in workspaceURL: URL, pinnedFiles: Set<String>) -> [FileNote] {
        let fm = FileManager.default
        var result: [FileNote] = []

        guard let enumerator = fm.enumerator(
            at: workspaceURL,
            includingPropertiesForKeys: [.creationDateKey, .contentModificationDateKey, .isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else {
            return []
        }

        for case let fileURL as URL in enumerator {
            let ext = fileURL.pathExtension.lowercased()
            guard ext == "md" || ext == "markdown" else { continue }

            let attrs = try? fm.attributesOfItem(atPath: fileURL.path)
            let content = (try? String(contentsOf: fileURL, encoding: .utf8)) ?? ""
            let createdAt = attrs?[.creationDate] as? Date ?? Date()
            let updatedAt = attrs?[.modificationDate] as? Date ?? Date()

            result.append(FileNote(
                id: fileURL.path,
                url: fileURL,
                title: TitleExtractor.extract(from: content),
                content: content,
                tags: TagExtractor.frontmatterTags(from: content),
                createdAt: createdAt,
                updatedAt: updatedAt,
                pinned: pinnedFiles.contains(fileURL.path),
                relativePath: relativePath(of: fileURL, in: workspaceURL)
            ))
        }

        return result.sorted { lhs, rhs in
            if lhs.pinned != rhs.pinned { return lhs.pinned }
            return lhs.updatedAt > rhs.updatedAt
        }
    }

    private static func relativePath(of url: URL, in workspaceURL: URL) -> String {
        let path = url.deletingLastPathComponent().path
        let root = workspaceURL.path
        if path.hasPrefix(root) {
            let rel = String(path.dropFirst(root.count))
            return rel.isEmpty ? "/" : rel
        }
        return "/"
    }
}

// MARK: - String sanitization

extension String {
    func sanitizeForFilename() -> String {
        let invalid = CharacterSet(charactersIn: "/\\:*?\"<>|")
        let sanitized = self
            .components(separatedBy: invalid)
            .joined(separator: "-")
            .trimmingCharacters(in: .whitespaces)
        return sanitized.isEmpty ? "Untitled" : sanitized
    }
}
