import * as fs from 'node:fs';
import * as path from 'node:path';

const SAVE_FILE = '.mahjong-save.json';

/**
 * GameStateをJSONファイルに保存する。
 * GameStateはmutableなオブジェクトに変換してから保存（readonly配列を通常配列に）。
 */
export function saveGame(state: unknown): void {
  try {
    const data = JSON.stringify(state, (_key, value) => {
      // Mapから通常のオブジェクトに変換
      return value;
    });
    fs.writeFileSync(path.resolve(SAVE_FILE), data, 'utf-8');
  } catch {
    // セーブ失敗は無視（ゲームプレイに影響させない）
  }
}

/**
 * 保存されたゲーム状態を復元する。
 * 保存がない、または読み込みに失敗した場合はnullを返す。
 */
export function loadGame<T>(): T | null {
  try {
    const filePath = path.resolve(SAVE_FILE);
    if (!fs.existsSync(filePath)) return null;
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/** セーブファイルを削除する（ゲーム終了時など） */
export function clearSave(): void {
  try {
    const filePath = path.resolve(SAVE_FILE);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // 無視
  }
}
