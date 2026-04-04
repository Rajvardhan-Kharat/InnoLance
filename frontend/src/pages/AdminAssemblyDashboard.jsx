import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import api from '../utils/api';
import './AdminAssemblyDashboard.css';

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function pct(approved, total) {
  if (!total) return 0;
  return Math.round((approved / total) * 100);
}

const KANBAN_COLUMNS = ['Open', 'Assigned', 'Submitted', 'Approved'];

function resolveHiredUser(job) {
  const h = job?.hiredUser;
  if (h && typeof h === 'object' && (h.email || h.firstName || h.lastName)) return h;
  const f = job?.marketplaceProject?.freelancer;
  if (f && typeof f === 'object' && (f.email || f.firstName || f.lastName)) return f;
  return null;
}

/** Column reflects DB status, but Open + hired marketplace project → Assigned (matches assembly flow). */
function kanbanColumnForJob(job) {
  const hired = resolveHiredUser(job);
  let status = KANBAN_COLUMNS.includes(job?.status) ? job.status : 'Open';
  if (status === 'Open' && hired) status = 'Assigned';
  return status;
}

export default function AdminAssemblyDashboard() {
  const { projectId } = useParams();

  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState('');
  const [error, setError] = useState('');
  const [project, setProject] = useState(null);
  
  // Kanban local state
  const [columnsData, setColumnsData] = useState({
    Open: [],
    Assigned: [],
    Submitted: [],
    Approved: [],
  });

  const microJobs = useMemo(() => safeArray(project?.microJobs), [project]);

  // Sync server state to local Kanban (hired micro-tasks → Assigned even before manual drag)
  useEffect(() => {
    const cols = { Open: [], Assigned: [], Submitted: [], Approved: [] };
    microJobs.forEach((job) => {
      cols[kanbanColumnForJob(job)].push(job);
    });
    setColumnsData(cols);
  }, [microJobs]);

  const stats = useMemo(() => {
    const total = microJobs.length;
    const approved = microJobs.filter((j) => j?.status === 'Approved').length;
    const submitted = microJobs.filter((j) => j?.status === 'Submitted').length;
    return {
      total,
      approved,
      submitted,
      percent: pct(approved, total),
    };
  }, [microJobs]);

  const fetchProject = () => {
    setLoading(true);
    setError('');

    api.get(`/admin/enterprise-projects/${projectId}`)
      .then(({ data }) => {
        setProject(data.project || data.enterpriseProject || data);
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to load enterprise project.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const markComplete = async () => {
    if (!window.confirm('Are you sure you want to finalize this project as Completed?')) return;
    setUpdatingId('complete-btn');
    setError('');
    try {
      await api.patch(`/admin/enterprise-projects/${projectId}/complete`);
      setProject((prev) => ({ ...prev, status: 'Completed' }));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to complete project.');
    } finally {
      setUpdatingId('');
    }
  };

  const onDragEnd = async (result) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId) return;

    const newStatus = destination.droppableId;

    // Optimistic Update
    const sourceCol = Array.from(columnsData[source.droppableId]);
    const destCol = Array.from(columnsData[destination.droppableId]);
    const [movedTask] = sourceCol.splice(source.index, 1);
    
    movedTask.status = newStatus;
    destCol.splice(destination.index, 0, movedTask);

    setColumnsData({
      ...columnsData,
      [source.droppableId]: sourceCol,
      [destination.droppableId]: destCol,
    });

    try {
      await api.patch(`/admin/microjobs/${draggableId}/status`, { status: newStatus });
      fetchProject(); // Refetch to get any side effects (like Parent Project state 'Assembling')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update micro-job status.');
      fetchProject(); // Revert back
    }
  };

  if (loading) {
    return (
      <div className="admin-assembly">
        <h1>Assembly Dashboard</h1>
        <div className="assembly-card">Loading...</div>
      </div>
    );
  }

  return (
    <div className="admin-assembly">
      <div className="assembly-head">
        <div>
          <h1>Assembly Dashboard (Kanban Tracker)</h1>
          <div className="assembly-subtitle">
            {project?.clientReference ? (
              <span><strong>Client Ref:</strong> {project.clientReference}</span>
            ) : (
              <span className="muted">Client Ref: (missing)</span>
            )}
            <span className="dot">•</span>
            <span><strong>Status:</strong> {project?.status || '—'}</span>
            <span className="dot">•</span>
            <span><strong>Total Budget:</strong> {Number(project?.overallTotalBudget || 0)}</span>
          </div>
        </div>

        <Link className="btn btn-ghost" to={`/admin/project-builder/${projectId}`}>
          Open Project Builder
        </Link>
        {project?.status === 'Assembling' && (
          <button 
            type="button" 
            className="btn btn-primary" 
            onClick={markComplete}
            disabled={updatingId === 'complete-btn'}
          >
            {updatingId === 'complete-btn' ? 'Finalizing...' : 'Mark Integrated & Complete'}
          </button>
        )}
      </div>

      {error && <div className="assembly-error">{error}</div>}

      <div className="assembly-card">
        <div className="progress-top">
          <div className="progress-meta">
            <div className="progress-title">Overall Integration Progress</div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={fetchProject}>
            Refresh Sync
          </button>
        </div>

        <div className="progress-bar" role="progressbar" aria-valuenow={stats.percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-bar-fill" style={{ width: `${stats.percent}%` }} />
        </div>
        <div className="progress-hint" style={{ marginTop: '10px' }}>
          {stats.approved} out of {stats.total} micro-tasks fully Approved ({stats.percent}%).
        </div>
      </div>

      <div className="kanban-wrapper" style={{ marginTop: '30px' }}>
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="kanban-board" style={{ display: 'flex', gap: '20px', overflowX: 'auto', paddingBottom: '20px' }}>
            {KANBAN_COLUMNS.map((columnId) => (
              <Droppable key={columnId} droppableId={columnId}>
                {(provided, snapshot) => (
                  <div
                    className="kanban-column"
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      background: snapshot.isDraggingOver ? '#e2e8f0' : '#f7fafc',
                      padding: '16px',
                      borderRadius: '8px',
                      width: '300px',
                      minHeight: '400px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    <h3 style={{ margin: 0, paddingBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                      {columnId} <span style={{ background: '#edf2f7', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8em' }}>{columnsData[columnId].length}</span>
                    </h3>
                    
                    {columnsData[columnId].map((job, index) => {
                       const hired = resolveHiredUser(job);
                       const hiredLabel = hired
                         ? `${hired.firstName || ''} ${hired.lastName || ''}`.trim() || hired.email || 'Assigned'
                         : 'Unassigned';

                      return (
                        <Draggable key={job._id} draggableId={job._id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              className="kanban-card"
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              style={{
                                userSelect: 'none',
                                padding: '16px',
                                margin: '0 0 8px 0',
                                backgroundColor: snapshot.isDragging ? '#ebf8ff' : '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                boxShadow: snapshot.isDragging ? '0 5px 10px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.05)',
                                ...provided.draggableProps.style,
                              }}
                            >
                              <strong style={{ display: 'block', marginBottom: '8px', color: '#2d3748' }}>{job.title}</strong>
                              <div style={{ fontSize: '0.85em', color: '#718096', marginBottom: '4px' }}>
                                💰 ₹{Number(job.allocatedBudget || 0)}
                              </div>
                              <div style={{ fontSize: '0.85em', color: '#718096' }}>
                                👤 {hiredLabel}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
      </div>
    </div>
  );
}
