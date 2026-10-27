import { useState, useCallback, useRef, useEffect } from 'react';
import { Play, Copy, Check, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { executeCode, type ExecutionResult } from '../../services/codeExecution';
import type { SandboxLanguage } from '../../types';

interface RunnableCodeBlockProps {
  code: string;
  language: SandboxLanguage;
  onExecuted?: (code: string, result: ExecutionResult) => Promise<void>;
}

export function RunnableCodeBlock({ code, language, onExecuted }: RunnableCodeBlockProps) {
  const [draft, setDraft] = useState(code);
  const [editing, setEditing] = useState(false);
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [showOutput, setShowOutput] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleRun = useCallback(async () => {
    const controller = new AbortController();
    running.current = controller;
    setIsRunning(true);
    setShowOutput(true);
    try {
      const executionResult = await executeCode(draft, language, controller.signal);
      if (controller.signal.aborted) return;
      setResult(executionResult);
      await onExecuted?.(draft, executionResult);
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
  }, [draft, language, onExecuted]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied
    }
  }, [draft]);

  const languageLabel = language === 'python' ? 'Python' : 'JavaScript';

  return (
    <div className="my-4 rounded-lg overflow-hidden border border-gray-700">
      {/* Header with language label and action buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-800 px-3 py-1.5 border-b border-gray-700">
        <span className="text-xs font-medium text-gray-400">{languageLabel}</span>
        <div className="flex flex-wrap items-center gap-1">
          <button className="min-h-11 whitespace-nowrap px-3 py-2 text-sm text-white" disabled={isRunning} onClick={() => setEditing(!editing)}>{editing ? 'Hide editor' : 'Edit code'}</button>
          <button className="min-h-11 whitespace-nowrap px-3 py-2 text-sm text-white" disabled={isRunning} onClick={() => { setDraft(code); setResult(null); }}>Reset code</button>
          <button
            onClick={handleCopy}
            className="flex h-11 w-11 items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            title="Copy code"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex items-center gap-1 min-h-11 whitespace-nowrap px-3 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded transition-colors"
            title="Run code"
            aria-label="Run code"
          >
            {isRunning ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            Run
          </button>
        </div>
      </div>

      {/* Code block */}
      {editing ? <textarea aria-label="Example code" value={draft} disabled={isRunning}
        className="w-full h-40 p-3 bg-gray-900 text-white font-mono text-sm" spellCheck={false}
        onChange={event => setDraft(event.target.value)} /> : <SyntaxHighlighter
        style={oneDark}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.875rem',
        }}
      >
        {draft}
      </SyntaxHighlighter>}

      {/* Output section */}
      {(showOutput || result) && (
        <div className="border-t border-gray-700">
          <button
            onClick={() => setShowOutput(!showOutput)}
            className="flex items-center gap-1 w-full px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-750 transition-colors"
          >
            {showOutput ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Output
            {result && (
              <span className="ml-2 text-gray-500">
                ({result.executionTime.toFixed(0)}ms)
              </span>
            )}
          </button>
          {showOutput && (
            <div className="bg-gray-900 p-3 text-sm font-mono">
              {isRunning ? (
                <div className="flex items-center gap-2 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running...
                </div>
              ) : result ? (
                result.success ? (
                  <pre className="text-gray-100 whitespace-pre-wrap break-words">
                    {result.output}
                  </pre>
                ) : (
                  <pre className="text-red-400 whitespace-pre-wrap break-words">
                    Error: {result.error}
                  </pre>
                )
              ) : (
                <span className="text-gray-500 italic">
                  Click &quot;Run&quot; to execute the code
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
