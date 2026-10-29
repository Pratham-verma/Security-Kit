import Alamofire
import LocalAuthentication

func session() -> Session {
    // ruleid: seckit.mplat-c2.ios-trust-evaluation-disabled
    let manager = ServerTrustManager(evaluators: ["api.example.com": DisabledTrustEvaluator()])
    return Session(serverTrustManager: manager)
}

func legacy() {
    // ruleid: seckit.mplat-c4.uiwebview
    let web = UIWebView()
    // ok: seckit.mplat-c4.uiwebview
    let modern = WKWebView()
}

func unlock(context: LAContext) {
    // ruleid: seckit.mplat-c10.ios-evaluate-policy-only
    context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: "Log in") { ok, _ in }
}
