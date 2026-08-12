import Foundation
import XCTest

@testable import AftDrop

final class DeploymentClientTests: XCTestCase {
  override func tearDown() {
    MockURLProtocol.handler = nil
    super.tearDown()
  }

  func testAnonymousDeployUsesMultipartAndMacClient() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockURLProtocol.self]
    let session = URLSession(configuration: configuration)
    let client = DeploymentClient(
      baseURL: URL(string: "https://api.example.test")!, session: session)

    try await withTemporaryDirectoryAsync { root in
      let index = root.appending(path: "index.html")
      try Data("<h1>Hello</h1>".utf8).write(to: index)
      MockURLProtocol.handler = { request in
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Aft-Client"), "mac")
        XCTAssertNil(request.value(forHTTPHeaderField: "X-Aft-Edit-Token"))
        XCTAssertTrue(
          request.value(forHTTPHeaderField: "Content-Type")?.contains("multipart/form-data") == true
        )
        let json =
          #"{"ok":true,"slug":"hello","deployId":"dep_1","url":"https://hello.aft.page","files":1,"bytes":14,"editToken":"aft_edit_1","claimUrl":"https://aft.page/claim?slug=hello&token=aft_edit_1","owned":false}"#
        return (200, Data(json.utf8))
      }

      let response = try await client.deploy(
        files: [CollectedFile(url: index, path: "index.html", size: 14)],
        slug: nil,
        credentials: DeploymentCredentials()
      )
      XCTAssertEqual(response.slug, "hello")
      XCTAssertEqual(response.editToken, "aft_edit_1")
    }
  }

  func testRedeployUsesPatchAndEditToken() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [MockURLProtocol.self]
    let client = DeploymentClient(
      baseURL: URL(string: "https://api.example.test")!,
      session: URLSession(configuration: configuration)
    )

    try await withTemporaryDirectoryAsync { root in
      let index = root.appending(path: "index.html")
      try Data("ok".utf8).write(to: index)
      MockURLProtocol.handler = { request in
        XCTAssertEqual(request.httpMethod, "PATCH")
        XCTAssertEqual(request.url?.query, "slug=hello")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Aft-Edit-Token"), "aft_edit_1")
        let json =
          #"{"ok":true,"slug":"hello","deployId":"dep_2","url":"https://hello.aft.page","files":1,"bytes":2}"#
        return (200, Data(json.utf8))
      }
      _ = try await client.deploy(
        files: [CollectedFile(url: index, path: "index.html", size: 2)],
        slug: "hello",
        credentials: DeploymentCredentials(editToken: "aft_edit_1", bearerToken: nil)
      )
    }
  }

  func testBookmarkRoundTrip() throws {
    try withTemporaryDirectory { root in
      let data = try BookmarkService().make(for: root)
      let resolved = try BookmarkService().resolve(data)
      XCTAssertEqual(resolved.standardizedFileURL.path, root.standardizedFileURL.path)
    }
  }
}

private final class MockURLProtocol: URLProtocol, @unchecked Sendable {
  static var handler: ((URLRequest) throws -> (Int, Data))?

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    do {
      guard let handler = Self.handler else { throw AftDropError.invalidResponse }
      let (status, data) = try handler(request)
      let response = HTTPURLResponse(
        url: request.url!,
        statusCode: status,
        httpVersion: "HTTP/1.1",
        headerFields: ["Content-Type": "application/json"]
      )!
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }

  override func stopLoading() {}
}

private func withTemporaryDirectoryAsync(
  _ body: (URL) async throws -> Void
) async throws {
  let root = FileManager.default.temporaryDirectory
    .appending(path: "aft-drop-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
  try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
  defer { try? FileManager.default.removeItem(at: root) }
  try await body(root)
}
