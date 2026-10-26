import { RefObject } from 'react';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import { MarkdownToolbar } from './MarkdownToolbar';
import { AIPromptPanel } from './AIPromptPanel';

export interface ContentTabProps {
  contentMarkdown: string;
  onContentChange: (value: string) => void;
  onInsertMarkdown: (before: string, after?: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  isAiEnabled: boolean;
  modulePrompt: string;
  flashcardCount: number;
  quizQuestionCount: number;
  title: string;
  isGenerating: boolean;
  onPromptChange: (value: string) => void;
  onFlashcardCountChange: (value: number) => void;
  onQuizCountChange: (value: number) => void;
  onGenerateContent: () => void;
}

export function ContentTab({
  contentMarkdown,
  onContentChange,
  onInsertMarkdown,
  textareaRef,
  isAiEnabled,
  modulePrompt,
  flashcardCount,
  quizQuestionCount,
  title,
  isGenerating,
  onPromptChange,
  onFlashcardCountChange,
  onQuizCountChange,
  onGenerateContent,
}: ContentTabProps) {
  return (
    <div className="space-y-4">
      {/* AI Prompt (for AI-enabled courses) */}
      {isAiEnabled && (
        <AIPromptPanel
          modulePrompt={modulePrompt}
          flashcardCount={flashcardCount}
          quizQuestionCount={quizQuestionCount}
          title={title}
          isGenerating={isGenerating}
          onPromptChange={onPromptChange}
          onFlashcardCountChange={onFlashcardCountChange}
          onQuizCountChange={onQuizCountChange}
          onGenerate={onGenerateContent}
        />
      )}

      {/* Markdown Toolbar */}
      <MarkdownToolbar onInsert={onInsertMarkdown} />

      {/* Split Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border border-gray-300 rounded-b-lg overflow-hidden">
        {/* Editor */}
        <div className="border-r border-gray-300">
          <textarea aria-label="Module content Markdown"
            ref={textareaRef}
            value={contentMarkdown}
            onChange={(e) => onContentChange(e.target.value)}
            placeholder="Write your module content in Markdown..."
            className="w-full h-96 p-4 font-mono text-sm resize-none focus:outline-none"
          />
        </div>
        {/* Preview */}
        <div className="bg-gray-50 h-96 overflow-auto p-4">
          {contentMarkdown ? (
            <MarkdownRenderer content={contentMarkdown} />
          ) : (
            <p className="text-gray-400 italic">Preview will appear here...</p>
          )}
        </div>
      </div>
    </div>
  );
}
