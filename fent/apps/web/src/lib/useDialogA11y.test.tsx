import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useDialogA11y } from './useDialogA11y';

function TestDialog({ onClose }: { onClose: () => void }) {
  const containerRef = useDialogA11y<HTMLDivElement>(onClose);
  return (
    <div>
      <button>Outside trigger</button>
      <div ref={containerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Test dialog">
        <button>First</button>
        <button>Second</button>
        <button>Last</button>
      </div>
    </div>
  );
}

describe('useDialogA11y', () => {
  it('moves focus into the dialog (to its first focusable element) on mount', () => {
    render(<TestDialog onClose={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = jest.fn();
    render(<TestDialog onClose={onClose} />);

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps Tab focus within the dialog — tabbing past the last element wraps to the first', async () => {
    render(<TestDialog onClose={jest.fn()} />);

    screen.getByRole('button', { name: 'Last' }).focus();
    await userEvent.tab();

    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('traps Shift+Tab focus within the dialog — shift-tabbing past the first element wraps to the last', async () => {
    render(<TestDialog onClose={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    await userEvent.tab({ shift: true });

    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
  });

  it('restores focus to the previously-focused element on unmount', () => {
    function Wrapper({ showDialog }: { showDialog: boolean }) {
      return (
        <div>
          <button id="trigger">Open</button>
          {showDialog && <TestDialog onClose={jest.fn()} />}
        </div>
      );
    }

    const { rerender } = render(<Wrapper showDialog={false} />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    trigger.focus();
    expect(trigger).toHaveFocus();

    rerender(<Wrapper showDialog />);
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();

    rerender(<Wrapper showDialog={false} />);
    expect(trigger).toHaveFocus();
  });
});
