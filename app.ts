import {
  processFishes,
  processFossils,
  processInsects,
  processMusic,
  processSeaCreatures,
} from "./src/processors";

await Promise.allSettled([
  processFishes(),
  processInsects(),
  processSeaCreatures(),
  processFossils(),
  processMusic(),
]);
