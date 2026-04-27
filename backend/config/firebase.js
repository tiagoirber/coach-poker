// =============================================================
// firebase.js — Inicializa o Firebase Admin SDK no servidor
//
// O Admin SDK tem privilégios de superusuário: pode ler/escrever
// qualquer documento no Firestore e verificar tokens JWT do Auth.
// Por isso, as credenciais ficam SOMENTE no servidor.
// =============================================================

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import 'dotenv/config';

// __dirname não existe em ES Modules — reconstruímos assim:
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Lê o arquivo JSON com as credenciais da conta de serviço do Firebase
// Baixe em: Firebase Console → ⚙️ Configurações → Contas de serviço → Gerar nova chave privada
const serviceAccountPath = resolve(
  __dirname,
  '../../',
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json'
);

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
} catch (err) {
  console.error('❌ Arquivo de credenciais Firebase não encontrado:', serviceAccountPath);
  console.error('   Baixe em: Firebase Console → Configurações → Contas de serviço');
  process.exit(1); // Para o servidor imediatamente — sem credenciais, nada funciona
}

// Evita inicializar o Firebase mais de uma vez (guard contra hot-reload)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Exporta as instâncias prontas para uso nas rotas
export const db   = admin.firestore(); // Banco de dados Firestore
export const auth = admin.auth();      // Serviço de autenticação
export default admin;
