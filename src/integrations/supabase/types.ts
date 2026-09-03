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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
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
