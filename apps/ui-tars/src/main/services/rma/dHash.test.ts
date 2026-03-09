import { describe, it, expect } from 'vitest';
import { computeDHash, hammingDistance } from './dHash';

describe('dHash', () => {
  it('returns same hash for identical images', async () => {
    const sharp = (await import('sharp')).default;
    const buf = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();
    const base64 = buf.toString('base64');
    const h1 = await computeDHash(base64);
    const h2 = await computeDHash(base64);
    expect(h1).toBe(h2);
  });

  it('returns zero hamming distance for identical hashes', async () => {
    expect(hammingDistance(0b1010n, 0b1010n)).toBe(0);
  });

  it('returns correct hamming distance', async () => {
    expect(hammingDistance(0b1010n, 0b1001n)).toBe(2);
  });

  it('returns low distance for similar images', async () => {
    const sharp = (await import('sharp')).default;
    const buf1 = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();
    const buf2 = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 250, g: 250, b: 250 } },
    })
      .png()
      .toBuffer();
    const h1 = await computeDHash(buf1.toString('base64'));
    const h2 = await computeDHash(buf2.toString('base64'));
    expect(hammingDistance(h1, h2)).toBeLessThan(10);
  });

  it('returns high distance for very different images', async () => {
    const sharp = (await import('sharp')).default;
    const buf1 = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();
    const buf2 = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const h1 = await computeDHash(buf1.toString('base64'));
    const h2 = await computeDHash(buf2.toString('base64'));
    expect(hammingDistance(h1, h2)).toBeGreaterThan(20);
  });
});
