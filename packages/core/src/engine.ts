// The pure engine: no Node APIs, so it runs in Node and in browsers (see browser.ts).
export * from './types.js';
export { type Attestation, type AttestationsFile, type AttestationStatus, parseAttestations, validateAttestations } from './attestations.js';
export { type Choice, AI_CHOICES, defaultStandards, LEVEL_CHOICES, manifestFromDetection, PLATFORM_CHOICES, SENSITIVITY_CHOICES } from './choices.js';
export { type DetectedComponent, type Detection, detect, ENGINE_KIND, type FileSource } from './detect.js';
export { detectFromText, MAX_DESCRIPTION_LENGTH, type TextDetection } from './describe-text.js';
export { buildKnowledgeBase } from './kb.js';
export { parseManifest, validateManifest } from './manifest.js';
export { renderManifestYaml, unansweredOptions } from './manifest-yaml.js';
export { matchesWhen, resolveControls } from './resolve.js';
export { formatErrors } from './schemas.js';
export { AI_FILES, BLOCK_BEGIN, BLOCK_END, mergeManagedBlock, renderCursorRule, renderRules } from './render/ai-rules.js';
export {
  buildChecklist,
  type Checklist,
  type ChecklistItem,
  type ChecklistSection,
  type PromptMode,
  renderAiPrompt,
  renderChecklistMarkdown,
} from './render/checklist.js';
export { renderControlsJson } from './render/controls-json.js';
export { componentHeading, escapeCell, formatStandards, LEVEL_LABELS, STANDARD_LABELS, uniqueControls } from './render/format.js';
export { renderPlanMarkdown } from './render/plan-md.js';
export { renderSnippets, type Snippet } from './render/snippets.js';
