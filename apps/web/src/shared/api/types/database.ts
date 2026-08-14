/**
 * Hand-written Database types aligned with ТЗ v1.1 (section 4).
 * Replace with `supabase gen types` when migrations are applied.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type UserRole = 'admin' | 'member'
export type UserStatus = 'pending' | 'confirmed' | 'blocked'
export type CompanyAccessStatus = 'active' | 'suspended' | 'archived'
export type WorkGroupStatus = 'active' | 'paused' | 'archived'
export type VoteMode = 'per_company' | 'per_representative'
export type PollStatus = 'draft' | 'active' | 'closed'
export type MessengerPlatform = 'telegram' | 'max'
export type BotStatus = 'pending' | 'connected' | 'error'
export type MessageSource = 'telegram' | 'max'
export type DeliveryStatus = 'received' | 'stored' | 'relayed' | 'failed'
export type RelayStatus = 'pending' | 'sent' | 'failed'
export type MessengerChatKind = 'channel' | 'group' | 'supergroup' | 'private' | 'other'
export type MessageContentType = 'text' | 'photo' | 'video' | 'document' | 'other'
export type ProductCategorySuggestionStatus = 'pending' | 'approved' | 'rejected'
export type ProductModerationStatus = 'pending' | 'approved' | 'rejected'
export type MaterialModerationStatus = 'pending' | 'approved' | 'rejected'
export type InvoiceStatus = 'issued' | 'paid'
export type WorkGroupMembershipRequestKind = 'join' | 'leave'
export type WorkGroupMembershipRequestStatus = 'pending' | 'approved' | 'rejected'
export type NotificationType =
  | 'invoice_issued'
  | 'invoice_paid'
  | 'product_approved'
  | 'product_rejected'
  | 'registration_pending'
  | 'product_moderation_pending'
  | 'category_suggestion_pending'
  | 'material_moderation_pending'
  | 'material_category_pending'
  | 'work_group_membership_pending'
  | 'registration_confirmed'

/** Payload for confirm_registration → create representative (+ optional company). */
export type CreateRepresentativePayload = {
  company_id?: string | null
  company_name?: string | null
  company_inn?: string | null
  full_name: string
  position?: string | null
  phone?: string | null
  email?: string | null
  telegram_username?: string | null
  max_username?: string | null
  pd_consent?: boolean
  is_primary?: boolean
  show_contacts_to_members?: boolean
}

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          role: UserRole
          representative_id: string | null
          status: UserStatus
          full_name: string | null
          phone: string | null
          company_name_hint: string | null
          company_inn_hint: string | null
          staff_position: string | null
          is_ceo: boolean
          can_manage_work_groups: boolean
          pd_consent_at: string | null
          show_contacts_to_members: boolean
          email_notifications_enabled: boolean
          messenger_username: string | null
          telegram_username: string | null
          max_username: string | null
          created_at: string
        }
        Insert: {
          id: string
          email: string
          role?: UserRole
          representative_id?: string | null
          status?: UserStatus
          full_name?: string | null
          phone?: string | null
          company_name_hint?: string | null
          company_inn_hint?: string | null
          staff_position?: string | null
          is_ceo?: boolean
          can_manage_work_groups?: boolean
          pd_consent_at?: string | null
          show_contacts_to_members?: boolean
          email_notifications_enabled?: boolean
          messenger_username?: string | null
          telegram_username?: string | null
          max_username?: string | null
          created_at?: string
        }
        Update: {
          email?: string
          role?: UserRole
          representative_id?: string | null
          status?: UserStatus
          full_name?: string | null
          phone?: string | null
          company_name_hint?: string | null
          company_inn_hint?: string | null
          staff_position?: string | null
          is_ceo?: boolean
          can_manage_work_groups?: boolean
          pd_consent_at?: string | null
          show_contacts_to_members?: boolean
          email_notifications_enabled?: boolean
          messenger_username?: string | null
          telegram_username?: string | null
          max_username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'users_representative_id_fkey'
            columns: ['representative_id']
            isOneToOne: true
            referencedRelation: 'representatives'
            referencedColumns: ['id']
          },
        ]
      }
      participation_levels: {
        Row: {
          id: string
          name: string
          description: string | null
          sort_order: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          sort_order?: number
          is_active?: boolean
        }
        Relationships: []
      }
      companies: {
        Row: {
          id: string
          auto_id: number
          name: string
          inn: string | null
          description: string | null
          phone: string | null
          email: string | null
          website: string | null
          address: string | null
          participation_level_id: string | null
          access_status: CompanyAccessStatus
          notes: string | null
          balance: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          auto_id?: number
          name: string
          inn?: string | null
          description?: string | null
          phone?: string | null
          email?: string | null
          website?: string | null
          address?: string | null
          participation_level_id?: string | null
          access_status?: CompanyAccessStatus
          notes?: string | null
          balance?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          inn?: string | null
          description?: string | null
          phone?: string | null
          email?: string | null
          website?: string | null
          address?: string | null
          participation_level_id?: string | null
          access_status?: CompanyAccessStatus
          notes?: string | null
          balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'companies_participation_level_id_fkey'
            columns: ['participation_level_id']
            isOneToOne: false
            referencedRelation: 'participation_levels'
            referencedColumns: ['id']
          },
        ]
      }
      company_comments: {
        Row: {
          id: string
          company_id: string
          author_id: string
          body: string
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          author_id: string
          body: string
          created_at?: string
        }
        Update: {
          body?: string
        }
        Relationships: [
          {
            foreignKeyName: 'company_comments_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'company_comments_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      representatives: {
        Row: {
          id: string
          company_id: string
          full_name: string
          position: string | null
          phone: string | null
          email: string | null
          messenger_username: string | null
          telegram_username: string | null
          max_username: string | null
          pd_consent: boolean
          pd_consent_date: string | null
          is_primary: boolean
          is_active: boolean
          show_contacts_to_members: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          full_name: string
          position?: string | null
          phone?: string | null
          email?: string | null
          messenger_username?: string | null
          telegram_username?: string | null
          max_username?: string | null
          pd_consent?: boolean
          pd_consent_date?: string | null
          is_primary?: boolean
          is_active?: boolean
          show_contacts_to_members?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          full_name?: string
          position?: string | null
          phone?: string | null
          email?: string | null
          messenger_username?: string | null
          telegram_username?: string | null
          max_username?: string | null
          pd_consent?: boolean
          pd_consent_date?: string | null
          is_primary?: boolean
          is_active?: boolean
          show_contacts_to_members?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'representatives_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
        ]
      }
      work_group_categories: {
        Row: {
          id: string
          name: string
          slug: string
          sort_order: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          name?: string
          slug?: string
          sort_order?: number
          is_active?: boolean
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          id: string
          name: string
          slug: string
          sort_order: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          name?: string
          slug?: string
          sort_order?: number
          is_active?: boolean
        }
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          company_id: string
          number: string
          title: string
          amount: number
          currency: string
          status: InvoiceStatus
          due_date: string | null
          issued_at: string
          paid_at: string | null
          file_url: string | null
          file_name: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          number: string
          title: string
          amount: number
          currency?: string
          status?: InvoiceStatus
          due_date?: string | null
          issued_at?: string
          paid_at?: string | null
          file_url?: string | null
          file_name?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          number?: string
          title?: string
          amount?: number
          currency?: string
          status?: InvoiceStatus
          due_date?: string | null
          issued_at?: string
          paid_at?: string | null
          file_url?: string | null
          file_name?: string | null
          created_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'invoices_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          company_id: string | null
          type: NotificationType
          title: string
          body: string | null
          link: string | null
          entity_type: string | null
          entity_id: string | null
          payload: Json
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          company_id?: string | null
          type: NotificationType
          title: string
          body?: string | null
          link?: string | null
          entity_type?: string | null
          entity_id?: string | null
          payload?: Json
          read_at?: string | null
          created_at?: string
        }
        Update: {
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notifications_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
        ]
      }
      company_products: {
        Row: {
          id: string
          company_id: string
          category_id: string | null
          okpd_code_id: string | null
          note_id: string | null
          proposed_okpd_code: string | null
          proposed_okpd_title: string | null
          proposed_note_name: string | null
          name: string
          url: string | null
          sort_order: number
          is_active: boolean
          moderation_status: ProductModerationStatus
          reviewed_by: string | null
          reviewed_at: string | null
          review_note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          category_id?: string | null
          okpd_code_id?: string | null
          note_id?: string | null
          proposed_okpd_code?: string | null
          proposed_okpd_title?: string | null
          proposed_note_name?: string | null
          name: string
          url?: string | null
          sort_order?: number
          is_active?: boolean
          moderation_status?: ProductModerationStatus
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          category_id?: string | null
          okpd_code_id?: string | null
          note_id?: string | null
          proposed_okpd_code?: string | null
          proposed_okpd_title?: string | null
          proposed_note_name?: string | null
          name?: string
          url?: string | null
          sort_order?: number
          is_active?: boolean
          moderation_status?: ProductModerationStatus
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'company_products_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'company_products_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'product_categories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'company_products_okpd_code_id_fkey'
            columns: ['okpd_code_id']
            isOneToOne: false
            referencedRelation: 'okpd2_codes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'company_products_note_id_fkey'
            columns: ['note_id']
            isOneToOne: false
            referencedRelation: 'product_notes'
            referencedColumns: ['id']
          },
        ]
      }
      okpd2_codes: {
        Row: {
          id: string
          code: string
          title: string
          parent_id: string | null
          level: number
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          title: string
          parent_id?: string | null
          level: number
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          code?: string
          title?: string
          parent_id?: string | null
          level?: number
          sort_order?: number
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'okpd2_codes_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'okpd2_codes'
            referencedColumns: ['id']
          },
        ]
      }
      product_notes: {
        Row: {
          id: string
          name: string
          sort_order: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          name?: string
          sort_order?: number
          is_active?: boolean
        }
        Relationships: []
      }
      product_category_suggestions: {
        Row: {
          id: string
          product_id: string
          company_id: string
          suggested_by: string
          suggested_name: string
          status: ProductCategorySuggestionStatus
          matched_category_id: string | null
          review_note: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          company_id: string
          suggested_by: string
          suggested_name: string
          status?: ProductCategorySuggestionStatus
          matched_category_id?: string | null
          review_note?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
        }
        Update: {
          status?: ProductCategorySuggestionStatus
          matched_category_id?: string | null
          review_note?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
        }
        Relationships: []
      }
      work_groups: {
        Row: {
          id: string
          name: string
          description: string | null
          responsible_representative_id: string | null
          category_id: string | null
          status: WorkGroupStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          responsible_representative_id?: string | null
          category_id?: string | null
          status?: WorkGroupStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          responsible_representative_id?: string | null
          category_id?: string | null
          status?: WorkGroupStatus
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'work_groups_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'work_group_categories'
            referencedColumns: ['id']
          },
        ]
      }
      work_group_members: {
        Row: {
          id: string
          work_group_id: string
          representative_id: string
          added_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          work_group_id: string
          representative_id: string
          added_by?: string | null
          created_at?: string
        }
        Update: {
          work_group_id?: string
          representative_id?: string
          added_by?: string | null
        }
        Relationships: []
      }
      work_group_membership_requests: {
        Row: {
          id: string
          work_group_id: string
          representative_id: string
          company_id: string
          requested_by: string
          kind: WorkGroupMembershipRequestKind
          status: WorkGroupMembershipRequestStatus
          review_note: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          work_group_id: string
          representative_id: string
          company_id: string
          requested_by: string
          kind: WorkGroupMembershipRequestKind
          status?: WorkGroupMembershipRequestStatus
          review_note?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
        }
        Update: {
          work_group_id?: string
          representative_id?: string
          company_id?: string
          requested_by?: string
          kind?: WorkGroupMembershipRequestKind
          status?: WorkGroupMembershipRequestStatus
          review_note?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
        }
        Relationships: []
      }
      work_group_links: {
        Row: {
          id: string
          work_group_id: string
          title: string
          url: string | null
          file_url: string | null
          description: string | null
          sort_order: number
          file_size: number | null
          mime_type: string | null
          created_at: string
        }
        Insert: {
          id?: string
          work_group_id: string
          title: string
          url?: string | null
          file_url?: string | null
          description?: string | null
          sort_order?: number
          file_size?: number | null
          mime_type?: string | null
          created_at?: string
        }
        Update: {
          title?: string
          url?: string | null
          file_url?: string | null
          description?: string | null
          sort_order?: number
          file_size?: number | null
          mime_type?: string | null
        }
        Relationships: []
      }
      material_sections: {
        Row: {
          id: string
          title: string
          slug: string | null
          description: string | null
          content: string | null
          is_published: boolean
          sort_order: number
          category_id: string | null
          moderation_status: MaterialModerationStatus
          reviewed_by: string | null
          reviewed_at: string | null
          review_note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          slug?: string | null
          description?: string | null
          content?: string | null
          is_published?: boolean
          sort_order?: number
          category_id?: string | null
          moderation_status?: MaterialModerationStatus
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          slug?: string | null
          description?: string | null
          content?: string | null
          is_published?: boolean
          sort_order?: number
          category_id?: string | null
          moderation_status?: MaterialModerationStatus
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'material_sections_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'material_categories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'material_section_levels_material_section_id_fkey'
            columns: ['id']
            isOneToOne: false
            referencedRelation: 'material_section_levels'
            referencedColumns: ['material_section_id']
          },
        ]
      }
      material_categories: {
        Row: {
          id: string
          name: string
          slug: string
          sort_order: number
          is_active: boolean
          moderation_status: MaterialModerationStatus
          reviewed_by: string | null
          reviewed_at: string | null
          review_note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          sort_order?: number
          is_active?: boolean
          moderation_status?: MaterialModerationStatus
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
          created_at?: string
        }
        Update: {
          name?: string
          slug?: string
          sort_order?: number
          is_active?: boolean
          moderation_status?: MaterialModerationStatus
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
        }
        Relationships: []
      }
      material_section_levels: {
        Row: {
          id: string
          material_section_id: string
          participation_level_id: string
          created_at: string
        }
        Insert: {
          id?: string
          material_section_id: string
          participation_level_id: string
          created_at?: string
        }
        Update: {
          material_section_id?: string
          participation_level_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'material_section_levels_material_section_id_fkey'
            columns: ['material_section_id']
            isOneToOne: false
            referencedRelation: 'material_sections'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'material_section_levels_participation_level_id_fkey'
            columns: ['participation_level_id']
            isOneToOne: false
            referencedRelation: 'participation_levels'
            referencedColumns: ['id']
          },
        ]
      }
      material_documents: {
        Row: {
          id: string
          material_section_id: string
          title: string
          file_url: string
          file_size: number | null
          mime_type: string | null
          sort_order: number
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          material_section_id: string
          title: string
          file_url: string
          file_size?: number | null
          mime_type?: string | null
          sort_order?: number
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          title?: string
          file_url?: string
          file_size?: number | null
          mime_type?: string | null
          sort_order?: number
          uploaded_by?: string | null
        }
        Relationships: []
      }
      polls: {
        Row: {
          id: string
          title: string
          description: string | null
          vote_mode: VoteMode
          starts_at: string | null
          ends_at: string | null
          status: PollStatus
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          vote_mode?: VoteMode
          starts_at?: string | null
          ends_at?: string | null
          status?: PollStatus
          created_by?: string | null
          created_at?: string
        }
        Update: {
          title?: string
          description?: string | null
          vote_mode?: VoteMode
          starts_at?: string | null
          ends_at?: string | null
          status?: PollStatus
          created_by?: string | null
        }
        Relationships: []
      }
      poll_options: {
        Row: {
          id: string
          poll_id: string
          text: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          poll_id: string
          text: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          text?: string
          sort_order?: number
        }
        Relationships: []
      }
      poll_votes: {
        Row: {
          id: string
          poll_id: string
          poll_option_id: string
          representative_id: string
          company_id: string
          voted_at: string
          created_at: string
        }
        Insert: {
          id?: string
          poll_id: string
          poll_option_id: string
          representative_id: string
          company_id: string
          voted_at?: string
          created_at?: string
        }
        Update: never
        Relationships: []
      }
      poll_level_access: {
        Row: {
          id: string
          poll_id: string
          participation_level_id: string
          created_at: string
        }
        Insert: {
          id?: string
          poll_id: string
          participation_level_id: string
          created_at?: string
        }
        Update: {
          poll_id?: string
          participation_level_id?: string
        }
        Relationships: []
      }
      messenger_connections: {
        Row: {
          id: string
          work_group_id: string
          platform: MessengerPlatform
          chat_id: string
          chat_title: string | null
          bot_status: BotStatus
          connected_at: string | null
          last_error: string | null
          created_at: string
        }
        Insert: {
          id?: string
          work_group_id: string
          platform: MessengerPlatform
          chat_id: string
          chat_title?: string | null
          bot_status?: BotStatus
          connected_at?: string | null
          last_error?: string | null
          created_at?: string
        }
        Update: {
          platform?: MessengerPlatform
          chat_id?: string
          chat_title?: string | null
          bot_status?: BotStatus
          connected_at?: string | null
          last_error?: string | null
        }
        Relationships: []
      }
      messenger_bot_channels: {
        Row: {
          id: string
          platform: MessengerPlatform
          external_chat_id: string
          title: string | null
          username: string | null
          chat_kind: MessengerChatKind
          is_active: boolean
          last_seen_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          platform: MessengerPlatform
          external_chat_id: string
          title?: string | null
          username?: string | null
          chat_kind?: MessengerChatKind
          is_active?: boolean
          last_seen_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string | null
          username?: string | null
          chat_kind?: MessengerChatKind
          is_active?: boolean
          last_seen_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          work_group_id: string
          source: MessageSource
          external_chat_id: string
          external_message_id: string
          author_name: string | null
          author_external_id: string | null
          text: string
          content_type: MessageContentType
          payload: Json
          sent_at: string
          delivery_status: DeliveryStatus
          created_at: string
        }
        Insert: {
          id?: string
          work_group_id: string
          source: MessageSource
          external_chat_id: string
          external_message_id: string
          author_name?: string | null
          author_external_id?: string | null
          text: string
          content_type?: MessageContentType
          payload?: Json
          sent_at: string
          delivery_status?: DeliveryStatus
          created_at?: string
        }
        Update: {
          delivery_status?: DeliveryStatus
          text?: string
          content_type?: MessageContentType
          payload?: Json
          author_name?: string | null
          author_external_id?: string | null
          external_chat_id?: string
          sent_at?: string
        }
        Relationships: []
      }
      message_relays: {
        Row: {
          id: string
          message_id: string
          target_platform: MessengerPlatform
          target_chat_id: string
          target_external_message_id: string | null
          status: RelayStatus
          relayed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          target_platform: MessengerPlatform
          target_chat_id: string
          target_external_message_id?: string | null
          status?: RelayStatus
          relayed_at?: string | null
          created_at?: string
        }
        Update: {
          target_external_message_id?: string | null
          status?: RelayStatus
          relayed_at?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          value: Json
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          key: string
          value?: Json
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          value?: Json
          description?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          user_id: string | null
          action: string
          entity_type: string
          entity_id: string | null
          payload: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          action: string
          entity_type: string
          entity_id?: string | null
          payload?: Json | null
          created_at?: string
        }
        Update: never
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      write_audit_log: {
        Args: {
          p_action: string
          p_entity_type: string
          p_entity_id?: string | null
          p_payload?: Json | null
        }
        Returns: Database['public']['Tables']['audit_log']['Row']
      }
      cast_vote: {
        Args: { p_poll_id: string; p_option_id: string }
        Returns: Database['public']['Tables']['poll_votes']['Row']
      }
      set_poll_levels: {
        Args: { p_poll_id: string; p_level_ids: string[] }
        Returns: null
      }
      replace_poll_options: {
        Args: { p_poll_id: string; p_texts: string[] }
        Returns: Database['public']['Tables']['poll_options']['Row'][]
      }
      get_poll_results: {
        Args: { p_poll_id: string }
        Returns: Json
      }
      list_poll_votes_admin: {
        Args: { p_poll_id: string }
        Returns: {
          id: string
          voted_at: string
          option_id: string
          option_text: string
          option_sort_order: number
          representative_id: string
          representative_name: string
          representative_email: string | null
          company_id: string
          company_name: string
        }[]
      }
      confirm_registration: {
        Args: {
          p_user_id: string
          p_representative_id?: string | null
          p_create_representative?: CreateRepresentativePayload | null
        }
        Returns: Database['public']['Tables']['users']['Row']
      }
      reject_registration: {
        Args: { p_user_id: string }
        Returns: Database['public']['Tables']['users']['Row']
      }
      set_user_status: {
        Args: {
          p_user_id: string
          p_status: Extract<UserStatus, 'confirmed' | 'blocked'>
        }
        Returns: Database['public']['Tables']['users']['Row']
      }
      admin_update_user: {
        Args: {
          p_user_id: string
          p_email?: string | null
          p_full_name?: string | null
          p_phone?: string | null
          p_status?: UserStatus | null
          p_role?: UserRole | null
          p_password?: string | null
          p_staff_position?: string | null
          p_is_ceo?: boolean | null
          p_can_manage_work_groups?: boolean | null
          p_company_name_hint?: string | null
          p_company_inn_hint?: string | null
        }
        Returns: Database['public']['Tables']['users']['Row']
      }
      admin_delete_user: {
        Args: { p_user_id: string }
        Returns: null
      }
      get_participation_level_usage: {
        Args: { p_level_id: string }
        Returns: Json
      }
      delete_participation_level: {
        Args: { p_level_id: string }
        Returns: null
      }
      reorder_participation_levels: {
        Args: { p_ordered_ids: string[] }
        Returns: Database['public']['Tables']['participation_levels']['Row'][]
      }
      get_work_group_category_usage: {
        Args: { p_category_id: string }
        Returns: Json
      }
      delete_work_group_category: {
        Args: { p_category_id: string }
        Returns: null
      }
      reorder_work_group_categories: {
        Args: { p_ordered_ids: string[] }
        Returns: Database['public']['Tables']['work_group_categories']['Row'][]
      }
      get_material_category_usage: {
        Args: { p_category_id: string }
        Returns: Json
      }
      delete_material_category: {
        Args: { p_category_id: string }
        Returns: null
      }
      reorder_material_categories: {
        Args: { p_ordered_ids: string[] }
        Returns: Database['public']['Tables']['material_categories']['Row'][]
      }
      reorder_company_products: {
        Args: { p_company_id: string; p_ordered_ids: string[] }
        Returns: Database['public']['Tables']['company_products']['Row'][]
      }
      review_company_product: {
        Args: {
          p_product_id: string
          p_approve: boolean
          p_note?: string | null
        }
        Returns: Database['public']['Tables']['company_products']['Row']
      }
      propose_product_category: {
        Args: { p_product_id: string; p_name: string }
        Returns: Database['public']['Tables']['product_category_suggestions']['Row']
      }
      review_product_category_suggestion: {
        Args: {
          p_suggestion_id: string
          p_approve: boolean
          p_category_id?: string | null
          p_note?: string | null
        }
        Returns: Database['public']['Tables']['product_category_suggestions']['Row']
      }
      review_material_section: {
        Args: {
          p_section_id: string
          p_approve: boolean
          p_note?: string | null
        }
        Returns: Database['public']['Tables']['material_sections']['Row']
      }
      review_material_category: {
        Args: {
          p_category_id: string
          p_approve: boolean
          p_note?: string | null
        }
        Returns: Database['public']['Tables']['material_categories']['Row']
      }
      get_product_category_usage: {
        Args: { p_category_id: string }
        Returns: Json
      }
      delete_product_category: {
        Args: { p_category_id: string }
        Returns: null
      }
      delete_okpd2_code: {
        Args: { p_id: string }
        Returns: null
      }
      delete_product_note: {
        Args: { p_id: string }
        Returns: null
      }
      reorder_product_categories: {
        Args: { p_ordered_ids: string[] }
        Returns: Database['public']['Tables']['product_categories']['Row'][]
      }
      set_primary_representative: {
        Args: { p_representative_id: string }
        Returns: Database['public']['Tables']['representatives']['Row']
      }
      upsert_representative: {
        Args: {
          p_id?: string | null
          p_company_id?: string | null
          p_full_name?: string | null
          p_position?: string | null
          p_phone?: string | null
          p_email?: string | null
          p_pd_consent?: boolean | null
          p_is_primary?: boolean | null
          p_is_active?: boolean | null
          p_telegram_username?: string | null
          p_max_username?: string | null
        }
        Returns: Database['public']['Tables']['representatives']['Row']
      }
      update_own_member_profile: {
        Args: {
          p_full_name: string
          p_position?: string | null
          p_phone?: string | null
          p_telegram_username?: string | null
          p_max_username?: string | null
          p_show_contacts_to_members?: boolean
        }
        Returns: Database['public']['Tables']['users']['Row']
      }
      list_member_assign_candidates: {
        Args: {
          p_company_id: string
          p_search?: string | null
        }
        Returns: {
          user_id: string
          email: string
          full_name: string | null
          status: UserStatus
          user_role: UserRole
          representative_id: string | null
          current_company_id: string | null
          current_company_name: string | null
        }[]
      }
      assign_member_to_company: {
        Args: {
          p_user_id: string
          p_company_id: string
          p_is_primary?: boolean
          p_position?: string | null
        }
        Returns: Database['public']['Tables']['representatives']['Row']
      }
      reorder_material_sections: {
        Args: { p_ordered_ids: string[] }
        Returns: Database['public']['Tables']['material_sections']['Row'][]
      }
      reorder_material_documents: {
        Args: { p_section_id: string; p_ordered_ids: string[] }
        Returns: Database['public']['Tables']['material_documents']['Row'][]
      }
      set_material_section_levels: {
        Args: { p_section_id: string; p_level_ids: string[] }
        Returns: null
      }
      bulk_set_material_section_levels: {
        Args: {
          p_section_ids: string[]
          p_level_ids: string[]
          p_mode?: string
        }
        Returns: number
      }
      bulk_add_work_group_members: {
        Args: {
          p_work_group_id: string
          p_representative_ids: string[]
          p_added_by?: string | null
        }
        Returns: number
      }
      reorder_work_group_links: {
        Args: { p_work_group_id: string; p_ordered_ids: string[] }
        Returns: Database['public']['Tables']['work_group_links']['Row'][]
      }
      list_association_directory: {
        Args: Record<string, never>
        Returns: Json
      }
      list_staff_users: {
        Args: Record<string, never>
        Returns: {
          id: string
          email: string
          full_name: string | null
          status: UserStatus
          staff_position: string | null
          is_ceo: boolean
          can_manage_work_groups: boolean
          created_at: string
          representative_id: string | null
          company_id: string | null
          company_name: string | null
          company_position: string | null
          is_primary: boolean
        }[]
      }
      promote_to_staff: {
        Args: {
          p_user_id: string
          p_staff_position?: string | null
          p_is_ceo?: boolean
          p_can_manage_work_groups?: boolean
        }
        Returns: Database['public']['Tables']['users']['Row']
      }
      update_staff_profile: {
        Args: {
          p_user_id: string
          p_full_name?: string | null
          p_staff_position?: string | null
          p_is_ceo?: boolean | null
          p_can_manage_work_groups?: boolean | null
        }
        Returns: Database['public']['Tables']['users']['Row']
      }
      set_staff_status: {
        Args: {
          p_user_id: string
          p_status: Extract<UserStatus, 'confirmed' | 'blocked'>
        }
        Returns: Database['public']['Tables']['users']['Row']
      }
      demote_from_staff: {
        Args: {
          p_user_id: string
          p_company_id?: string | null
          p_position?: string | null
          p_is_primary?: boolean
        }
        Returns: Database['public']['Tables']['users']['Row']
      }
      bind_staff_to_company: {
        Args: {
          p_user_id: string
          p_company_id: string
          p_position?: string | null
          p_is_primary?: boolean
        }
        Returns: Database['public']['Tables']['users']['Row']
      }
      unbind_staff_from_company: {
        Args: { p_user_id: string }
        Returns: Database['public']['Tables']['users']['Row']
      }
      remove_representative_from_company: {
        Args: { p_representative_id: string }
        Returns: {
          company_id: string
          company_name: string
          full_name: string
          linked_user_id: string | null
        }[]
      }
      get_cabinet_poll_access_hint: {
        Args: Record<string, never>
        Returns: Json
      }
      list_cabinet_work_groups: {
        Args: Record<string, never>
        Returns: {
          id: string
          name: string
          description: string | null
          status: WorkGroupStatus
          category_id: string | null
          category_name: string | null
          is_member: boolean
          is_responsible: boolean
          joined_at: string | null
          pending_request_id: string | null
          pending_request_kind: WorkGroupMembershipRequestKind | null
          pending_request_at: string | null
        }[]
      }
      is_work_group_responsible: {
        Args: { p_work_group_id: string }
        Returns: boolean
      }
      get_cabinet_resource_access: {
        Args: Record<string, never>
        Returns: {
          resource:
            | 'directory'
            | 'products'
            | 'materials'
            | 'polls'
            | 'work_groups'
            | 'invoices'
          visible: boolean
          has_content: boolean
        }[]
      }
      get_participation_level_resource_access: {
        Args: { p_level_id: string }
        Returns: Json
      }
      set_participation_level_resource_access: {
        Args: { p_level_id: string; p_rows: Json }
        Returns: Json
      }
      request_work_group_membership: {
        Args: {
          p_work_group_id: string
          p_kind: WorkGroupMembershipRequestKind
        }
        Returns: Database['public']['Tables']['work_group_membership_requests']['Row']
      }
      review_work_group_membership_request: {
        Args: {
          p_request_id: string
          p_approve: boolean
          p_note?: string | null
        }
        Returns: Database['public']['Tables']['work_group_membership_requests']['Row']
      }
      set_invoice_status: {
        Args: {
          p_invoice_id: string
          p_status: InvoiceStatus
        }
        Returns: Database['public']['Tables']['invoices']['Row']
      }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: Database['public']['Tables']['notifications']['Row']
      }
      mark_all_notifications_read: {
        Args: Record<string, never>
        Returns: number
      }
      mark_notifications_read_by_types: {
        Args: { p_types: NotificationType[] }
        Returns: number
      }
      set_own_email_notifications: {
        Args: { p_enabled: boolean }
        Returns: Database['public']['Tables']['users']['Row']
      }
      import_companies: {
        Args: { p_rows: Json }
        Returns: Json
      }
    }
    Enums: {
      user_role: UserRole
      user_status: UserStatus
      company_access_status: CompanyAccessStatus
      work_group_status: WorkGroupStatus
      vote_mode: VoteMode
      poll_status: PollStatus
      messenger_platform: MessengerPlatform
      bot_status: BotStatus
      message_source: MessageSource
      delivery_status: DeliveryStatus
      relay_status: RelayStatus
      messenger_chat_kind: MessengerChatKind
      message_content_type: MessageContentType
      notification_type: NotificationType
    }
    CompositeTypes: Record<string, never>
  }
}

export type PublicTables = Database['public']['Tables']
export type TableName = keyof PublicTables
export type TableRow<T extends TableName> = PublicTables[T]['Row']
export type TableInsert<T extends TableName> = PublicTables[T]['Insert']
export type TableUpdate<T extends TableName> = PublicTables[T]['Update']
export type RpcName = keyof Database['public']['Functions']
export type RpcArgs<T extends RpcName> = Database['public']['Functions'][T]['Args']
export type RpcReturns<T extends RpcName> = Database['public']['Functions'][T]['Returns']
