import { Settings, X } from "lucide-react";

/**
 * Settings dialog: Font Size (Small / Big).
 * Small = current size; Big = 125% scale (applied via .app.font-size-big).
 */
export default function SettingsDialog({ open, onClose, fontSize, onFontSizeChange, tx }) {
  if (!open) return null;

  const isBig = fontSize === "big";

  return (
    <>
      <div
        className="settings-dialog-backdrop"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        role="presentation"
        aria-hidden
      />
      <div className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title">
        <div className="settings-dialog-header">
          <h2 id="settings-dialog-title" className="settings-dialog-title">
            <Settings size={20} strokeWidth={2} />
            {tx("Settings", "सेटिङ्ग")}
          </h2>
          <button
            type="button"
            className="settings-dialog-close"
            onClick={onClose}
            aria-label={tx("Close", "बन्द गर्नुहोस्")}
          >
            <X size={20} />
          </button>
        </div>
        <div className="settings-dialog-body">
          <div className="settings-option">
            <label className="settings-option-label">{tx("Font Size", "फन्ट साइज")}</label>
            <div className="settings-option-control">
              <button
                type="button"
                className={`settings-size-btn ${!isBig ? "active" : ""}`}
                onClick={() => onFontSizeChange("small")}
              >
                {tx("Small", "सानो")}
              </button>
              <button
                type="button"
                className={`settings-size-btn ${isBig ? "active" : ""}`}
                onClick={() => onFontSizeChange("big")}
              >
                {tx("Big", "ठूलो")}
              </button>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        .settings-dialog-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 9998;
          animation: settingsFadeIn .2s ease;
        }
        .settings-dialog {
          position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
          width: min(380px, 92vw); background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius); box-shadow: 0 24px 48px rgba(0,0,0,.4);
          z-index: 9999; animation: settingsSlideIn .25s ease;
        }
        .settings-dialog-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 24px; border-bottom: 1px solid var(--border);
        }
        .settings-dialog-title {
          display: flex; align-items: center; gap: 10px;
          font-family: var(--font-display); font-size: 18px; font-weight: 800; color: var(--text);
        }
        .settings-dialog-close {
          display: flex; align-items: center; justify-content: center;
          background: transparent; border: none; color: var(--text2); cursor: pointer;
          padding: 6px; border-radius: 8px; transition: color .2s, background .2s;
        }
        .settings-dialog-close:hover { color: var(--text); background: var(--surface2); }
        .settings-dialog-body { padding: 24px; }
        .settings-option { display: flex; flex-direction: column; gap: 12px; }
        .settings-option-label {
          font-family: var(--font-mono); font-size: 11px; color: var(--text2);
          letter-spacing: 1.5px; text-transform: uppercase;
        }
        .settings-option-control {
          display: flex; gap: 10px; flex-wrap: wrap;
        }
        .settings-size-btn {
          flex: 1; min-width: 100px; padding: 12px 20px; border-radius: 10px;
          border: 1px solid var(--border); background: var(--surface2);
          color: var(--text2); font-family: var(--font-display); font-size: 14px; font-weight: 600;
          cursor: pointer; transition: all .2s;
        }
        .settings-size-btn:hover { border-color: var(--accent); color: var(--text); }
        .settings-size-btn.active {
          background: rgba(200,240,96,.12); border-color: var(--accent); color: var(--accent);
        }
        @keyframes settingsFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes settingsSlideIn { from { opacity: 0; transform: translate(-50%, -48%); } to { opacity: 1; transform: translate(-50%, -50%); } }
      `}</style>
    </>
  );
}
