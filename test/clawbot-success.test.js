import assert from "node:assert/strict";
import test from "node:test";
import { isClawBotSuccessResult } from "../src/clawbot/client.js";

test("treats empty ClawBot send response as success", () => {
  assert.equal(isClawBotSuccessResult({}), true);
});

test("treats explicit ClawBot error response as failure", () => {
  assert.equal(isClawBotSuccessResult({ ret: -2 }), false);
});
