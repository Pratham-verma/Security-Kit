import android.webkit.WebView
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.X509TrustManager
import java.security.cert.X509Certificate

class TrustAll : X509TrustManager {
    override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
    // ruleid: seckit.mplat-c2.trust-all-trust-manager
    override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}
    override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
}

fun setup(webView: WebView, builder: okhttp3.OkHttpClient.Builder, intent: android.content.Intent) {
    // ruleid: seckit.mplat-c2.always-true-hostname-verifier
    val v = HostnameVerifier { _, _ -> true }
    // ruleid: seckit.mplat-c2.always-true-hostname-verifier
    builder.hostnameVerifier { _, _ -> true }
    // ruleid: seckit.mplat-c4.webview-file-access
    webView.settings.allowUniversalAccessFromFileURLs = true
    // ok: seckit.mplat-c4.webview-file-access
    webView.settings.allowFileAccess = false
    // ruleid: seckit.mplat-c4.webview-javascript-bridge
    webView.addJavascriptInterface(Bridge(), "Android")
    // ruleid: seckit.mplat-c4.webview-loads-intent-url
    webView.loadUrl(intent.data.toString())
    // ok: seckit.mplat-c4.webview-loads-intent-url
    webView.loadUrl("https://app.example.com/help")
    // ruleid: seckit.mplat-c7.webview-debugging-enabled
    WebView.setWebContentsDebuggingEnabled(true)
    if (BuildConfig.DEBUG) {
        // ok: seckit.mplat-c7.webview-debugging-enabled
        WebView.setWebContentsDebuggingEnabled(true)
    }
}

fun login(biometricPrompt: androidx.biometric.BiometricPrompt, promptInfo: androidx.biometric.BiometricPrompt.PromptInfo, cipher: javax.crypto.Cipher) {
    // ruleid: seckit.mplat-c10.biometric-without-crypto
    biometricPrompt.authenticate(promptInfo)
    // ok: seckit.mplat-c10.biometric-without-crypto
    biometricPrompt.authenticate(promptInfo, androidx.biometric.BiometricPrompt.CryptoObject(cipher))
}
