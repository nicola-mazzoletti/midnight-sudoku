import { createInterface, type Interface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { randomBytes } from "node:crypto";
import { WebSocket } from "ws";
import {
  SudokuAPI,
  type SudokuDerivedState,
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

// @ts-expect-error: enable WebSocket usage through apollo
globalThis.WebSocket = WebSocket;

const GENESIS_MINT_WALLET_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

const D =
  "──────────────────────────────────────────────────────────────";

const BANNER = `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║              Midnight Sudoku                                 ║
║              ──────────────────                              ║
║              ZK-verified 4x4 puzzle solutions                ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`;

/* ── Spinner for long-running operations ─────────────────────────────────── */

const withStatus = async <T>(message: string, fn: () => Promise<T>): Promise<T> => {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const interval = setInterval(
    () => process.stdout.write(`\r  ${frames[i++ % frames.length]} ${message}`),
    80,
  );
  try {
    const result = await fn();
    clearInterval(interval);
    process.stdout.write(`\r  ✓ ${message}\n`);
    return result;
  } catch (e) {
    clearInterval(interval);
    process.stdout.write(`\r  ✗ ${message}\n`);
    throw e;
  }
};

const showError = (e: unknown): void => {
  const msg = e instanceof Error ? e.message : String(e);
  console.log(`\n  ✗ ${msg}\n`);
};

/* ── Grid helpers ─────────────────────────────────────────────────────────── */

const promptSolutionGrid = async (rli: Interface): Promise<bigint[][]> => {
  console.log(
    '\n  Enter the solution row by row (space-separated, e.g. "1 2 3 4"):',
  );
  const solution: bigint[][] = [];
  for (let row = 0; row < 4; row++) {
    const line = await rli.question(`  Row ${row + 1}: `);
    solution.push(
      line
        .trim()
        .split(/\s+/)
        .map((v) => BigInt(v)),
    );
  }
  return solution;
};

const renderGrid = (grid: bigint[][], label: string): void => {
  const cell = (v: bigint) => (v === 0n ? "." : v.toString());
  console.log(`\n  ${label}`);
  console.log("  +-------+-------+");
  for (let r = 0; r < 4; r++) {
    const row = grid[r];
    console.log(
      `  | ${cell(row[0])}   ${cell(row[1])} | ${cell(row[2])}   ${cell(row[3])} |`,
    );
    if (r === 1) console.log("  +-------+-------+");
  }
  console.log("  +-------+-------+\n");
};

/* ── Wallet setup ─────────────────────────────────────────────────────────── */

const setupWallet = async (
  config: Config,
  rli: Interface,
  logger: Logger,
): Promise<string | null> => {
  if (config instanceof StandaloneConfig) return GENESIS_MINT_WALLET_SEED;

  const choice = await rli.question(
    `\n${D}\n  Wallet Setup\n${D}\n` +
      `  [1] Create a new wallet\n` +
      `  [2] Restore wallet from seed\n` +
      `  [3] Exit\n${D}\n> `,
  );

  if (choice.trim() === "1") {
    const seed = toHex(randomBytes(32));
    console.log(
      `\n${D}\n  New wallet — save your seed phrase:\n\n  ${seed}\n${D}\n`,
    );
    return seed;
  }
  if (choice.trim() === "2") {
    const seed = await rli.question("  Enter your wallet seed: ");
    return seed.trim();
  }
  logger.info("Exiting...");
  return null;
};

/* ── Contract setup ───────────────────────────────────────────────────────── */

const setupContract = async (
  providers: SudokuProviders,
  rli: Interface,
  logger: Logger,
): Promise<SudokuAPI | null> => {
  while (true) {
    const choice = await rli.question(
      `\n${D}\n  Contract Actions\n${D}\n` +
        `  [1] Deploy a new Sudoku puzzle contract\n` +
        `  [2] Join an existing Sudoku puzzle contract\n` +
        `  [3] Exit\n${D}\n> `,
    );

    if (choice.trim() === "1") {
      try {
        const api = await withStatus("Deploying Sudoku contract", () =>
          SudokuAPI.deploy(providers, [], logger),
        );
        console.log(
          `\n${D}\n  Contract address:\n  ${api.deployedContractAddress}\n\n  Share this address with other solvers.\n${D}\n`,
        );
        return api;
      } catch (e) {
        showError(e);
      }
    } else if (choice.trim() === "2") {
      const rawAddress = (
        await rli.question("  Enter the contract address (hex): ")
      ).trim();
      try {
        assertIsContractAddress(rawAddress);
        const api = await withStatus("Joining Sudoku contract", () =>
          SudokuAPI.join(providers, rawAddress, logger),
        );
        console.log(
          `\n${D}\n  Joined contract:\n  ${api.deployedContractAddress}\n${D}\n`,
        );
        return api;
      } catch (e) {
        showError(e);
      }
    } else {
      logger.info("Exiting...");
      return null;
    }
  }
};

/* ── Main loop ────────────────────────────────────────────────────────────── */

const mainLoop = async (
  api: SudokuAPI,
  walletProvider: MidnightWalletProvider,
  rli: Interface,
): Promise<void> => {
  let currentState: SudokuDerivedState | undefined;
  const subscription = api.state$.subscribe({
    next: (state) => (currentState = state),
  });

  // Solver's coin public key — hashed in-circuit so never appears on-chain.
  const solverPk = Buffer.from(
    walletProvider.getCoinPublicKey().toString(),
    "hex",
  );

  try {
    while (true) {
      const choice = await rli.question(
        `\n${D}\n  Sudoku Actions\n${D}\n` +
          `  [1] Display puzzle\n` +
          `  [2] Submit your solution\n` +
          `  [3] Display full state\n` +
          `  [4] Show contract address\n` +
          `  [5] Exit\n${D}\n> `,
      );

      try {
        switch (choice.trim()) {
          case "1": {
            const puzzle = await withStatus("Fetching puzzle", () =>
              api.getPuzzle(),
            );
            renderGrid(puzzle, "Puzzle:");
            break;
          }
          case "2": {
            if (!currentState?.solution || currentState.solution.length === 0) {
              console.log("\n  No solution stored locally yet.");
              const solution = await promptSolutionGrid(rli);
              await api.setSolution(solution);
              console.log("  ✓ Solution stored locally.\n");
            }
            await withStatus("Verifying solution on-chain", () =>
              api.checkSolution(solverPk),
            );
            console.log("\n  Solution verified and recorded on-chain.\n");
            break;
          }
          case "3": {
            if (currentState === undefined) {
              console.log("\n  No Sudoku state currently available.\n");
              break;
            }
            renderGrid(currentState.puzzle, "Current puzzle:");
            console.log(
              `  Solved by ${currentState.solvedTimes} unique solver(s).`,
            );
            if (currentState.solution && currentState.solution.length > 0) {
              renderGrid(currentState.solution, "Your private solution:");
            } else {
              console.log("  No private solution stored locally.\n");
            }
            break;
          }
          case "4":
            console.log(
              `\n${D}\n  Contract address:\n  ${api.deployedContractAddress}\n${D}\n`,
            );
            break;
          case "5":
            return;
          default:
            console.log("\n  Invalid option.\n");
        }
      } catch (e) {
        showError(e);
      }
    }
  } finally {
    subscription.unsubscribe();
  }
};

/* ── Providers ────────────────────────────────────────────────────────────── */

const configureProviders = (
  config: Config,
  seed: string,
  walletProvider: MidnightWalletProvider,
): SudokuProviders => {
  const envConfiguration = config.getEnvironmentConfiguration();
  const zkConfigProvider = new NodeZkConfigProvider<SudokuCircuitKeys>(
    config.zkConfigPath,
  );
  return {
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
};

/* ── Entry point ──────────────────────────────────────────────────────────── */

export const run = async (config: Config, logger: Logger): Promise<void> => {
  console.log(BANNER);
  const rli = createInterface({ input, output, terminal: true });
  const providersToBeStopped: MidnightWalletProvider[] = [];

  try {
    const envConfiguration = config.getEnvironmentConfiguration();
    logger.debug(
      `Environment configuration: ${JSON.stringify(envConfiguration)}`,
    );

    const seed = await setupWallet(config, rli, logger);
    if (seed === null) return;

    const walletProvider = await withStatus("Building wallet", () =>
      MidnightWalletProvider.build(logger, envConfiguration, seed),
    );
    providersToBeStopped.push(walletProvider);
    const walletFacade = walletProvider.wallet;

    await withStatus("Starting wallet", () => walletProvider.start());

    const unshieldedState = await withStatus(
      "Waiting for tNight balance",
      () =>
        waitForUnshieldedFunds(
          logger,
          walletFacade,
          envConfiguration,
          unshieldedToken(),
          config.requestFaucetTokens,
        ),
    );
    const nightBalance = unshieldedState.balances[unshieldedToken().raw];
    if (nightBalance === undefined) {
      console.log("\n  ✗ No funds received, exiting.\n");
      return;
    }
    console.log(`\n  NIGHT balance: ${nightBalance.toLocaleString()}\n`);

    if (config.generateDust) {
      const dustGeneration = await withStatus(
        "Registering NIGHT UTXOs for DUST",
        () => generateDust(logger, seed, unshieldedState, walletFacade),
      );
      if (dustGeneration) {
        await withStatus("Syncing wallet after dust registration", () =>
          syncWallet(logger, walletFacade),
        );
      }
      const dustState = await firstValueFrom(walletFacade.state());
      console.log(
        `  DUST balance: ${dustState.dust.balance(new Date()).toLocaleString()}\n`,
      );
    }

    const providers = configureProviders(config, seed, walletProvider);

    const api = await setupContract(providers, rli, logger);
    if (api === null) return;

    await mainLoop(api, walletProvider, rli);
  } catch (e) {
    showError(e);
    logger.debug(e instanceof Error ? e.stack : "unknown error");
  } finally {
    try {
      rli.close();
      rli.removeAllListeners();
    } catch {
      /* ignore */
    }
    for (const wallet of providersToBeStopped) {
      try {
        await wallet.stop();
      } catch (e) {
        logger.debug(e instanceof Error ? e.message : "stop failed");
      }
    }
    console.log("\nGoodbye.\n");
  }
};
