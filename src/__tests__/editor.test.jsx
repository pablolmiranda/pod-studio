import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PocketPodEditor, {
  SYSEX_START, SYSEX_END, LINE6_MANUFACTURER_ID, POCKET_POD_DEVICE_ID,
  MIDI_CC_MAP, REQUEST_ALL_PRESETS,
  EFFECT_TYPES,
} from '../PocketPodEditor';

// --- Mock Web MIDI API helpers ---

function createMockMIDIPort(id, name, type) {
  return {
    id,
    name,
    type,
    state: 'connected',
    connection: 'open',
    onmidimessage: null,
    send: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
  };
}

function createMockMIDIAccess() {
  const mockInput = createMockMIDIPort('input-1', 'Pocket POD', 'input');
  const mockOutput = createMockMIDIPort('output-1', 'Pocket POD', 'output');

  const inputsMap = new Map([[mockInput.id, mockInput]]);
  const outputsMap = new Map([[mockOutput.id, mockOutput]]);

  return {
    inputs: inputsMap,
    outputs: outputsMap,
    onstatechange: null,
    _input: mockInput,
    _output: mockOutput,
  };
}

function setupMIDIMock() {
  const mockAccess = createMockMIDIAccess();
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    value: vi.fn().mockResolvedValue(mockAccess),
    writable: true,
    configurable: true,
  });
  return mockAccess;
}

function removeMIDIMock() {
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

// Helper to build a SysEx patch dump
function buildSysExPatchDump({ isEditBuffer = true, presetNumber = 0, nameChars = 'Test Patch      ', paramOverrides = {} }) {
  const header = [SYSEX_START, ...LINE6_MANUFACTURER_ID, POCKET_POD_DEVICE_ID, 0x01];

  let metaBytes;
  if (isEditBuffer) {
    metaBytes = [0x01, 0x00];
  } else {
    metaBytes = [0x00, presetNumber, 0x00];
  }

  const decoded = new Array(55).fill(0);
  for (const [offset, value] of Object.entries(paramOverrides)) {
    decoded[Number(offset)] = value;
  }

  const nameBytes = nameChars.split('').map(c => c.charCodeAt(0));
  while (nameBytes.length < 16) nameBytes.push(0x20);
  const full71 = [...decoded, ...nameBytes.slice(0, 16)];

  const nibblized = [];
  for (const byte of full71) {
    nibblized.push((byte >> 4) & 0x0F);
    nibblized.push(byte & 0x0F);
  }

  return [...header, ...metaBytes, ...nibblized, SYSEX_END];
}

// Build an identity reply SysEx
function buildIdentityReply() {
  return [
    0xF0, 0x7E, 0x01, 0x06, 0x02,
    // Manufacturer ID (3 bytes)
    0x00, 0x01, 0x0C,
    // Family (2 bytes)
    0x00, 0x01,
    // Member (2 bytes)
    0x00, 0x01,
    // Version (4 ASCII chars)
    0x31, 0x2E, 0x30, 0x30, // "1.00"
    0xF7,
  ];
}

// --- Tests ---
describe('PocketPodEditor', () => {
  let mockAccess;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockAccess = setupMIDIMock();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // --- Initial render ---
  it('renders without crashing', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });
    expect(screen.getByText('Pod Studio')).toBeInTheDocument();
  });

  it('shows "OFF" state initially', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });
    expect(screen.getByText('OFF')).toBeInTheDocument();
  });

  it('shows MIDI input and output selects', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });
    // Both input and output labels exist
    expect(screen.getByText('MIDI Input')).toBeInTheDocument();
    expect(screen.getByText('MIDI Output')).toBeInTheDocument();
  });

  // --- MIDI not supported ---
  it('shows warning when requestMIDIAccess is unavailable', async () => {
    removeMIDIMock();
    await act(async () => {
      render(<PocketPodEditor />);
    });
    expect(screen.getByText('Web MIDI API Not Available')).toBeInTheDocument();
  });

  // --- MIDI port detection ---
  it('populates input/output dropdowns when ports are available', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });
    // The Pocket POD option should be auto-detected
    const options = screen.getAllByText('Pocket POD');
    expect(options.length).toBeGreaterThanOrEqual(1);
  });

  // --- Connect/disconnect flow ---
  it('connect button enables when ports are selected', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });
    const connectBtn = screen.getByText('Connect');
    // Ports are auto-selected for "Pocket POD", so connect should be enabled
    expect(connectBtn).not.toBeDisabled();
  });

  it('clicking connect sets connected state', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });

    const connectBtn = screen.getByText('Connect');
    await act(async () => {
      fireEvent.click(connectBtn);
      // Advance past the identity request setTimeout
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText('ON')).toBeInTheDocument();
    expect(screen.getByText('Disconnect')).toBeInTheDocument();
  });

  it('disconnect resets state', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });

    // Connect first
    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText('ON')).toBeInTheDocument();

    // Disconnect
    await act(async () => {
      fireEvent.click(screen.getByText('Disconnect'));
    });
    expect(screen.getByText('OFF')).toBeInTheDocument();
  });

  // --- Incoming CC handling ---
  it('updates params on incoming CC message', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });

    // Connect
    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
      vi.advanceTimersByTime(300);
    });

    // Simulate incoming CC for drive (CC 13) with value 100
    await act(async () => {
      const handler = mockAccess._input.onmidimessage;
      handler({ data: new Uint8Array([0xB0, 13, 100]) });
    });

    // Drive value should be displayed somewhere as "100"
    const driveValues = screen.getAllByText('100');
    expect(driveValues.length).toBeGreaterThan(0);
  });

  // --- Incoming CC toggle ---
  it('interprets CC >=64 as on for toggle params', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
      vi.advanceTimersByTime(300);
    });

    // Send dist_enable CC (25) with value 127 (on)
    await act(async () => {
      mockAccess._input.onmidimessage({ data: new Uint8Array([0xB0, 25, 127]) });
    });

    // The Dist toggle should now be active
    const distToggle = screen.getByLabelText('Dist on');
    expect(distToggle).toHaveAttribute('aria-checked', 'true');
  });

  it('interprets CC <64 as off for toggle params', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
      vi.advanceTimersByTime(300);
    });

    // First turn it on
    await act(async () => {
      mockAccess._input.onmidimessage({ data: new Uint8Array([0xB0, 25, 127]) });
    });

    // Then turn it off
    await act(async () => {
      mockAccess._input.onmidimessage({ data: new Uint8Array([0xB0, 25, 10]) });
    });

    const distToggle = screen.getByLabelText('Dist off');
    expect(distToggle).toHaveAttribute('aria-checked', 'false');
  });

  // --- Incoming program change ---
  it('updates current preset on incoming program change', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
      vi.advanceTimersByTime(300);
    });

    // Send program change to program 5
    await act(async () => {
      mockAccess._input.onmidimessage({ data: new Uint8Array([0xC0, 5]) });
    });

    // Preset name should be "Preset 6" (5 + 1)
    expect(screen.getByText('Preset 6')).toBeInTheDocument();
  });

  // --- Incoming SysEx identity reply ---
  it('displays device info on identity reply', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
      vi.advanceTimersByTime(300);
    });

    // Simulate identity reply
    await act(async () => {
      mockAccess._input.onmidimessage({ data: new Uint8Array(buildIdentityReply()) });
    });

    // Device info should be displayed
    expect(screen.getByText(/Pocket POD v/)).toBeInTheDocument();
  });

  // --- Incoming SysEx patch dump (edit buffer) ---
  it('updates params and preset name on edit buffer dump', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
      vi.advanceTimersByTime(300);
    });

    const sysex = buildSysExPatchDump({
      isEditBuffer: true,
      nameChars: 'Clean Tone      ',
      paramOverrides: { 9: 80 }, // drive = 80
    });

    await act(async () => {
      mockAccess._input.onmidimessage({ data: new Uint8Array(sysex) });
    });

    expect(screen.getByText('Clean Tone')).toBeInTheDocument();
  });

  // --- Incoming SysEx patch dump (stored preset) ---
  it('adds preset to library on stored preset dump', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
      vi.advanceTimersByTime(300);
    });

    const sysex = buildSysExPatchDump({
      isEditBuffer: false,
      presetNumber: 0,
      nameChars: 'Rock Lead       ',
    });

    await act(async () => {
      mockAccess._input.onmidimessage({ data: new Uint8Array(sysex) });
    });

    // Preset should appear in the library list
    expect(screen.getByText('Rock Lead')).toBeInTheDocument();
  });

  // --- Parameter change sends CC ---
  it('sends CC when a knob value changes', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
      vi.advanceTimersByTime(300);
    });

    // Find the Drive slider and change it via keyboard
    const driveSlider = screen.getByRole('slider', { name: 'Drive' });
    await act(async () => {
      fireEvent.keyDown(driveSlider, { key: 'ArrowUp' });
    });

    // Verify CC was sent to the output
    expect(mockAccess._output.send).toHaveBeenCalled();
    const lastCall = mockAccess._output.send.mock.calls[mockAccess._output.send.mock.calls.length - 1][0];
    // Should be a CC message: [0xB0, CC#, value]
    expect(lastCall[0]).toBe(0xB0);
    expect(lastCall[1]).toBe(MIDI_CC_MAP.drive.cc);
  });

  // --- Toggle change sends 0/127 ---
  it('sends 127 when toggle is turned on and 0 when turned off', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
      vi.advanceTimersByTime(300);
    });

    // Click the Dist toggle to turn it on
    const distToggle = screen.getByRole('switch', { name: /Dist/ });
    await act(async () => {
      fireEvent.click(distToggle);
    });

    // Find the CC send call for dist_enable (CC 25) with value 127
    const sendCalls = mockAccess._output.send.mock.calls;
    const distOnCall = sendCalls.find(call => call[0][0] === 0xB0 && call[0][1] === 25);
    expect(distOnCall).toBeDefined();
    expect(distOnCall[0][2]).toBe(127);

    // Click again to turn it off
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: /Dist/ }));
    });

    const distOffCall = sendCalls.filter(call => call[0][0] === 0xB0 && call[0][1] === 25);
    // The most recent dist call should have value 0
    expect(distOffCall[distOffCall.length - 1][0][2]).toBe(0);
  });

  // --- Preset loading ---
  it('sends program change when preset is loaded', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
      vi.advanceTimersByTime(300);
    });

    // Add a preset via SysEx
    const sysex = buildSysExPatchDump({
      isEditBuffer: false,
      presetNumber: 3,
      nameChars: 'My Preset       ',
    });

    await act(async () => {
      mockAccess._input.onmidimessage({ data: new Uint8Array(sysex) });
    });

    // Click the preset to load it
    const presetBtn = screen.getByLabelText(/Load preset 4/);
    await act(async () => {
      fireEvent.click(presetBtn);
    });

    // Verify program change was sent
    const sendCalls = mockAccess._output.send.mock.calls;
    const pcCall = sendCalls.find(call => call[0][0] === 0xC0);
    expect(pcCall).toBeDefined();
    expect(pcCall[0][1]).toBe(3); // program number
  });

  // --- Fetch all presets ---
  it('sends REQUEST_ALL_PRESETS SysEx when fetch clicked', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
      vi.advanceTimersByTime(300);
    });

    const fetchBtn = screen.getByText('Fetch All');
    await act(async () => {
      fireEvent.click(fetchBtn);
    });

    // Verify the SysEx was sent
    const sendCalls = mockAccess._output.send.mock.calls;
    const sysExCall = sendCalls.find(call => {
      const d = call[0];
      return d[0] === REQUEST_ALL_PRESETS[0] &&
             d[d.length - 1] === REQUEST_ALL_PRESETS[REQUEST_ALL_PRESETS.length - 1] &&
             d[5] === 0x00 && d[6] === 0x02;
    });
    expect(sysExCall).toBeDefined();
  });

  // --- Error display and dismiss ---
  it('shows error banner and dismisses it', async () => {
    // Remove MIDI support to trigger an error
    removeMIDIMock();

    await act(async () => {
      render(<PocketPodEditor />);
    });

    // Error banner should be present
    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBeGreaterThan(0);

    // Click dismiss button
    const dismissBtn = screen.getByLabelText('Dismiss error');
    await act(async () => {
      fireEvent.click(dismissBtn);
    });

    // Error should be removed
    expect(screen.queryByLabelText('Dismiss error')).not.toBeInTheDocument();
  });

  // --- MIDI monitor logging ---
  it('logs messages in MIDI monitor', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
      vi.advanceTimersByTime(300);
    });

    // Simulate incoming CC message
    await act(async () => {
      mockAccess._input.onmidimessage({ data: new Uint8Array([0xB0, 13, 64]) });
    });

    // MIDI monitor should show the logged message
    expect(screen.getByText('IN')).toBeInTheDocument();
    // The hex data should be visible
    expect(screen.getByText('B0 0D 40')).toBeInTheDocument();
  });

  it('clears MIDI monitor log', async () => {
    await act(async () => {
      render(<PocketPodEditor />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Connect'));
      vi.advanceTimersByTime(300);
    });

    // Simulate a message to populate the log
    await act(async () => {
      mockAccess._input.onmidimessage({ data: new Uint8Array([0xB0, 13, 64]) });
    });

    expect(screen.getByText('B0 0D 40')).toBeInTheDocument();

    // Click the Clear button
    await act(async () => {
      fireEvent.click(screen.getByText('Clear'));
    });

    // The log entry should be gone
    expect(screen.queryByText('B0 0D 40')).not.toBeInTheDocument();
  });

  it('renders section label inline toggles for Noise Gate, Reverb, Delay, Effect', async () => {
    setupMIDIMock();
    await act(async () => {
      render(<PocketPodEditor />);
    });
    // These sections have inline on/off toggle switches in their titles
    const toggles = screen.getAllByRole('switch');
    const toggleLabels = toggles.map(t => t.getAttribute('aria-label'));
    expect(toggleLabels).toContain('Noise Gate off');
    expect(toggleLabels).toContain('Reverb off');
    expect(toggleLabels).toContain('Delay off');
    // Effect label includes the current effect type name
    expect(toggleLabels).toContain('Effect \u00b7 Chorus 2 off');
  });

  // --- Dynamic Effect Card ---
  it('shows chorus knobs by default (effect type 0 = Chorus 2)', async () => {
    setupMIDIMock();
    await act(async () => {
      render(<PocketPodEditor />);
    });
    // Chorus has Speed, Depth, Feedback, Pre-Delay (Delay section also has Feedback)
    const sliders = screen.getAllByRole('slider');
    const labels = sliders.map(s => s.getAttribute('aria-label'));
    expect(labels).toContain('Speed');
    expect(labels).toContain('Depth');
    expect(labels).toContain('Pre-Delay');
    // Feedback appears twice: once in Effect, once in Delay
    expect(labels.filter(l => l === 'Feedback')).toHaveLength(2);
  });

  it('shows "No modulation effect active" for bypass effect', async () => {
    setupMIDIMock();
    await act(async () => {
      render(<PocketPodEditor />);
    });
    // Change effect type to Bypass (index 10)
    const effectSelect = screen.getAllByRole('combobox').find(sel => {
      const options = Array.from(sel.options || []);
      return options.some(o => o.text === 'Bypass');
    });
    await act(async () => {
      fireEvent.change(effectSelect, { target: { value: '10' } });
    });
    expect(screen.getByText('No modulation effect active')).toBeInTheDocument();
  });

  it('shows delay grey-out message for non-delay effects', async () => {
    setupMIDIMock();
    await act(async () => {
      render(<PocketPodEditor />);
    });
    // Default effect type 0 (Chorus 2) is not a delay effect
    expect(screen.getByText('No delay in current effect')).toBeInTheDocument();
  });

  it('hides delay grey-out message for delay effects', async () => {
    setupMIDIMock();
    await act(async () => {
      render(<PocketPodEditor />);
    });
    // Change to Delay/Chorus 1 (index 4) which has delay
    const effectSelect = screen.getAllByRole('combobox').find(sel => {
      const options = Array.from(sel.options || []);
      return options.some(o => o.text === 'Delay/Chorus 1');
    });
    await act(async () => {
      fireEvent.change(effectSelect, { target: { value: '4' } });
    });
    expect(screen.queryByText('No delay in current effect')).not.toBeInTheDocument();
  });

  it('shows Reverb Level knob in reverb section', async () => {
    setupMIDIMock();
    await act(async () => {
      render(<PocketPodEditor />);
    });
    // Reverb section should have Level, Decay, Tone, Diffusion, Density
    const sliders = screen.getAllByRole('slider');
    const labels = sliders.map(s => s.getAttribute('aria-label'));
    expect(labels).toContain('Level');
    expect(labels).toContain('Decay');
    expect(labels).toContain('Tone');
    expect(labels).toContain('Diffusion');
    expect(labels).toContain('Density');
  });

  it('effect label updates when effect type changes', async () => {
    setupMIDIMock();
    await act(async () => {
      render(<PocketPodEditor />);
    });
    // Change effect type to Rotary (index 2)
    const effectSelect = screen.getAllByRole('combobox').find(sel => {
      const options = Array.from(sel.options || []);
      return options.some(o => o.text === 'Rotary');
    });
    await act(async () => {
      fireEvent.change(effectSelect, { target: { value: '2' } });
    });
    const toggles = screen.getAllByRole('switch');
    const toggleLabels = toggles.map(t => t.getAttribute('aria-label'));
    expect(toggleLabels).toContain('Effect \u00b7 Rotary off');
  });
});
