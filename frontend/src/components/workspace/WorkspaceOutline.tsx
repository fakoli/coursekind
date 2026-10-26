import { Link } from 'react-router-dom';
import { useCourse } from '../../hooks/useCourses';
import { useLearningPath } from '../../hooks/useLearningPaths';
import type { Workspace } from '../../types/workspace';

function LinkedCourse({ id }: { id: string }) {
  const course = useCourse(id);
  return (
    <li>
      {course.isPending ? (
        <span>Loading course…</span>
      ) : course.error || !course.data ? (
        <span className="text-gray-500">
          Course unavailable.{' '}
          <Link to="/courses" className="underline">
            Browse courses
          </Link>
        </span>
      ) : (
        <Link className="text-indigo-700 underline break-words" to={`/courses/${id}`}>
          {course.data.course.title}
        </Link>
      )}
    </li>
  );
}
function LinkedPath({ id }: { id: string }) {
  const path = useLearningPath(id);
  return (
    <div>
      {path.isPending ? (
        'Loading path…'
      ) : path.error || !path.data ? (
        <p>
          Path unavailable.{' '}
          <Link className="underline" to="/paths">
            Browse paths
          </Link>
        </p>
      ) : (
        <Link className="text-indigo-700 underline break-words" to={`/paths/${id}`}>
          {path.data.path.title}
        </Link>
      )}
    </div>
  );
}
export function WorkspaceOutline({ workspace }: { workspace: Workspace }) {
  return (
    <aside
      className="bg-white border rounded-xl p-5 space-y-3 min-w-0"
      aria-label="Workspace outline"
    >
      <h2 className="font-semibold text-lg">Linked material</h2>
      {workspace.path_id && <LinkedPath id={workspace.path_id} />}
      {workspace.course_ids.length > 0 ? (
        <ul className="space-y-3">
          {workspace.course_ids.map((id) => (
            <LinkedCourse key={id} id={id} />
          ))}
        </ul>
      ) : (
        <p className="text-gray-600">No linked courses yet.</p>
      )}
      <Link className="text-indigo-700 underline block" to="/courses/new">
        Create a course manually
      </Link>
      <p className="text-sm text-gray-500">
        Open an owned course or path to continue in its workspace.
      </p>
    </aside>
  );
}
