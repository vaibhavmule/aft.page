import Foundation

enum SourceKind: String, Codable, CaseIterable {
  case folder
  case zip
  case file
}

enum FrameworkKind: String, Codable, CaseIterable {
  case staticHTML = "Static HTML"
  case vite = "Vite"
  case createReactApp = "Create React App"
  case rsbuild = "Rsbuild"
  case nextStatic = "Next.js static export"
  case unsupportedNextSSR = "Next.js SSR"
  case unknown = "Unknown"
}

enum PackageManager: String, Codable, CaseIterable, Identifiable {
  case npm
  case pnpm
  case yarn
  case bun

  var id: String { rawValue }

  func installArguments(at root: URL) -> [String] {
    let fm = FileManager.default
    switch self {
    case .npm:
      return fm.fileExists(atPath: root.appending(path: "package-lock.json").path)
        ? ["ci"] : ["install"]
    case .pnpm:
      return fm.fileExists(atPath: root.appending(path: "pnpm-lock.yaml").path)
        ? ["install", "--frozen-lockfile"] : ["install"]
    case .yarn:
      if fm.fileExists(atPath: root.appending(path: ".yarnrc.yml").path) {
        return ["install", "--immutable"]
      }
      return fm.fileExists(atPath: root.appending(path: "yarn.lock").path)
        ? ["install", "--frozen-lockfile"] : ["install"]
    case .bun:
      let hasLock =
        fm.fileExists(atPath: root.appending(path: "bun.lock").path)
        || fm.fileExists(atPath: root.appending(path: "bun.lockb").path)
      return hasLock ? ["install", "--frozen-lockfile"] : ["install"]
    }
  }

  func buildArguments(script: String) -> [String] {
    ["run", script]
  }
}

struct ProjectDetection: Equatable {
  let framework: FrameworkKind
  let label: String
  let outputDirectory: String
  let buildScript: String?
  let packageManager: PackageManager?
  let isDeployable: Bool
  let note: String?

  var requiresBuild: Bool { buildScript != nil }
}

struct CollectedFile: Sendable, Equatable {
  let url: URL
  let path: String
  let size: Int64
}

struct PreparedDeployment: Sendable {
  let sourceURL: URL
  let uploadRoot: URL
  let temporaryRoot: URL?
  let detection: ProjectDetection
  let files: [CollectedFile]

  func cleanUp() {
    guard let temporaryRoot else { return }
    try? FileManager.default.removeItem(at: temporaryRoot)
  }
}

struct DeployResponse: Decodable, Sendable {
  let ok: Bool?
  let slug: String
  let deployId: String
  let url: URL
  let files: Int
  let bytes: Int
  let editToken: String?
  let claimUrl: URL?
  let owned: Bool?
  let notice: String?
}

struct AuthExchangeResponse: Decodable, Sendable {
  let token: String
  let email: String?
  let expiresAt: String?
}

struct APIErrorBody: Decodable {
  let error: String?
  let message: String?
  let hint: String?
}

enum AftDropError: LocalizedError, Equatable {
  case unsupportedInput
  case missingIndex
  case tooManyFiles(Int)
  case fileTooLarge(String)
  case payloadTooLarge
  case unsafeArchive(String)
  case unsupportedProject(String)
  case missingPackageManager(String)
  case buildFailed(String)
  case api(status: Int, message: String)
  case invalidResponse
  case cancelled

  var errorDescription: String? {
    switch self {
    case .unsupportedInput:
      return "Drop a website folder, an .html file, or a .zip file."
    case .missingIndex:
      return "Include index.html at the root of the site output."
    case .tooManyFiles(let count):
      return "The site contains \(count) files; aft.page accepts up to \(FileCollector.maximumFiles)."
    case .fileTooLarge(let path):
      return "\(path) is larger than the \(FileCollector.maximumFileBytes / (1024 * 1024)) MB per-file limit."
    case .payloadTooLarge:
      return "The site is larger than the \(FileCollector.maximumTotalBytes / (1024 * 1024)) MB upload limit."
    case .unsafeArchive(let path):
      return "The ZIP contains an unsafe path or symbolic link: \(path)."
    case .unsupportedProject(let note):
      return note
    case .missingPackageManager(let name):
      return "Could not find \(name). Install it, then try again."
    case .buildFailed(let detail):
      return detail
    case .api(_, let message):
      return message
    case .invalidResponse:
      return "aft.page returned an invalid response."
    case .cancelled:
      return "Deployment cancelled."
    }
  }
}
