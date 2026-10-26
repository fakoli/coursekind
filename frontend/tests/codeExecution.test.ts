/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';
import { executeCode, pythonWorkerSource } from '../src/services/codeExecution';

// Exercise production worker bootstrap/output transport using real CPython as
// the runtime adapter. Real Pyodide/WASM timeout/errors are also browser-tested.
class PythonWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror = null;
  terminate = vi.fn();
  private runtime: { onmessage?: (event: { data: string }) => Promise<void> } = {};
  constructor() {
    let stdout: (line: string) => void = () => {};
    let stderr: (line: string) => void = () => {};
    this.runtime = { postMessage: (data: unknown) => queueMicrotask(() => this.onmessage?.({ data })) } as typeof this.runtime;
    runInNewContext(pythonWorkerSource, {
      self: this.runtime,
      importScripts: () => {},
      loadPyodide: async () => ({
        setStdout: ({ batched }: { batched: typeof stdout }) => { stdout = batched; },
        setStderr: ({ batched }: { batched: typeof stderr }) => { stderr = batched; },
        runPythonAsync: async (code: string) => {
          const value = JSON.parse(execFileSync('python3', ['-c', `
import ast, contextlib, io, json, sys
code = sys.stdin.read()
out, err = io.StringIO(), io.StringIO()
result, error = None, None
try:
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        tree = ast.parse(code)
        scope = {}
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            last = tree.body.pop()
            exec(compile(tree, '<runtime>', 'exec'), scope)
            result = eval(compile(ast.Expression(last.value), '<runtime>', 'eval'), scope)
        else:
            exec(compile(tree, '<runtime>', 'exec'), scope)
except Exception as exc:
    error = type(exc).__name__ + ': ' + str(exc)
print(json.dumps({'stdout': out.getvalue(), 'stderr': err.getvalue(), 'result': result, 'error': error}))
`], { input: code, encoding: 'utf8' }));
          value.stdout.split('\n').filter(Boolean).forEach(stdout);
          value.stderr.split('\n').filter(Boolean).forEach(stderr);
          if (value.error) throw new Error(value.error);
          return value.result;
        },
      }),
    });
  }
  postMessage(code: string) { void this.runtime.onmessage?.({ data: code }); }
}

afterEach(() => { vi.unstubAllGlobals(); });
it('captures fresh Python stdout/stderr, keeps namespaces independent and reports errors', async () => {
  vi.stubGlobal('Worker', PythonWorker);
  URL.createObjectURL = vi.fn(() => 'blob:python-worker');
  URL.revokeObjectURL = vi.fn();
  expect(await executeCode('previous = 2\nprint(previous + 3)', 'python')).toMatchObject({ success: true, output: '5' });
  expect(await executeCode('import sys\nprint("second")\nsys.stderr.write("warning")\nNone', 'python')).toMatchObject({ success: true, output: 'second\nwarning' });
  expect(await executeCode('print("fresh")', 'python')).toMatchObject({ success: true, output: 'fresh' });
  expect(await executeCode('print(previous)', 'python')).toMatchObject({ success: false, error: expect.stringContaining('NameError') });
  expect(await executeCode('if bad syntax', 'python')).toMatchObject({ success: false, error: expect.stringContaining('SyntaxError') });
  expect(await executeCode('1 / 0', 'python')).toMatchObject({ success: false, error: expect.stringContaining('ZeroDivisionError') });
});

it('runs real JavaScript in fresh namespaces, captures errors and bounds output', async () => {
  const { runInNewContext } = await import('node:vm');
  const { javascriptWorkerSource } = await import('../src/services/codeExecution');
  const run = (code: string) => {
    const messages: unknown[] = [];
    const self: { postMessage: (data: unknown) => void; onmessage?: (event: { data: string }) => void } = { postMessage: data => messages.push(data) };
    runInNewContext(javascriptWorkerSource, { self, console: {} });
    self.onmessage!({ data: code });
    return messages.at(-1);
  };
  expect(run('self.previous = 5; console.log(5)')).toMatchObject({ success: true, output: '5' });
  expect(run('console.log(self.previous)')).toMatchObject({ success: true, output: 'undefined' });
  expect(run('console.log(7)')).toMatchObject({ output: '7' });
  expect(run('const = bad')).toMatchObject({ success: false, error: expect.stringContaining('SyntaxError') });
  expect(run('throw new Error("boom")')).toMatchObject({ success: false, error: 'Error: boom' });
  const large = run('for(let i=0;i<100000;i++) console.log("x".repeat(100));') as { output: string };
  expect(large.output.length).toBeLessThan(33000);
  expect(large.output).toContain('Output truncated');
});
