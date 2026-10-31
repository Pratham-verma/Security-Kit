// Bundles the browser app twice:
//  - dist/public:  local mode (seckit ui, Docker) — served by the local server
//  - dist/hosted:  hosted mode (the website, e.g. /app) — fully static, engine runs in the browser
// No inline scripts or styles, so both work under a strict Content-Security-Policy.
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const here = (p) => new URL(p, import.meta.url);
const coreSrc = (f) => new URL(`../../core/src/${f}`, import.meta.url).pathname;
const common = {
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  legalComments: 'linked',
  logLevel: 'warning',
  alias: { '@seckit/core/browser': coreSrc('browser.ts'), '@seckit/core/engine': coreSrc('engine.ts') },
};

// Start clean so no stale files ship.
rmSync(here('../dist/public/'), { recursive: true, force: true });
rmSync(here('../dist/hosted/'), { recursive: true, force: true });

// Local mode
cpSync(here('../public/'), here('../dist/public/'), { recursive: true });
await build({ ...common, entryPoints: [here('../src/app/entry-local.ts').pathname], outfile: here('../dist/public/js/main.js').pathname });

// Hosted mode: same styles and icon, relative paths, its own title and description.
mkdirSync(here('../dist/hosted/js'), { recursive: true });
cpSync(here('../public/styles.css'), here('../dist/hosted/styles.css'));
cpSync(here('../public/favicon.svg'), here('../dist/hosted/favicon.svg'));
const html = readFileSync(here('../public/index.html'), 'utf8')
  .replace('<title>Security Kit</title>', '<title>Security Kit</title>\n  <meta name="description" content="Describe your app and get a tailored security checklist and AI prompt. Runs in your browser.">')
  .replace('href="/favicon.svg"', 'href="./favicon.svg"')
  .replace('href="/styles.css"', 'href="./styles.css"')
  .replace('src="/js/main.js"', 'src="./js/app.js"');
writeFileSync(here('../dist/hosted/index.html'), html);
await build({ ...common, entryPoints: [here('../src/app/entry-hosted.ts').pathname], outfile: here('../dist/hosted/js/app.js').pathname });
// build.json lets open pages notice a new deployment and reload (see src/app/session.ts).
const hostedHash = createHash('sha256');
for (const f of ['index.html', 'styles.css', 'js/app.js']) hostedHash.update(readFileSync(here(`../dist/hosted/${f}`)));
writeFileSync(here('../dist/hosted/build.json'), JSON.stringify({ buildId: hostedHash.digest('hex').slice(0, 16) }) + '\n');
console.log('built dist/public (local) and dist/hosted (website)');
