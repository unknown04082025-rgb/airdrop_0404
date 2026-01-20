import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type User = {
  id: string
  email: string
  username: string
  created_at: string
}

export type DevicePair = {
  id: string
  user_id: string
  device_name: string
  device_id: string
  is_online: boolean
  last_seen: string
  created_at: string
  os_name?: string
  os_version?: string
  browser_name?: string
  browser_version?: string
  location_city?: string
  location_country?: string
  ip_address?: string
  browser_fingerprint?: string
  screen_resolution?: string
  color_depth?: number
  timezone?: string
  language?: string
}

export type AccessRequest = {
  id: string
  requester_device_id: string
  target_device_id: string
  status: 'pending' | 'approved' | 'rejected'
  request_type: 'file_access' | 'screen_share'
  created_at: string
  responded_at: string | null
}

export type SharedFile = {
  id: string
  owner_device_id: string
  file_name: string
  file_path: string
  file_size: number
  file_type: string | null
  is_directory: boolean
  parent_path: string | null
  created_at: string
}

export type ScreenSession = {
  id: string
  host_device_id: string
  viewer_device_id: string
  status: 'active' | 'ended'
  started_at: string
  ended_at: string | null
}
