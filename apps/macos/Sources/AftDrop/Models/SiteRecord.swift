import Foundation
import SwiftData

@Model
final class SiteRecord {
  @Attribute(.unique) var id: UUID
  var displayName: String
  var slug: String
  var liveURL: String
  var sourcePath: String
  var sourceIdentifier: String
  @Attribute(.externalStorage) var sourceBookmark: Data
  var sourceKindRaw: String
  var frameworkRaw: String
  var packageManagerRaw: String?
  var buildScript: String
  var outputDirectory: String
  var trustedBuild: Bool
  var ownershipRaw: String
  var createdAt: Date
  var lastDeployAt: Date
  var lastStatus: String

  init(
    id: UUID = UUID(),
    displayName: String,
    slug: String,
    liveURL: URL,
    sourceURL: URL,
    sourceIdentifier: String,
    sourceBookmark: Data,
    sourceKind: SourceKind,
    detection: ProjectDetection,
    trustedBuild: Bool,
    owned: Bool
  ) {
    self.id = id
    self.displayName = displayName
    self.slug = slug
    self.liveURL = liveURL.absoluteString
    self.sourcePath = sourceURL.path
    self.sourceIdentifier = sourceIdentifier
    self.sourceBookmark = sourceBookmark
    self.sourceKindRaw = sourceKind.rawValue
    self.frameworkRaw = detection.framework.rawValue
    self.packageManagerRaw = detection.packageManager?.rawValue
    self.buildScript = detection.buildScript ?? "build"
    self.outputDirectory = detection.outputDirectory
    self.trustedBuild = trustedBuild
    self.ownershipRaw = owned ? "owned" : "anonymous"
    self.createdAt = Date()
    self.lastDeployAt = Date()
    self.lastStatus = "Live"
  }

  var liveURLValue: URL? { URL(string: liveURL) }
  var sourceKind: SourceKind { SourceKind(rawValue: sourceKindRaw) ?? .folder }
  var framework: FrameworkKind { FrameworkKind(rawValue: frameworkRaw) ?? .unknown }
  var packageManager: PackageManager? {
    packageManagerRaw.flatMap(PackageManager.init(rawValue:))
  }
  var isOwned: Bool { ownershipRaw == "owned" }
}
