import stripe
from flask import request

def checkout(order):
    # ruleid: seckit.pay-c4.python-client-supplied-amount
    stripe.PaymentIntent.create(amount=request.json["amount"], currency="usd")
    # ok: seckit.pay-c4.python-client-supplied-amount
    stripe.PaymentIntent.create(amount=order.total_cents, currency="usd")
