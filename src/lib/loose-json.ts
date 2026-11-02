/**
 * Parse JSON that a model wrote, forgiving the slips models make: code
 * fences or words around the object, // and /* *\/ comments, and trailing
 * commas. Strings are left untouched. Anything else still throws.
 */
export function parseLooseJson(text: string): unknown {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("no JSON object found");
  const src = text.slice(a, b + 1);
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"') { // copy a whole string, honouring escapes
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j;
    } else if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && src[i + 1] === "*") {
      i = src.indexOf("*/", i + 2); if (i < 0) break; i++;
    } else if (c === ",") {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] !== "}" && src[j] !== "]") out += c; // drop trailing commas
    } else out += c;
  }
  return JSON.parse(out);
}
