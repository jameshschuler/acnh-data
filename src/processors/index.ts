import { parse } from "csv-parse/sync";
import { Fish, Fossil, Insect, Music, Schedule, SeaCreature } from "../types";

function camelize(input: string) {
  return input
    .replace(/[^a-z ]/gi, "")
    .replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function (match, index) {
      if (+match === 0) return ""; // or if (/\s+/.test(match)) for white spaces
      return index === 0 ? match.toLowerCase() : match.toUpperCase();
    });
}

function parseAvailability(data: any, startsWith: "nH" | "sH"): Schedule[] {
  return Object.keys(data)
    .filter((k: string) => k.startsWith(startsWith))
    .map((key: string) => {
      return {
        month: key.substring(2, key.length),
        availability: data[key],
      } as Schedule;
    });
}

async function parseCsv(fileName: string) {
  const fishCsv = Bun.file(`data/input/${fileName}`);
  return parse(await fishCsv.text(), {
    columns: (header) => header.map((column: string) => camelize(column)),
    skip_empty_lines: true,
  });
}

export async function processFishes() {
  const parsedData = await parseCsv("fish.csv");
  const fishes = parsedData.map((fishData: any) => {
    return {
      id: fishData.id,
      availability: {
        northernHemisphere: parseAvailability(fishData, "nH"),
        southernHemisphere: parseAvailability(fishData, "sH"),
      },
      description: fishData.description,
      catchDifficulty: fishData.catchDifficulty,
      catchPhrase: fishData.catchPhrase,
      iconUrl: `https://acnhcdn.com/latest/MenuIcon/${fishData.iconFilename}.png`,
      imageUrl: `https://acnhcdn.com/latest/BookFishIcon/${fishData.critterpediaFilename}.png`,
      internalId: fishData.internalID,
      name: fishData.name,
      sellAmount: fishData.sell,
      shadow: fishData.shadow,
      where: fishData.whereHow,
      vision: fishData.vision,
    } as Fish;
  });

  await Bun.write("data/output/fish.json", JSON.stringify({ fishes }));

  console.log(`Processed ${fishes.length} fishes`);
}

export async function processInsects() {
  const parsedData = await parseCsv("insects.csv");
  const insects = parsedData.map((insectData: any) => {
    return {
      id: insectData.id,
      availability: {
        northernHemisphere: parseAvailability(insectData, "nH"),
        southernHemisphere: parseAvailability(insectData, "sH"),
      },
      description: insectData.description,
      catchPhrase: insectData.catchPhrase,
      iconUrl: `https://acnhcdn.com/latest/MenuIcon/${insectData.iconFilename}.png`,
      imageUrl: `https://acnhcdn.com/latest/BookInsectIcon/${insectData.critterpediaFilename}.png`,
      internalId: insectData.internalID,
      name: insectData.name,
      sellAmount: insectData.sell,
      where: insectData.whereHow,
      weather: insectData.weather,
    } as Insect;
  });

  await Bun.write("data/output/insects.json", JSON.stringify({ insects }));

  console.log(`Processed ${insects.length} insects`);
}

export async function processSeaCreatures() {
  const parsedData = await parseCsv("sea-creatures.csv");
  const records = parsedData.map((data: any) => {
    return {
      id: data.id,
      availability: {
        northernHemisphere: parseAvailability(data, "nH"),
        southernHemisphere: parseAvailability(data, "sH"),
      },
      description: data.description,
      catchPhrase: data.catchPhrase,
      iconUrl: `https://acnhcdn.com/latest/MenuIcon/${data.iconFilename}.png`,
      imageUrl: `https://acnhcdn.com/latest/BookDiveFishIcon/${data.critterpediaFilename}.png`,
      internalId: data.internalID,
      name: data.name,
      sellAmount: data.sell,
      shadow: data.shadow,
      movementSpeed: data.movementSpeed,
    } as SeaCreature;
  });

  await Bun.write(
    "data/output/sea-creatures.json",
    JSON.stringify({ records })
  );

  console.log(`Processed ${records.length} sea creatures`);
}

export async function processFossils() {
  const parsedData = await parseCsv("fossils.csv");
  const records = parsedData.map((data: any) => {
    return {
      description: data.description,
      imageUrl: `https://acnhcdn.com/latest/FtrIcon/${data.image}.png`,
      internalId: data.internalID,
      name: data.name,
      sellAmount: data.sell,
      fossilGroup: data.fossilGroup,
    } as Fossil;
  });

  await Bun.write("data/output/fossils.json", JSON.stringify({ records }));

  console.log(`Processed ${records.length} fossils`);
}

export async function processMusic() {
  const parsedData = await parseCsv("music.csv");
  const records = parsedData.map((data: any) => {
    return {
      internalId: data.internalID,
      name: data.name,
      sellAmount: data.sell,
      buyAmount: data.buyAmount,
      framedImageUrl: `https://acnhcdn.com/latest/FtrIcon/${data.framedImage}.png`,
      albumImageUrl: `https://acnhcdn.com/latest/Audio/${data.albumImage}.png`,
      source: data.source,
      sourceNotes: data.sourceNotes,
      catalog: data.catalog,
    } as Music;
  });

  await Bun.write("data/output/music.json", JSON.stringify({ records }));

  console.log(`Processed ${records.length} songs`);
}
