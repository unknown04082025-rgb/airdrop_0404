"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { User, DevicePair, supabase } from './supabase'
import { getDeviceInfo, getLocationInfo } from './auth'

interface AuthContextType {
  user: User | null
  device: DevicePair | null
  setUser: (user: User | null) => void
  setDevice: (device: DevicePair | null) => void
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [device, setDevice] = useState<DevicePair | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const updateDeviceInfo = async (deviceId: string) => {
    const { osName, osVersion, browserName, browserVersion } = getDeviceInfo()
    const { city, country, ip } = await getLocationInfo()
    
    const { data, error } = await supabase
      .from('device_pairs')
      .update({
        os_name: osName,
        os_version: osVersion,
        browser_name: browserName,
        browser_version: browserVersion,
        location_city: city,
        location_country: country,
        ip_address: ip,
        is_online: true,
        last_seen: new Date().toISOString()
      })
      .eq('id', deviceId)
      .select()
      .single()
    
    if (data && !error) {
      setDevice(data)
      localStorage.setItem('remoteAccess_device', JSON.stringify(data))
    }
  }

  useEffect(() => {
    const storedUser = localStorage.getItem('remoteAccess_user')
    const storedDevice = localStorage.getItem('remoteAccess_device')
    
    if (storedUser) {
      setUser(JSON.parse(storedUser))
    }
    if (storedDevice) {
      const parsedDevice = JSON.parse(storedDevice)
      setDevice(parsedDevice)
      updateDeviceInfo(parsedDevice.id)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    if (user) {
      localStorage.setItem('remoteAccess_user', JSON.stringify(user))
    } else {
      localStorage.removeItem('remoteAccess_user')
    }
  }, [user])

  useEffect(() => {
    if (device) {
      localStorage.setItem('remoteAccess_device', JSON.stringify(device))
    } else {
      localStorage.removeItem('remoteAccess_device')
    }
  }, [device])

  const logout = () => {
    setUser(null)
    setDevice(null)
    localStorage.removeItem('remoteAccess_user')
    localStorage.removeItem('remoteAccess_device')
  }

  return (
    <AuthContext.Provider value={{ user, device, setUser, setDevice, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
