interface AnimalBase {
  id: string;
  availability?: Availability;
  catchPhrase?: string;
  description: string;
  iconUrl?: string;
  imageUrl: string;
  internalId: string;
  name: string;
  sellAmount: string;
  where?: string;
}

export interface Insect extends AnimalBase {
  weather: string;
}

export interface Fish extends AnimalBase {
  catchDifficulty: string;
  shadow: string;
  vision: string;
}

export interface SeaCreature extends AnimalBase {
  movementSpeed: string;
  shadow: string;
}

export interface Fossil extends AnimalBase {
  fossilGroup: string;
}

export interface Music {
  id: string;
  internalId: string;
  name: string;
  sellAmount: string;
  buyAmount: string;
  source: string;
  sourceNotes: string;
  catalog: string;
  framedImageUrl: string;
  albumImageUrl: string;
}

export interface Schedule {
  month: string;
  availability: string;
}

interface Availability {
  northernHemisphere: Schedule[];
  southernHemisphere: Schedule[];
}
