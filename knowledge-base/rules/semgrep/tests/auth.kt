class SecurityConfig {
    // ruleid: seckit.auth-c2.kotlin-weak-password-encoder
    fun bad(): PasswordEncoder = NoOpPasswordEncoder.getInstance()
    // ok: seckit.auth-c2.kotlin-weak-password-encoder
    fun good(): PasswordEncoder = BCryptPasswordEncoder()
    fun hash(md: MessageDigest, password: String, body: String) {
        // ruleid: seckit.auth-c2.kotlin-weak-password-encoder
        md.digest(password.toByteArray())
        // ok: seckit.auth-c2.kotlin-weak-password-encoder
        md.digest(body.toByteArray())
    }
}
