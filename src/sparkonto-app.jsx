import { useState, useEffect, useCallback } from "react";
import {
  Lock, TrendingUp, Clock, LogOut, Shield, BarChart2,
  Gift, AlertCircle, CheckCircle, Calendar, FastForward,
  SkipForward, RotateCcw, FlaskConical, Sparkles, PartyPopper,
  Wallet, ArrowDownToLine, Landmark, ScanFace
} from "lucide-react";
import { supabaseSelect, supabaseUpsert } from "./utils/supabaseClient";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const TOTAL_BUDGET   = 120000;
const WEEKLY_ALLOW   = 2000;
const SAVE_TARGET    = 500;   // save ≥500/wk → spend ≤1500
const MAX_REWARD     = 4000;  // full month reward
const WEEK_COUNT     = 52;
const WEEKS_PER_MON  = 4;
const MAX_MONTHLY    = WEEKLY_ALLOW * WEEKS_PER_MON; // 8000
const STORAGE_KEY    = "sparkonto_state_v1";
const SUPABASE_TABLE = "sparkonto_state";

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
    @import url('https://fonts.googleapis.com/css2?family=Nunito:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,600;1,700&family=Noto+Sans+Devanagari:wght@400;500;600;700;800&display=swap');

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
      --font-mono:    'Nunito', sans-serif;
      --radius: 16px;
    }
    body { background: var(--bg); color: var(--text); font-family: var(--font-display); min-height: 100vh; overflow-x: hidden; }
    .app { min-height: 100vh; }
    .app.lang-ne {
      --font-display: 'Noto Sans Devanagari', sans-serif;
      --font-mono: 'Noto Sans Devanagari', sans-serif;
    }

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
    .timer-num { font-size:32px; font-weight:800; letter-spacing:-1px; font-family:var(--font-display); color:var(--accent2); }
    .timer-lbl { font-size:9px; color:var(--text2); font-family:var(--font-display); letter-spacing:1.5px; }
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

    .grid-3 { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
    .grid-4 { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
    .final-week-card { padding:24px 32px; }
    .final-week-grid { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:0; position:relative; }
    .final-week-center { display:flex; flex-direction:column; align-items:center; gap:8px; padding:0 28px; }
    .final-week-proj { margin-top:20px; padding-top:18px; border-top:1px solid rgba(96,200,240,0.15); display:flex; flex-direction:column; gap:10px; }
    .final-week-proj-row { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }

    @media (max-width:480px) {
      .final-week-card { padding:18px 20px; }
      .final-week-grid { grid-template-columns:1fr 1fr; }
      .final-week-center { display:none; }
      .final-week-proj-row { flex-direction:column; align-items:flex-start; gap:4px; }
    }

    @media (max-width:768px) {
      .main { padding:16px; }
      .grid-2 { grid-template-columns:1fr; }
      .grid-3 { grid-template-columns:1fr 1fr; }
      .grid-4 { grid-template-columns:1fr 1fr; }
      .admin-grid { grid-template-columns:1fr 1fr; }
      .sim-grid { grid-template-columns:1fr; }
      .header { padding:16px; }
      .header-title { font-size:20px; }
      .reward-banner { flex-direction:column; align-items:flex-start; }
    }

    @media (max-width:480px) {
      .grid-3 { grid-template-columns:1fr; }
      .grid-4 { grid-template-columns:1fr 1fr; }
      .final-week-grid { grid-template-columns:1fr 1fr; row-gap:16px; }
      .final-week-grid > :nth-child(2) { display:none; }
      .tabs { flex-wrap:wrap; }
      .tab { flex:unset; width:calc(50% - 4px); font-size:13px; }
      .stats-row { grid-template-columns:1fr 1fr; }
      .stat-item:last-child { grid-column:1/-1; border-right:none; border-top:1px solid var(--border); }
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
  const [loginPin,      setLoginPin]      = useState("");
  const [loginErr,      setLoginErr]      = useState("");
  const [state,      setState]      = useState(initState);
  const [withdrawAmt,setWithdrawAmt]= useState("");
  const [tab,        setTab]        = useState("dashboard");
  const [lang,       setLang]       = useState("en");
  const [toast,      setToast]      = useState(null);
  const [hydrated,   setHydrated]   = useState(false); // has initial load from Supabase run?

  // sim
  const [simActive,  setSimActive]  = useState(false);
  const [simWeek,    setSimWeek]    = useState("1");
  const [simDT,      setSimDT]      = useState("");
  const [simSpends,  setSimSpends]  = useState([2000, 2000, 2000, 2000]);

  const timer = useCountdown(simActive && simDT ? simDT : null);
  const isNepali = user === "user" && lang === "ne";
  const tx = useCallback((en, ne) => (isNepali ? ne : en), [isNepali]);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }, []);

  // ── PERSISTENCE ──
  // Load from Supabase on first mount (if available)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await supabaseSelect(SUPABASE_TABLE, `id=eq.${encodeURIComponent(STORAGE_KEY)}`);
        if (cancelled || !Array.isArray(rows) || rows.length === 0) {
          setHydrated(true);
          return;
        }
        const row = rows[0];
        const data = row?.data;
        if (data && Array.isArray(data.weeks)) {
          setState(prev => ({
            ...prev,
            weeks: data.weeks ?? prev.weeks,
            totalWithdrawn: data.totalWithdrawn ?? prev.totalWithdrawn,
            currentWeek: data.currentWeek ?? prev.currentWeek,
            monthRewards: data.monthRewards ?? prev.monthRewards,
            totalRewardsClaimed: data.totalRewardsClaimed ?? prev.totalRewardsClaimed,
          }));
        }
      } catch {
        // ignore network / corrupt data
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // Save core state to Supabase whenever it changes (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    const payload = {
      version: 1,
      weeks: state.weeks,
      totalWithdrawn: state.totalWithdrawn,
      currentWeek: state.currentWeek,
      monthRewards: state.monthRewards,
      totalRewardsClaimed: state.totalRewardsClaimed,
    };
    (async () => {
      try {
        await supabaseUpsert(SUPABASE_TABLE, { id: STORAGE_KEY, data: payload });
      } catch {
        showToast(tx("Sync failed", "सिंक असफल भयो"), "warn");
      }
    })();
  }, [hydrated, showToast, state.weeks, state.totalWithdrawn, state.currentWeek, state.monthRewards, state.totalRewardsClaimed, tx]);

  const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN ?? "0544";

  // ── AUTH ── (admin login only when opened via Admin button; PIN from .env)
  function handleLogin() {
    if (showAdminLogin) {
      if (loginPin === String(ADMIN_PIN)) {
        setUser("admin");
        setLoginErr("");
        setShowAdminLogin(false);
        setLoginPin("");
      } else setLoginErr("Invalid PIN");
      return;
    }
  }

  // ── WITHDRAW ──
  function handleWithdraw() {
    const amt = withdrawAmt === "" || withdrawAmt === null ? NaN : parseInt(withdrawAmt, 10);
    if (isNaN(amt) || amt < 0) return showToast(tx("Enter a valid amount", "मान्य रकम प्रविष्ट गर्नुहोस्"), "warn");
    const wk        = state.weeks[state.currentWeek - 1];
    const remaining = WEEKLY_ALLOW - wk.withdrawn;
    if (amt > remaining) return showToast(tx(`Only Rs.${remaining.toLocaleString()} left this week`, `यो हप्तामा Rs.${remaining.toLocaleString()} मात्र बाँकी छ`), "warn");
    setState(prev => {
      const weeks = [...prev.weeks];
      weeks[prev.currentWeek - 1] = { ...wk, withdrawn: wk.withdrawn + amt };
      return { ...prev, weeks, totalWithdrawn: prev.totalWithdrawn + amt };
    });
    setWithdrawAmt("");
    if (amt === 0) showToast(tx("Rs.0 — saving for reward!", "Rs.0 — रिवार्डको लागि बचत हुँदैछ!"), "success");
    else showToast(tx(`Rs.${amt.toLocaleString()} withdrawn`, `Rs.${amt.toLocaleString()} निकालियो`), "success");
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
    showToast(tx("⏭ Advanced to next week", "⏭ अर्को हप्तामा सारियो"), "success");
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
    showToast(tx(
      `🎉 Rs.${state.monthRewards[month]?.reward?.toLocaleString()} reward claimed!`,
      `🎉 Rs.${state.monthRewards[month]?.reward?.toLocaleString()} रिवार्ड दाबी गरियो!`
    ), "success");
  }

  // ── SIM ──
  function applySimulation() {
    const target = parseInt(simWeek);
    if (!target || target < 1 || target > WEEK_COUNT) return showToast(tx("Enter a valid week (1–52)", "मान्य हप्ता प्रविष्ट गर्नुहोस् (1–52)"), "warn");

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
    showToast(tx(`Simulated to Week ${target}`, `हप्ता ${target} सम्म सिमुलेट गरियो`), "success");
  }

  function resetSimulation() {
    setState(initState());
    setSimWeek("1"); setSimDT(""); setSimActive(false);
    setSimSpends([2000, 2000, 2000, 2000]);
    showToast(tx("Reset to Week 1", "हप्ता 1 मा रिसेट गरियो"), "warn");
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

  // Final week projection: how much can they withdraw and keep 100%? What if they use full allowance?
  const finalWeekMaxSafeWithdraw = isLastWeekOfMon ? Math.min(weekRemaining, Math.max(0, 6000 - monthSpend)) : 0;
  const monthSpendIfFullWeek     = monthSpend + weekRemaining;
  const rewardIfFullWeek        = calcReward(monthSpendIfFullWeek);
  const pctIfFullWeek           = Math.round((rewardIfFullWeek / MAX_REWARD) * 100);

  // Remaining allowance in month (this week left + all future weeks in this month)
  const remainingWeeksInMonth   = 4 - weekInMonth;
  const remainingAllowanceMonth  = weekRemaining + remainingWeeksInMonth * WEEKLY_ALLOW;
  const maxWithdrawFor100       = Math.max(0, Math.min(6000 - monthSpend, remainingAllowanceMonth));
  const maxWithdrawFor75        = Math.max(0, Math.min(6500 - monthSpend, remainingAllowanceMonth));
  const maxWithdrawFor50        = Math.max(0, Math.min(7000 - monthSpend, remainingAllowanceMonth));
  const maxWithdrawFor25        = Math.max(0, Math.min(7500 - monthSpend, remainingAllowanceMonth));

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


  // ── ADMIN LOGIN SCREEN (only when user clicked "Admin") ──
  if (showAdminLogin) return (
    <>
      <GlobalStyles />
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">
            <div className="logo-ring"><Landmark size={26} color="var(--accent)" /></div>
            <h1>Sparty</h1>
            <span>ADMIN ACCESS</span>
          </div>
          <div className="login-field">
            <label>PIN</label>
            <input type="password" inputMode="numeric" value={loginPin} onChange={e => setLoginPin(e.target.value)}
              placeholder="Enter PIN" onKeyDown={e => e.key === "Enter" && handleLogin()} autoFocus maxLength={6} />
          </div>
          {loginErr && <div className="login-error">{loginErr}</div>}
          <button className="login-btn" onClick={handleLogin}>Enter the Vault</button>
          <button type="button" onClick={() => { setShowAdminLogin(false); setLoginErr(""); setLoginPin(""); }}
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
      <div className={`app ${isNepali ? "lang-ne" : ""}`}>

        {/* Toast */}
        {toast && (
          <div style={{ position:"fixed", left:"50%", top:"50%", transform:"translate(-50%, -50%)", zIndex:9999, padding:"13px 20px", borderRadius:12,
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
            <div
              style={{ width:40, height:40, borderRadius:"50%", border:"2px solid var(--accent)", display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(200,240,96,0.05)", cursor:"pointer" }}
              onDoubleClick={() => setShowAdminLogin(true)}
            >
              <Landmark size={16} color="var(--accent)" />
            </div>
            <div>
              <div className="header-title">Sparty</div>
              <div className="header-sub">{tx("BLOCKED SAVINGS", "ब्लक गरिएको बचत")}</div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {simActive && <span className="badge badge-sim">SIM · W{cw} M{currentMonth}</span>}
            <span className={`badge ${user === "admin" ? "badge-admin" : "badge-user"}`} style={user === "user" ? { display:"inline-flex", alignItems:"center", gap:6, fontSize:14, fontWeight:700 } : {}}>
              {user === "admin" ? "ADMIN" : <>Hi, Dilip <ScanFace size={15} /></>}
            </span>
            {user === "admin" && (
              <button className="logout-btn" onClick={() => { setUser("user"); setLoginPin(""); setShowAdminLogin(false); }}>
                <LogOut size={13}/> {tx("Sign out", "साइन आउट")}
              </button>
            )}
          </div>
        </div>

        <div className="main">
          {/* Tabs */}
          <div className="tabs">
            <button className={`tab ${tab==="dashboard"?"active":""}`} onClick={() => setTab("dashboard")}>
              {tx("Dashboard", "ड्यासबोर्ड")}
            </button>
            {user === "admin" && (
              <button className={`tab ${tab==="admin"?"active":""}`} onClick={() => setTab("admin")}>Admin</button>
            )}
            <button className={`tab ${tab==="ledger"?"active":""}`} onClick={() => setTab("ledger")}>
              {tx("Monthly Ledger", "मासिक लेजर")}
            </button>
            <button className={`tab ${tab==="projection"?"active":""}`} onClick={() => setTab("projection")}>
              {tx("Rewards", "रिवार्ड")}
            </button>
            {user === "user" && (
              <button className={`tab ${isNepali ? "active" : ""}`} onClick={() => setLang(prev => prev === "ne" ? "en" : "ne")}>
                {isNepali ? "English 🇬🇧" : "Nepali 🇳🇵"}
              </button>
            )}
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
                    <div className="reward-banner-title">{tx(`Month ${prevMonth} Reward Ready!`, `महिना ${prevMonth} को रिवार्ड तयार छ!`)}</div>
                    <div className="reward-banner-sub">
                      {tx(
                        `You spent Rs.${prevMonthData.spend?.toLocaleString()} last month (${prevMonthData.rewardPct ?? Math.round((prevMonthData.reward / MAX_REWARD) * 100)}% savings efficiency) — your reward has been unlocked.`,
                        `तपाईंले गत महिना Rs.${prevMonthData.spend?.toLocaleString()} खर्च गर्नुभयो (${prevMonthData.rewardPct ?? Math.round((prevMonthData.reward / MAX_REWARD) * 100)}% बचत दक्षता) — तपाईंको रिवार्ड खुला भएको छ।`
                      )}
                    </div>
                    <button className="reward-claim-btn" onClick={() => claimReward(prevMonth)}>
                      <ArrowDownToLine size={15} /> {tx(`Claim Rs.${prevMonthData.reward.toLocaleString()} Reward`, `Rs.${prevMonthData.reward.toLocaleString()} रिवार्ड दाबी गर्नुहोस्`)}
                    </button>
                  </div>
                  <div className="reward-banner-amount">Rs.{prevMonthData.reward.toLocaleString()}</div>
                </div>
              )}

              {/* ─ CLAIMED BUT FRESH ─ */}
              {prevMonthData?.claimed && (
                <div className="info-box success" style={{ animation:"slideUp .3s ease" }}>
                  <CheckCircle size={14} style={{ flexShrink:0, marginTop:1 }}/>
                  <span>{tx(`Month ${prevMonth} reward of Rs.${prevMonthData.reward.toLocaleString()} claimed ✓ — keep it up!`, `महिना ${prevMonth} को Rs.${prevMonthData.reward.toLocaleString()} रिवार्ड दाबी गरियो ✓ — यस्तै जारी राख्नुहोस्!`)}</span>
                </div>
              )}

              {/* ─ END OF MONTH WARNING ─ */}
              {isLastWeekOfMon && (
                <div className="final-week-card" style={{
                  display:"flex", flexDirection:"column",
                  background:"linear-gradient(135deg, rgba(96,200,240,0.07) 0%, rgba(200,240,96,0.05) 100%)",
                  border:"1px solid rgba(96,200,240,0.25)", borderRadius:"var(--radius)",
                  animation:"slideUp .3s ease", overflow:"hidden", position:"relative"
                }}>
                  {/* Glow blob */}
                  <div style={{ position:"absolute", inset:0, pointerEvents:"none",
                    background:"radial-gradient(ellipse 60% 80% at 50% -10%, rgba(96,200,240,0.08), transparent)" }} />

                  {/* Top row: Spent | Center label | Reward */}
                  <div className="final-week-grid">
                    {/* Left — spent */}
                    <div style={{ display:"flex", flexDirection:"column", gap:4, position:"relative" }}>
                      <span style={{ fontFamily:"var(--font-display)", fontSize:11, fontWeight:700, letterSpacing:2, color:"var(--text2)", textTransform:"uppercase" }}>{tx("Spent", "खर्च")}</span>
                      <span style={{ fontFamily:"var(--font-display)", fontSize:34, fontWeight:800, color:"var(--warn)", lineHeight:1, letterSpacing:"-0.5px" }}>
                        Rs.{monthSpend.toLocaleString()}
                      </span>
                      <div style={{ marginTop:6, height:4, background:"var(--surface2)", borderRadius:99, maxWidth:120 }}>
                        <div style={{ height:"100%", borderRadius:99, width:`${Math.min((monthSpend/8000)*100,100)}%`,
                          background: monthSpend<=6000?"var(--accent)":monthSpend<=7000?"var(--warn)":"var(--danger)",
                          transition:"width .6s" }} />
                      </div>
                    </div>

                    {/* Center label — hidden on mobile via CSS */}
                    <div className="final-week-center">
                      <Sparkles size={20} color="var(--accent2)" />
                      <span style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:800, letterSpacing:2, color:"var(--accent2)", textTransform:"uppercase", whiteSpace:"nowrap" }}>
                        {tx("Final Week", "अन्तिम हप्ता")}
                      </span>
                      <span style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:600, color:"var(--text2)", letterSpacing:1 }}>
                        M{currentMonth} · W4
                      </span>
                    </div>

                    {/* Right — reward */}
                    <div style={{ display:"flex", flexDirection:"column", gap:4, alignItems:"flex-end", position:"relative" }}>
                      <span style={{ fontFamily:"var(--font-display)", fontSize:11, fontWeight:700, letterSpacing:2, color:"var(--text2)", textTransform:"uppercase" }}>{tx("Reward", "रिवार्ड")}</span>
                      <span style={{ fontFamily:"var(--font-display)", fontSize:34, fontWeight:800, lineHeight:1, letterSpacing:"-0.5px",
                        color: monthReward>=3000?"var(--accent)":monthReward>=1000?"var(--warn)":"var(--danger)" }}>
                        Rs.{monthReward.toLocaleString()}
                      </span>
                      <span style={{ fontFamily:"var(--font-display)", fontSize:11, fontWeight:700,
                        color: monthReward>=3000?"var(--accent)":monthReward>=1000?"var(--warn)":"var(--danger)", opacity:0.9 }}>
                        {tx(`${monthRewardPct}% now`, `अहिले ${monthRewardPct}%`)}
                      </span>
                    </div>
                  </div>

                  {/* Projection strip */}
                  <div className="final-week-proj" style={{ position:"relative" }}>
                    {monthSpend <= 6000 && (
                      <div className="final-week-proj-row">
                        <span style={{ fontFamily:"var(--font-display)", fontSize:13, color:"var(--text2)", fontWeight:600 }}>{tx("To keep 100% reward:", "100% रिवार्ड कायम राख्न:")}</span>
                        <span style={{ fontFamily:"var(--font-display)", fontSize:13, color:"var(--accent)", fontWeight:800 }}>
                          {tx(`withdraw ≤ Rs.${finalWeekMaxSafeWithdraw.toLocaleString()} this week`, `यो हप्ता ≤ Rs.${finalWeekMaxSafeWithdraw.toLocaleString()} निकाल्नुहोस्`)}
                        </span>
                      </div>
                    )}
                    {monthSpend > 6000 && (
                      <div className="final-week-proj-row">
                        <span style={{ fontFamily:"var(--font-display)", fontSize:13, color:"var(--text2)", fontWeight:600 }}>{tx("100% reward no longer possible this month", "यो महिनामा 100% रिवार्ड अब सम्भव छैन")}</span>
                      </div>
                    )}
                    {weekRemaining > 0 && (
                      <div className="final-week-proj-row">
                        <span style={{ fontFamily:"var(--font-display)", fontSize:13, color:"var(--text2)", fontWeight:600 }}>{tx(`If you use full Rs.${weekRemaining.toLocaleString()} left:`, `यदि बाँकी Rs.${weekRemaining.toLocaleString()} पूरा प्रयोग गर्नुभयो भने:`)}</span>
                        <span style={{ fontFamily:"var(--font-display)", fontSize:13, fontWeight:800,
                          color: rewardIfFullWeek>=3000?"var(--accent)":rewardIfFullWeek>=1000?"var(--warn)":"var(--danger)" }}>
                          {tx(`${pctIfFullWeek}% → Rs.${rewardIfFullWeek.toLocaleString()} reward`, `${pctIfFullWeek}% → Rs.${rewardIfFullWeek.toLocaleString()} रिवार्ड`)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="grid-2">
                {/* Left — circle + withdraw */}
                <div className="card circle-section">
                  <CircularProgress pct={weekPct} size={210} color={ringColor}>
                    <div className="circle-main-val" style={{ color: ringColor }}>
                      Rs.{weekWithdrawn.toLocaleString()}
                    </div>
                    <div className="circle-main-label">{tx("WITHDRAWN", "निकालिएको")}</div>
                    <div className="circle-sub">{tx(`of Rs.${WEEKLY_ALLOW.toLocaleString()}`, `जम्मा Rs.${WEEKLY_ALLOW.toLocaleString()} मध्ये`)}</div>
                  </CircularProgress>

                  <div className="stats-row">
                    <div className="stat-item">
                      <span className="stat-lbl">{tx("REMAINING", "बाँकी")}</span>
                      <span className="stat-val" style={{ color:"var(--accent)" }}>Rs.{weekRemaining.toLocaleString()}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-lbl">{tx("SAVED THIS WK", "यो हप्ता बचत")}</span>
                      <span className="stat-val" style={{ color: weekWithdrawn <= 1500 ? "var(--accent)" : "var(--warn)" }}>
                        Rs.{(WEEKLY_ALLOW - weekWithdrawn).toLocaleString()}
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-lbl">{tx(`WEEK ${weekInMonth}/4`, `हप्ता ${weekInMonth}/4`)}</span>
                      <span className="stat-val">{cw}<span style={{ fontSize:11, color:"var(--text2)", fontStyle:"normal" }}>/52</span></span>
                    </div>
                  </div>

                  <div className="withdraw-section" style={{ width:"100%" }}>
                    <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
                      {[1000, 1500, 2000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          className="withdraw-btn"
                          style={{ flex:1, minWidth:80, opacity: withdrawAmt === String(amt) ? 1 : 0.85, background:"rgba(96, 200, 240, 0.06)", border:"1px solid rgba(96, 200, 240, 0.18)", color:"var(--accent2)" }}
                          onClick={() => { setWithdrawAmt(String(amt)); showToast(`Rs.${amt.toLocaleString()} selected`, "success"); }}
                          disabled={weekRemaining <= 0}
                        >
                          Rs.{amt.toLocaleString()}
                        </button>
                      ))}
                    </div>
                    <div className="withdraw-input-row">
                      <input className="withdraw-input" type="number" min={0} placeholder={tx("Amount (0 to save for reward)", "रकम (रिवार्डका लागि बचत गर्न 0)")}
                        value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleWithdraw()} max={weekRemaining} />
                      <button className="withdraw-btn" onClick={handleWithdraw} disabled={weekRemaining <= 0}>
                        {tx("Withdraw", "निकाल्नुहोस्")}
                      </button>
                    </div>
                    {weekRemaining >= SAVE_TARGET && weekWithdrawn < WEEKLY_ALLOW && (
                      <div className="info-box success">
                        <Gift size={13} style={{ flexShrink:0, marginTop:1 }}/>
                        <span>{tx("Spend ≤ Rs.1,500 this week — contributes to your month-end reward!", "यो हप्ता ≤ Rs.1,500 खर्च गर्नुहोस् — महिना अन्त्यको रिवार्डमा योगदान हुन्छ!")}</span>
                      </div>
                    )}
                    {weekRemaining < SAVE_TARGET && weekRemaining > 0 && (
                      <div className="info-box warn">
                        <AlertCircle size={13} style={{ flexShrink:0, marginTop:1 }}/>
                        <span>{tx("Spent past savings target this week — partial reward will apply", "यो हप्ता बचत लक्ष्यभन्दा बढी खर्च भयो — आंशिक रिवार्ड लागू हुनेछ")}</span>
                      </div>
                    )}
                    {weekRemaining === 0 && (
                      <div className="info-box warn">
                        <AlertCircle size={13} style={{ flexShrink:0, marginTop:1 }}/>
                        <span>{tx("Weekly limit reached — next withdrawal unlocks on Sunday", "साप्ताहिक सीमा पुगेको छ — अर्को निकासी आइतबार खुल्छ")}</span>
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
                    <div className="section-title"><Clock size={13}/> {tx("Next Withdrawal Unlock", "अर्को निकासी खुल्ने समय")}</div>
                    <div className="timer-display">
                      {[
                        ["d", tx("DAYS", "दिन")],
                        ["h", tx("HRS", "घण्टा")],
                        ["m", tx("MIN", "मिनेट")],
                        ["s", tx("SEC", "सेकेन्ड")]
                      ].map(([k,label],i) => (
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
                      {simActive && simDT ? tx("SIMULATED TIME", "सिमुलेट गरिएको समय") : tx("RESETS EVERY SUNDAY AT 00:00", "हरेक आइतबार 00:00 मा रिसेट हुन्छ")}
                    </div>
                  </div>

                  {/* Month reward meter */}
                  <div className="card">
                    <div className="section-title"><TrendingUp size={13}/> {tx(`Month ${currentMonth} Reward Meter`, `महिना ${currentMonth} रिवार्ड मिटर`)}</div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:16 }}>
                      <div>
                        <div className="card-label">{tx("PROJECTED BONUS", "अनुमानित बोनस")}</div>
                        <div style={{ fontFamily:"var(--font-display)", fontSize:28, fontWeight:800, letterSpacing:-1, color: monthReward >= 3000 ? "var(--accent)" : monthReward >= 1500 ? "var(--warn)" : "var(--danger)" }}>
                          Rs.{monthReward.toLocaleString()}
                        </div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div className="card-label">{tx("EFFICIENCY", "दक्षता")}</div>
                        <div style={{ fontFamily:"var(--font-display)", fontSize:28, fontWeight:800, letterSpacing:-1, color:"var(--accent2)" }}>{monthRewardPct}%</div>
                        <div style={{ fontFamily:"var(--font-display)", fontSize:10, color:"var(--text2)", marginTop:2 }}>{tx("at current spend", "हालको खर्चमा")}</div>
                      </div>
                    </div>

                    {/* Suggestion: withdraw ≤ X in remaining weeks → 100% / 75% / 50% / 25% (weeks 1–3 only) */}
                    {weekInMonth < 4 && remainingAllowanceMonth > 0 && (
                      <div style={{
                        marginBottom:16, padding:"12px 16px", background:"rgba(96,200,240,0.06)", border:"1px solid rgba(96,200,240,0.18)", borderRadius:10,
                        fontFamily:"var(--font-display)"
                      }}>
                        <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.5, color:"var(--accent2)", marginBottom:10, textTransform:"uppercase" }}>
                          {tx(`In remaining weeks (W${weekInMonth} left + ${remainingWeeksInMonth} more): withdraw ≤`, `बाँकी हप्ताहरूमा (W${weekInMonth} बाँकी + ${remainingWeeksInMonth} थप): ≤ निकाल्नुहोस्`)}
                        </div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"center" }}>
                          {maxWithdrawFor100 > 0 && (
                            <span style={{ fontSize:12, fontWeight:700 }}><span style={{ color:"var(--accent)" }}>Rs.{maxWithdrawFor100.toLocaleString()}</span> → 100%</span>
                          )}
                          {maxWithdrawFor75 > 0 && (
                            <span style={{ fontSize:12, fontWeight:700 }}><span style={{ color:"var(--warn)" }}>Rs.{maxWithdrawFor75.toLocaleString()}</span> → 75%</span>
                          )}
                          {maxWithdrawFor50 > 0 && (
                            <span style={{ fontSize:12, fontWeight:700 }}><span style={{ color:"var(--warn)" }}>Rs.{maxWithdrawFor50.toLocaleString()}</span> → 50%</span>
                          )}
                          {maxWithdrawFor25 > 0 && (
                            <span style={{ fontSize:12, fontWeight:700 }}><span style={{ color:"var(--danger)" }}>Rs.{maxWithdrawFor25.toLocaleString()}</span> → 25%</span>
                          )}
                        </div>
                      </div>
                    )}

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
                              {done ? `Rs.${w.withdrawn}` : isCurrentWk ? tx("NOW", "अहिले") : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="progress-wrap">
                      <div className="progress-header">
                        <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text2)" }}>{tx("MONTHLY SPEND", "मासिक खर्च")}</span>
                        <span style={{ fontFamily:"var(--font-mono)", fontSize:10 }}>Rs.{monthSpend.toLocaleString()} / Rs.8,000</span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width:`${Math.min((monthSpend/8000)*100,100)}%`, background: monthSpend<=6000?"var(--accent)":monthSpend<=7000?"var(--warn)":"var(--danger)" }} />
                      </div>
                    </div>
                    <div style={{ marginTop:10, fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text2)", lineHeight:1.6 }}>
                      {tx(`Target: ≤ Rs.6,000/mo → Rs.4,000 bonus · Payout unlocks end of Week ${currentMonth * 4}`, `लक्ष्य: ≤ Rs.6,000/महिना → Rs.4,000 बोनस · भुक्तानी हप्ता ${currentMonth * 4} को अन्त्यमा खुल्छ`)}
                    </div>
                  </div>

                  {/* Recent weeks */}
                  <div className="card" style={{ flex:1 }}>
                    <div className="section-title"><Calendar size={13}/> {tx("Recent Weeks", "हालका हप्ताहरू")}</div>
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
                                {tx(`Week ${w.week}`, `हप्ता ${w.week}`)}
                                {isCur && <span style={{ color:"var(--accent2)", fontSize:10, marginLeft:4 }}>{tx("NOW", "अहिले")}</span>}
                                {isEnd && !isCur && w.completed && <span style={{ color:"var(--reward)", fontSize:9, marginLeft:4 }}>{tx("END", "अन्त्य")}</span>}
                              </span>
                            </div>
                            <span style={{ fontFamily:"var(--font-mono)", fontSize:12, color:"var(--text2)" }}>
                              {isCur ? tx(`Rs.${w.withdrawn.toLocaleString()} used`, `Rs.${w.withdrawn.toLocaleString()} प्रयोग`) : w.completed ? tx(`Rs.${w.withdrawn.toLocaleString()} spent`, `Rs.${w.withdrawn.toLocaleString()} खर्च`) : "—"}
                            </span>
                            {w.completed && !isCur && (
                              <span style={{ fontSize:10, fontFamily:"var(--font-mono)", color: savedOk?"var(--accent)":partial?"var(--warn)":"var(--danger)" }}>
                                {savedOk ? tx("SAVED ✓", "बचत ✓") : partial ? tx("PARTIAL", "आंशिक") : tx("FULL", "पूर्ण")}
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
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

              {/* Summary strip */}
              {completedMonths.length > 0 && (
                <div className="grid-4">
                  {[
                    { key:"TOTAL SPENT",   label:tx("TOTAL SPENT", "कुल खर्च"),     val:`Rs.${completedMonths.reduce((s,r)=>s+r.spend,0).toLocaleString()}`,  color:"var(--warn)" },
                    { key:"TOTAL REWARDS", label:tx("TOTAL REWARDS", "कुल रिवार्ड"), val:`Rs.${completedMonths.reduce((s,r)=>s+r.reward,0).toLocaleString()}`, color:"var(--reward)" },
                    { key:"CLAIMED",       label:tx("CLAIMED", "दाबी गरिएको"),       val:`Rs.${state.totalRewardsClaimed.toLocaleString()}`,                   color:"var(--accent)" },
                    { key:"UNCLAIMED",     label:tx("UNCLAIMED", "दाबी बाँकी"),      val:`Rs.${(completedMonths.reduce((s,r)=>s+r.reward,0)-state.totalRewardsClaimed).toLocaleString()}`, color:"var(--accent2)" },
                  ].map(item => (
                    <div key={item.key} style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px" }}>
                      <div style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:700, letterSpacing:1.5, color:"var(--text2)", textTransform:"uppercase", marginBottom:6 }}>{item.label}</div>
                      <div style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:800, color:item.color }}>{item.val}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Month cards */}
              {completedMonths.length === 0 && (
                <div className="card" style={{ textAlign:"center", padding:"48px 28px" }}>
                  <BarChart2 size={32} color="var(--border)" style={{ margin:"0 auto 12px" }}/>
                  <div style={{ fontFamily:"var(--font-display)", fontSize:14, color:"var(--text2)" }}>{tx("No completed months yet", "अहिलेसम्म कुनै महिना पूरा भएको छैन")}</div>
                  <div style={{ fontFamily:"var(--font-display)", fontSize:12, color:"var(--text2)", marginTop:4, opacity:0.6 }}>{tx("Advance through Week 4 to see your first month's payout", "पहिलो महिनाको भुक्तानी हेर्न हप्ता 4 सम्म जानुहोस्")}</div>
                </div>
              )}

              {[...completedMonths, { month: currentMonth, spend: monthSpend, reward: monthReward, rewardPct: monthRewardPct, claimed: false, inProgress: true }].map(row => {
                const mw  = state.weeks.filter(w => w.month === row.month);
                const mr  = state.monthRewards[row.month];
                const rPct = row.rewardPct ?? Math.round((row.reward / MAX_REWARD) * 100);
                const rewardColor = row.reward >= 3000 ? "var(--accent)" : row.reward >= 1000 ? "var(--warn)" : "var(--danger)";
                return (
                  <div key={row.month} style={{
                    background:"var(--surface)", border:`1px solid ${row.inProgress ? "rgba(96,200,240,0.3)" : mr?.claimed ? "rgba(200,240,96,0.15)" : "var(--border)"}`,
                    borderRadius:"var(--radius)", padding:"20px 24px", display:"flex", flexDirection:"column", gap:14
                  }}>
                    {/* Header row */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                        <div style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:800, color: row.inProgress ? "var(--accent2)" : "var(--text)" }}>
                          {tx(`Month ${row.month}`, `महिना ${row.month}`)}
                        </div>
                        {row.inProgress
                          ? <span className="payout-chip payout-chip-pending">{tx("IN PROGRESS", "प्रगतिमा")}</span>
                          : mr?.claimed
                          ? <span className="payout-chip payout-chip-yes"><CheckCircle size={10}/> {tx("CLAIMED", "दाबी गरियो")}</span>
                          : row.reward > 0
                          ? <span className="payout-chip payout-chip-pending">{tx("UNCLAIMED", "दाबी बाँकी")}</span>
                          : <span className="payout-chip payout-chip-no">{tx("NO REWARD", "रिवार्ड छैन")}</span>
                        }
                      </div>
                      {/* Reward + claim */}
                      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:700, letterSpacing:1.5, color:"var(--text2)", textTransform:"uppercase" }}>
                            {row.inProgress ? tx("Est. Reward", "अनुमानित रिवार्ड") : tx("Reward", "रिवार्ड")}
                          </div>
                          <div style={{ fontFamily:"var(--font-display)", fontSize:26, fontWeight:800, color: rewardColor, lineHeight:1 }}>
                            {row.inProgress ? "~" : ""}Rs.{row.reward.toLocaleString()}
                          </div>
                          <div style={{ fontFamily:"var(--font-display)", fontSize:11, fontWeight:700, color: rewardColor, opacity:0.8 }}>
                            {tx(`${rPct}% efficiency`, `${rPct}% दक्षता`)}
                          </div>
                        </div>
                        {!row.inProgress && !mr?.claimed && row.reward > 0 && (
                          <button className="reward-claim-btn" onClick={() => claimReward(row.month)} style={{ marginTop:0 }}>
                            <ArrowDownToLine size={13}/> {tx("Claim", "दाबी")}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Week pills */}
                    <div style={{ display:"flex", gap:8 }}>
                      {mw.map(w => {
                        const isCurWk  = w.week === cw;
                        const done     = w.completed;
                        const saved    = done && w.withdrawn <= 1500;
                        const partial  = done && !saved;
                        const bg       = isCurWk ? "rgba(96,200,240,0.12)" : !done ? "var(--surface2)" : saved ? "rgba(200,240,96,0.1)" : partial ? "rgba(240,160,96,0.1)" : "rgba(240,96,96,0.1)";
                        const border   = isCurWk ? "rgba(96,200,240,0.4)" : !done ? "var(--border)" : saved ? "rgba(200,240,96,0.3)" : partial ? "rgba(240,160,96,0.3)" : "rgba(240,96,96,0.3)";
                        const valColor = isCurWk ? "var(--accent2)" : !done ? "var(--text2)" : saved ? "var(--accent)" : partial ? "var(--warn)" : "var(--danger)";
                        return (
                          <div key={w.week} style={{ flex:1, background:bg, border:`1px solid ${border}`, borderRadius:10, padding:"10px 12px", display:"flex", flexDirection:"column", gap:3 }}>
                            <div style={{ fontFamily:"var(--font-display)", fontSize:9, fontWeight:700, letterSpacing:1.5, color:"var(--text2)", textTransform:"uppercase" }}>
                              W{w.week}{isCurWk ? " ◀" : ""}
                            </div>
                            <div style={{ fontFamily:"var(--font-display)", fontSize:15, fontWeight:800, color:valColor }}>
                              {done || isCurWk ? `Rs.${w.withdrawn.toLocaleString()}` : "—"}
                            </div>
                            {done && (
                              <div style={{ fontFamily:"var(--font-display)", fontSize:9, fontWeight:700, color:valColor, opacity:0.8 }}>
                                {saved ? tx("saved ✓", "बचत ✓") : partial ? tx("partial", "आंशिक") : tx("full", "पूर्ण")}
                              </div>
                            )}
                            {isCurWk && !done && (
                              <div style={{ fontFamily:"var(--font-display)", fontSize:9, fontWeight:700, color:"var(--accent2)" }}>{tx("now", "अहिले")}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Spend bar */}
                    <div>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                        <span style={{ fontFamily:"var(--font-display)", fontSize:11, color:"var(--text2)", fontWeight:600 }}>{tx("MONTHLY SPEND", "मासिक खर्च")}</span>
                        <span style={{ fontFamily:"var(--font-display)", fontSize:11, fontWeight:800, color:"var(--warn)" }}>Rs.{row.spend.toLocaleString()} / Rs.8,000</span>
                      </div>
                      <div style={{ height:5, background:"var(--surface2)", borderRadius:99 }}>
                        <div style={{ height:"100%", borderRadius:99, width:`${Math.min((row.spend/8000)*100,100)}%`,
                          background: row.spend<=6000?"var(--accent)":row.spend<=7000?"var(--warn)":"var(--danger)", transition:"width .6s" }} />
                      </div>
                    </div>
                  </div>
                );
              })}
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
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

              {/* Perfect savings: 6 month cards */}
              <div className="card">
                <div className="section-title"><TrendingUp size={13}/> {tx("Perfect Savings — 6 Month Projection", "उत्तम बचत — 6 महिनाको प्रक्षेपण")}</div>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, padding:"12px 16px", background:"rgba(96,200,240,0.06)", border:"1px solid rgba(96,200,240,0.18)", borderRadius:10 }}>
                  <Gift size={14} color="var(--accent2)" style={{ flexShrink:0 }}/>
                  <span style={{ fontFamily:"var(--font-display)", fontSize:13, fontWeight:600, color:"var(--text2)" }}>
                    {tx("Spend ≤ Rs.1,500/week × 4 weeks = Rs.6,000/month → earn Rs.4,000 bonus at month end", "≤ Rs.1,500/हप्ता × 4 हप्ता = Rs.6,000/महिना खर्च गर्दा महिना अन्त्यमा Rs.4,000 बोनस पाउनुहुन्छ")}
                  </span>
                </div>
                <div className="grid-3" style={{ marginBottom:20 }}>
                  {Array.from({length:6},(_,i) => {
                    const m  = i+1;
                    const cs = m * 6000;
                    const cr = m * 4000;
                    return (
                      <div key={m} style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:12, padding:"18px 20px", display:"flex", flexDirection:"column", gap:10 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <span style={{ fontFamily:"var(--font-display)", fontSize:13, fontWeight:800, color:"var(--text2)" }}>{tx(`Month ${m}`, `महिना ${m}`)}</span>
                          <span style={{ fontFamily:"var(--font-display)", fontSize:11, fontWeight:700, color:"var(--accent)", background:"rgba(200,240,96,0.1)", border:"1px solid rgba(200,240,96,0.2)", borderRadius:20, padding:"2px 10px" }}>+Rs.4,000</span>
                        </div>
                        {/* 4 week dots */}
                        <div style={{ display:"flex", gap:4 }}>
                          {[1,2,3,4].map(w => (
                            <div key={w} style={{ flex:1, display:"flex", flexDirection:"column", gap:3, alignItems:"center" }}>
                              <div style={{ width:"100%", height:6, borderRadius:3, background:"var(--accent)", opacity:0.7 }} />
                              <span style={{ fontFamily:"var(--font-display)", fontSize:9, color:"var(--text2)" }}>Rs.1,500</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ height:1, background:"var(--border)" }} />
                        <div style={{ display:"flex", justifyContent:"space-between" }}>
                          <div>
                            <div style={{ fontFamily:"var(--font-display)", fontSize:9, color:"var(--text2)", letterSpacing:1, textTransform:"uppercase", marginBottom:2 }}>{tx("Cumul. Spent", "संचित खर्च")}</div>
                            <div style={{ fontFamily:"var(--font-display)", fontSize:14, fontWeight:800, color:"var(--warn)" }}>Rs.{cs.toLocaleString()}</div>
                          </div>
                          <div style={{ textAlign:"right" }}>
                            <div style={{ fontFamily:"var(--font-display)", fontSize:9, color:"var(--text2)", letterSpacing:1, textTransform:"uppercase", marginBottom:2 }}>{tx("In Hand", "हातमा")}</div>
                            <div style={{ fontFamily:"var(--font-display)", fontSize:14, fontWeight:800, color:"var(--accent)" }}>Rs.{(cs+cr).toLocaleString()}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* 6-month totals */}
                <div className="grid-3">
                  {[
                    { key:"6-Mo Spent",   label:tx("6-Mo Spent", "6-महिना खर्च"),   val:"Rs.36,000", color:"var(--warn)" },
                    { key:"6-Mo Rewards", label:tx("6-Mo Rewards", "6-महिना रिवार्ड"), val:"Rs.24,000", color:"var(--reward)" },
                    { key:"Total in Hand",label:tx("Total in Hand", "हातमा कुल"), val:"Rs.60,000", color:"var(--accent)" },
                  ].map(x => (
                    <div key={x.key} style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"14px 18px" }}>
                      <div style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:700, letterSpacing:1.5, color:"var(--text2)", textTransform:"uppercase", marginBottom:4 }}>{x.label}</div>
                      <div style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:800, color:x.color }}>{x.val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop:14, fontFamily:"var(--font-display)", fontSize:12, color:"var(--text2)", lineHeight:1.8 }}>
                  {tx("That's a ", "यो वास्तविक खर्चमा ")}<strong style={{ color:"var(--accent)" }}>66.7% {tx("bonus", "बोनस")}</strong>{tx(" on actual spend — all within the Rs.1,20,000 annual budget.", " हो — सबै Rs.1,20,000 वार्षिक बजेटभित्र।")}
                </div>
              </div>

              {/* Reward scale */}
              <div className="card">
                <div className="section-title"><Gift size={13}/> {tx("Monthly Reward Scale", "मासिक रिवार्ड स्केल")}</div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {[
                    { spend:6000, label:"Rs.6,000", tag:tx("Perfect", "उत्तम") },
                    { spend:6500, label:"Rs.6,500", tag:tx("Good", "राम्रो") },
                    { spend:7000, label:"Rs.7,000", tag:tx("Okay", "ठीकठाक") },
                    { spend:7500, label:"Rs.7,500", tag:tx("Over", "बढी") },
                    { spend:8000, label:"Rs.8,000", tag:tx("Max", "अधिकतम") },
                  ].map(s => {
                    const reward = calcReward(s.spend);
                    const pct    = Math.round((reward/MAX_REWARD)*100);
                    const barColor = reward===0?"var(--danger)":reward>=3000?"var(--accent)":"var(--warn)";
                    const rewardColor = reward===0?"var(--danger)":reward>=3000?"var(--reward)":"var(--warn)";
                    return (
                      <div key={s.spend} style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 20px" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                            <span style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:800, color:"var(--warn)" }}>{s.label}</span>
                            <span style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:700, color:"var(--text2)", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:20, padding:"2px 10px", letterSpacing:1 }}>{s.tag}</span>
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                            <span style={{ fontFamily:"var(--font-display)", fontSize:18, fontWeight:800, color:rewardColor }}>Rs.{reward.toLocaleString()}</span>
                            <span style={{ fontFamily:"var(--font-display)", fontSize:13, fontWeight:700, color:rewardColor, opacity:0.7, minWidth:36, textAlign:"right" }}>{pct}%</span>
                          </div>
                        </div>
                        <div style={{ height:6, background:"var(--surface)", borderRadius:99 }}>
                          <div style={{ height:"100%", borderRadius:99, width:`${pct}%`, background:barColor, transition:"width .6s" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ height:1, background:"var(--border)", margin:"20px 0" }} />

                {/* Mixed month example */}
                <div style={{ fontFamily:"var(--font-display)", fontSize:13, fontWeight:700, color:"var(--text)", marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
                  <AlertCircle size={14} color="var(--accent2)"/> {tx("Mixed Month Example", "मिश्रित महिनाको उदाहरण")}
                </div>
                <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                  {[{w:1,amt:2000,saved:false},{w:2,amt:1500,saved:true},{w:3,amt:2000,saved:false},{w:4,amt:1500,saved:true}].map(x => (
                    <div key={x.w} style={{ flex:1, background: x.saved?"rgba(200,240,96,0.08)":"rgba(240,96,96,0.08)", border:`1px solid ${x.saved?"rgba(200,240,96,0.25)":"rgba(240,96,96,0.2)"}`, borderRadius:10, padding:"12px 14px" }}>
                      <div style={{ fontFamily:"var(--font-display)", fontSize:9, fontWeight:700, letterSpacing:1.5, color:"var(--text2)", textTransform:"uppercase", marginBottom:4 }}>W{x.w}</div>
                      <div style={{ fontFamily:"var(--font-display)", fontSize:16, fontWeight:800, color: x.saved?"var(--accent)":"var(--danger)" }}>Rs.{x.amt.toLocaleString()}</div>
                      <div style={{ fontFamily:"var(--font-display)", fontSize:10, fontWeight:700, color: x.saved?"var(--accent)":"var(--danger)", opacity:0.8, marginTop:2 }}>{x.saved ? tx("saved ✓", "बचत ✓") : tx("no save", "बचत छैन")}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 20px", background:"rgba(96,200,240,0.06)", border:"1px solid rgba(96,200,240,0.18)", borderRadius:10 }}>
                  <div>
                    <div style={{ fontFamily:"var(--font-display)", fontSize:11, color:"var(--text2)", marginBottom:2 }}>{tx("Total spend:", "कुल खर्च:")} <strong style={{ color:"var(--accent2)" }}>Rs.7,000</strong> · {tx("2/4 weeks saved", "2/4 हप्ता बचत")}</div>
                    <div style={{ fontFamily:"var(--font-display)", fontSize:11, color:"var(--text2)" }}>{tx("vs full reward target of Rs.6,000", "पूर्ण रिवार्ड लक्ष्य Rs.6,000 सँग तुलना")}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontFamily:"var(--font-display)", fontSize:22, fontWeight:800, color:"var(--warn)" }}>Rs.{calcReward(7000).toLocaleString()}</div>
                    <div style={{ fontFamily:"var(--font-display)", fontSize:11, fontWeight:700, color:"var(--warn)", opacity:0.8 }}>{tx(`${Math.round((calcReward(7000)/MAX_REWARD)*100)}% payout`, `${Math.round((calcReward(7000)/MAX_REWARD)*100)}% भुक्तानी`)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
