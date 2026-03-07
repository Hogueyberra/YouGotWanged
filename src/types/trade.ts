export interface Trade {
  id: string;
  title: string;
  team_a_name: string;
  team_a_players: string;
  team_b_name: string;
  team_b_players: string;
  description: string | null;
  created_at: string;
}
