export const DEFAULT_SEND_DELAY_MS = 3000;

export const PENDING_QUEUE_KEY_PREFIX = "emotion-bot:pendingQueue:";
export const ACTIVE_PERSONA_KEY = "emotion-bot:activePersona";
export const PANEL_STATE_KEY = "emotion-bot:panelCollapsed";
export const ACTIVE_PERSONA_NAME_KEY = "emotion-bot:activePersonaName";
export const UI_FONT_VALUE_KEY = "emotion-bot:uiFontValue";
export const PENDING_POLL_INTERVAL_MS = 1500;

export const PERSONA_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
export const PANEL_COLLAPSED_CLASS = "panel-collapsed";
export const APP_READY_CLASS = "app-ready";
export const NO_PANEL_ANIM_CLASS = "no-panel-anim";

export const FONT_FAMILY_MAP = {
  system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  pingfang: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  yahei: '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif',
  noto: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  song: '"SimSun", "STSong", serif',
  kaiti: '"KaiTi", "STKaiti", serif',
  fangsong: '"FangSong", "STFangsong", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
};

export const personaNameCollator = (() => {
  try {
    return new Intl.Collator("zh-Hans-u-co-pinyin", { sensitivity: "base", numeric: true });
  } catch {
    return new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  }
})();
