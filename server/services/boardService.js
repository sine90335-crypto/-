export function normalizeZoom(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return 1;
  return Math.min(1.5, Math.max(0.6, Math.round(next * 100) / 100));
}

function normalizePositiveNumber(value, fallback) {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return fallback;
  return Math.round(next);
}

export function updateBoard(store, payload = {}) {
  store.board = {
    zoom: normalizeZoom(payload.zoom ?? store.board?.zoom ?? 1),
    width: normalizePositiveNumber(payload.width ?? store.board?.width, 2200),
    height: normalizePositiveNumber(payload.height ?? store.board?.height, 1400),
    hotLimit: Math.min(30, Math.max(6, normalizePositiveNumber(payload.hotLimit ?? store.board?.hotLimit, 12))),
    declutterZoom: normalizeZoom(payload.declutterZoom ?? store.board?.declutterZoom ?? 0.78)
  };
  return store.board;
}
