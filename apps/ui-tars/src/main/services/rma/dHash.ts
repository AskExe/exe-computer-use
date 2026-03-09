import sharp from 'sharp';

export async function computeDHash(base64: string): Promise<bigint> {
  const buf = Buffer.from(base64, 'base64');
  const { data } = await sharp(buf)
    .resize(9, 8, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hash = 0n;
  let bit = 0n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = data[row * 9 + col];
      const right = data[row * 9 + col + 1];
      if (left > right) hash |= 1n << bit;
      bit++;
    }
  }
  return hash;
}

export function hammingDistance(a: bigint, b: bigint): number {
  let diff = a ^ b;
  let count = 0;
  while (diff) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}
