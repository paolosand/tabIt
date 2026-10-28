import { isMac } from './platform';

test('userAgentData macOS', () =>
  expect(isMac({ platform: '', userAgentData: { platform: 'macOS' } })).toBe(true));
test('legacy MacIntel', () => expect(isMac({ platform: 'MacIntel' })).toBe(true));
test('Windows', () => expect(isMac({ platform: 'Win32' })).toBe(false));
test('Linux', () => expect(isMac({ platform: 'Linux x86_64' })).toBe(false));
