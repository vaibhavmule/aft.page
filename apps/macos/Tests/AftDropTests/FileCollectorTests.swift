import XCTest

@testable import AftDrop

final class FileCollectorTests: XCTestCase {
  func testCollectsSiteAndSkipsSecretsAndDependencies() throws {
    try withTemporaryDirectory { root in
      try Data("<h1>Hello</h1>".utf8).write(to: root.appending(path: "index.html"))
      try Data("body{}".utf8).write(to: root.appending(path: "style.css"))
      try Data("secret".utf8).write(to: root.appending(path: ".env.local"))
      let modules = root.appending(path: "node_modules", directoryHint: .isDirectory)
      try FileManager.default.createDirectory(at: modules, withIntermediateDirectories: true)
      try Data("ignored".utf8).write(to: modules.appending(path: "module.js"))

      let files = try FileCollector.collect(root: root)
      XCTAssertEqual(files.map(\.path), ["index.html", "style.css"])
    }
  }

  func testRequiresRootIndex() throws {
    try withTemporaryDirectory { root in
      try Data("body{}".utf8).write(to: root.appending(path: "style.css"))
      XCTAssertThrowsError(try FileCollector.collect(root: root)) { error in
        XCTAssertEqual(error as? AftDropError, .missingIndex)
      }
    }
  }

  func testRejectsMoreThanTwoHundredFiles() throws {
    try withTemporaryDirectory { root in
      try Data("ok".utf8).write(to: root.appending(path: "index.html"))
      for index in 0..<200 {
        try Data("x".utf8).write(to: root.appending(path: "file-\(index).txt"))
      }
      XCTAssertThrowsError(try FileCollector.collect(root: root)) { error in
        guard case .tooManyFiles(let count) = error as? AftDropError else {
          return XCTFail("Expected tooManyFiles, got \(error)")
        }
        XCTAssertEqual(count, 201)
      }
    }
  }

  func testMultipartUsesApiFieldShape() throws {
    try withTemporaryDirectory { root in
      let index = root.appending(path: "index.html")
      try Data("<h1>Hello</h1>".utf8).write(to: index)
      let file = CollectedFile(url: index, path: "index.html", size: 14)
      let body = try MultipartBodyWriter.write(files: [file], boundary: "test-boundary")
      defer { try? FileManager.default.removeItem(at: body) }
      let text = try String(contentsOf: body, encoding: .utf8)
      XCTAssertTrue(text.contains("name=\"file0\"; filename=\"index.html\""))
      XCTAssertTrue(text.contains("name=\"file0_path\""))
      XCTAssertTrue(text.contains("index.html"))
      XCTAssertTrue(text.hasSuffix("--test-boundary--\r\n"))
    }
  }

  func testExtractsStaticZipWithCommonTopFolder() async throws {
    try await withTemporaryDirectoryAsyncForFiles { root in
      let site = root.appending(path: "site", directoryHint: .isDirectory)
      try FileManager.default.createDirectory(at: site, withIntermediateDirectories: true)
      try Data("<h1>ZIP</h1>".utf8).write(to: site.appending(path: "index.html"))
      let archive = root.appending(path: "site.zip")
      try runProcess("/usr/bin/ditto", ["-c", "-k", "--keepParent", site.path, archive.path])

      let extracted = try await ArchiveExtractor().extract(archive)
      defer { removeExtractionContainer(extracted) }
      XCTAssertEqual(extracted.lastPathComponent, "site")
      XCTAssertEqual(try FileCollector.collect(root: extracted).map(\.path), ["index.html"])
    }
  }

  func testRejectsSymlinkInZip() async throws {
    try await withTemporaryDirectoryAsyncForFiles { root in
      let site = root.appending(path: "site", directoryHint: .isDirectory)
      try FileManager.default.createDirectory(at: site, withIntermediateDirectories: true)
      try Data("<h1>ZIP</h1>".utf8).write(to: site.appending(path: "index.html"))
      try FileManager.default.createSymbolicLink(
        at: site.appending(path: "outside"),
        withDestinationURL: URL(fileURLWithPath: "/tmp")
      )
      let archive = root.appending(path: "site.zip")
      try runProcess("/usr/bin/ditto", ["-c", "-k", "--keepParent", site.path, archive.path])

      do {
        let extracted = try await ArchiveExtractor().extract(archive)
        removeExtractionContainer(extracted)
        XCTFail("Expected the symbolic link to be rejected")
      } catch let error as AftDropError {
        guard case .unsafeArchive = error else { return XCTFail("Unexpected error: \(error)") }
      }
    }
  }
}

private func withTemporaryDirectoryAsyncForFiles(
  _ body: (URL) async throws -> Void
) async throws {
  let root = FileManager.default.temporaryDirectory
    .appending(path: "aft-drop-files-\(UUID().uuidString)", directoryHint: .isDirectory)
  try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
  defer { try? FileManager.default.removeItem(at: root) }
  try await body(root)
}

private func runProcess(_ executable: String, _ arguments: [String]) throws {
  let process = Process()
  process.executableURL = URL(fileURLWithPath: executable)
  process.arguments = arguments
  try process.run()
  process.waitUntilExit()
  XCTAssertEqual(process.terminationStatus, 0)
}

private func removeExtractionContainer(_ extracted: URL) {
  let container =
    extracted.lastPathComponent.hasPrefix("aft-drop-")
    ? extracted
    : extracted.deletingLastPathComponent()
  try? FileManager.default.removeItem(at: container)
}
