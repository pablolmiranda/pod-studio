import { describe, it, expect } from 'vitest';
import {
  decodeNibbles, decodePatchName, parsePatchDump,
  MIDI_CC_MAP, PATCH_PARAM_MAP, PATCH_SELECT_PARAMS,
  AMP_MODELS, CAB_MODELS, EFFECT_TYPES,
  DEFAULT_PARAMS,
  LINE6_MANUFACTURER_ID, POCKET_POD_DEVICE_ID, MIDI_CHANNEL,
  SYSEX_START, SYSEX_END, IDENTITY_REQUEST, REQUEST_EDIT_BUFFER, REQUEST_ALL_PRESETS,
  EFFECT_CATEGORIES, DELAY_EFFECTS, EFFECT_KNOB_CONFIGS,
  EFFECT_SPECIFIC_PARAMS, EFFECT_CC_REVERSE_MAP,
  getEffectCC, formatCompRatio, COMP_RATIO_LABELS,
} from '../PocketPodEditor';

// --- decodeNibbles ---
describe('decodeNibbles', () => {
  it('decodes basic nibble pairs', () => {
    // 0x0A, 0x05 → (0x0A << 4) | 0x05 = 0xA5
    expect(decodeNibbles([0x0A, 0x05])).toEqual([0xA5]);
  });

  it('decodes multiple pairs', () => {
    expect(decodeNibbles([0x04, 0x02, 0x0F, 0x00])).toEqual([0x42, 0xF0]);
  });

  it('returns empty array for empty input', () => {
    expect(decodeNibbles([])).toEqual([]);
  });

  it('ignores trailing nibble on odd-length input', () => {
    // With 3 elements, only one pair (indices 0,1) is processed
    expect(decodeNibbles([0x03, 0x07, 0x0F])).toEqual([0x37]);
  });

  it('decodes zero values', () => {
    expect(decodeNibbles([0x00, 0x00])).toEqual([0x00]);
  });

  it('decodes max nibble values to 0xFF', () => {
    expect(decodeNibbles([0x0F, 0x0F])).toEqual([0xFF]);
  });
});

// --- decodePatchName ---
describe('decodePatchName', () => {
  it('decodes ASCII name from nibble pairs', () => {
    // "Hi" = 0x48 0x69 → nibbles [0x04, 0x08, 0x06, 0x09]
    expect(decodePatchName([0x04, 0x08, 0x06, 0x09])).toBe('Hi');
  });

  it('trims trailing spaces from padded name', () => {
    // "A " = 0x41 0x20 → nibbles [0x04, 0x01, 0x02, 0x00]
    expect(decodePatchName([0x04, 0x01, 0x02, 0x00])).toBe('A');
  });

  it('returns empty string for empty input', () => {
    expect(decodePatchName([])).toBe('');
  });
});

// --- parsePatchDump ---
describe('parsePatchDump', () => {
  // Helper to build a valid SysEx patch dump
  function buildPatchDump({ isEditBuffer = true, presetNumber = 0, paramBytes = null, nameChars = 'Test Patch      ' }) {
    // Header: F0 00 01 0C 01 01 <type> ...
    const header = [SYSEX_START, ...LINE6_MANUFACTURER_ID, POCKET_POD_DEVICE_ID, 0x01];

    let metaBytes;
    if (isEditBuffer) {
      metaBytes = [0x01, 0x00]; // type=edit buffer, version=0
    } else {
      metaBytes = [0x00, presetNumber, 0x00]; // type=stored, program#, version
    }

    // Build 71 decoded bytes: 55 param bytes + 16 name bytes
    const decoded = paramBytes || new Array(55).fill(0);
    const nameBytes = nameChars.split('').map(c => c.charCodeAt(0));
    while (nameBytes.length < 16) nameBytes.push(0x20); // pad with spaces
    const full71 = [...decoded, ...nameBytes.slice(0, 16)];

    // Nibble-encode: each byte → 2 nibbles (high, low)
    const nibblized = [];
    for (const byte of full71) {
      nibblized.push((byte >> 4) & 0x0F);
      nibblized.push(byte & 0x0F);
    }

    return [...header, ...metaBytes, ...nibblized, SYSEX_END];
  }

  it('parses edit buffer patch dump', () => {
    const data = buildPatchDump({ isEditBuffer: true, nameChars: 'My Cool Patch   ' });
    const result = parsePatchDump(data);

    expect(result).not.toBeNull();
    expect(result.isEditBuffer).toBe(true);
    expect(result.presetNumber).toBeNull();
    expect(result.name).toBe('My Cool Patch');
  });

  it('parses stored preset patch dump', () => {
    const data = buildPatchDump({ isEditBuffer: false, presetNumber: 42, nameChars: 'Stored Preset   ' });
    const result = parsePatchDump(data);

    expect(result).not.toBeNull();
    expect(result.isEditBuffer).toBe(false);
    expect(result.presetNumber).toBe(42);
    expect(result.name).toBe('Stored Preset');
  });

  it('extracts param values from patch data', () => {
    const paramBytes = new Array(55).fill(0);
    // Set ampModel (offset 8) to 5
    paramBytes[8] = 5;
    // Set drive (offset 9) to 100
    paramBytes[9] = 100;
    // Set cabModel (offset 44) to 11
    paramBytes[44] = 11;

    const data = buildPatchDump({ isEditBuffer: true, paramBytes });
    const result = parsePatchDump(data);

    expect(result.params.ampModel).toBe(5);
    expect(result.params.drive).toBe(100);
    expect(result.params.cabModel).toBe(11);
  });

  it('returns null for short/corrupt data', () => {
    // Too short — missing nibblized payload
    const shortData = [SYSEX_START, ...LINE6_MANUFACTURER_ID, POCKET_POD_DEVICE_ID, 0x01, 0x01, 0x00, SYSEX_END];
    expect(parsePatchDump(shortData)).toBeNull();
  });

  it('maps all PATCH_PARAM_MAP offsets to params', () => {
    const paramBytes = new Array(55).fill(0);
    // Set each mapped offset to a distinct value
    for (const offset of Object.keys(PATCH_PARAM_MAP)) {
      const idx = Number(offset);
      if (idx < 55) paramBytes[idx] = idx;
    }

    const data = buildPatchDump({ isEditBuffer: true, paramBytes });
    const result = parsePatchDump(data);

    for (const [offset, key] of Object.entries(PATCH_PARAM_MAP)) {
      const idx = Number(offset);
      if (idx < 55) {
        expect(result.params[key]).toBe(idx);
      }
    }
  });
});

// --- MIDI_CC_MAP ---
describe('MIDI_CC_MAP', () => {
  const entries = Object.entries(MIDI_CC_MAP);

  it('has all expected entries', () => {
    // Plan says ~45 CC-controllable parameters
    expect(entries.length).toBeGreaterThanOrEqual(35);
  });

  it('every entry has cc, name, min, max', () => {
    for (const [key, def] of entries) {
      expect(def).toHaveProperty('cc');
      expect(def).toHaveProperty('name');
      expect(def).toHaveProperty('min');
      expect(def).toHaveProperty('max');
      expect(typeof def.cc).toBe('number');
      expect(typeof def.name).toBe('string');
      expect(typeof def.min).toBe('number');
      expect(typeof def.max).toBe('number');
    }
  });

  it('toggle params have max=1', () => {
    const toggleKeys = ['dist_enable', 'drive_enable', 'eq_enable', 'delay_enable',
      'reverb_enable', 'noise_gate_enable', 'mod_fx_enable', 'bright_switch'];
    for (const key of toggleKeys) {
      expect(MIDI_CC_MAP[key].max).toBe(1);
    }
  });

  it('has no duplicate CC numbers', () => {
    const ccs = entries.map(([, def]) => def.cc);
    expect(new Set(ccs).size).toBe(ccs.length);
  });
});

// --- PATCH_PARAM_MAP ---
describe('PATCH_PARAM_MAP', () => {
  it('all offset keys are valid non-negative integers', () => {
    for (const offset of Object.keys(PATCH_PARAM_MAP)) {
      const n = Number(offset);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
    }
  });

  it('all mapped param names exist in MIDI_CC_MAP or DEFAULT_PARAMS', () => {
    for (const paramName of Object.values(PATCH_PARAM_MAP)) {
      const inCC = paramName in MIDI_CC_MAP;
      const inDefaults = paramName in DEFAULT_PARAMS;
      expect(inCC || inDefaults).toBe(true);
    }
  });
});

// --- Model arrays ---
describe('AMP_MODELS', () => {
  it('has exactly 32 entries', () => {
    expect(AMP_MODELS).toHaveLength(32);
  });

  it('all entries are non-empty strings', () => {
    for (const model of AMP_MODELS) {
      expect(typeof model).toBe('string');
      expect(model.length).toBeGreaterThan(0);
    }
  });
});

describe('CAB_MODELS', () => {
  it('has exactly 16 entries', () => {
    expect(CAB_MODELS).toHaveLength(16);
  });

  it('all entries are non-empty strings', () => {
    for (const model of CAB_MODELS) {
      expect(typeof model).toBe('string');
      expect(model.length).toBeGreaterThan(0);
    }
  });
});

describe('EFFECT_TYPES', () => {
  it('has exactly 16 entries', () => {
    expect(EFFECT_TYPES).toHaveLength(16);
  });

  it('all entries are non-empty strings', () => {
    for (const type of EFFECT_TYPES) {
      expect(typeof type).toBe('string');
      expect(type.length).toBeGreaterThan(0);
    }
  });
});

// --- DEFAULT_PARAMS ---
describe('DEFAULT_PARAMS', () => {
  it('has a key for every PATCH_PARAM_MAP value', () => {
    for (const paramName of Object.values(PATCH_PARAM_MAP)) {
      expect(DEFAULT_PARAMS).toHaveProperty(paramName);
    }
  });

  it('all values are within 0-127', () => {
    for (const [key, value] of Object.entries(DEFAULT_PARAMS)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(127);
    }
  });
});

// --- Protocol constants ---
describe('Protocol constants', () => {
  it('LINE6_MANUFACTURER_ID is correct', () => {
    expect(LINE6_MANUFACTURER_ID).toEqual([0x00, 0x01, 0x0C]);
  });

  it('POCKET_POD_DEVICE_ID is 0x01', () => {
    expect(POCKET_POD_DEVICE_ID).toBe(0x01);
  });

  it('MIDI_CHANNEL is 0 (channel 1)', () => {
    expect(MIDI_CHANNEL).toBe(0);
  });

  it('SYSEX_START/END are correct', () => {
    expect(SYSEX_START).toBe(0xF0);
    expect(SYSEX_END).toBe(0xF7);
  });

  it('IDENTITY_REQUEST has correct structure', () => {
    expect(IDENTITY_REQUEST[0]).toBe(0xF0);
    expect(IDENTITY_REQUEST[IDENTITY_REQUEST.length - 1]).toBe(0xF7);
    expect(IDENTITY_REQUEST).toEqual([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7]);
  });

  it('REQUEST_EDIT_BUFFER has correct structure', () => {
    expect(REQUEST_EDIT_BUFFER[0]).toBe(SYSEX_START);
    expect(REQUEST_EDIT_BUFFER[REQUEST_EDIT_BUFFER.length - 1]).toBe(SYSEX_END);
    // Contains manufacturer ID
    expect(REQUEST_EDIT_BUFFER.slice(1, 4)).toEqual(LINE6_MANUFACTURER_ID);
    // Contains device ID
    expect(REQUEST_EDIT_BUFFER[4]).toBe(POCKET_POD_DEVICE_ID);
  });

  it('REQUEST_ALL_PRESETS has correct structure', () => {
    expect(REQUEST_ALL_PRESETS[0]).toBe(SYSEX_START);
    expect(REQUEST_ALL_PRESETS[REQUEST_ALL_PRESETS.length - 1]).toBe(SYSEX_END);
    expect(REQUEST_ALL_PRESETS.slice(1, 4)).toEqual(LINE6_MANUFACTURER_ID);
    expect(REQUEST_ALL_PRESETS[4]).toBe(POCKET_POD_DEVICE_ID);
    // Opcode 0x00 (dump request), sub-opcode 0x02 (all programs)
    expect(REQUEST_ALL_PRESETS[5]).toBe(0x00);
    expect(REQUEST_ALL_PRESETS[6]).toBe(0x02);
  });
});

// --- EFFECT_CATEGORIES ---
describe('EFFECT_CATEGORIES', () => {
  it('maps all 16 effect types', () => {
    for (let i = 0; i < 16; i++) {
      expect(EFFECT_CATEGORIES[i]).toBeDefined();
    }
  });

  it('maps chorus types correctly', () => {
    expect(EFFECT_CATEGORIES[0]).toBe('chorus');
    expect(EFFECT_CATEGORIES[4]).toBe('chorus');
    expect(EFFECT_CATEGORIES[8]).toBe('chorus');
    expect(EFFECT_CATEGORIES[12]).toBe('chorus');
  });

  it('maps flanger types correctly', () => {
    expect(EFFECT_CATEGORIES[1]).toBe('flanger');
    expect(EFFECT_CATEGORIES[3]).toBe('flanger');
    expect(EFFECT_CATEGORIES[13]).toBe('flanger');
    expect(EFFECT_CATEGORIES[15]).toBe('flanger');
  });

  it('maps rotary correctly', () => {
    expect(EFFECT_CATEGORIES[2]).toBe('rotary');
  });

  it('maps tremolo types correctly', () => {
    expect(EFFECT_CATEGORIES[5]).toBe('tremolo');
    expect(EFFECT_CATEGORIES[9]).toBe('tremolo');
  });

  it('maps compressor types correctly', () => {
    expect(EFFECT_CATEGORIES[7]).toBe('compressor');
    expect(EFFECT_CATEGORIES[11]).toBe('compressor');
  });

  it('maps swell correctly', () => {
    expect(EFFECT_CATEGORIES[14]).toBe('swell');
  });

  it('maps bypass correctly', () => {
    expect(EFFECT_CATEGORIES[10]).toBe('bypass');
  });

  it('maps delay_only correctly', () => {
    expect(EFFECT_CATEGORIES[6]).toBe('delay_only');
  });
});

// --- DELAY_EFFECTS ---
describe('DELAY_EFFECTS', () => {
  it('includes effect types 4,5,6,7,12,13,14,15', () => {
    for (const id of [4, 5, 6, 7, 12, 13, 14, 15]) {
      expect(DELAY_EFFECTS.has(id)).toBe(true);
    }
  });

  it('excludes effect types 0,1,2,3,8,9,10,11', () => {
    for (const id of [0, 1, 2, 3, 8, 9, 10, 11]) {
      expect(DELAY_EFFECTS.has(id)).toBe(false);
    }
  });
});

// --- getEffectCC ---
describe('getEffectCC', () => {
  it('returns CC 51 for chorus speed', () => {
    expect(getEffectCC('effect_speed', 0)).toBe(51);
  });

  it('returns CC 55 for rotary speed', () => {
    expect(getEffectCC('effect_speed', 2)).toBe(55);
  });

  it('returns CC 56 for rotary depth/doppler', () => {
    expect(getEffectCC('effect_depth', 2)).toBe(56);
  });

  it('returns CC 58 for tremolo speed', () => {
    expect(getEffectCC('effect_speed', 5)).toBe(58);
  });

  it('returns CC 59 for tremolo depth', () => {
    expect(getEffectCC('effect_depth', 5)).toBe(59);
  });

  it('returns CC 42 for compressor ratio', () => {
    expect(getEffectCC('effect_speed', 7)).toBe(42);
  });

  it('returns CC 49 for swell attack', () => {
    expect(getEffectCC('effect_speed', 14)).toBe(49);
  });

  it('returns null for bypass', () => {
    expect(getEffectCC('effect_speed', 10)).toBe(null);
  });

  it('returns null for non-existent stateKey in category', () => {
    // Compressor only has effect_speed, not effect_depth
    expect(getEffectCC('effect_depth', 7)).toBe(null);
  });
});

// --- formatCompRatio ---
describe('formatCompRatio', () => {
  it('returns Off for value 0', () => {
    expect(formatCompRatio(0)).toBe('Off');
  });

  it('returns Off for value 21', () => {
    expect(formatCompRatio(21)).toBe('Off');
  });

  it('returns 1.4:1 for value 22', () => {
    expect(formatCompRatio(22)).toBe('1.4:1');
  });

  it('returns 2:1 for value 64', () => {
    expect(formatCompRatio(64)).toBe('2:1');
  });

  it('returns 3:1 for value 85', () => {
    expect(formatCompRatio(85)).toBe('3:1');
  });

  it('returns 6:1 for value 107', () => {
    expect(formatCompRatio(107)).toBe('6:1');
  });

  it('returns \u221E:1 for value 127', () => {
    expect(formatCompRatio(127)).toBe('\u221E:1');
  });

  it('returns \u221E:1 for value above 127', () => {
    expect(formatCompRatio(200)).toBe('\u221E:1');
  });
});

// --- EFFECT_KNOB_CONFIGS ---
describe('EFFECT_KNOB_CONFIGS', () => {
  it('has configs for all categories', () => {
    const categories = ['chorus', 'flanger', 'rotary', 'tremolo', 'compressor', 'swell', 'bypass', 'delay_only'];
    for (const cat of categories) {
      expect(EFFECT_KNOB_CONFIGS[cat]).toBeDefined();
    }
  });

  it('chorus has 4 knobs', () => {
    expect(EFFECT_KNOB_CONFIGS.chorus).toHaveLength(4);
  });

  it('rotary has 2 knobs', () => {
    expect(EFFECT_KNOB_CONFIGS.rotary).toHaveLength(2);
  });

  it('compressor has 1 knob', () => {
    expect(EFFECT_KNOB_CONFIGS.compressor).toHaveLength(1);
  });

  it('bypass has 0 knobs', () => {
    expect(EFFECT_KNOB_CONFIGS.bypass).toHaveLength(0);
  });

  it('delay_only has 0 knobs', () => {
    expect(EFFECT_KNOB_CONFIGS.delay_only).toHaveLength(0);
  });
});

// --- EFFECT_CC_REVERSE_MAP ---
describe('EFFECT_CC_REVERSE_MAP', () => {
  it('maps CC 42 to effect_speed (compressor)', () => {
    expect(EFFECT_CC_REVERSE_MAP[42]).toBe('effect_speed');
  });

  it('maps CC 49 to effect_speed (swell)', () => {
    expect(EFFECT_CC_REVERSE_MAP[49]).toBe('effect_speed');
  });

  it('maps CC 55 to effect_speed (rotary)', () => {
    expect(EFFECT_CC_REVERSE_MAP[55]).toBe('effect_speed');
  });

  it('maps CC 56 to effect_depth (rotary)', () => {
    expect(EFFECT_CC_REVERSE_MAP[56]).toBe('effect_depth');
  });

  it('maps CC 58 to effect_speed (tremolo)', () => {
    expect(EFFECT_CC_REVERSE_MAP[58]).toBe('effect_speed');
  });

  it('maps CC 59 to effect_depth (tremolo)', () => {
    expect(EFFECT_CC_REVERSE_MAP[59]).toBe('effect_depth');
  });
});

// --- EFFECT_SPECIFIC_PARAMS ---
describe('EFFECT_SPECIFIC_PARAMS', () => {
  it('contains effect_speed, effect_depth, effect_feedback, effect_predelay', () => {
    expect(EFFECT_SPECIFIC_PARAMS.has('effect_speed')).toBe(true);
    expect(EFFECT_SPECIFIC_PARAMS.has('effect_depth')).toBe(true);
    expect(EFFECT_SPECIFIC_PARAMS.has('effect_feedback')).toBe(true);
    expect(EFFECT_SPECIFIC_PARAMS.has('effect_predelay')).toBe(true);
  });

  it('does not contain non-effect params', () => {
    expect(EFFECT_SPECIFIC_PARAMS.has('effect_tweak')).toBe(false);
    expect(EFFECT_SPECIFIC_PARAMS.has('drive')).toBe(false);
  });
});
