declare module 'pg' {
  export interface PoolClient {
    query: <T = any>(text: string, params?: any[]) => Promise<{ rows: T[]; rowCount: number }>;
    release: () => void;
  }

  export class Pool {
    constructor(config?: any);
    connect: () => Promise<PoolClient>;
    query: <T = any>(text: string, params?: any[]) => Promise<{ rows: T[]; rowCount: number }>;
    end: () => Promise<void>;
  }
}
