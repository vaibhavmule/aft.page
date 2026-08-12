import Foundation

struct ArchiveExtractor {
  func extract(_ archive: URL) async throws -> URL {
    let listing = try await run("/usr/bin/unzip", arguments: ["-Z1", archive.path])
    let entries = listing.split(whereSeparator: \.isNewline).map(String.init)
    for path in entries {
      let normalized = path.replacingOccurrences(of: "\\", with: "/")
      let parts = normalized.split(separator: "/", omittingEmptySubsequences: false)
      if normalized.hasPrefix("/") || parts.contains("..") || normalized.contains("\u{0}") {
        throw AftDropError.unsafeArchive(path)
      }
    }

    let temporary = FileManager.default.temporaryDirectory
      .appending(path: "aft-drop-\(UUID().uuidString)", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)
    do {
      _ = try await run("/usr/bin/ditto", arguments: ["-x", "-k", archive.path, temporary.path])
      try validateExtractedTree(temporary)
      return try normalizedRoot(temporary)
    } catch {
      try? FileManager.default.removeItem(at: temporary)
      throw error
    }
  }

  private func normalizedRoot(_ temporary: URL) throws -> URL {
    let children = try FileManager.default.contentsOfDirectory(
      at: temporary,
      includingPropertiesForKeys: [.isDirectoryKey],
      options: [.skipsHiddenFiles]
    )
    if children.count == 1,
      (try children[0].resourceValues(forKeys: [.isDirectoryKey])).isDirectory == true
    {
      return children[0]
    }
    return temporary
  }

  private func validateExtractedTree(_ root: URL) throws {
    guard
      let enumerator = FileManager.default.enumerator(
        at: root,
        includingPropertiesForKeys: [.isSymbolicLinkKey],
        options: [],
        errorHandler: { _, _ in false }
      )
    else { return }
    let canonicalRoot = root.resolvingSymlinksInPath().standardizedFileURL.path + "/"
    for case let url as URL in enumerator {
      let values = try url.resourceValues(forKeys: [.isSymbolicLinkKey])
      if values.isSymbolicLink == true {
        throw AftDropError.unsafeArchive(url.lastPathComponent)
      }
      let canonical = url.resolvingSymlinksInPath().standardizedFileURL.path
      guard canonical.hasPrefix(canonicalRoot) else {
        throw AftDropError.unsafeArchive(url.lastPathComponent)
      }
    }
  }

  private func run(_ executable: String, arguments: [String]) async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
      let process = Process()
      let pipe = Pipe()
      process.executableURL = URL(fileURLWithPath: executable)
      process.arguments = arguments
      process.standardOutput = pipe
      process.standardError = pipe
      process.terminationHandler = { process in
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let output = String(decoding: data, as: UTF8.self)
        if process.terminationStatus == 0 {
          continuation.resume(returning: output)
        } else {
          continuation.resume(
            throwing: AftDropError.unsafeArchive(
              output.trimmingCharacters(in: .whitespacesAndNewlines))
          )
        }
      }
      do { try process.run() } catch { continuation.resume(throwing: error) }
    }
  }
}
