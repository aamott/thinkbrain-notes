// Tell React this is an act() environment so components rendered in tests don't
// emit the "The current testing environment is not configured to support act(...)"
// warning. Set once globally instead of per-file.
(globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
}).IS_REACT_ACT_ENVIRONMENT = true;
