import assert from "node:assert/strict";
import test from "node:test";
import { extractClawBotText } from "../src/clawbot/client.js";

test("extracts transcribed text from ClawBot voice item", () => {
  const text = extractClawBotText({
    item_list: [
      {
        type: 3,
        voice_item: {
          text: "ping",
        },
      },
    ],
  });

  assert.equal(text, "ping");
});

test("extracts text and voice transcription in order", () => {
  const text = extractClawBotText({
    item_list: [
      {
        type: 1,
        text_item: {
          text: "first",
        },
      },
      {
        type: 3,
        voice_item: {
          text: "second",
        },
      },
    ],
  });

  assert.equal(text, "first\nsecond");
});
