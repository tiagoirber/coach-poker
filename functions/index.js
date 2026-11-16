import { onRequest } from 'firebase-functions/v2/https';
import app from '../backend/app.js';

export const api = onRequest(
  // 120s dá folga para a fase 2 (exercícios) + 1 retry; o fetch aborta em 110s (claude.js)
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 120, secrets: ['CLAUDE_API_KEY'] },
  app
);
