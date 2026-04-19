import { createInterface, type Interface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { randomBytes } from "node:crypto";
import { WebSocket } from "ws";
import {
  SudokuAPI,
  type SudokuDerivedState,
  sudokuPrivateStateKey,
  type SudokuProviders,
  type PrivateStateId,
  type SudokuCircuitKeys,
} from "@nicolamazzoletti/midnight-sudoku-api";
import { type SudokuPrivateState } from "@nicolamazzoletti/midnight-sudoku-contract";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { type Logger } from "pino";
import { type Config, StandaloneConfig } from "./config.js";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import {
  assertIsContractAddress,
  toHex,
} from "@midnight-ntwrk/midnight-js-utils";
import { MidnightWalletProvider } from "./midnight-wallet-provider.js";
import { unshieldedToken } from "@midnight-ntwrk/ledger-v8";
import { syncWallet, waitForUnshieldedFunds } from "./wallet-utils.js";
import { generateDust } from "./generate-dust.js";
import { firstValueFrom } from "rxjs";

// @ts-expect-error: It's needed to enable WebSocket usage through apollo
globalThis.WebSocket = WebSocket;

/* **********************************************************************
 * promptSolutionGrid: prompts the user to enter a 4x4 solution grid
 * row by row, returning a bigint[][] suitable for the private state.
 */
const promptSolutionGrid = async (rli: Interface): Promise<bigint[][]> => {
  console.log(
    'Enter the solution row by row (space-separated values 1–4, e.g. "1 2 3 4"):',
  );
  const solution: bigint[][] = [];
  for (let row = 0; row < 4; row++) {
    const line = await rli.question(`Row ${row + 1}: `);
    solution.push(
      line
        .trim()
        .split(/\s+/)
        .map((v) => BigInt(v)),
    );
  }
  return solution;
};

/* **********************************************************************
 * displayPuzzleGrid: pretty-prints a 4x4 Sudoku grid with box borders.
 *
 *  +-------+-------+
 *  | 1   . | .   4 |
 *  | .   4 | 1   . |
 *  +-------+-------+
 *  | .   1 | .   . |
 *  | 4   . | .   1 |
 *  +-------+-------+
 */
const displayPuzzleGrid = (
  grid: bigint[][],
  label: string,
  logger: Logger,
): void => {
  const divider = "+-------+-------+";
  const cell = (v: bigint) => (v === 0n ? "." : v.toString());
  logger.info(label);
  logger.info(divider);
  for (let r = 0; r < 4; r++) {
    const row = grid[r];
    logger.info(
      `| ${cell(row[0])}   ${cell(row[1])} | ${cell(row[2])}   ${cell(row[3])} |`,
    );
    if (r === 1) logger.info(divider);
  }
  logger.info(divider);
};

/* **********************************************************************
 * deployOrJoin: prompts the user to deploy a new puzzle contract or
 * join an existing one, handling solution input and private state
 * initialisation in both cases.
 */
const DEPLOY_OR_JOIN_QUESTION = `
You can do one of the following:
  1. Deploy a new Sudoku puzzle contract
  2. Join an existing Sudoku puzzle contract
  3. Exit
Which would you like to do? `;

const deployOrJoin = async (
  providers: SudokuProviders,
  rli: Interface,
  logger: Logger,
): Promise<SudokuAPI | null> => {
  while (true) {
    const choice = await rli.question(DEPLOY_OR_JOIN_QUESTION);
    switch (choice) {
      case "1": {
        const api = await SudokuAPI.deploy(providers, [], logger);
        logger.info("=====================================");
        logger.info(`Contract address: ${api.deployedContractAddress}`);
        logger.info("Share this address with other solvers.");
        logger.info("=====================================");
        return api;
      }
      case "2": {
        const rawAddress = await rli.question(
          "What is the contract address (in hex)? ",
        );
        assertIsContractAddress(rawAddress);

        // Check if we already have a stored solution for this contract
        providers.privateStateProvider.setContractAddress(rawAddress);
        const existing = await providers.privateStateProvider.get(
          sudokuPrivateStateKey,
        );

        let solution: bigint[][];
        if (existing) {
          logger.info("Found existing private state — using stored solution.");
          solution = existing.solution;
        } else {
          logger.info(
            "No existing private state found. Please enter your solution.",
          );
          solution = await promptSolutionGrid(rli);
        }

        const api = await SudokuAPI.join(
          providers,
          rawAddress,
          solution,
          logger,
        );
        logger.info("=====================================");
        logger.info(`Contract address: ${api.deployedContractAddress}`);
        logger.info("=====================================");
        return api;
      }
      case "3":
        logger.info("Exiting...");
        return null;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

/* **********************************************************************
 * displayDerivedState: shows the combined public + private state —
 * the puzzle grid, how many unique solvers have solved it, and the
 * locally stored solution (if any).
 */
const displayDerivedState = (
  state: SudokuDerivedState | undefined,
  logger: Logger,
): void => {
  if (state === undefined) {
    logger.info("No Sudoku state currently available.");
    return;
  }
  displayPuzzleGrid(state.puzzle, "Current puzzle:", logger);
  logger.info(`Solved by ${state.solvedTimes} unique solver(s).`);
  if (state.solution !== undefined && state.solution.length > 0) {
    displayPuzzleGrid(state.solution, "Your private solution:", logger);
  } else {
    logger.info("No private solution stored locally.");
  }
};

/* **********************************************************************
 * mainLoop: the main interactive menu of the Sudoku CLI.
 */
const MAIN_LOOP_QUESTION = `
You can do one of the following:
  1. Display puzzle
  2. Submit your solution
  3. Display full state
  4. Show contract address
  5. Exit
Which would you like to do? `;

const mainLoop = async (
  providers: SudokuProviders,
  walletProvider: MidnightWalletProvider,
  rli: Interface,
  logger: Logger,
): Promise<void> => {
  const api = await deployOrJoin(providers, rli, logger);
  if (api === null) return;

  let currentState: SudokuDerivedState | undefined;
  const subscription = api.state$.subscribe({
    next: (state) => (currentState = state),
  });

  // The solver's coin public key is used as their on-chain identifier.
  // It is hashed inside the circuit so it never appears in plain text on the ledger.
  const solverPk = Buffer.from(
    walletProvider.getCoinPublicKey().toString(),
    "hex",
  );

  try {
    while (true) {
      const choice = await rli.question(MAIN_LOOP_QUESTION);
      try {
        switch (choice) {
          case "1": {
            const puzzle = await api.getPuzzle();
            displayPuzzleGrid(puzzle, "Puzzle:", logger);
            break;
          }
          case "2": {
            if (!currentState?.solution || currentState.solution.length === 0) {
              logger.info(
                "No solution stored yet. Please enter your solution first.",
              );
              const solution = await promptSolutionGrid(rli);
              await api.setSolution(solution);
              logger.info("Solution stored locally.");
            }
            await api.checkSolution(solverPk);
            logger.info("Solution verified and recorded on-chain!");
            break;
          }
          case "3":
            displayDerivedState(currentState, logger);
            break;
          case "4":
            logger.info("=====================================");
            logger.info(`Contract address: ${api.deployedContractAddress}`);
            logger.info("=====================================");
            break;
          case "5":
            logger.info("Exiting...");
            return;
          default:
            logger.error(`Invalid choice: ${choice}`);
        }
      } catch (e) {
        logError(logger, e);
        logger.info("Returning to main menu...");
      }
    }
  } finally {
    subscription.unsubscribe();
  }
};

/* **********************************************************************
 * buildWallet: prompts the user to create a fresh wallet or restore
 * one from a prior seed. In standalone mode a genesis seed is used.
 */
const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

const WALLET_LOOP_QUESTION = `
You can do one of the following:
  1. Build a fresh wallet
  2. Build wallet from a seed
  3. Exit
Which would you like to do? `;

const buildWallet = async (
  config: Config,
  rli: Interface,
  logger: Logger,
): Promise<string | undefined> => {
  if (config instanceof StandaloneConfig) {
    return config.walletSeed ?? GENESIS_MINT_WALLET_SEED;
  }
  if (config.walletSeed) {
    logger.info(
      "Using wallet seed from environment file — skipping wallet setup.",
    );
    return config.walletSeed;
  }
  while (true) {
    const choice = await rli.question(WALLET_LOOP_QUESTION);
    switch (choice) {
      case "1":
        return toHex(randomBytes(32));
      case "2":
        return rli.question("Enter your wallet seed: ");
      case "3":
        logger.info("Exiting...");
        return undefined;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

/* **********************************************************************
 * run: the main entry point for the Sudoku CLI.
 */
export const run = async (config: Config, logger: Logger): Promise<void> => {
  const rli = createInterface({ input, output, terminal: true });
  const providersToBeStopped: MidnightWalletProvider[] = [];
  try {
    const envConfiguration = config.getEnvironmentConfiguration();
    logger.info(
      `Environment configuration: ${JSON.stringify(envConfiguration)}`,
    );

    const seed = await buildWallet(config, rli, logger);
    if (seed === undefined) return;

    const walletProvider = await MidnightWalletProvider.build(
      logger,
      envConfiguration,
      seed,
    );
    providersToBeStopped.push(walletProvider);
    const walletFacade = walletProvider.wallet;

    await walletProvider.start();

    const unshieldedState = await waitForUnshieldedFunds(
      logger,
      walletFacade,
      envConfiguration,
      unshieldedToken(),
      config.requestFaucetTokens,
    );
    const nightBalance = unshieldedState.balances[unshieldedToken().raw];
    if (nightBalance === undefined) {
      logger.info("No funds received, exiting...");
      return;
    }
    logger.info(`Your NIGHT wallet balance is: ${nightBalance}`);

    if (config.generateDust) {
      const dustGeneration = await generateDust(
        logger,
        seed,
        unshieldedState,
        walletFacade,
      );
      if (dustGeneration) {
        logger.info(
          `Submitted dust generation registration transaction: ${dustGeneration}`,
        );
        await syncWallet(logger, walletFacade);
      }
      const dustState = await firstValueFrom(walletFacade.state());
      logger.info(`Dust balance: ${dustState.dust.balance(new Date())}`);
    }

    const zkConfigProvider = new NodeZkConfigProvider<SudokuCircuitKeys>(
      config.zkConfigPath,
    );
    const providers: SudokuProviders = {
      privateStateProvider: levelPrivateStateProvider<
        PrivateStateId,
        SudokuPrivateState
      >({
        privateStateStoreName: config.privateStateStoreName,
        signingKeyStoreName: `${config.privateStateStoreName}-signing-keys`,
        privateStoragePasswordProvider: () => "Sudoku-Test-2026!",
        accountId: seed,
      }),
      publicDataProvider: indexerPublicDataProvider(
        envConfiguration.indexer,
        envConfiguration.indexerWS,
      ),
      zkConfigProvider,
      proofProvider: httpClientProofProvider(
        envConfiguration.proofServer,
        zkConfigProvider,
      ),
      walletProvider,
      midnightProvider: walletProvider,
    };

    await mainLoop(providers, walletProvider, rli, logger);
  } catch (e) {
    logError(logger, e);
    logger.info("Exiting...");
  } finally {
    try {
      rli.close();
      rli.removeAllListeners();
    } catch (e) {
      logError(logger, e);
    } finally {
      try {
        for (const wallet of providersToBeStopped) {
          logger.info("Stopping wallet...");
          await wallet.stop();
        }
      } catch (e) {
        logError(logger, e);
      }
    }
  }
};

function logError(logger: Logger, e: unknown): void {
  if (e instanceof Error) {
    logger.error(`Found error '${e.message}'`);
    logger.debug(`${e.stack}`);
  } else {
    logger.error("Found error (unknown type)");
  }
}
