import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256";

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

describe("sha256Hex", () => {
  it("bate com os vetores conhecidos", () => {
    expect(sha256Hex(bytes(""))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex(bytes("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex(bytes("Verde"))).toBe(
      "40598e1cb1d239fd0cbfac98ea7b63887e3fbb23ff0f3205ecd3a15b3b7a1aff",
    );
  });

  it("processa mensagens maiores que um bloco", () => {
    expect(sha256Hex(bytes("a".repeat(1000)))).toHaveLength(64);
    expect(sha256Hex(bytes("a".repeat(1000)))).not.toBe(
      sha256Hex(bytes("a".repeat(999))),
    );
  });

  it("bate com o Node para um payload grande", () => {
    const data = new Uint8Array(200_000);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = index % 251;
    }
    const expected = createHash("sha256").update(data).digest("hex");
    expect(sha256Hex(data)).toBe(expected);
  });
});
