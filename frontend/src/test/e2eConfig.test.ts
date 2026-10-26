// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { resolveConfig } from 'vite';
import viteConfig from '../../vite.config';

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true }));
});

it('isolates browser API routing from ambient variables and every Vite env file', async () => {
  const root = mkdtempSync(join(tmpdir(), 'study-buddy-vite-env-'));
  directories.push(root);
  for (const file of ['.env', '.env.local', '.env.e2e', '.env.e2e.local']) {
    writeFileSync(join(root, file), 'VITE_API_URL=https://outside.invalid/api/v1\nVITE_LEAK_PROBE=unsafe\n');
  }
  vi.stubEnv('VITE_API_URL', 'https://ambient.invalid/api/v1');
  vi.stubEnv('VITE_API_PROXY', 'https://ambient.invalid');
  const config = await resolveConfig({
    ...viteConfig({ command: 'serve', mode: 'e2e' }), root, configFile: false,
  }, 'serve', 'e2e');
  expect(config.envDir).toBe(false);
  expect(config.env.VITE_LEAK_PROBE).toBeUndefined();
  expect(config.env.VITE_API_URL).toBeUndefined();
  expect(config.define['import.meta.env.VITE_API_URL']).toBe('"/api/v1"');
  expect(config.server.proxy?.['/api']).toBe('http://127.0.0.1:8018');
});

it('preserves ordinary development environment and proxy configuration', () => {
  vi.stubEnv('VITE_API_PROXY', 'http://localhost:8010');
  const config = viteConfig({ command: 'serve', mode: 'development' });
  expect(config.envDir).toBeUndefined();
  expect(config.envPrefix).toBeUndefined();
  expect(config.define).toBeUndefined();
  expect(config.server.proxy['/api']).toBe('http://localhost:8010');
});
