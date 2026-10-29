// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from '../src/index.js';

describe('sanitizeHtml without a DOM', () => {
  it('fails closed instead of returning unsanitized HTML', () => {
    expect(() => sanitizeHtml('<img src=x onerror=alert(1)>')).toThrow(/no DOM available/);
  });
});
