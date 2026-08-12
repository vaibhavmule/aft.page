// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "AftDrop",
  platforms: [.macOS(.v14)],
  products: [
    .executable(name: "AftDrop", targets: ["AftDrop"]),
  ],
  targets: [
    .executableTarget(
      name: "AftDrop",
      linkerSettings: [
        .linkedFramework("AppKit"),
        .linkedFramework("Security"),
        .linkedFramework("SwiftData"),
      ]
    ),
    .testTarget(
      name: "AftDropTests",
      dependencies: ["AftDrop"]
    ),
  ],
  swiftLanguageModes: [.v5]
)
