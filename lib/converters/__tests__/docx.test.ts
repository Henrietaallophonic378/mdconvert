// lib/converters/__tests__/docx.test.ts
// Tests for slugify() and sanitize behavior in docx converter

import { slugify } from '../docx';

describe('slugify', () => {
  it('converts basic English filename to slug', () => {
    expect(slugify('My Report.docx')).toBe('my-report');
  });

  it('strips Vietnamese diacritics', () => {
    expect(slugify('Quy-Trình-Đóng-Gói.docx')).toBe('quy-trinh-dong-goi');
  });

  it('converts đ → d', () => {
    expect(slugify('đơn hàng.docx')).toBe('don-hang');
  });

  it('replaces multiple spaces/special chars with single dash', () => {
    expect(slugify('SOP  v1.0 - Final!.docx')).toBe('sop-v1-0-final');
  });

  it('strips leading and trailing dashes', () => {
    expect(slugify('- report -.docx')).toBe('report');
  });

  it('handles filename without extension', () => {
    expect(slugify('readme')).toBe('readme');
  });

  it('handles all-special-chars filename', () => {
    const result = slugify('!!!.docx');
    // Should return empty string or a safe fallback — not crash
    expect(typeof result).toBe('string');
    expect(result).not.toMatch(/[^a-z0-9-]/);
  });

  it('handles Vietnamese NFD input (normalize before slug)', () => {
    // NFD: 'e' + combining circumflex + combining grave
    const nfd = 'Quy tre\u0302\u0300nh.docx';
    const result = slugify(nfd);
    expect(result).toMatch(/^[a-z0-9-]+$/);
  });

  it('keeps numbers', () => {
    expect(slugify('SOP-v2-2025.docx')).toBe('sop-v2-2025');
  });
});
