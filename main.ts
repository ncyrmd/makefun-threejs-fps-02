// EMBERLINE — main.ts (Node 22, standard library only).
//
// This program hands the game in: it copies this repository's game/ and
// screenshots/ into the output directory and writes dossier.json there with
// the make.fun library in vendor/makefun-threejs.ts. It takes no arguments
// and makes no network requests. Outside the grader, MAKEFUN_OUTPUT_DIR
// stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The two runs the grader performs must write identical bytes: the copy is a
// plain recursive copy and buildDossier is deterministic over the same tree,
// so a second run overwrites the first with the same content.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Start from a clean output directory so a stale file from an earlier run can
// never survive into the dossier.
mkdirSync(out, { recursive: true });
rmSync(join(out, 'game'), { recursive: true, force: true });
rmSync(join(out, 'screenshots'), { recursive: true, force: true });
rmSync(join(out, 'dossier.json'), { force: true });

cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
} else {
  mkdirSync(join(out, 'screenshots'), { recursive: true });
}

// Caps from the competition's gate: the dossier text is capped at 160 KiB,
// at most 4 screenshots of 256 KiB each, game/ at most 993 files and 48 MiB.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);

console.log(`EMBERLINE handed in: game/ + screenshots/ copied to ${out}, dossier.json written.`);
