import AppKit
import Foundation

@MainActor
final class OpenRequestCenter: ObservableObject {
  static let shared = OpenRequestCenter()
  @Published private(set) var pending: [URL] = []

  func submit(_ urls: [URL]) {
    let accepted = urls.filter { url in
      var isDirectory: ObjCBool = false
      return
        (FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory)
        && isDirectory.boolValue)
        || url.pathExtension.lowercased() == "zip"
    }
    pending.append(contentsOf: accepted)
    NSApplication.shared.activate(ignoringOtherApps: true)
  }

  func takeNext() -> URL? {
    guard !pending.isEmpty else { return nil }
    return pending.removeFirst()
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  func application(_ application: NSApplication, open urls: [URL]) {
    Task { @MainActor in OpenRequestCenter.shared.submit(urls) }
  }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool
  {
    if !flag { sender.windows.first?.makeKeyAndOrderFront(nil) }
    return true
  }
}
