func save(token: String) {
    // ruleid: seckit.mstore-c1.token-in-userdefaults
    UserDefaults.standard.set(token, forKey: "accessToken")
    // ok: seckit.mstore-c1.token-in-userdefaults
    UserDefaults.standard.set(true, forKey: "onboardingSeen")
}

func keychain() {
    // ruleid: seckit.mstore-c1.swift-keychain-accessible-always
    let q = [kSecAttrAccessible: kSecAttrAccessibleAlways]
    // ok: seckit.mstore-c1.swift-keychain-accessible-always
    let q2 = [kSecAttrAccessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
}

func files(data: Data, url: URL, token: String) throws {
    // ruleid: seckit.mstore-c2.swift-file-protection-disabled
    try data.write(to: url, options: .noFileProtection)
    // ok: seckit.mstore-c2.swift-file-protection-disabled
    try data.write(to: url, options: .completeFileProtection)
    // ruleid: seckit.mstore-c3.swift-sensitive-log
    print("token: \(token)")
    // ruleid: seckit.mstore-c6.swift-hardcoded-key
    let key = SymmetricKey(data: "0123456789abcdef0123456789abcdef".data(using: .utf8)!)
}
