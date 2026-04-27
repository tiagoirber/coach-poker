import 'dotenv/config';

const key = process.env.CLAUDE_API_KEY;
console.log('Chave encontrada:', key ? key.slice(0, 20) + '...' : 'NÃO ENCONTRADA');

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 10,
    messages: [{ role: 'user', content: 'diga oi' }],
  }),
});

const data = await res.json();
console.log('Status:', res.status);
console.log('Resposta:', JSON.stringify(data, null, 2));
