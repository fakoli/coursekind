import { GenerationCost } from '../common/GenerationCost';
import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '../common/Card';
import { Button } from '../common/Button';
import { LIMITS } from '../../utils/constants';

export interface AIPromptPanelProps {
  modulePrompt: string;
  flashcardCount: number;
  quizQuestionCount: number;
  title: string;
  isGenerating: boolean;
  onPromptChange: (value: string) => void;
  onFlashcardCountChange: (value: number) => void;
  onQuizCountChange: (value: number) => void;
  onGenerate: () => void;
}

export function AIPromptPanel({
  modulePrompt,
  flashcardCount,
  quizQuestionCount,
  title,
  isGenerating,
  onPromptChange,
  onFlashcardCountChange,
  onQuizCountChange,
  onGenerate,
}: AIPromptPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isValid = title.trim().length > 0 && modulePrompt.trim().length >= LIMITS.MODULE_PROMPT_MIN_LENGTH;
  const hasPrompt = modulePrompt.trim().length > 0;

  return (
    <Card className="bg-amber-50 border-amber-200">
      <CardContent className={isExpanded ? '' : 'pb-3'}>
        {/* Collapsed header - always visible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-amber-800">AI Content Generation</p>
              {!isExpanded && (
                <p className="text-xs text-amber-600 mt-0.5">
                  {hasPrompt
                    ? `Prompt set (${flashcardCount} cards, ${quizQuestionCount} questions)`
                    : 'Click to configure and generate content'}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isExpanded && hasPrompt && (
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerate();
                }}
                isLoading={isGenerating}
                disabled={isGenerating || !isValid}
              >
                <Sparkles className="w-3 h-3 mr-1" />
                Generate
              </Button>
            )}
            <div className="p-1 text-amber-600">
              {isExpanded ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </div>
          </div>
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-amber-200">
            <p className="text-sm text-amber-700 mb-3">
              Describe what this module should cover. AI will use the course instructions to
              generate content, flashcards, and quiz questions.
            </p>
            <div className="space-y-3">
              <textarea
                value={modulePrompt}
                onChange={(e) => onPromptChange(e.target.value)}
                placeholder="e.g., Cover DataFrame basics, Series, indexing, and common operations like filtering, groupby, and merging. Include visual diagrams of DataFrame structure."
                className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                rows={3}
              />
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-amber-700">Flashcards:</label>
                  <select
                    value={flashcardCount}
                    onChange={(e) => onFlashcardCountChange(Number(e.target.value))}
                    className="rounded border border-amber-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={20}>20</option>
                    <option value={30}>30</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-amber-700">Quiz questions:</label>
                  <select
                    value={quizQuestionCount}
                    onChange={(e) => onQuizCountChange(Number(e.target.value))}
                    className="rounded border border-amber-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={20}>20</option>
                  </select>
                </div>
                <Button
                  onClick={onGenerate}
                  isLoading={isGenerating}
                  disabled={isGenerating || !isValid}
                  className="ml-auto"
                >
                  <Sparkles className="w-4 h-4 mr-1" />
                  Generate All
                </Button>
              </div>
              <p className="text-xs text-amber-600">
                <GenerationCost amount={25} />. Generates content, flashcards, and quiz.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
