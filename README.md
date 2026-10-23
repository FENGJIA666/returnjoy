# ReturnJoy

**Make every resolution a reason to return.**

ReturnJoy brings thoughtful AI customer care and a clear payment resolution into one workspace. A customer describes a purchase concern. AI understands the request, the store’s policies create meaningful choices, and the merchant confirms the chosen resolution. A verified payment status and a downloadable receipt complete the journey.

The signature example: Alex loves an **$80 backpack** with a small cosmetic scuff and wants to keep it. ReturnJoy offers a **15% care refund ($12)**, a guided return, and personal follow-up. Alex chooses the care refund, the merchant approves the exact amount, and the final receipt aligns **$80 purchased, $12 returned, and $68 retained**.

That journey has been completed in **PayPal Sandbox**: capture, real AI interpretation, customer choice, merchant approval, refund-status retrieval and a matching receipt. [View the verification summary](docs/VERIFICATION.md#paypal-sandbox-journey).

## Run locally

Requirements: **Node.js 22.16 or later** and [Ollama](https://ollama.com/download). The application uses Node’s built-in HTTP server, test runner and fetch API, with no npm dependencies or build step.

```sh
ollama pull qwen3.5:4b
ollama serve
```

If Ollama is already running, keep that instance. In another terminal:

```sh
git clone https://github.com/FENGJIA666/returnjoy.git
cd returnjoy
cp .env.example .env
npm start
```

Open [ReturnJoy on localhost](http://127.0.0.1:8794). The initial environment is **Local practice**: actual Ollama inference, fictional sample purchases and a local payment record. The header, journey and receipt name the active environment.

1. Open Alex’s conversation and choose **Generate care options**.
2. Choose **Choose my care refund**.
3. Review the merchant summary, check the explicit approval box, and confirm **$12**.
4. Celebrate the completed resolution and download the receipt.

The other conversations explore a wrong-color lamp and a bottle-care question. The **Care playbook** explains each policy; **Activity** shows the steps completed in this local workspace.

## Connect PayPal Sandbox

1. Open the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/) and select a **Sandbox** REST application.
2. Place its client ID and secret in the private `.env` file, using `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. These values stay on the server. Restart `npm start` after changing them.
3. In ReturnJoy, open the environment selector and choose **Start Sandbox purchase**.
4. Choose **Approve in PayPal Sandbox** and approve with a Sandbox personal buyer account. PayPal opens separately and returns to the local case.
5. Choose **Complete approved checkout**. ReturnJoy retrieves the approved order, captures it, and verifies its amount and case reference.
6. Continue the AI care journey. The merchant’s explicit confirmation submits the partial refund. ReturnJoy then retrieves the refund status and matches its USD amount before issuing the receipt.

All PayPal API requests use the fixed `https://api-m.sandbox.paypal.com` origin. The application uses Sandbox funds. The Local practice and PayPal Sandbox purchase records remain separate.

## AI that understands; policies that act

The server calls Ollama’s chat API using a JSON schema with `productMatch`, `issue`, `preference`, `summary`, `reply` and policy references. The response includes the model name, measured inference duration and generation timestamp.

- AI interprets the customer’s goal and writes the care acknowledgment.
- The server checks delivery age, captured payment status, product match and previous refunds, then computes the eligible options in integer cents.
- Policy references shown in the workspace come from those computed options.
- A different or unclear product routes to personal clarification using the trusted order name.
- The customer chooses an offered option. The merchant confirms the exact payment action.
- Payment references and amounts come from the server’s purchase record. The model has no payment tools or credentials.

An unavailable model produces a clear reconnect-and-retry action. Every displayed AI result comes from a successful model call; the app does not silently replace inference with canned recommendations.

## A payment journey you can follow

The PayPal adapter uses server-side OAuth, Orders v2 creation and capture, Payments v2 partial refunds, and refund-status retrieval. A per-case mutex serializes updates. Each refund operation receives a stable request identity, saved before the provider call, so retries reuse the same business action. A completed receipt is persisted and repeated confirmation returns that receipt.

When a provider response is pending or uncertain, the case stays in its reconciliation step. **Refresh status** continues the saved operation. A response with a different amount cannot complete the case. Retries without a known refund ID stop after five hours for a manual Sandbox activity match, within PayPal’s default request-id retention window.

The app binds to `127.0.0.1`. The local workspace represents one fictional merchant; customer and merchant views demonstrate separate decision steps within this operator session. Same-origin checks, a per-process action token and strict request fields protect its mutation endpoints. This repository’s access model is a local demonstration workspace.

## Verification

```sh
npm test
npm run check
node scripts/validate-local-semantics.mjs
```

The deterministic suite covers policy amounts and eligibility, payment ownership and capture checks, application authorization, repeated confirmation, concurrent requests, uncertain provider responses, pending status, amount mismatch and persistence across restart. Provider contract tests use an injected transport and are identified as local tests.

The semantic script uses the installed Ollama model through the application’s HTTP API, with isolated in-memory cases and a local payment adapter. Its evidence records measured outputs and a full $80 → $12 → $68 journey. See [the verification summary](docs/VERIFICATION.md) for observed results, reproduction commands and the verified source fingerprint. New run reports are saved locally in the gitignored `evidence/` directory.

## Configuration and data

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | Local HTTP port | `8794` |
| `OLLAMA_URL` | Local inference endpoint | `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | Installed model | `qwen3.5:4b` |
| `PAYPAL_CLIENT_ID` | Server-only Sandbox application client ID | Set in private `.env` |
| `PAYPAL_CLIENT_SECRET` | Server-only Sandbox application secret | Set in private `.env` |
| `DATA_DIR` | Private state directory | `.data` |

State is saved atomically to `.data/state.json`. `.env`, `.data`, credentials and dependency directories are gitignored. Public case responses and downloaded receipts shorten payment references. The browser removes checkout callback identifiers from its address bar and remembers the selected case within the current browser session. To explore a fresh workspace, start another local instance with a new `DATA_DIR` and `PORT`, preserving the existing records.

```sh
DATA_DIR=.data-practice-2 PORT=8795 npm start
```

For a new custom data folder, add it to `.gitignore` before working with Sandbox records.

## Project map

```text
src/server.js       HTTP API, workflow, confirmation, status reconciliation
src/ai.js           Ollama schema, inference and product clarification
src/policy.js       Store policies, integer-cent money and eligibility
src/paypal.js       PayPal Sandbox and local practice payment adapters
src/store.js        Atomic JSON storage and per-case serialization
public/            Responsive care workspace and original SVG product art
tests/             Independent policy, API and payment contract tests
scripts/           Reproducible real-model semantic validation
docs/              Public verification summary
```

Built with JavaScript, Node.js, Ollama and Qwen, HTML/CSS, original SVG illustrations, and the PayPal Sandbox REST APIs. AI assistance contributed to product planning, implementation, review, testing and communication. The runtime AI contribution is the customer-message interpretation and care acknowledgment described above.

API references: [PayPal Orders v2](https://developer.paypal.com/api/orders/v2), [PayPal Payments v2](https://developer.paypal.com/api/payments/v2), [Ollama chat and structured output](https://docs.ollama.com/api/chat).

Licensed under [MIT](LICENSE).
