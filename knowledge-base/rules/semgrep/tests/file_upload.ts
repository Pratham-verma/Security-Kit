import multer from "multer";
import path from "path";
declare const req: any, file: any, cb: any;

// ruleid: seckit.upload-c2.client-filename-in-path
const dest = path.join("/uploads", file.originalname);
// ruleid: seckit.upload-c2.client-filename-in-path
cb(null, file.originalname);
// ruleid: seckit.upload-c2.client-filename-in-path
req.files.avatar.mv("/uploads/" + req.files.avatar.name);
// ok: seckit.upload-c2.client-filename-in-path
cb(null, crypto.randomUUID() + ".png");

// ruleid: seckit.upload-c3.multer-without-limits
const upload = multer({ dest: "uploads/" });
// ok: seckit.upload-c3.multer-without-limits
const upload2 = multer({ dest: "uploads/", limits: { fileSize: 5_000_000 } });
