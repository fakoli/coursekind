import { Trash2 } from 'lucide-react';
import { Textarea } from '../common/Textarea';
import { Card, CardContent } from '../common/Card';
import type { QuizQuestionData } from '../../types';

export interface QuizQuestionItemProps {
  question: QuizQuestionData;
  index: number;
  onUpdateQuestion: (field: keyof QuizQuestionData, value: string | number | string[] | undefined) => void;
  onUpdateOption: (optionIndex: number, value: string) => void;
  onAddOption?: () => void;
  onRemoveOption?: (optionIndex: number) => void;
  onRemove: () => void;
}

export function QuizQuestionItem({
  question,
  index,
  onUpdateQuestion,
  onUpdateOption,
  onAddOption,
  onRemoveOption,
  onRemove,
}: QuizQuestionItemProps) {
  return (
    <Card>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-semibold text-sm">
                {index + 1}
              </span>
              <span className="text-sm font-medium text-gray-700">Question</span>
            </div>
            <button
              onClick={onRemove}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              type="button"
              aria-label={`Remove question ${index + 1}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <Textarea
            aria-label={`Question ${index + 1}`}
            value={question.question}
            onChange={(e) => onUpdateQuestion('question', e.target.value)}
            placeholder="Enter your question..."
            rows={2}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">Answer Options</label>
              <span className="text-xs text-gray-500">Click to mark as correct</span>
            </div>
            {question.options.map((option, oIndex) => {
              const isCorrect = question.correct_index === oIndex;
              return (
                <div
                  key={oIndex}
                  className={`flex items-center gap-3 p-2 rounded-lg transition-colors cursor-pointer ${
                    isCorrect
                      ? 'bg-green-50 border-2 border-green-200'
                      : 'bg-gray-50 border-2 border-transparent hover:border-gray-200'
                  }`}

                >
                  <input type="radio" name={`correct-answer-${index}`} checked={isCorrect}
                    aria-label={`Correct answer ${String.fromCharCode(65 + oIndex)}`}
                    onChange={() => onUpdateQuestion('correct_index', oIndex)}
                    className="w-5 h-5 accent-green-600" />
                  <span className={`w-6 font-medium text-sm ${isCorrect ? 'text-green-700' : 'text-gray-500'}`}>
                    {String.fromCharCode(65 + oIndex)}.
                  </span>
                  <input
                    aria-label={`Question ${index + 1} option ${String.fromCharCode(65 + oIndex)}`}
                    type="text"
                    value={option}
                    onChange={(e) => {
                      e.stopPropagation();
                      onUpdateOption(oIndex, e.target.value);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={`Option ${String.fromCharCode(65 + oIndex)}`}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      isCorrect
                        ? 'border-green-300 bg-white'
                        : 'border-gray-300 bg-white'
                    }`}
                  />
                  <button type="button" aria-label={`Remove option ${String.fromCharCode(65 + oIndex)} from question ${index + 1}`} disabled={question.options.length <= 2} onClick={() => onRemoveOption?.(oIndex)}><Trash2 className="w-4 h-4" /></button>
                  {isCorrect && (
                    <span className="text-xs font-medium text-green-600 px-2 py-1 bg-green-100 rounded-full">
                      Correct
                    </span>
                  )}
                </div>
              );
            })}
            <button type="button" className="text-indigo-700" disabled={question.options.length >= 6} onClick={onAddOption}>Add option</button>
            {question.correct_index < 0 && <p role="alert">Select a correct answer.</p>}
          </div>

          <Textarea
            label="Explanation (optional)"
            value={question.explanation || ''}
            onChange={(e) => onUpdateQuestion('explanation', e.target.value || undefined)}
            placeholder="Explain why this answer is correct..."
            rows={2}
          />
        </div>
      </CardContent>
    </Card>
  );
}
