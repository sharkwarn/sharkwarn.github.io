const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRADIENTS_2D = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];

function buildPermutation(seed = 1) {
  const source = new Uint8Array(256);
  for (let i = 0; i < 256; i++) source[i] = i;
  let state = seed >>> 0;
  const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
  for (let i = 255; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [source[i], source[j]] = [source[j], source[i]]; }
  const permutation = new Uint8Array(512);
  for (let i = 0; i < 512; i++) permutation[i] = source[i & 255];
  return permutation;
}

export class SimplexNoise {
  constructor(seed = 1) { this.permutation = buildPermutation(seed); }

  noise2D(x, y) {
    const skew = (x + y) * F2;
    const i = Math.floor(x + skew);
    const j = Math.floor(y + skew);
    const unskew = (i + j) * G2;
    const x0 = x - (i - unskew);
    const y0 = y - (j - unskew);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    const gi0 = this.permutation[ii + this.permutation[jj]] % 12;
    const gi1 = this.permutation[ii + i1 + this.permutation[jj + j1]] % 12;
    const gi2 = this.permutation[ii + 1 + this.permutation[jj + 1]] % 12;
    return 70 * (this._corner(gi0, x0, y0) + this._corner(gi1, x1, y1) + this._corner(gi2, x2, y2));
  }

  _corner(gi, x, y) { let t = 0.5 - x * x - y * y; if (t < 0) return 0; t *= t; return t * t * (GRADIENTS_2D[gi][0] * x + GRADIENTS_2D[gi][1] * y); }
}
