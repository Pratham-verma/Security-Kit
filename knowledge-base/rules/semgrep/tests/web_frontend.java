@Controller
class LoginController {
    @GetMapping("/login/done")
    String done(@RequestParam("next") String next) {
        // ruleid: seckit.web-c6.spring-open-redirect
        return "redirect:" + next;
    }

    @GetMapping("/logout/done")
    void out(HttpServletRequest request, HttpServletResponse response) throws Exception {
        String target = request.getParameter("returnTo");
        // ruleid: seckit.web-c6.spring-open-redirect
        response.sendRedirect(target);
        // ok: seckit.web-c6.spring-open-redirect
        response.sendRedirect("/home");
    }

    void client() throws Exception {
        // ruleid: seckit.web-c4.java-tls-verification-disabled
        SslContext ctx = SslContextBuilder.forClient().trustManager(InsecureTrustManagerFactory.INSTANCE).build();
        // ruleid: seckit.web-c4.java-tls-verification-disabled
        SSLConnectionSocketFactory f = new SSLConnectionSocketFactory(sslContext, NoopHostnameVerifier.INSTANCE);
        // ok: seckit.web-c4.java-tls-verification-disabled
        SslContext safe = SslContextBuilder.forClient().build();
    }
}
