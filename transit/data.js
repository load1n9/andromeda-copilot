// NJ Transit rail data used by the app.
//
// NOTE: coordinates are hand-entered and approximate (roughly 100-300 m).
// They are good enough to tell which line you're on and what the next stop is,
// but for production use you should replace this file with data generated from
// NJ Transit's official GTFS feed (stops.txt / stop_times.txt).
//
// Each line lists its stations in order from the New York / Hoboken / Newark
// end ("inbound" terminus) outward to the far terminus ("outbound").
// `color` is a CSS variable from the Nyx theme (see style.css).

window.STATIONS = {
  NYP: ["New York Penn Station", 40.7506, -73.9935],
  SEC: ["Secaucus Junction", 40.7612, -74.0758],
  NWK: ["Newark Penn Station", 40.7345, -74.1646],
  NWB: ["Newark Broad Street", 40.7477, -74.1715],
  // Northeast Corridor
  NAP: ["Newark Liberty Airport", 40.7040, -74.1905],
  NEL: ["North Elizabeth", 40.6723, -74.2060],
  ELZ: ["Elizabeth", 40.6679, -74.2150],
  LIN: ["Linden", 40.6309, -74.2503],
  RAH: ["Rahway", 40.6065, -74.2773],
  MET: ["Metropark", 40.5686, -74.3293],
  MTC: ["Metuchen", 40.5409, -74.3600],
  EDI: ["Edison", 40.5176, -74.4086],
  NBR: ["New Brunswick", 40.4981, -74.4458],
  JAV: ["Jersey Avenue", 40.4793, -74.4700],
  PJC: ["Princeton Junction", 40.3164, -74.6236],
  HAM: ["Hamilton", 40.2542, -74.7226],
  TRN: ["Trenton Transit Center", 40.2171, -74.7550],
  // North Jersey Coast Line (beyond Rahway)
  WDB: ["Woodbridge", 40.5557, -74.2802],
  PAM: ["Perth Amboy", 40.5128, -74.2740],
  SAM: ["South Amboy", 40.4794, -74.2802],
  AMA: ["Aberdeen-Matawan", 40.4207, -74.2227],
  HAZ: ["Hazlet", 40.4190, -74.1757],
  MID: ["Middletown", 40.3901, -74.1090],
  RBK: ["Red Bank", 40.3487, -74.0746],
  LSV: ["Little Silver", 40.3359, -74.0488],
  MPK: ["Monmouth Park", 40.3151, -74.0137],
  LBR: ["Long Branch", 40.2970, -73.9878],
  ELB: ["Elberon", 40.2658, -73.9993],
  ALH: ["Allenhurst", 40.2379, -74.0049],
  ASB: ["Asbury Park", 40.2158, -74.0127],
  BRB: ["Bradley Beach", 40.2003, -74.0127],
  BEL: ["Belmar", 40.1795, -74.0240],
  SPL: ["Spring Lake", 40.1528, -74.0279],
  MAS: ["Manasquan", 40.1265, -74.0468],
  PPB: ["Point Pleasant Beach", 40.0925, -74.0673],
  BAY: ["Bay Head", 40.0753, -74.0472],
  // Morris & Essex (Morristown Line)
  ORA: ["Orange", 40.7721, -74.2317],
  HLA: ["Highland Avenue", 40.7687, -74.2436],
  MTN: ["Mountain Station", 40.7608, -74.2548],
  SOR: ["South Orange", 40.7459, -74.2605],
  MAP: ["Maplewood", 40.7310, -74.2733],
  MLB: ["Millburn", 40.7255, -74.3035],
  SHH: ["Short Hills", 40.7248, -74.3250],
  SUM: ["Summit", 40.7165, -74.3573],
  CHA: ["Chatham", 40.7407, -74.3842],
  MAD: ["Madison", 40.7578, -74.4162],
  CNV: ["Convent Station", 40.7767, -74.4437],
  MOR: ["Morristown", 40.7974, -74.4751],
  MPL: ["Morris Plains", 40.8275, -74.4813],
  MTT: ["Mount Tabor", 40.8700, -74.4790],
  DEN: ["Denville", 40.8885, -74.4803],
  DOV: ["Dover", 40.8884, -74.5557],
  // Raritan Valley Line
  UNI: ["Union", 40.6830, -74.2631],
  RPK: ["Roselle Park", 40.6644, -74.2652],
  CRF: ["Cranford", 40.6560, -74.3037],
  WES: ["Westfield", 40.6504, -74.3478],
  FAN: ["Fanwood", 40.6410, -74.3851],
  NET: ["Netherwood", 40.6295, -74.4025],
  PLA: ["Plainfield", 40.6178, -74.4190],
  DUN: ["Dunellen", 40.5987, -74.4710],
  BBK: ["Bound Brook", 40.5666, -74.5387],
  BRI: ["Bridgewater", 40.5635, -74.6131],
  SOM: ["Somerville", 40.5683, -74.6150],
  RAR: ["Raritan", 40.5660, -74.6340],
  // Princeton Branch
  PRN: ["Princeton", 40.3414, -74.6592],
};

window.LINES = [
  {
    id: "nec", name: "Northeast Corridor", color: "var(--red)",
    stations: ["NYP", "SEC", "NWK", "NAP", "NEL", "ELZ", "LIN", "RAH", "MET", "MTC",
      "EDI", "NBR", "JAV", "PJC", "HAM", "TRN"],
  },
  {
    id: "njcl", name: "North Jersey Coast Line", color: "var(--cyan)",
    stations: ["NYP", "SEC", "NWK", "NAP", "NEL", "ELZ", "RAH", "WDB", "PAM", "SAM", "AMA",
      "HAZ", "MID", "RBK", "LSV", "MPK", "LBR", "ELB", "ALH", "ASB", "BRB", "BEL",
      "SPL", "MAS", "PPB", "BAY"],
  },
  {
    id: "mm", name: "Morristown Line", color: "var(--green)",
    stations: ["NYP", "SEC", "NWB", "ORA", "HLA", "MTN", "SOR", "MAP", "MLB", "SHH", "SUM",
      "CHA", "MAD", "CNV", "MOR", "MPL", "MTT", "DEN", "DOV"],
  },
  {
    id: "rvl", name: "Raritan Valley Line", color: "var(--yellow)",
    stations: ["NWK", "UNI", "RPK", "CRF", "WES", "FAN", "NET", "PLA", "DUN", "BBK", "BRI",
      "SOM", "RAR"],
  },
  {
    id: "prn", name: "Princeton Branch", color: "var(--magenta)",
    stations: ["PJC", "PRN"],
  },
];
