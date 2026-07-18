export interface SourceControlRequestGate {
  begin(): number;
  isCurrent(operation: number): boolean;
}

/** Prevents an older workspace or refresh request from replacing newer panel data. */
export function createSourceControlRequestGate(): SourceControlRequestGate {
  let current = 0;

  return {
    begin: () => ++current,
    isCurrent: (operation) => current === operation
  };
}
