/** Two-sided 97.5% Student-t quantiles by degrees of freedom. */
const T975: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262,
  10: 2.228, 11: 2.201, 12: 2.179, 13: 2.16, 14: 2.145, 15: 2.131, 16: 2.12, 17: 2.11, 18: 2.101,
  19: 2.093, 20: 2.086, 21: 2.08, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.06, 26: 2.056, 27: 2.052,
  28: 2.048, 29: 2.045, 30: 2.042, 40: 2.021, 60: 2.0, 120: 1.98,
};

export function tQuantile975(df: number): number {
  if (T975[df]) return T975[df]!;
  const keys = Object.keys(T975).map(Number).sort((a, b) => a - b);
  const above = keys.find((k) => k >= df);
  return above ? T975[above]! : 1.96;
}

export interface MeanCI {
  n: number;
  mean: number;
  sd: number;
  lo: number;
  hi: number;
}

/** Mean with a 95% t-interval. */
export function meanCI(xs: number[]): MeanCI {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const half = n > 1 ? (tQuantile975(n - 1) * sd) / Math.sqrt(n) : 0;
  return { n, mean, sd, lo: mean - half, hi: mean + half };
}

/** Paired difference a[i] − b[i] with a 95% t-interval. */
export const pairedDiffCI = (a: number[], b: number[]): MeanCI => meanCI(a.map((x, i) => x - b[i]!));
