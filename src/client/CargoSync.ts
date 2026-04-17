// src/client/CargoSync.ts
/**
 * Синхронизация cargo корабля с сервером
 * Вызывается при открытии окна торговли
 */

/** Отправить текущий cargo на сервер */
export async function syncCargoToServer(playerName: string, cargo: {
  metal: number; silicon: number; ice: number; rare: number; fuel: number; water: number;
}): Promise<boolean> {
  try {
    const resp = await fetch('/api/station/sync-cargo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Player-Name': playerName,
      },
      body: JSON.stringify({ cargo }),
    });
    const data = await resp.json();
    return data.success === true;
  } catch (e) {
    console.warn('⚠️ Не удалось синхронизировать cargo:', e);
    return false;
  }
}

/** Загрузить cargo с сервера */
export async function loadCargoFromServer(playerName: string) {
  try {
    const resp = await fetch(`/api/station/cargo?playerId=${playerName}`, {
      headers: { 'X-Player-Name': playerName },
    });
    const data = await resp.json();
    return data.cargo || { metal: 0, silicon: 0, ice: 0, rare: 0, fuel: 0, water: 0 };
  } catch (e) {
    console.warn('⚠️ Не удалось загрузить cargo:', e);
    return { metal: 0, silicon: 0, ice: 0, rare: 0, fuel: 0, water: 0 };
  }
}
