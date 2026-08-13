/**
 * In-memory fake of the Neo4j driver surface that DatabaseService uses.
 *
 * Lets unit tests exercise session lifecycle, error translation, timeouts,
 * and shutdown without a live CognoDB instance. The object is cast to the
 * driver's `Driver` type — tests only assert against the observable state.
 */
import type { Driver } from 'neo4j-driver';

export interface RunCall {
  cypher: string;
  params: Record<string, unknown>;
}

export interface FakeDriverOptions {
  /** Error (or factory) thrown by tx.run. */
  runError?: unknown | ((cypher: string) => unknown);
  /** When true, tx.run never settles (used for timeout tests). */
  hang?: boolean;
  /** When true, session creation throws the given error. */
  sessionError?: unknown;
}

export interface FakeDriverState {
  sessionsCreated: number;
  sessionsClosed: number;
  executedReads: number;
  executedWrites: number;
  beganTransactions: number;
  commits: number;
  rollbacks: number;
  runCalls: RunCall[];
  closed: boolean;
}

interface FakeTransaction {
  run: (cypher: string, params?: Record<string, unknown>) => Promise<unknown>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
}

export function createFakeDriver(options: FakeDriverOptions = {}) {
  const state: FakeDriverState = {
    sessionsCreated: 0,
    sessionsClosed: 0,
    executedReads: 0,
    executedWrites: 0,
    beganTransactions: 0,
    commits: 0,
    rollbacks: 0,
    runCalls: [],
    closed: false,
  };

  const makeTransaction = (): FakeTransaction => ({
    run: (cypher: string, params: Record<string, unknown> = {}) => {
      state.runCalls.push({ cypher, params });
      if (options.runError !== undefined) {
        const err =
          typeof options.runError === 'function' ? options.runError(cypher) : options.runError;
        return Promise.reject(err);
      }
      if (options.hang) {
        return new Promise(() => undefined);
      }
      return Promise.resolve({ records: [{ toObject: () => ({ ok: 1 }) }] });
    },
    commit: async () => {
      state.commits += 1;
    },
    rollback: async () => {
      state.rollbacks += 1;
    },
  });

  const session = {
    executeRead: async (work: (tx: FakeTransaction) => Promise<unknown>) => {
      state.executedReads += 1;
      return work(makeTransaction());
    },
    executeWrite: async (work: (tx: FakeTransaction) => Promise<unknown>) => {
      state.executedWrites += 1;
      return work(makeTransaction());
    },
    beginTransaction: () => {
      state.beganTransactions += 1;
      return makeTransaction();
    },
    close: async () => {
      state.sessionsClosed += 1;
    },
  };

  const driver = {
    session: () => {
      if (options.sessionError !== undefined) {
        throw options.sessionError;
      }
      state.sessionsCreated += 1;
      return session;
    },
    close: async () => {
      state.closed = true;
    },
  };

  return { driver: driver as unknown as Driver, state };
}
