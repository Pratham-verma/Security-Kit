class CheckoutController {
    @PostMapping("/checkout")
    String checkout(@RequestBody CheckoutRequest req) throws Exception {
        // ruleid: seckit.pay-c4.java-client-supplied-amount
        PaymentIntentCreateParams bad = PaymentIntentCreateParams.builder().setAmount(req.getAmount()).setCurrency("usd").build();
        long price = catalog.priceOf(req.getProductId());
        // ok: seckit.pay-c4.java-client-supplied-amount
        PaymentIntentCreateParams good = PaymentIntentCreateParams.builder().setAmount(price).build();
        return "ok";
    }
}
