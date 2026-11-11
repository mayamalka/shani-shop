import { normalizePlace, type CityDTO } from '@shani/shared';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { API_ROOT } from '../config';

/**
 * Israeli localities and streets (official registry, data.gov.il), from apps/api/data/il-addresses.json.gz.
 * Refresh with `npm run addresses:update`.
 */
interface RawData {
  generatedAt: string;
  source: Record<string, string>;
  cities: [number, string][];
  streets: Record<string, string[]>;
}

export class IsraelAddresses {
  readonly cities: CityDTO[];
  private byCode = new Map<number, string>();
  private streets: Record<string, string[]>;
  private streetIndex = new Map<number, Map<string, string>>();
  readonly info: { generatedAt: string; source: Record<string, string> };

  constructor(file = path.join(API_ROOT, 'data/il-addresses.json.gz')) {
    const raw = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')) as RawData;
    this.cities = raw.cities.map(([code, name]) => ({ code, name }));
    for (const c of this.cities) this.byCode.set(c.code, c.name);
    this.streets = raw.streets;
    this.info = { generatedAt: raw.generatedAt, source: raw.source };
  }

  cityName(code: number): string | undefined {
    return this.byCode.get(code);
  }

  streetsOf(code: number): string[] {
    return this.streets[String(code)] ?? [];
  }

  /** Returns the official spelling of the street, or undefined if the locality has no such street. */
  matchStreet(code: number, street: string): string | undefined {
    let idx = this.streetIndex.get(code);
    if (!idx) {
      idx = new Map(this.streetsOf(code).map((s) => [normalizePlace(s), s]));
      this.streetIndex.set(code, idx);
    }
    return idx.get(normalizePlace(street));
  }
}

let shared: IsraelAddresses | null = null;
export const israelAddresses = () => (shared ??= new IsraelAddresses());
