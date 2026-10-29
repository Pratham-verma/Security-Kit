import requests, traceback
from flask import Flask, request
from rest_framework import serializers

app = Flask(__name__)

def fetch_preview():
    # ruleid: seckit.api-c5.python-ssrf-user-url
    requests.get(request.json["url"])
    # ruleid: seckit.api-c5.python-ssrf-user-url
    requests.post(request.args.get("callback"), json={})
    # ok: seckit.api-c5.python-ssrf-user-url
    requests.get("https://api.example.com/rates")

def create(User):
    # ruleid: seckit.api-c3.python-mass-assignment
    User.objects.create(**request.data)
    # ruleid: seckit.api-c3.python-mass-assignment
    user = User(**request.get_json())
    # ok: seckit.api-c3.python-mass-assignment
    User.objects.create(name=request.data["name"])

# ruleid: seckit.api-c3.python-mass-assignment
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = None
        fields = "__all__"

class SafeSerializer(serializers.ModelSerializer):
    class Meta:
        model = None
        fields = ["id", "name"]

def handler():
    try:
        pass
    except Exception:
        # ruleid: seckit.api-c8.python-traceback-in-response
        return {"error": traceback.format_exc()}, 500

# ruleid: seckit.api-c8.python-debug-enabled
app.run(host="0.0.0.0", debug=True)
