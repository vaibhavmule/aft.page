import Foundation

struct ProjectDetector {
  private struct PackageJSON: Decodable {
    var scripts: [String: String]?
    var dependencies: [String: String]?
    var devDependencies: [String: String]?

    func hasDependency(_ name: String) -> Bool {
      dependencies?[name] != nil || devDependencies?[name] != nil
    }

    func hasScript(_ name: String) -> Bool {
      scripts?[name] != nil
    }
  }

  private let fileManager: FileManager

  init(fileManager: FileManager = .default) {
    self.fileManager = fileManager
  }

  func detect(at root: URL) -> ProjectDetection {
    let packageURL = root.appending(path: "package.json")
    let indexURL = root.appending(path: "index.html")
    let hasIndex = fileManager.fileExists(atPath: indexURL.path)
    guard
      fileManager.fileExists(atPath: packageURL.path),
      let data = try? Data(contentsOf: packageURL),
      let package = try? JSONDecoder().decode(PackageJSON.self, from: data)
    else {
      return hasIndex
        ? ProjectDetection(
          framework: .staticHTML,
          label: "Static HTML",
          outputDirectory: ".",
          buildScript: nil,
          packageManager: nil,
          isDeployable: true,
          note: nil
        )
        : unsupported("No package.json or index.html was found.")
    }

    let packageManager = detectPackageManager(at: root)
    let buildScript = package.hasScript("build") ? "build" : nil

    if package.hasDependency("next") {
      let isStaticExport = ["next.config.js", "next.config.mjs", "next.config.ts"]
        .compactMap { try? String(contentsOf: root.appending(path: $0), encoding: .utf8) }
        .contains { text in
          text.range(
            of: #"output\s*:\s*['\"]export['\"]"#,
            options: .regularExpression
          ) != nil
        }
      if isStaticExport {
        return ProjectDetection(
          framework: .nextStatic,
          label: "Next.js static export",
          outputDirectory: "out",
          buildScript: buildScript,
          packageManager: packageManager,
          isDeployable: buildScript != nil,
          note: buildScript == nil ? "Add a build script to package.json." : nil
        )
      }
      return ProjectDetection(
        framework: .unsupportedNextSSR,
        label: "Next.js SSR",
        outputDirectory: ".next",
        buildScript: nil,
        packageManager: packageManager,
        isDeployable: false,
        note:
          "aft.page hosts static output. Configure Next.js with output: \"export\", or use the customer-cloud CLI for SSR."
      )
    }

    let hasViteConfig = ["vite.config.ts", "vite.config.js", "vite.config.mjs"]
      .contains { fileManager.fileExists(atPath: root.appending(path: $0).path) }
    if package.hasDependency("vite") || hasViteConfig {
      let label: String
      if package.hasDependency("vue") {
        label = "Vue (Vite)"
      } else if package.hasDependency("svelte") {
        label = "Svelte (Vite)"
      } else if package.hasDependency("react") {
        label = "React (Vite)"
      } else {
        label = "Vite"
      }
      return buildable(
        framework: .vite,
        label: label,
        output: "dist",
        buildScript: buildScript,
        packageManager: packageManager
      )
    }

    if package.hasDependency("@rsbuild/core") {
      return buildable(
        framework: .rsbuild,
        label: "React (Rsbuild)",
        output: "build",
        buildScript: buildScript,
        packageManager: packageManager
      )
    }

    if package.hasDependency("react-scripts") {
      return buildable(
        framework: .createReactApp,
        label: "Create React App",
        output: "build",
        buildScript: buildScript,
        packageManager: packageManager
      )
    }

    if buildScript != nil {
      let output =
        ["dist", "build", "out"]
        .first { fileManager.fileExists(atPath: root.appending(path: $0).path) }
        ?? "dist"
      return buildable(
        framework: .unknown,
        label: "Node project",
        output: output,
        buildScript: buildScript,
        packageManager: packageManager
      )
    }

    if hasIndex {
      return ProjectDetection(
        framework: .staticHTML,
        label: "Static HTML",
        outputDirectory: ".",
        buildScript: nil,
        packageManager: nil,
        isDeployable: true,
        note: nil
      )
    }

    return unsupported("Could not detect a static web project or build script.")
  }

  func detectPackageManager(at root: URL) -> PackageManager {
    if fileManager.fileExists(atPath: root.appending(path: "pnpm-lock.yaml").path) {
      return .pnpm
    }
    if fileManager.fileExists(atPath: root.appending(path: "yarn.lock").path) {
      return .yarn
    }
    if fileManager.fileExists(atPath: root.appending(path: "bun.lock").path)
      || fileManager.fileExists(atPath: root.appending(path: "bun.lockb").path)
    {
      return .bun
    }
    return .npm
  }

  private func buildable(
    framework: FrameworkKind,
    label: String,
    output: String,
    buildScript: String?,
    packageManager: PackageManager
  ) -> ProjectDetection {
    ProjectDetection(
      framework: framework,
      label: label,
      outputDirectory: output,
      buildScript: buildScript,
      packageManager: packageManager,
      isDeployable: buildScript != nil,
      note: buildScript == nil ? "Add a build script to package.json." : nil
    )
  }

  private func unsupported(_ note: String) -> ProjectDetection {
    ProjectDetection(
      framework: .unknown,
      label: "Unsupported project",
      outputDirectory: "dist",
      buildScript: nil,
      packageManager: nil,
      isDeployable: false,
      note: note
    )
  }
}
