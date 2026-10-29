class Notes {
    void query(android.database.sqlite.SQLiteDatabase db, String id) {
        // ruleid: seckit.db-c1.mobile-sqlite-string-building
        db.rawQuery("SELECT * FROM notes WHERE id = " + id, null);
        // ok: seckit.db-c1.mobile-sqlite-string-building
        db.rawQuery("SELECT * FROM notes WHERE id = ?", new String[]{id});
    }
}

class UserRepository {
    private static final String COLUMNS = "id, name";

    User find(JdbcTemplate jdbcTemplate, Statement stmt, EntityManager em, String name) throws Exception {
        // ruleid: seckit.db-c1.java-sql-string-building
        jdbcTemplate.query("SELECT * FROM users WHERE name = '" + name + "'", mapper);
        // ok: seckit.db-c1.java-sql-string-building
        jdbcTemplate.query("SELECT * FROM users WHERE name = ?", mapper, name);
        String sql = "SELECT * FROM users WHERE name = '" + name + "'";
        // ruleid: seckit.db-c1.java-sql-string-building
        stmt.executeQuery(sql);
        String safe = "SELECT * FROM users WHERE name = ?";
        // ok: seckit.db-c1.java-sql-string-building
        stmt.executeQuery(safe);
        // ruleid: seckit.db-c1.java-sql-string-building
        em.createQuery(String.format("FROM User u WHERE u.name = '%s'", name));
        // ok: seckit.db-c1.java-sql-string-building
        em.createQuery("FROM User u WHERE u.name = :name").setParameter("name", name);
        return null;
    }
}
