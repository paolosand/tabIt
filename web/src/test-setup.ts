import '@testing-library/jest-dom';

Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
