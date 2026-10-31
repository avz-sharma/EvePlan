import { build } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const phase = process.argv[2] || 'baseline';
const profiling = process.argv.includes('--profile');
const output = '../docs/measurements';
await mkdir(output, { recursive: true });
await build({
  resolve: profiling ? { alias: { 'react-dom/client': 'react-dom/profiling' } } : {},
  plugins: [visualizer({ filename: `${output}/${phase}${profiling ? '-profile' : ''}-bundle.html`, gzipSize: true }),
    ...(profiling ? [{ name: 'measurement-only-profiler', enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('/src/main.tsx')) return;
        return code.replace('<App />', '<React.Profiler id="planner" onRender={(...entry) => (window.__profileRecords ??= []).push(entry)}><App /></React.Profiler>');
      },
    }] : []),
  ],
  build: { outDir: profiling ? 'dist-profile' : 'dist' },
});
if (!profiling) {
  const files = await readdir('dist/assets');
  const sizes = await Promise.all(files.filter(file => file.endsWith('.js')).map(async file => {
    const data = await readFile(`dist/assets/${file}`);
    return { file, bytes: data.length, gzip_bytes: gzipSync(data).length };
  }));
  await writeFile(`${output}/${phase}-bundle.json`, JSON.stringify(sizes, null, 2));
}
