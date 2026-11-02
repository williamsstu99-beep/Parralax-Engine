import { describe, expect, it } from "vitest";
import { parseLooseJson } from "./loose-json";

describe("parseLooseJson", () => {
  it("reads normal JSON and JSON wrapped in fences or words", () => {
    expect(parseLooseJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseLooseJson('Here you go:\n```json\n{"a":[1,2]}\n```')).toEqual({ a: [1, 2] });
  });
  it("forgives trailing commas and comments, but not inside strings", () => {
    expect(parseLooseJson('{"a":[1,2,],"b":{"c":3,},}')).toEqual({ a: [1, 2], b: { c: 3 } });
    expect(parseLooseJson('{"a":1, // note\n "b":"x // y, ]" /* gone */}')).toEqual({ a: 1, b: "x // y, ]" });
    expect(parseLooseJson('{"q":"say \\"hi\\", then ,}"}')).toEqual({ q: 'say "hi", then ,}' });
  });
  it("still rejects real garbage", () => {
    expect(() => parseLooseJson("no json here")).toThrow();
    expect(() => parseLooseJson('{"a": nope}')).toThrow();
  });
});
