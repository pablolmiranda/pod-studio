import { useState, useEffect, useCallback, useRef, useId } from "react";

// --- Line 6 Pocket POD Protocol Constants ---
const LINE6_MANUFACTURER_ID = [0x00, 0x01, 0x0c];
const POCKET_POD_DEVICE_ID = 0x01;
const MIDI_CHANNEL = 0; // Channel 1 (0-indexed)

const SYSEX_START = 0xf0;
const SYSEX_END = 0xf7;

// SysEx opcodes
const OPCODE_PATCH_DUMP_REQUEST = 0x00;
const OPCODE_PATCH_DUMP = 0x01;

// Universal Device Identity
const IDENTITY_REQUEST = [0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7];

// Request current edit buffer: opcode [0x00, 0x01]
const REQUEST_EDIT_BUFFER = [
  SYSEX_START,
  ...LINE6_MANUFACTURER_ID,
  POCKET_POD_DEVICE_ID,
  OPCODE_PATCH_DUMP_REQUEST,
  0x01, // edit buffer
  SYSEX_END,
];

// Request all 124 presets: opcode [0x00, 0x02]
const REQUEST_ALL_PRESETS = [
  SYSEX_START,
  ...LINE6_MANUFACTURER_ID,
  POCKET_POD_DEVICE_ID,
  OPCODE_PATCH_DUMP_REQUEST,
  0x02, // dump all programs
  SYSEX_END,
];

// MIDI CC definitions for Pocket POD parameters
const MIDI_CC_MAP = {
  // Preamp
  ampModel: { cc: 12, name: "Amp Model", min: 0, max: 31 },
  drive: { cc: 13, name: "Drive", min: 0, max: 127 },
  bass: { cc: 14, name: "Bass", min: 0, max: 127 },
  mid: { cc: 15, name: "Mid", min: 0, max: 127 },
  treble: { cc: 16, name: "Treble", min: 0, max: 127 },
  chanVol: { cc: 17, name: "Chan Vol", min: 0, max: 127 },
  drive2: { cc: 20, name: "Drive 2", min: 0, max: 127 },
  presence: { cc: 21, name: "Presence", min: 0, max: 127 },
  // Reverb
  reverb_level: { cc: 18, name: "Reverb Level", min: 0, max: 127 },
  reverb_type: { cc: 37, name: "Reverb Type", min: 0, max: 1 },
  reverb_decay: { cc: 38, name: "Reverb Decay", min: 0, max: 127 },
  reverb_tone: { cc: 39, name: "Reverb Tone", min: 0, max: 127 },
  reverb_diffusion: { cc: 40, name: "Reverb Diffusion", min: 0, max: 127 },
  reverb_density: { cc: 41, name: "Reverb Density", min: 0, max: 127 },
  // FX config
  effect: { cc: 19, name: "Effect Type", min: 0, max: 15 },
  effect_tweak: { cc: 1, name: "Effect Tweak", min: 0, max: 127 },
  effect_speed: { cc: 51, name: "Effect Speed", min: 0, max: 127 },
  effect_depth: { cc: 52, name: "Effect Depth", min: 0, max: 127 },
  effect_feedback: { cc: 53, name: "Effect Feedback", min: 0, max: 127 },
  effect_predelay: { cc: 54, name: "Effect Pre-Delay", min: 0, max: 127 },
  // Noise gate
  noise_gate: { cc: 23, name: "Noise Gate Thresh", min: 0, max: 127 },
  noise_gate_decay: { cc: 24, name: "Noise Gate Decay", min: 0, max: 127 },
  // Delay
  delay_time: { cc: 30, name: "Delay Time", min: 0, max: 127 },
  delay_time_fine: { cc: 62, name: "Delay Fine", min: 0, max: 127 },
  delay_feedback: { cc: 32, name: "Delay Feedback", min: 0, max: 127 },
  delay_level: { cc: 34, name: "Delay Level", min: 0, max: 127 },
  // Cabinet
  cabModel: { cc: 71, name: "Cab Model", min: 0, max: 15 },
  air: { cc: 72, name: "Air", min: 0, max: 127 },
  // Wah
  wah_position: { cc: 4, name: "Wah Position", min: 0, max: 127 },
  wah_bottom: { cc: 44, name: "Wah Bot Freq", min: 0, max: 127 },
  wah_top: { cc: 45, name: "Wah Top Freq", min: 0, max: 127 },
  // Volume pedal
  vol_level: { cc: 7, name: "Volume Level", min: 0, max: 127 },
  vol_min: { cc: 46, name: "Volume Min", min: 0, max: 127 },
  vol_position: { cc: 47, name: "Volume Position", min: 0, max: 127 },
  // Switches (toggle: CC sends 0 or 127)
  dist_enable: { cc: 25, name: "Dist Enable", min: 0, max: 1 },
  drive_enable: { cc: 26, name: "Drive Enable", min: 0, max: 1 },
  eq_enable: { cc: 27, name: "EQ Enable", min: 0, max: 1 },
  delay_enable: { cc: 28, name: "Delay Enable", min: 0, max: 1 },
  reverb_enable: { cc: 36, name: "Reverb Enable", min: 0, max: 1 },
  noise_gate_enable: { cc: 22, name: "Noise Gate Enable", min: 0, max: 1 },
  mod_fx_enable: { cc: 50, name: "Mod FX Enable", min: 0, max: 1 },
  bright_switch: { cc: 73, name: "Bright Switch", min: 0, max: 1 },
};

// Amp model names (32 models, indexed 0-31 matching CC 12 values)
const AMP_MODELS = [
  "Tube Preamp",          // 0
  "Line 6 Clean",         // 1
  "Line 6 Crunch",        // 2
  "Line 6 Drive",         // 3
  "Line 6 Layer",         // 4
  "Small Tweed",          // 5
  "Tweed Blues",           // 6
  "Black Panel",           // 7
  "Modern Class A",        // 8
  "Brit Class A",          // 9
  "Brit Blues",            // 10
  "Brit Classic",          // 11
  "Brit Hi Gain",          // 12
  "Treadplate",            // 13
  "Modern Hi Gain",        // 14
  "Fuzz Box",              // 15
  "Jazz Clean",            // 16
  "Boutique #1",           // 17
  "Boutique #2",           // 18
  "Brit Class A #2",       // 19
  "Brit Class A #3",       // 20
  "Small Tweed #2",        // 21
  "Black Panel #2",        // 22
  "Boutique #3",           // 23
  "California Crunch #1",  // 24
  "California Crunch #2",  // 25
  "Treadplate #2",         // 26
  "Modern Hi Gain #2",     // 27
  "Line 6 Twang",          // 28
  "Line 6 Crunch #2",      // 29
  "Line 6 Blues",           // 30
  "Line 6 INSANE",         // 31
];

// Cabinet model names (16 models, indexed 0-15 matching CC 71 values)
const CAB_MODELS = [
  "1x8 '60 Fender Tweed Champ",                      // 0
  "1x12 '52 Fender Tweed Deluxe",                     // 1
  "1x12 '60 Vox AC15",                                // 2
  "1x12 '64 Fender Blackface Deluxe",                 // 3
  "1x12 '98 Line 6 Flextone",                         // 4
  "2x12 '65 Fender Blackface Twin",                   // 5
  "2x12 '67 VOX AC30",                                // 6
  "2x12 '95 Matchless Chieftain",                     // 7
  "2x12 '98 Pod Custom 2x12",                         // 8
  "4x10 '59 Fender Bassman",                          // 9
  "4x10 '98 Pod Custom 4x10",                         // 10
  "4x12 '96 Marshall w/ V30s",                        // 11
  "4x12 '78 Marshall w/ 70s",                         // 12
  "4x12 '97 Marshall Basketweave w/ Greenbacks",      // 13
  "4x12 '98 Pod Custom 4x12",                         // 14
  "No Cabinet",                                        // 15
];

// Effect type names (16 types, indexed 0-15 matching CC 19 values)
const EFFECT_TYPES = [
  "Chorus 2",         // 0
  "Flanger 1",        // 1
  "Rotary",           // 2
  "Flanger 2",        // 3
  "Delay/Chorus 1",   // 4
  "Delay/Tremolo",    // 5
  "Delay",            // 6
  "Delay/Comp",       // 7
  "Chorus 1",         // 8
  "Tremolo",          // 9
  "Bypass",           // 10
  "Compressor",       // 11
  "Delay/Chorus 2",   // 12
  "Delay/Flanger 1",  // 13
  "Delay/Swell",      // 14
  "Delay/Flanger 2",  // 15
];

// --- Color Palette ---
const COLORS = {
  // Surface hierarchy (dark to light)
  bg:            "#0d0f12",
  surface0:      "#14171c",
  surface1:      "#1a1e25",
  surface2:      "#21262e",
  surface3:      "#2a303a",

  // Borders
  border:        "#2a303a",
  borderSubtle:  "#1e232b",
  borderFocus:   "#4c9aff",

  // Text
  textPrimary:   "#e1e4e8",
  textSecondary: "#8b949e",
  textMuted:     "#484f58",
  textOnAccent:  "#0d0f12",

  // Accent (Electric Blue)
  accent:        "#4c9aff",
  accentHover:   "#6db3ff",
  accentMuted:   "#1c3a5e",

  // Status
  success:       "#2ea043",
  error:         "#f85149",
  errorBg:       "#2d1418",
  warning:       "#d29922",
  warningBg:     "#2a2017",
  ledOff:        "#1e232b",

  // Display
  displayBg:     "#0a0e14",
  displayText:   "#4c9aff",

  // Knob
  knobBody:      "#2a303a",
  knobTrack:     "#1a1e25",
  knobArc:       "#4c9aff",
  knobPointer:   "#e1e4e8",

  // Scrollbar
  scrollTrack:   "#14171c",
  scrollThumb:   "#2a303a",
};

// Patch data byte offset -> params state key mapping
// These are the 71 decoded bytes from the nibblized SysEx payload
const PATCH_PARAM_MAP = {
  // Switches (positions 0-7)
  0: 'dist_enable',
  1: 'drive_enable',
  2: 'eq_enable',
  3: 'delay_enable',
  4: 'mod_fx_enable',
  5: 'reverb_enable',
  6: 'noise_gate_enable',
  7: 'bright_switch',
  // Preamp (positions 8-15)
  8: 'ampModel',
  9: 'drive',
  10: 'drive2',
  11: 'bass',
  12: 'mid',
  13: 'treble',
  14: 'presence',
  15: 'chanVol',
  // Noise gate (positions 16-17)
  16: 'noise_gate',
  17: 'noise_gate_decay',
  // Wah (positions 18-20)
  18: 'wah_position',
  19: 'wah_bottom',
  20: 'wah_top',
  // Volume pedal (positions 22-24)
  22: 'vol_level',
  23: 'vol_min',
  24: 'vol_position',
  // Delay (positions 26, 27, 34, 36)
  26: 'delay_time',
  27: 'delay_time_fine',
  34: 'delay_feedback',
  36: 'delay_level',
  // Reverb (positions 38-43)
  38: 'reverb_type',
  39: 'reverb_decay',
  40: 'reverb_tone',
  41: 'reverb_diffusion',
  42: 'reverb_density',
  43: 'reverb_level',
  // Cabinet (positions 44-45)
  44: 'cabModel',
  45: 'air',
  // FX config (positions 46-47)
  46: 'effect',
  47: 'effect_tweak',
  // Shared effect params (positions 48-54)
  48: 'effect_speed',
  50: 'effect_depth',
  52: 'effect_feedback',
  53: 'effect_predelay',
};

// Params that use select/enum values (value used as-is from patch data)
const PATCH_SELECT_PARAMS = new Set([
  'dist_enable', 'drive_enable', 'eq_enable', 'delay_enable',
  'mod_fx_enable', 'reverb_enable', 'noise_gate_enable', 'bright_switch',
  'ampModel', 'cabModel', 'effect', 'reverb_type',
]);

// --- Nibble decode utility ---
function decodeNibbles(data) {
  const bytes = [];
  for (let i = 0; i < data.length - 1; i += 2) {
    bytes.push((data[i] << 4) | data[i + 1]);
  }
  return bytes;
}

function decodePatchName(nibbles) {
  const bytes = decodeNibbles(nibbles);
  return bytes
    .map((b) => String.fromCharCode(b))
    .join("")
    .trim();
}

// Parse a full SysEx patch dump into { name, params, presetNumber, isEditBuffer }
function parsePatchDump(data) {
  // Header: F0 00 01 0C 01 01 <type> ...
  // type 0x00 = stored preset: F0 00 01 0C 01 01 00 <program#> <version> <142 nibblized> F7
  // type 0x01 = edit buffer:   F0 00 01 0C 01 01 01 <version> <142 nibblized> F7
  const isEditBuffer = data[6] === 0x01;
  let presetNumber = null;
  let nibbleStart;

  if (isEditBuffer) {
    // data[7] = version, nibblized data starts at index 8
    nibbleStart = 8;
  } else {
    // data[6] = 0x00 (stored), data[7] = program#, data[8] = version
    presetNumber = data[7];
    nibbleStart = 9;
  }

  // Extract 142 nibblized bytes (71 decoded bytes)
  const nibblizedPayload = data.slice(nibbleStart, nibbleStart + 142);
  if (nibblizedPayload.length < 142) {
    console.warn("Patch dump too short:", nibblizedPayload.length, "nibbles");
    return null;
  }

  const decoded = decodeNibbles(nibblizedPayload);

  // Extract preset name from bytes 55-70 (16 ASCII chars)
  const nameBytes = decoded.slice(55, 71);
  const name = nameBytes.map((b) => String.fromCharCode(b)).join("").trim();

  // Map byte offsets to param values
  // Decoded nibble bytes are already in the correct 0-127 range (no scaling needed)
  const params = {};
  for (const [offset, key] of Object.entries(PATCH_PARAM_MAP)) {
    const byteIdx = Number(offset);
    const rawValue = decoded[byteIdx];
    params[key] = rawValue;
  }

  return { name, params, presetNumber, isEditBuffer };
}

// --- ScrewHead (deprecated, kept for export compat) ---
function ScrewHead() { return null; }

// --- Card (replaces BevelPanel) ---
function BevelPanel({ children, style = {}, screws = false, variant = "main" }) {
  const baseStyle = {
    background: COLORS.surface1,
    borderRadius: "0",
    padding: "16px",
  };
  if (variant === "sidebar") {
    baseStyle.borderTop = `1px solid ${COLORS.border}`;
    baseStyle.borderBottom = `1px solid ${COLORS.border}`;
    baseStyle.borderLeft = `1px solid ${COLORS.border}`;
  } else {
    baseStyle.borderLeft = `2px solid ${COLORS.border}`;
  }
  return (
    <div
      style={{
        ...baseStyle,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// --- LED Indicator ---
function LED({ active = false, color = "green", size = 8, label }) {
  const colors = {
    green: { on: COLORS.success, off: COLORS.ledOff },
    red: { on: COLORS.error, off: COLORS.ledOff },
    amber: { on: COLORS.warning, off: COLORS.ledOff },
  };
  const c = colors[color] || colors.green;
  return (
    <div
      role="status"
      aria-label={label ? `${label}: ${active ? "on" : "off"}` : undefined}
      aria-hidden={!label}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: active ? c.on : c.off,
        boxShadow: active ? `0 0 ${size}px ${c.on}66, 0 0 ${size * 2}px ${c.on}33` : "none",
        border: active ? "none" : `1px solid ${COLORS.border}`,
        flexShrink: 0,
        transition: "all 200ms ease",
      }}
    />
  );
}

// --- Toggle Button with LED ---
function ToggleButton({ label, active, onToggle, color = "green" }) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={active}
      aria-label={`${label} ${active ? "on" : "off"}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 14px",
        background: active ? COLORS.accentMuted : COLORS.surface2,
        border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
        borderRadius: "6px",
        color: active ? COLORS.accent : COLORS.textSecondary,
        fontSize: "11px",
        fontWeight: 500,
        cursor: "pointer",
        fontFamily: "'Outfit', sans-serif",
        minWidth: "70px",
        justifyContent: "center",
        transition: "all 150ms ease",
      }}
    >
      <LED active={active} color={color} size={6} />
      {label}
    </button>
  );
}

// --- Arc Knob ---
function ChromeKnob({ value, min, max, label, onChange, size = "md", variant }) {
  const knobRef = useRef(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startValue = useRef(0);
  const [focused, setFocused] = useState(false);

  const sizes = { lg: 84, md: 64, sm: 48 };
  const px = sizes[size] || sizes.md;

  const normalizedValue = (value - min) / (max - min);
  const angle = -135 + normalizedValue * 270;

  const handleMouseDown = (e) => {
    dragging.current = true;
    startY.current = e.clientY;
    startValue.current = value;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    e.preventDefault();
  };

  const handleMouseMove = useCallback(
    (e) => {
      if (!dragging.current) return;
      const delta = startY.current - e.clientY;
      const range = max - min;
      const newValue = Math.round(
        Math.min(max, Math.max(min, startValue.current + (delta / 150) * range))
      );
      if (newValue !== value) onChange(newValue);
    },
    [value, min, max, onChange]
  );

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseMove]);

  // Touch support
  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    dragging.current = true;
    startY.current = touch.clientY;
    startValue.current = value;
    e.preventDefault();
  };

  const handleTouchMove = useCallback(
    (e) => {
      if (!dragging.current) return;
      const touch = e.touches[0];
      const delta = startY.current - touch.clientY;
      const range = max - min;
      const newValue = Math.round(
        Math.min(max, Math.max(min, startValue.current + (delta / 150) * range))
      );
      if (newValue !== value) onChange(newValue);
      e.preventDefault();
    },
    [value, min, max, onChange]
  );

  const handleTouchEnd = useCallback(() => {
    dragging.current = false;
  }, []);

  // Keyboard support
  const handleKeyDown = (e) => {
    const step = e.shiftKey ? 10 : 1;
    let newValue = value;
    switch (e.key) {
      case "ArrowUp":
      case "ArrowRight":
        newValue = Math.min(max, value + step);
        break;
      case "ArrowDown":
      case "ArrowLeft":
        newValue = Math.max(min, value - step);
        break;
      case "Home":
        newValue = min;
        break;
      case "End":
        newValue = max;
        break;
      default:
        return;
    }
    e.preventDefault();
    if (newValue !== value) onChange(newValue);
  };

  // Knob geometry
  const uid = useId();
  const svgSize = px + 20;
  const center = svgSize / 2;
  const knobR = px / 2;        // Main knob body radius
  const skirtR = knobR + 4;    // Slightly wider skirt/base
  const tickR = skirtR + 5;    // Tick marks radius

  const gradId = `knobGrad-${uid}`;
  const shineId = `knobShine-${uid}`;

  // 11 tick marks spanning 270 degrees
  const tickCount = 11;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const tickAngle = (-135 + (i / (tickCount - 1)) * 270) * (Math.PI / 180);
    const innerR = tickR - 3;
    const outerR = tickR + 2;
    return {
      x1: center + Math.cos(tickAngle) * innerR,
      y1: center + Math.sin(tickAngle) * innerR,
      x2: center + Math.cos(tickAngle) * outerR,
      y2: center + Math.sin(tickAngle) * outerR,
      active: i / (tickCount - 1) <= normalizedValue,
    };
  });

  const pointerAngleRad = (angle * Math.PI) / 180;
  const pointerInner = knobR * 0.35;
  const pointerOuter = knobR - 2;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        userSelect: "none",
      }}
    >
      <svg
        ref={knobRef}
        width={svgSize}
        height={svgSize}
        style={{
          cursor: "ns-resize",
          outline: focused ? `2px solid ${COLORS.accent}` : "none",
          outlineOffset: "3px",
          borderRadius: "50%",
        }}
        tabIndex={0}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <defs>
          {/* Knob body gradient - dark with subtle lighting */}
          <radialGradient id={gradId} cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#4a4a4a" />
            <stop offset="50%" stopColor="#2a2a2a" />
            <stop offset="100%" stopColor="#1a1a1a" />
          </radialGradient>
          {/* Specular highlight */}
          <radialGradient id={shineId} cx="38%" cy="30%" r="35%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>

        {/* Tick marks around the knob */}
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke={t.active ? COLORS.accent : COLORS.textMuted}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        ))}

        {/* Skirt / base ring */}
        <circle cx={center} cy={center} r={skirtR}
          fill="#1a1a1a" stroke="#333" strokeWidth="1" />

        {/* Knob body */}
        <circle cx={center} cy={center} r={knobR}
          fill={`url(#${gradId})`} stroke="#444" strokeWidth="1" />

        {/* Subtle edge ring for 3D depth */}
        <circle cx={center} cy={center} r={knobR - 1}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />

        {/* Specular highlight */}
        <circle cx={center} cy={center} r={knobR - 1}
          fill={`url(#${shineId})`} />

        {/* Pointer line (white notch) */}
        <line
          x1={center + Math.cos(pointerAngleRad) * pointerInner}
          y1={center + Math.sin(pointerAngleRad) * pointerInner}
          x2={center + Math.cos(pointerAngleRad) * pointerOuter}
          y2={center + Math.sin(pointerAngleRad) * pointerOuter}
          stroke="#e8e8e8"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <span
        style={{
          fontSize: "11px",
          color: COLORS.textSecondary,
          fontFamily: "'Outfit', sans-serif",
          fontWeight: 500,
          textAlign: "center",
          lineHeight: 1.1,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "11px",
          color: COLORS.accent,
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}

// --- MIDI Log Entry ---
function LogEntry({ entry }) {
  const isOut = entry.dir === "OUT";
  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "11px",
        padding: "3px 0",
        borderBottom: `1px solid ${COLORS.borderSubtle}`,
      }}
    >
      <span style={{ color: COLORS.textMuted, minWidth: "70px" }}>{entry.time}</span>
      <span
        style={{
          color: isOut ? COLORS.accent : COLORS.success,
          background: isOut ? COLORS.accentMuted : "#162b1e",
          padding: "1px 6px",
          borderRadius: "3px",
          minWidth: "32px",
          fontWeight: 500,
          textAlign: "center",
        }}
      >
        {entry.dir}
      </span>
      <span style={{ color: COLORS.textSecondary, wordBreak: "break-all" }}>{entry.data}</span>
    </div>
  );
}


const DEFAULT_PARAMS = {
  ampModel: 0, drive: 64, drive2: 0, bass: 64, mid: 64, treble: 64,
  chanVol: 100, presence: 64, reverb_level: 40, reverb_type: 0,
  reverb_decay: 64, reverb_tone: 64, reverb_diffusion: 64, reverb_density: 64,
  effect: 0, effect_tweak: 64, effect_speed: 64, effect_depth: 64,
  effect_feedback: 0, effect_predelay: 0, noise_gate: 0, noise_gate_decay: 64,
  delay_time: 40, delay_time_fine: 0, delay_feedback: 30, delay_level: 50,
  cabModel: 0, air: 0, wah_position: 0, wah_bottom: 0, wah_top: 127,
  vol_level: 100, vol_min: 0, vol_position: 127,
  dist_enable: 0, drive_enable: 0, eq_enable: 0, delay_enable: 0,
  reverb_enable: 0, noise_gate_enable: 0, mod_fx_enable: 0, bright_switch: 0,
};

const DEFAULT_TONE_NOTES = {
  song: "", guitarist: "", band: "", notes: "", author: "", pickup: "", style: "",
};

export {
  decodeNibbles, decodePatchName, parsePatchDump,
  MIDI_CC_MAP, PATCH_PARAM_MAP, PATCH_SELECT_PARAMS,
  AMP_MODELS, CAB_MODELS, EFFECT_TYPES, COLORS,
  DEFAULT_PARAMS, DEFAULT_TONE_NOTES,
  LINE6_MANUFACTURER_ID, POCKET_POD_DEVICE_ID, MIDI_CHANNEL,
  SYSEX_START, SYSEX_END, IDENTITY_REQUEST, REQUEST_EDIT_BUFFER, REQUEST_ALL_PRESETS,
  LED, ToggleButton, ChromeKnob, BevelPanel, LogEntry, ScrewHead,
};

// --- Main App ---
export default function PocketPodEditor() {
  const [midiAccess, setMidiAccess] = useState(null);
  const [midiSupported, setMidiSupported] = useState(true);
  const [inputs, setInputs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [selectedInput, setSelectedInput] = useState("");
  const [selectedOutput, setSelectedOutput] = useState("");
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState([]);
  const [params, setParams] = useState({ ...DEFAULT_PARAMS });
  const [presetName, setPresetName] = useState("\u2014");
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [currentPreset, setCurrentPreset] = useState(0);
  const [presets, setPresets] = useState([]); // Array of {number, name, params}
  const [fetchingPresets, setFetchingPresets] = useState(false);
  const [fetchProgress, setFetchProgress] = useState(0); // 0-124
  const [toneNotes, setToneNotes] = useState({ ...DEFAULT_TONE_NOTES });
  const [errors, setErrors] = useState([]); // [{id, message}]
  const [dirty, setDirty] = useState(false); // unsaved changes tracking
  const [lastMidiActivity, setLastMidiActivity] = useState(null);
  const [deviceTimeout, setDeviceTimeout] = useState(false);

  const inputRef = useRef(null);
  const outputRef = useRef(null);
  const logContainerRef = useRef(null);

  const addError = useCallback((message) => {
    const id = Date.now() + Math.random();
    setErrors((prev) => [...prev.slice(-4), { id, message }]);
    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      setErrors((prev) => prev.filter((e) => e.id !== id));
    }, 8000);
  }, []);

  const dismissError = useCallback((id) => {
    setErrors((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const addLog = useCallback((dir, data) => {
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const hex = Array.from(data)
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join(" ");
    setLog((prev) => [
      ...prev.slice(-200),
      { time, dir, data: hex, id: Date.now() + Math.random() },
    ]);
  }, []);

  // Initialize Web MIDI
  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      setMidiSupported(false);
      addError("Web MIDI API is not available in this browser. Use Chrome or Edge over HTTPS.");
      return;
    }

    navigator
      .requestMIDIAccess({ sysex: true })
      .then((access) => {
        setMidiAccess(access);
        updatePorts(access);
        access.onstatechange = () => updatePorts(access);
      })
      .catch((err) => {
        console.error("MIDI access denied:", err);
        setMidiSupported(false);
        addError(`MIDI access denied: ${err.message || "SysEx permission required. Please allow MIDI access and reload."}`);
      });
  }, [addError]);

  const updatePorts = (access) => {
    const ins = [];
    const outs = [];
    access.inputs.forEach((input) =>
      ins.push({ id: input.id, name: input.name })
    );
    access.outputs.forEach((output) =>
      outs.push({ id: output.id, name: output.name })
    );
    setInputs(ins);
    setOutputs(outs);

    // Auto-select Line 6 Pocket POD ports
    const podIn = ins.find((i) =>
      i.name.toLowerCase().includes("pocket pod")
    );
    const podOut = outs.find((o) =>
      o.name.toLowerCase().includes("pocket pod")
    );
    if (podIn) setSelectedInput(podIn.id);
    if (podOut) setSelectedOutput(podOut.id);
  };

  // Scroll log container to bottom (without moving page focus)
  useEffect(() => {
    const container = logContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [log]);

  // Warn before closing page with unsaved changes
  useEffect(() => {
    const handler = (e) => {
      if (dirty && connected) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, connected]);

  // Device timeout detection
  useEffect(() => {
    if (!connected || !lastMidiActivity) return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastMidiActivity;
      if (elapsed > 30000) {
        addError("Device appears unresponsive (30s timeout). Auto-disconnecting.");
        disconnect(true);
      } else if (elapsed > 10000) {
        setDeviceTimeout(true);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [connected, lastMidiActivity, addError]);

  // Handle incoming MIDI messages
  const handleMidiMessage = useCallback(
    (event) => {
      const data = Array.from(event.data);
      addLog("IN", data);
      setLastMidiActivity(Date.now());
      setDeviceTimeout(false);

      // Check for SysEx
      if (data[0] === SYSEX_START) {
        // Identity reply
        if (data[1] === 0x7e && data[3] === 0x06 && data[4] === 0x02) {
          const manufacturer = data.slice(5, 8);
          const family = data.slice(8, 10);
          const member = data.slice(10, 12);
          const version = data
            .slice(12, 16)
            .map((b) => String.fromCharCode(b))
            .join("");
          setDeviceInfo({
            manufacturer: manufacturer
              .map((b) => b.toString(16).padStart(2, "0"))
              .join(" "),
            family: family
              .map((b) => b.toString(16).padStart(2, "0"))
              .join(" "),
            member: member
              .map((b) => b.toString(16).padStart(2, "0"))
              .join(" "),
            version,
          });
        }

        // Patch dump response (opcode 0x01)
        if (
          data[1] === LINE6_MANUFACTURER_ID[0] &&
          data[2] === LINE6_MANUFACTURER_ID[1] &&
          data[3] === LINE6_MANUFACTURER_ID[2] &&
          data[4] === POCKET_POD_DEVICE_ID &&
          data[5] === OPCODE_PATCH_DUMP
        ) {
          const parsed = parsePatchDump(data);
          if (parsed) {
            if (parsed.isEditBuffer) {
              // Update the current editor state from edit buffer
              setParams((prev) => ({ ...prev, ...parsed.params }));
              setPresetName(parsed.name || presetName);
            } else {
              // Store in presets array
              setPresets((prev) => {
                const updated = prev.filter((p) => p.number !== parsed.presetNumber);
                updated.push({
                  number: parsed.presetNumber,
                  name: parsed.name,
                  params: parsed.params,
                });
                updated.sort((a, b) => a.number - b.number);
                // Track fetch progress
                if (updated.length <= 124) {
                  setFetchProgress(updated.length);
                }
                if (updated.length >= 124) {
                  setFetchingPresets(false);
                }
                return updated;
              });
            }
          }
        }
      }

      // Handle CC messages (status 0xB0 for channel 1)
      if ((data[0] & 0xf0) === 0xb0) {
        const cc = data[1];
        const val = data[2];
        for (const [key, def] of Object.entries(MIDI_CC_MAP)) {
          if (def.cc === cc) {
            // For toggle params, interpret >= 64 as on (1), < 64 as off (0)
            const adjustedVal = def.max === 1 ? (val >= 64 ? 1 : 0) : val;
            setParams((prev) => ({ ...prev, [key]: adjustedVal }));
            break;
          }
        }
      }

      // Handle Program Change (status 0xC0 for channel 1)
      if ((data[0] & 0xf0) === 0xc0) {
        const program = data[1];
        setPresetName(`Preset ${program + 1}`);
        setCurrentPreset(program);
      }
    },
    [addLog, presetName]
  );

  const connect = () => {
    if (!midiAccess || !selectedInput || !selectedOutput) return;

    if (inputRef.current) {
      inputRef.current.onmidimessage = null;
    }

    const input = midiAccess.inputs.get(selectedInput);
    const output = midiAccess.outputs.get(selectedOutput);

    if (!input || !output) {
      addError("Failed to connect: MIDI port not found. The device may have been disconnected.");
      return;
    }

    input.onmidimessage = handleMidiMessage;
    inputRef.current = input;
    outputRef.current = output;
    setConnected(true);
    setDirty(false);
    setLog([]);
    setLastMidiActivity(Date.now());
    setDeviceTimeout(false);

    setTimeout(() => {
      sendSysEx(IDENTITY_REQUEST);
    }, 200);
  };

  const disconnect = (force = false) => {
    if (!force && dirty) {
      if (!window.confirm("You have unsaved parameter changes. Disconnect anyway?")) {
        return;
      }
    }
    if (inputRef.current) {
      inputRef.current.onmidimessage = null;
      inputRef.current = null;
    }
    outputRef.current = null;
    setConnected(false);
    setDeviceInfo(null);
    setPresetName("\u2014");
    setDirty(false);
    setLastMidiActivity(null);
    setDeviceTimeout(false);
  };

  const sendSysEx = (data) => {
    if (!outputRef.current) return;
    outputRef.current.send(data);
    addLog("OUT", data);
  };

  const sendCC = (cc, value) => {
    if (!outputRef.current) return;
    const msg = [0xb0 | MIDI_CHANNEL, cc, value];
    outputRef.current.send(msg);
    addLog("OUT", msg);
  };

  const sendProgramChange = (program) => {
    if (!outputRef.current) return;
    const msg = [0xc0 | MIDI_CHANNEL, program];
    outputRef.current.send(msg);
    addLog("OUT", msg);
  };

  const handleParamChange = (key, value) => {
    setParams((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    if (connected && MIDI_CC_MAP[key]) {
      // For toggle params, send 127 for on, 0 for off
      const ccValue = MIDI_CC_MAP[key].max === 1 ? (value ? 127 : 0) : value;
      sendCC(MIDI_CC_MAP[key].cc, ccValue);
    }
  };

  const requestEditBuffer = () => sendSysEx(REQUEST_EDIT_BUFFER);

  const fetchAllPresets = () => {
    if (!connected || fetchingPresets) return;
    setFetchingPresets(true);
    setPresets([]);
    setFetchProgress(0);
    // Send single bulk request — device streams back all 124 programs
    sendSysEx(REQUEST_ALL_PRESETS);
  };

  const loadPreset = (preset) => {
    // Send program change to switch the device
    sendProgramChange(preset.number);
    // Update UI with the stored params
    setParams((prev) => ({ ...prev, ...preset.params }));
    setPresetName(preset.name || `Preset ${preset.number + 1}`);
    setCurrentPreset(preset.number);
    setDirty(false);
  };


  // --- Select style used in dropdowns ---
  const selectStyle = {
    padding: "8px 12px",
    background: COLORS.surface0,
    border: `1px solid ${COLORS.border}`,
    borderRadius: "6px",
    color: COLORS.textPrimary,
    fontSize: "12px",
    fontFamily: "'Outfit', sans-serif",
    fontWeight: 500,
    maxWidth: "200px",
  };

  // --- Section label style ---
  const sectionLabel = (text) => (
    <div
      style={{
        fontSize: "13px",
        color: COLORS.textSecondary,
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        fontFamily: "'Outfit', sans-serif",
        fontWeight: 600,
        marginBottom: "12px",
      }}
    >
      {text}
    </div>
  );

  return (
    <div
      style={{
        background: COLORS.bg,
        minHeight: "100vh",
        fontFamily: "'Outfit', sans-serif",
        color: COLORS.textPrimary,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: ${COLORS.scrollTrack}; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.scrollThumb}; border-radius: 3px; }
        select, button { font-family: 'Outfit', sans-serif; }
      `}</style>

      {/* ---- TOP BAR ---- */}
      <div style={{
        padding: "16px 20px",
        borderBottom: `1px solid ${COLORS.border}`,
        display: "flex",
        alignItems: "baseline",
        gap: "12px",
      }}>
        <div style={{
          fontSize: "22px",
          fontWeight: 700,
          fontFamily: "'Outfit', sans-serif",
          color: COLORS.textPrimary,
          letterSpacing: "-0.5px",
        }}>
          Pod Studio
        </div>
        <div style={{
          fontSize: "11px",
          fontWeight: 500,
          color: COLORS.textMuted,
          letterSpacing: "2px",
          textTransform: "uppercase",
        }}>
          Pod Products Editor
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px minmax(0, 960px)", gridTemplateRows: "auto 1fr", justifyContent: "center", flex: 1 }}>

          {/* ============ MIDI CONNECTION (Row 1, Col 1) ============ */}
          <BevelPanel variant="sidebar" style={{ padding: "12px", gridColumn: 1, gridRow: 1, display: "flex", flexDirection: "column" }}>
            {sectionLabel("MIDI Connection")}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: COLORS.textSecondary, marginBottom: "4px", fontWeight: 500 }}>
                  MIDI Input
                </label>
                <select
                  value={selectedInput}
                  onChange={(e) => setSelectedInput(e.target.value)}
                  disabled={connected}
                  style={{ width: "100%", padding: "8px 10px", background: COLORS.surface0, border: `1px solid ${COLORS.border}`, borderRadius: "6px", color: COLORS.textPrimary, fontSize: "12px", fontFamily: "'Outfit', sans-serif" }}
                >
                  <option value="">Select input...</option>
                  {inputs.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: COLORS.textSecondary, marginBottom: "4px", fontWeight: 500 }}>
                  MIDI Output
                </label>
                <select
                  value={selectedOutput}
                  onChange={(e) => setSelectedOutput(e.target.value)}
                  disabled={connected}
                  style={{ width: "100%", padding: "8px 10px", background: COLORS.surface0, border: `1px solid ${COLORS.border}`, borderRadius: "6px", color: COLORS.textPrimary, fontSize: "12px", fontFamily: "'Outfit', sans-serif" }}
                >
                  <option value="">Select output...</option>
                  {outputs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                <button
                  onClick={connected ? () => disconnect() : connect}
                  disabled={!midiSupported || (!connected && (!selectedInput || !selectedOutput))}
                  style={{
                    flex: 1,
                    padding: "8px 16px",
                    background: connected ? "transparent" : COLORS.accent,
                    border: connected ? `1px solid ${COLORS.border}` : "none",
                    borderRadius: "6px",
                    color: connected ? COLORS.textSecondary : COLORS.textOnAccent,
                    fontWeight: 600,
                    fontSize: "12px",
                    cursor: "pointer",
                    fontFamily: "'Outfit', sans-serif",
                    transition: "all 150ms ease",
                    opacity: (!midiSupported || (!connected && (!selectedInput || !selectedOutput))) ? 0.5 : 1,
                  }}
                >
                  {connected ? "Disconnect" : "Connect"}
                </button>
                <LED active={connected} color="green" size={8} />
                <span style={{ fontSize: "11px", color: connected ? COLORS.success : COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
                  {connected ? "ON" : "OFF"}
                </span>
              </div>
            </div>
            {deviceInfo && (
              <div style={{ marginTop: "8px", padding: "6px 8px", background: COLORS.surface0, borderRadius: "6px", fontFamily: "'JetBrains Mono', monospace", fontSize: "11px" }}>
                <span style={{ color: COLORS.textMuted }}>Device: </span>
                <span style={{ color: COLORS.success }}>Pocket POD v{deviceInfo.version}</span>
              </div>
            )}
          </BevelPanel>

          {/* ============ PRESET LIBRARY (Row 2, Col 1) ============ */}
          <div style={{ gridColumn: 1, gridRow: 2, position: "sticky", top: 0, alignSelf: "start", maxHeight: "100vh", overflowY: "auto" }}>
          <BevelPanel variant="sidebar" style={{ padding: "12px", display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              {sectionLabel("Preset Library")}
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {fetchingPresets && (
                  <span style={{ fontSize: "11px", color: COLORS.warning, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
                    {fetchProgress}/124
                  </span>
                )}
                <button
                  onClick={fetchAllPresets}
                  disabled={!connected || fetchingPresets}
                  style={{
                    padding: "6px 14px",
                    background: fetchingPresets ? COLORS.surface2 : COLORS.accent,
                    border: fetchingPresets ? `1px solid ${COLORS.border}` : "none",
                    borderRadius: "6px",
                    color: fetchingPresets ? COLORS.textMuted : COLORS.textOnAccent,
                    fontWeight: 600,
                    fontSize: "11px",
                    cursor: fetchingPresets || !connected ? "default" : "pointer",
                    fontFamily: "'Outfit', sans-serif",
                    opacity: !connected ? 0.5 : 1,
                    transition: "all 150ms ease",
                  }}
                >
                  {fetchingPresets ? "Fetching..." : "Fetch All"}
                </button>
              </div>
            </div>

            {/* Progress bar */}
            {fetchingPresets && (
              <div style={{ height: "4px", background: COLORS.surface0, borderRadius: "2px", marginBottom: "8px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(fetchProgress / 124) * 100}%`, background: COLORS.accent, borderRadius: "2px", transition: "width 80ms linear" }} />
              </div>
            )}

            {/* Preset list */}
            {presets.length > 0 && (
              <div style={{ flex: 1, overflowY: "auto", background: COLORS.surface0, borderRadius: "6px", border: `1px solid ${COLORS.borderSubtle}` }}>
                {presets.map((preset) => (
                  <button
                    key={preset.number}
                    onClick={() => loadPreset(preset)}
                    aria-label={`Load preset ${preset.number + 1}: ${preset.name || "unnamed"}`}
                    style={{
                      display: "flex",
                      gap: "12px",
                      width: "100%",
                      padding: "8px 12px",
                      background: currentPreset === preset.number ? COLORS.accentMuted : "transparent",
                      border: "none",
                      borderBottom: `1px solid ${COLORS.borderSubtle}`,
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "'Outfit', sans-serif",
                      fontSize: "12px",
                      color: currentPreset === preset.number ? COLORS.accent : COLORS.textPrimary,
                      transition: "background 100ms ease",
                    }}
                    onMouseEnter={(e) => {
                      if (currentPreset !== preset.number) e.currentTarget.style.background = COLORS.surface2;
                    }}
                    onMouseLeave={(e) => {
                      if (currentPreset !== preset.number) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span style={{ minWidth: "32px", color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 500 }}>
                      {String(preset.number + 1).padStart(3, "0")}
                    </span>
                    <span>{preset.name || `Preset ${preset.number + 1}`}</span>
                  </button>
                ))}
              </div>
            )}

            {presets.length === 0 && !fetchingPresets && (
              <div style={{ color: COLORS.textMuted, fontSize: "12px", fontFamily: "'Outfit', sans-serif", textAlign: "center", padding: "16px" }}>
                {connected ? "Click \"Fetch All\" to load presets" : "Connect to fetch presets"}
              </div>
            )}
          </BevelPanel>
          </div>

        {/* ============ HEADER AREA (Row 1, Col 2) ============ */}
        <div style={{ gridColumn: 2, gridRow: 1, display: "flex", flexDirection: "column" }}>

        {/* MIDI Not Supported Warning */}
        {!midiSupported && (
          <div style={{ background: COLORS.errorBg, border: `1px solid ${COLORS.error}33`, borderRadius: "0", padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", margin: "8px 0" }}>
            <LED active color="red" size={8} />
            <div>
              <strong style={{ color: COLORS.error }}>Web MIDI API Not Available</strong>
              <span style={{ color: COLORS.textSecondary, marginLeft: "8px" }}>Use Chrome/Edge over HTTPS or localhost.</span>
            </div>
          </div>
        )}

        {/* Error banners */}
        {errors.map((err) => (
          <div key={err.id} role="alert" style={{ background: COLORS.errorBg, border: `1px solid ${COLORS.error}33`, borderRadius: "0", padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", marginTop: "4px" }}>
            <LED active color="red" size={8} />
            <span style={{ flex: 1, color: COLORS.error }}>{err.message}</span>
            <button onClick={() => dismissError(err.id)} aria-label="Dismiss error" style={{ background: "none", border: "none", color: COLORS.error, cursor: "pointer", fontSize: "16px", padding: "0 4px" }}>×</button>
          </div>
        ))}

        {/* Device timeout warning */}
        {deviceTimeout && connected && (
          <div role="alert" style={{ background: COLORS.warningBg, border: `1px solid ${COLORS.warning}33`, borderRadius: "0", padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", marginTop: "4px" }}>
            <LED active color="amber" size={8} />
            <span style={{ color: COLORS.warning }}>No response from device for 10+ seconds. Check connection.</span>
          </div>
        )}

        {/* ============ HEADER PANEL ============ */}
        <BevelPanel style={{ padding: "20px", flex: 1 }}>
          {/* Display panel */}
          <div style={{ background: COLORS.displayBg, border: `1px solid ${COLORS.border}`, borderRadius: "0", padding: "12px 20px", textAlign: "center", marginBottom: "16px" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "16px", color: COLORS.displayText, fontWeight: 600, textShadow: `0 0 12px ${COLORS.displayText}33` }}>
              {presetName}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: COLORS.textSecondary, marginTop: "4px" }}>
              {AMP_MODELS[params.ampModel] || "—"} <span style={{ color: COLORS.textMuted }}>/</span> {EFFECT_TYPES[params.effect] || "—"} <span style={{ color: COLORS.textMuted }}>/</span> {CAB_MODELS[params.cabModel]?.split(" ").slice(0, 2).join(" ") || "—"}
            </div>
          </div>

          {/* Model selectors row */}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: "140px" }}>
              <div style={{ fontSize: "11px", color: COLORS.textSecondary, marginBottom: "4px", fontWeight: 500 }}>Amp Model</div>
              <select value={params.ampModel} onChange={(e) => handleParamChange("ampModel", Number(e.target.value))} style={{ ...selectStyle, width: "100%", maxWidth: "none" }}>
                {AMP_MODELS.map((name, i) => (<option key={i} value={i}>{name}</option>))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: "140px" }}>
              <div style={{ fontSize: "11px", color: COLORS.textSecondary, marginBottom: "4px", fontWeight: 500 }}>Effect Type</div>
              <select value={params.effect} onChange={(e) => handleParamChange("effect", Number(e.target.value))} style={{ ...selectStyle, width: "100%", maxWidth: "none" }}>
                {EFFECT_TYPES.map((name, i) => (<option key={i} value={i}>{name}</option>))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: "140px" }}>
              <div style={{ fontSize: "11px", color: COLORS.textSecondary, marginBottom: "4px", fontWeight: 500 }}>Cabinet</div>
              <select value={params.cabModel} onChange={(e) => handleParamChange("cabModel", Number(e.target.value))} style={{ ...selectStyle, width: "100%", maxWidth: "none" }}>
                {CAB_MODELS.map((name, i) => (<option key={i} value={i}>{name}</option>))}
              </select>
            </div>
            <ChromeKnob value={params.air} min={0} max={127} label="Air" onChange={(v) => handleParamChange("air", v)} size="sm" />
          </div>
        </BevelPanel>
        </div>

        {/* ============ MAIN CONTENT (Row 2, Col 2) ============ */}
        <div style={{ gridColumn: 2, gridRow: 2 }}>

        {/* ============ MAIN KNOBS ROW ============ */}
        <BevelPanel style={{ padding: "16px 20px" }}>
          {sectionLabel("Amp Controls")}
          <div
            style={{
              display: "flex",
              justifyContent: "space-around",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <ChromeKnob
              value={params.drive}
              min={0}
              max={127}
              label="Drive"
              onChange={(v) => handleParamChange("drive", v)}
              size="lg"
            />
            <ChromeKnob
              value={params.drive2}
              min={0}
              max={127}
              label="Drive 2"
              onChange={(v) => handleParamChange("drive2", v)}
              size="lg"
            />
            <ChromeKnob
              value={params.bass}
              min={0}
              max={127}
              label="Bass"
              onChange={(v) => handleParamChange("bass", v)}
              size="lg"
            />
            <ChromeKnob
              value={params.mid}
              min={0}
              max={127}
              label="Mid"
              onChange={(v) => handleParamChange("mid", v)}
              size="lg"
            />
            <ChromeKnob
              value={params.treble}
              min={0}
              max={127}
              label="Treble"
              onChange={(v) => handleParamChange("treble", v)}
              size="lg"
            />
            <ChromeKnob
              value={params.presence}
              min={0}
              max={127}
              label="Presence"
              onChange={(v) => handleParamChange("presence", v)}
              size="lg"
            />
            <ChromeKnob
              value={params.chanVol}
              min={0}
              max={127}
              label="Chan Vol"
              onChange={(v) => handleParamChange("chanVol", v)}
              size="lg"
            />
            <ChromeKnob
              value={params.reverb_level}
              min={0}
              max={127}
              label="Reverb"
              onChange={(v) => handleParamChange("reverb_level", v)}
              size="lg"
            />
          </div>
        </BevelPanel>

        {/* ============ NOISE GATE / TOGGLES / REVERB DETAIL ROW ============ */}
        <div style={{ display: "flex", gap: "0" }}>
          {/* Noise Gate */}
          <BevelPanel style={{ flex: "1 1 180px", padding: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {sectionLabel("Noise Gate")}
              <ToggleButton
                label="Gate"
                active={params.noise_gate_enable === 1}
                onToggle={() => handleParamChange("noise_gate_enable", params.noise_gate_enable === 1 ? 0 : 1)}
                color="green"
              />
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
              <ChromeKnob
                value={params.noise_gate}
                min={0}
                max={127}
                label="Thresh"
                onChange={(v) => handleParamChange("noise_gate", v)}
                size="md"
              />
              <ChromeKnob
                value={params.noise_gate_decay}
                min={0}
                max={127}
                label="Decay"
                onChange={(v) => handleParamChange("noise_gate_decay", v)}
                size="md"
              />
            </div>
          </BevelPanel>

          {/* Toggle switches */}
          <BevelPanel style={{ flex: "0 0 130px", padding: "12px", display: "flex", flexDirection: "column", gap: "6px", alignItems: "center", justifyContent: "center" }}>
            {sectionLabel("Toggles")}
            <ToggleButton
              label="Dist"
              active={params.dist_enable === 1}
              onToggle={() => handleParamChange("dist_enable", params.dist_enable === 1 ? 0 : 1)}
              color="red"
            />
            <ToggleButton
              label="Drive"
              active={params.drive_enable === 1}
              onToggle={() => handleParamChange("drive_enable", params.drive_enable === 1 ? 0 : 1)}
              color="amber"
            />
            <ToggleButton
              label="EQ"
              active={params.eq_enable === 1}
              onToggle={() => handleParamChange("eq_enable", params.eq_enable === 1 ? 0 : 1)}
              color="green"
            />
            <ToggleButton
              label="Bright"
              active={params.bright_switch === 1}
              onToggle={() => handleParamChange("bright_switch", params.bright_switch === 1 ? 0 : 1)}
              color="amber"
            />
          </BevelPanel>

          {/* Reverb Detail */}
          <BevelPanel style={{ flex: "2 1 340px", padding: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {sectionLabel("Reverb Detail")}
              <ToggleButton
                label="Reverb"
                active={params.reverb_enable === 1}
                onToggle={() => handleParamChange("reverb_enable", params.reverb_enable === 1 ? 0 : 1)}
                color="green"
              />
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap", alignItems: "flex-start" }}>
              <ChromeKnob
                value={params.reverb_decay}
                min={0}
                max={127}
                label="Decay"
                onChange={(v) => handleParamChange("reverb_decay", v)}
                size="sm"
              />
              <ChromeKnob
                value={params.reverb_tone}
                min={0}
                max={127}
                label="Tone"
                onChange={(v) => handleParamChange("reverb_tone", v)}
                size="sm"
              />
              <ChromeKnob
                value={params.reverb_diffusion}
                min={0}
                max={127}
                label="Diffusion"
                onChange={(v) => handleParamChange("reverb_diffusion", v)}
                size="sm"
              />
              <ChromeKnob
                value={params.reverb_density}
                min={0}
                max={127}
                label="Density"
                onChange={(v) => handleParamChange("reverb_density", v)}
                size="sm"
              />
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginTop: "6px" }}>
              <label style={{ fontSize: "11px", color: COLORS.textSecondary, display: "flex", alignItems: "center", gap: "4px", cursor: "pointer", fontFamily: "'Outfit', sans-serif" }}>
                <input type="radio" name="reverbType" checked={params.reverb_type === 0} onChange={() => handleParamChange("reverb_type", 0)} style={{ accentColor: COLORS.accent }} />
                Room
              </label>
              <label style={{ fontSize: "11px", color: COLORS.textSecondary, display: "flex", alignItems: "center", gap: "4px", cursor: "pointer", fontFamily: "'Outfit', sans-serif" }}>
                <input type="radio" name="reverbType" checked={params.reverb_type === 1} onChange={() => handleParamChange("reverb_type", 1)} style={{ accentColor: COLORS.accent }} />
                Spring
              </label>
            </div>
          </BevelPanel>
        </div>

        {/* ============ DELAY / EFFECT ROW ============ */}
        <div style={{ display: "flex", gap: "0" }}>
          {/* Delay */}
          <BevelPanel style={{ flex: "1 1 50%", padding: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {sectionLabel("Delay")}
              <ToggleButton
                label="Delay"
                active={params.delay_enable === 1}
                onToggle={() => handleParamChange("delay_enable", params.delay_enable === 1 ? 0 : 1)}
                color="green"
              />
            </div>
            <div style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap" }}>
              <ChromeKnob
                value={params.delay_time}
                min={0}
                max={127}
                label="Coarse"
                onChange={(v) => handleParamChange("delay_time", v)}
                size="md"
              />
              <ChromeKnob
                value={params.delay_time_fine}
                min={0}
                max={127}
                label="Fine"
                onChange={(v) => handleParamChange("delay_time_fine", v)}
                size="md"
              />
              <ChromeKnob
                value={params.delay_feedback}
                min={0}
                max={127}
                label="Feedback"
                onChange={(v) => handleParamChange("delay_feedback", v)}
                size="md"
              />
              <ChromeKnob
                value={params.delay_level}
                min={0}
                max={127}
                label="Level"
                onChange={(v) => handleParamChange("delay_level", v)}
                size="md"
              />
            </div>
          </BevelPanel>

          {/* Effect Params */}
          <BevelPanel style={{ flex: "1 1 50%", padding: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {sectionLabel("Effect Parameters")}
              <ToggleButton
                label="Mod FX"
                active={params.mod_fx_enable === 1}
                onToggle={() => handleParamChange("mod_fx_enable", params.mod_fx_enable === 1 ? 0 : 1)}
                color="green"
              />
            </div>
            <div style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap" }}>
              <ChromeKnob
                value={params.effect_tweak}
                min={0}
                max={127}
                label="Tweak"
                onChange={(v) => handleParamChange("effect_tweak", v)}
                size="md"
              />
              <ChromeKnob
                value={params.effect_speed}
                min={0}
                max={127}
                label="Speed"
                onChange={(v) => handleParamChange("effect_speed", v)}
                size="md"
              />
              <ChromeKnob
                value={params.effect_depth}
                min={0}
                max={127}
                label="Depth"
                onChange={(v) => handleParamChange("effect_depth", v)}
                size="md"
              />
              <ChromeKnob
                value={params.effect_feedback}
                min={0}
                max={127}
                label="Feedback"
                onChange={(v) => handleParamChange("effect_feedback", v)}
                size="md"
              />
              <ChromeKnob
                value={params.effect_predelay}
                min={0}
                max={127}
                label="Pre-Delay"
                onChange={(v) => handleParamChange("effect_predelay", v)}
                size="md"
              />
            </div>
          </BevelPanel>
        </div>

        {/* ============ TONE NOTES ============ */}
        <BevelPanel style={{ padding: "16px" }}>
          {sectionLabel("Tone Notes")}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px" }}>
            {[["song", "Song"], ["guitarist", "Guitarist"], ["band", "Band"], ["style", "Style"]].map(([key, label]) => (
              <div key={key}>
                <div style={{ fontSize: "11px", color: COLORS.textSecondary, fontWeight: 500, marginBottom: "4px" }}>{label}</div>
                <input type="text" value={toneNotes[key]} onChange={(e) => setToneNotes((prev) => ({ ...prev, [key]: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", background: COLORS.surface0, border: `1px solid ${COLORS.border}`, borderRadius: "6px", fontSize: "12px", color: COLORS.textPrimary, fontFamily: "'Outfit', sans-serif" }} />
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "8px" }}>
            {[["author", "Author"], ["pickup", "Pickup"]].map(([key, label]) => (
              <div key={key}>
                <div style={{ fontSize: "11px", color: COLORS.textSecondary, fontWeight: 500, marginBottom: "4px" }}>{label}</div>
                <input type="text" value={toneNotes[key]} onChange={(e) => setToneNotes((prev) => ({ ...prev, [key]: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", background: COLORS.surface0, border: `1px solid ${COLORS.border}`, borderRadius: "6px", fontSize: "12px", color: COLORS.textPrimary, fontFamily: "'Outfit', sans-serif" }} />
              </div>
            ))}
            <div>
              <div style={{ fontSize: "11px", color: COLORS.textSecondary, fontWeight: 500, marginBottom: "4px" }}>Notes</div>
              <input type="text" value={toneNotes.notes} onChange={(e) => setToneNotes((prev) => ({ ...prev, notes: e.target.value }))}
                style={{ width: "100%", padding: "8px 10px", background: COLORS.surface0, border: `1px solid ${COLORS.border}`, borderRadius: "6px", fontSize: "12px", color: COLORS.textPrimary, fontFamily: "'Outfit', sans-serif" }} />
            </div>
          </div>
        </BevelPanel>

        {/* ============ WAH PEDAL ============ */}
        <BevelPanel style={{ padding: "12px 16px" }}>
          {sectionLabel("Wah Pedal")}
          <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
            <ChromeKnob
              value={params.wah_position}
              min={0}
              max={127}
              label="Position"
              onChange={(v) => handleParamChange("wah_position", v)}
              size="md"

            />
            <ChromeKnob
              value={params.wah_bottom}
              min={0}
              max={127}
              label="Bot Freq."
              onChange={(v) => handleParamChange("wah_bottom", v)}
              size="md"

            />
            <ChromeKnob
              value={params.wah_top}
              min={0}
              max={127}
              label="Top Freq."
              onChange={(v) => handleParamChange("wah_top", v)}
              size="md"

            />
          </div>
        </BevelPanel>

        {/* ============ VOLUME PEDAL ============ */}
        <BevelPanel style={{ padding: "12px 16px" }}>
          {sectionLabel("Volume Pedal")}
          <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
            <ChromeKnob
              value={params.vol_position}
              min={0}
              max={127}
              label="Position"
              onChange={(v) => handleParamChange("vol_position", v)}
              size="md"

            />
            <ChromeKnob
              value={params.vol_level}
              min={0}
              max={127}
              label="Level"
              onChange={(v) => handleParamChange("vol_level", v)}
              size="md"

            />
            <ChromeKnob
              value={params.vol_min}
              min={0}
              max={127}
              label="Min Vol"
              onChange={(v) => handleParamChange("vol_min", v)}
              size="md"

            />
          </div>
        </BevelPanel>

        {/* ============ MIDI MONITOR ============ */}
        <BevelPanel style={{ padding: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            {sectionLabel("MIDI Monitor")}
            <button
              onClick={() => setLog([])}
              style={{ padding: "6px 14px", background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: "6px", color: COLORS.textSecondary, fontSize: "12px", fontWeight: 500, cursor: "pointer", fontFamily: "'Outfit', sans-serif", transition: "all 150ms ease" }}
            >
              Clear
            </button>
          </div>
          <div
            ref={logContainerRef}
            style={{ maxHeight: "220px", overflowY: "auto", background: COLORS.surface0, borderRadius: "6px", padding: "8px", border: `1px solid ${COLORS.borderSubtle}` }}
          >
            {log.length === 0 && (
              <div style={{ color: COLORS.textMuted, fontSize: "12px", fontFamily: "'Outfit', sans-serif", textAlign: "center", padding: "16px" }}>
                {connected ? "Waiting for MIDI data..." : "Connect to your Pocket POD to see MIDI traffic"}
              </div>
            )}
            {log.map((entry) => (
              <LogEntry key={entry.id} entry={entry} />
            ))}
          </div>
        </BevelPanel>

        {/* Footer */}
        <div style={{ textAlign: "center", fontSize: "11px", color: COLORS.textMuted, padding: "16px", fontFamily: "'Outfit', sans-serif", borderTop: `1px solid ${COLORS.borderSubtle}` }}>
          Pocket POD Web MIDI Editor &bull; Drag knobs vertically to adjust &bull; Requires Chrome with SysEx permission
        </div>
        </div>{/* end main content (row 2, col 2) */}
      </div>{/* end grid container */}
    </div>
  );
}
