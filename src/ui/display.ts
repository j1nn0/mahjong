import type { ClaimOption } from "../state/types.js";

/** 風名（席風・場風の表示用） */
export const WIND_NAMES = ["東", "南", "西", "北"] as const;

/** 副露オプションの表示ラベル */
export const claimLabel = (option: ClaimOption): string => {
  switch (option.type) {
    case "ron":
      return "ロン";
    case "chi":
      return "チー";
    case "pon":
      return "ポン";
    case "daiminkan":
      return "カン";
  }
};
