/**
 * Slugify a string for URL-safe identifiers.
 *
 * Lowercases, folds Latin diacritics, removes non-alphanumeric chars (except hyphens),
 * collapses multiple hyphens, trims leading/trailing hyphens.
 *
 * A name with no ASCII in it cannot become a readable slug by any local rule — "北京饭店"
 * reduces to nothing. It still has to produce *something*, because `hotels.slug` is
 * `@unique` and is the public handle on `/hotels/{slug}`: an empty slug is a 409 waiting
 * for the second such hotel, and a dead route in the meantime. So an empty result falls
 * back to a short digest of the input — stable, so the same name always maps to the same
 * slug, and distinct, so two different names do not collide on it.
 */
import { createHash } from 'node:crypto';

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    // NFD splits "é" into "e" plus a combining mark, so folding the marks first turns
    // "Café" into "cafe" instead of dropping the letter with the accent.
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (slug) return slug;
  return `stay-${createHash('sha256').update(input).digest('hex').slice(0, 10)}`;
}