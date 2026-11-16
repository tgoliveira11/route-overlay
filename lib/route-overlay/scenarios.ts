/**
 * Phase 3 route scenarios.
 * `parsed_real_link` URLs are copied from docs/REAL-URL-EVIDENCE.md.
 * `controlled_fixture` URLs are built for tests. They were not captured from a Maps session.
 */

export type ScenarioEvidence = "parsed_real_link" | "controlled_fixture";

export interface PlanScenario {
  id: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";
  title: string;
  evidence: ScenarioEvidence;
  url: string;
  note: string;
}

const SANTOS = "-23.9539549,-46.3317787";
const MONTEVIDEO = "-34.9055016,-56.1851147";
const CHUI = "-33.6900,-53.4600";
const JAGUARAO = "-32.5600,-53.3700";

export const PLAN_SCENARIOS: PlanScenario[] = [
  {
    id: "A",
    title: "Santos to Montevideo, no intermediate waypoint",
    evidence: "parsed_real_link",
    url: "https://www.google.com/maps/dir/Santos,+S%C3%A3o+Paulo,+Brazil/Montevideo,+Montevideo+Department,+Uruguay/@-28.9739549,-62.0565642,5z/data=!4m19!4m18!1m9!1m1!1s0x94ce03b97cc7856f:0x3ff3e507b04bbc46!2m2!1d-46.3317787!2d-23.9539549!1m5!1m1!1s0x959f80ffc63bf7d3:0x6b321b2e355bec99!2m2!1d-56.1851147!2d-34.9055016!3e0?entry=ttu&g_ep=EgoyMDI2MTExMC4wIKXMDSoASAFQAw%3D%3D",
    note: "Address bar after the second desktop alternative was clicked. The URL does not identify that alternative.",
  },
  {
    id: "B",
    title: "Prefer the Chuí/Chuy border",
    evidence: "controlled_fixture",
    url: `https://www.google.com/maps/dir/?api=1&origin=${SANTOS}&destination=${MONTEVIDEO}&waypoints=${CHUI}&travelmode=driving`,
    note: "Controlled fixture. The Chuí coordinate was not copied from a captured share.",
  },
  {
    id: "C",
    title: "Prefer Jaguarão/Río Branco",
    evidence: "controlled_fixture",
    url: `https://www.google.com/maps/dir/?api=1&origin=${SANTOS}&destination=${MONTEVIDEO}&waypoints=${JAGUARAO}&travelmode=driving`,
    note: "Controlled fixture. The Jaguarão coordinate was not copied from a captured share.",
  },
  {
    id: "D",
    title: "Ordered intermediate destination",
    evidence: "parsed_real_link",
    url: "https://www.google.com/maps/dir/Santos,+S%C3%A3o+Paulo,+Brazil/Montevideo,+Montevideo+Department,+Uruguay/Porto+Alegre,+RS,+Brazil/@-29.2820701,-56.5451002,6z/data=!3m1!4b1!4m20!4m19!1m5!1m1!1s0x94ce03b97cc7856f:0x3ff3e507b04bbc46!2m2!1d-46.3317787!2d-23.9592201!1m5!1m1!1s0x959f80ffc63bf7d3:0x6b321b2e355bec99!2m2!1d-56.1851147!2d-34.9055016!1m5!1m1!1s0x95199cd2566acb1d:0x603111a89f87e91f!2m2!1d-51.2089887!2d-30.0368176!3e0?entry=ttu&g_ep=EgoyMDI2MTExMC4wIKXMDSoASAFQAw%3D%3D",
    note: "Captured three-stop URL. Porto Alegre is the destination. Montevideo is the intermediate stop.",
  },
  {
    id: "E",
    title: "Preferred candidate is not the default",
    evidence: "parsed_real_link",
    url: "https://www.google.com/maps/dir/Santos,+S%C3%A3o+Paulo,+Brazil/Montevideo,+Montevideo+Department,+Uruguay/@-28.9739549,-62.0565642,5z/data=!4m19!4m18!1m9!1m1!1s0x94ce03b97cc7856f:0x3ff3e507b04bbc46!2m2!1d-46.3317787!2d-23.9539549!1m5!1m1!1s0x959f80ffc63bf7d3:0x6b321b2e355bec99!2m2!1d-56.1851147!2d-34.9055016!3e0?entry=ttu&g_ep=EgoyMDI2MTExMC4wIKXMDSoASAFQAw%3D%3D",
    note: "Same captured URL as scenario A. The non-default choice is a mock candidate, not a recovered Google alternative.",
  },
  {
    id: "F",
    title: "Manual refinement",
    evidence: "parsed_real_link",
    url: "https://www.google.com/maps/dir/Santos,+S%C3%A3o+Paulo,+Brazil/Montevideo,+Montevideo+Department,+Uruguay/@-28.9739549,-62.0565642,5z/data=!4m19!4m18!1m9!1m1!1s0x94ce03b97cc7856f:0x3ff3e507b04bbc46!2m2!1d-46.3317787!2d-23.9539549!1m5!1m1!1s0x959f80ffc63bf7d3:0x6b321b2e355bec99!2m2!1d-56.1851147!2d-34.9055016!3e0?entry=ttu&g_ep=EgoyMDI2MTExMC4wIKXMDSoASAFQAw%3D%3D",
    note: "Starts from the captured Santos–Montevideo URL. A later waypoint is added in the client.",
  },
  {
    id: "G",
    title: "Cannot reconstruct geometry",
    evidence: "controlled_fixture",
    url: "https://www.google.com/maps/place/MASP",
    note: "A place page is not a directions URL. Parsing classifies it as unsupported, and reconstruction is refused.",
  },
  {
    id: "H",
    title: "Confirm and plan stops",
    evidence: "parsed_real_link",
    url: "https://www.google.com/maps/dir/Santos,+S%C3%A3o+Paulo,+Brazil/Montevideo,+Montevideo+Department,+Uruguay/@-28.9739549,-62.0565642,5z/data=!4m19!4m18!1m9!1m1!1s0x94ce03b97cc7856f:0x3ff3e507b04bbc46!2m2!1d-46.3317787!2d-23.9539549!1m5!1m1!1s0x959f80ffc63bf7d3:0x6b321b2e355bec99!2m2!1d-56.1851147!2d-34.9055016!3e0?entry=ttu&g_ep=EgoyMDI2MTExMC4wIKXMDSoASAFQAw%3D%3D",
    note: "Uses the captured URL, then a mock confirmation, then synthetic stations.",
  },
];

export function scenarioById(id: PlanScenario["id"]): PlanScenario {
  const scenario = PLAN_SCENARIOS.find((item) => item.id === id);
  if (!scenario) {
    throw new Error(`Unknown scenario ${id}`);
  }
  return scenario;
}
