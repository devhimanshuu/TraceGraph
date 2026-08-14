import { ConfigService } from '@nestjs/config';
import neo4j, { Neo4jError } from 'neo4j-driver';
import type { AppConfig } from '../config/configuration';
import { createFakeDriver } from '../../test/helpers/fake-driver';
import { DatabaseError, DatabaseErrorKind } from './database.errors';
import { DatabaseService } from './database.service';

function createConfigService(overrides: Partial<AppConfig> = {}): ConfigService {
  const app: AppConfig = {
    nodeEnv: 'test',
    port: 4000,
    corsOrigins: ['http://localhost:3000'],
    cognodb: { uri: 'bolt://localhost:7687', username: 'test', password: 'test' },
    database: { retries: 1, retryDelayMs: 0, connectTimeoutMs: 5000, queryTimeoutMs: 10000 },
    logLevel: 'info',
    ...overrides,
  };
  return {
    getOrThrow: (key: string) => (key === 'app' ? app : undefined),
  } as unknown as ConfigService;
}

const serviceUnavailable = () =>
  new Neo4jError('server unreachable', neo4j.error.SERVICE_UNAVAILABLE, '50XXX.00', 'desc');
const syntaxError = () =>
  new Neo4jError('bad cypher', 'Neo.ClientError.Statement.SyntaxError', '22XXX.00', 'desc');

describe('DatabaseService', () => {
  describe('driver lifecycle', () => {
    it('uses the injected driver and releases every session', async () => {
      const fake = createFakeDriver();
      const service = new DatabaseService(fake.driver, createConfigService());

      await service.executeRead((tx) => tx.run('MATCH (n) RETURN n'));
      await service.executeRead((tx) => tx.run('MATCH (n) RETURN n'));

      expect(fake.state.sessionsCreated).toBe(2);
      expect(fake.state.sessionsClosed).toBe(2);
      expect(fake.state.executedReads).toBe(2);
    });

    it('releases the session when the work callback throws', async () => {
      const fake = createFakeDriver();
      const service = new DatabaseService(fake.driver, createConfigService());

      await expect(
        service.executeRead(() => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(fake.state.sessionsClosed).toBe(1);
    });

    it('closes the driver on close()', async () => {
      const fake = createFakeDriver();
      const service = new DatabaseService(fake.driver, createConfigService());

      await service.close();
      expect(fake.state.closed).toBe(true);
    });
  });

  describe('read/write execution', () => {
    it('passes parameters through untouched (parameterized queries)', async () => {
      const fake = createFakeDriver();
      const service = new DatabaseService(fake.driver, createConfigService());

      await service.executeRead((tx) =>
        tx.run('MATCH (n {id: $id}) RETURN n', { id: 'class:PaymentService' }),
      );

      expect(fake.state.runCalls[0].params).toEqual({ id: 'class:PaymentService' });
    });

    it('executes through the write path with write mode semantics', async () => {
      const fake = createFakeDriver();
      const service = new DatabaseService(fake.driver, createConfigService());

      await service.executeWrite((tx) => tx.run('MERGE (n:File {id: $id})', { id: 'f:1' }));

      expect(fake.state.executedWrites).toBe(1);
      expect(fake.state.runCalls[0].cypher).toBe('MERGE (n:File {id: $id})');
    });

    it('propagates non-driver errors untouched', async () => {
      const fake = createFakeDriver();
      const service = new DatabaseService(fake.driver, createConfigService());

      const err = new Error('Not Found');
      await expect(
        service.executeRead(() => {
          throw err;
        }),
      ).rejects.toBe(err);
    });
  });

  describe('transactions', () => {
    it('commits on success', async () => {
      const fake = createFakeDriver();
      const service = new DatabaseService(fake.driver, createConfigService());

      const result = await service.executeTransaction(async (tx) => {
        await tx.run('CREATE (n:File)');
        return 'done';
      });

      expect(result).toBe('done');
      expect(fake.state.beganTransactions).toBe(1);
      expect(fake.state.commits).toBe(1);
      expect(fake.state.rollbacks).toBe(0);
      expect(fake.state.sessionsClosed).toBe(1);
    });

    it('rolls back and rethrows on failure', async () => {
      const fake = createFakeDriver();
      const service = new DatabaseService(fake.driver, createConfigService());

      const err = new Error('boom');
      await expect(
        service.executeTransaction(async (tx) => {
          await tx.run('CREATE (n:File)');
          throw err;
        }),
      ).rejects.toBe(err);

      expect(fake.state.rollbacks).toBe(1);
      expect(fake.state.commits).toBe(0);
      expect(fake.state.sessionsClosed).toBe(1);
    });
  });

  describe('error translation', () => {
    it('translates connection-level errors to DatabaseConnectionError', async () => {
      const fake = createFakeDriver({ runError: serviceUnavailable() });
      const service = new DatabaseService(fake.driver, createConfigService());

      await expect(service.executeRead((tx) => tx.run('MATCH (n) RETURN n'))).rejects.toMatchObject(
        {
          name: 'DatabaseConnectionError',
          kind: DatabaseErrorKind.CONNECTION,
        },
      );
    });

    it('translates query errors to DatabaseQueryError', async () => {
      const fake = createFakeDriver({ runError: syntaxError() });
      const service = new DatabaseService(fake.driver, createConfigService());

      await expect(service.executeRead((tx) => tx.run('MATCH (n) RETURN n'))).rejects.toMatchObject(
        {
          name: 'DatabaseQueryError',
          kind: DatabaseErrorKind.QUERY,
        },
      );
    });

    it('translates session creation failures to a DatabaseError', async () => {
      const fake = createFakeDriver({ sessionError: serviceUnavailable() });
      const service = new DatabaseService(fake.driver, createConfigService());

      await expect(service.executeRead((tx) => tx.run('MATCH (n) RETURN n'))).rejects.toMatchObject(
        {
          kind: DatabaseErrorKind.CONNECTION,
        },
      );
    });
  });

  describe('connectivity', () => {
    it('verifyConnection returns up with a latency when reachable', async () => {
      const fake = createFakeDriver();
      const service = new DatabaseService(fake.driver, createConfigService());

      const health = await service.verifyConnection();
      expect(health.status).toBe('up');
      expect(typeof health.latencyMs).toBe('number');
    });

    it('verifyConnection returns down with a sanitized reason when unreachable', async () => {
      const fake = createFakeDriver({ runError: serviceUnavailable() });
      const service = new DatabaseService(fake.driver, createConfigService());

      const health = await service.verifyConnection();
      expect(health.status).toBe('down');
      expect(typeof health.latencyMs).toBe('number');
      expect(health.error).toBeTruthy();

      const serialized = JSON.stringify(health);
      expect(serialized).not.toContain('bolt://');
      expect(serialized).not.toContain('server unreachable');
    });
  });

  describe('timeouts', () => {
    it('aborts hung operations with DatabaseTimeoutError and releases the session', async () => {
      const fake = createFakeDriver({ hang: true });
      const service = new DatabaseService(fake.driver, createConfigService());

      await expect(
        service.executeRead((tx) => tx.run('MATCH (n) RETURN n'), { timeoutMs: 50 }),
      ).rejects.toMatchObject({
        name: 'DatabaseTimeoutError',
        kind: DatabaseErrorKind.TIMEOUT,
      });
      expect(fake.state.sessionsClosed).toBe(1);
    });
  });

  describe('error taxonomy', () => {
    it('exposes safe user-facing messages that never contain driver detail', () => {
      const err = new DatabaseError(DatabaseErrorKind.CONNECTION, 'internal detail here');
      expect(err.kind).toBe(DatabaseErrorKind.CONNECTION);
      expect(err.message).toBe('internal detail here');
    });
  });
});
