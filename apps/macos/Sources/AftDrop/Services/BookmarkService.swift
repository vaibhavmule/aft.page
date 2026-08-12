import Foundation

struct BookmarkService {
  func make(for url: URL) throws -> Data {
    try url.bookmarkData(
      options: [.withSecurityScope],
      includingResourceValuesForKeys: [.fileResourceIdentifierKey],
      relativeTo: nil
    )
  }

  func resolve(_ data: Data) throws -> URL {
    var stale = false
    let url = try URL(
      resolvingBookmarkData: data,
      options: [.withSecurityScope],
      relativeTo: nil,
      bookmarkDataIsStale: &stale
    )
    return url
  }

  func identifier(for url: URL) -> String {
    let values = try? url.resourceValues(forKeys: [.fileResourceIdentifierKey])
    if let identifier = values?.fileResourceIdentifier {
      return String(describing: identifier)
    }
    return url.standardizedFileURL.path
  }
}
