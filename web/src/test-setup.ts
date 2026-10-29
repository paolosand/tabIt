import '@testing-library/jest-dom';

// jsdom doesn't implement Element.prototype.scrollTo, which Sheet.tsx's
// auto-scroll effect calls on mount and on every beat-grid row change.
Element.prototype.scrollTo = Element.prototype.scrollTo || (() => {});
