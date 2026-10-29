import crypto, { createHash } from "crypto";
declare const md5: any, password: string, user: any, data: string;

// ruleid: seckit.auth-c2.fast-hash-for-password
crypto.createHash("sha256").update(password).digest("hex");
// ruleid: seckit.auth-c2.fast-hash-for-password
createHash("md5").update(user.password).digest("hex");
// ruleid: seckit.auth-c2.fast-hash-for-password
md5(password);
// ok: seckit.auth-c2.fast-hash-for-password
crypto.createHash("sha256").update(data).digest("hex");
