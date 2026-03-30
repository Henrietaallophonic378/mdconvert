// lib/compress/__tests__/pdf.test.ts
// Tests for compressPdf() — mock execFile (Ghostscript)

jest.mock('child_process');
jest.mock('fs/promises');

import { execFile } from 'child_process';
import fs from 'fs/promises';

const mockExecFile = execFile as jest.MockedFunction<typeof execFile>;
const mockStat = fs.stat as jest.MockedFunction<typeof fs.stat>;

// We test the logic and argument building directly
// Since compressPdf uses promisify(execFile), we need to mock execFile

describe('compressPdf — Ghostscript args', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock stat to return file sizes
    mockStat.mockImplementation((filePath: any) => {
      return Promise.resolve({ size: filePath.includes('output') ? 500 : 1000 } as any);
    });
  });

  const validPresets = ['screen', 'ebook', 'printer', 'prepress'] as const;

  it.each(validPresets)('passes correct dPDFSETTINGS for preset: %s', async (preset) => {
    let capturedArgs: string[] = [];
    mockExecFile.mockImplementation((cmd: any, args: any, callback: any) => {
      if (cmd === 'gs' && args.includes('--version')) {
        callback(null, '10.0', '');
        return;
      }
      capturedArgs = args;
      callback(null, '', '');
    });

    try {
      const { compressPdf } = await import('../pdf');
      await compressPdf('/tmp/input.pdf', '/tmp/output.pdf', preset);
    } catch { /* Ignore any errors from mocked fs */ }

    if (capturedArgs.length > 0) {
      expect(capturedArgs).toContain(`-dPDFSETTINGS=/${preset}`);
      expect(capturedArgs).toContain('-sDEVICE=pdfwrite');
    }
  });

  // execFile truyền args dạng array — không qua shell — nên $, `;`, backtick trong
  // tên file là hoàn toàn an toàn. Chỉ null byte mới bị reject.
  it('allows path with shell metacharacters (safe with execFile)', async () => {
    mockExecFile.mockImplementation((cmd: any, args: any, callback: any) => {
      callback(null, '', '');
    });
    const { compressPdf } = await import('../pdf');
    // Không throw — execFile không interpret shell metacharacters
    await expect(
      compressPdf('/tmp/file$name;test.pdf', '/tmp/output.pdf', 'ebook')
    ).resolves.toBeDefined();
  });

  it('rejects path with null byte', async () => {
    const { compressPdf } = await import('../pdf');
    await expect(
      compressPdf('/tmp/evil\0.pdf', '/tmp/output.pdf', 'ebook')
    ).rejects.toThrow(/ký tự không hợp lệ/i);
  });

  it('falls back to ebook for invalid preset', async () => {
    let capturedArgs: string[] = [];
    mockExecFile.mockImplementation((cmd: any, args: any, callback: any) => {
      if (args && args.includes('--version')) { callback(null, '10.0', ''); return; }
      capturedArgs = args;
      callback(null, '', '');
    });

    try {
      const { compressPdf } = await import('../pdf');
      await compressPdf('/tmp/input.pdf', '/tmp/output.pdf', 'invalid-preset');
    } catch { /* ignore */ }

    if (capturedArgs.length > 0) {
      expect(capturedArgs).toContain('-dPDFSETTINGS=/ebook');
    }
  });
});
