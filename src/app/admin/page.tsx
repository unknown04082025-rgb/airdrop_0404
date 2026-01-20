"use client"

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Shield, Lock, Users, Trash2, Search, 
  Laptop, Smartphone, MapPin, Globe, 
  ChevronDown, ChevronUp, AlertTriangle,
  Eye, EyeOff, LogOut
} from 'lucide-react'
import { supabase, DevicePair, User } from '@/lib/supabase'

const ADMIN_PASSWORD = 'Ruhi@#$%090525'

type UserWithDevices = User & {
  devices: DevicePair[]
}

const getOsIcon = (osName?: string) => {
  if (!osName) return '💻'
  const os = osName.toLowerCase()
  if (os.includes('windows')) return '🪟'
  if (os.includes('mac')) return '🍎'
  if (os.includes('linux')) return '🐧'
  if (os.includes('android')) return '🤖'
  if (os.includes('ios')) return '📱'
  return '💻'
}

const getBrowserIcon = (browserName?: string) => {
  if (!browserName) return '🌐'
  const browser = browserName.toLowerCase()
  if (browser.includes('chrome')) return '🔵'
  if (browser.includes('firefox')) return '🦊'
  if (browser.includes('safari')) return '🧭'
  if (browser.includes('edge')) return '🔷'
  return '🌐'
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [users, setUsers] = useState<UserWithDevices[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set())
  const [deletingDevice, setDeletingDevice] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ userId: string; deviceId: string } | null>(null)

  useEffect(() => {
    if (isAuthenticated) {
      fetchUsersWithDevices()
    }
  }, [isAuthenticated])

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true)
      setError('')
    } else {
      setError('Invalid password')
    }
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    setPassword('')
    setUsers([])
  }

  const fetchUsersWithDevices = async () => {
    setLoading(true)
    try {
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })

      if (usersError) throw usersError

      const { data: devicesData, error: devicesError } = await supabase
        .from('device_pairs')
        .select('*')
        .order('created_at', { ascending: false })

      if (devicesError) throw devicesError

      const usersWithDevices: UserWithDevices[] = (usersData || []).map(user => ({
        ...user,
        devices: (devicesData || []).filter(device => device.user_id === user.id)
      }))

      setUsers(usersWithDevices)
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteDevice = async (deviceId: string) => {
    setDeletingDevice(deviceId)
    try {
      await supabase.from('access_requests').delete().or(`requester_device_id.eq.${deviceId},target_device_id.eq.${deviceId}`)
      await supabase.from('shared_files').delete().eq('owner_device_id', deviceId)
      await supabase.from('screen_sessions').delete().or(`host_device_id.eq.${deviceId},viewer_device_id.eq.${deviceId}`)
      
      const { error } = await supabase
        .from('device_pairs')
        .delete()
        .eq('id', deviceId)

      if (error) throw error

      setUsers(prev => prev.map(user => ({
        ...user,
        devices: user.devices.filter(d => d.id !== deviceId)
      })))
      
      setConfirmDelete(null)
    } catch (err) {
      console.error('Error deleting device:', err)
    } finally {
      setDeletingDevice(null)
    }
  }

  const toggleUserExpand = (userId: string) => {
    setExpandedUsers(prev => {
      const newSet = new Set(prev)
      if (newSet.has(userId)) {
        newSet.delete(userId)
      } else {
        newSet.add(userId)
      }
      return newSet
    })
  }

  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.devices.some(d => d.device_name.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] cyber-grid flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <div className="glass-panel rounded-3xl p-8 border border-[#2a2a3a]">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#ff073a] to-[#b829dd] p-[2px]">
                <div className="w-full h-full rounded-2xl bg-[#0a0a0f] flex items-center justify-center">
                  <Shield className="w-8 h-8 text-[#ff073a]" />
                </div>
              </div>
            </div>
            
            <h1 className="text-2xl font-bold text-white text-center mb-2">Admin Access</h1>
            <p className="text-[#8888a0] text-center mb-8">Enter admin password to continue</p>

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5a5a70]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Admin Password"
                  className="w-full bg-[#12121a] border border-[#2a2a3a] rounded-xl pl-12 pr-12 py-4 text-white placeholder-[#5a5a70] focus:outline-none focus:border-[#ff073a] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5a5a70] hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[#ff073a] text-sm text-center"
                >
                  {error}
                </motion.p>
              )}

              <button
                type="submit"
                className="w-full py-4 rounded-xl bg-gradient-to-r from-[#ff073a] to-[#b829dd] text-white font-semibold hover:opacity-90 transition-opacity"
              >
                Access Admin Panel
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] cyber-grid">
      <nav className="fixed top-0 left-0 right-0 h-16 glass-panel border-b border-[#2a2a3a] z-50">
        <div className="h-full max-w-[1400px] mx-auto px-4 md:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ff073a] to-[#b829dd] p-[2px]">
              <div className="w-full h-full rounded-xl bg-[#0a0a0f] flex items-center justify-center">
                <Shield className="w-5 h-5 text-[#ff073a]" />
              </div>
            </div>
            <span className="text-lg font-semibold text-white">Admin Panel</span>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-[#1a1a24] transition-colors text-[#8888a0] hover:text-[#ff073a]"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </nav>

      <main className="pt-24 pb-8 px-4 md:px-6 max-w-[1400px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">User Management</h1>
            <p className="text-[#8888a0]">Manage all users and their devices</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="glass-panel rounded-xl px-4 py-2 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#00f0ff]" />
              <span className="text-white font-semibold">{users.length}</span>
              <span className="text-[#8888a0] text-sm">Users</span>
            </div>
            <div className="glass-panel rounded-xl px-4 py-2 flex items-center gap-2">
              <Laptop className="w-5 h-5 text-[#39ff14]" />
              <span className="text-white font-semibold">{users.reduce((acc, u) => acc + u.devices.length, 0)}</span>
              <span className="text-[#8888a0] text-sm">Devices</span>
            </div>
          </div>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5a5a70]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users, emails, or devices..."
            className="w-full bg-[#12121a] border border-[#2a2a3a] rounded-xl pl-12 pr-4 py-3 text-white placeholder-[#5a5a70] focus:outline-none focus:border-[#00f0ff] transition-colors"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#ff073a] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {filteredUsers.length === 0 ? (
              <div className="glass-panel rounded-2xl p-8 text-center">
                <Users className="w-12 h-12 text-[#5a5a70] mx-auto mb-4" />
                <p className="text-[#8888a0]">No users found</p>
              </div>
            ) : (
              filteredUsers.map(user => (
                <motion.div
                  key={user.id}
                  layout
                  className="glass-panel rounded-2xl border border-[#2a2a3a] overflow-hidden"
                >
                  <div
                    onClick={() => toggleUserExpand(user.id)}
                    className="p-4 md:p-6 cursor-pointer hover:bg-[#1a1a24]/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#00f0ff] to-[#b829dd] flex items-center justify-center">
                          <span className="text-lg font-bold text-white">{user.username[0].toUpperCase()}</span>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">{user.username}</h3>
                          <p className="text-sm text-[#8888a0]">{user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex items-center gap-2 text-sm">
                          <Laptop className="w-4 h-4 text-[#5a5a70]" />
                          <span className="text-[#8888a0]">{user.devices.length} device{user.devices.length !== 1 ? 's' : ''}</span>
                        </div>
                        {expandedUsers.has(user.id) ? (
                          <ChevronUp className="w-5 h-5 text-[#8888a0]" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-[#8888a0]" />
                        )}
                      </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {expandedUsers.has(user.id) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 md:px-6 pb-4 md:pb-6 border-t border-[#2a2a3a] pt-4">
                          <h4 className="text-sm font-semibold text-[#5a5a70] uppercase tracking-wider mb-4">
                            Connected Devices
                          </h4>
                          
                          {user.devices.length === 0 ? (
                            <p className="text-[#8888a0] text-sm">No devices connected</p>
                          ) : (
                            <div className="grid gap-3">
                              {user.devices.map(device => (
                                <div
                                  key={device.id}
                                  className="bg-[#0f0f16] rounded-xl p-4 border border-[#2a2a3a]"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                      {device.device_name.toLowerCase().includes('phone') || device.device_name.toLowerCase().includes('mobile') ? (
                                        <Smartphone className="w-5 h-5 text-[#8888a0] mt-0.5 flex-shrink-0" />
                                      ) : (
                                        <Laptop className="w-5 h-5 text-[#8888a0] mt-0.5 flex-shrink-0" />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                          <p className="font-medium text-white truncate">{device.device_name}</p>
                                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${device.is_online ? 'bg-[#39ff14]' : 'bg-[#5a5a70]'}`} />
                                        </div>
                                        
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                          <div className="flex items-center gap-2">
                                            <span className="text-base">{getOsIcon(device.os_name)}</span>
                                            <span className="text-[#8888a0]">{device.os_name || 'Unknown'} {device.os_version || ''}</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="text-base">{getBrowserIcon(device.browser_name)}</span>
                                            <span className="text-[#8888a0]">{device.browser_name || 'Unknown'}</span>
                                          </div>
                                          {device.location_city && (
                                            <div className="flex items-center gap-2">
                                              <MapPin className="w-3 h-3 text-[#ff6b35]" />
                                              <span className="text-[#8888a0]">
                                                {device.location_city !== 'Unknown' ? `${device.location_city}, ` : ''}{device.location_country || 'Unknown'}
                                              </span>
                                            </div>
                                          )}
                                          {device.ip_address && device.ip_address !== 'Unknown' && (
                                            <div className="flex items-center gap-2">
                                              <Globe className="w-3 h-3 text-[#00f0ff]" />
                                              <span className="text-[#8888a0] font-mono">{device.ip_address}</span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setConfirmDelete({ userId: user.id, deviceId: device.id })
                                      }}
                                      disabled={deletingDevice === device.id}
                                      className="p-2 rounded-lg hover:bg-[#ff073a]/20 text-[#8888a0] hover:text-[#ff073a] transition-colors disabled:opacity-50 flex-shrink-0"
                                    >
                                      {deletingDevice === device.id ? (
                                        <div className="w-5 h-5 border-2 border-[#ff073a] border-t-transparent rounded-full animate-spin" />
                                      ) : (
                                        <Trash2 className="w-5 h-5" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))
            )}
          </div>
        )}
      </main>

      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-panel rounded-2xl p-6 max-w-md w-full border border-[#2a2a3a]"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-[#ff073a]/20 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-[#ff073a]" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Delete Device?</h3>
                  <p className="text-sm text-[#8888a0]">This action cannot be undone</p>
                </div>
              </div>
              
              <p className="text-[#8888a0] mb-6">
                This will permanently remove the device and all associated data including access requests, shared files, and screen sessions.
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-3 rounded-xl border border-[#2a2a3a] text-white font-medium hover:bg-[#1a1a24] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteDevice(confirmDelete.deviceId)}
                  disabled={deletingDevice === confirmDelete.deviceId}
                  className="flex-1 py-3 rounded-xl bg-[#ff073a] text-white font-medium hover:bg-[#ff073a]/80 transition-colors disabled:opacity-50"
                >
                  {deletingDevice === confirmDelete.deviceId ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
