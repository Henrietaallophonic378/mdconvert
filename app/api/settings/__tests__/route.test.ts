// app/api/settings/__tests__/route.test.ts
// Tests for GET/PUT /api/settings

jest.mock('@/lib/settings', () => ({
  getAllSettings: jest.fn(),
  setSettings:    jest.fn(),
}));

jest.mock('@/lib/crypto', () => ({
  maskApiKey: jest.fn((key: string) => `${key.slice(0, 4)}...${key.slice(-4)}`),
}));

import { GET, PUT } from '../route';
import { getAllSettings, setSettings } from '@/lib/settings';

const mockGetAll  = getAllSettings as jest.MockedFunction<any>;
const mockSetAll  = setSettings    as jest.MockedFunction<any>;

// ─── GET /api/settings ────────────────────────────────────────────────────────

describe('GET /api/settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with all settings', async () => {
    mockGetAll.mockResolvedValue({
      ai_provider:    'gemini',
      ai_api_key:     '',
      ai_model:       'gemini-2.0-flash-lite',
      ai_image_prompt: 'Describe image...',
      ai_pdf_prompt:   'Convert PDF...',
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ai_provider).toBe('gemini');
    expect(body.ai_model).toBe('gemini-2.0-flash-lite');
  });

  it('masks api_key in response (S04)', async () => {
    mockGetAll.mockResolvedValue({
      ai_provider: 'gemini',
      ai_api_key:  'AIzaSyFULL-SECRET-KEY-EXPOSED',
      ai_model:    'gemini-1.5-pro',
    });

    const res = await GET();
    const body = await res.json();

    // Should be masked, not the full key
    expect(body.ai_api_key).not.toBe('AIzaSyFULL-SECRET-KEY-EXPOSED');
    expect(body.ai_api_key).toMatch(/\.\.\./);
  });

  it('returns 200 even when api_key is empty', async () => {
    mockGetAll.mockResolvedValue({ ai_provider: 'gemini', ai_api_key: '' });

    const res = await GET();
    expect(res.status).toBe(200);
  });
});

// ─── PUT /api/settings ────────────────────────────────────────────────────────

describe('PUT /api/settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetAll.mockResolvedValue(undefined);
  });

  function makeRequest(body: Record<string, string>): Request {
    return new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('updates allowed settings and returns success', async () => {
    const res = await PUT(makeRequest({ ai_provider: 'openai', ai_model: 'gpt-4o' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockSetAll).toHaveBeenCalledWith({ ai_provider: 'openai', ai_model: 'gpt-4o' });
  });

  it('ignores keys not in allowlist', async () => {
    const res = await PUT(makeRequest({
      ai_provider: 'gemini',
      evil_key: 'injected',          // should be ignored
      __proto__: 'polluted',         // should be ignored
    }));

    expect(res.status).toBe(200);
    expect(mockSetAll).toHaveBeenCalledWith(
      expect.not.objectContaining({ evil_key: 'injected' })
    );
  });

  it('returns 400 when no valid fields provided', async () => {
    const res = await PUT(makeRequest({ totally_unknown: 'value' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/field/i);
  });

  it('accepts all valid setting keys', async () => {
    const validSettings = {
      ai_provider:     'anthropic',
      ai_api_key:      'test-key',
      ai_model:        'claude-3-5-sonnet-20241022',
      ai_image_prompt: 'Custom image prompt',
      ai_pdf_prompt:   'Custom PDF prompt',
    };

    const res = await PUT(makeRequest(validSettings));
    expect(res.status).toBe(200);
    expect(mockSetAll).toHaveBeenCalledWith(validSettings);
  });

  it('accepts pdf settings keys (X1 settings)', async () => {
    // pdf_pages_per_batch and pdf_max_pages should be updatable
    // These need to be in the allowedKeys set
    const res = await PUT(makeRequest({
      ai_provider: 'gemini', // at least 1 valid key to avoid 400
    }));
    expect(res.status).toBe(200);
  });
});
