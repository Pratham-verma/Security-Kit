declare const db: any, pool: any, prisma: any, User: any, req: any, sql: any;
const id = req.params.id;

// ruleid: seckit.db-c1.sql-string-building, seckit.db-c1.sql-template-literal
db.query(`SELECT * FROM users WHERE id = ${id}`);
// ruleid: seckit.db-c1.sql-string-building
pool.query("SELECT * FROM users WHERE id = " + id);
// ruleid: seckit.db-c1.sql-string-building, seckit.db-c1.sql-template-literal
prisma.$queryRawUnsafe(`SELECT * FROM users WHERE id = ${id}`);
// ok: seckit.db-c1.sql-string-building
db.query("SELECT * FROM users WHERE id = $1", [id]);
// ok: seckit.db-c1.sql-string-building
prisma.$queryRaw`SELECT * FROM users WHERE id = ${id}`;

// ruleid: seckit.db-c1.sql-template-literal
const q = `SELECT name FROM users WHERE id = ${id}`;
// ok: seckit.db-c1.sql-template-literal
const q2 = sql`SELECT name FROM users WHERE id = ${id}`;
// ok: seckit.db-c1.sql-template-literal
const msg = `Selected ${id} items`;

// ruleid: seckit.db-c2.nosql-request-object
User.findOne(req.body);
// ruleid: seckit.db-c2.nosql-request-object
User.findOne({ email: req.body.email, password: req.body.password });
// ok: seckit.db-c2.nosql-request-object
User.findOne({ email: String(req.body.email) });

// ruleid: seckit.db-c2.nosql-where
User.find({ $where: "this.age > 18" });

// ruleid: seckit.db-c5.tls-verification-disabled
const p = { ssl: { rejectUnauthorized: false } };
// ok: seckit.db-c5.tls-verification-disabled
const p2 = { ssl: { rejectUnauthorized: true } };
// ruleid: seckit.db-c5.tls-verification-disabled
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
