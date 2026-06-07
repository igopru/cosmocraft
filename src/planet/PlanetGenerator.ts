import { Planet, PlanetComposition } from "./Planet.js";

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function pickComposition(orbitalDistance: number, seed: number): PlanetComposition {
  const r = seededRandom(seed + 999)();
  if (orbitalDistance < 5500) {
    return r < 0.35 ? 'rocky' : r < 0.6 ? 'desert' : r < 0.8 ? 'ocean' : 'gas';
  } else if (orbitalDistance < 8000) {
    return r < 0.4 ? 'gas' : r < 0.65 ? 'ocean' : r < 0.8 ? 'desert' : 'ice';
  }
  return r < 0.3 ? 'ice' : r < 0.6 ? 'gas' : r < 0.8 ? 'rocky' : 'lava';
}

export class PlanetGenerator {
private static readonly NAMES = [
"Aurelia","Boreas","Ceres","Dione","Erebus","Fornax","Ganymede","Helios",
"Iapetus","Juno","Krypton","Luna","Mimas","Nereid","Oberon","Phoebe",
"Quasar","Rhea","Soter","Titan","Urania","Vesta","Wolfe","Xenon","Ymir","Zelda",
];

static generate(
count: number,
minOrb: number = 3500,
maxOrb: number = 12000,
minRad: number = 80,
maxRad: number = 400,
): Planet[] {
const planets: Planet[] = [];
const exponent = 0.7;

for (let i = 0; i < count; i++) {
const name = this.NAMES[i % this.NAMES.length] + "-" + (i + 1);
const radius = Math.floor(Math.random() * (maxRad - minRad + 1)) + minRad;

const t = (i + 1) / count;
const baseOrb = minOrb + (maxOrb - minOrb) * Math.pow(t, exponent);

const perturbation = 1 + (Math.random() - 0.5) * 0.08;
const orbitalDistance = Math.floor(baseOrb * perturbation);

const startAngle = (360 / count) * i + (Math.random() - 0.5) * 15;

const composition = pickComposition(orbitalDistance, i);

planets.push(new Planet(name, radius, orbitalDistance, composition, startAngle));
}

return planets;
}
}
