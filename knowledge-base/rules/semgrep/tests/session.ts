import jwt from "jsonwebtoken";
declare const req: any, res: any, key: string, token: string, session: any;

// ruleid: seckit.sess-c5.jwt-verify-without-algorithms
jwt.verify(token, key);
// ruleid: seckit.sess-c5.jwt-verify-without-algorithms
jwt.verify(token, key, { audience: "api" });
// ok: seckit.sess-c5.jwt-verify-without-algorithms
jwt.verify(token, key, { algorithms: ["RS256"], audience: "api" });

// ruleid: seckit.sess-c5.jwt-decode-without-verify
const claims = jwt.decode(token);

// ruleid: seckit.sess-c5.jwt-alg-none
jwt.verify(token, key, { algorithms: ["HS256", "none"] });

// ruleid: seckit.sess-c3.token-in-web-storage
localStorage.setItem("accessToken", token);
// ok: seckit.sess-c3.token-in-web-storage
localStorage.setItem("theme", "dark");

// ruleid: seckit.sess-c6.math-random-token
const id = Math.random().toString(36).slice(2);
// ruleid: seckit.sess-c6.math-random-token
const resetToken = Math.floor(Math.random() * 1e9);
// ok: seckit.sess-c6.math-random-token
const delay = Math.random() * 100;

// ruleid: seckit.sess-c1.insecure-cookie-flags
res.cookie("sid", token, { httpOnly: false, secure: true });
// ruleid: seckit.sess-c1.insecure-cookie-flags
session({ secret: key, cookie: { secure: false } });
// ok: seckit.sess-c1.insecure-cookie-flags
res.cookie("sid", token, { httpOnly: true, secure: true, sameSite: "lax" });

// ruleid: seckit.sess-c7.credentials-in-query
const t = req.query.access_token;
// ok: seckit.sess-c7.credentials-in-query
const page = req.query.page;
