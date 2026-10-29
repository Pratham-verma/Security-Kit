import os
from werkzeug.utils import secure_filename

def save(f, upload_dir, fs):
    # ruleid: seckit.upload-c2.python-client-filename-in-path
    f.save(os.path.join(upload_dir, f.filename))
    # ruleid: seckit.upload-c2.python-client-filename-in-path
    fs.save(f.name, f)
    # ok: seckit.upload-c2.python-client-filename-in-path
    f.save(os.path.join(upload_dir, secure_filename(f.filename)))
