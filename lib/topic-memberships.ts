export type MyTopicFaction = {
  faction_id: string;
  faction_name: string;
  is_primary: boolean;
  speaker_name?: string;
};

export type MyWerewolfAlias = {
  faction_id: string;
  faction_name: string;
  speaker_name: string;
  is_primary: boolean;
};
