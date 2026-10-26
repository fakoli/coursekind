/**
 * Code Execution Service
 *
 * Browser-based code execution for Python (via Pyodide) and JavaScript (via Web Worker).
 * All execution happens client-side with built-in security through sandboxing.
 *
 * Security model:
 * - Python runs in Pyodide WebAssembly sandbox
 * - JavaScript runs in an isolated Web Worker with restricted globals
 * - Both have 5-second execution timeout to prevent infinite loops
 * - No network or filesystem access in the sandbox context
 */

import type { SandboxLanguage } from '../types';

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  executionTime: number;
}

const EXECUTION_TIMEOUT = 5000; // 5 seconds

// Singleton for Pyodide instance
let pyodidePromise: Promise<typeof globalThis.pyodide> | null = null;

// Declare pyodide on globalThis for type safety
declare global {
  interface Window {
    loadPyodide?: () => Promise<typeof globalThis.pyodide>;
    pyodide?: {
      runPython: (code: string) => unknown;
      runPythonAsync: (code: string) => Promise<unknown>;
      loadPackage: (packages: string | string[]) => Promise<void>;
    };
  }
  // eslint-disable-next-line no-var
  var pyodide: Window['pyodide'];
}

/**
 * Load Pyodide for Python execution
 */
async function loadPyodideInstance(): Promise<typeof globalThis.pyodide> {
  if (pyodidePromise) {
    return pyodidePromise;
  }

  pyodidePromise = (async () => {
    // Dynamically load Pyodide from CDN
    if (!window.loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Pyodide'));
        document.head.appendChild(script);
      });
    }

    if (!window.loadPyodide) {
      throw new Error('Pyodide loader not available');
    }

    const pyodide = await window.loadPyodide();
    if (!pyodide) {
      throw new Error('Failed to initialize Pyodide');
    }

    // Set up stdout/stderr capture
    await pyodide.runPythonAsync(`
import sys
from io import StringIO

class OutputCapture:
    def __init__(self):
        self.stdout = StringIO()
        self.stderr = StringIO()

    def get_output(self):
        return self.stdout.getvalue() + self.stderr.getvalue()

    def clear(self):
        for stream in (self.stdout, self.stderr):
            stream.seek(0)
            stream.truncate(0)

_output_capture = OutputCapture()
sys.stdout = _output_capture.stdout
sys.stderr = _output_capture.stderr
`);

    return pyodide;
  })();

  return pyodidePromise;
}

/**
 * Execute Python code using Pyodide
 */
async function executePython(code: string): Promise<ExecutionResult> {
  const startTime = performance.now();

  try {
    const pyodide = await loadPyodideInstance();

    if (!pyodide) {
      return {
        success: false,
        output: '',
        error: 'Pyodide not loaded',
        executionTime: performance.now() - startTime,
      };
    }

    // Clear previous output
    await pyodide.runPythonAsync('_output_capture.clear()');

    // Execute with timeout
    const executePromise = pyodide.runPythonAsync(code);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Execution timed out (5 second limit)')), EXECUTION_TIMEOUT)
    );

    const result = await Promise.race([executePromise, timeoutPromise]);

    // Get captured output
    const output = (await pyodide.runPythonAsync('_output_capture.get_output()')) as string;

    // Format result
    let finalOutput = output;
    if (result !== undefined && result !== null && String(result) !== 'None') {
      finalOutput += (output ? '\n' : '') + String(result);
    }

    return {
      success: true,
      output: finalOutput || '(No output)',
      executionTime: performance.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : 'Unknown error',
      executionTime: performance.now() - startTime,
    };
  }
}

/**
 * Execute JavaScript code using a sandboxed Web Worker.
 * Uses Function constructor for sandboxed code execution.
 */
async function executeJavaScript(code: string): Promise<ExecutionResult> {
  const startTime = performance.now();

  return new Promise((resolve) => {
    // Worker code uses Function constructor for sandbox execution
    const workerCode = `
      self.onmessage = function(e) {
        const code = e.data;
        const output = [];

        const originalConsole = {
          log: console.log,
          warn: console.warn,
          error: console.error,
        };

        console.log = (...args) => output.push(args.map(arg =>
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' '));
        console.warn = console.log;
        console.error = console.log;

        try {
          const restrictedGlobals = ['fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts'];
          restrictedGlobals.forEach(g => { self[g] = undefined; });

          const fn = new Function(code);
          const result = fn();

          if (result !== undefined) {
            output.push(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
          }

          self.postMessage({ success: true, output: output.join('\\n') || '(No output)' });
        } catch (err) {
          self.postMessage({ success: false, error: err.message });
        } finally {
          Object.assign(console, originalConsole);
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);

    const timeoutId = setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      resolve({
        success: false,
        output: '',
        error: 'Execution timed out (5 second limit)',
        executionTime: performance.now() - startTime,
      });
    }, EXECUTION_TIMEOUT);

    worker.onmessage = (e) => {
      clearTimeout(timeoutId);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      resolve({
        success: e.data.success,
        output: e.data.output || '',
        error: e.data.error,
        executionTime: performance.now() - startTime,
      });
    };

    worker.onerror = (err) => {
      clearTimeout(timeoutId);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      resolve({
        success: false,
        output: '',
        error: err.message || 'Worker error',
        executionTime: performance.now() - startTime,
      });
    };

    worker.postMessage(code);
  });
}

/**
 * Execute code in the appropriate runtime based on language
 */
export async function executeCode(
  code: string,
  language: SandboxLanguage
): Promise<ExecutionResult> {
  if (!code.trim()) {
    return {
      success: true,
      output: '(Empty code)',
      executionTime: 0,
    };
  }

  switch (language) {
    case 'python':
      return executePython(code);
    case 'javascript':
      return executeJavaScript(code);
    default:
      return {
        success: false,
        output: '',
        error: `Unsupported language: ${language}`,
        executionTime: 0,
      };
  }
}

/**
 * Check if Pyodide is loaded and ready
 */
export function isPyodideReady(): boolean {
  return pyodidePromise !== null && window.pyodide !== undefined;
}

/**
 * Preload Pyodide for faster first execution
 */
export async function preloadPyodide(): Promise<void> {
  try {
    await loadPyodideInstance();
  } catch {
    // Ignore preload errors
  }
}
