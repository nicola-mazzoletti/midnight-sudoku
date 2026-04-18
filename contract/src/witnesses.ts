import { type Ledger } from "./managed/sudoku/contract/index.js";
import { WitnessContext } from "@midnight-ntwrk/compact-runtime";

/**
 * The private state for the Sudoku contract.
 * Holds the solver's solution grid, which is never revealed on-chain.
 * Each cell is a bigint in range [1..4] (0 means empty, not valid in a solution).
 */
export type SudokuPrivateState = {
  readonly solution: bigint[][];
};

export const createSudokuPrivateState = (
  solution: bigint[][],
): SudokuPrivateState => ({
  solution,
});

/**
 * Witnesses provide the contract circuits with access to private state.
 * The `solution` witness returns the solver's private grid when the circuit needs it.
 */
export const witnesses = {
  solution: ({
    privateState,
  }: WitnessContext<Ledger, SudokuPrivateState>): [
    SudokuPrivateState,
    bigint[][],
  ] => [privateState, privateState.solution],
};
