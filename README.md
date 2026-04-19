# Midnight Sudoku

A privacy-preserving Sudoku dApp built on the [Midnight blockchain](https://midnight.network), written as a learning exercise to build a hands-on mental model of Midnight and the Compact smart contract language.

## Inspiration

The direct inspiration for this project comes from [Seven Layers](https://github.com/CharlesHoskinson/sevenlayer) by [CharlesHoskinson](https://github.com/CharlesHoskinson). The book uses a Sudoku puzzle as a concrete example to illustrate the idea of programmable privacy — the ability to *prove* something without *revealing* it. That example was the perfect learning exercise.

Building it from scratch was also a deliberate learning exercise: working through a real example — even a toy one — is the fastest way to build an accurate mental model of how Midnight and Compact actually fit together.

## What this demonstrates

This project is a concrete demonstration of **zero-knowledge proofs**: a solver can prove that they know a valid solution of the puzzle — and get permanently recorded on-chain as having done so — without ever revealing the solution itself. The solution never leaves the client; it is provided as a private ZK witness and verified inside a circuit. The contract records a hashed public key of the solver, so that solvers can demonstrate that they solved the puzzle without ever revealing their identity.

## What it does

- A 4×4 Sudoku puzzle is stored on the ledger at deploy time and cannot be changed afterwards (it is declared `sealed`).
- Any user can submit a solution. The solution is kept entirely private — it is provided as a ZK **witness** and never leaves the client.
- The Compact circuit verifies:
  - The solution is complete (no zeros).
  - It is consistent with the given clues.
  - Every row, column, and 2×2 box contains the digits 1–4 exactly once.
- If verification passes, the solver's hashed public key is recorded on-chain in a `Set`. The raw public key is never stored.
- A solver can only submit once — the contract checks set membership before accepting a new proof.

The result: anyone can verify *how many* unique people have solved the puzzle, and a solver can prove *they* are one of them — all without revealing the solution, nor the identity of the solver.

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

This builds the contract, API, and CLI packages in order. If you have modified `contract/src/sudoku.compact`, recompile the contract first:

```bash
cd contract && npm run compact && cd ..
npm run build
```

## Run

### Standalone (local Docker environment)

Requires a full local Midnight stack running externally. The CLI does not spawn any containers itself — use [midnight-local-dev](https://github.com/midnightntwrk/midnight-local-dev) to bring up the node, indexer, and proof server before running this command.

No wallet seed required — a genesis seed is used automatically.

```bash
# In a separate terminal, start the local stack first:
# https://github.com/midnightntwrk/midnight-local-dev

npm run standalone
```

### Preview network

Connects to the Midnight preview network. You need a wallet seed and tDUST tokens. A proof server must be running locally — the CLI connects to `http://localhost:6300` by default, overridable via the `PROOF_SERVER_URL` environment variable.

```bash
npm run preview
```

### Preprod network

Same requirements as preview — local proof server required.

```bash
npm run preprod
```

## Usage walkthrough

When you start the CLI you are first asked to set up a wallet, then presented with two options:

```
You can do one of the following:
  1. Deploy a new Sudoku puzzle contract
  2. Join an existing Sudoku puzzle contract
  3. Exit
```

**Deploy** creates a fresh contract on-chain and prints the contract address. Share that address with anyone you want to challenge.

**Join** takes an existing contract address. If you have already entered a solution in a previous session it will be restored from local private state; otherwise you are prompted to enter it row by row.

Once joined, the main menu lets you:

```
  1. Display puzzle         — pretty-print the on-chain grid
  2. Submit your solution   — generate a ZK proof and submit it on-chain
  3. Display full state     — show puzzle + solver count + your local solution
  4. Show contract address  — copy-paste this to share with others
  5. Exit
```

**Puzzle grid display:**

```
+-------+-------+
| 1   . | .   4 |
| .   4 | 1   . |
+-------+-------+
| .   1 | .   . |
| 4   . | .   1 |
+-------+-------+
```

**Entering a solution** (when prompted):

```
Enter the solution row by row (space-separated values 1–4):
Row 1: * * * *
Row 2: * * * *
Row 3: * * * *
Row 4: * * * *
```

The solution is stored locally. It is passed to the ZK circuit as a witness at proof time — never sent to the network in plain text.


## Future ideas

- Use a witness to generate the puzzle on the publisher's machine, so the grid is created client-side before deployment rather than being hardcoded in the contract.
- Support variable grid sizes (e.g. 9×9) by parameterising the contract dimensions.
- Build a GUI to explore wallet integration and the broader Midnight dApp connector model.
- Add a circuit that lets a solver prove to a third party that they are in the solvers set, without revealing which entry is theirs.

## Credits

The structure and style of the `api/` and `cli/` packages — the wallet setup flow, the spinner-based status UX, the phased `setupWallet` → providers → `setupContract` → main loop layout, and the overall presentation — are adapted from [JAlbertCode/example-locker](https://github.com/JAlbertCode/example-locker). Many thanks to the author for a clear, approachable reference implementation.

Additional thanks to [Olanetsoft/midnight-mcp](https://github.com/Olanetsoft/midnight-mcp) for reference material that helped shape parts of this project.