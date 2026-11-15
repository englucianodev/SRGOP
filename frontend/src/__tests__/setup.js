import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(cleanup);
// jsdom does not implement layout APIs used by the comboboxes.
Element.prototype.scrollIntoView ??= () => {};
