import { Predictor } from "./predictionEngine";
import { Pattern } from "./types";

const data = [97, 97];
const firstBuy = true;
const previousPattern = Pattern.SMALL_SPIKE;
let predictor = new Predictor(data, firstBuy);
const result = predictor.analyzePossibilities();

const now = new Date();
const date = now.toLocaleDateString().replaceAll("/", "");
const time = now.toLocaleTimeString().replace(/[^A-Z0-9]+/gi, "");

await Bun.write(
  `data/output/test/turnip_predictions/test_${date}_${time}.json`,
  JSON.stringify({ result })
);
