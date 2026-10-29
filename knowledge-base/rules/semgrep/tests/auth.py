import hashlib

def store(password, data, salt):
    # ruleid: seckit.auth-c2.python-fast-hash-for-password
    hashlib.sha256(password.encode()).hexdigest()
    # ruleid: seckit.auth-c2.python-fast-hash-for-password
    hashlib.md5(user_password).hexdigest()
    # ok: seckit.auth-c2.python-fast-hash-for-password
    hashlib.sha256(data).hexdigest()
    # ok: seckit.auth-c2.python-fast-hash-for-password
    hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
