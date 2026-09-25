import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { config } from '@/lib/config';

const PREFIX = 'v1';

function keyBytes(): Buffer {
  const raw = config().googleTokenKey;
  if (!raw || raw.length < 32) {
    throw new Error('Falta GOOGLE_TOKEN_KEY (32 caracteres o más)');
  }
  return Buffer.from(raw.slice(0, 32), 'utf8');
}

/** AES-256-GCM: `v1.<iv_hex>.<tag_hex>.<ciphertext_hex>`. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join('.');
}

export function decryptSecret(packed: string): string {
  const [version, ivHex, tagHex, dataHex] = packed.split('.');
  if (version !== PREFIX || !ivHex || !tagHex || !dataHex) {
    throw new Error('Token cifrado inválido');
  }
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString(
    'utf8'
  );
}
