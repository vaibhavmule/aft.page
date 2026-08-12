import Foundation
import Security

final class KeychainService {
  static let shared = KeychainService()
  private let service = "page.aft.drop"

  enum Key: Hashable {
    case editToken(UUID)
    case claimURL(UUID)
    case bearerToken
    case accountEmail

    var account: String {
      switch self {
      case .editToken(let id): return "site.\(id.uuidString).edit-token"
      case .claimURL(let id): return "site.\(id.uuidString).claim-url"
      case .bearerToken: return "account.bearer-token"
      case .accountEmail: return "account.email"
      }
    }
  }

  func set(_ value: String, for key: Key) throws {
    let data = Data(value.utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key.account,
    ]
    SecItemDelete(query as CFDictionary)
    var insert = query
    insert[kSecValueData as String] = data
    insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(insert as CFDictionary, nil)
    guard status == errSecSuccess else {
      throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
    }
  }

  func get(_ key: Key) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key.account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
      let data = result as? Data
    else { return nil }
    return String(data: data, encoding: .utf8)
  }

  func remove(_ key: Key) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key.account,
    ]
    SecItemDelete(query as CFDictionary)
  }
}
