import { afterEach, expect, it, vi } from 'vitest';
import { executeCode } from './codeExecution';

class ControlledWorker {
  static instances: ControlledWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((error: { message: string }) => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { ControlledWorker.instances.push(this); }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); ControlledWorker.instances = []; });

for (const language of ['python', 'javascript'] as const) {
  it(`${language} terminates an infinite run after five seconds and starts a fresh worker`, async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', ControlledWorker);
    URL.createObjectURL = vi.fn(() => 'blob:worker');
    URL.revokeObjectURL = vi.fn();
    const first = executeCode(language === 'python' ? 'while True: pass' : 'while(true) {}', language);
    const worker = ControlledWorker.instances[0];
    expect(worker).toBeDefined();
    worker.onmessage?.({ data: { ready: true } });
    await vi.advanceTimersByTimeAsync(4999);
    expect(worker.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect((await first).error).toMatch(/timed out/);
    expect(worker.terminate).toHaveBeenCalledOnce();
    const second = executeCode('print(5)', language);
    const fresh = ControlledWorker.instances[1];
    expect(fresh).not.toBe(worker);
    fresh.onmessage?.({ data: { ready: true } });
    fresh.onmessage?.({ data: { success: true, output: '5' } });
    expect((await second).output).toBe('5');
    expect(fresh.terminate).toHaveBeenCalledOnce();
  });

  it(`${language} reports runtime or syntax errors and releases the worker`, async () => {
    vi.stubGlobal('Worker', ControlledWorker);
    URL.createObjectURL = vi.fn(() => 'blob:worker');
    URL.revokeObjectURL = vi.fn();
    const pending = executeCode('invalid code', language);
    const worker = ControlledWorker.instances[0];
    expect(worker).toBeDefined();
    worker.onmessage?.({ data: { ready: true } });
    worker.onmessage?.({ data: { success: false, error: 'SyntaxError: invalid syntax' } });
    expect(await pending).toMatchObject({ success: false, output: '', error: 'SyntaxError: invalid syntax' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
}

it('terminates an abandoned run when its module is left', async () => {
  vi.stubGlobal('Worker', ControlledWorker);
  URL.createObjectURL = vi.fn(() => 'blob:worker');
  URL.revokeObjectURL = vi.fn();
  const controller = new AbortController();
  const pending = executeCode('while True: pass', 'python', controller.signal);
  controller.abort();
  expect((await pending).error).toMatch(/cancelled/);
  expect(ControlledWorker.instances[0].terminate).toHaveBeenCalledOnce();
});
