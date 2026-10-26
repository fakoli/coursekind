/** Each run uses a fresh, terminable worker. Workers keep code off the UI thread;
 * they are not a network/filesystem security boundary. Python loads Pyodide from CDN.
 */
import type { SandboxLanguage } from '../types';

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  executionTime: number;
}

const outputCaptureSource = `
const output = [];
let outputLength = 0;
let truncated = false;
const capture = line => {
  if (truncated) return;
  line = String(line);
  const available = 32768 - outputLength;
  output.push(line.slice(0, Math.max(0, available)));
  outputLength += line.length + 1;
  if (outputLength >= 32768) { output.push('[Output truncated at 32 KiB]'); truncated = true; }
};`;

export const pythonWorkerSource = `
(async () => {
  try {
    importScripts('https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js');
    const python = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/' });
    self.onmessage = async ({ data: code }) => {
      ${outputCaptureSource}
      python.setStdout({ batched: capture });
      python.setStderr({ batched: capture });
      try {
        const result = await python.runPythonAsync(code);
        if (result !== undefined && result !== null) capture(String(result));
        result?.destroy?.();
        self.postMessage({ success: true, output: output.join('\\n') || '(No output)' });
      } catch (error) {
        self.postMessage({ success: false, output: output.join('\\n'), error: String(error) });
      }
    };
    self.postMessage({ ready: true });
  } catch (error) {
    self.postMessage({ success: false, error: String(error) });
  }
})();`;

export const javascriptWorkerSource = `
self.onmessage = ({ data: code }) => {
  ${outputCaptureSource}
  console.log = console.warn = console.error = (...args) => capture(args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' '));
  try {
    const result = new Function(code)();
    if (result !== undefined) capture(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
    self.postMessage({ success: true, output: output.join('\\n') || '(No output)' });
  } catch (error) {
    self.postMessage({ success: false, output: output.join('\\n'), error: String(error) });
  }
};
self.postMessage({ ready: true });`;

export async function executeCode(code: string, language: SandboxLanguage, signal?: AbortSignal): Promise<ExecutionResult> {
  if (!code.trim()) return { success: true, output: '(Empty code)', executionTime: 0 };
  if (signal?.aborted) return { success: false, output: '', error: 'Execution cancelled', executionTime: 0 };
  const start = performance.now();
  return new Promise(resolve => {
    let worker: Worker | undefined;
    let url: string | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let settled = false;
    const abort = () => finish({ success: false, output: '', error: 'Execution cancelled' });
    const finish = (result: Omit<ExecutionResult, 'executionTime'>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker?.terminate();
      if (url) URL.revokeObjectURL(url);
      resolve({ ...result, executionTime: performance.now() - start });
    };
    try {
      const source = language === 'python' ? pythonWorkerSource : javascriptWorkerSource;
      url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
      worker = new Worker(url);
      signal?.addEventListener('abort', abort, { once: true });
      // Startup (CDN/WASM) has its own bound; execution gets exactly five seconds.
      timer = setTimeout(() => finish({ success: false, output: '', error: 'Runtime could not load within 30 seconds. Check your connection and retry.' }), 30000);
      let started = false;
      worker.onmessage = ({ data }) => {
        if (data.ready) {
          if (started) return;
          started = true;
          clearTimeout(timer);
          timer = setTimeout(() => finish({ success: false, output: '', error: 'Execution timed out (5 second limit)' }), 5000);
          worker!.postMessage(code);
        } else finish({ success: !!data.success, output: data.output || '', error: data.error });
      };
      worker.onerror = error => finish({ success: false, output: '', error: error.message || 'Worker error' });
    } catch (error) {
      finish({ success: false, output: '', error: String(error) });
    }
  });
}
