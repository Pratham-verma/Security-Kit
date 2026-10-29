class AuthService {
    void login(LoginRequest req, HttpServletRequest http, String token, String userId) {
        // ruleid: seckit.log-c2.java-sensitive-data-logged
        log.debug("login attempt {} {}", req.getUsername(), req.getPassword());
        // ruleid: seckit.log-c2.java-sensitive-data-logged
        log.info("issued token " + token);
        // ruleid: seckit.log-c2.java-sensitive-data-logged
        logger.info("auth header {}", http.getHeader("Authorization"));
        // ok: seckit.log-c2.java-sensitive-data-logged
        log.warn("Invalid password for user {}", userId);
    }
}
