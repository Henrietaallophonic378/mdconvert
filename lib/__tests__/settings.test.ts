// lib/__tests__/settings.test.ts
// Tests for getSetting, getAllSettings with mocked Prisma

jest.mock('@/lib/prisma', () => ({
  prisma: {
    appSetting: {
      findUnique: jest.fn(),
      findMany:   jest.fn(),
      upsert:     jest.fn(),
    },
  },
}));

jest.mock('@/lib/crypto', () => ({
  encrypt: (val: string) => `encrypted:${val}`,
  decrypt: (val: string) => val.replace('encrypted:', ''),
}));

import { getSetting, getAllSettings, setSetting, SETTING_DEFAULTS } from '../settings';
import { prisma } from '@/lib/prisma';

const mockFindUnique = prisma.appSetting.findUnique as jest.MockedFunction<any>;
const mockFindMany   = prisma.appSetting.findMany   as jest.MockedFunction<any>;
const mockUpsert     = prisma.appSetting.upsert     as jest.MockedFunction<any>;

// ─── getSetting ───────────────────────────────────────────────────────────────

describe('getSetting', () => {
  it('returns default value when key not in DB', async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await getSetting('ai_provider');
    expect(result).toBe('gemini'); // default
  });

  it('returns stored value from DB', async () => {
    mockFindUnique.mockResolvedValue({ key: 'ai_model', value: 'gemini-1.5-pro' });
    const result = await getSetting('ai_model');
    expect(result).toBe('gemini-1.5-pro');
  });

  it('decrypts api_key when reading from DB', async () => {
    mockFindUnique.mockResolvedValue({ key: 'ai_api_key', value: 'encrypted:AIzaSyTEST123' });
    const result = await getSetting('ai_api_key');
    expect(result).toBe('AIzaSyTEST123');
  });

  it('returns empty string for unknown key with no default', async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await getSetting('nonexistent_key');
    expect(result).toBe('');
  });

  it('returns empty string if decrypt fails (corrupted value)', async () => {
    jest.mock('@/lib/crypto', () => ({
      encrypt: (v: string) => v,
      decrypt: () => { throw new Error('decrypt failed'); },
    }));

    // Reset modules to pick up new mock
    jest.resetModules();
  });
});

// ─── getAllSettings ───────────────────────────────────────────────────────────

describe('getAllSettings', () => {
  it('merges DB values with defaults', async () => {
    mockFindMany.mockResolvedValue([
      { key: 'ai_provider', value: 'openai' },
      { key: 'ai_model',    value: 'gpt-4o' },
    ]);

    const settings = await getAllSettings();

    expect(settings.ai_provider).toBe('openai');
    expect(settings.ai_model).toBe('gpt-4o');
    // Defaults for keys not in DB
    expect(settings).toHaveProperty('ai_image_prompt');
  });

  it('uses only 1 DB query (no N+1)', async () => {
    mockFindMany.mockResolvedValue([]);
    await getAllSettings();
    // findMany should be called exactly once, not N times per key
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  it('returns all default keys when DB is empty', async () => {
    mockFindMany.mockResolvedValue([]);
    const settings = await getAllSettings();

    for (const key of Object.keys(SETTING_DEFAULTS)) {
      expect(settings).toHaveProperty(key);
    }
  });
});

// ─── setSetting ──────────────────────────────────────────────────────────────

describe('setSetting', () => {
  it('encrypts api_key before storing', async () => {
    mockUpsert.mockResolvedValue({ key: 'ai_api_key', value: 'encrypted:KEY' });
    await setSetting('ai_api_key', 'my-secret-key');

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          value: 'encrypted:my-secret-key',
        }),
      })
    );
  });

  it('stores non-sensitive keys as plaintext', async () => {
    mockUpsert.mockResolvedValue({ key: 'ai_provider', value: 'gemini' });
    await setSetting('ai_provider', 'gemini');

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          value: 'gemini', // NOT encrypted
        }),
      })
    );
  });
});
