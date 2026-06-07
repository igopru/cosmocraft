/**
* Класс планеты.
* Хранит базовые параметры: название, радиус, расстояние от звезды,
* температуру, радиацию, тип состава.
*/
export type PlanetComposition = 'rocky' | 'ice' | 'desert' | 'gas' | 'lava' | 'ocean';

export class Planet {
readonly name: string;
readonly radius: number;
readonly orbitalDistance: number;
readonly startAngle: number;
readonly composition: PlanetComposition;
readonly temperature: number;
readonly radiation: number;
readonly dangerRadius: number;
readonly gravity: number;

constructor(
name: string,
radius: number,
orbitalDistance: number,
composition: PlanetComposition,
startAngle: number = 0,
) {
this.name = name;
this.radius = radius;
this.orbitalDistance = orbitalDistance;
this.startAngle = startAngle;
this.composition = composition;

this.temperature = Math.max(50, Math.floor(5778 / Math.sqrt(orbitalDistance / 100 + 1)));
this.radiation = Math.max(5, Math.floor(500 / (orbitalDistance / 200 + 1)));
this.dangerRadius = radius * 3 + 50;
this.gravity = Math.floor(radius * 0.1 + 5);
}

toString(): string {
return `${this.name} comp=${this.composition} r=${this.radius} orb=${this.orbitalDistance} T=${this.temperature}K rad=${this.radiation}`;
}
}
