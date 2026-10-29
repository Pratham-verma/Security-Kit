import android.content.SharedPreferences;
import android.util.Log;
import javax.crypto.spec.SecretKeySpec;

class Store {
    void save(SharedPreferences prefs, String token) {
        // ruleid: seckit.mstore-c1.token-in-shared-preferences
        prefs.edit().putString("auth_token", token).apply();
        // ruleid: seckit.mstore-c3.android-sensitive-log
        Log.d("Auth", "token=" + token);
        // ruleid: seckit.mstore-c6.java-hardcoded-key
        SecretKeySpec key = new SecretKeySpec("0123456789abcdef".getBytes(), "AES");
        // ok: seckit.mstore-c1.token-in-shared-preferences
        prefs.edit().putString("theme", "dark").apply();
    }
}
