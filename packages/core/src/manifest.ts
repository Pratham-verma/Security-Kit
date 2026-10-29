import { parse } from 'yaml';
import { formatErrors } from './schemas.js';
import { type KnowledgeBase, type Manifest, ValidationError } from './types.js';

/** Validate a manifest object against the schema and the knowledge base. Applies option defaults in place. */
export function validateManifest(data: unknown, kb: KnowledgeBase): Manifest {
  const validateSchema = kb.validators.manifest;
  if (!validateSchema(data)) {
    throw new ValidationError('Invalid seckit.yaml', formatErrors(validateSchema.errors));
  }
  const manifest = data as Manifest;
  const issues: string[] = [];

  manifest.components.forEach((instance, i) => {
    const component = kb.components.get(instance.type);
    if (!component) {
      const known = [...kb.components.keys()].join(', ');
      issues.push(`/components/${i} unknown component type "${instance.type}" (known: ${known})`);
      return;
    }
    if (!component.platforms.some((p) => manifest.app.platforms.includes(p))) {
      issues.push(`/components/${i} "${instance.type}" does not apply to any of the app's platforms`);
    }
    const validate = kb.validators.options(component.id);
    if (validate) {
      const { type: _type, name: _name, ...options } = instance;
      if (validate(options)) {
        Object.assign(instance, options); // carry over defaults filled in by ajv
      } else {
        issues.push(...formatErrors(validate.errors, `/components/${i} (${instance.type}) `));
      }
    }
  });

  if (issues.length > 0) throw new ValidationError('Invalid seckit.yaml', issues);
  return manifest;
}

/** Parse and validate seckit.yaml text. */
export function parseManifest(text: string, kb: KnowledgeBase): Manifest {
  return validateManifest(parse(text), kb);
}
