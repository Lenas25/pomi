// Names of the files the report export leaves in the cache directory.

/** `pomi-report-<date>.pdf` files this app created earlier. */
export function isReportExportName(name: string): boolean {
  return /^pomi-report-.*\.pdf$/.test(name);
}
