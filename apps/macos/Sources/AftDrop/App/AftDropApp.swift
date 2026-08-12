import SwiftData
import SwiftUI

@main
@MainActor
struct AftDropApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  private let container: ModelContainer
  @StateObject private var model: AppModel

  init() {
    let schema = Schema([SiteRecord.self])
    do {
      let container = try ModelContainer(for: schema)
      self.container = container
      _model = StateObject(wrappedValue: AppModel(context: container.mainContext))
    } catch {
      fatalError("Could not create aft Drop database: \(error)")
    }
  }

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(model)
        .modelContainer(container)
        .frame(minWidth: 820, minHeight: 560)
        .preferredColorScheme(.dark)
    }
    .windowStyle(.hiddenTitleBar)
    .defaultSize(width: 980, height: 660)
    .commands {
      CommandGroup(after: .newItem) {
        Button("Deploy File, Folder, or ZIP…") {
          let panel = NSOpenPanel.websitePanel
          if panel.runModal() == .OK, let url = panel.url { model.handle(url) }
        }
        .keyboardShortcut("o", modifiers: [.command])
      }
    }
  }
}

extension NSOpenPanel {
  static var websitePanel: NSOpenPanel {
    let panel = NSOpenPanel()
    panel.title = "Deploy with aft"
    panel.prompt = "Deploy"
    panel.canChooseDirectories = true
    panel.canChooseFiles = true
    panel.allowsMultipleSelection = false
    panel.allowedContentTypes = [.folder, .zip, .html]
    return panel
  }
}
