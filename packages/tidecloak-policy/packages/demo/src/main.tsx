// src/main.tsx
import { mountForsetiPolicyBuilderTester } from '../tests/ForsetiPolicyBuilderDevPanel';

// (optional) TS global so the compiler is happy in dev
declare global {
  interface Window {
    mountForsetiPolicyBuilderTester?: () => void;
  }
}

// expose for manual mounting from console if you like
window.mountForsetiPolicyBuilderTester = mountForsetiPolicyBuilderTester;

// Mount the tester immediately (and safely after DOM ready)
const mount = () => {
  try {
    mountForsetiPolicyBuilderTester();
  } catch (e) {
    console.error('Failed to mount ForsetiPolicyBuilderTester:', e);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
