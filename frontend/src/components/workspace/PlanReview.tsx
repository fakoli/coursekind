import { useRef, useState } from 'react';
import { Button } from '../common/Button';
import { workspacesApi } from '../../api/workspaces';
import type { CourseNode, PlanProposal, WorkspacePlan, Workspace } from '../../types/workspace';

const field = 'block w-full min-w-0 rounded border p-2 text-sm';
function move<T>(items: T[], index: number, direction: number): T[] {
  const result = [...items];
  [result[index], result[index + direction]] = [result[index + direction], result[index]];
  return result;
}
export function PlanReview({
  proposal,
  onChanged,
  onApplied,
  disabled = false,
}: {
  proposal: PlanProposal;
  onChanged: () => Promise<void>;
  onApplied?: (workspace: Workspace) => void;
  disabled?: boolean;
}) {
  const [plan, setPlan] = useState<WorkspacePlan>(() => structuredClone(proposal.plan));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<{ signature: string; id: string } | null>(null);
  const dirty = JSON.stringify(plan) !== JSON.stringify(proposal.plan);
  const locked = disabled || proposal.status === 'applied' || busy;
  function editCourse(index: number, next: CourseNode) {
    setPlan({
      ...plan,
      courses: plan.courses.map((c, i) => (i === index ? next : c)),
    });
  }
  async function save(apply: boolean) {
    const signature = JSON.stringify({
      apply,
      plan,
      version: proposal.version,
    });
    if (request.current?.signature !== signature)
      request.current = { signature, id: crypto.randomUUID() };
    setBusy(true);
    setError('');
    try {
      const base = {
        request_id: request.current.id,
        expected_proposal_version: proposal.version,
      };
      if (apply) {
        const applied = await workspacesApi.applyPlan(proposal.workspace_id, proposal.id, base);
        if (applied.applied_workspace) onApplied?.(applied.applied_workspace);
      }
      else
        await workspacesApi.updatePlan(proposal.workspace_id, proposal.id, {
          ...base,
          plan,
        });
      request.current = null;
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Plan could not be saved');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Plan review" className="border rounded-xl p-5 bg-white space-y-4 min-w-0">
      <h2 className="text-xl font-semibold">Review your plan</h2>
      <p className="text-sm text-gray-600">
        Manual edits and Apply are free. Applying adds private material; existing lessons stay in
        place.
      </p>
      <fieldset disabled={locked} className="space-y-3 min-w-0">
        <label className="block">
          Plan title
          <input
            className={field}
            value={plan.title}
            maxLength={200}
            onChange={(e) => setPlan({ ...plan, title: e.target.value })}
          />
        </label>
        <label className="block">
          Plan description
          <textarea
            className={field}
            value={plan.description}
            onChange={(e) => setPlan({ ...plan, description: e.target.value })}
          />
        </label>
        <label className="block">
          Assumptions (one per line)
          <textarea
            className={field}
            value={plan.assumptions.join('\n')}
            onChange={(e) => setPlan({ ...plan, assumptions: e.target.value.split('\n') })}
          />
        </label>
        <ol className="space-y-4">
          {plan.courses.map((course, index) => (
            <li
              key={course.kind === 'new' ? course.temp_id : course.course_id}
              className="border rounded p-3 space-y-3 min-w-0"
            >
              <div className="flex gap-2 flex-wrap">
                <span className="font-semibold">Course {index + 1}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`Move course ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => setPlan({ ...plan, courses: move(plan.courses, index, -1) })}
                >
                  Move up
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`Move course ${index + 1} down`}
                  disabled={index === plan.courses.length - 1}
                  onClick={() => setPlan({ ...plan, courses: move(plan.courses, index, 1) })}
                >
                  Move down
                </Button>
              </div>
              {course.kind === 'reuse' ? (
                <p className="break-words">
                  Reuse selected course:{' '}
                  {String(
                    proposal.base_snapshots.find((s) => s.target.resource_id === course.course_id)
                      ?.fields.title || course.course_id,
                  )}
                  . Original authorship is preserved.
                </p>
              ) : (
                <>
                  <label className="block">
                    Course {index + 1} title
                    <input
                      className={field}
                      value={course.title}
                      onChange={(e) => editCourse(index, { ...course, title: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    Course {index + 1} description
                    <textarea
                      className={field}
                      value={course.description}
                      onChange={(e) =>
                        editCourse(index, {
                          ...course,
                          description: e.target.value,
                        })
                      }
                    />
                  </label>
                  <ol className="space-y-3">
                    {course.modules.map((module, mi) => (
                      <li key={module.temp_id} className="border-l-2 pl-3 space-y-2">
                        <label className="block">
                          Module {index + 1}.{mi + 1} title
                          <input
                            className={field}
                            value={module.title}
                            onChange={(e) =>
                              editCourse(index, {
                                ...course,
                                modules: course.modules.map((m, j) =>
                                  j === mi ? { ...m, title: e.target.value } : m,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="block">
                          Module {index + 1}.{mi + 1} description
                          <textarea
                            className={field}
                            value={module.description}
                            onChange={(e) =>
                              editCourse(index, {
                                ...course,
                                modules: course.modules.map((m, j) =>
                                  j === mi ? { ...m, description: e.target.value } : m,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="block">
                          Objectives {index + 1}.{mi + 1} (one per line)
                          <textarea
                            className={field}
                            value={module.objectives.join('\n')}
                            onChange={(e) =>
                              editCourse(index, {
                                ...course,
                                modules: course.modules.map((m, j) =>
                                  j === mi
                                    ? {
                                        ...m,
                                        objectives: e.target.value.split('\n'),
                                      }
                                    : m,
                                ),
                              })
                            }
                          />
                        </label>
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-label={`Move module ${index + 1}.${mi + 1} up`}
                            disabled={mi === 0}
                            onClick={() =>
                              editCourse(index, {
                                ...course,
                                modules: move(course.modules, mi, -1),
                              })
                            }
                          >
                            Move up
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-label={`Move module ${index + 1}.${mi + 1} down`}
                            disabled={mi === course.modules.length - 1}
                            onClick={() =>
                              editCourse(index, {
                                ...course,
                                modules: move(course.modules, mi, 1),
                              })
                            }
                          >
                            Move down
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </li>
          ))}
        </ol>
      </fieldset>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {proposal.status === 'applied' ? (
        <p role="status">Plan applied. Choose a module to build below.</p>
      ) : (
        <div className="flex gap-3 flex-wrap">
          <Button variant="secondary" disabled={locked || !dirty} onClick={() => void save(false)}>
            Save plan edits · free
          </Button>
          <Button disabled={locked || dirty} onClick={() => void save(true)}>
            Apply plan · free
          </Button>
          {dirty && <p className="text-sm">Save your edits before applying.</p>}
        </div>
      )}
    </section>
  );
}
