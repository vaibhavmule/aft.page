import AppKit
import Foundation
import SwiftData

struct BuildApproval: Identifiable {
  let id = UUID()
  let sourceURL: URL
  let detection: ProjectDetection
  let commands: [String]
  let needsInstall: Bool
  let isFirstBuild: Bool
}

@MainActor
final class AppModel: ObservableObject {
  enum Phase: Equatable {
    case idle
    case inspecting
    case awaitingTrust
    case building
    case uploading
    case live
    case failed

    var isBusy: Bool {
      switch self {
      case .inspecting, .awaitingTrust, .building, .uploading: return true
      default: return false
      }
    }
  }

  @Published var phase: Phase = .idle
  @Published var status = "Drop a Codex project to deploy it."
  @Published var logs: [String] = []
  @Published var errorMessage: String?
  @Published var buildApproval: BuildApproval?
  @Published var selectedSiteID: UUID?
  @Published var accountEmail: String?
  @Published var copiedURL = false

  private let context: ModelContext
  private let detector = ProjectDetector()
  private let buildRunner = BuildRunner()
  private let archiveExtractor = ArchiveExtractor()
  private let deploymentClient: DeploymentClient
  private let authCoordinator: AuthCoordinator
  private let bookmarks = BookmarkService()
  private let keychain: KeychainService
  private var currentTask: Task<Void, Never>?
  private var approvalContinuation: CheckedContinuation<Bool, Never>?

  init(
    context: ModelContext,
    deploymentClient: DeploymentClient = DeploymentClient(),
    authCoordinator: AuthCoordinator = AuthCoordinator(),
    keychain: KeychainService = .shared
  ) {
    self.context = context
    self.deploymentClient = deploymentClient
    self.authCoordinator = authCoordinator
    self.keychain = keychain
    self.accountEmail = keychain.get(.accountEmail)
  }

  deinit {
    currentTask?.cancel()
    approvalContinuation?.resume(returning: false)
  }

  func handle(_ url: URL) {
    guard !phase.isBusy else {
      errorMessage = "Finish or cancel the current deployment first."
      return
    }
    copiedURL = false
    errorMessage = nil
    logs = []
    currentTask = Task { [weak self] in
      await self?.deploySource(url.standardizedFileURL)
    }
  }

  func redeploy(_ site: SiteRecord) {
    do {
      let source = try bookmarks.resolve(site.sourceBookmark)
      handle(source)
    } catch {
      fail("The source moved or is no longer available. Drop it again to reconnect it.")
    }
  }

  func approveBuild() {
    buildApproval = nil
    approvalContinuation?.resume(returning: true)
    approvalContinuation = nil
  }

  func declineBuild() {
    buildApproval = nil
    approvalContinuation?.resume(returning: false)
    approvalContinuation = nil
    phase = .idle
    status = "Build cancelled."
  }

  func cancel() {
    currentTask?.cancel()
    buildRunner.cancel()
    approvalContinuation?.resume(returning: false)
    approvalContinuation = nil
    buildApproval = nil
    phase = .idle
    status = "Deployment cancelled."
  }

  func signIn() {
    guard !phase.isBusy else { return }
    status = "Opening browser to sign in…"
    currentTask = Task { [weak self] in
      guard let self else { return }
      do {
        let auth = try await authCoordinator.signIn()
        try keychain.set(auth.token, for: .bearerToken)
        if let email = auth.email {
          try keychain.set(email, for: .accountEmail)
          accountEmail = email
        }
        status = "Signed in\(auth.email.map { " as \($0)" } ?? "")."
      } catch {
        fail(error.localizedDescription)
      }
    }
  }

  func signOut() {
    keychain.remove(.bearerToken)
    keychain.remove(.accountEmail)
    accountEmail = nil
    status = "Signed out. Anonymous deploy still works."
  }

  func openClaim(for site: SiteRecord) {
    guard let raw = keychain.get(.claimURL(site.id)), let url = URL(string: raw) else {
      errorMessage =
        site.isOwned
        ? "This site is already linked to an account."
        : "The claim link is no longer available."
      return
    }
    NSWorkspace.shared.open(url)
    status = "Claim the site in your browser, then sign in here to keep redeploying."
  }

  func open(_ site: SiteRecord) {
    guard let url = site.liveURLValue else { return }
    NSWorkspace.shared.open(url)
  }

  func copy(_ site: SiteRecord) {
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(site.liveURL, forType: .string)
    copiedURL = true
    Task { [weak self] in
      try? await Task.sleep(for: .seconds(2))
      self?.copiedURL = false
    }
  }

  func reveal(_ site: SiteRecord) {
    do {
      let url = try bookmarks.resolve(site.sourceBookmark)
      NSWorkspace.shared.activateFileViewerSelecting([url])
    } catch {
      errorMessage = "The source moved or is no longer available."
    }
  }

  @discardableResult
  func saveSettings(
    for site: SiteRecord,
    packageManager: PackageManager?,
    buildScript: String,
    outputDirectory: String
  ) -> Bool {
    let script = buildScript.trimmingCharacters(in: .whitespacesAndNewlines)
    let output = outputDirectory.trimmingCharacters(in: .whitespacesAndNewlines)
    guard isSafeScriptName(script) else {
      errorMessage =
        "Use a package script name containing only letters, numbers, periods, colons, underscores, or hyphens."
      return false
    }
    guard isSafeOutputDirectory(output) else {
      errorMessage = "The output folder must stay inside the project and cannot contain '..'."
      return false
    }
    site.packageManagerRaw = packageManager?.rawValue
    site.buildScript = script
    site.outputDirectory = output
    try? context.save()
    return true
  }

  func forget(_ site: SiteRecord) {
    keychain.remove(.editToken(site.id))
    keychain.remove(.claimURL(site.id))
    context.delete(site)
    try? context.save()
    if selectedSiteID == site.id { selectedSiteID = nil }
    status = "Forgot the local deployment record. The live site was not deleted."
  }

  private func deploySource(_ source: URL) async {
    let accessed = source.startAccessingSecurityScopedResource()
    defer { if accessed { source.stopAccessingSecurityScopedResource() } }
    var temporaryRoot: URL?
    do {
      try Task.checkCancellation()
      phase = .inspecting
      status = "Inspecting \(source.lastPathComponent)…"
      appendLog("Source: \(source.path)")

      let sourceKind: SourceKind
      let uploadRoot: URL
      var detection: ProjectDetection
      let existing = findSite(for: source)

      if source.pathExtension.lowercased() == "zip" {
        sourceKind = .zip
        uploadRoot = try await archiveExtractor.extract(source)
        temporaryRoot = temporaryContainer(for: uploadRoot)
        detection = ProjectDetection(
          framework: .staticHTML,
          label: "Static ZIP",
          outputDirectory: ".",
          buildScript: nil,
          packageManager: nil,
          isDeployable: true,
          note: nil
        )
      } else {
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: source.path, isDirectory: &isDirectory)
        else { throw AftDropError.unsupportedInput }

        if isDirectory.boolValue {
          sourceKind = .folder
          detection = detector.detect(at: source)
          if let existing,
            FileManager.default.fileExists(atPath: source.appending(path: "package.json").path)
          {
            detection = ProjectDetection(
              framework: existing.framework,
              label: existing.framework.rawValue,
              outputDirectory: existing.outputDirectory,
              buildScript: existing.buildScript,
              packageManager: existing.packageManager ?? detection.packageManager ?? .npm,
              isDeployable: true,
              note: nil
            )
          }
          guard detection.isDeployable else {
            throw AftDropError.unsupportedProject(
              detection.note ?? "This project cannot be deployed as a static site.")
          }

          if detection.requiresBuild {
            guard let packageManager = detection.packageManager,
              let buildScript = detection.buildScript
            else { throw AftDropError.unsupportedProject("No build command was detected.") }
            let needsInstall = !FileManager.default.fileExists(
              atPath: source.appending(path: "node_modules").path)
            let identifier = bookmarks.identifier(for: source)
            let isTrusted = existing?.trustedBuild == true || trustedIdentifiers.contains(identifier)
            if !isTrusted || needsInstall {
              phase = .awaitingTrust
              status =
                needsInstall
                ? "Build approval needed; dependencies are not installed."
                : "Build approval needed."
              let approved = await requestBuildApproval(
                BuildApproval(
                  sourceURL: source,
                  detection: detection,
                  commands: buildRunner.commandPreview(
                    root: source,
                    packageManager: packageManager,
                    script: buildScript,
                    needsInstall: needsInstall
                  ),
                  needsInstall: needsInstall,
                  isFirstBuild: !isTrusted
                )
              )
              guard approved else { throw AftDropError.cancelled }
              trust(identifier)
              existing?.trustedBuild = true
            }

            phase = .building
            status = "Building \(detection.label)…"
            appendLog("$ \(packageManager.rawValue) run \(buildScript)")
            try await buildRunner.run(
              root: source,
              packageManager: packageManager,
              script: buildScript,
              installDependencies: needsInstall,
              onLine: { [weak self] line in
                Task { @MainActor in self?.appendLog(line) }
              }
            )
            uploadRoot = source.appending(
              path: detection.outputDirectory, directoryHint: .isDirectory)
          } else {
            uploadRoot = source
          }
        } else {
          // A lone page can be named anything — the site still needs an index.
          guard ["html", "htm"].contains(source.pathExtension.lowercased()) else {
            throw AftDropError.unsupportedInput
          }
          sourceKind = .file
          uploadRoot = try stageSingleFile(source)
          temporaryRoot = temporaryContainer(for: uploadRoot)
          detection = ProjectDetection(
            framework: .staticHTML,
            label: "Static HTML",
            outputDirectory: ".",
            buildScript: nil,
            packageManager: nil,
            isDeployable: true,
            note: nil
          )
        }
      }

      try Task.checkCancellation()
      let files = try FileCollector.collect(root: uploadRoot)
      appendLog("Ready: \(files.count) files, \(formatBytes(files.reduce(0) { $0 + $1.size }))")
      phase = .uploading
      status = existing == nil ? "Publishing to aft.page…" : "Updating \(existing!.slug).aft.page…"

      let response = try await deploy(files: files, existing: existing)
      let site = try persist(
        response: response,
        existing: existing,
        source: source,
        sourceKind: sourceKind,
        detection: detection
      )
      phase = .live
      status = existing == nil ? "Live URL copied." : "Updated the same live URL."
      selectedSiteID = site.id
      copy(site)
      appendLog("Live: \(site.liveURL)")
    } catch is CancellationError {
      phase = .idle
      status = "Deployment cancelled."
    } catch let error as AftDropError where error == .cancelled {
      phase = .idle
      status = "Deployment cancelled."
    } catch {
      fail(error.localizedDescription)
    }
    if let temporaryRoot { try? FileManager.default.removeItem(at: temporaryRoot) }
  }

  private func deploy(files: [CollectedFile], existing: SiteRecord?) async throws -> DeployResponse
  {
    let bearer = keychain.get(.bearerToken)
    if let existing {
      let editToken = existing.isOwned ? nil : keychain.get(.editToken(existing.id))
      do {
        return try await deploymentClient.deploy(
          files: files,
          slug: existing.slug,
          credentials: DeploymentCredentials(
            editToken: editToken,
            bearerToken: editToken == nil ? bearer : nil
          )
        )
      } catch AftDropError.api(let status, _)
        where (status == 401 || status == 403) && editToken != nil && bearer != nil
      {
        let result = try await deploymentClient.deploy(
          files: files,
          slug: existing.slug,
          credentials: DeploymentCredentials(editToken: nil, bearerToken: bearer)
        )
        existing.ownershipRaw = "owned"
        keychain.remove(.editToken(existing.id))
        keychain.remove(.claimURL(existing.id))
        return result
      }
    }
    return try await deploymentClient.deploy(
      files: files,
      slug: nil,
      credentials: DeploymentCredentials(editToken: nil, bearerToken: bearer)
    )
  }

  private func persist(
    response: DeployResponse,
    existing: SiteRecord?,
    source: URL,
    sourceKind: SourceKind,
    detection: ProjectDetection
  ) throws -> SiteRecord {
    if let existing {
      existing.liveURL = response.url.absoluteString
      existing.lastDeployAt = Date()
      existing.lastStatus = "Live"
      existing.sourcePath = source.path
      existing.sourceIdentifier = bookmarks.identifier(for: source)
      existing.sourceBookmark = try bookmarks.make(for: source)
      if response.owned == true { existing.ownershipRaw = "owned" }
      try context.save()
      return existing
    }

    let site = SiteRecord(
      displayName: source.deletingPathExtension().lastPathComponent,
      slug: response.slug,
      liveURL: response.url,
      sourceURL: source,
      sourceIdentifier: bookmarks.identifier(for: source),
      sourceBookmark: try bookmarks.make(for: source),
      sourceKind: sourceKind,
      detection: detection,
      trustedBuild: detection.requiresBuild,
      owned: response.owned == true
    )
    context.insert(site)
    try context.save()
    if let token = response.editToken { try keychain.set(token, for: .editToken(site.id)) }
    if let claimURL = response.claimUrl {
      try keychain.set(claimURL.absoluteString, for: .claimURL(site.id))
    }
    return site
  }

  private func requestBuildApproval(_ approval: BuildApproval) async -> Bool {
    buildApproval = approval
    return await withCheckedContinuation { continuation in
      approvalContinuation = continuation
    }
  }

  private func findSite(for source: URL) -> SiteRecord? {
    let identifier = bookmarks.identifier(for: source)
    let sites = (try? context.fetch(FetchDescriptor<SiteRecord>())) ?? []
    if let exact = sites.first(where: { $0.sourceIdentifier == identifier }) { return exact }
    return sites.first { site in
      guard let resolved = try? bookmarks.resolve(site.sourceBookmark) else { return false }
      return resolved.standardizedFileURL == source.standardizedFileURL
    }
  }

  private var trustedIdentifiers: Set<String> {
    Set(UserDefaults.standard.stringArray(forKey: "trustedBuildSourceIdentifiers") ?? [])
  }

  private func trust(_ identifier: String) {
    var identifiers = trustedIdentifiers
    identifiers.insert(identifier)
    UserDefaults.standard.set(Array(identifiers).sorted(), forKey: "trustedBuildSourceIdentifiers")
  }

  /// Stages a single dropped/chosen .html file into its own temp folder as
  /// `index.html`, so a lone page can be deployed without a wrapping folder.
  private func stageSingleFile(_ file: URL) throws -> URL {
    let temporary = FileManager.default.temporaryDirectory
      .appending(path: "aft-drop-\(UUID().uuidString)", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)
    try FileManager.default.copyItem(at: file, to: temporary.appending(path: "index.html"))
    return temporary
  }

  private func temporaryContainer(for extractedRoot: URL) -> URL {
    var candidate = extractedRoot
    while candidate.path != FileManager.default.temporaryDirectory.path {
      if candidate.lastPathComponent.hasPrefix("aft-drop-") { return candidate }
      candidate.deleteLastPathComponent()
    }
    return extractedRoot
  }

  private func appendLog(_ line: String) {
    logs.append(line)
    if logs.count > 500 { logs.removeFirst(logs.count - 500) }
  }

  private func fail(_ message: String) {
    phase = .failed
    status = "Deployment failed."
    errorMessage = message
    appendLog("Error: \(message)")
  }

  private func formatBytes(_ bytes: Int64) -> String {
    ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
  }

  private func isSafeScriptName(_ value: String) -> Bool {
    !value.isEmpty
      && value.range(of: #"^[A-Za-z0-9._:-]+$"#, options: .regularExpression) != nil
  }

  private func isSafeOutputDirectory(_ value: String) -> Bool {
    guard !value.isEmpty, !value.hasPrefix("/"), !value.hasPrefix("~") else { return false }
    return !value.split(separator: "/", omittingEmptySubsequences: false).contains("..")
  }
}
