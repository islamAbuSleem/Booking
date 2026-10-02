/**
 * Slugify a string for URL-safe identifiers.
 *
 * Lowercases, removes non-alphanumeric chars (except hyphens), collapses
 * multiple hyphens, trims leading/trailing hyphens.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}