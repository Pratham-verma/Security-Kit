// Hosted mode: let people point at their project (a .zip or the folder) so the form fills itself in. Files
// are read here, in the browser, and never uploaded. Only dependency lists, build/config files and (for mobile
// features) a bounded number of native sources and infrastructure files (AWS) are read; .env files are listed but never opened.
import type { PickedFiles } from './hosted-backend.js';
import { listZip, readZipText, ZipError } from './zip.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'build', 'dist', 'Pods', '.gradle', 'DerivedData', '.dart_tool', 'vendor', '.venv', 'venv', 'target', '.next', 'coverage']);
const READ = /(^|\/)(package\.json|pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|libs\.versions\.toml|Podfile|Package\.swift|Package\.resolved|pubspec\.yaml|requirements[^/]*\.(txt|in)|pyproject\.toml|Pipfile|schema\.prisma|AndroidManifest\.xml|Info\.plist|[^/]+\.entitlements|app\.json|app\.config\.json)$/;
const NATIVE_SOURCE = /\.(kt|java|swift)$/;
// Infrastructure code (Terraform, CloudFormation/SAM, Serverless, CDK, Elastic Beanstalk) for AWS detection.
const IAC = /(\.tf$|(^|\/)(serverless\.ya?ml|cdk\.json|Dockerrun\.aws\.json|\.elasticbeanstalk\/config\.yml)$|(^|\/|[-_.])(template|stack|cloudformation|cfn|sam)[-_.][^/]*\.(ya?ml|json|template)$|(^|\/)(infra|infrastructure|terraform|tf|iac|deploy|deployment|deployments|cdk|cloudformation|cfn|stacks|templates|environments|envs|modules|aws|cloud|ops|devops)\/[^/]*\.(ya?ml|json|template)$)/i;
const MAX_IAC_FILES = 300;
const NEVER_READ = /(^|\/)\.env[^/]*$/;
const MAX_FILES = 20_000;
const MAX_READ_BYTES = 512 * 1024;
const MAX_NATIVE_SOURCES = 1500;

export interface PickResult {
  folder: string;
  files: PickedFiles;
  read: number;
}

function choose(opts: { folder: boolean; accept?: string }): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = opts.folder;
    if (opts.accept) input.accept = opts.accept;
    if (opts.folder) input.setAttribute('webkitdirectory', '');
    input.addEventListener('change', () => resolve([...(input.files ?? [])]));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}

/** Which files detection reads: decided from path and size alone, so nothing else is ever opened. */
function fileSelector(): (path: string, size: number) => boolean {
  let native = 0;
  let iac = 0;
  return (path, size) =>
    !NEVER_READ.test(path) && size <= MAX_READ_BYTES && (READ.test(path) || (NATIVE_SOURCE.test(path) && native++ < MAX_NATIVE_SOURCES) || (IAC.test(path) && iac++ < MAX_IAC_FILES));
}

const skipped = (path: string) => !path || path.split('/').some((part) => SKIP_DIRS.has(part));

/** Ask for the project folder and read the parts detection needs. */
export async function pickProject(): Promise<PickResult | null> {
  const picked = await choose({ folder: true });
  if (picked.length === 0) return null;
  const relative = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
  const folder = relative(picked[0]!).split('/')[0] ?? '';
  const wanted = fileSelector();
  const files: PickedFiles = {};
  let read = 0;
  for (const file of picked.slice(0, MAX_FILES)) {
    // Drop the top folder name so paths are relative to the project root.
    const path = relative(file).split('/').slice(1).join('/');
    if (skipped(path)) continue;
    const want = wanted(path, file.size);
    files[path] = want ? await file.text() : null;
    if (want) read++;
  }
  return { folder, files, read };
}

/** Ask for a .zip of the project, or read one the user dropped, and read the parts detection needs. */
export async function pickZip(dropped?: File): Promise<PickResult | null> {
  const file = dropped ?? (await choose({ folder: false, accept: '.zip,application/zip,application/x-zip-compressed' }))[0];
  if (!file) return null;
  const entries = (await listZip(file)).filter((e) => !e.dir && !e.path.startsWith('__MACOSX/') && !/(^|\/)\._/.test(e.path));
  // Paths come from the archive: keep them relative and inside the project, whatever they claim.
  const clean = entries
    .map((e) => ({ entry: e, path: e.path.replace(/\\/g, '/').replace(/^\/+/, '') }))
    .filter(({ path }) => !path.split('/').some((part) => part === '..'));
  if (clean.length === 0) throw new ZipError('That .zip is empty.');
  // Most zips hold one top folder ("my-app/…"): treat it as the project root, like a picked folder.
  const top = clean[0]!.path.split('/')[0]!;
  const oneRoot = clean.every(({ path }) => path.startsWith(`${top}/`));
  const folder = oneRoot ? top : file.name.replace(/\.zip$/i, '');
  const wanted = fileSelector();
  const files: PickedFiles = {};
  let read = 0;
  let listed = 0;
  for (const { entry, path: full } of clean) {
    const path = oneRoot ? full.slice(top.length + 1) : full;
    if (skipped(path)) continue;
    if (listed++ >= MAX_FILES) break;
    const text = wanted(path, entry.size) ? await readZipText(file, entry, MAX_READ_BYTES) : null;
    files[path] = text;
    if (text !== null) read++;
  }
  return { folder, files, read };
}

/** Read one small text file the user picked (e.g. a seckit.yaml to import). */
export async function pickTextFile(accept: string): Promise<{ name: string; text: string } | null> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  const file = await new Promise<File | undefined>((resolve) => {
    input.addEventListener('change', () => resolve(input.files?.[0]));
    input.addEventListener('cancel', () => resolve(undefined));
    input.click();
  });
  if (!file) return null;
  if (file.size > 256 * 1024) throw new Error('That file is too large to be a seckit.yaml.');
  return { name: file.name, text: await file.text() };
}
