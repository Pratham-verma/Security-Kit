import jwt, random
from django.views.decorators.csrf import csrf_exempt

def decode(token, key):
    # ruleid: seckit.sess-c5.python-jwt-signature-not-verified
    jwt.decode(token, options={"verify_signature": False})
    # ok: seckit.sess-c5.python-jwt-signature-not-verified
    jwt.decode(token, key, algorithms=["RS256"], audience="api")
    # ruleid: seckit.sess-c5.python-jwt-alg-none
    jwt.decode(token, key, algorithms=["HS256", "none"])

# ruleid: seckit.sess-c1.python-insecure-cookie-settings
SESSION_COOKIE_SECURE = False
# ok: seckit.sess-c1.python-insecure-cookie-settings
SESSION_COOKIE_HTTPONLY = True

def view(response, request):
    # ruleid: seckit.sess-c1.python-insecure-cookie-settings
    response.set_cookie("sid", "x", httponly=False)
    # ruleid: seckit.sess-c7.python-credentials-in-query
    token = request.args.get("token")
    # ok: seckit.sess-c7.python-credentials-in-query
    page = request.args.get("page")
    # ruleid: seckit.sess-c6.python-random-for-secrets
    reset_code = random.randint(100000, 999999)
    # ok: seckit.sess-c6.python-random-for-secrets
    jitter = random.random()

# ruleid: seckit.sess-c2.python-csrf-disabled
@csrf_exempt
def webhook(request):
    return None
