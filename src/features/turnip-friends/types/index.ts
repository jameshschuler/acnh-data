export interface MinMax {
  min: number;
  max: number;
}

export interface PredicationResult {
  weekGuaranteedMinimum: number;
  weekMax: number;
  prices: Array<MinMax>;
  patternNumber: number;
  patternName?: string;
  probability: number;
  categoryTotalProbability: number;
}

export enum Pattern {
  FLUCTUATING = 0,
  LARGE_SPIKE = 1,
  DECREASING = 2,
  SMALL_SPIKE = 3,
}

export type NumberIndexedObject = {
  [key: number]: any;
};
