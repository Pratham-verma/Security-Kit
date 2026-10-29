// Detection rules live in @seckit/core (shared with the browser app); this reads the project from disk.
import { basename, resolve } from 'node:path';
import { detect, type Detection, nodeFileSource } from '@seckit/core';

export { type DetectedComponent, type Detection, ENGINE_KIND } from '@seckit/core';

export function detectProject(root: string): Detection {
  return detect(nodeFileSource(root), basename(resolve(root)));
}
