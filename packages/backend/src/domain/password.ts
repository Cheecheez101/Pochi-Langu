import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt, KEY_LENGTH);
  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, saltHex, hashHex] = encodedHash.split('$');
  if (
    algorithm !== 'scrypt' ||
    !cost ||
    !blockSize ||
    !parallelization ||
    !saltHex ||
    !hashHex ||
    !/^[0-9a-f]+$/i.test(saltHex) ||
    !/^[0-9a-f]+$/i.test(hashHex)
  ) {
    return false;
  }

  const expected = Buffer.from(hashHex, 'hex');
  const actual = await deriveKey(
    password,
    Buffer.from(saltHex, 'hex'),
    expected.length,
    Number(cost),
    Number(blockSize),
    Number(parallelization),
  );

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function deriveKey(
  password: string,
  salt: Buffer,
  length: number,
  cost = COST,
  blockSize = BLOCK_SIZE,
  parallelization = PARALLELIZATION,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      length,
      { N: cost, r: blockSize, p: parallelization },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}
