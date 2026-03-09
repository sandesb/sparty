import { useState, useEffect, useCallback } from "react";
import {
  Lock, TrendingUp, Clock, LogOut, Shield, BarChart2,
  Gift, AlertCircle, CheckCircle, Calendar, FastForward,
  SkipForward, RotateCcw, FlaskConical, Sparkles, PartyPopper,
  Wallet, ArrowDownToLine
} from "lucide-react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const TOTAL_BUDGET   = 120000;
const WEEKLY_ALLOW   = 2000;
const SAVE_TARGET    = 500;   // save ≥500/wk → spend ≤1500
const MAX_REWARD     = 4000;  // full month reward
const WEEK_COUNT     = 52;
const WEEKS_PER_MON  = 4;
const MAX_MONTHLY    = WEEKLY_ALLOW * WEEKS_PER_MON; // 8000

function calcReward(monthlySpend) {
  const lo = 6000, hi = MAX_MONTHLY;
  if (monthlySpend <= lo) return MAX_REWARD;
  if (monthlySpend >= hi) return 0;
  return Math.round(((hi - monthlySpend) / (hi - lo)) * MAX_REWARD);
}

// which month (1-based) a week belongs to
const weekMonth = (w) => Math.ceil(w / WEEKS_PER_MON);
// is this the last week of a month?
const isMonthEnd  = (w) => w % WEEKS_PER_MON === 0;

function initState() {
  return {
    weeks: Array.from({ length: WEEK_COUNT }, (_, i) => ({
      week: i + 1,
      month: weekMonth(i + 1),
      withdrawn: 0,
      locked: i > 0,
      completed: false,
    })),
    totalWithdrawn: 0,
    currentWeek: 1,
    // per-month reward tracking: { [month]: { reward, claimed } }
    monthRewards: {},
    totalRewardsClaimed: 0,
  };
}

// ─── GLOBAL STYLES ────────────────────────────────────────────────────────────
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Nunito:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,600;1,700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg:       #0a0a0c;
      --surface:  #111116;
      --surface2: #18181f;
      --border:   #222230;
      --accent:   #c8f060;
      --accent2:  #60c8f0;
      --warn:     #f0a060;
      --danger:   #f06060;
      --sim:      #b060f0;
      --reward:   #f0d060;
      --text:     #e8e8f0;
      --text2:    #888898;
      --font-display: 'Nunito', sans-serif;
      --font-mono:    'DM Mono', monospace;
      --radius: 16px;
    }
    body { background: var(--bg); color: var(--text); font-family: var(--font-display); min-height: 100vh; overflow-x: hidden; }
    .app { min-height: 100vh; }

    /* LOGIN */
    .login-wrap { min-height:100vh; display:flex; align-items:center; justify-content:center; background:radial-gradient(ellipse 60% 60% at 50% 30%, #1a1a2e 0%, var(--bg) 70%); }
    .login-card { width:380px; padding:52px 44px; background:var(--surface); border:1px solid var(--border); border-radius:24px; display:flex; flex-direction:column; gap:24px; }
    .login-logo { display:flex; flex-direction:column; align-items:center; gap:14px; }
    .logo-ring { width:68px; height:68px; border-radius:50%; border:2px solid var(--accent); display:flex; align-items:center; justify-content:center; background:rgba(200,240,96,0.05); }
    .login-logo h1 { font-size:30px; font-weight:800; letter-spacing:-0.5px;  ; }
    .login-logo span { font-size:11px; color:var(--text2); font-family:var(--font-mono); letter-spacing:2.5px; }
    .login-field { display:flex; flex-direction:column; gap:8px; }
    .login-field label { font-size:11px; color:var(--text2); font-family:var(--font-mono); letter-spacing:1.5px; }
    .login-field input { background:var(--bg); border:1px solid var(--border); border-radius:10px; padding:13px 16px; color:var(--text); font-family:var(--font-mono); font-size:14px; outline:none; transition:border-color .2s; width:100%; }
    .login-field input:focus { border-color:var(--accent); }
    .login-hint { font-family:var(--font-mono); font-size:11px; color:var(--text2); text-align:center; line-height:1.7; }
    .login-btn { padding:15px; background:var(--accent); color:#0a0a0c; border:none; border-radius:12px; font-family:var(--font-display); font-weight:700; font-size:16px; cursor:pointer;  ; transition:opacity .2s,transform .1s; }
    .login-btn:hover { opacity:.9; }
    .login-btn:active { transform:scale(.98); }
    .login-error { font-family:var(--font-mono); font-size:12px; color:var(--danger); text-align:center; }

    /* HEADER */
    .header { display:flex; align-items:center; justify-content:space-between; padding:20px 32px; border-bottom:1px solid var(--border); background:var(--surface); }
    .header-left { display:flex; align-items:center; gap:14px; }
    .header-title { font-size:24px; font-weight:800; letter-spacing:-0.5px;  ; }
    .header-sub { font-family:var(--font-mono); font-size:10px; color:var(--text2); letter-spacing:2px; margin-top:2px; }
    .badge { padding:4px 12px; border-radius:20px; font-size:10px; font-family:var(--font-mono); font-weight:500; letter-spacing:1.5px; }
    .badge-user  { background:rgba(200,240,96,.1);  color:var(--accent);  border:1px solid rgba(200,240,96,.2); }
    .badge-admin { background:rgba(96,200,240,.1);  color:var(--accent2); border:1px solid rgba(96,200,240,.2); }
    .badge-sim   { background:rgba(176,96,240,.1);  color:var(--sim);     border:1px solid rgba(176,96,240,.25); }
    .logout-btn { display:flex; align-items:center; gap:6px; background:transparent; border:1px solid var(--border); color:var(--text2); cursor:pointer; border-radius:8px; padding:8px 14px; font-family:var(--font-display); font-size:13px; transition:all .2s; }
    .logout-btn:hover { border-color:var(--danger); color:var(--danger); }

    /* LAYOUT */
    .main { padding:32px; max-width:1140px; margin:0 auto; }
    .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:24px; }

    /* CARD */
    .card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:28px; }
    .card-label { font-family:var(--font-mono); font-size:10px; color:var(--text2); letter-spacing:1.5px; margin-bottom:8px; }

    /* CIRCLE */
    .circle-section { display:flex; flex-direction:column; align-items:center; gap:28px; padding:36px 28px; }
    .circle-wrap { position:relative; display:flex; align-items:center; justify-content:center; }
    .circle-inner { position:absolute; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; text-align:center; }
    .circle-main-val { font-size:32px; font-weight:800; letter-spacing:1px; line-height:1; }
    .circle-main-label { font-family:var(--font-mono); font-size:9px; color:var(--text2); letter-spacing:2px; margin-top:6px; }
    .circle-sub { font-size:12px; color:var(--text2); font-family:var(--font-mono); margin-top:2px; }
    .stats-row { display:grid; grid-template-columns:1fr 1fr 1fr; width:100%; border:1px solid var(--border); border-radius:12px; overflow:hidden; }
    .stat-item { padding:14px 16px; display:flex; flex-direction:column; gap:4px; border-right:1px solid var(--border); }
    .stat-item:last-child { border-right:none; }
    .stat-lbl { font-family:var(--font-mono); font-size:9px; color:var(--text2); letter-spacing:1.2px; }
    .stat-val { font-size:17px; font-weight:700;  ; }

    /* WITHDRAW */
    .withdraw-section { display:flex; flex-direction:column; gap:14px; }
    .withdraw-input-row { display:flex; gap:10px; }
    .withdraw-input { flex:1; background:var(--bg); border:1px solid var(--border); border-radius:10px; padding:13px 16px; color:var(--text); font-family:var(--font-mono); font-size:16px; outline:none; transition:border-color .2s; }
    .withdraw-input:focus { border-color:var(--accent); }
    .withdraw-btn { padding:13px 22px; background:var(--accent); color:#0a0a0c; border:none; border-radius:10px; font-family:var(--font-display); font-weight:700; font-size:15px; cursor:pointer; white-space:nowrap;  ; transition:opacity .2s,transform .1s; }
    .withdraw-btn:hover { opacity:.9; }
    .withdraw-btn:active { transform:scale(.98); }
    .withdraw-btn:disabled { opacity:.3; cursor:not-allowed; }
    .info-box { padding:12px 16px; border-radius:10px; font-size:12px; font-family:var(--font-mono); display:flex; align-items:flex-start; gap:10px; line-height:1.5; }
    .info-box.success { background:rgba(200,240,96,.06); border:1px solid rgba(200,240,96,.15); color:var(--accent); }
    .info-box.warn    { background:rgba(240,160,96,.06); border:1px solid rgba(240,160,96,.15); color:var(--warn); }
    .info-box.info    { background:rgba(96,200,240,.06); border:1px solid rgba(96,200,240,.15); color:var(--accent2); }

    /* REWARD PAYOUT BANNER */
    .reward-banner {
      background: linear-gradient(135deg, rgba(240,208,96,0.08) 0%, rgba(200,240,96,0.06) 100%);
      border: 1px solid rgba(240,208,96,0.3);
      border-radius: var(--radius);
      padding: 24px 28px;
      display: flex;
      align-items: center;
      gap: 20px;
      animation: pulseGlow 2s ease-in-out infinite;
    }
    @keyframes pulseGlow {
      0%, 100% { box-shadow: 0 0 0 0 rgba(240,208,96,0); }
      50%       { box-shadow: 0 0 20px 2px rgba(240,208,96,0.12); }
    }
    .reward-banner-icon { width:52px; height:52px; border-radius:50%; background:rgba(240,208,96,0.12); border:2px solid rgba(240,208,96,0.3); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .reward-banner-body { flex:1; }
    .reward-banner-title { font-size:18px; font-weight:800;  ; color:var(--reward); margin-bottom:4px; }
    .reward-banner-sub { font-family:var(--font-mono); font-size:11px; color:var(--text2); line-height:1.7; }
    .reward-banner-amount { font-size:32px; font-weight:800;  ; color:var(--reward); letter-spacing:-1px; text-align:right; flex-shrink:0; }
    .reward-claim-btn { display:flex; align-items:center; gap:8px; padding:12px 22px; background:var(--reward); color:#0a0a0c; border:none; border-radius:10px; font-family:var(--font-display); font-weight:700; font-size:14px; cursor:pointer;  ; margin-top:12px; transition:opacity .2s,transform .1s; white-space:nowrap; }
    .reward-claim-btn:hover { opacity:.9; }
    .reward-claim-btn:active { transform:scale(.97); }

    .reward-claimed-badge { display:inline-flex; align-items:center; gap:6px; padding:6px 14px; background:rgba(200,240,96,0.1); border:1px solid rgba(200,240,96,0.25); border-radius:20px; font-family:var(--font-mono); font-size:11px; color:var(--accent); margin-top:12px; }

    /* PROGRESS */
    .progress-wrap { display:flex; flex-direction:column; gap:8px; }
    .progress-header { display:flex; justify-content:space-between; align-items:center; }
    .progress-track { height:5px; background:var(--surface2); border-radius:99px; overflow:hidden; }
    .progress-fill { height:100%; border-radius:99px; transition:width .6s cubic-bezier(.4,0,.2,1); }

    /* TIMER */
    .timer-display { display:flex; align-items:center; gap:4px; justify-content:center; }
    .timer-unit { display:flex; flex-direction:column; align-items:center; gap:4px; }
    .timer-num { font-size:32px; font-weight:800; letter-spacing:-1px; font-family:var(--font-mono); color:var(--accent2); }
    .timer-lbl { font-size:9px; color:var(--text2); font-family:var(--font-mono); letter-spacing:1.5px; }
    .timer-sep { font-size:28px; font-weight:300; color:var(--border); padding-bottom:12px; margin:0 4px; }

    /* TABLE */
    .table-wrap { overflow-x:auto; }
    table { width:100%; border-collapse:collapse; font-family:var(--font-mono); font-size:13px; }
    th { text-align:left; padding:11px 16px; font-size:10px; letter-spacing:1.5px; color:var(--text2); border-bottom:1px solid var(--border); }
    td { padding:13px 16px; border-bottom:1px solid rgba(34,34,48,.6); }
    tr:last-child td { border-bottom:none; }
    tr:hover td { background:rgba(255,255,255,.015); }
    .td-accent  { color:var(--accent);  font-weight:500; }
    .td-accent2 { color:var(--accent2); font-weight:500; }
    .td-warn    { color:var(--warn); }
    .td-reward  { color:var(--reward);  font-weight:600; }
    .td-muted   { color:var(--text2); }

    /* MONTH ROW highlight */
    .tr-month-end td { background:rgba(240,208,96,0.03); }

    /* SECTION TITLE */
    .section-title { font-size:13px; font-weight:700; letter-spacing:.3px; margin-bottom:20px; display:flex; align-items:center; gap:8px;  ; }
    .section-title::after { content:''; flex:1; height:1px; background:var(--border); }

    /* TABS */
    .tabs { display:flex; gap:4px; background:var(--surface2); padding:4px; border-radius:12px; margin-bottom:24px; }
    .tab { flex:1; padding:10px; text-align:center; border-radius:8px; cursor:pointer; font-size:14px; font-weight:600; letter-spacing:.3px; border:none; transition:all .2s; background:transparent; color:var(--text2); font-family:var(--font-display);  ; }
    .tab.active { background:var(--surface); color:var(--text); box-shadow:0 1px 4px rgba(0,0,0,.4); }

    /* ADMIN */
    .admin-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-bottom:24px; }
    .admin-stat { background:var(--surface2); border:1px solid var(--border); border-radius:12px; padding:20px; }
    .admin-stat-val { font-size:22px; font-weight:800; margin-top:6px;  ; }

    /* SIM PANEL */
    .sim-panel { background:rgba(176,96,240,.04); border:1px solid rgba(176,96,240,.2); border-radius:var(--radius); padding:24px 28px; margin-bottom:28px; }
    .sim-title { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:700;  ; color:var(--sim); margin-bottom:6px; }
    .sim-rule { height:1px; background:rgba(176,96,240,.15); margin:0 0 16px; }
    .sim-subtitle { font-family:var(--font-mono); font-size:11px; color:var(--text2); margin-bottom:18px; line-height:1.7; }
    .sim-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:18px; }
    .sim-field { display:flex; flex-direction:column; gap:6px; }
    .sim-label { font-family:var(--font-mono); font-size:10px; color:var(--text2); letter-spacing:1.5px; }
    .sim-input { background:var(--bg); border:1px solid rgba(176,96,240,.25); border-radius:8px; padding:10px 14px; color:var(--text); font-family:var(--font-mono); font-size:14px; outline:none; transition:border-color .2s; width:100%; }
    .sim-input:focus { border-color:var(--sim); }
    .sim-sliders-label { font-family:var(--font-mono); font-size:10px; color:var(--text2); letter-spacing:1.5px; margin-bottom:12px; }
    .sim-slider-row { display:flex; align-items:center; gap:12px; padding:9px 0; border-bottom:1px solid rgba(34,34,48,.5); }
    .sim-slider-row:last-child { border-bottom:none; }
    .sim-slider-wklbl { font-family:var(--font-mono); font-size:11px; color:var(--text2); width:56px; flex-shrink:0; }
    .sim-slider { flex:1; accent-color:var(--sim); cursor:pointer; }
    .sim-slider-val { font-family:var(--font-mono); font-size:12px; color:var(--text); width:80px; text-align:right; flex-shrink:0; }
    .sim-slider-tag { font-family:var(--font-mono); font-size:10px; width:52px; text-align:right; flex-shrink:0; }
    .sim-preview { padding:12px 16px; background:var(--surface2); border-radius:8px; font-family:var(--font-mono); font-size:11px; color:var(--text2); line-height:1.9; margin-bottom:16px; }
    .sim-actions { display:flex; gap:10px; flex-wrap:wrap; }
    .sim-btn { display:flex; align-items:center; gap:6px; padding:9px 16px; border-radius:8px; border:none; cursor:pointer; font-family:var(--font-mono); font-size:12px; letter-spacing:.5px; transition:all .18s; }
    .sim-btn-primary { background:rgba(176,96,240,.12); color:var(--sim);     border:1px solid rgba(176,96,240,.3); }
    .sim-btn-primary:hover { background:rgba(176,96,240,.22); }
    .sim-btn-ghost   { background:rgba(96,200,240,.08);  color:var(--accent2); border:1px solid rgba(96,200,240,.2); }
    .sim-btn-ghost:hover { background:rgba(96,200,240,.15); }
    .sim-btn-danger  { background:rgba(240,96,96,.08);   color:var(--danger);  border:1px solid rgba(240,96,96,.2); }
    .sim-btn-danger:hover { background:rgba(240,96,96,.15); }
    .sim-status { display:flex; align-items:center; flex-wrap:wrap; gap:12px; padding:12px 16px; background:rgba(176,96,240,.06); border-radius:8px; margin-top:14px; font-family:var(--font-mono); font-size:11px; }
    .sim-status-chip { display:flex; align-items:center; gap:6px; }
    .sim-status-dot { width:6px; height:6px; border-radius:50%; background:var(--sim); flex-shrink:0; }

    /* WEEK HISTORY */
    .week-history { display:flex; flex-direction:column; gap:8px; }
    .week-row { display:flex; align-items:center; justify-content:space-between; padding:11px 14px; border-radius:8px; background:var(--surface2); border:1px solid var(--border); }
    .week-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
    .dot-saved   { background:var(--accent);  box-shadow:0 0 6px rgba(200,240,96,.4); }
    .dot-partial { background:var(--warn); }
    .dot-none    { background:var(--danger); }
    .dot-pending { background:var(--border); }

    /* MONTHLY LEDGER */
    .month-ledger-row-complete { background: rgba(200,240,96,0.025); }
    .month-ledger-row-active   { background: rgba(96,200,240,0.03); }
    .payout-chip { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:20px; font-size:10px; font-family:var(--font-mono); }
    .payout-chip-yes { background:rgba(240,208,96,0.1); color:var(--reward); border:1px solid rgba(240,208,96,0.25); }
    .payout-chip-no  { background:rgba(136,136,152,0.08); color:var(--text2); border:1px solid rgba(136,136,152,0.15); }
    .payout-chip-pending { background:rgba(96,200,240,0.08); color:var(--accent2); border:1px solid rgba(96,200,240,0.2); }

    /* REWARD SCENARIOS */
    .reward-scenarios { display:flex; flex-direction:column; gap:10px; }
    .scenario-row { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; background:var(--surface2); border-radius:10px; border:1px solid var(--border); }
    .scenario-spend { font-size:14px; font-weight:600;  ; }
    .scenario-pct { font-family:var(--font-mono); font-size:11px; color:var(--text2); background:var(--surface); padding:4px 10px; border-radius:20px; }
    .divider { height:1px; background:var(--border); margin:24px 0; }

    @keyframes fadeIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
    @keyframes slideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }

    @media (max-width:768px) {
      .main { padding:16px; }
      .grid-2 { grid-template-columns:1fr; }
      .admin-grid { grid-template-columns:1fr 1fr; }
      .sim-grid { grid-template-columns:1fr; }
      .header { padding:16px; }
      .header-title { font-size:20px; }
      .reward-banner { flex-direction:column; align-items:flex-start; }
    }
  `}</style>
);

// ─── SVG CIRCLE ──────────────────────────────────────────────────────────────
function CircularProgress({ pct = 0, size = 210, stroke = 14, color = "var(--accent)", children }) {
  const r    = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="circle-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface2)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray .8s cubic-bezier(.4,0,.2,1), stroke .4s" }} />
      </svg>
      <div className="circle-inner">{children}</div>
    </div>
  );
}

// ─── COUNTDOWN (real or simulated) ───────────────────────────────────────────
function useCountdown(overrideDate) {
  const [time, setTime] = useState({ d: 0, h: 0, m: 0, s: 0 });
  useEffect(() => {
    function calc() {
      const now        = overrideDate ? new Date(overrideDate) : new Date();
      const nextSun    = new Date(now);
      const daysUntil  = now.getDay() === 0 ? 7 : 7 - now.getDay();
      nextSun.setDate(now.getDate() + daysUntil);
      nextSun.setHours(0, 0, 0, 0);
      const diff = Math.max(0, nextSun - now);
      setTime({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000)  / 60000),
        s: Math.floor((diff % 60000)    / 1000),
      });
    }
    calc();
    if (!overrideDate) { const id = setInterval(calc, 1000); return () => clearInterval(id); }
  }, [overrideDate]);
  return time;
}

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user,          setUser]          = useState("user"); // start in user view (bypass login)
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [loginUser,     setLoginUser]     = useState("");
  const [loginPass,     setLoginPass]     = useState("");
  const [loginErr,      setLoginErr]      = useState("");
  const [state,      setState]      = useState(initState);
  const [withdrawAmt,setWithdrawAmt]= useState("");
  const [tab,        setTab]        = useState("dashboard");
  const [toast,      setToast]      = useState(null);

  // sim
  const [simActive,  setSimActive]  = useState(false);
  const [simWeek,    setSimWeek]    = useState("1");
  const [simDT,      setSimDT]      = useState("");
  const [simSpends,  setSimSpends]  = useState([2000, 2000, 2000, 2000]);

  const timer = useCountdown(simActive && simDT ? simDT : null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }, []);

  // ── AUTH ── (admin login only when opened via Admin button)
  function handleLogin() {
    if (showAdminLogin) {
      if (loginUser === "admin" && loginPass === "admin") {
        setUser("admin");
        setLoginErr("");
        setShowAdminLogin(false);
        setLoginUser("");
        setLoginPass("");
      } else setLoginErr("Invalid — use admin / admin");
      return;
    }
    if (loginUser === "admin" && loginPass === "admin") { setUser("admin"); setLoginErr(""); }
    else if (loginUser === "user" && loginPass === "user") { setUser("user"); setLoginErr(""); }
    else setLoginErr("Invalid — try user/user or admin/admin");
  }

  // ── WITHDRAW ──
  function handleWithdraw() {
    const amt = parseInt(withdrawAmt);
    if (!amt || amt <= 0) return showToast("Enter a valid amount", "warn");
    const wk        = state.weeks[state.currentWeek - 1];
    const remaining = WEEKLY_ALLOW - wk.withdrawn;
    if (amt > remaining) return showToast(`Only Rs.${remaining.toLocaleString()} left this week`, "warn");
    setState(prev => {
      const weeks = [...prev.weeks];
      weeks[prev.currentWeek - 1] = { ...wk, withdrawn: wk.withdrawn + amt };
      return { ...prev, weeks, totalWithdrawn: prev.totalWithdrawn + amt };
    });
    setWithdrawAmt("");
    showToast(`Rs.${amt.toLocaleString()} withdrawn`, "success");
  }

  // ── ADVANCE WEEK ──
  // When completing the 4th week of a month → auto-calculate & lock in that month's reward
  function advanceOneWeek() {
    setState(prev => {
      if (prev.currentWeek >= WEEK_COUNT) return prev;
      const weeks   = [...prev.weeks];
      const cw      = prev.currentWeek;
      weeks[cw - 1] = { ...weeks[cw - 1], completed: true };
      weeks[cw]     = { ...weeks[cw], locked: false };

      let monthRewards = { ...prev.monthRewards };

      // If just finished a month-end week, calculate that month's reward
      if (isMonthEnd(cw)) {
        const mon        = weekMonth(cw);
        const monthWks   = weeks.filter(w => w.month === mon);
        const monthSpend = monthWks.reduce((s, w) => s + w.withdrawn, 0);
        const reward     = calcReward(monthSpend);
        // only set if not already claimed/set
        if (!monthRewards[mon]) {
          monthRewards[mon] = { reward, claimed: false, spend: monthSpend };
        }
      }

      return { ...prev, weeks, currentWeek: cw + 1, monthRewards };
    });
    showToast("⏭ Advanced to next week", "success");
  }

  // ── CLAIM REWARD ──
  function claimReward(month) {
    setState(prev => {
      const mr = prev.monthRewards[month];
      if (!mr || mr.claimed) return prev;
      return {
        ...prev,
        monthRewards: { ...prev.monthRewards, [month]: { ...mr, claimed: true } },
        totalRewardsClaimed: prev.totalRewardsClaimed + mr.reward,
      };
    });
    showToast(`🎉 Rs.${state.monthRewards[month]?.reward?.toLocaleString()} reward claimed!`, "success");
  }

  // ── SIM ──
  function applySimulation() {
    const target = parseInt(simWeek);
    if (!target || target < 1 || target > WEEK_COUNT) return showToast("Enter a valid week (1–52)", "warn");

    setState(() => {
      const weeks = Array.from({ length: WEEK_COUNT }, (_, i) => {
        if (i < target - 1) {
          const spent = Math.min(simSpends[i % 4] ?? WEEKLY_ALLOW, WEEKLY_ALLOW);
          return { week: i+1, month: weekMonth(i+1), withdrawn: spent, locked: false, completed: true };
        }
        if (i === target - 1) return { week: i+1, month: weekMonth(i+1), withdrawn: 0, locked: false, completed: false };
        return { week: i+1, month: weekMonth(i+1), withdrawn: 0, locked: true, completed: false };
      });

      // Re-build monthRewards from simulated data
      const monthRewards = {};
      for (let m = 1; m <= 13; m++) {
        const mw     = weeks.filter(w => w.month === m && w.completed);
        // only lock in the reward if all 4 weeks of that month are done
        const fullMonth = mw.length === WEEKS_PER_MON;
        if (fullMonth) {
          const spend  = mw.reduce((s, w) => s + w.withdrawn, 0);
          monthRewards[m] = { reward: calcReward(spend), claimed: false, spend };
        }
      }

      const totalWithdrawn = weeks.filter(w => w.completed).reduce((s, w) => s + w.withdrawn, 0);
      return { weeks, totalWithdrawn, currentWeek: target, monthRewards, totalRewardsClaimed: 0 };
    });

    setSimActive(true);
    showToast(`Simulated to Week ${target}`, "success");
  }

  function resetSimulation() {
    setState(initState());
    setSimWeek("1"); setSimDT(""); setSimActive(false);
    setSimSpends([2000, 2000, 2000, 2000]);
    showToast("Reset to Week 1", "warn");
  }

  // ── DERIVED ──
  const cw              = state.currentWeek;
  const cwData          = state.weeks[cw - 1] || state.weeks[0];
  const weekWithdrawn   = cwData.withdrawn;
  const weekRemaining   = WEEKLY_ALLOW - weekWithdrawn;
  const weekPct         = (weekWithdrawn / WEEKLY_ALLOW) * 100;
  const ringColor       = weekPct > 80 ? "var(--danger)" : weekPct > 50 ? "var(--warn)" : "var(--accent)";
  const currentMonth    = weekMonth(cw);
  const monthWeeks      = state.weeks.filter(w => w.month === currentMonth);
  const monthSpend      = monthWeeks.reduce((a, w) => a + w.withdrawn, 0);
  const monthReward     = calcReward(monthSpend);
  const monthRewardPct  = Math.round((monthReward / MAX_REWARD) * 100);
  const completedWeeks  = state.weeks.filter(w => w.completed);
  const savedWeeks      = completedWeeks.filter(w => w.withdrawn <= 1500).length;
  const isLastWeekOfMon = isMonthEnd(cw);
  const weekInMonth     = ((cw - 1) % WEEKS_PER_MON) + 1; // 1–4

  // Previous month's unclaimed reward (to show payout banner)
  const prevMonth       = currentMonth - 1;
  const prevMonthData   = state.monthRewards[prevMonth];
  const showPayoutBanner = prevMonthData && !prevMonthData.claimed && prevMonthData.reward > 0;

  // For completed months — build monthly ledger
  const completedMonths = [];
  for (let m = 1; m < currentMonth; m++) {
    const mw    = state.weeks.filter(w => w.month === m);
    const spend = mw.reduce((s, w) => s + w.withdrawn, 0);
    const mr    = state.monthRewards[m];
    completedMonths.push({
      month: m,
      spend,
      reward: mr?.reward ?? calcReward(spend),
      claimed: mr?.claimed ?? false,
      rewardPct: Math.round(((mr?.reward ?? calcReward(spend)) / MAX_REWARD) * 100),
    });
  }

  const simMonthTotal  = simSpends.reduce((a, b) => a + b, 0);
  const simMonthReward = calcReward(simMonthTotal);

  const scenarios = [
    { label: "Perfect — Rs.6,000", spend: 6000 },
    { label: "Good    — Rs.6,500", spend: 6500 },
    { label: "Okay    — Rs.7,000", spend: 7000 },
    { label: "Over    — Rs.7,500", spend: 7500 },
    { label: "Max     — Rs.8,000", spend: 8000 },
  ];

  // ── ADMIN LOGIN SCREEN (only when user clicked "Admin") ──
  if (showAdminLogin) return (
    <>
      <GlobalStyles />
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">
            <div className="logo-ring"><Lock size={26} color="var(--accent)" /></div>
            <h1>Sparkonto</h1>
            <span>ADMIN ACCESS</span>
          </div>
          <div className="login-field">
            <label>USERNAME</label>
            <input value={loginUser} onChange={e => setLoginUser(e.target.value)}
              placeholder="Enter username" onKeyDown={e => e.key === "Enter" && handleLogin()} autoFocus />
          </div>
          <div className="login-field">
            <label>PASSWORD</label>
            <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)}
              placeholder="••••••" onKeyDown={e => e.key === "Enter" && handleLogin()} />
          </div>
          {loginErr && <div className="login-error">{loginErr}</div>}
          <button className="login-btn" onClick={handleLogin}>Enter the Vault</button>
          <div className="login-hint">admin / admin</div>
          <button type="button" onClick={() => { setShowAdminLogin(false); setLoginErr(""); setLoginUser(""); setLoginPass(""); }}
            style={{ background: "transparent", border: "none", color: "var(--text2)", fontFamily: "var(--font-mono)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );

  // ── MAIN APP ──
  return (
    <>
      <GlobalStyles />
      <div className="app">

        {/* Toast */}
        {toast && (
          <div style={{ position:"fixed", top:20, right:20, zIndex:9999, padding:"13px 20px", borderRadius:12,
            background: toast.type === "success" ? "rgba(200,240,96,.1)" : "rgba(240,160,96,.08)",
            border:`1px solid ${toast.type === "success" ? "rgba(200,240,96,.3)" : "rgba(240,160,96,.3)"}`,
            color: toast.type === "success" ? "var(--accent)" : "var(--warn)",
            fontFamily:"var(--font-mono)", fontSize:12, display:"flex", alignItems:"center", gap:8,
            animation:"fadeIn .2s ease" }}>
            {toast.type === "success" ? <CheckCircle size={14}/> : <AlertCircle size={14}/>}
            {toast.msg}
          </div>
        )}

        {/* Header */}
        <div className="header">
          <div className="header-left">
            <div style={{ width:40, height:40, borderRadius:"50%", border:"2px solid var(--accent)", display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(200,240,96,0.05)" }}>
              <Lock size={16} color="var(--accent)" />
            </div>
            <div>
              <div className="header-title">Sparkonto</div>
              <div className="header-sub">BLOCKED SAVINGS VAULT</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {simActive && <span className="badge badge-sim">SIM · W{cw} M{currentMonth}</span>}
            <span className={`badge ${user === "admin" ? "badge-admin" : "badge-user"}`}>
              {user === "admin" ? "ADMIN" : "USER"}
            </span>
            <button type="button" className="logout-btn" onClick={() => setShowAdminLogin(true)}>
              Admin
            </button>
            <button className="logout-btn" onClick={() => { setUser("user"); setLoginUser(""); setLoginPass(""); setShowAdminLogin(false); }}>
              <LogOut size={13}/> Sign out
            </button>
          </div>
        </div>

        <div className="main">
          {/* Tabs */}
          <div className="tabs">
            <button className={`tab ${tab==="dashboard"?"active":""}`} onClick={() => setTab("dashboard")}>Dashboard</button>
            {user === "admin" && (
              <button className={`tab ${tab==="admin"?"active":""}`} onClick={() => setTab("admin")}>Admin</button>
            )}
            <button className={`tab ${tab==="ledger"?"active":""}`} onClick={() => setTab("ledger")}>
              Monthly Ledger
            </button>
            <button className={`tab ${tab==="projection"?"active":""}`} onClick={() => setTab("projection")}>
              Rewards
            </button>
          </div>

          {/* ══════════════════════════════════════
              DASHBOARD
          ══════════════════════════════════════ */}
          {tab === "dashboard" && (
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

              {/* ─ REWARD PAYOUT BANNER ─ */}
              {showPayoutBanner && (
                <div className="reward-banner" style={{ animation:"slideUp .4s ease, pulseGlow 2s ease-in-out infinite" }}>
                  <div className="reward-banner-icon">
                    <PartyPopper size={24} color="var(--reward)" />
                  </div>
                  <div className="reward-banner-body">
                    <div className="reward-banner-title">Month {prevMonth} Reward Ready!</div>
                    <div className="reward-banner-sub">
                      You spent Rs.{prevMonthData.spend?.toLocaleString()} last month
                      &nbsp;({prevMonthData.rewardPct ?? Math.round((prevMonthData.reward / MAX_REWARD) * 100)}% savings efficiency)
                      &nbsp;— your reward has been unlocked.
                    </div>
                    <button className="reward-claim-btn" onClick={() => claimReward(prevMonth)}>
                      <ArrowDownToLine size={15} /> Claim Rs.{prevMonthData.reward.toLocaleString()} Reward
                    </button>
                  </div>
                  <div className="reward-banner-amount">Rs.{prevMonthData.reward.toLocaleString()}</div>
                </div>
              )}

              {/* ─ CLAIMED BUT FRESH ─ */}
              {prevMonthData?.claimed && (
                <div className="info-box success" style={{ animation:"slideUp .3s ease" }}>
                  <CheckCircle size={14} style={{ flexShrink:0, marginTop:1 }}/>
                  <span>Month {prevMonth} reward of Rs.{prevMonthData.reward.toLocaleString()} claimed ✓ — keep it up!</span>
                </div>
              )}

              {/* ─ END OF MONTH WARNING ─ */}
              {isLastWeekOfMon && (
                <div className="info-box info" style={{ animation:"slideUp .3s ease" }}>
                  <Sparkles size={14} style={{ flexShrink:0, marginTop:1 }}/>
                  <span>
                    This is Week 4 of Month {currentMonth} — the final week.
                    Monthly spend so far: Rs.{monthSpend.toLocaleString()}.
                    On-track reward: <strong style={{ color:"var(--accent)" }}>Rs.{monthReward.toLocaleString()}</strong> ({monthRewardPct}%)
                  </span>
                </div>
              )}

              <div className="grid-2">
                {/* Left — circle + withdraw */}
                <div className="card circle-section">
                  <CircularProgress pct={weekPct} size={210} color={ringColor}>
                    <div className="circle-main-val" style={{ color: ringColor }}>
                      Rs.{weekWithdrawn.toLocaleString()}
                    </div>
                    <div className="circle-main-label">WITHDRAWN</div>
                    <div className="circle-sub">of Rs.{WEEKLY_ALLOW.toLocaleString()}</div>
                  </CircularProgress>

                  <div className="stats-row">
                    <div className="stat-item">
                      <span className="stat-lbl">REMAINING</span>
                      <span className="stat-val" style={{ color:"var(--accent)" }}>Rs.{weekRemaining.toLocaleString()}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-lbl">SAVED THIS WK</span>
                      <span className="stat-val" style={{ color: weekWithdrawn <= 1500 ? "var(--accent)" : "var(--warn)" }}>
                        Rs.{(WEEKLY_ALLOW - weekWithdrawn).toLocaleString()}
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-lbl">WEEK {weekInMonth}/4</span>
                      <span className="stat-val">{cw}<span style={{ fontSize:11, color:"var(--text2)", fontStyle:"normal" }}>/52</span></span>
                    </div>
                  </div>

                  <div className="withdraw-section" style={{ width:"100%" }}>
                    <div className="withdraw-input-row">
                      <input className="withdraw-input" type="number" placeholder="Amount to withdraw"
                        value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleWithdraw()} max={weekRemaining} />
                      <button className="withdraw-btn" onClick={handleWithdraw} disabled={weekRemaining <= 0}>
                        Withdraw
                      </button>
                    </div>
                    {weekRemaining >= SAVE_TARGET && weekWithdrawn < WEEKLY_ALLOW && (
                      <div className="info-box success">
                        <Gift size={13} style={{ flexShrink:0, marginTop:1 }}/>
                        <span>Spend ≤ Rs.1,500 this week — contributes to your month-end reward!</span>
                      </div>
                    )}
                    {weekRemaining < SAVE_TARGET && weekRemaining > 0 && (
                      <div className="info-box warn">
                        <AlertCircle size={13} style={{ flexShrink:0, marginTop:1 }}/>
                        <span>Spent past savings target this week — partial reward will apply</span>
                      </div>
                    )}
                    {weekRemaining === 0 && (
                      <div className="info-box warn">
                        <AlertCircle size={13} style={{ flexShrink:0, marginTop:1 }}/>
                        <span>Weekly limit reached — next withdrawal unlocks on Sunday</span>
                      </div>
                    )}
                  </div>

                  {user === "admin" && (
                    <button onClick={advanceOneWeek} style={{ display:"flex", alignItems:"center", gap:6, background:"transparent", border:"1px dashed rgba(176,96,240,.3)", color:"var(--sim)", borderRadius:8, padding:"8px 16px", cursor:"pointer", fontSize:12, fontFamily:"var(--font-mono)" }}>
                      <SkipForward size={12}/> Quick-advance one week
                    </button>
                  )}
                </div>

                {/* Right — timer + month reward meter + history */}
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

                  {/* Timer */}
                  <div className="card">
                    <div className="section-title"><Clock size={13}/> Next Withdrawal Unlock</div>
                    <div className="timer-display">
                      {[["d","DAYS"],["h","HRS"],["m","MIN"],["s","SEC"]].map(([k,label],i) => (
                        <div key={k} style={{ display:"flex", alignItems:"center" }}>
                          {i > 0 && <span className="timer-sep">:</span>}
                          <div className="timer-unit">
                            <span className="timer-num">{String(timer[k]).padStart(2,"0")}</span>
                            <span className="timer-lbl">{label}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ textAlign:"center", fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text2)", marginTop:14, letterSpacing:1.5 }}>
                      {simActive && simDT ? "SIMULATED TIME" : "RESETS EVERY SUNDAY AT 00:00"}
                    </div>
                  </div>

                  {/* Month reward meter */}
                  <div className="card">
                    <div className="section-title"><TrendingUp size={13}/> Month {currentMonth} Reward Meter</div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:16 }}>
                      <div>
                        <div className="card-label">PROJECTED BONUS</div>
                        <div style={{ fontSize:28, fontWeight:800,   letterSpacing:-1, color: monthReward >= 3000 ? "var(--accent)" : monthReward >= 1500 ? "var(--warn)" : "var(--danger)" }}>
                          Rs.{monthReward.toLocaleString()}
                        </div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div className="card-label">EFFICIENCY</div>
                        <div style={{ fontSize:28, fontWeight:800,   letterSpacing:-1, color:"var(--accent2)" }}>{monthRewardPct}%</div>
                      </div>
                    </div>

                    {/* Week-by-week breakdown of this month */}
                    <div style={{ display:"flex", gap:6, marginBottom:14 }}>
                      {monthWeeks.map((w) => {
                        const isCurrentWk = w.week === cw;
                        const done        = w.completed;
                        const saved       = done && w.withdrawn <= 1500;
                        const partial     = done && !saved;
                        return (
                          <div key={w.week} style={{ flex:1, display:"flex", flexDirection:"column", gap:4, alignItems:"center" }}>
                            <div style={{
                              width:"100%", height:8, borderRadius:4,
                              background: isCurrentWk ? "rgba(96,200,240,0.3)"
                                : !done ? "var(--surface2)"
                                : saved  ? "var(--accent)"
                                : partial ? "var(--warn)"
                                : "var(--danger)"
                            }} />
                            <span style={{ fontFamily:"var(--font-mono)", fontSize:9, color: isCurrentWk ? "var(--accent2)" : "var(--text2)" }}>
                              W{w.week}{isCurrentWk ? "◀" : ""}
                            </span>
                            <span style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--text2)" }}>
                              {done ? `₹${w.withdrawn}` : isCurrentWk ? "NOW" : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="progress-wrap">
                      <div className="progress-header">
                        <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text2)" }}>MONTHLY SPEND</span>
                        <span style={{ fontFamily:"var(--font-mono)", fontSize:10 }}>Rs.{monthSpend.toLocaleString()} / Rs.8,000</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width:`${Math.min((monthSpend/8000)*100,100)}%`, background: monthSpend<=6000?"var(--accent)":monthSpend<=7000?"var(--warn)":"var(--danger)" }} />
                      </div>
                    </div>
                    <div style={{ marginTop:10, fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text2)", lineHeight:1.6 }}>
                      Target: ≤ Rs.6,000/mo → Rs.4,000 bonus · Payout unlocks end of Week {currentMonth * 4}
                    </div>
                  </div>

                  {/* Recent weeks */}
                  <div className="card" style={{ flex:1 }}>
                    <div className="section-title"><Calendar size={13}/> Recent Weeks</div>
                    <div className="week-history">
                      {state.weeks.slice(Math.max(0, cw-5), cw+1).slice(-5).map(w => {
                        const isCur   = w.week === cw;
                        const savedOk = w.withdrawn <= 1500;
                        const partial = !savedOk && w.withdrawn < WEEKLY_ALLOW;
                        const isEnd   = isMonthEnd(w.week);
                        return (
                          <div className="week-row" key={w.week}
                            style={isCur ? { borderColor:"rgba(200,240,96,.2)" } : isEnd && w.completed ? { borderColor:"rgba(240,208,96,.2)" } : {}}>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <div className={`week-dot ${isCur?"dot-pending":w.completed?(savedOk?"dot-saved":partial?"dot-partial":"dot-none"):"dot-pending"}`} />
                              <span style={{ fontFamily:"var(--font-mono)", fontSize:12 }}>
                                Week {w.week}
                                {isCur && <span style={{ color:"var(--accent2)", fontSize:10, marginLeft:4 }}>NOW</span>}
                                {isEnd && !isCur && w.completed && <span style={{ color:"var(--reward)", fontSize:9, marginLeft:4 }}>END</span>}
                              </span>
                            </div>
                            <span style={{ fontFamily:"var(--font-mono)", fontSize:12, color:"var(--text2)" }}>
                              {isCur ? `Rs.${w.withdrawn.toLocaleString()} used` : w.completed ? `Rs.${w.withdrawn.toLocaleString()} spent` : "—"}
                            </span>
                            {w.completed && !isCur && (
                              <span style={{ fontSize:10, fontFamily:"var(--font-mono)", color: savedOk?"var(--accent)":partial?"var(--warn)":"var(--danger)" }}>
                                {savedOk ? "SAVED ✓" : partial ? "PARTIAL" : "FULL"}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════
              MONTHLY LEDGER (new tab)
          ══════════════════════════════════════ */}
          {tab === "ledger" && (
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

              {/* Unclaimed rewards alerts */}
              {Object.entries(state.monthRewards).filter(([,v]) => !v.claimed && v.reward > 0).map(([m, v]) => (
                <div key={m} className="reward-banner">
                  <div className="reward-banner-icon"><PartyPopper size={22} color="var(--reward)"/></div>
                  <div className="reward-banner-body">
                    <div className="reward-banner-title">Month {m} Reward Pending</div>
                    <div className="reward-banner-sub">
                      Monthly spend Rs.{v.spend?.toLocaleString()} → reward rate {Math.round((v.reward/MAX_REWARD)*100)}%
                    </div>
                    <button className="reward-claim-btn" onClick={() => claimReward(parseInt(m))}>
                      <ArrowDownToLine size={14}/> Claim Rs.{v.reward.toLocaleString()}
                    </button>
                  </div>
                  <div className="reward-banner-amount">Rs.{v.reward.toLocaleString()}</div>
                </div>
              ))}

              {/* Full month-by-month ledger */}
              <div className="card">
                <div className="section-title"><BarChart2 size={13}/> Month-by-Month Ledger</div>

                {completedMonths.length === 0 && (
                  <div style={{ fontFamily:"var(--font-mono)", fontSize:12, color:"var(--text2)", padding:"20px 0", textAlign:"center" }}>
                    No completed months yet. Advance through Week 4 to see your first month's payout.
                  </div>
                )}

                {completedMonths.length > 0 && (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>MONTH</th>
                          <th>W1 SPEND</th>
                          <th>W2 SPEND</th>
                          <th>W3 SPEND</th>
                          <th>W4 SPEND</th>
                          <th>TOTAL SPENT</th>
                          <th>REWARD</th>
                          <th>RATE</th>
                          <th>STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {completedMonths.map(row => {
                          const mw = state.weeks.filter(w => w.month === row.month);
                          const mr = state.monthRewards[row.month];
                          return (
                            <tr key={row.month} className="month-ledger-row-complete">
                              <td style={{ fontWeight:700,   fontFamily:"var(--font-mono)" }}>M{row.month}</td>
                              {mw.map(w => (
                                <td key={w.week} className={w.withdrawn <= 1500 ? "td-accent" : w.withdrawn < WEEKLY_ALLOW ? "td-warn" : "td-muted"}
                                  style={{ fontFamily:"var(--font-mono)" }}>
                                  Rs.{w.withdrawn.toLocaleString()}
                                  {w.withdrawn <= 1500 && <span style={{ fontSize:9, marginLeft:4 }}>✓</span>}
                                </td>
                              ))}
                              <td className="td-warn" style={{ fontFamily:"var(--font-mono)", fontWeight:600 }}>Rs.{row.spend.toLocaleString()}</td>
                              <td className="td-reward" style={{ fontFamily:"var(--font-mono)", fontWeight:700 }}>+ Rs.{row.reward.toLocaleString()}</td>
                              <td style={{ fontFamily:"var(--font-mono)", color: row.rewardPct===100?"var(--accent)":row.rewardPct>50?"var(--warn)":"var(--danger)" }}>
                                {row.rewardPct}%
                              </td>
                              <td>
                                {mr?.claimed
                                  ? <span className="payout-chip payout-chip-yes"><CheckCircle size={10}/> CLAIMED</span>
                                  : row.reward > 0
                                  ? <button onClick={() => claimReward(row.month)} className="reward-claim-btn" style={{ padding:"5px 12px", fontSize:11, marginTop:0 }}>
                                      <Gift size={11}/> Claim
                                    </button>
                                  : <span className="payout-chip payout-chip-no">No Reward</span>
                                }
                              </td>
                            </tr>
                          );
                        })}

                        {/* Current month (in progress) */}
                        <tr className="month-ledger-row-active">
                          <td style={{ fontWeight:700,   fontFamily:"var(--font-mono)", color:"var(--accent2)" }}>M{currentMonth} ◀</td>
                          {monthWeeks.map(w => (
                            <td key={w.week} style={{ fontFamily:"var(--font-mono)", color: w.week===cw?"var(--accent2)":"var(--text2)" }}>
                              {w.completed || w.week===cw ? `Rs.${w.withdrawn.toLocaleString()}` : "—"}
                              {w.week===cw && <span style={{ fontSize:9, marginLeft:4, color:"var(--accent2)" }}>NOW</span>}
                            </td>
                          ))}
                          <td style={{ fontFamily:"var(--font-mono)", color:"var(--accent2)" }}>Rs.{monthSpend.toLocaleString()}</td>
                          <td className="td-reward" style={{ fontFamily:"var(--font-mono)" }}>~ Rs.{monthReward.toLocaleString()}</td>
                          <td style={{ fontFamily:"var(--font-mono)", color:"var(--accent2)" }}>{monthRewardPct}%</td>
                          <td><span className="payout-chip payout-chip-pending">IN PROGRESS</span></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Summary row */}
                {completedMonths.length > 0 && (
                  <div style={{ marginTop:20, display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12 }}>
                    {[
                      { label:"TOTAL SPENT",     val:`Rs.${completedMonths.reduce((s,r)=>s+r.spend,0).toLocaleString()}`,   color:"var(--warn)" },
                      { label:"TOTAL REWARDS",   val:`Rs.${completedMonths.reduce((s,r)=>s+r.reward,0).toLocaleString()}`, color:"var(--reward)" },
                      { label:"CLAIMED",         val:`Rs.${state.totalRewardsClaimed.toLocaleString()}`,                    color:"var(--accent)" },
                      { label:"UNCLAIMED",       val:`Rs.${(completedMonths.reduce((s,r)=>s+r.reward,0) - state.totalRewardsClaimed).toLocaleString()}`, color:"var(--accent2)" },
                    ].map(item => (
                      <div key={item.label} style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"16px 18px" }}>
                        <div className="card-label">{item.label}</div>
                        <div style={{ fontSize:20, fontWeight:800,   color:item.color, marginTop:4 }}>{item.val}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════
              ADMIN TAB
          ══════════════════════════════════════ */}
          {tab === "admin" && user === "admin" && (
            <>
              {/* SIM PANEL */}
              <div className="sim-panel">
                <div className="sim-title"><FlaskConical size={15}/> Time &amp; Week Simulator</div>
                <div className="sim-rule" />
                <div className="sim-subtitle">
                  Jump to any week (1–52), override the countdown timer date, and configure weekly spending patterns to preview reward calculations.
                </div>
                <div className="sim-grid">
                  <div className="sim-field">
                    <label className="sim-label">JUMP TO WEEK (1–52)</label>
                    <input className="sim-input" type="number" min="1" max="52"
                      value={simWeek} onChange={e => setSimWeek(e.target.value)} />
                  </div>
                  <div className="sim-field">
                    <label className="sim-label">OVERRIDE DATE / TIME</label>
                    <input className="sim-input" type="datetime-local" value={simDT} onChange={e => setSimDT(e.target.value)} />
                    <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text2)" }}>Affects countdown display only</span>
                  </div>
                </div>

                <div className="sim-sliders-label">WEEKLY SPEND PATTERN (cycles across all completed weeks)</div>
                {simSpends.map((val, i) => (
                  <div className="sim-slider-row" key={i}>
                    <span className="sim-slider-wklbl">Week {i+1}</span>
                    <input type="range" className="sim-slider" min="0" max="2000" step="100" value={val}
                      onChange={e => { const c = [...simSpends]; c[i] = parseInt(e.target.value); setSimSpends(c); }} />
                    <span className="sim-slider-val">Rs.{val.toLocaleString()}</span>
                    <span className="sim-slider-tag" style={{ color: val<=1500?"var(--accent)":val<=1800?"var(--warn)":"var(--danger)" }}>
                      {val===0?"FULL SAV":val<=1500?"SAVED":val<=1800?"PARTIAL":"NO SAV"}
                    </span>
                  </div>
                ))}

                <div className="sim-preview" style={{ marginTop:14 }}>
                  Pattern total: <strong style={{ color:"var(--text)" }}>Rs.{simMonthTotal.toLocaleString()}</strong>
                  &nbsp;&nbsp;·&nbsp;&nbsp;
                  Expected reward: <strong style={{ color: simMonthReward>=3000?"var(--accent)":simMonthReward>=1000?"var(--warn)":"var(--danger)" }}>Rs.{simMonthReward.toLocaleString()}</strong>
                  &nbsp;&nbsp;·&nbsp;&nbsp;
                  Rate: <strong style={{ color:"var(--accent2)" }}>{Math.round((simMonthReward/MAX_REWARD)*100)}%</strong>
                </div>

                <div className="sim-actions">
                  <button className="sim-btn sim-btn-primary" onClick={applySimulation}><FastForward size={13}/> Apply Simulation</button>
                  <button className="sim-btn sim-btn-ghost"   onClick={advanceOneWeek}><SkipForward size={13}/>  +1 Week</button>
                  <button className="sim-btn sim-btn-danger"  onClick={resetSimulation}><RotateCcw size={13}/>   Reset All</button>
                </div>

                {simActive && (
                  <div className="sim-status">
                    {[["Week", `${cw}/52`], ["Month", `${currentMonth}/12`], ["Completed Wks", completedWeeks.length], ["Savings Wks", savedWeeks], ["Mo. Spend", `Rs.${monthSpend.toLocaleString()}`], ["Mo. Reward", `Rs.${monthReward.toLocaleString()}`]].map(([l,v]) => (
                      <div className="sim-status-chip" key={l}>
                        <div className="sim-status-dot"/>
                        <span style={{ color:"var(--text2)" }}>{l}:</span>
                        <span style={{ color: l==="Mo. Reward"?"var(--accent)":"var(--text)" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Budget overview */}
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
                <Shield size={13} color="var(--accent2)"/>
                <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--accent2)", letterSpacing:1.5 }}>FULL BUDGET — ADMIN ONLY</span>
              </div>
              <div className="admin-grid">
                {[
                  { label:"TOTAL BUDGET",     val:`Rs.${TOTAL_BUDGET.toLocaleString()}`,                                     color:"var(--accent2)" },
                  { label:"TOTAL WITHDRAWN",  val:`Rs.${state.totalWithdrawn.toLocaleString()}`,                             color:"var(--warn)" },
                  { label:"REMAINING BUDGET", val:`Rs.${(TOTAL_BUDGET-state.totalWithdrawn).toLocaleString()}`,              color:"var(--accent)" },
                  { label:"REWARDS CLAIMED",  val:`Rs.${state.totalRewardsClaimed.toLocaleString()}`,                        color:"var(--reward)" },
                  { label:"CURRENT WEEK",     val:`${cw} / 52`,                                                              color:"var(--text)" },
                  { label:"SAVINGS WEEKS",    val:`${savedWeeks}`,                                                           color:"var(--accent)" },
                ].map(item => (
                  <div className="admin-stat" key={item.label}>
                    <div className="card-label">{item.label}</div>
                    <div className="admin-stat-val" style={{ color:item.color }}>{item.val}</div>
                  </div>
                ))}
              </div>

              {/* 52-week ledger */}
              <div className="card">
                <div className="section-title"><BarChart2 size={13}/> 52-Week Ledger</div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>WEEK</th><th>MONTH</th><th>WITHDRAWN</th><th>SAVED</th><th>MONTH-END REWARD</th><th>STATUS</th></tr>
                    </thead>
                    <tbody>
                      {state.weeks.map(w => {
                        const isCur   = w.week === cw;
                        const savedOk = w.completed && w.withdrawn <= 1500;
                        const isEnd   = isMonthEnd(w.week);
                        const mreward = isEnd ? state.monthRewards[w.month] : null;
                        return (
                          <tr key={w.week} style={isCur ? { background:"rgba(200,240,96,.025)" } : isEnd && w.completed ? { background:"rgba(240,208,96,.02)" } : {}}>
                            <td style={{ fontFamily:"var(--font-mono)", color:isCur?"var(--accent)":"var(--text2)" }}>W{w.week}</td>
                            <td style={{ fontFamily:"var(--font-mono)", color:"var(--text2)" }}>M{w.month}</td>
                            <td className="td-warn" style={{ fontFamily:"var(--font-mono)" }}>
                              {w.completed||isCur ? `Rs.${w.withdrawn.toLocaleString()}` : "—"}
                            </td>
                            <td className="td-accent" style={{ fontFamily:"var(--font-mono)" }}>
                              {w.completed||isCur ? `Rs.${(WEEKLY_ALLOW-w.withdrawn).toLocaleString()}` : "—"}
                            </td>
                            <td style={{ fontFamily:"var(--font-mono)" }}>
                              {isEnd && mreward
                                ? <span className={`payout-chip ${mreward.claimed?"payout-chip-yes":"payout-chip-pending"}`}>
                                    Rs.{mreward.reward.toLocaleString()} {mreward.claimed?"✓":"⏳"}
                                  </span>
                                : isEnd && w.completed
                                ? <span className="payout-chip payout-chip-no">Rs.0</span>
                                : <span style={{ color:"var(--border)" }}>—</span>
                              }
                            </td>
                            <td>
                              {isCur
                                ? <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--accent2)" }}>● ACTIVE</span>
                                : w.completed
                                ? <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:savedOk?"var(--accent)":"var(--text2)" }}>
                                    {savedOk ? "SAVED ✓" : "DONE"}
                                  </span>
                                : <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--border)" }}>LOCKED</span>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════
              REWARDS / PROJECTION
          ══════════════════════════════════════ */}
          {tab === "projection" && (
            <>
              <div className="card" style={{ marginBottom:24 }}>
                <div className="section-title"><TrendingUp size={13}/> 6-Month Perfect Savings Projection</div>
                <div className="info-box info" style={{ marginBottom:20 }}>
                  <Gift size={13} style={{ flexShrink:0 }}/>
                  <span>Spend Rs.1,500/week × 4 = Rs.6,000/month → receive Rs.4,000 reward at end of each month's 4th week</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>MONTH</th><th>W1</th><th>W2</th><th>W3</th><th>W4 (PAYOUT)</th><th>SPENT</th><th>REWARD</th><th>CUMUL. SPENT</th><th>CUMUL. REWARDS</th><th>TOTAL IN HAND</th></tr>
                    </thead>
                    <tbody>
                      {Array.from({length:6},(_,i)=>{
                        const m   = i+1;
                        const cs  = m*6000;
                        const cr  = m*4000;
                        return (
                          <tr key={m}>
                            <td style={{ fontFamily:"var(--font-mono)", color:"var(--text2)" }}>M{m}</td>
                            {[1500,1500,1500,1500].map((v,j) => <td key={j} className="td-accent" style={{ fontFamily:"var(--font-mono)" }}>Rs.{v.toLocaleString()}</td>)}
                            <td className="td-warn"   style={{ fontFamily:"var(--font-mono)" }}>Rs.6,000</td>
                            <td className="td-reward" style={{ fontFamily:"var(--font-mono)", fontWeight:700 }}>+ Rs.4,000</td>
                            <td style={{ fontFamily:"var(--font-mono)" }}>Rs.{cs.toLocaleString()}</td>
                            <td className="td-accent2" style={{ fontFamily:"var(--font-mono)" }}>Rs.{cr.toLocaleString()}</td>
                            <td style={{ fontFamily:"var(--font-mono)", fontWeight:700 }}>Rs.{(cs+cr).toLocaleString()}</td>
                          </tr>
                        );
                      })}
                      <tr style={{ borderTop:"1px solid var(--border)" }}>
                        <td style={{ fontFamily:"var(--font-mono)", fontWeight:700}}>6-Mo Total</td>
                        <td colSpan={4} style={{ fontFamily:"var(--font-mono)", color:"var(--text2)", fontSize:11 }}>All weeks @ Rs.1,500</td>
                        <td className="td-warn"   style={{ fontFamily:"var(--font-mono)", fontWeight:700 }}>Rs.36,000</td>
                        <td className="td-reward" style={{ fontFamily:"var(--font-mono)", fontWeight:700 }}>Rs.24,000</td>
                        <td style={{ fontFamily:"var(--font-mono)", fontWeight:700 }}>Rs.36,000</td>
                        <td className="td-accent2" style={{ fontFamily:"var(--font-mono)", fontWeight:700 }}>Rs.24,000</td>
                        <td style={{ fontFamily:"var(--font-mono)", fontWeight:700 }}>Rs.60,000</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop:14, fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text2)", lineHeight:1.9 }}>
                  6 months of perfect savings: Rs.36,000 spent + Rs.24,000 rewards =
                  <strong style={{ color:"var(--accent)" }}> Rs.60,000 in hand</strong>. 
                  That's a <strong style={{ color:"var(--accent)" }}>66.7% bonus</strong> on actual spend — 
                  all within the Rs.1,20,000 annual budget.
                </div>
              </div>

              {/* Reward scale */}
              <div className="card">
                <div className="section-title"><Gift size={13}/> Monthly Reward Scale</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text2)", marginBottom:16, lineHeight:1.7 }}>
                  Spend Rs.6k → full Rs.4k reward. Spend Rs.8k → zero reward. Anything between scales linearly.
                  Reward is paid out at the end of the 4th week of each month.
                </div>
                <div className="reward-scenarios">
                  {scenarios.map(s => {
                    const reward = calcReward(s.spend);
                    const pct    = Math.round((reward/MAX_REWARD)*100);
                    return (
                      <div className="scenario-row" key={s.spend}>
                        <div style={{ flex:1 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                            <span className="scenario-spend">{s.label}</span>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <span style={{ fontFamily:"var(--font-mono)", fontSize:13, fontWeight:600, color: reward===0?"var(--danger)":reward>=3000?"var(--reward)":"var(--warn)" }}>
                                Rs.{reward.toLocaleString()} reward
                              </span>
                              <span className="scenario-pct">{pct}%</span>
                            </div>
                          </div>
                          <div className="progress-track">
                            <div className="progress-fill" style={{ width:`${pct}%`, background: reward===0?"var(--danger)":reward>=3000?"var(--accent)":"var(--warn)" }}/>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="divider"/>

                <div className="section-title"><AlertCircle size={13}/> Mixed Month Example</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--text2)", marginBottom:14, lineHeight:1.9 }}>
                  W1: Rs.2,000 (no save) · W2: Rs.1,500 (saved Rs.500) · W3: Rs.2,000 (no save) · W4: Rs.1,500 (saved Rs.500)
                </div>
                <div className="scenario-row" style={{ background:"rgba(96,200,240,.04)", borderColor:"rgba(96,200,240,.15)" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                      <span className="scenario-spend" style={{ color:"var(--accent2)" }}>Total: Rs.7,000 spent → reward unlocks at Week 4</span>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontFamily:"var(--font-mono)", fontSize:13, fontWeight:600, color:"var(--warn)" }}>Rs.{calcReward(7000).toLocaleString()} payout</span>
                        <span className="scenario-pct">{Math.round((calcReward(7000)/MAX_REWARD)*100)}%</span>
                      </div>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width:`${Math.round((calcReward(7000)/MAX_REWARD)*100)}%`, background:"var(--warn)"}}/>
                    </div>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text2)", marginTop:8 }}>
                      2/4 weeks met Rs.500 savings target → Rs.{calcReward(7000).toLocaleString()} partial payout (vs full Rs.{MAX_REWARD.toLocaleString()})
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
