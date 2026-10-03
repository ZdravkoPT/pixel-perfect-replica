export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      ai_bet_log: {
        Row: {
          away_score: number | null
          bet_date: string
          created_at: string
          facts: Json | null
          fair_odds: number
          fixture: string
          home_score: number | null
          id: string
          kickoff_at: string
          league: string | null
          market: string
          match_id: string
          opinion: string | null
          pick_code: string
          probability: number
          result: string
          selection: string
          settled_at: string | null
          slip_type: string
          updated_at: string
        }
        Insert: {
          away_score?: number | null
          bet_date: string
          created_at?: string
          facts?: Json | null
          fair_odds: number
          fixture: string
          home_score?: number | null
          id?: string
          kickoff_at: string
          league?: string | null
          market: string
          match_id: string
          opinion?: string | null
          pick_code: string
          probability: number
          result?: string
          selection: string
          settled_at?: string | null
          slip_type: string
          updated_at?: string
        }
        Update: {
          away_score?: number | null
          bet_date?: string
          created_at?: string
          facts?: Json | null
          fair_odds?: number
          fixture?: string
          home_score?: number | null
          id?: string
          kickoff_at?: string
          league?: string | null
          market?: string
          match_id?: string
          opinion?: string | null
          pick_code?: string
          probability?: number
          result?: string
          selection?: string
          settled_at?: string | null
          slip_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_bet_log_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      backtest_results: {
        Row: {
          actual: string
          backtest_id: string
          brier: number
          correct: boolean
          created_at: string
          id: string
          kickoff_at: string | null
          log_loss: number
          match_id: string | null
          p_away: number
          p_draw: number
          p_home: number
          predicted: string
        }
        Insert: {
          actual: string
          backtest_id: string
          brier: number
          correct: boolean
          created_at?: string
          id?: string
          kickoff_at?: string | null
          log_loss: number
          match_id?: string | null
          p_away: number
          p_draw: number
          p_home: number
          predicted: string
        }
        Update: {
          actual?: string
          backtest_id?: string
          brier?: number
          correct?: boolean
          created_at?: string
          id?: string
          kickoff_at?: string | null
          log_loss?: number
          match_id?: string | null
          p_away?: number
          p_draw?: number
          p_home?: number
          predicted?: string
        }
        Relationships: [
          {
            foreignKeyName: "backtest_results_backtest_id_fkey"
            columns: ["backtest_id"]
            isOneToOne: false
            referencedRelation: "backtests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backtest_results_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      backtests: {
        Row: {
          accuracy: number | null
          brier: number | null
          calibration: Json
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          log_loss: number | null
          model_version_id: string | null
          samples: number
          started_at: string
          status: string
          triggered_by: string
          window_from: string | null
          window_to: string | null
        }
        Insert: {
          accuracy?: number | null
          brier?: number | null
          calibration?: Json
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          log_loss?: number | null
          model_version_id?: string | null
          samples?: number
          started_at?: string
          status?: string
          triggered_by?: string
          window_from?: string | null
          window_to?: string | null
        }
        Update: {
          accuracy?: number | null
          brier?: number | null
          calibration?: Json
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          log_loss?: number | null
          model_version_id?: string | null
          samples?: number
          started_at?: string
          status?: string
          triggered_by?: string
          window_from?: string | null
          window_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backtests_model_version_id_fkey"
            columns: ["model_version_id"]
            isOneToOne: false
            referencedRelation: "model_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      bet_history_picks: {
        Row: {
          created_at: string
          fair_odds: number
          fixture: string
          id: string
          kickoff_at: string
          market: string
          match_id: string | null
          probability: number
          result: string | null
          run_id: string
          selection: string
          won: boolean
        }
        Insert: {
          created_at?: string
          fair_odds: number
          fixture: string
          id?: string
          kickoff_at: string
          market: string
          match_id?: string | null
          probability: number
          result?: string | null
          run_id: string
          selection: string
          won: boolean
        }
        Update: {
          created_at?: string
          fair_odds?: number
          fixture?: string
          id?: string
          kickoff_at?: string
          market?: string
          match_id?: string | null
          probability?: number
          result?: string | null
          run_id?: string
          selection?: string
          won?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "bet_history_picks_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_history_picks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "bet_history_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      bet_history_runs: {
        Row: {
          brier: number | null
          by_market: Json
          calibration: Json
          duration_ms: number | null
          error: string | null
          expected_hit_rate: number | null
          finished_at: string | null
          hit_rate: number | null
          id: string
          log_loss: number | null
          matches: number
          picks: number
          roi_fair: number | null
          roi_market: number | null
          started_at: string
          status: string
          threshold: number
          triggered_by: string | null
          weekly: Json
          weeks: number
          window_from: string | null
          window_to: string | null
          wins: number
        }
        Insert: {
          brier?: number | null
          by_market?: Json
          calibration?: Json
          duration_ms?: number | null
          error?: string | null
          expected_hit_rate?: number | null
          finished_at?: string | null
          hit_rate?: number | null
          id?: string
          log_loss?: number | null
          matches?: number
          picks?: number
          roi_fair?: number | null
          roi_market?: number | null
          started_at?: string
          status?: string
          threshold?: number
          triggered_by?: string | null
          weekly?: Json
          weeks?: number
          window_from?: string | null
          window_to?: string | null
          wins?: number
        }
        Update: {
          brier?: number | null
          by_market?: Json
          calibration?: Json
          duration_ms?: number | null
          error?: string | null
          expected_hit_rate?: number | null
          finished_at?: string | null
          hit_rate?: number | null
          id?: string
          log_loss?: number | null
          matches?: number
          picks?: number
          roi_fair?: number | null
          roi_market?: number | null
          started_at?: string
          status?: string
          threshold?: number
          triggered_by?: string | null
          weekly?: Json
          weeks?: number
          window_from?: string | null
          window_to?: string | null
          wins?: number
        }
        Relationships: []
      }
      coach_profiles: {
        Row: {
          achievements: Json
          career: Json
          coach_id: string
          current_team_id: string | null
          fetched_at: string
          name: string | null
          nationality: string | null
          provider_coach_id: string | null
          seasons: Json
          source: string
          totals: Json
        }
        Insert: {
          achievements?: Json
          career?: Json
          coach_id: string
          current_team_id?: string | null
          fetched_at?: string
          name?: string | null
          nationality?: string | null
          provider_coach_id?: string | null
          seasons?: Json
          source?: string
          totals?: Json
        }
        Update: {
          achievements?: Json
          career?: Json
          coach_id?: string
          current_team_id?: string | null
          fetched_at?: string
          name?: string | null
          nationality?: string | null
          provider_coach_id?: string | null
          seasons?: Json
          source?: string
          totals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "coach_profiles_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: true
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_profiles_current_team_id_fkey"
            columns: ["current_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_spells: {
        Row: {
          coach_id: string
          created_at: string
          ended_at: string | null
          id: string
          is_current: boolean
          started_at: string | null
          team_id: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          is_current?: boolean
          started_at?: string | null
          team_id: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          is_current?: boolean
          started_at?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_spells_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_spells_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      coaches: {
        Row: {
          birth_date: string | null
          canonical_id: string
          created_at: string
          id: string
          name: string
          nationality: string | null
          photo_url: string | null
          provider_ids: Json
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          canonical_id: string
          created_at?: string
          id?: string
          name: string
          nationality?: string | null
          photo_url?: string | null
          provider_ids?: Json
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          canonical_id?: string
          created_at?: string
          id?: string
          name?: string
          nationality?: string | null
          photo_url?: string | null
          provider_ids?: Json
          updated_at?: string
        }
        Relationships: []
      }
      data_sources: {
        Row: {
          auth_type: string
          base_url: string
          created_at: string
          day_window_start: string | null
          id: string
          last_error: string | null
          last_error_at: string | null
          last_request_at: string | null
          last_success_at: string | null
          license: string | null
          minute_window_start: string | null
          name: string
          priority: number
          rate_limit_per_day: number | null
          rate_limit_per_min: number | null
          requests_this_minute: number
          requests_today: number
          status: string
          updated_at: string
        }
        Insert: {
          auth_type?: string
          base_url: string
          created_at?: string
          day_window_start?: string | null
          id: string
          last_error?: string | null
          last_error_at?: string | null
          last_request_at?: string | null
          last_success_at?: string | null
          license?: string | null
          minute_window_start?: string | null
          name: string
          priority?: number
          rate_limit_per_day?: number | null
          rate_limit_per_min?: number | null
          requests_this_minute?: number
          requests_today?: number
          status?: string
          updated_at?: string
        }
        Update: {
          auth_type?: string
          base_url?: string
          created_at?: string
          day_window_start?: string | null
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_request_at?: string | null
          last_success_at?: string | null
          license?: string | null
          minute_window_start?: string | null
          name?: string
          priority?: number
          rate_limit_per_day?: number | null
          rate_limit_per_min?: number | null
          requests_this_minute?: number
          requests_today?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      ingestion_errors: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          job_id: string | null
          message: string
          source_id: string | null
          stage: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          job_id?: string | null
          message: string
          source_id?: string | null
          stage?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          job_id?: string | null
          message?: string
          source_id?: string | null
          stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_errors_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ingestion_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_errors_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_jobs: {
        Row: {
          details: Json | null
          duration_ms: number | null
          error_count: number
          finished_at: string | null
          id: string
          job_type: string
          records_inserted: number
          records_processed: number
          records_updated: number
          source_id: string | null
          started_at: string
          status: string
          triggered_by: string
        }
        Insert: {
          details?: Json | null
          duration_ms?: number | null
          error_count?: number
          finished_at?: string | null
          id?: string
          job_type: string
          records_inserted?: number
          records_processed?: number
          records_updated?: number
          source_id?: string | null
          started_at?: string
          status?: string
          triggered_by?: string
        }
        Update: {
          details?: Json | null
          duration_ms?: number | null
          error_count?: number
          finished_at?: string | null
          id?: string
          job_type?: string
          records_inserted?: number
          records_processed?: number
          records_updated?: number
          source_id?: string | null
          started_at?: string
          status?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_jobs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      injuries: {
        Row: {
          created_at: string
          expected_return: string | null
          id: string
          kind: string
          match_id: string | null
          player_id: string
          reason: string | null
          reported_at: string
          resolved_at: string | null
          source_id: string | null
          status: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          expected_return?: string | null
          id?: string
          kind?: string
          match_id?: string | null
          player_id: string
          reason?: string | null
          reported_at?: string
          resolved_at?: string | null
          source_id?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          expected_return?: string | null
          id?: string
          kind?: string
          match_id?: string | null
          player_id?: string
          reason?: string | null
          reported_at?: string
          resolved_at?: string | null
          source_id?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "injuries_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "injuries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "injuries_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "injuries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      league_standings: {
        Row: {
          as_of: string
          goal_diff: number | null
          id: string
          league_id: string | null
          played: number
          points: number
          position: number
          team_id: string
        }
        Insert: {
          as_of?: string
          goal_diff?: number | null
          id?: string
          league_id?: string | null
          played?: number
          points?: number
          position: number
          team_id: string
        }
        Update: {
          as_of?: string
          goal_diff?: number | null
          id?: string
          league_id?: string | null
          played?: number
          points?: number
          position?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_standings_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_standings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          canonical_id: string
          country: string | null
          country_code: string | null
          created_at: string
          id: string
          is_featured: boolean
          logo_url: string | null
          name: string
          provider_ids: Json
          short_name: string | null
          tier: number | null
          updated_at: string
        }
        Insert: {
          canonical_id: string
          country?: string | null
          country_code?: string | null
          created_at?: string
          id?: string
          is_featured?: boolean
          logo_url?: string | null
          name: string
          provider_ids?: Json
          short_name?: string | null
          tier?: number | null
          updated_at?: string
        }
        Update: {
          canonical_id?: string
          country?: string | null
          country_code?: string | null
          created_at?: string
          id?: string
          is_featured?: boolean
          logo_url?: string | null
          name?: string
          provider_ids?: Json
          short_name?: string | null
          tier?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      lineup_players: {
        Row: {
          created_at: string
          expected_minutes: number | null
          grid: string | null
          id: string
          is_starter: boolean
          lineup_id: string
          player_id: string
          position: string | null
          shirt_number: number | null
          start_probability: number | null
        }
        Insert: {
          created_at?: string
          expected_minutes?: number | null
          grid?: string | null
          id?: string
          is_starter?: boolean
          lineup_id: string
          player_id: string
          position?: string | null
          shirt_number?: number | null
          start_probability?: number | null
        }
        Update: {
          created_at?: string
          expected_minutes?: number | null
          grid?: string | null
          id?: string
          is_starter?: boolean
          lineup_id?: string
          player_id?: string
          position?: string | null
          shirt_number?: number | null
          start_probability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lineup_players_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "lineups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineup_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      lineups: {
        Row: {
          coach_id: string | null
          confidence: number | null
          created_at: string
          formation: string | null
          id: string
          is_predicted: boolean
          match_id: string
          source_id: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          coach_id?: string | null
          confidence?: number | null
          created_at?: string
          formation?: string | null
          id?: string
          is_predicted?: boolean
          match_id: string
          source_id?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          coach_id?: string | null
          confidence?: number | null
          created_at?: string
          formation?: string | null
          id?: string
          is_predicted?: boolean
          match_id?: string
          source_id?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lineups_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineups_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineups_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      market_values: {
        Row: {
          fetched_at: string
          id: string
          source: string
          squad_value_eur: number | null
          team_id: string
        }
        Insert: {
          fetched_at?: string
          id?: string
          source?: string
          squad_value_eur?: number | null
          team_id: string
        }
        Update: {
          fetched_at?: string
          id?: string
          source?: string
          squad_value_eur?: number | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_values_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      match_features: {
        Row: {
          away_attack: number | null
          away_defence: number | null
          away_elo: number | null
          away_form_points: number | null
          away_goals_against_avg: number | null
          away_goals_for_avg: number | null
          away_rest_days: number | null
          away_xg_rolling: number | null
          created_at: string
          elo_diff: number | null
          feature_timestamp: string
          home_attack: number | null
          home_defence: number | null
          home_elo: number | null
          home_form_points: number | null
          home_goals_against_avg: number | null
          home_goals_for_avg: number | null
          home_rest_days: number | null
          home_xg_rolling: number | null
          id: string
          match_id: string
          payload: Json
          sample_size: number
        }
        Insert: {
          away_attack?: number | null
          away_defence?: number | null
          away_elo?: number | null
          away_form_points?: number | null
          away_goals_against_avg?: number | null
          away_goals_for_avg?: number | null
          away_rest_days?: number | null
          away_xg_rolling?: number | null
          created_at?: string
          elo_diff?: number | null
          feature_timestamp?: string
          home_attack?: number | null
          home_defence?: number | null
          home_elo?: number | null
          home_form_points?: number | null
          home_goals_against_avg?: number | null
          home_goals_for_avg?: number | null
          home_rest_days?: number | null
          home_xg_rolling?: number | null
          id?: string
          match_id: string
          payload?: Json
          sample_size?: number
        }
        Update: {
          away_attack?: number | null
          away_defence?: number | null
          away_elo?: number | null
          away_form_points?: number | null
          away_goals_against_avg?: number | null
          away_goals_for_avg?: number | null
          away_rest_days?: number | null
          away_xg_rolling?: number | null
          created_at?: string
          elo_diff?: number | null
          feature_timestamp?: string
          home_attack?: number | null
          home_defence?: number | null
          home_elo?: number | null
          home_form_points?: number | null
          home_goals_against_avg?: number | null
          home_goals_for_avg?: number | null
          home_rest_days?: number | null
          home_xg_rolling?: number | null
          id?: string
          match_id?: string
          payload?: Json
          sample_size?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_features_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      match_officials: {
        Row: {
          created_at: string
          id: string
          match_id: string
          referee_id: string
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          referee_id: string
          role?: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          referee_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_officials_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_officials_referee_id_fkey"
            columns: ["referee_id"]
            isOneToOne: false
            referencedRelation: "referees"
            referencedColumns: ["id"]
          },
        ]
      }
      match_sources: {
        Row: {
          id: string
          ingested_at: string
          match_id: string
          payload: Json | null
          provider_match_id: string
          source_id: string
        }
        Insert: {
          id?: string
          ingested_at?: string
          match_id: string
          payload?: Json | null
          provider_match_id: string
          source_id: string
        }
        Update: {
          id?: string
          ingested_at?: string
          match_id?: string
          payload?: Json | null
          provider_match_id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_sources_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_score: number | null
          away_score_ht: number | null
          away_team_id: string
          canonical_id: string
          created_at: string
          home_score: number | null
          home_score_ht: number | null
          home_team_id: string
          id: string
          kickoff_at: string
          last_ingested_at: string
          league_id: string | null
          matchday: number | null
          minute: number | null
          provider_ids: Json
          season_id: string | null
          stage: string | null
          status: string
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          away_score?: number | null
          away_score_ht?: number | null
          away_team_id: string
          canonical_id: string
          created_at?: string
          home_score?: number | null
          home_score_ht?: number | null
          home_team_id: string
          id?: string
          kickoff_at: string
          last_ingested_at?: string
          league_id?: string | null
          matchday?: number | null
          minute?: number | null
          provider_ids?: Json
          season_id?: string | null
          stage?: string | null
          status?: string
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          away_score?: number | null
          away_score_ht?: number | null
          away_team_id?: string
          canonical_id?: string
          created_at?: string
          home_score?: number | null
          home_score_ht?: number | null
          home_team_id?: string
          id?: string
          kickoff_at?: string
          last_ingested_at?: string
          league_id?: string | null
          matchday?: number | null
          minute?: number | null
          provider_ids?: Json
          season_id?: string | null
          stage?: string | null
          status?: string
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      model_training_runs: {
        Row: {
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          matches_scored: number
          metrics: Json
          model_version_id: string | null
          samples: number
          started_at: string
          status: string
          triggered_by: string
        }
        Insert: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          matches_scored?: number
          metrics?: Json
          model_version_id?: string | null
          samples?: number
          started_at?: string
          status?: string
          triggered_by?: string
        }
        Update: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          matches_scored?: number
          metrics?: Json
          model_version_id?: string | null
          samples?: number
          started_at?: string
          status?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_training_runs_model_version_id_fkey"
            columns: ["model_version_id"]
            isOneToOne: false
            referencedRelation: "model_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      model_versions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          kind: string
          metrics: Json
          name: string
          params: Json
          trained_at: string
          training_samples: number
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind: string
          metrics?: Json
          name: string
          params?: Json
          trained_at?: string
          training_samples?: number
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          metrics?: Json
          name?: string
          params?: Json
          trained_at?: string
          training_samples?: number
          version?: number
        }
        Relationships: []
      }
      odds_snapshots: {
        Row: {
          bookmaker: string
          captured_at: string
          id: string
          line: number | null
          market: string
          match_id: string
          phase: string
          price: number
          selection: string
          source: string
        }
        Insert: {
          bookmaker: string
          captured_at?: string
          id?: string
          line?: number | null
          market: string
          match_id: string
          phase?: string
          price: number
          selection: string
          source?: string
        }
        Update: {
          bookmaker?: string
          captured_at?: string
          id?: string
          line?: number | null
          market?: string
          match_id?: string
          phase?: string
          price?: number
          selection?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "odds_snapshots_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      player_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          normalized_alias: string
          player_id: string
          source: string | null
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          normalized_alias: string
          player_id: string
          source?: string | null
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          normalized_alias?: string
          player_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_aliases_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_attributes: {
        Row: {
          age: number | null
          attacking: number | null
          created_at: string
          creativity: number | null
          defending: number | null
          id: string
          market_value: number | null
          minutes: number | null
          overall: number | null
          physical: number | null
          player_id: string
          position_group: string | null
          provider_player_id: string | null
          rating: number | null
          source_id: string | null
          strengths: Json
          technical: number | null
          traits: Json
          updated_at: string
          weaknesses: Json
        }
        Insert: {
          age?: number | null
          attacking?: number | null
          created_at?: string
          creativity?: number | null
          defending?: number | null
          id?: string
          market_value?: number | null
          minutes?: number | null
          overall?: number | null
          physical?: number | null
          player_id: string
          position_group?: string | null
          provider_player_id?: string | null
          rating?: number | null
          source_id?: string | null
          strengths?: Json
          technical?: number | null
          traits?: Json
          updated_at?: string
          weaknesses?: Json
        }
        Update: {
          age?: number | null
          attacking?: number | null
          created_at?: string
          creativity?: number | null
          defending?: number | null
          id?: string
          market_value?: number | null
          minutes?: number | null
          overall?: number | null
          physical?: number | null
          player_id?: string
          position_group?: string | null
          provider_player_id?: string | null
          rating?: number | null
          source_id?: string | null
          strengths?: Json
          technical?: number | null
          traits?: Json
          updated_at?: string
          weaknesses?: Json
        }
        Relationships: [
          {
            foreignKeyName: "player_attributes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_careers: {
        Row: {
          clubs: Json
          contract_end: string | null
          country: string | null
          current_season: Json
          fetched_at: string
          height: string | null
          injury: Json | null
          market_value_label: string | null
          name: string | null
          national: Json
          player_id: string
          position_description: string | null
          preferred_foot: string | null
          seasons: Json
          shirt: string | null
          source: string
        }
        Insert: {
          clubs?: Json
          contract_end?: string | null
          country?: string | null
          current_season?: Json
          fetched_at?: string
          height?: string | null
          injury?: Json | null
          market_value_label?: string | null
          name?: string | null
          national?: Json
          player_id: string
          position_description?: string | null
          preferred_foot?: string | null
          seasons?: Json
          shirt?: string | null
          source?: string
        }
        Update: {
          clubs?: Json
          contract_end?: string | null
          country?: string | null
          current_season?: Json
          fetched_at?: string
          height?: string | null
          injury?: Json | null
          market_value_label?: string | null
          name?: string | null
          national?: Json
          player_id?: string
          position_description?: string | null
          preferred_foot?: string | null
          seasons?: Json
          shirt?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_careers_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_conditions: {
        Row: {
          assists_recent: number
          availability: string
          avg_rating_prior: number | null
          avg_rating_recent: number | null
          days_since_last_match: number | null
          fetched_at: string
          goals_recent: number
          injury: Json | null
          load_index: number | null
          matches_30d: number
          matches_recent: number
          minutes_30d: number
          minutes_recent: number
          minutes_share: number | null
          player_id: string
          rating_trend: number | null
          recent_matches: Json
          sharpness: number | null
          source: string
          starts_recent: number
          team_id: string | null
        }
        Insert: {
          assists_recent?: number
          availability?: string
          avg_rating_prior?: number | null
          avg_rating_recent?: number | null
          days_since_last_match?: number | null
          fetched_at?: string
          goals_recent?: number
          injury?: Json | null
          load_index?: number | null
          matches_30d?: number
          matches_recent?: number
          minutes_30d?: number
          minutes_recent?: number
          minutes_share?: number | null
          player_id: string
          rating_trend?: number | null
          recent_matches?: Json
          sharpness?: number | null
          source?: string
          starts_recent?: number
          team_id?: string | null
        }
        Update: {
          assists_recent?: number
          availability?: string
          avg_rating_prior?: number | null
          avg_rating_recent?: number | null
          days_since_last_match?: number | null
          fetched_at?: string
          goals_recent?: number
          injury?: Json | null
          load_index?: number | null
          matches_30d?: number
          matches_recent?: number
          minutes_30d?: number
          minutes_recent?: number
          minutes_share?: number | null
          player_id?: string
          rating_trend?: number | null
          recent_matches?: Json
          sharpness?: number | null
          source?: string
          starts_recent?: number
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_conditions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_conditions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_match_stats: {
        Row: {
          assists: number
          created_at: string
          fouls_committed: number
          fouls_drawn: number
          goals: number
          id: string
          key_passes: number
          match_id: string
          minutes: number
          passes: number
          payload: Json
          player_id: string
          rating: number | null
          red_cards: number
          saves: number
          shots: number
          shots_on_target: number
          started: boolean
          tackles: number
          team_id: string | null
          yellow_cards: number
        }
        Insert: {
          assists?: number
          created_at?: string
          fouls_committed?: number
          fouls_drawn?: number
          goals?: number
          id?: string
          key_passes?: number
          match_id: string
          minutes?: number
          passes?: number
          payload?: Json
          player_id: string
          rating?: number | null
          red_cards?: number
          saves?: number
          shots?: number
          shots_on_target?: number
          started?: boolean
          tackles?: number
          team_id?: string | null
          yellow_cards?: number
        }
        Update: {
          assists?: number
          created_at?: string
          fouls_committed?: number
          fouls_drawn?: number
          goals?: number
          id?: string
          key_passes?: number
          match_id?: string
          minutes?: number
          passes?: number
          payload?: Json
          player_id?: string
          rating?: number | null
          red_cards?: number
          saves?: number
          shots?: number
          shots_on_target?: number
          started?: boolean
          tackles?: number
          team_id?: string | null
          yellow_cards?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_match_stats_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_stats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_prop_predictions: {
        Row: {
          created_at: string
          expected_minutes: number | null
          fair_odds: number
          id: string
          line: number | null
          market: string
          match_id: string
          model_version_id: string | null
          player_id: string
          prediction_timestamp: string
          probability: number
          selection: string
          team_id: string | null
        }
        Insert: {
          created_at?: string
          expected_minutes?: number | null
          fair_odds: number
          id?: string
          line?: number | null
          market: string
          match_id: string
          model_version_id?: string | null
          player_id: string
          prediction_timestamp?: string
          probability: number
          selection: string
          team_id?: string | null
        }
        Update: {
          created_at?: string
          expected_minutes?: number | null
          fair_odds?: number
          id?: string
          line?: number | null
          market?: string
          match_id?: string
          model_version_id?: string | null
          player_id?: string
          prediction_timestamp?: string
          probability?: number
          selection?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_prop_predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_prop_predictions_model_version_id_fkey"
            columns: ["model_version_id"]
            isOneToOne: false
            referencedRelation: "model_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_prop_predictions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_prop_predictions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          birth_date: string | null
          canonical_id: string
          created_at: string
          first_name: string | null
          height_cm: number | null
          id: string
          last_name: string | null
          name: string
          nationality: string | null
          photo_url: string | null
          position: string | null
          provider_ids: Json
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          birth_date?: string | null
          canonical_id: string
          created_at?: string
          first_name?: string | null
          height_cm?: number | null
          id?: string
          last_name?: string | null
          name: string
          nationality?: string | null
          photo_url?: string | null
          position?: string | null
          provider_ids?: Json
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          birth_date?: string | null
          canonical_id?: string
          created_at?: string
          first_name?: string | null
          height_cm?: number | null
          id?: string
          last_name?: string | null
          name?: string
          nationality?: string | null
          photo_url?: string | null
          position?: string | null
          provider_ids?: Json
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      prediction_explanations: {
        Row: {
          contribution: number
          created_at: string
          direction: string
          feature: string
          id: string
          label: string
          prediction_id: string
          rank: number
          value: number | null
        }
        Insert: {
          contribution: number
          created_at?: string
          direction: string
          feature: string
          id?: string
          label: string
          prediction_id: string
          rank: number
          value?: number | null
        }
        Update: {
          contribution?: number
          created_at?: string
          direction?: string
          feature?: string
          id?: string
          label?: string
          prediction_id?: string
          rank?: number
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prediction_explanations_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_markets: {
        Row: {
          created_at: string
          fair_odds: number
          id: string
          market: string
          prediction_id: string
          probability: number
          selection: string
        }
        Insert: {
          created_at?: string
          fair_odds: number
          id?: string
          market: string
          prediction_id: string
          probability: number
          selection: string
        }
        Update: {
          created_at?: string
          fair_odds?: number
          id?: string
          market?: string
          prediction_id?: string
          probability?: number
          selection?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_markets_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          confidence: number | null
          created_at: string
          expected_goals: number
          feature_id: string | null
          id: string
          lambda_away: number
          lambda_home: number
          match_id: string
          model_version_id: string
          p_away: number
          p_btts: number | null
          p_draw: number
          p_home: number
          p_over_25: number | null
          p_under_25: number | null
          prediction_timestamp: string
          top_scoreline: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          expected_goals: number
          feature_id?: string | null
          id?: string
          lambda_away: number
          lambda_home: number
          match_id: string
          model_version_id: string
          p_away: number
          p_btts?: number | null
          p_draw: number
          p_home: number
          p_over_25?: number | null
          p_under_25?: number | null
          prediction_timestamp?: string
          top_scoreline?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          expected_goals?: number
          feature_id?: string | null
          id?: string
          lambda_away?: number
          lambda_home?: number
          match_id?: string
          model_version_id?: string
          p_away?: number
          p_btts?: number | null
          p_draw?: number
          p_home?: number
          p_over_25?: number | null
          p_under_25?: number | null
          prediction_timestamp?: string
          top_scoreline?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "predictions_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "match_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_model_version_id_fkey"
            columns: ["model_version_id"]
            isOneToOne: false
            referencedRelation: "model_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_conflicts: {
        Row: {
          canonical_id: string | null
          detected_at: string
          entity_id: string | null
          entity_type: string
          field: string
          id: string
          resolved: boolean
          source_a: string
          source_b: string
          value_a: Json | null
          value_b: Json | null
        }
        Insert: {
          canonical_id?: string | null
          detected_at?: string
          entity_id?: string | null
          entity_type: string
          field: string
          id?: string
          resolved?: boolean
          source_a: string
          source_b: string
          value_a?: Json | null
          value_b?: Json | null
        }
        Update: {
          canonical_id?: string | null
          detected_at?: string
          entity_id?: string | null
          entity_type?: string
          field?: string
          id?: string
          resolved?: boolean
          source_a?: string
          source_b?: string
          value_a?: Json | null
          value_b?: Json | null
        }
        Relationships: []
      }
      referee_stats: {
        Row: {
          as_of: string
          created_at: string
          fouls_per_game: number | null
          home_card_share: number | null
          id: string
          league_id: string | null
          matches: number
          penalties_per_game: number | null
          red_per_game: number | null
          referee_id: string
          yellow_per_game: number | null
        }
        Insert: {
          as_of?: string
          created_at?: string
          fouls_per_game?: number | null
          home_card_share?: number | null
          id?: string
          league_id?: string | null
          matches?: number
          penalties_per_game?: number | null
          red_per_game?: number | null
          referee_id: string
          yellow_per_game?: number | null
        }
        Update: {
          as_of?: string
          created_at?: string
          fouls_per_game?: number | null
          home_card_share?: number | null
          id?: string
          league_id?: string | null
          matches?: number
          penalties_per_game?: number | null
          red_per_game?: number | null
          referee_id?: string
          yellow_per_game?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "referee_stats_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referee_stats_referee_id_fkey"
            columns: ["referee_id"]
            isOneToOne: false
            referencedRelation: "referees"
            referencedColumns: ["id"]
          },
        ]
      }
      referees: {
        Row: {
          canonical_id: string
          country: string | null
          created_at: string
          id: string
          name: string
          provider_ids: Json
          updated_at: string
        }
        Insert: {
          canonical_id: string
          country?: string | null
          created_at?: string
          id?: string
          name: string
          provider_ids?: Json
          updated_at?: string
        }
        Update: {
          canonical_id?: string
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          provider_ids?: Json
          updated_at?: string
        }
        Relationships: []
      }
      seasons: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_current: boolean
          league_id: string
          provider_ids: Json
          start_date: string | null
          updated_at: string
          year_label: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          league_id: string
          provider_ids?: Json
          start_date?: string | null
          updated_at?: string
          year_label: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          league_id?: string
          provider_ids?: Json
          start_date?: string | null
          updated_at?: string
          year_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      squad_memberships: {
        Row: {
          created_at: string
          id: string
          is_current: boolean
          joined_at: string | null
          left_at: string | null
          on_loan: boolean
          player_id: string
          position: string | null
          season_id: string | null
          shirt_number: number | null
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_current?: boolean
          joined_at?: string | null
          left_at?: string | null
          on_loan?: boolean
          player_id: string
          position?: string | null
          season_id?: string | null
          shirt_number?: number | null
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_current?: boolean
          joined_at?: string | null
          left_at?: string | null
          on_loan?: boolean
          player_id?: string
          position?: string | null
          season_id?: string | null
          shirt_number?: number | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "squad_memberships_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_memberships_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "squad_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          normalized_alias: string
          source: string | null
          team_id: string
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          normalized_alias: string
          source?: string | null
          team_id: string
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          normalized_alias?: string
          source?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_aliases_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_match_stats: {
        Row: {
          corners: number | null
          created_at: string
          fouls: number | null
          id: string
          is_home: boolean
          match_id: string
          offsides: number | null
          pass_accuracy: number | null
          passes: number | null
          payload: Json
          possession: number | null
          red_cards: number | null
          shots: number | null
          shots_on_target: number | null
          team_id: string
          yellow_cards: number | null
        }
        Insert: {
          corners?: number | null
          created_at?: string
          fouls?: number | null
          id?: string
          is_home: boolean
          match_id: string
          offsides?: number | null
          pass_accuracy?: number | null
          passes?: number | null
          payload?: Json
          possession?: number | null
          red_cards?: number | null
          shots?: number | null
          shots_on_target?: number | null
          team_id: string
          yellow_cards?: number | null
        }
        Update: {
          corners?: number | null
          created_at?: string
          fouls?: number | null
          id?: string
          is_home?: boolean
          match_id?: string
          offsides?: number | null
          pass_accuracy?: number | null
          passes?: number | null
          payload?: Json
          possession?: number | null
          red_cards?: number | null
          shots?: number | null
          shots_on_target?: number | null
          team_id?: string
          yellow_cards?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_match_stats_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_match_stats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_ratings: {
        Row: {
          as_of: string
          attack: number | null
          created_at: string
          defence: number | null
          id: string
          league_id: string | null
          matches_played: number
          rating: number
          team_id: string
        }
        Insert: {
          as_of?: string
          attack?: number | null
          created_at?: string
          defence?: number | null
          id?: string
          league_id?: string | null
          matches_played?: number
          rating: number
          team_id: string
        }
        Update: {
          as_of?: string
          attack?: number | null
          created_at?: string
          defence?: number | null
          id?: string
          league_id?: string | null
          matches_played?: number
          rating?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_ratings_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_tracking: {
        Row: {
          created_at: string
          created_by: string | null
          distance_km: number
          id: string
          match_date: string
          minutes: number
          opponent: string | null
          source: string
          team_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          distance_km: number
          id?: string
          match_date: string
          minutes?: number
          opponent?: string | null
          source?: string
          team_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          distance_km?: number
          id?: string
          match_date?: string
          minutes?: number
          opponent?: string | null
          source?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_tracking_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_xg: {
        Row: {
          created_at: string
          id: string
          match_id: string
          source: string
          team_id: string
          xg: number | null
          xg_against: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          source?: string
          team_id: string
          xg?: number | null
          xg_against?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          source?: string
          team_id?: string
          xg?: number | null
          xg_against?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_xg_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_xg_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          canonical_id: string
          country: string | null
          created_at: string
          crest_url: string | null
          founded: number | null
          id: string
          name: string
          provider_ids: Json
          short_name: string | null
          tla: string | null
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          canonical_id: string
          country?: string | null
          created_at?: string
          crest_url?: string | null
          founded?: number | null
          id?: string
          name: string
          provider_ids?: Json
          short_name?: string | null
          tla?: string | null
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          canonical_id?: string
          country?: string | null
          created_at?: string
          crest_url?: string | null
          founded?: number | null
          id?: string
          name?: string
          provider_ids?: Json
          short_name?: string | null
          tla?: string | null
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      venues: {
        Row: {
          canonical_id: string
          capacity: number | null
          city: string | null
          country: string | null
          created_at: string
          id: string
          name: string
          provider_ids: Json
          updated_at: string
        }
        Insert: {
          canonical_id: string
          capacity?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name: string
          provider_ids?: Json
          updated_at?: string
        }
        Update: {
          canonical_id?: string
          capacity?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          provider_ids?: Json
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
