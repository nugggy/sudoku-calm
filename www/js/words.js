// Shared word lists (from SCOWL; see levels/WORDLIST-LICENSE.txt), loaded once.
let data = null;
export async function loadWords() {
  if (data) return data;
  const raw = await (await fetch('levels/words.json')).json();
  const sets = (obj) => { const all = new Set(); for (const k of Object.keys(obj)) for (const w of obj[k].split(' ')) if (w) all.add(w); return all; };
  data = { common: sets(raw.common), valid: sets(raw.valid), answers: raw.answers.split(' '), commonByLen: raw.common };
  for (const w of data.common) data.valid.add(w);
  return data;
}
