fun query(db: android.database.sqlite.SQLiteDatabase, id: String) {
    // ruleid: seckit.db-c1.mobile-sqlite-string-building
    db.rawQuery("SELECT * FROM notes WHERE id = " + id, null)
    // ruleid: seckit.db-c1.kotlin-sqlite-string-template
    db.rawQuery("SELECT * FROM notes WHERE id = $id", null)
    // ok: seckit.db-c1.mobile-sqlite-string-building, seckit.db-c1.kotlin-sqlite-string-template
    db.rawQuery("SELECT * FROM notes WHERE id = ?", arrayOf(id))
}

class UserRepository(private val jdbcTemplate: JdbcTemplate) {
    fun find(name: String) {
        // ruleid: seckit.db-c1.kotlin-server-sql-string-building
        jdbcTemplate.queryForList("SELECT * FROM users WHERE name = '$name'")
        // ruleid: seckit.db-c1.kotlin-server-sql-string-building
        jdbcTemplate.update("DELETE FROM users WHERE name = '" + name + "'")
        // ok: seckit.db-c1.kotlin-server-sql-string-building
        jdbcTemplate.queryForList("SELECT * FROM users WHERE name = ?", name)
    }
}
