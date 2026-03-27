// lib/__tests__/zip.test.ts
// Tests for createZipStream() — filename convention + file inclusion logic

// Mock fs to control which "files exist"
jest.mock('fs', () => ({
  existsSync:  jest.fn(),
  readdirSync: jest.fn(),
  statSync:    jest.fn(),
}));

jest.mock('archiver', () => {
  const files: string[] = [];
  const mockArchive = {
    file:     jest.fn((_path: string, opts: { name: string }) => { files.push(opts.name); }),
    finalize: jest.fn(),
    pipe:     jest.fn(),
    on:       jest.fn(),
    // Store for test assertions
    _files:   files,
  };
  const archiverFactory = jest.fn(() => mockArchive);
  (archiverFactory as any).__mock = mockArchive;
  return archiverFactory;
});

import fs from 'fs';
import { createZipStream } from '../zip';
import archiver from 'archiver';

const mockExistsSync  = fs.existsSync  as jest.MockedFunction<typeof fs.existsSync>;
const mockReaddirSync = fs.readdirSync as jest.MockedFunction<typeof fs.readdirSync>;
const mockStatSync    = fs.statSync    as jest.MockedFunction<typeof fs.statSync>;
const mockArchiver    = archiver       as jest.MockedFunction<typeof archiver>;

describe('createZipStream', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the files array on the mock
    ((mockArchiver as any).__mock?._files ?? []).length = 0;
  });

  describe('filename convention', () => {
    it('produces filename in format: [slug]-[YYYYMMDD].zip', () => {
      mockExistsSync.mockReturnValue(false);

      const { filename } = createZipStream({
        conversionId: 'id-1',
        fileType: 'pdf',
        slug: 'my-doc',
        fullMdPath: null,
        textOnlyMdPath: '/tmp/my-doc-text-only.md',
        imagesDir: null,
      });

      // Slug part
      expect(filename).toMatch(/^my-doc-/);
      // Date part: 8 digits
      expect(filename).toMatch(/\d{8}\.zip$/);
      // Full pattern
      expect(filename).toMatch(/^my-doc-\d{8}\.zip$/);
    });

    it('uses today date in YYYYMMDD format', () => {
      mockExistsSync.mockReturnValue(false);

      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

      const { filename } = createZipStream({
        conversionId: 'id',
        fileType: 'pdf',
        slug: 'doc',
        fullMdPath: null,
        textOnlyMdPath: '/tmp/doc.md',
        imagesDir: null,
      });

      expect(filename).toContain(today);
    });
  });

  describe('DOCX ZIP includes full.md + text-only.md + images/', () => {
    it('adds full.md when it exists for DOCX', () => {
      mockExistsSync.mockImplementation((p: any) => {
        return ['/outputs/full.md', '/outputs/text-only.md'].includes(String(p));
      });
      mockReaddirSync.mockReturnValue([]);

      const archive = (mockArchiver as any).__mock;

      createZipStream({
        conversionId: 'id',
        fileType: 'docx',
        slug: 'doc',
        fullMdPath: '/outputs/full.md',
        textOnlyMdPath: '/outputs/text-only.md',
        imagesDir: '/outputs/images',
      });

      expect(archive.file).toHaveBeenCalledWith(
        '/outputs/full.md',
        expect.objectContaining({ name: 'doc-full.md' })
      );
    });

    it('adds images from imagesDir for DOCX', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['doc-img-001.png', 'doc-img-002.png'] as any);
      mockStatSync.mockReturnValue({ isFile: () => true } as any);

      const archive = (mockArchiver as any).__mock;

      createZipStream({
        conversionId: 'id',
        fileType: 'docx',
        slug: 'doc',
        fullMdPath: '/outputs/full.md',
        textOnlyMdPath: '/outputs/text-only.md',
        imagesDir: '/outputs/images',
      });

      const imageAdds = (archive.file as jest.Mock).mock.calls.filter(
        ([, opts]: [string, { name: string }]) => opts.name.startsWith('images/')
      );
      expect(imageAdds).toHaveLength(2);
    });
  });

  describe('PDF ZIP includes only text-only.md', () => {
    it('does NOT add full.md for PDF', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([]);

      const archive = (mockArchiver as any).__mock;

      createZipStream({
        conversionId: 'id',
        fileType: 'pdf',
        slug: 'report',
        fullMdPath: '/outputs/full.md', // provided but should be ignored for PDF
        textOnlyMdPath: '/outputs/text-only.md',
        imagesDir: null,
      });

      const fileNames = (archive.file as jest.Mock).mock.calls.map(
        ([, opts]: [string, { name: string }]) => opts.name
      );
      expect(fileNames).not.toContain('report-full.md');
      expect(fileNames).toContain('report-text-only.md');
    });

    it('does NOT add images/ for PDF', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['img.png'] as any);

      const archive = (mockArchiver as any).__mock;

      createZipStream({
        conversionId: 'id',
        fileType: 'pdf',
        slug: 'report',
        fullMdPath: null,
        textOnlyMdPath: '/outputs/text-only.md',
        imagesDir: '/outputs/images', // provided but should be ignored for PDF
      });

      const fileNames = (archive.file as jest.Mock).mock.calls.map(
        ([, opts]: [string, { name: string }]) => opts.name
      );
      expect(fileNames.every((n: string) => !n.startsWith('images/'))).toBe(true);
    });
  });
});
