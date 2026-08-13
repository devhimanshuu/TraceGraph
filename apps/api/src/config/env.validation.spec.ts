import { validateEnv } from './env.validation';

describe('env.validation', () => {
  const validEnv: NodeJS.ProcessEnv = {
    CORS_ORIGIN: 'http://localhost:3000',
    COGNODB_URI: 'bolt://localhost:7687',
    COGNODB_USERNAME: 'cognodb',
    COGNODB_PASSWORD: 'secret',
  };

  it('accepts a valid configuration', () => {
    expect(() => validateEnv(validEnv)).not.toThrow();
  });

  it('accepts bolt+s schemes with a port', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        COGNODB_URI: 'bolt+s://db.example.com:7687',
      }),
    ).not.toThrow();
  });

  it('rejects a missing COGNODB_PASSWORD', () => {
    const { COGNODB_PASSWORD: _password, ...withoutPassword } = validEnv;
    expect(() => validateEnv(withoutPassword)).toThrow(/COGNODB_PASSWORD/);
  });

  it('rejects a missing COGNODB_URI', () => {
    const { COGNODB_URI: _uri, ...withoutUri } = validEnv;
    expect(() => validateEnv(withoutUri)).toThrow(/COGNODB_URI/);
  });

  it('rejects a missing COGNODB_USERNAME', () => {
    const { COGNODB_USERNAME: _username, ...withoutUsername } = validEnv;
    expect(() => validateEnv(withoutUsername)).toThrow(/COGNODB_USERNAME/);
  });

  it('rejects a missing CORS_ORIGIN', () => {
    const { CORS_ORIGIN: _corsOrigin, ...withoutCors } = validEnv;
    expect(() => validateEnv(withoutCors)).toThrow(/CORS_ORIGIN/);
  });

  it('accepts the new database timeout variables', () => {
    expect(() =>
      validateEnv({
        ...validEnv,
        DB_CONNECT_TIMEOUT_MS: '5000',
        DB_QUERY_TIMEOUT_MS: '0',
      }),
    ).not.toThrow();
  });

  it('rejects a negative query timeout', () => {
    expect(() => validateEnv({ ...validEnv, DB_QUERY_TIMEOUT_MS: '-1' })).toThrow(
      /DB_QUERY_TIMEOUT_MS/,
    );
  });

  it('rejects a wildcard CORS origin', () => {
    expect(() => validateEnv({ ...validEnv, CORS_ORIGIN: '*' })).toThrow(/CORS/);
  });

  it('rejects a non-Bolt COGNODB_URI scheme', () => {
    expect(() => validateEnv({ ...validEnv, COGNODB_URI: 'https://example.com' })).toThrow(
      /COGNODB_URI/,
    );
  });

  it('rejects an empty CORS_ORIGIN', () => {
    expect(() => validateEnv({ ...validEnv, CORS_ORIGIN: ' , ' })).toThrow(/CORS/);
  });
});
