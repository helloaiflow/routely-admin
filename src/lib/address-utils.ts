export const STREET_ABBR: Record<string, string> = {
  w: "west",
  e: "east",
  n: "north",
  s: "south",
  ne: "northeast",
  nw: "northwest",
  se: "southeast",
  sw: "southwest",
  st: "street",
  ave: "avenue",
  blvd: "boulevard",
  rd: "road",
  dr: "drive",
  ln: "lane",
  ct: "court",
  pl: "place",
  cir: "circle",
  hwy: "highway",
  pkwy: "parkway",
  fwy: "freeway",
  apt: "apartment",
  ste: "suite",
  bldg: "building",
  west: "west",
  east: "east",
  north: "north",
  south: "south",
  street: "street",
  avenue: "avenue",
  boulevard: "boulevard",
  road: "road",
  drive: "drive",
  lane: "lane",
  court: "court",
  place: "place",
  circle: "circle",
  highway: "highway",
  fort: "fort",
  ft: "fort",
  saint: "saint",
  mount: "mount",
  mt: "mount",
};

export function normalizeAddress(addr: string): string {
  if (!addr) return "";
  return addr
    .toLowerCase()
    .replace(/[.,#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => STREET_ABBR[word] ?? word)
    .join(" ");
}

export function normalizeName(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[.,\-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 0)
    .sort()
    .join(" ");
}

export function extractStreetNumber(addr: string): string {
  const match = String(addr ?? "").match(/^\d+/);
  return match ? match[0] : "";
}

export function addressMatchScore(stored: string, incoming: string): number {
  const s = normalizeAddress(stored);
  const i = normalizeAddress(incoming);
  if (!s || !i) return 0;
  const sWords = s.split(" ").filter((w) => w.length > 0);
  const iWords = i.split(" ").filter((w) => w.length > 0);
  const sNum = sWords[0] ?? "";
  const iNum = iWords[0] ?? "";
  if (sNum !== iNum || !iNum) return 0;
  const iSig = iWords.slice(1).filter((w) => w.length > 1);
  const sSig = sWords.slice(1).filter((w) => w.length > 1);
  if (iSig.length === 0) return 0.5;
  const matches = iSig.filter((w) => sSig.includes(w)).length;
  return matches / iSig.length;
}

export function nameMatchScore(stored: string, incoming: string): number {
  const s = normalizeName(stored);
  const i = normalizeName(incoming);
  if (!s || !i) return 0;
  const sWords = s.split(" ").filter((w) => w.length > 2);
  const iWords = i.split(" ").filter((w) => w.length > 2);
  if (iWords.length === 0) return 0;
  const matches = iWords.filter((w) => sWords.includes(w)).length;
  return matches / iWords.length;
}

export function combinedScore(
  storedAddress: string,
  incomingAddress: string,
  storedName: string,
  incomingName: string,
): number {
  const addrScore = addressMatchScore(storedAddress, incomingAddress);
  if (addrScore === 0) return 0;
  const nScore = nameMatchScore(storedName, incomingName);
  return addrScore * 0.7 + nScore * 0.3;
}
