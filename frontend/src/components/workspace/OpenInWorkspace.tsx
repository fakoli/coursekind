import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../common/Button';
import { useCreateWorkspace } from '../../hooks/useWorkspaces';
import { emptyBrief, type WorkspaceCreate } from '../../types/workspace';

export function OpenInWorkspace({
  kind,
  id,
  title,
}: {
  kind: 'course' | 'path';
  id: string;
  title: string;
}) {
  const create = useCreateWorkspace();
  const navigate = useNavigate();
  const request = useRef<WorkspaceCreate | null>(null);
  const open = async () => {
    request.current ??= {
      request_id: crypto.randomUUID(),
      brief: { ...emptyBrief, goal: title, scope: kind },
      ...(kind === 'course' ? { source_course_id: id } : { source_path_id: id }),
    };
    try {
      const workspace = await create.mutateAsync(request.current);
      navigate(`/workspaces/${workspace.id}`);
    } catch {
      /* Retain the request ID for a lost-response retry. */
    }
  };
  return (
    <div className="space-y-1">
      <Button variant="secondary" isLoading={create.isPending} onClick={() => void open()}>
        Open in workspace
      </Button>
      {create.error && (
        <p role="alert" className="text-sm text-red-700">
          {create.error.message} Try again.
        </p>
      )}
    </div>
  );
}
