import fs from 'node:fs/promises';
import { config } from './config.js';

const defaultStore = {
  notes: [],
  insights: [],
  board: {
    zoom: 1,
    width: 2200,
    height: 1400,
    hotLimit: 12,
    declutterZoom: 0.78
  }
};

function normalizeStore(store = {}) {
  return {
    notes: Array.isArray(store.notes) ? store.notes : [],
    insights: Array.isArray(store.insights) ? store.insights : [],
    board: {
      ...defaultStore.board,
      ...(store.board && typeof store.board === 'object' ? store.board : {})
    }
  };
}

export async function ensureStore() {
  await fs.mkdir(config.dataDir, { recursive: true });
  try {
    await fs.access(config.dataFile);
  } catch {
    await fs.writeFile(config.dataFile, JSON.stringify(defaultStore, null, 2), 'utf8');
  }
}

export async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(config.dataFile, 'utf8');
  return normalizeStore(JSON.parse(raw));
}

export async function writeStore(store) {
  await fs.writeFile(config.dataFile, JSON.stringify(normalizeStore(store), null, 2), 'utf8');
}
