/**
 * @see https://github.com/mikebryant/ac-nh-turnip-prices/blob/master/js/predictions.js
 */

import { PDF } from "./pdf";
import {
  MinMax,
  NumberIndexedObject,
  Pattern,
  PredicationResult,
} from "./types";
import {
  clamp,
  rangeIntersect,
  rangeIntersectLength,
  rangeLength,
} from "./utils";

const PROBABILITY_MATRIX = {
  [Pattern.FLUCTUATING]: {
    [Pattern.FLUCTUATING]: 0.2,
    [Pattern.LARGE_SPIKE]: 0.3,
    [Pattern.DECREASING]: 0.15,
    [Pattern.SMALL_SPIKE]: 0.35,
  },
  [Pattern.LARGE_SPIKE]: {
    [Pattern.FLUCTUATING]: 0.5,
    [Pattern.LARGE_SPIKE]: 0.05,
    [Pattern.DECREASING]: 0.2,
    [Pattern.SMALL_SPIKE]: 0.25,
  },
  [Pattern.DECREASING]: {
    [Pattern.FLUCTUATING]: 0.25,
    [Pattern.LARGE_SPIKE]: 0.45,
    [Pattern.DECREASING]: 0.05,
    [Pattern.SMALL_SPIKE]: 0.25,
  },
  [Pattern.SMALL_SPIKE]: {
    [Pattern.FLUCTUATING]: 0.45,
    [Pattern.LARGE_SPIKE]: 0.25,
    [Pattern.DECREASING]: 0.15,
    [Pattern.SMALL_SPIKE]: 0.15,
  },
};
const RATE_MULTIPLIER = 10000;

export class Predictor {
  private fudgeFactor = 0;
  private prices: Array<number> = [];
  private firstBuy: boolean = false;
  private previousPattern?: Pattern;

  constructor(
    prices: Array<number>,
    firstBuy: boolean,
    previousPattern?: Pattern
  ) {
    // The reverse-engineered code is not perfectly accurate, especially as it's not
    // 32-bit ARM floating point. So, be tolerant of slightly unexpected inputs
    this.fudgeFactor = 0;
    this.prices = prices;
    this.firstBuy = firstBuy;
    this.previousPattern = previousPattern;
  }

  private intCeil(val: number) {
    return Math.trunc(val + 0.99999);
  }

  private minimum_rate_from_given_and_base(
    given_price: number,
    buy_price: number
  ) {
    return (RATE_MULTIPLIER * (given_price - 0.99999)) / buy_price;
  }

  private maximum_rate_from_given_and_base(
    given_price: number,
    buy_price: number
  ) {
    return (RATE_MULTIPLIER * (given_price + 0.00001)) / buy_price;
  }

  private rate_range_from_given_and_base(
    given_price: number,
    buy_price: number
  ) {
    return [
      this.minimum_rate_from_given_and_base(given_price, buy_price),
      this.maximum_rate_from_given_and_base(given_price, buy_price),
    ];
  }

  private get_price(rate: number, basePrice: number) {
    return this.intCeil((rate * basePrice) / RATE_MULTIPLIER);
  }

  private *multiply_generator_probability(generator: any, probability: number) {
    for (const it of generator) {
      yield { ...it, probability: it.probability * probability };
    }
  }

  /*
   * This corresponds to the code:
   *   for (int i = start; i < start + length; i++)
   *   {
   *     sellPrices[work++] =
   *       intceil(randfloat(rate_min / RATE_MULTIPLIER, rate_max / RATE_MULTIPLIER) * basePrice);
   *   }
   *
   * Would return the conditional probability given the given_prices, and modify
   * the predicted_prices array.
   * If the given_prices won't match, returns 0.
   */
  private generate_individual_random_price(
    given_prices: Array<number>,
    predicted_prices: Array<MinMax>,
    start: number,
    length: number,
    rate_min: number,
    rate_max: number
  ) {
    rate_min *= RATE_MULTIPLIER;
    rate_max *= RATE_MULTIPLIER;

    const buy_price = given_prices[0];
    const rate_range = [rate_min, rate_max];
    let prob = 1;

    for (let i = start; i < start + length; i++) {
      let min_pred = this.get_price(rate_min, buy_price);
      let max_pred = this.get_price(rate_max, buy_price);
      if (!isNaN(given_prices[i])) {
        if (
          given_prices[i] < min_pred - this.fudgeFactor ||
          given_prices[i] > max_pred + this.fudgeFactor
        ) {
          // Given price is out of predicted range, so this is the wrong pattern
          return 0;
        }
        // TODO: How to deal with probability when there's fudge factor?
        // Clamp the value to be in range now so the probability won't be totally biased to fudged values.
        const real_rate_range = this.rate_range_from_given_and_base(
          clamp(given_prices[i], min_pred, max_pred),
          buy_price
        );
        prob *=
          rangeIntersectLength(rate_range, real_rate_range) /
          rangeLength(rate_range);
        min_pred = given_prices[i];
        max_pred = given_prices[i];
      }

      predicted_prices.push({
        min: min_pred,
        max: max_pred,
      });
    }
    return prob;
  }

  /*
   * This corresponds to the code:
   *   rate = randfloat(start_rate_min, start_rate_max);
   *   for (int i = start; i < start + length; i++)
   *   {
   *     sellPrices[work++] = intceil(rate * basePrice);
   *     rate -= randfloat(rate_decay_min, rate_decay_max);
   *   }
   *
   * Would return the conditional probability given the given_prices, and modify
   * the predicted_prices array.
   * If the given_prices won't match, returns 0.
   */
  private generate_decreasing_random_price(
    given_prices: Array<number>,
    predicted_prices: Array<MinMax>,
    start: number,
    length: number,
    start_rate_min: number,
    start_rate_max: number,
    rate_decay_min: number,
    rate_decay_max: number
  ) {
    start_rate_min *= RATE_MULTIPLIER;
    start_rate_max *= RATE_MULTIPLIER;
    rate_decay_min *= RATE_MULTIPLIER;
    rate_decay_max *= RATE_MULTIPLIER;

    const buy_price = given_prices[0];
    let rate_pdf = new PDF(start_rate_min, start_rate_max);
    let prob = 1;

    for (let i = start; i < start + length; i++) {
      let min_pred = this.get_price(rate_pdf.min_value(), buy_price);
      let max_pred = this.get_price(rate_pdf.max_value(), buy_price);
      if (!isNaN(given_prices[i])) {
        if (
          given_prices[i] < min_pred - this.fudgeFactor ||
          given_prices[i] > max_pred + this.fudgeFactor
        ) {
          // Given price is out of predicted range, so this is the wrong pattern
          return 0;
        }
        // TODO: How to deal with probability when there's fudge factor?
        // Clamp the value to be in range now so the probability won't be totally biased to fudged values.
        const real_rate_range = this.rate_range_from_given_and_base(
          clamp(given_prices[i], min_pred, max_pred),
          buy_price
        );
        prob *= rate_pdf.range_limit(real_rate_range);
        if (prob == 0) {
          return 0;
        }
        min_pred = given_prices[i];
        max_pred = given_prices[i];
      }

      predicted_prices.push({
        min: min_pred,
        max: max_pred,
      });

      rate_pdf.decay(rate_decay_min, rate_decay_max);
    }
    return prob;
  }

  /*
   * This corresponds to the code:
   *   rate = randfloat(rate_min, rate_max);
   *   sellPrices[work++] = intCeil(randfloat(rate_min, rate) * basePrice) - 1;
   *   sellPrices[work++] = intCeil(rate * basePrice);
   *   sellPrices[work++] = intCeil(randfloat(rate_min, rate) * basePrice) - 1;
   *
   * Would return the conditional probability given the given_prices, and modify
   * the predicted_prices array.
   * If the given_prices won't match, returns 0.
   */
  private generate_peak_price(
    given_prices: Array<number>,
    predicted_prices: Array<MinMax>,
    start: number,
    rate_min: number,
    rate_max: number
  ) {
    rate_min *= RATE_MULTIPLIER;
    rate_max *= RATE_MULTIPLIER;

    const buy_price = given_prices[0];
    let prob = 1;
    let rate_range = [rate_min, rate_max];

    // * Calculate the probability first.
    // Prob(middle_price)
    const middle_price = given_prices[start + 1];
    if (!isNaN(middle_price)) {
      const min_pred = this.get_price(rate_min, buy_price);
      const max_pred = this.get_price(rate_max, buy_price);
      if (
        middle_price < min_pred - this.fudgeFactor ||
        middle_price > max_pred + this.fudgeFactor
      ) {
        // Given price is out of predicted range, so this is the wrong pattern
        return 0;
      }
      // TODO: How to deal with probability when there's fudge factor?
      // Clamp the value to be in range now so the probability won't be totally biased to fudged values.
      const real_rate_range = this.rate_range_from_given_and_base(
        clamp(middle_price, min_pred, max_pred),
        buy_price
      );
      prob *=
        rangeIntersectLength(rate_range, real_rate_range) /
        rangeLength(rate_range);

      if (prob == 0) {
        return 0;
      }

      rate_range = rangeIntersect(rate_range, real_rate_range) ?? [];
    }

    const left_price = given_prices[start];
    const right_price = given_prices[start + 2];
    // Prob(left_price | middle_price), Prob(right_price | middle_price)
    //
    // A = rate_range[0], B = rate_range[1], C = rate_min, X = rate, Y = randfloat(rate_min, rate)
    // rate = randfloat(A, B); sellPrices[work++] = intceil(randfloat(C, rate) * basePrice) - 1;
    //
    // => X->U(A,B), Y->U(C,X), Y-C->U(0,X-C), Y-C->U(0,1)*(X-C), Y-C->U(0,1)*U(A-C,B-C),
    // let Z=Y-C,  Z1=A-C, Z2=B-C, Z->U(0,1)*U(Z1,Z2)
    // Prob(Z<=t) = integral_{x=0}^{1} [min(t/x,Z2)-min(t/x,Z1)]/ (Z2-Z1)
    // let F(t, ZZ) = integral_{x=0}^{1} min(t/x, ZZ)
    //    1. if ZZ < t, then min(t/x, ZZ) = ZZ -> F(t, ZZ) = ZZ
    //    2. if ZZ >= t, then F(t, ZZ) = integral_{x=0}^{t/ZZ} ZZ + integral_{x=t/ZZ}^{1} t/x
    //                                 = t - t log(t/ZZ)
    // Prob(Z<=t) = (F(t, Z2) - F(t, Z1)) / (Z2 - Z1)
    // Prob(Y<=t) = Prob(Z>=t-C)
    for (const price of [left_price, right_price]) {
      if (isNaN(price)) {
        continue;
      }
      const min_pred = this.get_price(rate_min, buy_price) - 1;
      const max_pred = this.get_price(rate_range[1], buy_price) - 1;
      if (
        price < min_pred - this.fudgeFactor ||
        price > max_pred + this.fudgeFactor
      ) {
        // Given price is out of predicted range, so this is the wrong pattern
        return 0;
      }
      // TODO: How to deal with probability when there's fudge factor?
      // Clamp the value to be in range now so the probability won't be totally biased to fudged values.
      const rate2_range = this.rate_range_from_given_and_base(
        clamp(price, min_pred, max_pred) + 1,
        buy_price
      );
      const F = (t: number, ZZ: number) => {
        if (t <= 0) {
          return 0;
        }
        return ZZ < t ? ZZ : t - t * (Math.log(t) - Math.log(ZZ));
      };
      const [A, B] = rate_range;
      const C = rate_min;
      const Z1 = A - C;
      const Z2 = B - C;
      const PY = (t: number) => (F(t - C, Z2) - F(t - C, Z1)) / (Z2 - Z1);
      prob *= PY(rate2_range[1]) - PY(rate2_range[0]);
      if (prob == 0) {
        return 0;
      }
    }

    // * Then generate the real predicted range.
    // We're doing things in different order then how we calculate probability,
    // since forward prediction is more useful here.
    //
    // Main spike 1
    let min_pred = this.get_price(rate_min, buy_price) - 1;
    let max_pred = this.get_price(rate_max, buy_price) - 1;
    if (!isNaN(given_prices[start])) {
      min_pred = given_prices[start];
      max_pred = given_prices[start];
    }
    predicted_prices.push({
      min: min_pred,
      max: max_pred,
    });

    // Main spike 2
    min_pred = predicted_prices[start].min;
    max_pred = this.get_price(rate_max, buy_price);
    if (!isNaN(given_prices[start + 1])) {
      min_pred = given_prices[start + 1];
      max_pred = given_prices[start + 1];
    }
    predicted_prices.push({
      min: min_pred,
      max: max_pred,
    });

    // Main spike 3
    min_pred = this.get_price(rate_min, buy_price) - 1;
    max_pred = predicted_prices[start + 1].max - 1;
    if (!isNaN(given_prices[start + 2])) {
      min_pred = given_prices[start + 2];
      max_pred = given_prices[start + 2];
    }
    predicted_prices.push({
      min: min_pred,
      max: max_pred,
    });

    return prob;
  }

  private *generate_pattern_0_with_lengths(
    given_prices: Array<number>,
    high_phase_1_len: number,
    dec_phase_1_len: number,
    high_phase_2_len: number,
    dec_phase_2_len: number,
    high_phase_3_len: number
  ) {
    /*
          // PATTERN 0: high, decreasing, high, decreasing, high
          work = 2;
          // high phase 1
          for (int i = 0; i < hiPhaseLen1; i++)
          {
            sellPrices[work++] = intceil(randfloat(0.9, 1.4) * basePrice);
          }
          // decreasing phase 1
          rate = randfloat(0.8, 0.6);
          for (int i = 0; i < decPhaseLen1; i++)
          {
            sellPrices[work++] = intceil(rate * basePrice);
            rate -= 0.04;
            rate -= randfloat(0, 0.06);
          }
          // high phase 2
          for (int i = 0; i < (hiPhaseLen2and3 - hiPhaseLen3); i++)
          {
            sellPrices[work++] = intceil(randfloat(0.9, 1.4) * basePrice);
          }
          // decreasing phase 2
          rate = randfloat(0.8, 0.6);
          for (int i = 0; i < decPhaseLen2; i++)
          {
            sellPrices[work++] = intceil(rate * basePrice);
            rate -= 0.04;
            rate -= randfloat(0, 0.06);
          }
          // high phase 3
          for (int i = 0; i < hiPhaseLen3; i++)
          {
            sellPrices[work++] = intceil(randfloat(0.9, 1.4) * basePrice);
          }
      */

    const buy_price = given_prices[0];
    const predicted_prices = [
      {
        min: buy_price,
        max: buy_price,
      },
      {
        min: buy_price,
        max: buy_price,
      },
    ];
    let probability = 1;

    // High Phase 1
    probability *= this.generate_individual_random_price(
      given_prices,
      predicted_prices,
      2,
      high_phase_1_len,
      0.9,
      1.4
    );
    if (probability === 0) {
      return;
    }

    // Dec Phase 1
    probability *= this.generate_decreasing_random_price(
      given_prices,
      predicted_prices,
      2 + high_phase_1_len,
      dec_phase_1_len,
      0.6,
      0.8,
      0.04,
      0.1
    );
    if (probability === 0) {
      return;
    }

    // High Phase 2
    probability *= this.generate_individual_random_price(
      given_prices,
      predicted_prices,
      2 + high_phase_1_len + dec_phase_1_len,
      high_phase_2_len,
      0.9,
      1.4
    );
    if (probability == 0) {
      return;
    }

    // Dec Phase 2
    probability *= this.generate_decreasing_random_price(
      given_prices,
      predicted_prices,
      2 + high_phase_1_len + dec_phase_1_len + high_phase_2_len,
      dec_phase_2_len,
      0.6,
      0.8,
      0.04,
      0.1
    );
    if (probability == 0) {
      return;
    }

    // High Phase 3
    if (
      2 +
        high_phase_1_len +
        dec_phase_1_len +
        high_phase_2_len +
        dec_phase_2_len +
        high_phase_3_len !=
      14
    ) {
      throw new Error("Phase lengths don't add up");
    }

    const prev_length =
      2 +
      high_phase_1_len +
      dec_phase_1_len +
      high_phase_2_len +
      dec_phase_2_len;
    probability *= this.generate_individual_random_price(
      given_prices,
      predicted_prices,
      prev_length,
      14 - prev_length,
      0.9,
      1.4
    );
    if (probability == 0) {
      return;
    }

    yield {
      patternNumber: 0,
      patternName: Pattern[0],
      prices: predicted_prices,
      probability,
    };
  }

  private *generate_pattern_0(given_prices: Array<number>) {
    /*
          decPhaseLen1 = randbool() ? 3 : 2;
          decPhaseLen2 = 5 - decPhaseLen1;
          hiPhaseLen1 = randint(0, 6);
          hiPhaseLen2and3 = 7 - hiPhaseLen1;
          hiPhaseLen3 = randint(0, hiPhaseLen2and3 - 1);
      */
    for (var dec_phase_1_len = 2; dec_phase_1_len < 4; dec_phase_1_len++) {
      for (var high_phase_1_len = 0; high_phase_1_len < 7; high_phase_1_len++) {
        for (
          var high_phase_3_len = 0;
          high_phase_3_len < 7 - high_phase_1_len - 1 + 1;
          high_phase_3_len++
        ) {
          yield* this.multiply_generator_probability(
            this.generate_pattern_0_with_lengths(
              given_prices,
              high_phase_1_len,
              dec_phase_1_len,
              7 - high_phase_1_len - high_phase_3_len,
              5 - dec_phase_1_len,
              high_phase_3_len
            ),
            1 / (4 - 2) / 7 / (7 - high_phase_1_len)
          );
        }
      }
    }
  }

  private *generate_pattern_1_with_peak(
    given_prices: Array<number>,
    peak_start: number
  ) {
    /*
        // PATTERN 1: decreasing middle, high spike, random low
        peakStart = randint(3, 9);
        rate = randfloat(0.9, 0.85);
        for (work = 2; work < peakStart; work++)
        {
          sellPrices[work] = intceil(rate * basePrice);
          rate -= 0.03;
          rate -= randfloat(0, 0.02);
        }
        sellPrices[work++] = intceil(randfloat(0.9, 1.4) * basePrice);
        sellPrices[work++] = intceil(randfloat(1.4, 2.0) * basePrice);
        sellPrices[work++] = intceil(randfloat(2.0, 6.0) * basePrice);
        sellPrices[work++] = intceil(randfloat(1.4, 2.0) * basePrice);
        sellPrices[work++] = intceil(randfloat(0.9, 1.4) * basePrice);
        for (; work < 14; work++)
        {
          sellPrices[work] = intceil(randfloat(0.4, 0.9) * basePrice);
        }
      */

    const buy_price = given_prices[0];
    const predicted_prices = [
      {
        min: buy_price,
        max: buy_price,
      },
      {
        min: buy_price,
        max: buy_price,
      },
    ];
    let probability = 1;

    probability *= this.generate_decreasing_random_price(
      given_prices,
      predicted_prices,
      2,
      peak_start - 2,
      0.85,
      0.9,
      0.03,
      0.05
    );
    if (probability == 0) {
      return;
    }

    // Now each day is independent of next
    let min_randoms = [0.9, 1.4, 2.0, 1.4, 0.9, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4];
    let max_randoms = [1.4, 2.0, 6.0, 2.0, 1.4, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9];
    for (let i = peak_start; i < 14; i++) {
      probability *= this.generate_individual_random_price(
        given_prices,
        predicted_prices,
        i,
        1,
        min_randoms[i - peak_start],
        max_randoms[i - peak_start]
      );
      if (probability == 0) {
        return;
      }
    }
    yield {
      patternNumber: 1,
      patternName: Pattern[1],
      prices: predicted_prices,
      probability,
    };
  }

  private *generate_pattern_1(given_prices: Array<number>) {
    for (var peak_start = 3; peak_start < 10; peak_start++) {
      yield* this.multiply_generator_probability(
        this.generate_pattern_1_with_peak(given_prices, peak_start),
        1 / (10 - 3)
      );
    }
  }

  private *generate_pattern_2(given_prices: Array<number>) {
    /*
          // PATTERN 2: consistently decreasing
          rate = 0.9;
          rate -= randfloat(0, 0.05);
          for (work = 2; work < 14; work++)
          {
            sellPrices[work] = intceil(rate * basePrice);
            rate -= 0.03;
            rate -= randfloat(0, 0.02);
          }
          break;
      */

    const buy_price = given_prices[0];
    const predicted_prices = [
      {
        min: buy_price,
        max: buy_price,
      },
      {
        min: buy_price,
        max: buy_price,
      },
    ];
    let probability = 1;

    probability *= this.generate_decreasing_random_price(
      given_prices,
      predicted_prices,
      2,
      14 - 2,
      0.85,
      0.9,
      0.03,
      0.05
    );
    if (probability === 0) {
      return;
    }

    yield {
      patternNumber: 2,
      patternName: Pattern[2],
      prices: predicted_prices,
      probability,
    };
  }

  private *generate_pattern_3_with_peak(
    given_prices: Array<number>,
    peak_start: number
  ) {
    /*
        // PATTERN 3: decreasing, spike, decreasing
        peakStart = randint(2, 9);
        // decreasing phase before the peak
        rate = randfloat(0.9, 0.4);
        for (work = 2; work < peakStart; work++)
        {
          sellPrices[work] = intceil(rate * basePrice);
          rate -= 0.03;
          rate -= randfloat(0, 0.02);
        }
        sellPrices[work++] = intceil(randfloat(0.9, 1.4) * (float)basePrice);
        sellPrices[work++] = intceil(randfloat(0.9, 1.4) * basePrice);
        rate = randfloat(1.4, 2.0);
        sellPrices[work++] = intceil(randfloat(1.4, rate) * basePrice) - 1;
        sellPrices[work++] = intceil(rate * basePrice);
        sellPrices[work++] = intceil(randfloat(1.4, rate) * basePrice) - 1;
        // decreasing phase after the peak
        if (work < 14)
        {
          rate = randfloat(0.9, 0.4);
          for (; work < 14; work++)
          {
            sellPrices[work] = intceil(rate * basePrice);
            rate -= 0.03;
            rate -= randfloat(0, 0.02);
          }
        }
      */

    const buy_price = given_prices[0];
    const predicted_prices = [
      {
        min: buy_price,
        max: buy_price,
      },
      {
        min: buy_price,
        max: buy_price,
      },
    ];
    let probability = 1;

    probability *= this.generate_decreasing_random_price(
      given_prices,
      predicted_prices,
      2,
      peak_start - 2,
      0.4,
      0.9,
      0.03,
      0.05
    );
    if (probability === 0) {
      return;
    }

    // The peak
    probability *= this.generate_individual_random_price(
      given_prices,
      predicted_prices,
      peak_start,
      2,
      0.9,
      1.4
    );
    if (probability === 0) {
      return;
    }

    probability *= this.generate_peak_price(
      given_prices,
      predicted_prices,
      peak_start + 2,
      1.4,
      2.0
    );
    if (probability === 0) {
      return;
    }

    if (peak_start + 5 < 14) {
      probability *= this.generate_decreasing_random_price(
        given_prices,
        predicted_prices,
        peak_start + 5,
        14 - (peak_start + 5),
        0.4,
        0.9,
        0.03,
        0.05
      );
      if (probability === 0) {
        return;
      }
    }

    yield {
      patternNumber: 3,
      patternName: Pattern[3],
      prices: predicted_prices,
      probability,
    };
  }

  private *generate_pattern_3(given_prices: Array<number>) {
    for (let peak_start = 2; peak_start < 10; peak_start++) {
      yield* this.multiply_generator_probability(
        this.generate_pattern_3_with_peak(given_prices, peak_start),
        1 / (10 - 2)
      );
    }
  }

  private get_transition_probability(
    previous_pattern?: Pattern
  ): Array<number> | NumberIndexedObject {
    if (
      typeof previous_pattern === "undefined" ||
      Number.isNaN(previous_pattern) ||
      previous_pattern === null ||
      previous_pattern < 0 ||
      previous_pattern > 3
    ) {
      // Use the steady state probabilities of PROBABILITY_MATRIX if we don't
      // know what the previous pattern was.
      // See https://github.com/mikebryant/ac-nh-turnip-prices/issues/68
      // and https://github.com/mikebryant/ac-nh-turnip-prices/pull/90
      // for more information.
      return [4530 / 13082, 3236 / 13082, 1931 / 13082, 3385 / 13082];
    }

    return PROBABILITY_MATRIX[previous_pattern];
  }

  private *generate_all_patterns(
    sell_prices: Array<number>,
    previous_pattern?: Pattern
  ) {
    const generate_pattern_fns = [
      this.generate_pattern_0,
      this.generate_pattern_1,
      this.generate_pattern_2,
      this.generate_pattern_3,
    ];
    const transition_probability =
      this.get_transition_probability(previous_pattern);

    for (let i = 0; i < 4; i++) {
      yield* this.multiply_generator_probability(
        generate_pattern_fns[i].bind(this)(sell_prices),
        transition_probability[i]
      );
    }
  }

  private *generate_possibilities(
    sell_prices: Array<number>,
    first_buy: boolean,
    previous_pattern?: Pattern
  ) {
    if (first_buy || isNaN(sell_prices[0])) {
      for (let buy_price = 90; buy_price <= 110; buy_price++) {
        const temp_sell_prices = sell_prices.slice();
        temp_sell_prices[0] = temp_sell_prices[1] = buy_price;
        if (first_buy) {
          yield* this.generate_pattern_3(temp_sell_prices);
        } else {
          // All buy prices are equal probability and we're at the outmost layer,
          // so don't need to multiply_generator_probability here.
          yield* this.generate_all_patterns(temp_sell_prices, previous_pattern);
        }
      }
    } else {
      yield* this.generate_all_patterns(sell_prices, previous_pattern);
    }
  }

  public analyzePossibilities(): Array<PredicationResult> {
    const sell_prices = this.prices;
    const first_buy = this.firstBuy;
    const previous_pattern = this.previousPattern;

    let generated_possibilities = new Array<PredicationResult>();

    for (let i = 0; i < 6; i++) {
      this.fudgeFactor = i;
      generated_possibilities = Array.from(
        this.generate_possibilities(sell_prices, first_buy, previous_pattern)
      );
      if (generated_possibilities.length > 0) {
        // console.log(
        //   "Generated possibilities using fudge factor %d: ",
        //   i,
        //   generated_possibilities
        // );
        break;
      }
    }

    const total_probability = generated_possibilities.reduce(
      (acc, it) => acc + it.probability,
      0
    );
    for (const it of generated_possibilities) {
      it.probability /= total_probability;
    }

    for (let poss of generated_possibilities) {
      var weekMins = [];
      var weekMaxes = [];
      for (let day of poss.prices.slice(2)) {
        // Check for a future date by checking for a range of prices
        if (day.min !== day.max) {
          weekMins.push(day.min);
          weekMaxes.push(day.max);
        } else {
          // If we find a set price after one or more ranged prices, the user has missed a day. Discard that data and start again.
          weekMins = [];
          weekMaxes = [];
        }
      }
      if (!weekMins.length && !weekMaxes.length) {
        weekMins.push(poss.prices[poss.prices.length - 1].min);
        weekMaxes.push(poss.prices[poss.prices.length - 1].max);
      }
      poss.weekGuaranteedMinimum = Math.max(...weekMins);
      poss.weekMax = Math.max(...weekMaxes);
    }

    let category_totals: NumberIndexedObject = {};
    for (let i of [0, 1, 2, 3]) {
      category_totals[i] = generated_possibilities
        .filter((value) => value.patternNumber == i)
        .map((value) => value.probability)
        .reduce((previous, current) => previous + current, 0);
    }

    for (let pos of generated_possibilities) {
      pos.categoryTotalProbability = category_totals[pos.patternNumber];
    }

    generated_possibilities.sort((a, b) => {
      return (
        b.categoryTotalProbability - a.categoryTotalProbability ||
        b.probability - a.probability
      );
    });

    let global_min_max = [];
    for (let day = 0; day < 14; day++) {
      const prices = {
        min: 999,
        max: 0,
      };
      for (let poss of generated_possibilities) {
        if (poss.prices[day].min < prices.min) {
          prices.min = poss.prices[day].min;
        }
        if (poss.prices[day].max > prices.max) {
          prices.max = poss.prices[day].max;
        }
      }
      global_min_max.push(prices);
    }

    generated_possibilities.unshift({
      patternNumber: 4,
      patternName: "ALL",
      prices: global_min_max,
      weekGuaranteedMinimum: Math.min(
        ...generated_possibilities.map((poss) => poss.weekGuaranteedMinimum)
      ),
      weekMax: Math.max(...generated_possibilities.map((poss) => poss.weekMax)),
      probability: 0,
      categoryTotalProbability: 0,
    });

    return generated_possibilities;
  }
}
