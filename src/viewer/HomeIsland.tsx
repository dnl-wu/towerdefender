"use client";
// A player's own island, at rest: their home map in their colours.
import { useMemo } from "react";
import { CURRENT_RULES } from "../engine/match-log.ts";
import type { Feed, FeedPlayer } from "./feed.ts";
import type { IslandStyle } from "./island-style.ts";
import { IslandPreview } from "./IslandPreview.tsx";

export function homeFeed(handle: string, style: IslandStyle): Feed {
  const player: FeedPlayer = {
    handle, rating: 0, rank: "", peak: 0, games: 0, wins: 0, losses: 0, draws: 0, streak: 0, avatarSeed: 1, houseBot: false,
    tagline: "", agentModel: "", playbookVersion: null, calls: 0, ratingBefore: null, ratingAfter: null, island: style,
  };
  // No rounds played: the island shows its gate, its core and open ground, and nothing else.
  return {
    view: "full", id: `home-${handle}`, seed: style.shape, rulesVersion: CURRENT_RULES, mode: "practice", status: "active", resolvedRounds: 0,
    log: [], winner: null, endReason: null, createdAt: 0, finishedAt: null, players: [player, player], live: null,
  };
}

export function HomeIsland({ handle, style }: { handle: string; style: IslandStyle }) {
  const feed = useMemo(() => homeFeed(handle, style), [handle, style]);
  return <IslandPreview feed={feed} lighting={style.light} replay={false} label={`@${handle}'s island`} />;
}
