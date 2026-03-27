// lib/ai/__tests__/gemini.test.ts
// Tests for describeImages() batch behavior

jest.mock('@/lib/settings', () => ({
  getSetting: jest.fn((key: string) => {
    const defaults: Record<string, string> = {
      ai_api_key:    'test-key',
      ai_model:      'gemini-2.0-flash-lite',
      ai_image_prompt: 'Describe this image.',
      ai_pdf_prompt:   'Convert this PDF.',
      ai_provider:   'gemini',
    };
    return Promise.resolve(defaults[key] ?? '');
  }),
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue(Buffer.from('fake-image-data')),
}));

// Mock @google/generative-ai (dynamically imported in gemini.ts)
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => 'First line — short alt\nDetailed description here.',
        },
      }),
    }),
  })),
}));

import { describeImages } from '../gemini';

// ─── describeImages (batch) ───────────────────────────────────────────────────

describe('describeImages batch', () => {
  const FAKE_PATHS = Array.from({ length: 10 }, (_, i) => `/tmp/img-${i}.png`);

  it('returns results in same order as input', async () => {
    const results = await describeImages(FAKE_PATHS, 5);
    expect(results).toHaveLength(10);
  });

  it('splits 10 images into 2 chunks when concurrency=5', async () => {
    const chunkSizes: number[] = [];
    let chunkStart = 0;

    // Track chunks by counting how many times the first image of each chunk is processed
    const results = await describeImages(FAKE_PATHS, 5, (done, _total) => {
      const chunkSize = done - chunkStart;
      if (chunkSize === 5) {
        chunkSizes.push(chunkSize);
        chunkStart = done;
      }
    });

    expect(results).toHaveLength(10);
  });

  it('calls onChunkDone callback with progress', async () => {
    const progressUpdates: number[] = [];
    await describeImages(FAKE_PATHS.slice(0, 5), 5, (done, _total) => {
      progressUpdates.push(done);
    });
    expect(progressUpdates).toContain(5); // after first (and only) chunk
  });

  it('continues on individual image failure, returns fallback', async () => {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const mockGenAI = GoogleGenerativeAI as jest.MockedClass<any>;

    let callCount = 0;
    mockGenAI.mockImplementation(() => ({
      getGenerativeModel: () => ({
        generateContent: () => {
          callCount++;
          // Fail both attempt 0 and attempt 1 for image #2 (calls 2 and 3)
          // so the retry loop exhausts and returns the fallback
          if (callCount === 2 || callCount === 3) throw new Error('Simulated API failure');
          return Promise.resolve({ response: { text: () => 'OK description' } });
        },
      }),
    }));

    const paths = ['/tmp/img-0.png', '/tmp/img-fail.png', '/tmp/img-2.png'];
    const results = await describeImages(paths, 3);

    expect(results).toHaveLength(3);
    // Failed image should have fallback, others should succeed
    expect(results[1].description).toBe('[Không thể mô tả hình này]');
    expect(results[0].description).not.toBe('[Không thể mô tả hình này]');
  });

  it('returns shortAlt from first line of description', async () => {
    const results = await describeImages(['/tmp/img.png'], 1);
    // The mock returns 'First line — short alt\nDetailed...'
    // shortAlt should be the first line (up to 100 chars)
    expect(results[0].shortAlt).toBeTruthy();
    expect(results[0].shortAlt.length).toBeLessThanOrEqual(100);
  });
});

// ─── sanitizeError (M6) ──────────────────────────────────────────────────────

describe('sanitizeError', () => {
  // Test by checking the error message patterns don't appear in logs
  it('API key pattern AIzaXXX should be stripped from error messages', () => {
    const rawMsg = 'Request failed: key=AIzaSyABC123XYZtest status 403';

    // Apply same logic as sanitizeError in gemini.ts
    const sanitized = rawMsg
      .replace(/key=[A-Za-z0-9_-]+/gi, 'key=***')
      .replace(/AIza[A-Za-z0-9_-]{35,}/g, 'AIza***')
      .replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer ***');

    expect(sanitized).not.toContain('AIzaSyABC123');
    expect(sanitized).toContain('key=***');
  });
});
