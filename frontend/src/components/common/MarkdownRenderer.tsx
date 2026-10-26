import { CourseImage } from './CourseImage';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import mermaid from 'mermaid';
import { RunnableCodeBlock } from './RunnableCodeBlock';
import type { SandboxLanguage } from '../../types';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  enableRunnable?: boolean;
}

// Initialize mermaid with default config
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'inherit',
});

// Mermaid diagram component
function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!containerRef.current) return;

      try {
        // Generate unique ID for this diagram
        const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);
        setSvg(svg);
        setError(null);
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        setError(err instanceof Error ? err.message : 'Failed to render diagram');
      }
    };

    renderDiagram();
  }, [chart]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 my-4">
        <p className="text-sm text-red-600 font-medium">Diagram Error</p>
        <p className="text-xs text-red-500 mt-1">{error}</p>
        <pre className="mt-2 text-xs bg-red-100 p-2 rounded overflow-x-auto">
          {chart}
        </pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-4 flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

const RUNNABLE_LANGUAGES = ['python', 'javascript', 'js', 'py'];

export function MarkdownRenderer({ content, className = '', enableRunnable = false }: MarkdownRendererProps) {
  return (
    <div className={`prose prose-indigo max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          // Handle code blocks - both inline and block
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const codeString = String(children).replace(/\n$/, '');

            // Check if this is a code block (has language class) or inline
            const isCodeBlock = className?.includes('language-') || codeString.includes('\n');

            // Handle mermaid diagrams
            if (language === 'mermaid') {
              return <MermaidDiagram chart={codeString} />;
            }

            // Handle runnable code blocks (Python/JavaScript)
            if (enableRunnable && isCodeBlock && RUNNABLE_LANGUAGES.includes(language)) {
              const normalizedLanguage: SandboxLanguage =
                language === 'js' || language === 'javascript' ? 'javascript' : 'python';
              return <RunnableCodeBlock code={codeString} language={normalizedLanguage} />;
            }

            // Handle regular code blocks with syntax highlighting
            if (isCodeBlock && language) {
              return (
                <SyntaxHighlighter
                  style={oneDark}
                  language={language}
                  PreTag="div"
                  className="rounded-lg"
                >
                  {codeString}
                </SyntaxHighlighter>
              );
            }

            // Handle code blocks without language
            if (isCodeBlock) {
              return (
                <pre className="bg-gray-800 text-gray-100 p-4 rounded-lg overflow-x-auto">
                  <code {...props}>{children}</code>
                </pre>
              );
            }

            // Inline code
            return (
              <code
                className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono"
                {...props}
              >
                {children}
              </code>
            );
          },
          // Enhanced table styling
          table({ children }) {
            return (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-gray-50">{children}</thead>;
          },
          th({ children }) {
            return (
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="px-4 py-3 text-sm text-gray-700 border-b border-gray-100">
                {children}
              </td>
            );
          },
          // Enhanced blockquote styling
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 border-indigo-500 bg-indigo-50 pl-4 py-2 my-4 italic text-gray-700">
                {children}
              </blockquote>
            );
          },
          // Task list support (from GFM)
          input({ checked, ...props }) {
            return (
              <input
                type="checkbox"
                checked={checked}
                disabled
                className="mr-2 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                {...props}
              />
            );
          },
          // Enhanced link styling
          a({ href, children }) {
            const isExternal = href?.startsWith('http');
            return (
              <a
                href={href}
                className="text-indigo-600 hover:text-indigo-800 underline decoration-indigo-300 hover:decoration-indigo-500 transition-colors"
                {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {children}
              </a>
            );
          },
          // Enhanced image styling
          img({ src, alt }) {
            return (
              <CourseImage
                src={src}
                alt={alt || ''}
                className="rounded-lg shadow-md max-w-full h-auto my-4"
                loading="lazy"
              />
            );
          },
          // Enhanced horizontal rule
          hr() {
            return <hr className="my-8 border-t-2 border-gray-200" />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
