# Планетарная система

## Структура файлов

```
src/
├── planet/
│   ├── Planet.ts              # Модель данных планеты
│   ├── PlanetGenerator.ts     # Генератор планет с реалистичными орбитами
│   └── VoxelPlanet.ts         # 3D-отображение планеты (сфера)
├── star/
│   └── NewCentralStar.ts      # Воксельная звезда + управление планетами
└── client/
    └── NewMain.ts             # Точка входа (замена main.ts для теста)
```

## Planet.ts — Модель данных

```typescript
class Planet {
  name: string;
  radius: number;
  orbitalDistance: number;
  startAngle: number;
  composition: PlanetComposition; // rocky | ice | desert | gas | lava | ocean
  temperature: number;            // 50K–3000K, зависит от орбиты
  radiation: number;              // 5–500, от орбиты
  dangerRadius: number;           // radius * 3 + 50
  gravity: number;                // radius * 0.1 + 5
}
```

## PlanetGenerator.ts — Параметры генерации

| Параметр | Дефолт | Описание |
|----------|--------|----------|
| count | 10 | Количество планет |
| minOrb | 3500 | Минимальная орбита (за поясом астероидов) |
| maxOrb | 12000 | Максимальная орбита |
| minRad | 80 | Минимальный радиус |
| maxRad | 400 | Максимальный радиус |

Орбиты распределены по степенному закону (exponent = 0.7): внутренние планеты плотнее друг к другу, внешние — разреженнее. Начальные углы равномерно разнесены. Каждой планете присваивается тип поверхности на основе дистанции от звезды.

## NewCentralStar.ts — Звезда и орбиты

- Воксельная звезда (ядро + корона + частицы) через `InstancedMesh`
- Планеты вращаются по кеплеровским орбитам: `speed ∝ dist^{-1.5}`
- Наклонение орбит: ±4.3° случайного отклонения от эклиптики
- Метод `checkDanger(position)` — проверяет близость к звезде и планетам
- Метод `getPlanetPositions()` — возвращает текущие позиции всех планет

## VoxelPlanet.ts — 3D планеты

- `THREE.SphereGeometry` с `MeshStandardMaterial`
- Цвет, отражение, emissive зависят от `composition`
- Lava-планеты светятся (emissiveIntensity: 0.5)
- Ocean — гладкие (roughness: 0.2), Rocky — шероховатые (roughness: 0.8)

## Взаимодействие (NewMain.ts)

- **Клавиша I**: информация о ближайшей планете (имя, тип, температура, гравитация)
- **Гравитация**: при входе в `dangerRadius` планета притягивает корабль
- **Столкновение**: при касании `radius * 1.5` — корабль уничтожается, респавн в (0, 500, 0)
- Планеты не излучают радиацию (только звезда)

## Производительность

| Объект | Draw calls | Описание |
|--------|-----------|----------|
| Ядро звезды | 1 | InstancedMesh, 100–150 instances |
| Корона | 1 | InstancedMesh, 80 instances |
| Частицы | 1 | Points, 1500 частиц |
| Планета | 1 | SphereGeometry × 12 планет |

Итого ~15 draw calls на всю звёздную систему.
