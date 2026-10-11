import { describe, expect, it } from 'vitest';
import type { LiveConditions } from '@shared';
import { crisisIntensity } from './intensity';

const live = (tideFt: number | null, rainPct: number | null): LiveConditions => ({
  fetchedAt: '2026-10-11T00:00:00Z',
  tide: tideFt === null ? null : {
    station: '8723214', name: 'Virginia Key', latest: null, highs: [],
    weekHigh: { at: '2026-10-12T10:00:00Z', ft: tideFt }, minorFloodFt: 2.6, moderateFloodFt: 3.2,
  },
  weather: { periods: [{ name: 'Tonight', tempF: 80, wind: '10 mph', forecast: 'Showers', rainPct }] },
  sources: [],
});

describe('crisisIntensity', () => {
  it('scales a flood with the week high tide against the NOAA thresholds', () => {
    expect(crisisIntensity('flood', live(1.9, null))).toBe(1);
    expect(crisisIntensity('flood', live(2.4, null))).toBe(2);
    expect(crisisIntensity('flood', live(3.3, null))).toBe(3);
  });

  it('scales a storm with the chance of rain', () => {
    expect(crisisIntensity('storm', live(null, 10))).toBe(1);
    expect(crisisIntensity('storm', live(null, 50))).toBe(2);
    expect(crisisIntensity('storm', live(null, 90))).toBe(3);
  });

  it('falls back to 2 when a reading is missing, and for the other kinds', () => {
    expect(crisisIntensity('flood', null)).toBe(2);
    expect(crisisIntensity('flood', live(null, null))).toBe(2);
    expect(crisisIntensity('storm', live(null, null))).toBe(2);
    expect(crisisIntensity('erosion', live(3.5, 95))).toBe(2);
    expect(crisisIntensity('budget', null)).toBe(2);
  });
});
