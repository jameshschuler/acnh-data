export function rangeLength(range: Array<number> | null) {
  if (!range) {
    return 0;
  }

  return range[1] - range[0];
}

export function rangeIntersect(
  range1: Array<number>,
  range2: Array<number>
): Array<number> | null {
  if (range1[0] > range2[1] || range1[1] < range2[0]) {
    return null;
  }
  return [Math.max(range1[0], range2[0]), Math.min(range1[1], range2[1])];
}

export function rangeIntersectLength(
  range1: Array<number>,
  range2: Array<number>
): number {
  if (range1[0] > range2[1] || range1[1] < range2[0]) {
    return 0;
  }
  return rangeLength(rangeIntersect(range1, range2));
}

export function clamp(x: number, min: number, max: number) {
  return Math.min(Math.max(x, min), max);
}

/**
 * Accurately sums a list of floating point numbers.
 * See https://en.wikipedia.org/wiki/Kahan_summation_algorithm#Further_enhancements
 * for more information.
 * @param {number[]} input
 * @returns {number} The sum of the input.
 */
export function floatSum(input: Array<number>): number {
  // Uses the improved Kahan–Babuska algorithm introduced by Neumaier.
  let sum = 0;
  // The "lost bits" of sum.
  let c = 0;
  for (let i = 0; i < input.length; i++) {
    const cur = input[i];
    const t = sum + cur;
    if (Math.abs(sum) >= Math.abs(cur)) {
      c += sum - t + cur;
    } else {
      c += cur - t + sum;
    }
    sum = t;
  }
  return sum + c;
}

/**
 * Accurately returns the prefix sum of a list of floating point numbers.
 * See https://en.wikipedia.org/wiki/Kahan_summation_algorithm#Further_enhancements
 * for more information.
 * @param {number[]} input
 * @returns {[number, number][]} The prefix sum of the input, such that
 * output[i] = [sum of first i integers, error of the sum].
 * The "true" prefix sum is equal to the sum of the pair of numbers, but it is
 * explicitly returned as a pair of numbers to ensure that the error portion
 * isn't lost when subtracting prefix sums.
 */
export function prefixFloatSum(input: Array<number>) {
  const prefix_sum = [[0, 0]];
  let sum = 0;
  let c = 0;
  for (let i = 0; i < input.length; i++) {
    const cur = input[i];
    const t = sum + cur;
    if (Math.abs(sum) >= Math.abs(cur)) {
      c += sum - t + cur;
    } else {
      c += cur - t + sum;
    }
    sum = t;
    prefix_sum.push([sum, c]);
  }
  return prefix_sum;
}
