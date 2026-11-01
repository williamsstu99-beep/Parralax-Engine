export const fmtAmps = (a: number) => {
  const x = Math.abs(a);
  if (x < 1e-6) return "0 A";
  if (x < 1e-3) return `${(x * 1e6).toFixed(0)} µA`;
  if (x < 1) return `${(x * 1e3).toFixed(x < 0.01 ? 1 : 0)} mA`;
  return `${x.toFixed(2)} A`;
};
export const fmtVolts = (v: number) => `${Math.abs(v) < 0.005 ? "0.00" : Math.abs(v).toFixed(2)} V`;
export const fmtWatts = (w: number) => {
  const x = Math.abs(w);
  if (x < 1e-3) return `${(x * 1e6).toFixed(0)} µW`;
  if (x < 1) return `${(x * 1e3).toFixed(0)} mW`;
  return `${x.toFixed(2)} W`;
};
export const fmtOhms = (r: number) => (r >= 1e6 ? `${+(r / 1e6).toFixed(1)} MΩ` : r >= 1e3 ? `${+(r / 1e3).toFixed(1)} kΩ` : `${r} Ω`);
export const fmtFarads = (uf: number) => (uf >= 1000 ? `${+(uf / 1000).toFixed(1)} mF` : `${uf} µF`);
