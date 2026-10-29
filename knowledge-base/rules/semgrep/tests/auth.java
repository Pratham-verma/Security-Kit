class SecurityConfig {
    PasswordEncoder bad() {
        // ruleid: seckit.auth-c2.java-weak-password-encoder
        return NoOpPasswordEncoder.getInstance();
    }
    PasswordEncoder bad2() {
        // ruleid: seckit.auth-c2.java-weak-password-encoder
        return new MessageDigestPasswordEncoder("SHA-256");
    }
    PasswordEncoder good() {
        // ok: seckit.auth-c2.java-weak-password-encoder
        return Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();
    }
    byte[] hash(MessageDigest md, String password, String fileContents) {
        // ruleid: seckit.auth-c2.java-weak-password-encoder
        String hex = DigestUtils.sha256Hex(password);
        // ok: seckit.auth-c2.java-weak-password-encoder
        String etag = DigestUtils.sha256Hex(fileContents);
        // ruleid: seckit.auth-c2.java-weak-password-encoder
        return md.digest(password.getBytes(StandardCharsets.UTF_8));
    }
}
