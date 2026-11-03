import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { INSTALL_COMMAND } from '../install';
import {
  COPIED_LABEL,
  COPY_FALLBACK,
  COPY_UPDATE_COMMAND,
  DISMISS_LABEL,
  PASTE_IN_TERMINAL,
  UPDATE_NOTICE,
} from './copy';
import { UpdateNote } from './UpdateNote';

test('shows the message, a copy button and a dismiss button in a labelled region', () => {
  render(<UpdateNote onCopy={async () => true} onDismiss={() => {}} />);
  expect(screen.getByRole('region', { name: 'Helper update' })).toBeInTheDocument();
  expect(screen.getByText(UPDATE_NOTICE)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: COPY_UPDATE_COMMAND })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: DISMISS_LABEL })).toBeInTheDocument();
});

test('a successful copy says where to paste it and marks the button copied', async () => {
  const onCopy = vi.fn().mockResolvedValue(true);
  render(<UpdateNote onCopy={onCopy} onDismiss={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: COPY_UPDATE_COMMAND }));
  expect(onCopy).toHaveBeenCalledTimes(1);
  expect(await screen.findByText(PASTE_IN_TERMINAL)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: COPIED_LABEL })).toBeInTheDocument();
});

test('when the clipboard is unavailable the command is shown to select, and the copy button goes', async () => {
  render(<UpdateNote onCopy={async () => false} onDismiss={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: COPY_UPDATE_COMMAND }));
  expect(await screen.findByText(INSTALL_COMMAND)).toBeInTheDocument();
  expect(screen.getByText(COPY_FALLBACK)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: COPY_UPDATE_COMMAND })).not.toBeInTheDocument();
});

test('dismiss calls onDismiss', async () => {
  const onDismiss = vi.fn();
  render(<UpdateNote onCopy={async () => true} onDismiss={onDismiss} />);
  await userEvent.click(screen.getByRole('button', { name: DISMISS_LABEL }));
  expect(onDismiss).toHaveBeenCalledTimes(1);
});
