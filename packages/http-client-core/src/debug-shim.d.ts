declare module "debug" {
  export interface Debugger {
    (formatter: unknown, ...args: unknown[]): void;
    extend(namespace: string): Debugger;
    enabled?: boolean;
    namespace?: string;
  }

  export default function createDebug(namespace: string): Debugger;
}
