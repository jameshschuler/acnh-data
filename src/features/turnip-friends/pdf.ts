import {
  floatSum,
  prefixFloatSum,
  rangeIntersectLength,
  rangeLength,
} from "./utils";

/*
 * Probability Density Function of rates.
 * Since the PDF is continuous*, we approximate it by a discrete probability function:
 *   the value in range [x, x + 1) has a uniform probability
 *   prob[x - value_start];
 *
 * Note that we operate all rate on the (* RATE_MULTIPLIER) scale.
 *
 * (*): Well not really since it only takes values that "float" can represent in some form, but the
 * space is too large to compute directly in JS.
 */
export class PDF {
  private valueStart: number = 0;
  private valueEnd: number = 0;
  private prob: Array<number> = [];

  /**
   * Initialize a PDF in range [a, b], a and b can be non-integer.
   * if uniform is true, then initialize the probability to be uniform, else initialize to a
   * all-zero (invalid) PDF.
   * @param {number} a - Left end-point.
   * @param {number} b - Right end-point end-point.
   * @param {boolean} uniform - If true, initialise with the uniform distribution.
   */
  constructor(a: number, b: number, uniform = true) {
    // We need to ensure that [a, b] is fully contained in [value_start, value_end].
    this.valueStart = Math.floor(a);
    this.valueEnd = Math.ceil(b);
    const range = [a, b];
    const total_length = rangeLength(range);
    this.prob = Array(this.valueEnd - this.valueStart);
    if (uniform) {
      for (let i = 0; i < this.prob.length; i++) {
        this.prob[i] =
          rangeIntersectLength(this.range_of(i), range) / total_length;
      }
    }
  }

  /**
   * Calculates the interval represented by this.prob[idx]
   * @param {number} idx - The index of this.prob
   * @returns {[number, number]} The interval representing this.prob[idx].
   */
  private range_of(idx: number) {
    // We intentionally include the right end-point of the range.
    // The probability of getting exactly an endpoint is zero, so we can assume
    // the "probability ranges" are "touching".
    return [this.valueStart + idx, this.valueStart + idx + 1];
  }

  public min_value() {
    return this.valueStart;
  }

  public max_value() {
    return this.valueEnd;
  }

  /**
   * @returns {number} The sum of probabilities before normalisation.
   */
  private normalize(): number {
    const total_probability = floatSum(this.prob);
    for (let i = 0; i < this.prob.length; i++) {
      this.prob[i] /= total_probability;
    }
    return total_probability;
  }

  /*
   * Limit the values to be in the range, and return the probability that the value was in this
   * range.
   */
  public range_limit(range: Array<number>) {
    let [start, end] = range;
    start = Math.max(start, this.min_value());
    end = Math.min(end, this.max_value());
    if (start >= end) {
      // Set this to invalid values
      this.valueStart = this.valueEnd = 0;
      this.prob = [];
      return 0;
    }
    start = Math.floor(start);
    end = Math.ceil(end);

    const start_idx = start - this.valueStart;
    const end_idx = end - this.valueStart;
    for (let i = start_idx; i < end_idx; i++) {
      this.prob[i] *= rangeIntersectLength(this.range_of(i), range);
    }

    this.prob = this.prob.slice(start_idx, end_idx);
    this.valueStart = start;
    this.valueEnd = end;

    // The probability that the value was in this range is equal to the total
    // sum of "un-normalised" values in the range.
    return this.normalize();
  }

  /**
   * Subtract the PDF by a uniform distribution in [rate_decay_min, rate_decay_max]
   *
   * For simplicity, we assume that rate_decay_min and rate_decay_max are both integers.
   * @param {number} rate_decay_min
   * @param {number} rate_decay_max
   * @returns {void}
   */
  public decay(rate_decay_min: number, rate_decay_max: number) {
    // In case the arguments aren't integers, round them to the nearest integer.
    rate_decay_min = Math.round(rate_decay_min);
    rate_decay_max = Math.round(rate_decay_max);
    // The sum of this distribution with a uniform distribution.
    // Let's assume that both distributions start at 0 and X = this dist,
    // Y = uniform dist, and Z = X + Y.
    // Let's also assume that X is a "piecewise uniform" distribution, so
    // x(i) = this.prob[Math.floor(i)] - which matches our implementation.
    // We also know that y(i) = 1 / max(Y) - as we assume that min(Y) = 0.
    // In the end, we're interested in:
    // Pr(i <= Z < i+1) where i is an integer
    // = int. x(val) * Pr(i-val <= Y < i-val+1) dval from 0 to max(X)
    // = int. x(floor(val)) * Pr(i-val <= Y < i-val+1) dval from 0 to max(X)
    // = sum val from 0 to max(X)-1
    //     x(val) * f_i(val) / max(Y)
    // where f_i(val) =
    // 0.5 if i-val = 0 or max(Y), so val = i-max(Y) or i
    // 1.0 if 0 < i-val < max(Y), so i-max(Y) < val < i
    // as x(val) is "constant" for each integer step, so we can consider the
    // integral in integer steps.
    // = sum val from max(0, i-max(Y)) to min(max(X)-1, i)
    //     x(val) * f_i(val) / max(Y)
    // for example, max(X)=1, max(Y)=10, i=5
    // = sum val from max(0, 5-10)=0 to min(1-1, 5)=0
    //     x(val) * f_i(val) / max(Y)
    // = x(0) * 1 / 10

    // Get a prefix sum / CDF of this so we can calculate sums in O(1).
    const prefix = prefixFloatSum(this.prob);
    const max_X = this.prob.length;
    const max_Y = rate_decay_max - rate_decay_min;
    const newProb = Array(this.prob.length + max_Y);
    for (let i = 0; i < newProb.length; i++) {
      // Note that left and right here are INCLUSIVE.
      const left = Math.max(0, i - max_Y);
      const right = Math.min(max_X - 1, i);
      // We want to sum, in total, prefix[right+1], -prefix[left], and subtract
      // the 0.5s if necessary.
      // This may involve numbers of differing magnitudes, so use the float sum
      // algorithm to sum these up.
      const numbers_to_sum = [
        prefix[right + 1][0],
        prefix[right + 1][1],
        -prefix[left][0],
        -prefix[left][1],
      ];
      if (left === i - max_Y) {
        // Need to halve the left endpoint.
        numbers_to_sum.push(-this.prob[left] / 2);
      }
      if (right === i) {
        // Need to halve the right endpoint.
        // It's guaranteed that we won't accidentally "halve" twice,
        // as that would require i-max_Y = i, so max_Y = 0 - which is
        // impossible.
        numbers_to_sum.push(-this.prob[right] / 2);
      }
      newProb[i] = floatSum(numbers_to_sum) / max_Y;
    }

    this.prob = newProb;
    this.valueStart -= rate_decay_max;
    this.valueEnd -= rate_decay_min;
    // No need to normalise, as it is guaranteed that the sum of this.prob is 1.
  }
}
