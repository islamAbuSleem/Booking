import { describe, expect, it } from 'vitest';
import { slugify } from './slugify.js';

/**
 * The slug rules, including the one that cannot be skipped: whatever the name is, the
 * result is a usable public handle. An empty slug is both a unique-constraint landmine and
 * a dead route.
 */

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Larkspur House')).toBe('larkspur-house');
    expect(slugify('The Grand  Hotel!!')).toBe('the-grand-hotel');
    expect(slugify('  Padded  ')).toBe('padded');
  });

  it('keeps digits', () => {
    expect(slugify('Hotel 42')).toBe('hotel-42');
  });

  it('folds Latin diacritics instead of dropping the letter', () => {
    expect(slugify('Café Zürich')).toBe('cafe-zurich');
  });

  it('never returns an empty slug for a non-Latin name', () => {
    const slug = slugify('北京饭店');

    expect(slug).not.toBe('');
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('gives the same name the same fallback, so it is stable across retries', () => {
    expect(slugify('北京饭店')).toBe(slugify('北京饭店'));
  });

  it('gives different non-Latin names different slugs', () => {
    expect(slugify('北京饭店')).not.toBe(slugify('上海旅馆'));
  });
});