import type { ActivityType } from "../enums/activity-type";

/**
 * Pace unit distances for each activity type (in km)
 * - ERG: per 500m (0.5 km)
 * - CYCLE: per 1km
 * - RUN: per 1km
 * - SWIM: per 100m (0.1 km)
 * - OTHER: no pace
 */
export const PACE_UNIT_KM: Record<ActivityType, number | null> = {
  ERG: 0.5,
  CYCLE: 1,
  RUN: 1,
  SWIM: 0.1,
  OTHER: null,
};

/**
 * Human-readable labels for pace units
 */
export const PACE_UNIT_LABELS: Record<ActivityType, string | null> = {
  ERG: "/500m",
  CYCLE: "/km",
  RUN: "/km",
  SWIM: "/100m",
  OTHER: null,
};

/**
 * Calculate average pace in seconds per unit distance
 * @param activityType - The type of activity
 * @param distanceKm - Total distance in kilometers
 * @param minutes - Total duration in minutes
 * @returns Pace in seconds per unit distance, or null if not applicable
 */
export const calculatePaceSeconds = (
  activityType: ActivityType,
  distanceKm: number,
  minutes: number,
): number | null => {
  const unitKm = PACE_UNIT_KM[activityType];
  if (unitKm === null || distanceKm <= 0 || minutes <= 0) {
    return null;
  }

  const totalSeconds = minutes * 60;
  const units = distanceKm / unitKm;
  return totalSeconds / units;
};

/**
 * Calculate average watts for Concept2 equipment (ERG and CYCLE)
 * 
 * Formula for ERG: watts = 2.8 / (split/500)³
 * Formula for CYCLE: watts = 2.8 / (split/1000)³
 * 
 * @param activityType - The type of activity (only ERG and CYCLE are supported)
 * @param paceSeconds - The pace in seconds per unit distance
 * @returns Average watts, or null if not applicable
 */
export const calculateWatts = (
  activityType: ActivityType,
  paceSeconds: number | null,
): number | null => {
  if (paceSeconds === null || paceSeconds <= 0) {
    return null;
  }

  // Only Concept2 equipment (ERG and CYCLE) has wattage
  if (activityType === "ERG") {
    // For ERG: pace is per 500m, so we use pace directly as split
    // watts = 2.8 / (split/500)³ where split is in seconds per 500m
    const splitRatio = paceSeconds / 500;
    return 2.8 / Math.pow(splitRatio, 3);
  }

  if (activityType === "CYCLE") {
    // For CYCLE: pace is per km, but formula uses per 1000m (same thing)
    // watts = 2.8 / (split/1000)³ where split is in seconds per 1000m
    const splitRatio = paceSeconds / 1000;
    return 2.8 / Math.pow(splitRatio, 3);
  }

  return null;
};

/**
 * Format pace in seconds to a human-readable min:sec string
 * @param paceSeconds - Pace in seconds
 * @returns Formatted string like "2:05"
 */
export const formatPace = (paceSeconds: number | null): string | null => {
  if (paceSeconds === null || paceSeconds <= 0) {
    return null;
  }

  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.round(paceSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

/**
 * Format pace with the appropriate unit label for the activity type
 * @param activityType - The type of activity
 * @param paceSeconds - Pace in seconds per unit distance
 * @returns Formatted string like "2:05/500m" or null
 */
export const formatPaceWithUnit = (
  activityType: ActivityType,
  paceSeconds: number | null,
): string | null => {
  const formattedPace = formatPace(paceSeconds);
  const unitLabel = PACE_UNIT_LABELS[activityType];

  if (formattedPace === null || unitLabel === null) {
    return null;
  }

  return `${formattedPace}${unitLabel}`;
};

/**
 * Format watts to a human-readable string
 * @param watts - Average watts
 * @returns Formatted string like "245 W" or null
 */
export const formatWatts = (watts: number | null): string | null => {
  if (watts === null || watts <= 0) {
    return null;
  }
  return `${Math.round(watts)} W`;
};

/**
 * Check if an activity type supports wattage (Concept2 equipment)
 */
export const supportsWatts = (activityType: ActivityType): boolean => {
  return activityType === "ERG" || activityType === "CYCLE";
};

/**
 * Check if an activity type supports pace
 */
export const supportsPace = (activityType: ActivityType): boolean => {
  return PACE_UNIT_KM[activityType] !== null;
};
