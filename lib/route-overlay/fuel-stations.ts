import type { GeoPoint } from "@/lib/route-overlay/types";

export type FuelType = "gasoline" | "diesel" | "ethanol" | "electric";

/**
 * Synthetic stations for the stop-planning prototype.
 * Names and coordinates are fixtures. They are not real businesses.
 */
export interface SyntheticStation {
  id: string;
  name: string;
  synthetic: true;
  location: GeoPoint;
  fuels: FuelType[];
  open24h: boolean;
}

export const SYNTHETIC_STATIONS: SyntheticStation[] = [
  station("s-chord-25", "Synthetic station on Santos–Montevideo chord 25%", -26.6918, -48.7951, ["gasoline", "ethanol", "diesel"], true),
  station("s-chord-50", "Synthetic station on Santos–Montevideo chord 50%", -29.4297, -51.2585, ["gasoline", "ethanol", "diesel"], true),
  station("s-chord-75", "Synthetic station on Santos–Montevideo chord 75%", -32.1676, -53.7218, ["gasoline", "diesel"], false),
  station("s-registro", "Synthetic station Registro", -24.49, -47.84, ["gasoline", "ethanol", "diesel"], true),
  station("s-curitiba", "Synthetic station Curitiba", -25.43, -49.27, ["gasoline", "ethanol", "diesel"], true),
  station("s-joinville", "Synthetic station Joinville", -26.3, -48.85, ["gasoline", "diesel"], false),
  station("s-florianopolis", "Synthetic station Florianopolis", -27.59, -48.55, ["gasoline", "ethanol"], true),
  station("s-porto-alegre", "Synthetic station Porto Alegre", -30.03, -51.23, ["gasoline", "ethanol", "diesel"], true),
  station("s-pelotas", "Synthetic station Pelotas", -31.77, -52.34, ["gasoline", "diesel"], false),
  station("s-jaguarao", "Synthetic station Jaguarão", -32.56, -53.37, ["gasoline", "diesel"], true),
  station("s-chui", "Synthetic station Chuí", -33.69, -53.46, ["gasoline", "ethanol", "diesel"], true),
  station("s-montevideo", "Synthetic station Montevideo approach", -34.7, -56.0, ["gasoline", "diesel"], true),
];

function station(
  id: string,
  name: string,
  latitude: number,
  longitude: number,
  fuels: FuelType[],
  open24h: boolean,
): SyntheticStation {
  return {
    id,
    name,
    synthetic: true,
    location: { latitude, longitude },
    fuels,
    open24h,
  };
}
