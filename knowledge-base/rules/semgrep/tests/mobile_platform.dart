void network() {
  // ruleid: seckit.mplat-c2.dart-bad-certificate-callback
  final client = HttpClient()..badCertificateCallback = (cert, host, port) => true;
  // ruleid: seckit.mplat-c2.dart-bad-certificate-callback
  final adapter = IOHttpClientAdapter(validateCertificate: (cert, host, port) => true);
  // ok: seckit.mplat-c2.dart-bad-certificate-callback
  final normal = HttpClient();

  // ruleid: seckit.mplat-c1.dart-cleartext-url
  http.get(Uri.parse('http://api.example.com/items'));
  // ok: seckit.mplat-c1.dart-cleartext-url
  http.get(Uri.parse('https://api.example.com/items'));
  // ok: seckit.mplat-c1.dart-cleartext-url
  http.get(Uri.parse('http://10.0.2.2:8080/items'));
  // ruleid: seckit.mplat-c1.dart-cleartext-url
  final dio = Dio(BaseOptions(baseUrl: 'http://api.example.com'));
}

void webview() {
  // ruleid: seckit.mplat-c4.dart-webview-file-access
  final s = InAppWebViewSettings(javaScriptEnabled: true, allowUniversalAccessFromFileURLs: true);
  // ok: seckit.mplat-c4.dart-webview-file-access
  final t = InAppWebViewSettings(javaScriptEnabled: true);
  // ruleid: seckit.mplat-c7.dart-webview-debugging-enabled
  InAppWebViewController.setWebContentsDebuggingEnabled(true);
  if (kDebugMode) {
    // ok: seckit.mplat-c7.dart-webview-debugging-enabled
    InAppWebViewController.setWebContentsDebuggingEnabled(true);
  }
  // ok: seckit.mplat-c7.dart-webview-debugging-enabled
  final u = InAppWebViewSettings(isInspectable: kDebugMode);
}

Future<void> unlock(LocalAuthentication auth) async {
  // ruleid: seckit.mplat-c10.dart-biometric-bool-only
  final ok = await auth.authenticate(localizedReason: 'Unlock your account');
}
