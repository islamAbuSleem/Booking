import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('hashes with Argon2id and verifies the same password', async () => {
    const hash = await passwords.hash('correct-horse-8');

    expect(hash).toContain('$argon2id$');
    await expect(passwords.verify(hash, 'correct-horse-8')).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await passwords.hash('correct-horse-8');

    await expect(passwords.verify(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('treats a malformed stored hash as a mismatch, not a 500', async () => {
    await expect(passwords.verify('not-a-hash', 'whatever')).resolves.toBe(
      false,
    );
  });

  it('does not need a rehash for a fresh hash', async () => {
    const hash = await passwords.hash('fresh-password-8');

    expect(passwords.needsRehash(hash)).toBe(false);
  });

  it('flags a hash made with weaker parameters for rehash', async () => {
    // A hash with the minimum memory cost is valid but below our parameters,
    // so `needsRehash` must report it for the opportunistic upgrade on login.
    const argon2 = (await import('argon2')).default;
    const weak = await argon2.hash('old-password-8', {
      type: argon2.argon2id,
      memoryCost: 8192,
      timeCost: 1,
      parallelism: 1,
    });

    expect(passwords.needsRehash(weak)).toBe(true);
  });

  it('runs the dummy verify without throwing', async () => {
    await expect(passwords.dummyVerify()).resolves.toBeUndefined();
  });
});
