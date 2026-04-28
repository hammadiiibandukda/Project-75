import { useState, useEffect } from "react";

const START_WEIGHT = 87;
const GOAL_WEIGHT = 70;
const WEIGHT_KEY = "weight_journey_v1";
const WORKOUT_KEY = "workout_journey_v1";

async function persistWeight(data) {
  try { localStorage.setItem(WEIGHT_KEY, JSON.stringify(data)); } catch {}
}
async function hydrateWeight() {
  try {
    const r = localStorage.getItem(WEIGHT_KEY);
    return r ? JSON.parse(r) : [];
  } catch { return []; }
}
async function persistWorkout(data) {
  try { localStorage.setItem(WORKOUT_KEY, JSON.stringify(data)); } catch {}
}
async function hydrateWorkout() {
  try {
    const r = localStorage.getItem(WORKOUT_KEY);
    return r ? JSON.parse(r) : [];
  } catch { return []; }
}

function todayStr() { return new Date().toISOString().split("T")[0]; }
function fmtDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const EXERCISES = ["Treadmill", "Elliptical", "Stair Climb", "Cycling", "Walking", "Running", "Rowing", "Other"];
const TEAL = "#0d9488";
const TEAL_LIGHT = "#99f6e4";
const BG = "#0a0f0e";
const CARD = "#111918";
const BORDER = "#1e2e2b";

export default function App() {
  const [tab, setTab] = useState("weight");
  const [weightEntries, setWeightEntries] = useState([]);
  const [workoutEntries, setWorkoutEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wDate, setWDate] = useState(todayStr());
  const [wVal, setWVal] = useState("");
  const [wFlash, setWFlash] = useState(false);
  const [wDelConfirm, setWDelConfirm] = useState(null);
  const [woDate, setWoDate] = useState(todayStr());
  const [exercises, setExercises] = useState([{ type: "Treadmill", minutes: "" }]);
  const [woFlash, setWoFlash] = useState(false);
  const [woDelConfirm, setWoDelConfirm] = useState(null);

  useEffect(() => {
    Promise.all([hydrateWeight(), hydrateWorkout()]).then(([w, wo]) => {
      setWeightEntries(w); setWorkoutEntries(wo); setLoading(false);
    });
  }, []);

  const sortedW = [...weightEntries].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sortedW.length ? sortedW[sortedW.length - 1].weight : START_WEIGHT;
  const lost = parseFloat((START_WEIGHT - latest).toFixed(1));
  const remaining = parseFloat((latest - GOAL_WEIGHT).toFixed(1));
  const pct = Math.min(100, Math.max(0, (lost / (START_WEIGHT - GOAL_WEIGHT)) * 100));

  const handleAddWeight = async () => {
    const w = parseFloat(wVal);
    if (!wVal || isNaN(w) || w < 30 || w > 300) return;
    const updated = [...weightEntries.filter(e => e.date !== wDate), { date: wDate, weight: w }];
    setWeightEntries(updated); await persistWeight(updated);
    setWVal(""); setWFlash(true); setTimeout(() => setWFlash(false), 1500);
  };

  const handleDelWeight = async (date) => {
    const updated = weightEntries.filter(e => e.date !== date);
    setWeightEntries(updated); await persistWeight(updated); setWDelConfirm(null);
  };

  const sortedWo = [...workoutEntries].sort((a, b) => b.date.localeCompare(a.date));
  const totalMins = workoutEntries.reduce((s, e) => s + e.total, 0);

  const addRow = () => setExercises([...exercises, { type: "Treadmill", minutes: "" }]);
  const removeRow = (i) => setExercises(exercises.filter((_, idx) => idx !== i));
  const updateRow = (i, field, val) => setExercises(exercises.map((ex, idx) => idx === i ? { ...ex, [field]: val } : ex));

  const handleAddWorkout = async () => {
    const valid = exercises.filter(ex => ex.minutes && !isNaN(parseInt(ex.minutes)) && parseInt(ex.minutes) > 0);
    if (!valid.length) return;
    const entry = {
      id: Date.now(), date: woDate,
      exercises: valid.map(ex => ({ type: ex.type, minutes: parseInt(ex.minutes) })),
      total: valid.reduce((s, ex) => s + parseInt(ex.minutes), 0)
    };
    const updated = [...workoutEntries, entry];
    setWorkoutEntries(updated); await persistWorkout(updated);
    setExercises([{ type: "Treadmill", minutes: "" }]);
    setWoFlash(true); setTimeout(() => setWoFlash(false), 1500);
  };

  const handleDelWorkout = async (id) => {
    const updated = workoutEntries.filter(e => e.id !== id);
    setWorkoutEntries(updated); await persistWorkout(updated); setWoDelConfirm(null);
  };

  const chartEntries = sortedW.slice(-12);
  const allW = [START_WEIGHT, GOAL_WEIGHT, ...chartEntries.map(e => e.weight)];
  const minW = Math.min(...allW) - 1, maxW = Math.max(...allW) + 1;
  const W = 480, H = 160, PAD = { t: 16, r: 20, b: 32, l: 36 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
  const toX = (i, n) => PAD.l + (n <= 1 ? cW / 2 : (i / (n - 1)) * cW);
  const toY = (w) => PAD.t + cH - ((w - minW) / (maxW - minW)) * cH;
  const goalY = toY(GOAL_WEIGHT);
  const polyline = chartEntries.length > 1 ? chartEntries.map((e, i) => `${toX(i, chartEntries.length)},${toY(e.weight)}`).join(" ") : "";
  const weekChange = sortedW.length >= 2 ? parseFloat((sortedW[sortedW.length - 1].weight - sortedW[sortedW.length - 2].weight).toFixed(1)) : null;

  const css = `@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap'); * { box-sizing: border-box; } input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; } input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.7) sepia(1) saturate(2) hue-rotate(130deg); } .btn { background:${TEAL};color:#fff;border:none;padding:10px 20px;font-family:inherit;font-size:13px;font-weight:500;cursor:pointer;border-radius:6px;transition:opacity .15s,transform .1s;letter-spacing:.04em; } .btn:hover { opacity:.85;transform:translateY(-1px); } .btn-ghost { background:transparent;border:1px solid ${BORDER};color:#4a6e6a;padding:8px 14px;font-family:inherit;font-size:12px;cursor:pointer;border-radius:6px;transition:all .15s; } .btn-ghost:hover { border-color:${TEAL};color:${TEAL_LIGHT}; } .btn-sm { background:transparent;border:1px solid #2a3d39;color:#5a7a76;padding:4px 10px;font-family:inherit;font-size:11px;cursor:pointer;border-radius:4px;transition:all .15s; } .btn-sm:hover { border-color:#e05050;color:#e05050; } .btn-confirm { background:#3d1010;border:1px solid #e05050;color:#f87171;padding:4px 10px;font-family:inherit;font-size:11px;cursor:pointer;border-radius:4px; } .ifield { background:#0f1a18;border:1px solid ${BORDER};color:#e2f0ee;padding:9px 12px;font-family:inherit;font-size:13px;border-radius:6px;outline:none;transition:border-color .15s;width:100%; } .ifield:focus { border-color:${TEAL}; } select.ifield { cursor:pointer; } .tab { padding:8px 20px;font-family:inherit;font-size:12px;cursor:pointer;border:none;background:transparent;letter-spacing:.08em;transition:all .15s;border-bottom:2px solid transparent;text-transform:uppercase; } .rh:hover { background:#161f1e !important; } .flash { animation:fa 1.5s ease forwards; } @keyframes fa { 0%{opacity:0;transform:translateY(-4px)} 20%{opacity:1;transform:translateY(0)} 80%{opacity:1} 100%{opacity:0} }`;

  return (
    <div style={{ minHeight:"100vh", background:BG, color:"#e2f0ee", fontFamily:"'DM Mono','Courier New',monospace", padding:"24px 16px" }}>
      <style>{css}</style>
      <div style={{ maxWidth:560, margin:"0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom:22 }}>
          <div style={{ fontSize:11, letterSpacing:"0.15em", color:TEAL, textTransform:"uppercase", marginBottom:5 }}>Weight Loss Journey</div>
          <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:28, fontWeight:800, margin:0, color:"#fff", lineHeight:1.1 }}>
            {START_WEIGHT} → {GOAL_WEIGHT} kg
          </h1>
          <div style={{ color:"#4a6e6a", fontSize:12, marginTop:4 }}>17 kg to conquer · weekly weigh-ins</div>
        </div>

        {/* Stats */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, marginBottom:16 }}>
          {[
            { label:"Current", value:`${latest} kg` },
            { label:"Lost", value: lost > 0 ? `−${lost} kg` : "0 kg", green: lost > 0 },
            { label:"Remaining", value: remaining > 0 ? `${remaining} kg` : "🎯 Done!" },
            { label:"Sessions", value: workoutEntries.length, sub:`${totalMins} min` },
          ].map(s => (
            <div key={s.label} style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:8, padding:"12px 10px" }}>
              <div style={{ fontSize:9, letterSpacing:"0.12em", color:"#4a6e6a", textTransform:"uppercase", marginBottom:3 }}>{s.label}</div>
              <div style={{ fontSize:16, fontWeight:500, color: s.green ? TEAL_LIGHT : "#e2f0ee" }}>{s.value}</div>
              {s.sub && <div style={{ fontSize:10, color:"#4a6e6a", marginTop:2 }}>{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* Progress */}
        <div style={{ marginBottom:20 }}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#4a6e6a", marginBottom:5 }}>
            <span>Progress</span><span>{pct.toFixed(1)}%</span>
          </div>
          <div style={{ height:7, background:"#1a2e2a", borderRadius:99, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${TEAL},${TEAL_LIGHT})`, borderRadius:99, transition:"width 0.6s ease" }} />
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#2e4e4a", marginTop:3 }}>
            <span>{START_WEIGHT} kg start</span><span>{GOAL_WEIGHT} kg goal</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", borderBottom:`1px solid ${BORDER}`, marginBottom:20 }}>
          {[["weight","⚖️  Weight"],["workout","🏃  Workouts"]].map(([key, label]) => (
            <button key={key} className="tab" onClick={() => setTab(key)}
              style={{ color: tab===key ? TEAL_LIGHT : "#4a6e6a", borderBottomColor: tab===key ? TEAL : "transparent" }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── WEIGHT TAB ── */}
        {tab === "weight" && <>
          {chartEntries.length >= 2 && (
            <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:8, padding:"14px 8px 8px", marginBottom:20 }}>
              <div style={{ fontSize:10, letterSpacing:"0.12em", color:"#4a6e6a", textTransform:"uppercase", marginBottom:8, paddingLeft:8 }}>Weight Trend</div>
              <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:"block" }}>
                {[0,.25,.5,.75,1].map(f => {
                  const y = PAD.t + f * cH, w = maxW - f * (maxW - minW);
                  return <g key={f}>
                    <line x1={PAD.l} y1={y} x2={W-PAD.r} y2={y} stroke="#1a2e2a" strokeWidth="1"/>
                    <text x={PAD.l-4} y={y+4} textAnchor="end" fill="#2e4e4a" fontSize="9">{w.toFixed(0)}</text>
                  </g>;
                })}
                <line x1={PAD.l} y1={goalY} x2={W-PAD.r} y2={goalY} stroke={TEAL} strokeWidth="1" strokeDasharray="4 3" opacity="0.5"/>
                <text x={W-PAD.r+2} y={goalY+4} fill={TEAL} fontSize="8" opacity="0.7">goal</text>
                <polyline points={polyline} fill="none" stroke={TEAL} strokeWidth="2" strokeLinejoin="round"/>
                {chartEntries.map((e,i) => <circle key={e.date} cx={toX(i,chartEntries.length)} cy={toY(e.weight)} r="3.5" fill={BG} stroke={TEAL} strokeWidth="2"/>)}
                {chartEntries.map((e,i) => {
                  if (chartEntries.length > 6 && i % 2 !== 0) return null;
                  const d = new Date(e.date + "T00:00:00");
                  return <text key={e.date} x={toX(i,chartEntries.length)} y={H-4} textAnchor="middle" fill="#2e4e4a" fontSize="8">
                    {d.toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                  </text>;
                })}
              </svg>
            </div>
          )}

          <div style={{ minHeight:28, display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
            {weekChange !== null && (
              <div style={{ display:"inline-flex", alignItems:"center", gap:6,
                background: weekChange<0?"#0a2e1e":weekChange>0?"#2e0a0a":"#1a2e2a",
                border:`1px solid ${weekChange<0?"#0d4a2e":weekChange>0?"#4a0d0d":BORDER}`,
                borderRadius:20, padding:"4px 12px", fontSize:12 }}>
                <span>{weekChange<0?"↓":weekChange>0?"↑":"→"}</span>
                <span style={{ color: weekChange<0?"#4ade80":weekChange>0?"#f87171":"#4a6e6a" }}>
                  {weekChange>0?"+":""}{weekChange} kg vs last week
                </span>
              </div>
            )}
            {wFlash && <span className="flash" style={{ fontSize:12, color:TEAL }}>✓ Saved!</span>}
          </div>

          <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:8, padding:16, marginBottom:20 }}>
            <div style={{ fontSize:10, letterSpacing:"0.12em", color:"#4a6e6a", textTransform:"uppercase", marginBottom:12 }}>Log Weekly Weigh-In</div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              <input type="date" className="ifield" value={wDate} onChange={e=>setWDate(e.target.value)} style={{ flex:"1 1 130px" }}/>
              <input type="number" className="ifield" placeholder="Weight (kg)" value={wVal}
                onChange={e=>setWVal(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddWeight()}
                step="0.1" min="30" max="300" style={{ flex:"1 1 110px" }}/>
              <button className="btn" onClick={handleAddWeight}>Log</button>
            </div>
          </div>

          <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:8, overflow:"hidden" }}>
            <div style={{ padding:"11px 16px", borderBottom:`1px solid ${BORDER}`, fontSize:10, letterSpacing:"0.12em", color:"#4a6e6a", textTransform:"uppercase" }}>
              History · {weightEntries.length} {weightEntries.length===1?"entry":"entries"}
            </div>
            {!loading && sortedW.length===0 && <div style={{ padding:24, textAlign:"center", color:"#2e4e4a", fontSize:13 }}>No weigh-ins yet.<br/>Log your first one above!</div>}
            {[...sortedW].reverse().map((e,i,arr) => {
              const prev = arr[i+1];
              const diff = prev ? parseFloat((e.weight-prev.weight).toFixed(1)) : null;
              const isCon = wDelConfirm === e.date;
              return (
                <div key={e.date} className="rh" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 16px", borderBottom:`1px solid ${BORDER}`, transition:"background .15s" }}>
                  <div>
                    <div style={{ fontSize:13, color:"#b0ceca" }}>{fmtDate(e.date)}</div>
                    {diff!==null && <div style={{ fontSize:11, color:diff<0?"#4ade80":diff>0?"#f87171":"#4a6e6a", marginTop:2 }}>{diff>0?"+":""}{diff} kg from prev</div>}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:17, fontWeight:500 }}>{e.weight} <span style={{ fontSize:11, color:"#4a6e6a" }}>kg</span></span>
                    {isCon ? <button className="btn-confirm" onClick={()=>handleDelWeight(e.date)}>Confirm?</button>
                           : <button className="btn-sm" onClick={()=>setWDelConfirm(e.date)}>✕</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </>}

        {/* ── WORKOUT TAB ── */}
        {tab === "workout" && <>
          <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:8, padding:16, marginBottom:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ fontSize:10, letterSpacing:"0.12em", color:"#4a6e6a", textTransform:"uppercase" }}>Log Workout</div>
              {woFlash && <span className="flash" style={{ fontSize:12, color:TEAL }}>✓ Saved!</span>}
            </div>
            <input type="date" className="ifield" value={woDate} onChange={e=>setWoDate(e.target.value)} style={{ marginBottom:12 }}/>
            {exercises.map((ex,i) => (
              <div key={i} style={{ display:"flex", gap:8, marginBottom:8, alignItems:"center" }}>
                <select className="ifield" value={ex.type} onChange={e=>updateRow(i,"type",e.target.value)} style={{ flex:2 }}>
                  {EXERCISES.map(o=><option key={o} value={o}>{o}</option>)}
                </select>
                <input type="number" className="ifield" placeholder="min" value={ex.minutes}
                  onChange={e=>updateRow(i,"minutes",e.target.value)} min="1" max="300"
                  style={{ flex:1, minWidth:60 }}/>
                {exercises.length > 1 && <button className="btn-sm" onClick={()=>removeRow(i)} style={{ flexShrink:0 }}>✕</button>}
              </div>
            ))}
            <div style={{ display:"flex", gap:10, marginTop:12 }}>
              <button className="btn-ghost" onClick={addRow}>+ Add exercise</button>
              <button className="btn" onClick={handleAddWorkout}>Log Session</button>
            </div>
          </div>

          <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:8, overflow:"hidden" }}>
            <div style={{ padding:"11px 16px", borderBottom:`1px solid ${BORDER}`, fontSize:10, letterSpacing:"0.12em", color:"#4a6e6a", textTransform:"uppercase" }}>
              Sessions · {workoutEntries.length} logged · {totalMins} min total
            </div>
            {!loading && sortedWo.length===0 && <div style={{ padding:24, textAlign:"center", color:"#2e4e4a", fontSize:13 }}>No workouts yet.<br/>Log today's session above!</div>}
            {sortedWo.map(wo => {
              const isCon = woDelConfirm === wo.id;
              return (
                <div key={wo.id} className="rh" style={{ padding:"12px 16px", borderBottom:`1px solid ${BORDER}`, transition:"background .15s" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <div style={{ fontSize:13, color:"#b0ceca", marginBottom:6 }}>{fmtDate(wo.date)}</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                        {wo.exercises.map((ex,i) => (
                          <span key={i} style={{ background:"#0a2e2a", border:"1px solid #0d4a3a", borderRadius:4, padding:"3px 8px", fontSize:11, color:TEAL_LIGHT }}>
                            {ex.type} · {ex.minutes}m
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6, flexShrink:0, marginLeft:12 }}>
                      <span style={{ fontSize:16, fontWeight:500 }}>{wo.total}<span style={{ fontSize:11, color:"#4a6e6a" }}> min</span></span>
                      {isCon ? <button className="btn-confirm" onClick={()=>handleDelWorkout(wo.id)}>Confirm?</button>
                             : <button className="btn-sm" onClick={()=>setWoDelConfirm(wo.id)}>✕</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>}

        <div style={{ marginTop:24, textAlign:"center", fontSize:11, color:"#1e3330" }}>87 kg → 70 kg · your journey, your pace</div>
      </div>
    </div>
  );
}
