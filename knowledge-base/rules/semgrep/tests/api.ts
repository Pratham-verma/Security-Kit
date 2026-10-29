import cors from "cors";
declare const app: any, req: any, res: any, User: any, prisma: any, axios: any, ApolloServer: any, err: Error;

// ruleid: seckit.api-c3.mass-assignment
User.create(req.body);
// ruleid: seckit.api-c3.mass-assignment
prisma.user.update({ where: { id: 1 }, data: req.body });
// ruleid: seckit.api-c3.mass-assignment
const u = new User(req.body);
// ok: seckit.api-c3.mass-assignment
User.create({ name: req.body.name, email: req.body.email });

// ruleid: seckit.api-c6.permissive-cors
app.use(cors());
// ruleid: seckit.api-c6.permissive-cors
app.use(cors({ origin: true, credentials: true }));
// ruleid: seckit.api-c6.permissive-cors
res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
// ok: seckit.api-c6.permissive-cors
app.use(cors({ origin: ["https://app.example.com"] }));

// ruleid: seckit.api-c5.ssrf-user-url
fetch(req.body.url);
// ruleid: seckit.api-c5.ssrf-user-url
axios.get(req.query.imageUrl);
// ok: seckit.api-c5.ssrf-user-url
fetch("https://api.example.com/rates");

// ruleid: seckit.api-c8.error-details-in-response
res.status(500).json({ message: "failed", stack: err.stack });
// ruleid: seckit.api-c8.error-details-in-response
res.status(500).send(err);
// ok: seckit.api-c8.error-details-in-response
res.status(500).json({ error: "Internal error", requestId: "abc" });

// ruleid: seckit.api-c7.graphql-introspection-enabled
new ApolloServer({ typeDefs: "", introspection: true });
