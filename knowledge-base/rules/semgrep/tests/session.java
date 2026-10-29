class Security {
    void configure(HttpSecurity http) throws Exception {
        // ruleid: seckit.sess-c2.spring-csrf-disabled
        http.csrf(AbstractHttpConfigurer::disable);
        // ruleid: seckit.sess-c2.spring-csrf-disabled
        http.csrf(csrf -> csrf.disable());
        // ok: seckit.sess-c2.spring-csrf-disabled
        http.csrf(Customizer.withDefaults());
    }

    void tokens(String token) {
        // ruleid: seckit.sess-c5.java-jwt-not-verified
        DecodedJWT d = com.auth0.jwt.JWT.decode(token);
        // ok: seckit.sess-c5.java-jwt-not-verified
        DecodedJWT v = com.auth0.jwt.JWT.require(algorithm).build().verify(token);
        // ruleid: seckit.sess-c5.java-jwt-not-verified
        Jwts.parser().setSigningKey(key).build().parseClaimsJwt(token);
        // ok: seckit.sess-c5.java-jwt-not-verified
        Jwts.parser().verifyWith(key).build().parseSignedClaims(token);
        // ruleid: seckit.sess-c5.java-hardcoded-jwt-key
        SecretKey k = Keys.hmacShaKeyFor("change-me-this-is-a-very-long-secret-key".getBytes(StandardCharsets.UTF_8));
        // ok: seckit.sess-c5.java-hardcoded-jwt-key
        SecretKey k2 = Keys.hmacShaKeyFor(secretFromVault.getBytes(StandardCharsets.UTF_8));
        // ruleid: seckit.sess-c5.java-hardcoded-jwt-key
        Algorithm alg = Algorithm.HMAC256("secret");
    }

    void cookies(HttpServletResponse res) {
        Cookie c = new Cookie("SESSION", id);
        // ruleid: seckit.sess-c1.java-insecure-cookie-flags
        c.setHttpOnly(false);
        // ok: seckit.sess-c1.java-insecure-cookie-flags
        c.setSecure(true);
        // ruleid: seckit.sess-c1.java-insecure-cookie-flags
        ResponseCookie rc = ResponseCookie.from("SESSION", id).path("/").secure(false).build();
    }

    void random() {
        // ruleid: seckit.sess-c6.java-insecure-random-token
        String resetToken = Long.toHexString(new Random().nextLong());
        // ruleid: seckit.sess-c6.java-insecure-random-token
        String otpCode = RandomStringUtils.randomNumeric(6);
        // ok: seckit.sess-c6.java-insecure-random-token
        String safeToken = RandomStringUtils.secure().nextAlphanumeric(32);
        // ok: seckit.sess-c6.java-insecure-random-token
        int jitter = new Random().nextInt(100);
    }

    @GetMapping("/export")
    // ruleid: seckit.sess-c7.spring-credentials-in-query
    String export(@RequestParam("access_token") String t, @RequestParam String format) { return ""; }

    @GetMapping("/me")
    // ruleid: seckit.sess-c7.spring-credentials-in-query
    String me(@RequestParam String apiKey) { return ""; }

    @GetMapping("/search")
    // ok: seckit.sess-c7.spring-credentials-in-query
    String search(@RequestParam("q") String query) { return ""; }
}
