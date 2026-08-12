import XCTest

@testable import AftDrop

final class ProjectDetectorTests: XCTestCase {
  func testDetectsStaticSite() throws {
    try withTemporaryDirectory { root in
      try Data("<h1>Hello</h1>".utf8).write(to: root.appending(path: "index.html"))
      let detected = ProjectDetector().detect(at: root)
      XCTAssertEqual(detected.framework, .staticHTML)
      XCTAssertTrue(detected.isDeployable)
      XCTAssertFalse(detected.requiresBuild)
    }
  }

  func testDetectsReactViteAndPnpm() throws {
    try withTemporaryDirectory { root in
      try writeJSON(
        [
          "scripts": ["build": "vite build"],
          "dependencies": ["vite": "latest", "react": "latest"],
        ],
        to: root.appending(path: "package.json")
      )
      FileManager.default.createFile(
        atPath: root.appending(path: "pnpm-lock.yaml").path, contents: Data())
      let detected = ProjectDetector().detect(at: root)
      XCTAssertEqual(detected.framework, .vite)
      XCTAssertEqual(detected.label, "React (Vite)")
      XCTAssertEqual(detected.outputDirectory, "dist")
      XCTAssertEqual(detected.packageManager, .pnpm)
      XCTAssertEqual(detected.buildScript, "build")
    }
  }

  func testRejectsNextSSR() throws {
    try withTemporaryDirectory { root in
      try writeJSON(
        [
          "scripts": ["build": "next build"],
          "dependencies": ["next": "latest"],
        ],
        to: root.appending(path: "package.json")
      )
      let detected = ProjectDetector().detect(at: root)
      XCTAssertEqual(detected.framework, .unsupportedNextSSR)
      XCTAssertFalse(detected.isDeployable)
      XCTAssertTrue(detected.note?.contains("static") == true)
    }
  }

  func testAcceptsNextStaticExport() throws {
    try withTemporaryDirectory { root in
      try writeJSON(
        [
          "scripts": ["build": "next build"],
          "dependencies": ["next": "latest"],
        ],
        to: root.appending(path: "package.json")
      )
      try Data("export default { output: 'export' }".utf8)
        .write(to: root.appending(path: "next.config.mjs"))
      let detected = ProjectDetector().detect(at: root)
      XCTAssertEqual(detected.framework, .nextStatic)
      XCTAssertEqual(detected.outputDirectory, "out")
      XCTAssertTrue(detected.isDeployable)
    }
  }
}

func withTemporaryDirectory(_ body: (URL) throws -> Void) throws {
  let root = FileManager.default.temporaryDirectory
    .appending(path: "aft-drop-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
  try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
  defer { try? FileManager.default.removeItem(at: root) }
  try body(root)
}

func writeJSON(_ object: Any, to url: URL) throws {
  try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]).write(to: url)
}
