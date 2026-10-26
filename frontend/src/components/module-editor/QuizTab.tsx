import { Plus, HelpCircle, Sparkles } from 'lucide-react';
import { Button } from '../common/Button';
import { QuizQuestionItem } from './QuizQuestionItem';
import type { QuizQuestionData } from '../../types';

export interface QuizTabProps {
  questions: QuizQuestionData[];
  isAiEnabled: boolean;
  isEditing: boolean;
  isGenerating: boolean;
  onAdd: () => void;
  onUpdateQuestion: (
    index: number,
    field: keyof QuizQuestionData,
    value: string | number | string[] | undefined
  ) => void;
  onUpdateOption: (questionIndex: number, optionIndex: number, value: string) => void;
  onAddOption: (index: number) => void;
  onRemoveOption: (index: number, optionIndex: number) => void;
  onRemove: (index: number) => void;
  onGenerate: () => void;
}

export function QuizTab({
  questions,
  isAiEnabled,
  isEditing,
  isGenerating,
  onAdd,
  onUpdateQuestion,
  onUpdateOption,
  onAddOption,
  onRemoveOption,
  onRemove,
  onGenerate,
}: QuizTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Create quiz questions to test learner comprehension.
        </p>
        <div className="flex gap-2">
          {isAiEnabled && isEditing && (
            <Button
              variant="secondary"
              onClick={onGenerate}
              isLoading={isGenerating}
              disabled={isGenerating}
            >
              <Sparkles className="w-4 h-4 mr-1" />
              Generate with AI
            </Button>
          )}
          <Button onClick={onAdd}>
            <Plus className="w-4 h-4 mr-1" />
            Add Question
          </Button>
        </div>
      </div>

      {questions.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50/50">
          <div className="w-14 h-14 mx-auto mb-4 bg-purple-100 rounded-full flex items-center justify-center">
            <HelpCircle className="w-7 h-7 text-purple-500" />
          </div>
          <h3 className="font-medium text-gray-900 mb-1">No quiz questions yet</h3>
          <p className="text-sm text-gray-500 mb-4">Add questions to test learner comprehension</p>
          <Button variant="secondary" onClick={onAdd}>
            <Plus className="w-4 h-4 mr-1" />
            Add First Question
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((question, qIndex) => (
            <QuizQuestionItem
              key={qIndex}
              question={question}
              index={qIndex}
              onUpdateQuestion={(field, value) => onUpdateQuestion(qIndex, field, value)}
              onUpdateOption={(optionIndex, value) =>
                onUpdateOption(qIndex, optionIndex, value)
              }
              onAddOption={() => onAddOption(qIndex)}
              onRemoveOption={optionIndex => onRemoveOption(qIndex, optionIndex)}
              onRemove={() => onRemove(qIndex)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
