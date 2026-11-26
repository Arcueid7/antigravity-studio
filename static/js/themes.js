/* ==========================================================================
   Antigravity Studio — Curated Font Presets & 8-Family Color Palettes
   ========================================================================== */

export const FONT_PRESETS = {
  serif: {
    name: '杂志衬线',
    desc: 'Newsreader · 思源宋体',
    sample: 'Aa文',
    previewFamily: '"Newsreader", Georgia, "Noto Serif SC", "Source Han Serif SC", serif',
  },
  sans: {
    name: '现代无衬线',
    desc: 'Inter · 思源黑体',
    sample: 'Aa文',
    previewFamily: '"Inter", "Noto Sans SC", "Segoe UI", "Microsoft YaHei UI", sans-serif',
  },
  geometric: {
    name: '几何极简',
    desc: 'Jakarta · 等线',
    sample: 'Aa文',
    previewFamily: '"Plus Jakarta Sans", "DengXian", "Bahnschrift", "Noto Sans SC", sans-serif',
  },
  kaiti: {
    name: '书香楷韵',
    desc: 'Lora · 华文楷体',
    sample: 'Aa文',
    previewFamily: '"Lora", "LXGW WenKai", "STKaiti", "KaiTi", "Kaiti SC", serif',
  },
  fangsong: {
    name: '雅致仿宋',
    desc: 'Crimson · 仿宋',
    sample: 'Aa文',
    previewFamily: '"Crimson Pro", "STFangsong", "FangSong", "Noto Serif SC", serif',
  },
  academic: {
    name: '学术雅颂',
    desc: 'Serif 4 · Cambria',
    sample: 'Aa文',
    previewFamily: '"Source Serif 4", Cambria, Georgia, "Noto Serif SC", serif',
  },
  rounded: {
    name: '轻盈圆体',
    desc: 'Jakarta · 幼圆',
    sample: 'Aa文',
    previewFamily: '"Plus Jakarta Sans", "YouYuan", "Yu Gothic UI", "Noto Sans SC", sans-serif',
  },
  system: {
    name: '系统原生',
    desc: 'Segoe UI · 雅黑',
    sample: 'Aa文',
    previewFamily: '"Segoe UI Variable", "Segoe UI", "Microsoft YaHei UI", sans-serif',
  },
  tech: {
    name: '极客等宽',
    desc: 'JetBrains · 等宽',
    sample: 'Aa文',
    previewFamily: '"JetBrains Mono", "Cascadia Code", Consolas, "Noto Sans SC", monospace',
  },
};

export const COLOR_SCHEMES = {
  claude: {
    name: '羊皮纸 · 赤陶',
    desc: '经典暖白与赤陶橙',
    light: {
      bg_main: '#FAF9F5', bg_sidebar: '#F3F1E9', bg_sidebar_hover: '#EAE6DA', bg_sidebar_active: '#E3DFD1',
      bg_composer: '#FFFFFF', bg_surface: '#FFFFFF', bg_subtle: '#F4F2EA', bg_user_bubble: '#F0EEE6',
      bg_code: '#F4F2EA', bg_code_header: '#EBE8DC',
      accent: '#C96442', accent_hover: '#B55434', starburst: '#D97757', accent_glow: '#E5A25D',
    },
    dark: {
      bg_main: '#262624', bg_sidebar: '#1D1D1B', bg_sidebar_hover: '#292926', bg_sidebar_active: '#33322F',
      bg_composer: '#30302E', bg_surface: '#2D2D2A', bg_subtle: '#20201E', bg_user_bubble: '#1C1C1A',
      bg_code: '#1B1B19', bg_code_header: '#232320',
      accent: '#D97757', accent_hover: '#E38667', starburst: '#D97757', accent_glow: '#F0B475',
    },
  },
  minimal: {
    name: '纯净极简 · 曜石',
    desc: '清透无彩色黑白灰',
    light: {
      bg_main: '#FFFFFF', bg_sidebar: '#F7F7F8', bg_sidebar_hover: '#ECECEF', bg_sidebar_active: '#E4E4E8',
      bg_composer: '#FFFFFF', bg_surface: '#FFFFFF', bg_subtle: '#F4F4F6', bg_user_bubble: '#F2F2F5',
      bg_code: '#F6F6F8', bg_code_header: '#ECECF0',
      accent: '#18181B', accent_hover: '#3F3F46', starburst: '#27272A', accent_glow: '#71717A',
    },
    dark: {
      bg_main: '#161618', bg_sidebar: '#111113', bg_sidebar_hover: '#1E1E22', bg_sidebar_active: '#28282D',
      bg_composer: '#1F1F23', bg_surface: '#1C1C20', bg_subtle: '#18181B', bg_user_bubble: '#252529',
      bg_code: '#121215', bg_code_header: '#1A1A1E',
      accent: '#E4E4E7', accent_hover: '#FFFFFF', starburst: '#D4D4D8', accent_glow: '#A1A1AA',
    },
  },
  amber: {
    name: '琥珀拿铁 · 暖金',
    desc: '柔和象牙与琥珀金',
    light: {
      bg_main: '#FAF8F3', bg_sidebar: '#F3EFE4', bg_sidebar_hover: '#EAE3D3', bg_sidebar_active: '#E1D8C3',
      bg_composer: '#FFFFFF', bg_surface: '#FFFFFF', bg_subtle: '#F5F0E6', bg_user_bubble: '#EFE8D8',
      bg_code: '#F4EFE4', bg_code_header: '#EAE2D2',
      accent: '#B86B1A', accent_hover: '#995712', starburst: '#CF822E', accent_glow: '#E9B167',
    },
    dark: {
      bg_main: '#221D17', bg_sidebar: '#191510', bg_sidebar_hover: '#2B241C', bg_sidebar_active: '#362D23',
      bg_composer: '#2C261E', bg_surface: '#27211A', bg_subtle: '#1D1813', bg_user_bubble: '#312A21',
      bg_code: '#181410', bg_code_header: '#221C16',
      accent: '#E8A64B', accent_hover: '#F0B869', starburst: '#E8A64B', accent_glow: '#F6CE91',
    },
  },
  forest: {
    name: '森野松针 · 翡翠',
    desc: '护眼淡雅草木绿',
    light: {
      bg_main: '#F5F8F6', bg_sidebar: '#EBF1ED', bg_sidebar_hover: '#DFEAE3', bg_sidebar_active: '#D5E3DA',
      bg_composer: '#FFFFFF', bg_surface: '#FFFFFF', bg_subtle: '#EDF3EF', bg_user_bubble: '#E6EFE9',
      bg_code: '#EDF3EF', bg_code_header: '#E2ECE5',
      accent: '#2D6A4F', accent_hover: '#22543D', starburst: '#3B8263', accent_glow: '#68B08C',
    },
    dark: {
      bg_main: '#19211D', bg_sidebar: '#131A16', bg_sidebar_hover: '#202B25', bg_sidebar_active: '#28362F',
      bg_composer: '#222D27', bg_surface: '#1F2924', bg_subtle: '#161D19', bg_user_bubble: '#26332C',
      bg_code: '#131916', bg_code_header: '#1A231E',
      accent: '#52B788', accent_hover: '#6CC69C', starburst: '#52B788', accent_glow: '#95D5B2',
    },
  },
  teal: {
    name: '青瓷烟雨 · 苍青',
    desc: '清雅莫兰迪青釉色',
    light: {
      bg_main: '#F4F9F9', bg_sidebar: '#E8F1F1', bg_sidebar_hover: '#DCE9E9', bg_sidebar_active: '#CEE0E0',
      bg_composer: '#FFFFFF', bg_surface: '#FFFFFF', bg_subtle: '#EBF3F3', bg_user_bubble: '#E2EEEE',
      bg_code: '#EBF3F3', bg_code_header: '#DFECEC',
      accent: '#0F766E', accent_hover: '#0D5E58', starburst: '#149087', accent_glow: '#5EEAD4',
    },
    dark: {
      bg_main: '#151F20', bg_sidebar: '#0F1718', bg_sidebar_hover: '#1C292B', bg_sidebar_active: '#243538',
      bg_composer: '#1D2A2C', bg_surface: '#192527', bg_subtle: '#121B1C', bg_user_bubble: '#213032',
      bg_code: '#0F1718', bg_code_header: '#162123',
      accent: '#2DD4BF', accent_hover: '#5EEAD4', starburst: '#2DD4BF', accent_glow: '#99F6E4',
    },
  },
  ocean: {
    name: '海盐晴空 · 钴蓝',
    desc: '清朗通透冰川蓝',
    light: {
      bg_main: '#F5F8FC', bg_sidebar: '#EAF0F8', bg_sidebar_hover: '#DEE7F3', bg_sidebar_active: '#D2DFEE',
      bg_composer: '#FFFFFF', bg_surface: '#FFFFFF', bg_subtle: '#ECF2F9', bg_user_bubble: '#E5EEF8',
      bg_code: '#EDF2F8', bg_code_header: '#E1EAF4',
      accent: '#2563EB', accent_hover: '#1D4ED8', starburst: '#3B82F6', accent_glow: '#60A5FA',
    },
    dark: {
      bg_main: '#161B24', bg_sidebar: '#11151D', bg_sidebar_hover: '#1C2330', bg_sidebar_active: '#242D3D',
      bg_composer: '#1E2532', bg_surface: '#1B212D', bg_subtle: '#131820', bg_user_bubble: '#222B3A',
      bg_code: '#11151D', bg_code_header: '#181E29',
      accent: '#60A5FA', accent_hover: '#7AB6FB', starburst: '#60A5FA', accent_glow: '#93C5FD',
    },
  },
  iris: {
    name: '薰衣草雾 · 靛紫',
    desc: '静谧杂志灰紫调',
    light: {
      bg_main: '#F8F7FC', bg_sidebar: '#EFEDF8', bg_sidebar_hover: '#E4E0F2', bg_sidebar_active: '#DAD4EC',
      bg_composer: '#FFFFFF', bg_surface: '#FFFFFF', bg_subtle: '#F1EFF9', bg_user_bubble: '#EAE6F6',
      bg_code: '#F1EFF9', bg_code_header: '#E7E4F3',
      accent: '#6D4AFF', accent_hover: '#5A38E8', starburst: '#8264FF', accent_glow: '#B19CFF',
    },
    dark: {
      bg_main: '#1B1926', bg_sidebar: '#14121D', bg_sidebar_hover: '#232033', bg_sidebar_active: '#2C2840',
      bg_composer: '#242134', bg_surface: '#201E2E', bg_subtle: '#171521', bg_user_bubble: '#28243A',
      bg_code: '#14121D', bg_code_header: '#1C1928',
      accent: '#9B82FF', accent_hover: '#B09BFF', starburst: '#9B82FF', accent_glow: '#C8BAFF',
    },
  },
  rose: {
    name: '晚樱暮色 · 玫瑰',
    desc: '温柔复古绯红调',
    light: {
      bg_main: '#FCF7F8', bg_sidebar: '#F5EBEE', bg_sidebar_hover: '#ECDFE3', bg_sidebar_active: '#E4D2D8',
      bg_composer: '#FFFFFF', bg_surface: '#FFFFFF', bg_subtle: '#F6EEF0', bg_user_bubble: '#F2E6EA',
      bg_code: '#F6EEF0', bg_code_header: '#EDE2E5',
      accent: '#B84A62', accent_hover: '#9F3B51', starburst: '#CC5E76', accent_glow: '#E58FA2',
    },
    dark: {
      bg_main: '#241B1F', bg_sidebar: '#1B1417', bg_sidebar_hover: '#2D2126', bg_sidebar_active: '#382930',
      bg_composer: '#2E2227', bg_surface: '#2A1F24', bg_subtle: '#1F171A', bg_user_bubble: '#33252B',
      bg_code: '#1A1316', bg_code_header: '#231A1E',
      accent: '#E07A90', accent_hover: '#EA91A4', starburst: '#E07A90', accent_glow: '#F2B1BF',
    },
  },
};

export const LEGACY_SCHEME_MAP = {
  solarized: 'amber',
  nord: 'ocean',
  tokyo: 'ocean',
  slate: 'minimal',
  matcha: 'forest',
  catppuccin: 'iris',
  ink: 'claude',
};

export function resolveSchemeKey(key) {
  if (COLOR_SCHEMES[key]) return key;
  if (LEGACY_SCHEME_MAP[key]) return LEGACY_SCHEME_MAP[key];
  return 'claude';
}

export function hexToRgba(hex, alpha) {
  const clean = (hex || '').replace('#', '');
  if (clean.length !== 6) return `rgba(201, 100, 66, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function shiftHexBrightness(hex, delta) {
  const clean = (hex || '').replace('#', '');
  if (clean.length !== 6) return hex;
  const clamp = (n) => Math.max(0, Math.min(255, n));
  const r = clamp(parseInt(clean.slice(0, 2), 16) + delta);
  const g = clamp(parseInt(clean.slice(2, 4), 16) + delta);
  const b = clamp(parseInt(clean.slice(4, 6), 16) + delta);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}
