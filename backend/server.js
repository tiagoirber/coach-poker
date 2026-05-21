import 'dotenv/config';
import { config } from 'dotenv'; config({ path: '.env.local', override: false });
import app from './app.js';

const PORT = process.env.SERVER_PORT || 3001;

app.listen(PORT, () => {
  console.log(`\n🃏 Poker Coach API rodando!`);
  console.log(`   → http://localhost:${PORT}\n`);
});
