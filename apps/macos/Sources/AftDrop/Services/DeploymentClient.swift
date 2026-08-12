import Foundation

struct DeploymentCredentials: Sendable {
  var editToken: String?
  var bearerToken: String?
}

final class DeploymentClient: @unchecked Sendable {
  private let baseURL: URL
  private let session: URLSession

  init(
    baseURL: URL = URL(string: "https://api.aft.page")!,
    session: URLSession = .shared
  ) {
    self.baseURL = baseURL
    self.session = session
  }

  func deploy(
    files: [CollectedFile],
    slug: String?,
    credentials: DeploymentCredentials
  ) async throws -> DeployResponse {
    var components = URLComponents(
      url: baseURL.appending(path: "/v1/deploy"),
      resolvingAgainstBaseURL: false
    )!
    if let slug, !slug.isEmpty {
      components.queryItems = [URLQueryItem(name: "slug", value: slug)]
    }
    guard let endpoint = components.url else { throw AftDropError.invalidResponse }

    let boundary = "aft-drop-\(UUID().uuidString)"
    let bodyURL = try MultipartBodyWriter.write(files: files, boundary: boundary)
    defer { try? FileManager.default.removeItem(at: bodyURL) }

    var request = URLRequest(url: endpoint)
    request.httpMethod = slug == nil ? "POST" : "PATCH"
    request.setValue(
      "multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
    request.setValue("mac", forHTTPHeaderField: "X-Aft-Client")
    if let editToken = credentials.editToken {
      request.setValue(editToken, forHTTPHeaderField: "X-Aft-Edit-Token")
    } else if let bearerToken = credentials.bearerToken {
      request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
    }

    let (data, response) = try await session.upload(for: request, fromFile: bodyURL)
    guard let http = response as? HTTPURLResponse else {
      throw AftDropError.invalidResponse
    }
    guard (200..<300).contains(http.statusCode) else {
      let body = try? JSONDecoder().decode(APIErrorBody.self, from: data)
      let message =
        body?.hint ?? body?.message ?? body?.error ?? "Deploy failed (\(http.statusCode))."
      throw AftDropError.api(status: http.statusCode, message: message)
    }
    guard let result = try? JSONDecoder().decode(DeployResponse.self, from: data) else {
      throw AftDropError.invalidResponse
    }
    return result
  }
}

enum MultipartBodyWriter {
  static func write(files: [CollectedFile], boundary: String) throws -> URL {
    let output = FileManager.default.temporaryDirectory
      .appending(path: "aft-upload-\(UUID().uuidString).multipart")
    FileManager.default.createFile(atPath: output.path, contents: nil)
    let handle = try FileHandle(forWritingTo: output)
    defer { try? handle.close() }

    func write(_ string: String) throws {
      try handle.write(contentsOf: Data(string.utf8))
    }

    for (index, file) in files.enumerated() {
      let field = "file\(index)"
      let filename = safeHeaderValue(file.url.lastPathComponent)
      try write("--\(boundary)\r\n")
      try write("Content-Disposition: form-data; name=\"\(field)\"; filename=\"\(filename)\"\r\n")
      try write("Content-Type: \(mimeType(for: file.path))\r\n\r\n")
      let input = try FileHandle(forReadingFrom: file.url)
      defer { try? input.close() }
      while let data = try input.read(upToCount: 512 * 1024), !data.isEmpty {
        try handle.write(contentsOf: data)
      }
      try write("\r\n")

      try write("--\(boundary)\r\n")
      try write("Content-Disposition: form-data; name=\"\(field)_path\"\r\n\r\n")
      try write(file.path)
      try write("\r\n")
    }
    try write("--\(boundary)--\r\n")
    return output
  }

  private static func safeHeaderValue(_ value: String) -> String {
    value.replacingOccurrences(of: "\"", with: "_")
      .replacingOccurrences(of: "\r", with: "_")
      .replacingOccurrences(of: "\n", with: "_")
  }

  private static func mimeType(for path: String) -> String {
    switch URL(fileURLWithPath: path).pathExtension.lowercased() {
    case "html", "htm": return "text/html; charset=utf-8"
    case "css": return "text/css; charset=utf-8"
    case "js", "mjs": return "text/javascript; charset=utf-8"
    case "json", "map": return "application/json"
    case "svg": return "image/svg+xml"
    case "png": return "image/png"
    case "jpg", "jpeg": return "image/jpeg"
    case "gif": return "image/gif"
    case "webp": return "image/webp"
    case "ico": return "image/x-icon"
    case "woff": return "font/woff"
    case "woff2": return "font/woff2"
    case "txt": return "text/plain; charset=utf-8"
    default: return "application/octet-stream"
    }
  }
}
