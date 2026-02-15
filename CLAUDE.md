# Pod Editor

## Project Overview
A web-based editor for the **Line 6 Pocket POD** guitar effects processor. Communicates with the device over USB MIDI using the Web MIDI API.

## Tech Stack
- React 19.2 + Vite 7.3
- Single-page app, single main component: `src/PocketPodEditor.jsx` (~2,270 lines)
- No backend — all communication happens directly via browser Web MIDI API
- Testing: vitest + jsdom + @testing-library/react

## Reference Implementation
- `extras/main.js` — 36,278-line Angular 8/9 app from pocket-pod.web.app (source of truth for protocol)
- `extras/scripts.js` — vendor bundle (WebMidi.js, jQuery 3.4.1, roundSlider 1.4.0)
- These files are reference material only, not part of the build

## Development process
 - Create unit test for every change
 - Before commit any code, run all the unit tests to make sure there is no regressions
 - Fix any broken tests

## Testing
- Run tests: `npm test` (watch mode) or `npx vitest run` (single run)
- Test files live in `src/__tests__/` — protocol, components, and editor suites
- Testable internals (functions, constants, UI components) are named-exported from `PocketPodEditor.jsx`
- Mock `navigator.requestMIDIAccess` to simulate Web MIDI API in editor tests
- jsdom converts hex colors to `rgb()` — assert with `rgb(r, g, b)` not `#hex`

## Device Protocol

### MIDI CC
- ~45 CC-controllable parameters for real-time control
- Toggle parameters (enable/disable switches) send 0 or 127 on the wire; interpret >=64 as on, <64 as off
- Key CCs: amp model (12), drive (13), bass/mid/treble (14-16), chan vol (17), reverb level (18), effect type (19), cabinet (71)

### SysEx
- Manufacturer ID: `[0x00, 0x01, 0x0C]` (Line 6)
- Device ID: `0x01` (Pocket POD)
- Opcodes: READ_PROGRAM_DUMP `[0,0]`, READ_PROGRAM_EDIT `[0,1]`, READ_PROGRAM_DUMP_ALL `[0,2]`, WRITE_PROGRAM_DUMP `[1,0]`, WRITE_PROGRAM_EDIT `[1,1]`
- Patch data: 142 bytes — 71 parameters encoded as 2 nibble bytes each (LBS/nibble encoding)

### Device Specs
- 124 presets
- 32 amp models
- 16 cabinet models
- 16 effect types

## Key Architecture Details
- `MIDI_CC_MAP` — maps parameter names to CC numbers, min/max values
- `PATCH_PARAM_MAP` — maps nibble-decoded byte positions to parameter names
- `AMP_MODELS`, `CAB_MODELS`, `EFFECT_TYPES` — ordered arrays matching device firmware indices
- `parsePatchDump()` — decodes SysEx nibble-encoded patch data into parameter object
- `fetchAllPresets()` — sends single READ_PROGRAM_DUMP_ALL SysEx, tracks progress as responses arrive

## Common Pitfalls
- Model list ordering must exactly match device firmware indices — wrong order means wrong amp/cab/effect selected
- Patch param values are already 0-127 after nibble decoding — do not scale them
- Each patch parameter is a single byte at its position — no multi-byte parameters
- Toggle CCs must send 0/127 (not 0/1) and interpret incoming >=64 as on
- Use container `scrollTop` (not `scrollIntoView`) for auto-scrolling the MIDI monitor to avoid hijacking page focus
