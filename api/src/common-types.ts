import { type MidnightProviders } from "@midnight-ntwrk/midnight-js-types";
import { type FoundContract } from "@midnight-ntwrk/midnight-js-contracts";
import type {
  SudokuPrivateState,
  Contract,
  Witnesses,
} from "@nicolamazzoletti/midnight-sudoku-contract";

export const sudokuPrivateStateKey = "sudokuPrivateState";
export type PrivateStateId = typeof sudokuPrivateStateKey;

export type PrivateStates = {
  readonly sudokuPrivateState: SudokuPrivateState;
};

export type SudokuContract = Contract<
  SudokuPrivateState,
  Witnesses<SudokuPrivateState>
>;

export type SudokuCircuitKeys = Exclude<
  keyof SudokuContract["impureCircuits"],
  number | symbol
>;

export type SudokuProviders = MidnightProviders<
  SudokuCircuitKeys,
  PrivateStateId,
  SudokuPrivateState
>;

export type DeployedSudokuContract = FoundContract<SudokuContract>;

export type SudokuDerivedState = {
  // from public ledger
  readonly puzzle: bigint[][];
  readonly solvedTimes: bigint;
  // from private state — undefined until the user has set a solution locally
  readonly solution: bigint[][] | undefined;
};
