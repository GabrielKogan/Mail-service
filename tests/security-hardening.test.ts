import { describe, expect, it } from 'vitest';
import { normalizeCorsOrigins } from '@/lib/cors';
import { sanitizeHtml } from '@/lib/sanitize-html';

describe('security hardening', () => {
  it('remueve scripts, handlers y javascript en href', () => {
    const dirty = `
      <div onclick="alert(1)">
        <script>alert('x')</script>
        <a href="javascript:alert(1)" title="ok">click</a>
        <img src="https://example.com/x.png" onerror="alert(1)" />
      </div>
    `;

    const safe = sanitizeHtml(dirty);

    expect(safe).not.toContain('<script');
    expect(safe).not.toContain('onclick');
    expect(safe).not.toContain('onerror');
    expect(safe).not.toContain('javascript:');
  });

  it('rechaza wildcards y filtra orígenes inválidos en CORS', () => {
    expect(normalizeCorsOrigins('*')).toEqual([]);
    expect(normalizeCorsOrigins('https://app.example.com, bad-origin, http://localhost:3000')).toEqual([
      'https://app.example.com',
      'http://localhost:3000',
    ]);
  });
});
