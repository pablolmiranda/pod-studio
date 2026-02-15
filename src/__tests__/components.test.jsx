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
    // jsdom converts hex to rgb()
    expect(led.style.background).toContain('255');
  });

  it('renders with amber color', () => {
    const { container } = render(<LED active color="amber" />);
    const led = container.firstChild;
    expect(led.style.background).toContain('255');
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

  it('renders screws when screws prop is true', () => {
    const { container } = render(<BevelPanel screws>Content</BevelPanel>);
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(4); // 4 corner screws
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

  it('uses green color for IN direction', () => {
    const entry = { time: '00:00:00', dir: 'IN', data: 'test', id: 1 };
    render(<LogEntry entry={entry} />);
    const dirSpan = screen.getByText('IN');
    // jsdom converts #00ff44 to rgb(0, 255, 68)
    expect(dirSpan.style.color).toContain('0, 255, 68');
  });

  it('uses gold color for OUT direction', () => {
    const entry = { time: '00:00:00', dir: 'OUT', data: 'test', id: 1 };
    render(<LogEntry entry={entry} />);
    const dirSpan = screen.getByText('OUT');
    // jsdom converts #c8a840 to rgb(200, 168, 64)
    expect(dirSpan.style.color).toContain('200, 168, 64');
  });
});

// --- ScrewHead ---
describe('ScrewHead', () => {
  it('renders an SVG element', () => {
    const { container } = render(<ScrewHead x={0} y={0} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('positions absolutely at given coordinates', () => {
    const { container } = render(<ScrewHead x={10} y={20} size={12} />);
    const svg = container.querySelector('svg');
    expect(svg.style.position).toBe('absolute');
  });

  it('uses specified size', () => {
    const { container } = render(<ScrewHead x={0} y={0} size={16} />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('16');
    expect(svg.getAttribute('height')).toBe('16');
  });
});
