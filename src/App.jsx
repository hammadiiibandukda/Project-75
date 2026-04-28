import { useState, useEffect, useRef } from "react";

/* ───────────── Constants ───────────── */
const STORAGE_KEY = "project75_v2";
const LEGACY_WEIGHT_KEY = "weight_journey_v1";
const LEGACY_WORKOUT_KEY = "workout_journey_v1";

const TEAL = "#0d9488";
const TEAL_LIGHT = "#99f6e4";
const BG = "#0a0f0e";
const CARD = "#111918";
const BORDER = "#1e2e2b";
const RED = "#f87171";
const GREEN = "#4ade80";

const EXERCISES = ["Treadmill", "Elliptical", "Stair Climb", "Cycling", "Walking", "Running", "Rowing", "Other"];

const DEFAULT_CHECKLIST = [
  { id: "workout1", icon: "💪", label: "Workout (45+ min)" },
  { id: "outdoor",  icon: "🌳", label: "Outdoor activity" },
  { id: "water",    icon: "💧", label: "Water (1 gallon)" },
  { id: "reading",  icon: "📖", label: "Read 10 pages" },
  { id: "diet",     icon: "🥗", label: "Stay on diet" },
  { id: "photo",    icon: "📸", label: "Progress photo" },
];

const DEFAULT_PROFILE = {
  name: "",
  startDate: todayStr(),
  startWeight: 87,
  goalWeight: 70,
  unit: "kg",
  durationDays: 75,
};

/* ───────────── Helpers ───────────── */
function todayStr() { return new Date().toISOString().split("T")[0]; }
function ymdFromDate(d) { return d.toISOString().split("T")[0]; }
function parseYmd(s) { return new Date(s + "T00:00:00"); }
function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }
function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymdFromDate(d);
}
function fmtDate(s) {
  return parseYmd(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtShort(s) {
  return parseYmd(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ───────────── Persistence + migration ───────────── */
function hydrateState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch {}
  // Migrate from legacy v1 keys (existing weight + workout data)
  let weights = [], workouts = [];
  try { weights = JSON.parse(localStorage.getItem(LEGACY_WEIGHT_KEY) || "[]"); } catch {}
  try { workouts = JSON.parse(localStorage.getItem(LEGACY_WORKOUT_KEY) || "[]"); } catch {}
  return {
    v: 2,
    profile: { ...DEFAULT_PROFILE },
    weights,
    workouts,
    days: {},
    checklist: DEFAULT_CHECKLIST.map(x => ({ ...x })),
  };
}
function migrate(s) {
  if (!s || typeof s !== "object") s = {};
  s.v = 2;
  s.profile = { ...DEFAULT_PROFILE, ...(s.profile || {}) };
  s.weights = Array.isArray(s.weights) ? s.weights : [];
  s.workouts = Array.isArray(s.workouts) ? s.workouts : [];
  s.days = (s.days && typeof s.days === "object") ? s.days : {};
  s.checklist = Array.isArray(s.checklist) && s.checklist.length
    ? s.checklist
    : DEFAULT_CHECKLIST.map(x => ({ ...x }));
  return s;
}
function persist(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

/* ───────────── Image compression ───────────── */
function compressImage(file, maxDim = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const c = document.createElement("canvas");
        c.width = width; c.height = height;
        c.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ═════════════════════ APP ═════════════════════ */
export default function App() {
  const [state, setState] = useState(() => hydrateState());
  const [tab, setTab] = useState("today");
  const [toast, setToast] = useState("");

  useEffect(() => persist(state), [state]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  };

  /* ─── Derived ─── */
  const { profile, weights, workouts, days, checklist } = state;
  const sortedW = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sortedW.length ? sortedW[sortedW.length - 1].weight : profile.startWeight;
  const lost = round1(profile.startWeight - latest);
  const remaining = round1(latest - profile.goalWeight);
  const totalSpan = profile.startWeight - profile.goalWeight;
  const pct = totalSpan > 0 ? Math.min(100, Math.max(0, (lost / totalSpan) * 100)) : 0;
  const totalMins = workouts.reduce((s, e) => s + (e.total || 0), 0);

  const dayNumber = clamp(daysBetween(profile.startDate, todayStr()) + 1, 0, profile.durationDays);
  const journeyPct = clamp(((dayNumber - 1) / profile.durationDays) * 100, 0, 100);

  /* ─── Day records ─── */
  const dayRec = (dkey) => days[dkey] || { tasks: {}, photo: null, note: "" };
  const isComplete = (dkey) => {
    const rec = days[dkey];
    if (!rec) return false;
    return checklist.every(t => rec.tasks?.[t.id]);
  };
  const isPartial = (dkey) => {
    const rec = days[dkey];
    return !!rec && Object.values(rec.tasks || {}).some(Boolean) && !isComplete(dkey);
  };
  const streak = (() => {
    let n = 0;
    for (let i = dayNumber - 1; i >= 0; i--) {
      const k = addDays(profile.startDate, i);
      if (isComplete(k)) n++; else break;
    }
    return n;
  })();

  /* ─── State mutators ─── */
  const updateProfile = (patch) =>
    setState(s => ({ ...s, profile: { ...s.profile, ...patch } }));

  const setDay = (dkey, patch) =>
    setState(s => ({
      ...s,
      days: { ...s.days, [dkey]: { ...dayRec(dkey), ...patch, tasks: { ...dayRec(dkey).tasks, ...(patch.tasks || {}) } } }
    }));

  const toggleTask = (dkey, taskId) => {
    const cur = !!dayRec(dkey).tasks?.[taskId];
    setDay(dkey, { tasks: { [taskId]: !cur } });
  };

  /* ─── Weight + workout actions (preserved from v1) ─── */
  const addWeight = (date, weight) => {
    const w = parseFloat(weight);
    if (!weight || isNaN(w) || w < 30 || w > 300) return showToast("Enter a valid weight");
    setState(s => ({
      ...s,
      weights: [...s.weights.filter(e => e.date !== date), { date, weight: w }],
    }));
    showToast(`Logged ${w} ${profile.unit}`);
  };
  const delWeight = (date) =>
    setState(s => ({ ...s, weights: s.weights.filter(e => e.date !== date) }));

  const addWorkout = (date, exercises) => {
    const valid = exercises.filter(ex => ex.minutes && !isNaN(parseInt(ex.minutes)) && parseInt(ex.minutes) > 0);
    if (!valid.length) return showToast("Add at least one exercise");
    const entry = {
      id: Date.now(),
      date,
      exercises: valid.map(ex => ({ type: ex.type, minutes: parseInt(ex.minutes) })),
      total: valid.reduce((s, ex) => s + parseInt(ex.minutes), 0),
    };
    setState(s => ({ ...s, workouts: [...s.workouts, entry] }));
    showToast("Workout logged");
  };
  const delWorkout = (id) =>
    setState(s => ({ ...s, workouts: s.workouts.filter(e => e.id !== id) }));

  /* ─── Photo + checklist mutators ─── */
  const setPhoto = async (dkey, file) => {
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      setDay(dkey, { photo: dataUrl, tasks: { photo: true } });
      showToast("Photo saved");
    } catch {
      showToast("Photo failed");
    }
  };
  const removePhoto = (dkey) => setDay(dkey, { photo: null });

  const updateChecklist = (newList) =>
    setState(s => ({ ...s, checklist: newList }));

  /* ─── Export / import / wipe ─── */
  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `project75-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Backup downloaded");
  };
  const importData = async (file) => {
    if (!file) return;
    try {
      const txt = await file.text();
      const parsed = JSON.parse(txt);
      if (!parsed.profile) throw new Error("invalid");
      if (!confirm("Replace all current data with the imported file?")) return;
      setState(migrate(parsed));
      showToast("Data imported");
    } catch {
      showToast("Invalid backup file");
    }
  };
  const wipeAll = () => {
    if (!confirm("Erase ALL data? Cannot be undone.")) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_WEIGHT_KEY);
    localStorage.removeItem(LEGACY_WORKOUT_KEY);
    setState(hydrateState());
    showToast("Wiped");
  };

  /* ─── CSS (single tag, never re-renders) ─── */
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
    * { box-sizing: border-box; }
    body { margin:0; }
    input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
    input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.7) sepia(1) saturate(2) hue-rotate(130deg); }
    .btn { background:${TEAL};color:#fff;border:none;padding:10px 20px;font-family:inherit;font-size:13px;font-weight:500;cursor:pointer;border-radius:6px;transition:opacity .15s,transform .1s;letter-spacing:.04em; }
    .btn:hover { opacity:.85;transform:translateY(-1px); }
    .btn:disabled { opacity:.4;cursor:not-allowed;transform:none; }
    .btn-ghost { background:transparent;border:1px solid ${BORDER};color:#4a6e6a;padding:8px 14px;font-family:inherit;font-size:12px;cursor:pointer;border-radius:6px;transition:all .15s; }
    .btn-ghost:hover { border-color:${TEAL};color:${TEAL_LIGHT}; }
    .btn-sm { background:transparent;border:1px solid #2a3d39;color:#5a7a76;padding:4px 10px;font-family:inherit;font-size:11px;cursor:pointer;border-radius:4px;transition:all .15s; }
    .btn-sm:hover { border-color:${RED};color:${RED}; }
    .btn-confirm { background:#3d1010;border:1px solid #e05050;color:${RED};padding:4px 10px;font-family:inherit;font-size:11px;cursor:pointer;border-radius:4px; }
    .btn-danger { background:#3d1010;border:1px solid #e05050;color:${RED};padding:9px 16px;font-family:inherit;font-size:12px;cursor:pointer;border-radius:6px; }
    .ifield { background:#0f1a18;border:1px solid ${BORDER};color:#e2f0ee;padding:9px 12px;font-family:inherit;font-size:13px;border-radius:6px;outline:none;transition:border-color .15s;width:100%; }
    .ifield:focus { border-color:${TEAL}; }
    select.ifield { cursor:pointer; }
    .tab { padding:9px 14px;font-family:inherit;font-size:11px;cursor:pointer;border:none;background:transparent;letter-spacing:.08em;transition:all .15s;border-bottom:2px solid transparent;text-transform:uppercase;white-space:nowrap; }
    .rh:hover { background:#161f1e !important; }
    .flash { animation:fa 1.5s ease forwards; }
    @keyframes fa { 0%{opacity:0;transform:translateY(-4px)} 20%{opacity:1;transform:translateY(0)} 80%{opacity:1} 100%{opacity:0} }
    .checkrow { display:flex;align-items:center;gap:12px;padding:13px 14px;border-radius:8px;cursor:pointer;transition:background .15s;user-select:none; }
    .checkrow:hover { background:#161f1e; }
    .check { flex-shrink:0;width:24px;height:24px;border-radius:6px;border:1.5px solid ${BORDER};display:grid;place-items:center;font-size:12px;font-weight:700;color:transparent;transition:all .15s; }
    .checkrow.done .check { background:${TEAL};border-color:${TEAL};color:#fff; }
    .checkrow.done .ctxt { color:#4a6e6a;text-decoration:line-through; }
    .calday { aspect-ratio:1;border-radius:6px;background:#0f1a18;border:1px solid ${BORDER};display:grid;place-items:center;font-size:11px;font-weight:500;color:#4a6e6a;position:relative; }
    .calday.complete { background:${TEAL};color:#fff;border-color:transparent; }
    .calday.partial { border-color:${TEAL};color:${TEAL_LIGHT}; }
    .calday.today { outline:1.5px solid ${TEAL_LIGHT};outline-offset:1px; }
    .calday.future { opacity:.4; }
    .calday.has-photo::after { content:'';position:absolute;top:3px;right:3px;width:5px;height:5px;border-radius:50%;background:${TEAL_LIGHT}; }
    .toastbox { position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:${CARD};border:1px solid ${TEAL};color:${TEAL_LIGHT};padding:10px 18px;border-radius:99px;font-size:12px;font-family:inherit;z-index:99;box-shadow:0 4px 16px rgba(0,0,0,.5); }
    @media (max-width:480px) {
      .tabs-bar { overflow-x:auto;scrollbar-width:none; }
      .tabs-bar::-webkit-scrollbar { display:none; }
    }
  `;

  /* ═══════════ RENDER ═══════════ */
  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#e2f0ee", fontFamily: "'DM Mono','Courier New',monospace", padding: "20px 14px 60px" }}>
      <style>{css}</style>
      <div style={{ maxWidth: 580, margin: "0 auto" }}>

        {/* Header */}
        <Header profile={profile} dayNumber={dayNumber} streak={streak} />

        {/* Stats */}
        <Stats latest={latest} lost={lost} remaining={remaining} workouts={workouts} totalMins={totalMins} unit={profile.unit} />

        {/* Goal progress bar */}
        <ProgressBar label="Weight goal" value={pct} startLabel={`${profile.startWeight} ${profile.unit}`} endLabel={`${profile.goalWeight} ${profile.unit}`} />

        {/* Journey progress bar */}
        <ProgressBar label={`Day ${dayNumber} of ${profile.durationDays}`} value={journeyPct} startLabel="Day 1" endLabel={`Day ${profile.durationDays}`} />

        {/* Tabs */}
        <div className="tabs-bar" style={{ display: "flex", borderBottom: `1px solid ${BORDER}`, marginBottom: 18, marginTop: 10 }}>
          {[
            ["today",    "✓ Today"],
            ["weight",   "⚖ Weight"],
            ["workout",  "🏃 Workout"],
            ["calendar", "📅 75 Days"],
            ["settings", "⚙ Settings"],
          ].map(([k, l]) => (
            <button key={k} className="tab" onClick={() => setTab(k)}
              style={{ color: tab === k ? TEAL_LIGHT : "#4a6e6a", borderBottomColor: tab === k ? TEAL : "transparent" }}>
              {l}
            </button>
          ))}
        </div>

        {tab === "today"    && <TodayTab dkey={todayStr()} dayNumber={dayNumber} dayRec={dayRec(todayStr())} checklist={checklist} toggleTask={toggleTask} setPhoto={setPhoto} removePhoto={removePhoto} addWeight={addWeight} unit={profile.unit} setDay={setDay} />}
        {tab === "weight"   && <WeightTab profile={profile} weights={weights} sortedW={sortedW} addWeight={addWeight} delWeight={delWeight} />}
        {tab === "workout"  && <WorkoutTab workouts={workouts} totalMins={totalMins} addWorkout={addWorkout} delWorkout={delWorkout} />}
        {tab === "calendar" && <CalendarTab profile={profile} days={days} dayNumber={dayNumber} isComplete={isComplete} isPartial={isPartial} />}
        {tab === "settings" && <SettingsTab profile={profile} updateProfile={updateProfile} checklist={checklist} updateChecklist={updateChecklist} exportData={exportData} importData={importData} wipeAll={wipeAll} />}

      </div>
      {toast && <div className="toastbox">{toast}</div>}
    </div>
  );
}

/* ═════════════════════ COMPONENTS ═════════════════════ */

function Header({ profile, dayNumber, streak }) {
  const greeting = profile.name ? `${profile.name}'s journey` : "Weight Loss Journey";
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.15em", color: TEAL, textTransform: "uppercase", marginBottom: 5 }}>
        {greeting}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 800, margin: 0, color: "#fff", lineHeight: 1.1 }}>
          {profile.startWeight} → {profile.goalWeight} {profile.unit}
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Pill label="Day" value={`${dayNumber}/${profile.durationDays}`} />
          <Pill label="Streak" value={`${streak} 🔥`} accent />
        </div>
      </div>
    </div>
  );
}

function Pill({ label, value, accent }) {
  return (
    <div style={{
      background: accent ? "#0a2e2a" : CARD,
      border: `1px solid ${accent ? "#0d4a3a" : BORDER}`,
      borderRadius: 99,
      padding: "5px 12px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      lineHeight: 1.1,
    }}>
      <span style={{ fontSize: 8, color: "#4a6e6a", letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: accent ? TEAL_LIGHT : "#e2f0ee", marginTop: 1 }}>{value}</span>
    </div>
  );
}

function Stats({ latest, lost, remaining, workouts, totalMins, unit }) {
  const items = [
    { label: "Current", value: `${latest} ${unit}` },
    { label: "Lost", value: lost > 0 ? `−${lost} ${unit}` : `0 ${unit}`, green: lost > 0 },
    { label: "To Go", value: remaining > 0 ? `${remaining} ${unit}` : "🎯 Done!" },
    { label: "Sessions", value: workouts.length, sub: `${totalMins} min` },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
      {items.map(s => (
        <div key={s.label} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 9px" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.12em", color: "#4a6e6a", textTransform: "uppercase", marginBottom: 3 }}>{s.label}</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: s.green ? TEAL_LIGHT : "#e2f0ee" }}>{s.value}</div>
          {s.sub && <div style={{ fontSize: 10, color: "#4a6e6a", marginTop: 2 }}>{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function ProgressBar({ label, value, startLabel, endLabel }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#4a6e6a", marginBottom: 4 }}>
        <span>{label}</span><span>{value.toFixed(1)}%</span>
      </div>
      <div style={{ height: 6, background: "#1a2e2a", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${value}%`, background: `linear-gradient(90deg,${TEAL},${TEAL_LIGHT})`, borderRadius: 99, transition: "width 0.5s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#2e4e4a", marginTop: 2 }}>
        <span>{startLabel}</span><span>{endLabel}</span>
      </div>
    </div>
  );
}

/* ─── Today Tab ─── */
function TodayTab({ dkey, dayNumber, dayRec, checklist, toggleTask, setPhoto, removePhoto, addWeight, unit, setDay }) {
  const [wVal, setWVal] = useState("");
  const fileRef = useRef();
  const completed = checklist.filter(t => dayRec.tasks?.[t.id]).length;

  return (
    <>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "#4a6e6a", textTransform: "uppercase" }}>
            Day {dayNumber} · {fmtDate(dkey)}
          </div>
          <div style={{ fontSize: 11, color: TEAL_LIGHT }}>{completed}/{checklist.length}</div>
        </div>
        {checklist.length === 0 && <div style={{ color: "#4a6e6a", fontSize: 13, padding: 8 }}>No checklist items. Add some in Settings.</div>}
        {checklist.map(t => {
          const done = !!dayRec.tasks?.[t.id];
          return (
            <div key={t.id} className={"checkrow" + (done ? " done" : "")} onClick={() => toggleTask(dkey, t.id)}>
              <span className="check">✓</span>
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              <span className="ctxt" style={{ flex: 1, fontSize: 13, color: "#e2f0ee" }}>{t.label}</span>
            </div>
          );
        })}
      </div>

      {/* Quick weight log */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "#4a6e6a", textTransform: "uppercase", marginBottom: 10 }}>
          Quick weigh-in
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input type="number" className="ifield" placeholder={`Weight (${unit})`} value={wVal}
            onChange={e => setWVal(e.target.value)}
            onKeyDown={e => e.key === "Enter" && (addWeight(dkey, wVal), setWVal(""))}
            step="0.1" min="30" max="300" style={{ flex: 1 }} />
          <button className="btn" onClick={() => { addWeight(dkey, wVal); setWVal(""); }}>Log</button>
        </div>
      </div>

      {/* Photo */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "#4a6e6a", textTransform: "uppercase", marginBottom: 10 }}>
          Progress photo
        </div>
        {dayRec.photo ? (
          <>
            <img src={dayRec.photo} alt="Today" style={{ width: "100%", borderRadius: 6, border: `1px solid ${BORDER}`, display: "block" }} />
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button className="btn-ghost" onClick={() => fileRef.current?.click()}>Replace</button>
              <button className="btn-sm" onClick={() => removePhoto(dkey)}>Remove</button>
            </div>
          </>
        ) : (
          <button className="btn-ghost" onClick={() => fileRef.current?.click()}>📷 Add photo</button>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) setPhoto(dkey, f); e.target.value = ""; }} />
      </div>

      {/* Note */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "#4a6e6a", textTransform: "uppercase", marginBottom: 10 }}>
          Today's note
        </div>
        <textarea className="ifield" rows={3} placeholder="How did today go? Wins, struggles, observations..."
          value={dayRec.note || ""}
          onChange={e => setDay(dkey, { note: e.target.value })}
          style={{ resize: "vertical", fontFamily: "inherit" }} />
      </div>
    </>
  );
}

/* ─── Weight Tab (preserved chart from v1) ─── */
function WeightTab({ profile, weights, sortedW, addWeight, delWeight }) {
  const [wDate, setWDate] = useState(todayStr());
  const [wVal, setWVal] = useState("");
  const [wDelConfirm, setWDelConfirm] = useState(null);

  const chartEntries = sortedW.slice(-12);
  const allW = [profile.startWeight, profile.goalWeight, ...chartEntries.map(e => e.weight)];
  const minW = Math.min(...allW) - 1, maxW = Math.max(...allW) + 1;
  const W = 480, H = 160, PAD = { t: 16, r: 20, b: 32, l: 36 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
  const toX = (i, n) => PAD.l + (n <= 1 ? cW / 2 : (i / (n - 1)) * cW);
  const toY = (w) => PAD.t + cH - ((w - minW) / (maxW - minW)) * cH;
  const goalY = toY(profile.goalWeight);
  const polyline = chartEntries.length > 1
    ? chartEntries.map((e, i) => `${toX(i, chartEntries.length)},${toY(e.weight)}`).join(" ")
    : "";
  const weekChange = sortedW.length >= 2
    ? round1(sortedW[sortedW.length - 1].weight - sortedW[sortedW.length - 2].weight)
    : null;

  return (
    <>
      {chartEntries.length >= 2 && (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "14px 8px 8px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "#4a6e6a", textTransform: "uppercase", marginBottom: 8, paddingLeft: 8 }}>Weight trend</div>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
            {[0, .25, .5, .75, 1].map(f => {
              const y = PAD.t + f * cH, w = maxW - f * (maxW - minW);
              return <g key={f}>
                <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#1a2e2a" strokeWidth="1" />
                <text x={PAD.l - 4} y={y + 4} textAnchor="end" fill="#2e4e4a" fontSize="9">{w.toFixed(0)}</text>
              </g>;
            })}
            <line x1={PAD.l} y1={goalY} x2={W - PAD.r} y2={goalY} stroke={TEAL} strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
            <text x={W - PAD.r + 2} y={goalY + 4} fill={TEAL} fontSize="8" opacity="0.7">goal</text>
            <polyline points={polyline} fill="none" stroke={TEAL} strokeWidth="2" strokeLinejoin="round" />
            {chartEntries.map((e, i) => <circle key={e.date} cx={toX(i, chartEntries.length)} cy={toY(e.weight)} r="3.5" fill={BG} stroke={TEAL} strokeWidth="2" />)}
            {chartEntries.map((e, i) => {
              if (chartEntries.length > 6 && i % 2 !== 0) return null;
              return <text key={e.date} x={toX(i, chartEntries.length)} y={H - 4} textAnchor="middle" fill="#2e4e4a" fontSize="8">{fmtShort(e.date)}</text>;
            })}
          </svg>
        </div>
      )}

      {weekChange !== null && (
        <div style={{ marginBottom: 12 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: weekChange < 0 ? "#0a2e1e" : weekChange > 0 ? "#2e0a0a" : "#1a2e2a",
            border: `1px solid ${weekChange < 0 ? "#0d4a2e" : weekChange > 0 ? "#4a0d0d" : BORDER}`,
            borderRadius: 20, padding: "4px 12px", fontSize: 12,
          }}>
            <span>{weekChange < 0 ? "↓" : weekChange > 0 ? "↑" : "→"}</span>
            <span style={{ color: weekChange < 0 ? GREEN : weekChange > 0 ? RED : "#4a6e6a" }}>
              {weekChange > 0 ? "+" : ""}{weekChange} {profile.unit} from previous
            </span>
          </div>
        </div>
      )}

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "#4a6e6a", textTransform: "uppercase", marginBottom: 10 }}>Log weigh-in</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input type="date" className="ifield" value={wDate} onChange={e => setWDate(e.target.value)} style={{ flex: "1 1 130px" }} />
          <input type="number" className="ifield" placeholder={`Weight (${profile.unit})`} value={wVal}
            onChange={e => setWVal(e.target.value)}
            onKeyDown={e => e.key === "Enter" && (addWeight(wDate, wVal), setWVal(""))}
            step="0.1" min="30" max="300" style={{ flex: "1 1 110px" }} />
          <button className="btn" onClick={() => { addWeight(wDate, wVal); setWVal(""); }}>Log</button>
        </div>
      </div>

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "11px 16px", borderBottom: `1px solid ${BORDER}`, fontSize: 10, letterSpacing: "0.12em", color: "#4a6e6a", textTransform: "uppercase" }}>
          History · {weights.length} {weights.length === 1 ? "entry" : "entries"}
        </div>
        {sortedW.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#2e4e4a", fontSize: 13 }}>No weigh-ins yet.</div>}
        {[...sortedW].reverse().map((e, i, arr) => {
          const prev = arr[i + 1];
          const diff = prev ? round1(e.weight - prev.weight) : null;
          const isCon = wDelConfirm === e.date;
          return (
            <div key={e.date} className="rh" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: `1px solid ${BORDER}`, transition: "background .15s" }}>
              <div>
                <div style={{ fontSize: 13, color: "#b0ceca" }}>{fmtDate(e.date)}</div>
                {diff !== null && <div style={{ fontSize: 11, color: diff < 0 ? GREEN : diff > 0 ? RED : "#4a6e6a", marginTop: 2 }}>{diff > 0 ? "+" : ""}{diff} {profile.unit} from prev</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 17, fontWeight: 500 }}>{e.weight} <span style={{ fontSize: 11, color: "#4a6e6a" }}>{profile.unit}</span></span>
                {isCon
                  ? <button className="btn-confirm" onClick={() => { delWeight(e.date); setWDelConfirm(null); }}>Confirm?</button>
                  : <button className="btn-sm" onClick={() => setWDelConfirm(e.date)}>✕</button>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ─── Workout Tab ─── */
function WorkoutTab({ workouts, totalMins, addWorkout, delWorkout }) {
  const [woDate, setWoDate] = useState(todayStr());
  const [exercises, setExercises] = useState([{ type: "Treadmill", minutes: "" }]);
  const [woDelConfirm, setWoDelConfirm] = useState(null);
  const sortedWo = [...workouts].sort((a, b) => b.date.localeCompare(a.date));

  const addRow = () => setExercises([...exercises, { type: "Treadmill", minutes: "" }]);
  const removeRow = (i) => setExercises(exercises.filter((_, idx) => idx !== i));
  const updateRow = (i, field, val) => setExercises(exercises.map((ex, idx) => idx === i ? { ...ex, [field]: val } : ex));
  const submit = () => { addWorkout(woDate, exercises); setExercises([{ type: "Treadmill", minutes: "" }]); };

  return (
    <>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "#4a6e6a", textTransform: "uppercase", marginBottom: 10 }}>Log workout</div>
        <input type="date" className="ifield" value={woDate} onChange={e => setWoDate(e.target.value)} style={{ marginBottom: 10 }} />
        {exercises.map((ex, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <select className="ifield" value={ex.type} onChange={e => updateRow(i, "type", e.target.value)} style={{ flex: 2 }}>
              {EXERCISES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <input type="number" className="ifield" placeholder="min" value={ex.minutes}
              onChange={e => updateRow(i, "minutes", e.target.value)} min="1" max="300"
              style={{ flex: 1, minWidth: 60 }} />
            {exercises.length > 1 && <button className="btn-sm" onClick={() => removeRow(i)} style={{ flexShrink: 0 }}>✕</button>}
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button className="btn-ghost" onClick={addRow}>+ Add exercise</button>
          <button className="btn" onClick={submit}>Log Session</button>
        </div>
      </div>

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "11px 16px", borderBottom: `1px solid ${BORDER}`, fontSize: 10, letterSpacing: "0.12em", color: "#4a6e6a", textTransform: "uppercase" }}>
          Sessions · {workouts.length} logged · {totalMins} min total
        </div>
        {sortedWo.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#2e4e4a", fontSize: 13 }}>No workouts yet.</div>}
        {sortedWo.map(wo => {
          const isCon = woDelConfirm === wo.id;
          return (
            <div key={wo.id} className="rh" style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, transition: "background .15s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#b0ceca", marginBottom: 6 }}>{fmtDate(wo.date)}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {wo.exercises.map((ex, i) => (
                      <span key={i} style={{ background: "#0a2e2a", border: "1px solid #0d4a3a", borderRadius: 4, padding: "3px 8px", fontSize: 11, color: TEAL_LIGHT }}>
                        {ex.type} · {ex.minutes}m
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0, marginLeft: 12 }}>
                  <span style={{ fontSize: 16, fontWeight: 500 }}>{wo.total}<span style={{ fontSize: 11, color: "#4a6e6a" }}> min</span></span>
                  {isCon
                    ? <button className="btn-confirm" onClick={() => { delWorkout(wo.id); setWoDelConfirm(null); }}>Confirm?</button>
                    : <button className="btn-sm" onClick={() => setWoDelConfirm(wo.id)}>✕</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ─── Calendar Tab ─── */
function CalendarTab({ profile, days, dayNumber, isComplete, isPartial }) {
  const today = todayStr();
  const cells = [];
  for (let i = 0; i < profile.durationDays; i++) {
    const k = addDays(profile.startDate, i);
    const inFuture = parseYmd(k) > new Date();
    const cls = ["calday"];
    if (k === today) cls.push("today");
    if (isComplete(k)) cls.push("complete");
    else if (isPartial(k)) cls.push("partial");
    if (inFuture) cls.push("future");
    if (days[k]?.photo) cls.push("has-photo");
    cells.push({ key: k, day: i + 1, cls: cls.join(" "), photo: days[k]?.photo });
  }

  const photos = Object.entries(days)
    .filter(([_, r]) => r.photo)
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "#4a6e6a", textTransform: "uppercase", marginBottom: 12 }}>
          {profile.durationDays}-day journey · started {fmtDate(profile.startDate)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 5 }}>
          {cells.map(c => (
            <div key={c.key} className={c.cls} title={`Day ${c.day} · ${fmtDate(c.key)}`}>
              {c.day}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 10, color: "#4a6e6a", flexWrap: "wrap" }}>
          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: TEAL, marginRight: 5 }}></span>Complete</span>
          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, border: `1px solid ${TEAL}`, marginRight: 5 }}></span>Partial</span>
          <span><span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: TEAL_LIGHT, marginRight: 5 }}></span>Photo</span>
        </div>
      </div>

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "11px 16px", borderBottom: `1px solid ${BORDER}`, fontSize: 10, letterSpacing: "0.12em", color: "#4a6e6a", textTransform: "uppercase" }}>
          Photo gallery · {photos.length}
        </div>
        {photos.length === 0
          ? <div style={{ padding: 24, textAlign: "center", color: "#2e4e4a", fontSize: 13 }}>No progress photos yet.</div>
          : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 6, padding: 12 }}>
              {photos.map(([d, r]) => {
                const dn = daysBetween(profile.startDate, d) + 1;
                return (
                  <div key={d} style={{ position: "relative", aspectRatio: 1, borderRadius: 6, overflow: "hidden", border: `1px solid ${BORDER}` }}>
                    <img src={r.photo} alt={`Day ${dn}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <span style={{ position: "absolute", bottom: 4, left: 4, background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 3 }}>Day {dn}</span>
                  </div>
                );
              })}
            </div>}
      </div>
    </>
  );
}

/* ─── Settings Tab ─── */
function SettingsTab({ profile, updateProfile, checklist, updateChecklist, exportData, importData, wipeAll }) {
  const importRef = useRef();

  const moveItem = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= checklist.length) return;
    const list = [...checklist];
    [list[i], list[j]] = [list[j], list[i]];
    updateChecklist(list);
  };
  const updateItem = (i, patch) => {
    const list = checklist.map((it, idx) => idx === i ? { ...it, ...patch } : it);
    updateChecklist(list);
  };
  const removeItem = (i) => updateChecklist(checklist.filter((_, idx) => idx !== i));
  const addItem = () => updateChecklist([...checklist, {
    id: `c_${Date.now()}`, icon: "✨", label: "New task",
  }]);
  const resetChecklist = () => {
    if (confirm("Reset checklist to defaults? Your daily check-ins are preserved.")) {
      updateChecklist(DEFAULT_CHECKLIST.map(x => ({ ...x })));
    }
  };

  return (
    <>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "#4a6e6a", textTransform: "uppercase", marginBottom: 12 }}>Profile</div>
        <div style={{ display: "grid", gap: 10 }}>
          <Field label="Name">
            <input className="ifield" value={profile.name} onChange={e => updateProfile({ name: e.target.value })} placeholder="Your name" maxLength="40" />
          </Field>
          <Field label="Start date">
            <input type="date" className="ifield" value={profile.startDate} onChange={e => updateProfile({ startDate: e.target.value })} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Start weight">
              <input type="number" step="0.1" className="ifield" value={profile.startWeight} onChange={e => updateProfile({ startWeight: parseFloat(e.target.value) || 0 })} />
            </Field>
            <Field label="Goal weight">
              <input type="number" step="0.1" className="ifield" value={profile.goalWeight} onChange={e => updateProfile({ goalWeight: parseFloat(e.target.value) || 0 })} />
            </Field>
            <Field label="Unit">
              <select className="ifield" value={profile.unit} onChange={e => updateProfile({ unit: e.target.value })}>
                <option value="kg">kg</option>
                <option value="lbs">lbs</option>
              </select>
            </Field>
          </div>
          <Field label="Journey length (days)">
            <input type="number" className="ifield" value={profile.durationDays} onChange={e => updateProfile({ durationDays: parseInt(e.target.value) || 75 })} min="1" max="365" />
          </Field>
        </div>
      </div>

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "#4a6e6a", textTransform: "uppercase" }}>Daily checklist</div>
          <button className="btn-ghost" onClick={resetChecklist}>Reset to defaults</button>
        </div>
        {checklist.map((item, i) => (
          <div key={item.id} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
            <input className="ifield" value={item.icon} onChange={e => updateItem(i, { icon: e.target.value })} maxLength="2" style={{ width: 50, textAlign: "center", flexShrink: 0 }} />
            <input className="ifield" value={item.label} onChange={e => updateItem(i, { label: e.target.value })} placeholder="Task" style={{ flex: 1 }} />
            <button className="btn-sm" onClick={() => moveItem(i, -1)} disabled={i === 0} style={{ flexShrink: 0 }}>↑</button>
            <button className="btn-sm" onClick={() => moveItem(i, 1)} disabled={i === checklist.length - 1} style={{ flexShrink: 0 }}>↓</button>
            <button className="btn-sm" onClick={() => removeItem(i)} style={{ flexShrink: 0 }}>✕</button>
          </div>
        ))}
        <button className="btn-ghost" onClick={addItem} style={{ marginTop: 4 }}>+ Add task</button>
      </div>

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "#4a6e6a", textTransform: "uppercase", marginBottom: 12 }}>Backup</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn-ghost" onClick={exportData}>⬇ Export JSON</button>
          <button className="btn-ghost" onClick={() => importRef.current?.click()}>⬆ Import JSON</button>
          <input ref={importRef} type="file" accept="application/json" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ""; }} />
        </div>
        <div style={{ fontSize: 11, color: "#4a6e6a", marginTop: 10 }}>
          All data is stored locally in your browser. Export to back up across devices.
        </div>
      </div>

      <div style={{ background: CARD, border: `1px solid ${RED}40`, borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "#4a6e6a", textTransform: "uppercase", marginBottom: 8 }}>Danger zone</div>
        <button className="btn-danger" onClick={wipeAll}>Erase all data</button>
      </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span style={{ fontSize: 10, color: "#4a6e6a", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>
      {children}
    </label>
  );
}

/* ─── Math helpers ─── */
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function round1(n) { return parseFloat(n.toFixed(1)); }
