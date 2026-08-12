import Foundation

final class BuildRunner: @unchecked Sendable {
  private let lock = NSLock()
  private var currentProcess: Process?

  func commandPreview(
    root: URL,
    packageManager: PackageManager,
    script: String,
    needsInstall: Bool
  ) -> [String] {
    var commands: [String] = []
    if needsInstall {
      commands.append(
        ([packageManager.rawValue] + packageManager.installArguments(at: root)).joined(
          separator: " ")
      )
    }
    commands.append(
      ([packageManager.rawValue] + packageManager.buildArguments(script: script)).joined(
        separator: " ")
    )
    return commands
  }

  func run(
    root: URL,
    packageManager: PackageManager,
    script: String,
    installDependencies: Bool,
    onLine: @escaping @Sendable (String) -> Void
  ) async throws {
    let executable = try resolveExecutable(packageManager)
    if installDependencies {
      try await runProcess(
        executable: executable,
        arguments: packageManager.installArguments(at: root),
        root: root,
        onLine: onLine
      )
    }
    try await runProcess(
      executable: executable,
      arguments: packageManager.buildArguments(script: script),
      root: root,
      onLine: onLine
    )
  }

  func cancel() {
    lock.lock()
    let process = currentProcess
    lock.unlock()
    guard let process, process.isRunning else { return }
    process.interrupt()
    DispatchQueue.global().asyncAfter(deadline: .now() + 1) {
      if process.isRunning { process.terminate() }
    }
  }

  private func resolveExecutable(_ packageManager: PackageManager) throws -> URL {
    let process = Process()
    let pipe = Pipe()
    process.executableURL = URL(fileURLWithPath: "/bin/zsh")
    process.arguments = ["-lc", "command -v \(packageManager.rawValue)"]
    process.standardOutput = pipe
    process.standardError = Pipe()
    try process.run()
    process.waitUntilExit()
    let output = String(decoding: pipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    guard process.terminationStatus == 0, output.hasPrefix("/") else {
      throw AftDropError.missingPackageManager(packageManager.rawValue)
    }
    return URL(fileURLWithPath: output)
  }

  private func runProcess(
    executable: URL,
    arguments: [String],
    root: URL,
    onLine: @escaping @Sendable (String) -> Void
  ) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      let process = Process()
      let stdout = Pipe()
      let stderr = Pipe()
      process.executableURL = executable
      process.arguments = arguments
      process.currentDirectoryURL = root
      process.standardOutput = stdout
      process.standardError = stderr
      let loginPath = resolveLoginShellPath()
      process.environment = ProcessInfo.processInfo.environment.merging([
        "FORCE_COLOR": "0",
        "CI": "1",
        "PATH": loginPath,
      ]) { _, new in new }

      let consume: @Sendable (FileHandle) -> Void = { handle in
        handle.readabilityHandler = { readable in
          let data = readable.availableData
          guard !data.isEmpty else { return }
          let text = String(decoding: data, as: UTF8.self)
          for line in text.split(whereSeparator: \.isNewline) {
            onLine(String(line))
          }
        }
      }
      consume(stdout.fileHandleForReading)
      consume(stderr.fileHandleForReading)

      process.terminationHandler = { [weak self] process in
        stdout.fileHandleForReading.readabilityHandler = nil
        stderr.fileHandleForReading.readabilityHandler = nil
        self?.lock.lock()
        self?.currentProcess = nil
        self?.lock.unlock()
        if process.terminationReason == .uncaughtSignal {
          continuation.resume(throwing: AftDropError.cancelled)
        } else if process.terminationStatus == 0 {
          continuation.resume(returning: ())
        } else {
          let command = ([executable.lastPathComponent] + arguments).joined(separator: " ")
          continuation.resume(
            throwing: AftDropError.buildFailed(
              "\(command) failed with exit code \(process.terminationStatus).")
          )
        }
      }

      do {
        lock.lock()
        currentProcess = process
        lock.unlock()
        try process.run()
      } catch {
        lock.lock()
        currentProcess = nil
        lock.unlock()
        continuation.resume(throwing: error)
      }
    }
  }

  private func resolveLoginShellPath() -> String {
    let fallback = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    let process = Process()
    let pipe = Pipe()
    process.executableURL = URL(fileURLWithPath: "/bin/zsh")
    process.arguments = ["-lc", "printf %s \"$PATH\""]
    process.standardOutput = pipe
    process.standardError = Pipe()
    do {
      try process.run()
      process.waitUntilExit()
      let value = String(decoding: pipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
      return value.isEmpty ? fallback : value
    } catch {
      return fallback
    }
  }
}
