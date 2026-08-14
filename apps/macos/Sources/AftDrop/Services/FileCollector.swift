import Foundation

struct FileCollector {
  static let maximumFiles = 500
  static let maximumFileBytes: Int64 = 25 * 1024 * 1024
  static let maximumTotalBytes: Int64 = 100 * 1024 * 1024

  private static let ignoredDirectories: Set<String> = [
    ".git", ".aft", "node_modules",
  ]
  private static let ignoredFiles: Set<String> = [".DS_Store"]

  static func collect(root: URL, fileManager: FileManager = .default) throws -> [CollectedFile] {
    let root = root.standardizedFileURL
    guard
      let enumerator = fileManager.enumerator(
        at: root,
        includingPropertiesForKeys: [
          .isRegularFileKey, .isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey,
        ],
        options: [.skipsHiddenFiles],
        errorHandler: { _, _ in true }
      )
    else {
      throw AftDropError.unsupportedInput
    }

    var files: [CollectedFile] = []
    var total: Int64 = 0
    for case let url as URL in enumerator {
      let relative = relativePath(url, root: root)
      let parts = relative.split(separator: "/").map(String.init)
      if parts.contains(where: { ignoredDirectories.contains($0) }) {
        enumerator.skipDescendants()
        continue
      }
      if parts.contains(where: { $0 == ".env" || $0.hasPrefix(".env.") })
        || ignoredFiles.contains(url.lastPathComponent)
      {
        continue
      }

      let values = try url.resourceValues(forKeys: [
        .isRegularFileKey, .isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey,
      ])
      if values.isSymbolicLink == true {
        continue
      }
      guard values.isRegularFile == true else { continue }
      let size = Int64(values.fileSize ?? 0)
      if size > maximumFileBytes {
        throw AftDropError.fileTooLarge(relative)
      }
      total += size
      if total > maximumTotalBytes {
        throw AftDropError.payloadTooLarge
      }
      files.append(CollectedFile(url: url, path: relative, size: size))
      if files.count > maximumFiles {
        throw AftDropError.tooManyFiles(files.count)
      }
    }

    guard files.contains(where: { $0.path.lowercased() == "index.html" }) else {
      throw AftDropError.missingIndex
    }
    return files.sorted { $0.path.localizedStandardCompare($1.path) == .orderedAscending }
  }

  static func relativePath(_ url: URL, root: URL) -> String {
    let rootPath = root.standardizedFileURL.path(percentEncoded: false)
      .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let path = url.standardizedFileURL.path(percentEncoded: false)
      .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    guard path.hasPrefix(rootPath + "/") else { return url.lastPathComponent }
    return String(path.dropFirst(rootPath.count + 1))
  }
}
