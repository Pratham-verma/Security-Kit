from django.utils.safestring import mark_safe
from flask import redirect, render_template_string, request
from markupsafe import Markup
import requests, ssl

def view(comment, name):
    # ruleid: seckit.web-c1.python-unsafe-markup
    html = mark_safe(comment)
    # ruleid: seckit.web-c1.python-unsafe-markup
    m = Markup(comment)
    # ok: seckit.web-c1.python-unsafe-markup
    ok = mark_safe("<br>")
    # ruleid: seckit.web-c1.python-template-from-string
    render_template_string(request.args["tpl"])
    # ok: seckit.web-c1.python-template-from-string
    render_template_string("Hello {{ name }}", name=name)
    # ruleid: seckit.web-c6.python-open-redirect
    redirect(request.args.get("next"))
    # ok: seckit.web-c6.python-open-redirect
    redirect("/dashboard")
    # ruleid: seckit.web-c4.python-tls-verification-disabled
    requests.get("https://internal.example.com", verify=False)
    # ruleid: seckit.web-c4.python-tls-verification-disabled
    ctx = ssl._create_unverified_context()
    # ok: seckit.web-c4.python-tls-verification-disabled
    requests.get("https://internal.example.com", timeout=5)
