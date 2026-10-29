Future<void> lookup(Database db, String name) async {
  // ruleid: seckit.db-c1.dart-sql-string-building
  await db.query('users', where: 'name = $name');
  // ok: seckit.db-c1.dart-sql-string-building
  await db.query('users', where: 'name = ?', whereArgs: [name]);
  // ruleid: seckit.db-c1.dart-sql-string-building
  await db.rawQuery('SELECT * FROM users WHERE name = ' + name);
  // ruleid: seckit.db-c1.dart-sql-string-building
  await db.rawDelete("DELETE FROM users WHERE id = ${name}");
  // ok: seckit.db-c1.dart-sql-string-building
  await db.rawQuery('SELECT * FROM users WHERE name = ?', [name]);
}
