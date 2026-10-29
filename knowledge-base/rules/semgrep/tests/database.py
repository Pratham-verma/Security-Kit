from django.db import connection
from sqlalchemy import text

def get(cursor, user_id, User):
    # ruleid: seckit.db-c1.python-sql-string-building
    cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
    # ruleid: seckit.db-c1.python-sql-string-building
    cursor.execute("SELECT * FROM users WHERE id = %s" % user_id)
    # ruleid: seckit.db-c1.python-sql-string-building
    User.objects.raw("SELECT * FROM users WHERE name = '{}'".format(user_id))
    # ruleid: seckit.db-c1.python-sql-string-building
    text(f"SELECT * FROM users WHERE id = {user_id}")
    # ok: seckit.db-c1.python-sql-string-building
    cursor.execute("SELECT * FROM users WHERE id = %s", [user_id])
    # ok: seckit.db-c1.python-sql-string-building
    text("SELECT * FROM users WHERE id = :id")

def nosql(users):
    # ruleid: seckit.db-c2.nosql-where
    users.find({"$where": "this.age > 18"})
