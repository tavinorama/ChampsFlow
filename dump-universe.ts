import { buildOzvorUniverse, planOzvorArchive } from "./packages/llm/src/prompt-universe-ozvor";
import { PROMPT_UNIVERSE_VERSION } from "./packages/llm/src/prompt-universe";
const live = process.argv.slice(2);
console.log(JSON.stringify({
  version: PROMPT_UNIVERSE_VERSION,
  universe: buildOzvorUniverse(new Date().toISOString()),
  plan: planOzvorArchive(live),
}, null, 1));
