import { useEffect, useMemo, useReducer, useState } from "react";
import { useTideCloak } from "@tidecloak/react";
import seed from "./seed.json";

const initialPanel = [
  { id: "approver-1", name: "Dr. Amara Okafor", title: "Head of School" },
  { id: "approver-2", name: "Sam Williams", title: "Academic Advisor" },
  { id: "approver-3", name: "Alex Morgan", title: "Student Representative" },
];

const demoRegistrar = { id: "registrar-1", name: "Taylor Reed", title: "Registrar" };
const actionNames = {
  force: "Force enrol",
  jump: "Jump the queue",
  remove: "Remove a student",
  panel: "Change approver panel",
};

function audit(state, actor, action, reason) {
  return {
    ...state,
    audit: [{
      id: `${Date.now()}-${Math.random()}`,
      time: new Date().toISOString(),
      actor,
      action,
      reason,
    }, ...state.audit],
  };
}

function applyApprovedAction(state, request) {
  if (request.kind === "panel") {
    return {
      ...state,
      panel: [...state.panel.filter((member) => member.id !== request.replaceMember.id), request.candidate],
    };
  }

  const courses = state.courses.map((course) => {
    if (course.id !== request.courseId) return course;
    const enrolled = course.enrolled.filter((id) => id !== request.studentId);
    const waitlist = course.waitlist.filter((id) => id !== request.studentId);
    if (request.kind === "force") {
      return { ...course, enrolled: [...enrolled, request.studentId], waitlist };
    }
    if (request.kind === "jump") {
      return { ...course, enrolled, waitlist: [request.studentId, ...waitlist] };
    }
    return { ...course, enrolled, waitlist };
  });
  return { ...state, courses };
}

function reducer(state, event) {
  if (event.type === "enrol") {
    const course = state.courses.find((item) => item.id === event.courseId);
    if (course.enrolled.includes(event.studentId) || course.waitlist.includes(event.studentId)) return state;
    const hasSeat = course.enrolled.length < course.capacity;
    const courses = state.courses.map((item) => item.id !== course.id ? item : hasSeat
      ? { ...item, enrolled: [...item.enrolled, event.studentId] }
      : { ...item, waitlist: [...item.waitlist, event.studentId] });
    return audit({ ...state, courses }, event.actor, hasSeat ? "Enrolment recorded" : "Joined waitlist",
      hasSeat ? `${event.studentName} enrolled in ${course.code}.` : `${event.studentName} joined ${course.code}'s waitlist in FIFO order.`);
  }
  if (event.type === "capacity") {
    const courses = state.courses.map((course) => course.id === event.courseId
      ? { ...course, capacity: Math.max(1, Number(event.capacity) || 1) }
      : course);
    const course = state.courses.find((item) => item.id === event.courseId);
    return audit({ ...state, courses }, event.actor, "Seat limit updated",
      `${course.code} seat limit set to ${event.capacity}.`);
  }
  if (event.type === "blocked") {
    return audit(state, event.actor, "Blocked registrar override attempt", event.reason);
  }
  if (event.type === "request") {
    const request = { ...event.request, approvals: [], status: "pending", id: `${Date.now()}-${Math.random()}` };
    return audit({ ...state, requests: [request, ...state.requests] }, request.requester,
      `${actionNames[request.kind]} requested`, request.reason);
  }
  if (event.type === "vote") {
    const request = state.requests.find((item) => item.id === event.requestId);
    if (!request || request.status !== "pending") return state;
    if (request.requester === event.approver.name || !state.panel.some((member) => member.id === event.approver.id)
      || request.approvals.some((member) => member.id === event.approver.id)) {
      return audit(state, event.approver.name, "Approval blocked",
        "Requester cannot approve their own request; panel members may vote only once.");
    }
    const approvals = [...request.approvals, event.approver];
    let next = audit({
      ...state,
      requests: state.requests.map((item) => item.id === request.id ? { ...item, approvals } : item),
    }, event.approver.name, "Exception approval recorded", `Approval ${approvals.length} of 2 for ${actionNames[request.kind].toLowerCase()}: ${request.reason}`);
    if (approvals.length >= 2) {
      const approvedRequest = { ...request, approvals };
      next = applyApprovedAction(next, approvedRequest);
      next = {
        ...next,
        requests: next.requests.map((item) => item.id === request.id ? { ...item, approvals, status: "approved" } : item),
      };
      next = audit(next, "FairEnrol demo", "Exception approved and applied",
        `${actionNames[request.kind]} approved by ${approvals.map((member) => member.name).join(" and ")}. Public reason: ${request.reason}`);
    }
    return next;
  }
  if (event.type === "deny") {
    const request = state.requests.find((item) => item.id === event.requestId);
    if (!request || request.status !== "pending") return state;
    return audit({
      ...state,
      requests: state.requests.map((item) => item.id === request.id ? { ...item, status: "denied" } : item),
    }, event.actor, "Exception denied", `${event.reason} Request reason: ${request.reason}`);
  }
  return state;
}

function personName(state, id) {
  return state.students.find((student) => student.id === id)?.name ?? id;
}

export default function App() {
  const { authenticated, isInitializing, isLoading, initError, login, logout, hasRealmRole, getValueFromToken } = useTideCloak();
  const [state, dispatch] = useReducer(reducer, {
    courses: seed.courses,
    students: seed.students,
    panel: initialPanel,
    requests: [],
    audit: [],
  });
  const [role, setRole] = useState("student");
  const [studentId, setStudentId] = useState(seed.students[0].id);
  const [approverId, setApproverId] = useState(initialPanel[0].id);
  const [selectedCourse, setSelectedCourse] = useState(seed.courses[0].id);
  const [requestKind, setRequestKind] = useState("force");
  const [targetStudent, setTargetStudent] = useState(seed.students[3].id);
  const [reason, setReason] = useState("Accessibility accommodation requires a seat in this course.");
  const [panelCandidate, setPanelCandidate] = useState(demoRegistrar.id);
  const [panelRemoval, setPanelRemoval] = useState(initialPanel[2].id);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const callbackPath = new URL(`${import.meta.env.BASE_URL}auth/redirect`, location.origin).pathname;
    if (location.pathname === callbackPath && !isInitializing) {
      history.replaceState(null, "", import.meta.env.BASE_URL);
    }
  }, [isInitializing]);

  const activeApprover = state.panel.find((member) => member.id === approverId) ?? state.panel[0];
  const actor = role === "registrar"
    ? demoRegistrar
    : role === "approver"
      ? activeApprover
      : state.students.find((student) => student.id === studentId);
  const isAlreadyEnrolled = (course, id) => course.enrolled.includes(id);

  const ownWaitlists = useMemo(() => state.courses
    .map((course) => ({ course, position: course.waitlist.indexOf(studentId) + 1 }))
    .filter((item) => item.position > 0), [state.courses, studentId]);

  function submitRequest(event) {
    event.preventDefault();
    const base = {
      kind: requestKind,
      requester: actor.name,
      reason: reason.trim(),
    };
    if (!base.reason) return;
    if (requestKind === "panel") {
      const candidate = panelCandidate === demoRegistrar.id
        ? { id: demoRegistrar.id, name: demoRegistrar.name, title: demoRegistrar.title }
        : state.students.find((student) => student.id === panelCandidate);
      const replaceMember = state.panel.find((member) => member.id === panelRemoval);
      if (!candidate || !replaceMember) return;
      dispatch({ type: "request", request: { ...base, candidate, replaceMember } });
    } else {
      dispatch({ type: "request", request: { ...base, courseId: selectedCourse, studentId: targetStudent } });
    }
    setNotice("Request added to the public log. This demo's approval flow is simulated.");
  }

  function attemptRegistrarOverrides() {
    dispatch({ type: "blocked", actor: demoRegistrar.name, reason: "Registrar cannot reorder a queue; positions change only through FIFO enrolment or a publicly reasoned, two-approval exception." });
    dispatch({ type: "blocked", actor: demoRegistrar.name, reason: "Registrar cannot change the approver panel alone; a panel change needs two approver votes." });
    setNotice("Both override attempts were blocked. The public log records each attempt.");
  }

  function joinCourse(course) {
    dispatch({ type: "enrol", courseId: course.id, studentId, studentName: personName(state, studentId), actor: actor.name });
    setNotice("Enrolment or FIFO waitlist position recorded in this demo.");
  }

  async function startLogin() {
    try {
      await login();
    } catch (error) {
      setNotice(`TideCloak login could not start: ${error instanceof Error ? error.message : String(error)}. Check that TideCloak is running at localhost:8080.`);
    }
  }

  if (isInitializing) return <main className="loading">Connecting to TideCloak…</main>;

  const tokenName = authenticated
    ? getValueFromToken("name") || getValueFromToken("preferred_username")
    : "";
  const hasRegistrarRole = authenticated && (hasRealmRole("registrar") || hasRealmRole("admin"));
  const hasApproverRole = authenticated && hasRealmRole("approver");

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark">F</span> FairEnrol</a>
        <div className="top-actions">
          <span className={`auth-state ${authenticated ? "connected" : ""}`}>
            <i /> {authenticated ? `TideCloak · ${tokenName || "signed in"}` : "TideCloak · not signed in"}
          </span>
          {authenticated
            ? <button className="button quiet" onClick={logout}>Log out</button>
            : <button className="button dark" onClick={startLogin} disabled={isLoading}>{isLoading ? "Starting login…" : "Log in with TideCloak"}</button>}
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow"><span /> COURSE REGISTRATION, WITHOUT FAVOURS</div>
          <h1>A fair place<br />in every queue.</h1>
          <p>First come, first served. Exceptions are public, reasoned, and require collective approval.</p>
        </div>
        <div className="hero-card">
          <span className="card-kicker">THE PROMISE</span>
          <strong>No single person<br />can move the line.</strong>
          <div className="avatar-stack">{state.panel.map((member, index) => <span key={member.id} className={`avatar a${index}`}>{member.name.split(" ").map((part) => part[0]).slice(-2).join("")}</span>)}</div>
          <small>Approver panel · 2 of 3 required</small>
        </div>
      </section>

      <div className="demo-warning">
        <span>DEMO MODE</span>
        TideCloak login is real when configured. The role switcher and 2-of-3 exception flow below are local simulations, not Tide-enforced authorization.
      </div>
      {initError && <div className="notice login-error" role="alert">
        TideCloak initialization failed: {initError.message}. Check that the local TideCloak server is running at localhost:8080 and that the fairenrol realm/client is configured.
      </div>}

      <section className="toolbar">
        <div>
          <label htmlFor="role">VIEW AS</label>
          <select id="role" value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="student">Student</option>
            <option value="registrar">Registrar</option>
            <option value="approver">Approver</option>
          </select>
          {role === "student" && <select aria-label="Demo student" value={studentId} onChange={(event) => setStudentId(event.target.value)}>
            {state.students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
          </select>}
          {role === "approver" && <select aria-label="Demo approver" value={activeApprover?.id ?? ""} onChange={(event) => setApproverId(event.target.value)}>
            {state.panel.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.title}</option>)}
          </select>}
        </div>
        <div className="role-hint">
          {authenticated
            ? `Tide roles: ${hasRegistrarRole ? "registrar " : ""}${hasApproverRole ? "approver" : ""}${!hasRegistrarRole && !hasApproverRole ? "student / no admin role" : ""}`
            : "Sign in to view your TideCloak identity and realm roles."}
        </div>
      </section>

      {notice && <div className="notice" role="status">{notice}<button aria-label="Dismiss notice" onClick={() => setNotice("")}>×</button></div>}

      {role === "student" && (
        <section className="section">
          <div className="section-heading"><div><div className="eyebrow">STUDENT DASHBOARD</div><h2>Your courses</h2></div><span className="count-pill">{state.courses.length} open courses</span></div>
          {ownWaitlists.length > 0 && <div className="position-card"><strong>Your waitlist positions</strong>{ownWaitlists.map(({ course, position }) => <span key={course.id}>{course.code} <b>#{position}</b></span>)}</div>}
          <div className="course-grid">
            {state.courses.map((course) => {
              const already = isAlreadyEnrolled(course, studentId);
              const position = course.waitlist.indexOf(studentId) + 1;
              const available = Math.max(0, course.capacity - course.enrolled.length);
              return <article className="course-card" key={course.id}>
                <div className="course-top"><span className="course-code">{course.code}</span><span className={available ? "seats open" : "seats full"}>{available ? `${available} seats open` : "At capacity"}</span></div>
                <h3>{course.name}</h3>
                <div className="course-stats"><span>Enrolled <b>{course.enrolled.length}/{course.capacity}</b></span><span>Waiting <b>{course.waitlist.length}</b></span></div>
                {position > 0
                  ? <div className="queue-status">You’re #{position} in the waitlist <small>Order is first come, first served.</small></div>
                  : already
                    ? <div className="queue-status enrolled">You’re enrolled <small>Your place is confirmed.</small></div>
                    : <button className="button dark full-width" onClick={() => joinCourse(course)}>{available ? "Enrol in course" : "Join waitlist"}</button>}
              </article>;
            })}
          </div>
          <div className="section-heading subheading"><div><div className="eyebrow">PUBLIC EXCEPTIONS</div><h2>Reasons that changed a queue</h2></div></div>
          <div className="reason-list">
            {state.requests.filter((request) => request.status === "approved").map((request) => <div className="reason-item" key={request.id}><span className="approved-tag">APPROVED</span><div><strong>{actionNames[request.kind]}</strong><p>{request.reason}</p></div></div>)}
            {!state.requests.some((request) => request.status === "approved") && <p className="empty">No exceptions approved. The original queue remains unchanged.</p>}
          </div>
        </section>
      )}

      {role === "registrar" && (
        <section className="section">
          <div className="section-heading"><div><div className="eyebrow">REGISTRAR DASHBOARD</div><h2>Course administration</h2></div><span className="count-pill">Course limits only</span></div>
          <div className="registrar-grid">
            {state.courses.map((course) => <article className="course-card" key={course.id}><span className="course-code">{course.code}</span><h3>{course.name}</h3><CapacityEditor course={course} actor={demoRegistrar.name} dispatch={dispatch} /><div className="course-stats"><span>Enrolled <b>{course.enrolled.length}</b></span><span>Waitlist <b>{course.waitlist.length}</b></span></div></article>)}
          </div>
          <div className="blocked-card"><div><span className="blocked-icon">⛔</span><div><strong>Override attempt demo</strong><p>Try moving a friend to the front or adding yourself to the approver panel.</p></div></div><button className="button outline" onClick={attemptRegistrarOverrides}>Attempt both overrides</button></div>
          <RequestForm {...{ state, selectedCourse, setSelectedCourse, requestKind, setRequestKind, targetStudent, setTargetStudent, reason, setReason, panelCandidate, setPanelCandidate, panelRemoval, setPanelRemoval, submitRequest }} registrar />
        </section>
      )}

      {role === "approver" && (
        <section className="section">
          <div className="section-heading"><div><div className="eyebrow">APPROVER PANEL</div><h2>Review exception requests</h2></div><span className="count-pill">{state.panel.length} panel members</span></div>
          <div className="panel-strip">{state.panel.map((member) => <div className="panel-person" key={member.id}><span className="avatar">{member.name.split(" ").map((part) => part[0]).slice(-2).join("")}</span><span><strong>{member.name}</strong><small>{member.title}</small></span></div>)}</div>
          <RequestForm {...{ state, selectedCourse, setSelectedCourse, requestKind, setRequestKind, targetStudent, setTargetStudent, reason, setReason, panelCandidate, setPanelCandidate, panelRemoval, setPanelRemoval, submitRequest }} />
          <div className="request-list">
            {state.requests.map((request) => <article className="request-card" key={request.id}>
              <div className="request-head"><div><span className="eyebrow">{actionNames[request.kind]}</span><h3>{request.kind === "panel" ? `Replace ${request.replaceMember.name} with ${request.candidate.name}` : `${request.kind === "force" ? "Enrol" : request.kind === "jump" ? "Move up" : "Remove"} ${personName(state, request.studentId)} · ${state.courses.find((course) => course.id === request.courseId)?.code}`}</h3></div><span className={`status-tag ${request.status}`}>{request.status}</span></div>
              <p className="request-reason">“{request.reason}”</p>
              <div className="vote-row"><span>{request.approvals.length} of 2 approvals</span><div className="vote-avatars">{request.approvals.map((member) => <span className="avatar mini" title={member.name} key={member.id}>{member.name.split(" ").map((part) => part[0]).slice(-2).join("")}</span>)}</div></div>
              {request.status === "pending" && <div className="request-actions">
                {request.requester === activeApprover?.name
                  ? <span className="muted">Requester cannot approve their own request</span>
                  : <button className="button approve" onClick={() => dispatch({ type: "vote", requestId: request.id, approver: activeApprover })} disabled={request.approvals.some((member) => member.id === activeApprover?.id)}>Approve as {activeApprover?.name}</button>}
                <button className="button text-button" onClick={() => dispatch({ type: "deny", requestId: request.id, actor: activeApprover?.name, reason: "The panel declined this request." })}>Deny</button>
              </div>}
            </article>)}
            {state.requests.length === 0 && <p className="empty">No open requests. Submit one above to begin the demo.</p>}
          </div>
        </section>
      )}

      <section className="section explainer">
        <div className="section-heading"><div><div className="eyebrow">WHY GOVERNANCE MATTERS</div><h2>Ordinary roles vs. collective control</h2></div></div>
        <div className="compare-grid">
          <article className="compare-card ordinary"><span>ORDINARY LOGIN + BACKEND ROLES</span><h3>The registrar could</h3><ul><li>Change queue order with an admin API call</li><li>Force-enrol a friend without a public reason</li><li>Add themselves as the only approver</li></ul><p>One trusted backend role is a single point of power.</p></article>
          <article className="compare-card tide"><span>TIDECLOAK + FAIR POLICY</span><h3>The demo blocks this</h3><ul><li>Queue position is assigned in FIFO order</li><li>Exceptions show their reason in the public log</li><li>Two different panel members must approve</li></ul><p>Real TideCloak login is wired; business-action quorum below is simulated and needs a Tide policy integration.</p></article>
        </div>
      </section>

      <section className="section audit-section">
        <div className="section-heading"><div><div className="eyebrow">TRANSPARENT BY DEFAULT</div><h2>Public audit log</h2></div><span className="count-pill">{state.audit.length} events</span></div>
        <div className="audit-list">
          {state.audit.map((entry) => <div className="audit-row" key={entry.id}><time>{new Date(entry.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><span className="audit-dot" /><div><strong>{entry.action}</strong><p>{entry.reason}</p></div><span className="audit-actor">{entry.actor}</span></div>)}
          {state.audit.length === 0 && <p className="empty">Actions, approvals, denials and blocked attempts will appear here.</p>}
        </div>
      </section>

      <footer><span>FairEnrol · Synthetic data only</span><span>Demo build · no university systems connected</span></footer>
    </main>
  );
}

function RequestForm(props) {
  const { state, selectedCourse, setSelectedCourse, requestKind, setRequestKind, targetStudent, setTargetStudent, reason, setReason, panelCandidate, setPanelCandidate, panelRemoval, setPanelRemoval, submitRequest, registrar = false } = props;
  const candidates = [...state.students.filter((student) => !state.panel.some((member) => member.id === student.id))
    .slice(0, 5).map((student) => ({ ...student, title: "Student representative" })), demoRegistrar];

  return <form className="request-form" onSubmit={submitRequest}>
    <div className="form-title"><div><div className="eyebrow">{registrar ? "REQUEST AN EXCEPTION" : "NEW PROTECTED REQUEST"}</div><h3>Ask the panel to review</h3></div><span className="approval-badge">2 of 3 required</span></div>
    <div className="form-grid">
      <label>Action<select value={requestKind} onChange={(event) => setRequestKind(event.target.value)}>{Object.entries(actionNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {requestKind !== "panel" && <>
        <label>Course<select value={selectedCourse} onChange={(event) => setSelectedCourse(event.target.value)}>{state.courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.name}</option>)}</select></label>
        <label>Student<select value={targetStudent} onChange={(event) => setTargetStudent(event.target.value)}>{state.students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select></label>
      </>}
      {requestKind === "panel" && <>
        <label>Replace panel member<select value={panelRemoval} onChange={(event) => setPanelRemoval(event.target.value)}>{state.panel.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        <label>With new member<select value={panelCandidate} onChange={(event) => setPanelCandidate(event.target.value)}>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
      </>}
      <label className="reason-field">Public reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={240} placeholder="State the reason; this will be public." /></label>
    </div>
    <div className="form-footer"><span>Requester cannot approve their own request.</span><button className="button dark" type="submit">Submit public request</button></div>
  </form>;
}

function CapacityEditor({ course, actor, dispatch }) {
  const [capacity, setCapacity] = useState(String(course.capacity));
  useEffect(() => setCapacity(String(course.capacity)), [course.capacity]);

  function save(event) {
    event.preventDefault();
    dispatch({ type: "capacity", courseId: course.id, capacity, actor });
  }

  return <form className="capacity-label" onSubmit={save}>
    <label htmlFor={`capacity-${course.id}`}>Seat limit</label>
    <input id={`capacity-${course.id}`} type="number" min="1" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
    <button className="button quiet" type="submit">Save</button>
  </form>;
}
