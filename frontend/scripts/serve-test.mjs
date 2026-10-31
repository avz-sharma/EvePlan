import { preview } from 'vite';
await preview({ preview: { host: '127.0.0.1', port: 4178, strictPort: true,
  proxy: { '/api': 'http://127.0.0.1:8018' } } });
