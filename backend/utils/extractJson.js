/**
 * Extrai um objeto JSON de texto que pode conter markdown fences ou texto extra.
 * Tenta parse direto → markdown fence → primeiro/último { }.
 * Retorna null se tudo falhar.
 */
export function extractJson(text) {
  const attempts = [
    () => JSON.parse(text),
    () => {
      const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) return JSON.parse(m[1]);
      return null;
    },
    () => {
      const s = text.indexOf('{');
      const e = text.lastIndexOf('}');
      if (s !== -1 && e > s) return JSON.parse(text.slice(s, e + 1));
      return null;
    },
  ];
  for (const fn of attempts) {
    try {
      const result = fn();
      if (result) return result;
    } catch {}
  }
  return null;
}
