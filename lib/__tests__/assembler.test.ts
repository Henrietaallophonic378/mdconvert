// lib/__tests__/assembler.test.ts
// Tests for assembleDocxOutput and assembleDocxNoImages

import { assembleDocxOutput, assembleDocxNoImages } from '../assembler';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'mdconvert-test-'));
}

async function cleanup(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
}

// ─── assembleDocxOutput ───────────────────────────────────────────────────────

describe('assembleDocxOutput', () => {
  let tmpDir: string;
  let rawMdPath: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
    rawMdPath = path.join(tmpDir, 'raw.md');
  });

  afterEach(async () => {
    await cleanup(tmpDir);
  });

  it('inserts image + blockquote into full.md', async () => {
    await fs.writeFile(rawMdPath,
      '# Heading\n\n![alt](images/sop-img-001.png)\n\nParagraph.',
      'utf-8'
    );

    const descriptions = [{
      imageName: 'sop-img-001.png',
      description: 'Screenshot showing the login screen.',
      shortAlt: 'Login screen',
    }];

    const { fullMdPath } = await assembleDocxOutput(rawMdPath, descriptions, 'sop', tmpDir);
    const content = await fs.readFile(fullMdPath, 'utf-8');

    expect(content).toContain('![Login screen](images/sop-img-001.png)');
    expect(content).toContain('> Screenshot showing the login screen.');
  });

  it('removes image link from text-only.md, keeps description blockquote', async () => {
    await fs.writeFile(rawMdPath,
      '# Title\n\n![](images/sop-img-001.png)\n\nEnd.',
      'utf-8'
    );

    const descriptions = [{
      imageName: 'sop-img-001.png',
      description: 'A diagram showing steps.',
      shortAlt: 'Diagram',
    }];

    const { textOnlyMdPath } = await assembleDocxOutput(rawMdPath, descriptions, 'sop', tmpDir);
    const content = await fs.readFile(textOnlyMdPath, 'utf-8');

    expect(content).not.toContain('![');
    expect(content).toContain('> A diagram showing steps.');
  });

  it('handles multi-line description as proper blockquote', async () => {
    await fs.writeFile(rawMdPath, '![](images/img.png)', 'utf-8');

    const descriptions = [{
      imageName: 'img.png',
      description: 'Line one.\nLine two.\nLine three.',
      shortAlt: 'Alt',
    }];

    const { fullMdPath } = await assembleDocxOutput(rawMdPath, descriptions, 'test', tmpDir);
    const content = await fs.readFile(fullMdPath, 'utf-8');

    expect(content).toContain('> Line one.');
    expect(content).toContain('> Line two.');
    expect(content).toContain('> Line three.');
  });

  it('uses fallback placeholder when image has no description', async () => {
    await fs.writeFile(rawMdPath, '![](images/unknown.png)', 'utf-8');

    const { fullMdPath, textOnlyMdPath } = await assembleDocxOutput(rawMdPath, [], 'test', tmpDir);

    const full = await fs.readFile(fullMdPath, 'utf-8');
    const textOnly = await fs.readFile(textOnlyMdPath, 'utf-8');

    expect(full).toContain('![Hình minh họa](images/unknown.png)');
    expect(textOnly).toContain('Hình minh họa');
  });

  it('handles document with no images', async () => {
    const rawContent = '# Title\n\nJust text, no images.';
    await fs.writeFile(rawMdPath, rawContent, 'utf-8');

    const { fullMdPath, textOnlyMdPath } = await assembleDocxOutput(rawMdPath, [], 'doc', tmpDir);

    const full = await fs.readFile(fullMdPath, 'utf-8');
    const textOnly = await fs.readFile(textOnlyMdPath, 'utf-8');

    expect(full).toBe(rawContent);
    expect(textOnly).toBe(rawContent);
  });

  it('handles Pandoc attribute syntax ![alt](path){width=...}', async () => {
    await fs.writeFile(rawMdPath,
      '![fig](images/chart.png){width="50%"}',
      'utf-8'
    );

    const descriptions = [{
      imageName: 'chart.png',
      description: 'A bar chart.',
      shortAlt: 'Chart',
    }];

    const { fullMdPath } = await assembleDocxOutput(rawMdPath, descriptions, 'doc', tmpDir);
    const content = await fs.readFile(fullMdPath, 'utf-8');

    // Should consume the {width=...} attribute, not leave it dangling
    expect(content).not.toContain('{width=');
    expect(content).toContain('> A bar chart.');
  });

  it('handles HTML <img> tag fallback from Pandoc', async () => {
    await fs.writeFile(rawMdPath,
      '<img src="images/diagram.png" alt="Diagram" />',
      'utf-8'
    );

    const descriptions = [{
      imageName: 'diagram.png',
      description: 'A flow diagram.',
      shortAlt: 'Flow diagram',
    }];

    const { fullMdPath } = await assembleDocxOutput(rawMdPath, descriptions, 'doc', tmpDir);
    const content = await fs.readFile(fullMdPath, 'utf-8');

    expect(content).toContain('> A flow diagram.');
  });

  it('creates output files with correct slug-based names', async () => {
    await fs.writeFile(rawMdPath, '# Content', 'utf-8');

    const { fullMdPath, textOnlyMdPath } = await assembleDocxOutput(
      rawMdPath, [], 'my-doc', tmpDir
    );

    expect(path.basename(fullMdPath)).toBe('my-doc-full.md');
    expect(path.basename(textOnlyMdPath)).toBe('my-doc-text-only.md');
  });
});

// ─── assembleDocxNoImages ────────────────────────────────────────────────────

describe('assembleDocxNoImages', () => {
  let tmpDir: string;

  beforeEach(async () => { tmpDir = await makeTempDir(); });
  afterEach(async () => { await cleanup(tmpDir); });

  it('copies raw content to both full.md and text-only.md', async () => {
    const rawPath = path.join(tmpDir, 'raw.md');
    const content = '# Title\n\nParagraph with no images.';
    await fs.writeFile(rawPath, content, 'utf-8');

    const { fullMdPath, textOnlyMdPath } = await assembleDocxNoImages(rawPath, 'doc', tmpDir);

    const full = await fs.readFile(fullMdPath, 'utf-8');
    const textOnly = await fs.readFile(textOnlyMdPath, 'utf-8');

    expect(full).toBe(content);
    expect(textOnly).toBe(content);
  });

  it('creates files with correct names', async () => {
    const rawPath = path.join(tmpDir, 'raw.md');
    await fs.writeFile(rawPath, '# x', 'utf-8');

    const result = await assembleDocxNoImages(rawPath, 'slug-test', tmpDir);

    expect(path.basename(result.fullMdPath)).toBe('slug-test-full.md');
    expect(path.basename(result.textOnlyMdPath)).toBe('slug-test-text-only.md');
  });
});
