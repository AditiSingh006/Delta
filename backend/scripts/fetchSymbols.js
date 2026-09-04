import "dotenv/config";
import axios from "axios";
import fs from "node:fs";

const KEY = process.env.TWELVEDATA_API_KEY;

const { data } = await axios.get(
  `https://api.twelvedata.com/stocks?exchange=NSE&country=India&apikey=${KEY}`
);

const rows = data.data.map((s) => ({
  symbol: s.symbol,
  name: s.name,
  sector: "Other",
  basePrice: 100, // placeholder, only used in mock mode
}));

const fileContent =
  `export const SYMBOL_UNIVERSE = ${JSON.stringify(rows, null, 2)};\n\n` +
  `export function findSymbol(symbol) {\n` +
  `  return SYMBOL_UNIVERSE.find((s) => s.symbol === symbol.toUpperCase());\n}\n\n` +
  `export function searchSymbols(query) {\n` +
  `  const q = (query || "").trim().toUpperCase();\n` +
  `  if (!q) return SYMBOL_UNIVERSE;\n` +
  `  return SYMBOL_UNIVERSE.filter(\n` +
  `    (s) => s.symbol.includes(q) || s.name.toUpperCase().includes(q)\n  );\n}\n`;

fs.writeFileSync("./src/symbols.js", fileContent);
console.log(`Wrote ${rows.length} NSE symbols to src/symbols.js`);