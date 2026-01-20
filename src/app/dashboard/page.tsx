"use client"

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Shield, Folder, LogOut, Bell, 
  ChevronRight, Circle, Laptop, Smartphone,
  HardDrive, Users, Activity, Lock, Menu, X,
  MapPin, Globe, Check, Clock, MessageSquare,
  Send, Clipboard, Camera, Video, Mic, QrCode, Gamepad2
} from 'lucide-react'
import { useAuth, AuthProvider } from '@/lib/auth-context'
import { supabase, DevicePair, AccessRequest } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { FileAccess } from '@/components/file-access'
import { ClipboardSync } from '@/components/clipboard-sync'
import { RemoteCamera } from '@/components/remote-camera'
import { Games } from '@/components/games'

type Section = 'overview' | 'files' | 'clipboard' | 'camera' | 'games'

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

type RequestWithDevice = AccessRequest & {
  requester_device?: DevicePair
}

function DashboardContent() {
  const [activeSection, setActiveSection] = useState<Section>('overview')
  const [devices, setDevices] = useState<DevicePair[]>([])
  const [pendingRequests, setPendingRequests] = useState<RequestWithDevice[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const notificationRef = useRef<HTMLDivElement>(null)
  const { user, device, logout, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/')
    }
  }, [user, isLoading, router])

  useEffect(() => {
    if (user) {
      fetchDevices()
      fetchPendingRequests()
    }
  }, [user])

  useEffect(() => {
    if (!device) return

    const channel = supabase
      .channel(`dashboard-requests-${device.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'access_requests',
          filter: `target_device_id=eq.${device.id}`
        },
        () => {
          fetchPendingRequests()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [device])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchDevices = async () => {
    if (!user) return
    const { data } = await supabase
      .from('device_pairs')
      .select('*')
      .eq('user_id', user.id)
    
    if (data) setDevices(data)
  }

  const fetchPendingRequests = async () => {
    if (!device) return
    const { data: requests } = await supabase
      .from('access_requests')
      .select('*')
      .eq('target_device_id', device.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    
    if (requests && requests.length > 0) {
      const deviceIds = [...new Set(requests.map(r => r.requester_device_id))]
      const { data: deviceData } = await supabase
        .from('device_pairs')
        .select('*')
        .in('id', deviceIds)
      
      const requestsWithDevices: RequestWithDevice[] = requests.map(r => ({
        ...r,
        requester_device: deviceData?.find(d => d.id === r.requester_device_id)
      }))
      setPendingRequests(requestsWithDevices)
    } else {
      setPendingRequests([])
    }
  }

  const handleApproveRequest = async (requestId: string) => {
    await supabase
      .from('access_requests')
      .update({ status: 'approved' })
      .eq('id', requestId)
    fetchPendingRequests()
  }

  const handleDenyRequest = async (requestId: string) => {
    await supabase
      .from('access_requests')
      .update({ status: 'denied' })
      .eq('id', requestId)
    fetchPendingRequests()
  }

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  const handleSectionChange = (section: Section) => {
    setActiveSection(section)
    setSidebarOpen(false)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00f0ff] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-[#0a0a0f] cyber-grid">
      <nav className="fixed top-0 left-0 right-0 h-16 glass-panel border-b border-[#2a2a3a] z-50">
        <div className="h-full max-w-[1600px] mx-auto px-4 md:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-[#1a1a24] transition-colors text-[#8888a0] hover:text-white"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00f0ff] to-[#b829dd] p-[2px]">
              <div className="w-full h-full rounded-xl bg-[#0a0a0f] flex items-center justify-center">
                <Shield className="w-5 h-5 text-[#00f0ff]" />
              </div>
            </div>
            <span className="text-lg font-semibold text-white hidden sm:block">SecureLink</span>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="relative" ref={notificationRef}>
              <button 
                onClick={() => setNotificationOpen(!notificationOpen)}
                className="relative p-2 rounded-lg hover:bg-[#1a1a24] transition-colors"
              >
                <Bell className="w-5 h-5 text-[#8888a0]" />
                {pendingRequests.length > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-[#ff073a] rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                    {pendingRequests.length}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {notificationOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-80 sm:w-96 glass-panel rounded-2xl border border-[#2a2a3a] shadow-2xl overflow-hidden z-50"
                  >
                    <div className="p-4 border-b border-[#2a2a3a]">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-white">Notifications</h3>
                        {pendingRequests.length > 0 && (
                          <span className="text-xs text-[#ff6b35] bg-[#ff6b35]/10 px-2 py-1 rounded-full">
                            {pendingRequests.length} pending
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="max-h-80 overflow-y-auto custom-scrollbar">
                      {pendingRequests.length === 0 ? (
                        <div className="p-8 text-center">
                          <Bell className="w-10 h-10 text-[#5a5a70] mx-auto mb-3" />
                          <p className="text-[#8888a0] text-sm">No pending requests</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-[#2a2a3a]">
                          {pendingRequests.map((request) => (
                            <div key={request.id} className="p-4 hover:bg-[#1a1a24]/50 transition-colors">
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#ff6b35] to-[#ff073a] flex items-center justify-center flex-shrink-0">
                                  <Folder className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-white font-medium">
                                    {request.request_type === 'file_access' ? 'File Access Request' : 
                                     request.request_type === 'clipboard_sync' ? 'Clipboard Sync Request' :
                                     request.request_type === 'camera_access' ? 'Camera Access Request' :
                                     'Access Request'}
                                  </p>
                                  <p className="text-xs text-[#8888a0] mt-0.5">
                                    From: {request.requester_device?.device_name || 'Unknown Device'}
                                  </p>
                                  <div className="flex items-center gap-1 mt-1 text-xs text-[#5a5a70]">
                                    <Clock className="w-3 h-3" />
                                    <span>{new Date(request.created_at).toLocaleString()}</span>
                                  </div>
                                  
                                  <div className="flex gap-2 mt-3">
                                    <button
                                      onClick={() => handleApproveRequest(request.id)}
                                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#39ff14]/20 text-[#39ff14] text-xs font-medium hover:bg-[#39ff14]/30 transition-colors"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => handleDenyRequest(request.id)}
                                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ff073a]/20 text-[#ff073a] text-xs font-medium hover:bg-[#ff073a]/30 transition-colors"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                      Deny
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="h-8 w-px bg-[#2a2a3a] hidden sm:block" />
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-white">{user.username}</p>
                <p className="text-xs text-[#8888a0]">{device?.device_name || 'Unknown Device'}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00f0ff] to-[#b829dd] flex items-center justify-center">
                <span className="text-sm font-bold text-white">{user.username[0].toUpperCase()}</span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-[#1a1a24] transition-colors text-[#8888a0] hover:text-[#ff073a]"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 w-72 glass-panel border-r border-[#2a2a3a] p-4 z-50 overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00f0ff] to-[#b829dd] p-[2px]">
                    <div className="w-full h-full rounded-xl bg-[#0a0a0f] flex items-center justify-center">
                      <Shield className="w-5 h-5 text-[#00f0ff]" />
                    </div>
                  </div>
                  <span className="text-lg font-semibold text-white">SecureLink</span>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-2 rounded-lg hover:bg-[#1a1a24] transition-colors text-[#8888a0] hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => handleSectionChange('overview')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    activeSection === 'overview'
                      ? 'bg-gradient-to-r from-[#00f0ff]/20 to-transparent border-l-2 border-[#00f0ff] text-white'
                      : 'text-[#8888a0] hover:bg-[#1a1a24] hover:text-white'
                  }`}
                >
                  <Activity className="w-5 h-5" />
                  <span className="font-medium">Overview</span>
                </button>

                <button
                  onClick={() => handleSectionChange('files')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    activeSection === 'files'
                      ? 'bg-gradient-to-r from-[#39ff14]/20 to-transparent border-l-2 border-[#39ff14] text-white'
                      : 'text-[#8888a0] hover:bg-[#1a1a24] hover:text-white'
                  }`}
                >
                  <Folder className="w-5 h-5" />
                  <span className="font-medium">File Access</span>
                </button>

                <button
                  onClick={() => handleSectionChange('clipboard')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    activeSection === 'clipboard'
                      ? 'bg-gradient-to-r from-[#ff6b35]/20 to-transparent border-l-2 border-[#ff6b35] text-white'
                      : 'text-[#8888a0] hover:bg-[#1a1a24] hover:text-white'
                  }`}
                >
                  <Clipboard className="w-5 h-5" />
                  <span className="font-medium">Clipboard Sync</span>
                </button>

<button
                    onClick={() => handleSectionChange('camera')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                      activeSection === 'camera'
                        ? 'bg-gradient-to-r from-[#b829dd]/20 to-transparent border-l-2 border-[#b829dd] text-white'
                        : 'text-[#8888a0] hover:bg-[#1a1a24] hover:text-white'
                    }`}
                  >
                    <Camera className="w-5 h-5" />
                    <span className="font-medium">Remote Camera</span>
                  </button>

                  <button
                    onClick={() => handleSectionChange('games')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                      activeSection === 'games'
                        ? 'bg-gradient-to-r from-[#ffd700]/20 to-transparent border-l-2 border-[#ffd700] text-white'
                        : 'text-[#8888a0] hover:bg-[#1a1a24] hover:text-white'
                    }`}
                  >
                    <Gamepad2 className="w-5 h-5" />
                    <span className="font-medium">Games</span>
                  </button>
                </div>

              <div className="mt-8 pt-8 border-t border-[#2a2a3a]">
                <h3 className="text-xs font-semibold text-[#5a5a70] uppercase tracking-wider mb-4 px-4">
                  Connected Devices
                </h3>
                <div className="space-y-2">
                  {devices.map((d) => (
                    <div key={d.id}>
                      <div
                        onClick={() => setExpandedDevice(expandedDevice === d.id ? null : d.id)}
                        className={`flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer ${
                          d.id === device?.id ? 'bg-[#1a1a24]' : 'hover:bg-[#1a1a24]/50'
                        } transition-colors`}
                      >
                        {d.device_name.toLowerCase().includes('phone') || d.device_name.toLowerCase().includes('mobile') ? (
                          <Smartphone className="w-4 h-4 text-[#8888a0]" />
                        ) : (
                          <Laptop className="w-4 h-4 text-[#8888a0]" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{d.device_name}</p>
                          <p className="text-xs text-[#5a5a70]">
                            {d.id === device?.id ? 'This device' : 'Remote'}
                          </p>
                        </div>
                        <Circle
                          className={`w-2 h-2 ${
                            d.is_online ? 'text-[#39ff14] fill-[#39ff14]' : 'text-[#5a5a70] fill-[#5a5a70]'
                          }`}
                        />
                        <ChevronRight className={`w-4 h-4 text-[#5a5a70] transition-transform ${expandedDevice === d.id ? 'rotate-90' : ''}`} />
                      </div>
                      <AnimatePresence>
                        {expandedDevice === d.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="ml-4 mr-2 mt-1 p-3 bg-[#0f0f16] rounded-lg border border-[#2a2a3a] space-y-2">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-lg">{getOsIcon(d.os_name)}</span>
                                <div>
                                  <p className="text-[#8888a0]">System</p>
                                  <p className="text-white">{d.os_name || 'Unknown'} {d.os_version || ''}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-lg">{getBrowserIcon(d.browser_name)}</span>
                                <div>
                                  <p className="text-[#8888a0]">Browser</p>
                                  <p className="text-white">{d.browser_name || 'Unknown'} {d.browser_version || ''}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <MapPin className="w-4 h-4 text-[#ff6b35]" />
                                <div>
                                  <p className="text-[#8888a0]">Location</p>
                                  <p className="text-white">
                                    {d.location_city && d.location_city !== 'Unknown' 
                                      ? `${d.location_city}, ${d.location_country}` 
                                      : d.location_country || 'Unknown'}
                                  </p>
                                </div>
                              </div>
                              {d.ip_address && d.ip_address !== 'Unknown' && (
                                <div className="flex items-center gap-2 text-xs">
                                  <Globe className="w-4 h-4 text-[#00f0ff]" />
                                  <div>
                                    <p className="text-[#8888a0]">IP Address</p>
                                    <p className="text-white font-mono text-[10px]">{d.ip_address}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <aside className="hidden lg:block fixed left-0 top-16 bottom-0 w-64 glass-panel border-r border-[#2a2a3a] p-4 overflow-y-auto custom-scrollbar">
        <div className="space-y-2">
          <button
            onClick={() => setActiveSection('overview')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
              activeSection === 'overview'
                ? 'bg-gradient-to-r from-[#00f0ff]/20 to-transparent border-l-2 border-[#00f0ff] text-white'
                : 'text-[#8888a0] hover:bg-[#1a1a24] hover:text-white'
            }`}
          >
            <Activity className="w-5 h-5" />
            <span className="font-medium">Overview</span>
          </button>

          <button
            onClick={() => setActiveSection('files')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
              activeSection === 'files'
                ? 'bg-gradient-to-r from-[#39ff14]/20 to-transparent border-l-2 border-[#39ff14] text-white'
                : 'text-[#8888a0] hover:bg-[#1a1a24] hover:text-white'
            }`}
          >
            <Folder className="w-5 h-5" />
            <span className="font-medium">File Access</span>
          </button>

          <button
            onClick={() => setActiveSection('clipboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
              activeSection === 'clipboard'
                ? 'bg-gradient-to-r from-[#ff6b35]/20 to-transparent border-l-2 border-[#ff6b35] text-white'
                : 'text-[#8888a0] hover:bg-[#1a1a24] hover:text-white'
            }`}
          >
            <Clipboard className="w-5 h-5" />
            <span className="font-medium">Clipboard Sync</span>
          </button>

<button
              onClick={() => setActiveSection('camera')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                activeSection === 'camera'
                  ? 'bg-gradient-to-r from-[#b829dd]/20 to-transparent border-l-2 border-[#b829dd] text-white'
                  : 'text-[#8888a0] hover:bg-[#1a1a24] hover:text-white'
              }`}
            >
              <Camera className="w-5 h-5" />
              <span className="font-medium">Remote Camera</span>
            </button>

            <button
              onClick={() => setActiveSection('games')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                activeSection === 'games'
                  ? 'bg-gradient-to-r from-[#ffd700]/20 to-transparent border-l-2 border-[#ffd700] text-white'
                  : 'text-[#8888a0] hover:bg-[#1a1a24] hover:text-white'
              }`}
            >
              <Gamepad2 className="w-5 h-5" />
              <span className="font-medium">Games</span>
            </button>
          </div>

        <div className="mt-8 pt-8 border-t border-[#2a2a3a]">
          <h3 className="text-xs font-semibold text-[#5a5a70] uppercase tracking-wider mb-4 px-4">
            Connected Devices
          </h3>
          <div className="space-y-2">
            {devices.map((d) => (
              <div key={d.id}>
                <div
                  onClick={() => setExpandedDevice(expandedDevice === d.id ? null : d.id)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer ${
                    d.id === device?.id ? 'bg-[#1a1a24]' : 'hover:bg-[#1a1a24]/50'
                  } transition-colors`}
                >
                  {d.device_name.toLowerCase().includes('phone') || d.device_name.toLowerCase().includes('mobile') ? (
                    <Smartphone className="w-4 h-4 text-[#8888a0]" />
                  ) : (
                    <Laptop className="w-4 h-4 text-[#8888a0]" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{d.device_name}</p>
                    <p className="text-xs text-[#5a5a70]">
                      {d.id === device?.id ? 'This device' : 'Remote'}
                    </p>
                  </div>
                  <Circle
                    className={`w-2 h-2 ${
                      d.is_online ? 'text-[#39ff14] fill-[#39ff14]' : 'text-[#5a5a70] fill-[#5a5a70]'
                    }`}
                  />
                  <ChevronRight className={`w-4 h-4 text-[#5a5a70] transition-transform ${expandedDevice === d.id ? 'rotate-90' : ''}`} />
                </div>
                <AnimatePresence>
                  {expandedDevice === d.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="ml-4 mr-2 mt-1 p-3 bg-[#0f0f16] rounded-lg border border-[#2a2a3a] space-y-2">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-lg">{getOsIcon(d.os_name)}</span>
                          <div>
                            <p className="text-[#8888a0]">System</p>
                            <p className="text-white">{d.os_name || 'Unknown'} {d.os_version || ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-lg">{getBrowserIcon(d.browser_name)}</span>
                          <div>
                            <p className="text-[#8888a0]">Browser</p>
                            <p className="text-white">{d.browser_name || 'Unknown'} {d.browser_version || ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <MapPin className="w-4 h-4 text-[#ff6b35]" />
                          <div>
                            <p className="text-[#8888a0]">Location</p>
                            <p className="text-white">
                              {d.location_city && d.location_city !== 'Unknown' 
                                ? `${d.location_city}, ${d.location_country}` 
                                : d.location_country || 'Unknown'}
                            </p>
                          </div>
                        </div>
                        {d.ip_address && d.ip_address !== 'Unknown' && (
                          <div className="flex items-center gap-2 text-xs">
                            <Globe className="w-4 h-4 text-[#00f0ff]" />
                            <div>
                              <p className="text-[#8888a0]">IP Address</p>
                              <p className="text-white font-mono text-[10px]">{d.ip_address}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="lg:ml-64 pt-16 min-h-screen">
        <AnimatePresence mode="wait">
          {activeSection === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-4 md:p-8"
            >
              <h1 className="text-xl md:text-2xl font-bold text-white mb-2">Welcome back, {user.username}</h1>
              <p className="text-[#8888a0] mb-8">Manage your remote access and device sync</p>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
                <div className="glass-panel rounded-2xl p-4 md:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-[#00f0ff]/20 flex items-center justify-center">
                      <Users className="w-5 h-5 md:w-6 md:h-6 text-[#00f0ff]" />
                    </div>
                    <span className="text-[10px] md:text-xs font-medium text-[#00f0ff] bg-[#00f0ff]/10 px-2 py-1 rounded-full">
                      Active
                    </span>
                  </div>
                  <p className="text-2xl md:text-3xl font-bold text-white">{devices.length}</p>
                  <p className="text-xs md:text-sm text-[#8888a0]">Connected Devices</p>
                </div>

                <div className="glass-panel rounded-2xl p-4 md:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-[#39ff14]/20 flex items-center justify-center">
                      <HardDrive className="w-5 h-5 md:w-6 md:h-6 text-[#39ff14]" />
                    </div>
                    <span className="text-[10px] md:text-xs font-medium text-[#39ff14] bg-[#39ff14]/10 px-2 py-1 rounded-full">
                      Ready
                    </span>
                  </div>
                  <p className="text-2xl md:text-3xl font-bold text-white">0</p>
                  <p className="text-xs md:text-sm text-[#8888a0]">Shared Files</p>
                </div>

                <div className="glass-panel rounded-2xl p-4 md:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-[#ff6b35]/20 flex items-center justify-center">
                      <Clipboard className="w-5 h-5 md:w-6 md:h-6 text-[#ff6b35]" />
                    </div>
                    <span className="text-[10px] md:text-xs font-medium text-[#ff6b35] bg-[#ff6b35]/10 px-2 py-1 rounded-full">
                      Sync
                    </span>
                  </div>
                  <p className="text-2xl md:text-3xl font-bold text-white">0</p>
                  <p className="text-xs md:text-sm text-[#8888a0]">Clipboard Items</p>
                </div>

                <div className="glass-panel rounded-2xl p-4 md:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-[#b829dd]/20 flex items-center justify-center">
                      <Bell className="w-5 h-5 md:w-6 md:h-6 text-[#b829dd]" />
                    </div>
                    {pendingRequests.length > 0 && (
                      <span className="text-[10px] md:text-xs font-medium text-[#b829dd] bg-[#b829dd]/10 px-2 py-1 rounded-full">
                        {pendingRequests.length} new
                      </span>
                    )}
                  </div>
                  <p className="text-2xl md:text-3xl font-bold text-white">{pendingRequests.length}</p>
                  <p className="text-xs md:text-sm text-[#8888a0]">Pending Requests</p>
                </div>
              </div>

<div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6">
                  <div
                    onClick={() => setActiveSection('files')}
                    className="glass-panel rounded-2xl p-4 md:p-6 cursor-pointer hover:border-[#39ff14]/50 transition-all duration-300 group"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3 md:gap-4">
                        <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-[#39ff14] to-[#20cc10] flex items-center justify-center">
                          <Folder className="w-6 h-6 md:w-7 md:h-7 text-[#0a0a0f]" />
                        </div>
                        <div>
                          <h3 className="text-lg md:text-xl font-semibold text-white">File Access</h3>
                          <p className="text-xs md:text-sm text-[#8888a0]">Browse remote files</p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-[#8888a0] group-hover:text-[#39ff14] group-hover:translate-x-1 transition-all" />
                    </div>
                    <div className="flex items-center gap-2 text-xs md:text-sm text-[#5a5a70]">
                      <Lock className="w-3 h-3 md:w-4 md:h-4" />
                      <span>Encrypted file transfer</span>
                    </div>
                  </div>

                  <div
                    onClick={() => setActiveSection('clipboard')}
                    className="glass-panel rounded-2xl p-4 md:p-6 cursor-pointer hover:border-[#ff6b35]/50 transition-all duration-300 group"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3 md:gap-4">
                        <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-[#ff6b35] to-[#ff4500] flex items-center justify-center">
                          <Clipboard className="w-6 h-6 md:w-7 md:h-7 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg md:text-xl font-semibold text-white">Clipboard Sync</h3>
                          <p className="text-xs md:text-sm text-[#8888a0]">Share text & links</p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-[#8888a0] group-hover:text-[#ff6b35] group-hover:translate-x-1 transition-all" />
                    </div>
                    <div className="flex items-center gap-2 text-xs md:text-sm text-[#5a5a70]">
                      <Send className="w-3 h-3 md:w-4 md:h-4" />
                      <span>Instant sync between devices</span>
                    </div>
                  </div>

                  <div
                    onClick={() => setActiveSection('camera')}
                    className="glass-panel rounded-2xl p-4 md:p-6 cursor-pointer hover:border-[#b829dd]/50 transition-all duration-300 group"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3 md:gap-4">
                        <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-[#b829dd] to-[#9920bb] flex items-center justify-center">
                          <Camera className="w-6 h-6 md:w-7 md:h-7 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg md:text-xl font-semibold text-white">Remote Camera</h3>
                          <p className="text-xs md:text-sm text-[#8888a0]">View device camera</p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-[#8888a0] group-hover:text-[#b829dd] group-hover:translate-x-1 transition-all" />
                    </div>
                    <div className="flex items-center gap-2 text-xs md:text-sm text-[#5a5a70]">
                      <Video className="w-3 h-3 md:w-4 md:h-4" />
                      <span>Live camera streaming</span>
                    </div>
                  </div>

                  <div
                    onClick={() => setActiveSection('games')}
                    className="glass-panel rounded-2xl p-4 md:p-6 cursor-pointer hover:border-[#ffd700]/50 transition-all duration-300 group"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3 md:gap-4">
                        <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-[#ffd700] to-[#ff8c00] flex items-center justify-center">
                          <Gamepad2 className="w-6 h-6 md:w-7 md:h-7 text-[#0a0a0f]" />
                        </div>
                        <div>
                          <h3 className="text-lg md:text-xl font-semibold text-white">Games</h3>
                          <p className="text-xs md:text-sm text-[#8888a0]">Play with devices</p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-[#8888a0] group-hover:text-[#ffd700] group-hover:translate-x-1 transition-all" />
                    </div>
                    <div className="flex items-center gap-2 text-xs md:text-sm text-[#5a5a70]">
                      <Gamepad2 className="w-3 h-3 md:w-4 md:h-4" />
                      <span>Real-time multiplayer</span>
                    </div>
                  </div>
                </div>
            </motion.div>
          )}

          {activeSection === 'files' && (
            <motion.div
              key="files"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="h-[calc(100vh-4rem)]"
            >
              <FileAccess devices={devices} currentDevice={device} />
            </motion.div>
          )}

          {activeSection === 'clipboard' && (
            <motion.div
              key="clipboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="h-[calc(100vh-4rem)]"
            >
              <ClipboardSync devices={devices} currentDevice={device} />
            </motion.div>
          )}

{activeSection === 'camera' && (
              <motion.div
                key="camera"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="h-[calc(100vh-4rem)]"
              >
                <RemoteCamera devices={devices} currentDevice={device} />
              </motion.div>
            )}

            {activeSection === 'games' && (
              <motion.div
                key="games"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="h-[calc(100vh-4rem)]"
              >
                <Games devices={devices} currentDevice={device} />
              </motion.div>
            )}
          </AnimatePresence>
      </main>
    </div>
  )
}

export default function Dashboard() {
  return (
    <AuthProvider>
      <DashboardContent />
    </AuthProvider>
  )
}
