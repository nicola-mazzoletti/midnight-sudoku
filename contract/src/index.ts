export * from './managed/sudoku/contract/index.js';
export * from './witnesses.js';

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import * as CompiledSudokuContract from './managed/sudoku/contract/index.js';
import * as Witnesses from './witnesses.js';

export const compiledSudokuContract = CompiledContract.make<
  CompiledSudokuContract.Contract<Witnesses.SudokuPrivateState>
>('Sudoku', CompiledSudokuContract.Contract<Witnesses.SudokuPrivateState>).pipe(
  CompiledContract.withWitnesses(Witnesses.witnesses),
  CompiledContract.withCompiledFileAssets('./managed/sudoku'),
);