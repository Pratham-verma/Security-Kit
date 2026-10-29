declare const stripe: any, req: any, order: any;

// ruleid: seckit.pay-c4.client-supplied-amount
stripe.paymentIntents.create({ amount: req.body.amount, currency: "usd" });
// ok: seckit.pay-c4.client-supplied-amount
stripe.paymentIntents.create({ amount: order.totalCents, currency: "usd" });
