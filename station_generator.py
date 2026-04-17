#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CosmoCraft Station Generator
Генерирует .blueprint.json файлы для воксельного редактора
Формат: grid coordinates (0..63), voxelSize=8 обрабатывается движком
"""

import json
import math
import argparse
from datetime import datetime, timezone
from typing import Literal, Optional
from dataclasses import dataclass, field, asdict
from enum import Enum


class VoxelType(str, Enum):
    """Доступные типы вокселей из вашего редактора"""
    HULL_LIGHT = "hull_light"
    HULL_MEDIUM = "hull_medium"
    HULL_HEAVY = "hull_heavy"
    HULL_REINFORCED = "hull_reinforced"
    SOLAR_PANEL = "solar_panel"
    BATTERY = "battery"
    SHIELD_GEN = "shield_gen"
    THRUSTER = "thruster"
    CARGO_BAY = "cargo_bay"
    TURRET_MOUNT = "turret_mount"
    DOCKING_PORT = "docking_port"
    WINDOW = "window"
    LIGHT = "light"
    PAINT = "paint"


@dataclass
class Voxel:
    """Один воксель в сетке"""
    x: int
    y: int
    z: int
    type: str
    
    def to_dict(self) -> dict:
        return {"x": self.x, "y": self.y, "z": self.z, "type": self.type}


@dataclass
class StationConfig:
    """Конфигурация станции"""
    # Базовые параметры
    name: str = "MyStation"
    grid_size: int = 64  # Размер сетки (не менять, если редактор фиксирован)
    
    # Геометрия
    station_type: Literal["torus", "spindle", "wheel_mast", "custom"] = "torus"
    
    # Параметры кольца (для torus/wheel_mast)
    ring_radius: int = 20  # Радиус внешнего кольца в вокселях
    ring_thickness: int = 2  # Толщина "трубы" кольца
    ring_segments: int = 32  # Количество сегментов для сглаживания
    
    # Параметры хаба/мачты
    hub_length: int = 40  # Длина центрального модуля по оси Z
    hub_radius: int = 3   # Радиус хаба
    mast_height: int = 30 # Высота мачты над кольцом (для wheel_mast)
    
    # Спицы
    spoke_count: int = 4  # Количество спиц (4, 6, 8)
    spoke_thickness: int = 1
    
    # Модули
    solar_panels_on_mast: bool = True
    solar_panel_pairs: int = 6  # Пар панелей на мачте
    docking_ports: int = 4  # Количество стыковочных портов на кольце
    turret_positions: int = 8  # Позиций для турелей по периметру
    
    # Размещение
    center_offset: tuple[int, int, int] = field(default_factory=lambda: (32, 32, 32))
    
    # Дополнительные воксели для кастомной сборки
    extra_voxels: list[Voxel] = field(default_factory=list)


class StationBuilder:
    """Сборщик станций по конфигурации"""
    
    def __init__(self, config: StationConfig):
        self.config = config
        self.voxels: list[Voxel] = []
        self.cx, self.cy, self.cz = config.center_offset
        
    def _add(self, x: int, y: int, z: int, vtype: VoxelType):
        """Добавить воксель с проверкой границ"""
        if 0 <= x < self.config.grid_size and 0 <= y < self.config.grid_size and 0 <= z < self.config.grid_size:
            self.voxels.append(Voxel(x, y, z, vtype.value))
    
    def _add_sphere(self, cx: int, cy: int, cz: int, radius: int, vtype: VoxelType, hollow: bool = False):
        """Добавить сферу/шар из вокселей"""
        for x in range(-radius, radius + 1):
            for y in range(-radius, radius + 1):
                for z in range(-radius, radius + 1):
                    dist = math.sqrt(x*x + y*y + z*z)
                    if hollow:
                        if radius - 1 <= dist <= radius:
                            self._add(cx + x, cy + y, cz + z, vtype)
                    else:
                        if dist <= radius:
                            self._add(cx + x, cy + y, cz + z, vtype)
    
    def _add_cylinder(self, cx: int, cy: int, z_start: int, z_end: int, radius: int, 
                      vtype: VoxelType, axis: str = 'z', hollow: bool = False):
        """Добавить цилиндр по оси"""
        for z in range(z_start, z_end + 1):
            for x in range(-radius, radius + 1):
                for y in range(-radius, radius + 1):
                    dist = math.sqrt(x*x + y*y) if axis == 'z' else \
                           math.sqrt(x*x + (z-z_start)*(z-z_start)) if axis == 'y' else \
                           math.sqrt(y*y + (z-z_start)*(z-z_start))
                    if hollow:
                        if radius - 1 <= dist <= radius:
                            if axis == 'z':
                                self._add(cx + x, cy + y, z, vtype)
                            elif axis == 'y':
                                self._add(cx + x, z, cy + y, vtype)
                            else:
                                self._add(z, cx + x, cy + y, vtype)
                    else:
                        if dist <= radius:
                            if axis == 'z':
                                self._add(cx + x, cy + y, z, vtype)
                            elif axis == 'y':
                                self._add(cx + x, z, cy + y, vtype)
                            else:
                                self._add(z, cx + x, cy + y, vtype)
    
    def _add_ring(self, cx: int, cy: int, cz: int, radius: int, thickness: int, 
                  segments: int, vtype: VoxelType, plane: str = 'xy'):
        """Добавить кольцо (тор без внутреннего заполнения)"""
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            if plane == 'xy':
                px = cx + int(radius * math.cos(angle))
                py = cy + int(radius * math.sin(angle))
                pz = cz
            elif plane == 'xz':
                px = cx + int(radius * math.cos(angle))
                py = cy
                pz = cz + int(radius * math.sin(angle))
            else:  # yz
                px = cx
                py = cy + int(radius * math.cos(angle))
                pz = cz + int(radius * math.sin(angle))
            
            # Добавляем "толщину" кольца как мини-сферу
            self._add_sphere(px, py, pz, thickness, vtype, hollow=False)
    
    def _add_spoke(self, x1: int, y1: int, z1: int, x2: int, y2: int, z2: int, 
                   thickness: int, vtype: VoxelType):
        """Добавить спицу (линию с толщиной) между двумя точками"""
        # Алгоритм Брезенхема для 3D
        dx, dy, dz = abs(x2-x1), abs(y2-y1), abs(z2-z1)
        steps = max(dx, dy, dz)
        if steps == 0:
            self._add_sphere(x1, y1, z1, thickness, vtype)
            return
        
        for i in range(steps + 1):
            t = i / steps
            x = int(x1 + (x2 - x1) * t)
            y = int(y1 + (y2 - y1) * t)
            z = int(z1 + (z2 - z1) * t)
            self._add_sphere(x, y, z, thickness, vtype)
    
    def build_torus(self):
        """Stanford Torus: кольцо + хаб + спицы"""
        cfg = self.config
        cx, cy, cz = self.cx, self.cy, self.cz
        
        # 1. Центральный хаб (длинный цилиндр)
        hub_start = cz - cfg.hub_length // 2
        hub_end = cz + cfg.hub_length // 2
        self._add_cylinder(cx, cy, hub_start, hub_end, cfg.hub_radius, VoxelType.HULL_HEAVY, hollow=True)
        
        # 2. Вращающееся кольцо в плоскости XY
        self._add_ring(cx, cy, cz, cfg.ring_radius, cfg.ring_thickness, 
                      cfg.ring_segments, VoxelType.HULL_MEDIUM)
        
        # 3. Спицы от хаба к кольцу
        for i in range(cfg.spoke_count):
            angle = 2 * math.pi * i / cfg.spoke_count
            ring_x = cx + int(cfg.ring_radius * math.cos(angle))
            ring_y = cy + int(cfg.ring_radius * math.sin(angle))
            self._add_spoke(cx, cy, cz, ring_x, ring_y, cz, cfg.spoke_thickness, VoxelType.HULL_MEDIUM)
        
        # 4. Солнечные панели на внешнем контуре кольца
        for i in range(0, cfg.ring_segments, max(1, cfg.ring_segments // cfg.solar_panel_pairs)):
            angle = 2 * math.pi * i / cfg.ring_segments
            px = cx + int((cfg.ring_radius + 2) * math.cos(angle))
            py = cy + int((cfg.ring_radius + 2) * math.sin(angle))
            self._add(px, py, cz, VoxelType.SOLAR_PANEL)
        
        # 5. Турели по периметру
        for i in range(cfg.turret_positions):
            angle = 2 * math.pi * i / cfg.turret_positions
            tx = cx + int((cfg.ring_radius - 3) * math.cos(angle))
            ty = cy + int((cfg.ring_radius - 3) * math.sin(angle))
            self._add(tx, ty, cz, VoxelType.TURRET_MOUNT)
        
        # 6. Стыковочные порты на хабе
        for i in range(cfg.docking_ports):
            port_z = hub_start + i * (hub_end - hub_start) // max(1, cfg.docking_ports - 1)
            self._add(cx + cfg.hub_radius + 1, cy, port_z, VoxelType.DOCKING_PORT)
        
        # 7. Щит-генератор в центре
        self._add(cx, cy, cz, VoxelType.SHIELD_GEN)
        
        # 8. Двигатели на концах хаба
        self._add(cx, cy, hub_start - 1, VoxelType.THRUSTER)
        self._add(cx, cy, hub_end + 1, VoxelType.THRUSTER)
    
    def build_spindle(self):
        """Веретенообразная станция: длинный хаб + внешнее кольцо на "экваторе"""
        cfg = self.config
        cx, cy, cz = self.cx, self.cy, self.cz
        
        # 1. Очень длинный центральный хаб (веретено)
        hub_start = cz - cfg.hub_length // 2
        hub_end = cz + cfg.hub_length // 2
        # Хаб толще в центре, тоньше к краям (форма веретена)
        for z in range(hub_start, hub_end + 1):
            progress = abs(z - cz) / (cfg.hub_length // 2)
            radius = max(1, int(cfg.hub_radius * (1 - progress * 0.5)))
            self._add_sphere(cx, cy, z, radius, VoxelType.HULL_HEAVY if radius > 1 else VoxelType.HULL_MEDIUM)
        
        # 2. Тонкое внешнее кольцо только на "экваторе"
        self._add_ring(cx, cy, cz, cfg.ring_radius, 1, cfg.ring_segments, VoxelType.SOLAR_PANEL)
        
        # 3. Короткие спицы только в плоскости кольца
        for i in range(cfg.spoke_count):
            angle = 2 * math.pi * i / cfg.spoke_count
            ring_x = cx + int(cfg.ring_radius * math.cos(angle))
            ring_y = cy + int(cfg.ring_radius * math.sin(angle))
            self._add_spoke(cx + int(cfg.hub_radius * math.cos(angle)), 
                           cy + int(cfg.hub_radius * math.sin(angle)), cz,
                           ring_x, ring_y, cz, 1, VoxelType.HULL_MEDIUM)
        
        # 4. Турели и порты как у торуса
        for i in range(cfg.turret_positions):
            angle = 2 * math.pi * i / cfg.turret_positions
            tx = cx + int((cfg.ring_radius - 2) * math.cos(angle))
            ty = cy + int((cfg.ring_radius - 2) * math.sin(angle))
            self._add(tx, ty, cz, VoxelType.TURRET_MOUNT)
        
        for i in range(cfg.docking_ports):
            port_z = hub_start + i * (hub_end - hub_start) // max(1, cfg.docking_ports - 1)
            self._add(cx + 2, cy, port_z, VoxelType.DOCKING_PORT)
        
        self._add(cx, cy, cz, VoxelType.SHIELD_GEN)
    
    def build_wheel_mast(self):
        """Колесо с симметричной мачтой, пронзающей центр станции"""
        cfg = self.config
        cx, cy, cz = self.cx, self.cy, self.cz

        # 1. Центральная ось/мачта (симметричная относительно cz)
        # mast_height теперь = расстояние от центра до конца мачты в каждую сторону
        mast_bottom = cz - cfg.mast_height
        mast_top = cz + cfg.mast_height
        self._add_cylinder(cx, cy, mast_bottom, mast_top, 1, VoxelType.HULL_REINFORCED)

        # 2. Центральный хаб (утолщение в середине мачты)
        hub_half = cfg.hub_length // 4
        self._add_cylinder(cx, cy, cz - hub_half, cz + hub_half, cfg.hub_radius, VoxelType.HULL_HEAVY, hollow=True)

        # 3. Вращающееся колесо строго по центру Z
        self._add_ring(cx, cy, cz, cfg.ring_radius, cfg.ring_thickness,
                      cfg.ring_segments, VoxelType.HULL_MEDIUM)

        # 4. Спицы от центра к ободу (ровно 4/6/8 лучей)
        for i in range(cfg.spoke_count):
            angle = 2 * math.pi * i / cfg.spoke_count
            rx = cx + int(cfg.ring_radius * math.cos(angle))
            ry = cy + int(cfg.ring_radius * math.sin(angle))
            self._add_spoke(cx, cy, cz, rx, ry, cz, cfg.spoke_thickness, VoxelType.HULL_MEDIUM)

        # 5. Солнечные панели на мачте (симметрично вверх и вниз)
        if cfg.solar_panels_on_mast:
            total_range = mast_top - mast_bottom
            steps = max(2, cfg.solar_panel_pairs)
            for i in range(steps):
                # Равномерное распределение по всей длине мачты
                offset = -total_range // 2 + 3 + i * (total_range - 6) // max(1, steps - 1)
                pz = cz + offset
                # Панели по X
                self._add(cx + 2, cy, pz, VoxelType.SOLAR_PANEL)
                self._add(cx - 2, cy, pz, VoxelType.SOLAR_PANEL)
                # Панели по Y (через одну)
                if i % 2 == 0:
                    self._add(cx, cy + 2, pz, VoxelType.SOLAR_PANEL)
                    self._add(cx, cy - 2, pz, VoxelType.SOLAR_PANEL)

        # 6. "Зонтики" из панелей на концах мачты
        for end_z in [mast_bottom - 2, mast_top + 2]:
            for i in range(8):
                angle = 2 * math.pi * i / 8
                self._add(cx + int(4 * math.cos(angle)), cy + int(4 * math.sin(angle)), end_z, VoxelType.SOLAR_PANEL)

        # 7. Посадочные доки по периметру
        for i in range(cfg.docking_ports):
            angle = 2 * math.pi * i / cfg.docking_ports + math.pi/8
            dx = cx + int((cfg.ring_radius - 6) * math.cos(angle))
            dy = cy + int((cfg.ring_radius - 6) * math.sin(angle))
            for dz in range(3):
                self._add(dx, dy, cz - dz - 1, VoxelType.HULL_HEAVY)
            self._add(dx, dy, cz - 4, VoxelType.DOCKING_PORT)

        # 8. Турели на ободе колеса
        for i in range(cfg.turret_positions):
            angle = 2 * math.pi * i / cfg.turret_positions
            self._add(cx + int(cfg.ring_radius * math.cos(angle)),
                      cy + int(cfg.ring_radius * math.sin(angle)), cz, VoxelType.TURRET_MOUNT)

        # 9. Ядро станции
        self._add(cx, cy, cz, VoxelType.SHIELD_GEN)
    
    def build_custom(self):
        """Кастомная сборка: базовый хаб + опции"""
        cfg = self.config
        cx, cy, cz = self.cx, self.cy, self.cz
        
        # Базовый хаб
        self._add_cylinder(cx, cy, cz - cfg.hub_length//2, cz + cfg.hub_length//2, 
                          cfg.hub_radius, VoxelType.HULL_HEAVY)
        
        # Опциональное кольцо
        if cfg.ring_radius > 0:
            self._add_ring(cx, cy, cz, cfg.ring_radius, cfg.ring_thickness, 
                          cfg.ring_segments, VoxelType.HULL_MEDIUM)
            # Спицы
            for i in range(cfg.spoke_count):
                angle = 2 * math.pi * i / cfg.spoke_count
                rx = cx + int(cfg.ring_radius * math.cos(angle))
                ry = cy + int(cfg.ring_radius * math.sin(angle))
                self._add_spoke(cx, cy, cz, rx, ry, cz, cfg.spoke_thickness, VoxelType.HULL_MEDIUM)
        
        # Добавляем пользовательские воксели
        for v in cfg.extra_voxels:
            self._add(v.x + cx - 32, v.y + cy - 32, v.z + cz - 32, VoxelType(v.type))
    
    def build(self) -> list[Voxel]:
        """Собрать станцию по типу"""
        self.voxels = []
        
        if self.config.station_type == "torus":
            self.build_torus()
        elif self.config.station_type == "spindle":
            self.build_spindle()
        elif self.config.station_type == "wheel_mast":
            self.build_wheel_mast()
        else:
            self.build_custom()
        
        return self.voxels
    
    def export(self, filename: Optional[str] = None) -> str:
        """Экспорт в формат .blueprint.json"""
        voxels = self.build()
        
        blueprint = {
            "name": self.config.name,
            "version": "1.0",
            "createdAt": datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
            "gridSize": self.config.grid_size,
            "voxelCount": len(voxels),
            "voxels": [v.to_dict() for v in voxels]
        }
        
        if filename:
            if not filename.endswith('.blueprint.json'):
                filename += '.blueprint.json'
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(blueprint, f, indent=2, ensure_ascii=False)
            print(f"✅ Станция сохранена: {filename} ({len(voxels)} вокселей)")
            return filename
        
        return json.dumps(blueprint, indent=2, ensure_ascii=False)


def create_preset(name: str, **overrides) -> StationConfig:
    """Создать конфигурацию из пресета"""
    presets = {
        "stanford_torus": StationConfig(
            name="StanfordTorus_Mk1",
            station_type="torus",
            ring_radius=22,
            ring_thickness=2,
            hub_length=35,
            spoke_count=6,
            docking_ports=6,
            turret_positions=12
        ),
        "giant_spindle": StationConfig(
            name="Spindle_Giant",
            station_type="spindle",
            ring_radius=28,
            hub_length=52,
            hub_radius=4,
            spoke_count=8,
            turret_positions=16
        ),
        "wheel_mast_solar": StationConfig(
            name="WheelMast_SolarFarm",
            station_type="wheel_mast",
            ring_radius=20,
            ring_thickness=2,
            hub_length=24,
            mast_height=35,
            solar_panel_pairs=10,
            docking_ports=4
        ),
        "outpost_small": StationConfig(
            name="Outpost_Alpha",
            station_type="torus",
            ring_radius=12,
            ring_thickness=1,
            hub_length=20,
            spoke_count=4,
            grid_size=64
        )
    }
    
    if name in presets:
        config = presets[name]
        for key, value in overrides.items():
            if hasattr(config, key):
                setattr(config, key, value)
        return config
    raise ValueError(f"Unknown preset: {name}. Available: {list(presets.keys())}")


def main():
    parser = argparse.ArgumentParser(description="🛰️  Генератор воксельных станций для CosmoCraft")
    parser.add_argument("-t", "--type", choices=["torus", "spindle", "wheel_mast", "custom"], 
                       default="torus", help="Тип станции")
    parser.add_argument("-n", "--name", default="GeneratedStation", help="Название станции")
    parser.add_argument("-r", "--radius", type=int, default=20, help="Радиус кольца")
    parser.add_argument("-l", "--length", type=int, default=40, help="Длина хаба")
    parser.add_argument("-s", "--spokes", type=int, default=4, help="Количество спиц")
    parser.add_argument("-p", "--preset", choices=["stanford_torus", "giant_spindle", 
                                                   "wheel_mast_solar", "outpost_small"],
                       help="Использовать пресет (переопределяет другие параметры)")
    parser.add_argument("-o", "--output", help="Имя выходного файла")
    parser.add_argument("--mast", type=int, default=30, help="Высота мачты (для wheel_mast)")
    parser.add_argument("--panels", type=int, default=6, help="Пар солнечных панелей")
    
    args = parser.parse_args()
    
    # Создаём конфигурацию
    if args.preset:
        config = create_preset(args.preset, name=args.name)
    else:
        config = StationConfig(
            name=args.name,
            station_type=args.type,
            ring_radius=args.radius,
            hub_length=args.length,
            spoke_count=args.spokes,
            mast_height=args.mast,
            solar_panel_pairs=args.panels
        )
    
    # Генерируем и сохраняем
    builder = StationBuilder(config)
    output = args.output or f"{config.name}.blueprint.json"
    builder.export(output)
    
    # Статистика
    print(f"📊 Параметры: радиус={config.ring_radius}, хаб={config.hub_length}, спицы={config.spoke_count}")


if __name__ == "__main__":
    main()
