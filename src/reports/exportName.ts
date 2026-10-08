// Names of the files the report export leaves in the cache directory.

/** `pomi-report-<date>.pdf|csv|json` files this app created earlier. */
export function isReportExportName(name: string): boolean {
  return /^pomi-report-.*\.(pdf|csv|json)$/.test(name);
}
