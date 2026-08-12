import AppKit
import SwiftData
import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
  @EnvironmentObject private var model: AppModel
  @Query(sort: \SiteRecord.lastDeployAt, order: .reverse) private var sites: [SiteRecord]
  @ObservedObject private var openRequests = OpenRequestCenter.shared
  @State private var settingsSite: SiteRecord?

  private var selectedSite: SiteRecord? {
    sites.first { $0.id == model.selectedSiteID }
  }

  var body: some View {
    NavigationSplitView {
      sidebar
        .navigationSplitViewColumnWidth(min: 220, ideal: 250, max: 300)
    } detail: {
      ZStack {
        Color(red: 0.025, green: 0.025, blue: 0.025).ignoresSafeArea()
        ScrollView {
          VStack(spacing: 24) {
            header
            DropHero()
            if let site = selectedSite {
              SiteResultCard(site: site, settingsSite: $settingsSite)
            }
            if !model.logs.isEmpty {
              BuildLog(lines: model.logs)
            }
          }
          .padding(32)
          .frame(maxWidth: 760)
          .frame(maxWidth: .infinity)
        }
      }
    }
    .navigationSplitViewStyle(.balanced)
    .sheet(item: $model.buildApproval) { approval in
      BuildApprovalView(approval: approval)
        .interactiveDismissDisabled()
    }
    .sheet(item: $settingsSite) { site in
      SiteSettingsView(site: site)
    }
    .alert(
      "Couldn’t deploy",
      isPresented: Binding(
        get: { model.errorMessage != nil },
        set: { if !$0 { model.errorMessage = nil } }
      )
    ) {
      Button("OK", role: .cancel) { model.errorMessage = nil }
    } message: {
      Text(model.errorMessage ?? "Unknown error")
    }
    .onAppear { drainOpenRequests() }
    .onChange(of: openRequests.pending.count) { _, _ in drainOpenRequests() }
    .onChange(of: sites.count) { _, _ in
      if model.selectedSiteID == nil { model.selectedSiteID = sites.first?.id }
    }
  }

  private var sidebar: some View {
    VStack(spacing: 0) {
      List(selection: $model.selectedSiteID) {
        Section("Recent sites") {
          if sites.isEmpty {
            Text("Your deploys will appear here.")
              .foregroundStyle(.tertiary)
              .font(.callout)
          }
          ForEach(sites) { site in
            SiteRow(site: site)
              .tag(site.id)
              .contextMenu {
                Button("Open Site") { model.open(site) }
                Button("Copy URL") { model.copy(site) }
                Button("Reveal Source") { model.reveal(site) }
                Divider()
                Button("Redeploy") { model.redeploy(site) }
                Button("Forget Local Record", role: .destructive) { model.forget(site) }
              }
          }
        }
      }
      .listStyle(.sidebar)

      Divider()
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text(model.accountEmail ?? "Anonymous deploy")
            .font(.caption.weight(.medium))
            .lineLimit(1)
          Text(model.accountEmail == nil ? "Sign in after claiming" : "aft.page account")
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
        Spacer()
        if model.accountEmail == nil {
          Button("Sign in") { model.signIn() }
            .buttonStyle(.borderless)
        } else {
          Menu {
            Button("Sign out") { model.signOut() }
          } label: {
            Image(systemName: "ellipsis.circle")
          }
          .menuStyle(.borderlessButton)
        }
      }
      .padding(14)
    }
  }

  private var header: some View {
    HStack(alignment: .firstTextBaseline) {
      // "aft Drop" is two words (unlike the glued "aft.page"), so it keeps a
      // gap — but otherwise matches the site's wordmark rule: uniform weight
      // and color across both words, with only the punctuation in green.
      HStack(spacing: 5) {
        Text("aft")
        Text("·").foregroundStyle(Color.aftGreen)
        Text("Drop")
      }
      .font(.system(size: 24, weight: .semibold))
      .foregroundStyle(.primary)
      Spacer()
      if model.phase.isBusy {
        Button("Cancel") { model.cancel() }
          .buttonStyle(.bordered)
      }
    }
  }

  private func drainOpenRequests() {
    guard !model.phase.isBusy, let url = openRequests.takeNext() else { return }
    model.handle(url)
  }
}

private struct SiteRow: View {
  let site: SiteRecord

  var body: some View {
    HStack(spacing: 10) {
      RoundedRectangle(cornerRadius: 7)
        .fill(Color.aftGreen.opacity(0.12))
        .frame(width: 30, height: 30)
        .overlay(Image(systemName: "globe").foregroundStyle(Color.aftGreen))
      VStack(alignment: .leading, spacing: 2) {
        Text(site.displayName).font(.callout.weight(.medium)).lineLimit(1)
        Text("\(site.slug).aft.page")
          .font(.caption.monospaced())
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
    }
    .padding(.vertical, 3)
  }
}

private struct DropHero: View {
  @EnvironmentObject private var model: AppModel
  @State private var isTargeted = false

  var body: some View {
    VStack(spacing: 18) {
      ZStack {
        Circle()
          .strokeBorder(Color.aftLine, lineWidth: 1)
          .frame(width: 64, height: 64)
        Image(systemName: iconName)
          .font(.system(size: 24, weight: .medium))
          .foregroundStyle(iconColor)
      }
      VStack(spacing: 7) {
        Text(title)
          .font(.system(size: 28, weight: .bold))
        Text(model.status)
          .font(.body)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
      }
      if model.phase.isBusy {
        ProgressView().controlSize(.small)
      } else {
        Button("Choose file, folder, or ZIP") {
          let panel = NSOpenPanel.websitePanel
          if panel.runModal() == .OK, let url = panel.url { model.handle(url) }
        }
        .buttonStyle(AftPrimaryButtonStyle())
      }
      Text("Tip: choose aft from Codex’s Open in menu to deploy the current workspace.")
        .font(.caption)
        .foregroundStyle(.tertiary)
    }
    .frame(maxWidth: .infinity, minHeight: 280)
    .padding(28)
    .background(
      RoundedRectangle(cornerRadius: 10)
        .fill(isTargeted ? Color.white.opacity(0.04) : Color.clear)
        .overlay(
          RoundedRectangle(cornerRadius: 10)
            .strokeBorder(
              isTargeted ? Color.primary.opacity(0.6) : Color.aftLine,
              style: StrokeStyle(lineWidth: 1.5, dash: [8, 7])
            )
        )
    )
    .dropDestination(for: URL.self) { urls, _ in
      guard let first = urls.first else { return false }
      model.handle(first)
      return true
    } isTargeted: {
      isTargeted = $0
    }
  }

  private var title: String {
    switch model.phase {
    case .idle: return "Drop a website. Get a URL."
    case .inspecting: return "Checking the project"
    case .awaitingTrust: return "Ready to build"
    case .building: return "Building locally"
    case .uploading: return "Publishing"
    case .live: return "Your site is live"
    case .failed: return "Let’s fix that"
    }
  }

  private var iconName: String {
    switch model.phase {
    case .live: return "checkmark"
    case .failed: return "exclamationmark"
    default: return "arrow.up.doc"
    }
  }

  /// Neutral by default; green and red are reserved for live/failed, matching
  /// the site's rule that `--good`/`--danger` mark actual state, not chrome.
  private var iconColor: Color {
    switch model.phase {
    case .live: return .aftGreen
    case .failed: return .aftDanger
    default: return .primary
    }
  }
}

private struct SiteResultCard: View {
  @EnvironmentObject private var model: AppModel
  let site: SiteRecord
  @Binding var settingsSite: SiteRecord?

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack {
        VStack(alignment: .leading, spacing: 5) {
          Text(site.lastStatus.uppercased())
            .font(.caption2.weight(.bold))
            .foregroundStyle(Color.aftGreen)
          Text("\(site.slug).aft.page")
            .font(.title3.monospaced().weight(.semibold))
        }
        Spacer()
        Text(site.lastDeployAt, style: .relative)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      HStack {
        Button(model.copiedURL ? "Copied" : "Copy URL") { model.copy(site) }
          .buttonStyle(AftPrimaryButtonStyle())
        Button("Open") { model.open(site) }.buttonStyle(.bordered)
        Button("Redeploy") { model.redeploy(site) }.buttonStyle(.bordered)
        if !site.isOwned {
          Button("Claim") { model.openClaim(for: site) }.buttonStyle(.bordered)
        }
        Spacer()
        Button {
          settingsSite = site
        } label: {
          Image(systemName: "gearshape")
        }
        .buttonStyle(.borderless)
      }
    }
    .padding(20)
    .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.02)))
    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.aftLine, lineWidth: 1))
  }
}

private struct BuildLog: View {
  let lines: [String]

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Activity").font(.headline)
      ScrollViewReader { proxy in
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 3) {
            ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
              Text(line)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
                .id(index)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: 90, maxHeight: 190)
        .onChange(of: lines.count) { _, count in
          if count > 0 { proxy.scrollTo(count - 1, anchor: .bottom) }
        }
      }
    }
    .padding(18)
    .background(RoundedRectangle(cornerRadius: 10).fill(Color.black.opacity(0.45)))
    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.aftLine, lineWidth: 1))
  }
}

private struct BuildApprovalView: View {
  @EnvironmentObject private var model: AppModel
  let approval: BuildApproval

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      Image(systemName: "hammer.fill")
        .font(.system(size: 28))
        .foregroundStyle(.primary)
      Text(approval.isFirstBuild ? "Trust and build this project?" : "Install dependencies?")
        .font(.title2.bold())
      Text(
        "aft Drop needs to run project scripts inside \(approval.sourceURL.lastPathComponent). Review the commands before continuing."
      )
      .foregroundStyle(.secondary)
      VStack(alignment: .leading, spacing: 6) {
        ForEach(approval.commands, id: \.self) { command in
          Text("$ \(command)").font(.system(.body, design: .monospaced))
        }
      }
      .padding(14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(RoundedRectangle(cornerRadius: 10).fill(Color.black.opacity(0.55)))
      HStack {
        Button("Cancel", role: .cancel) { model.declineBuild() }
        Spacer()
        Button(approval.needsInstall ? "Install, build & deploy" : "Build & deploy") {
          model.approveBuild()
        }
        .buttonStyle(AftPrimaryButtonStyle())
      }
    }
    .padding(26)
    .frame(width: 520)
  }
}

private struct SiteSettingsView: View {
  @EnvironmentObject private var model: AppModel
  @Environment(\.dismiss) private var dismiss
  let site: SiteRecord
  @State private var packageManager: PackageManager?
  @State private var buildScript: String
  @State private var outputDirectory: String

  init(site: SiteRecord) {
    self.site = site
    _packageManager = State(initialValue: site.packageManager)
    _buildScript = State(initialValue: site.buildScript)
    _outputDirectory = State(initialValue: site.outputDirectory)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 20) {
      Text("Build settings").font(.title2.bold())
      Form {
        Picker("Package manager", selection: $packageManager) {
          Text("None").tag(PackageManager?.none)
          ForEach(PackageManager.allCases) { manager in
            Text(manager.rawValue).tag(Optional(manager))
          }
        }
        TextField("Package script", text: $buildScript)
        TextField("Output folder", text: $outputDirectory)
      }
      Text(
        "Commands are limited to the selected package manager and script name; arbitrary shell commands are not run."
      )
      .font(.caption)
      .foregroundStyle(.secondary)
      HStack {
        Button("Reveal source") { model.reveal(site) }
        Spacer()
        Button("Cancel") { dismiss() }
        Button("Save") {
          if model.saveSettings(
            for: site,
            packageManager: packageManager,
            buildScript: buildScript,
            outputDirectory: outputDirectory
          ) {
            dismiss()
          }
        }
        .buttonStyle(AftPrimaryButtonStyle())
      }
    }
    .padding(24)
    .frame(width: 480)
  }
}

/// White-on-black, matching the site's `.btn-primary` (`--cta` / `--cta-ink`).
private struct AftPrimaryButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.callout.weight(.semibold))
      .foregroundStyle(.black)
      .padding(.horizontal, 16)
      .padding(.vertical, 9)
      .background(
        RoundedRectangle(cornerRadius: 8)
          .fill(Color.white.opacity(configuration.isPressed ? 0.82 : 1))
      )
  }
}

extension Color {
  /// Matches the site's `--good` — reserved for live/success states only.
  static let aftGreen = Color(red: 0.086, green: 0.85, blue: 0.42)
  /// Matches the site's `--danger` — failed/error states.
  static let aftDanger = Color(red: 1, green: 0.42, blue: 0.42)
  /// Matches the site's `--line-bright` hairline border.
  static let aftLine = Color(red: 0.247, green: 0.247, blue: 0.275)
}
