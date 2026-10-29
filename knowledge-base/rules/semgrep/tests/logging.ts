declare const logger: any, req: any, user: any;

// ruleid: seckit.log-c2.sensitive-data-logged
console.log("incoming", req.body);
// ruleid: seckit.log-c2.sensitive-data-logged
logger.info(process.env);
// ruleid: seckit.log-c2.sensitive-data-logged
logger.debug("login", user.password);
// ok: seckit.log-c2.sensitive-data-logged
logger.info({ userId: user.id }, "login");

// ruleid: seckit.log-c3.request-data-in-log-message
logger.info(`search for ${req.query.q}`);
// ok: seckit.log-c3.request-data-in-log-message
logger.info({ q: req.query.q }, "search");
