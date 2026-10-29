@RestController
// ruleid: seckit.api-c6.spring-permissive-cors
@CrossOrigin
class ProductController {
    // ruleid: seckit.api-c6.spring-permissive-cors
    @CrossOrigin(origins = "*")
    @GetMapping("/a")
    String a() { return ""; }

    // ok: seckit.api-c6.spring-permissive-cors
    @CrossOrigin(origins = "https://app.example.com")
    @GetMapping("/b")
    String b() { return ""; }

    void cors(CorsRegistry registry, CorsConfiguration config) {
        // ruleid: seckit.api-c6.spring-permissive-cors
        registry.addMapping("/**").allowedOrigins("*");
        // ok: seckit.api-c6.spring-permissive-cors
        registry.addMapping("/**").allowedOrigins("https://app.example.com");
        // ruleid: seckit.api-c6.spring-permissive-cors
        config.setAllowedOrigins(List.of("*"));
    }

    @GetMapping("/preview")
    String preview(@RequestParam("url") String target) throws Exception {
        // ruleid: seckit.api-c5.spring-ssrf-user-url
        String body = restTemplate.getForObject(target, String.class);
        String copy = target.trim();
        // ruleid: seckit.api-c5.spring-ssrf-user-url
        new URL(copy).openStream();
        // ok: seckit.api-c5.spring-ssrf-user-url
        restTemplate.getForObject("https://api.example.com/items", String.class);
        return body;
    }

    @GetMapping("/item")
    String item() {
        try {
            return service.load();
        } catch (Exception e) {
            // ruleid: seckit.api-c8.spring-exception-message-in-response
            return "Error: " + e.getMessage();
        }
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<String> handle(Exception ex) {
        log.error("request failed", ex);
        // ok: seckit.api-c8.spring-exception-message-in-response
        return ResponseEntity.status(500).body("Something went wrong");
    }
}

class SecurityConfig {
    SecurityFilterChain chain(HttpSecurity http) throws Exception {
        // ruleid: seckit.api-c2.spring-permit-all-requests
        http.authorizeHttpRequests(auth -> auth.requestMatchers("/public/**").permitAll().anyRequest().permitAll());
        // ok: seckit.api-c2.spring-permit-all-requests
        http.authorizeHttpRequests(auth -> auth.requestMatchers("/public/**").permitAll().anyRequest().authenticated());
        return http.build();
    }
}
