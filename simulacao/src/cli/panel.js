// Local test panel: npm run painel  →  http://localhost:4300
//   --sem-abrir   does not open the browser automatically
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { createPanelServer } from '../panel/server.js';

const port = Number(process.env.PAINEL_PORTA) || 4300;
const root = process.cwd();
const server = createPanelServer({ root, dataDir: config.dataDir, envFile: path.join(root, '.env'), port });

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE' ? `A porta ${port} já está em uso (o painel já está aberto?).` : `Falha no painel: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${port}`;
  console.log(`Painel do teste em ${url}  (Ctrl+C fecha o painel; a simulação continua).`);
  if (process.argv.includes('--sem-abrir')) return;
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
});

process.once('SIGINT', () => {
  server.close();
  console.log('\nPainel fechado. A simulação, se estiver rodando, continua.');
  process.exit(0);
});
