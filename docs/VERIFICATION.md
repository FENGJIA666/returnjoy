# ReturnJoy — verified outcomes

Verified **24 October 2026, Singapore time**.

## PayPal Sandbox journey

A complete browser-operated Sandbox journey connected customer care to a verified payment outcome:

1. A fictional **$80 USD** backpack purchase was approved and captured in PayPal Sandbox.
2. Real Ollama `qwen3.5:4b` inference interpreted a newly phrased cosmetic concern and the customer's wish to keep the item.
3. The server offered the policy's **15% / $12 care refund**, a return request and personal follow-up.
4. The customer selected the care refund. The merchant reviewed the request, policy and exact amount, then explicitly confirmed the action.
5. The application retrieved the refund status from PayPal and matched its amount before presenting the receipt.
6. A separate read-only check retrieved the existing capture as **PARTIALLY_REFUNDED / USD 80.00** and the refund as **COMPLETED / USD 12.00**. The receipt aligned **$80 original / $12 returned / $68 retained**.
7. Restart and browser reload preserved the same receipt and financial values. The browser removed checkout callback values from the address bar, and the receipt shortened the payment reference.

This was a PayPal Sandbox run using virtual funds and fictional purchase data. The check above retrieved the existing transaction; it did not create another payment.

## Local checks

**21 of 21 automated tests passed.** The suite covers integer-cent money parsing, policy eligibility, the precise 30-day window, product clarification, origin and action-token checks, capture ownership and amount checks, concurrent confirmation, stable retry identity, existing partial-refund reconciliation, pending and terminal statuses, amount mismatch, and receipt persistence.

**5 of 5 real-model HTTP scenarios passed.** The scenarios include a cosmetic concern, a paraphrased request, a product-care question, an unrelated product and an instruction-injection attempt. The isolated Local practice journey completed customer selection, merchant approval, a matched $12 local payment record, receipt download and repeated-confirmation checks. These semantic tests used a local payment adapter and made zero PayPal network calls.

The five measured inference durations in that local run were **4.479, 4.126, 5.431, 4.898 and 5.343 seconds**. The separate browser-operated Sandbox scenario completed its inference in **5.396 seconds**. These are observations from the tested local runtime.

## Reproduce

Follow [the README](../README.md) to start the app and connect your own Sandbox application. Then run:

```sh
npm test
npm run check
node scripts/validate-local-semantics.mjs
```

`npm test` uses local test doubles for provider contracts. The semantic script calls the installed local Ollama model and writes its new report under the gitignored `evidence/validation/` folder. A PayPal Sandbox replay uses your own Sandbox REST app and Sandbox buyer account; follow the approval steps in the README.

## Source identity

The verified application-source bundle has SHA-256:

```text
f874decbd085b1d8ff21353cf13654178e9832d8222908e516ea54d2c8e109b4
```

This digest is computed by creating an object of lexically sorted paths and SHA-256 file hashes for `package.json`, all five `src/*.js` files, and `public/app.js`, `public/favicon.svg`, `public/index.html`, `public/styles.css`, then hashing its compact `JSON.stringify` representation. The public release retains these application files byte for byte. Its public documentation and ignore rules organize the release separately from the application-source fingerprint.

The repository contains original product illustrations and fictional customer examples. Credentials, private state, account screenshots, raw transaction identifiers and internal review records remain outside the public source package.
