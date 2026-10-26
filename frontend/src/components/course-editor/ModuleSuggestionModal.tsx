import { GenerationCost } from '../common/GenerationCost';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import type { ModuleSuggestion, ModuleSummary } from '../../types';
import type { SuggestionMode, GenerationOptions, GenerationProgress } from '../../hooks/useModuleSuggestions';
import { GENERATION_COSTS, LIMITS } from '../../utils/constants';

export interface ModuleSuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  suggestions: ModuleSuggestion[];
  selectedIndices: Set<number>;
  mode: SuggestionMode;
  onModeChange: (mode: SuggestionMode) => void;
  isCreating: boolean;
  progress: GenerationProgress | null;
  existingModules: ModuleSummary[] | undefined;
  options: GenerationOptions;
  onOptionsChange: (updates: Partial<GenerationOptions>) => void;
  onToggleSuggestion: (index: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onConfirm: () => void;
}

export function ModuleSuggestionModal({
  isOpen,
  onClose,
  suggestions,
  selectedIndices,
  mode,
  onModeChange,
  isCreating,
  progress,
  existingModules,
  options,
  onOptionsChange,
  onToggleSuggestion,
  onSelectAll,
  onSelectNone,
  onConfirm,
}: ModuleSuggestionModalProps) {
  const hasExistingModules = existingModules && existingModules.length > 0;
  const estimatedTokens = options.generateContent ? selectedIndices.size * GENERATION_COSTS.MODULE_CONTENT : 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="AI Module Suggestions" size="lg">
      <div className="space-y-4">
        {/* Mode selection - only show if modules exist and mode not chosen */}
        {hasExistingModules && mode === null && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              You have {existingModules.length} existing module
              {existingModules.length !== 1 ? 's' : ''}. What would you like to do with the
              AI suggestions?
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => onModeChange('add')}
                className="flex-1"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add to Existing
              </Button>
              <Button
                variant="secondary"
                onClick={() => onModeChange('replace')}
                className="flex-1 text-amber-700 border-amber-300 hover:bg-amber-50"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Replace All
              </Button>
            </div>
          </div>
        )}

        {/* Suggestion selection - show after mode is chosen */}
        {mode !== null && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">Select which modules to create:</p>
              <div className="flex gap-2 text-sm">
                <button
                  type="button"
                  onClick={onSelectAll}
                  className="text-indigo-600 hover:text-indigo-800 underline"
                >
                  Select All
                </button>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  onClick={onSelectNone}
                  className="text-indigo-600 hover:text-indigo-800 underline"
                >
                  Select None
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {suggestions.map((suggestion, index) => (
                <label
                  key={index}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedIndices.has(index)
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIndices.has(index)}
                    onChange={() => onToggleSuggestion(index)}
                    className="mt-1 h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{suggestion.title}</p>
                    <p className="text-sm text-gray-600 mt-0.5">{suggestion.description}</p>
                    {suggestion.objectives.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {suggestion.objectives.slice(0, 2).join(' • ')}
                        {suggestion.objectives.length > 2 &&
                          ` • +${suggestion.objectives.length - 2} more`}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {/* Generation Options */}
            <div className="border-t border-gray-200 pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={options.generateContent}
                    onChange={(e) => onOptionsChange({ generateContent: e.target.checked })}
                    className="h-4 w-4 text-indigo-600 rounded border-gray-300"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Generate content for modules
                  </span>
                </label>
                <span className="text-xs text-gray-500"><GenerationCost amount={estimatedTokens} /></span>
              </div>

              {options.generateContent && (
                <div className="grid grid-cols-2 gap-4 pl-6">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Flashcards per module
                    </label>
                    <input
                      type="number"
                      aria-label="Flashcards per module"
                      value={options.flashcardCount}
                      onChange={(e) =>
                        onOptionsChange({
                          flashcardCount: Math.max(
                            LIMITS.FLASHCARD_MIN,
                            Math.min(LIMITS.FLASHCARD_MAX, parseInt(e.target.value) || 15)
                          ),
                        })
                      }
                      min={LIMITS.FLASHCARD_MIN}
                      max={LIMITS.FLASHCARD_MAX}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Quiz questions per module
                    </label>
                    <input
                      type="number"
                      aria-label="Quiz questions per module"
                      value={options.quizQuestionCount}
                      onChange={(e) =>
                        onOptionsChange({
                          quizQuestionCount: Math.max(
                            LIMITS.QUIZ_MIN,
                            Math.min(LIMITS.QUIZ_MAX, parseInt(e.target.value) || 10)
                          ),
                        })
                      }
                      min={LIMITS.QUIZ_MIN}
                      max={LIMITS.QUIZ_MAX}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-200 mt-4">
              <p className="text-sm text-gray-600">
                {selectedIndices.size} of {suggestions.length} selected
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={onClose} disabled={isCreating}>
                  Cancel
                </Button>
                <Button
                  onClick={onConfirm}
                  disabled={selectedIndices.size === 0 || isCreating}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      {progress
                        ? `Generating ${progress.current}/${progress.total}...`
                        : 'Creating...'}
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-1" />
                      Create {selectedIndices.size} Module
                      {selectedIndices.size !== 1 ? 's' : ''}
                      {options.generateContent && <> (<GenerationCost amount={estimatedTokens} />)</>}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
