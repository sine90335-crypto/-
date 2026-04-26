import { createLlmInsight } from './insightService.js';

const palette = ['sun', 'mint', 'sky', 'rose', 'violet', 'paper'];

function normalizeMood(value) {
  return String(value || '此刻').trim().slice(0, 12) || '此刻';
}

function validateContent(value, emptyMessage = '先写下一点什么，哪怕只是一句“我有点累”。') {
  const content = String(value || '').trim();
  if (!content) return { error: emptyMessage };
  if (content.length > 240) return { error: '这张便签装不下这么多心事，先留 240 个字以内。' };
  return { content };
}

function makeNote(content, mood = '此刻') {
  return {
    id: crypto.randomUUID(),
    content,
    mood: normalizeMood(mood),
    color: palette[Math.floor(Math.random() * palette.length)],
    x: Math.round(5 + Math.random() * 81),
    y: Math.round(8 + Math.random() * 74),
    rotate: Math.round(-5 + Math.random() * 10),
    pinned: false,
    createdAt: new Date().toISOString()
  };
}

export function createNote(store, payload) {
  const result = validateContent(payload?.content);
  if (result.error) return { error: result.error };

  const note = makeNote(result.content, payload?.mood);
  store.notes.push(note);
  return { note };
}

export function updateNote(store, id, payload = {}) {
  const note = store.notes.find((item) => item.id === id);
  if (!note) return { status: 404, error: '这张便签已经不在墙上了。' };

  if (Object.hasOwn(payload, 'content')) {
    const result = validateContent(payload.content, '便签可以很短，但不能完全空着。');
    if (result.error) return { status: 400, error: result.error };
    note.content = result.content;
  }

  if (Object.hasOwn(payload, 'mood')) {
    note.mood = normalizeMood(payload.mood);
  }

  if (Object.hasOwn(payload, 'pinned')) {
    note.pinned = Boolean(payload.pinned);
  }

  note.updatedAt = new Date().toISOString();
  return { note };
}

export function deleteNote(store, id) {
  const before = store.notes.length;
  store.notes = store.notes.filter((note) => note.id !== id);
  return before - store.notes.length;
}

export function clearNotes(store) {
  const deleted = store.notes.length;
  store.notes = [];
  store.insights = [];
  return deleted;
}

export function appendInsight(store, insight, noteId) {
  const savedInsight = { ...insight, noteId, createdAt: new Date().toISOString() };
  store.insights.push(savedInsight);
  store.insights = store.insights.slice(-20);
  return savedInsight;
}

export async function generateInsightForNote(store, note) {
  const insight = await createLlmInsight(store.notes, note);
  appendInsight(store, insight, note.id);
  return { insight };
}
