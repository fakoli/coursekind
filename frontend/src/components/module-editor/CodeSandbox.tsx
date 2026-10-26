import { useState, useCallback, useEffect, useRef } from 'react';
import { Play, RotateCcw, Eye, EyeOff, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { executeCode, type ExecutionResult } from '../../services/codeExecution';
import type { SandboxData } from '../../types';

interface CodeSandboxProps {
  sandbox: SandboxData;
  readOnly?: boolean;
  onCodeChange?: (code: string) => void;
  savedCode?: string;
  onExecuted?: (code: string, result: ExecutionResult) => Promise<void>;
}

export function CodeSandbox({
  sandbox,
  readOnly = false,
  onCodeChange,
  savedCode,
  onExecuted,
}: CodeSandboxProps) {
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);
  const [code, setCode] = useState(savedCode ?? sandbox.starter_code);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [showSolution, setShowSolution] = useState(false);

  // The parent keys this editor by module and waits for saved state before
  // mounting. A progress acknowledgement must never erase the current output.
  const handleCodeChange = useCallback(
    (value: string) => {
      setCode(value);
      onCodeChange?.(value);
    },
    [onCodeChange]
  );

  const handleRun = useCallback(async () => {
    const controller = new AbortController();
    running.current = controller;
    setIsRunning(true);
    try {
      const executionResult = await executeCode(code, sandbox.language, controller.signal);
      if (controller.signal.aborted) return;
      setResult(executionResult);
      await onExecuted?.(code, executionResult);
    } catch (err) {
      setResult({
        success: false,
        output: '',
        error: err instanceof Error ? err.message : 'Unknown error',
        executionTime: 0,
      });
    } finally {
      setIsRunning(false);
    }
  }, [code, sandbox.language, onExecuted]);

  const handleReset = useCallback(() => {
    setCode(sandbox.starter_code);
    setResult(null);
    onCodeChange?.(sandbox.starter_code);
  }, [sandbox.starter_code, onCodeChange]);

  const languageLabel = sandbox.language === 'python' ? 'Python' : 'JavaScript';

  return (
    <div className="space-y-4">
      {/* Instructions */}
      {sandbox.instructions && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">Instructions</h4>
          <p className="text-sm text-blue-800 whitespace-pre-wrap">{sandbox.instructions}</p>
        </div>
      )}

      {/* Code Editor Section */}
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between bg-gray-100 px-4 py-2 border-b border-gray-300">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">{languageLabel}</span>
            <span className="text-xs text-gray-500">Code Editor</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              disabled={isRunning}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
              title="Reset to starter code"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 rounded transition-colors"
            >
              {isRunning ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              Run Code
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="relative">
          <textarea
            aria-label="Practice code"
            value={code}
            onChange={(e) => handleCodeChange(e.target.value)}
            disabled={readOnly || isRunning}
            className="w-full h-64 p-4 font-mono text-sm bg-gray-900 text-gray-100 resize-none focus:outline-none"
            placeholder={`Write your ${languageLabel} code here...`}
            spellCheck={false}
          />
        </div>

        {/* Output Section */}
        <div className="border-t border-gray-300">
          <div className="flex items-center justify-between bg-gray-100 px-4 py-2 border-b border-gray-200">
            <span className="text-sm font-medium text-gray-700">Output</span>
            {result && (
              <div className="flex items-center gap-2">
                {result.success ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-600" />
                )}
                <span className="text-xs text-gray-500">
                  {result.executionTime.toFixed(0)}ms
                </span>
              </div>
            )}
          </div>
          <div className="bg-gray-900 p-4 min-h-[100px] max-h-[200px] overflow-auto">
            {isRunning ? (
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Running...</span>
              </div>
            ) : result ? (
              result.success ? (
                <pre className="text-sm text-gray-100 font-mono whitespace-pre-wrap break-words">
                  {result.output}
                </pre>
              ) : (
                <pre className="text-sm text-red-400 font-mono whitespace-pre-wrap break-words">
                  Error: {result.error}
                </pre>
              )
            ) : (
              <span className="text-sm text-gray-500 italic">
                Click &quot;Run Code&quot; to execute your code
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Solution Section */}
      {sandbox.solution_code && (
        <div className="border border-gray-300 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowSolution(!showSolution)}
            className="flex items-center justify-between w-full bg-gray-100 px-4 py-2 hover:bg-gray-200 transition-colors"
          >
            <span className="text-sm font-medium text-gray-700">Solution</span>
            <div className="flex items-center gap-1 text-gray-500">
              {showSolution ? (
                <>
                  <EyeOff className="w-4 h-4" />
                  <span className="text-xs">Hide</span>
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" />
                  <span className="text-xs">Show</span>
                </>
              )}
            </div>
          </button>
          {showSolution && (
            <SyntaxHighlighter
              style={oneDark}
              language={sandbox.language}
              PreTag="div"
              customStyle={{
                margin: 0,
                borderRadius: 0,
                fontSize: '0.875rem',
              }}
            >
              {sandbox.solution_code}
            </SyntaxHighlighter>
          )}
        </div>
      )}
    </div>
  );
}
