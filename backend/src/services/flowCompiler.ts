import { CompiledFlow, FlowDsl } from '../types/flow';

type CompileMeta = {
  name: string;
  version: number;
};

export function compileFlow(dsl: FlowDsl): CompiledFlow {
  if (!dsl || typeof dsl !== 'object') {
    throw new Error('Invalid flow DSL');
  }

  const compiler: CompileMeta = {
    name: 'pass_through',
    version: 1,
  };

  return {
    compiler,
    compiledAt: new Date().toISOString(),
    graph: dsl,
  };
}
