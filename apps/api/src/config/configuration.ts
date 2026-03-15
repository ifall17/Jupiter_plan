type AppConfig = {
  nodeEnv: string | undefined;
  port: number;
  webUrl: string | undefined;
  database: {
    url: string | undefined;
  };
  redis: {
    url: string | undefined;
    password: string | undefined;
  };
  jwt: {
    secret: string | undefined;
    refreshSecret: string | undefined;
    accessExpiry: string;
    refreshExpiry: string;
  };
  calcEngine: {
    url: string | undefined;
    timeoutMs: number;
  };
  s3: {
    endpoint: string | undefined;
    bucket: string | undefined;
    accessKey: string | undefined;
    secretKey: string | undefined;
  };
  limits: {
    maxAuditSessions: number;
    maxImportSizeMb: number;
    maxScenarioCompare: number;
  };
  logLevel: string;
};

function parseNumber(input: string | undefined, fallback: number): number {
  const value = Number.parseInt(input ?? '', 10);
  return Number.isNaN(value) ? fallback : value;
}

export default (): AppConfig => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required');
  }

  if (!process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET is required');
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  if (!process.env.REDIS_PASSWORD) {
    throw new Error('REDIS_PASSWORD is required');
  }

  if (!process.env.WEB_URL) {
    throw new Error('WEB_URL is required');
  }

  return {
    nodeEnv: process.env.NODE_ENV,
    port: parseNumber(process.env.PORT, 3001),
    webUrl: process.env.WEB_URL,
    database: {
      url: process.env.DATABASE_URL,
    },
    redis: {
      url: process.env.REDIS_URL,
      password: process.env.REDIS_PASSWORD,
    },
    jwt: {
      secret: process.env.JWT_SECRET,
      refreshSecret: process.env.JWT_REFRESH_SECRET,
      accessExpiry: process.env.JWT_ACCESS_EXPIRY || '8h',
      refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '30d',
    },
    calcEngine: {
      url: process.env.CALC_ENGINE_URL,
      timeoutMs: parseNumber(process.env.CALC_TIMEOUT_MS, 30000),
    },
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      bucket: process.env.S3_BUCKET,
      accessKey: process.env.S3_ACCESS_KEY,
      secretKey: process.env.S3_SECRET_KEY,
    },
    limits: {
      maxAuditSessions: parseNumber(process.env.MAX_AUDIT_SESSIONS, 5),
      maxImportSizeMb: parseNumber(process.env.MAX_IMPORT_SIZE_MB, 10),
      maxScenarioCompare: parseNumber(process.env.MAX_SCENARIO_COMPARE, 4),
    },
    logLevel: process.env.LOG_LEVEL || 'info',
  };
};
