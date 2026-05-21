import { onRequest } from 'firebase-functions/v2/https';
import app from '../backend/app.js';

export const api = onRequest(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, secrets: ['CLAUDE_API_KEY'] },
  app
);
