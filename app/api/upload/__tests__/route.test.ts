// app/api/upload/__tests__/route.test.ts
// Tests for POST /api/upload

jest.mock('@/lib/prisma', () => ({
  prisma: {
    conversion: {
      create: jest.fn(),
    },
  },
}));

jest.mock('@/lib/upload', () => ({
  validateFile: jest.fn(),
  saveUploadedFile: jest.fn(),
  parseCompressLevel: jest.fn().mockReturnValue('ebook'),
}));

jest.mock('@/lib/auth-helpers', () => ({
  getSessionUserId: jest.fn().mockResolvedValue('user-123'),
}));

jest.mock('fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
}));

import { POST } from '../route';
import { prisma } from '@/lib/prisma';
import { validateFile, saveUploadedFile } from '@/lib/upload';

const mockCreate       = prisma.conversion.create        as jest.MockedFunction<any>;
const mockValidateFile = validateFile                    as jest.MockedFunction<any>;
const mockSaveFile     = saveUploadedFile                as jest.MockedFunction<any>;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME  = 'application/pdf';

function makeFormData(files: { name: string; type: string; size?: number }[]): FormData {
  const fd = new FormData();
  for (const f of files) {
    const blob = new Blob(['content'], { type: f.type });
    const file = new File([blob], f.name, { type: f.type });
    if (f.size !== undefined) Object.defineProperty(file, 'size', { value: f.size });
    fd.append('files', file);
  }
  return fd;
}

function makeRequest(fd: FormData): Request {
  return new Request('http://localhost/api/upload', { method: 'POST', body: fd });
}

describe('POST /api/upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockSaveFile.mockResolvedValue({
      conversionId: 'conv-uuid-1',
      originalPath: '/uploads/conv-uuid-1-test.docx',
      outputDir:    '/outputs/conv-uuid-1',
      normalizedName: 'test.docx',
    });

    mockCreate.mockImplementation(({ data }: any) => Promise.resolve({
      id:       data.id,
      fileName: data.fileName,
      fileType: data.fileType,
      fileSize: data.fileSize,
      status:   data.status,
    }));
  });

  it('returns 201 for valid .docx', async () => {
    mockValidateFile.mockReturnValue({ valid: true, fileType: 'docx', extension: '.docx' });

    const fd = makeFormData([{ name: 'report.docx', type: DOCX_MIME }]);
    const res = await POST(makeRequest(fd));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.conversions).toHaveLength(1);
    expect(body.conversions[0].fileType).toBe('docx');
  });

  it('returns 201 for valid .pdf', async () => {
    mockValidateFile.mockReturnValue({ valid: true, fileType: 'pdf', extension: '.pdf' });

    const fd = makeFormData([{ name: 'report.pdf', type: PDF_MIME }]);
    const res = await POST(makeRequest(fd));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.conversions[0].fileType).toBe('pdf');
  });

  it('returns 400 for invalid file type', async () => {
    mockValidateFile.mockReturnValue({
      valid: false,
      error: 'Chỉ hỗ trợ .docx và .pdf',
    });

    const fd = makeFormData([{ name: 'notes.txt', type: 'text/plain' }]);
    const res = await POST(makeRequest(fd));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].error).toMatch(/docx|pdf/i);
  });

  it('returns 400 when no files provided', async () => {
    const fd = new FormData();
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/file/i);
  });

  it('saves valid file and creates DB record with session user', async () => {
    mockValidateFile.mockReturnValue({ valid: true, fileType: 'docx', extension: '.docx' });

    const fd = makeFormData([{ name: 'doc.docx', type: DOCX_MIME }]);
    await POST(makeRequest(fd));

    expect(mockSaveFile).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdBy: 'user-123', // C3: from session
        }),
      })
    );
  });

  it('batch: returns conversions array for multiple files', async () => {
    mockValidateFile.mockReturnValue({ valid: true, fileType: 'docx', extension: '.docx' });
    mockSaveFile
      .mockResolvedValueOnce({ conversionId: 'id-1', originalPath: '/u/id-1.docx', outputDir: '/o/id-1', normalizedName: 'a.docx' })
      .mockResolvedValueOnce({ conversionId: 'id-2', originalPath: '/u/id-2.docx', outputDir: '/o/id-2', normalizedName: 'b.docx' });

    const fd = makeFormData([
      { name: 'a.docx', type: DOCX_MIME },
      { name: 'b.docx', type: DOCX_MIME },
    ]);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.conversions).toHaveLength(2);
  });

  it('batch: saves valid file, rejects invalid, returns partial success', async () => {
    mockValidateFile
      .mockReturnValueOnce({ valid: true, fileType: 'docx', extension: '.docx' })
      .mockReturnValueOnce({ valid: false, error: 'Chỉ hỗ trợ .docx và .pdf' });

    const fd = makeFormData([
      { name: 'ok.docx', type: DOCX_MIME },
      { name: 'bad.txt', type: 'text/plain' },
    ]);
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.conversions).toHaveLength(1);
    expect(body.errors).toHaveLength(1);
  });

  it('H2: deletes file if DB create fails (no zombie files)', async () => {
    mockValidateFile.mockReturnValue({ valid: true, fileType: 'pdf', extension: '.pdf' });
    mockCreate.mockRejectedValue(new Error('DB connection lost'));

    const fd = makeFormData([{ name: 'test.pdf', type: PDF_MIME }]);
    const res = await POST(makeRequest(fd));

    // Import fs to check unlink was called
    const fs = await import('fs/promises');
    const mockUnlink = fs.unlink as jest.MockedFunction<any>;

    expect(mockUnlink).toHaveBeenCalledWith(
      expect.stringContaining('conv-uuid-1')
    );
  });

  it('backward compat: single file returns flat response format', async () => {
    mockValidateFile.mockReturnValue({ valid: true, fileType: 'pdf', extension: '.pdf' });

    const fd = new FormData();
    const blob = new Blob(['content'], { type: PDF_MIME });
    fd.append('file', new File([blob], 'single.pdf', { type: PDF_MIME }));

    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(201);
    const body = await res.json();

    // Should have both flat format AND conversions array
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('conversions');
  });
});
