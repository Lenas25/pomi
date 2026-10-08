// Report PDFs are deleted after sharing, but a crash or a killed app can leave one in the cache
// (it holds personal data). Runs once per app start.
import { removeStaleCacheFiles } from '../backup/files';

import { isReportExportName } from './exportName';

let started = false;

export function sweepReportExportsAtStart(): void {
  if (started) return;
  started = true;
  removeStaleCacheFiles(isReportExportName);
}
