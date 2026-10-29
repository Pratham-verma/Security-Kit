import android.util.Log
import javax.crypto.spec.SecretKeySpec

fun save(prefs: android.content.SharedPreferences, token: String) {
    // ruleid: seckit.mstore-c1.token-in-shared-preferences
    prefs.edit().putString("auth_token", token).apply()
    // ok: seckit.mstore-c1.token-in-shared-preferences
    prefs.edit().putString("theme", "dark").apply()
}

fun log(token: String, userId: String) {
    // ruleid: seckit.mstore-c3.android-sensitive-log
    Log.d("Auth", "token=$token")
    // ok: seckit.mstore-c3.android-sensitive-log
    Log.d("Auth", "user=$userId")
}

fun crypto() {
    // ruleid: seckit.mstore-c6.kotlin-hardcoded-key
    val key = SecretKeySpec("0123456789abcdef".toByteArray(), "AES")
}
