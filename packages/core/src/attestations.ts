import { parse } from 'yaml';
import { formatErrors } from './schemas.js';
import { type KnowledgeBase, ValidationError } from './types.js';

export type AttestationStatus = 'done' | 'not_applicable' | 'risk_accepted';

export interface Attestation {
  control: string;
  status: AttestationStatus;
  by: string;
  date: string;
  evidence?: string;
  reason?: string;
  expires?: string;
}

export interface AttestationsFile {
  version: 1;
  attestations: Attestation[];
}

/** Validate an attestations document against the schema and the knowledge base. */
export function validateAttestations(data: unknown, kb: KnowledgeBase): AttestationsFile {
  const validate = kb.validators.attestations;
  if (!validate(data)) {
    throw new ValidationError('Invalid .seckit/attestations.yaml', formatErrors(validate.errors));
  }
  const file = data as AttestationsFile;
  const known = new Set([...kb.components.values()].flatMap((c) => c.controls.map((x) => x.id)));
  const seen = new Set<string>();
  const issues: string[] = [];
  file.attestations.forEach((a, i) => {
    if (!known.has(a.control)) issues.push(`/attestations/${i} unknown control "${a.control}"`);
    if (seen.has(a.control)) issues.push(`/attestations/${i} "${a.control}" is attested more than once`);
    seen.add(a.control);
    if (a.expires && a.expires < a.date) issues.push(`/attestations/${i} expires before its date`);
  });
  if (issues.length > 0) throw new ValidationError('Invalid .seckit/attestations.yaml', issues);
  return file;
}

/** Parse and validate attestations text; empty text means no attestations. */
export function parseAttestations(text: string, kb: KnowledgeBase): AttestationsFile {
  return validateAttestations(parse(text) ?? { version: 1, attestations: [] }, kb);
}
