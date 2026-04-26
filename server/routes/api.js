import express from 'express';
import { readStore, writeStore } from '../store.js';
import { updateBoard } from '../services/boardService.js';
import {
  clearNotes,
  createNote,
  deleteNote,
  generateInsightForNote,
  updateNote
} from '../services/noteService.js';
import {
  createConnectionMap,
  createNextPrompt,
  createWallSummary,
  isLlmConfigured
} from '../services/insightService.js';

export const apiRouter = express.Router();

function sendApiError(res, error) {
  console.error(error);
  res.status(error.status || 500).json({
    error: error.publicMessage || '服务暂时不可用，请稍后再试。',
    code: error.code || 'SERVER_ERROR'
  });
}

apiRouter.get('/notes', async (_req, res) => {
  const store = await readStore();
  res.json({ notes: store.notes, insight: store.insights.at(-1) || null, board: store.board, llmReady: isLlmConfigured() });
});

apiRouter.post('/notes', async (req, res) => {
  try {
    if (!isLlmConfigured()) {
      return res.status(503).json({
        error: '需要先配置 LLM API Key，才能贴上便签并生成回响。',
        code: 'LLM_API_REQUIRED'
      });
    }

    const store = await readStore();
    const result = createNote(store, req.body);
    if (result.error) return res.status(400).json({ error: result.error });

    const insightResult = await generateInsightForNote(store, result.note);
    await writeStore(store);
    res.status(201).json({ note: result.note, ...insightResult });
  } catch (error) {
    sendApiError(res, error);
  }
});

apiRouter.patch('/notes/:id', async (req, res) => {
  const store = await readStore();
  const result = updateNote(store, req.params.id, req.body);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });

  await writeStore(store);
  res.json({ note: result.note });
});

apiRouter.delete('/notes/:id', async (req, res) => {
  const store = await readStore();
  const deleted = deleteNote(store, req.params.id);
  await writeStore(store);
  res.json({ ok: true, deleted });
});

apiRouter.delete('/notes', async (_req, res) => {
  const store = await readStore();
  const deleted = clearNotes(store);
  await writeStore(store);
  res.json({ ok: true, deleted });
});

apiRouter.post('/insight', async (_req, res) => {
  try {
    const store = await readStore();
    const newest = store.notes.at(-1);
    if (!newest) return res.status(400).json({ error: '先写下一张便签，再让 LLM 听见回响。' });

    const result = await generateInsightForNote(store, newest);
    await writeStore(store);
    res.json(result);
  } catch (error) {
    sendApiError(res, error);
  }
});

apiRouter.post('/llm/summary', async (_req, res) => {
  try {
    const store = await readStore();
    if (!store.notes.length) return res.status(400).json({ error: '先贴几张便签，再总结这面墙。' });
    res.json({ result: await createWallSummary(store.notes) });
  } catch (error) {
    sendApiError(res, error);
  }
});

apiRouter.post('/llm/connections', async (_req, res) => {
  try {
    const store = await readStore();
    if (store.notes.length < 2) return res.status(400).json({ error: '至少需要两张便签，才能找到它们之间的关联。' });
    res.json({ result: await createConnectionMap(store.notes) });
  } catch (error) {
    sendApiError(res, error);
  }
});

apiRouter.post('/llm/next-prompts', async (_req, res) => {
  try {
    const store = await readStore();
    if (!store.notes.length) return res.status(400).json({ error: '先写下一张便签，我再给你下一句。' });
    res.json({ result: await createNextPrompt(store.notes) });
  } catch (error) {
    sendApiError(res, error);
  }
});

apiRouter.get('/board', async (_req, res) => {
  const store = await readStore();
  res.json({ board: store.board });
});

apiRouter.patch('/board', async (req, res) => {
  const store = await readStore();
  const board = updateBoard(store, req.body);
  await writeStore(store);
  res.json({ board });
});
