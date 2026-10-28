import { isOlderThan, MIN_ENGINE_VERSION } from './version';

test('floor is 0.4.0', () => expect(MIN_ENGINE_VERSION).toBe('0.4.0'));
test('older patch/minor is older', () => expect(isOlderThan('0.3.1', '0.4.0')).toBe(true));
test('equal is not older', () => expect(isOlderThan('0.4.0', '0.4.0')).toBe(false));
test('suffix is dropped', () => expect(isOlderThan('0.4.0-btc', '0.4.0')).toBe(false));
test('compares numerically, not lexically', () => expect(isOlderThan('0.10.0', '0.9.0')).toBe(false));
test('unparseable is not older', () => expect(isOlderThan('weird', '0.4.0')).toBe(false));
