// Hosted mode: let people point at their project folder so the form fills itself in. Files are read
// here, in the browser, and never uploaded. Only dependency lists, build/config files and (for mobile
// features) a bounded number of native sources and infrastructure files (AWS) are read; .env files are listed but never opened.
import type { PickedFiles } from './hosted-backend.js';

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

function choose(opts: { folder: boolean }): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (opts.folder) input.setAttribute('webkitdirectory', '');
    input.addEventListener('change', () => resolve([...(input.files ?? [])]));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}

/** Ask for a project folder (or individual files) and read the parts detection needs. */
export async function pickProject(opts: { folder: boolean }): Promise<PickResult | null> {
  const picked = await choose(opts);
  if (picked.length === 0) return null;
  const relative = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
  const folder = opts.folder ? relative(picked[0]!).split('/')[0] ?? '' : '';
  const files: PickedFiles = {};
  let read = 0;
  let native = 0;
  let iac = 0;
  for (const file of picked.slice(0, MAX_FILES)) {
    // Drop the top folder name so paths are relative to the project root.
    const path = opts.folder ? relative(file).split('/').slice(1).join('/') : file.name;
    if (!path || path.split('/').some((part) => SKIP_DIRS.has(part))) continue;
    const wanted = !NEVER_READ.test(path) && file.size <= MAX_READ_BYTES && (READ.test(path) || (NATIVE_SOURCE.test(path) && native++ < MAX_NATIVE_SOURCES) || (IAC.test(path) && iac++ < MAX_IAC_FILES));
    files[path] = wanted ? await file.text() : null;
    if (wanted) read++;
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
