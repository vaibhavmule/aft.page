import AppKit
import Foundation
import Network
import Security

final class AuthCoordinator: @unchecked Sendable {
  private let baseURL: URL
  private let session: URLSession

  init(
    baseURL: URL = URL(string: "https://api.aft.page")!,
    session: URLSession = .shared
  ) {
    self.baseURL = baseURL
    self.session = session
  }

  func signIn() async throws -> AuthExchangeResponse {
    let state = randomState()
    let server = LoginCallbackServer(expectedState: state)
    let code = try await server.waitForCode { [baseURL] port in
      var components = URLComponents(
        url: baseURL.appending(path: "/v1/auth/cli"),
        resolvingAgainstBaseURL: false
      )!
      components.queryItems = [
        URLQueryItem(name: "port", value: String(port)),
        URLQueryItem(name: "state", value: state),
      ]
      if let url = components.url {
        Task { @MainActor in NSWorkspace.shared.open(url) }
      }
    }

    var request = URLRequest(url: baseURL.appending(path: "/v1/auth/cli/exchange"))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("mac", forHTTPHeaderField: "X-Aft-Client")
    request.httpBody = try JSONSerialization.data(withJSONObject: ["code": code, "state": state])
    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw AftDropError.invalidResponse }
    guard (200..<300).contains(http.statusCode) else {
      let body = try? JSONDecoder().decode(APIErrorBody.self, from: data)
      throw AftDropError.api(
        status: http.statusCode,
        message: body?.hint ?? body?.message ?? body?.error ?? "Sign in failed."
      )
    }
    guard let result = try? JSONDecoder().decode(AuthExchangeResponse.self, from: data) else {
      throw AftDropError.invalidResponse
    }
    return result
  }

  private func randomState() -> String {
    var bytes = [UInt8](repeating: 0, count: 24)
    _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    return Data(bytes).base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}

private final class LoginCallbackServer: @unchecked Sendable {
  private let expectedState: String
  private let queue = DispatchQueue(label: "page.aft.drop.login-callback")
  private var listener: NWListener?
  private var continuation: CheckedContinuation<String, Error>?
  private var completed = false

  init(expectedState: String) {
    self.expectedState = expectedState
  }

  func waitForCode(onReady: @escaping @Sendable (UInt16) -> Void) async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
      queue.async {
        do {
          let listener = try NWListener(using: .tcp, on: .any)
          self.listener = listener
          self.continuation = continuation
          listener.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
              if let port = listener.port?.rawValue { onReady(port) }
            case .failed(let error):
              self.finish(.failure(error))
            default:
              break
            }
          }
          listener.newConnectionHandler = { [weak self] connection in
            self?.handle(connection)
          }
          listener.start(queue: self.queue)
          self.queue.asyncAfter(deadline: .now() + 600) { [weak self] in
            self?.finish(.failure(AftDropError.api(status: 408, message: "Sign in timed out.")))
          }
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
  }

  private func handle(_ connection: NWConnection) {
    connection.start(queue: queue)
    connection.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) {
      [weak self] data, _, _, error in
      guard let self else { return }
      if let error {
        self.finish(.failure(error))
        return
      }
      let request = String(decoding: data ?? Data(), as: UTF8.self)
      guard let firstLine = request.split(separator: "\n").first,
        let target = firstLine.split(separator: " ").dropFirst().first,
        let components = URLComponents(string: "http://127.0.0.1\(target)")
      else {
        self.respond(connection, status: "400 Bad Request", message: "Invalid callback.")
        return
      }
      let values = (components.queryItems ?? []).reduce(into: [String: String]()) { result, item in
        if result[item.name] == nil { result[item.name] = item.value ?? "" }
      }
      guard values["state"] == self.expectedState, let code = values["code"], !code.isEmpty else {
        self.respond(connection, status: "400 Bad Request", message: "Sign in verification failed.")
        return
      }
      self.respond(
        connection, status: "200 OK", message: "Signed in to aft Drop. You can close this tab.")
      self.finish(.success(code))
    }
  }

  private func respond(_ connection: NWConnection, status: String, message: String) {
    let html =
      "<!doctype html><meta charset=utf-8><title>aft Drop</title><style>body{font:18px system-ui;background:#050505;color:white;padding:15vh 12vw}b{color:#16d96b}</style><h1><b>aft.</b>page</h1><p>\(message)</p>"
    let response =
      "HTTP/1.1 \(status)\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: \(html.utf8.count)\r\nConnection: close\r\n\r\n\(html)"
    connection.send(
      content: Data(response.utf8), completion: .contentProcessed { _ in connection.cancel() })
  }

  private func finish(_ result: Result<String, Error>) {
    guard !completed else { return }
    completed = true
    listener?.cancel()
    listener = nil
    let continuation = continuation
    self.continuation = nil
    switch result {
    case .success(let code): continuation?.resume(returning: code)
    case .failure(let error): continuation?.resume(throwing: error)
    }
  }
}
