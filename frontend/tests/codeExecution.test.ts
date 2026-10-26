/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';

// Run the actual Python bootstrap and user code in CPython. Only Pyodide's
// browser loader is substituted; stream capture is the production code.
function installPythonRuntime() {
  const history: string[] = [];
  window.loadPyodide = async () => ({
    runPython: () => undefined,
    loadPackage: async () => undefined,
    runPythonAsync: async (code: string) => {
      history.push(code);
      const result = execFileSync('python3', ['-c', `
import ast, json, sys
scope = {}
result = None
try:
    for source in json.load(sys.stdin):
        tree = ast.parse(source)
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            last = tree.body.pop()
            exec(compile(tree, '<runtime>', 'exec'), scope)
            result = eval(compile(ast.Expression(last.value), '<runtime>', 'eval'), scope)
        else:
            exec(compile(tree, '<runtime>', 'exec'), scope)
            result = None
    sys.__stdout__.write(json.dumps({'result': result}))
except Exception as error:
    sys.__stdout__.write(json.dumps({'error': str(error)}))
`], { input: JSON.stringify(history), encoding: 'utf8' });
      const data = JSON.parse(result);
      if (data.error) throw new Error(data.error);
      return data.result;
    },
  });
}

afterEach(() => {
  delete window.loadPyodide;
  vi.resetModules();
});

it('captures Python print output and clears previous stdout and stderr between runs', async () => {
  installPythonRuntime();
  const { executeCode } = await import('../src/services/codeExecution');
  const first = await executeCode('print(2 + 3)', 'python');
  expect(first.success).toBe(true);
  expect(first.output).toBe('5\n');
  const second = await executeCode('import sys\nprint("second")\nsys.stderr.write("warning")\nNone', 'python');
  expect(second.output).toBe('second\nwarning');
  const third = await executeCode('print("fresh")', 'python');
  expect(third.output).toBe('fresh\n');
});
