import { isMac } from './platform';

test('userAgentData macOS', () =>
  expect(isMac({ platform: '', userAgentData: { platform: 'macOS' } })).toBe(true));
test('legacy MacIntel', () => expect(isMac({ platform: 'MacIntel' })).toBe(true));
test('Windows', () => expect(isMac({ platform: 'Win32' })).toBe(false));
test('Linux', () => expect(isMac({ platform: 'Linux x86_64' })).toBe(false));
test('userAgentData wins over navigator.platform when both are present and disagree', () => {
  expect(isMac({ platform: 'Win32', userAgentData: { platform: 'macOS' } })).toBe(true);
  expect(isMac({ platform: 'MacIntel', userAgentData: { platform: 'Windows' } })).toBe(false);
});
