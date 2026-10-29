import DOMPurify from "dompurify";
declare const el: HTMLElement, userInput: string, req: any, res: any, sanitizeHtml: (s: string) => string;

// ruleid: seckit.web-c1.dynamic-html-sink
el.innerHTML = userInput;
// ok: seckit.web-c1.dynamic-html-sink
el.innerHTML = "<b>static</b>";
// ok: seckit.web-c1.dynamic-html-sink
el.innerHTML = DOMPurify.sanitize(userInput);
// ruleid: seckit.web-c1.dynamic-html-sink
const a = <div dangerouslySetInnerHTML={{ __html: userInput }} />;
// ok: seckit.web-c1.dynamic-html-sink
const b = <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />;
// ruleid: seckit.web-c1.dynamic-html-sink
document.write(userInput);
// ok: seckit.web-c1.dynamic-html-sink
const c = <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(userInput) }} />;

// ruleid: seckit.web-c1.eval
eval(userInput);
// ruleid: seckit.web-c1.eval
const f = new Function("a", userInput);
// ruleid: seckit.web-c1.eval
setTimeout("doThing()", 10);
// ok: seckit.web-c1.eval
setTimeout(() => {}, 10);

// ruleid: seckit.web-c6.open-redirect
res.redirect(req.query.next);
// ok: seckit.web-c6.open-redirect
res.redirect("/dashboard");

// ruleid: seckit.web-c4.insecure-http-url
fetch("http://api.example.com/v1/users");
// ok: seckit.web-c4.insecure-http-url
fetch("http://localhost:3000/api");
// ok: seckit.web-c4.insecure-http-url
fetch("https://api.example.com/v1/users");
