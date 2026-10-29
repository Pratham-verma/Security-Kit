// Node-only side of @seckit/core: loads the knowledge base, schemas and project files from disk and
// compiles validators with Ajv at runtime. The browser build uses pre-compiled data instead (browser.ts).
import { lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import { assetDir } from './assets.js';
import { type AttestationsFile, parseAttestations } from './attestations.js';
import type { FileSource } from './detect.js';
import { buildKnowledgeBase } from './kb.js';
import { parseManifest } from './manifest.js';
import { formatErrors } from './schemas.js';
import type { Component, KnowledgeBase, Manifest, Validator, Validators } from './types.js';

export { assetDir } from './assets.js';
export { defaultRulesDir, loadRulePack, type SemgrepRule } from './rules.js';

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

/** The Ajv settings shared by runtime compilation and the browser's pre-compiled validators. */
export function createAjv(opts: { code?: { source: boolean; esm: boolean } } = {}): Ajv2020 {
  return new Ajv2020({ allErrors: true, useDefaults: true, strict: false, ...opts });
}

/** Load every `components/*.yaml` file in a knowledge-base directory and validate it. */
export function loadKnowledgeBase(dir: string, schemasDir = assetDir('schemas')): KnowledgeBase {
  const ajv = createAjv();
  const validateComponent = ajv.compile(readJson(join(schemasDir, 'component.schema.json')));
  const componentsDir = join(dir, 'components');
  const issues: string[] = [];
  const components: Component[] = [];
  const options = new Map<string, Validator>();

  for (const file of readdirSync(componentsDir).filter((f) => /\.ya?ml$/.test(f)).sort()) {
    const data: unknown = parse(readFileSync(join(componentsDir, file), 'utf8'));
    if (!validateComponent(data)) {
      issues.push(...formatErrors(validateComponent.errors, `${file}: `));
      continue;
    }
    const component = data as Component;
    if (component.options) {
      try {
        options.set(component.id, ajv.compile(component.options));
      } catch (e) {
        issues.push(`component "${component.id}": options is not a valid JSON Schema (${(e as Error).message})`);
      }
    }
    components.push(component);
  }

  const validators: Validators = {
    manifest: ajv.compile(readJson(join(schemasDir, 'seckit.schema.json'))),
    attestations: ajv.compile(readJson(join(schemasDir, 'attestations.schema.json'))),
    options: (id) => options.get(id),
  };
  return buildKnowledgeBase(components, validators, issues);
}

/** Load the knowledge base that ships with Security Kit. */
export function loadDefaultKnowledgeBase(): KnowledgeBase {
  return loadKnowledgeBase(assetDir('knowledge-base'));
}

export function loadManifest(path: string, kb: KnowledgeBase): Manifest {
  return parseManifest(readFileSync(path, 'utf8'), kb);
}

/** Load attestations; a missing file means no attestations. */
export function loadAttestations(path: string, kb: KnowledgeBase): AttestationsFile {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, attestations: [] };
    throw e;
  }
  return parseAttestations(text, kb);
}

const MAX_FILE_BYTES = 2_000_000;

/**
 * A project directory on disk as a FileSource. Never follows paths outside the root. Reads and listings are
 * cached for the life of the source (one detection run), since detection asks for the same folders often —
 * which is slow on network and VM shared folders.
 */
export function nodeFileSource(root: string): FileSource {
  const raw = rawFileSource(root);
  const reads = new Map<string, string | undefined>();
  const lists = new Map<string, string[]>();
  return {
    read(rel) {
      if (!reads.has(rel)) {
        // Most reads are for files a project does not have (pom.xml, Podfile…): answer those from the
        // cached folder listing instead of a failing disk read.
        const i = rel.lastIndexOf('/');
        const exists = this.list(i === -1 ? '' : rel.slice(0, i)).includes(rel.slice(i + 1));
        reads.set(rel, exists ? raw.read(rel) : undefined);
      }
      return reads.get(rel);
    },
    list(rel) {
      if (!lists.has(rel)) lists.set(rel, raw.list(rel));
      return lists.get(rel)!;
    },
  };
}

function rawFileSource(root: string): FileSource {
  const base = resolve(root);
  const abs = (rel: string) => {
    const p = resolve(base, rel);
    return p === base || p.startsWith(base + sep) ? p : undefined;
  };
  return {
    read(rel) {
      const p = abs(rel);
      if (!p) return undefined;
      try {
        if (statSync(p).size > MAX_FILE_BYTES) return undefined;
        return readFileSync(p, 'utf8');
      } catch {
        return undefined;
      }
    },
    list(rel) {
      const p = abs(rel);
      if (!p) return [];
      try {
        return readdirSync(p, { withFileTypes: true }).map((d) => {
          const isDir = d.isDirectory() || (d.isSymbolicLink() && safeIsDir(join(p, d.name)));
          return isDir ? `${d.name}/` : d.name;
        });
      } catch {
        return [];
      }
    },
  };
}

function safeIsDir(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}
