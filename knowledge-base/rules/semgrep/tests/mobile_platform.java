import javax.net.ssl.*;
import java.security.cert.X509Certificate;

class TrustAllJava implements X509TrustManager {
    public void checkClientTrusted(X509Certificate[] chain, String authType) {}
    // ruleid: seckit.mplat-c2.java-trust-all-trust-manager
    public void checkServerTrusted(X509Certificate[] chain, String authType) {}
    public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
}

class AnyHost implements HostnameVerifier {
    // ruleid: seckit.mplat-c2.java-always-true-hostname-verifier
    public boolean verify(String hostname, SSLSession session) { return true; }
}

class Setup {
    void run(HttpsURLConnection conn, android.webkit.WebSettings settings) {
        // ruleid: seckit.mplat-c2.java-always-true-hostname-verifier
        conn.setHostnameVerifier((h, s) -> true);
        // ruleid: seckit.mplat-c4.webview-file-access
        settings.setAllowFileAccessFromFileURLs(true);
        // ok: seckit.mplat-c4.webview-file-access
        settings.setAllowFileAccess(false);
    }
}
