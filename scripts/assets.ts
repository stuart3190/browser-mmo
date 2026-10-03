/**
 * Asset pipeline helper.
 *
 *   pnpm assets:check                          validate names + metadata sidecars
 *   pnpm assets:promote <generated> <target>   copy a generated file into source folders
 *                                              (refuses to overwrite; --force to replace, which
 *                                              keeps a timestamped backup)
 *
 * Rules are documented in docs/art-pipeline/README.md.
 */
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { z } from 'zod';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const ASSETS = join(ROOT, 'assets');

export const AssetMetaSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:[._/][a-z0-9_]+)*$/),
  kind: z.enum(['model', 'texture', 'icon', 'audio', 'concept']),
  source: z.enum(['manual', 'blender', 'openart', 'meshy', 'tripo', 'image_generation', 'other']),
  author: z
    .string()
    .min(1)
    .refine((v) => v !== 'TODO', 'author must be filled in'),
  license: z
    .string()
    .min(1)
    .refine((v) => v !== 'TODO', 'license must be filled in'),
  createdAt: z.string(),
  /** For promoted generated assets: the original generated file and the prompt/seed if known. */
  generatedFrom: z
    .object({ file: z.string(), prompt: z.string().optional(), seed: z.string().optional() })
    .optional(),
  lods: z.array(z.string()).default([]),
  thumbnail: z.string().optional(),
  notes: z.string().optional(),
});

const NAME_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const ALLOWED: Record<string, string[]> = {
  models: ['.glb', '.gltf', '.bin', '.blend'],
  textures: ['.png', '.ktx2', '.jpg', '.webp'],
  icons: ['.png', '.webp', '.svg'],
  audio: ['.ogg', '.mp3', '.wav'],
  concepts: ['.png', '.jpg', '.webp', '.md'],
  generated: [],
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function check(): number {
  const problems: string[] = [];
  for (const file of walk(ASSETS)) {
    const rel = relative(ASSETS, file);
    const top = rel.split('/')[0]!;
    const name = basename(file);
    if (name === '.gitkeep' || name === 'README.md' || name.endsWith('.meta.json')) continue;
    if (top === 'generated') continue; // raw tool output: anything goes, never shipped
    const ext = extname(name).toLowerCase();
    if (!ALLOWED[top]?.includes(ext))
      problems.push(`${rel}: extension ${ext} not allowed in ${top}/`);
    if (!NAME_RE.test(basename(name, ext)))
      problems.push(`${rel}: name must be lowercase, [a-z0-9] separated by . _ -`);
    if (top !== 'concepts') {
      const meta = `${file}.meta.json`;
      if (!existsSync(meta)) problems.push(`${rel}: missing ${basename(meta)}`);
      else {
        const parsed = AssetMetaSchema.safeParse(JSON.parse(readFileSync(meta, 'utf8')));
        if (!parsed.success)
          problems.push(`${rel}: invalid metadata (${parsed.error.issues[0]?.message})`);
      }
    }
  }
  problems.forEach((p) => console.error(`✗ ${p}`));
  console.log(problems.length ? `${problems.length} asset problem(s)` : 'Assets OK');
  return problems.length ? 1 : 0;
}

function promote(src: string, target: string, force: boolean): number {
  const from = resolve(src);
  const to = resolve(ASSETS, target);
  if (!relative(join(ASSETS, 'generated'), from).match(/^[^.]/)) {
    console.error('Source must be inside assets/generated/');
    return 1;
  }
  if (relative(ASSETS, to).startsWith('generated') || relative(ASSETS, to).startsWith('..')) {
    console.error('Target must be a source folder inside assets/ (not generated/)');
    return 1;
  }
  if (existsSync(to)) {
    if (!force) {
      console.error(
        `Refusing to overwrite existing source asset ${relative(ROOT, to)} (use --force; a backup is kept)`,
      );
      return 1;
    }
    const backup = `${to}.${Date.now()}.bak`;
    copyFileSync(to, backup);
    console.log(`Backed up existing asset to ${relative(ROOT, backup)}`);
  }
  copyFileSync(from, to);
  const meta = `${to}.meta.json`;
  if (!existsSync(meta)) {
    writeFileSync(
      meta,
      JSON.stringify(
        {
          id: relative(ASSETS, to).replace(extname(to), '').replace(/\\/g, '/'),
          kind: 'model',
          source: 'other',
          author: 'TODO',
          license: 'TODO',
          createdAt: new Date().toISOString(),
          generatedFrom: { file: relative(ROOT, from) },
          lods: [],
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      `Wrote ${relative(ROOT, meta)} — fill in kind/source/author/license before committing.`,
    );
  }
  console.log(`Promoted ${relative(ROOT, from)} -> ${relative(ROOT, to)}`);
  return 0;
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'check') process.exit(check());
if (cmd === 'promote' && a && b) process.exit(promote(a, b, process.argv.includes('--force')));
console.error(
  'usage: assets.ts check | promote <assets/generated/...> <target-relative-to-assets> [--force]',
);
process.exit(2);
