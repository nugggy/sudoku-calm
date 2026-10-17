"""Builds www/levels/words.json from SCOWL (see www/levels/WORDLIST-LICENSE.txt).

common: everyday words (SCOWL sizes 10-35, English plus Australian spellings), used for answers and puzzles.
valid:  a larger list (up to size 50), used to accept guesses and bonus words.
Usage: python tools/build_words.py <path to scowl-2020.12.07/final>
"""
import json, os, re, sys

FINAL = sys.argv[1]
BLOCK = set("""damn hell shit crap piss bitch bastard slut whore dick cock fuck fag nazi rape sex sexy porn nude booze drunk kill gay""".split())

def read(levels):
    out = set()
    for lvl in levels:
        for kind in ('english', 'australian'):
            p = os.path.join(FINAL, f'{kind}-words.{lvl}')
            if not os.path.exists(p):
                continue
            for line in open(p, encoding='latin-1'):
                w = line.strip()
                if re.fullmatch(r'[a-z]{3,8}', w) and w not in BLOCK:
                    out.add(w)
    return out

common = read([10, 20, 35])
valid = read([10, 20, 35, 40, 50]) | common
by_len = lambda s: {n: ' '.join(sorted(w for w in s if len(w) == n)) for n in range(3, 9)}
# five-letter answers for the daily word game: common words that are not simple plurals
answers = sorted(w for w in common if len(w) == 5 and not (w.endswith('s') and (w[:-1] in common or w[:-2] in common)) and not w.endswith('ed'))
json.dump({'version': 1, 'common': by_len(common), 'valid': by_len(valid), 'answers': ' '.join(answers)},
          open('www/levels/words.json', 'w'), separators=(',', ':'))
print('common', len(common), 'valid', len(valid), 'answers', len(answers), 'bytes', os.path.getsize('www/levels/words.json'))
