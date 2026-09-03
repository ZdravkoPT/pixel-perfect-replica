/** Normalized player / squad shapes shared by provider adapters (Phase 3). */

export interface NormalizedPlayer {
  providerId: string;
  name: string;
  position: string | null;
  birthDate: string | null;
  nationality: string | null;
  shirtNumber: number | null;
}

export interface NormalizedCoach {
  providerId: string;
  name: string;
  nationality: string | null;
  birthDate: string | null;
}

export interface NormalizedSquad {
  teamProviderId: string;
  teamName: string;
  coach: NormalizedCoach | null;
  players: NormalizedPlayer[];
}

export interface NormalizedOfficial {
  providerId: string;
  name: string;
  country: string | null;
  role: string;
}
