import * as Sudoku from "@nicolamazzoletti/midnight-sudoku-contract";
import {
  type ContractAddress,
  type ContractState,
} from "@midnight-ntwrk/compact-runtime";

type Logger = {
  info: (msg: unknown) => void;
  trace: (msg: unknown) => void;
};
import {
  type SudokuDerivedState,
  type SudokuContract,
  type SudokuProviders,
  type DeployedSudokuContract,
  sudokuPrivateStateKey,
} from "./common-types.js";
import {
  compiledSudokuContract,
  type SudokuPrivateState,
  createSudokuPrivateState,
} from "@nicolamazzoletti/midnight-sudoku-contract";
import {
  deployContract,
  findDeployedContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import { combineLatest, map, tap, from, type Observable } from "rxjs";

export interface DeployedSudokuAPI {
  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<SudokuDerivedState>;
  checkSolution: (solverPublicKey: Uint8Array) => Promise<void>;
  getSolvedTimes: () => Promise<bigint>;
  getPuzzle: () => Promise<bigint[][]>;
  setSolution: (solution: bigint[][]) => Promise<void>;
}

export class SudokuAPI implements DeployedSudokuAPI {
  private constructor(
    public readonly deployedContract: DeployedSudokuContract,
    private readonly providers: SudokuProviders,
    private readonly logger?: Logger,
  ) {
    this.deployedContractAddress =
      deployedContract.deployTxData.public.contractAddress;
    providers.privateStateProvider.setContractAddress(
      this.deployedContractAddress,
    );

    this.state$ = combineLatest(
      [
        // Public ledger state
        providers.publicDataProvider
          .contractStateObservable(this.deployedContractAddress, {
            type: "latest",
          })
          .pipe(
            map((contractState: ContractState) =>
              Sudoku.ledger(contractState.data),
            ),
            tap((ledgerState) =>
              logger?.trace({
                ledgerStateChanged: { solvedTimes: ledgerState.solvers.size() },
              }),
            ),
          ),
        // Private state (solution never changes after being set, so query once)
        from(
          providers.privateStateProvider.get(
            sudokuPrivateStateKey,
          ) as Promise<SudokuPrivateState>,
        ),
      ],
      (ledgerState, privateState) => ({
        puzzle: ledgerState.puzzle,
        solvedTimes: ledgerState.solvers.size(),
        solution: privateState?.solution,
      }),
    );
  }

  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<SudokuDerivedState>;

  /**
   * Submits a solution to the puzzle.
   * The solution itself stays private — only the proof is sent on-chain.
   *
   * @param solverPublicKey The solver's public key, used to prevent duplicate submissions.
   */
  async checkSolution(solverPublicKey: Uint8Array): Promise<void> {
    this.logger?.info("checkSolution");

    const txData =
      await this.deployedContract.callTx.checkSolution(solverPublicKey);

    this.logger?.trace({
      transactionAdded: {
        circuit: "checkSolution",
        txHash: txData.public.txHash,
        blockHeight: txData.public.blockHeight,
      },
    });
  }

  /**
   * Returns the number of unique solvers who have solved the puzzle.
   */
  async getSolvedTimes(): Promise<bigint> {
    const txData = await this.deployedContract.callTx.getSolvedTimes();
    return txData.private.result;
  }

  /**
   * Stores the solver's solution in local private state.
   * Call this before checkSolution if no solution was provided at deploy/join time.
   */
  async setSolution(solution: bigint[][]): Promise<void> {
    await this.providers.privateStateProvider.set(
      sudokuPrivateStateKey,
      createSudokuPrivateState(solution),
    );
  }

  /**
   * Returns the puzzle grid from the ledger.
   */
  async getPuzzle(): Promise<bigint[][]> {
    const txData = await this.deployedContract.callTx.getPuzzle();
    return txData.private.result as unknown as bigint[][];
  }

  /**
   * Deploys a new Sudoku puzzle contract.
   *
   * @param providers The Sudoku providers.
   * @param solution The deployer's private solution grid.
   * @param logger An optional logger.
   */
  static async deploy(
    providers: SudokuProviders,
    solution: bigint[][] = [],
    logger?: Logger,
  ): Promise<SudokuAPI> {
    logger?.info("deployContract");

    const deployedContract = await deployContract(providers, {
      compiledContract: compiledSudokuContract,
      privateStateId: sudokuPrivateStateKey,
      initialPrivateState: createSudokuPrivateState(solution),
    });

    logger?.trace({
      contractDeployed: {
        finalizedDeployTxData: deployedContract.deployTxData.public,
      },
    });

    return new SudokuAPI(deployedContract, providers, logger);
  }

  /**
   * Joins an already deployed Sudoku puzzle contract. If no private state
   * exists locally, one is initialized with an empty solution — call
   * `setSolution()` before `checkSolution()`.
   */
  static async join(
    providers: SudokuProviders,
    contractAddress: ContractAddress,
    logger?: Logger,
  ): Promise<SudokuAPI> {
    logger?.info({ joinContract: { contractAddress } });

    providers.privateStateProvider.setContractAddress(contractAddress);
    const existing = await providers.privateStateProvider.get(
      sudokuPrivateStateKey,
    );

    const deployedContract = await findDeployedContract<SudokuContract>(
      providers,
      {
        contractAddress,
        compiledContract: compiledSudokuContract,
        privateStateId: sudokuPrivateStateKey,
        initialPrivateState: existing ?? createSudokuPrivateState([]),
      },
    );

    logger?.trace({
      contractJoined: {
        finalizedDeployTxData: deployedContract.deployTxData.public,
      },
    });

    return new SudokuAPI(deployedContract, providers, logger);
  }
}

export * from "./common-types.js";
