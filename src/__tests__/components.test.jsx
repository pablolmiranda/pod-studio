import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  LED, ToggleButton, ChromeKnob, BevelPanel, LogEntry, ScrewHead,
} from '../PocketPodEditor';

// --- LED ---
describe('LED', () => {
  it('renders with default green color', () => {
    const { container } = render(<LED active />);
    const led = container.firstChild;
    expect(led).toBeInTheDocument();
    expect(led.style.borderRadius).toBe('50%');
  });

  it('shows glow when active', () => {
    const { container } = render(<LED active color="green" />);
    const led = container.firstChild;
    expect(led.style.boxShadow).not.toBe('none');
  });

  it('no glow when inactive', () => {
    const { container } = render(<LED active={false} color="green" />);
    const led = container.firstChild;
    expect(led.style.boxShadow).toBe('none');
  });

  it('renders with red color', () => {
    const { container } = render(<LED active color="red" />);
    const led = container.firstChild;
    // #f85149 -> rgb(248, 81, 73)
    expect(led.style.background).toContain('248');
  });

  it('renders with amber color', () => {
    const { container } = render(<LED active color="amber" />);
    const led = container.firstChild;
    // #d29922 -> rgb(210, 153, 34)
    expect(led.style.background).toContain('210');
  });

  it('has accessibility attributes with label', () => {
    render(<LED active label="Status" />);
    const led = screen.getByRole('status');
    expect(led).toHaveAttribute('aria-label', 'Status: on');
  });

  it('accessibility label reflects off state', () => {
    render(<LED active={false} label="Power" />);
    const led = screen.getByRole('status');
    expect(led).toHaveAttribute('aria-label', 'Power: off');
  });

  it('is aria-hidden when no label', () => {
    const { container } = render(<LED active />);
    const led = container.firstChild;
    expect(led).toHaveAttribute('aria-hidden', 'true');
  });
});

// --- ToggleButton ---
describe('ToggleButton', () => {
  it('renders label text', () => {
    render(<ToggleButton label="Dist" active={false} onToggle={() => {}} />);
    expect(screen.getByText('Dist')).toBeInTheDocument();
  });

  it('calls onToggle on click', async () => {
    const onToggle = vi.fn();
    render(<ToggleButton label="Drive" active={false} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('has role=switch and aria-checked when active', () => {
    render(<ToggleButton label="EQ" active={true} onToggle={() => {}} />);
    const btn = screen.getByRole('switch');
    expect(btn).toHaveAttribute('aria-checked', 'true');
  });

  it('has aria-checked=false when inactive', () => {
    render(<ToggleButton label="EQ" active={false} onToggle={() => {}} />);
    const btn = screen.getByRole('switch');
    expect(btn).toHaveAttribute('aria-checked', 'false');
  });

  it('has accessible label', () => {
    render(<ToggleButton label="Delay" active={true} onToggle={() => {}} />);
    const btn = screen.getByRole('switch');
    expect(btn).toHaveAttribute('aria-label', 'Delay on');
  });
});

// --- BevelPanel ---
describe('BevelPanel', () => {
  it('renders children', () => {
    render(<BevelPanel><span data-testid="child">Hello</span></BevelPanel>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('accepts screws prop (no-op in modern design)', () => {
    const { container } = render(<BevelPanel screws>Content</BevelPanel>);
    // Screws are no longer rendered in the modern design
    expect(container.firstChild).toBeInTheDocument();
  });

  it('does not render screws when screws prop is false/omitted', () => {
    const { container } = render(<BevelPanel>Content</BevelPanel>);
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(0);
  });

  it('applies custom styles', () => {
    const { container } = render(
      <BevelPanel style={{ marginTop: '10px' }}>Content</BevelPanel>
    );
    expect(container.firstChild.style.marginTop).toBe('10px');
  });

  it('has straight edges (no border-radius)', () => {
    const { container } = render(<BevelPanel>Content</BevelPanel>);
    expect(container.firstChild.style.borderRadius).toBe('0');
  });

  it('defaults to main variant with left border only', () => {
    const { container } = render(<BevelPanel>Content</BevelPanel>);
    const panel = container.firstChild;
    expect(panel.style.borderLeft).toContain('2px solid');
    expect(panel.style.border).not.toContain('1px solid');
  });

  it('sidebar variant has border on top, bottom, left but not right', () => {
    const { container } = render(<BevelPanel variant="sidebar">Content</BevelPanel>);
    const panel = container.firstChild;
    expect(panel.style.borderTop).toContain('1px solid');
    expect(panel.style.borderBottom).toContain('1px solid');
    expect(panel.style.borderLeft).toContain('1px solid');
    expect(panel.style.borderRight).toBe('');
  });
});

// --- ChromeKnob ---
describe('ChromeKnob', () => {
  it('renders label and value', () => {
    render(<ChromeKnob value={64} min={0} max={127} label="Drive" onChange={() => {}} />);
    expect(screen.getByText('Drive')).toBeInTheDocument();
    expect(screen.getByText('64')).toBeInTheDocument();
  });

  it('has role=slider with aria-value attributes', () => {
    render(<ChromeKnob value={50} min={0} max={127} label="Bass" onChange={() => {}} />);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '50');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '127');
    expect(slider).toHaveAttribute('aria-label', 'Bass');
  });

  it('handles ArrowUp key to increment', () => {
    const onChange = vi.fn();
    render(<ChromeKnob value={50} min={0} max={127} label="Mid" onChange={onChange} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith(51);
  });

  it('handles ArrowDown key to decrement', () => {
    const onChange = vi.fn();
    render(<ChromeKnob value={50} min={0} max={127} label="Treble" onChange={onChange} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenCalledWith(49);
  });

  it('handles Shift+ArrowUp for step of 10', () => {
    const onChange = vi.fn();
    render(<ChromeKnob value={50} min={0} max={127} label="Vol" onChange={onChange} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowUp', shiftKey: true });
    expect(onChange).toHaveBeenCalledWith(60);
  });

  it('handles Home key to go to min', () => {
    const onChange = vi.fn();
    render(<ChromeKnob value={50} min={0} max={127} label="Pres" onChange={onChange} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('handles End key to go to max', () => {
    const onChange = vi.fn();
    render(<ChromeKnob value={50} min={0} max={127} label="Pres" onChange={onChange} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'End' });
    expect(onChange).toHaveBeenCalledWith(127);
  });

  it('clamps value at max', () => {
    const onChange = vi.fn();
    render(<ChromeKnob value={127} min={0} max={127} label="Test" onChange={onChange} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowUp' });
    // Should not call onChange because value is already at max
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clamps value at min', () => {
    const onChange = vi.fn();
    render(<ChromeKnob value={0} min={0} max={127} label="Test" onChange={onChange} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowDown' });
    expect(onChange).not.toHaveBeenCalled();
  });
});

// --- LogEntry ---
describe('LogEntry', () => {
  it('renders time, direction, and data', () => {
    const entry = { time: '12:34:56', dir: 'IN', data: 'B0 0C 05', id: 1 };
    const { container } = render(<LogEntry entry={entry} />);
    expect(screen.getByText('12:34:56')).toBeInTheDocument();
    expect(screen.getByText('IN')).toBeInTheDocument();
    expect(screen.getByText('B0 0C 05')).toBeInTheDocument();
  });

  it('uses success color for IN direction', () => {
    const entry = { time: '00:00:00', dir: 'IN', data: 'test', id: 1 };
    render(<LogEntry entry={entry} />);
    const dirSpan = screen.getByText('IN');
    // #2ea043 -> rgb(46, 160, 67)
    expect(dirSpan.style.color).toContain('46, 160, 67');
  });

  it('uses accent color for OUT direction', () => {
    const entry = { time: '00:00:00', dir: 'OUT', data: 'test', id: 1 };
    render(<LogEntry entry={entry} />);
    const dirSpan = screen.getByText('OUT');
    // #4c9aff -> rgb(76, 154, 255)
    expect(dirSpan.style.color).toContain('76, 154, 255');
  });
});

// --- ScrewHead (deprecated) ---
describe('ScrewHead', () => {
  it('renders null (deprecated in modern design)', () => {
    const { container } = render(<ScrewHead x={0} y={0} />);
    expect(container.innerHTML).toBe('');
  });
});
