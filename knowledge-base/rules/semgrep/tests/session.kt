@Bean
fun filterChain(http: HttpSecurity): SecurityFilterChain {
    http {
        // ruleid: seckit.sess-c2.kotlin-dsl-csrf-disabled
        csrf { disable() }
    }
    return http.build()
}
