import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { config } from './config.js';
import { apiRouter } from './routes/api.js';

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use('/api', apiRouter);

app.use(express.static(path.join(config.rootDir, 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(config.rootDir, 'dist', 'index.html'));
});

app.listen(config.port, () => {
  console.log(`Sticky wall API listening on http://localhost:${config.port}`);
});
