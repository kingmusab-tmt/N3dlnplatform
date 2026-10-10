import { describe, expect, it } from 'vitest';
import { PHOTO_MAX_BYTES, RunError, decodePhoto, parseRunInput } from '@/lib/server/runs';

const err = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e as RunError;
  }
  throw new Error('expected an error');
};

describe('parseRunInput', () => {
  it('normalises codes and generates 4-digit delivery codes on request', () => {
    const run = parseRunInput({ stops: [{ code: 'fc-02-sim-bp-87', require_code: true }, { code: 'FC02SIMAV70', pod_code: '0042' }] });
    expect(run.profile).toBe('driving');
    expect(run.stops[0].code).toBe('FC02SIMBP87');
    expect(run.stops[0].podCode).toMatch(/^\d{4}$/);
    expect(run.stops[1].podCode).toBe('0042');
  });

  it('rejects bad runs with clear error codes', () => {
    expect(err(() => parseRunInput({})).code).toBe('INVALID_RUN');
    expect(err(() => parseRunInput({ stops: [] })).code).toBe('INVALID_RUN');
    expect(err(() => parseRunInput({ stops: Array(26).fill({ code: 'FC02SIMBP87' }) })).code).toBe('INVALID_RUN');
    expect(err(() => parseRunInput({ stops: [{ code: 'nope' }] })).code).toBe('INVALID_POSTCODE');
    expect(err(() => parseRunInput({ stops: [{ code: 'FC02SIMBP87', pod_code: '12' }] })).code).toBe('INVALID_RUN');
    expect(err(() => parseRunInput({ profile: 'flying', stops: [{ code: 'FC02SIMBP87' }] })).code).toBe('INVALID_PROFILE');
  });

  it('needs the rider position to optimise, and caps optimised stops at 11', () => {
    expect(err(() => parseRunInput({ optimize: true, stops: [{ code: 'FC02SIMBP87' }] })).code).toBe('INVALID_ORIGIN');
    const twelve = Array.from({ length: 12 }, () => ({ code: 'FC02SIMBP87' }));
    expect(err(() => parseRunInput({ optimize: true, from: [7.47, 9.07], stops: twelve })).code).toBe('TOO_MANY_STOPS');
    expect(parseRunInput({ optimize: true, from: [7.47, 9.07], stops: twelve.slice(0, 11) }).from).toEqual([7.47, 9.07]);
  });
});

describe('decodePhoto', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  it('accepts JPEG/PNG/WebP data URLs', () => {
    const photo = decodePhoto(png);
    expect(photo.contentType).toBe('image/png');
    expect(photo.data.length).toBeGreaterThan(50);
  });

  it('rejects other types and oversized photos', () => {
    expect(err(() => decodePhoto('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).code).toBe('INVALID_PHOTO');
    expect(err(() => decodePhoto('not a data url')).code).toBe('INVALID_PHOTO');
    const big = `data:image/jpeg;base64,${Buffer.alloc(PHOTO_MAX_BYTES + 1).toString('base64')}`;
    expect(err(() => decodePhoto(big)).code).toBe('PHOTO_TOO_LARGE');
  });
});
