import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    // Variável de ambiente (Railway ou outro cloud)
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    // Tenta carregar arquivo local (dev); se falhar usa credenciais padrão (Cloud Functions)
    try {
      const path = resolve(__dirname, '../../', process.env.SA_PATH || './firebase-service-account.json');
      const serviceAccount = JSON.parse(readFileSync(path, 'utf8'));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } catch {
      // Ambiente Google Cloud (Firebase Functions) — credenciais automáticas
      admin.initializeApp();
    }
  }
}

export const db   = admin.firestore();
export const auth = admin.auth();
export default admin;
