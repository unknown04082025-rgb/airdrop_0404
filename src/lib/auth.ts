import { supabase, User } from './supabase'
import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function signUp(email: string, username: string, password: string): Promise<{ user: User | null; error: string | null }> {
  try {
    const passwordHash = await hashPassword(password)
    
    const { data, error } = await supabase
      .from('users')
      .insert([{ email, username, password_hash: passwordHash }])
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        if (error.message.includes('email')) {
          return { user: null, error: 'Email already exists' }
        }
        if (error.message.includes('username')) {
          return { user: null, error: 'Username already exists' }
        }
      }
      return { user: null, error: error.message }
    }

    return { user: data, error: null }
  } catch (err) {
    return { user: null, error: 'An unexpected error occurred' }
  }
}

export async function signIn(username: string, password: string): Promise<{ user: User | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single()

    if (error || !data) {
      return { user: null, error: 'Invalid credentials' }
    }

    const isValid = await verifyPassword(password, data.password_hash)
    
    if (!isValid) {
      return { user: null, error: 'Invalid credentials' }
    }

    return { user: data, error: null }
  } catch (err) {
    return { user: null, error: 'An unexpected error occurred' }
  }
}

export function generateDeviceId(): string {
  const timestamp = Date.now().toString(36)
  const randomPart = Math.random().toString(36).substring(2, 15)
  return `${timestamp}-${randomPart}`
}

export function getDeviceInfo(): { osName: string; osVersion: string; browserName: string; browserVersion: string } {
  if (typeof window === 'undefined') {
    return { osName: 'Unknown', osVersion: '', browserName: 'Unknown', browserVersion: '' }
  }

  const ua = navigator.userAgent
  let osName = 'Unknown'
  let osVersion = ''
  let browserName = 'Unknown'
  let browserVersion = ''

  if (ua.includes('Windows NT 10')) { osName = 'Windows'; osVersion = '10/11' }
  else if (ua.includes('Windows NT 6.3')) { osName = 'Windows'; osVersion = '8.1' }
  else if (ua.includes('Windows NT 6.2')) { osName = 'Windows'; osVersion = '8' }
  else if (ua.includes('Windows NT 6.1')) { osName = 'Windows'; osVersion = '7' }
  else if (ua.includes('Mac OS X')) { 
    osName = 'macOS'
    const match = ua.match(/Mac OS X (\d+[._]\d+[._]?\d*)/)
    if (match) osVersion = match[1].replace(/_/g, '.')
  }
  else if (ua.includes('Linux')) { osName = 'Linux'; osVersion = '' }
  else if (ua.includes('Android')) { 
    osName = 'Android'
    const match = ua.match(/Android (\d+\.?\d*)/)
    if (match) osVersion = match[1]
  }
  else if (ua.includes('iPhone') || ua.includes('iPad')) { 
    osName = 'iOS'
    const match = ua.match(/OS (\d+_\d+)/)
    if (match) osVersion = match[1].replace('_', '.')
  }

  if (ua.includes('Edg/')) {
    browserName = 'Edge'
    const match = ua.match(/Edg\/(\d+\.?\d*)/)
    if (match) browserVersion = match[1]
  }
  else if (ua.includes('Chrome/') && !ua.includes('Chromium')) {
    browserName = 'Chrome'
    const match = ua.match(/Chrome\/(\d+\.?\d*)/)
    if (match) browserVersion = match[1]
  }
  else if (ua.includes('Firefox/')) {
    browserName = 'Firefox'
    const match = ua.match(/Firefox\/(\d+\.?\d*)/)
    if (match) browserVersion = match[1]
  }
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    browserName = 'Safari'
    const match = ua.match(/Version\/(\d+\.?\d*)/)
    if (match) browserVersion = match[1]
  }

  return { osName, osVersion, browserName, browserVersion }
}

export async function getLocationInfo(): Promise<{ city: string; country: string; ip: string }> {
  try {
    const response = await fetch('/api/device-info')
    const data = await response.json()
    return {
      city: data.city || 'Unknown',
      country: data.country || 'Unknown',
      ip: data.ip || 'Unknown'
    }
  } catch {
    return { city: 'Unknown', country: 'Unknown', ip: 'Unknown' }
  }
}

function generateBrowserFingerprint(): string {
  if (typeof window === 'undefined') return ''
  
  const { osName, browserName } = getDeviceInfo()
  const screenRes = `${window.screen.width}x${window.screen.height}`
  const colorDepth = window.screen.colorDepth
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const language = navigator.language
  
  const fingerprint = `${osName}-${browserName}-${screenRes}-${colorDepth}-${timezone}-${language}`
  return fingerprint
}

export async function registerDevice(userId: string, deviceName: string): Promise<{ device: { id: string; device_id: string } | null; error: string | null }> {
  try {
    const { osName, osVersion, browserName, browserVersion } = getDeviceInfo()
    const browserFingerprint = generateBrowserFingerprint()
    
    const { data: existingDevices } = await supabase
      .from('device_pairs')
      .select('*')
      .eq('user_id', userId)
    
    if (existingDevices && existingDevices.length > 0) {
      const matchingDevice = existingDevices.find(d => {
        const deviceFingerprint = `${d.os_name}-${d.browser_name}-${d.screen_resolution || ''}-${d.color_depth || ''}-${d.timezone || ''}-${d.language || ''}`
        return deviceFingerprint === browserFingerprint || 
               (d.os_name === osName && d.browser_name === browserName && d.browser_fingerprint === browserFingerprint)
      })
      
      if (matchingDevice) {
        const { city, country, ip } = await getLocationInfo()
        
        const { data, error } = await supabase
          .from('device_pairs')
          .update({
            is_online: true,
            last_seen: new Date().toISOString(),
            os_version: osVersion,
            browser_version: browserVersion,
            location_city: city,
            location_country: country,
            ip_address: ip,
            browser_fingerprint: browserFingerprint
          })
          .eq('id', matchingDevice.id)
          .select()
          .single()
        
        if (error) {
          return { device: null, error: error.message }
        }
        
        return { device: data, error: null }
      }
    }
    
    const deviceId = generateDeviceId()
    const { city, country, ip } = await getLocationInfo()
    const screenRes = typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : ''
    const colorDepth = typeof window !== 'undefined' ? window.screen.colorDepth : 0
    const timezone = typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : ''
    const language = typeof navigator !== 'undefined' ? navigator.language : ''
    
    const { data, error } = await supabase
      .from('device_pairs')
      .insert([{ 
        user_id: userId, 
        device_name: deviceName, 
        device_id: deviceId, 
        is_online: true,
        os_name: osName,
        os_version: osVersion,
        browser_name: browserName,
        browser_version: browserVersion,
        location_city: city,
        location_country: country,
        ip_address: ip,
        browser_fingerprint: browserFingerprint,
        screen_resolution: screenRes,
        color_depth: colorDepth,
        timezone: timezone,
        language: language
      }])
      .select()
      .single()

    if (error) {
      return { device: null, error: error.message }
    }

    return { device: data, error: null }
  } catch (err) {
    return { device: null, error: 'Failed to register device' }
  }
}

export async function getUserDevices(userId: string) {
  const { data, error } = await supabase
    .from('device_pairs')
    .select('*')
    .eq('user_id', userId)

  if (error) {
    return { devices: [], error: error.message }
  }

  return { devices: data || [], error: null }
}
